import {cachedForeverDbProfessionMasters} from '../scripts/workshop-store.mjs';

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Methode nicht erlaubt'});
  try{
    const result=await cachedForeverDbProfessionMasters(['alchemy'],{build:'1.60.1.71037'});
    const master=result?.alchemy||null;
    return res.status(200).json({
      master:{
        slug:master?.slug||null,
        name:master?.name||null,
        ranks:master?.ranks||[],
        trainers:(master?.trainers||[]).map(t=>({
          id:t.id??null,
          name:t.name??null,
          npcTitle:t.npcTitle??null,
          location:t.location??null,
          evidence:t.evidence??null,
          side:t.side??null,
          sourceLabel:t.sourceLabel??null
        }))
      }
    });
  }catch(error){
    return res.status(503).json({error:String(error.message).slice(0,200)});
  }
}
