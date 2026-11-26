import assert from 'node:assert/strict';
import {validateTalentPath,resolveApprovedTalentPlan,TALENT_POINT_CALENDAR_REVISION} from './talent-plan-core.mjs';
import {talentPlanEvidenceDigest,TALENT_RULE_BINDING_FIELDS} from './talent-catalog-proof.mjs';
// Synthetic data only: this is not a real class skill recommendation.
const revision='a'.repeat(64),profile={classId:8,treeId:1,goal:'leveling',role:'damage',playStyle:'mixed',priority:'balanced'};
const talents=Array.from({length:11},(_,row)=>({id:row+1,row,maxRank:row===10?1:5,requiredPoints:row*5,
  prerequisites:row===1?[{id:1,rank:5,conditionKnown:true}]:[]}));
const sourceRevision='e'.repeat(64);
const catalogTime=(checkedAt,localized=checkedAt)=>({checkedAt,sourceFreshAt:{raw:checkedAt,localized}});
const master={stale:false,sourceRevision,...catalogTime('2026-11-25T11:30:00Z'),classes:{8:{trees:[{id:1,talents}]}},classMechanicsRevisions:{8:revision}};
const rules={status:'verified',classId:8,catalogRevision:revision,revision:'fixture',clientBuild:'1.60.1.71037',hotfixRevision:'c'.repeat(64),sources:['fixture'],reviewedAt:'fixture',
  pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,legacyTalentedRank:0,gateMode:'earlier_rows',pointSpendMode:'immediate',sourceRevision,
  minimumLevelByTalent:Object.fromEntries(talents.map(t=>[t.id,10+5*t.row]))};
const plan={id:'fixture',version:1,classId:8,treeId:1,catalogRevision:revision,ruleRevision:'fixture',requiresRespec:false,
  points:talents.flatMap(t=>Array.from({length:t.maxRank},(_,i)=>({talentId:t.id,rank:i+1}))),
  status:'approved',profiles:[profile],supportedLegacyRanks:[0,1],review:{reviewedAt:'fixture',rationale:'fixture',evidenceIds:['fixture']}};
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
const banked=validateTalentPath(plan,master,{...rules,legacyTalentedRank:5,pointSpendMode:'bankable'});
assert.ok(banked.ok);
assert.deepEqual(banked.history.slice(0,6).map(p=>p.level),[10,10,10,10,10,15]);
assert.equal(banked.history.at(-1).level,60);
const delay={...calendarRules,pointSpendMode:'bankable',minimumLevelByTalent:{...calendarRules.minimumLevelByTalent,1:15}};
assert.deepEqual(validateTalentPath(plan,master,delay).history.slice(0,7).map(p=>p.level),[15,15,15,15,15,15,16]);

const now=Date.parse('2026-11-25T12:00:00Z');
const verification={status:'observed',clientBuild:rules.clientBuild,hotfixRevision:rules.hotfixRevision,
  checkedAt:'2026-11-25T11:00:00Z',revisionSince:'2026-11-25T11:00:00Z'};
const resolveWith=(observation,catalog=master)=>resolveApprovedTalentPlan(profile,[plan],catalog,[rules],{now,ruleObservation:observation,legacyTalentedRank:0});
assert.equal(resolveWith(verification).planId,'fixture');
assert.equal(resolveApprovedTalentPlan(profile,[plan],master,[rules]).code,'unverified_legacy_rank');
assert.equal(resolveApprovedTalentPlan(profile,[plan],master,[rules],{now,legacyTalentedRank:0}).code,'unverified_current_rules');
assert.equal(resolveApprovedTalentPlan(profile,[plan],master,[rules],{now,legacyTalentedRank:1,ruleObservation:verification}).code,'missing_or_ambiguous_rules');
assert.equal(resolveApprovedTalentPlan(profile,[{...plan,supportedLegacyRanks:[0]}],master,[rules],{now,legacyTalentedRank:1,ruleObservation:verification}).code,'unsupported_legacy_rank');
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
assert.equal(resolveWith(verification,{...master,...catalogTime('2026-11-25T10:30:00Z')}).code,'unverified_current_rules');
const earlierObservation={...verification,revisionSince:'2026-11-25T05:00:00Z'};
assert.equal(resolveWith(earlierObservation,{...master,...catalogTime('2026-11-25T06:00:00.001Z')}).planId,plan.id);
assert.equal(resolveWith(earlierObservation,{...master,...catalogTime('2026-11-25T06:00:00Z')}).code,'unverified_current_rules');
assert.equal(resolveWith(verification,{...master,...catalogTime('2026-11-25T11:30:00Z','2026-11-25T12:00:00.001Z')}).code,'unverified_current_rules');
const repeated={...verification,checkedAt:'2026-11-25T11:45:00Z'};
assert.equal(resolveWith(repeated).planId,plan.id);
assert.equal(resolveWith({...repeated,revisionSince:repeated.checkedAt}).code,'unverified_current_rules');
assert.equal(resolveWith(repeated,{...master,sourceRevision:'b'.repeat(64)}).code,'unverified_current_rules');
assert.equal(resolveWith(repeated,{...master,sourceFreshAt:undefined}).code,'unverified_current_rules');
assert.equal(resolveWith(repeated,{...master,checkedAt:'2026-11-25T11:35:00Z'}).code,'unverified_current_rules');
const expires=Date.parse('2026-11-25T11:00:00Z')+26*60*60*1000;
const freshButOldObservation={...master,...catalogTime(new Date(expires-1).toISOString())};
assert.equal(resolveApprovedTalentPlan(profile,[plan],freshButOldObservation,[rules],
  {now:expires,ruleObservation:verification,legacyTalentedRank:0}).code,'unverified_current_rules');
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
const pilotMaster={stale:false,classes:{8:{trees:fixtureTrees}},classMechanicsRevisions:{8:pilotRevision}};
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
assert.equal(resolveApprovedTalentPlan(pilot.profiles[0],[{...pilot,status:'research_only'}],pilotMaster,[pilotRules]).code,'no_approved_recommendation');
console.log('Mage Frost pilot: 51 allocations valid in observed-constraint fixture; synthetic research-only candidate cannot be released: OK');

