import {gzipSync} from 'node:zlib';

export const config={maxDuration:60};

const REGION='eu';
const NAMESPACE='profile-forever-eu';
const API_BASE='https://eu.api.blizzard.com';
const TOKEN_URL='https://oauth.battle.net/token';
const CHARACTERS=['cole-dalton','chucky-dalton','dolly-dalton','viola-dalton'];
const ENDPOINTS={
  profile:'',
  status:'/status',
  equipment:'/equipment',
  professions:'/professions',
  statistics:'/statistics',
  specializations:'/specializations',
  media:'/character-media',
  achievements:'/achievements',
  appearance:'/appearance',
  collections:'/collections',
  dungeons:'/encounters/dungeons',
  raids:'/encounters/raids',
  mythicKeystone:'/mythic-keystone-profile',
  pvp:'/pvp-summary',
  quests:'/quests',
  reputations:'/reputations',
  titles:'/titles',
  hunterPets:'/hunter-pets'
};

const bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value),'utf8');

async function token(){
  const id=process.env.BLIZZARD_CLIENT_ID;
  const secret=process.env.BLIZZARD_CLIENT_SECRET;
  if(!id||!secret)throw new Error('Blizzard credentials missing');
  const response=await fetch(TOKEN_URL,{
    method:'POST',
    headers:{
      authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),
      'content-type':'application/x-www-form-urlencoded'
    },
    body:'grant_type=client_credentials',
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('OAuth HTTP '+response.status);
  const body=await response.json();
  if(!body.access_token)throw new Error('OAuth token missing');
  return body.access_token;
}

function urlFor(slug,suffix){
  const url=new URL(API_BASE+'/profile/wow/character/'+slug+suffix);
  url.searchParams.set('namespace',NAMESPACE);
  url.searchParams.set('locale','en_GB');
  return url;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{
    const accessToken=await token();
    const snapshot={
      snapshotAt:new Date().toISOString(),
      region:REGION,
      namespace:NAMESPACE,
      locale:'en_GB',
      characters:{}
    };
    const measurements={};
    const jobs=[];
    for(const slug of CHARACTERS){
      snapshot.characters[slug]={};
      measurements[slug]={};
      for(const [name,suffix] of Object.entries(ENDPOINTS)){
        jobs.push((async()=>{
          const response=await fetch(urlFor(slug,suffix),{
            headers:{authorization:'Bearer '+accessToken,accept:'application/json'},
            signal:AbortSignal.timeout(15000)
          });
          const text=await response.text();
          let body;
          try{body=text?JSON.parse(text):null}catch{body={raw:text}}
          const rawBytes=bytes(text);
          const gzipBytes=gzipSync(Buffer.from(text,'utf8'),{level:9}).length;
          measurements[slug][name]={
            status:response.status,
            ok:response.ok,
            rawBytes,
            gzipBytes
          };
          snapshot.characters[slug][name]=response.ok
            ?body
            :{_httpStatus:response.status,_error:body?.detail||body?.title||body?.type||null};
        })());
      }
    }
    await Promise.all(jobs);

    const snapshotJson=JSON.stringify(snapshot);
    const snapshotRawBytes=bytes(snapshotJson);
    const snapshotGzipBytes=gzipSync(Buffer.from(snapshotJson,'utf8'),{level:9}).length;

    const endpointTotals={};
    for(const name of Object.keys(ENDPOINTS)){
      endpointTotals[name]={rawBytes:0,gzipBytes:0,successes:0,failures:0};
      for(const slug of CHARACTERS){
        const m=measurements[slug][name];
        endpointTotals[name].rawBytes+=m.rawBytes;
        endpointTotals[name].gzipBytes+=m.gzipBytes;
        if(m.ok)endpointTotals[name].successes++;else endpointTotals[name].failures++;
      }
    }

    const perCharacter={};
    for(const slug of CHARACTERS){
      const charJson=JSON.stringify(snapshot.characters[slug]);
      const raw=bytes(charJson);
      const gz=gzipSync(Buffer.from(charJson,'utf8'),{level:9}).length;
      perCharacter[slug]={rawBytes:raw,gzipBytes:gz};
    }

    if(req.query?.full==='1')return res.status(200).json(snapshot);

    return res.status(200).json({
      measuredAt:snapshot.snapshotAt,
      characters:CHARACTERS.length,
      endpoints:Object.keys(ENDPOINTS).length,
      requestCount:CHARACTERS.length*Object.keys(ENDPOINTS).length,
      namespace:NAMESPACE,
      fullSnapshot:{
        rawBytes:snapshotRawBytes,
        gzipBytes:snapshotGzipBytes,
        compressionRatio:Number((snapshotGzipBytes/snapshotRawBytes).toFixed(4))
      },
      perCharacter,
      endpointTotals,
      measurements
    });
  }catch(error){
    console.error('Snapshot size measurement failed',error);
    return res.status(503).json({error:String(error.message).slice(0,200)});
  }
}
