import {loadCharacters} from '../scripts/character-store.mjs';
import {foreverDbConfigured} from '../scripts/foreverdb-api.mjs';
import {getForeverDbMasterRecipeIndex,getCachedForeverDbMasterRecipeIndex} from '../scripts/workshop-store.mjs';
import {workshopProfessionSlugs} from '../scripts/workshop-core.mjs';
import {buildLocationPlanner} from '../scripts/location-planner.mjs';
import {cachedForeverDbClassMaster,cachedGermanClassSpells} from '../scripts/class-training-store.mjs';
import {resolveMediaAsset} from '../scripts/media-resolver.mjs';
import {classicNpcDisplayId} from '../scripts/classic-npc-display-ids.mjs';
import {applyLearningSourceEvidence,learningSourceEvidenceForIndex} from '../scripts/learning-source-evidence.mjs';
import {loadAddonSyncStates} from '../scripts/addon-sync-store.mjs';

function queryUrl(req){
  return new URL(req.url||'/api/location-planner','https://dalton-dashboard.local');
}
function hasFiniteNumber(value){
  return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
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
async function withClassActionIcon(action){
  const iconId=Number(action?.iconId);
  if(action?.category!=='class-abilities'||!Number.isInteger(iconId)||iconId<=0)return action;
  try{
    const iconUrl=await resolveMediaAsset({
      entityType:'spell',
      entityId:action.id,
      role:'icon',
      sourceUrl:'https://foreverdb.net/icons/'+iconId+'.webp'
    });
    return {...action,iconUrl:iconUrl||null};
  }catch(error){
    console.warn('Klassenfähigkeits-Icon konnte nicht archiviert werden:',String(error.message).slice(0,120));
    return action;
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
    const recipeIndex=remoteReady
      ?await getForeverDbMasterRecipeIndex({seedProfessionSlugs:workshopProfessionSlugs(stored.data)})
      :await getCachedForeverDbMasterRecipeIndex();
    if(!recipeIndex){
      const base=buildLocationPlanner(stored.data,{recipes:[],professions:[]},{characterSlug:character,location});
      return res.status(200).json({
        ...base,
        catalog:{connected:false,complete:false,build:null,generatedAt:null},
        reason:'ForeverDB ist derzeit nicht verbunden und es liegt kein gecachter Rezept-Master vor.'
      });
    }
    const evaluatedRecipeIndex=applyLearningSourceEvidence(recipeIndex,learningSourceEvidenceForIndex(recipeIndex,await loadAddonSyncStates((stored.data?.characters||[]).map(character=>character.slug).filter(Boolean))));
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
    const classMaster=selectedCharacter?.classId
      ?await cachedForeverDbClassMaster(selectedCharacter.classId,{build:evaluatedRecipeIndex?.build||null})
      :null;
    let planner=buildLocationPlanner(stored.data,evaluatedRecipeIndex,{
      characterSlug:character,
      location,
      professionMasters,
      classMaster
    });
    const classSpellIds=[
      ...(Array.isArray(planner.actions)?planner.actions.filter(action=>action?.category==='class-abilities').map(action=>action.id):[]),
      ...(Array.isArray(planner.selectedCharacter?.knownClassAbilities)?planner.selectedCharacter.knownClassAbilities.map(entry=>entry?.id):[])
    ];
    if(classSpellIds.length){
      const localized=await cachedGermanClassSpells(classSpellIds);
      planner=localizePlannerClassData(planner,localized);
    }
    const classActions=await Promise.all((planner.actions||[]).map(action=>withClassActionIcon(action)));
    const iconByKey=new Map(classActions.map(action=>[action.key,action.iconUrl||null]));
    planner={
      ...planner,
      actions:classActions,
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
