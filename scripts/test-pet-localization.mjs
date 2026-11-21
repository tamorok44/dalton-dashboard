import assert from 'node:assert/strict';
import {parseGermanPetFamilyPage,parseGermanPetSpellPage} from './pet-localization-store.mjs';

const familyHtml=`
<main><h1>Fuchs: Jägerbegleiterfamilie</h1>
<a href="/de/spell/17253">Beißen</a>
<a href="/de/spell/23099">Spurt</a>
<a href="/de/spell/1310612">Tanz des Täuschers</a>
<p>Daten aus dem WoW Forever-Client, Build 1.60.1.70959.</p></main>`;
const family=parseGermanPetFamilyPage(familyHtml,'fox');
assert.equal(family.slug,'fox');
assert.equal(family.name,'Fuchs');
assert.equal(family.build,'1.60.1.70959');
assert.deepEqual(family.spellIds,[17253,23099,1310612]);

const bite=parseGermanPetSpellPage('<main><h1>Beißen Rang 1</h1><p>35 Fokus</p><p>Benötigt Stufe 1</p></main>',17253);
assert.equal(bite.name,'Beißen Rang 1');
assert.equal(bite.requiredLevel,1);
assert.equal(bite.sourceUrl,'https://foreverdb.net/de/spell/17253');

const dance=parseGermanPetSpellPage('<main><h1>Tanz des Täuschers Rang 1</h1><p>Benötigt Stufe 20</p></main>',1310612);
assert.equal(dance.name,'Tanz des Täuschers Rang 1');
assert.equal(dance.requiredLevel,20);
console.log('German pet localization parser: family, spell IDs, names and levels: OK');
