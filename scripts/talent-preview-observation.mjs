import {randomUUID} from 'node:crypto';
import {redis} from './character-store.mjs';
import {checkTalentRuleSources} from './pet-rulebook.mjs';
import {loadPetRuleState} from './pet-rule-store.mjs';
import {TALENT_CATALOG_MAX_AGE_MS,TALENT_RULE_MAX_AGE_MS} from './talent-rule-watch.mjs';

const PREVIEW_KEY='dalton-dashboard:talent-rules:preview:v1';
const PRODUCTION_KEY='dalton-dashboard:talent-rules:production:v1';
const recent=(value,now,age)=>Number.isFinite(value?.checkedAtMs)&&value.checkedAtMs<=now&&now-value.checkedAtMs<age;

// User-triggered Preview checks share one attempt window, including failures.
// Production's Pet rule state and refresh schedule are outside this namespace.
async function loadBoundedTalentObservation(KEY,{redisImpl=redis,check=checkTalentRuleSources,clock=Date.now}={}){
  const raw=await redisImpl(['GET',KEY]);
  const previous=raw===null?null:JSON.parse(raw);
  const now=clock();
  if(recent(previous,now,TALENT_CATALOG_MAX_AGE_MS))return previous;
  const token=randomUUID();
  const lock=KEY+':attempt';
  if(await redisImpl(['SET',lock,token,'NX','EX',TALENT_CATALOG_MAX_AGE_MS/1000])!=='OK')return null;
  const observation=await check({now:new Date(now)});
  if(observation.status==='observed'&&previous?.status==='observed'&&
     observation.clientBuild===previous.clientBuild&&observation.hotfixRevision===previous.hotfixRevision&&
     recent(previous,now,TALENT_RULE_MAX_AGE_MS)){
    observation.revisionSince=previous.revisionSince;
  }
  const saveIfCurrent="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]) end";
  const saved=await redisImpl(['EVAL',saveIfCurrent,2,lock,KEY,token,JSON.stringify(observation),TALENT_RULE_MAX_AGE_MS/1000]);
  return saved==='OK'?observation:null;
}

export const loadPreviewTalentObservation=(options)=>loadBoundedTalentObservation(PREVIEW_KEY,options);
// Reuse the production daily rule watcher whenever it has a current observation.
// A missing/expired daily observation (including initial rollout) gets one bounded,
// separately namespaced check. Never overwrite the pet rule state or use preview evidence.
export async function loadProductionTalentObservation({daily=loadPetRuleState,redisImpl=redis,check=checkTalentRuleSources,clock=Date.now}={}){
  const dailyObservation=(await daily())?.talentRuleObservation;
  const now=clock();
  if(recent(dailyObservation,now,TALENT_RULE_MAX_AGE_MS))return dailyObservation;
  return loadBoundedTalentObservation(PRODUCTION_KEY,{redisImpl,check,clock});
}
