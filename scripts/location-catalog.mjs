import {configured,redis} from './character-store.mjs';
import {preferredForeverZoneName,foreverZoneIdentity,verifiedForeverLocations} from './player-terminology.mjs';

function numericEntries(value){
  if(Array.isArray(value))return value;
  if(!value||typeof value!=='object')return [];
  return Object.entries(value)
    .filter(([key])=>/^\d+$/.test(key))
    .sort((a,b)=>Number(a[0])-Number(b[0]))
    .map(([,entry])=>entry);
}
function plannerLocationName(location={}){
  if(typeof location==='string')return preferredForeverZoneName(null,location);
  const raw=location&&typeof location==='object'?location:{};
  const mapId=Number(raw.uiMapId??raw.mapID);
  const technical=typeof raw.zone==='string'&&raw.zone.trim()
    ?raw.zone.trim()
    :typeof raw.mapName==='string'&&raw.mapName.trim()?raw.mapName.trim():null;
  return preferredForeverZoneName(Number.isInteger(mapId)?mapId:null,technical);
}
export function collectPlannerKnownLocations({recipeIndexes=[],classMasters=[],addonStates={},liveKnowledge=[]}={}){
  const zones=new Map();
  const add=location=>{
    const name=plannerLocationName(location);
    const key=foreverZoneIdentity(name);
    if(key&&!zones.has(key))zones.set(key,{name});
  };
  const addSources=sources=>{
    for(const source of Array.isArray(sources)?sources:[])add(source?.location);
  };
  for(const record of verifiedForeverLocations())add({uiMapId:record.uiMapId,zone:record.name});
  for(const recipeIndex of recipeIndexes){
    for(const recipe of Array.isArray(recipeIndex?.recipes)?recipeIndex.recipes:[])addSources(recipe?.learning?.sources);
  for(const profession of Array.isArray(recipeIndex?.professions)?recipeIndex.professions:[]){
    addSources(profession?.trainers);
    for(const rank of Array.isArray(profession?.ranks)?profession.ranks:[])addSources(rank?.sources);
  }
  }
  for(const classMaster of classMasters){
    if(!classMaster||classMaster.error)continue;
    addSources(classMaster.trainers);
    for(const ability of Array.isArray(classMaster.abilities)?classMaster.abilities:[]){
      for(const rank of Array.isArray(ability?.ranks)?ability.ranks:[])addSources(rank?.sources);
    }
  }
  for(const record of Array.isArray(liveKnowledge)?liveKnowledge:[]){
    add(record?.location);
    add(record?.latestSnapshot?.location);
  }
  for(const state of Object.values(addonStates||{})){
    const sections=state?.payload?.sections||{};
    add(sections.location);
    for(const entry of numericEntries(sections?.locationHistory?.entries)){
      add(entry);
      add(entry?.location);
    }
  }
  return [...zones.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'));
}

export function mergeSharedLocations(...lists){
  const byIdentity=new Map();
  for(const list of lists){
    for(const entry of Array.isArray(list)?list:[]){
      const name=preferredForeverZoneName(null,typeof entry==='string'?entry:entry?.name);
      const key=foreverZoneIdentity(name);
      if(key&&!byIdentity.has(key))byIdentity.set(key,{name});
    }
  }
  return [...byIdentity.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'));
}

// An additive location index, not a copy of NPC or recipe data. The atomic set
// union also preserves previously discovered locations across rolling histories
// and temporary source outages. Preview must not change production evidence.
export async function sharedPlannerLocations(locations,{redisImpl=redis,enabled=configured(),scope=process.env.VERCEL_ENV==='production'?'production':'preview'}={}){
  const current=mergeSharedLocations(verifiedForeverLocations(),locations);
  if(!enabled)return current;
  const key='dalton-dashboard:known-world-locations:v1:'+scope;
  try{
    const stored=await redisImpl(['EVAL',"for i=1,#ARGV do redis.call('SADD',KEYS[1],ARGV[i]) end return redis.call('SMEMBERS',KEYS[1])",1,key,...current.map(entry=>entry.name)]);
    return mergeSharedLocations(current,stored);
  }catch(error){
    console.warn('Gemeinsamer Ortskatalog vorübergehend nicht verfügbar:',String(error.message).slice(0,140));
    return current;
  }
}
