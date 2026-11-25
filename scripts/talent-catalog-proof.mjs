import {createHash} from 'node:crypto';

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  }
  return value;
}

export function talentRevisionDigest(value){
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function talentSourcePairDigest(rawDigest,localizedDigest){
  return createHash('sha256').update(rawDigest+localizedDigest).digest('hex');
}

// This projection is shared by live normalization and the offline release
// check. Translations, art and display order do not decide a skill path.
export function buildTalentCatalogProof(klass,raw){
  const rawById=new Map(raw.trees.flatMap(tree=>tree.talents.map(node=>[node.id,node])));
  const trees=klass.trees.map(tree=>({
    id:tree.id,
    talents:tree.talents.map(node=>{
      const source=rawById.get(node.id);
      return {
        id:node.id,row:node.row,maxRank:node.maxRank,requiredLevel:node.requiredLevel,
        requiredPoints:node.requiredPoints,spellId:node.spellId,rankSpellIds:node.rankSpellIds,
        prerequisites:node.prerequisites.map(({id,rank,conditionKnown})=>({id,rank,conditionKnown}))
          .sort((a,b)=>a.id-b.id||a.rank-b.rank||Number(a.conditionKnown)-Number(b.conditionKnown)),
        effectRevision:talentRevisionDigest([source?.d??null,source?.gate??null,source?.pre??null])
      };
    }).sort((a,b)=>a.id-b.id)
  })).sort((a,b)=>a.id-b.id);
  return {classId:klass.classId,trees};
}

export function talentStructureDigest(proof){
  const trees=proof.trees.map(tree=>tree.talents.map(node=>({
    id:node.id,row:node.row,maxRank:node.maxRank,requiredPoints:node.requiredPoints,
    prerequisites:node.prerequisites.map(({id,rank})=>[id,rank]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])
  })).sort((a,b)=>a.id-b.id)).sort((a,b)=>a[0].id-b[0].id);
  return talentRevisionDigest(trees);
}

export const TALENT_RULE_BINDING_FIELDS=Object.freeze([
  'classId','clientBuild','hotfixRevision','catalogRevision','sourceRevision'
]);
export function talentRuleEvidenceDigest(pack){
  return talentRevisionDigest({
    ...Object.fromEntries(TALENT_RULE_BINDING_FIELDS.map(field=>[field,pack[field]])),
    legacyTalentedRank:pack.legacyTalentedRank,pointCalendarRevision:pack.pointCalendarRevision,
    pointSpendMode:pack.pointSpendMode,gateMode:pack.gateMode,minimumLevelByTalent:pack.minimumLevelByTalent
  });
}

export function talentPlanEvidenceDigest(plan){
  return talentRevisionDigest({
    id:plan.id,version:plan.version,classId:plan.classId,treeId:plan.treeId,
    profiles:plan.profiles,points:plan.points,requiresRespec:plan.requiresRespec
  });
}
