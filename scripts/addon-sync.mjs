const SAFE_SECTION_NAMES=Object.freeze([
  'character',
  'spellbook',
  'location',
  'locationHistory',
  'instances',
  'hunter',
  'interactions'
]);

function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function array(value){
  if(Array.isArray(value))return value;
  if(!value||typeof value!=='object')return [];
  return Object.entries(value)
    .filter(([key])=>/^\d+$/.test(key))
    .sort((a,b)=>Number(a[0])-Number(b[0]))
    .map(([,entry])=>entry);
}
function integer(value){const n=Number(value);return Number.isInteger(n)&&n>0?n:null}
function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
function text(value,max=240){return typeof value==='string'&&value.trim()?value.trim().slice(0,max):null}
function epochIso(value){
  const n=finite(value);
  if(n!==null&&n>0)return new Date(n*1000).toISOString();
  const parsed=Date.parse(value||'');
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
}
function cloneSafe(value){return JSON.parse(JSON.stringify(value??null))}

export function buildSafeAddonSyncPayload(charDb,{syncId=null}={}){
  const db=object(charDb);
  const sections={};
  for(const name of SAFE_SECTION_NAMES){
    if(db[name]!==undefined)sections[name]=cloneSafe(db[name]);
  }
  const character=object(sections.character);
  if(!text(character.name)||!integer(character.classID)||!integer(character.level)){
    throw new Error('Charakteridentität in SavedVariables unvollständig');
  }
  const meta=object(db.meta);
  return {
    schemaVersion:1,
    syncId:text(syncId,128),
    client:{transport:'dalton-sync-companion',transportVersion:'0.1.0-beta.1'},
    addon:{
      version:text(meta.addonVersion,80),
      gameVersion:text(meta.gameVersion,80),
      build:text(meta.build,80),
      interface:integer(meta.interface),
      locale:text(meta.locale,40),
      lastUpdatedAt:epochIso(meta.lastUpdatedAt)
    },
    sections
  };
}

const VOLATILE_SYNC_KEYS=new Set([
  'syncId',
  'capturedAt',
  'reason',
  'lastUpdatedAt',
  'lastSeenAt',
  'closedAt',
  'coordinatesCapturedAt',
  'lastOpenedAt',
  'lastClosedAt',
  'resetSeconds',
  'resetAt',
  'logout'
]);
function stableContentValue(value){
  if(Array.isArray(value))return value.map(stableContentValue);
  if(!value||typeof value!=='object')return value;
  const out={};
  for(const key of Object.keys(value).sort()){
    if(VOLATILE_SYNC_KEYS.has(key))continue;
    const normalized=stableContentValue(value[key]);
    if(normalized!==undefined)out[key]=normalized;
  }
  return out;
}
export function addonSyncContentIdentity(payload){
  return stableContentValue(payload);
}

export function normalizeAddonSyncPayload(raw){
  const input=object(raw);
  if(Number(input.schemaVersion)!==1)throw new Error('Nicht unterstützte Addon-Sync-Version');
  const incoming=object(input.sections);
  for(const forbidden of ['economy','inventory']){
    if(Object.prototype.hasOwnProperty.call(incoming,forbidden)){
      throw new Error('Sensibler Bereich darf nicht über den Standard-Sync übertragen werden: '+forbidden);
    }
  }
  const payload=buildSafeAddonSyncPayload({
    meta:{
      addonVersion:input.addon?.version,
      gameVersion:input.addon?.gameVersion,
      build:input.addon?.build,
      interface:input.addon?.interface,
      locale:input.addon?.locale,
      lastUpdatedAt:input.addon?.lastUpdatedAt
    },
    ...incoming
  },{syncId:input.syncId});
  payload.client={
    transport:text(input.client?.transport,80)||'dalton-sync-companion',
    transportVersion:text(input.client?.transportVersion,80)||null
  };
  return payload;
}

export function addonSpellbookSnapshot(payload,classMaster=null){
  const sections=object(payload?.sections);
  const character=object(sections.character);
  const spellbook=object(sections.spellbook);
  const rawEntries=array(spellbook.entries);
  const allowedIds=new Set(
    array(classMaster?.abilities).flatMap(ability=>array(ability?.ranks))
      .map(rank=>integer(rank?.id)).filter(Boolean)
  );
  if(!allowedIds.size)return null;
  const seen=new Set(),entries=[];
  for(const entry of rawEntries){
    const id=integer(entry?.spellID??entry?.id);
    if(!id||seen.has(id)||entry?.known===false)continue;
    if(!allowedIds.has(id))continue;
    seen.add(id);
    entries.push({
      id,
      name:text(entry?.name,160),
      rank:text(entry?.rank,80),
      iconId:integer(entry?.iconID??entry?.iconId)
    });
  }
  if(!entries.length)return null;
  return {
    version:1,
    characterSlug:text(character.name,120),
    classId:integer(character.classID),
    level:integer(character.level),
    capturedAt:epochIso(spellbook.capturedAt)||epochIso(character.capturedAt)||new Date().toISOString(),
    entries
  };
}

