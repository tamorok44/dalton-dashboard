import {createHash} from 'node:crypto';
import {configured as redisConfigured,redis} from './character-store.mjs';
import {fetchForeverDbRecipeIndex,serializableRecipeIndex,hydrateRecipeIndex} from './workshop-foreverdb.mjs';
import {searchForeverDbItems} from './foreverdb-api.mjs';

const RECIPE_KEY='dalton-dashboard:workshop:foreverdb:recipes:v1';
const RECIPE_TTL_SECONDS=12*60*60;
const SEARCH_TTL_SECONDS=24*60*60;

function now(){return Date.now()}
function fresh(value,maxAgeMs){
  const t=Date.parse(value?.generatedAt||'');
  return Number.isFinite(t)&&now()-t<maxAgeMs;
}
function searchKey(query){
  const hash=createHash('sha1').update(String(query).trim().toLocaleLowerCase('de-DE')).digest('hex');
  return 'dalton-dashboard:workshop:foreverdb:search:v1:'+hash;
}
export async function loadCachedRecipeIndex(){
  if(!redisConfigured())return null;
  const raw=await redis(['GET',RECIPE_KEY]);
  if(!raw)return null;
  try{
    const parsed=JSON.parse(raw);
    return hydrateRecipeIndex(parsed);
  }catch{return null}
}
export async function getForeverDbRecipeIndex({force=false,fetchImpl=fetch}={}){
  const cached=await loadCachedRecipeIndex();
  if(!force&&cached&&fresh(cached,RECIPE_TTL_SECONDS*1000))return {...cached,cached:true};
  const index=await fetchForeverDbRecipeIndex({fetchImpl});
  if(redisConfigured()){
    await redis(['SET',RECIPE_KEY,JSON.stringify(serializableRecipeIndex(index)),'EX',RECIPE_TTL_SECONDS]);
  }
  return {...index,cached:false};
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
