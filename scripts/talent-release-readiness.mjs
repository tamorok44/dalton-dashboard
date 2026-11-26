import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {validateTalentPath,TALENT_POINT_CALENDAR_REVISION} from './talent-plan-core.mjs';
import {talentRevisionDigest,talentStructureDigest,talentSourcePairDigest} from './talent-catalog-proof.mjs';
import {compareLegacyHypotheses} from './talent-legacy-research.mjs';
import {talentPlanLibrary} from './talent-plan-index.mjs';
const data=new URL('../data/talent-planning/',import.meta.url);
const read=f=>JSON.parse(readFileSync(new URL(f,data),'utf8'));
const ledger=JSON.parse(readFileSync(new URL('../docs/talent-planner-cross-build-review-2026-11-26.json',import.meta.url),'utf8'));
const plans=readdirSync(data).filter(f=>/-v\d+\.json$/.test(f)).map(read).filter(p=>p.status!=='retired'&&p.active!==false);
const proofs=read('catalog-proofs-2026-11-25.json').catalogs.filter(c=>c.sourceRevision===ledger.sourceRevision);
const byClass=new Map(proofs.map(c=>[c.proof.classId,c]));
const captureByKey=new Map(ledger.captures.map(x=>[x.key,x]));
assert.equal(ledger.releaseEligible,false);
assert.notEqual(ledger.primaryBuild,ledger.independentBuild);
assert.equal(talentSourcePairDigest(captureByKey.get('raw').sha256,captureByKey.get('localized').sha256),ledger.sourceRevision);
assert.equal(byClass.size,9);assert.equal(ledger.classes.length,9);
for(const c of ledger.classes){
 const p=byClass.get(c.classId);assert.ok(p);
 assert.equal(c.releaseEligible,false);
 assert.equal(c.build,ledger.independentBuild);
 assert.equal(c.captureSha256,captureByKey.get('independent-'+c.classId).sha256);
 assert.equal(c.comparisonDigest,talentStructureDigest(p.proof));
 assert.equal(c.talentCount,p.proof.trees.flatMap(t=>t.talents).length);
 assert.equal(c.primaryNormalizedSha256===c.independentNormalizedSha256,c.status!=='structure_differs');
}
assert.deepEqual(ledger.classes.filter(c=>c.status==='structure_matches').map(c=>c.classId).sort((a,b)=>a-b),[1,4,5,7,8,9]);
assert.deepEqual(ledger.classes.filter(c=>c.status==='structure_differs').map(c=>c.classId).sort((a,b)=>a-b),[3,11]);
assert.deepEqual(ledger.classes.find(c=>c.classId===2).unknownPrerequisites,[113631]);
assert.deepEqual(ledger.classes.find(c=>c.classId===3).changes,[{id:104964,kind:'changed',fields:['prerequisites']}]);
assert.deepEqual(ledger.classes.find(c=>c.classId===11).changes,[{id:104933,kind:'changed',fields:['maxRank']}]);
assert.equal(ledger.legacy.cap,51);
assert.deepEqual(ledger.legacy.firstLevels,[10,9,8,7,6,5]);
assert.equal(ledger.legacy.releaseEligible,false);
function audit(plan,proof){
 const rev=talentRevisionDigest(proof),rule='diagnostic-only';
 return validateTalentPath({...plan,catalogRevision:rev,ruleRevision:rule},{stale:false,classes:{[plan.classId]:proof},classMechanicsRevisions:{[plan.classId]:rev}},
  {status:'verified',classId:plan.classId,catalogRevision:rev,revision:rule,sources:['offline diagnostic only'],reviewedAt:ledger.date,pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,legacyTalentedRank:0,pointSpendMode:'immediate',gateMode:'earlier_rows',minimumLevelByTalent:Object.fromEntries(proof.trees.flatMap(t=>t.talents.map(n=>[n.id,n.requiredLevel])))});
}
const mutate=(classId,fn)=>{
 const p=structuredClone(byClass.get(classId).proof);
 const nodes=new Map(p.trees.flatMap(t=>t.talents.map(n=>[n.id,n])));
 fn(nodes);
 return p;
};
const hypothetical=new Map([
 [3,mutate(3,n=>{n.get(104964).prerequisites=n.get(104964).prerequisites.filter(x=>x.id!==104961);})],
 [2,mutate(2,n=>{n.get(113631).prerequisites=n.get(113631).prerequisites.map(x=>({...x,conditionKnown:true}));})],
 // The official rank cap is known; replacement ID/effects are not. Do not
 // introduce an invented Dreamstate node or alter the retained source proof.
 [11,mutate(11,n=>{const s=n.get(104933);s.maxRank=2;s.rankSpellIds=s.rankSpellIds.slice(0,2);})]
]);
const rows=plans.map(p=>{
 const record=byClass.get(p.classId),review=ledger.classes.find(x=>x.classId===p.classId);
 const baseline=audit(p,record.proof),issue=ledger.issues.find(i=>i.classId===p.classId);
 const touched=issue?[...new Set(p.points.filter(s=>issue.talentIds.includes(s.talentId)).map(s=>s.talentId))]:[];
 const candidate=hypothetical.get(p.classId);
 const adjusted=candidate?audit(p,candidate):null;
 const hypothesis=compareLegacyHypotheses(p,record.proof);
 const explicitLevelConflicts=[];
 let offset=0;
 for(const b of p.rationaleBlocks){
   const text=b.reason;
   const claim=text.match(/\bauf (?:Stufe )?(\d{1,2})\s+(?:freischalten|ermöglichen)/i);
   const first=offset+10;
   if(claim&&Number(claim[1])!==first)explicitLevelConflicts.push({talentId:b.talentId,claimed:Number(claim[1]),actual:first});
   offset+=b.count;
 }
 return {id:p.id,version:p.version,classId:p.classId,profiles:p.profiles,editorialStatus:p.status,
  primaryStructuralStatus:baseline.ok?'valid':baseline.code,primaryBlockPoint:baseline.ok?null:baseline.point,
  crossBuildStatus:review.status,exactCurrentIndependentStatus:p.classId===8?'previous_separate_capture_retained':p.classId===7?'zephras_exact_structure_and_effects_match':'see_zephras_exact_diagnostic',
  issueId:issue?.id??null,affectedTalentIds:touched,hypotheticalStructure:adjusted?{ok:adjusted.ok,code:adjusted.code??null,releaseEligible:false}:null,
  legacyHypothesisStatus:hypothesis.status,verifiedLegacyRanks:p.status==='approved'?p.supportedLegacyRanks:[],
  explicitLevelConflicts,editorialReviewRequired:p.status!=='approved',liveReleaseChecked:false};
});
assert.equal(rows.length,84);
const hunter=rows.find(x=>x.id==='hunter-beast-mastery-leveling');
assert.equal(hunter.primaryStructuralStatus,'prerequisite');
assert.equal(hunter.primaryBlockPoint,21);
assert.equal(hunter.hypotheticalStructure.ok,true);
assert.ok(rows.filter(x=>x.classId===2).every(x=>!x.affectedTalentIds.includes(113631)));
assert.ok(rows.filter(x=>x.classId===11).every(x=>x.hypotheticalStructure.ok),'No existing path may overspend the confirmed Starfire cap');
assert.deepEqual(rows.filter(x=>x.editorialStatus==='approved').map(x=>JSON.stringify([x.id,x.version])).sort(),talentPlanLibrary.map(p=>JSON.stringify([p.id,p.version])).sort());
const summary={activePaths:rows.length,primaryValid:rows.filter(x=>x.primaryStructuralStatus==='valid').length,rawBlockedPaths:rows.filter(x=>x.primaryStructuralStatus!=='valid').map(x=>x.id),approvedPaths:rows.filter(x=>x.editorialStatus==='approved').length,
 crossBuildCleanClasses:ledger.classes.filter(x=>x.status==='structure_matches').length,issueExposure:ledger.issues.map(i=>({id:i.id,paths:rows.filter(x=>x.issueId===i.id).length,affectedPaths:rows.filter(x=>x.issueId===i.id&&x.affectedTalentIds.length).length})),
 explicitLevelConflicts:rows.flatMap(x=>x.explicitLevelConflicts.map(c=>({id:x.id,...c}))),legacyCalendarConfirmed:true,legacyEffectiveGatesVerified:false,liveReleaseChecked:false};
assert.deepEqual(summary.explicitLevelConflicts,[],'Explicit milestone in rationale must agree with the chronological rank-0 path');
console.log(JSON.stringify(process.argv.includes('--summary')?summary:{schemaVersion:1,kind:'talent_release_readiness_diagnostic',summary,rows},null,2));
