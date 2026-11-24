import {configured,redis} from '../scripts/character-store.mjs';

function n(value){const x=Number(value);return Number.isFinite(x)?x:null}
function parseInfo(raw){
  if(typeof raw!=='string')return null;
  const out={};
  for(const line of raw.split(/\r?\n/)){
    if(!line||line.startsWith('#'))continue;
    const i=line.indexOf(':');
    if(i<=0)continue;
    const key=line.slice(0,i);
    const value=line.slice(i+1);
    if(['used_memory','used_memory_peak','total_net_input_bytes','total_net_output_bytes','total_commands_processed','keyspace_hits','keyspace_misses','uptime_in_seconds'].includes(key)){
      out[key]=n(value)??value;
    }
  }
  return out;
}
async function keyMeasure(key,type){
  const result={key,type};
  try{result.memoryBytes=n(await redis(['MEMORY','USAGE',key]))}catch{}
  if(type==='string')result.payloadBytes=n(await redis(['STRLEN',key]));
  else if(type==='hash')result.entries=n(await redis(['HLEN',key]));
  else if(type==='list')result.entries=n(await redis(['LLEN',key]));
  else if(type==='set')result.entries=n(await redis(['SCARD',key]));
  else if(type==='zset')result.entries=n(await redis(['ZCARD',key]));
  return result;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  if(process.env.VERCEL_ENV==='production')return res.status(404).json({error:'Nicht verfügbar'});
  if(!configured())return res.status(503).json({error:'Redis nicht konfiguriert'});
  try{
    const keys=[];
    let cursor='0';
    do{
      const result=await redis(['SCAN',cursor,'MATCH','dalton-dashboard:*','COUNT','500']);
      cursor=String(result?.[0]??'0');
      for(const key of Array.isArray(result?.[1])?result[1]:[])keys.push(key);
    }while(cursor!=='0'&&keys.length<5000);
    keys.sort();
    const measurements=[];
    for(const key of keys){
      const type=String(await redis(['TYPE',key])||'none');
      measurements.push(await keyMeasure(key,type));
    }
    let info=null;
    try{info=parseInfo(await redis(['INFO','stats']))}catch{}
    const byPrefix={};
    for(const row of measurements){
      const parts=row.key.split(':');
      const prefix=parts.slice(0,Math.min(parts.length,4)).join(':');
      const agg=byPrefix[prefix]||(byPrefix[prefix]={keys:0,memoryBytes:0,payloadBytes:0,entries:0});
      agg.keys++;
      agg.memoryBytes+=row.memoryBytes||0;
      agg.payloadBytes+=row.payloadBytes||0;
      agg.entries+=row.entries||0;
    }
    return res.status(200).json({
      generatedAt:new Date().toISOString(),
      dbSize:await redis(['DBSIZE']),
      keyCount:measurements.length,
      info,
      totals:{
        memoryBytes:measurements.reduce((s,r)=>s+(r.memoryBytes||0),0),
        stringPayloadBytes:measurements.reduce((s,r)=>s+(r.payloadBytes||0),0)
      },
      byPrefix,
      keys:measurements
    });
  }catch(error){
    console.error('Storage-Diagnose fehlgeschlagen:',error);
    return res.status(503).json({error:'Storage-Diagnose fehlgeschlagen'});
  }
}
