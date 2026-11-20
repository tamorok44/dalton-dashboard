import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

export function dailySnapshotStoreConfigured(){
  return Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN);
}
export async function saveDailySnapshot(snapshot,date){
  if(!dailySnapshotStoreConfigured())throw new Error('Blob-Speicher nicht konfiguriert');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Ungültiges Snapshot-Datum');
  const json=JSON.stringify(snapshot);
  const raw=Buffer.from(json,'utf8');
  const compressed=gzipSync(raw,{level:9});
  const [year,month,day]=date.split('-');
  const path='history/daily/'+year+'/'+month+'/'+day+'/daltons-full.json.gz';
  const {put}=await import('@vercel/blob');
  const result=await put(path,compressed,{
    access:'public',
    addRandomSuffix:false,
    allowOverwrite:true,
    contentType:'application/gzip'
  });
  return {
    date,
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
