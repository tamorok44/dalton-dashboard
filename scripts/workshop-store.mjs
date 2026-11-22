import {createHash} from 'node:crypto';
import {configured as redisConfigured,redis} from './character-store.mjs';
import {
  fetchForeverDbRecipeIndex,
  fetchForeverDbProfessionMaster,
  searchForeverDbRecipesForItem,
  serializableRecipeIndex,
  hydrateRecipeIndex
} from './workshop-foreverdb.mjs';
import {PROFESSION_SLUGS,fetchForeverDbMeta,searchForeverDbItems,fetchForeverDbSpell,fetchForeverDbVendor} from './foreverdb-api.mjs';

const RECIPE_TTL_SECONDS=12*60*60;
const SEARCH_TTL_SECONDS=24*60*60;
const ITEM_RECIPE_TTL_SECONDS=24*60*60;
const META_TTL_SECONDS=10*60;
const MASTER_KEY='dalton-dashboard:workshop:foreverdb:master:v2';
const MASTER_DRAFT_KEY='dalton-dashboard:workshop:foreverdb:master-draft:v2';
const META_KEY='dalton-dashboard:workshop:foreverdb:meta:v1';
const MASTER_REFRESH_CHUNK=3;
const SPELL_CACHE_PREFIX='dalton-dashboard:foreverdb:spell:v1:';
const VENDOR_CACHE_PREFIX='dalton-dashboard:foreverdb:vendor:v1:';
const PROFESSION_MASTER_CACHE_PREFIX='dalton-dashboard:foreverdb:profession-master:v4:';

