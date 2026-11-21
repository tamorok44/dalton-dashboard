import assert from 'node:assert/strict';
import {parseGermanPetFamilyPage,parseGermanPetSpellPage,petRankPlanForFamily} from './pet-localization-store.mjs';

const familyHtml=`
<main><h1>Fuchs: Jägerbegleiterfamilie</h1>
<ul>
<li><a href="/de/spell/17253">Beißen</a> (8 Ränge, ab Begleiterstufe 1)</li>
<li><a href="/de/spell/23099">Spurt</a> (3 Ränge, ab Begleiterstufe 30)</li>
<li><a href="/de/spell/1310612">Tanz des Täuschers</a> (1 Rang, ab Begleiterstufe 20)</li>
</ul>
<p>Daten aus dem WoW Forever-Client, Build 1.60.1.70959.</p></main>`;
const family=parseGermanPetFamilyPage(familyHtml,'fox');
assert.equal(family.slug,'fox');
assert.equal(family.name,'Fuchs');
assert.equal(family.build,'1.60.1.70959');
assert.deepEqual(family.spellIds,[17253,23099,1310612]);
assert.deepEqual(family.requiredLevels,{17253:1,23099:30,1310612:20});

const bite=parseGermanPetSpellPage('<main><h1>Beißen Rang 1</h1><p>Den Feind beißen und ihm 7 bis 9 Punkt(e) Schaden zufügen.</p><p>Englischer Name: Bite.</p><p>Benötigt Stufe 1</p></main>',17253);
assert.equal(bite.name,'Beißen Rang 1');
assert.equal(bite.description,'Den Feind beißen und ihm 7 bis 9 Punkt(e) Schaden zufügen.');
assert.equal(bite.requiredLevel,1);
assert.equal(bite.sourceUrl,'https://foreverdb.net/de/spell/17253');

const dance=parseGermanPetSpellPage('<main><h1>Tanz des Täuschers Rang 1</h1><p>Benötigt Stufe 20</p></main>',1310612);
assert.equal(dance.name,'Tanz des Täuschers Rang 1');
assert.equal(dance.requiredLevel,20);

const foxPlan=petRankPlanForFamily('fox');
assert.deepEqual(foxPlan.map(x=>x.id),[17253,17255,17256,17257,17258,17259,17260,17261,1310612,23099,23109,23110]);
assert.deepEqual(foxPlan.filter(x=>x.id>=17253&&x.id<=17261).map(x=>x.requiredLevel),[1,8,16,24,32,40,48,56]);
assert.deepEqual(foxPlan.filter(x=>[23099,23109,23110].includes(x.id)).map(x=>x.requiredLevel),[30,40,50]);
console.log('German pet localization parser: family, full rank plan, names, descriptions and levels: OK');
