import {selectDailyReceipt} from './storage-reconciliation.mjs';
import {rosterMatches} from './daily-roster.mjs';
import {VERSION_METADATA_KEY,CORE_COMPACT_KEY,characterVersionMetadata} from './version-metadata.mjs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {runRedisRequest,assertSyncBudget,armSyncFence,fenceRedisCommand,ADDON_LEASE_SECONDS,SERVER_CLOCK_MARGIN_MS} from './sync-deadline.mjs';
import {normalizeVerifiedPlayerTerminology} from './player-terminology.mjs';
const require=createRequire(import.meta.url);
const initial=require('../data/characters.json');
export const CHARACTER_KEY='dalton-dashboard:characters:v1';
export const REFRESH_LOCK_KEY='dalton-dashboard:refresh:lock';
export const addonSyncLockKey=()=>process.env.VERCEL_ENV==='production'?REFRESH_LOCK_KEY:REFRESH_LOCK_KEY+':preview-addon';
const KEY=CHARACTER_KEY,LOCK=REFRESH_LOCK_KEY;
export const DAILY_PROFILE_RECEIPT_FIELD='daily-profile-refresh';
const COOLDOWN='dalton-dashboard:refresh:manual:cooldown';

// A deployed preview must never silently use the ordinary production
// binding. Only explicit, distinct preview credentials are eligible.
// Distinct URLs are a guard, not a proof of separate physical stores.
export function redisConnection(env=process.env){
  const standardUrl=env.KV_REST_API_URL||env.UPSTASH_REDIS_REST_URL;
  const standardToken=env.KV_REST_API_TOKEN||env.UPSTASH_REDIS_REST_TOKEN;
  if((env.VERCEL||env.VERCEL_ENV)&&!['production','preview','development'].includes(env.VERCEL_ENV))return null;
  const preview=env.VERCEL_ENV==='preview'||env.VERCEL_ENV==='development';
  const url=preview?env.DALTON_PREVIEW_REDIS_REST_URL:standardUrl;
  const token=preview?env.DALTON_PREVIEW_REDIS_REST_TOKEN:standardToken;
  if(!url||!token)return null;
  try{
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)return null;
    if(preview){
      // Required independently provisioned production identity survives removal
      // of the production credentials from Preview. Missing reference = deny.
      const productionOrigin=env.DALTON_PRODUCTION_REDIS_ORIGIN;
      if(!productionOrigin)return null;
      const reference=new URL(productionOrigin);
      if(reference.protocol!=='https:'||reference.origin!==productionOrigin||reference.username||reference.password)return null;
      const forbiddenHosts=[reference.hostname,...[env.KV_REST_API_URL,env.UPSTASH_REDIS_REST_URL,env.KV_URL].filter(Boolean).map(value=>new URL(value).hostname)];
      const canonicalHost=value=>value.toLowerCase().replace(/\.+$/,'');
      if(forbiddenHosts.some(host=>canonicalHost(host)===canonicalHost(parsed.hostname)))return null;
      if([env.KV_REST_API_TOKEN,env.UPSTASH_REDIS_REST_TOKEN,env.KV_REST_API_READ_ONLY_TOKEN].some(value=>value&&token===value))return null;
    }
    return {url:parsed.origin+parsed.pathname.replace(/\/$/,''),token};
  }catch{return null;}
}
function settings(){
  const config=redisConnection();
  if(!config)throw new Error('Redis-Datenbank nicht konfiguriert oder Umgebung nicht isoliert');
  return config;
}
export async function redis(command,{control=false}={}){
  const {url,token}=settings();
  const wire=control?command:fenceRedisCommand(command);
  return runRedisRequest(async signal=>{
    const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(wire),redirect:'error',signal});
    if(!response.ok)throw new Error('Redis HTTP '+response.status);
    const payload=await response.json();
    // A transport success is not a Redis result. In particular {} is not
    // an absent key. Reject ambiguous envelopes before any caller can
    // interpret undefined, false or an empty object as missing data.
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('REDIS_RESPONSE_UNCONFIRMED');
    if(Object.hasOwn(payload,'error'))throw Error('Redis: '+String(payload.error).slice(0,120));
    if(!Object.hasOwn(payload,'result')||payload.result===undefined)throw Error('REDIS_RESPONSE_UNCONFIRMED');
    const result=payload.result,op=String(command[0]).toUpperCase();
    if((op==='GET'||op==='HGET')&&result!==null&&typeof result!=='string')throw Error('REDIS_READ_UNCONFIRMED');
    return result;
  });
}
export function configured(){return Boolean(redisConnection())}
function decodeStoredCharacters(value){
  const data=JSON.parse(value);
  if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.characters)||!data.characters.length||!Number.isFinite(Date.parse(data.generatedAt)))throw Error('Gespeicherter Datensatz ist ungültig');
  const slugs=data.characters.map(c=>c?.slug);
  if(slugs.some(slug=>typeof slug!=='string'||! /^[a-z0-9-]+$/i.test(slug))||new Set(slugs).size!==slugs.length)throw Error('Gespeicherter Charakterbestand ist ungültig');
  return normalizeVerifiedPlayerTerminology(data);
}
function bundledCharacters(){return {data:normalizeVerifiedPlayerTerminology(initial),fallback:true};}
export async function loadCharacters(){
  if(!configured())return bundledCharacters();
  const raw=await redis(['GET',KEY]);
  if(raw===null)return bundledCharacters();
  return {data:decodeStoredCharacters(raw),fallback:false};
}
// Mutating operations must obtain an authoritative baseline. Ordinary
// production writes never initialize a missing roster from bundled data.
// Isolated preview may use bundled identities ONLY on explicit absence.
export async function loadCharactersForWrite({allowPreviewMissing=false}={}){
  if(!configured())throw Error('Redis-Datenbank nicht konfiguriert; Profilbestand nicht bestätigt');
  const raw=await redis(['GET',KEY]);
  if(raw===null){
    if(allowPreviewMissing&&['preview','development'].includes(process.env.VERCEL_ENV))return {...bundledCharacters(),raw:null};
    throw Error('PROFILE_BASE_MISSING');
  }
  return {data:decodeStoredCharacters(raw),raw,fallback:false};
}
// A unique, short-lived permit is created before attempting the shared
// lease. A delayed acquisition cannot recreate a lease after revocation.
// Both expire at the absolute server-clock work cutoff, not 22s after
// an arbitrarily delayed SET. TIME is sampled before issuance; no local
// wall-clock synchronization is assumed.
const permitKey=(key,token)=>key+':permit:'+token;
// A revocation marker survives every admissible original issue deadline,
// including delayed duplicate delivery. Never recreate the same permit.
const permitRevoked='revoked';
const maxLeaseMs=ADDON_LEASE_SECONDS*1000;
const permitRevocationMs=120000; // bounded replay guard, including the tested +40s skew
const SERVER_NOW="local t=redis.call('TIME'); local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000); ";
const ISSUE_ADDON_PERMIT="-- addon-permit-issue:v1\n"+SERVER_NOW+"local untilMs=tonumber(ARGV[1]); if not untilMs or untilMs<=now or untilMs-now>tonumber(ARGV[2]) then return redis.error_reply('ADDON_SYNC_DEADLINE') end; return redis.call('SET',KEYS[1],ARGV[1],'PXAT',ARGV[1],'NX')";
const ACQUIRE_ADDON="-- addon-lock-acquire:v1\n"+SERVER_NOW+"local untilMs=tonumber(ARGV[2]); if not untilMs or untilMs<=now or untilMs-now>tonumber(ARGV[3]) then return redis.error_reply('ADDON_SYNC_DEADLINE') end; if redis.call('GET',KEYS[2])~=ARGV[2] then return redis.error_reply('ADDON_PERMIT_REVOKED') end; return redis.call('SET',KEYS[1],ARGV[1],'PXAT',ARGV[2],'NX')";
export async function acquireRefreshLock({addon=false,token=randomUUID()}={}){
  const key=addon?addonSyncLockKey():LOCK;
  let deadlineMs=null;
  try{
    let ok;
    if(addon){
      const sampled=await redis(['TIME'],{control:true});
      const sec=Number(sampled?.[0]),micros=Number(sampled?.[1]);
      if(!Array.isArray(sampled)||sampled.length!==2||!Number.isSafeInteger(sec)||sec<=0||!Number.isInteger(micros)||micros<0||micros>=1000000)throw Error('Ungültige Redis-Zeit');
      const scope=assertSyncBudget(),remaining=Math.min(maxLeaseMs,scope?scope.deadlineAt-performance.now():maxLeaseMs);
      deadlineMs=Math.floor(sec*1000+micros/1000+remaining-SERVER_CLOCK_MARGIN_MS);
      const permit=permitKey(key,token),issued=await redis(['EVAL',ISSUE_ADDON_PERMIT,1,permit,String(deadlineMs),String(maxLeaseMs)],{control:true});
      if(issued!=='OK')throw Error('ADDON_PERMIT_NOT_ISSUED');
      ok=await redis(['EVAL',ACQUIRE_ADDON,2,key,permit,token,String(deadlineMs),String(maxLeaseMs)],{control:true});
    }else ok=await redis(['SET',key,token,'EX',120,'NX']);
    if(ok==='OK'){
      if(addon)armSyncFence({key,token,deadlineMs,permit:permitKey(key,token)});
      return token;
    }
    return null;
  }catch(error){
    try{
      if(await redis(['GET',key],{control:true})===token&&(!addon||deadlineMs!==null&&await redis(['GET',permitKey(key,token)],{control:true})===String(deadlineMs))){
        if(addon)armSyncFence({key,token,deadlineMs,permit:permitKey(key,token)});
        return token;
      }
    }catch{}
    throw error;
  }
}
export async function releaseRefreshLock(token,{addon=false}={}){
  if(addon){
    const key=addonSyncLockKey();
    // Invalidate the permit FIRST. Redis Lua does not roll back: even if
    // DEL is denied, the old token cannot issue or acquire again. The marker
    // covers the maximum admissible lease from cleanup time. A different
    // owner's shared lock remains untouched.
    const lua="-- addon-lock-revoke:v1\nlocal marked=redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]); if not marked then return 0 end; if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]) end; return 1";
    const result=await redis(['EVAL',lua,2,key,permitKey(key,token),token,permitRevoked,String(permitRevocationMs)],{control:true});
    if(result!==1)throw Error('ADDON_REVOKE_UNCONFIRMED');
    return result;
  }
  const lua="if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  return redis(['EVAL',lua,1,LOCK,token]);
}
export async function manualCooldown(){
  return (await redis(['SET',COOLDOWN,'1','EX',60,'NX']))==='OK';
}
export function normalizedCharacterWrite(data){
  if(!Array.isArray(data?.characters)||!Number.isFinite(Date.parse(data.generatedAt))||new Date(data.generatedAt).toISOString()!==data.generatedAt)throw new Error('Ungültige Charakterdaten oder nicht kanonische Profilgeneration');
  const normalized=normalizeVerifiedPlayerTerminology(data);
  return [JSON.stringify(normalized),JSON.stringify(characterVersionMetadata(normalized))];
}
// Redis Lua does not roll back commands on runtime errors. Validate the types
// of every affected key before the first mutation.
export const REDIS_TYPE_GUARD="local function valid(k,t) local a=redis.call('TYPE',k).ok; return a=='none' or a==t end; ";
// Read/validate compact metadata before the sole mutation. MSET is one
// atomic Redis command; no Lua rollback or provider-specific ACL API needed.
export const REDIS_COMPACT_READ="local function compact(k) local old=redis.call('GET',k); if not old then return {} end; local value=cjson.decode(old); if type(value)~='table' then error('INVALID_COMPACT_METADATA') end; return value end; ";
// Both atomic profile write paths enforce monotonic UTC generations.
// Historical UTC timestamps with omitted millisecond padding are supported.
export const REDIS_PROFILE_GENERATION_GUARD="local function generation(v) if type(v)~='string' then error('INVALID_PROFILE_GENERATION') end; local base,frac=string.match(v,'^(%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d)%.(%d+)Z$'); if not base then base=string.match(v,'^(%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d)Z$'); frac='' end; if not base or string.len(frac)>3 then error('INVALID_PROFILE_GENERATION') end; return base..'.'..string.sub(frac..'000',1,3)..'Z' end; local function assertRosterBase(k,expected,allowMissing) local raw=redis.call('GET',k); if not raw then if allowMissing and expected=='' then return false end; error('PROFILE_BASE_MISSING') end; if raw~=expected then error('PROFILE_BASE_CHANGED') end; return raw end; local function assertGeneration(k,nextRaw,nextMeta,expected) local next=cjson.decode(nextRaw); local meta=cjson.decode(nextMeta); local stamp=generation(next.generatedAt); if stamp~=next.generatedAt or meta.generatedAt~=stamp then error('INVALID_PROFILE_GENERATION') end; local oldRaw=assertRosterBase(k,expected,false); local old=cjson.decode(oldRaw); if stamp<=generation(old.generatedAt) then error('PROFILE_GENERATION_NOT_ADVANCED') end; if type(old.characters)~='table' or type(next.characters)~='table' or #old.characters==0 or #old.characters~=#next.characters then error('PROFILE_ROSTER_CHANGED') end; local seen={}; for _,c in ipairs(old.characters) do if type(c.slug)~='string' or seen[c.slug] then error('INVALID_PROFILE_ROSTER') end; seen[c.slug]=true end; for _,c in ipairs(next.characters) do if type(c.slug)~='string' or not seen[c.slug] then error('PROFILE_ROSTER_CHANGED') end; seen[c.slug]=nil end end; ";
export async function saveCharacters(data,lockToken,{dailyReceipt=null,expectedRoster}={}){
  if(!lockToken)throw new Error('Schreibsperre erforderlich');
  if(typeof expectedRoster!=='string'||!expectedRoster)throw Error('PROFILE_BASE_REQUIRED');
  const args=normalizedCharacterWrite(data);
  if(dailyReceipt&&(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dailyReceipt.date)||dailyReceipt.source!=='daily'||dailyReceipt.generatedAt!==data.generatedAt||!Number.isInteger(dailyReceipt.success)||dailyReceipt.success<=0||!Number.isInteger(dailyReceipt.total)||dailyReceipt.total!==data.characters.length||!rosterMatches(dailyReceipt.roster,data.characters.map(c=>({slug:c.slug,id:c.blizzardCharacterId??null})))||dailyReceipt.success>dailyReceipt.total||dailyReceipt.persisted!==true))throw new Error('Ungültiger Profil-Refresh-Nachweis');
  const lua=REDIS_TYPE_GUARD+REDIS_COMPACT_READ+REDIS_PROFILE_GENERATION_GUARD+"if not valid(KEYS[2],'string') or not valid(KEYS[3],'string') then return redis.error_reply('INVALID_STORAGE_TYPE') end; if redis.call('GET',KEYS[1])~=ARGV[1] then return redis.error_reply('REFRESH_LOCK_LOST') end; assertGeneration(KEYS[2],ARGV[2],ARGV[3],ARGV[5]); local meta=compact(KEYS[3]); meta.characters=cjson.decode(ARGV[3]); if ARGV[4]~='' then meta.dailyReceipt=cjson.decode(ARGV[4]) end; local encoded=cjson.encode(meta); return redis.call('MSET',KEYS[2],ARGV[2],KEYS[3],encoded)";
  const result=await redis(['EVAL',lua,3,LOCK,KEY,CORE_COMPACT_KEY,lockToken,...args,dailyReceipt?JSON.stringify(dailyReceipt):'',expectedRoster]);
  if(result!=='OK')throw new Error('Charakterdaten nicht gespeichert');
  return args[0]; // exact confirmed bytes for a subsequent same-lock media write
}
export async function loadDailyProfileReceipt(date){
  const [value,legacy]=await Promise.all([redis(['GET',CORE_COMPACT_KEY]),redis(['HGET',VERSION_METADATA_KEY,DAILY_PROFILE_RECEIPT_FIELD])]);
  return selectDailyReceipt(value?JSON.parse(value).dailyReceipt:null,legacy?JSON.parse(legacy):null,date);
}
export function mergeProfiles(previous,latest){
  const bySlug=new Map((previous.characters||[]).map(c=>[c.slug,c]));
  return {generatedAt:latest.generatedAt,characters:(latest.characters||[]).map(c=>{
    const old=bySlug.get(c.slug);
    if(!old)return c;
    if(c.scrapeOk===false)return {...old,scrapeOk:false,statsVerified:false,statsFreshKeys:[],statsFreshEnums:[],scrapeError:c.scrapeError};
    if(c.knownClassAbilitiesVerified===false&&old.knownClassAbilitiesVerified===true&&old.knownClassAbilitiesSource==='WoW-Spellbook'){
      return {
        ...c,
        knownClassAbilities:Array.isArray(old.knownClassAbilities)?old.knownClassAbilities:[],
        knownClassAbilitiesVerified:true,
        knownClassAbilitiesSource:old.knownClassAbilitiesSource||null,
        knownClassAbilitiesCapturedAt:old.knownClassAbilitiesCapturedAt||null,
        knownClassAbilitiesSyncedAt:old.knownClassAbilitiesSyncedAt||null,
        knownClassAbilitiesCapturedLevel:old.knownClassAbilitiesCapturedLevel??null,
        knownClassAbilitiesCheckedAt:old.knownClassAbilitiesCapturedAt||old.knownClassAbilitiesCheckedAt||c.knownClassAbilitiesCheckedAt||null
      };
    }
    return c;
  })};
}
