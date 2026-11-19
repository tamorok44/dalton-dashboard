import {createRequire} from 'node:module';
import {refreshCharacters} from '../scripts/armory-core.mjs';
const require=createRequire(import.meta.url);
const snapshot=require('../data/characters.json');
export const config={maxDuration:60};
let pending=null;
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  try{
    if(!pending)pending=(async()=>{
      const results=await Promise.all(snapshot.characters.map(c=>refreshCharacters([c])));
      const success=results.reduce((n,r)=>n+r.success,0);
      const characters=results.flatMap(r=>r.data.characters).sort((a,b)=>a.name.localeCompare(b.name,'de'));
      return {success,data:{generatedAt:new Date().toISOString(),characters},live:true};
    })().finally(()=>{pending=null});
    const value=await pending;
    if(value.success===0)return res.status(503).json({error:'Die aktuellen Profilquellen sind nicht erreichbar'});
    return res.status(200).json(value);
  }catch(e){console.error('Live-Abruf fehlgeschlagen:',e);return res.status(503).json({error:'Live-Abruf derzeit nicht verfügbar'})}
}
