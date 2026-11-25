import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {profileKey,resolveApprovedTalentPlan,validateTalentPath,TALENT_POINT_CALENDAR_REVISION} from './talent-plan-core.mjs';
import {TALENT_RULE_BINDING_FIELDS,talentPlanEvidenceDigest,talentRevisionDigest,
  talentRuleEvidenceDigest,talentSourcePairDigest,talentStructureDigest} from './talent-catalog-proof.mjs';
import {isTalentClientBuild} from './talent-rule-watch.mjs';
import {deriveTalentCoverage} from './talent-plan-coverage.mjs';
import {CLASS_BY_ID} from './class-training-store.mjs';

const folder=new URL('../data/talent-planning/',import.meta.url);
const files=readdirSync(folder).filter(name=>name.endsWith('.json')).sort();
const releaseFile='release-catalog.json';
const coverageFile='coverage-2026-11-25.json';
const researchFile='evidence-2026-11-25.json';
const proofsFile='catalog-proofs-2026-11-25.json';
const comparisonFile='mage-catalog-comparison-2026-11-25.json';
const release=JSON.parse(readFileSync(new URL(releaseFile,folder),'utf8'));
assert.equal(release.schemaVersion,1);
assert.equal(release.kind,'talent_release_catalog');
const digest=/^[a-f0-9]{64}$/;
const positive=value=>Number.isSafeInteger(value)&&value>0;
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value));
const legacyRank=value=>Number.isInteger(value)&&value>=0&&value<=5;
const sameTuple=(left,right)=>TALENT_RULE_BINDING_FIELDS.every(field=>left[field]===right[field]);
const validTuple=item=>positive(item.classId)&&isTalentClientBuild(item.clientBuild)&&
  ['hotfixRevision','catalogRevision','sourceRevision'].every(field=>digest.test(item[field]));
const ruleKey=(classId,revision,rank)=>JSON.stringify([classId,revision,rank]);
const proofKey=(classId,revision,source)=>JSON.stringify([classId,revision,source]);

function indexCatalogProofs(records){
  const snapshots=new Map();
  for(const {catalogRevision,sourceRevision,proof} of records){
    assert.match(sourceRevision,digest,'source pair digest');
    assert.equal(talentRevisionDigest(proof),catalogRevision,'changed master revision');
    assert.ok(positive(proof.classId)&&Array.isArray(proof.trees)&&proof.trees.length>0,'catalog proof identity');
    const key=proofKey(proof.classId,catalogRevision,sourceRevision);
    assert.ok(!snapshots.has(key),'duplicate catalog proof');
    const treeIds=new Set(),talentIds=new Set();
    for(const tree of proof.trees){
      assert.ok(positive(tree.id)&&!treeIds.has(tree.id),'catalog proof tree identity');
      treeIds.add(tree.id);
      assert.ok(Array.isArray(tree.talents)&&tree.talents.length>0,'catalog proof needs talents');
      for(const node of tree.talents){
        assert.ok(positive(node.id)&&!talentIds.has(node.id),'catalog proof talent identity');
        talentIds.add(node.id);
        assert.ok(Number.isInteger(node.row)&&node.row>=0&&node.row<=10&&
          node.requiredPoints===node.row*5&&positive(node.requiredLevel)&&node.requiredLevel<=60,'catalog proof talent gate');
        assert.ok(positive(node.spellId)&&positive(node.maxRank)&&node.maxRank<=10&&
          Array.isArray(node.rankSpellIds)&&node.rankSpellIds.length===node.maxRank&&
          node.rankSpellIds.every(positive),'catalog proof talent ranks');
        assert.match(node.effectRevision,digest,'catalog effect digest');
        assert.ok(Array.isArray(node.prerequisites),'catalog proof prerequisites');
      }
    }
    snapshots.set(key,proof);
  }
  return snapshots;
}
function auditPath(plan,pack,proof){
  return validateTalentPath(plan,{
    classes:{[proof.classId]:proof},
    classMechanicsRevisions:{[proof.classId]:talentRevisionDigest(proof)},
    stale:false
  },pack);
}

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
      assert.ok(nonempty(entry.planId)&&positive(entry.planVersion)&&digest.test(entry.allocationDigest),'editorial evidence needs an exact plan version and path');
    }else{
      assert.ok(['official','client','measured'].includes(entry.kind)&&legacyRank(entry.legacyTalentedRank)&&digest.test(entry.ruleDigest),
        'rules need eligible evidence, a Legacy rank and an exact mechanics digest');
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
        item.legacyTalentedRank===pack.legacyTalentedRank&&item.ruleDigest===talentRuleEvidenceDigest(pack),'rule evidence mismatch '+id);
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

