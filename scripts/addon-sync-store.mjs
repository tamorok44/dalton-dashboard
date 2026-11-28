import {addonCompactKey,addonVersionMetadata,addonVersionField,VERSION_METADATA_KEY,parseVersionMetadata} from './version-metadata.mjs';
import {selectVersionEvidence} from './storage-reconciliation.mjs';
import {redis,configured,CHARACTER_KEY,addonSyncLockKey,REDIS_TYPE_GUARD,REDIS_COMPACT_READ,REDIS_PROFILE_GENERATION_GUARD,normalizedCharacterWrite} from './character-store.mjs';
import {createHash} from 'node:crypto';
import {addonSyncContentIdentity} from './addon-sync.mjs';
import {publicAddonSyncSummary} from './addon-sync.mjs';

function environmentScope(){
  return process.env.VERCEL_ENV==='production'?'production':'preview';
}
function keyFor(characterSlug){
  return 'dalton-dashboard:addon-sync:v1:'+environmentScope()+':'+characterSlug;
}

const summaryKey=slug=>'dalton-dashboard:addon-summary:v1:'+environmentScope()+':'+slug;
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
    return {duplicate:true,payload:previous.payload,receipts,replayPayload:match.observationsConfirmed===true?null:replayPayload,ignoredSections:match.ignoredSections||[]};
  }
  const sections={...previous?.payload?.sections},ignoredSections=[];
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
      if(!Number.isFinite(after)&&['locationHistory','instances'].includes(name)){
        ignoredSections.push({section:name,reason:'legacy_capture_time_missing'});
        continue;
      }
      throw new Error('SYNC_CONFLICT: ältere oder widersprüchliche Aufnahme '+name);
    }
    // Older SavedVariables versions did not timestamp these two domains.
    // Accept an untimed first import as legacy evidence, never as newer data.
    if(!Number.isFinite(after)&&!same){
      if(['locationHistory','instances'].includes(name)){
        if(!prior)sections[name]=value;
        else ignoredSections.push({section:name,reason:'legacy_capture_time_missing'});
        continue;
      }
      throw new Error('SYNC_CONFLICT: Aufnahmezeit fehlt '+name);
    }
    sections[name]=value;
  }
  return {duplicate:false,payload:{...payload,sections},receipts:[...receipts,{...next,ignoredSections}].slice(-RECEIPT_LIMIT),ignoredSections};
}
export async function saveAddonSyncState(characterSlug,payload,{lockToken=null,roster=null,expectedRoster,expectedState,receipts=[],pendingObservations=false,pendingObservationPayload=null,receivedAt=new Date().toISOString()}={}){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!characterSlug||!payload)throw new Error('Addon-Sync-Status unvollständig');
  const state={characterSlug,receivedAt,payload,receipts,pendingObservations,...(pendingObservations&&pendingObservationPayload?{pendingObservationPayload}:{})};
  const args=[JSON.stringify(state),characterSlug,JSON.stringify(addonVersionMetadata(state))];
  const summary=JSON.stringify({schema:1,summary:publicAddonSyncSummary(state)});
  const production=environmentScope()==='production';
  if(!lockToken)throw new Error('Schreibsperre für Addon-Sync erforderlich');
  if(!production&&roster)throw new Error('Preview darf keine Charakterdaten schreiben');
  if(!(typeof expectedRoster==='string'&&expectedRoster)&&!(expectedRoster===null&&!production))throw Error('PROFILE_BASE_REQUIRED');
  if(expectedState!==null&&!(typeof expectedState==='string'&&expectedState))throw Error('ADDON_BASE_REQUIRED');
  const guard=REDIS_TYPE_GUARD+REDIS_COMPACT_READ+"if not valid(KEYS[1],'string') or not valid(KEYS[2],'string') or not valid(KEYS[#KEYS],'string') then return redis.error_reply('INVALID_STORAGE_TYPE') end; ";
  const prepare="local meta=compact(KEYS[2]); if meta.addon~=nil and type(meta.addon)~='table' then return redis.error_reply('INVALID_COMPACT_METADATA') end; meta.addon=meta.addon or {}; meta.addon[ARGV[2]]=cjson.decode(ARGV[3]); ";
  const write="return redis.call('MSET',KEYS[1],ARGV[1],KEYS[2],cjson.encode(meta),KEYS[#KEYS],ARGV[5])";
  // Bind both roster and Add-on state to the exact read under the shared
  // lock. A valid-looking but stale/false-null response cannot erase either.
  const atomic=guard+REDIS_PROFILE_GENERATION_GUARD+"if redis.call('GET',KEYS[3])~=ARGV[4] then return redis.error_reply('REFRESH_LOCK_LOST') end; if not valid(KEYS[4],'string') then return redis.error_reply('INVALID_STORAGE_TYPE') end; assertRosterBase(KEYS[4],ARGV[8],ARGV[10]=='preview'); local oldState=redis.call('GET',KEYS[1]); if (oldState and oldState~=ARGV[9]) or (not oldState and ARGV[9]~='') then return redis.error_reply('ADDON_BASE_CHANGED') end; "+prepare+"if ARGV[6]~='' then assertGeneration(KEYS[4],ARGV[6],ARGV[7],ARGV[8]); meta.characters=cjson.decode(ARGV[7]); return redis.call('MSET',KEYS[1],ARGV[1],KEYS[4],ARGV[6],KEYS[2],cjson.encode(meta),KEYS[5],ARGV[5]) end; "+write;
  const result=await redis(['EVAL',atomic,5,keyFor(characterSlug),addonCompactKey(),addonSyncLockKey(),CHARACTER_KEY,summaryKey(characterSlug),...args,lockToken,summary,...(roster?normalizedCharacterWrite(roster):['','']),expectedRoster??'',expectedState??'',production?'production':'preview']);
  if(result!=='OK')throw new Error('Addon-Sync-Status nicht gespeichert');
  return state;
}

