import assert from 'node:assert/strict';
import {PET_DB2_BASELINE} from './pet-db2-baseline.mjs';
import {petDb2Url} from './pet-db2-audit.mjs';
import {PET_RULEBOOK_VERSION,verifyPetRulebook,publicPetRuleState} from './pet-rulebook.mjs';

const pages={
  'worldofwarcraft.blizzard.com/en-us/news/24315281':`
    <section class="blog"><p>Here you will find a list of hotfixes that address various issues related to World of Warcraft: Forever.</p><p>November 22, 2026</p><li>Hunter Pets erroneously had 150% of their normal health. This is now corrected to 115% of their normal health.</li></section>`,
  'us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes':`
    <main>Pets now correctly benefit from Expertise.
    Fixed an issue where pets were only ever inheriting the player's Melee Critical Strike chance instead of whichever is higher, melee or ranged.</main>`,
  '4evrbugs.com/bug/556':`
    <main>White swings get none of the crit inherited from the hunter.
    Claw and Bite crit at about the Hunter's crit chance.</main>`,
  'foreverdb.net/changelog':`
    <main>
<h1>Build changelog</h1>
<p>What each WoW Forever client build added, removed or changed.</p>
<ul>
<li>Build 1.60.1.71091 (2026-11-22): 9 spells (9 changed); 80 items (3 added, 77 changed); 1 armor set (1 changed).</li>
<li>Build 1.60.1.70959 (2026-11-18): 1 class ability (1 changed); 2 talents (2 changed).</li>
</ul>
<p>Data from the WoW Forever client, build 1.60.1.71091, extracted 2026-11-22.</p>
</main>`,
  'wowhead.com/forever/guide/classes/hunter/survival/overview-pve-dps':`
    <main>Stamina: Every 1 player Stamina gives the pet 2 Health.
    Armor: Pet gains 30% of the player's Armor.
    Attack Power: Pet gains 10% of the player's highest Attack Power source.
    Critical Strike: Pet gains 100% of the player's Crit chance.</main>`,
  'bindonforever.com/pets/fox':`
    <main>Hunter pets › Fox. build 1.60.1.70959.
    Fox is the one new family in WoW Forever (client family 319).
    Trickster's Dance gives +50% dodge and 30% faster attacks for 12 s. Pet level 20.
    Bite Rank 1 1 Rank 2 8 Rank 3 16 Rank 4 24 Rank 5 32 Rank 6 40 Rank 7 48 Rank 8 56.
    Dash Rank 1 30 Rank 2 40 Rank 3 50.
    Fox pets eat meat.</main>`,
  '60.tools/guides/hunter-pets':`
    <main>Family Damage Armor Health Diet Its own abilities
    Fox 0% +5% 0% Meat Trickster's Dance.</main>`,
  'github-wiki-see.page/m/classic-hunter/forever-hunter/wiki/Forever-Hunter-Patch-Notes':`
    <main>Pet Scaling and Stats
    Stamina: 1 player Stamina → 2 pet Health
    Armor: Pet gains 30% of player Armor
    Attack Power: Pet gains 10% of the player's highest Attack Power source
    Critical Strike: Pet inherits 100% of the higher of the Hunter's melee or ranged Crit chance
    Pet Focus
    Maximum Focus increased from 100 to 150
    Focus regeneration is now continuous at 10 Focus per second, filling the full 150 Focus pool in 15 sec.</main>`,
  'raw.githubusercontent.com/gunba/wow-forever-sim/forever/docs/check_dispositions.md':`
    The client PowerType row for Focus in build 69977 supplies a concrete 10 Focus/second in combat,
    and Hunter scaling 415429 adds 50 maximum Focus to the base 100.`,
  'statrat.info/classes/hunter/levelling/':`
    Fox Damage (physical) ×1.00 Health ×1.00 Base armour ×1.05.
    Family passives · Forever client 70374. Physical damage and base armour.`,
  'efficient.games/wowf/hunter-pets':`
    WoW Forever 1.60.1 (build 70959).
    Bite Rank 1 1 1 Charged 1 in play Bite Rank 2 8 4 Charged 4 in play.
    Trickster's Dance Rank 1 20 10.
    Dash Rank 1 30 15 for Boar, Cat, Fox, Hyena, Tallstrider, Wolf.`,
  'mobalytics.gg/wow-forever/classes/hunter-leveling-1-60-vareion':`
    Pets now scale with your player character:
    100% of your Crit strike
    10% of your highest Attack Power source
    30% of your Armor
    1 Hunter Stamina = 2 Pet Health.`
};
function fetchFrom(currentPages,failPart=null,alterDb2=null){
  return async url=>{
    const text=String(url);
    if(failPart&&text.includes(failPart))throw new Error('source offline');
    if(text.startsWith('https://wago.tools/db2/')){
      const build=new URL(text).searchParams.get('build');
      const match=Object.entries(PET_DB2_BASELINE).find(([,spec])=>petDb2Url(spec,build)===text);
      if(!match)return {ok:false,status:404,text:async()=>''};
      const [key,spec]=match;
      const content=[spec.header,...spec.rows].join('\n');
      return {ok:true,status:200,text:async()=>alterDb2?alterDb2(key,content):content};
    }
    const key=Object.keys(currentPages).find(part=>text.includes(part));
    if(!key)return {ok:false,status:404,text:async()=>''};
    return {ok:true,status:200,text:async()=>currentPages[key]};
  };
}
const now=new Date('2026-11-22T04:07:00.000Z');
let hotfixRequests=0;
const first=await verifyPetRulebook({now,fetchImpl:async url=>{
  if(String(url).includes('24315281'))hotfixRequests++;
  return fetchFrom(pages)(url);
}});
assert.equal(hotfixRequests,1);
assert.equal(first.talentRuleObservation.status,'observed',JSON.stringify({
  observation:first.talentRuleObservation,
  primary:first.sources.foreverDbBuild,
  official:first.sources.blizzardHotfix,
  secondary:first.sources.bindFox
}));
assert.equal(first.talentRuleObservation.clientBuild,'1.60.1.71091');
assert.match(first.talentRuleObservation.hotfixRevision,/^[a-f0-9]{64}$/);
assert.equal(publicPetRuleState(first).talentRuleObservation,undefined);
const hotfixPage='worldofwarcraft.blizzard.com/en-us/news/24315281';
const mageEdit={...pages,[hotfixPage]:'<nav>Changed navigation</nav>'+pages[hotfixPage].replace('</section>','<li>Mage: Ice Barrier changed.</li></section>')};
const talentChange=await verifyPetRulebook({fetchImpl:fetchFrom(mageEdit),previousState:first,now});
assert.equal(talentChange.overall,'verified');
assert.notEqual(talentChange.talentRuleObservation.hotfixRevision,first.talentRuleObservation.hotfixRevision);
const outsideEdit={...pages,[hotfixPage]:pages[hotfixPage]+'<nav>Changed navigation</nav>'};
const sameContent=await verifyPetRulebook({fetchImpl:fetchFrom(outsideEdit),previousState:first,now});
assert.equal(sameContent.talentRuleObservation.hotfixRevision,first.talentRuleObservation.hotfixRevision);
const legacyArticle={...pages,[hotfixPage]:pages[hotfixPage]
  .replace('<section class="blog">','<article><div id="blog"><div class="Blog margin-bottom-medium"><div class="detail">&#160;')
  .replace('</section>','</div></div></div><div class="space-medium"></div></article>')};
