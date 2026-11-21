import {configured,redis} from './character-store.mjs';
import {PET_RULEBOOK_VERSION,publicPetRuleState,verifyPetRulebook} from './pet-rulebook.mjs';

const KEY='dalton-dashboard:pet-rules:v1';

export async function loadPetRuleState(){
  if(!configured())return null;
  const raw=await redis(['GET',KEY]);
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{return null}
}
export async function savePetRuleState(state){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!state?.checkedAt||!state?.rulebookVersion)throw new Error('Ungültiger Pet-Regelstatus');
  await redis(['SET',KEY,JSON.stringify(state)]);
  return state;
}
export function petRuleStateFresh(state,{now=new Date(),maxAgeMs=20*60*60*1000}={}){
  if(!state||state.rulebookVersion!==PET_RULEBOOK_VERSION)return false;
  const checked=Date.parse(state.checkedAt||'');
  return Number.isFinite(checked)&&now.getTime()-checked>=0&&now.getTime()-checked<maxAgeMs;
}
export async function ensurePetRuleState({fetchImpl=fetch,force=false,now=new Date(),maxAgeMs=20*60*60*1000}={}){
  const previous=await loadPetRuleState();
  if(!force&&petRuleStateFresh(previous,{now,maxAgeMs}))return previous;
  const next=await verifyPetRulebook({fetchImpl,previousState:previous,now});
  await savePetRuleState(next);
  return next;
}
export async function loadPublicPetRuleState(){
  return publicPetRuleState(await loadPetRuleState());
}
