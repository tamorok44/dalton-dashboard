// Pure helpers: reconcile v1 and v2 evidence without mutating either store.
import {createHash} from 'node:crypto';
import {canonicalRoster} from './daily-roster.mjs';
function at(value){const n=Date.parse(value||'');return Number.isFinite(n)?n:-Infinity;}
export function selectVersionEvidence(modern,legacy,timeField){
  if(modern==null)return {value:legacy??null,conflict:false};
  if(legacy==null)return {value:modern,conflict:false};
  const a=at(modern[timeField]),b=at(legacy[timeField]);
  if(a>b)return {value:modern,conflict:false};
  if(b>a)return {value:legacy,conflict:false};
  // Canonical identity matters; equal timestamps are not a write ordering.
  const comparable=x=>timeField==='generatedAt'
    ?JSON.stringify([x.generatedAt,[...(x.slugs||[])].sort()])
    :JSON.stringify([x.receivedAt,x.syncId??null]);
  return {value:modern,conflict:comparable(modern)!==comparable(legacy)};
}
export function selectDailyReceipt(modern,legacy,date){
  const valid=x=>x?.date===date&&x.source==='daily'&&x.persisted===true&&
    Array.isArray(x.roster)&&x.roster.length===x.total&&Number.isInteger(x.success)&&x.success>0&&
    x.success<=x.total&&Number.isFinite(Date.parse(x.generatedAt))&&validRoster(x.roster);
  function validRoster(roster){try{canonicalRoster(roster);return true;}catch{return false;}}
  const rows=[modern,legacy].filter(valid).sort((a,b)=>at(b.generatedAt)-at(a.generatedAt));
  if(rows.length===2&&at(rows[0].generatedAt)===at(rows[1].generatedAt)&&!same({...rows[0],roster:canonicalRoster(rows[0].roster)},{...rows[1],roster:canonicalRoster(rows[1].roster)}))return null;
  return rows[0]??null;
}
export function selectDailyPointer(modern,legacy){
  const rows=[modern,legacy].filter(x=>x!=null);
  for(const row of rows)if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.date||''))throw new Error('Ungültiger Archivzeiger');
  return rows.sort((a,b)=>b.date.localeCompare(a.date))[0]??null;
}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const unique=(entries,key)=>[...new Map(entries.map(value=>[key(value),value])).values()];
const timeOf=record=>at(record?.latestSnapshot?.capturedAt??record?.lastObservedAt);
function mergeRows(older=[],latest=[],merchant=false){
  const rows=new Map();
  for(const row of older||[])if(row?.key)rows.set(row.key,merchant?{...row,currentlyPresent:false}:{...row});
  for(const row of latest||[]){
    if(!row?.key)continue;
    const before=rows.get(row.key);
    if(!before){rows.set(row.key,{...row});continue;}
    const pick=at(row.lastSeenAt)>=at(before.lastSeenAt)?row:before;
    const first=[row.firstSeenAt,before.firstSeenAt].filter(Boolean).sort()[0];
    rows.set(row.key,{...before,...pick,...(first?{firstSeenAt:first}:{}),
      seenCount:Math.max(Number(row.seenCount)||0,Number(before.seenCount)||0),
      ...(merchant?{currentlyPresent:row.currentlyPresent===true}:{})});
  }
  return [...rows.values()];
}
export function reconcileKnowledgeRecords(modern,legacy){
  if(!modern)return legacy??null;
  if(!legacy||same(modern,legacy))return modern;
  if(modern.kind!==legacy.kind||modern.build!==legacy.build||String(modern.npc?.id??modern.npc?.name)!==String(legacy.npc?.id??legacy.npc?.name)||
    (modern.characterSlug??null)!==(legacy.characterSlug??null))throw new Error('MIGRATION_CONFLICT: Beobachtungsidentität');
  const a=timeOf(modern),b=timeOf(legacy);
  // An equal-second disagreement without a common ordering is not resolved
  // by arbitrarily choosing a price. Require explicit reconciliation.
  if(a===b&&!same(modern.latestSnapshot,legacy.latestSnapshot)){
    const modernIds=new Set(modern.observationIds||[]),legacyIds=new Set(legacy.observationIds||[]);
    const modernContains=[...legacyIds].every(id=>modernIds.has(id))&&modernIds.size>legacyIds.size;
    const legacyContains=[...modernIds].every(id=>legacyIds.has(id))&&legacyIds.size>modernIds.size;
    if(!modernContains&&!legacyContains)throw new Error('MIGRATION_CONFLICT: widersprüchliche Beobachtungen gleicher Zeit');
    return mergeEvidence(modernContains?modern:legacy,modernContains?legacy:modern);
  }
  return mergeEvidence(a>=b?modern:legacy,a>=b?legacy:modern);
}
function mergeEvidence(latest,older){
  const ids=unique([...(older.observationIds||[]),...(latest.observationIds||[])],x=>x).slice(-160);
  const changes=unique([...(older.changes||[]),...(latest.changes||[])],x=>JSON.stringify(canonical(x))).sort((a,b)=>at(a.observedAt)-at(b.observedAt)).slice(-40);
  const first=[older.firstObservedAt,latest.firstObservedAt].filter(Boolean).sort()[0];
  return {...latest,...(first?{firstObservedAt:first}:{}),observationIds:ids,changes,
    observationCount:Math.max(ids.length,Number(latest.observationCount)||0,Number(older.observationCount)||0),
    contentChangeCount:Math.max(changes.length,Number(latest.contentChangeCount)||0,Number(older.contentChangeCount)||0),
    ...(latest.kind==='merchant'?{offers:mergeRows(older.offers,latest.offers,true)}:{services:mergeRows(older.services,latest.services)}),
    migrationEvidence:{reconciled:true,countMayBeLowerBound:true}};
}

