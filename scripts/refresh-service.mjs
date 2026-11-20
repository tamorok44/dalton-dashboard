import {refreshCharacters} from './armory-core.mjs';
import {archiveImages} from './archive-images.mjs';
import {loadCharacters,saveCharacters,mergeProfiles} from './character-store.mjs';
import {appendChangeBatch} from './history-store.mjs';
import {blizzardApiConfigured,fetchForeverSnapshot,fetchForeverRecipeDetails} from './blizzard-api.mjs';
import {collectKnownRecipeRefs,enrichWithForeverDetails} from './forever-details.mjs';

export async function refreshAndPersist({lockToken,source='manual',archiveMedia=true}={}){
  if(!lockToken)throw new Error('Schreibsperre erforderlich');
  const start=Date.now();
  const {data:previous}=await loadCharacters();
  const results=await Promise.all(previous.characters.map(c=>refreshCharacters([c])));
  const success=results.reduce((n,r)=>n+r.success,0);
  if(success===0)return {success:0};
  let latest={
    generatedAt:new Date().toISOString(),
    characters:results.flatMap(r=>r.data.characters).sort((a,b)=>a.name.localeCompare(b.name,'de'))
  };

  if(blizzardApiConfigured()){
    try{
      const slugs=latest.characters.map(c=>c.slug);
      const detailsSnapshot=await fetchForeverSnapshot(slugs,{
        locale:'de_DE',
        endpointNames:['professions','specializations','reputations','quests']
      });
      const recipeRefs=collectKnownRecipeRefs(detailsSnapshot);
      const recipeDetails=Date.now()-start<40000
        ?await fetchForeverRecipeDetails(recipeRefs,{locale:'de_DE'})
        :{};
      latest=enrichWithForeverDetails(latest,detailsSnapshot,recipeDetails);
    }catch(error){
      console.warn('Erweiterte Forever-Daten konnten nicht vollständig geladen werden:',String(error.message).slice(0,180));
    }
  }

  const merged=mergeProfiles(previous,latest);
  await saveCharacters(merged,lockToken);
  let changeLog={count:0,id:null};
  try{
    changeLog=await appendChangeBatch(previous,merged,{source});
  }catch(error){
    console.warn('Änderungschronik konnte nicht geschrieben werden:',String(error.message).slice(0,160));
  }
  let archived=merged;
  if(archiveMedia&&Date.now()-start<35000){
    try{
      archived=await archiveImages(merged,previous);
      if(archived!==merged)await saveCharacters(archived,lockToken);
    }catch(error){
      console.warn('Bildarchiv nicht vollständig:',String(error.message).slice(0,140));
      archived=merged;
    }
  }
  return {success,data:archived,live:true,persisted:true,changes:changeLog.count,changeBatchId:changeLog.id};
}
