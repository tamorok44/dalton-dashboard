import {refreshCharacters} from '../scripts/armory-core.mjs';
import {archiveImages} from '../scripts/archive-images.mjs';
import {loadCharacters,saveCharacters,mergeProfiles,configured} from '../scripts/character-store.mjs';
export const config={maxDuration:60};
let pending=null;
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Methode nicht erlaubt'})}
  if(req.method==='POST'){
    const secret=process.env.CRON_SECRET;
    if(!secret||req.headers?.authorization!=='Bearer '+secret)return res.status(401).json({error:'Nicht autorisiert'});
  }
  if(!configured())return res.status(503).json({error:'Datenbankverbindung fehlt; Live-Daten wurden nicht gespeichert'});
  try{
    if(!pending)pending=(async()=>{
      const {data:previous}=await loadCharacters();
      const results=await Promise.all(previous.characters.map(c=>refreshCharacters([c])));
      const success=results.reduce((n,r)=>n+r.success,0);
      if(success===0)return {success:0};
      const latest={generatedAt:new Date().toISOString(),characters:results.flatMap(r=>r.data.characters).sort((a,b)=>a.name.localeCompare(b.name,'de'))};
      const merged=mergeProfiles(previous,latest);
      const archived=await archiveImages(merged,previous);
      await saveCharacters(archived);
      return {success,data:archived,live:true,persisted:true};
    })().finally(()=>{pending=null});
    const result=await pending;
    if(result.success===0)return res.status(503).json({error:'Die aktuellen Profilquellen sind nicht erreichbar; gespeicherte Daten bleiben erhalten'});
    return res.status(200).json(result);
  }catch(e){
    console.error('Live-Abruf oder Speichern fehlgeschlagen:',e);
    return res.status(503).json({error:'Aktualisierung konnte nicht dauerhaft gespeichert werden'});
  }
}
