import {talentPathScope} from './talent-path-scope.mjs';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {profileKey,resolveApprovedTalentPlan,validateTalentPath,TALENT_POINT_CALENDAR_REVISION,compatibleTalentRevalidation} from './talent-plan-core.mjs';
import {TALENT_RULE_BINDING_FIELDS,talentPlanEvidenceDigest,talentRevisionDigest,
  talentRuleEvidenceDigest,talentSourcePairDigest,talentStructureDigest} from './talent-catalog-proof.mjs';
import {isTalentClientBuild} from './talent-rule-watch.mjs';
import {deriveTalentCoverage,deriveTalentWorkQueue} from './talent-plan-coverage.mjs';
import {specializationOptionKey,specializationOptionSet} from '../talent-planner.js';
import {CLASS_BY_ID} from './class-training-store.mjs';
import {compareLegacyHypotheses} from './talent-legacy-research.mjs';

const folder=new URL('../data/talent-planning/',import.meta.url);
const files=readdirSync(folder).filter(name=>name.endsWith('.json')).sort();
const releaseFile='release-catalog.json';
const coverageFile='coverage-2026-11-25.json';
const researchFile='evidence-2026-11-25.json';
const proofsFile='catalog-proofs-2026-11-25.json';
const comparisonFile='mage-catalog-comparison-2026-11-25.json';
const researchProofsFile='catalog-research-2026-11-26.json';
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
    const pathLedger=JSON.parse(readFileSync(new URL('../docs/talent-planner-zephras-review-2026-11-26.json',import.meta.url),'utf8'));
    if(pack.clientBuild===pathLedger.build&&pack.sourceRevision===pathLedger.primarySourceRevision&&(pathLedger.classes.find(c=>c.classId===plan.classId)?.structureDifferences.length||pack.sources.some(id=>evidence.get(id)?.pathScope))){
      const cross=JSON.parse(readFileSync(new URL('../docs/talent-planner-cross-build-review-2026-11-26.json',import.meta.url),'utf8'));
      const effects=JSON.parse(readFileSync(new URL('../docs/talent-planner-effect-review-2026-11-26.json',import.meta.url),'utf8'));
      const clients=pack.sources.map(id=>evidence.get(id)).filter(x=>x.kind==='client'&&x.pathScope);
      assert.equal(clients.length,1,'class conflict requires exact allocation scope');
      assert.equal(clients[0].sourceCaptureSha256,pathLedger.sourceSha256);
      assert.equal(clients[0].url,pathLedger.sourceUrl);
      // A scoped qualitative decision does not release a disputed damage formula.
      let scopedEffects=effects;
      if(['rogue-assassination-leveling','rogue-assassination-dungeons','rogue-assassination-pvp'].includes(plan.id)){
        const row=effects.rows.find(x=>x.classId===4&&x.id===105709);
        const detail=clients[0].qualitativeAllocationReview;
        assert.ok(row&&detail);
        assert.deepEqual(detail,{...row.qualitativeAllocationReview,allocationDigest:talentPlanEvidenceDigest(plan)});
        assert.equal(detail.kind,'qualitative_allocation_review');
        assert.equal(detail.clientBuild,pack.clientBuild);
        assert.equal(detail.sourceRevision,pack.sourceRevision);
        assert.equal(detail.talentId,105709);
        assert.equal(detail.spellId,399956);
        assert.equal(proof.trees.flatMap(t=>t.talents).find(n=>n.id===105709)?.spellId,detail.spellId);
        assert.equal(detail.primaryHash,row.primaryHash);
        assert.equal(detail.secondaryHash,row.secondaryHash);
        assert.equal(row.classification,'numeric_scale_or_rounding');
        assert.deepEqual(detail.observedAdditionalDamageTexts,[39,39.6]);
        assert.deepEqual(detail.confirmedCore,{weaponDamagePercent:90,poisonedTargetBonusPercent:20,comboPoints:2,requiresDaggers:true});
        assert.equal(detail.numericFormulaReleased,false);
        assert.equal(detail.serverMeasured,false);
        assert.equal(row.quantitativeClaimVerified,false);
        assert.ok(detail.sources.some(s=>s.build===pack.clientBuild&&s.url===pathLedger.sourceUrl));
        assert.ok(detail.sources.some(s=>s.url==='https://wow-forever.gg/db/spells/399956-mutilate/'));
        assert.ok(plan.points.some(p=>p.talentId===105709));
        assert.throws(()=>talentPathScope(plan,proof,pathLedger,cross,effects),/unresolved source difference 105709/);
        scopedEffects={...effects,rows:effects.rows.filter(x=>x!==row)};
      }
      if(['rogue-combat-leveling','rogue-combat-pvp','rogue-assassination-leveling','rogue-assassination-pvp'].includes(plan.id)){
        const row=effects.rows.find(x=>x.classId===4&&x.id===105735);
        const detail=clients[0].clientTextResolutions?.[0];
        assert.ok(row&&detail&&clients[0].clientTextResolutions.length===1);
        assert.deepEqual(detail,row.clientTextResolution);
        assert.equal(detail.kind,'client_spell_detail_reconciliation');
        assert.equal(detail.clientBuild,pack.clientBuild);
        assert.equal(detail.sourceRevision,pack.sourceRevision);
        assert.equal(detail.talentId,105735);
        assert.equal(detail.spellId,14251);
        assert.equal(proof.trees.flatMap(t=>t.talents).find(n=>n.id===105735)?.spellId,detail.spellId);
        assert.equal(detail.primaryHash,row.primaryHash);
        assert.equal(detail.secondaryHash,row.secondaryHash);
        assert.equal(detail.field,'baseDisarmDurationSeconds');
        assert.equal(detail.value,6);
        assert.equal(detail.serverMeasured,false);
        assert.equal(row.quantitativeClaimVerified,false);
        assert.ok(detail.sources.some(s=>s.build===pack.clientBuild&&s.url==='https://wowforevertalents.com/rogue/talents/riposte/'));
        assert.ok(detail.sources.some(s=>s.url==='https://db.icy-veins.com/wow-forever/spells/14251'));
        assert.ok(plan.points.some(p=>p.talentId===105735));
        assert.throws(()=>talentPathScope(plan,proof,pathLedger,cross,scopedEffects),/unresolved source difference 105735/);
        scopedEffects={...scopedEffects,rows:scopedEffects.rows.filter(x=>x!==row)};
      }
      if(["priest-discipline-leveling","priest-discipline-dungeons","priest-discipline-pvp","priest-holy-leveling","priest-holy-dungeons","priest-holy-pvp"].includes(plan.id)){
        const target=plan.treeId===11608?105840:105851;
        const row=effects.rows.find(x=>x.classId===5&&x.id===target);
        const detail=clients[0].clientTextResolutions?.[0];
        assert.ok(row&&detail&&clients[0].clientTextResolutions.length===1);
        assert.deepEqual(detail,row.clientTextResolution);
        assert.equal(detail.kind,'client_spell_detail_reconciliation');
        assert.equal(detail.clientBuild,pack.clientBuild);
        assert.equal(detail.sourceRevision,pack.sourceRevision);
        assert.equal(detail.talentId,target);
        assert.equal(detail.spellId,target===105840?431622:401859);
        assert.equal(proof.trees.flatMap(t=>t.talents).find(n=>n.id===target)?.spellId,detail.spellId);
        assert.equal(detail.primaryHash,row.primaryHash);
        assert.equal(detail.secondaryHash,row.secondaryHash);
        assert.equal(detail.serverMeasured,false);
        assert.equal(detail.numericFormulaReleased,false);
        assert.equal(row.quantitativeClaimVerified,false);
        assert.deepEqual(detail.tooltipFields,target===105840?{"nonPeriodicCriticalHeal":true,"absorbPercentByRank":[5,10,15],"tooltipCap":1200,"durationSeconds":12}:{"rankOneBaseHeal":172,"healingPowerCoefficient":0.429,"jumpsUpTo":5,"jumpRadiusYards":20,"durationPerJumpSeconds":30,"cooldownSeconds":10,"triggerDamageOrNonPeriodicHeal":true,"oneTargetPerCaster":true});
        assert.ok(detail.sources.some(s=>s.build===pack.clientBuild&&s.url===(target===105840?'https://wowforevertalents.com/priest/talents/divine-aegis/':'https://wowforevertalents.com/priest/talents/prayer-of-mending/')));
        assert.ok(detail.sources.some(s=>s.url===(target===105840?'https://raiddex.com/de/wow-forever/zauber/goettliche-aegis':'https://www.wowhead.com/forever/spell=401859/prayer-of-mending')));
        assert.ok(plan.points.some(p=>p.talentId===target));
        assert.throws(()=>talentPathScope(plan,proof,pathLedger,cross,effects),new RegExp('unresolved source difference '+target));
        scopedEffects={...effects,rows:effects.rows.filter(x=>x!==row)};
      }
      const scope=talentPathScope(plan,proof,pathLedger,cross,scopedEffects);
      assert.deepEqual(clients[0].pathScope,scope,'scoped dependency proof mismatch');
      assert.ok(scope.excludedConflictIds.length);
      for(const id of scope.excludedConflictIds)assert.throws(()=>talentPathScope({...plan,points:[...plan.points,{talentId:id,rank:1}]},proof,pathLedger,cross,scopedEffects),/unresolved source difference/);
    }
    // Explicit, narrowly scoped client-text reconciliation; never a server measurement.
    if(plan.id==='warrior-arms-pvp'&&pack.clientBuild===pathLedger.build){
      const effects=JSON.parse(readFileSync(new URL('../docs/talent-planner-effect-review-2026-11-26.json',import.meta.url),'utf8'));
      const row=effects.rows.find(x=>x.classId===1&&x.id===105935);
      const client=pack.sources.map(id=>evidence.get(id)).find(x=>x.kind==='client'&&x.clientTextResolutions);
      assert.ok(row&&client&&client.clientTextResolutions.length===1);
      const detail=client.clientTextResolutions[0];
      assert.deepEqual(detail,row.clientTextResolution);
      assert.equal(detail.kind,'client_spell_detail_reconciliation');
      assert.equal(detail.clientBuild,pack.clientBuild);
      assert.equal(detail.sourceRevision,pack.sourceRevision);
      assert.equal(detail.talentId,105935);
      assert.equal(detail.spellId,12323);
      assert.equal(proof.trees.flatMap(t=>t.talents).find(n=>n.id===105935)?.spellId,detail.spellId);
      assert.equal(detail.primaryHash,row.primaryHash);
      assert.equal(detail.secondaryHash,row.secondaryHash);
      assert.equal(detail.field,'baseRadiusYards');
      assert.equal(detail.value,10);
      assert.deepEqual(detail.referenceEffects,{slowPercent:50,durationSeconds:6});
      assert.equal(detail.serverMeasured,false);
      assert.equal(row.quantitativeClaimVerified,false);
      assert.ok(detail.sources.some(s=>s.build===pack.clientBuild&&s.url==='https://zephras.com/forever/enUS/spell/12323/'));
      assert.ok(detail.sources.some(s=>s.url==='https://wow-forever.gg/db/spells/12323-piercing-howl/'));
      assert.ok(plan.points.some(p=>p.talentId===105935));
    }
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
const researchProofFile=JSON.parse(readFileSync(new URL(researchProofsFile,folder),'utf8'));
assert.equal(researchProofFile.kind,'talent_research_catalog_proofs');
assert.equal(researchProofFile.captureKind,'extracted_text');
assert.equal(researchProofFile.releaseEligible,false);
assert.ok(date(researchProofFile.capturedOn)&&isTalentClientBuild(researchProofFile.observedBuild));
const extracted=researchProofFile.sourcePair;
assert.ok(digest.test(extracted.rawSha256)&&digest.test(extracted.localizedSha256));
assert.equal(talentSourcePairDigest(extracted.rawSha256,extracted.localizedSha256),extracted.revision);
assert.ok(digest.test(researchProofFile.observedSourceRevision));
assert.notEqual(extracted.revision,researchProofFile.observedSourceRevision,'extracted source is not exact live raw evidence');
assert.ok(!sourcePairs.has(extracted.revision),'research capture must not enter release source pairs');
assert.ok(researchProofFile.catalogs.every(c=>c.sourceRevision===extracted.revision));
assert.deepEqual(researchProofFile.catalogs.map(c=>c.proof.classId).sort((a,b)=>a-b),Object.keys(CLASS_BY_ID).map(Number).sort((a,b)=>a-b));
assert.equal(researchProofFile.catalogs.flatMap(c=>c.proof.trees).length,27);
const researchSnapshots=indexCatalogProofs(researchProofFile.catalogs);
// Release and revalidation checks deliberately receive only snapshots,
// never the separate researchSnapshots map.
for(const key of researchSnapshots.keys())assert.ok(!snapshots.has(key),'research proof cannot be a release proof');
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
  const key=proofKey(plan.classId,record.catalogRevision,record.sourceRevision);
  const proof=snapshots.get(key)??researchSnapshots.get(key);
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
  if([releaseFile,coverageFile,researchFile,proofsFile,comparisonFile,researchProofsFile].includes(file))continue;
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
// Comparative advice must reference exact active plan versions and explicit
// editorial comparison evidence; a generic guide link is not a comparison.
const activeOptions=plans.filter(plan=>plan.status==='approved'&&plan.active!==false)
  .flatMap(plan=>plan.profiles.map(profile=>({...profile,planId:plan.id,version:plan.version})));
