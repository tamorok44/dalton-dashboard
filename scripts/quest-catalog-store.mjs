import {configured,redis} from './character-store.mjs';

const CATALOG_KEY='dalton-dashboard:quest-catalog:v1';
const LATEST_KEY='dalton-dashboard:quest-catalog:latest:v1';

function asRefs(refs=[]){
  return [...new Map((Array.isArray(refs)?refs:[])
    .filter(ref=>ref?.type==='quest'&&Number.isInteger(Number(ref?.id))&&typeof ref?.href==='string')
    .map(ref=>[Number(ref.id),ref])).values()];
}

export function questCatalogIdentity(ref,{locale='de_DE'}={}){
  const id=Number(ref?.id);
  if(!Number.isInteger(id)||typeof ref?.href!=='string')return null;
  let url;
  try{url=new URL(ref.href)}catch{return null}
  const namespace=url.searchParams.get('namespace')||'';
  if(!/-forever-eu$/.test(namespace))return null;
  return {
    id,
    locale,
    namespace,
    field:locale+':'+namespace+':'+id,
    latestField:locale+':'+id
  };
}

export async function loadQuestCatalog(refs,{locale='de_DE'}={}){
  const identities=asRefs(refs).map(ref=>questCatalogIdentity(ref,{locale})).filter(Boolean);
  if(!identities.length||!configured())return {};
  const values=await redis(['HMGET',CATALOG_KEY,...identities.map(x=>x.field)]);
  const out={};
  identities.forEach((identity,index)=>{
    const raw=Array.isArray(values)?values[index]:null;
    if(!raw)return;
    try{out[identity.id]=JSON.parse(raw)}catch{}
  });
  return out;
}

export async function loadQuestCatalogByIds(ids,{locale='de_DE'}={}){
  const unique=[...new Set((Array.isArray(ids)?ids:[]).map(Number).filter(Number.isInteger))];
  if(!unique.length||!configured())return {};
  const pointers=await redis(['HMGET',LATEST_KEY,...unique.map(id=>locale+':'+id)]);
  const fields=Array.isArray(pointers)?pointers.filter(Boolean):[];
  if(!fields.length)return {};
  const values=await redis(['HMGET',CATALOG_KEY,...fields]);
  const out={};
  fields.forEach((field,index)=>{
    const raw=Array.isArray(values)?values[index]:null;
    if(!raw)return;
    try{
      const record=JSON.parse(raw);
      if(Number.isInteger(Number(record?.id)))out[Number(record.id)]=record;
    }catch{}
  });
  return out;
}

export async function saveQuestCatalog(records=[]){
  const clean=(Array.isArray(records)?records:[]).filter(record=>
    Number.isInteger(Number(record?.id))&&record?.locale&&record?.namespace
  );
  if(!clean.length||!configured())return {saved:0};
  const catalogArgs=['HSET',CATALOG_KEY];
  const latestArgs=['HSET',LATEST_KEY];
  for(const record of clean){
    const field=record.locale+':'+record.namespace+':'+Number(record.id);
    catalogArgs.push(field,JSON.stringify(record));
    latestArgs.push(record.locale+':'+Number(record.id),field);
  }
  await redis(catalogArgs);
  await redis(latestArgs);
  return {saved:clean.length};
}
