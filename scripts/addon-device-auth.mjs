import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {configured,redis} from './character-store.mjs';

const TRUSTED_CHARACTERS=Object.freeze({
  'cole-dalton':'Cole Dalton',
  'chucky-dalton':'Chucky Dalton',
  'dolly-dalton':'Dolly Dalton',
  'viola-dalton':'Viola Dalton'
});
const ENROLL_TTL_SECONDS=86400;

function scope(){return process.env.VERCEL_ENV==='production'?'production':'preview'}
function sha(value){return createHash('sha256').update(String(value)).digest('hex')}
function inviteKey(code){return 'dalton-dashboard:addon-device:v1:'+scope()+':invite:'+sha(code)}
function deviceKeyForScope(token,targetScope=scope()){
  const resolved=targetScope==='production'?'production':'preview';
  return 'dalton-dashboard:addon-device:v1:'+resolved+':token:'+sha(token);
}
function deviceKey(token){return deviceKeyForScope(token,scope())}
function now(){return new Date().toISOString()}
function safeEqual(a,b){
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length===right.length&&timingSafeEqual(left,right);
}
export function trustedCharacterSlugs(){return Object.keys(TRUSTED_CHARACTERS)}
export function trustedCharacterName(slug){const key=String(slug||'');return Object.hasOwn(TRUSTED_CHARACTERS,key)?TRUSTED_CHARACTERS[key]:null}
export function isTrustedCharacterSlug(slug){return Boolean(trustedCharacterName(slug))}
export function deviceMaySync(device,targetSlug,transport){
  const own=String(device?.characterSlug||'');
  const target=String(targetSlug||'');
  if(!isTrustedCharacterSlug(own)||!isTrustedCharacterSlug(target))return false;
  if(own===target)return true;
  return own==='cole-dalton'&&target!=='cole-dalton'&&String(transport||'')==='dalton-peer-relay';
}
export function deviceMayCreateEnrollment(device,targetSlug){
  return String(device?.characterSlug||'')==='cole-dalton'&&
    isTrustedCharacterSlug(targetSlug)&&String(targetSlug)!=='cole-dalton';
}
export function masterSyncTokenMatches(token){
  const expected=process.env.DALTON_SYNC_TOKEN||process.env.SPELLBOOK_SYNC_TOKEN;
  return Boolean(expected)&&safeEqual(token,expected);
}
export async function createDeviceEnrollment(characterSlug){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!isTrustedCharacterSlug(characterSlug))throw new Error('Unbekannter Dalton-Charakter');
  const code='dalton-'+randomBytes(24).toString('base64url');
  const record={characterSlug,createdAt:now(),expiresInSeconds:ENROLL_TTL_SECONDS};
  await redis(['SET',inviteKey(code),JSON.stringify(record),'EX',ENROLL_TTL_SECONDS,'NX']);
  return {code,characterSlug,characterName:trustedCharacterName(characterSlug),expiresInSeconds:ENROLL_TTL_SECONDS};
}
export async function redeemDeviceEnrollment(code){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(typeof code!=='string'||code.length<20||code.length>200)throw new Error('Ungültiger Einrichtungscode');
  const key=inviteKey(code);
  const lua="local v=redis.call('GET',KEYS[1]); if not v then return nil end; redis.call('DEL',KEYS[1]); return v";
  const raw=await redis(['EVAL',lua,1,key]);
  if(!raw)throw new Error('Einrichtungscode ungültig, abgelaufen oder bereits verwendet');
  let invite;
  try{invite=JSON.parse(raw)}catch{throw new Error('Einrichtungscode beschädigt')}
  if(!isTrustedCharacterSlug(invite.characterSlug))throw new Error('Einrichtungscode gehört zu keinem freigegebenen Charakter');

  const token='ddv1_'+randomBytes(32).toString('base64url');
  const deviceId=randomUUID();
  const record={
    schemaVersion:1,
    deviceId,
    characterSlug:invite.characterSlug,
    characterName:trustedCharacterName(invite.characterSlug),
    createdAt:now(),
    revokedAt:null
  };
  await redis(['SET',deviceKey(token),JSON.stringify(record)]);
  return {token,...record};
}
export async function authorizeDeviceTokenWithProof(token,{targetScope=scope()}={}){
  if(targetScope!==scope())return null;
  if(!configured()||typeof token!=='string'||!token.startsWith('ddv1_'))return null;
  const key=deviceKeyForScope(token,targetScope);
  const raw=await redis(['GET',key]);
  if(!raw)return null;
  try{
    const record=JSON.parse(raw);
    if(!record||record.revokedAt||!isTrustedCharacterSlug(record.characterSlug))return null;
    return {record,proof:{key,raw}};
  }catch{return null}
}
export async function authorizeDeviceToken(token,options){
  return (await authorizeDeviceTokenWithProof(token,options))?.record??null;
}
export async function promoteColeDeviceToProduction(token){
  if(process.env.VERCEL_ENV==='production')throw new Error('Geräteübernahme ist nur aus dem Preview möglich');
  const device=await authorizeDeviceToken(token,{targetScope:'preview'});
  if(!device||device.characterSlug!=='cole-dalton')throw new Error('Nur Coles Preview-Hub darf auf Produktion übernommen werden');
  const promotedToken='ddv1_'+createHash('sha256').update('production-promotion-v1:'+token).digest('base64url');
  const record={
    ...device,
    schemaVersion:1,
    promotedAt:now(),
    promotedFromDeviceId:device.deviceId,
    revokedAt:null
  };
  await redis(['SET',deviceKeyForScope(promotedToken,'production'),JSON.stringify(record)]);
  return {token:promotedToken,...record};
}
export async function revokeDeviceToken(token){
  const record=await authorizeDeviceToken(token);
  if(!record)return false;
  await redis(['DEL',deviceKey(token)]);
  return true;
}
