import assert from 'node:assert/strict';
import {validateTalentPath,resolveApprovedTalentPlan,TALENT_POINT_CALENDAR_REVISION} from './talent-plan-core.mjs';
// Synthetic data only: this is not a real class skill recommendation.
const revision='a'.repeat(64),profile={classId:8,treeId:1,goal:'leveling',role:'damage',playStyle:'mixed',priority:'balanced'};
const talents=Array.from({length:11},(_,row)=>({id:row+1,row,maxRank:row===10?1:5,requiredPoints:row*5,
  prerequisites:row===1?[{id:1,rank:5,conditionKnown:true}]:[]}));
const master={stale:false,checkedAt:'2026-11-25T11:30:00Z',classes:{8:{trees:[{id:1,talents}]}},classRevisions:{8:revision}};
const rules={status:'verified',classId:8,catalogRevision:revision,revision:'fixture',clientBuild:'1.60.1.71037',hotfixRevision:'c'.repeat(64),sources:['fixture'],reviewedAt:'fixture',
  pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,legacyTalentedRank:0,gateMode:'earlier_rows',
  minimumLevelByTalent:Object.fromEntries(talents.map(t=>[t.id,10+5*t.row]))};
const plan={id:'fixture',version:1,classId:8,treeId:1,catalogRevision:revision,ruleRevision:'fixture',requiresRespec:false,
  points:talents.flatMap(t=>Array.from({length:t.maxRank},(_,i)=>({talentId:t.id,rank:i+1}))),
  status:'approved',profiles:[profile],review:{reviewedAt:'fixture',rationale:'fixture',evidenceIds:['fixture']}};
assert.equal(validateTalentPath(plan,master,rules).history.length,51);
// Synthetic minimum levels isolate the calendar from talent-specific gates.
const calendarRules={...rules,minimumLevelByTalent:Object.fromEntries(talents.map(t=>[t.id,5]))};
for(let rank=0;rank<=5;rank++){
  const result=validateTalentPath(plan,master,{...calendarRules,legacyTalentedRank:rank});
  assert.ok(result.ok);
  assert.deepEqual(result.history.map(p=>p.level),Array.from({length:51},(_,i)=>10-rank+i));
}
for(const rank of [undefined,-1,6,1.5,'2']){
  assert.equal(validateTalentPath(plan,master,{...rules,legacyTalentedRank:rank}).code,'unsupported_rules');
}
assert.equal(validateTalentPath(plan,master,{...rules,pointCalendarRevision:'unknown'}).code,'unsupported_rules');
assert.deepEqual(validateTalentPath(plan,master,{...rules,legacyTalentedRank:5}),{ok:false,code:'level_gate',point:1});

const now=Date.parse('2026-11-25T12:00:00Z');
const verification={status:'observed',clientBuild:rules.clientBuild,hotfixRevision:rules.hotfixRevision,
  checkedAt:'2026-11-25T11:00:00Z'};
const resolveWith=(observation,catalog=master)=>resolveApprovedTalentPlan(profile,[plan],catalog,[rules],{now,ruleObservation:observation,legacyTalentedRank:0});
assert.equal(resolveWith(verification).planId,'fixture');
assert.equal(resolveApprovedTalentPlan(profile,[plan],master,[rules]).code,'unverified_legacy_rank');
assert.equal(resolveApprovedTalentPlan(profile,[plan],master,[rules],{now,legacyTalentedRank:0}).code,'unverified_current_rules');
assert.equal(resolveApprovedTalentPlan(profile,[plan],master,[rules],{now,legacyTalentedRank:1,ruleObservation:verification}).code,'missing_or_ambiguous_rules');
const rankedRules={...calendarRules,legacyTalentedRank:1};
const ranked=resolveApprovedTalentPlan(profile,[plan],master,[rules,rankedRules],{now,legacyTalentedRank:1,ruleObservation:verification});
assert.equal(ranked.planId,plan.id);
assert.equal(ranked.history[0].level,9);

