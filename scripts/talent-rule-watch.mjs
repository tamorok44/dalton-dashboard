import {createHash} from 'node:crypto';

export const TALENT_RULE_MAX_AGE_MS=26*60*60*1000;
export const TALENT_CATALOG_MAX_AGE_MS=6*60*60*1000;
const buildId=/^(?:0|[1-9]\d{0,7})(?:\.(?:0|[1-9]\d{0,7})){3}$/;
export const isTalentClientBuild=value=>typeof value==='string'&&buildId.test(value);
const digestId=/^[a-f0-9]{64}$/;

export function talentCatalogIsFresh(checkedAt,now){
  const age=now-Date.parse(checkedAt);
  return age>=0&&age<TALENT_CATALOG_MAX_AGE_MS;
}

// Fingerprint the official article body, including changes to older entries.
// One shared fetch serves both rule watchers. Navigation and timestamps
// outside the article do not participate in the fingerprint.
export function talentHotfixRevision(text){
  const canonical=text.trim().replace(/\s+/g,' ');
  if(!/^Here you will find a list of hotfixes that address various issues related to World of Warcraft: Forever\./i.test(canonical)||
    !/\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d{2}\b/.test(canonical))return null;
  return createHash('sha256').update(canonical).digest('hex');
}

function laterBuild(candidate,reference){
  const left=candidate.split('.').map(Number);
  const right=reference.split('.').map(Number);
  const index=left.findIndex((part,i)=>part!==right[i]);
  return index!==-1&&left[index]>right[index];
}

export function observeTalentRules(sources,checkedAt){
  const primary=sources.foreverDbBuild;
  const secondary=sources.bindFox;
  const hotfixRevision=sources.blizzardHotfix?.talentHotfixRevision??null;
  const primaryBuild=primary?.status==='verified'&&isTalentClientBuild(primary.build)?primary.build:null;
  const secondaryBuild=secondary?.digest&&isTalentClientBuild(secondary.build)?secondary.build:null;
  const newerSecondary=primaryBuild&&secondaryBuild&&laterBuild(secondaryBuild,primaryBuild);
  const clientBuild=newerSecondary?secondaryBuild:primaryBuild;
  const status=!clientBuild||!digestId.test(hotfixRevision)?'source_unavailable':newerSecondary?'review_required':'observed';
  const observedAt=checkedAt.toISOString();
  return {status,checkedAt:observedAt,checkedAtMs:checkedAt.getTime(),
    revisionSince:status==='observed'?observedAt:null,clientBuild,hotfixRevision};
}

// A current observation is evidence only when it matches the reviewed pack.
// No cached/display fallback or build inferred from a character can qualify.
export function currentTalentRulesMatch(observation,rules,master,now=Date.now()){
  const checkedAt=Date.parse(observation?.checkedAt);
  const revisionSince=Date.parse(observation?.revisionSince);
  const catalogAt=Date.parse(master?.checkedAt);
  const rawAt=Date.parse(master?.sourceFreshAt?.raw);
  const localizedAt=Date.parse(master?.sourceFreshAt?.localized);
  return observation?.status==='observed'&&isTalentClientBuild(observation.clientBuild)&&
    digestId.test(observation.hotfixRevision)&&observation.clientBuild===rules.clientBuild&&
    observation.hotfixRevision===rules.hotfixRevision&&Number.isFinite(now)&&
    revisionSince<=checkedAt&&checkedAt<=now&&now-checkedAt<TALENT_RULE_MAX_AGE_MS&&
    digestId.test(master?.sourceRevision)&&master.sourceRevision===rules.sourceRevision&&
    catalogAt===Math.min(rawAt,localizedAt)&&Math.max(rawAt,localizedAt)<=now&&
    catalogAt>=revisionSince&&talentCatalogIsFresh(master.checkedAt,now);
}
