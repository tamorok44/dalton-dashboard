import assert from 'node:assert/strict';
import {PET_RULEBOOK_VERSION,verifyPetRulebook,publicPetRuleState} from './pet-rulebook.mjs';

const pages={
  'worldofwarcraft.blizzard.com/en-us/news/24315281':`
    <main><li>Hunter Pets erroneously had 150% of their normal health. This is now corrected to 115% of their normal health.</li></main>`,
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
    Bite Rank 1 Pet level 1 · 1 training point. Rank 2 Pet level 8 · 4 training points.
    Trickster's Dance Rank 1 Pet level 20 · 10 training points.
    Dash Rank 1 Pet level 30 · 15 for Boar, Cat, Fox, Hyena, Tallstrider, Wolf.`,
  'mobalytics.gg/wow-forever/classes/hunter-leveling-1-60-vareion':`
    Pets now scale with your player character:
    100% of your Crit strike
    10% of your highest Attack Power source
    30% of your Armor
    1 Hunter Stamina = 2 Pet Health.`
};
function fetchFrom(currentPages,failPart=null){
  return async url=>{
    const text=String(url);
    if(failPart&&text.includes(failPart))throw new Error('source offline');
    const key=Object.keys(currentPages).find(part=>text.includes(part));
    if(!key)return {ok:false,status:404,text:async()=>''};
    return {ok:true,status:200,text:async()=>currentPages[key]};
  };
}
const now=new Date('2026-11-21T04:07:00.000Z');
const first=await verifyPetRulebook({fetchImpl:fetchFrom(pages),now});
assert.equal(first.rulebookVersion,PET_RULEBOOK_VERSION);
assert.equal(first.overall,'verified');
assert.equal(Object.keys(first.rules).length,5);
assert.ok(Object.values(first.rules).every(rule=>rule.status==='verified'));
assert.ok(Object.values(first.sources).every(source=>source.status==='verified'));
assert.equal(first.sources.bindFox.build,'1.60.1.70959');
assert.equal(first.rules['pet.scaling'].evidence,'reference_model');
assert.equal(first.rules['pet.scaling'].evidenceLabel,'Referenzmodell');
assert.equal(first.rules['pet.focus'].evidence,'client');
assert.equal(first.rules['pet.health.global'].evidence,'official');
assert.equal(first.rules['fox.family.profile'].evidence,'client');
assert.equal(first.sources.efficientPets.build,'1.60.1.70959');

const same=await verifyPetRulebook({fetchImpl:fetchFrom(pages),previousState:first,now:new Date('2026-11-22T04:07:00.000Z')});
assert.equal(same.overall,'verified','Unchanged rule evidence stays verified');
assert.equal(same.sources.blizzardHotfix.baselineDigest,first.sources.blizzardHotfix.baselineDigest);

const changedHotfix={...pages,
  'worldofwarcraft.blizzard.com/en-us/news/24315281':pages['worldofwarcraft.blizzard.com/en-us/news/24315281']+
    '<li>Hunter pets now gain a different amount of Armor from their owner.</li>'
};
const changed=await verifyPetRulebook({fetchImpl:fetchFrom(changedHotfix),previousState:first,now:new Date('2026-11-22T04:07:00.000Z')});
assert.equal(changed.sources.blizzardHotfix.status,'review_required','New pet hotfix evidence freezes the old baseline');
assert.equal(changed.overall,'review_required');
assert.ok(Object.values(changed.rules).every(rule=>rule.status==='review_required'),'Official pet hotfix blocks all dependent derived rules');

const changedBuild={...pages,
  'bindonforever.com/pets/fox':pages['bindonforever.com/pets/fox'].replace('1.60.1.70959','1.60.1.71000')
};
const buildState=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild),previousState:first,now:new Date('2026-11-22T04:07:00.000Z')});
assert.equal(buildState.sources.bindFox.status,'review_required','A new game-data build needs explicit review');
assert.equal(buildState.rules['fox.family.profile'].status,'review_required');
assert.equal(buildState.rules['fox.training'].status,'review_required');

const unavailable=await verifyPetRulebook({fetchImpl:fetchFrom(pages,'wowhead.com'),previousState:first,now:new Date('2026-11-22T04:07:00.000Z')});
assert.equal(unavailable.sources.wowheadScaling.status,'source_unavailable');
assert.equal(unavailable.rules['pet.scaling'].status,'source_unavailable');
assert.equal(unavailable.rules['pet.focus'].status,'verified','Focus remains available because it has independent sources');
assert.equal(unavailable.rules['fox.family.profile'].status,'verified','Independent verified rules stay available');

const focusUnavailable=await verifyPetRulebook({
  fetchImpl:fetchFrom(pages,'raw.githubusercontent.com'),
  previousState:first,
  now:new Date('2026-11-22T04:07:00.000Z')
});
assert.equal(focusUnavailable.sources.foreverSimFocusAudit.status,'source_unavailable');
assert.equal(focusUnavailable.rules['pet.focus'].status,'source_unavailable','Focus fails closed when a required audit source is unavailable');
assert.equal(focusUnavailable.rules['pet.scaling'].status,'verified','Scaling remains independently verified');

const client=publicPetRuleState(first);
assert.equal(client.overall,'verified');
assert.ok(!('digest' in client.sources.blizzardHotfix),'Internal fingerprints are never exposed to the browser');
assert.equal(client.rules['pet.scaling'].evidenceLabel,'Referenzmodell');
assert.equal(client.rules['pet.focus'].evidenceLabel,'Clientdaten');
assert.equal(client.rules['pet.health.global'].evidenceLabel,'Offiziell');
console.log('Pet-Regelwerk: Skalierung, Fokus, Buildwechsel, Hotfix-Änderung und Fail-closed-Verhalten: OK');
