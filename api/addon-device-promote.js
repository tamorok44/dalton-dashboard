import {promoteColeDeviceToProduction} from '../scripts/addon-device-auth.mjs';

export const config={maxDuration:15};

function authToken(req){
  const raw=String(req.headers?.authorization||'');
  return raw.startsWith('Device ')?raw.slice('Device '.length):'';
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(process.env.VERCEL_ENV==='production')return res.status(404).json({error:'Nicht gefunden'});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Methode nicht erlaubt'})}
  try{
    const promoted=await promoteColeDeviceToProduction(authToken(req));
    return res.status(200).json({
      deviceToken:promoted.token,
      deviceId:promoted.deviceId,
      characterSlug:promoted.characterSlug,
      characterName:promoted.characterName,
      productionEndpoint:'https://dalton-dashboard-eight.vercel.app/api/addon-sync'
    });
  }catch(error){
    const message=String(error.message||error).slice(0,180);
    const status=/Nur Coles|ungültig|Preview/.test(message)?401:503;
    return res.status(status).json({error:message});
  }
}
