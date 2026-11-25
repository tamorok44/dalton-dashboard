import {readCompactMaster,writeCompactMaster} from './compact-master-cache.mjs';
import {collectPlannerKnownLocations} from './location-catalog.mjs';
import {redis,configured as redisConfigured} from './character-store.mjs';
import {foreverDbConfigured,fetchForeverDbClass} from './foreverdb-api.mjs';
import {CLASSIC_CLASS_TRAINER_COSTS} from './class-training-classic-costs.mjs';
import {CLASS_TRAINER_ZONE_DE} from './class-trainer-zones-de.mjs';

const CACHE_PREFIX='dalton-dashboard:foreverdb:class-master:v8:';
const PUBLIC_DATA_BASE='https://foreverdb.net/data/';
let publicTrainerCache=null;
let publicClassDataCache=null;
let publicGermanSpellCache=null;
const SPELL_LOCALE_HASH='dalton-dashboard:foreverdb:class-spell-locale:v2';
export const CLASS_BY_ID=Object.freeze({
  1:'warrior',2:'paladin',3:'hunter',4:'rogue',5:'priest',7:'shaman',8:'mage',9:'warlock',11:'druid'
});
const ZEPHRAS_FOREVER_TRAINERS=Object.freeze({
  warrior:[
    {name:'Blademaster Ren',x:43.7,y:24.2}
  ],
  hunter:[
    {name:"Tai'ree Farsight",x:42.5,y:23.7},
    {name:'Elayaa Easewind',x:45.2,y:44.3}
  ],
  rogue:[
    {name:'Akeri Duskblade',x:43.7,y:24.3},
    {name:'Miriaan Mistblade',x:43.2,y:43.2}
  ],
  shaman:[
    {name:'Windshaper Boro',x:42.8,y:23.6},
    {name:'Aarnor Galestrike',x:43.5,y:44.9}
  ],
  mage:[
    {name:'Dorii Brightwhisper',x:41.6,y:23.7},
    {name:'Shenaan Spellwind',x:45.1,y:45.8},
    {name:'Anathamaas Aetherwind',x:65.9,y:80.6}
  ],
  druid:[
    {name:'Xyton Silverwind',x:41.7,y:23.4},
    {name:'Naeluna Swiftmend',x:45.2,y:44.3},
    {name:'Lotheluum Starbreeze',x:64.0,y:75.1}
  ]
});
function verifiedZephrasClassTrainers(slug){
  return asArray(ZEPHRAS_FOREVER_TRAINERS[slug]).map((source,index)=>({
    type:'trainer',
    id:null,
    name:source.name,
    npcTitle:'Klassenlehrer',
    side:'alliance',
    location:{zone:'Insel Zephras',x:source.x,y:source.y,uiMapId:null,instance:null},
    evidence:'forever-confirmed',
    priceCopper:null,
    priceSource:null,
    displayId:null,
    renderSourceUrl:null,
    minLevel:null,
    maxLevel:null,
    sourceRef:'foreverdb-guide-zephras-2026-11-21',
    sourceOrder:index
  }));
}

