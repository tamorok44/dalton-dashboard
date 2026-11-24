import {createDeviceEnrollment,redeemDeviceEnrollment,revokeDeviceToken,masterSyncTokenMatches} from '../scripts/addon-device-auth.mjs';

export const config={maxDuration:15};

function authToken(req,scheme){
  const raw=String(req.headers?.authorization||'');
  const prefix=scheme+' ';
  return raw.startsWith(prefix)?raw.slice(prefix.length):'';
}
async function requestBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string')return JSON.parse(req.body||'{}');
  if(typeof req[Symbol.asyncIterator]!=='function')return {};
  let raw='';
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>20000)throw new Error('Anfrage ist zu groß');
  }
  return JSON.parse(raw||'{}');
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Methode nicht erlaubt'})}
  try{
    const body=await requestBody(req);
    if(body?.action==='create'){
      const token=authToken(req,'Bearer');
      if(!masterSyncTokenMatches(token))return res.status(401).json({error:'Nicht berechtigt'});
      const created=await createDeviceEnrollment(String(body.characterSlug||''));
      return res.status(200).json(created);
    }
    if(body?.action==='revoke'){
      const token=authToken(req,'Device');
      if(!token)return res.status(401).json({error:'Nicht berechtigt'});
      const revoked=await revokeDeviceToken(token);
      return res.status(200).json({revoked,alreadyRevoked:!revoked});
    }
    const enrolled=await redeemDeviceEnrollment(String(body?.code||''));
    return res.status(200).json({
      deviceToken:enrolled.token,
      deviceId:enrolled.deviceId,
      characterSlug:enrolled.characterSlug,
      characterName:enrolled.characterName
    });
  }catch(error){
    const message=String(error.message||error).slice(0,180);
    const status=/ungültig|abgelaufen|verwendet|Unbekannter|keinem freigegebenen/.test(message)?400:503;
    return res.status(status).json({error:message});
  }
}