function validatePlanEvidence(plan,{evidence,packs},snapshots,file){
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
        item.planVersion===plan.version&&item.allocationDigest===talentPlanEvidenceDigest(plan)&&
        item.reviewedAt<=plan.review.reviewedAt,file+' has invalid editorial evidence '+id);
    }
    const proof=snapshots.get(proofKey(pack.classId,pack.catalogRevision,pack.sourceRevision));
    assert.ok(proof,file+' has no exact catalog proof for Legacy rank '+rank);
    for(const id of pack.sources){
      const entry=evidence.get(id);
      if(entry.comparisonDigest!==undefined)assert.equal(entry.comparisonDigest,talentStructureDigest(proof),
        file+' independent comparison does not match the catalog proof');
    }
    const result=auditPath(plan,pack,proof);
    assert.ok(result.ok,file+' Legacy rank '+rank+': '+JSON.stringify(result));
    // Fixed times exercise the real release gate without live state or network I/O.
    const checkedAt='2026-01-01T00:00:00.000Z';
    const fixedMaster={classes:{[plan.classId]:proof},classMechanicsRevisions:{[plan.classId]:pack.catalogRevision},
      stale:false,checkedAt,sourceRevision:pack.sourceRevision,sourceFreshAt:{raw:checkedAt,localized:checkedAt}};
    const ruleObservation={status:'observed',checkedAt,revisionSince:checkedAt,
      clientBuild:pack.clientBuild,hotfixRevision:pack.hotfixRevision};
    for(const profile of plan.profiles){
      const resolved=resolveApprovedTalentPlan(profile,[{...plan,status:'approved'}],fixedMaster,[pack],
        {ruleObservation,legacyTalentedRank:rank,now:Date.parse(checkedAt)});
      assert.ok(resolved.ok,file+' release gate rank '+rank+': '+JSON.stringify(resolved));
      assert.deepEqual(resolved.history,result.history,file+' release and audit schedules must agree');
    }
  }
}

const {evidence,packs}=validateReleaseCatalog(release);
const proofFile=JSON.parse(readFileSync(new URL(proofsFile,folder),'utf8'));
assert.equal(proofFile.schemaVersion,1);
assert.equal(proofFile.kind,'talent_catalog_proofs');
const sourcePairs=new Set(proofFile.sourcePairs.map(pair=>{
  assert.match(pair.rawSha256,digest);
  assert.match(pair.localizedSha256,digest);
  assert.equal(talentSourcePairDigest(pair.rawSha256,pair.localizedSha256),pair.revision,'invalid source pair digest');
  return pair.revision;
}));
assert.equal(sourcePairs.size,proofFile.sourcePairs.length,'duplicate source pairs');
assert.ok(proofFile.catalogs.every(record=>sourcePairs.has(record.sourceRevision)),'proof references an unknown source pair');
const snapshots=indexCatalogProofs(proofFile.catalogs);
const comparison=JSON.parse(readFileSync(new URL(comparisonFile,folder),'utf8'));
assert.equal(comparison.schemaVersion,1);
assert.equal(comparison.kind,'mage_talent_source_comparison');
const mageEvidence=evidence.get('mage-rank0-catalog-71091');
const mageProof=snapshots.get(proofKey(8,mageEvidence.catalogRevision,mageEvidence.sourceRevision));
assert.equal(comparison.date,mageEvidence.reviewedAt);
assert.equal(comparison.build,mageEvidence.clientBuild);
assert.equal(comparison.independent.url,mageEvidence.url);
assert.equal(comparison.independent.captureSha256,mageEvidence.sourceCaptureSha256);
assert.equal(comparison.primary.catalogRevision,mageEvidence.catalogRevision);
assert.equal(comparison.primary.sourceRevision,mageEvidence.sourceRevision);
assert.equal(talentSourcePairDigest(comparison.primary.rawSha256,comparison.primary.localizedSha256),mageEvidence.sourceRevision);
assert.match(comparison.primary.normalizedSha256,digest);
assert.equal(comparison.independent.normalizedSha256,comparison.primary.normalizedSha256);
assert.equal(comparison.comparisonDigest,talentStructureDigest(mageProof));
assert.equal(comparison.comparisonDigest,mageEvidence.comparisonDigest);
assert.equal(comparison.talentCount,mageProof.trees.flatMap(tree=>tree.talents).length);
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
for(const tree of treesById.values()){
  if(tree.roleEvidence)assert.ok(tree.roleEvidence.length&&tree.roleEvidence.every(id=>sources.has(id)),
    'role evidence IDs must match the sources register');
}
const candidates=new Map();
for(const candidate of research.candidateTracks){
  assert.equal(candidate.status,'research_only');
  assert.ok(!candidates.has(candidate.id),'duplicate research candidate');
  const groups=new Set(candidate.sourceIds.map(id=>sources.get(id)?.independenceGroup));
  assert.ok(!groups.has(undefined)&&groups.size>=2,'candidate requires independent research sources');
  candidates.set(candidate.id,candidate);
}
function auditResearch(plan){
  const record=plan.research?.structuralValidation;
  if(!record)return [];
  assert.equal(record.legacyTalentedRank,0,'research currently checks the standard calendar');
  const proof=snapshots.get(proofKey(plan.classId,record.catalogRevision,record.sourceRevision));
  assert.ok(proof,plan.id+' missing research catalog capture');
  const exportLevels=Object.fromEntries(proof.trees.flatMap(tree=>tree.talents.map(node=>[node.id,node.requiredLevel])));
  const pack={status:'verified',classId:plan.classId,catalogRevision:record.catalogRevision,revision:'structural-audit',
    sources:['catalog capture'],reviewedAt:proofFile.capturedOn,pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,
    legacyTalentedRank:0,pointSpendMode:'immediate',gateMode:'earlier_rows',minimumLevelByTalent:exportLevels};
  const result=auditPath({...plan,catalogRevision:pack.catalogRevision,ruleRevision:pack.revision},pack,proof);
  assert.ok(result.ok,plan.id+' research path: '+JSON.stringify(result));
  const distribution=Object.fromEntries(proof.trees.map(tree=>[tree.id,result.history.filter(step=>step.treeId===tree.id).length]));
  assert.deepEqual(distribution,plan.expectedDistribution,plan.id+' research path distribution');
  return [0];
}

