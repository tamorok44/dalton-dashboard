import {createHash} from 'node:crypto';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
const compress=promisify(gzip),decompress=promisify(gunzip);
import {canonicalRoster,rosterKey} from './daily-roster.mjs';
import {FOREVER_CHARACTER_ENDPOINTS,foreverProfileSlug} from './blizzard-api.mjs';

const MAX_COMPRESSED=16*1024*1024,MAX_RAW=64*1024*1024;
function archivePath(date,roster){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Ungültiges Snapshot-Datum');
  const [year,month,day]=date.split('-');
  return 'history/private/v3/daily/'+year+'/'+month+'/'+day+'/'+rosterKey(roster)+'/daltons-full.json.gz';
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
export function classifySnapshot(snapshot,{expectedSlugs=null,expectedRoster=null,date=null}={}){
  const entries=Object.entries(snapshot?.characters||{});
  if(!entries.length||!Number.isFinite(Date.parse(snapshot?.snapshotAt))||(date&&!snapshot.snapshotAt.startsWith(date+'T')))throw new Error('Ungültiger Archivinhalt');
  const expected=expectedRoster?canonicalRoster(expectedRoster):expectedSlugs?canonicalRoster(expectedSlugs):null;
  if(expected&&JSON.stringify(entries.map(([slug])=>slug).sort())!==JSON.stringify(expected.map(x=>x.slug).sort()))throw new Error('Archiv-Roster stimmt nicht überein');
  const names=Object.keys(FOREVER_CHARACTER_ENDPOINTS);
  const successful=entry=>entry?.ok===true&&Number.isInteger(entry.status)&&entry.status>=200&&entry.status<300&&entry.data&&typeof entry.data==='object'&&
    !['raw','error','errors','error_description'].some(key=>Object.hasOwn(entry.data,key))&&
    !Array.isArray(entry.data)&&!(Number(entry.data.code)>=400||Number(entry.data.status)>=400)&&
    Object.keys(entry.data).some(key=>!['_links','id','character','name','surname','slug'].includes(key));
  const ids=new Set();
  let good=0,total=0;
  for(const [slug,endpoints] of entries){
    if(!/^[a-z0-9-]+$/i.test(slug)||!successful(endpoints?.profile)||!Number.isSafeInteger(endpoints.profile.data.id)||endpoints.profile.data.id<=0)throw new Error('Archiv ohne bestätigtes Charakterprofil');
    const profile=endpoints.profile.data,id=profile.id;
    if(foreverProfileSlug(profile)!==slug.toLowerCase()||!Number.isInteger(profile.level)||profile.level<=0)
      throw new Error('Archiv ohne bestätigtes Charakterprofil: Name oder Stufe');
    if(ids.has(id))throw new Error('Doppelte Profil-ID im Archiv');
    ids.add(id);
    const expectedId=expected?.find(x=>x.slug===slug)?.id;
    if(expectedRoster&&expectedId==null)throw new Error('Archiv-Profil-ID nicht durch Refresh bestätigt');
    if(expectedId!=null&&expectedId!==id)throw new Error('Archiv-Profil-ID stimmt nicht überein');
    for(const name of names){total++;if(successful(endpoints[name]))good++;}
  }
  return {status:good===total?'complete':'partial',successful:good,expected:total,identity:expectedRoster?'roster_id_and_slug':'slug_only',scope:'transport_and_core_identity'};
}
function metadata(snapshot,date,blob,compressed,raw,quality,roster){
  return {date,archiveStatus:'private',quality,roster:canonicalRoster(roster),rosterKey:rosterKey(roster),createdAt:snapshot.snapshotAt,url:blob.url,pathname:blob.pathname,
    rawBytes:raw.length,gzipBytes:compressed.length,sha256:createHash('sha256').update(compressed).digest('hex'),
    characters:Object.keys(snapshot.characters).length,endpoints:Object.keys(FOREVER_CHARACTER_ENDPOINTS).length};
}
// Bound the caller even when the SDK is sleeping in its retry backoff.
// Transport is still signaled; an already accepted immutable object can be
// recovered next run. Do not equate this with cancelling provider-side work.
function assertBudget(signal,deadlineAt){
  signal.throwIfAborted();
  if(performance.now()>=deadlineAt)throw new Error('Archivfrist abgelaufen');
}
export async function withinArchiveDeadline(work,signal,deadlineAt=Infinity){
  assertBudget(signal,deadlineAt);
  let onAbort;
  const aborted=new Promise((_,reject)=>{onAbort=()=>reject(signal.reason??new Error('Archivfrist abgelaufen'));signal.addEventListener('abort',onAbort,{once:true});});
  try{
    const result=await Promise.race([Promise.resolve().then(()=>{assertBudget(signal,deadlineAt);return work();}),aborted]);
    assertBudget(signal,deadlineAt);return result;
  }finally{signal.removeEventListener('abort',onAbort);}
}
export async function saveDailySnapshot(snapshot,date,{putImpl,signal=AbortSignal.timeout(10000),deadlineAt=performance.now()+10000,expectedSlugs=null,expectedRoster=null}={}){
  const opts=options(signal);
  assertBudget(signal,deadlineAt);
  const roster=canonicalRoster(expectedRoster??expectedSlugs??Object.keys(snapshot?.characters||{}));
  const path=archivePath(date,roster);
  const quality=classifySnapshot(snapshot,{expectedRoster:roster,date});
  const raw=Buffer.from(JSON.stringify(snapshot),'utf8');
  if(raw.length>MAX_RAW)throw new Error('Archiv zu groß');
  assertBudget(signal,deadlineAt);
  const compressed=await withinArchiveDeadline(()=>compress(raw,{level:6}),signal,deadlineAt);
  if(compressed.length>MAX_COMPRESSED)throw new Error('Komprimiertes Archiv zu groß');
  const put=putImpl??(await import('@vercel/blob')).put;
  // Yield to the timers even if JSON serialization consumed the budget.
  await new Promise(resolve=>setImmediate(resolve));
  const blob=await withinArchiveDeadline(()=>put(path,compressed,{...opts,addRandomSuffix:false,allowOverwrite:false,contentType:'application/gzip'}),signal,deadlineAt);
  verifyBlob(blob,path);
  const result=metadata(snapshot,date,blob,compressed,raw,quality,roster);
  assertBudget(signal,deadlineAt);return result;
}
export async function recoverDailySnapshot(date,{getImpl,signal=AbortSignal.timeout(10000),deadlineAt=performance.now()+10000,expectedSlugs=null,expectedRoster=null}={}){
  const opts=options(signal),roster=canonicalRoster(expectedRoster??expectedSlugs),path=archivePath(date,roster);
  const get=getImpl??(await import('@vercel/blob')).get;
  const result=await withinArchiveDeadline(()=>get(path,{...opts,useCache:false}),signal,deadlineAt);
  if(!result)return null;
  if(result.statusCode!==200||!result.stream)throw new Error('Privates Archiv nicht lesbar');
  verifyBlob(result.blob,path);
  const reader=result.stream.getReader(),chunks=[];let size=0;
  try{
    while(true){
      signal.throwIfAborted();
      const {done,value}=await withinArchiveDeadline(()=>reader.read(),signal,deadlineAt);
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_COMPRESSED)throw new Error('Komprimiertes Archiv zu groß');
      chunks.push(Buffer.from(value));
    }
  }finally{void reader.cancel().catch(()=>{});}
  const compressed=Buffer.concat(chunks,size),raw=await withinArchiveDeadline(()=>decompress(compressed,{maxOutputLength:MAX_RAW}),signal,deadlineAt);
  const snapshot=JSON.parse(raw.toString('utf8')),quality=classifySnapshot(snapshot,{expectedRoster:roster,date});
  const meta=metadata(snapshot,date,result.blob,compressed,raw,quality,roster);
  assertBudget(signal,deadlineAt);return meta;
}
