import {authorizeDeviceToken,createDeviceEnrollment,deviceMayCreateEnrollment,redeemDeviceEnrollment,revokeDeviceToken,masterSyncTokenMatches,trustedCharacterSlugs,trustedCharacterName} from '../scripts/addon-device-auth.mjs';
import {readRequestJson,RequestJsonError} from '../scripts/request-json.mjs';

export const config={maxDuration:15};

function authToken(req,scheme){
  const raw=String(req.headers?.authorization||'');
  const prefix=scheme+' ';
  return raw.startsWith(prefix)?raw.slice(prefix.length):'';
}
function requestedCharacter(value){
  if(value==null)return null;
  if(typeof value!=='string')throw new RequestJsonError(400,'Ungültiger Charakter');
  const key=value.trim().toLocaleLowerCase('de-DE');
  const slug=trustedCharacterSlugs().find(slug=>slug===key||trustedCharacterName(slug).toLocaleLowerCase('de-DE')===key);
  if(!slug)throw new RequestJsonError(400,'Ungültiger Charakter');
  return slug;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Methode nicht erlaubt'})}
  try{
    const body=await readRequestJson(req,20000);
    if(Object.hasOwn(body,'action')&&!['create','revoke'].includes(body.action))throw new RequestJsonError(400,'Unbekannte Geräteaktion');
    const allowed=body.action==='create'?['action','characterSlug']:body.action==='revoke'?['action']:['code','character'];
    if(Object.keys(body).some(key=>!allowed.includes(key)))throw new RequestJsonError(400,'Widersprüchliche Geräteparameter');
    if(body?.action==='create'){
      if(typeof body.characterSlug!=='string')throw new RequestJsonError(400,'Ungültiger Charakter');
      const characterSlug=body.characterSlug;
      const master=masterSyncTokenMatches(authToken(req,'Bearer'));
      const device=master?null:await authorizeDeviceToken(authToken(req,'Device'));
      if(!master&&!deviceMayCreateEnrollment(device,characterSlug))return res.status(401).json({error:'Nicht berechtigt'});
      const created=await createDeviceEnrollment(characterSlug,{issuerToken:master?null:authToken(req,'Device')});
      return res.status(200).json(created);
    }
    if(body?.action==='revoke'){
      const token=authToken(req,'Device');
      if(!token)return res.status(401).json({error:'Nicht berechtigt'});
      const revoked=await revokeDeviceToken(token);
      return res.status(200).json({revoked,alreadyRevoked:!revoked});
    }
    if(typeof body.code!=='string')throw new RequestJsonError(400,'Ungültiger Einrichtungscode');
    const enrolled=await redeemDeviceEnrollment(body.code,{expectedCharacter:requestedCharacter(body.character)});
    return res.status(200).json({
      deviceToken:enrolled.token,
      deviceId:enrolled.deviceId,
      characterSlug:enrolled.characterSlug,
      characterName:enrolled.characterName
    });
  }catch(error){
    if(error instanceof RequestJsonError)return res.status(error.status).json({error:error.message});
    const message=String(error.message||error).slice(0,180);
    if(error.code==='DEVICE_ENROLLMENT_DENIED')return res.status(401).json({error:'Nicht berechtigt'});
    const status=/ungültig|abgelaufen|verwendet|Unbekannter|keinem freigegebenen/.test(message)?400:503;
    return res.status(status).json({error:status===400?'Einrichtungscode oder Charakter ist ungültig.':'Geräteverwaltung derzeit nicht verfügbar.'});
  }
}
