import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {normalizeVerifiedPlayerTerminology} from './player-terminology.mjs';
const require=createRequire(import.meta.url);
const initial=require('../data/characters.json');
const KEY='dalton-dashboard:characters:v1';
const LOCK='dalton-dashboard:refresh:lock';
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
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Redis HTTP '+response.status);
  const payload=await response.json();
  if(payload.error)throw new Error('Redis: '+String(payload.error).slice(0,120));
  return payload.result;
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
export async function acquireRefreshLock(){
  const token=randomUUID();
  const ok=await redis(['SET',LOCK,token,'EX',120,'NX']);
  return ok==='OK'?token:null;
}
export async function releaseRefreshLock(token){
  const lua="if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  return redis(['EVAL',lua,1,LOCK,token]);
}
export async function manualCooldown(){
  return (await redis(['SET',COOLDOWN,'1','EX',60,'NX']))==='OK';
}
export async function saveCharacters(data,lockToken){
  if(!Array.isArray(data.characters)||!Number.isFinite(Date.parse(data.generatedAt)))throw new Error('Ungültige Charakterdaten');
  if(!lockToken)throw new Error('Schreibsperre erforderlich');
  const lua="if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('SET', KEYS[2], ARGV[2]) else return redis.error_reply('REFRESH_LOCK_LOST') end";
  const normalized=normalizeVerifiedPlayerTerminology(data);
  await redis(['EVAL',lua,2,LOCK,KEY,lockToken,JSON.stringify(normalized)]);
}
export function mergeProfiles(previous,latest){
  const bySlug=new Map((previous.characters||[]).map(c=>[c.slug,c]));
  return {generatedAt:latest.generatedAt,characters:(latest.characters||[]).map(c=>{
    const old=bySlug.get(c.slug);
    if(!old)return c;
    if(c.scrapeOk===false)return {...old,scrapeOk:false,scrapeError:c.scrapeError};
    if(c.knownClassAbilitiesVerified===false&&old.knownClassAbilitiesVerified===true){
      return {
        ...c,
        knownClassAbilities:Array.isArray(old.knownClassAbilities)?old.knownClassAbilities:[],
        knownClassAbilitiesVerified:false,
        knownClassAbilitiesSource:old.knownClassAbilitiesSource||null,
        knownClassAbilitiesCheckedAt:c.knownClassAbilitiesCheckedAt||old.knownClassAbilitiesCheckedAt||null
      };
    }
    return c;
  })};
}
