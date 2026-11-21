import {loadCharacters} from './character-store.mjs';
import {loadPublicPetRuleState} from './pet-rule-store.mjs';

export function buildDataVersion({data,petRules}={}){
  const generatedAt=typeof data?.generatedAt==='string'?data.generatedAt:null;
  const petRulesCheckedAt=typeof petRules?.checkedAt==='string'?petRules.checkedAt:null;
  const rulebookVersion=typeof petRules?.rulebookVersion==='string'?petRules.rulebookVersion:null;
  const petRuleOverall=typeof petRules?.overall==='string'?petRules.overall:null;
  return {
    version:['data-v1',generatedAt||'',petRulesCheckedAt||'',rulebookVersion||'',petRuleOverall||''].join('|'),
    generatedAt,
    petRulesCheckedAt,
    rulebookVersion,
    petRuleOverall
  };
}
export async function loadCurrentDataVersion(){
  const [{data},petRules]=await Promise.all([
    loadCharacters(),
    loadPublicPetRuleState().catch(()=>null)
  ]);
  return buildDataVersion({data,petRules});
}
