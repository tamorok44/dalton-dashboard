import {createHash} from 'node:crypto';

const MAX_AGE_MS=26*60*60*1000;
const buildId=/^1\.60\.1\.\d+$/;
const digestId=/^[a-f0-9]{64}$/;

// Fingerprint the official article body, including changes to older entries.
// One shared fetch serves both rule watchers. Navigation and timestamps
// outside the article do not participate in the fingerprint.
export function talentHotfixRevision(text){
  const canonical=text.trim().replace(/\s+/g,' ');
  if(!/^Here you will find a list of hotfixes that address various issues related to World of Warcraft: Forever\./i.test(canonical)||
    !/\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d{2}\b/.test(canonical))return null;
  return createHash('sha256').update(canonical).digest('hex');
}

export function observeTalentRules(sources,checkedAt){
  const primary=sources.foreverDbBuild;
  const secondary=sources.bindFox;
  const hotfixRevision=sources.blizzardHotfix?.talentHotfixRevision??null;
  const primaryBuild=primary?.status==='verified'&&buildId.test(primary.build)?primary.build:null;
  const secondaryBuild=secondary?.digest&&buildId.test(secondary.build)?secondary.build:null;
  const newerSecondary=primaryBuild&&secondaryBuild&&Number(secondaryBuild.split('.').at(-1))>Number(primaryBuild.split('.').at(-1));
  const clientBuild=newerSecondary?secondaryBuild:primaryBuild;
  const status=!clientBuild||!digestId.test(hotfixRevision)?'source_unavailable':newerSecondary?'review_required':'observed';
  return {status,checkedAt:checkedAt.toISOString(),clientBuild,hotfixRevision};
}

// A current observation is evidence only when it matches the reviewed pack.
// No cached/display fallback or build inferred from a character can qualify.
export function currentTalentRulesMatch(observation,rules,master,now=Date.now()){
  const checkedAt=Date.parse(observation?.checkedAt);
  const catalogAt=Date.parse(master?.checkedAt);
  return observation?.status==='observed'&&buildId.test(observation.clientBuild)&&
    digestId.test(observation.hotfixRevision)&&observation.clientBuild===rules.clientBuild&&
    observation.hotfixRevision===rules.hotfixRevision&&Number.isFinite(now)&&
    checkedAt<=now&&now-checkedAt<MAX_AGE_MS&&
    catalogAt>=checkedAt&&catalogAt<=now;
}
