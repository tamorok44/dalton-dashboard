import {professionSlugFromRecord} from './workshop-foreverdb.mjs';
import {preferredGermanGameName} from './player-terminology.mjs';

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
function sourceVendorKey(source={}){
  const id=integer(source?.id);
  if(id)return 'vendor:'+id;
  const location=source?.location||{};
  return 'vendor-name:'+[
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
function sourceZone(source={}){
  const location=source?.location||{};
  return preferredGermanGameName('zone',integer(location.uiMapId),text(location.zone))||text(location.zone);
}
function sourceAtZone(source,zone){
  return norm(sourceZone(source))===norm(zone);
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
function eligibleVendorSources(recipe,character){
  return asArray(recipe?.learning?.sources).filter(source=>
    source?.type==='vendor'&&
    source?.evidence==='forever-confirmed'&&
    text(source?.location?.zone)&&
    sourceAllowedForCharacter(source,character)
  );
}
function candidateRecipes(character,recipeIndex){
  const professions=characterProfessionMap(character);
  const known=knownRecipeMap(character);
  const result=[];
  for(const recipe of asArray(recipeIndex?.recipes)){
    const profession=professions.get(recipe?.professionSlug);
    if(!profession||isKnownRecipe(recipe,known))continue;
    const required=finite(recipe?.requiredSkill),skill=finite(profession?.current);
    if(required===null||skill===null||skill<required)continue;
    const sources=eligibleVendorSources(recipe,character);
    if(!sources.length)continue;
    result.push({
      key:recipeKey(recipe),
      id:integer(recipe.id),
      name:text(recipe.name)||text(recipe?.craftedItem?.name)||'Rezept',
      craftedItem:recipe?.craftedItem?{id:integer(recipe.craftedItem.id),name:text(recipe.craftedItem.name)||null}:null,
      professionSlug:recipe.professionSlug,
      profession:publicProfession(profession),
      requiredSkill:required,
      currentSkill:skill,
      sources
    });
  }
  return result;
}
function buildLocations(candidates){
  const zones=new Map();
  for(const recipe of candidates){
    for(const source of recipe.sources){
      const zone=sourceZone(source);
      if(!zone)continue;
      const key=norm(zone);
      let entry=zones.get(key);
      if(!entry){entry={name:zone,recipeKeys:new Set(),vendorKeys:new Set()};zones.set(key,entry)}
      entry.recipeKeys.add(recipe.key);
      entry.vendorKeys.add(sourceVendorKey(source));
    }
  }
  return [...zones.values()].map(entry=>({
    name:entry.name,
    recipeCount:entry.recipeKeys.size,
    vendorCount:entry.vendorKeys.size
  })).sort((a,b)=>a.name.localeCompare(b.name,'de'));
}
function sourceSummary(source={}){
  const location=source.location||{};
  const stock=finite(source.limitedStock);
  return {
    key:sourceVendorKey(source),
    id:integer(source.id),
    name:text(source.name)||'Unbekannter Händler',
    location:{
      zone:sourceZone(source)||null,
      x:finite(location.x),
      y:finite(location.y),
      uiMapId:integer(location.uiMapId),
      instance:text(location.instance)||null
    },
    priceCopper:sourcePriceCopper(source),
    limitedStock:stock!==null&&stock>0?stock:null,
    side:source.side||null
  };
}
function choosePreferredSources(recipes,zone){
  const withSources=recipes.map(recipe=>({
    ...recipe,
    zoneSources:recipe.sources.filter(source=>sourceAtZone(source,zone))
  })).filter(recipe=>recipe.zoneSources.length);
  const coverage=new Map();
  for(const recipe of withSources){
    for(const source of recipe.zoneSources){
      const key=sourceVendorKey(source);
      let set=coverage.get(key);if(!set){set=new Set();coverage.set(key,set)}
      set.add(recipe.key);
    }
  }
  return withSources.map(recipe=>{
    const sorted=[...recipe.zoneSources].sort((a,b)=>{
      const ak=sourceVendorKey(a),bk=sourceVendorKey(b);
      const ac=coverage.get(ak)?.size||0,bc=coverage.get(bk)?.size||0;
      if(ac!==bc)return bc-ac;
      const ap=sourcePriceCopper(a),bp=sourcePriceCopper(b);
      if((ap===null)!==(bp===null))return ap===null?1:-1;
      if(ap!==null&&bp!==null&&ap!==bp)return ap-bp;
      return text(a.name).localeCompare(text(b.name),'de');
    });
    const preferred=sorted[0];
    return {
      key:recipe.key,
      id:recipe.id,
      name:recipe.name,
      craftedItem:recipe.craftedItem,
      profession:recipe.profession.name,
      professionId:recipe.profession.id,
      requiredSkill:recipe.requiredSkill,
      currentSkill:recipe.currentSkill,
      source:sourceSummary(preferred),
      alternatives:sorted.slice(1).map(sourceSummary)
    };
  });
}
function groupByVendor(recipes){
  const groups=new Map();
  for(const recipe of recipes){
    const source=recipe.source;
    let group=groups.get(source.key);
    if(!group){
      group={
        key:source.key,
        id:source.id,
        name:source.name,
        location:source.location,
        recipes:[]
      };
      groups.set(source.key,group);
    }
    group.recipes.push(recipe);
  }
  return [...groups.values()].map(group=>({
    ...group,
    recipes:group.recipes.sort((a,b)=>a.profession.localeCompare(b.profession,'de')||a.name.localeCompare(b.name,'de'))
  })).sort((a,b)=>{
    const ax=finite(a.location?.x),bx=finite(b.location?.x);
    if(ax!==null&&bx!==null&&ax!==bx)return ax-bx;
    const ay=finite(a.location?.y),by=finite(b.location?.y);
    if(ay!==null&&by!==null&&ay!==by)return ay-by;
    return a.name.localeCompare(b.name,'de');
  });
}
export function buildProfessionPlanner(data={},recipeIndex={},{
  characterSlug=null,
  location=null
}={}){
  const characters=asArray(data?.characters)
    .filter(character=>characterProfessionMap(character).size>0)
    .map(publicCharacter)
    .sort((a,b)=>a.name.localeCompare(b.name,'de'));
  if(!characterSlug){
    return {
      generatedAt:data?.generatedAt||null,
      characters,
      selectedCharacter:null,
      locations:[],
      selectedLocation:null,
      vendors:[],
      recipes:[],
      counts:{availableNow:0,atLocation:0,vendors:0,knownPrices:0,unknownPrices:0}
    };
  }
  const character=asArray(data?.characters).find(entry=>entry?.slug===characterSlug);
  if(!character)throw new Error('Charakter nicht gefunden');
  const candidates=candidateRecipes(character,recipeIndex);
  const locations=buildLocations(candidates);
  const canonicalLocation=locations.find(entry=>norm(entry.name)===norm(location))?.name||null;
  const recipes=canonicalLocation?choosePreferredSources(candidates,canonicalLocation):[];
  const vendors=canonicalLocation?groupByVendor(recipes):[];
  const knownPrices=recipes.filter(recipe=>recipe.source.priceCopper!==null).length;
  return {
    generatedAt:data?.generatedAt||null,
    characters,
    selectedCharacter:publicCharacter(character),
    locations,
    selectedLocation:canonicalLocation,
    vendors,
    recipes,
    counts:{
      availableNow:candidates.length,
      atLocation:recipes.length,
      vendors:vendors.length,
      knownPrices,
      unknownPrices:recipes.length-knownPrices
    }
  };
}
