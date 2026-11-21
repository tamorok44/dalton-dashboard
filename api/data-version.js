import {loadCurrentDataVersion} from '../scripts/data-version.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  try{return res.status(200).json(await loadCurrentDataVersion())}
  catch(error){
    console.error('Datenversion konnte nicht geladen werden:',error);
    return res.status(503).json({error:'Datenversion derzeit nicht erreichbar'});
  }
}