const identities=new Set();
const plans=[],validatedRanks=new Map();
const activeProfiles=new Set();
const activePaths=new Set();
let planCount=0;
for(const file of files){
  if([releaseFile,coverageFile,researchFile,proofsFile,comparisonFile].includes(file))continue;
  const entry=JSON.parse(readFileSync(new URL(file,folder),'utf8'));
  const plan=entry;
  planCount++;
  plans.push(plan);
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
    if(plan.status==='approved'&&plan.active!==false){
      assert.ok(!activeProfiles.has(key),file+' overlaps another approved plan');
      activeProfiles.add(key);
    }
  }
  if(plan.status==='approved'){
    assert.ok(typeof plan.treeName==='string'&&plan.treeName.trim(),file+' German tree name required');
    const path=JSON.stringify([plan.classId,plan.points.map(({talentId,rank})=>[talentId,rank])]);
    if(plan.active!==false){
      assert.ok(!activePaths.has(path),file+' duplicates an active approved allocation sequence');
      activePaths.add(path);
    }
    validatePlanEvidence(plan,{evidence,packs},snapshots,file);
    validatedRanks.set(identity,plan.supportedLegacyRanks);
  }else if(plan.status==='research_only'){
    validatedRanks.set(identity,auditResearch(plan));
  }
}
assert.ok(planCount>0,'The talent plan library must include its pilot');
const rows=deriveTalentCoverage(coverage,research.candidateTracks,plans,validatedRanks);
assert.equal(rows.length,[...treesById.values()].reduce((total,tree)=>total+tree.roles.length*coverage.goals.length,0));
assert.ok(rows.some(row=>row.status==='unresearched'),'unresearched cells must appear');
assert.ok(rows.some(row=>row.status==='structurally_validated'||row.status==='approved'),'verified paths must appear');
assert.ok(rows.some(row=>row.status==='blocked'&&row.profiles.some(profile=>
  profile.candidates.some(candidate=>candidate.blockers?.length))),'blocked profiles need a reason');
if(process.argv.includes('--coverage'))console.log(JSON.stringify(rows,null,2));
else console.log('Talent plan library: unique identities, profile coverage and approved paths: OK');

// Synthetic release exercises never enter the repository release catalog.
const fixtureTalents=Array.from({length:11},(_,row)=>({
  id:row+1,row,maxRank:row===10?1:5,requiredLevel:10,requiredPoints:row*5,spellId:row+50,
  rankSpellIds:Array(row===10?1:5).fill(row+50),effectRevision:'f'.repeat(64),
  prerequisites:row===1?[{id:1,rank:5,conditionKnown:true}]:[]
}));
const fixtureProof={classId:8,trees:[{id:11582,talents:fixtureTalents}]};
const tuple={classId:8,clientBuild:'1.60.1.71037',hotfixRevision:'a'.repeat(64),
  catalogRevision:talentRevisionDigest(fixtureProof),sourceRevision:'c'.repeat(64)};
const pack={...tuple,revision:'fixture',sources:['fixture'],reviewedAt:'2026-11-25',status:'verified',
  legacyTalentedRank:0,pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,gateMode:'earlier_rows',
  pointSpendMode:'bankable',minimumLevelByTalent:Object.fromEntries(fixtureTalents.map(t=>[t.id,10]))};
