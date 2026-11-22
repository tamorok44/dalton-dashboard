import {professionSlugFromRecord} from './workshop-foreverdb.mjs';
import {preferredGermanGameName} from './player-terminology.mjs';

const CATEGORY_DEFS=Object.freeze([
  Object.freeze({id:'class-abilities',label:'Klassenfähigkeiten'}),
  Object.freeze({id:'profession-recipes',label:'Berufsrezepte'}),
  Object.freeze({id:'profession-training',label:'Berufsausbildung'}),
  Object.freeze({id:'companion-abilities',label:'Begleiterfähigkeiten'})
]);

function asArray(value){return Array.isArray(value)?value:[]}
function finite(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
function integer(value){const n=Number(value);return Number.isInteger(n)?n:null}
function text(value){return typeof value==='string'?value.trim():''}
function norm(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE').trim();
}
function recipeKey(recipe){
  const id=integer(recipe?.id);
  if(id)return 'recipe:'+id;
  return 'recipe-name:'+text(recipe?.professionSlug)+':'+norm(recipe?.name)+':'+String(integer(recipe?.craftedItem?.id)||'');
}
function sourcePriceCopper(source={}){
  for(const value of [source.priceCopper,source.pricePerItem]){
    const n=finite(value);
    if(n!==null&&n>=0)return Math.round(n);
  }
  return null;
}
function sourceZone(source={}){
  const location=source?.location||{};
  return preferredGermanGameName('zone',integer(location.uiMapId),text(location.zone))||text(location.zone);
}
function sourceAtZone(source,zone){return norm(sourceZone(source))===norm(zone)}
function sourceNpcKey(source={}){
  const id=integer(source?.id);
  if(id)return 'npc:'+id;
  const location=source?.location||{};
  return 'npc-name:'+[
    norm(source?.name),
    norm(sourceZone(source)),
    finite(location.x)??'',
    finite(location.y)??''
  ].join('|');
}
function sourceAllowedForCharacter(source,character){
  const faction=norm(character?.faction);
  if(source?.side==='horde'&&/(allianz|alliance)/.test(faction))return false;
  if(source?.side==='alliance'&&/horde/.test(faction))return false;
  return true;
}
function eligibleNpcSources(sources,character,{types=['vendor','trainer']}={}){
  const allowed=new Set(types);
  return asArray(sources).filter(source=>
    allowed.has(source?.type)&&
    source?.evidence==='forever-confirmed'&&
    text(source?.location?.zone)&&
    sourceAllowedForCharacter(source,character)
  );
}
function publicProfession(profession={}){
  return {
    id:integer(profession.id),
    name:text(profession.name)||null,
    current:finite(profession.current),
    max:finite(profession.max)
  };
}
function publicCharacter(character={}){
  return {
    slug:text(character.slug)||null,
    name:text(character.name)||text(character.slug)||'Dalton',
    player:text(character.player)||null,
    level:finite(character.level),
    classId:integer(character.classId),
    class:text(character.class)||null,
    faction:text(character.faction)||null,
    professions:asArray(character.professions).map(publicProfession)
  };
}
function characterProfessionMap(character={}){
  const map=new Map();
  for(const profession of asArray(character.professions)){
    const slug=professionSlugFromRecord(profession);
    if(slug)map.set(slug,profession);
  }
  return map;
}
function knownRecipeMap(character={}){
  const result=new Map();
  for(const profession of asArray(character.professions)){
    const slug=professionSlugFromRecord(profession);
    if(!slug)continue;
    const ids=new Set(),names=new Set();
    for(const recipe of asArray(profession.knownRecipes)){
      const id=integer(recipe?.id);if(id)ids.add(id);
      const name=norm(recipe?.name);if(name)names.add(name);
    }
    result.set(slug,{ids,names});
  }
  return result;
}
function isKnownRecipe(recipe,known){
  const entry=known.get(recipe?.professionSlug);
  if(!entry)return false;
  const id=integer(recipe?.id);
  if(id&&entry.ids.has(id))return true;
  const name=norm(recipe?.name);
  return Boolean(name&&entry.names.has(name));
}
function recipeBaseCandidates(character,recipeIndex){
  if(character?.professionDetailsVerified===false)return [];
  const professions=characterProfessionMap(character);
  const known=knownRecipeMap(character);
  const result=[];
  for(const recipe of asArray(recipeIndex?.recipes)){
    const profession=professions.get(recipe?.professionSlug);
    if(!profession||isKnownRecipe(recipe,known))continue;
    const requiredSkill=finite(recipe?.requiredSkill),currentSkill=finite(profession?.current);
    if(requiredSkill===null||currentSkill===null||currentSkill<requiredSkill)continue;
    const sources=eligibleNpcSources(recipe?.learning?.sources,character);
    if(!sources.length)continue;
    result.push({recipe,profession,requiredSkill,currentSkill,sources});
  }
  return result;
}
function recipeActions(character,recipeIndex){
  const level=finite(character?.level);
  if(level===null)return [];
  const actions=[];
  for(const candidate of recipeBaseCandidates(character,recipeIndex)){
    const id=integer(candidate.recipe?.id);
    const explicitRequiredLevel=candidate.recipe?.learningRequirementsVerified===true
      ?finite(candidate.recipe?.requiredCharacterLevel)
      :null;
    if(explicitRequiredLevel!==null&&level<explicitRequiredLevel)continue;
    actions.push({
      key:recipeKey(candidate.recipe),
      type:'profession-recipe',
      category:'profession-recipes',
      id,
      name:text(candidate.recipe?.name)||text(candidate.recipe?.craftedItem?.name)||'Rezept',
      profession:text(candidate.profession?.name)||null,
      professionId:integer(candidate.profession?.id),
      requiredSkill:candidate.requiredSkill,
      currentSkill:candidate.currentSkill,
      requiredLevel:explicitRequiredLevel,
      currentLevel:level,
      sources:candidate.sources
    });
  }
  return actions;
}
function professionTrainingActions(character,recipeIndex){
  const level=finite(character?.level);
  if(level===null)return [];
  const professions=characterProfessionMap(character);
  const masters=new Map(asArray(recipeIndex?.professions).filter(p=>p?.slug).map(p=>[p.slug,p]));
  const actions=[];
  for(const [slug,profession] of professions){
    const master=masters.get(slug);
    if(!master)continue;
    const currentSkill=finite(profession?.current),currentCap=finite(profession?.max);
    if(currentSkill===null||currentCap===null)continue;
    const next=asArray(master.ranks)
      .filter(rank=>finite(rank?.skillCap)!==null&&finite(rank.skillCap)>currentCap)
      .sort((a,b)=>finite(a.skillCap)-finite(b.skillCap))[0];
    if(!next)continue;
    const requiredSkill=finite(next.requiredSkill),requiredLevel=finite(next.requiredLevel);
    if(requiredSkill===null||requiredLevel===null||currentSkill<requiredSkill||level<requiredLevel)continue;
    const sources=eligibleNpcSources(next.sources,character,{types:['trainer']});
    if(!sources.length)continue;
    actions.push({
      key:'profession-rank:'+slug+':'+String(integer(next.id)||Math.round(finite(next.skillCap))),
      type:'profession-training',
      category:'profession-training',
      id:integer(next.id),
      name:[text(profession.name),text(next.name)].filter(Boolean).join(' · ')||'Berufsausbildung',
      profession:text(profession.name)||null,
      professionId:integer(profession.id),
      requiredSkill,
      currentSkill,
      requiredLevel,
      currentLevel:level,
      sources:sources.map(source=>({...source,priceCopper:sourcePriceCopper(source)??finite(next.priceCopper)}))
    });
  }
  return actions;
}
function verifiedExtraActions(character,extraActions=[]){
  return asArray(extraActions).filter(action=>
    action?.verified===true&&
    action?.availableNow===true&&
    (!action.characterSlug||action.characterSlug===character?.slug)&&
    ['class-abilities','companion-abilities'].includes(action.category)&&
    eligibleNpcSources(action.sources,character,{types:['trainer','vendor']}).length
  ).map(action=>({
    ...action,
    key:text(action.key)||action.category+':'+String(integer(action.id)||norm(action.name)),
    sources:eligibleNpcSources(action.sources,character,{types:['trainer','vendor']})
  }));
}
function buildLocations(candidates){
  const zones=new Map();
  for(const action of candidates){
    for(const source of action.sources){
      const zone=sourceZone(source);
      if(!zone)continue;
      const key=norm(zone);
      let entry=zones.get(key);
      if(!entry){entry={name:zone,actionKeys:new Set(),npcKeys:new Set()};zones.set(key,entry)}
      entry.actionKeys.add(action.key);
      entry.npcKeys.add(sourceNpcKey(source));
    }
  }
  return [...zones.values()].map(entry=>({
    name:entry.name,
    actionCount:entry.actionKeys.size,
    npcCount:entry.npcKeys.size
  })).sort((a,b)=>a.name.localeCompare(b.name,'de'));
}
function sourceSummary(source={}){
  const location=source.location||{};
  const stock=finite(source.limitedStock);
  return {
    key:sourceNpcKey(source),
    id:integer(source.id),
    name:text(source.name)||(source.type==='trainer'?'Unbekannter Lehrer':'Unbekannter Händler'),
    role:source.type==='trainer'?'Lehrer':'Händler',
    sourceType:source.type||null,
    location:{
      zone:sourceZone(source)||null,
      x:finite(location.x),
      y:finite(location.y),
      uiMapId:integer(location.uiMapId),
      instance:text(location.instance)||null
    },
    priceCopper:sourcePriceCopper(source),
    limitedStock:stock!==null&&stock>0?stock:null,
    side:source.side||null,
    displayId:integer(source.displayId),
    renderSourceUrl:text(source.renderSourceUrl)||null
  };
}
function choosePreferredSources(actions,zone){
  const withSources=actions.map(action=>({
    ...action,
    zoneSources:action.sources.filter(source=>sourceAtZone(source,zone))
  })).filter(action=>action.zoneSources.length);
  const coverage=new Map();
  for(const action of withSources){
    for(const source of action.zoneSources){
      const key=sourceNpcKey(source);
      let set=coverage.get(key);if(!set){set=new Set();coverage.set(key,set)}
      set.add(action.key);
    }
  }
  return withSources.map(action=>{
    const sorted=[...action.zoneSources].sort((a,b)=>{
      const ak=sourceNpcKey(a),bk=sourceNpcKey(b);
      const ac=coverage.get(ak)?.size||0,bc=coverage.get(bk)?.size||0;
      if(ac!==bc)return bc-ac;
      const ap=sourcePriceCopper(a),bp=sourcePriceCopper(b);
      if((ap===null)!==(bp===null))return ap===null?1:-1;
      if(ap!==null&&bp!==null&&ap!==bp)return ap-bp;
      return text(a.name).localeCompare(text(b.name),'de');
    });
    return {
      key:action.key,
      type:action.type,
      category:action.category,
      id:action.id??null,
      name:action.name,
      profession:action.profession||null,
      professionId:action.professionId??null,
      requiredSkill:action.requiredSkill??null,
      currentSkill:action.currentSkill??null,
      requiredLevel:action.requiredLevel??null,
      currentLevel:action.currentLevel??null,
      source:sourceSummary(sorted[0]),
      alternatives:sorted.slice(1).map(sourceSummary)
    };
  });
}
function groupByNpc(actions){
  const groups=new Map();
  for(const action of actions){
    const source=action.source;
    let group=groups.get(source.key);
    if(!group){
      group={
        key:source.key,
        id:source.id,
        name:source.name,
        role:source.role,
        sourceType:source.sourceType,
        location:source.location,
        displayId:source.displayId,
        renderSourceUrl:source.renderSourceUrl,
        actions:[]
      };
      groups.set(source.key,group);
    }
    group.actions.push(action);
    if(group.role!==source.role)group.role='Mehrere Dienste';
  }
  return [...groups.values()].map(group=>({
    ...group,
    actions:group.actions.sort((a,b)=>
      a.category.localeCompare(b.category,'de')||
      (a.profession||'').localeCompare(b.profession||'','de')||
      a.name.localeCompare(b.name,'de')
    )
  })).sort((a,b)=>{
    const ax=finite(a.location?.x),bx=finite(b.location?.x);
    if(ax!==null&&bx!==null&&ax!==bx)return ax-bx;
    const ay=finite(a.location?.y),by=finite(b.location?.y);
    if(ay!==null&&by!==null&&ay!==by)return ay-by;
    return a.name.localeCompare(b.name,'de');
  });
}
export function buildLocationPlanner(data={},recipeIndex={},{
  characterSlug=null,
  location=null,
  professionMasters={},
  extraActions=[]
}={}){
  const characters=asArray(data?.characters).map(publicCharacter).sort((a,b)=>a.name.localeCompare(b.name,'de'));
  if(!characterSlug){
    return {
      generatedAt:data?.generatedAt||null,
      characters,
      categories:CATEGORY_DEFS.map(entry=>({...entry,actionCount:0})),
      selectedCharacter:null,
      locations:[],
      selectedLocation:null,
      npcs:[],
      actions:[],
      counts:{availableNow:0,atLocation:0,npcs:0,knownPrices:0,unknownPrices:0}
    };
  }
  const character=asArray(data?.characters).find(entry=>entry?.slug===characterSlug);
  if(!character)throw new Error('Charakter nicht gefunden');
  const effectiveIndex={
    ...recipeIndex,
    professions:Object.values(professionMasters||{}).filter(master=>master&&!master.error)
  };
  const candidates=[
    ...recipeActions(character,effectiveIndex),
    ...professionTrainingActions(character,effectiveIndex),
    ...verifiedExtraActions(character,extraActions)
  ];
  const locations=buildLocations(candidates);
  const canonicalLocation=locations.find(entry=>norm(entry.name)===norm(location))?.name||null;
  const actions=canonicalLocation?choosePreferredSources(candidates,canonicalLocation):[];
  const npcs=canonicalLocation?groupByNpc(actions):[];
  const knownPrices=actions.filter(action=>action.source.priceCopper!==null).length;
  const categories=CATEGORY_DEFS.map(entry=>({
    ...entry,
    actionCount:actions.filter(action=>action.category===entry.id).length
  }));
  return {
    generatedAt:data?.generatedAt||null,
    characters,
    categories,
    selectedCharacter:publicCharacter(character),
    locations,
    selectedLocation:canonicalLocation,
    npcs,
    actions,
    counts:{
      availableNow:candidates.length,
      atLocation:actions.length,
      npcs:npcs.length,
      knownPrices,
      unknownPrices:actions.length-knownPrices
    },
    coverage:{
      classAbilitiesVerified:character?.knownClassAbilitiesVerified===true,
      companionAbilitiesVerified:character?.knownCompanionAbilitiesVerified===true,
      professionRecipesVerified:character?.professionDetailsVerified!==false
    }
  };
}
