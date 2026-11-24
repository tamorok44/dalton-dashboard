import {createDeviceEnrollment} from '../scripts/addon-device-auth.mjs';

export const config={maxDuration:10};

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({error:'Nicht gefunden'});
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  try{
    const created=await createDeviceEnrollment('cole-dalton');
    return res.status(200).json(created);
  }catch(error){
    return res.status(503).json({error:String(error.message||error).slice(0,180)});
  }
}
