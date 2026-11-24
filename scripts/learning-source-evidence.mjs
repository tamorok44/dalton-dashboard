import {readFileSync} from 'node:fs';

const DEFAULT_EVIDENCE_URL=new URL('../data/learning-source-evidence.json',import.meta.url);

function asArray(value){return Array.isArray(value)?value:[]}
function integer(value){const n=Number(value);return Number.isInteger(n)?n:null}
function finite(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
function text(value){return typeof value==='string'?value.trim():''}
function norm(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE').trim();
}
function buildNumber(value){
  const match=String(value??'').match(/(\d{5,})\s*$/);
  return match?match[1]:null;
}
function observationDate(value){
  const timestamp=Date.parse(value||'');
  return Number.isFinite(timestamp)?timestamp:0;
}
function sourcePriority(value){
  const key=text(value);
  if(key==='dalton-addon')return 40;
  if(key==='dalton-live')return 35;
  if(key==='forever-live')return 25;
  if(key==='external-live')return 20;
  return 10;
}
function evidenceBuildApplies(observation,indexBuild){
  const observed=buildNumber(observation?.build);
  if(!observed)return true;
  const current=buildNumber(indexBuild);
  return Boolean(current&&current===observed);
}
function targetMatches(observation,recipe){
  const recipeId=integer(observation?.recipeId);
  if(recipeId!==null&&recipeId!==integer(recipe?.id))return false;
  const craftedItemId=integer(observation?.craftedItemId);
  if(craftedItemId!==null&&craftedItemId!==integer(recipe?.craftedItem?.id))return false;
  const professionSlug=text(observation?.professionSlug);
  if(professionSlug&&professionSlug!==text(recipe?.professionSlug))return false;
  const recipeName=norm(observation?.recipeName);
  if(recipeName&&recipeName!==norm(recipe?.name))return false;
  return recipeId!==null||craftedItemId!==null||Boolean(recipeName);
}
function sourceMatches(observation,source){
  const npcId=integer(observation?.npcId??observation?.vendorId);
  if(npcId!==null&&npcId!==integer(source?.id))return false;
  const sourceType=text(observation?.sourceType);
  if(sourceType&&sourceType!==text(source?.type))return false;
  const npcName=norm(observation?.npcName);
  if(npcName&&npcName!==norm(source?.name))return false;
  return npcId!==null||Boolean(npcName);
}
function observationSourceKey(observation={}){
  const id=integer(observation?.npcId??observation?.vendorId);
  const type=text(observation?.sourceType)||'source';
  if(id)return type+':'+id;
  const name=norm(observation?.npcName);
  return name?type+':name:'+name:null;
}
function sourceKey(source={}){
  const id=integer(source?.id);
  const type=text(source?.type)||'source';
  if(id)return type+':'+id;
  const name=norm(source?.name);
  return name?type+':name:'+name:null;
}
function sourceFromObservation(observation={}){
  const id=integer(observation?.npcId??observation?.vendorId);
  const name=text(observation?.npcName);
  const type=text(observation?.sourceType);
  if(!['vendor','trainer'].includes(type)||(!id&&!name))return null;
  const observedPrice=finite(observation?.priceCopper);
  const location=observation?.location&&typeof observation.location==='object'
    ?{
      zone:text(observation.location.zone)||null,
      x:finite(observation.location.x),
      y:finite(observation.location.y),
      uiMapId:integer(observation.location.uiMapId),
      instance:text(observation.location.instance)||null
    }
    :null;
  return {
    type,
    side:text(observation?.side)||null,
    id,
    name:name||(type==='trainer'?'Unbekannter Lehrer':'Unbekannter Händler'),
    location,
    seenInForever:true,
    evidence:'forever-confirmed',
    priceCopper:observedPrice!==null?Math.round(observedPrice):null,
    priceSource:observedPrice!==null?'forever-observed':null,
    pricePerItem:null,
    stack:null,
    limitedStock:null,
    costs:[],
    reputationFaction:null,
    trainerCostSource:null,
    dropChance:null,
    observations:null,
    sourceLabel:text(observation?.source)||null,
    npcTitle:text(observation?.npcTitle)||null,
    displayId:integer(observation?.displayId),
    renderSourceUrl:text(observation?.renderSourceUrl)||null,
    offerStatus:'present',
    offerEvidenceSource:text(observation?.source)||null,
    offerObservedOn:text(observation?.observedAt??observation?.observedOn)||null,
    offerBuild:text(observation?.build)||null,
    observedRequiredLevel:finite(observation?.requiredLevel),
    observedRequiredSkillName:text(observation?.requiredSkillName)||null,
    observedRequiredSkillRank:finite(observation?.requiredSkillRank),
    observedServiceType:text(observation?.serviceType)||null
  };
}
function bestObservation(observations,recipe,source,indexBuild){
  return asArray(observations)
    .filter(observation=>
      ['present','absent'].includes(observation?.status)&&
      evidenceBuildApplies(observation,indexBuild)&&
      targetMatches(observation,recipe)&&
      sourceMatches(observation,source)
    )
    .sort((a,b)=>
      sourcePriority(b?.source)-sourcePriority(a?.source)||
      observationDate(b?.observedAt??b?.observedOn)-observationDate(a?.observedAt??a?.observedOn)
    )[0]||null;
}

export function loadLearningSourceEvidence({url=DEFAULT_EVIDENCE_URL}={}){
  try{
    const parsed=JSON.parse(readFileSync(url,'utf8'));
    return {
      schemaVersion:integer(parsed?.schemaVersion)||1,
      updatedOn:text(parsed?.updatedOn)||null,
      observations:asArray(parsed?.observations)
    };
  }catch(error){
    console.warn('Lernquellen-Evidenz konnte nicht geladen werden:',String(error.message).slice(0,140));
    return {schemaVersion:1,updatedOn:null,observations:[]};
  }
}


function numericArray(value){
  if(Array.isArray(value))return value;
  if(!value||typeof value!=='object')return [];
  return Object.entries(value)
    .filter(([key])=>/^\d+$/.test(key))
    .sort((a,b)=>Number(a[0])-Number(b[0]))
    .map(([,entry])=>entry);
}
function isoFromCapturedAt(value){
  const n=Number(value);
  if(Number.isFinite(n)&&n>0)return new Date(n*1000).toISOString();
  const parsed=Date.parse(value||'');
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
}
function combinedBuild(snapshot={},addon={}){
  const raw=text(snapshot?.build)||text(addon?.build);
  if(!raw)return null;
  if(/^\d+$/.test(raw)){
    const version=text(snapshot?.gameVersion)||text(addon?.gameVersion);
    return version?version+'.'+raw:raw;
  }
  return raw;
}
const LEARNING_ITEM_PREFIX=/^(?:rezept|recipe|muster|pattern|pl[aä]ne|plans?|formel|formula|bauplan|schematic|handbuch|manual|entwurf|design)\s*:\s*/i;
function learningItemTargetName(value){
  const raw=text(value);
  if(!raw||!LEARNING_ITEM_PREFIX.test(raw))return null;
  return norm(raw.replace(LEARNING_ITEM_PREFIX,''));
}
function recipeTargetNames(recipe={}){
  return new Set([norm(recipe?.name),norm(recipe?.craftedItem?.name)].filter(Boolean));
}
function recipeEvidenceKey(recipe={}){
  const id=integer(recipe?.id);
  if(id)return 'recipe:'+id;
  const crafted=integer(recipe?.craftedItem?.id);
  return 'recipe:'+text(recipe?.professionSlug)+':'+String(crafted||'')+':'+norm(recipe?.name);
}
function recipeItemIds(recipe={}){
  const ids=new Set();
  for(const source of asArray(recipe?.learning?.sources)){
    if(source?.type!=='item')continue;
    const id=integer(source?.id);
    if(id)ids.add(id);
  }
  for(const item of asArray(recipe?.learning?.recipeItemsHidden)){
    const id=integer(item?.id);
    if(id)ids.add(id);
  }
  return ids;
}
function merchantItemMatchesRecipe(item={},recipe={}){
  const itemId=integer(item?.itemID??item?.id);
  if(itemId&&recipeItemIds(recipe).has(itemId))return true;
  const target=learningItemTargetName(item?.name);
  return Boolean(target&&recipeTargetNames(recipe).has(target));
}
function npcMatchesSource(npc={},source={}){
  const npcId=integer(npc?.id);
  const sourceId=integer(source?.id);
  if(npcId&&sourceId)return npcId===sourceId;
  return Boolean(norm(npc?.name)&&norm(npc?.name)===norm(source?.name));
}
function addonLocation(snapshot={}){
  const raw=snapshot?.location&&typeof snapshot.location==='object'?snapshot.location:{};
  const zone=text(raw.zone)||text(raw.mapName)||null;
  const x=finite(raw.x),y=finite(raw.y);
  const uiMapId=integer(raw.mapID??raw.uiMapId);
  const instance=text(raw?.instance?.name??raw.instance)||null;
  return zone||x!==null||y!==null||uiMapId||instance?{zone,x,y,uiMapId,instance}:null;
}
const PROFESSION_BY_SKILL_LINE=new Map([
  ['alchemy','alchemy'],['alchemie','alchemy'],
  ['blacksmithing','blacksmithing'],['schmiedekunst','blacksmithing'],
  ['enchanting','enchanting'],['verzauberkunst','enchanting'],
  ['engineering','engineering'],['ingenieurskunst','engineering'],
  ['leatherworking','leatherworking'],['lederverarbeitung','leatherworking'],
  ['tailoring','tailoring'],['schneiderei','tailoring'],
  ['herbalism','herbalism'],['krauterkunde','herbalism'],['kräuterkunde','herbalism'],
  ['mining','mining'],['bergbau','mining'],
  ['skinning','skinning'],['kurschnerei','skinning'],['kürschnerei','skinning'],
  ['cooking','cooking'],['kochkunst','cooking'],
  ['first aid','first-aid'],['erste hilfe','first-aid'],
  ['fishing','fishing'],['angeln','fishing']
]);
function trainerProfessionSlug(service={}){
  for(const candidate of [service?.skillLine,service?.requiredSkillName]){
    const key=norm(candidate);
    if(PROFESSION_BY_SKILL_LINE.has(key))return PROFESSION_BY_SKILL_LINE.get(key);
  }
  return null;
}
function addonStateList(states){
  if(Array.isArray(states))return states.filter(Boolean);
  if(states&&typeof states==='object')return Object.values(states).filter(Boolean);
  return [];
}
function newestByKey(observations=[]){
  const map=new Map();
  for(const observation of observations){
    const key=[
      observation.sourceType,
      observation.npcId||norm(observation.npcName),
      observation.recipeId||observation.craftedItemId||norm(observation.recipeName),
      observation.build||''
    ].join('|');
    const previous=map.get(key);
    if(!previous||observationDate(observation.observedAt)>observationDate(previous.observedAt))map.set(key,observation);
  }
  return [...map.values()];
}

export function buildAddonLearningSourceEvidence(recipeIndex={},addonStates=[]){
  const recipes=asArray(recipeIndex?.recipes);
  const observations=[];

  for(const state of addonStateList(addonStates)){
    const payload=state?.payload&&typeof state.payload==='object'?state.payload:state;
    const addon=payload?.addon||{};
    const interactions=payload?.sections?.interactions||{};

    for(const snapshot of numericArray(interactions?.merchantHistory)){
      if(snapshot?.complete!==true)continue;
      const npc=snapshot?.npc||{};
      if(!integer(npc?.id)&&!text(npc?.name))continue;
      const items=numericArray(snapshot?.items);
      const matchedRecipeKeys=new Set();
      const build=combinedBuild(snapshot,addon);
      const observedAt=isoFromCapturedAt(snapshot?.capturedAt)||state?.receivedAt||null;
      const location=addonLocation(snapshot);

      for(const item of items){
        const matches=recipes.filter(recipe=>merchantItemMatchesRecipe(item,recipe));
        for(const recipe of matches){
          const recipeId=integer(recipe?.id);
          matchedRecipeKeys.add(recipeEvidenceKey(recipe));
          observations.push({
            npcId:integer(npc?.id),
            npcName:text(npc?.name)||null,
            sourceType:'vendor',
            professionSlug:text(recipe?.professionSlug)||null,
            recipeId,
            craftedItemId:integer(recipe?.craftedItem?.id),
            recipeName:text(recipe?.name)||null,
            status:'present',
            priceCopper:finite(item?.priceCopper),
            build,
            observedAt,
            source:'dalton-addon',
            location,
            offerItemId:integer(item?.itemID??item?.id),
            offerItemName:text(item?.name)||null,
            snapshotComplete:true
          });
        }
      }

      // A complete merchant window can safely disprove only recipes that the
      // current master already attributes to this same vendor.
      for(const recipe of recipes){
        const recipeId=integer(recipe?.id);
        if(matchedRecipeKeys.has(recipeEvidenceKey(recipe)))continue;
        const attributedSources=asArray(recipe?.learning?.sources).filter(source=>
          source?.type==='vendor'&&npcMatchesSource(npc,source)
        );
        if(!attributedSources.length)continue;
        const limited=attributedSources.some(source=>{
          const stock=finite(source?.limitedStock);
          return stock!==null&&stock>0;
        });
        if(limited)continue;
        observations.push({
          npcId:integer(npc?.id),
          npcName:text(npc?.name)||null,
          sourceType:'vendor',
          professionSlug:text(recipe?.professionSlug)||null,
          recipeId,
          craftedItemId:integer(recipe?.craftedItem?.id),
          recipeName:text(recipe?.name)||null,
          status:'absent',
          build,
          observedAt,
          source:'dalton-addon',
          location,
          snapshotComplete:true
        });
      }
    }

    for(const snapshot of numericArray(interactions?.trainerHistory)){
      const npc=snapshot?.npc||{};
      if(!integer(npc?.id)&&!text(npc?.name))continue;
      const build=combinedBuild(snapshot,addon);
      const observedAt=isoFromCapturedAt(snapshot?.capturedAt)||state?.receivedAt||null;
      const location=addonLocation(snapshot);
      for(const service of numericArray(snapshot?.services)){
        const serviceName=norm(service?.name);
        if(!serviceName)continue;
        const professionSlug=trainerProfessionSlug(service);
        const matches=recipes.filter(recipe=>{
          if(professionSlug&&text(recipe?.professionSlug)!==professionSlug)return false;
          return recipeTargetNames(recipe).has(serviceName);
        });
        for(const recipe of matches){
          observations.push({
            npcId:integer(npc?.id),
            npcName:text(npc?.name)||null,
            sourceType:'trainer',
            professionSlug:text(recipe?.professionSlug)||professionSlug||null,
            recipeId:integer(recipe?.id),
            craftedItemId:integer(recipe?.craftedItem?.id),
            recipeName:text(recipe?.name)||null,
            status:'present',
            priceCopper:finite(service?.priceCopper),
            build,
            observedAt,
            source:'dalton-addon',
            location,
                    requiredLevel:finite(service?.requiredLevel),
            requiredSkillName:text(service?.requiredSkillName)||text(service?.skillLine)||null,
            requiredSkillRank:finite(service?.requiredSkillRank),
            serviceType:text(service?.serviceType)||null,
            snapshotComplete:snapshot?.complete===true
          });
        }
      }
    }
  }

  const deduped=newestByKey(observations);
  return {
    schemaVersion:1,
    updatedOn:deduped.map(entry=>entry.observedAt).filter(Boolean).sort().at(-1)||null,
    observations:deduped,
    addonObservationCount:deduped.length
  };
}

export function mergeLearningSourceEvidence(...documents){
  const observations=documents.flatMap(document=>asArray(document?.observations));
  const deduped=new Map();
  for(const observation of observations){
    const key=[
      observation.source||'unknown',
      observation.sourceType||'source',
      observation.npcId||norm(observation.npcName),
      observation.recipeId||observation.craftedItemId||norm(observation.recipeName),
      observation.status||'unknown',
      observation.build||'',
      observation.observedAt||observation.observedOn||''
    ].join('|');
    deduped.set(key,observation);
  }
  const values=[...deduped.values()];
  return {
    schemaVersion:1,
    updatedOn:values.map(entry=>entry.observedAt||entry.observedOn).filter(Boolean).sort().at(-1)||null,
    observations:values
  };
}

export function learningSourceEvidenceForIndex(recipeIndex={},addonStates=[]){
  return mergeLearningSourceEvidence(
    loadLearningSourceEvidence(),
    buildAddonLearningSourceEvidence(recipeIndex,addonStates)
  );
}

export function applyLearningSourceEvidence(recipeIndex={},evidenceDocument={}){
  const observations=asArray(evidenceDocument?.observations);
  if(!observations.length)return recipeIndex;

  let blocked=0,confirmed=0;
  const recipes=asArray(recipeIndex?.recipes).map(recipe=>{
    const learning=recipe?.learning||{};
    const sources=[];
    for(const source of asArray(learning.sources)){
      const observation=bestObservation(observations,recipe,source,recipeIndex?.build);
      if(observation?.status==='absent'){
        blocked++;
        continue;
      }
      if(observation?.status==='present'){
        confirmed++;
        const observedPrice=finite(observation?.priceCopper);
        sources.push({
          ...source,
          evidence:'forever-confirmed',
          seenInForever:true,
          priceCopper:observedPrice!==null?Math.round(observedPrice):source?.priceCopper??null,
          priceSource:observedPrice!==null?'forever-observed':source?.priceSource??null,
          offerStatus:'present',
          offerEvidenceSource:text(observation?.source)||null,
          offerObservedOn:text(observation?.observedAt??observation?.observedOn)||null,
          offerBuild:text(observation?.build)||null,
          observedRequiredLevel:finite(observation?.requiredLevel),
          observedRequiredSkillName:text(observation?.requiredSkillName)||null,
          observedRequiredSkillRank:finite(observation?.requiredSkillRank),
          observedServiceType:text(observation?.serviceType)||null
        });
        continue;
      }
      sources.push(source);
    }

    const existingKeys=new Set(sources.map(sourceKey).filter(Boolean));
    const directDecisions=new Map();
    for(const observation of observations){
      if(!['present','absent'].includes(observation?.status)||
        !evidenceBuildApplies(observation,recipeIndex?.build)||
        !targetMatches(observation,recipe))continue;
      const key=observationSourceKey(observation);
      if(!key)continue;
      const previous=directDecisions.get(key);
      if(!previous||sourcePriority(observation?.source)>sourcePriority(previous?.source)||
        sourcePriority(observation?.source)===sourcePriority(previous?.source)&&
        observationDate(observation?.observedAt??observation?.observedOn)>observationDate(previous?.observedAt??previous?.observedOn)){
        directDecisions.set(key,observation);
      }
    }
    for(const [key,observation] of directDecisions){
      if(existingKeys.has(key)||observation?.status!=='present')continue;
      const source=sourceFromObservation(observation);
      if(!source)continue;
      sources.push(source);
      existingKeys.add(key);
      confirmed++;
    }
    return {...recipe,learning:{...learning,sources}};
  });

  return {
    ...recipeIndex,
    recipes,
    learningSourceEvidence:{
      schemaVersion:integer(evidenceDocument?.schemaVersion)||1,
      updatedOn:text(evidenceDocument?.updatedOn)||null,
      observationCount:observations.length,
      blockedSourceCount:blocked,
      confirmedSourceCount:confirmed,
      addonObservationCount:observations.filter(entry=>entry?.source==='dalton-addon').length,
      addonPresentCount:observations.filter(entry=>entry?.source==='dalton-addon'&&entry?.status==='present').length,
      addonAbsentCount:observations.filter(entry=>entry?.source==='dalton-addon'&&entry?.status==='absent').length
    }
  };
}