function uniqueNpcCount(entries=[]){
  const keys=new Set();
  for(const entry of array(entries)){
    const npc=object(entry?.npc);
    const id=integer(npc.id);
    const name=text(npc.name,160);
    if(id)keys.add('id:'+id);
    else if(name)keys.add('name:'+name.toLocaleLowerCase('de-DE'));
  }
  return keys.size;
}
function sameLocation(a={},b={}){
  const az=text(a.zone,160),bz=text(b.zone,160);
  if(!az||!bz||az!==bz)return false;
  const as=text(a.subZone,160),bs=text(b.subZone,160);
  return !as||!bs||as===bs;
}
function visitedInstancesFromLocationHistory(history={}){
  const seen=new Map();
  for(const entry of array(history.entries)){
    const instance=object(entry?.instance);
    const type=text(instance.instanceType,40);
    if(type!=='party'&&type!=='raid')continue;
    const name=text(instance.name,160);
    if(!name)continue;
    const instanceID=integer(instance.instanceID);
    const difficultyID=integer(instance.difficultyID);
    const key=[instanceID||name.toLocaleLowerCase('de-DE'),difficultyID||''].join(':');
    const capturedAt=epochIso(entry?.lastSeenAt??entry?.capturedAt);
    const previous=seen.get(key);
    const candidate={
      name,
      instanceType:type,
      instanceID,
      difficultyID,
      difficultyName:text(instance.difficultyName,120),
      maxPlayers:finite(instance.maxPlayers),
      lastSeenAt:capturedAt
    };
    if(!previous||Date.parse(capturedAt||'')>Date.parse(previous.lastSeenAt||''))seen.set(key,candidate);
  }
  return [...seen.values()].sort((a,b)=>Date.parse(b.lastSeenAt||'')-Date.parse(a.lastSeenAt||'')).slice(0,60);
}

export function publicAddonSyncSummary(state={}){
  const payload=object(state.payload);
  const sections=object(payload.sections);
  const location=object(sections.location);
  const history=object(sections.locationHistory);
  const interactions=object(sections.interactions);
  const merchantHistory=array(interactions.merchantHistory);
  const trainerHistory=array(interactions.trainerHistory);
  const instances=object(sections.instances);
  const hunter=object(sections.hunter);
  const spellbook=object(sections.spellbook);
  const lockouts=array(instances.entries).slice(0,40).map(entry=>({
    name:text(entry?.name,160),
    difficultyName:text(entry?.difficultyName,120),
    resetAt:epochIso(entry?.resetAt??entry?.lock?.resetAt),
    locked:entry?.locked===true,
    extended:entry?.extended===true,
    isRaid:entry?.isRaid===true,
    maxPlayers:finite(entry?.maxPlayers),
    numEncounters:finite(entry?.numEncounters??entry?.lock?.encountersTotal),
    encounterProgress:finite(entry?.encounterProgress??entry?.lock?.encountersCompleted),
    instanceID:integer(entry?.instanceID)
  })).filter(entry=>entry.name);
  return {
    characterSlug:text(state.characterSlug,80),
    receivedAt:text(state.receivedAt,80),
    syncId:text(payload.syncId,128),
    addonVersion:text(payload.addon?.version,80),
    transport:text(payload.client?.transport,80),
    transportVersion:text(payload.client?.transportVersion,80),
    build:text(payload.addon?.build,80),
    locale:text(payload.addon?.locale,40),
    spellbookEntryCount:finite(spellbook.entryCount)??array(spellbook.entries).length,
    currentLocation:location.zone?(()=>{
      const lastKnown=object(location.lastKnownCoordinates);
      const useLastKnown=(finite(location.x)===null||finite(location.y)===null)&&sameLocation(location,lastKnown);
      return {
        capturedAt:epochIso(location.capturedAt),
        zone:text(location.zone,160),
        subZone:text(location.subZone,160),
        mapID:integer(location.mapID)??(useLastKnown?integer(lastKnown.mapID):null),
        x:finite(location.x)??(useLastKnown?finite(lastKnown.x):null),
        y:finite(location.y)??(useLastKnown?finite(lastKnown.y):null),
        coordinatesCapturedAt:useLastKnown?epochIso(lastKnown.capturedAt):epochIso(location.capturedAt),
        bindLocation:text(location.bindLocation,160)
      };
    })():null,
    locationHistoryCount:array(history.entries).length,
    visitedInstances:visitedInstancesFromLocationHistory(history),
    visitedInstanceCount:visitedInstancesFromLocationHistory(history).length,
    lockoutCount:finite(instances.count)??lockouts.length,
    lockouts,
    hunterCaptured:Boolean(Object.keys(hunter).length),
    merchantObservationCount:merchantHistory.length,
    trainerObservationCount:trainerHistory.length,
    merchantNpcCount:uniqueNpcCount(merchantHistory),
    trainerNpcCount:uniqueNpcCount(trainerHistory),
    latestMerchant:text(interactions.currentMerchant?.npc?.name,160),
    latestTrainer:text(interactions.currentTrainer?.npc?.name,160)
  };
}

export {SAFE_SECTION_NAMES};
