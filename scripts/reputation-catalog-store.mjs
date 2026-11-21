import {fetchForeverReputationIndex} from './blizzard-api.mjs';
import {archiveCatalogSnapshot,loadAllCatalogRecords,loadCatalogMeta,saveCatalogRecords} from './game-catalog-store.mjs';
import {resolveMediaAsset,imageStoreConfigured} from './media-resolver.mjs';
import {REPUTATION_BUILD,foreverReputationSeed,factionCrestFor,factionCrestKindFor,factionSeedByName} from '../reputation-data.js';

const EXPECTED=foreverReputationSeed.length;
function staticBuildFromNamespace(namespace=''){
  const match=String(namespace).match(/^static-([a-z0-9._]+)-forever-eu$/i);
  return match?.[1]?.replace(/_/g,'.')||null;
}

async function archiveCrest(record,cache,fetchImpl=fetch){
  const sourceUrl=record?.media?.crestSourceUrl;
  if(!sourceUrl||!imageStoreConfigured())return record;
  const identity=record?.slug||record?.id;
  if(!identity)return record;
  const cacheKey=String(identity)+'|'+sourceUrl;
  if(cache.has(cacheKey)){
    const storedUrl=await cache.get(cacheKey);
    return storedUrl?{...record,media:{...record.media,crestStoredUrl:storedUrl}}:record;
  }
  const task=resolveMediaAsset({
    entityType:'faction',
    entityId:identity,
    role:'crest',
    sourceUrl,
    fetchImpl
  }).catch(()=>null);
  cache.set(cacheKey,task);
  const storedUrl=await task;
  return storedUrl?{...record,media:{...record.media,crestStoredUrl:storedUrl}}:record;
}

function fallbackRecord(seed,build=REPUTATION_BUILD){
  return {
    type:'faction',
    id:'slug:'+seed.slug,
    name:seed.name,
    slug:seed.slug,
    side:seed.side,
    forever:Boolean(seed.forever),
    crestKind:factionCrestKindFor(seed),
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
      crestKind:factionCrestKindFor(seed),
      href:entry.href||null,
      build,
      source:'Blizzard Forever + ForeverDB build '+build,
      media:{crestSourceUrl:factionCrestFor(seed)}
    });
  }
  const missing=foreverReputationSeed.filter(seed=>!matched.has(seed.slug));
  return {records:[...matched.values()],missing,unmatched};
}

async function ensureSeedMaster({build=REPUTATION_BUILD,fetchImpl=fetch,archiveMedia=true}={}){
  const existing=await loadAllCatalogRecords('faction').catch(()=>({}));
  const existingMaster=Object.values(existing).filter(record=>String(record?.id||'').startsWith('slug:'));
  if(existingMaster.length>=EXPECTED&&existingMaster.every(record=>record.build===build)){
    return existingMaster;
  }

  const bare=foreverReputationSeed.map(seed=>fallbackRecord(seed,build));
  await saveCatalogRecords(bare,{build,source:'ForeverDB verified master'});

  let finalRecords=bare;
  if(archiveMedia){
    const cache=new Map();
    finalRecords=await Promise.all(bare.map(record=>archiveCrest(record,cache,fetchImpl)));
    await saveCatalogRecords(finalRecords,{build,source:'ForeverDB verified master'});
  }
  try{await archiveCatalogSnapshot('faction',finalRecords,{build})}catch(error){
    console.warn('Ruf-Katalogsnapshot konnte nicht archiviert werden:',String(error.message).slice(0,140));
  }
  return finalRecords;
}

async function optionalBlizzardIndex({namespace,build,fetchImpl=fetch,archiveMedia=true}={}){
  if(!namespace)return {matched:0,source:'not-available'};
  try{
    const index=await fetchForeverReputationIndex({namespace,fetchImpl,locale:'en_GB'});
    const merged=mergeIndex(index,build);
    if(merged.records.length!==EXPECTED){
      console.warn('Blizzard-Forever-Rufindex nur teilweise nutzbar: '+merged.records.length+'/'+EXPECTED);
      return {matched:merged.records.length,source:'partial-index'};
    }
    const cache=new Map();
    const records=archiveMedia
      ?await Promise.all(merged.records.map(record=>archiveCrest(record,cache,fetchImpl)))
      :merged.records;
    await saveCatalogRecords(records,{build,source:'Blizzard Forever + ForeverDB'});
    return {matched:records.length,source:'blizzard-index'};
  }catch(error){
    console.warn('Blizzard-Forever-Rufindex optional nicht verfügbar:',String(error.message).slice(0,180));
    return {matched:0,source:'index-unavailable'};
  }
}

export async function syncReputationCatalog({namespace,force=false,fetchImpl=fetch,archiveMedia=true}={}){
  const build=REPUTATION_BUILD;
  const blizzardDataBuild=staticBuildFromNamespace(namespace);
  const master=await ensureSeedMaster({build,fetchImpl,archiveMedia});
  const indexResult=await optionalBlizzardIndex({namespace,build,fetchImpl,archiveMedia});
  const all=await loadAllCatalogRecords('faction').catch(()=>({}));
  const masterCount=Object.values(all).filter(record=>String(record?.id||'').startsWith('slug:')).length;
  const numericCount=Object.values(all).filter(record=>/^\d+$/.test(String(record?.id||''))).length;
  return {
    records:all,
    expected:EXPECTED,
    masterCount,
    numericCount,
    matched:indexResult.matched,
    complete:masterCount>=EXPECTED,
    source:indexResult.source,
    build,
    blizzardDataBuild
  };
}

export async function ensureReputationCatalog(options={}){
  try{return await syncReputationCatalog(options)}
  catch(error){
    console.warn('Ruf-Masterkatalog konnte nicht vollständig persistiert werden:',String(error.message).slice(0,220));
    const existing=await loadAllCatalogRecords('faction').catch(()=>({}));
    const build=REPUTATION_BUILD;
    const blizzardDataBuild=staticBuildFromNamespace(options.namespace);
    const seed=Object.fromEntries(foreverReputationSeed.map(entry=>{
      const record=fallbackRecord(entry,build);
      return [record.id,record];
    }));
    return {
      records:Object.keys(existing).length?existing:seed,
      expected:EXPECTED,
      masterCount:Object.values(existing).filter(record=>String(record?.id||'').startsWith('slug:')).length,
      numericCount:Object.values(existing).filter(record=>/^\d+$/.test(String(record?.id||''))).length,
      complete:false,
      source:'fallback',
      build,
      blizzardDataBuild,
      error:String(error.message)
    };
  }
}

export async function loadPublicReputationCatalog(){
  const [records,meta]=await Promise.all([
    loadAllCatalogRecords('faction').catch(()=>({})),
    loadCatalogMeta().catch(()=>({}))
  ]);
  const values=Object.values(records);
  return {
    build:REPUTATION_BUILD,
    storedBuild:meta?.faction?.build||null,
    expected:EXPECTED,
    masterCount:values.filter(record=>String(record?.id||'').startsWith('slug:')).length,
    numericCount:values.filter(record=>/^\d+$/.test(String(record?.id||''))).length,
    records
  };
}
