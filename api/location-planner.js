import {loadCharacters} from '../scripts/character-store.mjs';
import {foreverDbConfigured} from '../scripts/foreverdb-api.mjs';
import {getForeverDbMasterRecipeIndex,cachedForeverDbProfessionMasters,cachedForeverDbVendor} from '../scripts/workshop-store.mjs';
import {workshopProfessionSlugs} from '../scripts/workshop-core.mjs';
import {buildLocationPlanner} from '../scripts/location-planner.mjs';
import {cachedForeverDbClassMaster} from '../scripts/class-training-store.mjs';
import {resolveMediaAsset} from '../scripts/media-resolver.mjs';

function queryUrl(req){
  return new URL(req.url||'/api/location-planner','https://dalton-dashboard.local');
}
function hasFiniteNumber(value){
  return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
}
function npcRenderSource({displayId,renderSourceUrl}={}){
  if(typeof renderSourceUrl==='string'&&/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\//.test(renderSourceUrl))return renderSourceUrl;
  const id=Number(displayId);
  return Number.isInteger(id)&&id>0
    ?'https://render.worldofwarcraft.com/forever-eu/npcs/zoom/creature-display-'+id+'.jpg'
    :null;
}
async function withNpcAvatar(npc,build){
  let candidate={...npc};
  if(!candidate.renderSourceUrl&&candidate.sourceType==='vendor'&&Number.isInteger(Number(candidate.id))){
    try{
      const vendor=await cachedForeverDbVendor(candidate.id,{build});
      if(vendor?.id)candidate={...candidate,displayId:vendor.displayId||candidate.displayId,renderSourceUrl:vendor.renderUrl||candidate.renderSourceUrl};
    }catch{}
  }
  const sourceUrl=npcRenderSource(candidate);
  if(!sourceUrl||!candidate.id)return {...candidate,avatarUrl:null};
  try{
    const avatarUrl=await resolveMediaAsset({
      entityType:'npc',
      entityId:candidate.id,
      role:'portrait',
      sourceUrl
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
    if(!foreverDbConfigured()){
      const base=buildLocationPlanner(stored.data,{recipes:[],professions:[]},{characterSlug:character,location});
      return res.status(200).json({
        ...base,
        catalog:{connected:false,complete:false,build:null,generatedAt:null},
        reason:'ForeverDB ist derzeit nicht verbunden.'
      });
    }
    const recipeIndex=await getForeverDbMasterRecipeIndex({
      seedProfessionSlugs:workshopProfessionSlugs(stored.data)
    });
    const selectedCharacter=character
      ?(stored.data?.characters||[]).find(entry=>entry?.slug===character)
      :null;
    const selectedProfessionSlugs=selectedCharacter
      ?workshopProfessionSlugs({characters:[selectedCharacter]})
      :[];
    const [professionMasters,classMaster]=await Promise.all([
      selectedProfessionSlugs.length
        ?cachedForeverDbProfessionMasters(selectedProfessionSlugs,{build:recipeIndex?.build||null})
        :{},
      selectedCharacter?.classId
        ?cachedForeverDbClassMaster(selectedCharacter.classId,{build:recipeIndex?.build||null})
        :null
    ]);
    let planner=buildLocationPlanner(stored.data,recipeIndex,{
      characterSlug:character,
      location,
      professionMasters,
      classMaster
    });
    if(planner.npcs?.length){
      const npcs=await Promise.all(planner.npcs.map(npc=>withNpcAvatar(npc,recipeIndex?.build||null)));
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
        complete:recipeIndex?.masterComplete===true&&recipeIndex?.complete===true,
        refreshing:recipeIndex?.refreshing===true,
        build:recipeIndex?.build||null,
        generatedAt:recipeIndex?.generatedAt||null,
        recipeCount:Array.isArray(recipeIndex?.recipes)?recipeIndex.recipes.length:0,
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