function asArray(value){return Array.isArray(value)?value:[]}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function number(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
function integer(value){const n=number(value);return Number.isInteger(n)?n:null}
function text(value){return typeof value==='string'&&value.trim()?value.trim():null}
function first(...values){for(const value of values)if(value!==undefined&&value!==null&&value!=='')return value;return null}
function firstNumber(...values){for(const value of values){const n=number(value);if(n!==null)return n}return null}
function firstText(...values){for(const value of values){const s=text(value);if(s)return s}return null}
function lower(value){return String(value??'').trim().toLocaleLowerCase('en-US')}
function classicTrainerCost(spellId){
  const id=integer(spellId);
  if(!id)return null;
  const value=CLASSIC_CLASS_TRAINER_COSTS[String(id)]??CLASSIC_CLASS_TRAINER_COSTS[id];
  return Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null;
}
function trainerRoleMatchesAbility(source,ability={}){
  const title=lower(source?.npcTitle);
  if(/pet trainer|begleiter/.test(title))return false;
  const name=lower(firstText(ability?.name,ability?.englishName));
  const portal=/portal|teleport/.test(name);
  if(/portal trainer/.test(title))return portal;
  return !portal;
}
function priceSource(value,{hasPrice=false}={}){
  if(!hasPrice)return null;
  const key=lower(value);
  if(/forever|observed|player|live/.test(key))return 'forever-observed';
  if(/classic|cmangos/.test(key))return 'classic';
  return 'unknown';
}
function evidence(raw={}){
  const foreverFlag=first(raw.fv,raw.foreverVerified,raw.forever_verified);
  if(foreverFlag===true||foreverFlag===1||foreverFlag==='true')return 'forever-confirmed';
  const seen=first(raw.seenInForever,raw.seen_in_forever,raw.verifiedInForever,raw.verified_in_forever);
  if(seen===true||seen===1||seen==='true')return 'forever-confirmed';
  if(seen===false||seen===0||seen==='false'||foreverFlag===false||foreverFlag===0)return 'classic-unconfirmed';
  const source=lower(firstText(raw.evidence,raw.source,raw.dataSource,raw.data_source,raw.at));
  if(/forever|observed|verified|live/.test(source))return 'forever-confirmed';
  if(/classic|cmangos/.test(source))return 'classic-unconfirmed';
  return 'unknown';
}
function side(raw={}){
  const value=lower(firstText(raw.side,raw.faction,raw.team,raw.factionName,raw.faction_name));
  if(/alliance|allianz/.test(value))return 'alliance';
  if(/horde/.test(value))return 'horde';
  return null;
}
function location(raw={}){
  const loc=object(first(raw.location,raw.where,raw.position));
  const zone=firstText(loc.zone,loc.zoneName,loc.zone_name,raw.zone,raw.zoneName,raw.zone_name,loc.map?.name,raw.map?.name);
  const x=firstNumber(loc.x,loc.coordX,loc.coord_x,raw.x,raw.coordX,raw.coord_x);
  const y=firstNumber(loc.y,loc.coordY,loc.coord_y,raw.y,raw.coordY,raw.coord_y);
  const uiMapId=integer(first(loc.uiMapId,loc.ui_map_id,loc.mapId,loc.map_id,raw.uiMapId,raw.ui_map_id,raw.mapId,raw.map_id,raw.m,loc.map?.id,raw.map?.id));
  return {zone:zone||null,x,y,uiMapId,instance:firstText(loc.instance,raw.instance)||null};
}
function normalizeTrainer(raw={},inherited={}){
  const id=integer(first(raw.id,raw.npcId,raw.npc_id,raw.creatureId,raw.creature_id,typeof raw.npc==='number'?raw.npc:null,raw.npc?.id));
  const name=firstText(raw.name,raw.n,raw.npcName,raw.npc_name,raw.npc?.name);
  if(!id&&!name)return null;
  const directPrice=firstNumber(raw.trainerCost,raw.trainer_cost,raw.trainingCost,raw.training_cost,raw.priceCopper,raw.price_copper,raw.price);
  const inheritedPrice=firstNumber(inherited.priceCopper);
  const finalPrice=directPrice??inheritedPrice;
  const sourceRaw=firstText(raw.trainerCostSource,raw.trainer_cost_source,raw.trainingCostSource,raw.training_cost_source,raw.priceSource,raw.price_source,inherited.priceSourceRaw);
  return {
    type:'trainer',
    id,
    name:name||'Klassenlehrer',
    npcTitle:firstText(raw.title,raw.sub,raw.npcTitle,raw.npc_title,raw.npc?.title)||null,
    side:side(raw)||inherited.side||null,
    location:location(raw),
    evidence:evidence(raw),
    priceCopper:finalPrice===null?null:Math.round(finalPrice),
    priceSource:priceSource(sourceRaw,{hasPrice:finalPrice!==null}),
    displayId:integer(first(raw.displayId,raw.display_id,raw.creatureDisplayId,raw.creature_display_id)),
    renderSourceUrl:firstText(raw.render?.url,raw.renderUrl,raw.render_url,raw.imageUrl,raw.image_url)||null,
    minLevel:firstNumber(raw.minLevel,raw.min_level,raw.requiredLevel,raw.required_level),
    maxLevel:firstNumber(raw.maxLevel,raw.max_level),
    sourceRef:firstText(raw.sourceRef,raw.source_ref)||null
  };
}
function trainerContext(value,inherited={}){
  const raw=object(value);
  return {
    priceCopper:firstNumber(raw.trainerCost,raw.trainer_cost,raw.trainingCost,raw.training_cost,raw.priceCopper,raw.price_copper,inherited.priceCopper),
    priceSourceRaw:firstText(raw.trainerCostSource,raw.trainer_cost_source,raw.trainingCostSource,raw.training_cost_source,raw.priceSource,raw.price_source,inherited.priceSourceRaw),
    side:side(raw)||inherited.side||null
  };
}
function collectTrainers(value,path=[],out=[],inherited={}){
  const context=trainerContext(value,inherited);
  if(Array.isArray(value)){
    const trainerPath=path.some(part=>/trainer|teacher|ausbilder|lehrer/i.test(part));
    for(const entry of value){
      if(!entry||typeof entry!=='object')continue;
      const trainer=trainerPath?normalizeTrainer(entry,context):null;
      if(trainer)out.push(trainer);
      else collectTrainers(entry,path,out,context);
    }
    return out;
  }
  if(!value||typeof value!=='object')return out;
  for(const [key,entry] of Object.entries(value)){
    if(Array.isArray(entry)||entry&&typeof entry==='object')collectTrainers(entry,[...path,key],out,context);
  }
  return out;
}
function dedupeTrainers(sources=[]){
  const byKey=new Map();
  for(const source of sources){
    if(!source)continue;
    const loc=source.location||{};
    const key=[source.id||'',lower(source.name),lower(loc.zone),loc.x??'',loc.y??''].join('|');
    const prior=byKey.get(key);
    if(!prior){byKey.set(key,source);continue}
    const priorScore=(prior.evidence==='forever-confirmed'?4:0)+(prior.priceCopper!==null?2:0)+(prior.location?.zone?1:0);
    const score=(source.evidence==='forever-confirmed'?4:0)+(source.priceCopper!==null?2:0)+(source.location?.zone?1:0);
    if(score>priorScore)byKey.set(key,{...prior,...source});
  }
  return [...byKey.values()];
}

async function publicTrainerData({fetchImpl=fetch}={}){
  if(publicTrainerCache&&Date.now()-publicTrainerCache.at<10*60*1000)return publicTrainerCache.data;
  const url=new URL('trainers.json',PUBLIC_DATA_BASE);
  const response=await fetchImpl(url,{
    headers:{Accept:'application/json','User-Agent':'Dalton-Dashboard/1.0 (+https://dalton-dashboard-eight.vercel.app)'},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('ForeverDB öffentliche Klassenlehrer HTTP '+response.status);
  const data=await response.json();
  publicTrainerCache={at:Date.now(),data};
  return data;
}
export async function publicClassData({fetchImpl=fetch}={}){
  if(publicClassDataCache&&Date.now()-publicClassDataCache.at<10*60*1000)return publicClassDataCache.data;
  const response=await fetchImpl(new URL('classes.json',PUBLIC_DATA_BASE),{
    headers:{Accept:'application/json','User-Agent':'Dalton-Dashboard/1.0 (+https://dalton-dashboard-eight.vercel.app)'},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('ForeverDB öffentliche Klassendaten HTTP '+response.status);
  const data=await response.json();
  publicClassDataCache={at:Date.now(),data:Array.isArray(data)?data:[]};
  return publicClassDataCache.data;
}
async function publicGermanSpellData({fetchImpl=fetch}={}){
  if(publicGermanSpellCache&&Date.now()-publicGermanSpellCache.at<10*60*1000)return publicGermanSpellCache.data;
  const response=await fetchImpl(new URL('l10n/de/spells.json',PUBLIC_DATA_BASE),{
    headers:{Accept:'application/json','User-Agent':'Dalton-Dashboard/1.0 (+https://dalton-dashboard-eight.vercel.app)'},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('ForeverDB öffentliche deutsche Zauberdaten HTTP '+response.status);
  const data=await response.json();
  publicGermanSpellCache={at:Date.now(),data:data&&typeof data==='object'?data:{}};
  return publicGermanSpellCache.data;
}
function publicClassIconMap(classes=[]){
  const map=new Map();
  for(const klass of asArray(classes)){
    for(const ability of asArray(klass?.abilities)){
      for(const rank of asArray(ability?.ranks)){
        const id=integer(rank?.id),iconId=integer(first(rank?.ic,rank?.iconId,rank?.icon_id,rank?.icon));
        if(id&&iconId)map.set(id,iconId);
      }
    }
  }
  return map;
}
function localizedTrainer(source){
  if(!source)return source;
  const uiMapId=integer(source.location?.uiMapId);
  const germanZone=uiMapId?CLASS_TRAINER_ZONE_DE[uiMapId]||null:null;
  return {
    ...source,
    location:{
      ...source.location,
      zone:germanZone||source.location?.zone||null
    }
  };
}
export async function fetchForeverDbPublicClassTrainers(classId,{fetchImpl=fetch}={}){
  const data=await publicTrainerData({fetchImpl});
  const rows=asArray(data?.classTrainers?.[String(Number(classId))]);
  return dedupeTrainers(rows.map(raw=>localizedTrainer(normalizeTrainer(raw))).filter(Boolean));
}
function replaceGenericTrainerFallbacks(classMaster,trainers){
  const generic=dedupeTrainers(trainers);
  const fallbackOnly=sources=>asArray(sources).length>0&&asArray(sources).every(source=>
    String(source?.sourceRef||'').startsWith('foreverdb-guide-zephras-')
  );
  return {
    ...classMaster,
    trainers:generic,
    abilities:asArray(classMaster?.abilities).map(ability=>{
      const matching=generic.filter(source=>trainerRoleMatchesAbility(source,ability));
      return {
        ...ability,
        ranks:asArray(ability?.ranks).map(rank=>{
          if(asArray(rank?.sources).length&&!fallbackOnly(rank.sources))return rank;
          const sources=matching.map(source=>{
            if(source.priceCopper!==null||rank?.priceCopper===null||rank?.priceCopper===undefined)return source;
            return {...source,priceCopper:rank.priceCopper,priceSource:rank.priceSource||null};
          });
          return {...rank,sources};
        })
      };
    })
  };
}
function normalizeRank(raw={},ability={},classTrainers=[]){
  const spell=object(first(raw.spell,raw.ability,raw.classAbility,raw.class_ability));
  const id=integer(first(raw.id,raw.spellId,raw.spell_id,spell.id));
  const name=firstText(raw.name,spell.name,ability.name)||'Klassenfähigkeit';
  const rank=firstText(raw.rank,raw.rankName,raw.rank_name,spell.rank)||null;
  const requiredLevel=firstNumber(raw.learnAtLevel,raw.learn_at_level,raw.learnedAtLevel,raw.learned_at_level,raw.learnedLevel,raw.learned_level,raw.learnLevel,raw.learn_level,raw.requiredLevel,raw.required_level,raw.level,spell.requiredLevel,spell.required_level);
  const directPrice=firstNumber(raw.trainerCost,raw.trainer_cost,raw.trainingCost,raw.training_cost,raw.priceCopper,raw.price_copper);
  const abilityPrice=firstNumber(ability.trainerCost,ability.trainer_cost,ability.trainingCost,ability.training_cost);
  const classicPrice=classicTrainerCost(id);
  const finalPrice=directPrice??abilityPrice??classicPrice;
  const explicitSourceRaw=firstText(raw.trainerCostSource,raw.trainer_cost_source,raw.trainingCostSource,raw.training_cost_source,ability.trainerCostSource,ability.trainer_cost_source);
  const sourceRaw=explicitSourceRaw||(classicPrice!==null?'classic':null);
  const directSources=dedupeTrainers([
    ...collectTrainers(first(raw.sources,raw.trainers,raw.learnedFrom,raw.learned_from),['trainers'],[],{priceCopper:finalPrice,priceSourceRaw:sourceRaw}),
    ...collectTrainers(first(ability.sources,ability.trainers,ability.learnedFrom,ability.learned_from),['trainers'],[],{priceCopper:finalPrice,priceSourceRaw:sourceRaw})
  ]).filter(source=>trainerRoleMatchesAbility(source,ability));
  const fallbackSources=classTrainers.filter(source=>trainerRoleMatchesAbility(source,ability));
  const lessonVerified=directPrice!==null||abilityPrice!==null||classicPrice!==null||directSources.length>0;
  const sources=(directSources.length?directSources:fallbackSources).map(source=>{
    if(finalPrice===null||source.priceCopper!==null)return source;
    return {...source,priceCopper:Math.round(finalPrice),priceSource:priceSource(sourceRaw,{hasPrice:true})};
  });
  return {
    id,
    name,
    rank,
    requiredLevel,
    priceCopper:finalPrice===null?null:Math.round(finalPrice),
    priceSource:priceSource(sourceRaw,{hasPrice:finalPrice!==null}),
    lessonVerified,
    sources:dedupeTrainers(sources)
  };
}
function trainerAbility(raw={}){
  const type=lower(firstText(raw.type,raw.kind,typeof raw.learned==='string'?raw.learned:null,typeof raw.learnedFrom==='string'?raw.learnedFrom:null,typeof raw.learned_from==='string'?raw.learned_from:null,raw.learnedFromType,raw.learned_from_type,raw.sourceType,raw.source_type));
  if(/talent|quest|book|rune|racial|passive|learned elsewhere/.test(type))return false;
  if(/trainer|class trainer|ausbilder|lehrer/.test(type))return true;
  if(raw.trainer===true||raw.isTrainer===true||raw.is_trainer===true)return true;
  if(firstNumber(raw.trainerCost,raw.trainer_cost,raw.trainingCost,raw.training_cost)!==null)return true;
  return asArray(raw.ranks).some(rank=>
    firstNumber(rank?.trainerCost,rank?.trainer_cost,rank?.trainingCost,rank?.training_cost)!==null||
    asArray(rank?.trainers).length>0
  );
}
function companionTrainingAbility(raw={},slug){
  if(slug!=='hunter')return false;
  const line=lower(firstText(raw.line,raw.school,raw.category,raw.tab));
  return /beast training|pet training|begleiter/.test(line);
}
function abilityList(raw={}){
  for(const key of ['abilities','classAbilities','class_abilities','spells']){
    if(Array.isArray(raw?.[key]))return raw[key];
  }
  return [];
}
export function normalizeForeverDbClass(raw={},slug){
  const data=object(raw);
  const apiTrainers=dedupeTrainers([
    ...collectTrainers(first(data.trainers,data.classTrainers,data.class_trainers),['trainers'])
  ]);
  const classTrainers=apiTrainers.length?apiTrainers:verifiedZephrasClassTrainers(slug);
  const rawAbilities=abilityList(data);
  const abilities=rawAbilities.filter(ability=>trainerAbility(ability)&&!companionTrainingAbility(ability,slug)).map(ability=>{
    const ranksRaw=asArray(first(ability.ranks,ability.spells,ability.rankSpells,ability.rank_spells));
    const fallbackRanks=ranksRaw.length?ranksRaw:[ability];
    const ranks=fallbackRanks.map(rank=>normalizeRank(rank,ability,classTrainers))
      .filter(rank=>rank.id&&rank.requiredLevel!==null&&rank.lessonVerified===true)
      .sort((a,b)=>a.requiredLevel-b.requiredLevel||a.id-b.id);
    return {
      id:integer(first(ability.id,ability.spellId,ability.spell_id,ranks[0]?.id)),
      name:firstText(ability.name,ranks[0]?.name)||'Klassenfähigkeit',
      school:firstText(ability.school,ability.line,ability.category,ability.tab)||null,
      type:firstText(ability.type,ability.kind,ability.learned)||'trainer',
      ranks
    };
  }).filter(ability=>ability.ranks.length);
  if(!abilities.length)console.warn('ForeverDB-Klassenmaster ohne normalisierte Lehrerfähigkeiten:',slug);
  return {
    slug,
    id:integer(first(data.id,data.classId,data.class_id)),
    name:firstText(data.name,data.localizedName,data.localized_name)||slug,
    abilities,
    trainers:classTrainers
  };
}
export async function fetchForeverDbClassMaster(classId,{fetchImpl=fetch}={}){
  const slug=CLASS_BY_ID[Number(classId)];
  if(!slug)throw new Error('Nicht unterstützte Forever-Klasse');
  const [result,publicTrainers,publicClasses]=await Promise.all([
    fetchForeverDbClass(slug,{fetchImpl}),
    fetchForeverDbPublicClassTrainers(classId,{fetchImpl}).catch(()=>[]),
    publicClassData({fetchImpl}).catch(()=>[])
  ]);
  const normalized=normalizeForeverDbClass(result.data,slug);
  const iconMap=publicClassIconMap(publicClasses);
  const mergedTrainers=dedupeTrainers([
    ...publicTrainers,
    ...normalized.trainers,
    ...verifiedZephrasClassTrainers(slug)
  ]);
  const classMaster=replaceGenericTrainerFallbacks(normalized,mergedTrainers);
  return {
    classMaster:{
      ...classMaster,
      abilities:asArray(classMaster.abilities).map(ability=>({
        ...ability,
        ranks:asArray(ability.ranks).map(rank=>({...rank,iconId:integer(rank.iconId)||iconMap.get(integer(rank.id))||null}))
      }))
    },
    build:result.meta?.build||result.meta?.gameBuild||result.meta?.clientBuild||null
  };
}
export async function cachedGermanClassSpells(ids,{fetchImpl=fetch}={}){
  const keys=[...new Set(asArray(ids).map(integer).filter(Boolean))];
  if(!keys.length)return {};
  const out={};
  const missing=[];
  if(redisConfigured()){
    const values=await redis(['HMGET',SPELL_LOCALE_HASH,...keys.map(String)]);
    keys.forEach((id,index)=>{
      const raw=Array.isArray(values)?values[index]:null;
      if(!raw){missing.push(id);return}
      try{
        const parsed=JSON.parse(raw);
        if(parsed?.id===id&&parsed?.name)out[id]=parsed;
        else missing.push(id);
      }catch{missing.push(id)}
    });
  }else missing.push(...keys);
  if(missing.length){
    try{
      const [localized,classes]=await Promise.all([
        publicGermanSpellData({fetchImpl}),
        publicClassData({fetchImpl})
      ]);
      const iconMap=publicClassIconMap(classes);
      const clean=[];
      for(const id of missing){
        const row=localized?.[String(id)]||localized?.[id]||{};
        const name=firstText(row.n,row.name,row.localizedName);
        if(!name)continue;
        const record={
          id,
          name,
          rank:firstText(row.r,row.rank)||null,
          iconId:iconMap.get(id)||null
        };
        out[id]=record;clean.push(record);
      }
      if(clean.length&&redisConfigured()){
        const args=['HSET',SPELL_LOCALE_HASH];
        for(const record of clean)args.push(String(record.id),JSON.stringify(record));
        await redis(args);
      }
    }catch(error){
      console.warn('Öffentliche deutsche ForeverDB-Zauberdaten nicht verfügbar:',String(error.message).slice(0,140));
    }
  }
  return out;
}

export async function cachedForeverDbClassMaster(classId,{build=null,fetchImpl=fetch}={}){
  const slug=CLASS_BY_ID[Number(classId)];
  if(!slug)return null;
  const key=CACHE_PREFIX+slug+':'+(build||'current');
  if(redisConfigured()){
    const parsed=await readCompactMaster(key);
    if(parsed?.classMaster?.slug===slug&&Array.isArray(parsed.classMaster.abilities)&&parsed.classMaster.abilities.length){
      return {...parsed.classMaster,cached:true};
    }
  }
  if(!foreverDbConfigured())return null;
  const result=await fetchForeverDbClassMaster(classId,{fetchImpl});
  if(!result.classMaster?.slug)return null;
  if(redisConfigured())await writeCompactMaster(key,{classMaster:result.classMaster,generatedAt:new Date().toISOString(),build:build||result.build||null});
  return {...result.classMaster,cached:false};
}

// A class's world locations are a tiny build-scoped projection. The planner
// only needs the selected class's large ability master after this index exists.
export async function cachedForeverDbClassLocations(classId,{build=null,fetchImpl=fetch,classMaster=null}={}){
  const slug=CLASS_BY_ID[Number(classId)];
  if(!slug)return [];
  const key=CACHE_PREFIX+slug+':'+(build||'current')+':locations:v1';
  if(redisConfigured()&&!classMaster){
    const raw=await redis(['GET',key]);
    if(raw){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed}catch{}}
  }
  const master=classMaster||await cachedForeverDbClassMaster(classId,{build,fetchImpl});
  if(!master)return [];
  const names=collectPlannerKnownLocations({classMasters:[master]});
  if(redisConfigured())await redis(['SET',key,JSON.stringify(names)]);
  return names;
}
