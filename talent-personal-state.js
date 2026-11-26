// Armory reports the allocated trees, not necessarily all three trees.
// The verified summary is a consistency check on the same official snapshot,
// not an independent observation of the character in game.
export function resolvePersonalTalentState(c,klass){
  const unknown=()=>({verified:false,ranks:new Map(),points:new Map()});
  const trees=klass?.trees,details=c?.talentDetails;
  if(c?.talentDetailsVerified!==true||!Array.isArray(trees)||!trees.length||
    !Array.isArray(details)||!details.length||details.length>trees.length)return unknown();
  const sparse=details.length<trees.length;
  const needsSummary=sparse||klass.personalMappingUnverified===true;
  if(needsSummary){
    if(c.talentsVerified!==true||typeof c.talents!=='string'||
      details.some(t=>!t||typeof t.name!=='string'||!Number.isSafeInteger(t.spentPoints)||t.spentPoints<0))return unknown();
    const reported=details.filter(t=>t.spentPoints>0);
    // Empty/zero-only shortened records are not sufficient evidence.
    if(!reported.length||c.talents!==reported.map(t=>t.name+': '+t.spentPoints).join(' · '))return unknown();
  }
  const excluded=new Set(klass.personalMappingUnverifiedTalentIds??[]);
  if(klass.personalMappingUnverified===true&&(!excluded.size||!Array.isArray(klass.personalMappingUnverifiedTalentIds)))return unknown();
  const ranks=new Map(),points=new Map(),lookup=new Map();
  for(const tree of trees){
    if(!Array.isArray(tree.talents))return unknown();
    for(const node of tree.talents){
      if(excluded.has(node.id)||!Number.isSafeInteger(node.profileId)||node.profileId<1)continue;
      if(lookup.has(node.profileId))return unknown();
      lookup.set(node.profileId,{node,tree});
    }
  }
  for(const detail of details){
    if(!detail||typeof detail.name!=='string')return unknown();
    const candidates=trees.filter(t=>t.name===detail.name||t.sourceName===detail.name);
    if(candidates.length!==1||!Number.isSafeInteger(detail.spentPoints)||detail.spentPoints<0||
       !Array.isArray(detail.talents))return unknown();
    const actual=candidates[0];
    let total=0;
    for(const entry of detail.talents){
      const match=lookup.get(Number(entry?.id)),rank=Number(entry?.rank),spell=Number(entry?.spellId);
      if(!match||match.tree.id!==actual.id||!Number.isSafeInteger(rank)||rank<1||rank>match.node.maxRank||
        ranks.has(match.node.id)||(needsSummary&&(!Number.isSafeInteger(spell)||spell<1))||
        (entry?.spellId&&(!Array.isArray(match.node.rankSpellIds)||!match.node.rankSpellIds.includes(spell))))return unknown();
      ranks.set(match.node.id,rank);total+=rank;
    }
    if(total!==detail.spentPoints||points.has(actual.id))return unknown();
    points.set(actual.id,total);
  }
  if([...points.values()].reduce((sum,n)=>sum+n,0)>51)return unknown();
  for(const tree of trees)if(!points.has(tree.id))points.set(tree.id,0);
  return {verified:true,ranks,points,coverage:sparse?'verified_reported_trees':'complete_reported_trees'};
}
