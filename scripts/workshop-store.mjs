import {readBuildDelta,unchangedAcrossDelta} from './build-delta.mjs';
import {readCompactMaster,writeCompactMaster,compressedMasterKey} from './compact-master-cache.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {configured as redisConfigured,redis} from './character-store.mjs';
import {
  fetchForeverDbRecipeIndex,
  fetchForeverDbProfessionMaster,
  searchForeverDbRecipesForItem,
  serializableRecipeIndex,
  hydrateRecipeIndex
} from './workshop-foreverdb.mjs';
import {PROFESSION_SLUGS,fetchForeverDbMeta,searchForeverDbItems,fetchForeverDbItem,fetchForeverDbSpell,fetchForeverDbVendor} from './foreverdb-api.mjs';

const RECIPE_TTL_SECONDS=12*60*60;
const SEARCH_TTL_SECONDS=24*60*60;
const ITEM_RECIPE_TTL_SECONDS=24*60*60;
const META_TTL_SECONDS=30*60;
const MASTER_KEY='dalton-dashboard:workshop:foreverdb:master:v2';
const MASTER_DRAFT_KEY='dalton-dashboard:workshop:foreverdb:master-draft:v2';
const META_KEY='dalton-dashboard:workshop:foreverdb:meta:v1';
const META_REFRESH_LOCK_KEY='dalton-dashboard:workshop:foreverdb:meta-refresh-lock:v1';
const META_REFRESH_LOCK_SECONDS=15;
const MASTER_REFRESH_CHUNK=3;
const MASTER_REFRESH_LOCK_KEY='dalton-dashboard:workshop:foreverdb:master-refresh-lock:v1';
const MASTER_REFRESH_LOCK_SECONDS=55;
const ITEM_CACHE_PREFIX='dalton-dashboard:foreverdb:item:v1:';
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
  if(redisConfigured())await redis(['DEL',key,compressedMasterKey(key)]);
}
async function acquireRedisLock(key,seconds){
  if(!redisConfigured())return 'local';
  const token=randomUUID();
  const result=await redis(['SET',key,token,'NX','EX',String(seconds)]);
  return result==='OK'?token:null;
}
async function releaseRedisLock(key,token){
  if(!redisConfigured()||!token||token==='local')return;
  await redis(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,key,token]);
}
async function acquireMasterRefreshLock(){
  return acquireRedisLock(MASTER_REFRESH_LOCK_KEY,MASTER_REFRESH_LOCK_SECONDS);
}
async function releaseMasterRefreshLock(token){
  return releaseRedisLock(MASTER_REFRESH_LOCK_KEY,token);
}
async function cachedForeverDbMeta({fetchImpl=fetch}={}){
  let cached=await loadJson(META_KEY);
  if(cached&&fresh(cached,META_TTL_SECONDS*1000))return {...cached,cached:true};

  const lockToken=await acquireRedisLock(META_REFRESH_LOCK_KEY,META_REFRESH_LOCK_SECONDS);
  if(!lockToken){
    if(cached)return {...cached,cached:true,stale:true};
    // A concurrent cold start is already loading /meta. Wait briefly for its shared result
    // rather than spending another ForeverDB request.
    for(let attempt=0;attempt<20;attempt++){
      await new Promise(resolve=>setTimeout(resolve,75));
      const shared=await loadJson(META_KEY);
      if(shared)return {...shared,cached:true};
    }
    throw new Error('ForeverDB-Meta wird gerade durch eine andere Instanz geladen');
  }

  try{
    cached=await loadJson(META_KEY);
    if(cached&&fresh(cached,META_TTL_SECONDS*1000))return {...cached,cached:true};
    try{
      const meta=await fetchForeverDbMeta({fetchImpl});
      const value={...meta,generatedAt:new Date().toISOString()};
      await saveJson(META_KEY,value);
      return {...value,cached:false};
    }catch(error){
      if(cached){
        console.warn('ForeverDB-Meta vorübergehend nicht erreichbar – letzter bekannter Build bleibt aktiv:',String(error.message).slice(0,140));
        return {...cached,cached:true,stale:true};
      }
      throw error;
    }
  }finally{
    try{await releaseRedisLock(META_REFRESH_LOCK_KEY,lockToken)}catch(error){
      console.warn('ForeverDB-Meta-Sperre konnte nicht freigegeben werden:',String(error.message).slice(0,120));
    }
  }
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
  const parsed=redisConfigured()?await readCompactMaster(MASTER_KEY):null;
  return parsed?hydrateRecipeIndex(parsed):null;
}
export async function getCachedForeverDbMasterRecipeIndex(){
  const master=await loadMaster();
  return master?{...master,cached:true,refreshing:false,masterComplete:master.complete===true}:null;
}
async function loadDraft(){
  const parsed=redisConfigured()?await readCompactMaster(MASTER_DRAFT_KEY,{ttl:24*60*60}):null;
  return parsed?hydrateRecipeIndex(parsed):null;
}
async function persistMaster(index){
  const serial=serializableRecipeIndex({...index,complete:true});
  if(redisConfigured())await writeCompactMaster(MASTER_KEY,serial);
  if(redisConfigured())await redis(['DEL',MASTER_DRAFT_KEY,compressedMasterKey(MASTER_DRAFT_KEY)]);
  return hydrateRecipeIndex(serial);
}
async function persistDraft(index){
  const serial=serializableRecipeIndex({...index,complete:false});
  if(redisConfigured())await writeCompactMaster(MASTER_DRAFT_KEY,serial,{ttl:24*60*60});
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
  const requestStartedAt=Date.now();
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
  const draftTime=Date.parse(draft?.generatedAt||'');
  const advancedByConcurrentRequest=Number.isFinite(draftTime)&&draftTime>requestStartedAt;

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
  const observedProgress=normalizedSlugs(draft?.professionSlugs).join('|');
  if(advance&&advancedByConcurrentRequest){
    const active=master?.complete?master:draft;
    return {
      ...active,
      cached:Boolean(master?.complete),
      refreshing:true,
      masterComplete:Boolean(master?.complete),
      refreshProgress:{
        completed:normalizedSlugs(draft?.professionSlugs).length,
        total:PROFESSION_SLUGS.size
      }
    };
  }
  if(!advance){
    const active=master?.complete?master:draft;
    return {...active,cached:Boolean(master?.complete),refreshing:!active?.complete,masterComplete:Boolean(master?.complete)};
  }

  const lockToken=await acquireMasterRefreshLock();
  if(!lockToken){
    const active=master?.complete?master:draft;
    return {
      ...active,
      cached:Boolean(master?.complete),
      refreshing:true,
      masterComplete:Boolean(master?.complete),
      refreshProgress:{
        completed:normalizedSlugs(draft?.professionSlugs).length,
        total:PROFESSION_SLUGS.size
      }
    };
  }

  try{
    // A second function may have completed the work between our first read and lock acquisition.
    master=await loadMaster();
    if(master?.complete&&(!meta.build||!master.build||master.build===meta.build)){
      return {...master,cached:true,refreshing:false,masterComplete:true};
    }
    const lockedDraft=await loadDraft();
    if(lockedDraft&&(!meta.build||!lockedDraft.build||lockedDraft.build===meta.build)){
      const lockedProgress=normalizedSlugs(lockedDraft.professionSlugs).join('|');
      if(lockedProgress!==observedProgress){
        const active=master?.complete?master:lockedDraft;
        return {
          ...active,
          cached:Boolean(master?.complete),
          refreshing:true,
          masterComplete:Boolean(master?.complete),
          refreshProgress:{
            completed:normalizedSlugs(lockedDraft.professionSlugs).length,
            total:PROFESSION_SLUGS.size
          }
        };
      }
      draft=lockedDraft;
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
  }finally{
    try{await releaseMasterRefreshLock(lockToken)}catch(error){
      console.warn('ForeverDB-Master-Sperre konnte nicht freigegeben werden:',String(error.message).slice(0,120));
    }
  }
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
async function cachedBuildDelta(build,{fetchImpl=fetch}={}){
  if(!redisConfigured()||!/^\d+\.\d+\.\d+\.\d+$/.test(String(build||'')))return null;
  const key='dalton-dashboard:foreverdb:build-delta:v1:'+build;
  const stored=await loadJson(key);if(stored)return stored;
  const token=await acquireRedisLock(key+':lock',55);if(!token)return null;
  try{
    const again=await loadJson(key);if(again)return again;
    let delta;
    try{delta=await readBuildDelta(build,{fetchImpl})}catch(error){delta={build,complete:false,reason:'request-failed'}}
    await saveJson(key,delta,{ttl:delta.complete?7*86400:12*3600});
    console.info('ForeverDB Build-Differenz:',build,delta.complete?'vollständig: '+delta.total:delta.reason);
    return delta;
  }finally{await releaseRedisLock(key+':lock',token).catch(()=>{})}
}
async function reuseUnchangedDetail(type,id,build,prefix,{fetchImpl=fetch}={}){
  if(!build||!redisConfigured())return null;
  const delta=await cachedBuildDelta(build,{fetchImpl});
  if(!unchangedAcrossDelta(delta,type,id))return null;
  const old=await loadJson(buildScopedCacheKey(prefix,id,delta.previousBuild));
  if(old?.build!==delta.previousBuild||old?.[type]?.id!==id||!fresh(old,24*3600*1000))return null;
  // Preserve original observation time; do not extend the freshness lifetime.
  await saveJson(buildScopedCacheKey(prefix,id,build),{...old,build,reusedFromBuild:delta.previousBuild},{ttl:24*3600});
  return {...old[type],cached:true,reusedFromBuild:delta.previousBuild};
}

export async function cachedForeverDbItem(itemId,{build=null,fetchImpl=fetch}={}){
  const id=Number(itemId);
  if(!Number.isInteger(id)||id<=0)return null;
  const key=buildScopedCacheKey(ITEM_CACHE_PREFIX,id,build);
  const cached=await loadJson(key);
  if(cached?.item?.id===id)return {...cached.item,cached:true};
  const reused=await reuseUnchangedDetail('item',id,build,ITEM_CACHE_PREFIX,{fetchImpl}).catch(()=>null);
  if(reused)return reused;
  const result=await fetchForeverDbItem(id,{fetchImpl});
  if(!result?.item?.id)return null;
  // Never file a response from another build under a stale recipe-index build.
  if(!build||result.meta?.build===build)await saveJson(key,{item:result.item,generatedAt:new Date().toISOString(),build},{ttl:24*3600});
  return {...result.item,cached:false};
}
export async function cachedForeverDbSpell(spellId,{build=null,fetchImpl=fetch}={}){
  const id=Number(spellId);
  if(!Number.isInteger(id)||id<=0)return null;
  const key=buildScopedCacheKey(SPELL_CACHE_PREFIX,id,build);
  const cached=await loadJson(key);
  if(cached?.spell?.id===id)return {...cached.spell,cached:true};
  const reused=await reuseUnchangedDetail('spell',id,build,SPELL_CACHE_PREFIX,{fetchImpl}).catch(()=>null);
  if(reused)return reused;
  const result=await fetchForeverDbSpell(id,{fetchImpl});
  if(!result?.spell?.id)return null;
  // Never file a response from another build under a stale recipe-index build.
  if(!build||result.meta?.build===build)await saveJson(key,{spell:result.spell,generatedAt:new Date().toISOString(),build},{ttl:24*3600});
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