const adviceSets=new Set();
for(const entry of release.specializationAdvice??[]){
  assert.ok(Array.isArray(entry.options)&&entry.options.length>=2&&nonempty(entry.reason)&&date(entry.reviewedAt),
    'comparative specialization advice requires a reviewed reason and options');
  const keys=entry.options.map(specializationOptionKey);
  const set=specializationOptionSet(entry.options);
  assert.ok(!adviceSets.has(set)&&new Set(keys).size===keys.length,'duplicate comparison');
  adviceSets.add(set);
  assert.ok(entry.preferred&&keys.includes(specializationOptionKey(entry.preferred)),'recommendation must be a compared option');
  assert.equal(new Set(entry.options.map(p=>p.classId)).size,1,'comparison must stay within a class');
  assert.equal(new Set(entry.options.map(p=>p.goal)).size,1,'comparison must stay within a goal');
  assert.equal(new Set(entry.options.map(p=>p.treeId)).size,entry.options.length,'distinct specializations required');
  assert.ok(keys.every(key=>activeOptions.some(p=>specializationOptionKey(p)===key)),'comparison needs active approved plan versions');
  assert.ok(Array.isArray(entry.evidenceIds)&&entry.evidenceIds.length>=2&&new Set(entry.evidenceIds).size===entry.evidenceIds.length,
    'comparison needs independent reviewed evidence references');
  for(const id of entry.evidenceIds){
    const item=evidence.get(id);
    assert.ok(item?.kind==='editorial'&&item.planId===entry.preferred.planId&&item.planVersion===entry.preferred.version&&
      item.reviewedAt<=entry.reviewedAt&&Array.isArray(item.comparedOptions)&&specializationOptionSet(item.comparedOptions)===set,
      'comparison evidence does not cover the exact options '+id);
  }
}
// No revalidation is implicitly generated. A reviewer supplies a new exact
// capture, complete official delta review and per-plan editorial evidence.
function auditRevalidation(entry,library,catalog,snapshots){
  const plan=library.find(p=>p.id===entry.planId&&p.version===entry.planVersion&&p.status==='approved');
  assert.ok(plan,'revalidation needs an existing approved plan version');
  const baseline=catalog.packs.get(ruleKey(plan.classId,plan.ruleRevision,entry.legacyTalentedRank));
  assert.ok(baseline&&plan.supportedLegacyRanks.includes(entry.legacyTalentedRank)&&compatibleTalentRevalidation(entry,plan,baseline),
    'invalid revalidation identity, baseline, scope or allocation');
  assert.ok(validTuple(entry.to)&&date(entry.reviewedAt),'invalid target tuple/date');
  const next={...baseline,...entry.to,reviewedAt:entry.reviewedAt,sources:entry.evidenceIds};
  // Reject arbitrary rule overrides hidden in the target.
  assert.deepEqual(Object.keys(entry.to).sort(),[...TALENT_RULE_BINDING_FIELDS].sort());
  assert.deepEqual(Object.keys(entry.from).sort(),[...TALENT_RULE_BINDING_FIELDS].sort());
  const proof=snapshots.get(proofKey(next.classId,next.catalogRevision,next.sourceRevision));
  assert.ok(proof,'revalidation missing exact new catalog proof');
  const kinds=new Set();
  for(const id of entry.evidenceIds){
    const item=catalog.evidence.get(id);
    assert.ok(item&&sameTuple(item,next)&&item.reviewedAt<=entry.reviewedAt&&item.reviewedAt>=baseline.reviewedAt&&
      sameTuple(item.reviewedFrom??{},baseline),'revalidation evidence not bound to exact transition '+id);
    kinds.add(item.kind);
    if(item.kind==='editorial'){
      assert.ok(item.planId===plan.id&&item.planVersion===plan.version&&item.allocationDigest===entry.allocationDigest,
        'revalidation editorial path mismatch');
    }else{
      assert.equal(item.legacyTalentedRank,entry.legacyTalentedRank);
      assert.equal(item.ruleDigest,talentRuleEvidenceDigest(next));
    }
    if(item.kind==='client'){
      assert.equal(item.comparisonDigest,talentStructureDigest(proof),'new client comparison missing or mismatched');
      assert.match(item.sourceCaptureSha256,digest,'new independent capture hash required');
      const comparison=item.buildComparison;
      assert.ok(comparison?.status==='structure_matches'&&comparison.build===entry.to.clientBuild&&
        comparison.classId===next.classId&&comparison.catalogRevision===next.catalogRevision&&
        comparison.sourceRevision===next.sourceRevision&&comparison.captureSha256===item.sourceCaptureSha256&&
        comparison.comparisonDigest===item.comparisonDigest,'exact current independent build comparison required');
      assert.match(comparison.primaryNormalizedSha256,digest);
      assert.equal(comparison.independentNormalizedSha256,comparison.primaryNormalizedSha256,'independent structure differs');
      assert.ok(Array.isArray(comparison.unknownPrerequisites)&&comparison.unknownPrerequisites.length===0&&
        Array.isArray(comparison.cyclicPrerequisites)&&comparison.cyclicPrerequisites.length===0,'unresolved edge in revalidation evidence');
      assert.equal(comparison.talentCount,proof.trees.flatMap(t=>t.talents).length,'incomplete independent comparison');
      assert.ok(digest.test(comparison.rawSha256)&&digest.test(comparison.localizedSha256)&&
        talentSourcePairDigest(comparison.rawSha256,comparison.localizedSha256)===next.sourceRevision,'comparison source hashes mismatch');
    }
    if(item.kind==='official'){
      assert.ok(item.completeHotfixReview===true&&item.hotfixDeltaReviewed===true&&
        item.hotfixRevision===entry.to.hotfixRevision,'complete hotfix delta evidence required');
    }
  }
  assert.ok(['client','official','editorial'].every(kind=>kinds.has(kind)),'revalidation missing evidence kind');
  const checkedAt='2026-01-01T00:00:00.000Z';
  const master={classes:{[next.classId]:proof},classMechanicsRevisions:{[next.classId]:next.catalogRevision},
    stale:false,checkedAt,sourceRevision:next.sourceRevision,sourceFreshAt:{raw:checkedAt,localized:checkedAt}};
  const observation={status:'observed',checkedAt,revisionSince:checkedAt,clientBuild:next.clientBuild,hotfixRevision:next.hotfixRevision};
  const baselineProof=snapshots.get(proofKey(baseline.classId,baseline.catalogRevision,baseline.sourceRevision));
  assert.ok(baselineProof,'revalidation missing original catalog proof');
  const original=auditPath(plan,baseline,baselineProof);
  assert.ok(original.ok,'revalidation original path invalid');
  for(const profile of plan.profiles){
    const result=resolveApprovedTalentPlan(profile,[plan],master,[baseline],{ruleObservation:observation,
      legacyTalentedRank:entry.legacyTalentedRank,now:Date.parse(checkedAt),revalidations:[entry]});
    assert.ok(result.ok,'revalidation live gate failed '+JSON.stringify(result));
    assert.deepEqual(result.history,original.history,'revalidation must preserve the chronological path');
  }
}
const revalidationKeys=new Set();
for(const entry of release.revalidations??[]){
  const key=JSON.stringify([entry.planId,entry.planVersion,entry.legacyTalentedRank,entry.to?.clientBuild,entry.to?.hotfixRevision,entry.to?.sourceRevision]);
  assert.ok(!revalidationKeys.has(key),'ambiguous revalidation');
  revalidationKeys.add(key);
  auditRevalidation(entry,plans,{evidence,packs},snapshots);
}
const bearPlan=plans.find(p=>p.id==='druid-feral-dungeons-tank-group-balanced');
assert.ok(bearPlan&&bearPlan.status==='approved');
assert.deepEqual(validatedRanks.get(JSON.stringify([bearPlan.id,bearPlan.version])),[0]);
assert.ok(!bearPlan.points.some(p=>[104951,113563].includes(p.talentId)),'Bear route deliberately avoids cat-specific mechanic');
// Distinct goal-specific research paths, no release without full evidence.
for(const [id,milestones,distribution] of [
  ['mage-arcane-dungeons',[[105812,15],[105778,20],[105806,22],[105803,27],[113627,30],[105798,42]],[38,10,3]],
  ['mage-fire-dungeons',[[105786,25],[105778,26],[105791,36],[105781,43]],[15,33,3]]
]){
  const candidate=plans.find(p=>p.id===id);
  assert.ok(candidate&&candidate.status==='approved');
  assert.deepEqual(validatedRanks.get(JSON.stringify([id,candidate.version])),[0]);
  assert.equal(candidate.profiles[0].goal,'dungeons');
  assert.equal(candidate.profiles[0].playStyle,'group');
  for(const [talentId,level] of milestones)assert.equal(candidate.points.findIndex(p=>p.talentId===talentId)+10,level,id+' milestone');
  assert.deepEqual([11582,11594,11601].map(treeId=>candidate.expectedDistribution[treeId]),distribution);
  const mixed=plans.find(p=>p.classId===candidate.classId&&p.treeId===candidate.treeId&&p.status==='approved'&&p.profiles.some(q=>q.goal==='leveling'));
  assert.ok(mixed&&JSON.stringify(mixed.points)!==JSON.stringify(candidate.points),'Dungeon answer must change the chronological path');
}
// Every class now has at least one complete non-retired path. This is
// research coverage only, not a promise of availability to the player.
assert.deepEqual([...new Set(plans.filter(p=>p.status!=='retired'&&p.active!==false&&p.points.length===51).map(p=>p.classId))].sort((a,b)=>a-b),
  Object.keys(CLASS_BY_ID).map(Number).sort((a,b)=>a-b));
