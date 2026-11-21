import {loadCharacters} from '../scripts/character-store.mjs';
import {loadQuestCatalogByIds} from '../scripts/quest-catalog-store.mjs';
import {loadPublicPetRuleState} from '../scripts/pet-rule-store.mjs';
import {loadPublicReputationCatalog} from '../scripts/reputation-catalog-store.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  try{
    const result=await loadCharacters();
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
    return res.status(200).json({...result,questCatalog,petRules,reputationCatalog});
  }catch(e){
    console.error('Datenbank-Lesen fehlgeschlagen:',e);
    return res.status(503).json({error:'Gespeicherte Charakterdaten derzeit nicht erreichbar'});
  }
}
