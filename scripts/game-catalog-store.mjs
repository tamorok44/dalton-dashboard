import {configured,redis} from './character-store.mjs';

const CATALOG_PREFIX='dalton-dashboard:game-catalog:v1:';
const CATALOG_META='dalton-dashboard:game-catalog:meta:v1';
const allowedTypes=new Set(['item','faction','quest','profession','recipe','spell','talent','pet','pet-family']);

function cleanId(value){
  if(Number.isInteger(Number(value))&&Number(value)>0)return String(Number(value));
  if(typeof value==='string'&&/^[a-z0-9][a-z0-9:_-]{1,79}$/i.test(value))return value;
  return null;
}
function cleanType(value){
  const type=String(value||'').toLowerCase();
  return allowedTypes.has(type)?type:null;
}
export function catalogField(type,id){
  const t=cleanType(type),key=cleanId(id);
  return t&&key?t+':'+key:null;
}
export function normalizeCatalogRecord(record={}){
  const type=cleanType(record.type),id=cleanId(record.id);
  if(!type||!id)return null;
  const normalized={type,id};
  if(typeof record.name==='string'&&record.name.trim())normalized.name=record.name.trim();
  if(typeof record.sourceName==='string'&&record.sourceName.trim())normalized.sourceName=record.sourceName.trim();
  if(typeof record.source==='string'&&record.source.trim())normalized.source=record.source.trim();
  if(typeof record.build==='string'&&record.build.trim())normalized.build=record.build.trim();
  if(record.media&&typeof record.media==='object'){
    const media={};
    for(const [key,value] of Object.entries(record.media)){
      if(typeof value==='string'&&value.startsWith('https://'))media[key]=value;
    }
    if(Object.keys(media).length)normalized.media=media;
  }
  for(const key of ['quality','familyId','spellId','craftedItemId','slug','side','forever','crestKind','href']){
    if(record[key]!==undefined&&record[key]!==null)normalized[key]=record[key];
  }
  return normalized;
}
export function collectCatalogRecords(data={}){
  const byKey=new Map();
  const add=record=>{
    const normalized=normalizeCatalogRecord(record);
    const key=normalized&&catalogField(normalized.type,normalized.id);
    if(!key)return;
    const prior=byKey.get(key)||{};
    byKey.set(key,{...prior,...normalized,media:{...(prior.media||{}),...(normalized.media||{})}});
  };
  for(const character of Array.isArray(data.characters)?data.characters:[]){
    for(const item of Array.isArray(character.equipment)?character.equipment:[]){
      if(item?.id)add({type:'item',id:item.id,name:item.item,sourceName:item.sourceName,quality:item.quality,source:'Blizzard Forever',media:{iconSourceUrl:item.icon,iconStoredUrl:item.storedIcon}});
    }
    for(const reputation of Array.isArray(character.reputations)?character.reputations:[]){
      if(reputation?.id)add({type:'faction',id:reputation.id,name:reputation.name,source:'Blizzard Forever'});
    }
    for(const profession of Array.isArray(character.professions)?character.professions:[]){
      if(profession?.id)add({type:'profession',id:profession.id,name:profession.name,source:'Blizzard Forever'});
      for(const recipe of Array.isArray(profession?.knownRecipes)?profession.knownRecipes:[]){
        if(recipe?.id)add({type:'recipe',id:recipe.id,name:recipe.name,craftedItemId:recipe?.craftedItem?.id,source:'Blizzard Forever'});
        if(recipe?.craftedItem?.id)add({type:'item',id:recipe.craftedItem.id,name:recipe.craftedItem.name,source:'Blizzard Forever'});
        for(const reagent of Array.isArray(recipe?.reagents)?recipe.reagents:[]){
          if(reagent?.id)add({type:'item',id:reagent.id,name:reagent.name,source:'Blizzard Forever'});
        }
      }
    }
    for(const quest of Array.isArray(character.activeQuests)?character.activeQuests:[]){
      if(quest?.id)add({type:'quest',id:quest.id,name:quest.name,source:'Blizzard Forever'});
    }
    for(const tree of Array.isArray(character.talentDetails)?character.talentDetails:[]){
      for(const talent of Array.isArray(tree?.talents)?tree.talents:[]){
        if(talent?.id)add({type:'talent',id:talent.id,name:talent.name,spellId:talent.spellId,source:'Blizzard Forever'});
        if(talent?.spellId)add({type:'spell',id:talent.spellId,name:talent.name,source:'Blizzard Forever'});
      }
    }
    const pets=character?.hunterPets||{};
    for(const pet of [...(Array.isArray(pets.active)?pets.active:[]),...(Array.isArray(pets.stable)?pets.stable:[])]){
      if(pet?.family?.id)add({type:'pet-family',id:pet.family.id,name:pet.family.name,source:'Blizzard Forever'});
      const petId=pet?.creatureId||pet?.id;
      if(petId)add({type:'pet',id:petId,name:pet.name,familyId:pet?.family?.id,source:'Blizzard Forever',media:{iconSourceUrl:pet.iconUrl,iconStoredUrl:pet.storedIconUrl,renderSourceUrl:pet.imageUrl,renderStoredUrl:pet.storedImageUrl}});
    }
  }
  return [...byKey.values()].sort((a,b)=>a.type.localeCompare(b.type)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
}
export async function saveCatalogRecords(records=[],{build=null,source='runtime'}={}){
  const clean=(Array.isArray(records)?records:[]).map(normalizeCatalogRecord).filter(Boolean);
  if(!clean.length||!configured())return {saved:0};
  const groups=new Map();
  for(const record of clean){
    const list=groups.get(record.type)||[];
    list.push(record);groups.set(record.type,list);
  }
  let saved=0;
  for(const [type,list] of groups){
    const args=['HSET',CATALOG_PREFIX+type];
    for(const record of list)args.push(record.id,JSON.stringify({...record,...(build?{build}:{}),source:record.source||source}));
    await redis(args);
    saved+=list.length;
    await redis(['HSET',CATALOG_META,type,JSON.stringify({updatedAt:new Date().toISOString(),build:build||null,source,count:list.length})]);
  }
  return {saved};
}
export async function loadCatalogRecords(type,ids=[]){
  const t=cleanType(type),keys=[...new Set((Array.isArray(ids)?ids:[]).map(cleanId).filter(Boolean))];
  if(!t||!keys.length||!configured())return {};
  const values=await redis(['HMGET',CATALOG_PREFIX+t,...keys]);
  const out={};
  keys.forEach((id,index)=>{
    const raw=Array.isArray(values)?values[index]:null;
    if(!raw)return;
    try{out[id]=JSON.parse(raw)}catch{}
  });
  return out;
}

export async function loadAllCatalogRecords(type){
  const t=cleanType(type);
  if(!t||!configured())return {};
  const values=await redis(['HGETALL',CATALOG_PREFIX+t]);
  if(!Array.isArray(values))return {};
  const out={};
  for(let i=0;i<values.length;i+=2){
    const id=values[i],raw=values[i+1];
    if(!id||!raw)continue;
    try{out[id]=JSON.parse(raw)}catch{}
  }
  return out;
}
export async function loadCatalogMeta(){
  if(!configured())return {};
  const raw=await redis(['HGETALL',CATALOG_META]);
  if(!Array.isArray(raw))return {};
  const out={};
  for(let i=0;i<raw.length;i+=2){
    try{out[raw[i]]=JSON.parse(raw[i+1])}catch{}
  }
  return out;
}
export async function archiveCatalogSnapshot(type,records,{build='unversioned'}={}){
  const t=cleanType(type);
  if(!t||!Array.isArray(records))throw new Error('Ungültiger Katalog-Snapshot');
  if(!(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN))return null;
  const safeBuild=String(build||'unversioned').replace(/[^a-z0-9._-]+/gi,'-');
  const {put}=await import('@vercel/blob');
  const body=Buffer.from(JSON.stringify({type:t,build,generatedAt:new Date().toISOString(),records},null,2));
  const result=await put('catalog/'+safeBuild+'/'+t+'.json',body,{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
  return result.url;
}
