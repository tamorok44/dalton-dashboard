import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {validateTalentPath,TALENT_POINT_CALENDAR_REVISION} from './talent-plan-core.mjs';
import {talentRevisionDigest} from './talent-catalog-proof.mjs';
import {talentPlanLibrary} from './talent-plan-index.mjs';
const folder=new URL('../data/talent-planning/',import.meta.url);
const read=f=>JSON.parse(readFileSync(new URL(f,folder),'utf8'));
const ledger=JSON.parse(readFileSync(new URL('../docs/talent-planner-zephras-review-2026-11-26.json',import.meta.url),'utf8'));
const plans=readdirSync(folder).filter(f=>/-v\d+\.json$/.test(f)).map(read).filter(p=>p.status!=='retired'&&p.active!==false);
const baseline=read('catalog-proofs-2026-11-25.json').catalogs.filter(c=>c.sourceRevision===ledger.primarySourceRevision);
assert.equal(ledger.releaseEligible,false);assert.equal(ledger.build,'1.60.1.71139');assert.match(ledger.sourceSha256,/^[a-f0-9]{64}$/);
assert.equal(ledger.classes.length,9);assert.equal(baseline.length,9);
const corrected=new Map();
for(const c of baseline){
 const evidence=ledger.classes.find(x=>x.classId===c.proof.classId);
 assert.equal(evidence.catalogRevision,c.catalogRevision);
 assert.equal(talentRevisionDigest(c.proof),c.catalogRevision);
 const proof=structuredClone(c.proof),nodes=new Map(proof.trees.flatMap(t=>t.talents.map(n=>[n.id,n])));
 assert.equal(nodes.size,evidence.primaryCount);assert.equal(nodes.size,evidence.secondaryCount);
 if(proof.classId===3){
   const n=nodes.get(104964);
   assert.deepEqual(n.prerequisites.map(x=>[x.id,x.rank]),[[104961,1],[104970,1]]);
   assert.deepEqual(evidence.targets.find(t=>t.id===104964).arrows,[[104970,true]]);
   n.prerequisites=n.prerequisites.filter(x=>x.id===104970);
 }
 if(proof.classId===2){
   const n=nodes.get(113631);
   assert.deepEqual(n.prerequisites,[{id:105323,rank:1,conditionKnown:false}]);
   assert.deepEqual(evidence.targets.find(t=>t.id===113631).arrows,[[105323,true]]);
   assert.equal(nodes.get(105323).maxRank,1);
   n.prerequisites[0].conditionKnown=true;
 }
 if(proof.classId===11){
   const star=nodes.get(104933),dream=nodes.get(104936);
   assert.equal(star.maxRank,5);assert.equal(dream.spellId,16896);
   assert.equal(evidence.targets.find(t=>t.id===104933).maxRank,2);
   assert.equal(evidence.targets.find(t=>t.id===104936).spellId,408258);
   star.maxRank=2;star.rankSpellIds=star.rankSpellIds.slice(0,2);
   dream.spellId=408258;dream.rankSpellIds=null; // not exported per rank; this is not a release proof
 }
 corrected.set(proof.classId,proof);
}
function audit(p,proof,rank=0,bankable=false){
 const revision=talentRevisionDigest(proof),rule='zephras-diagnostic-only';
 return validateTalentPath({...p,catalogRevision:revision,ruleRevision:rule},{stale:false,classes:{[p.classId]:proof},classMechanicsRevisions:{[p.classId]:revision}},
  {status:'verified',classId:p.classId,catalogRevision:revision,revision:rule,sources:['diagnostic only'],reviewedAt:ledger.date,pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,legacyTalentedRank:rank,pointSpendMode:bankable?'bankable':'immediate',gateMode:'earlier_rows',minimumLevelByTalent:Object.fromEntries(proof.trees.flatMap(t=>t.talents.map(n=>[n.id,n.requiredLevel])))});
}
const rows=plans.map(p=>{
 const proof=corrected.get(p.classId),evidence=ledger.classes.find(c=>c.classId===p.classId);
 const used=new Set(p.points.map(x=>x.talentId)),raw=baseline.find(c=>c.proof.classId===p.classId).proof;
 const unchanged=audit(p,raw),after=audit(p,proof);
 const discrepancies=evidence.effectTextDifferenceIds.filter(id=>used.has(id));
 const structure=evidence.structureDifferences.filter(d=>used.has(d.id)).map(d=>d.id);
 assert.equal(after.ok,true,p.id+' exact corrected structure '+JSON.stringify(after));
 const fixedGateBanked=Array.from({length:6},(_,rank)=>{const a=audit(p,proof,rank,true);return {rank,ok:a.ok,lastLevel:a.history?.at(-1)?.level??null}});
 return {id:p.id,version:p.version,classId:p.classId,status:p.status,rawStructure:unchanged.ok?'valid':unchanged.code,
 correctedStructure:'valid',usedEffectDifferences:discrepancies,usedStructuralCorrections:structure,fixedGateBanked,releaseEligible:false};
});
assert.equal(rows.length,84);assert.equal(rows.filter(r=>r.rawStructure!=='valid').length,1);
assert.equal(rows.find(r=>r.id==='hunter-beast-mastery-leveling').correctedStructure,'valid');
assert.equal(rows.filter(r=>r.status==='approved').length,talentPlanLibrary.length);
assert.ok(rows.every(r=>!r.releaseEligible));
assert.deepEqual(ledger.talentedPerk.map(x=>[x.rank,x.firstPointLevel]).sort((a,b)=>a[0]-b[0]),[1,2,3,4,5].map(r=>[r,10-r]));
const summary={activePaths:rows.length,correctedStructureValid:rows.length,unchangedRawValid:rows.filter(r=>r.rawStructure==='valid').length,classes:ledger.classes.length,totalTalents:ledger.classes.reduce((s,c)=>s+c.primaryCount,0),effectTextDifferences:ledger.classes.reduce((s,c)=>s+c.effectTextDifferenceCount,0),pathsWithoutUsedTextDifferences:rows.filter(r=>!r.usedEffectDifferences.length).length,approvedPaths:talentPlanLibrary.length,legacyEffectiveGatesVerified:false,releaseEligible:false};
console.log(JSON.stringify(process.argv.includes('--summary')?summary:{summary,rows},null,2));
