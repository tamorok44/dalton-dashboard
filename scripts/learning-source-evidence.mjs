import {hydrateRecipeIndex} from './workshop-foreverdb.mjs';
import {readFileSync} from 'node:fs';

const DEFAULT_EVIDENCE_URL=new URL('../data/learning-source-evidence.json',import.meta.url);

function asArray(value){return Array.isArray(value)?value:[]}
function integer(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isInteger(n)?n:null}
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
  if(recipeId===null&&recipeName&&recipeName!==norm(recipe?.name))return false;
  return recipeId!==null||craftedItemId!==null||Boolean(recipeName);
}
function sourceMatches(observation,source){
  const npcId=integer(observation?.npcId??observation?.vendorId);
  if(npcId!==null&&npcId!==integer(source?.id))return false;
  const sourceType=text(observation?.sourceType);
  if(sourceType&&sourceType!==text(source?.type))return false;
  const npcName=norm(observation?.npcName);
  if(npcId===null&&npcName&&npcName!==norm(source?.name))return false;
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
    offerObservedFor:observation.characterSlug||null,
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
      observation.characterSlug||'',
      observation.npcId||norm(observation.npcName),
      observation.recipeId||observation.craftedItemId||norm(observation.recipeName),
      observation.build||''
    ].join('|');
    const previous=map.get(key);
    if(!previous||observationDate(observation.observedAt)>observationDate(previous.observedAt))map.set(key,observation);
  }
  return [...map.values()];
}


 // Index candidates once; the existing exact matching predicates remain the
 // final authority. Preserve original order for equal-priority observations.
function addIndexed(map,key,value){
  if(key===null||key===undefined||key==='')return;
  let list=map.get(key);if(!list){list=[];map.set(key,list)}list.push(value);
}
function orderedCandidates(order,...lists){
  return [...new Set(lists.flat())].sort((a,b)=>order.get(a)-order.get(b));
}
function recipeLookup(recipes){
  const order=new Map(),items=new Map(),names=new Map(),vendorsById=new Map(),vendorsByName=new Map();
  recipes.forEach((recipe,i)=>{
    order.set(recipe,i);
    for(const itemId of recipeItemIds(recipe))addIndexed(items,itemId,recipe);
    for(const name of recipeTargetNames(recipe))addIndexed(names,name,recipe);
    for(const source of asArray(recipe?.learning?.sources)){
      if(source?.type!=='vendor')continue;
      addIndexed(vendorsById,integer(source?.id),recipe);
      addIndexed(vendorsByName,norm(source?.name),recipe);
    }
  });
  return {
    merchant(item){
      const itemId=integer(item?.itemID??item?.id),name=learningItemTargetName(item?.name);
      return orderedCandidates(order,items.get(itemId)||[],names.get(name)||[]).filter(recipe=>merchantItemMatchesRecipe(item,recipe));
    },
    vendor(npc){
      return orderedCandidates(order,vendorsById.get(integer(npc?.id))||[],vendorsByName.get(norm(npc?.name))||[]);
    },
    trainer(name,profession){
      return (names.get(name)||[]).filter(recipe=>!profession||text(recipe?.professionSlug)===profession);
    }
  };
}
function observationLookup(observations){
  const order=new Map(),ids=new Map(),items=new Map(),names=new Map();
  observations.forEach((observation,i)=>{
    order.set(observation,i);
    const rid=integer(observation?.recipeId),item=integer(observation?.craftedItemId),name=norm(observation?.recipeName);
    if(rid!==null)addIndexed(ids,rid,observation);
    else if(item!==null)addIndexed(items,item,observation);
    else if(name)addIndexed(names,name,observation);
  });
  return recipe=>orderedCandidates(order,ids.get(integer(recipe?.id))||[],items.get(integer(recipe?.craftedItem?.id))||[],names.get(norm(recipe?.name))||[]).filter(observation=>targetMatches(observation,recipe));
}

