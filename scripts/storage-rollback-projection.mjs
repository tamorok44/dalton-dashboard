import {createHash} from 'node:crypto';
import {canonicalRoster} from './daily-roster.mjs';
import {characterVersionMetadata,addonVersionMetadata,VERSION_METADATA_KEY} from './version-metadata.mjs';
import {inspectKnowledgePair,knowledgeQuarantine,selectDailyReceipt} from './storage-reconciliation.mjs';

// Offline-only export transformer. It never imports redis(), reads an env
// token or sends a command. A complete, quiescent export is a precondition.
// The resulting projection is for testing old-format READERS in a clone;
// it does not authorize restoring the previously vulnerable old writers.
export function buildLegacyReadProjection({roster,addonStates,knowledgePairs,dailyRows,petMetadata,modernReceipt=null,legacyReceipt=null,date,scope='production'}){
  if(!['production','preview'].includes(scope))throw new Error('Ungültiger Speicherbereich');
  if(!Array.isArray(addonStates)||!Array.isArray(knowledgePairs)||!Array.isArray(dailyRows))throw new Error('Vollständiger Export erforderlich');
  const identities=canonicalRoster(roster?.characters?.map(c=>({slug:c.slug,id:c.blizzardCharacterId??null})));
  if(!Number.isFinite(Date.parse(roster.generatedAt)))throw new Error('Ungültiger Roster-Export');
  const commands=[['SET','dalton-dashboard:characters:v1',JSON.stringify(roster)]],metadata=['characters',JSON.stringify(characterVersionMetadata(roster)),'pet',JSON.stringify(petMetadata??null)];
  const states=new Map();
  for(const state of addonStates){
    if(!state||!identities.some(x=>x.slug===state.characterSlug)||states.has(state.characterSlug))throw new Error('Ungültiger Add-on-Export');
    if(state.pendingObservations===true||state.pendingObservationPayload)throw new Error('Ausstehende Beobachtungen vor Migration auflösen');
    states.set(state.characterSlug,state);
    commands.push(['SET','dalton-dashboard:addon-sync:v1:'+scope+':'+state.characterSlug,JSON.stringify(state)]);
  }
  for(const {slug} of identities){
    const state=states.get(slug);
    metadata.push('addon:'+scope+':'+slug,JSON.stringify(addonVersionMetadata(state)));
  }
  const receipt=selectDailyReceipt(modernReceipt,legacyReceipt,date);
  if(receipt)metadata.push('daily-profile-refresh',JSON.stringify(receipt));
  commands.push(['HSET',VERSION_METADATA_KEY,...metadata]);
  const prefix='dalton-dashboard:live-knowledge:v1:'+scope+':';
  const records=new Map(),seenKeys=new Set(),quarantined=[];
  for(const entry of knowledgePairs){
    if(typeof entry?.key!=='string'||!entry.key.startsWith(prefix+'record:')||seenKeys.has(entry.key))throw new Error('Ungültige Beobachtungs-Exportidentität');
    seenKeys.add(entry.key);
    const raw=value=>value==null?null:typeof value==='string'?value:JSON.stringify(value);
    const modern=raw(entry.modern),legacy=raw(entry.legacy);
    const inspected=inspectKnowledgePair(modern,legacy);
    if(inspected.reason){
      const q=knowledgeQuarantine(entry.key,modern,legacy,inspected.reason);
      quarantined.push({key:entry.key,reason:inspected.reason,digest:q.digest});
      commands.push(['HSET',prefix+'records:v2',q.field,JSON.stringify(q.evidence)]);
      continue;
    }
    if(!inspected.record)throw new Error('Leerer Beobachtungs-Export');
    records.set(entry.key,inspected.record);
  }
  const ordered=[...records.entries()].sort(([a],[b])=>a.localeCompare(b,'en'));
  for(const [key,record] of ordered)commands.push(['SET',key,JSON.stringify(record)]);
  if(ordered.length)commands.push(['SADD',prefix+'index',...ordered.map(([key])=>key)]);
  const version='restore:'+createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
  commands.push(['SET',prefix+'version',version]);
  const days=new Map();
  for(const row of dailyRows){
    if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row?.date||'')||days.has(row.date))throw new Error('Ungültiger Tagesexport');
    days.set(row.date,row);
  }
  const dates=[...days.keys()].sort();
  for(const key of dates)commands.push(['HSET','dalton-dashboard:history:daily:index:v1',key,JSON.stringify(days.get(key))]);
  if(dates.length)commands.push(['SET','dalton-dashboard:history:daily:last:v1',JSON.stringify(days.get(dates.at(-1)))]);
  return {commands,manifest:{schema:'legacy-read-projection-v1',scope,roster:identities.length,addonStates:states.size,observations:ordered.length,quarantined,sourceObservationPairs:seenKeys.size,completeForLegacyReaders:quarantined.length===0,days:dates.length,latestDate:dates.at(-1)??null,
    sha256:createHash('sha256').update(JSON.stringify(commands)).digest('hex')}};
}
