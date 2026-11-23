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
    offerBuild:text(observation?.build)||null
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
          offerBuild:text(observation?.build)||null
        });
        continue;
      }
      sources.push(source);
    }

    const existingKeys=new Set(sources.map(sourceKey).filter(Boolean));
    const directPresent=new Map();
    for(const observation of observations){
      if(observation?.status!=='present'||!evidenceBuildApplies(observation,recipeIndex?.build)||!targetMatches(observation,recipe))continue;
      const key=observationSourceKey(observation);
      if(!key)continue;
      const previous=directPresent.get(key);
      if(!previous||sourcePriority(observation?.source)>sourcePriority(previous?.source)||
        sourcePriority(observation?.source)===sourcePriority(previous?.source)&&
        observationDate(observation?.observedAt??observation?.observedOn)>observationDate(previous?.observedAt??previous?.observedOn)){
        directPresent.set(key,observation);
      }
    }
    for(const [key,observation] of directPresent){
      if(existingKeys.has(key))continue;
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
      confirmedSourceCount:confirmed
    }
  };
}
