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
function zoneNorm(value){
  return norm(value).replace(/^(?:die|der|das)\s+/,'');
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
function sourcePriceSource(source={}){
  if(sourcePriceCopper(source)===null)return null;
  const value=text(source.priceSource);
  if(value==='forever-observed'||value==='classic'||value==='unknown')return value;
  if(source?.type==='vendor'&&source?.evidence==='forever-confirmed')return 'forever-observed';
  return 'unknown';
}
function sourcePriceTier(source={}){
  if(sourcePriceCopper(source)===null)return 3;
  const provenance=sourcePriceSource(source);
  if(provenance==='forever-observed')return 0;
  if(provenance==='classic')return 1;
  return 2;
}
function compareSourcePrice(a,b){
  const at=sourcePriceTier(a),bt=sourcePriceTier(b);
  if(at!==bt)return at-bt;
  const ap=sourcePriceCopper(a),bp=sourcePriceCopper(b);
  if(ap!==null&&bp!==null&&ap!==bp)return ap-bp;
  return 0;
}
function sourceZone(source={}){
  const location=source?.location||{};
  return preferredGermanGameName('zone',integer(location.uiMapId),text(location.zone))||text(location.zone);
}
function sourceAtZone(source,zone){return zoneNorm(sourceZone(source))===zoneNorm(zone)}
function sourceNpcKey(source={}){
  const id=integer(source?.id);
  if(id)return 'npc:'+id;
  const location=source?.location||{};
  return 'npc-name:'+[
    norm(source?.name),
    zoneNorm(sourceZone(source)),
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
  const knownClassAbilities=asArray(character?.knownClassAbilities).map(entry=>({
    id:integer(typeof entry==='number'?entry:entry?.id??entry?.spellId),
    name:text(entry?.name)||null,
    rank:text(entry?.rank)||null,
    inferredFromHigherRank:entry?.inferredFromHigherRank===true
  })).filter(entry=>entry.id);
  return {
    slug:text(character.slug)||null,
    name:text(character.name)||text(character.slug)||'Dalton',
    player:text(character.player)||null,
    level:finite(character.level),
    classId:integer(character.classId),
    class:text(character.class)||null,
    faction:text(character.faction)||null,
    knownClassAbilitiesVerified:character?.knownClassAbilitiesVerified===true,
    knownClassAbilitiesSource:text(character?.knownClassAbilitiesSource)||null,
    knownClassAbilitiesCapturedAt:text(character?.knownClassAbilitiesCapturedAt)||null,
    knownClassAbilitiesSyncedAt:text(character?.knownClassAbilitiesSyncedAt)||null,
    knownClassAbilityCount:knownClassAbilities.length,
    knownClassAbilities,
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
      craftedItemId:integer(candidate.recipe?.craftedItem?.id),
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
function rankTrainerTerms(skillCap){
  const cap=finite(skillCap);
  if(cap===75)return ['apprentice','lehrling'];
  if(cap===150)return ['journeyman','geselle'];
  if(cap===225)return ['expert','experte'];
  if(cap===300)return ['artisan','fachmann','meister'];
  return [];
}
function professionRankSources(master,next,character){
  const direct=eligibleNpcSources(next?.sources,character,{types:['trainer','vendor']});
  if(direct.length)return direct;
  const terms=rankTrainerTerms(next?.skillCap);
  if(!terms.length)return [];
  return eligibleNpcSources(master?.trainers,character,{types:['trainer']}).filter(source=>{
    const title=norm(source?.npcTitle);
    return Boolean(title)&&terms.some(term=>title.includes(norm(term)));
  });
}
function fallbackProfessionRankRequiredSkill(slug,skillCap){
  const cap=finite(skillCap);
  if(cap===150)return 50;
  if(cap===225)return 125;
  if(cap===300)return ['cooking','first-aid','fishing'].includes(slug)?225:200;
  return null;
}
function fallbackProfessionRankRequiredLevel(slug,skillCap){
  const cap=finite(skillCap);
  // ForeverDB's profession guides document these rank gates from Classic trainer
  // data. They are used only for profession-rank training, never for recipes.
  if(cap===150){
    if(slug==='fishing')return 1;
    if(['alchemy','blacksmithing','enchanting','engineering','leatherworking','tailoring','cooking','first-aid'].includes(slug))return 10;
  }
  if(cap===225){
    if(slug==='fishing')return 1;
    if(['alchemy','blacksmithing','enchanting','engineering','leatherworking','tailoring','cooking','first-aid'].includes(slug))return 20;
  }
  if(cap===300&&['alchemy','blacksmithing','enchanting','engineering','leatherworking','cooking','first-aid','fishing','skinning'].includes(slug))return 35;
  return null;
}
function fallbackProfessionRankPriceCopper(slug,skillCap){
  const cap=finite(skillCap);
  // ForeverDB's Alchemy guide explicitly marks these rank costs as Classic trainer data.
  if(slug==='alchemy'){
    if(cap===150)return 450;
    if(cap===225)return 5000;
    if(cap===300)return 45000;
  }
  return null;
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
    const directRequiredSkill=finite(next.requiredSkill);
    const requiredSkill=directRequiredSkill!==null&&directRequiredSkill>0
      ?directRequiredSkill
      :fallbackProfessionRankRequiredSkill(slug,next.skillCap);
    const directRequiredLevel=finite(next.requiredLevel);
    const requiredLevel=directRequiredLevel!==null&&directRequiredLevel>0
      ?directRequiredLevel
      :fallbackProfessionRankRequiredLevel(slug,next.skillCap);
    if(requiredSkill===null||requiredLevel===null||currentSkill<requiredSkill||level<requiredLevel)continue;
    const sources=professionRankSources(master,next,character);
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
      requiredSkillSource:directRequiredSkill!==null&&directRequiredSkill>0?'foreverdb':'classic-trainer',
      currentSkill,
      requiredLevel,
      requiredLevelSource:directRequiredLevel!==null&&directRequiredLevel>0?'foreverdb':'classic-trainer',
      currentLevel:level,
      sources:sources.map(source=>{
        const directPrice=sourcePriceCopper(source);
        const rankPrice=finite(next.priceCopper);
        const classicFallbackPrice=rankPrice===null?fallbackProfessionRankPriceCopper(slug,next.skillCap):null;
        const inheritedPrice=rankPrice??classicFallbackPrice;
        return {
          ...source,
          priceCopper:directPrice??inheritedPrice,
          priceSource:directPrice!==null
            ?sourcePriceSource(source)
            :rankPrice!==null
              ?(next.priceSource||'unknown')
              :classicFallbackPrice!==null?'classic':null
        };
      })
    });
  }
  return actions;
}
function classTrainingActions(character,classMaster){
  const level=finite(character?.level);
  if(level===null||!classMaster)return [];
  const knownVerified=character?.knownClassAbilitiesVerified===true;
  const knownIds=new Set(asArray(character?.knownClassAbilities).map(entry=>integer(
    typeof entry==='number'?entry:entry?.id??entry?.spellId
  )).filter(Boolean));
  const actions=[];
  for(const ability of asArray(classMaster?.abilities)){
    for(const rank of asArray(ability?.ranks)){
      const spellId=integer(rank?.id);
      const requiredLevel=finite(rank?.requiredLevel);
      if(!spellId||requiredLevel===null||requiredLevel>level)continue;
      if(knownVerified&&knownIds.has(spellId))continue;
      const sources=eligibleNpcSources(rank?.sources,character,{types:['trainer']});
      if(!sources.length)continue;
      const rankText=text(rank?.rank);
      actions.push({
        key:'class-spell:'+spellId,
        type:'class-ability',
        category:'class-abilities',
        id:spellId,
        name:[text(ability?.name)||text(rank?.name)||'Klassenfähigkeit',rankText].filter(Boolean).join(' · '),
        abilityName:text(ability?.name)||text(rank?.name)||null,
        rank:rankText||null,
        school:text(ability?.school)||null,
        iconId:integer(rank?.iconId),
        requiredLevel,
        currentLevel:level,
        learnedState:knownVerified?'not-known':'unknown',
        learnedStateVerified:knownVerified,
        sources:sources.map(source=>{
          const directPrice=sourcePriceCopper(source);
          const rankPrice=finite(rank?.priceCopper);
          return {
            ...source,
            priceCopper:directPrice??rankPrice,
            priceSource:directPrice!==null?sourcePriceSource(source):(rankPrice!==null?(rank.priceSource||'unknown'):null)
          };
        })
      });
    }
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
      const key=zoneNorm(zone);
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
function mergeKnownLocations(actionLocations,knownLocations=[]){
  const zones=new Map(asArray(actionLocations).map(entry=>[zoneNorm(entry?.name),{...entry}]).filter(([key])=>key));
  for(const value of asArray(knownLocations)){
    const name=text(typeof value==='string'?value:value?.name);
    const key=zoneNorm(name);
    if(!key||zones.has(key))continue;
    zones.set(key,{name,actionCount:0,npcCount:0});
  }
  return [...zones.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'));
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
    priceSource:sourcePriceSource(source),
    limitedStock:stock!==null&&stock>0?stock:null,
    side:source.side||null,
    displayId:integer(source.displayId),
    renderSourceUrl:text(source.renderSourceUrl)||null,
    npcTitle:text(source.npcTitle)||null
  };
}
function mergeActionCandidates(actions){
  const byKey=new Map();
  for(const action of asArray(actions)){
    const key=text(action?.key);
    if(!key)continue;
    let merged=byKey.get(key);
    if(!merged){
      merged={...action,sources:[]};
      byKey.set(key,merged);
    }
    const sourceByNpc=new Map(merged.sources.map(source=>[sourceNpcKey(source),source]));
    for(const source of asArray(action.sources)){
      const npcKey=sourceNpcKey(source);
      const previous=sourceByNpc.get(npcKey);
      if(!previous){
        sourceByNpc.set(npcKey,source);
        continue;
      }
      if(compareSourcePrice(source,previous)<0)sourceByNpc.set(npcKey,source);
    }
    merged.sources=[...sourceByNpc.values()];
  }
  return [...byKey.values()];
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
      const priceOrder=compareSourcePrice(a,b);
      if(priceOrder!==0)return priceOrder;
      const ak=sourceNpcKey(a),bk=sourceNpcKey(b);
      const ac=coverage.get(ak)?.size||0,bc=coverage.get(bk)?.size||0;
      if(ac!==bc)return bc-ac;
      return text(a.name).localeCompare(text(b.name),'de');
    });
    const offers=sorted.map(sourceSummary);
    const {sources:_sources,zoneSources:_zoneSources,...publicAction}=action;
    return {
      ...publicAction,
      source:offers[0],
      alternatives:offers.slice(1),
      offerCount:offers.length,
      cheapestKnownPriceCopper:offers.find(source=>source.priceCopper!==null)?.priceCopper??null,
      priceSource:offers[0]?.priceSource||null
    };
  });
}
function groupByNpc(actions){
  const groups=new Map();
  for(const action of actions){
    const offers=[action.source,...asArray(action.alternatives)].filter(source=>source?.key);
    for(const source of offers){
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
      group.actions.push({
        ...action,
        source,
        alternatives:offers.filter(other=>other.key!==source.key)
      });
      if(group.role!==source.role)group.role='Mehrere Dienste';
    }
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
  classMaster=null,
  extraActions=[],
  knownLocations=[]
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
  const candidates=mergeActionCandidates([
    ...recipeActions(character,effectiveIndex),
    ...professionTrainingActions(character,effectiveIndex),
    ...classTrainingActions(character,classMaster),
    ...verifiedExtraActions(character,extraActions)
  ]);
  const locations=mergeKnownLocations(buildLocations(candidates),knownLocations);
  const canonicalLocation=locations.find(entry=>zoneNorm(entry.name)===zoneNorm(location))?.name||null;
  const actions=canonicalLocation?choosePreferredSources(candidates,canonicalLocation):[];
  const npcs=canonicalLocation?groupByNpc(actions):[];
  const knownPrices=actions.filter(action=>action.source.priceCopper!==null).length;
  const confirmedPrices=actions.filter(action=>action.source.priceCopper!==null&&action.source.priceSource==='forever-observed').length;
  const classicPrices=actions.filter(action=>action.source.priceCopper!==null&&action.source.priceSource==='classic').length;
  const unknownPriceSources=actions.filter(action=>action.source.priceCopper!==null&&action.source.priceSource==='unknown').length;
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
      confirmedPrices,
      classicPrices,
      unknownPriceSources,
      unknownPrices:actions.length-knownPrices
    },
    coverage:{
      classAbilitiesVerified:character?.knownClassAbilitiesVerified===true,
      companionAbilitiesVerified:character?.knownCompanionAbilitiesVerified===true,
      professionRecipesVerified:character?.professionDetailsVerified!==false
    }
  };
}