for(const [id,distribution] of [["warlock-affliction-leveling",[38,13,0]],["warlock-demonology-leveling",[20,31,0]],["warlock-destruction-leveling",[20,0,31]],["warrior-protection-dungeons",[15,5,31]],["priest-holy-dungeons",[20,31,0]],["priest-shadow-leveling",[20,0,31]],["paladin-retribution-leveling",[12,8,31]],["rogue-combat-leveling",[12,39,0]],["shaman-enhancement-leveling",[20,31,0]]]){
  const p=plans.find(p=>p.id===id);
  const promoted=['shaman-enhancement-leveling','warlock-destruction-leveling','priest-shadow-leveling','warrior-protection-dungeons','rogue-combat-leveling','priest-holy-dungeons'].includes(id);
  assert.ok(p&&p.status===(promoted?'approved':'research_only'));
  if(promoted)assert.deepEqual(p.supportedLegacyRanks,[0]);
  assert.deepEqual(validatedRanks.get(JSON.stringify([p.id,p.version])),[0]);
  assert.deepEqual(coverage.classes[p.classId].map(t=>p.expectedDistribution[t.treeId]),distribution);
  const key=proofKey(p.classId,p.research.structuralValidation.catalogRevision,p.research.structuralValidation.sourceRevision);
  if(promoted)assert.ok(snapshots.has(key));else assert.ok(researchSnapshots.has(key)&&!snapshots.has(key));
}
assert.deepEqual([...new Set(plans.filter(p=>p.status!=='retired'&&p.active!==false&&p.points.length===51).map(p=>p.treeId))].sort((a,b)=>a-b),[...treesById.keys()].sort((a,b)=>a-b));
for(const [id,dist] of [["warrior-arms-leveling",[31,20,0]],["warrior-fury-leveling",[20,31,0]],["paladin-holy-dungeons",[31,20,0]],["paladin-protection-dungeons",[15,31,5]],["hunter-survival-leveling",[20,0,31]],["rogue-assassination-leveling",[31,20,0]],["rogue-subtlety-pvp",[0,20,31]],["priest-discipline-dungeons",[31,20,0]],["shaman-elemental-leveling",[31,0,20]],["shaman-restoration-dungeons",[0,5,46]],["druid-restoration-dungeons",[11,0,40]],["druid-balance-leveling",[31,0,20]]]){
  const candidate=plans.find(p=>p.id===id);
  const scoped=['paladin-protection-dungeons','hunter-survival-leveling','rogue-assassination-leveling','priest-discipline-dungeons','priest-holy-dungeons'].includes(id);
  const promoted=scoped||['shaman-elemental-leveling','shaman-restoration-dungeons','warrior-arms-leveling','warrior-fury-leveling'].includes(id);
  assert.ok(candidate&&candidate.status===(promoted?'approved':'research_only'));
  if(promoted){
    assert.deepEqual(candidate.supportedLegacyRanks,[0]);
    const ledger=JSON.parse(readFileSync(new URL('../docs/talent-planner-zephras-review-2026-11-26.json',import.meta.url),'utf8'));
    const independent=ledger.classes.find(c=>c.classId===candidate.classId);
    if(!scoped){assert.equal(independent.effectTextDifferenceCount,candidate.classId===1?2:0);assert.deepEqual(independent.structureDifferences,[]);}
    const pack=release.rulePacks.find(r=>r.revision===candidate.ruleRevision);
    assert.equal(pack.catalogRevision,independent.catalogRevision);
    assert.equal(pack.sourceRevision,ledger.primarySourceRevision);
    assert.equal(pack.clientBuild,ledger.build);
  }
  assert.deepEqual(validatedRanks.get(JSON.stringify([id,candidate.version])),[0]);
  assert.deepEqual(coverage.classes[candidate.classId].map(t=>candidate.expectedDistribution[t.treeId]),dist);
}
const legacyAudits=[];
for(const plan of plans.filter(p=>p.status!=='retired'&&p.active!==false)){
  const structural=plan.research?.structuralValidation;
  const revision=structural?.catalogRevision??plan.catalogRevision;
  const source=structural?.sourceRevision??release.rulePacks.find(p=>p.classId===plan.classId&&p.revision===plan.ruleRevision&&p.legacyTalentedRank===0)?.sourceRevision;
  const key=proofKey(plan.classId,revision,source);
  const proof=snapshots.get(key)??researchSnapshots.get(key);
  if(!proof){
    legacyAudits.push({planId:plan.id,version:plan.version,status:'catalog_missing',releaseEligible:false,ranks:[]});
    continue;
  }
  const audit=compareLegacyHypotheses(plan,proof);
  assert.equal(audit.releaseEligible,false);
  assert.equal(audit.status,'hypotheses_only',plan.id+' unexpected baseline failure');
  assert.equal(audit.ranks.length,6);
  for(const row of audit.ranks){
    assert.equal(row.releaseEligible,false);
    assert.equal(row.firstPoint,10-row.rank);
    assert.equal(row.lastPoint,60-row.rank);
    assert.ok(row.shifted.ok&&row.fixedGateBanked.ok,plan.id+' hypothesis failure');
    assert.equal(row.shifted.history.length,51);
    assert.equal(row.fixedGateBanked.history.length,51);
    assert.deepEqual(row.shifted.history.map(({talentId,rank})=>({talentId,rank})),plan.points);
    assert.deepEqual(row.fixedGateBanked.history.map(({talentId,rank})=>({talentId,rank})),plan.points);
    assert.equal(row.shifted.lastSpend,60-row.rank);
    assert.ok(row.fixedGateBanked.lastSpend<=60);
    if(row.rank===0)assert.equal(row.differing.length,0);
    else assert.ok(row.differing.length&&row.fixedGateImmediate.code==='level_gate');
  }
  legacyAudits.push(audit);
}
assert.ok(legacyAudits.some(a=>a.status==='catalog_missing'),'unverified candidate must not disappear from legacy research');
if(process.argv.includes('--legacy-research')){
  console.log(JSON.stringify({kind:'legacy_gate_hypotheses',releaseEligible:false,
    sources:['https://bindonforever.com/notes/legacy-system','https://www.destructoid.com/how-to-earn-and-spend-legacy-points-in-wow-forever/','https://foreverwow.com/guides/wow-forever-talent-planning/'],
    audits:legacyAudits},null,2));
}
// Current exact primary proof audit for all active paths; independent/editorial
// release remains a separate requirement. A passing result cannot publish a plan.
const currentSource=release.revalidations.find(r=>r.to.clientBuild==='1.60.1.71139')?.to.sourceRevision;
const currentAudit=plans.filter(p=>p.status!=='retired'&&p.active!==false).map(plan=>{
  const record=proofFile.catalogs.find(r=>r.proof.classId===plan.classId&&r.sourceRevision===currentSource);
  if(!record)return {id:plan.id,version:plan.version,status:'missing_exact_primary',releaseEligible:false};
  const proof=record.proof;
  const pack={status:'verified',classId:plan.classId,catalogRevision:record.catalogRevision,revision:'current-primary-audit',
    sources:['exact primary structure only'],reviewedAt:'2026-11-26',pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,
    legacyTalentedRank:0,pointSpendMode:'immediate',gateMode:'earlier_rows',
    minimumLevelByTalent:Object.fromEntries(proof.trees.flatMap(t=>t.talents.map(n=>[n.id,n.requiredLevel])))};
  const result=auditPath({...plan,catalogRevision:pack.catalogRevision,ruleRevision:pack.revision},pack,proof);
  const old=plan.research?.structuralValidation;
  const key=old&&proofKey(plan.classId,old.catalogRevision,old.sourceRevision);
  const baseline=key&&(snapshots.get(key)??researchSnapshots.get(key));
  const map=p=>new Map((p?.trees??[]).flatMap(t=>t.talents.map(n=>[n.id,{...n,treeId:t.id}])));
  const prev=map(baseline),next=map(proof);
  const changed=[...new Set(plan.points.map(p=>p.talentId))].filter(id=>prev.has(id)&&
    talentRevisionDigest(prev.get(id))!==talentRevisionDigest(next.get(id)??null));
  return {id:plan.id,version:plan.version,classId:plan.classId,editorialStatus:plan.status,
    status:result.ok?'primary_structure_matches':'primary_structure_blocked',blocker:result.ok?null:result.code,point:result.point??null,
    changedUsedNodes:changed,sourceRevision:record.sourceRevision,releaseEligible:false};
});
assert.ok(currentAudit.every(a=>a.releaseEligible===false));
for(const id of ['mage-arcane-dungeons','mage-fire-dungeons','mage-frost-pvp','warlock-affliction-leveling','warlock-demonology-leveling','warlock-destruction-leveling']){
  assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches',id+' exact current structural audit');
}
assert.equal(currentAudit.find(a=>a.id==='hunter-beast-mastery-leveling')?.status,'primary_structure_blocked');
if(process.argv.includes('--current-audit'))console.log(JSON.stringify({kind:'current_primary_audit',releaseEligible:false,sourceRevision:currentSource,paths:currentAudit},null,2));
const rows=deriveTalentCoverage(coverage,research.candidateTracks,plans,validatedRanks);
assert.equal(rows.length,[...treesById.values()].reduce((total,tree)=>total+tree.roles.length*coverage.goals.length,0));
assert.equal(rows.length,84,'all supported class/spec/role/goal cells');
assert.ok(rows.every(row=>row.status!=='unresearched'),'every supported coverage cell needs a research candidate');
for(const row of rows)assert.ok(plans.some(p=>p.status!=='retired'&&p.active!==false&&p.points.length===51&&p.profiles.some(x=>x.classId===row.classId&&x.treeId===row.treeId&&x.role===row.role&&x.goal===row.goal)), 'Missing full 51-point path '+JSON.stringify([row.classId,row.treeId,row.role,row.goal]));
assert.ok(rows.some(row=>row.status==='structurally_validated'||row.status==='approved'),'verified paths must appear');
assert.ok(rows.some(row=>row.status==='blocked'&&row.profiles.some(profile=>
  profile.candidates.some(candidate=>candidate.blockers?.length))),'blocked profiles need a reason');