const ruleEvidence={...tuple,id:'fixture',kind:'client',legacyTalentedRank:0,claim:'rule fixture',
  ruleDigest:talentRuleEvidenceDigest(pack),reviewedAt:'2026-11-25',
  url:'https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system'};
assert.equal(validateReleaseCatalog({evidence:[ruleEvidence],rulePacks:[pack]}).packs.size,1);
assert.throws(()=>validateReleaseCatalog({evidence:[],rulePacks:[pack]}),/rule evidence mismatch/);
assert.throws(()=>validateReleaseCatalog({evidence:[{...ruleEvidence,legacyTalentedRank:1}],rulePacks:[pack]}),/rule evidence mismatch/);
assert.throws(()=>validateReleaseCatalog({evidence:[ruleEvidence],rulePacks:[{...pack,pointSpendMode:'immediate'}]}),/rule evidence mismatch/);
const publishedFixture={id:'fixture-plan',version:1,classId:8,treeId:11582,requiresRespec:false,
  profiles:[{classId:8,treeId:11582,goal:'leveling',role:'damage',playStyle:'mixed',priority:'balanced'}],
  points:fixtureTalents.flatMap(t=>Array.from({length:t.maxRank},(_,i)=>({talentId:t.id,rank:i+1}))),
  catalogRevision:tuple.catalogRevision,ruleRevision:pack.revision,supportedLegacyRanks:[0],
  review:{reviewedAt:ruleEvidence.reviewedAt,rationale:'review fixture',evidenceIds:['fixture-editorial']}};
const editorial={...tuple,id:'fixture-editorial',kind:'editorial',planId:publishedFixture.id,planVersion:1,
  allocationDigest:talentPlanEvidenceDigest(publishedFixture),reviewedAt:ruleEvidence.reviewedAt,
  claim:'editorial fixture',url:ruleEvidence.url};
const fixtureCatalog=validateReleaseCatalog({evidence:[ruleEvidence,editorial],rulePacks:[pack]});
const fixtureSnapshots=indexCatalogProofs([{...tuple,proof:fixtureProof}]);
validatePlanEvidence(publishedFixture,fixtureCatalog,fixtureSnapshots,'fixture');
assert.throws(()=>validatePlanEvidence({...publishedFixture,supportedLegacyRanks:[0,1]},fixtureCatalog,fixtureSnapshots,'fixture'),/missing an applicable rule pack/);
assert.throws(()=>validatePlanEvidence({...publishedFixture,version:2},fixtureCatalog,fixtureSnapshots,'fixture'),/invalid editorial evidence/);
assert.throws(()=>validatePlanEvidence(publishedFixture,fixtureCatalog,new Map(),'fixture'),/no exact catalog proof/);
assert.throws(()=>indexCatalogProofs([{...tuple,catalogRevision:'b'.repeat(64),proof:fixtureProof}]),/changed master revision/);
for(const [change,error] of [
  [point=>{point.row=2;point.requiredPoints=10},'tree_gate'],
  [point=>{point.prerequisites=[{id:3,rank:1,conditionKnown:true}]},'prerequisite'],
  [point=>{point.maxRank=4;point.rankSpellIds.pop()},'invalid_rank']
]){
  const proof=structuredClone(fixtureProof);
  change(proof.trees[0].talents[1]);
  const catalogRevision=talentRevisionDigest(proof);
  const changedPack={...pack,catalogRevision};
  const changedPlan={...publishedFixture,catalogRevision};
  const changedEvidence={...ruleEvidence,catalogRevision,ruleDigest:talentRuleEvidenceDigest(changedPack)};
  const changedEditorial={...editorial,catalogRevision};
  const catalog=validateReleaseCatalog({evidence:[changedEvidence,changedEditorial],rulePacks:[changedPack]});
  const captured=indexCatalogProofs([{...tuple,catalogRevision,proof}]);
  assert.throws(()=>validatePlanEvidence(changedPlan,catalog,captured,'fixture'),new RegExp('"code":"'+error+'"'));
}
const fixtureRows=deriveTalentCoverage(coverage,[],[{...publishedFixture,status:'approved'}],
  new Map([[JSON.stringify([publishedFixture.id,publishedFixture.version]),[0]]]));
const approvedCoverage=fixtureRows.find(row=>row.status==='approved').profiles[0].candidates[0];
assert.deepEqual(approvedCoverage.approvedRanks,[0]);
assert.deepEqual(approvedCoverage.blockedRanks,[1,2,3,4,5]);
if(!process.argv.includes('--coverage'))console.log('Talent release CI: offline proof, exact claims, ranks, prerequisites and row gates: OK');
