import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {profileKey,TALENT_POINT_CALENDAR_REVISION} from './talent-plan-core.mjs';
import {isTalentClientBuild} from './talent-rule-watch.mjs';
import {CLASS_BY_ID} from './class-training-store.mjs';

const folder=new URL('../data/talent-planning/',import.meta.url);
const files=readdirSync(folder).filter(name=>name.endsWith('.json')).sort();
const releaseFile='release-catalog.json';
const coverageFile='coverage-2026-11-25.json';
const researchFile='evidence-2026-11-25.json';
const release=JSON.parse(readFileSync(new URL(releaseFile,folder),'utf8'));
assert.equal(release.schemaVersion,1);
assert.equal(release.kind,'talent_release_catalog');
const digest=/^[a-f0-9]{64}$/;
const positive=value=>Number.isSafeInteger(value)&&value>0;
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value));
const legacyRank=value=>Number.isInteger(value)&&value>=0&&value<=5;
const tupleFields=['classId','clientBuild','hotfixRevision','catalogRevision','sourceRevision'];
const sameTuple=(left,right)=>tupleFields.every(field=>left[field]===right[field]);
const validTuple=item=>positive(item.classId)&&isTalentClientBuild(item.clientBuild)&&
  ['hotfixRevision','catalogRevision','sourceRevision'].every(field=>digest.test(item[field]));
const ruleKey=(classId,revision,rank)=>JSON.stringify([classId,revision,rank]);

function validateReleaseCatalog(catalog){
  const evidence=new Map();
  for(const entry of catalog.evidence){
    assert.ok(nonempty(entry.id)&&!evidence.has(entry.id),'unique release evidence ID');
    assert.ok(validTuple(entry)&&date(entry.reviewedAt)&&nonempty(entry.claim),'reviewed release evidence with exact revisions');
    const url=new URL(entry.url);
    assert.equal(url.protocol,'https:','release evidence source must use HTTPS');
    assert.ok(!url.username&&!url.password&&url.hostname.includes('.')&&!url.hostname.endsWith('.example'),
      'a public evidence source is required');
    if(entry.kind==='editorial'){
      assert.ok(nonempty(entry.planId)&&positive(entry.planVersion),'editorial evidence needs a plan version');
    }else{
      assert.ok(['official','client','measured'].includes(entry.kind)&&legacyRank(entry.legacyTalentedRank),'rules need eligible evidence and a Legacy rank');
    }
    evidence.set(entry.id,entry);
  }
  const packs=new Map();
  for(const pack of catalog.rulePacks){
    assert.ok(validTuple(pack)&&nonempty(pack.revision)&&date(pack.reviewedAt),'rule pack with exact revisions and review date');
    assert.equal(pack.status,'verified');
    assert.equal(pack.pointCalendarRevision,TALENT_POINT_CALENDAR_REVISION);
    assert.equal(pack.gateMode,'earlier_rows');
    assert.ok(['immediate','bankable'].includes(pack.pointSpendMode)&&legacyRank(pack.legacyTalentedRank),'known spend mode and Legacy rank');
    assert.ok(Array.isArray(pack.sources)&&pack.sources.length>0&&new Set(pack.sources).size===pack.sources.length,'one or more distinct release evidence IDs');
    for(const id of pack.sources){
      const item=evidence.get(id);
      assert.ok(item&&item.kind!=='editorial'&&sameTuple(item,pack)&&item.reviewedAt<=pack.reviewedAt&&
        item.legacyTalentedRank===pack.legacyTalentedRank,'rule evidence mismatch '+id);
    }
    const minimum=pack.minimumLevelByTalent;
    assert.ok(minimum&&typeof minimum==='object'&&!Array.isArray(minimum)&&Object.keys(minimum).length&&
      Object.entries(minimum).every(([id,level])=>/^\d+$/.test(id)&&positive(Number(id))&&positive(level)&&level<=60),'known talent level gates');
    const key=ruleKey(pack.classId,pack.revision,pack.legacyTalentedRank);
    assert.ok(!packs.has(key),'ambiguous release rule pack '+key);
    packs.set(key,pack);
  }
  return {evidence,packs};
}

