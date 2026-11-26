import {TALENT_RULE_MAX_AGE_MS} from './talent-rule-watch.mjs';
import {VERSION_METADATA_KEY,petVersionMetadata} from './version-metadata.mjs';
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
  const saveIfCurrent=`
    local raw=redis.call('GET',KEYS[1])
    local valid,previous=pcall(cjson.decode,raw or '')
    local next=cjson.decode(ARGV[1])
    if valid and type(previous)=='table' and type(previous.checkedAt)=='string'
       and previous.checkedAt>next.checkedAt then
      return raw
    end
    local prior=valid and type(previous)=='table' and previous.talentRuleObservation or nil
    local observation=ARGV[4]
    if ARGV[3]=='preview' then
      observation=type(prior)=='table' and cjson.encode(prior) or ''
    elseif observation~='' and type(prior)=='table' then
      local current=cjson.decode(observation)
      if type(prior.checkedAtMs)=='number' and type(current.checkedAtMs)=='number' then
        if prior.checkedAtMs>current.checkedAtMs then
          observation=cjson.encode(prior)
        else
          local same=prior.status==current.status and prior.clientBuild==current.clientBuild
            and prior.hotfixRevision==current.hotfixRevision
          if prior.checkedAtMs==current.checkedAtMs and not same then
            current.status='review_required'
            current.revisionSince=cjson.null
          elseif same and current.status=='observed' and type(prior.revisionSince)=='string'
             and current.checkedAtMs-prior.checkedAtMs<tonumber(ARGV[5]) then
            current.revisionSince=prior.revisionSince
          end
          observation=cjson.encode(current)
        end
      end
    end
    local stored=ARGV[1]
    if observation~='' then
      stored=string.sub(stored,1,-2)..',"talentRuleObservation":'..observation..'}'
    end
    redis.call('SET',KEYS[1],stored)
    redis.call('HSET',KEYS[2],'pet',ARGV[2])
    return stored
  `;
  const saved=await redis(['EVAL',saveIfCurrent,2,KEY,VERSION_METADATA_KEY,
    JSON.stringify({...state,talentRuleObservation:undefined}),
    JSON.stringify(petVersionMetadata(publicPetRuleState(state))),process.env.VERCEL_ENV||'',
    state.talentRuleObservation?JSON.stringify(state.talentRuleObservation):'',TALENT_RULE_MAX_AGE_MS]);
  return JSON.parse(saved);
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
  return savePetRuleState(next);
}
export async function loadPublicPetRuleState(){
  return publicPetRuleState(await loadPetRuleState());
}
