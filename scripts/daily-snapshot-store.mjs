import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {FOREVER_CHARACTER_ENDPOINTS} from './blizzard-api.mjs';

const MAX_COMPRESSED=16*1024*1024,MAX_RAW=64*1024*1024;
function archivePath(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Ungültiges Snapshot-Datum');
  const [year,month,day]=date.split('-');
  return 'history/private/v2/daily/'+year+'/'+month+'/'+day+'/daltons-full.json.gz';
}
export function dailySnapshotStoreConfigured(){
  return process.env.VERCEL_ENV==='production'&&Boolean(process.env.DALTON_PRIVATE_ARCHIVE_TOKEN?.trim());
}
function options(signal){
  if(!dailySnapshotStoreConfigured())throw new Error('Privater Blob-Speicher nicht konfiguriert');
  return {access:'private',token:process.env.DALTON_PRIVATE_ARCHIVE_TOKEN,abortSignal:signal};
}
function verifyBlob(blob,path){
  const url=new URL(blob?.url);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.private.blob.vercel-storage.com')||url.pathname!=='/'+path||blob.pathname!==path)
    throw new Error('Archivspeicher hat keine bestätigte private URL');
}
export function classifySnapshot(snapshot,{expectedSlugs=null,date=null}={}){
  const entries=Object.entries(snapshot?.characters||{});
  if(!entries.length||!Number.isFinite(Date.parse(snapshot?.snapshotAt))||(date&&!snapshot.snapshotAt.startsWith(date+'T')))throw new Error('Ungültiger Archivinhalt');
  if(expectedSlugs&&JSON.stringify(entries.map(([slug])=>slug).sort())!==JSON.stringify([...expectedSlugs].sort()))throw new Error('Archiv-Roster stimmt nicht überein');
  const names=Object.keys(FOREVER_CHARACTER_ENDPOINTS);
  const successful=entry=>entry?.ok===true&&Number.isInteger(entry.status)&&entry.status>=200&&entry.status<300&&entry.data&&typeof entry.data==='object'&&!Object.hasOwn(entry.data,'raw');
  let good=0,total=0;
  for(const [slug,endpoints] of entries){
    if(!/^[a-z0-9-]+$/i.test(slug)||!successful(endpoints?.profile)||!Number.isSafeInteger(endpoints.profile.data.id)||endpoints.profile.data.id<=0)throw new Error('Archiv ohne bestätigtes Charakterprofil');
    for(const name of names){total++;if(successful(endpoints[name]))good++;}
  }
  return {status:good===total?'complete':'partial',successful:good,expected:total};
}
function metadata(snapshot,date,blob,compressed,raw,quality){
  return {date,archiveStatus:'private',quality,createdAt:snapshot.snapshotAt,url:blob.url,pathname:blob.pathname,
    rawBytes:raw.length,gzipBytes:compressed.length,sha256:createHash('sha256').update(compressed).digest('hex'),
    characters:Object.keys(snapshot.characters).length,endpoints:Object.keys(FOREVER_CHARACTER_ENDPOINTS).length};
}
export async function saveDailySnapshot(snapshot,date,{putImpl,signal=AbortSignal.timeout(10000),expectedSlugs=null}={}){
  const opts=options(signal),path=archivePath(date);
  const quality=classifySnapshot(snapshot,{expectedSlugs,date});
  const raw=Buffer.from(JSON.stringify(snapshot),'utf8');
  if(raw.length>MAX_RAW)throw new Error('Archiv zu groß');
  const compressed=gzipSync(raw,{level:6});
  if(compressed.length>MAX_COMPRESSED)throw new Error('Komprimiertes Archiv zu groß');
  const put=putImpl??(await import('@vercel/blob')).put;
  const blob=await put(path,compressed,{...opts,addRandomSuffix:false,allowOverwrite:false,contentType:'application/gzip'});
  verifyBlob(blob,path);
  return metadata(snapshot,date,blob,compressed,raw,quality);
}
export async function recoverDailySnapshot(date,{getImpl,signal=AbortSignal.timeout(10000),expectedSlugs=null}={}){
  const opts=options(signal),path=archivePath(date);
  const get=getImpl??(await import('@vercel/blob')).get;
  const result=await get(path,{...opts,useCache:false});
  if(!result)return null;
  if(result.statusCode!==200||!result.stream)throw new Error('Privates Archiv nicht lesbar');
  verifyBlob(result.blob,path);
  const reader=result.stream.getReader(),chunks=[];let size=0;
  try{
    while(true){
      signal.throwIfAborted();
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_COMPRESSED)throw new Error('Komprimiertes Archiv zu groß');
      chunks.push(Buffer.from(value));
    }
  }finally{await reader.cancel().catch(()=>{});}
  const compressed=Buffer.concat(chunks,size),raw=gunzipSync(compressed,{maxOutputLength:MAX_RAW});
  const snapshot=JSON.parse(raw.toString('utf8')),quality=classifySnapshot(snapshot,{expectedSlugs,date});
  return metadata(snapshot,date,result.blob,compressed,raw,quality);
}
