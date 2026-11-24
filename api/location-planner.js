import {enrichPlannerKnowledgeMedia} from '../scripts/knowledge-media.mjs';
import {loadCharacters} from '../scripts/character-store.mjs';
import {foreverDbConfigured} from '../scripts/foreverdb-api.mjs';
import {getForeverDbMasterRecipeIndex,getCachedForeverDbMasterRecipeIndex} from '../scripts/workshop-store.mjs';
import {workshopProfessionSlugs} from '../scripts/workshop-core.mjs';
import {buildLocationPlanner} from '../scripts/location-planner.mjs';
import {cachedForeverDbClassMaster,cachedGermanClassSpells} from '../scripts/class-training-store.mjs';
import {resolveMediaAsset} from '../scripts/media-resolver.mjs';
import {classicNpcDisplayId} from '../scripts/classic-npc-display-ids.mjs';
import {applyLearningSourceEvidence,learningSourceEvidenceForIndex,liveKnowledgeDiscoveries} from '../scripts/learning-source-evidence.mjs';
import {loadAddonSyncStates} from '../scripts/addon-sync-store.mjs';
import {loadLiveKnowledge,publicLiveKnowledgeSummary} from '../scripts/live-knowledge-store.mjs';
import {preferredForeverZoneName,foreverZoneIdentity} from '../scripts/player-terminology.mjs';
import {collectPlannerKnownLocations,sharedPlannerLocations} from '../scripts/location-catalog.mjs';

