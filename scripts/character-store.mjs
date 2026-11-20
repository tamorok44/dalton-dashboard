import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const initial=require('../data/characters.json');
const KEY='dalton-dashboard:characters:v1';

function settings(){
  const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
  const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!token)throw new Error('Redis-Datenbank nicht konfiguriert');
  const parsed=new URL(url);
  if(parsed.protocol!=='https:')throw new Error('Redis muss HTTPS verwenden');
  return {url:parsed.origin+parsed.pathname.replace(/\/$/,''),token};
}
async function redis(command){
  const {url,token}=settings();
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Redis HTTP '+response.status);
  const payload=await response.json();
  if(payload.error)throw new Error('Redis: '+String(payload.error).slice(0,120));
  return payload.result;
}
export function configured(){return Boolean((process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL)&&(process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN))}
export async function loadCharacters(){
  if(!configured())return {data:initial,fallback:true};
  const value=await redis(['GET',KEY]);
  if(!value)return {data:initial,fallback:true};
  const data=JSON.parse(value);
  if(!Array.isArray(data.characters)||!Number.isFinite(Date.parse(data.generatedAt)))throw new Error('Gespeicherter Datensatz ist ungültig');
  return {data,fallback:false};
}
export async function saveCharacters(data){
  if(!Array.isArray(data.characters)||!Number.isFinite(Date.parse(data.generatedAt)))throw new Error('Ungültige Charakterdaten');
  await redis(['SET',KEY,JSON.stringify(data)]);
}
export function mergeProfiles(previous,latest){
  const bySlug=new Map((previous.characters||[]).map(c=>[c.slug,c]));
  const characters=(latest.characters||[]).map(c=>{
    const old=bySlug.get(c.slug);
    if(!old)return c;
    if(c.scrapeOk===false)return {...old,scrapeOk:false,scrapeError:c.scrapeError};
    return c;
  });
  return {generatedAt:latest.generatedAt,characters};
}
