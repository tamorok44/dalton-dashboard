import {selectDailyReceipt} from './storage-reconciliation.mjs';
import {rosterMatches} from './daily-roster.mjs';
import {VERSION_METADATA_KEY,CORE_COMPACT_KEY,characterVersionMetadata} from './version-metadata.mjs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {runRedisRequest,ADDON_LEASE_SECONDS} from './sync-deadline.mjs';
import {normalizeVerifiedPlayerTerminology} from './player-terminology.mjs';
const require=createRequire(import.meta.url);
const initial=require('../data/characters.json');
export const CHARACTER_KEY='dalton-dashboard:characters:v1';
export const REFRESH_LOCK_KEY='dalton-dashboard:refresh:lock';
export const addonSyncLockKey=()=>process.env.VERCEL_ENV==='production'?REFRESH_LOCK_KEY:REFRESH_LOCK_KEY+':preview-addon';
const KEY=CHARACTER_KEY,LOCK=REFRESH_LOCK_KEY;
export const DAILY_PROFILE_RECEIPT_FIELD='daily-profile-refresh';
const COOLDOWN='dalton-dashboard:refresh:manual:cooldown';

function settings(){
  const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
  const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!token)throw new Error('Redis-Datenbank nicht konfiguriert');
  const parsed=new URL(url);
  if(parsed.protocol!=='https:')throw new Error('Redis muss HTTPS verwenden');
  return {url:parsed.origin+parsed.pathname.replace(/\/$/,''),token};
}
export async function redis(command){
  const {url,token}=settings();
  return runRedisRequest(async signal=>{
    const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(command),signal});
    if(!response.ok)throw new Error('Redis HTTP '+response.status);
    const payload=await response.json();
    if(payload.error)throw new Error('Redis: '+String(payload.error).slice(0,120));
    return payload.result;
  });
}
export function configured(){return Boolean((process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL)&&(process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN))}
export async function loadCharacters(){
  if(!configured())return {data:normalizeVerifiedPlayerTerminology(initial),fallback:true};
  const value=await redis(['GET',KEY]);
  if(!value)return {data:normalizeVerifiedPlayerTerminology(initial),fallback:true};
  const data=JSON.parse(value);
  if(!Array.isArray(data.characters)||!Number.isFinite(Date.parse(data.generatedAt)))throw new Error('Gespeicherter Datensatz ist ungültig');
  return {data:normalizeVerifiedPlayerTerminology(data),fallback:false};
}
export async function acquireRefreshLock({addon=false,token=randomUUID()}={}){
  const key=addon?addonSyncLockKey():LOCK;
  try{
    const ok=await redis(['SET',key,token,'EX',addon?ADDON_LEASE_SECONDS:120,'NX']);
    return ok==='OK'?token:null;
  }catch(error){
    try{if(await redis(['GET',key])===token)return token;}catch{}
    throw error;
  }
}
export async function releaseRefreshLock(token,{addon=false}={}){
  const lua="if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  return redis(['EVAL',lua,1,addon?addonSyncLockKey():LOCK,token]);
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
