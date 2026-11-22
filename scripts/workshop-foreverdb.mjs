import {PROFESSION_SLUGS,fetchForeverDbProfession} from './foreverdb-api.mjs';

const PROFESSION_SLUG_BY_ID=new Map([
  [171,'alchemy'],
  [164,'blacksmithing'],
  [333,'enchanting'],
  [202,'engineering'],
  [165,'leatherworking'],
  [197,'tailoring'],
  [182,'herbalism'],
  [186,'mining'],
  [393,'skinning'],
  [185,'cooking'],
  [129,'first-aid'],
  [356,'fishing']
]);

function asArray(value){return Array.isArray(value)?value:[]}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function finite(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
function integer(value){const n=Number(value);return Number.isInteger(n)?n:null}
function string(value){return typeof value==='string'&&value.trim()?value.trim():null}
function first(...values){for(const value of values)if(value!==null&&value!==undefined&&value!=='')return value;return null}
function firstNumber(...values){for(const value of values){const n=finite(value);if(n!==null)return n}return null}
function firstInteger(...values){for(const value of values){const n=integer(value);if(n!==null)return n}return null}
function firstText(...values){for(const value of values){const s=string(value);if(s)return s}return null}

function itemRef(value){
  const raw=object(value);
  const nested=object(first(raw.item,raw.craftedItem,raw.output,raw.result,raw.reagent));
  const source=Object.keys(nested).length?nested:raw;
  const id=firstInteger(source.id,source.itemId,source.item_id,raw.itemId,raw.item_id);
  const name=firstText(source.name,source.localizedName,source.nameLocalized,source.label,raw.name);
  return id?{id,name}:null;
}
function quantityInfo(raw={}){
  const value=firstNumber(raw.value,raw.count,raw.quantity,raw.amount,raw.outputCount);
  const minimum=firstNumber(raw.minimum,raw.min,raw.minCount,raw.countMin);
  const maximum=firstNumber(raw.maximum,raw.max,raw.maxCount,raw.countMax);
  if(value!==null&&value>0)return {min:value,max:value,variable:false};
  const min=minimum!==null&&minimum>0?minimum:1;
  const max=maximum!==null&&maximum>0?Math.max(min,maximum):min;
  return {min,max,variable:max!==min};
}
function normalizeMakes(raw={}){
  const candidates=[raw.makes,raw.craftedItem,raw.crafted_item,raw.output,raw.result,raw.creates,raw.product];
  for(const candidate of candidates){
    const ref=itemRef(candidate);
    if(!ref)continue;
    const source=object(candidate);
    const amount=quantityInfo({
      ...object(source.count),
      ...object(source.quantity),
      value:first(source.count,source.quantity,source.value),
      minimum:first(source.minimum,source.min,source.countMin,source.minCount),
      maximum:first(source.maximum,source.max,source.countMax,source.maxCount)
    });
    return {item:ref,...amount};
  }
  const direct=itemRef({id:first(raw.craftedItemId,raw.outputItemId,raw.itemId),name:first(raw.craftedItemName,raw.outputName)});
  return direct?{item:direct,...quantityInfo(raw)}:null;
}
function normalizeReagents(raw={}){
  const source=asArray(first(raw.reagents,raw.materials,raw.ingredients,raw.requires));
  return source.map(entry=>{
    const ref=itemRef(entry);
    const e=object(entry);
    const quantity=firstNumber(e.quantity,e.count,e.amount,e.required,e.value);
    return ref&&quantity!==null&&quantity>0?{...ref,quantity}:null;
  }).filter(Boolean);
}
function categoryNames(category){
  const result=[];
  let current=category,guard=0;
  while(current&&guard++<5){
    if(typeof current==='string'){
      if(current.trim())result.unshift(current.trim());
      break;
    }
    const c=object(current);
    const name=firstText(c.name,c.label,c.title);
    if(name)result.unshift(name);
    current=first(c.parent,c.parentCategory,c.parent_category);
  }
  return [...new Set(result)];
}
function normalizeCategory(raw={}){
  const path=categoryNames(first(raw.category,raw.tradeSkillCategory,raw.trade_skill_category));
  return path.length?path:null;
}
function normalizeSkill(raw={}){
  const skill=object(first(raw.skill,raw.skillColors,raw.skill_colours,raw.skillColours));
  return {
    required:firstNumber(skill.orange,skill.required,skill.learn,raw.requiredSkill,raw.learnAtSkill,raw.skillRequired),
    yellow:firstNumber(skill.yellow),
    green:firstNumber(skill.green),
    grey:firstNumber(skill.grey,skill.gray),
    orangeSource:firstText(skill.orangeSource,skill.orange_source),
    orangeClassic:firstNumber(skill.orangeClassic,skill.orange_classic)
  };
}
function sourceTypeFromPath(path=[]){
  for(let i=path.length-1;i>=0;i--){
    const key=String(path[i]).toLowerCase();
    if(/trainer/.test(key))return 'trainer';
    if(/vendor|merchant|seller/.test(key))return 'vendor';
    if(/quest/.test(key))return 'quest';
    if(/drop|creature|mob|monster/.test(key))return 'drop';
    if(/object|container|chest/.test(key))return 'object';
    if(/recipe.?item|item/.test(key))return 'item';
  }
  return 'source';
}
function sideFromPath(path=[]){
  for(const key of path.map(x=>String(x).toLowerCase())){
    if(/alliance|allianz/.test(key))return 'alliance';
    if(/horde/.test(key))return 'horde';
    if(/neutral|other|sonstige|both|all/.test(key))return 'neutral';
  }
  return null;
}
function normalizeLocation(entry={}){
  const raw=object(first(entry.location,entry.place,entry.position,entry.coords,entry.coordinates));
  const zone=firstText(raw.zone,raw.zoneName,raw.area,entry.zone,entry.zoneName,entry.area);
  const x=firstNumber(raw.x,raw.mapX,entry.x,entry.mapX);
  const y=firstNumber(raw.y,raw.mapY,entry.y,entry.mapY);
  const uiMapId=firstInteger(raw.uiMapId,raw.mapId,entry.uiMapId,entry.mapId);
  const instance=firstText(raw.instance,entry.instance);
  return zone||x!==null||y!==null||uiMapId||instance?{zone,x,y,uiMapId,instance}:null;
}
function sourceIdentity(entry={}){
  const nested=object(first(entry.npc,entry.vendor,entry.trainer,entry.quest,entry.creature,entry.mob,entry.object,entry.item,entry.source));
  const source=Object.keys(nested).length?nested:entry;
  return {
    id:firstInteger(source.id,source.npcId,source.vendorId,source.trainerId,source.questId,source.creatureId,source.objectId,source.itemId,
      entry.id,entry.npcId,entry.vendorId,entry.trainerId,entry.questId,entry.creatureId,entry.objectId,entry.itemId),
    name:firstText(source.name,source.title,source.label,entry.name,entry.title,entry.label)
  };
}
function seenInForever(entry={}){
  const value=first(entry.seenInForever,entry.seen_in_forever,entry.foreverSeen,entry.seen);
  if(typeof value==='boolean')return value;
  const source=firstText(entry.source,entry.dataSource,entry.origin);
  if(source&&/forever/i.test(source))return true;
  if(source&&/classic|cmangos/i.test(source))return false;
  return null;
}
function normalizedCosts(entry={}){
  const costs=first(entry.costs,entry.otherCosts,entry.currencies);
  if(Array.isArray(costs))return costs.map(cost=>{
    const c=object(cost);
    return {
      name:firstText(c.name,c.currency,c.item?.name,c.label),
      quantity:firstNumber(c.quantity,c.count,c.amount,c.value)
    };
  }).filter(cost=>cost.name||cost.quantity!==null);
  return [];
}
function normalizeSource(entry,path){
  const raw=object(entry);
  const identity=sourceIdentity(raw);
  const location=normalizeLocation(raw);
  const type=sourceTypeFromPath(path);
  const seen=seenInForever(raw);
  const priceCopper=firstNumber(raw.priceCopper,raw.price,raw.trainerCost,raw.vendorPrice,raw.buyPrice);
  const pricePerItem=firstNumber(raw.pricePerItem,raw.price_per_item);
  const stack=firstNumber(raw.stack,raw.stackSize,raw.stack_size);
  const limitedStock=firstNumber(raw.limitedStock,raw.stock,raw.stockCount,raw.maxCount);
  const reputationFaction=firstText(raw.reputationFaction?.name,raw.reputationFaction,raw.reputation_faction?.name,raw.reputation_faction);
  const trainerCostSource=firstText(raw.trainerCostSource,raw.trainer_cost_source);
  const sourceLabel=firstText(raw.source,raw.dataSource,raw.origin);
  const npcTitle=firstText(raw.title,raw.npc?.title,raw.vendor?.title,raw.trainer?.title,raw.creature?.title);
  const dropChance=firstNumber(raw.dropChance,raw.chance,raw.percent);
  const observations=firstNumber(raw.players,raw.seenByPlayers,raw.observations,raw.count);
  const displayId=firstInteger(raw.displayId,raw.display_id,raw.creatureDisplayId,raw.creature_display_id,raw.display?.id,raw.npc?.displayId,raw.vendor?.displayId,raw.trainer?.displayId);
  const renderSourceUrl=firstText(raw.render?.url,raw.renderUrl,raw.render_url,raw.imageUrl,raw.image_url,raw.npc?.render?.url,raw.vendor?.render?.url,raw.trainer?.render?.url);
  if(!identity.id&&!identity.name&&!location&&priceCopper===null&&!sourceLabel)return null;
  return {
    type,
    side:sideFromPath(path),
    id:identity.id,
    name:identity.name||({trainer:'Unbekannter Lehrer',vendor:'Unbekannter Händler',quest:'Quest',drop:'Beute',object:'Objekt',item:'Rezeptgegenstand'}[type]||'Quelle'),
    location,
    seenInForever:seen,
    evidence:seen===true?'forever-confirmed':seen===false?'classic-unconfirmed':'unknown',
    priceCopper,
    pricePerItem,
    stack,
    limitedStock,
    costs:normalizedCosts(raw),
    reputationFaction,
    trainerCostSource,
    dropChance,
    observations,
    sourceLabel,
    npcTitle:npcTitle||null,
    displayId:displayId&&displayId>0?displayId:null,
    renderSourceUrl:renderSourceUrl&&/^https:\/\//.test(renderSourceUrl)?renderSourceUrl:null
  };
}
function collectSources(value,path=[],out=[]){
  if(Array.isArray(value)){
    const type=sourceTypeFromPath(path);
    const recognized=type!=='source';
    for(const entry of value){
      if(entry&&typeof entry==='object'){
        const normalized=recognized?normalizeSource(entry,path):null;
        if(normalized)out.push(normalized);
        else collectSources(entry,path,out);
      }
    }
    return out;
  }
  if(!value||typeof value!=='object')return out;
  for(const [key,entry] of Object.entries(value)){
    if(['skill','category','reagents','makes'].includes(key))continue;
    if(Array.isArray(entry)||entry&&typeof entry==='object')collectSources(entry,[...path,key],out);
  }
  return out;
}
function dedupeSources(sources=[]){
  const seen=new Set(),result=[];
  for(const source of sources){
    const key=[
      source.type,source.side,source.id,source.name,
      source.location?.uiMapId,source.location?.zone,source.location?.x,source.location?.y,
      source.priceCopper,source.evidence
    ].join('|');
    if(seen.has(key))continue;
    seen.add(key);result.push(source);
  }
  const evidenceOrder={'forever-confirmed':0,unknown:1,'classic-unconfirmed':2};
  const sideOrder={alliance:0,neutral:1,horde:2};
  return result.sort((a,b)=>
    (evidenceOrder[a.evidence]??1)-(evidenceOrder[b.evidence]??1)||
    (sideOrder[a.side]??1)-(sideOrder[b.side]??1)||
    a.type.localeCompare(b.type,'de')||
    a.name.localeCompare(b.name,'de')
  );
}
function normalizeLearning(raw={}){
  const learned=object(first(raw.learnedFrom,raw.learned_from,raw.learning,raw.learn));
  const sourceRoot=first(learned.sources,raw.sources,learned);
  const sources=dedupeSources(collectSources(sourceRoot));
  const method=firstText(learned.type,learned.method,learned.kind,raw.learnedFromType,raw.learnMethod);
  const automatic=Boolean(learned.automatic===true||raw.automatic===true||(method&&/auto/i.test(method)));
  return {
    method:method||null,
    automatic,
    sources,
    recipeItemsHidden:asArray(first(raw.recipeItemsHidden,raw.recipeItemsNotInClient,learned.recipeItemsHidden)).map(itemRef).filter(Boolean)
  };
}

function normalizeProfessionRank(raw={}){
  const entry=object(raw);
  const nested=object(first(entry.rank,entry.skillRank,entry.skill_rank));
  const source=Object.keys(nested).length?{...entry,...nested}:entry;
  const rankSources=dedupeSources(collectSources(first(source.sources,source.trainers,source.learnedFrom?.sources,source.learnedFrom?.trainers),['trainers']));
  return {
    id:firstInteger(source.id,source.rankId,source.rank_id,source.spellId,source.spell_id),
    name:firstText(source.name,source.rankName,source.rank_name,source.label),
    skillCap:firstNumber(source.skillCap,source.skill_cap,source.maxSkill,source.max_skill,source.maximumSkill,source.cap,source.skill?.max,source.skill?.cap),
    requiredSkill:firstNumber(source.requiredSkill,source.required_skill,source.minSkill,source.minimumSkill,source.learnAtSkill,source.skillRequired,source.skill?.required),
    requiredLevel:firstNumber(source.requiredLevel,source.required_level,source.minLevel,source.minimumLevel,source.levelRequirement,source.level_requirement),
    priceCopper:firstNumber(source.priceCopper,source.price,source.trainerCost,source.trainer_cost,source.cost),
    sources:rankSources
  };
}
export function normalizeProfessionMaster(raw={},professionSlug){
  const data=object(raw);
  const ranks=asArray(first(data.ranks,data.skillRanks,data.skill_ranks,data.professionRanks,data.profession_ranks))
    .map(normalizeProfessionRank)
    .filter(rank=>rank.name||rank.skillCap!==null);
  const trainers=dedupeSources(collectSources(first(data.trainers,data.professionTrainers,data.profession_trainers),['trainers']));
  return {
    slug:professionSlug,
    id:firstInteger(data.id,data.professionId,data.profession_id),
    name:firstText(data.name,data.localizedName,data.nameLocalized),
    ranks,
    trainers
  };
}
export async function fetchForeverDbProfessionMaster(professionSlug,{fetchImpl=fetch}={}){
  const page=await fetchForeverDbProfession(professionSlug,{limit:1,offset:0,fetchImpl});
  return {
    generatedAt:new Date().toISOString(),
    build:firstText(page.meta?.build,page.meta?.gameBuild,page.meta?.clientBuild)||null,
    profession:normalizeProfessionMaster(page.data,professionSlug)
  };
}

export function normalizeForeverDbRecipe(raw={},professionSlug){
  const makes=normalizeMakes(raw);
  if(!makes?.item?.id)return null;
  const skill=normalizeSkill(raw);
  const categoryPath=normalizeCategory(raw);
  const learning=normalizeLearning(raw);
  return {
    id:firstInteger(raw.id,raw.recipeId,raw.spellId),
    name:firstText(raw.name,raw.recipeName,makes.item.name)||makes.item.name||('Rezept '+makes.item.id),
    professionSlug,
    craftedItem:makes.item,
    craftedQuantity:{min:makes.min,max:makes.max,variable:makes.variable},
    reagents:normalizeReagents(raw),
    categoryPath:categoryPath||[],
    requiredSkill:skill.required,
    skill,
    learning,
    newInForever:raw.newInForever===true||raw.new===true,
    changedFromClassic:raw.changedFromClassic===true||raw.changed===true,
    speculation:raw.speculation===true
  };
}
function totalFromMeta(meta={},fallbackCount=0){
  return firstNumber(meta.total,meta.count,meta.totalCount,meta.pagination?.total,meta.pagination?.count)??fallbackCount;
}
export async function fetchForeverDbRecipeIndex({
  fetchImpl=fetch,
  pageSize=100,
  maxRequests=28,
  professionSlugs=[...PROFESSION_SLUGS]
}={}){
  const slugs=[...new Set(asArray(professionSlugs).filter(slug=>PROFESSION_SLUGS.has(slug)))].sort();
  if(!slugs.length)return {generatedAt:new Date().toISOString(),build:null,requestCount:0,complete:true,professionSlugs:[],professions:[],recipes:[],byItem:new Map()};
  let requestCount=0;
  const firstPages=await Promise.all(slugs.map(async slug=>{
    requestCount++;
    const page=await fetchForeverDbProfession(slug,{limit:pageSize,offset:0,fetchImpl});
    return {slug,page};
  }));
  const professions=firstPages.map(({slug,page})=>normalizeProfessionMaster(page.data,slug));
  const all=[];
  const extraJobs=[];
  for(const {slug,page} of firstPages){
    all.push(...page.recipes.map(recipe=>({slug,raw:recipe})));
    const total=totalFromMeta(page.meta,page.recipes.length);
    const pages=Math.max(1,Math.ceil(total/pageSize));
    for(let n=1;n<pages;n++)extraJobs.push({slug,offset:n*pageSize});
  }
  if(requestCount+extraJobs.length>maxRequests){
    throw new Error('ForeverDB-Rezeptkatalog würde das sichere Request-Budget überschreiten ('+(requestCount+extraJobs.length)+' Requests für '+slugs.length+' Berufe)');
  }
  const extra=await Promise.all(extraJobs.map(async job=>{
    requestCount++;
    const page=await fetchForeverDbProfession(job.slug,{limit:pageSize,offset:job.offset,fetchImpl});
    return {slug:job.slug,page};
  }));
  for(const {slug,page} of extra)all.push(...page.recipes.map(recipe=>({slug,raw:recipe})));
  const recipes=all.map(({slug,raw})=>normalizeForeverDbRecipe(raw,slug)).filter(Boolean);
  const byItem=new Map();
  for(const recipe of recipes){
    const list=byItem.get(recipe.craftedItem.id)||[];
    list.push(recipe);byItem.set(recipe.craftedItem.id,list);
  }
  const build=firstPages.map(entry=>firstText(entry.page.meta?.build,entry.page.meta?.gameBuild,entry.page.meta?.clientBuild)).find(Boolean)||null;
  return {
    generatedAt:new Date().toISOString(),
    build,
    requestCount,
    complete:true,
    professionSlugs:slugs,
    professions,
    recipes,
    byItem
  };
}

export async function searchForeverDbRecipesForItem(itemId,itemName,{fetchImpl=fetch}={}){
  const id=integer(itemId);
  const query=string(itemName);
  if(!id||!query)return {generatedAt:new Date().toISOString(),requestCount:0,recipes:[]};
  const slugs=[...PROFESSION_SLUGS].sort();
  const pages=await Promise.all(slugs.map(slug=>fetchForeverDbProfession(slug,{query,limit:100,offset:0,fetchImpl}).then(page=>({slug,page}))));
  const recipes=pages.flatMap(({slug,page})=>page.recipes.map(raw=>normalizeForeverDbRecipe(raw,slug)).filter(Boolean))
    .filter(recipe=>Number(recipe.craftedItem?.id)===id);
  return {
    generatedAt:new Date().toISOString(),
    requestCount:slugs.length,
    recipes
  };
}
export function serializableRecipeIndex(index){
  return {
    generatedAt:index.generatedAt,
    build:index.build||null,
    requestCount:index.requestCount||0,
    complete:index.complete===true,
    professionSlugs:asArray(index.professionSlugs),
    professions:asArray(index.professions),
    recipes:asArray(index.recipes)
  };
}
export function hydrateRecipeIndex(value={}){
  const recipes=asArray(value.recipes);
  const byItem=new Map();
  for(const recipe of recipes){
    const id=integer(recipe?.craftedItem?.id);
    if(!id)continue;
    const list=byItem.get(id)||[];list.push(recipe);byItem.set(id,list);
  }
  return {...value,professions:asArray(value.professions),recipes,byItem};
}
export function professionSlugFromRecord(profession={}){
  return PROFESSION_SLUG_BY_ID.get(Number(profession?.id))||null;
}
