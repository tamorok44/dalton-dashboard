import {loadTalentTreeCatalog} from '../scripts/talent-tree-store.mjs';
import {loadLiveKnowledgeVersion} from '../scripts/live-knowledge-store.mjs';
import {enrichKnowledgeMedia} from '../scripts/knowledge-media.mjs';
import {loadCharacters} from '../scripts/character-store.mjs';
import {loadQuestCatalogByIds} from '../scripts/quest-catalog-store.mjs';
import {loadPublicPetRuleState} from '../scripts/pet-rule-store.mjs';
import {loadPublicReputationCatalog} from '../scripts/reputation-catalog-store.mjs';
import {loadGermanPetLocalizations} from '../scripts/pet-localization-store.mjs';
import {buildDataVersion} from '../scripts/data-version.mjs';
import {loadPublicAddonSyncStates} from '../scripts/addon-sync-store.mjs';
import talentPlanner from '../scripts/talent-planner-api.mjs';
export default async function handler(req,res){
  if(req.query?.view==='talent-planner')return talentPlanner(req,res);
  res.setHeader('Cache-Control','public, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  try{
    const result=await loadCharacters();
    // Loaded only when a Talent tab is opened; no tree data in ordinary refreshes.
    if(req.query?.view==='talents'){
      const states=await loadPublicAddonSyncStates((result.data?.characters||[]).map(c=>c.slug).filter(Boolean)).catch(()=>({}));
      const catalog=await loadTalentTreeCatalog(result.data,states);
      return res.status(200).json(catalog);
    }
    const activeQuestIds=[...new Set((result.data?.characters||[]).flatMap(character=>
      (Array.isArray(character.activeQuests)?character.activeQuests:[])
        .map(quest=>Number(quest?.id)).filter(Number.isInteger)
    ))];
    let questCatalog={};
    try{questCatalog=await loadQuestCatalogByIds(activeQuestIds,{locale:'de_DE'})}catch(error){
      console.warn('Quest-Katalog konnte nicht geladen werden:',String(error.message).slice(0,140));
    }
    let petRules=null;
    try{petRules=await loadPublicPetRuleState()}catch(error){
      console.warn('Pet-Regelstatus konnte nicht geladen werden:',String(error.message).slice(0,140));
    }
    let reputationCatalog={build:null,expected:0,records:{}};
    try{reputationCatalog=await loadPublicReputationCatalog()}catch(error){
      console.warn('Ruf-Katalog konnte nicht geladen werden:',String(error.message).slice(0,140));
    }
    const petFamilySlugs=[...new Set((result.data?.characters||[]).flatMap(character=>
      [...(character.hunterPets?.active||[]),...(character.hunterPets?.stable||[])]
        .map(pet=>pet?.family?.slug).filter(Boolean)
    ))];
    let petCatalog={};
    try{petCatalog=await loadGermanPetLocalizations(petFamilySlugs)}catch(error){
      console.warn('Deutsche Pet-Daten konnten nicht geladen werden:',String(error.message).slice(0,140));
    }
    let addonSync={};
    try{addonSync=await loadPublicAddonSyncStates((result.data?.characters||[]).map(character=>character.slug).filter(Boolean))}catch(error){
      console.warn('Addon-Sync-Status konnte nicht geladen werden:',String(error.message).slice(0,140));
    }
    const liveKnowledgeVersion=await loadLiveKnowledgeVersion().catch(()=>null);
    const dataVersion=buildDataVersion({data:result.data,petRules,addonSync,liveKnowledgeVersion});
    const media=await enrichKnowledgeMedia(result.data,petCatalog).catch(()=>({data:result.data,petCatalog}));
    const preview=process.env.VERCEL_ENV==='preview'?{talentPlannerPreview:true}:{};
    return res.status(200).json({...result,...media,questCatalog,petRules,reputationCatalog,addonSync,dataVersion,...preview});
  }catch(e){
    console.error('Datenbank-Lesen fehlgeschlagen:',e);
    return res.status(503).json({error:'Gespeicherte Charakterdaten derzeit nicht erreichbar'});
  }
}
