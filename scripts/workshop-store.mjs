import {createHash} from 'node:crypto';
import {configured as redisConfigured,redis} from './character-store.mjs';
import {
  fetchForeverDbRecipeIndex,
  searchForeverDbRecipesForItem,
  serializableRecipeIndex,
  hydrateRecipeIndex
} from './workshop-foreverdb.mjs';
import {searchForeverDbItems} from './foreverdb-api.mjs';

const RECIPE_TTL_SECONDS=12*60*60;
const SEARCH_TTL_SECONDS=24*60*60;
const ITEM_RECIPE_TTL_SECONDS=24*60*60;

function now(){return Date.now()}
function fresh(value,maxAgeMs){
  const t=Date.parse(value?.generatedAt||'');
  return Number.isFinite(t)&&now()-t<maxAgeMs;
}
function digest(value){
  return createHash('sha1').update(String(value)).digest('hex');
}
function normalizedSlugs(slugs=[]){
  return [...new Set((Array.isArray(slugs)?slugs:[]).filter(Boolean))].sort();
}
function recipeKey(slugs){
  return 'dalton-dashboard:workshop:foreverdb:recipes:v2:'+digest(normalizedSlugs(slugs).join('|'));
}
function searchKey(query){
  return 'dalton-dashboard:workshop:foreverdb:search:v1:'+digest(String(query).trim().toLocaleLowerCase('de-DE'));
}
function itemRecipeKey(itemId){
  return 'dalton-dashboard:workshop:foreverdb:item-recipes:v1:'+Number(itemId);
}
export async function loadCachedRecipeIndex(professionSlugs=[]){
  if(!redisConfigured())return null;
  const slugs=normalizedSlugs(professionSlugs);
  const raw=await redis(['GET',recipeKey(slugs)]);
  if(!raw)return null;
  try{
    const parsed=JSON.parse(raw);
    return hydrateRecipeIndex(parsed);
  }catch{return null}
}
export async function getForeverDbRecipeIndex({professionSlugs=[],force=false,fetchImpl=fetch}={}){
  const slugs=normalizedSlugs(professionSlugs);
  const cached=await loadCachedRecipeIndex(slugs);
  if(!force&&cached&&fresh(cached,RECIPE_TTL_SECONDS*1000))return {...cached,cached:true};
  const index=await fetchForeverDbRecipeIndex({fetchImpl,professionSlugs:slugs});
  if(redisConfigured()){
    await redis(['SET',recipeKey(slugs),JSON.stringify(serializableRecipeIndex(index)),'EX',RECIPE_TTL_SECONDS]);
  }
  return {...index,cached:false};
}
export async function cachedForeverDbRecipeSearch(itemId,itemName,{fetchImpl=fetch}={}){
  const id=Number(itemId);
  if(!Number.isInteger(id)||id<=0)return {recipes:[],generatedAt:new Date().toISOString(),cached:false,requestCount:0};
  if(redisConfigured()){
    const key=itemRecipeKey(id);
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
