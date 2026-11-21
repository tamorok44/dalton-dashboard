import assert from 'node:assert/strict';
import {PET_RULEBOOK_VERSION,verifyPetRulebook,publicPetRuleState} from './pet-rulebook.mjs';

const pages={
  'worldofwarcraft.blizzard.com':`
    <main><li>Hunter Pets erroneously had 150% of their normal health. This is now corrected to 115% of their normal health.</li></main>`,
  'wowhead.com':`
    <main>Stamina: Every 1 player Stamina gives the pet 2 Health.
    Armor: Pet gains 30% of the player's Armor.
    Attack Power: Pet gains 10% of the player's highest Attack Power source.
    Critical Strike: Pet gains 100% of the player's Crit chance.</main>`,
  'bindonforever.com':`
    <main>Hunter pets › Fox. build 1.60.1.70959.
    Fox is the one new family in WoW Forever (client family 319).
    Trickster's Dance gives +50% dodge and 30% faster attacks for 12 s. Pet level 20.
    Bite Rank 1 1 Rank 2 8 Rank 3 16 Rank 4 24 Rank 5 32 Rank 6 40 Rank 7 48 Rank 8 56.
    Dash Rank 1 30 Rank 2 40 Rank 3 50.
    Fox pets eat meat.</main>`,
  'wow-forever.gg':`
    <main>Game data from build 1.60.1.70959.
    Fox New in Forever Damage 0% Armor +5% Health 0% Eats meat.
    Fox Trickster's Dance Dash Bite.</main>`
};
function fetchFrom(currentPages,failHost=null){
  return async url=>{
    const host=new URL(String(url)).hostname.replace(/^www\./,'');
    if(failHost&&host.includes(failHost))throw new Error('source offline');
    const key=Object.keys(currentPages).find(name=>host.includes(name.replace(/^www\./,'')));
    if(!key)return {ok:false,status:404,text:async()=>''};
    return {ok:true,status:200,text:async()=>currentPages[key]};
  };
}
const now=new Date('2026-11-21T04:07:00.000Z');
const first=await verifyPetRulebook({fetchImpl:fetchFrom(pages),now});
assert.equal(first.rulebookVersion,PET_RULEBOOK_VERSION);
assert.equal(first.overall,'verified');
assert.ok(Object.values(first.rules).every(rule=>rule.status==='verified'));
assert.ok(Object.values(first.sources).every(source=>source.status==='verified'));
assert.equal(first.sources.bindFox.build,'1.60.1.70959');

const same=await verifyPetRulebook({fetchImpl:fetchFrom(pages),previousState:first,now:new Date('2026-11-22T04:07:00.000Z')});
assert.equal(same.overall,'verified','Unchanged rule evidence stays verified');
assert.equal(same.sources.blizzardHotfix.baselineDigest,first.sources.blizzardHotfix.baselineDigest);

const changedHotfix={...pages,
  'worldofwarcraft.blizzard.com':pages['worldofwarcraft.blizzard.com']+
    '<li>Hunter pets now gain a different amount of Armor from their owner.</li>'
};
const changed=await verifyPetRulebook({fetchImpl:fetchFrom(changedHotfix),previousState:first,now:new Date('2026-11-22T04:07:00.000Z')});
assert.equal(changed.sources.blizzardHotfix.status,'review_required','New pet hotfix evidence freezes the old baseline');
assert.equal(changed.overall,'review_required');
assert.ok(Object.values(changed.rules).every(rule=>rule.status==='review_required'),'Official pet hotfix blocks all dependent derived rules');

const changedBuild={...pages,
  'bindonforever.com':pages['bindonforever.com'].replace('1.60.1.70959','1.60.1.71000')
};
const buildState=await verifyPetRulebook({fetchImpl:fetchFrom(changedBuild),previousState:first,now:new Date('2026-11-22T04:07:00.000Z')});
assert.equal(buildState.sources.bindFox.status,'review_required','A new game-data build needs explicit review');
assert.equal(buildState.rules['fox.family.profile'].status,'review_required');
assert.equal(buildState.rules['fox.training'].status,'review_required');

const unavailable=await verifyPetRulebook({fetchImpl:fetchFrom(pages,'wowhead.com'),previousState:first,now:new Date('2026-11-22T04:07:00.000Z')});
assert.equal(unavailable.sources.wowheadScaling.status,'source_unavailable');
assert.equal(unavailable.rules['pet.scaling'].status,'source_unavailable');
assert.equal(unavailable.rules['fox.family.profile'].status,'verified','Independent verified rules stay available');

const client=publicPetRuleState(first);
assert.equal(client.overall,'verified');
assert.ok(!('digest' in client.sources.blizzardHotfix),'Internal fingerprints are never exposed to the browser');
console.log('Pet-Regelwerk: Baseline, Buildwechsel, Hotfix-Änderung und Fail-closed-Verhalten: OK');
