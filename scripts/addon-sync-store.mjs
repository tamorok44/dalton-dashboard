import {addonCompactKey,addonVersionMetadata} from './version-metadata.mjs';
import {redis,configured,CHARACTER_KEY,REFRESH_LOCK_KEY,REDIS_TYPE_GUARD,REDIS_COMPACT_READ,normalizedCharacterWrite} from './character-store.mjs';
import {createHash} from 'node:crypto';
import {addonSyncContentIdentity} from './addon-sync.mjs';
import {publicAddonSyncSummary} from './addon-sync.mjs';

function environmentScope(){
  return process.env.VERCEL_ENV==='production'?'production':'preview';
}
function keyFor(characterSlug){
  return 'dalton-dashboard:addon-sync:v1:'+environmentScope()+':'+characterSlug;
}

const RECEIPT_LIMIT=64;
function digest(value){return createHash('sha256').update(JSON.stringify(addonSyncContentIdentity(value))).digest('hex')}
function epoch(value){
  if(value===null||value===undefined||value==='')return NaN;
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n*1000:Date.parse(value);
}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
}
function receipt(payload){return {id:payload.syncId||null,digest:digest(payload),exactDigest:createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')};}
export function prepareAddonSync(previous,payload,{now=Date.now()}={}){
  const next=receipt(payload);
  const receipts=Array.isArray(previous?.receipts)?previous.receipts.slice(-RECEIPT_LIMIT):[];
  if(previous?.payload&&!receipts.length)receipts.push(receipt(previous.payload));
  const match=receipts.find(r=>next.id?r.id===next.id:!r.id&&r.digest===next.digest);
  if(match){
    if(match.digest!==next.digest)throw new Error('SYNC_CONFLICT: Synchronisations-ID mit anderem Inhalt');
    // The bridge's content ID deliberately ignores volatile timestamps. A
    // duplicate must never ingest newly supplied, unvalidated capture times.
    const replayPayload=match.exactDigest===next.exactDigest?payload:
      previous.payload?.syncId===next.id&&digest(previous.payload)===next.digest?previous.payload:null;
    return {duplicate:true,payload:previous.payload,receipts,replayPayload};
  }
  const sections={...previous?.payload?.sections};
  for(const [name,value] of Object.entries(payload.sections||{})){
    const prior=sections[name];
    const before=epoch(prior?.capturedAt),after=epoch(value?.capturedAt);
    const same=prior&&digest(prior)===digest(value);
    if(Number.isFinite(after)&&(after>now+10*60*1000||after<now-30*24*60*60*1000)){
      if(same)continue;
      throw new Error('SYNC_CONFLICT: unplausible Aufnahmezeit '+name);
    }
    if(Number.isFinite(before)&&(!Number.isFinite(after)||after<before||after===before&&!same)){
      if(same)continue;
      throw new Error('SYNC_CONFLICT: ältere oder widersprüchliche Aufnahme '+name);
    }
    // Older SavedVariables versions did not timestamp these two domains.
    // Accept an untimed first import as legacy evidence, never as newer data.
    if(!Number.isFinite(after)&&!same){
      if(!prior&&['locationHistory','instances'].includes(name)){sections[name]=value;continue;}
      throw new Error('SYNC_CONFLICT: Aufnahmezeit fehlt '+name);
    }
    sections[name]=value;
  }
  return {duplicate:false,payload:{...payload,sections},receipts:[...receipts,next].slice(-RECEIPT_LIMIT)};
}
export async function saveAddonSyncState(characterSlug,payload,{lockToken=null,roster=null,receipts=[],pendingObservations=false,receivedAt=new Date().toISOString()}={}){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!characterSlug||!payload)throw new Error('Addon-Sync-Status unvollständig');
  const state={characterSlug,receivedAt,payload,receipts,pendingObservations};
  const args=[JSON.stringify(state),characterSlug,JSON.stringify(addonVersionMetadata(state))];
  const production=environmentScope()==='production';
  if(production&&!lockToken)throw new Error('Schreibsperre für Addon-Sync erforderlich');
  const guard=REDIS_TYPE_GUARD+REDIS_COMPACT_READ+"if not valid(KEYS[1],'string') or not valid(KEYS[2],'string') then return redis.error_reply('INVALID_STORAGE_TYPE') end; ";
  const prepare="local meta=compact(KEYS[2]); if meta.addon~=nil and type(meta.addon)~='table' then return redis.error_reply('INVALID_COMPACT_METADATA') end; meta.addon=meta.addon or {}; meta.addon[ARGV[2]]=cjson.decode(ARGV[3]); ";
  const write="return redis.call('MSET',KEYS[1],ARGV[1],KEYS[2],cjson.encode(meta))";
  const atomic=guard+"if redis.call('GET',KEYS[3])~=ARGV[4] then return redis.error_reply('REFRESH_LOCK_LOST') end; if not valid(KEYS[4],'string') then return redis.error_reply('INVALID_STORAGE_TYPE') end; "+prepare+"if ARGV[5] then meta.characters=cjson.decode(ARGV[6]); return redis.call('MSET',KEYS[1],ARGV[1],KEYS[4],ARGV[5],KEYS[2],cjson.encode(meta)) end; "+write;
  const result=production
    ?await redis(['EVAL',atomic,4,keyFor(characterSlug),addonCompactKey(),REFRESH_LOCK_KEY,CHARACTER_KEY,...args,lockToken,...(roster?normalizedCharacterWrite(roster):[])])
    :await redis(['EVAL',guard+prepare+write,2,keyFor(characterSlug),addonCompactKey(),...args]);
  if(result!=='OK')throw new Error('Addon-Sync-Status nicht gespeichert');
  return state;
}

export async function loadAddonSyncState(characterSlug){
  if(!configured())return null;
  const value=await redis(['GET',keyFor(characterSlug)]);
  if(!value)return null;
  const parsed=JSON.parse(value);
  return parsed&&typeof parsed==='object'?parsed:null;
}

export async function loadAddonSyncStates(characterSlugs=[]){
  const entries=await Promise.all([...new Set(characterSlugs)].map(async slug=>{
    try{return [slug,await loadAddonSyncState(slug)]}
    catch(error){console.warn('Addon-Sync-Rohstatus konnte nicht geladen werden:',String(error.message).slice(0,140));return [slug,null]}
  }));
  return Object.fromEntries(entries.filter(([,state])=>state));
}

export async function loadPublicAddonSyncStates(characterSlugs=[]){
  const result={};
  for(const slug of characterSlugs){
    try{
      const state=await loadAddonSyncState(slug);
      if(state)result[slug]=publicAddonSyncSummary(state);
    }catch(error){
      console.warn('Addon-Sync-Status konnte nicht geladen werden:',String(error.message).slice(0,140));
    }
  }
  return result;
}
