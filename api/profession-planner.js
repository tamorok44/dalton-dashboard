import {loadCharacters} from '../scripts/character-store.mjs';
import {foreverDbConfigured} from '../scripts/foreverdb-api.mjs';
import {getForeverDbMasterRecipeIndex,getCachedForeverDbMasterRecipeIndex} from '../scripts/workshop-store.mjs';
import {workshopProfessionSlugs} from '../scripts/workshop-core.mjs';
import {buildProfessionPlanner} from '../scripts/profession-planner.mjs';
import {applyLearningSourceEvidence,learningSourceEvidenceForIndex} from '../scripts/learning-source-evidence.mjs';
import {loadAddonSyncStates} from '../scripts/addon-sync-store.mjs';

function queryUrl(req){
  return new URL(req.url||'/api/profession-planner','https://dalton-dashboard.local');
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
      const base=buildProfessionPlanner(stored.data,{recipes:[]},{characterSlug:character,location});
      return res.status(200).json({
        ...base,
        catalog:{connected:false,complete:false,build:null,generatedAt:null},
        reason:'ForeverDB ist derzeit nicht verbunden und es liegt kein gecachter Rezept-Master vor.'
      });
    }
    const evaluatedRecipeIndex=applyLearningSourceEvidence(recipeIndex,learningSourceEvidenceForIndex(recipeIndex,await loadAddonSyncStates((stored.data?.characters||[]).map(character=>character.slug).filter(Boolean))));
    const planner=buildProfessionPlanner(stored.data,evaluatedRecipeIndex,{characterSlug:character,location});
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
        learningSourceEvidence:evaluatedRecipeIndex?.learningSourceEvidence||null
      },
      source:'ForeverDB.net'
    });
  }catch(error){
    if(/Charakter nicht gefunden/.test(String(error.message))){
      return res.status(404).json({error:'Charakter nicht gefunden'});
    }
    console.error('Berufsplaner konnte nicht geladen werden:',error);
    return res.status(503).json({error:'Berufsplaner derzeit nicht verfügbar'});
  }
}
