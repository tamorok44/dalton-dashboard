import {randomUUID} from 'node:crypto';
import {configured,redis} from './character-store.mjs';
import {foreverDbConfigured,fetchForeverDbQuest} from './foreverdb-api.mjs';
import {blizzardApiConfigured,fetchForeverCreatureDisplay,fetchForeverMediaIcon} from './blizzard-api.mjs';
import {imageStoreConfigured,resolveMediaAsset,readAssetRecords,mediaAssetKey,sourceImageAllowed,rememberMissingAsset} from './media-resolver.mjs';
import {classicNpcDisplayId} from './classic-npc-display-ids.mjs';

const KEY='dalton-dashboard:quest-start-media:v1';
const LOCK=KEY+':lock';
const DAY=86400000;
// Warcraft Wiki's archived WoW quest marker; verified PNG from the named file.
const QUEST_MARKER={type:'ui',id:'quest-available',role:'icon'};
const QUEST_MARKER_SOURCE='https://warcraft.wiki.gg/images/5/51/Availablequesticon.png';
function id(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null}
function text(value){return typeof value==='string'&&value.trim()?value.trim().slice(0,200):null}
function field(q){return q.locale+':'+q.namespace+':'+q.id}
function refKey(ref){return mediaAssetKey(ref.type,ref.id,ref.role)}
export function questStartMediaReference(quest,expectedId){
  if(id(quest?.id??quest?.questId)!==id(expectedId))return null;
  const raw=quest.starts;
  const entries=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
  const starts=new Map();
  for(const entry of entries){
    if(!['npc','item','object'].includes(entry?.type)||!id(entry?.id))return null;
    const type=entry.type;
    const key=type+':'+id(entry.id);
    const source=text(entry.source);
    const evidence=entry.seenInForever===true||source==='forever'?'forever-confirmed':entry.seenInForever===false||/classic|cmangos/i.test(source||'')?'classic-unconfirmed':'unknown';
    const candidate={type,id:id(entry.id),name:text(entry.name),evidence,role:type==='npc'?'portrait':'icon'};
    if(!starts.has(key)||candidate.evidence==='forever-confirmed')starts.set(key,candidate);
  }
  if(starts.size!==1)return null;
  const start=[...starts.values()][0];
  return start.type==='object'?null:start;
}
function parse(raw){try{return JSON.parse(raw)}catch{return null}}
function fresh(record){const age=Date.now()-Date.parse(record?.checkedAt||'');return Number.isFinite(age)&&age>=0&&age<(record?.ref?7:1)*DAY}
function freshNegative(record){const age=Date.now()-Date.parse(record?.updatedAt||'');return record&&!record.storedUrl&&age>=0&&age<(record.sourceUrl?7:1)*DAY}
async function sourceFor(ref,namespace){
  if(ref.type==='item'){
    return blizzardApiConfigured()?fetchForeverMediaIcon('item',ref.id,{namespace}):null;
  }
  // Forever display data wins; the existing Classic visual fallback never
  // invents the relationship between a quest and its giver.
  const display=(blizzardApiConfigured()?await fetchForeverCreatureDisplay(ref.id,{namespace}).catch(()=>null):null)||classicNpcDisplayId(ref.id);
  return display?'https://render-eu.worldofwarcraft.com/npcs/zoom/creature-display-'+display+'.jpg':null;
}
export async function enrichQuestMedia(catalog={}, {allowFetch=true,maxNew=4}={}){
  const entries=Object.values(catalog).filter(q=>id(q?.id)&&q.locale==='de_DE'&&/^static-[a-z0-9._]+-forever-eu$/i.test(q.namespace||''));
  if(!configured()||!entries.length)return catalog;
  const fields=entries.map(field);
  const values=await redis(['HMGET',KEY,...fields]);
  const records=Object.fromEntries(fields.map((f,i)=>[f,parse(values?.[i])]));
  const canFetch=allowFetch&&imageStoreConfigured();
  const missing=entries.filter(q=>!fresh(records[field(q)])).slice(0,maxNew);
  const token=randomUUID();
  let locked=false;
  if(canFetch&&foreverDbConfigured()&&missing.length)locked=(await redis(['SET',LOCK,token,'NX','EX',60]))==='OK';
  try{
    if(locked){
      const writes=['HSET',KEY];
      await Promise.all(missing.map(async q=>{
        try{
          const result=await fetchForeverDbQuest(q.id);
          if(id(result.quest?.id??result.quest?.questId)!==id(q.id))return;
          const record={checkedAt:new Date().toISOString(),build:result.meta?.build||null,ref:questStartMediaReference(result.quest,q.id)};
          records[field(q)]=record;writes.push(field(q),JSON.stringify(record));
        }catch{/* Temporary upstream errors do not become a confirmed absence. */}
      }));
      if(writes.length>2)await redis(writes);
    }
    const refs=new Map();
    for(const q of entries){
      const r=records[field(q)];
      if(r?.ref&&!refs.has(refKey(r.ref)))refs.set(refKey(r.ref),{ref:r.ref,namespace:q.namespace});
    }
    const markerKey=refKey(QUEST_MARKER);
    const assets=await readAssetRecords([...refs.values()].map(x=>x.ref).concat(QUEST_MARKER));
    const images=Object.fromEntries(Object.entries(assets).filter(([,r])=>r?.storedUrl).map(([k,r])=>[k,r.storedUrl]));
    // Cold image work is independently bounded and serialized; warm reads use one HMGET.
    if(canFetch&&!locked&&[...refs.keys(),markerKey].some(k=>!images[k]&&!freshNegative(assets[k])))locked=(await redis(['SET',LOCK,token,'NX','EX',60]))==='OK';
    if(canFetch&&locked){
      if(!images[markerKey]&&!freshNegative(assets[markerKey])){
        try{const url=await resolveMediaAsset({entityType:QUEST_MARKER.type,entityId:QUEST_MARKER.id,role:QUEST_MARKER.role,sourceUrl:QUEST_MARKER_SOURCE});if(url)images[markerKey]=url}catch{}
      }
      await Promise.all([...refs.entries()].filter(([k])=>!images[k]&&!freshNegative(assets[k])).slice(0,maxNew).map(async ([k,{ref,namespace}])=>{
        try{
          const source=await sourceFor(ref,namespace);
          if(sourceImageAllowed(source)){
            const url=await resolveMediaAsset({entityType:ref.type,entityId:ref.id,role:ref.role,sourceUrl:source});
            if(url)images[k]=url;
          }else await rememberMissingAsset(ref.type,ref.id,ref.role,'quest-source-v1');
        }catch{/* Fallback stays visible. */}
      }));
    }
    return Object.fromEntries(Object.entries(catalog).map(([key,q])=>{
      const r=records[field(q)],start=r?.ref;
      return [key,{...q,questImageUrl:start?images[refKey(start)]||null:null,questFallbackIconUrl:images[markerKey]||null,questImageKind:start?.type||null,questStartName:start?.name||null,questStartEvidence:start?.evidence||null,questStartSource:start?'ForeverDB.net':null}];
    }));
  }finally{
    if(locked)await redis(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,LOCK,token]).catch(()=>{});
  }
}
