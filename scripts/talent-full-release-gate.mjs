import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {profileKey,resolveApprovedTalentPlan} from './talent-plan-core.mjs';
import {talentRevisionDigest} from './talent-catalog-proof.mjs';
import {talentPlanLibrary} from './talent-plan-index.mjs';
import {specializationOptionKey,specializationOptionSet} from '../talent-planner.js';

const folder=new URL('../data/talent-planning/',import.meta.url);
const read=f=>JSON.parse(readFileSync(new URL(f,folder),'utf8'));
const coverage=read('coverage-2026-11-25.json'),release=read('release-catalog.json');
const ledger=JSON.parse(readFileSync(new URL('../docs/talent-planner-zephras-review-2026-11-26.json',import.meta.url),'utf8'));
const effects=JSON.parse(readFileSync(new URL('../docs/talent-planner-effect-review-2026-11-26.json',import.meta.url),'utf8'));
const proofRecords=read('catalog-proofs-2026-11-25.json').catalogs.filter(c=>c.sourceRevision===ledger.primarySourceRevision);
const retained=Object.fromEntries(proofRecords.map(c=>[c.proof.classId,c.proof]));
const revisions=Object.fromEntries(proofRecords.map(c=>[c.proof.classId,c.catalogRevision]));
for(const c of proofRecords)assert.equal(talentRevisionDigest(c.proof),c.catalogRevision);
const all=readdirSync(folder).filter(f=>/-v\d+\.json$/.test(f)).map(read).filter(p=>p.status!=='retired'&&p.active!==false);
const approved=talentPlanLibrary.filter(p=>p.active!==false);
const pack=release.rulePacks.find(p=>p.clientBuild===ledger.build&&p.sourceRevision===ledger.primarySourceRevision);
assert.ok(pack,'retained current build tuple absent');
const at='2026-11-26T00:00:00.000Z',now=Date.parse(at);
const master={classes:retained,classMechanicsRevisions:revisions,sourceRevision:ledger.primarySourceRevision,checkedAt:at,sourceFreshAt:{raw:at,localized:at},stale:false};
const observation={status:'observed',clientBuild:ledger.build,hotfixRevision:pack.hotfixRevision,checkedAt:at,revisionSince:at};
const cells=[];
for(const [id,trees] of Object.entries(coverage.classes))for(const tree of trees)for(const role of tree.roles)for(const goal of coverage.goals){
 const classId=Number(id),treeId=tree.treeId;
 const relevant=all.filter(p=>p.profiles.some(x=>x.classId===classId&&x.treeId===treeId&&x.role===role&&x.goal===goal));
 const profiles=[...new Map(relevant.flatMap(p=>p.profiles.filter(x=>x.classId===classId&&x.treeId===treeId&&x.role===role&&x.goal===goal)).map(x=>[profileKey(x),x])).values()];
 assert.ok(profiles.length,'missing profile');
 const rankResults=Array.from({length:6},(_,rank)=>{
  const results=profiles.map(profile=>({profile,...resolveApprovedTalentPlan(profile,approved,master,release.rulePacks,{ruleObservation:observation,legacyTalentedRank:rank,now,revalidations:release.revalidations})}));
  const resolved=results.filter(x=>x.ok);
  for(const x of resolved)assert.equal(x.history.length,51);
  return {rank,eligible:resolved.length>0,allProfilesEligible:resolved.length===profiles.length,profileCount:profiles.length,eligibleProfiles:resolved.length,profileResults:results.map(x=>({profile:x.profile,ok:x.ok,planId:x.planId??null,version:x.version??null,code:x.code??null})),planIds:resolved.map(x=>x.planId),blockers:[...new Set(results.filter(x=>!x.ok).map(x=>x.code))]};
 });
 cells.push({classId,treeId,role,goal,rankResults});
}
assert.equal(cells.length,84);
const comparisonCells=[];
for(const [id,trees] of Object.entries(coverage.classes))for(const role of new Set(trees.flatMap(t=>t.roles)))for(const goal of coverage.goals){
 const classId=Number(id),expected=trees.filter(t=>t.roles.includes(role)).map(t=>t.treeId);
 if(expected.length<2)continue;
 const options=cells.filter(c=>c.classId===classId&&c.role===role&&c.goal===goal).flatMap(c=>c.rankResults[0].profileResults.filter(x=>x.ok).map(x=>({...x.profile,planId:x.planId,version:x.version})));
 const optionsByTree=new Set(options.map(x=>x.treeId));
 const matches=release.specializationAdvice.filter(entry=>entry.options.every(x=>x.classId===classId&&x.role===role&&x.goal===goal)&&specializationOptionSet(entry.options)===specializationOptionSet(options)&&options.some(x=>specializationOptionKey(x)===specializationOptionKey(entry.preferred??{}))&&typeof entry.reason==='string'&&entry.reason.trim()&&Array.isArray(entry.evidenceIds)&&entry.evidenceIds.length>0);
 const exact=matches.length===1;
 comparisonCells.push({classId,role,goal,expectedTrees:expected,approvedTrees:[...optionsByTree],exactComparison:Boolean(exact),complete:Boolean(exact)&&expected.every(t=>optionsByTree.has(t))});
}
assert.equal(comparisonCells.length,24);
const byRank=Array.from({length:6},(_,rank)=>({rank,eligible:cells.filter(c=>c.rankResults[rank].eligible).length,total:cells.length}));
const missing=byRank.reduce((s,x)=>s+x.total-x.eligible,0);
const detailedByRank=Array.from({length:6},(_,rank)=>({rank,total:cells.reduce((s,c)=>s+c.rankResults[rank].profileCount,0),eligible:cells.reduce((s,c)=>s+c.rankResults[rank].eligibleProfiles,0)}));
const detailedTotal=detailedByRank.reduce((s,x)=>s+x.total,0),detailedEligible=detailedByRank.reduce((s,x)=>s+x.eligible,0);
assert.ok(detailedTotal>=cells.length*6,'Detailed profile coverage cannot be smaller than coarse coverage');
assert.ok(detailedTotal-detailedEligible>=missing,'Detailed missing coverage cannot be smaller than coarse missing coverage');
const blockers={missingRankProfileCombinations:missing,missingDetailedRankProfileCombinations:detailedTotal-detailedEligible,incompleteComparisons:comparisonCells.filter(x=>!x.complete).length,unreconciledRawStructure:ledger.classes.filter(c=>c.structureDifferences.length>0).map(c=>c.classId),unconfirmedQuantitativeTexts:effects.rows.filter(x=>['incomplete_numeric','numeric_scale_or_rounding'].includes(x.classification)).length,liveObservationVerified:false,physicalDevicesVerified:false};
const summary={kind:'offline_full_release_gate',retainedBuild:ledger.build,activePaths:all.length,approvedPaths:approved.length,rankProfileCombinations:cells.length*6,eligibleRankProfileCombinations:byRank.reduce((s,x)=>s+x.eligible,0),byRank,detailedRankProfileCombinations:detailedTotal,eligibleDetailedRankProfileCombinations:detailedEligible,detailedByRank,comparativeDecisions:comparisonCells.length,completeComparativeDecisions:comparisonCells.filter(x=>x.complete).length,blockers,offlineCoverageComplete:missing===0&&detailedEligible===detailedTotal&&blockers.incompleteComparisons===0,productionReleaseAuthorized:false,note:'Retained source fixtures are deliberately not a live observation. This report never authorizes deployment.'};
console.log(JSON.stringify(process.argv.includes('--summary')?summary:{summary,cells,comparisonCells},null,2));
if(process.argv.includes('--require-complete')&&!summary.offlineCoverageComplete)process.exitCode=1;