const workQueue=deriveTalentWorkQueue(rows);
assert.equal(workQueue.liveReleaseStatus,'not_checked');
assert.equal(workQueue.coverageCells,rows.length);
assert.equal(Object.values(workQueue.coverageByStatus).reduce((a,b)=>a+b,0),rows.length);
assert.equal(new Set(workQueue.queue.map(a=>JSON.stringify([a.kind,a.identity]))).size,workQueue.queue.length);
assert.ok(workQueue.queue.some(a=>a.kind==='check_current_release'));
assert.equal(workQueue.counts.research_profile,0,'all basic coverage cells researched');
assert.ok(workQueue.queue.some(a=>a.kind==='resolve_blocker'));
if(process.argv.includes('--legacy-research')||process.argv.includes('--current-audit')){}
else if(process.argv.includes('--work-queue'))console.log(JSON.stringify(workQueue,null,2));
else if(process.argv.includes('--coverage'))console.log(JSON.stringify(rows,null,2));
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
if(!process.argv.includes('--coverage')&&!process.argv.includes('--work-queue'))console.log('Talent release CI: offline proof, exact claims, ranks, prerequisites and row gates: OK');

// A complete hypothetical review is tested without claiming a real build approval.
const baseTuple=Object.fromEntries(TALENT_RULE_BINDING_FIELDS.map(k=>[k,pack[k]]));
const fixtureRawSha='e'.repeat(64),fixtureLocalizedSha='f'.repeat(64);
const targetTuple={...baseTuple,clientBuild:'1.60.1.71139',hotfixRevision:'d'.repeat(64),sourceRevision:talentSourcePairDigest(fixtureRawSha,fixtureLocalizedSha)};
const nextPack={...pack,...targetTuple};
const transitionFixture={status:'verified',planId:publishedFixture.id,planVersion:1,allocationDigest:talentPlanEvidenceDigest(publishedFixture),
  ruleRevision:pack.revision,legacyTalentedRank:0,from:baseTuple,to:targetTuple,reviewedAt:'2026-11-26',
  evidenceIds:['fixture-next-client','fixture-next-official','fixture-next-editorial'],
  scope:{completeHotfixReview:true,classAndSpellDependenciesUnchanged:true,pointCalendarAndGatesUnchanged:true,editorialRecommendationUnchanged:true}};
