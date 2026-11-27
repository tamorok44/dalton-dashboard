import {inspectKnowledgePair,knowledgeQuarantine,knowledgeRawDigest,repairMarkerMatches} from './storage-reconciliation.mjs';
import {createHash} from 'node:crypto';
import {redis,configured,addonSyncLockKey,REDIS_TYPE_GUARD} from './character-store.mjs';

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
function recordsKey(){return prefix()+'records:v2'}
const VERSION_FIELD='__version:v2';
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
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
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
export function liveKnowledgeEvidenceKeys(observation={}){
  const kind=observation.sourceType==='vendor'?'merchant':observation.sourceType==='trainer'?'trainer':null;
  const npc=npcOf({npc:{id:observation.npcId,name:observation.npcName}});
  if(!kind||!npc||!observation.build)return [];
  const base=recordKey(kind,observation.build,npc);
  return kind==='merchant'&&observation.characterSlug?[base,recordKey(kind,observation.build,npc,observation.characterSlug)]:[base];
}
function attachIntegrityIssues(records,issues){
  Object.defineProperty(records,'integrityIssues',{value:issues,enumerable:false});
  return records;
}
export function combineLiveKnowledge(...lists){
  return attachIntegrityIssues(lists.flat(),[...new Map(lists.flatMap(list=>list?.integrityIssues||[]).map(issue=>[issue.key,issue])).values()]);
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
  const capturedAt=iso(snapshot.capturedAt);
  if(!capturedAt||Date.parse(capturedAt)>Date.now()+10*60*1000)return null;
  return {
    kind,
    build,
    capturedAt,
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
// Type-aware lookup is one read operation; MGET silently returns null for
// non-string keys, which must not be mistaken for absent evidence.
const LEGACY_READ="local out={}; for _,key in ipairs(KEYS) do local t=redis.call('TYPE',key).ok; local raw=false; if t=='string' then raw=redis.call('GET',key) end; table.insert(out,{t,raw}); end; return out";
async function readLegacy(keys,redisImpl=redis){
  const rows=await redisImpl(['EVAL',LEGACY_READ,keys.length,...keys]);
  if(!Array.isArray(rows)||rows.length!==keys.length||rows.some(row=>!Array.isArray(row)||typeof row[0]!=='string'||(row[0]==='string'&&typeof row[1]!=='string')))throw Error('Ungültige Legacy-Leseantwort');
  return rows.map(([type,raw])=>({type,raw:type==='string'?raw:null}));
}
async function inspectStoredPair(key,modern,legacy,redisImpl=redis){
  if(!['none','string'].includes(legacy.type))return {record:null,reason:'invalid_storage_type',unknownTime:true,latestTime:Infinity};
  const proofChecks=new Map();
  for(const raw of [modern,legacy.raw]){
    let marker=null;
    try{marker=JSON.parse(raw)?.migrationRepair;}catch{}
    if(!marker)continue;
    const field='__quarantine:v1:'+marker.quarantineDigest;
    let proof;
    try{proof=proofChecks.has(field)?proofChecks.get(field):await redisImpl(['HGET',recordsKey(),field]);}
    catch{return {record:null,reason:'repair_evidence_unavailable',unknownTime:true,latestTime:Infinity};}
    if(!repairMarkerMatches(key,marker,proof))return {record:null,reason:'missing_repair_evidence',unknownTime:true,latestTime:Infinity};
    proofChecks.set(field,proof);
  }
  return {...inspectKnowledgePair(modern,legacy.raw,key),proofChecks:[...proofChecks]};
}
// A damaged occupied digest must not block a character forever. Use a
// new content-addressed envelope containing the exact colliding bytes.
// Never overwrite or delete the original field. Bounded retries handle
// ordinary interleavings; a persistent provider failure stays retryable.
async function writableQuarantine(key,modern,legacy,reason,snapshot){
  let collision=null;
  for(let attempt=0;attempt<4;attempt++){
    const q=knowledgeQuarantine(key,modern,legacy.raw,reason,snapshot,legacy.type,collision);
    const actual=await redis(['HGET',recordsKey(),q.field]);
    if(actual==null||actual===JSON.stringify(q.evidence))return q;
    collision={field:q.field,raw:actual,previous:collision};
  }
  throw Error('QUARANTINE_COLLISION_LIMIT');
}
}
async function saveRecord(key,value,{changed,lockToken,expectedModern,expectedLegacy,legacyType=expectedLegacy===null?'none':'string',quarantine=null,proofChecks=[]}){
  if(!lockToken)throw new Error('Schreibsperre für Beobachtungen erforderlich');
  // Record, implicit index and version are fields of one hash. The one
  // HSET is the sole mutation; legacy records are read-only fallbacks.
  const lua=REDIS_TYPE_GUARD+"if not valid(KEYS[1],'hash') then return redis.error_reply('INVALID_STORAGE_TYPE') end; if redis.call('GET',KEYS[3])~=ARGV[7] then return redis.error_reply('REFRESH_LOCK_LOST') end; local modern=redis.call('HGET',KEYS[1],ARGV[1]); local typ=redis.call('TYPE',KEYS[2]).ok; local legacy=false; if typ=='string' then legacy=redis.call('GET',KEYS[2]) end; if typ~=ARGV[11] or (modern or '')~=ARGV[5] or (legacy or '')~=ARGV[6] then return redis.error_reply('OBSERVATION_CONFLICT') end; for _,proof in ipairs(cjson.decode(ARGV[12])) do if redis.call('HGET',KEYS[1],proof[1])~=proof[2] then return redis.error_reply('REPAIR_EVIDENCE_CHANGED') end end; local fields={}; if ARGV[2]~='' then table.insert(fields,ARGV[1]); table.insert(fields,ARGV[2]); end; if ARGV[9]~='' then local evidence=redis.call('HGET',KEYS[1],ARGV[9]); if evidence and evidence~=ARGV[10] then return redis.error_reply('QUARANTINE_EVIDENCE_CONFLICT') end; if not evidence then table.insert(fields,ARGV[9]); table.insert(fields,ARGV[10]); end end; if ARGV[3]=='1' or (#fields>0 and ARGV[9]~='') then table.insert(fields,ARGV[8]); table.insert(fields,ARGV[4]); end; if #fields>0 then redis.call('HSET',KEYS[1],unpack(fields)) end; return 'OK'";
  const result=await redis(['EVAL',lua,3,recordsKey(),key,addonSyncLockKey(),key,value?JSON.stringify(value):'',changed?'1':'0',new Date().toISOString(),expectedModern||'',expectedLegacy||'',lockToken,VERSION_FIELD,quarantine?.field||'',quarantine?JSON.stringify(quarantine.evidence):'',legacyType,JSON.stringify(proofChecks)]);
  if(result!=='OK')throw new Error('Beobachtung nicht gespeichert');
}
async function ingestSnapshot(snapshot,options={}){
  for(let attempt=0;;attempt++){
    try{return await ingestSnapshotOnce(snapshot,options);}
    catch(error){
      if(attempt>=2||!/REPAIR_EVIDENCE_CHANGED|QUARANTINE_EVIDENCE_CONFLICT|OBSERVATION_CONFLICT/.test(String(error?.message)))throw error;
    }
  }
}
async function ingestSnapshotOnce(snapshot,{lockToken=null}={}){
  if(!configured()||!snapshot)return {stored:false,duplicate:false};
  const key=recordKey(snapshot.kind,snapshot.build,snapshot.npc,snapshot.characterSlug);
  const [expectedModern,[legacy]]=await Promise.all([redis(['HGET',recordsKey(),key]),readLegacy([key])]);
  const expectedLegacy=legacy.raw;
  const inspected=await inspectStoredPair(key,expectedModern,legacy);
  const quarantine=inspected.reason?await writableQuarantine(key,expectedModern,legacy,inspected.reason,snapshot):null;
  const proofChecks=inspected.proofChecks||[];
  const writeOptions={lockToken,expectedModern,expectedLegacy,legacyType:legacy.type,proofChecks};
  if(quarantine&&(inspected.unknownTime||!Number.isFinite(inspected.latestTime)||Date.parse(snapshot.capturedAt)<=inspected.latestTime)){
    // No ordering proof. Persist the incoming evidence, do not choose a
    // price and do not leave the character's core outbox blocked.
    await saveRecord(key,null,{changed:false,...writeOptions,quarantine});
    return {stored:false,duplicate:false,quarantined:true,key};
  }
  const existing=inspected.record;
  const id=observationId(snapshot);
  const ids=Array.isArray(existing?.observationIds)?existing.observationIds:[];
  if(ids.includes(id)){
    if(proofChecks.length)await saveRecord(key,null,{changed:false,...writeOptions});
    return {stored:false,duplicate:true,key};
  }

  const fingerprint=contentFingerprint(snapshot);
  const previous=existing?.latestSnapshot||null;
  if(previous&&Date.parse(previous.capturedAt)>Date.parse(snapshot.capturedAt)){
    if(proofChecks.length)await saveRecord(key,null,{changed:false,...writeOptions});
    return {stored:false,duplicate:true,key};
  }
  // Different fingerprints in the same second are distinct evidence. Keep
  // both in the bounded history, without asserting a finer clock resolution.
  const previousFingerprint=previous?contentFingerprint(previous):null;
  const changed=previousFingerprint!==fingerprint;
  const delta=changed?diff(previous,snapshot):{added:[],removed:[]};
  const changes=Array.isArray(existing?.changes)?[...existing.changes]:[];
  if(changed){
    changes.push({
      observedAt:snapshot.capturedAt,
      fingerprint,
      ...(previous&&previous.capturedAt===snapshot.capturedAt?{sameSecond:true,previousFingerprint,previousEntries:previous.entries,entries:snapshot.entries}:{}),
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
    ...(quarantine?{migrationRepair:{resolvedAt:snapshot.capturedAt,legacyDigest:knowledgeRawDigest(expectedLegacy),quarantineDigest:quarantine.digest}}:existing?.migrationRepair?{migrationRepair:existing.migrationRepair}:{}),
    observationIds,
    changes:changes.slice(-CHANGE_LIMIT),
    offers:snapshot.kind==='merchant'?mergeOfferKnowledge(existing?.offers,snapshot):undefined,
    services:snapshot.kind==='trainer'?mergeServiceKnowledge(existing?.services,snapshot):undefined
  };
  await saveRecord(key,record,{changed,...writeOptions,quarantine});
  return {stored:true,duplicate:false,changed,key,record,...(quarantine?{repaired:true}:{})};
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

export async function ingestAddonLiveKnowledge(payload={}, {characterSlug=null,lockToken=null}={}){
  if(!configured())return {stored:0,duplicates:0,changed:0};
  let stored=0,duplicates=0,changed=0,quarantined=0,repaired=0;
  for(const snapshot of snapshotsFromAddonPayload(payload,{characterSlug})){
    const result=await ingestSnapshot(snapshot,{lockToken});
    if(result.stored)stored++;
    if(result.duplicate)duplicates++;
    if(result.changed)changed++;
    if(result.quarantined)quarantined++;
    if(result.repaired)repaired++;
  }
  return {stored,duplicates,changed,...(quarantined?{quarantined}:{}),...(repaired?{repaired}:{})};
}

export async function loadLiveKnowledge({build=null,kind=null,historicalMerchantsOnly=false,redisImpl=redis,enabled=configured()}={}){
  if(!enabled)return [];
  const [members,fields]=await Promise.all([redisImpl(['SMEMBERS',indexKey()]),redisImpl(['HKEYS',recordsKey()])]);
  const knownFields=new Set(Array.isArray(fields)?fields:[]);
  const current=new Set([...knownFields].filter(key=>String(key).startsWith(prefix()+'record:')));
  const legacyKeys=new Set((Array.isArray(members)?members:[]).filter(key=>String(key).startsWith(prefix()+'record:')));
  const keys=[...new Set([...legacyKeys,...current])].filter(key=>{
    const parts=String(key).slice((prefix()+'record:').length).split(':');
    if(historicalMerchantsOnly)return parts[0]==='merchant'&&parts[1]!==encodeURIComponent(build);
    return (!kind||parts[0]===kind)&&(!build||parts[1]===encodeURIComponent(build));
  });
  const result=[],issues=[];
  // Read only the requested build, in bounded batches. Preserve all evidence.
  for(let i=0;i<keys.length;i+=8){
    const batch=keys.slice(i,i+8),modern=batch.filter(key=>current.has(key)),legacy=batch; // physical v1 counterpart, even if not indexed
    const [modernValues,legacyValues]=await Promise.all([modern.length?redisImpl(['HMGET',recordsKey(),...modern]):[],legacy.length?readLegacy(legacy,redisImpl):[]]);
    const modernByKey=new Map(modern.map((key,i)=>[key,modernValues?.[i]??null]));
    const legacyByKey=new Map(legacy.map((key,i)=>[key,legacyValues[i]]));
    for(const key of batch){
      const modernRaw=modernByKey.get(key),legacyValue=legacyByKey.get(key),legacyRaw=legacyValue.raw;
      const inspected=await inspectStoredPair(key,modernRaw,legacyValue,redisImpl);
      if(inspected.reason){
        if(inspected.reason==='repair_evidence_unavailable'){
          issues.push({key,reason:inspected.reason,preserved:false});continue;
        }
        // Evidence-only append. Never alter the active record in a reader.
        // Preserve the exact bytes observed, even if a legacy writer has
        // since replaced them. HSETNX is idempotent and a single mutation.
        const q=knowledgeQuarantine(key,modernRaw,legacyRaw,inspected.reason,null,legacyValue.type);
        let preserved=false;
        try{
          const expected=JSON.stringify(q.evidence);
          let actual=await redisImpl(['HGET',recordsKey(),q.field]);
          if(actual==null){
            await redisImpl(['HSETNX',recordsKey(),q.field,expected]);
            actual=await redisImpl(['HGET',recordsKey(),q.field]);
          }
          // The field listing, HSETNX return and existence alone are not proof.
          preserved=actual===expected&&inspected.reason!=='invalid_storage_type';
        }catch{ /* Unavailable storage is reported, not called preserved. */ }
        issues.push({key,reason:inspected.reason,preserved});continue;
      }
      const record=inspected.record;
      if(!record)continue;
      if(historicalMerchantsOnly){if(record.kind!=='merchant'||record.build===build||record.latestSnapshot?.complete!==true)continue;}
      else if(build&&record.build!==build)continue;
      if(kind&&record.kind!==kind)continue;
      result.push(record);
    }
  }
  return attachIntegrityIssues(result.sort((a,b)=>String(b.lastObservedAt||'').localeCompare(String(a.lastObservedAt||''))),issues);
}

export function publicLiveKnowledgeSummary(records=[]){
  const list=Array.isArray(records)?records:[];
  const merchants=list.filter(record=>record.kind==='merchant');
  const trainers=list.filter(record=>record.kind==='trainer');
  return {
    recordCount:list.length,
    excludedIntegrityRecords:records?.integrityIssues?.length||0,
    unpreservedIntegrityRecords:(records?.integrityIssues||[]).filter(issue=>issue.preserved===false).length,
    merchantCount:merchants.length,
    trainerCount:trainers.length,
    observationCount:list.reduce((sum,record)=>sum+(Number(record.observationCount)||0),0),
    contentChangeCount:list.reduce((sum,record)=>sum+(Number(record.contentChangeCount)||0),0),
    currentMerchantOfferCount:merchants.reduce((sum,record)=>sum+(record.latestSnapshot?.entries?.length||0),0),
    knownMerchantOfferCount:merchants.reduce((sum,record)=>sum+(record.offers?.length||0),0),
    trainerServiceCount:trainers.reduce((sum,record)=>sum+(record.services?.length||0),0)
  };
}


export async function loadLiveKnowledgeVersion({redisImpl=redis,enabled=configured()}={}){
  if(!enabled)return null;
  const values=await Promise.all([redisImpl(['HGET',recordsKey(),VERSION_FIELD]),redisImpl(['GET',versionKey()])]);
  // Include both namespaces so even equal-time divergent writes invalidate
  // cached projections. A legacy-only deployment keeps its original value.
  const [modern,legacy]=values.map(value=>typeof value==='string'&&value?value:null);
  return modern&&legacy?JSON.stringify([modern,legacy]):modern??legacy;
}

// During migration legacy writes need not update a version marker. Do not
// serve a historical projection from cache before old writers are retired.
export async function loadHistoricalMerchantKnowledge(build,{redisImpl=redis,enabled=configured()}={}){
  if(!enabled||!build)return [];
  const source=await loadLiveKnowledge({build,historicalMerchantsOnly:true,redisImpl,enabled});
  return attachIntegrityIssues(source.map(record=>({
    kind:'merchant',build:record.build,characterSlug:record.characterSlug||null,
    npc:record.npc,location:record.location||null,lastObservedAt:record.lastObservedAt||null,
    latestSnapshot:record.latestSnapshot
  })),source.integrityIssues||[]);
}