function now(){return Date.now()}
function fresh(value,maxAgeMs){
  const t=Date.parse(value?.generatedAt||'');
  return Number.isFinite(t)&&now()-t<maxAgeMs;
}
function digest(value){
  return createHash('sha1').update(String(value)).digest('hex');
}
function normalizedSlugs(slugs=[]){
  return [...new Set((Array.isArray(slugs)?slugs:[]).filter(slug=>PROFESSION_SLUGS.has(slug)))].sort();
}
function recipeKey(slugs){
  return 'dalton-dashboard:workshop:foreverdb:recipes:v3:'+digest(normalizedSlugs(slugs).join('|'));
}
function searchKey(query){
  return 'dalton-dashboard:workshop:foreverdb:search:v1:'+digest(String(query).trim().toLocaleLowerCase('de-DE'));
}
function itemRecipeKey(itemId,itemName){
  return 'dalton-dashboard:workshop:foreverdb:item-recipes:v3:'+Number(itemId)+':'+digest(String(itemName||'').trim().toLocaleLowerCase('en'));
}
function recipeIdentity(recipe={}){
  return [
    recipe.professionSlug||'unknown',
    recipe.id??'none',
    recipe.craftedItem?.id??'none'
  ].join('|');
}
export function mergeRecipeIndexes(...values){
  const indexes=values.filter(Boolean);
  const recipes=[];
  const seen=new Set();
  const professionSlugs=new Set();
  const professions=new Map();
  let build=null;
  let requestCount=0;
  for(const index of indexes){
    if(!build&&index?.build)build=index.build;
    requestCount+=Number(index?.requestCount)||0;
    for(const slug of normalizedSlugs(index?.professionSlugs||[]))professionSlugs.add(slug);
    for(const profession of Array.isArray(index?.professions)?index.professions:[]){
      if(profession?.slug)professions.set(profession.slug,{...(professions.get(profession.slug)||{}),...profession});
    }
    for(const recipe of Array.isArray(index?.recipes)?index.recipes:[]){
      const key=recipeIdentity(recipe);
      if(seen.has(key))continue;
      seen.add(key);
      recipes.push(recipe);
      if(recipe?.professionSlug&&PROFESSION_SLUGS.has(recipe.professionSlug))professionSlugs.add(recipe.professionSlug);
    }
  }
  return hydrateRecipeIndex({
    generatedAt:new Date().toISOString(),
    build,
    requestCount,
    complete:professionSlugs.size===PROFESSION_SLUGS.size,
    professionSlugs:[...professionSlugs].sort(),
    professions:[...professions.values()].sort((a,b)=>String(a.slug).localeCompare(String(b.slug))),
    recipes
  });
}
export function missingMasterProfessionSlugs(index){
  const done=new Set(normalizedSlugs(index?.professionSlugs||[]));
  return [...PROFESSION_SLUGS].filter(slug=>!done.has(slug)).sort();
}
export function nextMasterProfessionChunk(index,size=MASTER_REFRESH_CHUNK){
  return missingMasterProfessionSlugs(index).slice(0,Math.max(1,Number(size)||MASTER_REFRESH_CHUNK));
}
async function loadJson(key){
  if(!redisConfigured())return null;
  const raw=await redis(['GET',key]);
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{return null}
}
async function saveJson(key,value,{ttl=null}={}){
  if(!redisConfigured())return;
  const args=['SET',key,JSON.stringify(value)];
  if(ttl)args.push('EX',String(ttl));
  await redis(args);
}
async function deleteKey(key){
  if(redisConfigured())await redis(['DEL',key]);
}
async function cachedForeverDbMeta({fetchImpl=fetch}={}){
  const cached=await loadJson(META_KEY);
  if(cached&&fresh(cached,META_TTL_SECONDS*1000))return {...cached,cached:true};
  const meta=await fetchForeverDbMeta({fetchImpl});
  const value={...meta,generatedAt:new Date().toISOString()};
  await saveJson(META_KEY,value,{ttl:META_TTL_SECONDS});
  return {...value,cached:false};
}
export async function loadCachedRecipeIndex(professionSlugs=[]){
  if(!redisConfigured())return null;
  const slugs=normalizedSlugs(professionSlugs);
  const parsed=await loadJson(recipeKey(slugs));
  return parsed?hydrateRecipeIndex(parsed):null;
}
export async function getForeverDbRecipeIndex({professionSlugs=[],force=false,fetchImpl=fetch}={}){
  const slugs=normalizedSlugs(professionSlugs);
  const cached=await loadCachedRecipeIndex(slugs);
  if(!force&&cached&&fresh(cached,RECIPE_TTL_SECONDS*1000))return {...cached,cached:true};
  const index=await fetchForeverDbRecipeIndex({fetchImpl,professionSlugs:slugs});
  if(redisConfigured()){
    await saveJson(recipeKey(slugs),serializableRecipeIndex(index),{ttl:RECIPE_TTL_SECONDS});
  }
  return {...index,cached:false};
}
async function loadMaster(){
  const parsed=await loadJson(MASTER_KEY);
  return parsed?hydrateRecipeIndex(parsed):null;
}
async function loadDraft(){
  const parsed=await loadJson(MASTER_DRAFT_KEY);
  return parsed?hydrateRecipeIndex(parsed):null;
}
async function persistMaster(index){
  const serial=serializableRecipeIndex({...index,complete:true});
  await saveJson(MASTER_KEY,serial);
  await deleteKey(MASTER_DRAFT_KEY);
  return hydrateRecipeIndex(serial);
}
async function persistDraft(index){
  const serial=serializableRecipeIndex({...index,complete:false});
  await saveJson(MASTER_DRAFT_KEY,serial,{ttl:24*60*60});
  return hydrateRecipeIndex(serial);
}
async function seedDraftFromExistingScope(seedProfessionSlugs=[]){
  const seed=await loadCachedRecipeIndex(seedProfessionSlugs);
  if(!seed)return null;
  return hydrateRecipeIndex({
    ...serializableRecipeIndex(seed),
    complete:false,
    generatedAt:new Date().toISOString()
  });
}
export async function getForeverDbMasterRecipeIndex({
  seedProfessionSlugs=[],
  fetchImpl=fetch,
  advance=true
}={}){
  const meta=await cachedForeverDbMeta({fetchImpl});
  let master=await loadMaster();
  if(master?.complete&&(!meta.build||!master.build||master.build===meta.build)){
    return {...master,cached:true,refreshing:false,masterComplete:true};
  }

  let draft=await loadDraft();
  if(draft&&meta.build&&draft.build&&draft.build!==meta.build){
    draft=null;
    await deleteKey(MASTER_DRAFT_KEY);
  }

  if(!draft){
    const seed=await seedDraftFromExistingScope(seedProfessionSlugs);
    if(seed&&(!meta.build||!seed.build||seed.build===meta.build))draft=seed;
    else draft=hydrateRecipeIndex({
      generatedAt:new Date().toISOString(),
      build:meta.build||null,
      requestCount:0,
      complete:false,
      professionSlugs:[],
      professions:[],
      recipes:[]
    });
  }

  if(meta.build&&!draft.build)draft.build=meta.build;
  if(!advance){
    const active=master?.complete?master:draft;
    return {...active,cached:Boolean(master?.complete),refreshing:!active?.complete,masterComplete:Boolean(master?.complete)};
  }

  let missing=missingMasterProfessionSlugs(draft);
  if(missing.length){
    let chunk=missing;
    if(!draft.professionSlugs?.length)chunk=missing.slice(0,MASTER_REFRESH_CHUNK);
    else if(missing.length>4)chunk=missing.slice(0,MASTER_REFRESH_CHUNK);
    try{
      const fetched=await fetchForeverDbRecipeIndex({
        fetchImpl,
        professionSlugs:chunk,
        maxRequests:28
      });
      draft=mergeRecipeIndexes(draft,fetched);
      if(meta.build)draft.build=meta.build;
      missing=missingMasterProfessionSlugs(draft);
    }catch(error){
      if(!/sichere Request-Budget/.test(String(error.message)))throw error;
      const fallbackChunk=nextMasterProfessionChunk(draft,MASTER_REFRESH_CHUNK);
      const fetched=await fetchForeverDbRecipeIndex({
        fetchImpl,
        professionSlugs:fallbackChunk,
        maxRequests:28
      });
      draft=mergeRecipeIndexes(draft,fetched);
      if(meta.build)draft.build=meta.build;
      missing=missingMasterProfessionSlugs(draft);
    }
  }

  if(!missing.length){
    draft.complete=true;
    const persisted=await persistMaster(draft);
    return {...persisted,cached:false,refreshing:false,masterComplete:true};
  }

  await persistDraft(draft);
  if(master?.complete){
    return {...master,cached:true,refreshing:true,masterComplete:true,refreshProgress:{
      completed:normalizedSlugs(draft.professionSlugs).length,
      total:PROFESSION_SLUGS.size
    }};
  }
  return {...draft,cached:false,refreshing:true,masterComplete:false,refreshProgress:{
    completed:normalizedSlugs(draft.professionSlugs).length,
    total:PROFESSION_SLUGS.size
  }};
}
export async function cachedForeverDbRecipeSearch(itemId,itemName,{fetchImpl=fetch}={}){
  const id=Number(itemId);
  if(!Number.isInteger(id)||id<=0)return {recipes:[],generatedAt:new Date().toISOString(),cached:false,requestCount:0};
  if(redisConfigured()){
    const key=itemRecipeKey(id,itemName);
    const raw=await redis(['GET',key]);
    if(raw){
      try{
        const parsed=JSON.parse(raw);
        if(Array.isArray(parsed?.recipes))return {...parsed,cached:true,requestCount:0};
      }catch{}
    }
    const result=await searchForeverDbRecipesForItem(id,itemName,{fetchImpl});
    await redis(['SET',key,JSON.stringify(result),'EX',ITEM_RECIPE_TTL_SECONDS]);
    return {...result,cached:false};
  }
  return {...await searchForeverDbRecipesForItem(id,itemName,{fetchImpl}),cached:false};
}

