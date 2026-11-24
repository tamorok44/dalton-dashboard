import {randomUUID} from 'node:crypto';
import {configured,redis} from './character-store.mjs';
import {resolveMediaAsset,imageStoreConfigured,sourceImageAllowed,readIconRecords,mediaIconKey,rememberMissingIcon} from './media-resolver.mjs';
import {blizzardApiConfigured,fetchForeverMediaIcon,fetchForeverSnapshot} from './blizzard-api.mjs';
import {collectKnownRecipeRefs,collectLocalizedRefs} from './forever-details.mjs';
import {foreverDbConfigured} from './foreverdb-api.mjs';
import {cachedForeverDbItem,cachedForeverDbSpell} from './workshop-store.mjs';

const NAMESPACE_KEY='dalton-dashboard:knowledge-media:namespace:v1';
const LOCK_KEY='dalton-dashboard:knowledge-media:batch:v1';
const NEGATIVE_TTL=7*86400000;
const LOOKUP_POLICY='blizzard-foreverdb-v2';
// Skill-Line-ID -> basic profession spell, only if Blizzard has no profession media.
const PROFESSION_SPELLS={171:2259,164:2018,333:7411,202:4036,165:2108,197:3908,182:2366,186:2575,393:8613,185:2550,129:3273,356:7620};
function positiveId(value){const id=Number(value);return Number.isInteger(id)&&id>0?id:null}
function ref(type,id,iconId=null){const n=positiveId(id);return n?{type,id:n,iconId:positiveId(iconId)}:null}
export function knowledgeRecipeRef(recipe={}){
  // Profile recipe IDs are not spell IDs. Reuse the actual crafted item.
  return ref('item',recipe?.craftedItem?.id)||ref('recipe',recipe?.id);
}
export function plannerKnowledgeRef(action={}){
  if(action.category==='profession-recipes')return ref('item',action.craftedItemId);
  if(action.category==='profession-training')return ref('profession',action.professionId);
  if(['class-abilities','companion-abilities'].includes(action.category))return ref('spell',action.id,action.iconId);
  return null;
}
function validNamespace(value){return /^static-[a-z0-9._]+-forever-eu$/i.test(value||'')}
async function observedNamespace(characterSlug){
  const cached=await redis(['GET',NAMESPACE_KEY]);
  if(validNamespace(cached))return cached;
  if(!blizzardApiConfigured()||!characterSlug)return null;
  const snapshot=await fetchForeverSnapshot([characterSlug],{endpointNames:['professions']});
  const refs=[...collectKnownRecipeRefs(snapshot),...collectLocalizedRefs(snapshot)];
  for(const entry of refs){
    const value=new URL(entry.href).searchParams.get('namespace');
    if(validNamespace(value)){await redis(['SET',NAMESPACE_KEY,value,'EX',21600]);return value}
  }
  return null;
}
function field(entry){return entry?mediaIconKey(entry.type,entry.id):null}
function freshNegative(record){const age=Date.now()-Date.parse(record?.updatedAt||'');return record&&!record.storedUrl&&record.lookupPolicy===LOOKUP_POLICY&&Number.isFinite(age)&&age>=0&&age<NEGATIVE_TTL}
export async function knowledgeIcons(refs,{characterSlug=null,allowFetch=true,maxNew=24}={}){
  const byKey=new Map();
  for(const entry of refs.filter(Boolean)){
    const key=field(entry);
    if(key&&(!byKey.has(key)||entry.iconId))byKey.set(key,entry);
  }
  if(!configured()||!byKey.size)return {};
  let records;
  try{records=await readIconRecords([...byKey.values()])}catch{return {}}
  const icons=Object.fromEntries(Object.entries(records).filter(([,r])=>r?.storedUrl).map(([key,r])=>[key,r.storedUrl]));
  if(!allowFetch||!imageStoreConfigured())return icons;
  const missing=[...byKey.entries()].filter(([key,entry])=>!icons[key]&&(!freshNegative(records[key])||(entry.iconId&&!records[key]?.sourceUrl))).slice(0,maxNew);
  if(!missing.length)return icons;
  // No per-character copies or browser source requests. Bound cold work and
  // serialize it across functions; warm path uses a single registry HMGET.
  const token=randomUUID();let locked=false;
  try{locked=(await redis(['SET',LOCK_KEY,token,'NX','EX',90]))==='OK'}catch{}
  if(!locked)return icons;
  try{
    const namespace=missing.some(([,entry])=>!entry.iconId)&&blizzardApiConfigured()
      ?await observedNamespace(characterSlug).catch(()=>null):null;
    const start=Date.now();
    let fallbackBudget=6;
    for(let i=0;i<missing.length&&Date.now()-start<15000;i+=6){
      await Promise.all(missing.slice(i,i+6).map(async ([key,entry])=>{
        try{
          let source=entry.iconId?'https://render.worldofwarcraft.com/forever-eu/icons/56/'+entry.iconId+'.jpg':null;
          if(!source&&namespace){
            source=await fetchForeverMediaIcon(entry.type,entry.id,{namespace});
            if(!source&&entry.type==='profession'&&PROFESSION_SPELLS[entry.id])
              source=await fetchForeverMediaIcon('spell',PROFESSION_SPELLS[entry.id],{namespace});
          }
          async function archive(value){
            if(!sourceImageAllowed(value))return null;
            return resolveMediaAsset({entityType:entry.type,entityId:entry.id,role:'icon',sourceUrl:value});
          }
          let url=await archive(source);
          // Some pet spells and Forever items have no Blizzard media record.
          // Use the exact same typed object ID with the already cached data adapter.
          // Never guess an icon from a similarly named ability.
          if(!url&&['spell','item'].includes(entry.type)&&foreverDbConfigured()){
            if(fallbackBudget<=0)return;
            fallbackBudget--;
            const result=entry.type==='spell'?await cachedForeverDbSpell(entry.id):await cachedForeverDbItem(entry.id);
            const raw=result?.icon;
            const iconId=positiveId(raw)||positiveId(String(raw||'').match(/(?:^|\/)icons\/(\d+)\.webp$/)?.[1]);
            const fallback=iconId?'https://render.worldofwarcraft.com/forever-eu/icons/56/'+iconId+'.jpg':raw;
            if(fallback&&fallback!==source)url=await archive(fallback);
            if(!url&&sourceImageAllowed(fallback))source=fallback;
          }
          if(url)icons[key]=url;
          else if(namespace)await rememberMissingIcon(entry.type,entry.id,LOOKUP_POLICY,source);
        }catch{/* Media outage never invalidates game data. */}
      }));
    }
  }finally{
    try{await redis(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,LOCK_KEY,token])}catch{}
  }
  return icons;
}
function iconFor(icons,entry){return icons[field(entry)]||null}
export async function enrichKnowledgeMedia(data={},petCatalog={},options={}){
  const chars=Array.isArray(data.characters)?data.characters:[];
  const refs=[];
  // Prioritize profession headings and abilities before large recipe lists.
  for(const c of chars)for(const p of c.professions||[])refs.push(ref('profession',p.id));
  for(const c of chars){
    for(const t of c.talentDetails||[])for(const talent of t.talents||[])refs.push(ref('spell',talent.spellId));
    for(const ability of c.knownClassAbilities||[])if(!ability.iconUrl)refs.push(ref('spell',ability.id,ability.iconId));
  }
  for(const family of Object.values(petCatalog||{}))for(const ability of family?.abilities||[])refs.push(ref('spell',ability.id,ability.iconId));
  for(const c of chars)for(const p of c.professions||[])for(const r of p.knownRecipes||[])refs.push(knowledgeRecipeRef(r));
  const icons=await knowledgeIcons(refs,{characterSlug:chars[0]?.slug,...options});
  const attach=(entry,reference)=>({...entry,iconUrl:iconFor(icons,reference)||entry.iconUrl||null});
  const characters=chars.map(c=>({...c,
    ...(Array.isArray(c.professions)?{professions:c.professions.map(p=>({...attach(p,ref('profession',p.id)),
      ...(Array.isArray(p.knownRecipes)?{knownRecipes:p.knownRecipes.map(r=>attach(r,knowledgeRecipeRef(r)))}:{})
    }))}:{}),
    ...(Array.isArray(c.talentDetails)?{talentDetails:c.talentDetails.map(t=>({...t,talents:(t.talents||[]).map(talent=>attach(talent,ref('spell',talent.spellId)))}))}:{}),
    ...(Array.isArray(c.knownClassAbilities)?{knownClassAbilities:c.knownClassAbilities.map(ability=>attach(ability,ref('spell',ability.id,ability.iconId)))}:{})
  }));
  const pets=Object.fromEntries(Object.entries(petCatalog||{}).map(([slug,family])=>[slug,{...family,abilities:(family?.abilities||[]).map(ability=>attach(ability,ref('spell',ability.id,ability.iconId)))}]));
  return {data:{...data,characters},petCatalog:pets};
}
export async function enrichPlannerKnowledgeMedia(actions=[],characterSlug){
  const icons=await knowledgeIcons(actions.map(plannerKnowledgeRef),{characterSlug,maxNew:18});
  return actions.map(action=>({...action,iconUrl:iconFor(icons,plannerKnowledgeRef(action))||action.iconUrl||null}));
}
