import {configured,redis} from './character-store.mjs';

const MEDIA_KEY='dalton-dashboard:media-registry:v1';

function safePart(value){
  const text=String(value??'').trim();
  return /^[a-z0-9][a-z0-9:_-]{0,95}$/i.test(text)?text:null;
}
export function mediaField(entityType,entityId,role){
  const type=safePart(entityType),id=safePart(entityId),kind=safePart(role);
  return type&&id&&kind?type+':'+id+':'+kind:null;
}
export async function loadMediaRecord(entityType,entityId,role){
  const field=mediaField(entityType,entityId,role);
  if(!field||!configured())return null;
  const raw=await redis(['HGET',MEDIA_KEY,field]);
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{return null}
}
export async function saveMediaRecord(entityType,entityId,role,record={}){
  const field=mediaField(entityType,entityId,role);
  if(!field||!configured())return false;
  const value={
    entityType:String(entityType),
    entityId:String(entityId),
    role:String(role),
    sourceUrl:record.sourceUrl||null,
    storedUrl:record.storedUrl||null,
    contentType:record.contentType||null,
    updatedAt:new Date().toISOString()
  };
  await redis(['HSET',MEDIA_KEY,field,JSON.stringify(value)]);
  return true;
}

export async function loadMediaRecords(refs=[]){
  const unique=[...new Set(refs.map(ref=>mediaField(ref.type,ref.id,'icon')).filter(Boolean))];
  if(!configured()||!unique.length)return {};
  const values=await redis(['HMGET',MEDIA_KEY,...unique]);
  return Object.fromEntries(unique.map((key,i)=>{try{return [key,JSON.parse(values?.[i]||'null')]}catch{return [key,null]}}));
}