const clientFixture={...ruleEvidence,...targetTuple,id:'fixture-next-client',reviewedFrom:baseTuple,reviewedAt:'2026-11-26',
  ruleDigest:talentRuleEvidenceDigest(nextPack),comparisonDigest:talentStructureDigest(fixtureProof),sourceCaptureSha256:'f'.repeat(64),
  buildComparison:{status:'structure_matches',build:targetTuple.clientBuild,classId:targetTuple.classId,
    catalogRevision:targetTuple.catalogRevision,sourceRevision:targetTuple.sourceRevision,captureSha256:'f'.repeat(64),
    comparisonDigest:talentStructureDigest(fixtureProof),primaryNormalizedSha256:'b'.repeat(64),independentNormalizedSha256:'b'.repeat(64),
    rawSha256:fixtureRawSha,localizedSha256:fixtureLocalizedSha,unknownPrerequisites:[],cyclicPrerequisites:[],
    talentCount:fixtureProof.trees.flatMap(t=>t.talents).length}};
const officialFixture={...clientFixture,id:'fixture-next-official',kind:'official',completeHotfixReview:true,hotfixDeltaReviewed:true};
const editorialFixture={...editorial,...targetTuple,id:'fixture-next-editorial',reviewedFrom:baseTuple,reviewedAt:'2026-11-26'};
const transitionCatalog=validateReleaseCatalog({evidence:[ruleEvidence,editorial,clientFixture,officialFixture,editorialFixture],rulePacks:[pack]});
const transitionSnapshots=indexCatalogProofs([{...tuple,proof:fixtureProof},{...targetTuple,proof:fixtureProof}]);
auditRevalidation(transitionFixture,[{...publishedFixture,status:'approved'}],transitionCatalog,transitionSnapshots);
assert.throws(()=>auditRevalidation(transitionFixture,[{...publishedFixture,status:'approved'}],transitionCatalog,fixtureSnapshots),/missing exact new catalog proof/);
const missingOfficial={...transitionCatalog,evidence:new Map(transitionCatalog.evidence)};
missingOfficial.evidence.set(officialFixture.id,{...officialFixture,completeHotfixReview:false});
assert.throws(()=>auditRevalidation(transitionFixture,[{...publishedFixture,status:'approved'}],missingOfficial,transitionSnapshots),/complete hotfix delta/);
assert.throws(()=>auditRevalidation({...transitionFixture,allocationDigest:'b'.repeat(64)},[{...publishedFixture,status:'approved'}],transitionCatalog,transitionSnapshots),/invalid revalidation/);

