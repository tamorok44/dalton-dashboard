import {loadCharacters} from './character-store.mjs';
import {loadPublicPetRuleState} from './pet-rule-store.mjs';
import {loadLiveKnowledgeVersion} from './live-knowledge-store.mjs';
import {loadPublicAddonSyncStates} from './addon-sync-store.mjs';

function addonSyncSignature(addonSync={}){
  return Object.entries(addonSync&&typeof addonSync==='object'?addonSync:{})
    .filter(([,state])=>state&&typeof state==='object')
    .map(([slug,state])=>[slug,state.syncId||'',state.receivedAt||''].join(':'))
    .sort()
    .join(',');
}
export function buildDataVersion({data,petRules,liveKnowledgeVersion,addonSync}={}){
  const generatedAt=typeof data?.generatedAt==='string'?data.generatedAt:null;
  const petRulesCheckedAt=typeof petRules?.checkedAt==='string'?petRules.checkedAt:null;
  const rulebookVersion=typeof petRules?.rulebookVersion==='string'?petRules.rulebookVersion:null;
  const petRuleOverall=typeof petRules?.overall==='string'?petRules.overall:null;
  const addonSyncVersion=addonSyncSignature(addonSync);
  return {
    version:['data-v3',generatedAt||'',petRulesCheckedAt||'',rulebookVersion||'',petRuleOverall||'',liveKnowledgeVersion||'',addonSyncVersion].join('|'),
    generatedAt,
    petRulesCheckedAt,
    rulebookVersion,
    petRuleOverall,
    liveKnowledgeVersion:liveKnowledgeVersion||null,
    addonSyncVersion:addonSyncVersion||null
  };
}
export async function loadCurrentDataVersion(){
  const [{data},petRules,liveKnowledgeVersion]=await Promise.all([
    loadCharacters(),
    loadPublicPetRuleState().catch(()=>null),
    loadLiveKnowledgeVersion().catch(()=>null)
  ]);
  const slugs=(data?.characters||[]).map(character=>character.slug).filter(Boolean);
  const addonSync=await loadPublicAddonSyncStates(slugs).catch(()=>({}));
  return buildDataVersion({data,petRules,liveKnowledgeVersion,addonSync});
}
