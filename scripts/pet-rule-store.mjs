import {configured,redis} from './character-store.mjs';
import {PET_RULEBOOK_VERSION,publicPetRuleState,verifyPetRulebook} from './pet-rulebook.mjs';

const KEY='dalton-dashboard:pet-rules:v1';

function appendHistory(previous,next){
  const history=Array.isArray(previous?.history)?previous.history.slice(-80):[];
  const at=next.checkedAt||new Date().toISOString();
  if(!previous){
    history.push({at,type:'rulebook_initialized',rulebookVersion:next.rulebookVersion,message:'Pet-Regelwerk initialisiert'});
  }else if(previous.rulebookVersion!==next.rulebookVersion){
    history.push({
      at,type:'rulebook_version',
      fromRulebookVersion:previous.rulebookVersion||null,toRulebookVersion:next.rulebookVersion,
      message:'Neue Pet-Regelwerk-Version aktiviert'
    });
  }
  const ids=new Set([...Object.keys(previous?.rules||{}),...Object.keys(next?.rules||{})]);
  for(const id of ids){
    const before=previous?.rules?.[id]||null;
    const after=next?.rules?.[id]||null;
    if(!after)continue;
    const changed=!before||
      before.status!==after.status||
      before.version!==after.version||
      before.evidence!==after.evidence;
    if(!changed)continue;
    history.push({
      at,type:'rule_state',ruleId:id,label:after.label||before?.label||id,
      fromStatus:before?.status||null,toStatus:after.status||null,
      fromVersion:before?.version??null,toVersion:after.version??null,
      fromEvidence:before?.evidence||null,toEvidence:after.evidence||null
    });
  }
  return history.slice(-100);
}

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
  next.history=appendHistory(previous,next);
  await savePetRuleState(next);
  return next;
}
export async function loadPublicPetRuleState(){
  return publicPetRuleState(await loadPetRuleState());
}
