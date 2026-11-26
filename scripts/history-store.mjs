import {randomUUID} from 'node:crypto';
import {redis,REDIS_TYPE_GUARD} from './character-store.mjs';

const CHANGE_KEY='dalton-dashboard:history:changes:v1';
const DAILY_INDEX='dalton-dashboard:history:daily:index:v1';
const DAILY_LAST='dalton-dashboard:history:daily:last:v1';
const DAILY_LOCK_PREFIX='dalton-dashboard:history:daily:lock:';

function equipmentMap(list=[]){
  return Object.fromEntries([...list]
    .filter(item=>item?.slot)
    .sort((a,b)=>String(a.slot).localeCompare(String(b.slot),'de'))
    .map(item=>[item.slot,{
      id:item.id??null,
      item:item.item??null,
      sourceName:item.sourceName??null,
      level:item.level??null,
      quality:item.quality??null,
      icon:item.icon??null
    }]));
}
function professionMap(list=[]){
  return Object.fromEntries([...list]
    .filter(item=>item?.name)
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),'de'))
    .map(item=>[item.name,{
      current:item.current??null,
      max:item.max??null,
      knownRecipes:[...(item.knownRecipes||[])]
        .sort((a,b)=>(a?.id??0)-(b?.id??0))
        .map(recipe=>({
          id:recipe?.id??null,
          name:recipe?.name??null,
          craftedItem:recipe?.craftedItem??null,
          craftedQuantity:recipe?.craftedQuantity??null,
          reagents:[...(recipe?.reagents||[])].sort((a,b)=>(a?.id??0)-(b?.id??0))
        }))
    }]));
}
function talentDetailMap(list=[]){
  return [...list].map(tree=>({
    id:tree?.id??null,
    name:tree?.name??null,
    spentPoints:tree?.spentPoints??0,
    talents:[...(tree?.talents||[])]
      .sort((a,b)=>(a?.id??0)-(b?.id??0))
      .map(talent=>({
        id:talent?.id??null,
        name:talent?.name??null,
        rank:talent?.rank??null,
        description:talent?.description??null
      }))
  })).sort((a,b)=>(a.id??0)-(b.id??0));
}
function reputationMap(list=[]){
  return Object.fromEntries([...list]
    .filter(item=>item?.name)
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),'de'))
    .map(item=>[item.name,{
      id:item.id??null,
      raw:item.standing?.raw??null,
      value:item.standing?.value??null,
      max:item.standing?.max??null,
      tier:item.standing?.tier??null,
      standing:item.standing?.name??null
    }]));
}
function questMap(list=[]){
  return [...list]
    .map(quest=>({id:quest?.id??null,name:quest?.name??null}))
    .sort((a,b)=>(a.id??0)-(b.id??0));
}
function completedQuestMap(list=[]){
  return Object.fromEntries([...new Set(list.map(Number).filter(Number.isInteger))]
    .sort((a,b)=>a-b).map(id=>[String(id),true]));
}
function stableStats(stats={}){
  return Object.fromEntries(Object.entries(stats).sort(([a],[b])=>a.localeCompare(b,'de')));
}
function hunterPetMap(group={}){
  const normalize=list=>[...(Array.isArray(list)?list:[])]
    .sort((a,b)=>(Number(a?.slot)||0)-(Number(b?.slot)||0)||String(a?.name||'').localeCompare(String(b?.name||''),'de'))
    .map(pet=>({
      id:pet?.id??null,
      creatureId:pet?.creatureId??null,
      displayId:pet?.displayId??null,
      name:pet?.name??null,
      level:pet?.level??null,
      familyId:pet?.family?.id??null,
      family:pet?.family?.name??null,
      familySlug:pet?.family?.slug??null,
      active:pet?.active===true,
      summoned:pet?.summoned??null,
      slot:pet?.slot??null,
      iconUrl:pet?.iconUrl??null,
      imageUrl:pet?.imageUrl??null
    }));
  return {active:normalize(group?.active),stable:normalize(group?.stable)};
}
export function historyProjection(c={}){
  return {
    level:c.level??null,
    class:c.class??null,
    race:c.race??null,
    gender:c.gender??null,
    faction:c.faction??null,
    blizzardCharacterId:c.blizzardCharacterId??null,
    experience:c.experience??null,
    achievementPoints:c.achievementPoints??null,
    averageItemLevel:c.averageItemLevel??null,
    equippedItemLevel:c.equippedItemLevel??null,
    ruleset:c.ruleset?.name??null,
    lastLoginAt:c.lastLoginAt??null,
    talents:c.talents??null,
    talentDetails:talentDetailMap(c.talentDetails),
    professions:professionMap(c.professions),
    reputations:reputationMap(c.reputations),
    activeQuests:questMap(c.activeQuests),
    completedQuests:completedQuestMap(c.completedQuestIds||[]),
    stats:stableStats(c.stats),
    equipment:equipmentMap(c.equipment),
    hunterPets:hunterPetMap(c.hunterPets),
    imageUrl:c.imageUrl??null,
    avatarUrl:c.avatarUrl??null
  };
}
function plainObject(value){
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}
function walkDiff(before,after,path,out){
  if(Object.is(before,after))return;
  if(plainObject(before)&&plainObject(after)){
    const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].sort();
    for(const key of keys)walkDiff(before[key],after[key],path?path+'.'+key:key,out);
    return;
  }
  const same=JSON.stringify(before)===JSON.stringify(after);
  if(!same)out.push({path,before:before??null,after:after??null});
}
export function diffMeaningfulChanges(previous,latest){
  const beforeBySlug=new Map((previous?.characters||[]).map(c=>[c.slug,c]));
  const changes=[];
  for(const current of latest?.characters||[]){
    const prior=beforeBySlug.get(current.slug);
    if(!prior)continue;
    const local=[];
    walkDiff(historyProjection(prior),historyProjection(current),'',local);
    for(const change of local){
      changes.push({slug:current.slug,name:current.name||prior.name||current.slug,...change});
    }
  }
  return changes;
}
export async function appendChangeBatch(previous,latest,{source='manual'}={}){
  const changes=diffMeaningfulChanges(previous,latest);
  if(!changes.length)return {count:0,id:null};
  const batch={
    id:randomUUID(),
    observedAt:latest.generatedAt||new Date().toISOString(),
    source,
    fromGeneratedAt:previous.generatedAt||null,
    toGeneratedAt:latest.generatedAt||null,
    changes
  };
  await redis(['RPUSH',CHANGE_KEY,JSON.stringify(batch)]);
  return {count:changes.length,id:batch.id};
}
export async function getDailySnapshot(date){
  const value=await redis(['HGET',DAILY_INDEX,date]);
  return value?JSON.parse(value):null;
}
export async function registerDailySnapshot(meta,lockToken){
  if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(meta?.date||'')||(!meta?.url&&!['disabled','failed','legacy_public'].includes(meta?.archiveStatus)))throw new Error('Ungültige Snapshot-Metadaten');
  if(!lockToken)throw new Error('Tageslauf-Sperre erforderlich');
  const lua=REDIS_TYPE_GUARD+"if not valid(KEYS[1],'hash') or not valid(KEYS[2],'string') then return redis.error_reply('INVALID_STORAGE_TYPE') end; if redis.call('GET',KEYS[3])~=ARGV[3] then return redis.error_reply('DAILY_LOCK_LOST') end; local old=redis.call('GET',KEYS[2]); local prior=nil; if old then prior=cjson.decode(old); if type(prior.date)~='string' then return redis.error_reply('INVALID_DAILY_POINTER') end end; redis.call('HSET',KEYS[1],ARGV[1],ARGV[2]); if not prior or prior.date<=ARGV[1] then redis.call('SET',KEYS[2],ARGV[2]) end; return 'OK'";
  const result=await redis(['EVAL',lua,3,DAILY_INDEX,DAILY_LAST,DAILY_LOCK_PREFIX+meta.date,meta.date,JSON.stringify(meta),lockToken]);
  if(result!=='OK')throw new Error('Tagesindex nicht gespeichert');
}
export async function acquireDailySnapshotLock(date){
  const token=randomUUID();
  const ok=await redis(['SET',DAILY_LOCK_PREFIX+date,token,'EX',900,'NX']);
  return ok==='OK'?token:null;
}
export async function releaseDailySnapshotLock(date,token){
  const lua="if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  return redis(['EVAL',lua,1,DAILY_LOCK_PREFIX+date,token]);
}