const incompleteComparison={...transitionCatalog,evidence:new Map(transitionCatalog.evidence)};
incompleteComparison.evidence.set(clientFixture.id,{...clientFixture,buildComparison:{...clientFixture.buildComparison,cyclicPrerequisites:[[1,2,1]]}});
assert.throws(()=>auditRevalidation(transitionFixture,[{...publishedFixture,status:'approved'}],incompleteComparison,transitionSnapshots),/unresolved edge/);

const archivedOnly=deriveTalentCoverage(coverage,[],[{...publishedFixture,status:'approved',active:false}],
  new Map([[JSON.stringify([publishedFixture.id,publishedFixture.version]),[0]]]));
assert.ok(archivedOnly.every(row=>row.status==='unresearched'),'archived approvals cannot count as active coverage');
const retainedTrack={...publishedFixture.profiles[0],id:publishedFixture.id,status:'research_only',openChecks:['new review needed']};
const trackRows=deriveTalentCoverage(coverage,[retainedTrack],[{...publishedFixture,status:'retired'}],new Map());
assert.ok(trackRows.some(row=>row.status==='research'),'retired versions must not hide a new research track');
const fixtureQueue=deriveTalentWorkQueue(fixtureRows);
assert.equal(fixtureQueue.counts.check_current_release,1);
assert.deepEqual(fixtureQueue.queue.find(a=>a.kind==='verify_legacy_ranks').ranks,[1,2,3,4,5]);
assert.equal(fixtureQueue.liveReleaseStatus,'not_checked');

for(const [id,distribution] of [['warlock-affliction-dungeons',[30,0,21]],['warlock-demonology-pvp',[7,33,11]]]){
  const p=plans.find(x=>x.id===id);
  assert.ok(p&&p.status===(id==='warlock-affliction-dungeons'?'approved':'research_only'));
  assert.deepEqual(Object.values(p.expectedDistribution),distribution);
  assert.deepEqual(validatedRanks.get(JSON.stringify([id,1])),[0]);
  assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
}

for(const [id,distribution] of [['warlock-affliction-pvp',[35,16,0]],['warlock-demonology-dungeons',[2,31,18]],['warlock-destruction-dungeons',[5,11,35]],['warlock-destruction-pvp',[18,0,33]]]){
  const p=plans.find(x=>x.id===id);
  assert.ok(p&&p.status===(['warlock-destruction-dungeons','warlock-destruction-pvp'].includes(id)?'approved':'research_only'));
  assert.deepEqual(Object.values(p.expectedDistribution),distribution);
  assert.deepEqual(validatedRanks.get(JSON.stringify([id,1])),[0]);
  assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
}
for(const treeId of [11629,11636,11637])for(const goal of ['leveling','dungeons','pvp']){
  assert.ok(plans.some(p=>p.classId===9&&p.treeId===treeId&&p.active!==false&&p.status!=='retired'&&p.profiles.some(x=>x.goal===goal)&&validatedRanks.get(JSON.stringify([p.id,p.version]))?.includes(0)),'Missing Warlock research '+treeId+' '+goal);
}

for(const [id,distribution] of [['mage-arcane-pvp',[31,0,20]],['mage-fire-pvp',[0,31,20]],['mage-frost-dungeons',[18,0,33]]]){
  const p=plans.find(x=>x.id===id);
  assert.ok(p&&p.status===(id==='mage-frost-dungeons'?'research_only':'approved'));
  assert.deepEqual(Object.values(p.expectedDistribution),distribution);
  assert.deepEqual(validatedRanks.get(JSON.stringify([id,1])),[0]);
  assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
}
// Conflict research is deliberately kept outside the published rank-zero library.
for(const id of ['warrior-arms-pvp','mage-frost-dungeons','mage-frost-leveling-mixed-balanced','mage-frost-pvp']){
  const candidate=plans.find(p=>p.id===id);
  assert.ok(candidate&&candidate.status===(id==='warrior-arms-pvp'?'approved':'research_only'));
  assert.equal(candidate.research.conflictFollowup.releaseEligible,id==='warrior-arms-pvp');
  assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
  const rationale=candidate.rationaleBlocks.flatMap(x=>Array(x.count).fill(x.talentId));
  assert.deepEqual(rationale,candidate.points.map(x=>x.talentId));
}
const armsConflict=plans.find(p=>p.id==='warrior-arms-pvp');
assert.equal(armsConflict.points[20].talentId,105945,'Sweeping Strikes at 30');
assert.equal(armsConflict.points[30].talentId,105941,'Mortal Strike at 40');
const frostDungeonConflict=plans.find(p=>p.id==='mage-frost-dungeons');
assert.equal(frostDungeonConflict.points[30].talentId,105762,'Ice Barrier at 40');
assert.deepEqual(frostDungeonConflict.points.slice(25,30).map(x=>x.talentId),[105764,105765,105765,105777,105777]);
assert.ok(!frostDungeonConflict.points.some(x=>x.talentId===105763),'short group pull candidate does not assume Winter Chill stacks');

for(const treeId of [11582,11594,11601])for(const goal of ['leveling','dungeons','pvp']){
  assert.ok(plans.some(p=>p.classId===8&&p.treeId===treeId&&p.active!==false&&p.status!=='retired'&&p.profiles.some(x=>x.goal===goal)&&validatedRanks.get(JSON.stringify([p.id,p.version]))?.includes(0)),'Missing Mage coverage '+treeId+' '+goal);
}

for(const [id,distribution] of [["hunter-beast-mastery-dungeons",[30,21,0]],["hunter-beast-mastery-pvp",[30,0,21]],["hunter-marksmanship-dungeons",[5,41,5]],["hunter-marksmanship-pvp",[0,31,20]],["hunter-survival-dungeons",[16,8,27]],["hunter-survival-pvp",[0,21,30]]]){
  const p=plans.find(x=>x.id===id);
  assert.ok(p&&p.status===(['hunter-marksmanship-dungeons','hunter-marksmanship-pvp','hunter-survival-pvp'].includes(id)?'approved':'research_only'));
  assert.deepEqual([11372,11371,11370].map(t=>p.expectedDistribution[t]),distribution);
  assert.deepEqual(validatedRanks.get(JSON.stringify([id,1])),[0]);
  assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
  assert.ok(p.points.every(step=>![104961,104964].includes(step.talentId)));
}

for(const [id,dist] of [["druid-balance-dungeons",{"11328":31,"11340":20,"11347":0}],["druid-balance-pvp",{"11328":30,"11340":21,"11347":0}],["druid-feral-dungeons-damage",{"11328":0,"11340":12,"11347":39}],["druid-feral-pvp-damage",{"11328":0,"11340":16,"11347":35}],["druid-feral-leveling-tank",{"11328":0,"11340":12,"11347":39}],["druid-feral-pvp-tank",{"11328":0,"11340":21,"11347":30}],["druid-restoration-leveling",{"11328":20,"11340":31,"11347":0}],["druid-restoration-pvp",{"11328":8,"11340":32,"11347":11}]]){
 const p=plans.find(x=>x.id===id);
 assert.ok(p&&p.status===(id.startsWith('druid-feral-')?'approved':'research_only'));
 assert.deepEqual(p.expectedDistribution,dist);
 assert.deepEqual(validatedRanks.get(JSON.stringify([id,1])),[0]);
 assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
}

