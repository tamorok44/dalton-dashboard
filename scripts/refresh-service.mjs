import {refreshCharacters} from './armory-core.mjs';
import {archiveImages} from './archive-images.mjs';
import {loadCharacters,saveCharacters,mergeProfiles} from './character-store.mjs';
import {appendChangeBatch} from './history-store.mjs';
import {blizzardApiConfigured,fetchForeverSnapshot,fetchForeverRecipeDetails,fetchForeverLocalizedNames,fetchForeverQuestDetails} from './blizzard-api.mjs';
import {collectKnownRecipeRefs,collectLocalizedRefs,enrichWithForeverDetails} from './forever-details.mjs';
import {loadQuestCatalog,loadQuestCatalogByIds,saveQuestCatalog} from './quest-catalog-store.mjs';
import {collectCatalogRecords,saveCatalogRecords} from './game-catalog-store.mjs';
import {ensureReputationCatalog,loadPublicReputationCatalog} from './reputation-catalog-store.mjs';

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
        endpointNames:['professions','specializations','reputations','quests','completedQuests']
      });
      const recipeRefs=collectKnownRecipeRefs(detailsSnapshot);
      const localizedRefs=collectLocalizedRefs(detailsSnapshot);
      const staticRef=[
        ...recipeRefs,
        ...localizedRefs
      ].find(ref=>typeof ref?.href==='string'&&ref.href.includes('namespace=static-'));
      const factionNamespace=staticRef?.href?new URL(staticRef.href).searchParams.get('namespace'):null;
      const reputationCatalogPromise=ensureReputationCatalog({
        namespace:factionNamespace||undefined,
        force:false,
        archiveMedia
      });
      const questRefs=localizedRefs.filter(ref=>ref.type==='quest');
      const otherLocalizedRefs=localizedRefs.filter(ref=>ref.type!=='quest');
      let questCatalog=await loadQuestCatalog(questRefs,{locale:'de_DE'});
      const missingQuestRefs=questRefs.filter(ref=>!questCatalog[Number(ref.id)]);
      const [recipeDetails,otherLocalizedNames,newQuestDetails]=Date.now()-start<40000
        ?await Promise.all([
          fetchForeverRecipeDetails(recipeRefs,{locale:'de_DE'}),
          fetchForeverLocalizedNames(otherLocalizedRefs,{locale:'de_DE'}),
          fetchForeverQuestDetails(missingQuestRefs,{locale:'de_DE'})
        ])
        :[{},{},{}];
      const newQuestRecords=Object.values(newQuestDetails);
      if(newQuestRecords.length){
        try{await saveQuestCatalog(newQuestRecords)}catch(error){
          console.warn('Quest-Katalog konnte nicht vollständig gespeichert werden:',String(error.message).slice(0,160));
        }
        questCatalog={...questCatalog,...newQuestDetails};
      }
      const questLocalizedNames=Object.fromEntries(Object.values(questCatalog)
        .filter(detail=>detail?.title&&Number.isInteger(Number(detail?.id)))
        .map(detail=>['quest:'+Number(detail.id),detail.title]));
      const localizedNames={...otherLocalizedNames,...questLocalizedNames};
      latest=enrichWithForeverDetails(latest,detailsSnapshot,recipeDetails,localizedNames);
      await reputationCatalogPromise;
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
  try{
    const catalogRecords=collectCatalogRecords(archived);
    await saveCatalogRecords(catalogRecords,{source:'character-refresh'});
  }catch(error){
    console.warn('Spielobjekt-Katalog konnte nicht vollständig aktualisiert werden:',String(error.message).slice(0,160));
  }

  const activeQuestIds=[...new Set(archived.characters.flatMap(character=>
    (Array.isArray(character.activeQuests)?character.activeQuests:[]).map(quest=>Number(quest?.id)).filter(Number.isInteger)
  ))];
  let questCatalog={};
  try{questCatalog=await loadQuestCatalogByIds(activeQuestIds,{locale:'de_DE'})}catch(error){
    console.warn('Quest-Katalog konnte für die Antwort nicht geladen werden:',String(error.message).slice(0,140));
  }
  let reputationCatalog={build:null,expected:0,records:{}};
  try{reputationCatalog=await loadPublicReputationCatalog()}catch(error){
    console.warn('Ruf-Katalog konnte für die Antwort nicht geladen werden:',String(error.message).slice(0,140));
  }
  return {success,data:archived,questCatalog,reputationCatalog,live:true,persisted:true,changes:changeLog.count,changeBatchId:changeLog.id};
}
