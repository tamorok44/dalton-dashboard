import assert from 'node:assert/strict';
import {validateTalentPath,resolveApprovedTalentPlan} from './talent-plan-core.mjs';
// Synthetic data only: this is not a real class skill recommendation.
const revision='a'.repeat(64),profile={classId:8,treeId:1,goal:'leveling',role:'damage',playStyle:'mixed',priority:'balanced'};
const talents=Array.from({length:11},(_,row)=>({id:row+1,row,maxRank:row===10?1:5,requiredPoints:row*5,
  prerequisites:row===1?[{id:1,rank:5,conditionKnown:true}]:[]}));
const master={stale:false,classes:{8:{trees:[{id:1,talents}]}},classRevisions:{8:revision}};
const rules={status:'verified',classId:8,catalogRevision:revision,revision:'fixture',sources:['fixture'],reviewedAt:'fixture',
  maxPoints:51,pointLevels:Array.from({length:51},(_,i)=>10+i),gateMode:'earlier_rows',
  minimumLevelByTalent:Object.fromEntries(talents.map(t=>[t.id,10+5*t.row]))};
const plan={id:'fixture',version:1,classId:8,treeId:1,catalogRevision:revision,ruleRevision:'fixture',requiresRespec:false,
  points:talents.flatMap(t=>Array.from({length:t.maxRank},(_,i)=>({talentId:t.id,rank:i+1}))),
  status:'approved',profiles:[profile],review:{reviewedAt:'fixture',rationale:'fixture',evidenceIds:['fixture']}};
assert.equal(validateTalentPath(plan,master,rules).history.length,51);
assert.equal(resolveApprovedTalentPlan(profile,[plan],master,[rules]).planId,'fixture');
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