export function buildAddonLearningSourceEvidence(recipeIndex={},addonStates=[]){
  const recipes=asArray(recipeIndex?.recipes);
  const lookup=recipeLookup(recipes);
  const observations=[];

  for(const state of addonStateList(addonStates)){
    const payload=state?.payload&&typeof state.payload==='object'?state.payload:state;
    const addon=payload?.addon||{};
    const interactions=payload?.sections?.interactions||{};
    const observer=text(state?.characterSlug)||null;

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
        const matches=lookup.merchant(item);
        for(const recipe of matches){
          const recipeId=integer(recipe?.id);
          matchedRecipeKeys.add(recipeEvidenceKey(recipe));
          observations.push({
            npcId:integer(npc?.id),
            npcName:text(npc?.name)||null,
            sourceType:'vendor',
            characterSlug:observer,
            personalObservation:true,
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
      for(const recipe of lookup.vendor(npc)){
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
          characterSlug:observer,
          personalObservation:true,
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
        const matches=lookup.trainer(serviceName,professionSlug);
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


export function liveKnowledgeAsAddonStates(records=[]){
  const result=[];
  for(const record of asArray(records)){
    const snapshot=record?.latestSnapshot;
    if(!snapshot||!['merchant','trainer'].includes(record?.kind))continue;
    const [gameVersion,build]=String(record.build||'').match(/^(\d+\.\d+\.\d+)\.(\d+)$/)?.slice(1)||[null,record.build||null];
    const location=snapshot.location?{
      zone:snapshot.location.zone,
      subZone:snapshot.location.subZone,
      x:snapshot.location.x,
      y:snapshot.location.y,
      mapID:snapshot.location.uiMapId,
      instance:snapshot.location.instance?{name:snapshot.location.instance}:null
    }:null;
    const common={
      capturedAt:snapshot.capturedAt,
      complete:snapshot.complete===true,
      build,
      gameVersion,
      npc:snapshot.npc,
      location,
      count:snapshot.count,
      api:snapshot.api
    };
    result.push({
      receivedAt:record.lastObservedAt,
      characterSlug:record.characterSlug||snapshot.characterSlug||null,
      payload:{
        addon:{gameVersion,build},
        sections:{interactions:record.kind==='merchant'
          ?{merchantHistory:[{...common,items:snapshot.entries}]}
          :{trainerHistory:[{...common,services:snapshot.entries}]}
        }
      }
    });
  }
  return result;
}

export function buildLiveKnowledgeLearningSourceEvidence(recipeIndex={},records=[]){
  return buildAddonLearningSourceEvidence(recipeIndex,liveKnowledgeAsAddonStates(records));
}

export function liveKnowledgeDiscoveries(recipeIndex={},records=[]){
  const recipes=asArray(recipeIndex?.recipes);
  const lookup=recipeLookup(recipes);
  const discoveries=[];
  for(const record of asArray(records)){
    if(record?.kind!=='merchant'||!record?.latestSnapshot?.complete)continue;
    const snapshot=record.latestSnapshot;
    for(const item of asArray(snapshot.entries)){
      const target=learningItemTargetName(item?.name);
      if(!target)continue;
      const matched=lookup.merchant(item).length>0;
      if(matched)continue;
      discoveries.push({
        build:record.build||null,
        npcId:integer(record?.npc?.id),
        npcName:text(record?.npc?.name)||null,
        location:snapshot.location||record.location||null,
        itemID:integer(item?.itemID??item?.id),
        itemName:text(item?.name)||null,
        priceCopper:finite(item?.priceCopper),
        firstSeenAt:asArray(record?.offers).find(offer=>offerKeyForDiscovery(offer)===offerKeyForDiscovery(item))?.firstSeenAt||record.firstObservedAt||null,
        lastSeenAt:record.lastObservedAt||snapshot.capturedAt||null,
        currentlyPresent:true,
        classification:'unresolved-learning-item',
        source:'dalton-addon'
      });
    }
  }
  const map=new Map();
  for(const entry of discoveries){
    const key=[entry.build,entry.npcId||norm(entry.npcName),entry.itemID||norm(entry.itemName)].join('|');
    const previous=map.get(key);
    if(!previous||observationDate(entry.lastSeenAt)>observationDate(previous.lastSeenAt))map.set(key,entry);
  }
  return [...map.values()];
}
function offerKeyForDiscovery(item={}){
  const id=integer(item?.itemID??item?.id);
  if(id)return 'item:'+id;
  const name=norm(item?.name);
  return name?'name:'+name:null;
}

export function mergeLearningSourceEvidence(...documents){
  const observations=documents.flatMap(document=>asArray(document?.observations));
  const deduped=new Map();
  for(const observation of observations){
    const key=[
      observation.source||'unknown',
      observation.sourceType||'source',
      observation.characterSlug||'',
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

export function learningSourceEvidenceForIndex(recipeIndex={},addonStates=[],liveKnowledge=[]){
  return mergeLearningSourceEvidence(
    loadLearningSourceEvidence(),
    buildAddonLearningSourceEvidence(recipeIndex,addonStates),
    buildLiveKnowledgeLearningSourceEvidence(recipeIndex,liveKnowledge)
  );
}

export function applyLearningSourceEvidence(recipeIndex={},evidenceDocument={}, {characterSlug=null}={}){
  // A merchant window belongs to its observer, not all players. Old records
  // with no reliable observer are retained as history, never global overrides.
  const all=asArray(evidenceDocument?.observations);
  const observations=all.filter(observation=>{
    if(observation?.sourceType!=='vendor')return true;
    if(observation.characterSlug)return observation.characterSlug===characterSlug;
    return observation.personalObservation!==true&&observation.source!=='dalton-addon';
  });
  // Contradictions remain warning evidence even outside the original build or observer.
  const warnings=all.filter(o=>o?.sourceType==='vendor'&&o.status==='absent'&&(o.source==='dalton-live'||(o.source==='dalton-addon'&&o.snapshotComplete===true)));
  if(!observations.length&&!warnings.length)return recipeIndex;
  let blocked=0,confirmed=0,disputed=0;
  const warningLookup=observationLookup(warnings);
  const lookup=observationLookup(observations.filter(observation=>['present','absent'].includes(observation?.status)&&evidenceBuildApplies(observation,recipeIndex?.build)));
  const recipes=asArray(recipeIndex?.recipes).map(recipe=>{
    const relevant=lookup(recipe);
    const warningCandidates=warningLookup(recipe);
    const learning=recipe?.learning||{};
    const sources=[];
    for(const source of asArray(learning.sources)){
      const personal=characterSlug&&source?.type==='vendor'
        ?bestObservation(relevant.filter(o=>o.characterSlug===characterSlug),recipe,source,recipeIndex?.build):null;
      const observation=personal||bestObservation(relevant,recipe,source,recipeIndex?.build);
      const conflict=source?.type==='vendor'&&warningCandidates.some(o=>sourceMatches(o,source));
      const personallyReconfirmed=personal?.status==='present'&&Boolean(buildNumber(personal.build));
      const globallyReconfirmed=observation?.status==='present'&&observation?.availabilityScope==='all-players'&&Boolean(buildNumber(observation.build))&&warningCandidates.filter(o=>sourceMatches(o,source)).every(o=>observationDate(observation.observedAt??observation.observedOn)>observationDate(o.observedAt??o.observedOn));
      if(conflict&&observation?.status!=='absent'&&!personallyReconfirmed&&!globallyReconfirmed){
        disputed++;
        sources.push({...source,evidence:'disputed',offerStatus:'needs-recheck',priceCopper:null,pricePerItem:null,priceSource:null});
        continue;
      }
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
          offerObservedFor:observation.characterSlug||null,
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

    // Rejected sources must not be reintroduced by a secondary decision.
    const existingKeys=new Set(asArray(learning.sources).map(sourceKey).filter(Boolean));
    for(const source of sources)existingKeys.add(sourceKey(source));
    const directDecisions=new Map();
    for(const observation of relevant){
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
      const conflict=source.type==='vendor'&&warningCandidates.some(o=>sourceMatches(o,source));
      const own=Boolean(characterSlug&&observation.characterSlug===characterSlug&&buildNumber(observation.build));
      if(conflict&&!own){
        disputed++;
        sources.push({...source,evidence:'disputed',offerStatus:'needs-recheck',priceCopper:null,pricePerItem:null,priceSource:null});
        existingKeys.add(key);
        continue;
      }
      sources.push(source);
      existingKeys.add(key);
      confirmed++;
    }
    return {...recipe,learning:{...learning,sources}};
  });

  // Keep the item lookup used by the workshop consistent with evaluated recipes.
  return hydrateRecipeIndex({
    ...recipeIndex,
    recipes,
    learningSourceEvidence:{
      schemaVersion:integer(evidenceDocument?.schemaVersion)||1,
      updatedOn:text(evidenceDocument?.updatedOn)||null,
      observationCount:observations.length,
      blockedSourceCount:blocked,
      disputedSourceCount:disputed,
      confirmedSourceCount:confirmed,
      addonObservationCount:observations.filter(entry=>entry?.source==='dalton-addon').length,
      addonPresentCount:observations.filter(entry=>entry?.source==='dalton-addon'&&entry?.status==='present').length,
      addonAbsentCount:observations.filter(entry=>entry?.source==='dalton-addon'&&entry?.status==='absent').length
    }
  });
}