for(const [id,dist] of [["priest-discipline-leveling",{"11608":33,"11615":18,"11622":0}],["priest-discipline-pvp",{"11608":31,"11615":20,"11622":0}],["priest-holy-leveling",{"11608":15,"11615":31,"11622":5}],["priest-holy-pvp",{"11608":20,"11615":31,"11622":0}],["priest-shadow-pvp",{"11608":20,"11615":0,"11622":31}]]){
 const p=plans.find(x=>x.id===id);
 assert.ok(p&&p.status===('approved'));
 assert.deepEqual(p.expectedDistribution,dist);
 assert.deepEqual(validatedRanks.get(JSON.stringify([id,1])),[0]);
 assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
}

{
 const p=plans.find(x=>x.id==='priest-shadow-dungeons');
 assert.ok(p&&p.status==='approved');
 assert.deepEqual(p.expectedDistribution,{"11608":18,"11615":0,"11622":33});
 assert.deepEqual(validatedRanks.get(JSON.stringify([p.id,1])),[0]);
 assert.equal(currentAudit.find(a=>a.id===p.id)?.status,'primary_structure_matches');
}
for(const treeId of [11608,11615,11622])for(const goal of ['leveling','dungeons','pvp']){
 assert.ok(plans.some(p=>p.classId===5&&p.treeId===treeId&&p.active!==false&&p.status!=='retired'&&p.profiles.some(x=>x.goal===goal)&&validatedRanks.get(JSON.stringify([p.id,p.version]))?.includes(0)),'Missing Priest research '+treeId+' '+goal);
}

for(const [id,dist] of [["rogue-assassination-dungeons",{"11572":0,"11573":20,"11580":31}],["rogue-assassination-pvp",{"11572":0,"11573":20,"11580":31}],["rogue-combat-dungeons",{"11572":0,"11573":31,"11580":20}],["rogue-combat-pvp",{"11572":20,"11573":31,"11580":0}],["rogue-subtlety-leveling",{"11572":31,"11573":20,"11580":0}],["rogue-subtlety-dungeons",{"11572":31,"11573":8,"11580":12}]]){
 const p=plans.find(x=>x.id===id);
 assert.ok(p&&p.status===(['rogue-combat-dungeons','rogue-combat-pvp','rogue-assassination-dungeons','rogue-assassination-pvp'].includes(id)?'approved':'research_only'));
 assert.deepEqual(p.expectedDistribution,dist);
 assert.deepEqual(validatedRanks.get(JSON.stringify([id,1])),[0]);
 assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
}

for(const [id,dist] of [["warrior-arms-dungeons",{"11650":31,"11657":20,"11670":0}],["warrior-arms-pvp",{"11650":31,"11657":20,"11670":0}],["warrior-fury-dungeons",{"11650":20,"11657":31,"11670":0}],["warrior-fury-pvp",{"11650":20,"11657":31,"11670":0}],["warrior-protection-leveling",{"11650":15,"11657":5,"11670":31}],["warrior-protection-pvp",{"11650":15,"11657":5,"11670":31}],["paladin-holy-leveling",{"11486":31,"11541":5,"11559":15}],["paladin-holy-pvp",{"11486":31,"11541":20,"11559":0}],["paladin-protection-leveling",{"11486":15,"11541":31,"11559":5}],["paladin-protection-pvp",{"11486":0,"11541":31,"11559":20}],["paladin-retribution-dungeons",{"11486":12,"11541":8,"11559":31}],["paladin-retribution-pvp",{"11486":0,"11541":20,"11559":31}],["shaman-elemental-dungeons",{"11326":31,"11362":15,"11363":5}],["shaman-elemental-pvp",{"11326":31,"11362":15,"11363":5}],["shaman-enhancement-dungeons",{"11326":17,"11362":0,"11363":34}],["shaman-enhancement-pvp",{"11326":11,"11362":5,"11363":35}],["shaman-restoration-leveling",{"11326":20,"11362":31,"11363":0}],["shaman-restoration-pvp",{"11326":0,"11362":41,"11363":10}]]){
 const p=plans.find(x=>x.id===id);
 assert.ok(p&&p.status===(id.startsWith('shaman-')||['warrior-protection-leveling','warrior-protection-pvp','warrior-arms-dungeons','warrior-arms-pvp','warrior-fury-dungeons','warrior-fury-pvp','paladin-protection-leveling'].includes(id)?'approved':'research_only'));
 if(id.startsWith('shaman-'))assert.deepEqual(p.supportedLegacyRanks,[0]);
 assert.deepEqual(p.expectedDistribution,dist);
 assert.deepEqual(validatedRanks.get(JSON.stringify([id,1])),[0]);
 assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
}

for(const [id,milestones] of [['warrior-arms-leveling',[[105949,25],[105945,30],[110524,31],[105941,40]]],['warrior-fury-leveling',[[113569,31],[105930,40]]]]){
 const p=plans.find(x=>x.id===id);
 for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}

// Reviewed progression milestones must survive future revisions.
for(const [id,milestones] of [['mage-fire-pvp',[[105792,20],[105786,25],[105783,33],[105781,40],[105769,56]]],['mage-arcane-pvp',[[105804,25],[105801,30],[105798,40],[105769,56]]],['warrior-protection-leveling',[[105970,24],[105966,25],[105963,27],[105959,40]]],['warrior-protection-pvp',[[105970,24],[105966,25],[105963,26],[105959,40]]]]){
 const p=plans.find(x=>x.id===id);
 for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}

for(const [id,milestones] of [['warrior-arms-dungeons',[[105945,30],[110524,32],[105941,40]]],['warrior-fury-dungeons',[[105927,30],[105930,40]]],['warrior-fury-pvp',[[105927,30],[113569,31],[105926,33],[105930,40]]],['warlock-affliction-dungeons',[[105912,35],[105910,40],[105884,57]]]]){
 const p=plans.find(x=>x.id===id);
 for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}

// Demonology: scoped rank-zero research, no numeric brand release.
for(const [id,milestones] of [
 ['warlock-demonology-leveling',[[105896,25],[105892,30],[105895,31],[105890,40]]],
 ['warlock-demonology-dungeons',[[105896,26],[105897,29],[105892,30],[105890,40]]],
 ['warlock-demonology-pvp',[[105892,30],[105895,31],[105890,40],[105885,53],[105884,58]]]
]){
 const p=plans.find(x=>x.id===id);
 assert.equal(p.status,'research_only');
 assert.equal(p.research.conflictFollowup.releaseEligible,false);
 assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
 assert.deepEqual(p.rationaleBlocks.flatMap(x=>Array(x.count).fill(x.talentId)),p.points.map(x=>x.talentId));
 for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}
const demonGroup=plans.find(p=>p.id==='warlock-demonology-dungeons');
assert.equal(demonGroup.points.filter(x=>x.talentId===105897).length,2);
assert.ok(!demonGroup.points.some(x=>x.talentId===105907));

