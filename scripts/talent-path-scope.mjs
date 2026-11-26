// Path-scoped evidence does not certify the entire class or relax the live source binding.
import {talentPlanEvidenceDigest} from './talent-catalog-proof.mjs';
const sorted=values=>[...new Set(values)].sort((a,b)=>a-b);
export function talentPathScope(plan,proof,ledger,cross,effects,{druidGenesisAllocationDigest}={}){
 const cls=ledger.classes.find(x=>x.classId===plan.classId),older=cross.classes.find(x=>x.classId===plan.classId);
 if(!cls||!older||proof.classId!==plan.classId||cls.primaryCount!==cls.secondaryCount||cls.primaryCount!==proof.trees.reduce((n,t)=>n+t.talents.length,0))throw Error('missing class comparison');
 const nodes=new Map(proof.trees.flatMap(t=>t.talents.map(n=>[n.id,n])));
 const excluded=sorted([...cls.structureDifferences.map(x=>x.id),...older.changes.map(x=>x.id),...older.unknownPrerequisites,...older.cyclicPrerequisites.flat(),...effects.rows.filter(x=>x.classId===plan.classId&&x.classification!=='editorial_format').map(x=>x.id),...(plan.classId===11&&!( /^druid-(balance|restoration)-(leveling|dungeons|pvp)$/.test(plan.id)&&druidGenesisAllocationDigest===talentPlanEvidenceDigest(plan))?[104924]:[])]);
 const used=new Set(),visiting=new Set();
 function visit(id){
  if(visiting.has(id))throw Error('cyclic path prerequisite');
  if(used.has(id))return;
  const n=nodes.get(id);
  if(!n||excluded.includes(id))throw Error('path touches unresolved source difference '+id);
  visiting.add(id);
  for(const p of n.prerequisites){
   if(p.conditionKnown!==true||!Number.isSafeInteger(p.rank)||p.rank<1||p.rank>(nodes.get(p.id)?.maxRank??0))throw Error('unknown path prerequisite '+id);
   visit(p.id);
  }
  visiting.delete(id);used.add(id);
 }
 for(const p of plan.points)visit(p.talentId);
 return {kind:'allocation_dependency_closure',allocationDigest:talentPlanEvidenceDigest(plan),talentIds:sorted(used),excludedConflictIds:excluded,olderComparisonCaptureSha256:older.captureSha256,olderBuild:older.build};
}
