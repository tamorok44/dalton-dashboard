import {loadCharacters} from '../scripts/character-store.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  try{
    const result=await loadCharacters();
    return res.status(200).json(result);
  }catch(e){
    console.error('Datenbank-Lesen fehlgeschlagen:',e);
    return res.status(503).json({error:'Gespeicherte Charakterdaten derzeit nicht erreichbar'});
  }
}