const sameLegacy=await verifyPetRulebook({fetchImpl:fetchFrom(legacyArticle),previousState:first,now});
assert.equal(sameLegacy.talentRuleObservation.hotfixRevision,first.talentRuleObservation.hotfixRevision);
const unavailableHotfix=await verifyPetRulebook({fetchImpl:fetchFrom(pages,'24315281'),previousState:first,now});
assert.equal(unavailableHotfix.talentRuleObservation.status,'source_unavailable');
assert.equal(unavailableHotfix.talentRuleObservation.hotfixRevision,null);
const higherBind={...pages,'bindonforever.com/pets/fox':pages['bindonforever.com/pets/fox'].replace('1.60.1.70959','1.60.1.99999')};
const mismatched=await verifyPetRulebook({fetchImpl:fetchFrom(higherBind),previousState:first,now});
assert.equal(mismatched.talentRuleObservation.status,'review_required');
assert.equal(mismatched.talentRuleObservation.clientBuild,'1.60.1.99999');
const futurePages={...pages,'foreverdb.net/changelog':pages['foreverdb.net/changelog'].replaceAll('1.60.1.71091','2.1.0.17')};
let futureDb2Calls=0;
const futureState=await verifyPetRulebook({fetchImpl:async url=>{
  if(String(url).startsWith('https://wago.tools/db2/'))futureDb2Calls++;
  return fetchFrom(futurePages)(url);
},now});
assert.equal(futureState.talentRuleObservation.clientBuild,'2.1.0.17');
assert.equal(futureState.talentRuleObservation.status,'observed');
assert.equal(futureDb2Calls,0);
const newerBranch={...pages,'bindonforever.com/pets/fox':pages['bindonforever.com/pets/fox'].replace('1.60.1.70959','1.61.0.12')};
const branchState=await verifyPetRulebook({fetchImpl:fetchFrom(newerBranch),now});
assert.equal(branchState.talentRuleObservation.clientBuild,'1.61.0.12');
assert.equal(branchState.talentRuleObservation.status,'review_required');
const unknown=await verifyPetRulebook({fetchImpl:fetchFrom(pages,'foreverdb.net/changelog'),now});
assert.equal(unknown.talentRuleObservation.status,'source_unavailable');
assert.equal(unknown.talentRuleObservation.revisionSince,null);


