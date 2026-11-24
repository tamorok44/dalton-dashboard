import {loadCharacters} from './character-store.mjs';
import {loadPublicPetRuleState} from './pet-rule-store.mjs';
import {loadLiveKnowledgeVersion} from './live-knowledge-store.mjs';

export function buildDataVersion({data,petRules,liveKnowledgeVersion}={}){
  const generatedAt=typeof data?.generatedAt==='string'?data.generatedAt:null;
  const petRulesCheckedAt=typeof petRules?.checkedAt==='string'?petRules.checkedAt:null;
  const rulebookVersion=typeof petRules?.rulebookVersion==='string'?petRules.rulebookVersion:null;
  const petRuleOverall=typeof petRules?.overall==='string'?petRules.overall:null;
  return {
    version:['data-v2',generatedAt||'',petRulesCheckedAt||'',rulebookVersion||'',petRuleOverall||'',liveKnowledgeVersion||''].join('|'),
    generatedAt,
    petRulesCheckedAt,
    rulebookVersion,
    petRuleOverall,
    liveKnowledgeVersion:liveKnowledgeVersion||null
  };
}
export async function loadCurrentDataVersion(){
  const [{data},petRules,liveKnowledgeVersion]=await Promise.all([
    loadCharacters(),
    loadPublicPetRuleState().catch(()=>null),
    loadLiveKnowledgeVersion().catch(()=>null)
  ]);
  return buildDataVersion({data,petRules,liveKnowledgeVersion});
}