export const knowledgeRawDigest=raw=>raw==null?null:createHash('sha256').update(String(raw)).digest('hex');
// Capture-time evidence survives structural validation failures. It is
// used only as a lower bound for repairs, never to publish malformed data.
function captureFloor(record){return Math.max(at(record?.latestSnapshot?.capturedAt),at(record?.lastObservedAt));}
function identitySuffix(record){
  const npc=record?.npc||{},id=Number(npc.id);
  const identity=Number.isInteger(id)&&id>0?'id-'+id:
    typeof npc.name==='string'&&npc.name.trim()?'name-'+createHash('sha1').update(npc.name.toLocaleLowerCase('de-DE')).digest('hex'):null;
  if(!identity||!['merchant','trainer'].includes(record?.kind)||typeof record.build!=='string'||!record.build)return null;
  return 'record:'+record.kind+':'+encodeURIComponent(record.build)+':'+identity+
    (record.kind==='merchant'&&record.characterSlug?':observer:'+encodeURIComponent(record.characterSlug):'');
}
function decodeRecord(raw,key){
  if(raw==null)return {record:null,invalid:false,floor:-Infinity};
  let record=null;
  try{
    record=typeof raw==='string'?JSON.parse(raw):raw;
    if(!record||!['merchant','trainer'].includes(record.kind)||typeof record.build!=='string'||!record.npc||
      !Number.isFinite(timeOf(record))||!Array.isArray(record.latestSnapshot?.entries)||
      (record.observationIds!=null&&!Array.isArray(record.observationIds))||
      (record.changes!=null&&!Array.isArray(record.changes))||
      (record.offers!=null&&!Array.isArray(record.offers))||
      (record.services!=null&&!Array.isArray(record.services)))throw Error('invalid');
    const suffix=identitySuffix(record),snapshot=record.latestSnapshot;
    if(!suffix||key&&!key.endsWith(':'+suffix)||
      identitySuffix({...snapshot,characterSlug:snapshot.characterSlug??record.characterSlug})!==suffix)throw Error('identity mismatch');
    return {record,invalid:false,floor:captureFloor(record)};
  }catch{return {record:null,invalid:true,floor:captureFloor(record)};}
}
// One record's ambiguous data is never substituted for another's. Keep both
// raw inputs separately; a later independently captured observation may
// become current without inventing an order for the historical conflict.
export function inspectKnowledgePair(modernRaw,legacyRaw,key=null){
  const m=decodeRecord(modernRaw,key),l=decodeRecord(legacyRaw,key);
  const marker=m.record?.migrationRepair;
  if(marker&&legacyRaw!=null&&marker.legacyDigest===knowledgeRawDigest(legacyRaw)&&
      Number.isFinite(at(marker.resolvedAt))&&timeOf(m.record)>=at(marker.resolvedAt))
    return {record:m.record,reason:null,modern:m.record,legacy:l.record};
  let reason=m.invalid||l.invalid?'invalid_record':null;
  if(!reason){
    try{return {record:reconcileKnowledgeRecords(m.record,l.record),reason:null,modern:m.record,legacy:l.record};}
    catch{reason='conflicting_record';}
  }
  return {record:null,reason,modern:m.record,legacy:l.record,latestTime:Math.max(m.floor,l.floor),unknownTime:(m.invalid&&!Number.isFinite(m.floor))||(l.invalid&&!Number.isFinite(l.floor))};
}
export function knowledgeQuarantine(key,modernRaw,legacyRaw,reason,incoming=null){
  const evidence={schema:1,key,reason,modernRaw:modernRaw??null,legacyRaw:legacyRaw??null,incoming};
  const digest=createHash('sha256').update(JSON.stringify(canonical(evidence))).digest('hex');
  return {field:'__quarantine:v1:'+digest,evidence,digest};
}

export function validQuarantineEvidence(field,raw,key=null){
  try{
    if(typeof raw!=='string')return false;
    const evidence=JSON.parse(raw);
    if(evidence?.schema!==1||typeof evidence.key!=='string'||(key&&key!==evidence.key)||
      !['invalid_record','conflicting_record','invalid_storage_type','missing_repair_evidence'].includes(evidence.reason)||
      !Object.hasOwn(evidence,'incoming')||
      !['modernRaw','legacyRaw'].every(side=>Object.hasOwn(evidence,side)&&(evidence[side]===null||typeof evidence[side]==='string')))return false;
    return field==='__quarantine:v1:'+createHash('sha256').update(JSON.stringify(canonical(evidence))).digest('hex');
  }catch{return false;}
}
export function repairMarkerMatches(key,marker,raw){
  if(!marker||!/^[a-f0-9]{64}$/.test(marker.quarantineDigest||''))return false;
  if(!validQuarantineEvidence('__quarantine:v1:'+marker.quarantineDigest,raw,key))return false;
  const evidence=JSON.parse(raw);
  return knowledgeRawDigest(evidence.legacyRaw)===marker.legacyDigest&&evidence.incoming?.capturedAt===marker.resolvedAt&&Number.isFinite(at(marker.resolvedAt));
}
