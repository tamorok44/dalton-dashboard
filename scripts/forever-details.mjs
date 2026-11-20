function asArray(value){return Array.isArray(value)?value:[]}
function integer(value){const n=Number(value);return Number.isInteger(n)?n:null}

export function collectKnownRecipeRefs(snapshot={}){
  const byId=new Map();
  for(const endpoints of Object.values(snapshot.characters||{})){
    const data=endpoints?.professions?.ok?endpoints.professions.data:null;
    for(const profession of [...asArray(data?.primaries),...asArray(data?.secondaries)]){
      for(const tier of asArray(profession?.tiers)){
        for(const recipe of asArray(tier?.known_recipes)){
          const id=integer(recipe?.id);
          const href=recipe?.key?.href;
          if(id&&typeof href==='string'&&!byId.has(id))byId.set(id,{id,name:recipe?.name||null,href});
        }
      }
    }
  }
  return [...byId.values()];
}

export function collectLocalizedRefs(snapshot={}){
  const refs=new Map();
  const add=(type,id,href)=>{
    const numeric=integer(id);
    if(numeric&&typeof href==='string')refs.set(type+':'+numeric,{type,id:numeric,href});
  };
  for(const endpoints of Object.values(snapshot.characters||{})){
    const professionsData=endpoints?.professions?.ok?endpoints.professions.data:null;
    for(const profession of [...asArray(professionsData?.primaries),...asArray(professionsData?.secondaries)]){
      add('profession',profession?.profession?.id,profession?.profession?.key?.href);
    }
    const reputationsData=endpoints?.reputations?.ok?endpoints.reputations.data:null;
    for(const entry of asArray(reputationsData?.reputations)){
      add('faction',entry?.faction?.id,entry?.faction?.key?.href);
    }
    const questsData=endpoints?.quests?.ok?endpoints.quests.data:null;
    for(const entry of asArray(questsData?.in_progress)){
      add('quest',entry?.id,entry?.key?.href);
    }
  }
  return [...refs.values()];
}

function normalizedRecipe(recipe,detailsById){
  const id=integer(recipe?.id);
  const detail=id?detailsById?.[id]:null;
  return {
    id,
    name:detail?.name||recipe?.name||'Unbekannte Kenntnis',
    craftedItem:detail?.craftedItem||null,
    craftedQuantity:detail?.craftedQuantity||null,
    reagents:asArray(detail?.reagents)
  };
}

function professions(data,detailsById,localizedNames={}){
  const all=[...asArray(data?.primaries),...asArray(data?.secondaries)];
  return all.flatMap(entry=>{
    const professionId=integer(entry?.profession?.id); const base={id:professionId,name:localizedNames['profession:'+professionId]||entry?.profession?.name||'Beruf'};
    return asArray(entry?.tiers).map(tier=>({
      ...base,
      tierId:integer(tier?.tier?.id),
      tierName:tier?.tier?.name||null,
      current:Number.isFinite(Number(tier?.skill_points))?Number(tier.skill_points):null,
      max:Number.isFinite(Number(tier?.max_skill_points))?Number(tier.max_skill_points):null,
      knownRecipes:asArray(tier?.known_recipes).map(recipe=>normalizedRecipe(recipe,detailsById)),
      unverified:false
    }));
  });
}

function talentDetails(data){
  const groups=asArray(data?.specialization_groups);
  const selected=groups.some(group=>group?.is_active)?groups.filter(group=>group?.is_active):groups;
  return selected.flatMap(group=>asArray(group?.specializations).map(spec=>({
    id:integer(spec?.specialization?.id),
    name:spec?.specialization?.name||spec?.specialization_name||'Talente',
    spentPoints:Number.isFinite(Number(spec?.spent_points))?Number(spec.spent_points):0,
    talents:asArray(spec?.talents).map(entry=>({
      id:integer(entry?.talent?.id),
      name:entry?.talent?.name||entry?.spell_tooltip?.spell?.name||'Talent',
      rank:Number.isFinite(Number(entry?.talent_rank))?Number(entry.talent_rank):null,
      spellId:integer(entry?.spell_tooltip?.spell?.id),
      description:entry?.spell_tooltip?.description||null,
      castTime:entry?.spell_tooltip?.cast_time||null,
      powerCost:entry?.spell_tooltip?.power_cost||null
    }))
  })));
}

function reputationDetails(data,localizedNames={}){
  return asArray(data?.reputations).map(entry=>({
    id:integer(entry?.faction?.id),
    name:localizedNames['faction:'+integer(entry?.faction?.id)]||entry?.faction?.name||'Fraktion',
    standing:{
      raw:Number.isFinite(Number(entry?.standing?.raw))?Number(entry.standing.raw):null,
      value:Number.isFinite(Number(entry?.standing?.value))?Number(entry.standing.value):null,
      max:Number.isFinite(Number(entry?.standing?.max))?Number(entry.standing.max):null,
      tier:integer(entry?.standing?.tier),
      name:entry?.standing?.name||null
    }
  }));
}

function activeQuests(data,localizedNames={}){
  return asArray(data?.in_progress).map(entry=>({
    id:integer(entry?.id),
    name:localizedNames['quest:'+integer(entry?.id)]||entry?.name||'Quest'
  }));
}

export function enrichWithForeverDetails(data,snapshot,recipeDetailsById={},localizedNames={}){
  const bySlug=snapshot?.characters||{};
  return {
    ...data,
    characters:asArray(data?.characters).map(character=>{
      const endpoints=bySlug[character.slug]||{};
      let next={...character};

      if(endpoints.professions?.ok){
        next.professions=professions(endpoints.professions.data,recipeDetailsById,localizedNames);
        next.professionsVerified=true;
        next.professionDetailsVerified=true;
      }

      if(endpoints.specializations?.ok){
        const details=talentDetails(endpoints.specializations.data);
        next.talentDetails=details;
        next.talentsVerified=true;
        next.talentDetailsVerified=true;
        const spent=details.filter(tree=>tree.spentPoints>0);
        next.talents=spent.length
          ?spent.map(tree=>tree.name+': '+tree.spentPoints).join(' · ')
          :'noch keine verteilt';
      }

      if(endpoints.reputations?.ok){
        next.reputations=reputationDetails(endpoints.reputations.data,localizedNames);
        next.reputationsVerified=true;
      }

      if(endpoints.quests?.ok){
        next.activeQuests=activeQuests(endpoints.quests.data,localizedNames);
        next.questsVerified=true;
      }

      return next;
    })
  };
}
