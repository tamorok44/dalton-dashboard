import {validateTalentPath,TALENT_POINT_CALENDAR_REVISION} from './talent-plan-core.mjs';
import {talentRevisionDigest} from './talent-catalog-proof.mjs';

// Offline hypotheses only, never a verified server rule or release record.
export function compareLegacyHypotheses(plan,proof){
  const revision=talentRevisionDigest(proof);
  const master={classes:{[proof.classId]:proof},classMechanicsRevisions:{[proof.classId]:revision},stale:false};
  const fixed=Object.fromEntries(proof.trees.flatMap(t=>t.talents.map(n=>[n.id,n.requiredLevel])));
  const check=(rank,shift,mode)=>validateTalentPath({...plan,catalogRevision:revision,ruleRevision:'research-hypothesis'},master,{
    status:'verified',classId:plan.classId,catalogRevision:revision,revision:'research-hypothesis',
    sources:['synthetic comparison only'],reviewedAt:'2026-11-26',
    pointCalendarRevision:TALENT_POINT_CALENDAR_REVISION,legacyTalentedRank:rank,pointSpendMode:mode,
    gateMode:'earlier_rows',minimumLevelByTalent:Object.fromEntries(Object.entries(fixed).map(([id,level])=>[id,Math.max(1,level-shift)]))
  });
  const base=check(0,0,'immediate');
  if(!base.ok)return {planId:plan.id,version:plan.version,status:'baseline_blocked',blocker:base.code,point:base.point,releaseEligible:false,ranks:[]};
  const ranks=[];
  for(let rank=0;rank<=5;rank++){
    const shifted=check(rank,rank,'immediate'),banked=check(rank,0,'bankable'),fixedImmediate=check(rank,0,'immediate');
    const summarize=result=>result.ok?{ok:true,firstSpend:result.history[0].level,lastSpend:result.history.at(-1).level,history:result.history.map(({level,talentId,rank})=>({level,talentId,rank}))}:{ok:false,code:result.code,point:result.point};
    const s=summarize(shifted),b=summarize(banked);
    const differing=s.ok&&b.ok?s.history.flatMap((step,i)=>step.level===b.history[i].level?[]:[{point:i+1,talentId:step.talentId,rank:step.rank,shiftedLevel:step.level,fixedGateLevel:b.history[i].level}]):[];
    ranks.push({rank,firstPoint:10-rank,lastPoint:60-rank,shifted:s,fixedGateBanked:b,fixedGateImmediate:summarize(fixedImmediate),differing,
      status:rank===0?'baseline_only':'server_gate_unverified',releaseEligible:false});
  }
  return {planId:plan.id,version:plan.version,status:'hypotheses_only',catalogRevision:revision,releaseEligible:false,ranks};
}
