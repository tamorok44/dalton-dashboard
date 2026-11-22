import {fetchForeverDbProfession} from '../scripts/foreverdb-api.mjs';

function pickTrainerData(raw={}){
  return {
    keys:Object.keys(raw).sort(),
    value:raw
  };
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Methode nicht erlaubt'});
  try{
    const page=await fetchForeverDbProfession('alchemy',{limit:1,offset:0});
    const data=page?.data||{};
    const trainers=Array.isArray(data.trainers)?data.trainers:
      Array.isArray(data.professionTrainers)?data.professionTrainers:
      Array.isArray(data.profession_trainers)?data.profession_trainers:[];
    return res.status(200).json({
      dataKeys:Object.keys(data).sort(),
      trainerCount:trainers.length,
      trainers:trainers.map(pickTrainerData)
    });
  }catch(error){
    return res.status(503).json({error:String(error.message).slice(0,200)});
  }
}