function buildScopedCacheKey(prefix,id,build){
  return prefix+String(id)+':'+(build?digest(build):'current');
}
export async function cachedForeverDbSpell(spellId,{build=null,fetchImpl=fetch}={}){
  const id=Number(spellId);
  if(!Number.isInteger(id)||id<=0)return null;
  const key=buildScopedCacheKey(SPELL_CACHE_PREFIX,id,build);
  const cached=await loadJson(key);
  if(cached?.spell?.id===id)return {...cached.spell,cached:true};
  const result=await fetchForeverDbSpell(id,{fetchImpl});
  if(!result?.spell?.id)return null;
  await saveJson(key,{spell:result.spell,generatedAt:new Date().toISOString(),build});
  return {...result.spell,cached:false};
}
export async function cachedForeverDbSpells(spellIds=[],{build=null,fetchImpl=fetch}={}){
  const ids=[...new Set((Array.isArray(spellIds)?spellIds:[]).map(Number).filter(id=>Number.isInteger(id)&&id>0))];
  const entries=await Promise.all(ids.map(async id=>{
    try{return [id,await cachedForeverDbSpell(id,{build,fetchImpl})]}
    catch(error){
      return [id,{error:String(error.message).slice(0,180)}];
    }
  }));
  return Object.fromEntries(entries);
}
export async function cachedForeverDbProfessionMaster(professionSlug,{build=null,fetchImpl=fetch}={}){
  const slug=String(professionSlug??'').trim();
  if(!PROFESSION_SLUGS.has(slug))return null;
  const key=buildScopedCacheKey(PROFESSION_MASTER_CACHE_PREFIX,slug,build);
  const cached=await loadJson(key);
  if(cached?.profession?.slug===slug)return {...cached.profession,cached:true};
  const result=await fetchForeverDbProfessionMaster(slug,{fetchImpl});
  if(!result?.profession?.slug)return null;
  await saveJson(key,{profession:result.profession,generatedAt:new Date().toISOString(),build:build||result.build||null});
  return {...result.profession,cached:false};
}
export async function cachedForeverDbProfessionMasters(professionSlugs=[],{build=null,fetchImpl=fetch}={}){
  const slugs=[...new Set((Array.isArray(professionSlugs)?professionSlugs:[]).filter(slug=>PROFESSION_SLUGS.has(slug)))];
  const entries=await Promise.all(slugs.map(async slug=>{
    try{return [slug,await cachedForeverDbProfessionMaster(slug,{build,fetchImpl})]}
    catch(error){return [slug,{slug,error:String(error.message).slice(0,180)}]}
  }));
  return Object.fromEntries(entries);
}

