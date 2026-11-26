import {VERSION_METADATA_KEY,addonVersionField,addonVersionMetadata} from './version-metadata.mjs';
import {redis,configured,CHARACTER_KEY,REFRESH_LOCK_KEY,REDIS_TYPE_GUARD,normalizedCharacterWrite} from './character-store.mjs';
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
function receipt(payload){return {id:payload.syncId||null,digest:digest(payload)}}
export function prepareAddonSync(previous,payload,{now=Date.now()}={}){
  const next=receipt(payload);
  const receipts=Array.isArray(previous?.receipts)?previous.receipts.slice(-RECEIPT_LIMIT):[];
  if(previous?.payload&&!receipts.length)receipts.push(receipt(previous.payload));
  const match=receipts.find(r=>next.id?r.id===next.id:!r.id&&r.digest===next.digest);
  if(match){
    if(match.digest!==next.digest)throw new Error('SYNC_CONFLICT: Synchronisations-ID mit anderem Inhalt');
    return {duplicate:true,payload:previous.payload,receipts};
  }
  const sections={...previous?.payload?.sections};
  for(const [name,value] of Object.entries(payload.sections||{})){
    const prior=sections[name];
    const before=epoch(prior?.capturedAt),after=epoch(value?.capturedAt);
    const same=prior&&digest(prior)===digest(value);
    if(Number.isFinite(after)&&(after>now+10*60*1000||after<now-30*24*60*60*1000))throw new Error('SYNC_CONFLICT: unplausible Aufnahmezeit '+name);
    if(Number.isFinite(before)&&(!Number.isFinite(after)||after<before||after===before&&!same)){
      if(same)continue;
      throw new Error('SYNC_CONFLICT: ältere oder widersprüchliche Aufnahme '+name);
    }
    if(!Number.isFinite(after)&&!same)throw new Error('SYNC_CONFLICT: Aufnahmezeit fehlt '+name);
    sections[name]=value;
  }
  return {duplicate:false,payload:{...payload,sections},receipts:[...receipts,next].slice(-RECEIPT_LIMIT)};
}
export async function saveAddonSyncState(characterSlug,payload,{lockToken=null,roster=null,receipts=[]}={}){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!characterSlug||!payload)throw new Error('Addon-Sync-Status unvollständig');
  const state={characterSlug,receivedAt:new Date().toISOString(),payload,receipts};
  const args=[JSON.stringify(state),addonVersionField(characterSlug),JSON.stringify(addonVersionMetadata(state))];
  const production=environmentScope()==='production';
  if(production&&!lockToken)throw new Error('Schreibsperre für Addon-Sync erforderlich');
  const guard=REDIS_TYPE_GUARD+"if not valid(KEYS[1],'string') or not valid(KEYS[2],'hash') then return redis.error_reply('INVALID_STORAGE_TYPE') end; ";
  const write="redis.call('HSET',KEYS[2],ARGV[2],ARGV[3]); redis.call('SET',KEYS[1],ARGV[1]); return 'OK'";
  const atomic=guard+"if redis.call('GET',KEYS[3])~=ARGV[4] then return redis.error_reply('REFRESH_LOCK_LOST') end; if not valid(KEYS[4],'string') then return redis.error_reply('INVALID_STORAGE_TYPE') end; if ARGV[5] then redis.call('HSET',KEYS[2],ARGV[2],ARGV[3],'characters',ARGV[6]); redis.call('MSET',KEYS[1],ARGV[1],KEYS[4],ARGV[5]); return 'OK' end; "+write;
  const result=production
    ?await redis(['EVAL',atomic,4,keyFor(characterSlug),VERSION_METADATA_KEY,REFRESH_LOCK_KEY,CHARACTER_KEY,...args,lockToken,...(roster?normalizedCharacterWrite(roster):[])])
    :await redis(['EVAL',guard+write,2,keyFor(characterSlug),VERSION_METADATA_KEY,...args]);
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
