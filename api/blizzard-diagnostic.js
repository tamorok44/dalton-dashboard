import {blizzardApiConfigured,probeForeverCharacter} from '../scripts/blizzard-api.mjs';

export const config={maxDuration:60};
const allowed=new Set(['cole-dalton','chucky-dalton','dolly-dalton','viola-dalton']);

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'Methode nicht erlaubt'});
  }
  if(!blizzardApiConfigured())return res.status(503).json({error:'Blizzard API-Zugangsdaten fehlen'});
  const slug=String(req.query?.slug||'cole-dalton').toLowerCase();
  if(!allowed.has(slug))return res.status(400).json({error:'Nur konfigurierte Dalton-Profile sind für die Diagnose erlaubt'});
  try{
    const result=await probeForeverCharacter(slug);
    return res.status(200).json(result);
  }catch(error){
    console.error('Blizzard-API-Diagnose fehlgeschlagen:',error);
    return res.status(503).json({error:String(error.message).slice(0,180)});
  }
}