export async function cachedForeverDbVendor(vendorId,{build=null,fetchImpl=fetch}={}){
  const id=Number(vendorId);
  if(!Number.isInteger(id)||id<=0)return null;
  const key=buildScopedCacheKey(VENDOR_CACHE_PREFIX,id,build);
  const cached=await loadJson(key);
  if(cached?.vendor?.id===id)return {...cached.vendor,cached:true};
  const result=await fetchForeverDbVendor(id,{fetchImpl});
  if(!result?.vendor?.id)return null;
  await saveJson(key,{vendor:result.vendor,generatedAt:new Date().toISOString(),build});
  return {...result.vendor,cached:false};
}

export async function cachedForeverDbItemSearch(query,{limit=100,fetchImpl=fetch}={}){
  const q=String(query??'').trim();
  if(!q)return {items:[],meta:null,cached:false};
  if(redisConfigured()){
    const key=searchKey(q);
    const raw=await redis(['GET',key]);
    if(raw){
      try{
        const parsed=JSON.parse(raw);
        if(Array.isArray(parsed?.items))return {...parsed,cached:true};
      }catch{}
    }
    const result=await searchForeverDbItems(q,{limit,fetchImpl});
    const compact={items:result.items,meta:result.meta||null,generatedAt:new Date().toISOString()};
    await redis(['SET',key,JSON.stringify(compact),'EX',SEARCH_TTL_SECONDS]);
    return {...compact,cached:false};
  }
  const result=await searchForeverDbItems(q,{limit,fetchImpl});
  return {...result,cached:false};
}