assert.equal(first.rulebookVersion,PET_RULEBOOK_VERSION);
assert.equal(first.overall,'verified');
assert.equal(Object.keys(first.rules).length,8);
assert.ok(Object.values(first.rules).every(rule=>rule.status==='verified'));
assert.ok(Object.values(first.sources).every(source=>source.status==='verified'));
assert.equal(first.sources.bindFox.build,'1.60.1.70959');
assert.equal(first.sources.efficientPets.build,'70959');
assert.equal(first.sources.foreverDbBuild.build,'1.60.1.71091');
assert.equal(first.rules['pet.scaling'].evidence,'reference_model');
assert.equal(first.rules['pet.scaling'].evidenceLabel,'Referenzmodell');
assert.equal(first.rules['pet.crit.inheritance'].evidence,'official');
assert.equal(first.rules['pet.expertise'].evidence,'official');
assert.equal(first.rules['pet.autoswing.crit'].evidence,'measured');
assert.equal(first.rules['pet.focus'].evidence,'client');
assert.equal(first.rules['pet.health.global'].evidence,'official');
assert.equal(first.rules['fox.family.profile'].evidence,'client');

const same=await verifyPetRulebook({fetchImpl:fetchFrom(pages),previousState:first,now:new Date('2026-11-22T05:07:00.000Z')});
assert.equal(same.overall,'verified','Unchanged rule evidence stays verified');
assert.equal(same.sources.blizzardHotfix.baselineDigest,first.sources.blizzardHotfix.baselineDigest);

const changedHotfix={...pages,
  'worldofwarcraft.blizzard.com/en-us/news/24315281':pages['worldofwarcraft.blizzard.com/en-us/news/24315281']+
    '<li>Hunter pets now gain a different amount of Armor from their owner.</li>'
};
const changed=await verifyPetRulebook({fetchImpl:fetchFrom(changedHotfix),previousState:first,now:new Date('2026-11-22T06:07:00.000Z')});
assert.equal(changed.sources.blizzardHotfix.status,'review_required','New pet hotfix evidence freezes the old baseline');
assert.equal(changed.overall,'review_required');
for(const id of ['fox.family.profile','fox.training','pet.scaling','pet.crit.inheritance','pet.expertise','pet.focus','pet.health.global']){
  assert.equal(changed.rules[id].status,'review_required',id+' is blocked by a changed official pet hotfix baseline');
}
assert.equal(changed.rules['pet.autoswing.crit'].status,'verified','Independent controlled measurement remains available');

const historicalBuildOnly={...pages,
  'foreverdb.net/changelog':pages['foreverdb.net/changelog'].replace('1.60.1.70959','1.60.1.70958')
};
const historicalState=await verifyPetRulebook({fetchImpl:fetchFrom(historicalBuildOnly),previousState:first,now:new Date('2026-11-22T06:37:00.000Z')});
assert.equal(historicalState.sources.foreverDbBuild.status,'verified','Historical changelog rows do not masquerade as a current-build change');
assert.equal(historicalState.sources.foreverDbBuild.build,'1.60.1.71091');

const changedBuild={...pages,
  'foreverdb.net/changelog':pages['foreverdb.net/changelog'].replaceAll('1.60.1.71091','1.60.1.71092')
};
const buildState=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild),previousState:first,now:new Date('2026-11-22T07:07:00.000Z')});
assert.equal(buildState.sources.foreverDbBuild.status,'verified','Build discovery does not constitute a mechanics change');
for(const id of ['fox.family.profile','fox.training','pet.scaling','pet.focus']){
  assert.equal(buildState.rules[id].status,'verified',id+' remains verified if all reviewed DB2 fields are identical');
}
assert.equal(buildState.rules['pet.health.global'].status,'verified','Official health hotfix remains valid across a pure client-build change');
assert.equal(buildState.rules['pet.crit.inheritance'].status,'verified','Official crit source rule is not downgraded by the build gate alone');
assert.equal(buildState.rules['pet.expertise'].status,'verified','Official expertise mechanism is not downgraded by the build gate alone');

