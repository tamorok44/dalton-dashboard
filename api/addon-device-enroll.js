import {authorizeDeviceToken,cancelDeviceEnrollment,confirmDeviceEnrollment,createDeviceEnrollment,deviceEnrollmentScope,deviceMayCreateEnrollment,identifyPendingEnrollment,locateDeviceToken,redeemDeviceEnrollment,revokeDeviceToken,masterSyncTokenMatches,trustedCharacterSlugs,trustedCharacterName} from '../scripts/addon-device-auth.mjs';
import {configured} from '../scripts/character-store.mjs';
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
    const scope=deviceEnrollmentScope();
    const allowed={
      create:['action','characterSlug'],revoke:['action','expectedScope'],cancel:['action','code','proposedDeviceToken','expectedScope'],
      confirm:['action','code','character','proposedDeviceToken','expectedDeviceId','expectedScope'],
      scope:['action'],inspect:['action','code','proposedDeviceToken'],locate:['action']
    };
    if(Object.hasOwn(body,'action')&&(typeof body.action!=='string'||!Object.hasOwn(allowed,body.action)))
      throw new RequestJsonError(400,'Unbekannte Geräteaktion');
    const fields=Object.hasOwn(body,'action')?allowed[body.action]:['code','character','proposedDeviceToken','expectedScope'];
    if(Object.keys(body).some(key=>!fields.includes(key)))throw new RequestJsonError(400,'Widersprüchliche Geräteparameter');
    if(Object.hasOwn(body,'expectedScope')&&body.expectedScope!==scope)
      return res.status(409).json({error:'Gespeicherter Gerätezugang gehört zu einer anderen Umgebung'});
    if(body.action==='scope'){
      if(!configured())throw Error('Datenbank nicht verfügbar');
      return res.status(200).json({scope});
    }
    if(body.action==='inspect'){
      if(!await identifyPendingEnrollment(body.code,body.proposedDeviceToken))
        return res.status(409).json({error:'Umgebung der offenen Kopplung nicht bestätigt'});
      return res.status(200).json({scope});
    }
    if(body.action==='locate'){
      if(!await locateDeviceToken(authToken(req,'Device')))
        return res.status(409).json({error:'Umgebung des vorhandenen Gerätezugangs nicht bestätigt'});
      return res.status(200).json({scope});
    }
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
      return res.status(200).json({revoked,alreadyRevoked:!revoked,...(body.expectedScope?{scope}:{})});
    }
    if(body.action==='cancel'){
      const cancelled=await cancelDeviceEnrollment(body.code,body.proposedDeviceToken);
      return res.status(200).json({cancelled,...(body.expectedScope?{scope}:{})});
    }
    if(typeof body.code!=='string')throw new RequestJsonError(400,'Ungültiger Einrichtungscode');
    const proof={expectedCharacter:requestedCharacter(body.character),proposedDeviceToken:body.proposedDeviceToken??null};
    const enrolled=body.action==='confirm'
      ?await confirmDeviceEnrollment(body.code,{...proof,expectedDeviceId:body.expectedDeviceId})
      :await redeemDeviceEnrollment(body.code,proof);
    return res.status(200).json({
      deviceToken:enrolled.token,
      deviceId:enrolled.deviceId,
      scope,
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