// Research hypothesis for Hunter: all other gates can be audited without
// pretending that the cyclic provider edges have a verified operator.
const bmCandidate=JSON.parse(readFileSync(new URL('../data/talent-planning/hunter-beast-mastery-leveling-v1.json',import.meta.url),'utf8'));
const hunterRows=[
  [11372,[[104976,0,5],[104960,0,5],[104975,1,2],[104970,2,1],[104969,2,5],[104966,3,1],[104967,3,5],
    [104964,4,1,[[104970,1],[104961,1]]],[104963,4,2],[104962,5,5,[[104967,5]]],[104961,6,1,[[104964,1]]]]],
  [11371,[[105011,0,5],[105008,1,5],[105009,1,5],[105005,2,2],[105002,3,5,[[105008,5]]]]],
  [11370,[]]
];
const hunterTrees=hunterRows.map(([id,rows])=>({id,talents:rows.map(([id,row,maxRank,pre=[]])=>({
  id,row,maxRank,requiredPoints:row*5,prerequisites:pre.map(([id,rank])=>({id,rank,conditionKnown:true}))
}))}));
const hunterRevision='e'.repeat(64);
const hunterMaster={stale:false,classes:{3:{trees:hunterTrees}},classMechanicsRevisions:{3:hunterRevision}};
const hunterRules={...rules,classId:3,catalogRevision:hunterRevision,revision:'synthetic-hunter-hypothesis-only',
  legacyTalentedRank:0,pointSpendMode:'immediate',minimumLevelByTalent:Object.fromEntries(hunterTrees.flatMap(t=>t.talents.map(n=>[n.id,10+5*n.row])))};
const hunterPath={...bmCandidate,catalogRevision:hunterRevision,ruleRevision:hunterRules.revision};
const cyclic=validateTalentPath(hunterPath,hunterMaster,hunterRules);
assert.equal(cyclic.ok,false);
assert.equal(cyclic.code,'prerequisite');
assert.equal(cyclic.point,21);
const conditional=structuredClone(hunterMaster);
conditional.classes[3].trees[0].talents.find(n=>n.id===104964).prerequisites=[{id:104970,rank:1,conditionKnown:true}];
const checkedHunter=validateTalentPath(hunterPath,conditional,hunterRules);
assert.equal(checkedHunter.ok,true,JSON.stringify(checkedHunter));
assert.equal(checkedHunter.history.length,51);
assert.equal(checkedHunter.history.find(p=>p.talentId===104966).level,25);
assert.equal(checkedHunter.history.find(p=>p.talentId===104961).level,40);
assert.deepEqual([11372,11371,11370].map(id=>checkedHunter.history.filter(p=>p.treeId===id).length),[31,20,0]);
assert.equal(resolveApprovedTalentPlan(bmCandidate.profiles[0],[{...bmCandidate,status:'research_only'}],conditional,[hunterRules]).code,'no_approved_recommendation');
console.log('Hunter research: 51-point conditional path; real projected cycle remains blocked: OK');

// Synthetic transition: old plan identity and allocation stay exactly intact.
const tupleOf=value=>Object.fromEntries(TALENT_RULE_BINDING_FIELDS.map(key=>[key,value[key]]));
const nextTuple={...tupleOf(rules),clientBuild:'1.60.1.71139',hotfixRevision:'a'.repeat(64),sourceRevision:'b'.repeat(64)};
const transitionObservation={...verification,clientBuild:nextTuple.clientBuild,hotfixRevision:nextTuple.hotfixRevision};
const transitionMaster={...master,sourceRevision:nextTuple.sourceRevision};
const transition={status:'verified',planId:plan.id,planVersion:plan.version,allocationDigest:talentPlanEvidenceDigest(plan),ruleRevision:rules.revision,
  legacyTalentedRank:0,from:tupleOf(rules),to:nextTuple,reviewedAt:rules.reviewedAt,evidenceIds:['client','official','editorial'],
  scope:{completeHotfixReview:true,classAndSpellDependenciesUnchanged:true,pointCalendarAndGatesUnchanged:true,editorialRecommendationUnchanged:true}};
