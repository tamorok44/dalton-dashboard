import {loadCharacters} from './character-store.mjs';
import {loadTalentMaster,loadTalentPlannerClass} from './talent-tree-store.mjs';
import {profileKey,resolveApprovedTalentPlan,selectTalentRulePack} from './talent-plan-core.mjs';
import {loadPreviewTalentObservation} from './talent-preview-observation.mjs';
import {TALENT_CATALOG_MAX_AGE_MS,TALENT_RULE_MAX_AGE_MS,describeTalentRuleReview} from './talent-rule-watch.mjs';
import catalog from '../data/talent-planning/release-catalog.json' with {type:'json'};
import {talentPlanLibrary} from './talent-plan-index.mjs';
import coverage from '../data/talent-planning/coverage-2026-11-25.json' with {type:'json'};

export const PERSONAL_TALENT_MAX_AGE_MS=26*60*60*1000;
export function isPersonalTalentFresh(character,now){
  const age=now-Date.parse(character?.scrapedAt);
  return character?.scrapeOk!==false&&age>=0&&age<PERSONAL_TALENT_MAX_AGE_MS;
}

const validId=value=>typeof value==='string'&&/^[a-z0-9-]{1,80}$/.test(value);
const params=['character','tree','goal','role','playStyle','priority','rank','rankSource','planId','version','identity'];
const preview=()=>process.env.VERCEL_ENV==='preview';

