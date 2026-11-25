import {gzipSync,gunzipSync} from 'node:zlib';
import {redis} from './character-store.mjs';
const PREFIX='gz1:';
export function compressedMasterKey(key){return key+':gz1'}
export function encodeCompactMaster(value){
  const raw=JSON.stringify(value);
  return PREFIX+gzipSync(raw,{level:6}).toString('base64');
}
export function decodeCompactMaster(raw){
  if(typeof raw!=='string'||!raw)return null;
  if(!raw.startsWith(PREFIX))throw Error('Unbekanntes komprimiertes Masterformat');
  return JSON.parse(gunzipSync(Buffer.from(raw.slice(PREFIX.length),'base64'),{maxOutputLength:64*1024*1024}).toString('utf8'));
}
export async function readCompactMaster(key,{redisImpl=redis,ttl=null,log=console.info}={}){
  const compactKey=compressedMasterKey(key);
  const packed=await redisImpl(['GET',compactKey]);
  if(packed)return decodeCompactMaster(packed);
  const legacy=await redisImpl(['GET',key]);
  if(!legacy)return null;
  const value=JSON.parse(legacy);
  const encoded=encodeCompactMaster(value);
  const args=['SET',compactKey,encoded,'NX'];
  if(ttl)args.push('EX',String(ttl));
  try{
    const saved=await redisImpl(args);
    if(saved==='OK'){
      log('Redis master compressed:',key,Buffer.byteLength(legacy),'->',Buffer.byteLength(encoded),'bytes');
      return value;
    }
    const winner=await redisImpl(['GET',compactKey]);
    if(winner)return decodeCompactMaster(winner);
  }catch(error){console.warn('Masterkompression konnte nicht archiviert werden:',String(error.message).slice(0,120))}
  return value;
}
export async function writeCompactMaster(key,value,{redisImpl=redis,ttl=null}={}){
  const encoded=encodeCompactMaster(value);
  const args=['SET',compressedMasterKey(key),encoded];
  if(ttl)args.push('EX',String(ttl));
  return redisImpl(args);
}