function validatePlanEvidence(plan,{evidence,packs},file){
  assert.match(plan.catalogRevision,digest,file);
  assert.ok(nonempty(plan.ruleRevision)&&Array.isArray(plan.review?.evidenceIds)&&plan.review.evidenceIds.length&&
    nonempty(plan.review.rationale)&&date(plan.review.reviewedAt),file);
  const approvedRanks=plan.supportedLegacyRanks;
  assert.ok(Array.isArray(approvedRanks)&&approvedRanks.length&&approvedRanks.every(legacyRank)&&
    new Set(approvedRanks).size===approvedRanks.length,file+' must specify reviewed Legacy ranks');
  for(const rank of approvedRanks){
    const pack=packs.get(ruleKey(plan.classId,plan.ruleRevision,rank));
    assert.ok(pack&&pack.catalogRevision===plan.catalogRevision&&pack.reviewedAt<=plan.review.reviewedAt,
      file+' is missing an applicable rule pack for Legacy rank '+rank);
    assert.ok(plan.points.every(step=>Object.hasOwn(pack.minimumLevelByTalent,step.talentId)),file+' has an undocumented level gate');
    for(const id of plan.review.evidenceIds){
      const item=evidence.get(id);
      assert.ok(item?.kind==='editorial'&&sameTuple(item,pack)&&item.planId===plan.id&&
        item.planVersion===plan.version&&item.reviewedAt<=plan.review.reviewedAt,file+' has invalid editorial evidence '+id);
    }
  }
}

const {evidence,packs}=validateReleaseCatalog(release);
const coverage=JSON.parse(readFileSync(new URL(coverageFile,folder),'utf8'));
assert.equal(coverage.schemaVersion,1);
assert.equal(coverage.kind,'talent_coverage_matrix');
assert.deepEqual(Object.keys(coverage.classes).sort(),Object.keys(CLASS_BY_ID).sort());
assert.deepEqual(coverage.goals,['leveling','dungeons','pvp']);
const treesById=new Map();
for(const [classId,trees] of Object.entries(coverage.classes)){
  assert.equal(trees.length,3,'three specializations per class');
  for(const tree of trees){
    assert.ok(positive(tree.treeId)&&!treesById.has(tree.treeId),'unique tree identity');
    assert.ok(tree.roles.length&&tree.roles.every(role=>['tank','heal','damage'].includes(role)),'known role axes');
    treesById.set(tree.treeId,{...tree,classId:Number(classId)});
  }
}
const research=JSON.parse(readFileSync(new URL(researchFile,folder),'utf8'));
const sources=new Map(research.sources.map(source=>[source.id,source]));
assert.equal(sources.size,research.sources.length,'unique research source IDs');
const candidates=new Map();
for(const candidate of research.candidateTracks){
  assert.equal(candidate.status,'research_only');
  assert.ok(!candidates.has(candidate.id),'duplicate research candidate');
  const groups=new Set(candidate.sourceIds.map(id=>sources.get(id)?.independenceGroup));
  assert.ok(!groups.has(undefined)&&groups.size>=2,'candidate requires independent research sources');
  candidates.set(candidate.id,candidate);
}
const identities=new Set();
const activeProfiles=new Set();
const activePaths=new Set();
let planCount=0;
for(const file of files){
  if([releaseFile,coverageFile,researchFile].includes(file))continue;
  const entry=JSON.parse(readFileSync(new URL(file,folder),'utf8'));
  const plan=entry;
  planCount++;
  if(plan.status==='research_only'){
    const researchTrack=candidates.get(plan.id);
    if(researchTrack){
      assert.equal(researchTrack.classId,plan.classId);
      assert.equal(researchTrack.treeId,plan.treeId);
    }
    candidates.set(plan.id,plan);
  }
  const identity=JSON.stringify([plan.id,plan.version]);
  assert.ok(typeof plan.id==='string'&&plan.id.trim(),file);
  assert.ok(Number.isSafeInteger(plan.version)&&plan.version>0,file);
  assert.ok(!identities.has(identity),file+' duplicates a plan identity');
  identities.add(identity);
  assert.equal(plan.schemaVersion,1,file);
  assert.ok(['research_only','approved','retired'].includes(plan.status),file);
  assert.equal(plan.requiresRespec,false,file);
  assert.equal(plan.points.length,51,file);
  const ranks=new Map();
  for(const {talentId,rank} of plan.points){
    assert.ok(Number.isSafeInteger(talentId)&&talentId>0,file);
    assert.equal(rank,(ranks.get(talentId)??0)+1,file+' skips or repeats a rank');
    ranks.set(talentId,rank);
  }
  let blockStart=0;
  for(const block of plan.rationaleBlocks){
    assert.ok(positive(block.count)&&nonempty(block.reason),file+' invalid rationale block');
    const steps=plan.points.slice(blockStart,blockStart+block.count);
    assert.ok(steps.length===block.count&&steps.every(step=>step.talentId===block.talentId),file+' rationale/point mismatch');
    blockStart+=block.count;
  }
  assert.equal(blockStart,plan.points.length,file+' missing rationale');
  if(plan.research?.sourceIds){
    assert.ok(plan.research.sourceIds.length&&plan.research.sourceIds.every(id=>sources.has(id)),file+' unknown research evidence');
  }
  assert.ok(plan.profiles.length>0,file);
  const ownProfiles=new Set();
  for(const profile of plan.profiles){
    const key=profileKey(profile);
    assert.ok(key,file);
    assert.equal(profile.classId,plan.classId,file);
    assert.equal(profile.treeId,plan.treeId,file);
    const coverageTree=treesById.get(profile.treeId);
    assert.equal(coverageTree?.classId,profile.classId,file+' class/tree mismatch');
    assert.ok(coverageTree.roles.includes(profile.role)&&coverage.goals.includes(profile.goal),file+' missing coverage');
    assert.ok(!ownProfiles.has(key),file+' repeats a profile');
    ownProfiles.add(key);
    if(plan.status==='approved'){
      assert.ok(!activeProfiles.has(key),file+' overlaps another approved plan');
      activeProfiles.add(key);
    }
  }
  if(plan.status==='approved'){
    const path=JSON.stringify([plan.classId,plan.points.map(({talentId,rank})=>[talentId,rank])]);
    assert.ok(!activePaths.has(path),file+' duplicates an approved allocation sequence');
    activePaths.add(path);
    validatePlanEvidence(plan,{evidence,packs},file);
  }
}
assert.ok(planCount>0,'The talent plan library must include its pilot');
const linkedResearch=new Set();
for(const tree of treesById.values()){
  for(const id of tree.levelingResearch??[]){
    const candidate=candidates.get(id);
    assert.ok(candidate?.classId===tree.classId&&candidate?.treeId===tree.treeId,'unmatched research track '+id);
    linkedResearch.add(id);
  }
}
assert.deepEqual(linkedResearch,new Set(candidates.keys()),'all research tracks must be assigned to the matrix');
console.log('Talent plan library: unique identities, profiles and approved paths: OK');