for(const changed of [
  {clientBuild:'1.60.1.71091'},
  {hotfixRevision:'d'.repeat(64)},
  {checkedAt:'2026-11-24T10:00:00Z'},
  {checkedAt:'2026-11-25T12:00:01Z'},
  {status:'source_unavailable'}
])assert.equal(resolveWith({...verification,...changed}).code,'unverified_current_rules');
assert.equal(resolveWith(verification,{...master,checkedAt:'2026-11-25T10:30:00Z'}).code,'unverified_current_rules');
assert.equal(resolveApprovedTalentPlan(profile,[plan,{...plan,version:2}],master,[rules]).code,'ambiguous_recommendation');
assert.equal(resolveApprovedTalentPlan({...profile,playStyle:'solo'},[plan],master,[rules]).code,'no_approved_recommendation');
assert.equal(resolveApprovedTalentPlan(profile,[{...plan,status:'research_only'}],master,[rules]).code,'no_approved_recommendation');
assert.equal(resolveApprovedTalentPlan(profile,[{...plan,review:null}],master,[rules]).code,'missing_editorial_review');
assert.equal(validateTalentPath({...plan,requiresRespec:true},master,rules).code,'respec_not_supported');
assert.equal(validateTalentPath({...plan,points:plan.points.slice(0,50)},master,rules).code,'incomplete_path');
assert.equal(validateTalentPath(plan,{...master,stale:true},rules).code,'unverified_current_catalog');
assert.equal(validateTalentPath(plan,master,{...rules,status:'pending'}).code,'unverified_rules');
const bad=structuredClone(plan);bad.points[1].rank=3;
assert.equal(validateTalentPath(bad,master,rules).code,'invalid_rank');
const tooEarly=structuredClone(plan);[tooEarly.points[4],tooEarly.points[5]]=[tooEarly.points[5],tooEarly.points[4]];
assert.equal(validateTalentPath(tooEarly,master,rules).code,'level_gate');
assert.equal(validateTalentPath(tooEarly,master,{...rules,minimumLevelByTalent:{...rules.minimumLevelByTalent,2:10}}).code,'tree_gate');
const unclear=structuredClone(master);unclear.classes[8].trees[0].talents[1].prerequisites[0].conditionKnown=false;
assert.equal(validateTalentPath(plan,unclear,rules).code,'unverified_prerequisite');
console.log('Talent planner: every allocation, unique recommendation and fail-closed rules: OK');

 
// Pilot candidate: selected numeric constraints observed from the current
// displayed German class master on 25 Nov 2026. Test fixture only, not a
// separate runtime master, verified server layout, or approved rule pack.
const {readFileSync}=await import('node:fs');
const pilot=JSON.parse(readFileSync(new URL('../data/talent-planning/mage-frost-mixed-v1.json',import.meta.url),'utf8'));
const pilotRevision='b'.repeat(64);
const fixtureTrees=[
  {id:11582,rows:[
    [105813,0,5],[105810,1,5],[105809,1,2],[105812,1,2],[105808,2,2],[105803,3,3,[[105810,5]]]
  ]},
  {id:11594,rows:[]},
  {id:11601,rows:[
    [105779,0,5],[105778,0,3],[105774,1,3],[105767,2,1],[105777,1,5],
    [105768,3,3],[105769,3,1],[105764,4,2,[[105767,1]]],
    [105766,4,1],[105772,2,3],[105770,3,2],[105771,2,3],[105765,4,3],[105762,6,1,[[105766,1]]]
  ]}
].map(({id,rows})=>({id,talents:rows.map(([id,row,maxRank,pre=[]])=>({
  id,row,maxRank,requiredPoints:row*5,prerequisites:pre.map(([id,rank])=>({id,rank,conditionKnown:true}))
}))}));
const pilotMaster={stale:false,classes:{8:{trees:fixtureTrees}},classRevisions:{8:pilotRevision}};
const pilotRules={...rules,catalogRevision:pilotRevision,revision:'synthetic-standard-schedule-only',
  minimumLevelByTalent:Object.fromEntries(fixtureTrees.flatMap(t=>t.talents.map(n=>[n.id,10+5*n.row])))};
const structuralOnly=validateTalentPath({...pilot,catalogRevision:pilotRevision,ruleRevision:pilotRules.revision},pilotMaster,pilotRules);
assert.equal(structuralOnly.ok,true,JSON.stringify(structuralOnly));
assert.equal(structuralOnly.history.length,51);
assert.equal(structuralOnly.history.find(s=>s.talentId===105767).level,20);
assert.equal(structuralOnly.history.find(s=>s.talentId===105764).level,30);
assert.equal(structuralOnly.history.find(s=>s.talentId===105762).level,40);
const distribution=Object.fromEntries(fixtureTrees.map(t=>[t.id,structuralOnly.history.filter(s=>s.treeId===t.id).length]));
assert.deepEqual(distribution,pilot.expectedDistribution);
assert.equal(resolveApprovedTalentPlan(pilot.profiles[0],[pilot],pilotMaster,[pilotRules]).code,'no_approved_recommendation');
console.log('Mage Frost pilot: 51 allocations valid in observed-constraint fixture; research candidate cannot be released: OK');