const resolveTransition=(revalidations,options={})=>resolveApprovedTalentPlan(profile,[plan],options.master??transitionMaster,[rules],
  {now,ruleObservation:options.observation??transitionObservation,legacyTalentedRank:0,revalidations});
assert.equal(resolveTransition([]).code,'unverified_current_rules');
assert.equal(resolveTransition([transition]).ok,true);
assert.equal(resolveTransition([transition]).version,plan.version);
assert.deepEqual(resolveTransition([transition]).history,resolveWith(verification).history);
for(const invalid of [{...transition,status:'pending'},{...transition,planVersion:2},{...transition,allocationDigest:'a'.repeat(64)},
  {...transition,legacyTalentedRank:1},{...transition,from:{...transition.from,sourceRevision:'f'.repeat(64)}},
  {...transition,scope:{...transition.scope,completeHotfixReview:false}},
  {...transition,to:{...nextTuple,catalogRevision:'d'.repeat(64)}},{...transition,evidenceIds:['client','official']}])assert.equal(resolveTransition([invalid]).code,'unverified_current_rules');
assert.equal(resolveTransition([transition,transition]).code,'unverified_current_rules');
assert.equal(resolveTransition([transition],{observation:{...transitionObservation,hotfixRevision:'f'.repeat(64)}}).code,'unverified_current_rules');
assert.equal(resolveTransition([transition],{master:{...transitionMaster,sourceRevision:'f'.repeat(64)}}).code,'unverified_current_rules');
assert.equal(resolveTransition([transition],{master:{...transitionMaster,stale:true}}).code,'unverified_current_catalog');
console.log('Reviewed exact transition preserves plan identity; unknown updates fail closed: OK');

// Marksmanship keeps its pet without touching the unresolved BM edge.
const marksman=JSON.parse(readFileSync(new URL('../data/talent-planning/hunter-marksmanship-leveling-v1.json',import.meta.url),'utf8'));
const marksmanRows=[
  [11372,[[104976,0,5],[104960,0,5],[104975,1,2],[104970,2,1],[104969,2,5],[104972,1,2],
    [104964,4,1,[[104970,1],[104961,1]]],[104961,6,1,[[104964,1]]]]],
  [11371,[[105011,0,5],[105008,1,5],[105005,2,2],[105009,1,5],[105004,3,1],[105002,3,5,[[105008,5]]],
    [104999,4,2,[[105005,2]]],[105000,4,1],[104998,5,5],[104997,6,1,[[105004,1]]]]],
  [11370,[]]
];
const marksmanTrees=marksmanRows.map(([id,rows])=>({id,talents:rows.map(([id,row,maxRank,pre=[]])=>({
  id,row,maxRank,requiredPoints:row*5,prerequisites:pre.map(([id,rank])=>({id,rank,conditionKnown:true}))
}))}));
const marksmanMaster={...hunterMaster,classes:{3:{trees:marksmanTrees}}};
const marksmanRules={...hunterRules,minimumLevelByTalent:Object.fromEntries(marksmanTrees.flatMap(t=>t.talents.map(n=>[n.id,10+5*n.row])))};
const mmChecked=validateTalentPath({...marksman,catalogRevision:hunterRevision,ruleRevision:marksmanRules.revision},marksmanMaster,marksmanRules);
assert.ok(mmChecked.ok,JSON.stringify(mmChecked));
assert.equal(mmChecked.history.length,51);
assert.equal(mmChecked.history.find(p=>p.talentId===105004).level,25);
assert.equal(mmChecked.history.find(p=>p.talentId===104999).level,30);
assert.equal(mmChecked.history.find(p=>p.talentId===104997).level,40);
assert.deepEqual([11372,11371,11370].map(id=>mmChecked.history.filter(p=>p.treeId===id).length),[20,31,0]);
assert.ok(!marksman.points.some(p=>[104964,104961,105007].includes(p.talentId)));
assert.equal(marksman.status,'approved');
assert.equal(resolveApprovedTalentPlan(marksman.profiles[0],[marksman],marksmanMaster,[marksmanRules]).code,'unverified_legacy_rank');
assert.equal(resolveApprovedTalentPlan(marksman.profiles[0],[marksman],marksmanMaster,[marksmanRules],{legacyTalentedRank:0}).ok,false,'synthetic proof cannot authorize the reviewed allocation');
assert.equal(resolveApprovedTalentPlan(marksman.profiles[0],[{...marksman,status:'research_only'}],marksmanMaster,[marksmanRules]).code,'no_approved_recommendation');
console.log('Marksmanship: 51-point fixture, retains pet, avoids disputed edge and denies unverified live rules: OK');