const unavailable=await verifyPetRulebook({fetchImpl:fetchFrom(pages,'wowhead.com'),previousState:first,now:new Date('2026-11-22T08:07:00.000Z')});
assert.equal(unavailable.sources.wowheadScaling.status,'source_unavailable');
assert.equal(unavailable.rules['pet.scaling'].status,'source_unavailable');
assert.equal(unavailable.rules['pet.focus'].status,'verified','Focus remains available because it has independent sources');
assert.equal(unavailable.rules['fox.family.profile'].status,'verified','Independent verified rules stay available');
assert.equal(unavailable.rules['pet.crit.inheritance'].status,'verified','Official crit-source rule does not depend on Wowhead');

const focusUnavailable=await verifyPetRulebook({
  fetchImpl:fetchFrom(pages,'raw.githubusercontent.com'),
  previousState:first,
  now:new Date('2026-11-22T09:07:00.000Z')
});
assert.equal(focusUnavailable.sources.foreverSimFocusAudit.status,'source_unavailable');
assert.equal(focusUnavailable.rules['pet.focus'].status,'source_unavailable','Focus fails closed when a required audit source is unavailable');
assert.equal(focusUnavailable.rules['pet.scaling'].status,'verified','Scaling remains independently verified');

const measurementUnavailable=await verifyPetRulebook({
  fetchImpl:fetchFrom(pages,'4evrbugs.com'),
  previousState:first,
  now:new Date('2026-11-22T10:07:00.000Z')
});
assert.equal(measurementUnavailable.rules['pet.autoswing.crit'].status,'source_unavailable');
assert.equal(measurementUnavailable.rules['pet.crit.inheritance'].status,'verified','Official crit inheritance source remains independent from the measured white-swing discrepancy');

const client=publicPetRuleState(first);
assert.equal(client.overall,'verified');
assert.ok(!('digest' in client.sources.blizzardHotfix),'Internal fingerprints are never exposed to the browser');
assert.equal(client.rules['pet.scaling'].evidenceLabel,'Referenzmodell');
assert.equal(client.rules['pet.crit.inheritance'].evidenceLabel,'Offiziell');
assert.equal(client.rules['pet.autoswing.crit'].evidenceLabel,'Gemessen');
assert.equal(client.rules['pet.expertise'].evidenceLabel,'Offiziell');
assert.equal(client.rules['pet.focus'].evidenceLabel,'Clientdaten');
assert.equal(client.rules['pet.health.global'].evidenceLabel,'Offiziell');
console.log('Pet-Regelwerk: Skalierung, Crit-Quelle, Autoattack-Crit, Expertise, Fokus, Buildwechsel und Fail-closed-Verhalten: OK');

/* Migration aus dem produktiven Regelwerk: nur die belegte Bind-Buildnummer,
   niemals ein geänderter Aussageinhalt oder ein anderer Quellen-Digest. */