function characterIdentity(character){
  // Forever's Armory addresses characters by region. Include the realm if the
  // roster supplies one, along with Blizzard's stable identifier.
  const region=character.url?.match(/^https:\/\/foreverspec\.com\/[^/]+\/armory\/([a-z]{2})\//)?.[1];
  const realm=character.realm?.slug||character.realm?.id||'';
  if(!region||!Number.isSafeInteger(character.blizzardCharacterId)||character.blizzardCharacterId<1)return null;
  return JSON.stringify([region,realm,character.blizzardCharacterId]);
}

export function createTalentPlannerHandler({
  enabled=preview,roster=loadCharacters,observe=loadPreviewTalentObservation,master=loadTalentMaster,
  project=loadTalentPlannerClass,clock=Date.now,library=talentPlanLibrary
}={}){
  return async function handler(req,res){
    const send=(status,body)=>res.status(status).json(body);
    const blocked=(status,code,evidence)=>send(status,{ok:false,code,evidence});
    res.setHeader('Cache-Control','private, no-store');
    if(!enabled())return blocked(404,'preview_unavailable');
    if(req.method!=='GET'){
      res.setHeader('Allow','GET');
      return blocked(405,'method_not_allowed');
    }
    const query=req.query||{};
    if(params.some(key=>query[key]!==undefined&&typeof query[key]!=='string')||!validId(query.character)){
      return blocked(400,'invalid_profile');
    }
    try{
      const result=await roster();
      if(result.fallback)return blocked(503,'roster_unavailable');
      const matches=result.data.characters.filter(c=>c.slug===query.character);
      if(matches.length!==1)return blocked(404,'unknown_character');
      const character=matches[0];
      const classPlans=library.filter(plan=>plan.status==='approved'&&plan.classId===character.classId);
      const activePlans=classPlans.filter(plan=>plan.active!==false);
      const candidateIdentity=characterIdentity(character);
      const identity=candidateIdentity&&result.data.characters.filter(c=>characterIdentity(c)===candidateIdentity).length===1?candidateIdentity:null;
      if(!query.tree){
        const profiles=activePlans.flatMap(plan=>plan.profiles.map(profile=>({
          ...profile,name:plan.treeName,planId:plan.id,version:plan.version,recommendation:plan.review.rationale,
          summary:plan.review.adviceSummary??plan.review.rationale,supportedLegacyRanks:plan.supportedLegacyRanks
        })));
        // Names only from reviewed German catalog metadata; no provider
        // access and no fabricated names for trees still missing a label.
        const names=new Map((coverage.classes[character.classId]??[])
          .filter(tree=>typeof tree.treeName==='string'&&tree.treeName.trim())
          .map(tree=>[tree.treeId,tree.treeName]));
        for(const plan of classPlans)names.set(plan.treeId,plan.treeName);
        const specializations=[...names].map(([treeId,name])=>({treeId,name}));
        const specializationAdvice=(catalog.specializationAdvice??[]).filter(entry=>entry.preferred.classId===character.classId&&
          entry.options.every(option=>profiles.some(p=>p.planId===option.planId&&p.version===option.version&&profileKey(p)===profileKey(option))));
        return send(200,{ok:true,profiles,identity,specializations,specializationAdvice});
      }
      const profile={classId:character.classId,treeId:Number(query.tree),goal:query.goal,
        role:query.role,playStyle:query.playStyle,priority:query.priority};
      const key=profileKey(profile);
      if(!key||!/^\d{1,10}$/.test(query.tree))return blocked(400,'invalid_profile');
      const bound=query.planId!==undefined||query.version!==undefined||query.identity!==undefined;
      const candidates=(bound?classPlans:activePlans).filter(plan=>plan.profiles.some(p=>profileKey(p)===key)&&
        (!bound||(plan.id===query.planId&&String(plan.version)===query.version)));
      if(bound&&(!identity||query.identity!==identity||candidates.length!==1)){
        return blocked(409,'binding_unavailable');
      }
      if(candidates.length!==1)return blocked(409,'no_approved_recommendation');
      if(!/^[0-5]$/.test(query.rank??'')||query.rankSource!=='player_confirmed'){
        return blocked(400,'unverified_legacy_rank');
      }
      const rank=Number(query.rank);
      if(!candidates[0].supportedLegacyRanks.includes(rank))return blocked(409,'unsupported_legacy_rank');
      const ruleObservation=await observe();
      const observation={status:ruleObservation?.status??null,build:ruleObservation?.clientBuild??null,
        hotfixRevision:ruleObservation?.hotfixRevision??null,rulesCheckedAt:ruleObservation?.checkedAt??null};
      if(ruleObservation?.status!=='observed')return blocked(503,'unverified_current_rules',observation);
      const liveMaster=await master();
      const evidence={...observation,catalogRevision:liveMaster.classMechanicsRevisions?.[profile.classId]??null,
        sourceRevision:liveMaster.sourceRevision??null,catalogCheckedAt:liveMaster.checkedAt??null};
      const applicable=catalog.rulePacks.filter(r=>r.revision===candidates[0].ruleRevision&&r.classId===profile.classId&&r.legacyTalentedRank===rank);
      const now=clock();
      if(applicable.length===1){
        const matched=selectTalentRulePack(candidates[0],applicable[0],liveMaster,ruleObservation,catalog.revalidations,now);
        evidence.review=describeTalentRuleReview(ruleObservation,matched??applicable[0],liveMaster,now);
        evidence.review.revalidated=Boolean(matched&&matched!==applicable[0]);
      }
      const plan=resolveApprovedTalentPlan(profile,candidates,liveMaster,catalog.rulePacks,{ruleObservation,legacyTalentedRank:rank,now,revalidations:catalog.revalidations});
      if(!plan.ok)return blocked(409,plan.code,evidence);
      const klass=await project(liveMaster.classes[profile.classId]);
      const expires=Math.min(Date.parse(evidence.catalogCheckedAt)+TALENT_CATALOG_MAX_AGE_MS,
        Date.parse(evidence.rulesCheckedAt)+TALENT_RULE_MAX_AGE_MS);
      evidence.validUntil=new Date(expires).toISOString();
      const details=character.talentDetails;
      const personalFresh=isPersonalTalentFresh(character,clock());
      const detailsComplete=personalFresh&&character.talentDetailsVerified===true&&
        Array.isArray(details)&&details.length===klass.trees.length&&
        details.every(tree=>Array.isArray(tree?.talents));
      return send(200,{...plan,profile,identity,klass,evidence,recommendation:candidates[0].review.rationale,legacyRank:{rank,source:'player_confirmed'},
        character:{level:character.level,scrapedAt:character.scrapedAt??null,
          talentDetailsFresh:personalFresh,personalValidUntil:personalFresh?new Date(Date.parse(character.scrapedAt)+PERSONAL_TALENT_MAX_AGE_MS).toISOString():null,
          talentDetailsVerified:detailsComplete,
          talentDetails:detailsComplete?details.map(tree=>({name:tree.name,spentPoints:tree.spentPoints,
            talents:tree.talents.map(entry=>({id:entry?.id,rank:entry?.rank,spellId:entry?.spellId}))})):null}});
    }catch{
      return blocked(503,'source_unavailable');
    }
  };
}

export default createTalentPlannerHandler();