export async function loadAddonSyncStateForWrite(characterSlug){
  if(!configured())throw Error('Redis-Datenbank nicht konfiguriert; Addon-Bestand nicht bestätigt');
  const raw=await redis(['GET',keyFor(characterSlug)]);
  if(raw===null)return {state:null,raw:null};
  const state=JSON.parse(raw);
  if(!state||typeof state!=='object'||Array.isArray(state)||state.characterSlug!==characterSlug||!state.payload||typeof state.payload!=='object'||Array.isArray(state.payload)||!Number.isFinite(Date.parse(state.receivedAt)))throw Error('ADDON_BASE_INVALID');
  return {state,raw};
}
export async function loadAddonSyncState(characterSlug){
  if(!configured())return null;
  return (await loadAddonSyncStateForWrite(characterSlug)).state;
}

export async function loadAddonSyncStates(characterSlugs=[]){
  const entries=await Promise.all([...new Set(characterSlugs)].map(async slug=>{
    try{return [slug,await loadAddonSyncState(slug)]}
    catch(error){console.warn('Addon-Sync-Rohstatus konnte nicht geladen werden:',String(error.message).slice(0,140));return [slug,null]}
  }));
  return Object.fromEntries(entries.filter(([,state])=>state));
}

// Read only the bounded projection on the warm path. Old writers and
// missing/corrupt projections use the authoritative raw state, never an
// unverified cache. No migration write on public reads.
export async function loadPublicAddonSyncStates(characterSlugs=[]){
  const slugs=[...new Set(characterSlugs)].filter(slug=>typeof slug==='string'&&slug);
  if(!configured()||!slugs.length)return {};
  const result={},missing=new Set(slugs);
  try{
    const [rows,legacy]=await Promise.all([
      redis(['MGET',addonCompactKey(),...slugs.map(summaryKey)]),
      redis(['HMGET',VERSION_METADATA_KEY,...slugs.map(addonVersionField)])
    ]);
    const core=JSON.parse(rows?.[0]||'{}');
    if(!Array.isArray(rows)||rows.length!==slugs.length+1||!Array.isArray(legacy)||legacy.length!==slugs.length)throw Error('Ungültige Projektionsantwort');
    for(let i=0;i<slugs.length;i++){
      const slug=slugs[i],modern=core?.addon?.[slug];
      const old=parseVersionMetadata(legacy[i]);
      if(legacy[i]!=null&&!old)continue;
      if(!modern||typeof modern.receivedAt!=='string'||!Number.isFinite(Date.parse(modern.receivedAt)))continue;
      const selected=selectVersionEvidence(modern,old,'receivedAt');
      if(selected.conflict||selected.value!==modern)continue;
      let envelope;try{envelope=JSON.parse(rows[i+1])}catch{continue}
      const summary=envelope?.summary;
      if(envelope?.schema!==1||summary?.characterSlug!==slug||summary.syncId!==(modern.syncId??null)||summary.receivedAt!==modern.receivedAt||!Array.isArray(summary.lockouts)||!Array.isArray(summary.visitedInstances))continue;
      result[slug]=summary;missing.delete(slug);
    }
  }catch(error){
    console.warn('Addon-Projektion nicht verfügbar:',String(error.message).slice(0,120));
  }
  const raw=await loadAddonSyncStates([...missing]);
  for(const [slug,state] of Object.entries(raw))result[slug]=publicAddonSyncSummary(state);
  return result;
}
