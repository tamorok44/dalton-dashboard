import {readCompactMaster,writeCompactMaster} from './compact-master-cache.mjs';
import {createHash} from 'node:crypto';
import {redis,configured} from './character-store.mjs';

const SCHEMA_VERSION=1;
const CHANGE_LIMIT=40;
const OBSERVATION_ID_LIMIT=160;

function environmentScope(){
  return process.env.VERCEL_ENV==='production'?'production':'preview';
}
function prefix(){
  return 'dalton-dashboard:live-knowledge:v1:'+environmentScope()+':';
}
function indexKey(){return prefix()+'index'}
function versionKey(){return prefix()+'version'}
function text(value,max=240){return typeof value==='string'&&value.trim()?value.trim().slice(0,max):null}
function finite(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
function integer(value){const n=Number(value);return Number.isInteger(n)&&n>0?n:null}
function numericArray(value){
  if(Array.isArray(value))return value;
  if(!value||typeof value!=='object')return [];
  return Object.entries(value)
    .filter(([key])=>/^\d+$/.test(key))
    .sort((a,b)=>Number(a[0])-Number(b[0]))
    .map(([,entry])=>entry);
}
function sha(value){return createHash('sha1').update(String(value)).digest('hex')}
function iso(value){
  const n=Number(value);
  if(Number.isFinite(n)&&n>0)return new Date(n*1000).toISOString();
  const parsed=Date.parse(value||'');
  return Number.isFinite(parsed)?new Date(parsed).toISOString():new Date().toISOString();
}
function buildOf(snapshot={},addon={}){
  const raw=text(snapshot.build)||text(addon.build);
  if(!raw)return null;
  if(/^\d+$/.test(raw)){
    const version=text(snapshot.gameVersion)||text(addon.gameVersion);
    return version?version+'.'+raw:raw;
  }
  return raw;
}
function npcOf(snapshot={}){
  const raw=snapshot.npc||{};
  const id=integer(raw.id);
  const name=text(raw.name,160);
  return id||name?{id,name}:null;
}
function locationOf(snapshot={}){
  const raw=snapshot.location||{};
  const zone=text(raw.zone,160)||text(raw.mapName,160);
  const subZone=text(raw.subZone,160);
  const x=finite(raw.x),y=finite(raw.y);
  const uiMapId=integer(raw.mapID??raw.uiMapId);
  const instance=text(raw?.instance?.name??raw.instance,160);
  return zone||subZone||x!==null||y!==null||uiMapId||instance
    ?{zone,subZone,x,y,uiMapId,instance}
    :null;
}
function npcKey(npc={}){
  if(integer(npc.id))return 'id-'+integer(npc.id);
  return 'name-'+sha(String(npc.name||'').toLocaleLowerCase('de-DE'));
}
function recordKey(kind,build,npc,characterSlug=null){
  return prefix()+'record:'+kind+':'+encodeURIComponent(build)+':'+npcKey(npc)+(kind==='merchant'&&characterSlug?':observer:'+encodeURIComponent(characterSlug):'');
}
function offerKey(item={}){
  const id=integer(item.itemID??item.id);
  if(id)return 'item:'+id;
  const name=text(item.name,200);
  return name?'name:'+name.toLocaleLowerCase('de-DE'):null;
}
function serviceKey(service={}){
  const name=text(service.name,200);
  if(!name)return null;
  return [
    name.toLocaleLowerCase('de-DE'),
    text(service.skillLine,120)||'',
    text(service.requiredSkillName,120)||''
  ].join('|');
}
function merchantItems(snapshot={}){
  return numericArray(snapshot.items).map(item=>({
    index:integer(item.index),
    itemID:integer(item.itemID??item.id),
    name:text(item.name,200),
    priceCopper:finite(item.priceCopper),
    stackCount:finite(item.stackCount),
    numAvailable:finite(item.numAvailable),
    isPurchasable:item.isPurchasable===true,
    isUsable:item.isUsable===true,
    hasExtendedCost:item.hasExtendedCost===true,
    currencyID:integer(item.currencyID),
    spellID:integer(item.spellID)
  })).filter(item=>offerKey(item));
}
function trainerServices(snapshot={}){
  return numericArray(snapshot.services).map(service=>({
    index:integer(service.index),
    name:text(service.name,200),
    serviceType:text(service.serviceType,80),
    requiredLevel:finite(service.requiredLevel),
    priceCopper:finite(service.priceCopper),
    isProfession:service.isProfession===true,
    skillLine:text(service.skillLine,120),
    requiredSkillName:text(service.requiredSkillName,120),
    requiredSkillRank:finite(service.requiredSkillRank),
    hasSkillRequirement:service.hasSkillRequirement===true,
    abilityRequirements:numericArray(service.abilityRequirements).map(req=>({
      name:text(req?.name,160),
      met:req?.met===true
    })).filter(req=>req.name)
  })).filter(service=>serviceKey(service));
}
function canonicalSnapshot(kind,snapshot,addon){
  const build=buildOf(snapshot,addon);
  const npc=npcOf(snapshot);
  if(!build||!npc)return null;
  if(kind==='merchant'&&snapshot.complete!==true)return null;
  const entries=kind==='merchant'?merchantItems(snapshot):trainerServices(snapshot);
  if(kind==='trainer'&&!entries.length)return null;
  return {
    kind,
    build,
    capturedAt:iso(snapshot.capturedAt),
    complete:snapshot.complete===true,
    npc,
    location:locationOf(snapshot),
    count:finite(snapshot.count)??entries.length,
    api:text(snapshot.api,120),
    entries
  };
}
function contentFingerprint(snapshot={}){
  const entries=(snapshot.entries||[]).map(entry=>{
    if(snapshot.kind==='merchant')return [
      offerKey(entry),entry.priceCopper,entry.stackCount,entry.numAvailable,
      entry.hasExtendedCost,entry.currencyID
    ];
    return [
      serviceKey(entry),entry.serviceType,entry.priceCopper,entry.requiredLevel,
      entry.requiredSkillRank,entry.hasSkillRequirement
    ];
  });
  return sha(JSON.stringify({kind:snapshot.kind,build:snapshot.build,npc:snapshot.npc,entries}));
}
function observationId(snapshot={}){
  return sha([
    snapshot.kind,snapshot.build,npcKey(snapshot.npc),
    snapshot.capturedAt,contentFingerprint(snapshot)
  ].join('|'));
}
function currentKeys(snapshot={}){
  const keyFn=snapshot.kind==='merchant'?offerKey:serviceKey;
  return new Set((snapshot.entries||[]).map(keyFn).filter(Boolean));
}
function diff(previous,next){
  if(!previous)return {added:[...currentKeys(next)],removed:[]};
  const before=currentKeys(previous),after=currentKeys(next);
  return {
    added:[...after].filter(key=>!before.has(key)),
    removed:[...before].filter(key=>!after.has(key))
  };
}
function mergeOfferKnowledge(existing=[],snapshot={}){
  const map=new Map((Array.isArray(existing)?existing:[]).map(entry=>[entry.key,entry]));
  for(const entry of map.values())entry.currentlyPresent=false;
  for(const item of snapshot.entries||[]){
    const key=offerKey(item);if(!key)continue;
    const prior=map.get(key);
    map.set(key,{
      key,
      itemID:item.itemID,
      name:item.name||prior?.name||null,
      firstSeenAt:prior?.firstSeenAt||snapshot.capturedAt,
      lastSeenAt:snapshot.capturedAt,
      seenCount:(Number(prior?.seenCount)||0)+1,
      currentlyPresent:true,
      priceCopper:item.priceCopper,
      stackCount:item.stackCount,
      numAvailable:item.numAvailable,
      hasExtendedCost:item.hasExtendedCost,
      currencyID:item.currencyID,
      spellID:item.spellID
    });
  }
  return [...map.values()].sort((a,b)=>(a.itemID??Number.MAX_SAFE_INTEGER)-(b.itemID??Number.MAX_SAFE_INTEGER)||String(a.name||'').localeCompare(String(b.name||''),'de'));
}
function mergeServiceKnowledge(existing=[],snapshot={}){
  const map=new Map((Array.isArray(existing)?existing:[]).map(entry=>[entry.key,entry]));
  for(const service of snapshot.entries||[]){
    const key=serviceKey(service);if(!key)continue;
    const prior=map.get(key);
    map.set(key,{
      key,
      ...service,
      firstSeenAt:prior?.firstSeenAt||snapshot.capturedAt,
      lastSeenAt:snapshot.capturedAt,
      seenCount:(Number(prior?.seenCount)||0)+1
    });
  }
  return [...map.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de'));
}
async function loadRecord(key){
  const raw=await redis(['GET',key]);
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{return null}
}
async function saveRecord(key,value){
  await redis(['SET',key,JSON.stringify(value)]);
  await redis(['SADD',indexKey(),key]);
}
async function ingestSnapshot(snapshot){
  if(!configured()||!snapshot)return {stored:false,duplicate:false};
  const key=recordKey(snapshot.kind,snapshot.build,snapshot.npc,snapshot.characterSlug);
  const existing=await loadRecord(key);
  const id=observationId(snapshot);
  const ids=Array.isArray(existing?.observationIds)?existing.observationIds:[];
  if(ids.includes(id))return {stored:false,duplicate:true,key};

  const fingerprint=contentFingerprint(snapshot);
  const previous=existing?.latestSnapshot||null;
  if(previous&&Date.parse(previous.capturedAt)>Date.parse(snapshot.capturedAt))return {stored:false,duplicate:true,key};
  const previousFingerprint=previous?contentFingerprint(previous):null;
  const changed=previousFingerprint!==fingerprint;
  const delta=changed?diff(previous,snapshot):{added:[],removed:[]};
  const changes=Array.isArray(existing?.changes)?[...existing.changes]:[];
  if(changed){
    changes.push({
      observedAt:snapshot.capturedAt,
      fingerprint,
      added:delta.added,
      removed:delta.removed,
      location:snapshot.location
    });
  }
  const observationIds=[...ids,id].slice(-OBSERVATION_ID_LIMIT);
  const record={
    schemaVersion:SCHEMA_VERSION,
    kind:snapshot.kind,
    build:snapshot.build,
    characterSlug:snapshot.characterSlug||null,
    npc:snapshot.npc,
    location:snapshot.location||existing?.location||null,
    firstObservedAt:existing?.firstObservedAt||snapshot.capturedAt,
    lastObservedAt:snapshot.capturedAt,
    observationCount:(Number(existing?.observationCount)||0)+1,
    contentChangeCount:(Number(existing?.contentChangeCount)||0)+(changed?1:0),
    latestSnapshot:snapshot,
    observationIds,
    changes:changes.slice(-CHANGE_LIMIT),
    offers:snapshot.kind==='merchant'?mergeOfferKnowledge(existing?.offers,snapshot):undefined,
    services:snapshot.kind==='trainer'?mergeServiceKnowledge(existing?.services,snapshot):undefined
  };
  await saveRecord(key,record);
  if(changed)await redis(['SET',versionKey(),new Date().toISOString()]);
  return {stored:true,duplicate:false,changed,key,record};
}

export function snapshotsFromAddonPayload(payload={}, {characterSlug=null}={}){
  const addon=payload.addon||{};
  const interactions=payload?.sections?.interactions||{};
  const snapshots=[];
  for(const raw of numericArray(interactions.merchantHistory)){
    const normalized=canonicalSnapshot('merchant',raw,addon);
    if(normalized)snapshots.push({...normalized,characterSlug});
  }
  for(const raw of numericArray(interactions.trainerHistory)){
    const normalized=canonicalSnapshot('trainer',raw,addon);
    if(normalized)snapshots.push(normalized);
  }
  return snapshots;
}

export async function ingestAddonLiveKnowledge(payload={}, {characterSlug=null}={}){
  if(!configured())return {stored:0,duplicates:0,changed:0};
  let stored=0,duplicates=0,changed=0;
  for(const snapshot of snapshotsFromAddonPayload(payload,{characterSlug})){
    const result=await ingestSnapshot(snapshot);
    if(result.stored)stored++;
    if(result.duplicate)duplicates++;
    if(result.changed)changed++;
  }
  return {stored,duplicates,changed};
}

export async function loadLiveKnowledge({build=null,kind=null,historicalMerchantsOnly=false,redisImpl=redis,enabled=configured()}={}){
  if(!enabled)return [];
  const members=await redisImpl(['SMEMBERS',indexKey()]);
  const keys=(Array.isArray(members)?members:[]).filter(key=>{
    const parts=String(key).slice((prefix()+'record:').length).split(':');
    if(historicalMerchantsOnly)return parts[0]==='merchant'&&parts[1]!==encodeURIComponent(build);
    return (!kind||parts[0]===kind)&&(!build||parts[1]===encodeURIComponent(build));
  });
  const result=[];
  // Read only the requested build, in bounded batches. Preserve all evidence.
  for(let i=0;i<keys.length;i+=8){
    const values=await redisImpl(['MGET',...keys.slice(i,i+8)]);
    for(const raw of Array.isArray(values)?values:[]){
      let record;try{record=JSON.parse(raw)}catch{continue}
      if(!record)continue;
      if(historicalMerchantsOnly){if(record.kind!=='merchant'||record.build===build||record.latestSnapshot?.complete!==true)continue;}
      else if(build&&record.build!==build)continue;
      if(kind&&record.kind!==kind)continue;
      result.push(record);
    }
  }
  return result.sort((a,b)=>String(b.lastObservedAt||'').localeCompare(String(a.lastObservedAt||'')));
}

export function publicLiveKnowledgeSummary(records=[]){
  const list=Array.isArray(records)?records:[];
  const merchants=list.filter(record=>record.kind==='merchant');
  const trainers=list.filter(record=>record.kind==='trainer');
  return {
    recordCount:list.length,
    merchantCount:merchants.length,
    trainerCount:trainers.length,
    observationCount:list.reduce((sum,record)=>sum+(Number(record.observationCount)||0),0),
    contentChangeCount:list.reduce((sum,record)=>sum+(Number(record.contentChangeCount)||0),0),
    currentMerchantOfferCount:merchants.reduce((sum,record)=>sum+(record.latestSnapshot?.entries?.length||0),0),
    knownMerchantOfferCount:merchants.reduce((sum,record)=>sum+(record.offers?.length||0),0),
    trainerServiceCount:trainers.reduce((sum,record)=>sum+(record.services?.length||0),0)
  };
}


export async function loadLiveKnowledgeVersion(){
  if(!configured())return null;
  const value=await redis(['GET',versionKey()]);
  return typeof value==='string'&&value?value:null;
}

 // Historical merchant snapshots remain conflict evidence across builds.
 // Cache only the relevant projection, never the complete change log.
export async function loadHistoricalMerchantKnowledge(build,{redisImpl=redis,enabled=configured()}={}){
  if(!enabled||!build)return [];
  const version=await redisImpl(['GET',versionKey()]);
  const key=prefix()+'merchant-conflict-history:v1';
  const cached=await readCompactMaster(key,{redisImpl});
  if(cached?.build===build&&cached.version===version&&Array.isArray(cached.records))return cached.records;
  const records=(await loadLiveKnowledge({build,historicalMerchantsOnly:true,redisImpl,enabled})).map(record=>({
    kind:'merchant',build:record.build,characterSlug:record.characterSlug||null,
    npc:record.npc,location:record.location,lastObservedAt:record.lastObservedAt,
    latestSnapshot:record.latestSnapshot
  }));
  if(await redisImpl(['GET',versionKey()])===version)await writeCompactMaster(key,{build,version,records},{redisImpl,ttl:3600});
  return records;
}
