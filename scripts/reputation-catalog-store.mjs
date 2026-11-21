import {fetchForeverReputationIndex} from './blizzard-api.mjs';
import {archiveCatalogSnapshot,loadAllCatalogRecords,loadCatalogMeta,saveCatalogRecords} from './game-catalog-store.mjs';
import {loadMediaRecord,saveMediaRecord} from './media-registry.mjs';
import {REPUTATION_BUILD,foreverReputationSeed,factionCrestFor,factionCrests,factionSeedByName} from '../reputation-data.js';

const EXPECTED=foreverReputationSeed.length;
function buildFromNamespace(namespace=''){
  const match=String(namespace).match(/^static-([a-z0-9._]+)-forever-eu$/i);
  return match?.[1]?.replace(/_/g,'.')||REPUTATION_BUILD;
}

function imageStoreConfigured(){
  return Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN);
}
function safeExt(type,url){
  if(type==='image/webp'||/\.webp(?:\?|$)/i.test(url))return 'webp';
  if(type==='image/jpeg'||/\.jpe?g(?:\?|$)/i.test(url))return 'jpg';
  return 'png';
}
async function archiveCrest(record,cache,fetchImpl=fetch){
  const sourceUrl=record?.media?.crestSourceUrl;
  if(!sourceUrl||!imageStoreConfigured())return record;
  try{
    const known=await loadMediaRecord('faction',record.id,'crest');
    if(known?.sourceUrl===sourceUrl&&known?.storedUrl){
      return {...record,media:{...record.media,crestStoredUrl:known.storedUrl}};
    }
  }catch{}
  if(cache.has(sourceUrl)){
    const storedUrl=await cache.get(sourceUrl);
    return storedUrl?{...record,media:{...record.media,crestStoredUrl:storedUrl}}:record;
  }
  const task=(async()=>{
    const url=new URL(sourceUrl);
    if(url.protocol!=='https:'||url.hostname!=='warcraft.wiki.gg'||!url.pathname.startsWith('/images/'))return null;
    const response=await fetchImpl(sourceUrl,{headers:{'user-agent':'Dalton-Dashboard/1.0 reputation asset archiver'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)return null;
    const type=(response.headers.get('content-type')||'').split(';')[0];
    if(!['image/png','image/jpeg','image/webp'].includes(type))return null;
    const body=Buffer.from(await response.arrayBuffer());
    if(!body.length||body.length>1_000_000)return null;
    const {put}=await import('@vercel/blob');
    const result=await put('media/faction/shared/'+Buffer.from(sourceUrl).toString('base64url').slice(0,48)+'.'+safeExt(type,sourceUrl),body,{
      access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:type
    });
    return result.url;
  })().catch(()=>null);
  cache.set(sourceUrl,task);
  const storedUrl=await task;
  if(storedUrl){
    try{await saveMediaRecord('faction',record.id,'crest',{sourceUrl,storedUrl})}catch{}
    return {...record,media:{...record.media,crestStoredUrl:storedUrl}};
  }
  return record;
}

function crestKind(seed){
  return Object.hasOwn(factionCrests,seed.slug)?'specific':seed.side==='neutral'?'neutral-fallback':'side-fallback';
}
function fallbackRecord(seed,build=REPUTATION_BUILD){
  return {
    type:'faction',
    id:'slug:'+seed.slug,
    name:seed.name,
    slug:seed.slug,
    side:seed.side,
    forever:Boolean(seed.forever),
    crestKind:crestKind(seed),
    build,
    source:'ForeverDB build '+build,
    media:{crestSourceUrl:factionCrestFor(seed)}
  };
}
function mergeIndex(index=[],build=REPUTATION_BUILD){
  const matched=new Map();
  const unmatched=[];
  for(const entry of index){
    const seed=factionSeedByName(entry.name);
    if(!seed){unmatched.push(entry);continue}
    matched.set(seed.slug,{
      type:'faction',
      id:entry.id,
      name:entry.name,
      slug:seed.slug,
      side:seed.side,
      forever:Boolean(seed.forever),
      crestKind:crestKind(seed),
      href:entry.href||null,
      build,
      source:'Blizzard Forever + ForeverDB build '+build,
      media:{crestSourceUrl:factionCrestFor(seed)}
    });
  }
  const missing=foreverReputationSeed.filter(seed=>!matched.has(seed.slug));
  return {records:[...matched.values()],missing,unmatched};
}

export async function syncReputationCatalog({namespace,force=false,fetchImpl=fetch,archiveMedia=true}={}){
  const build=buildFromNamespace(namespace);
  if(!force){
    try{
      const meta=await loadCatalogMeta();
      const factionMeta=meta?.faction;
      const existing=await loadAllCatalogRecords('faction');
      const numeric=Object.values(existing).filter(record=>/^\d+$/.test(String(record?.id||''))&&record?.slug);
      if(factionMeta?.build===build&&numeric.length>=EXPECTED){
        return {records:existing,expected:EXPECTED,matched:numeric.length,complete:numeric.length>=EXPECTED,source:'cache'};
      }
    }catch{}
  }

  const index=await fetchForeverReputationIndex({namespace,fetchImpl,locale:'en_GB'});
  const merged=mergeIndex(index,build);
  if(merged.records.length!==EXPECTED){
    throw new Error('Forever-Rufindex unvollständig: '+merged.records.length+'/'+EXPECTED+
      (merged.missing.length?' · fehlt '+merged.missing.map(x=>x.slug).join(', '):''));
  }

  const cache=new Map();
  const records=[];
  for(const record of merged.records){
    records.push(archiveMedia?await archiveCrest(record,cache,fetchImpl):record);
  }
  await saveCatalogRecords(records,{build,source:'Blizzard Forever + ForeverDB'});
  try{await archiveCatalogSnapshot('faction',records,{build})}catch(error){
    console.warn('Ruf-Katalogsnapshot konnte nicht archiviert werden:',String(error.message).slice(0,140));
  }
  return {
    records:Object.fromEntries(records.map(record=>[String(record.id),record])),
    expected:EXPECTED,
    matched:records.length,
    complete:true,
    source:'blizzard-index'
  };
}

export async function ensureReputationCatalog(options={}){
  try{return await syncReputationCatalog(options)}
  catch(error){
    console.warn('Vollständiger Rufkatalog konnte nicht synchronisiert werden:',String(error.message).slice(0,220));
    const existing=await loadAllCatalogRecords('faction').catch(()=>({}));
    if(Object.keys(existing).length)return {records:existing,expected:EXPECTED,matched:Object.keys(existing).length,complete:false,source:'stored-fallback',error:String(error.message)};
    const seed=Object.fromEntries(foreverReputationSeed.map(entry=>[entry.slug,fallbackRecord(entry,buildFromNamespace(options.namespace))]));
    return {records:seed,expected:EXPECTED,matched:0,complete:false,source:'seed-fallback',error:String(error.message)};
  }
}

export async function loadPublicReputationCatalog(){
  const [records,meta]=await Promise.all([
    loadAllCatalogRecords('faction').catch(()=>({})),
    loadCatalogMeta().catch(()=>({}))
  ]);
  return {
    build:meta?.faction?.build||REPUTATION_BUILD,
    expected:EXPECTED,
    records
  };
}