// Druid hotfix research: strict retained prerequisite, no obsolete talent effects released.
for(const [id,milestones] of [
 ['druid-balance-leveling',[[104935,30],[104937,40]]],
 ['druid-balance-dungeons',[[104935,31],[104937,40],[104920,46]]],
 ['druid-balance-pvp',[[104912,50],[104921,55]]],
 ['druid-restoration-leveling',[[104912,35],[104921,40],[104910,60]]],
 ['druid-restoration-dungeons',[[104912,25],[104918,26],[104921,30],[104910,40]]],
 ['druid-restoration-pvp',[[104912,25],[104921,30],[104944,41],[104918,42],[104910,52]]]
]){
 const p=plans.find(x=>x.id===id);
 assert.equal(p.status,'research_only');
 assert.equal(p.research.conflictFollowup.releaseEligible,false);
 assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
 assert.deepEqual(p.rationaleBlocks.flatMap(x=>Array(x.count).fill(x.talentId)),p.points.map(x=>x.talentId));
 assert.ok(!p.points.some(x=>[104933,104936].includes(x.talentId)));
 const splendor=p.points.findIndex(x=>x.talentId===104928);
 if(splendor>=0)assert.equal(p.points.slice(0,splendor).filter(x=>x.talentId===104927).length,2);
 for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}
const restoPvp=plans.find(x=>x.id==='druid-restoration-pvp');
assert.equal(restoPvp.points.filter(x=>x.talentId===104939).length,5);
assert.ok(!restoPvp.points.some(x=>x.talentId===104938));

// Paladin conflict follow-up: rank zero, research only; avoid disputed Boundless Light prerequisite.
for(const [id,milestones] of [
 ['paladin-holy-leveling',[[105330,30],[105323,35],[105320,45]]],
 ['paladin-holy-dungeons',[[105330,25],[105323,30],[105320,40]]],
 ['paladin-holy-pvp',[[105330,25],[105323,30],[105320,40],[105637,46],[105633,51]]],
 ['paladin-protection-pvp',[[105625,20],[110878,25],[105628,30],[110875,40]]],
 ['paladin-retribution-leveling',[[105696,20],[105694,33],[105692,40]]],
 ['paladin-retribution-dungeons',[[105696,20],[105694,30],[105692,40],[105638,46]]],
 ['paladin-retribution-pvp',[[105696,20],[105694,30],[105692,40]]]
]){
 const p=plans.find(x=>x.id===id);
 assert.equal(p.status,'research_only');
 assert.equal(p.research.conflictFollowup.releaseEligible,false);
 assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
 assert.deepEqual(p.rationaleBlocks.flatMap(x=>Array(x.count).fill(x.talentId)),p.points.map(x=>x.talentId));
 assert.ok(!p.points.some(x=>x.talentId===113631));
 for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}
const shieldPvp=plans.find(p=>p.id==='paladin-protection-pvp');
assert.ok(!shieldPvp.points.some(p=>p.talentId===105697));
assert.equal(shieldPvp.points.filter(p=>p.talentId===105707).length,3);
assert.notDeepEqual(plans.find(p=>p.id==='paladin-holy-pvp').points,plans.find(p=>p.id==='paladin-holy-dungeons').points);

// Rogue conflict follow-up: preserve scoped rank-zero research and exact milestones.
for(const [id,milestones] of [
 ['rogue-assassination-leveling',[[105715,25],[105712,30],[105709,40]]],
 ['rogue-assassination-dungeons',[[105715,33],[105712,38],[105709,48]]],
 ['rogue-assassination-pvp',[[105715,35],[105712,40],[105709,50]]],
 ['rogue-combat-leveling',[[105735,20],[108100,25],[105728,30],[105724,40]]],
 ['rogue-combat-dungeons',[[108100,25],[105728,30],[105724,40]]],
 ['rogue-combat-pvp',[[105735,20],[105733,25],[105728,30],[105724,40]]],
 ['rogue-subtlety-leveling',[[105743,25],[105746,35],[110866,45]]],
 ['rogue-subtlety-dungeons',[[105743,20],[105746,30],[110866,40],[105708,41]]],
 ['rogue-subtlety-pvp',[[105743,20],[105746,30],[110866,40],[105708,43],[105735,60]]]
]){
 const p=plans.find(x=>x.id===id);
 assert.equal(p.status,['rogue-combat-dungeons','rogue-combat-leveling','rogue-combat-pvp','rogue-assassination-leveling','rogue-assassination-dungeons','rogue-assassination-pvp'].includes(id)?'approved':'research_only');
 assert.equal(p.research.conflictFollowup.releaseEligible,['rogue-combat-dungeons','rogue-combat-leveling','rogue-combat-pvp','rogue-assassination-leveling','rogue-assassination-dungeons','rogue-assassination-pvp'].includes(id));
 assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
 assert.deepEqual(p.rationaleBlocks.flatMap(x=>Array(x.count).fill(x.talentId)),p.points.map(x=>x.talentId));
 for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}
const assassinationGroup=plans.find(p=>p.id==='rogue-assassination-dungeons');
assert.ok(!assassinationGroup.points.some(x=>[105735,105738].includes(x.talentId)));
assert.equal(assassinationGroup.points.filter(x=>x.talentId===105759).length,2);
assert.equal(assassinationGroup.points.filter(x=>x.talentId===105732).length,2);
const rogueGroup=plans.find(p=>p.id==='rogue-combat-dungeons');
assert.ok(!rogueGroup.points.some(p=>[105735,105738].includes(p.talentId)));
assert.equal(rogueGroup.points.filter(p=>p.talentId===105740).length,5);

// Priest scoped rank-zero approvals; no quantitative server release.
for(const [id,milestones] of [
 ['priest-discipline-leveling',[[105839,28],[105834,32],[105836,40]]],
 ['priest-discipline-dungeons',[[105839,25],[105834,30],[105836,40]]],
 ['priest-discipline-pvp',[[105839,25],[105834,30],[105836,40]]],
 ['priest-holy-leveling',[[105851,47]]],
 ['priest-holy-dungeons',[[105855,30],[105851,40]]],
 ['priest-holy-pvp',[[105851,40]]]
]){
 const p=plans.find(x=>x.id===id);
 assert.equal(p.status,'approved');
 assert.equal(p.research.conflictFollowup.releaseEligible,true);
 assert.equal(currentAudit.find(a=>a.id===id)?.status,'primary_structure_matches');
 assert.deepEqual(p.rationaleBlocks.flatMap(x=>Array(x.count).fill(x.talentId)),p.points.map(x=>x.talentId));
 for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}

for(const [id,milestones] of [['hunter-beast-mastery-dungeons',[[104966,25]]],['hunter-beast-mastery-pvp',[[104966,25]]],['hunter-survival-dungeons',[[104981,30],[110860,35],[104966,52]]],['warlock-affliction-leveling',[[105912,30],[105909,40]]],['warlock-affliction-pvp',[[105913,25],[105912,30],[105909,40]]],['hunter-marksmanship-dungeons',[[105007,20],[105004,25],[104999,30],[104997,40]]],['hunter-survival-leveling',[[104981,30],[104984,40]]],['hunter-survival-pvp',[[104981,30],[105000,60]]],['paladin-protection-dungeons',[[105628,30],[110875,40]]],['paladin-protection-leveling',[[105628,35],[110875,45]]]]){
 const p=plans.find(x=>x.id===id);for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}

for(const [id,milestones] of [['druid-feral-dungeons-damage',[[104944,20],[113563,40],[104956,41]]],['druid-feral-leveling-mixed-balanced',[[104949,25],[113563,40],[104956,41]]],['druid-feral-leveling-tank',[[104944,20],[104949,25],[104956,40]]],['druid-feral-dungeons-tank-group-balanced',[[104944,20],[104949,25],[104956,40]]],['druid-feral-pvp-damage',[[113563,40],[104912,60]]],['druid-feral-pvp-tank',[[104921,60]]]]){
 const p=plans.find(x=>x.id===id);assert.equal(p.status,'approved');for(const [talentId,level] of milestones)assert.equal(p.points.findIndex(x=>x.talentId===talentId)+10,level,id+' milestone');
}