function queryUrl(req){
  return new URL(req.url||'/api/location-planner','https://dalton-dashboard.local');
}
function hasFiniteNumber(value){
  return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
}
function normalizeText(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE').trim();
}
function discoveryZone(discovery={}){
  const location=discovery.location||{};
  const mapId=Number(location.uiMapId);
  return preferredForeverZoneName(Number.isInteger(mapId)?mapId:null,location.zone);
}
function publicDiscovery(discovery={}){
  return {
    build:discovery.build||null,
    npcId:discovery.npcId??null,
    npcName:discovery.npcName||'Unbekannter Händler',
    location:{
      zone:discoveryZone(discovery),
      x:hasFiniteNumber(discovery?.location?.x)?Number(discovery.location.x):null,
      y:hasFiniteNumber(discovery?.location?.y)?Number(discovery.location.y):null,
      uiMapId:Number.isInteger(Number(discovery?.location?.uiMapId))?Number(discovery.location.uiMapId):null
    },
    itemID:discovery.itemID??null,
    itemName:discovery.itemName||'Unbekannter Gegenstand',
    priceCopper:hasFiniteNumber(discovery.priceCopper)?Math.round(Number(discovery.priceCopper)):null,
    firstSeenAt:discovery.firstSeenAt||null,
    lastSeenAt:discovery.lastSeenAt||null,
    classification:discovery.classification||'unresolved-learning-item'
  };
}
function npcRenderSource({displayId,renderSourceUrl}={}){
  if(typeof renderSourceUrl==='string'&&/^https:\/\/(?:render\.worldofwarcraft\.com\/forever-eu\/|render(?:-eu)?\.worldofwarcraft\.com\/(?:eu\/)?npcs\/)/.test(renderSourceUrl))return renderSourceUrl;
  const id=Number(displayId);
  return Number.isInteger(id)&&id>0
    ?'https://render-eu.worldofwarcraft.com/npcs/zoom/creature-display-'+id+'.jpg'
    :null;
}
function germanRankLabel(value){
  if(typeof value!=='string'||!value.trim())return null;
  const rank=value.trim();
  const match=rank.match(/^Rank\s+(\d+)$/i);
  return match?'Rang '+match[1]:rank;
}
function localizeClassAction(action,localized={}){
  if(action?.category!=='class-abilities')return action;
  const id=Number(action.id);
  const spell=Number.isInteger(id)?localized[id]:null;
  const name=spell?.name||('Klassenfähigkeit #'+(Number.isInteger(id)?id:'–'));
  const rank=germanRankLabel(spell?.rank||action?.rank);
  return {
    ...action,
    name:[name,rank].filter(Boolean).join(' · '),
    abilityName:name,
    rank,
    iconId:Number.isInteger(Number(spell?.iconId))?Number(spell.iconId):(Number.isInteger(Number(action?.iconId))?Number(action.iconId):null)
  };
}
function localizePlannerClassData(planner,localized={}){
  const selectedCharacter=planner?.selectedCharacter?{
    ...planner.selectedCharacter,
    knownClassAbilities:Array.isArray(planner.selectedCharacter.knownClassAbilities)
      ?planner.selectedCharacter.knownClassAbilities.map(entry=>{
        const id=Number(entry?.id);
        const spell=Number.isInteger(id)?localized[id]:null;
        return {
          ...entry,
          name:spell?.name||entry?.name||('Klassenfähigkeit #'+(Number.isInteger(id)?id:'–')),
          rank:germanRankLabel(spell?.rank||entry?.rank)
        };
      })
      :planner.selectedCharacter.knownClassAbilities
  }:planner?.selectedCharacter;
  return {
    ...planner,
    selectedCharacter,
    actions:Array.isArray(planner?.actions)?planner.actions.map(action=>localizeClassAction(action,localized)):planner?.actions,
    npcs:Array.isArray(planner?.npcs)?planner.npcs.map(npc=>({
      ...npc,
      actions:Array.isArray(npc?.actions)?npc.actions.map(action=>localizeClassAction(action,localized)):npc?.actions
    })):planner?.npcs
  };
}
async function withNpcAvatar(npc){
  const candidate={
    ...npc,
    displayId:Number(npc?.displayId)||classicNpcDisplayId(npc?.id)||null
  };
  const sourceUrl=npcRenderSource(candidate);
  if(!sourceUrl||!candidate.id)return {...candidate,avatarUrl:null};
  try{
    const avatarUrl=await resolveMediaAsset({
      entityType:'npc',
      entityId:candidate.id,
      role:'portrait',
      sourceUrl,
      refreshOnSourceChange:true
    });
    return {...candidate,avatarUrl:avatarUrl||null};
  }catch(error){
    console.warn('NPC-Bild konnte nicht archiviert werden:',String(error.message).slice(0,120));
    return {...candidate,avatarUrl:null};
  }
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, no-store');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'Methode nicht erlaubt'});
  }
  try{
    const stored=await loadCharacters();
    const url=queryUrl(req);
    const character=(url.searchParams.get('character')||'').trim()||null;
    const location=(url.searchParams.get('location')||'').trim()||null;
    const remoteReady=foreverDbConfigured();
    const characterSlugs=(stored.data?.characters||[]).map(character=>character.slug).filter(Boolean);
    const [recipeIndex,addonStates]=await Promise.all([
      remoteReady
        ?getForeverDbMasterRecipeIndex({seedProfessionSlugs:workshopProfessionSlugs(stored.data)})
        :getCachedForeverDbMasterRecipeIndex(),
      loadAddonSyncStates(characterSlugs)
    ]);
    if(!recipeIndex){
      const knownLocations=await sharedPlannerLocations(collectPlannerKnownLocations({addonStates}));
      const base=buildLocationPlanner(stored.data,{recipes:[],professions:[]},{characterSlug:character,location,knownLocations});
      return res.status(200).json({
        ...base,
        catalog:{connected:false,complete:false,build:null,generatedAt:null},
        reason:'ForeverDB ist derzeit nicht verbunden und es liegt kein gecachter Rezept-Master vor.'
      });
    }
    const liveKnowledge=await loadLiveKnowledge({build:recipeIndex?.build||null});
    const evaluatedRecipeIndex=applyLearningSourceEvidence(
      recipeIndex,
      learningSourceEvidenceForIndex(recipeIndex,addonStates,liveKnowledge)
    );
    const selectedCharacter=character
      ?(stored.data?.characters||[]).find(entry=>entry?.slug===character)
      :null;
    const selectedProfessionSlugs=selectedCharacter
      ?workshopProfessionSlugs({characters:[selectedCharacter]})
      :[];
    const professionMasters=Object.fromEntries(
      (evaluatedRecipeIndex?.professions||[])
        .filter(profession=>selectedProfessionSlugs.includes(profession?.slug))
        .map(profession=>[profession.slug,{...profession,cached:true}])
    );
    // All roster classes contribute to the same world-location catalog.
    // Only the selected class contributes actual learning actions.
    const classIds=[...new Set((stored.data?.characters||[]).map(entry=>Number(entry.classId)).filter(id=>Number.isInteger(id)&&id>0))];
    const classMasters=await Promise.all(classIds.map(async id=>{
      try{return await cachedForeverDbClassMaster(id,{build:evaluatedRecipeIndex?.build||null})}
      catch(error){console.warn('Klassenmaster für Ortskatalog nicht verfügbar:',String(error.message).slice(0,140));return null}
    }));
    const classMaster=classMasters[classIds.indexOf(Number(selectedCharacter?.classId))]||null;
    const knownLocations=await sharedPlannerLocations(collectPlannerKnownLocations({
      recipeIndexes:[recipeIndex,evaluatedRecipeIndex],
      classMasters,
      addonStates,
      liveKnowledge
    }));
    let planner=buildLocationPlanner(stored.data,evaluatedRecipeIndex,{
      characterSlug:character,
      location,
      professionMasters,
      classMaster,
      knownLocations
    });
    const discoveries=liveKnowledgeDiscoveries(recipeIndex,liveKnowledge).map(publicDiscovery);
    const discoveryZones=new Map();
    for(const discovery of discoveries){
      const zone=discovery.location?.zone;
      if(!zone)continue;
      const key=foreverZoneIdentity(zone);
      let entry=discoveryZones.get(key);
      if(!entry){entry={name:zone,items:[],npcs:new Set()};discoveryZones.set(key,entry)}
      entry.items.push(discovery);
      entry.npcs.add(discovery.npcId||discovery.npcName);
    }
    const locations=[...(planner.locations||[])];
    for(const entry of discoveryZones.values()){
      const existing=locations.find(candidate=>foreverZoneIdentity(candidate.name)===foreverZoneIdentity(entry.name));
      if(existing)existing.discoveryCount=entry.items.length;
      else locations.push({name:entry.name,actionCount:0,npcCount:entry.npcs.size,discoveryCount:entry.items.length});
    }
    const requestedDiscoveryZone=location
      ?[...discoveryZones.values()].find(entry=>foreverZoneIdentity(entry.name)===foreverZoneIdentity(location))
      :null;
    if(!planner.selectedLocation&&requestedDiscoveryZone){
      planner={...planner,selectedLocation:requestedDiscoveryZone.name,actions:[],npcs:[]};
    }
    planner={
      ...planner,
      locations:locations.sort((a,b)=>String(a.name).localeCompare(String(b.name),'de')),
      liveDiscoveries:planner.selectedLocation
        ?(discoveryZones.get(foreverZoneIdentity(planner.selectedLocation))?.items||[])
        :[]
    };
    const classSpellIds=[
      ...(Array.isArray(planner.actions)?planner.actions.filter(action=>action?.category==='class-abilities').map(action=>action.id):[]),
      ...(Array.isArray(planner.selectedCharacter?.knownClassAbilities)?planner.selectedCharacter.knownClassAbilities.map(entry=>entry?.id):[])
    ];
    if(classSpellIds.length){
      const localized=await cachedGermanClassSpells(classSpellIds);
      planner=localizePlannerClassData(planner,localized);
    }
    const illustratedActions=await enrichPlannerKnowledgeMedia(planner.actions||[],character).catch(()=>planner.actions||[]);
    const iconByKey=new Map(illustratedActions.map(action=>[action.key,action.iconUrl||null]));
    planner={
      ...planner,
      actions:illustratedActions,
      npcs:(planner.npcs||[]).map(npc=>({
        ...npc,
        actions:(npc.actions||[]).map(action=>({...action,iconUrl:iconByKey.get(action.key)||null}))
      }))
    };
    if(planner.npcs?.length){
      const npcs=await Promise.all(planner.npcs.map(npc=>withNpcAvatar(npc)));
      const avatarByKey=new Map(npcs.map(npc=>[npc.key,npc.avatarUrl||null]));
      planner={
        ...planner,
        npcs,
        actions:(planner.actions||[]).map(action=>({
          ...action,
          source:{...action.source,avatarUrl:avatarByKey.get(action.source?.key)||null}
        }))
      };
    }
    const professionMasterValues=Object.values(professionMasters);
    const professionMasterErrors=professionMasterValues.filter(value=>value?.error).length;
    const professionRanks=professionMasterValues.flatMap(value=>Array.isArray(value?.ranks)?value.ranks:[]);
    const professionTrainers=professionMasterValues.flatMap(value=>Array.isArray(value?.trainers)?value.trainers:[]);
    return res.status(200).json({
      ...planner,
      catalog:{
        connected:true,
        readOnlyCache:!remoteReady,
        complete:recipeIndex?.masterComplete===true&&recipeIndex?.complete===true,
        refreshing:recipeIndex?.refreshing===true,
        build:recipeIndex?.build||null,
        generatedAt:recipeIndex?.generatedAt||null,
        recipeCount:Array.isArray(evaluatedRecipeIndex?.recipes)?evaluatedRecipeIndex.recipes.length:0,
        learningSourceEvidence:evaluatedRecipeIndex?.learningSourceEvidence||null,
        liveKnowledge:publicLiveKnowledgeSummary(liveKnowledge),
        professionMasterCount:professionMasterValues.filter(value=>value&&!value.error).length,
        professionMasterErrors,
        professionRankCount:professionRanks.length,
        professionRankWithLevelCount:professionRanks.filter(rank=>hasFiniteNumber(rank?.requiredLevel)).length,
        professionRankWithSourceCount:professionRanks.filter(rank=>Array.isArray(rank?.sources)&&rank.sources.length).length,
        professionTrainerCount:professionTrainers.length,
        professionTrainerConfirmedCount:professionTrainers.filter(source=>source?.evidence==='forever-confirmed').length,
        professionTrainerWithTitleCount:professionTrainers.filter(source=>source?.npcTitle).length,
        classMasterConnected:Boolean(classMaster&&!classMaster.error),
        classAbilityCount:Array.isArray(classMaster?.abilities)?classMaster.abilities.length:0,
        classTrainerCount:Array.isArray(classMaster?.trainers)?classMaster.trainers.length:0
      },
      source:'ForeverDB.net'
    });
  }catch(error){
    if(/Charakter nicht gefunden/.test(String(error.message))){
      return res.status(404).json({error:'Charakter nicht gefunden'});
    }
    console.error('Ortsplaner konnte nicht geladen werden:',error);
    return res.status(503).json({error:'Ortsplaner derzeit nicht verfügbar'});
  }
}