const legacy=JSON.parse(JSON.stringify(first));
legacy.rulebookVersion='2026.11.22.2';
for(const source of Object.values(legacy.sources))delete source.baselineBuild;
const foxBuildPages={...pages,
  'bindonforever.com/pets/fox':pages['bindonforever.com/pets/fox'].replace('1.60.1.70959','1.60.1.71091')
};
const migrated=await verifyPetRulebook({fetchImpl:fetchFrom(foxBuildPages),previousState:legacy,now});
assert.equal(migrated.sources.bindFox.status,'verified');
assert.equal(migrated.sources.bindFox.baselineBuild,'1.60.1.71091');
assert.notEqual(migrated.sources.bindFox.baselineDigest,legacy.sources.bindFox.baselineDigest);
assert.equal(migrated.sources.blizzardHotfix.baselineDigest,legacy.sources.blizzardHotfix.baselineDigest);
const nextFoxBuild={...foxBuildPages,'bindonforever.com/pets/fox':foxBuildPages['bindonforever.com/pets/fox'].replace('71091','71092')};
const future=await verifyPetRulebook({fetchImpl:fetchFrom(nextFoxBuild),previousState:migrated,now});
assert.equal(future.sources.bindFox.status,'verified');
assert.equal(future.sources.bindFox.reason,null);
assert.equal(future.sources.bindFox.baselineBuild,'1.60.1.71092');
assert.equal(future.sources.db2Focus.build,'1.60.1.71092');
const foxSemanticChange={...foxBuildPages,'bindonforever.com/pets/fox':foxBuildPages['bindonforever.com/pets/fox'].replace('50% dodge','60% dodge')};
const badFox=await verifyPetRulebook({fetchImpl:fetchFrom(foxSemanticChange),previousState:legacy,now});
assert.equal(badFox.sources.bindFox.status,'review_required');
assert.equal(badFox.sources.bindFox.baselineDigest,legacy.sources.bindFox.baselineDigest);
const otherChanged=await verifyPetRulebook({fetchImpl:fetchFrom({...changedHotfix,...{ 'bindonforever.com/pets/fox':foxBuildPages['bindonforever.com/pets/fox']}}),previousState:legacy,now});
assert.equal(otherChanged.sources.blizzardHotfix.status,'review_required','Global version bump must never rebaseline unrelated changed sources');
assert.equal(otherChanged.sources.bindFox.status,'verified');
const legacyOffline=await verifyPetRulebook({fetchImpl:fetchFrom(foxBuildPages,'bindonforever.com'),previousState:legacy,now});
assert.equal(legacyOffline.sources.bindFox.status,'source_unavailable');
assert.equal(legacyOffline.sources.bindFox.baselineDigest,legacy.sources.bindFox.baselineDigest);
const retry=await verifyPetRulebook({fetchImpl:fetchFrom(foxBuildPages),previousState:legacyOffline,now});
assert.equal(retry.sources.bindFox.status,'verified');
// Change a real field independent of the order of columns.
const fuzzyId=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild,null,(key,body)=>key==='effect17253'?body+'\n'+PET_DB2_BASELINE.effect17253.rows[0].replace(/,17253$/,',1317253'):body),previousState:legacy,now});
assert.equal(fuzzyId.rules['fox.training'].status,'verified','Unrelated substring matches do not change the exact ID evidence');
const missingExact=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild,null,(key,body)=>key==='effect17253'?body.replace(/,17253$/,',1317253'):body),previousState:legacy,now});
assert.equal(missingExact.rules['fox.training'].status,'review_required','A substring match cannot substitute for the exact ID');
const changedTraining=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild,null,(key,body)=>key==='effect17253'?body+'\n'+PET_DB2_BASELINE.effect17253.rows[0]:body),previousState:legacy,now});
assert.equal(changedTraining.rules['fox.training'].status,'review_required');
assert.equal(changedTraining.rules['fox.family.profile'].status,'verified');
assert.equal(changedTraining.rules['pet.focus'].status,'verified');
const changedFamily=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild,null,(key,body)=>key==='family'?body.replace(',458223,',',458224,'):body),previousState:legacy,now});
assert.equal(changedFamily.rules['fox.family.profile'].status,'review_required');
assert.equal(changedFamily.rules['fox.training'].status,'review_required');
assert.equal(changedFamily.rules['pet.scaling'].status,'verified');
const failedDb2=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild,'wago.tools'),previousState:legacy,now});
assert.equal(failedDb2.rules['pet.focus'].status,'source_unavailable');
assert.equal(failedDb2.rules['pet.health.global'].status,'verified');
const missingBuild=await verifyPetRulebook({fetchImpl:fetchFrom({...pages,'foreverdb.net/changelog':pages['foreverdb.net/changelog'].replaceAll('71091','71037')}),previousState:legacy,now});
assert.equal(missingBuild.rules['fox.family.profile'].status,'source_unavailable');
const schemaChange=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild,null,(key,body)=>key==='scaling'?'unknown_column,'+body:body),previousState:legacy,now});
assert.equal(schemaChange.rules['pet.scaling'].status,'review_required');
assert.equal(schemaChange.rules['pet.focus'].status,'review_required');
assert.equal(schemaChange.rules['fox.training'].status,'verified');
const focusMutation=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild,null,(key,body)=>key==='focus'?body.replace(PET_DB2_BASELINE.focus.rows[0],PET_DB2_BASELINE.focus.rows[0].split(',').map((v,i)=>i===PET_DB2_BASELINE.focus.header.split(',').indexOf('RegenCombat')?'9':v).join(',')):body),previousState:legacy,now});
assert.equal(focusMutation.rules['pet.focus'].status,'review_required');
assert.equal(focusMutation.rules['pet.scaling'].status,'verified');
console.log('Feldweise DB2-Prüfung, gezielte Sperren und Erhalt anderer Baselines: OK');
