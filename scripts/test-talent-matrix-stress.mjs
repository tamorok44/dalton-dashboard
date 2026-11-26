import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {validateTalentPath,resolveApprovedTalentPlan,TALENT_POINT_CALENDAR_REVISION} from './talent-plan-core.mjs';
import {compareLegacyHypotheses} from './talent-legacy-research.mjs';
import {talentPlanLibrary} from './talent-plan-index.mjs';
import {talentRevisionDigest} from './talent-catalog-proof.mjs';
const folder=new URL('../data/talent-planning/',import.meta.url);
const read=f=>JSON.parse(readFileSync(new URL(f,folder),'utf8'));
const plans=readdirSync(folder).filter(f=>/-v\d+\.json$/.test(f)).map(read).filter(p=>p.status!=='retired'&&p.active!==false);
const catalogs=read('catalog-proofs-2026-11-25.json').catalogs;
const source='9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b';
const current=new Map(catalogs.filter(c=>c.sourceRevision===source).map(c=>[c.proof.classId,c]));
const coverage=read('coverage-2026-11-25.json');
const cells=Object.entries(coverage.classes).flatMap(([classId,trees])=>trees.flatMap(t=>t.roles.flatMap(role=>coverage.goals.map(goal=>[Number(classId),t.treeId,role,goal]))));
assert.equal(current.size,Object.keys(coverage.classes).length);
const keys=new Set(plans.flatMap(p=>p.profiles.map(x=>JSON.stringify([x.classId,x.treeId,x.role,x.goal]))));
for(const cell of cells)assert.ok(keys.has(JSON.stringify(cell)),'Missing complete profile '+JSON.stringify(cell));
const releaseIds=new Set(talentPlanLibrary.map(p=>JSON.stringify([p.id,p.version])));
assert.deepEqual([...releaseIds].sort(),plans.filter(p=>p.status==='approved').map(p=>JSON.stringify([p.id,p.version])).sort());
let validated=0,mutations=0,legacy=0,rankChecks=0;
const blocked=[];
for(const plan of plans){
 const label=plan.id+' v'+plan.version;
 const record=current.get(plan.classId);assert.ok(record,label+' missing current primary class');
 const {proof,catalogRevision:revision}=record;
 assert.equal(talentRevisionDigest(proof),revision);
 const master={classes:{[plan.classId]:proof},classMechanicsRevisions:{[plan.classId]:revision},stale:false};
 const rules={status:'verified',classId:plan.classId,catalogRevision:revision,revision:'offline-stress',
   sources:['retained primary structure; test only'],reviewedAt:'2026-11-26',pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,
   legacyTalentedRank:0,pointSpendMode:'immediate',gateMode:'earlier_rows',minimumLevelByTalent:Object.fromEntries(proof.trees.flatMap(t=>t.talents.map(n=>[n.id,n.requiredLevel])))};
 const candidate={...plan,catalogRevision:revision,ruleRevision:rules.revision};
 assert.equal(plan.points.length,51,label);
 for(const profile of plan.profiles)if(plan.status==='research_only'){
   for(let rank=0;rank<=5;rank++){
     assert.equal(resolveApprovedTalentPlan(profile,[plan],master,[rules],{legacyTalentedRank:rank}).code,'no_approved_recommendation',label+' research leak');
     rankChecks++;
   }
 }
 const result=validateTalentPath(candidate,master,rules);
 const hypotheses=compareLegacyHypotheses(plan,proof);
 assert.equal(hypotheses.releaseEligible,false,label);
 if(!result.ok){
   assert.notEqual(plan.status,'approved',label+' approved path fails current retained structure');
   assert.equal(hypotheses.status,'baseline_blocked',label);
   blocked.push({id:plan.id,version:plan.version,code:result.code,point:result.point});
   continue;
 }
 validated++;
 assert.equal(result.history.length,51,label);
 assert.deepEqual(result.history.map(s=>s.level),Array.from({length:51},(_,i)=>i+10),label);
 assert.deepEqual(Object.fromEntries(proof.trees.map(t=>[t.id,result.history.filter(s=>s.treeId===t.id).length])),plan.expectedDistribution,label);
 const reject=(changed,code,m=master,r=rules)=>{assert.equal(validateTalentPath(changed,m,r).code,code,label+' mutation '+code);mutations++};
 reject({...candidate,points:plan.points.slice(0,-1)},'incomplete_path');
 reject({...candidate,points:[{...plan.points[0],rank:2},...plan.points.slice(1)]},'invalid_rank');
 reject({...candidate,points:[{talentId:Number.MAX_SAFE_INTEGER,rank:1},...plan.points.slice(1)]},'unknown_talent');
 reject({...candidate,requiresRespec:true},'respec_not_supported');
 reject(candidate,'unverified_current_catalog',{...master,stale:true});
 reject(candidate,'unverified_level_gate',master,{...rules,minimumLevelByTalent:{}});
 reject(candidate,'unsupported_rules',master,{...rules,legacyTalentedRank:6});
 assert.equal(hypotheses.status,'hypotheses_only',label);
 assert.deepEqual(hypotheses.ranks.map(x=>x.rank),[0,1,2,3,4,5],label);
 for(const row of hypotheses.ranks){
   assert.equal(row.releaseEligible,false,label);legacy++;
   for(const model of [row.shifted,row.fixedGateBanked,row.fixedGateImmediate]){
     if(!model.ok){assert.ok(typeof model.code==='string',label);continue}
     assert.equal(model.history.length,51,label);
     assert.ok(model.history.every((x,i)=>x.level>=10-row.rank+i&&x.level<=60&&(i===0||x.level>=model.history[i-1].level)),label+' invalid hypothetical calendar');
     assert.deepEqual(model.history.map(({talentId,rank})=>({talentId,rank})),plan.points,label+' hypothetical allocation changed');
   }
 }
}
assert.equal(validated+blocked.length,plans.length);
// Any newly failing path is a regression; clearing this known blocker requires explicit review.
assert.deepEqual(blocked,[{id:'hunter-beast-mastery-leveling',version:1,code:'prerequisite',point:21}],'Unexpected change to the current structural blocker set');
console.log(JSON.stringify({kind:'offline_talent_matrix_stress',coverageCells:cells.length,activePlans:plans.length,validated,blocked,mutations,legacyHypotheses:legacy,researchReleaseGuards:rankChecks,releaseIndex:releaseIds.size,liveReleaseChecked:false},null,2));
