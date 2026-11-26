import {LEGACY_GATE_POLICY} from './talent-legacy-policy.mjs';
import {compatibleTalentRevalidation} from './talent-plan-core.mjs';
import {talentPlanEvidenceDigest,TALENT_RULE_BINDING_FIELDS} from './talent-catalog-proof.mjs';
const tupleMatch=(a,b)=>['clientBuild','hotfixRevision','sourceRevision'].every(k=>a?.[k]===b[k]);
const legacySources=["https://worldofwarcraft.blizzard.com/en-us/news/24307383/scopri-il-legacy-system-di-world-of-warcraft-forever","https://www.wowhead.com/forever/spell%3D1225474/talented","https://www.wowhead.com/forever/de/talent-calc","https://wowforeverplaybook.com/wow-forever-talents","https://kluntjewalker.de/werkzeuge/wow-forever-talentrechner/","https://foreverwow.com/guides/wow-forever-talent-planning/"];
// Derivation is from a reviewed rank-zero path, not a blanket grant to research plans.
// No provider calls; exact source/revalidation required and live checks remain mandatory.
export function deriveLegacyRelease(library,catalog){
 const rulePacks=[...catalog.rulePacks],plans=[];
 for(const plan of library){
  const baseline=catalog.rulePacks.filter(p=>p.classId===plan.classId&&p.revision===plan.ruleRevision&&p.legacyTalentedRank===0);
  if(plan.status!=='approved'||plan.active===false||baseline.length!==1||!plan.supportedLegacyRanks?.includes(0)){plans.push(plan);continue;}
  const pack=baseline[0];
  const evidence=pack.sources.map(id=>catalog.evidence.find(e=>e.id===id));
  if(pack.status!=='verified'||pack.catalogRevision!==plan.catalogRevision||pack.pointSpendMode!=='immediate'||pack.gateMode!=='earlier_rows'||evidence.some(e=>!e)||!plan.points.every(p=>Number.isSafeInteger(pack.minimumLevelByTalent[p.talentId])&&pack.minimumLevelByTalent[p.talentId]>=10&&(pack.minimumLevelByTalent[p.talentId]-10)%5===0)){plans.push(plan);continue;}
  let exact=pack;
  if(!tupleMatch(pack,LEGACY_GATE_POLICY)){
   const reviewed=(catalog.revalidations??[]).filter(e=>compatibleTalentRevalidation(e,plan,pack)&&tupleMatch(e.to,LEGACY_GATE_POLICY));
   if(reviewed.length!==1){plans.push(plan);continue;}
   exact={...pack,...Object.fromEntries(TALENT_RULE_BINDING_FIELDS.map(k=>[k,reviewed[0].to[k]])),sources:reviewed[0].evidenceIds};
  }
  if(exact.catalogRevision!==plan.catalogRevision){plans.push(plan);continue;}
  if(rulePacks.some(r=>r.classId===plan.classId&&r.revision===plan.ruleRevision&&r.legacyTalentedRank!==0)){plans.push(plan);continue;}
  for(let rank=1;rank<=5;rank++)rulePacks.push({...exact,legacyTalentedRank:rank,legacyGatePolicy:LEGACY_GATE_POLICY.revision,legacyAllocationDigest:talentPlanEvidenceDigest(plan),minimumLevelByTalent:Object.fromEntries(Object.entries(exact.minimumLevelByTalent).map(([id,level])=>[id,level-rank])),sources:[...exact.sources,...legacySources],reviewedAt:'2026-11-26'});
  plans.push({...plan,supportedLegacyRanks:[0,1,2,3,4,5]});
 }
 return {library:plans,catalog:{...catalog,rulePacks}};
}
