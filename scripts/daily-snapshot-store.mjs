import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

export function dailySnapshotStoreConfigured(){
  // Never reuse the public media store or its default credentials.
  return process.env.VERCEL_ENV==='production'&&Boolean(process.env.DALTON_PRIVATE_ARCHIVE_TOKEN?.trim());
}
export async function saveDailySnapshot(snapshot,date,{putImpl}={}){
  if(!dailySnapshotStoreConfigured())throw new Error('Blob-Speicher nicht konfiguriert');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Ungültiges Snapshot-Datum');
  const json=JSON.stringify(snapshot);
  const raw=Buffer.from(json,'utf8');
  const compressed=gzipSync(raw,{level:9});
  const [year,month,day]=date.split('-');
  const path='history/daily/'+year+'/'+month+'/'+day+'/daltons-full.json.gz';
  const put=putImpl??(await import('@vercel/blob')).put;
  const result=await put(path,compressed,{
    access:'private',
    token:process.env.DALTON_PRIVATE_ARCHIVE_TOKEN,
    addRandomSuffix:false,
    allowOverwrite:true,
    contentType:'application/gzip'
  });
  const url=new URL(result.url);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.private.blob.vercel-storage.com'))throw new Error('Archivspeicher hat keine bestätigte private URL');
  return {
    date,
    archiveStatus:'private',
    createdAt:snapshot.snapshotAt,
    url:result.url,
    pathname:result.pathname||path,
    rawBytes:raw.length,
    gzipBytes:compressed.length,
    sha256:createHash('sha256').update(compressed).digest('hex'),
    characters:Object.keys(snapshot.characters||{}).length,
    endpoints:Object.keys(Object.values(snapshot.characters||{})[0]||{}).length
  };
}
