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
export function trustedCharacterName(slug){
  const key=String(slug||'');
  return Object.hasOwn(TRUSTED_CHARACTERS,key)?TRUSTED_CHARACTERS[key]:null;
}
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
function enrollmentDenied(){return Object.assign(new Error('Nicht berechtigt'),{code:'DEVICE_ENROLLMENT_DENIED'})}
export async function createDeviceEnrollment(characterSlug,{issuerToken=null}={}){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!isTrustedCharacterSlug(characterSlug))throw new Error('Unbekannter Dalton-Charakter');
  const code='dalton-'+randomBytes(24).toString('base64url');
  const record={characterSlug,createdAt:now(),expiresInSeconds:ENROLL_TTL_SECONDS};
  const key=inviteKey(code),value=JSON.stringify(record);
  let saved;
  if(issuerToken===null){
    // Internal trusted caller, after master credential validation at the API boundary.
    saved=await redis(['SET',key,value,'EX',ENROLL_TTL_SECONDS,'NX']);
  }else{
    if(typeof issuerToken!=='string'||!issuerToken.startsWith('ddv1_'))throw enrollmentDenied();
    const issuerKey=deviceKey(issuerToken);
    const raw=await redis(['GET',issuerKey]);
    let issuer;
    try{issuer=JSON.parse(raw)}catch{throw enrollmentDenied()}
    if(!issuer||issuer.revokedAt||!deviceMayCreateEnrollment(issuer,characterSlug))throw enrollmentDenied();
    // Exact original record must still be authorized at the mutation boundary.
    // A revoke/change before the script executes blocks creation; no new invite.
    const lua=`
if redis.call('GET',KEYS[1])~=ARGV[1] then return -1 end
local saved=redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3],'NX')
if not saved then return 0 end
return 1
`;
    const result=await redis(['EVAL',lua,2,issuerKey,key,raw,value,ENROLL_TTL_SECONDS]);
    if(result===-1)throw enrollmentDenied();
    saved=result===1?'OK':null;
  }
  if(saved!=='OK')throw new Error('Einrichtungscode konnte nicht gespeichert werden');
  return {code,characterSlug,characterName:trustedCharacterName(characterSlug),expiresInSeconds:ENROLL_TTL_SECONDS};
}
export async function redeemDeviceEnrollment(code){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(typeof code!=='string'||code.length<20||code.length>200)throw new Error('Ungültiger Einrichtungscode');
  const key=inviteKey(code);
  const raw=await redis(['GET',key]);
  if(!raw)throw new Error('Einrichtungscode ungültig, abgelaufen oder bereits verwendet');
  let invite;
  try{invite=JSON.parse(raw)}catch{throw new Error('Einrichtungscode beschädigt')}
  if(invite?.consumed===true)throw new Error('Einrichtungscode bereits verwendet');
  if(!isTrustedCharacterSlug(invite?.characterSlug))throw new Error('Einrichtungscode gehört zu keinem freigegebenen Charakter');

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
  // Redis scripts do not roll back earlier writes on later command errors.
  // Compare the exact invitation and commit its invalidation + device in ONE MSET.
  // Cleanup of the invalid marker is deliberately best effort, never part of success.
  const lua=`
local raw=redis.call('GET',KEYS[1])
if not raw or raw~=ARGV[1] then return 0 end
local ttl=redis.call('PTTL',KEYS[1])
if ttl<=0 then return 0 end
if redis.call('EXISTS',KEYS[2])~=0 then return -1 end
redis.call('MSET',KEYS[1],ARGV[2],KEYS[2],ARGV[3])
local cleanup=redis.pcall('PEXPIRE',KEYS[1],ttl)
if type(cleanup)=='table' and cleanup.err then return 2 end
if cleanup~=1 then return 2 end
return 1
`;
  const committed=await redis(['EVAL',lua,2,key,deviceKey(token),raw,JSON.stringify({consumed:true}),JSON.stringify(record)]);
  if(committed===0)throw new Error('Einrichtungscode ungültig, abgelaufen oder bereits verwendet');
  if(committed!==1&&committed!==2)throw new Error('Geräteberechtigung konnte nicht gespeichert werden');
  if(committed===2)console.warn('Verbrauchter Einrichtungscode: automatische Marker-Bereinigung nicht bestätigt');
  return {token,...record};
}
export async function authorizeDeviceToken(token,{targetScope=scope()}={}){
  // The target namespace is an authorization boundary, not a caller option.
  if(targetScope!==scope())return null;
  if(!configured()||typeof token!=='string'||!token.startsWith('ddv1_'))return null;
  const raw=await redis(['GET',deviceKeyForScope(token,targetScope)]);
  if(!raw)return null;
  try{
    const record=JSON.parse(raw);
    if(!record||record.revokedAt||!isTrustedCharacterSlug(record.characterSlug))return null;
    return record;
  }catch{return null}
}
export async function revokeDeviceToken(token){
  const record=await authorizeDeviceToken(token);
  if(!record)return false;
  // Concurrent revocations must not both claim that they removed the record.
  const removed=await redis(['DEL',deviceKey(token)]);
  if(removed!==0&&removed!==1)throw new Error('Gerätewiderruf konnte nicht bestätigt werden');
  return removed===1;
}
