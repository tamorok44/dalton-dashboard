import {currentTalentRulesMatch} from './talent-rule-watch.mjs';

// Pure planning rules. No provider requests, no roster dependency, no runtime AI.
const positive=v=>Number.isSafeInteger(v)&&v>0;
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const array=v=>Array.isArray(v)?v:[];
export const TALENT_POINT_CALENDAR_REVISION='forever-talented-v1';
export const TALENT_PROFILE_FIELDS=Object.freeze(['classId','treeId','goal','role','playStyle','priority']);
export function profileKey(profile){
  if(!profile||!positive(profile.classId)||!positive(profile.treeId))return null;
  if(!TALENT_PROFILE_FIELDS.slice(2).every(k=>nonempty(profile[k])))return null;
  return JSON.stringify(TALENT_PROFILE_FIELDS.map(k=>profile[k]));
}
function reject(code,point=null){return {ok:false,code,point}}
// A reviewed rule pack must explicitly bind to a class layout revision and
// select the verified point calendar and provide the effective minimum-level
// rule for each talent. No assumed Legacy shift or silent Classic fallback.
export function validateTalentPath(plan,master,rules){
  if(!plan||!positive(plan.classId)||!nonempty(plan.id)||!positive(plan.version))return reject('invalid_plan_identity');
  const c=master?.classes?.[plan.classId],revision=master?.classRevisions?.[plan.classId];
  if(!c||!hash(revision)||plan.catalogRevision!==revision||master.stale!==false)return reject('unverified_current_catalog');
  if(!rules||rules.status!=='verified'||rules.classId!==plan.classId||rules.catalogRevision!==revision||
    !nonempty(rules.revision)||plan.ruleRevision!==rules.revision||!array(rules.sources).length||
    !rules.sources.every(nonempty)||!nonempty(rules.reviewedAt))return reject('unverified_rules');
  const talentedRank=rules.legacyTalentedRank;
  if(rules.pointCalendarRevision!==TALENT_POINT_CALENDAR_REVISION||
    !Number.isInteger(talentedRank)||talentedRank<0||talentedRank>5||
    rules.gateMode!=='earlier_rows'||!rules.minimumLevelByTalent||typeof rules.minimumLevelByTalent!=='object')return reject('unsupported_rules');
  const maxPoints=51;
  const firstPointLevel=10-talentedRank;
  if(plan.requiresRespec!==false)return reject('respec_not_supported');
  if(!Array.isArray(plan.points)||plan.points.length!==maxPoints)return reject('incomplete_path');
  if(!c.trees.some(t=>t.id===plan.treeId))return reject('unknown_specialization');
  const byId=new Map(),ranks=new Map(),history=[];
  for(const tree of c.trees)for(const t of tree.talents){
    if(byId.has(t.id))return reject('ambiguous_talent_id');
    byId.set(t.id,{...t,treeId:tree.id});
  }
  for(const [index,step] of plan.points.entries()){
    const point=index+1,level=firstPointLevel+index,t=byId.get(step?.talentId);
    if(!t)return reject('unknown_talent',point);
    const rank=(ranks.get(t.id)||0)+1;
    if(step.rank!==rank||rank>t.maxRank)return reject('invalid_rank',point);
    const minLevel=rules.minimumLevelByTalent[t.id];
    if(!positive(minLevel)||minLevel>60)return reject('unverified_level_gate',point);
    if(level<minLevel)return reject('level_gate',point);
    if(!Number.isSafeInteger(t.requiredPoints)||t.requiredPoints<0)return reject('unverified_tree_gate',point);
    const priorPoints=[...ranks.entries()].reduce((sum,[id,n])=>{
      const prior=byId.get(id);
      return sum+(prior.treeId===t.treeId&&prior.row<t.row?n:0);
    },0);
    if(priorPoints<t.requiredPoints)return reject('tree_gate',point);
    if(!Array.isArray(t.prerequisites))return reject('unverified_prerequisite',point);
    for(const pre of t.prerequisites){
      if(pre.conditionKnown!==true||!byId.has(pre.id)||!positive(pre.rank))return reject('unverified_prerequisite',point);
      if((ranks.get(pre.id)||0)<pre.rank)return reject('prerequisite',point);
    }
    ranks.set(t.id,rank);
    history.push({point,level,talentId:t.id,rank,treeId:t.treeId});
  }
  return {ok:true,history,finalRanks:Object.fromEntries(ranks)};
}
export function resolveApprovedTalentPlan(profile,plans,master,rulePacks,{ruleObservation,legacyTalentedRank,now=Date.now()}={}){
  const key=profileKey(profile);
  if(!key)return reject('invalid_profile');
  const candidates=array(plans).filter(p=>p?.status==='approved'&&p.classId===profile.classId&&p.treeId===profile.treeId&&
    array(p.profiles).some(x=>profileKey(x)===key));
  if(candidates.length!==1)return reject(candidates.length?'ambiguous_recommendation':'no_approved_recommendation');
  const plan=candidates[0];
  if(!nonempty(plan.review?.reviewedAt)||!nonempty(plan.review?.rationale)||
    !array(plan.review?.evidenceIds).length||!plan.review.evidenceIds.every(nonempty))return reject('missing_editorial_review');
  if(!Number.isInteger(legacyTalentedRank)||legacyTalentedRank<0||legacyTalentedRank>5)return reject('unverified_legacy_rank');
  const rules=array(rulePacks).filter(r=>r?.revision===plan.ruleRevision&&r.classId===plan.classId&&
    r.legacyTalentedRank===legacyTalentedRank);
  if(rules.length!==1)return reject('missing_or_ambiguous_rules');
  const check=validateTalentPath(plan,master,rules[0]);
  if(!check.ok)return check;
  // Cache freshness only attests to an acquisition. Release additionally
  // requires independent, current evidence from a verified rules check.
  if(!currentTalentRulesMatch(ruleObservation,rules[0],master,now))return reject('unverified_current_rules');
  return {ok:true,planId:plan.id,version:plan.version,history:check.history};
}
