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
  if(env.VERCEL&&env.VERCEL_ENV!=='production'&&env.VERCEL_ENV!=='preview'&&env.VERCEL_ENV!=='development')return null;
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
    if(payload.error)throw new Error('Redis: '+String(payload.error).slice(0,120));
    return payload.result;
  });
}
export function configured(){return Boolean(redisConnection())}
export async function loadCharacters(){
  if(!configured())return {data:normalizeVerifiedPlayerTerminology(initial),fallback:true};
  const value=await redis(['GET',KEY]);
  if(!value)return {data:normalizeVerifiedPlayerTerminology(initial),fallback:true};
  const data=JSON.parse(value);
  if(!Array.isArray(data.characters)||!Number.isFinite(Date.parse(data.generatedAt)))throw new Error('Gespeicherter Datensatz ist ungültig');
  return {data:normalizeVerifiedPlayerTerminology(data),fallback:false};
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
  if(!Array.isArray(data?.characters)||!Number.isFinite(Date.parse(data.generatedAt)))throw new Error('Ungültige Charakterdaten');
  const normalized=normalizeVerifiedPlayerTerminology(data);
  return [JSON.stringify(normalized),JSON.stringify(characterVersionMetadata(normalized))];
}
// Redis Lua does not roll back commands on runtime errors. Validate the types
// of every affected key before the first mutation.
export const REDIS_TYPE_GUARD="local function valid(k,t) local a=redis.call('TYPE',k).ok; return a=='none' or a==t end; ";
// Read/validate compact metadata before the sole mutation. MSET is one
// atomic Redis command; no Lua rollback or provider-specific ACL API needed.
export const REDIS_COMPACT_READ="local function compact(k) local old=redis.call('GET',k); if not old then return {} end; local value=cjson.decode(old); if type(value)~='table' then error('INVALID_COMPACT_METADATA') end; return value end; ";
export async function saveCharacters(data,lockToken,{dailyReceipt=null}={}){
  if(!lockToken)throw new Error('Schreibsperre erforderlich');
  const args=normalizedCharacterWrite(data);
  if(dailyReceipt&&(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dailyReceipt.date)||dailyReceipt.source!=='daily'||dailyReceipt.generatedAt!==data.generatedAt||!Number.isInteger(dailyReceipt.success)||dailyReceipt.success<=0||!Number.isInteger(dailyReceipt.total)||dailyReceipt.total!==data.characters.length||!rosterMatches(dailyReceipt.roster,data.characters.map(c=>({slug:c.slug,id:c.blizzardCharacterId??null})))||dailyReceipt.success>dailyReceipt.total||dailyReceipt.persisted!==true))throw new Error('Ungültiger Profil-Refresh-Nachweis');
  const lua=REDIS_TYPE_GUARD+REDIS_COMPACT_READ+"if not valid(KEYS[2],'string') or not valid(KEYS[3],'string') then return redis.error_reply('INVALID_STORAGE_TYPE') end; if redis.call('GET',KEYS[1])~=ARGV[1] then return redis.error_reply('REFRESH_LOCK_LOST') end; local meta=compact(KEYS[3]); meta.characters=cjson.decode(ARGV[3]); if ARGV[4] then meta.dailyReceipt=cjson.decode(ARGV[4]) end; local encoded=cjson.encode(meta); return redis.call('MSET',KEYS[2],ARGV[2],KEYS[3],encoded)";
  const result=await redis(['EVAL',lua,3,LOCK,KEY,CORE_COMPACT_KEY,lockToken,...args,...(dailyReceipt?[JSON.stringify(dailyReceipt)]:[])]);
  if(result!=='OK')throw new Error('Charakterdaten nicht gespeichert');
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
    if(c.scrapeOk===false)return {...old,scrapeOk:false,scrapeError:c.scrapeError};
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