// Synthetic CI fixtures stay outside the release catalog.
const tuple={classId:8,clientBuild:'1.60.1.71037',hotfixRevision:'a'.repeat(64),
  catalogRevision:'b'.repeat(64),sourceRevision:'c'.repeat(64)};
const ruleEvidence={...tuple,id:'fixture',kind:'client',legacyTalentedRank:0,claim:'rule fixture',
  reviewedAt:'2026-11-25',url:'https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system'};
const pack={...tuple,revision:'fixture',sources:['fixture'],reviewedAt:'2026-11-25',status:'verified',
  legacyTalentedRank:0,pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,gateMode:'earlier_rows',
  pointSpendMode:'bankable',minimumLevelByTalent:{1:10}};
assert.equal(validateReleaseCatalog({evidence:[ruleEvidence],rulePacks:[pack]}).packs.size,1);
assert.throws(()=>validateReleaseCatalog({evidence:[],rulePacks:[pack]}),/rule evidence mismatch/);
assert.throws(()=>validateReleaseCatalog({evidence:[{...ruleEvidence,legacyTalentedRank:1}],rulePacks:[pack]}),/rule evidence mismatch/);
assert.throws(()=>validateReleaseCatalog({evidence:[{...ruleEvidence,sourceRevision:'d'.repeat(64)}],rulePacks:[pack]}),/rule evidence mismatch/);
const editorial={...tuple,id:'fixture-editorial',kind:'editorial',planId:'fixture-plan',planVersion:1,
  reviewedAt:ruleEvidence.reviewedAt,claim:'editorial fixture',url:ruleEvidence.url};
const publishedFixture={id:editorial.planId,version:1,classId:8,points:[{talentId:1,rank:1}],
  catalogRevision:tuple.catalogRevision,ruleRevision:pack.revision,supportedLegacyRanks:[0],
  review:{reviewedAt:editorial.reviewedAt,rationale:'review fixture',evidenceIds:[editorial.id]}};
const fixtureCatalog=validateReleaseCatalog({evidence:[ruleEvidence,editorial],rulePacks:[pack]});
validatePlanEvidence(publishedFixture,fixtureCatalog,'fixture');
assert.throws(()=>validatePlanEvidence({...publishedFixture,supportedLegacyRanks:[0,1]},fixtureCatalog,'fixture'),/missing an applicable rule pack/);
assert.throws(()=>validatePlanEvidence({...publishedFixture,version:2},fixtureCatalog,'fixture'),/invalid editorial evidence/);
