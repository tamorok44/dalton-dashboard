import {createHash} from 'node:crypto';
import {loadMediaRecord,saveMediaRecord,loadMediaRecords,mediaField} from './media-registry.mjs';

const MAX_IMAGE_BYTES=5_000_000;
const ALLOWED_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const SOURCE_RULES=[
  /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\//,
  /^https:\/\/render-eu\.worldofwarcraft\.com\/npcs\/(?:zoom|portrait)\/creature-display-\d+\.jpg$/,
  /^https:\/\/render\.worldofwarcraft\.com\/eu\/npcs\/(?:zoom|portrait)\/creature-display-\d+\.jpg$/,
  /^https:\/\/foreverspec\.com\/icons\/\d+\.webp$/,
  /^https:\/\/foreverdb\.net\/icons\/\d+\.webp$/,
  /^https:\/\/warcraft\.wiki\.gg\/images\//
];

function hash(value){
  return createHash('sha256').update(String(value)).digest('hex').slice(0,24);
}
function safePart(value){
  return String(value??'unknown').replace(/[^a-z0-9:_-]+/gi,'-').slice(0,96)||'unknown';
}
function extensionFor(type){
  if(type==='image/png')return 'png';
  if(type==='image/webp')return 'webp';
  return 'jpg';
}
export function publicBlobWritesAllowed(env=process.env){
  if((env.VERCEL||env.VERCEL_ENV)&&env.VERCEL_ENV!=='production')return false;
  return Boolean(env.BLOB_STORE_ID||env.BLOB_READ_WRITE_TOKEN);
}
export const imageStoreConfigured=publicBlobWritesAllowed;
export function sourceImageAllowed(url){
  return SOURCE_RULES.some(rule=>rule.test(String(url||'')));
}

async function readImageBody(response,signal){
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_IMAGE_BYTES)){
    void response.body?.cancel().catch(()=>{});
    throw Error('Bildgröße unzulässig');
  }
  if(!response.body)throw Error('Bildgröße unzulässig');
  const reader=response.body.getReader();
  const chunks=[];
  let size=0,complete=false;
  const abort=()=>{void reader.cancel(signal.reason).catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      signal.throwIfAborted();
      const {done,value}=await reader.read();
      signal.throwIfAborted();
      if(done){complete=true;break;}
      size+=value.byteLength;
      if(size>MAX_IMAGE_BYTES)throw Error('Bildgröße unzulässig');
      chunks.push(value);
    }
  }finally{
    signal.removeEventListener('abort',abort);
    if(!complete)abort();
    reader.releaseLock();
  }
  if(!size)throw Error('Bildgröße unzulässig');
  return Buffer.concat(chunks,size);
}

export async function resolveMediaAsset({
  entityType,
  entityId,
  role,
  sourceUrl,
  priorStoredUrl=null,
  fetchImpl=fetch,
  putImpl=null,
  refreshOnSourceChange=false
}={}){
  const type=safePart(entityType),id=safePart(entityId),kind=safePart(role);
  if(!type||!id||!kind||!sourceImageAllowed(sourceUrl))return null;

  if(priorStoredUrl){
    try{
      const known=await loadMediaRecord(type,id,kind);
      if(!known?.storedUrl){
        await saveMediaRecord(type,id,kind,{sourceUrl,storedUrl:priorStoredUrl,contentType:null});
      }
    }catch{}
    return priorStoredUrl;
  }

  try{
    const known=await loadMediaRecord(type,id,kind);
    if(known?.storedUrl&&(!refreshOnSourceChange||known.sourceUrl===sourceUrl))return known.storedUrl;
    const negativeAge=Date.now()-Date.parse(known?.updatedAt||'');
    if(!known?.storedUrl&&known?.sourceUrl===sourceUrl&&Number.isFinite(negativeAge)&&negativeAge>=0&&negativeAge<7*24*60*60*1000)return null;
  }catch(error){
    console.warn('Medienregister konnte nicht gelesen werden:',String(error.message).slice(0,100));
  }

  if(!imageStoreConfigured())return null;

  const signal=AbortSignal.timeout(12000);
  const response=await fetchImpl(sourceUrl,{
    headers:{'user-agent':'Dalton-Dashboard/1.0 media archiver'},
    redirect:'error',
    signal
  });
  if(response.redirected||response.url&&!sourceImageAllowed(response.url)){
    void response.body?.cancel().catch(()=>{});
    throw Error('Bildquelle außerhalb der erlaubten Ziele');
  }
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    if(response.status===403||response.status===404){
      try{await saveMediaRecord(type,id,kind,{sourceUrl,storedUrl:null,contentType:null})}catch{}
      return null;
    }
    throw Error('Bildquelle HTTP '+response.status);
  }
  const contentType=(response.headers.get('content-type')||'').split(';')[0];
  if(!ALLOWED_TYPES.has(contentType)){
    void response.body?.cancel().catch(()=>{});
    throw Error('Ungültiges Bildformat');
  }
  const body=await readImageBody(response,signal);

  const put=putImpl||((await import('@vercel/blob')).put);
  signal.throwIfAborted();
  const path='media/'+type+'/'+id+'/'+kind+'-'+hash(sourceUrl)+'.'+extensionFor(contentType);
  const result=await put(path,body,{
    access:'public',
    addRandomSuffix:false,
    allowOverwrite:true,
    contentType,
    abortSignal:signal
  });
  await saveMediaRecord(type,id,kind,{sourceUrl,storedUrl:result.url,contentType});
  return result.url;
}

// The resolver remains the only direct caller of the shared media registry.
export function mediaIconKey(type,id){return mediaField(type,id,'icon')}
export async function readIconRecords(refs){return loadMediaRecords(refs)}
export async function rememberMissingIcon(type,id,lookupPolicy,sourceUrl=null){return saveMediaRecord(type,id,'icon',{sourceUrl:sourceImageAllowed(sourceUrl)?sourceUrl:null,storedUrl:null,lookupPolicy})}

export function mediaAssetKey(type,id,role){return mediaField(type,id,role)}
export async function readAssetRecords(refs){return loadMediaRecords(refs)}

export async function rememberMissingAsset(type,id,role,lookupPolicy){return saveMediaRecord(type,id,role,{sourceUrl:null,storedUrl:null,lookupPolicy})}
