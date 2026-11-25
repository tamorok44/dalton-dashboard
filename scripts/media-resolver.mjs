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
export function imageStoreConfigured(){
  return Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN);
}
export function sourceImageAllowed(url){
  return SOURCE_RULES.some(rule=>rule.test(String(url||'')));
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

  const response=await fetchImpl(sourceUrl,{
    headers:{'user-agent':'Dalton-Dashboard/1.0 media archiver'},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok){
    if(response.status===403||response.status===404){
      try{await saveMediaRecord(type,id,kind,{sourceUrl,storedUrl:null,contentType:null})}catch{}
      return null;
    }
    throw Error('Bildquelle HTTP '+response.status);
  }
  const contentType=(response.headers.get('content-type')||'').split(';')[0];
  if(!ALLOWED_TYPES.has(contentType))throw Error('Ungültiges Bildformat');
  const body=Buffer.from(await response.arrayBuffer());
  if(body.length===0||body.length>MAX_IMAGE_BYTES)throw Error('Bildgröße unzulässig');

  const put=putImpl||((await import('@vercel/blob')).put);
  const path='media/'+type+'/'+id+'/'+kind+'-'+hash(sourceUrl)+'.'+extensionFor(contentType);
  const result=await put(path,body,{
    access:'public',
    addRandomSuffix:false,
    allowOverwrite:true,
    contentType
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
