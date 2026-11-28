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
export {scope as deviceEnrollmentScope};
function sha(value){return createHash('sha256').update(String(value)).digest('hex')}
function inviteKey(code){return 'dalton-dashboard:addon-device:v1:'+scope()+':invite:'+sha(code)}
function deviceKeyForScope(token,targetScope=scope()){
  const resolved=targetScope==='production'?'production':'preview';
  return 'dalton-dashboard:addon-device:v1:'+resolved+':token:'+sha(token);
}
function deviceKey(token){return deviceKeyForScope(token,scope())}
const validDeviceToken=value=>typeof value==='string'&&/^ddv1_[A-Za-z0-9_-]{43}$/.test(value);
const validInvitation=value=>typeof value==='string'&&/^dalton-[A-Za-z0-9_-]{32}$/.test(value);
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
export async function locateDeviceToken(token){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!validDeviceToken(token))throw enrollmentDenied();
  const found=await redis(['EXISTS',deviceKey(token)]);
  if(found!==0&&found!==1)throw Error('Geräteumgebung konnte nicht bestätigt werden');
  return found===1;
}
export async function identifyPendingEnrollment(code,token){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!validInvitation(code)||!validDeviceToken(token))throw enrollmentDenied();
  // Compatibility for journals written before the target scope was recorded.
  // A route with no matching evidence must not acknowledge cancellation.
  const raw=await redis(['GET',inviteKey(code)]);
  if(raw!==null){
    const marker=JSON.parse(raw);
    if(marker?.consumed===true)return !marker.deviceDigest||marker.deviceDigest===sha(token);
    return marker?.schemaVersion===2&&isTrustedCharacterSlug(marker.characterSlug);
  }
  return (await authorizeDeviceToken(token))?.invitationDigest===sha(code);
}
export async function confirmDeviceEnrollment(code,{expectedCharacter,proposedDeviceToken,expectedDeviceId}){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!validInvitation(code)||!validDeviceToken(proposedDeviceToken)||typeof expectedDeviceId!=='string'||!expectedDeviceId)
    throw enrollmentDenied();
  const record=await authorizeDeviceToken(proposedDeviceToken);
  if(!record||record.deviceId!==expectedDeviceId||expectedCharacter!==null&&record.characterSlug!==expectedCharacter)
    throw enrollmentDenied();
  if(!record.invitationDigest){
    const marker=JSON.parse(await redis(['GET',inviteKey(code)]));
    if(marker?.consumed!==true||marker.deviceId!==record.deviceId||marker.deviceDigest!==sha(proposedDeviceToken))
      throw enrollmentDenied();
  }else if(record.invitationDigest!==sha(code))throw enrollmentDenied();
  return {...record,token:proposedDeviceToken};
}
export async function createDeviceEnrollment(characterSlug,{issuerToken=null}={}){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!isTrustedCharacterSlug(characterSlug))throw new Error('Unbekannter Dalton-Charakter');
  const code='dalton-'+randomBytes(24).toString('base64url');
  const record={schemaVersion:2,characterSlug,createdAt:now(),expiresInSeconds:ENROLL_TTL_SECONDS,issuer:null};
  const key=inviteKey(code);
  let saved;
  if(issuerToken===null){
    // Internal trusted caller, after master credential validation at the API boundary.
    saved=await redis(['SET',key,JSON.stringify(record),'EX',ENROLL_TTL_SECONDS,'NX']);
  }else{
    if(!validDeviceToken(issuerToken))throw enrollmentDenied();
    const issuerKey=deviceKey(issuerToken);
    const raw=await redis(['GET',issuerKey]);
    let issuer;
    try{issuer=JSON.parse(raw)}catch{throw enrollmentDenied()}
    if(!issuer||issuer.revokedAt||!deviceMayCreateEnrollment(issuer,characterSlug))throw enrollmentDenied();
    record.issuer={key:issuerKey,recordDigest:sha(raw)};
    const value=JSON.stringify(record);
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
export async function redeemDeviceEnrollment(code,{expectedCharacter=null,proposedDeviceToken=null}={}){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!validInvitation(code)||proposedDeviceToken!==null&&!validDeviceToken(proposedDeviceToken))throw new Error('Ungültiger Einrichtungscode');
  const key=inviteKey(code);
  const invitationDigest=sha(code);
  const raw=await redis(['GET',key]);
  async function confirmedDevice(marker){
    if(!proposedDeviceToken||marker&&marker.deviceDigest!==sha(proposedDeviceToken))return null;
    const record=await authorizeDeviceToken(proposedDeviceToken);
    if(!record||expectedCharacter!==null&&expectedCharacter!==record.characterSlug)return null;
    if(marker){
      if(record.deviceId!==marker.deviceId||record.characterSlug!==marker.characterSlug)return null;
    }else if(record.invitationDigest!==invitationDigest)return null;
    return {token:proposedDeviceToken,...record};
  }
  if(raw===null){
    // Replay with both original proofs also works after the invite TTL.
    // A deleted device can never be recreated through this read-only path.
    const confirmed=await confirmedDevice(null);
    if(confirmed)return confirmed;
    throw new Error('Einrichtungscode ungültig, abgelaufen oder bereits verwendet');
  }
  let invite;
  try{invite=JSON.parse(raw)}catch{throw new Error('Einrichtungscode beschädigt')}
  if(invite?.consumed===true){
    const confirmed=await confirmedDevice(invite);
    if(confirmed)return confirmed;
    throw new Error('Einrichtungscode bereits verwendet');
  }
  if(!isTrustedCharacterSlug(invite?.characterSlug))throw new Error('Einrichtungscode gehört zu keinem freigegebenen Charakter');
  if(expectedCharacter!==null&&expectedCharacter!==invite.characterSlug)throw enrollmentDenied();

  // Old invitations have no trustworthy issuer binding. Expire them logically
  // at cutover and require reissue; already enrolled devices are unaffected.
  if(invite.schemaVersion!==2||!Object.hasOwn(invite,'issuer'))throw new Error('Einrichtungscode ungültig: bitte neu erstellen');
  let issuerKey=null,issuerRaw=null;
  if(invite.issuer!==null){
    issuerKey=invite.issuer?.key;
    const prefix='dalton-dashboard:addon-device:v1:'+scope()+':token:';
    if(typeof issuerKey!=='string'||!issuerKey.startsWith(prefix)||!/^[a-f0-9]{64}$/.test(issuerKey.slice(prefix.length)))throw enrollmentDenied();
    issuerRaw=await redis(['GET',issuerKey]);
    let issuer;try{issuer=JSON.parse(issuerRaw)}catch{throw enrollmentDenied()}
    if(!issuer||issuer.revokedAt||!deviceMayCreateEnrollment(issuer,invite.characterSlug)||sha(issuerRaw)!==invite.issuer.recordDigest)throw enrollmentDenied();
  }
  const token=proposedDeviceToken??'ddv1_'+randomBytes(32).toString('base64url');
  const deviceId=randomUUID();
  const record={
    schemaVersion:1,
    deviceId,
    characterSlug:invite.characterSlug,
    characterName:trustedCharacterName(invite.characterSlug),
    createdAt:now(),
    revokedAt:null,
    ...(proposedDeviceToken?{invitationDigest}:{})
  };
  // Redis scripts do not roll back earlier writes on later command errors.
  // Compare the exact invitation and commit its invalidation + device in ONE MSET.
  // Cleanup of the invalid marker is deliberately best effort, never part of success.
  const lua=`
local raw=redis.call('GET',KEYS[1])
if not raw or raw~=ARGV[1] then return 0 end
local ttl=redis.call('PTTL',KEYS[1])
if ttl<=0 then return 0 end
if #KEYS==3 and redis.call('GET',KEYS[3])~=ARGV[4] then return -2 end
if redis.call('EXISTS',KEYS[2])~=0 then return -1 end
redis.call('MSET',KEYS[1],ARGV[2],KEYS[2],ARGV[3])
local cleanup=redis.pcall('PEXPIRE',KEYS[1],ttl)
if type(cleanup)=='table' and cleanup.err then return 2 end
if cleanup~=1 then return 2 end
return 1
`;
  const marker=proposedDeviceToken?{consumed:true,deviceDigest:sha(token),deviceId,characterSlug:record.characterSlug}:{consumed:true};
  const keys=[key,deviceKey(token),...(issuerKey?[issuerKey]:[])];
  const committed=await redis(['EVAL',lua,keys.length,...keys,raw,JSON.stringify(marker),JSON.stringify(record),...(issuerKey?[issuerRaw]:[])]);
  if(committed===-2)throw enrollmentDenied();
  if(committed===0){
    if(proposedDeviceToken){
      const current=JSON.parse(await redis(['GET',key]));
      const confirmed=current===null||current.consumed===true?await confirmedDevice(current):null;
      if(confirmed)return confirmed;
    }
    throw new Error('Einrichtungscode ungültig, abgelaufen oder bereits verwendet');
  }
  if(committed!==1&&committed!==2)throw new Error('Geräteberechtigung konnte nicht gespeichert werden');
  if(committed===2)console.warn('Verbrauchter Einrichtungscode: automatische Marker-Bereinigung nicht bestätigt');
  return {token,...record};
}
export async function cancelDeviceEnrollment(code,token){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!validInvitation(code)||!validDeviceToken(token))throw enrollmentDenied();
  // A live invitation is required to mutate its marker. Unknown codes never
  // allocate Redis keys. For a committed invite, only the holder of the
  // matching candidate can remove that device. A revoked code cannot race
  // a delayed redeem because redeem compares the exact bytes in its script.
  const lua=`
local raw=redis.call('GET',KEYS[1])
local function removeDevice(expectedId)
  local deviceRaw=redis.call('GET',KEYS[2])
  if not deviceRaw then return 1 end
  local device=cjson.decode(deviceRaw)
  if type(device)~='table' then return -1 end
  if expectedId and device.deviceId~=expectedId then return 1 end
  if device.invitationDigest and device.invitationDigest~=ARGV[3] then return -1 end
  redis.call('DEL',KEYS[2])
  return 1
end
if not raw then return removeDevice(nil) end
local record=cjson.decode(raw)
if type(record)~='table' then return -1 end
if record.consumed==true then
  if record.deviceDigest==ARGV[1] then
    return removeDevice(record.deviceId)
  end
  return 1
end
local ttl=redis.call('PTTL',KEYS[1])
if ttl<=0 then return -1 end
redis.call('SET',KEYS[1],ARGV[2],'PX',ttl)
return 1
`;
  const result=await redis(['EVAL',lua,2,inviteKey(code),deviceKey(token),sha(token),JSON.stringify({consumed:true}),sha(code)]);
  if(result===-1)throw enrollmentDenied();
  if(result!==1)throw Error('Abbruch der Einrichtung nicht bestätigt');
  return true;
}
export async function authorizeDeviceTokenWithProof(token,{targetScope=scope()}={}){
  // The target namespace is an authorization boundary, not a caller option.
  if(targetScope!==scope())return null;
  if(!configured()||!validDeviceToken(token))return null;
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
export async function revokeDeviceToken(token){
  // A null authorization also covers missing bindings or malformed records,
  // and is therefore NOT evidence that a credential is gone.
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert; Widerruf nicht bestätigt');
  if(!validDeviceToken(token))throw enrollmentDenied();
  // DEL=0 is authoritative absence in the configured scope; DEL=1 proves
  // removal, including malformed records. No preliminary GET/DEL race.
  const removed=await redis(['DEL',deviceKey(token)]);
  if(removed!==0&&removed!==1)throw new Error('Gerätewiderruf konnte nicht bestätigt werden');
  return removed===1;
}
