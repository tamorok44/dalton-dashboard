import assert from 'node:assert/strict';
import {REPUTATION_BUILD,reputationColors,reputationStages,foreverReputationSeed,factionSeedByName,factionCrestFor} from '../reputation-data.js';

assert.equal(REPUTATION_BUILD,'1.60.1.70959');
assert.equal(foreverReputationSeed.length,54,'Forever master list must contain all 54 client factions');
assert.equal(foreverReputationSeed.filter(x=>x.forever).length,14,'Exactly 14 factions are new in Forever');
assert.equal(new Set(foreverReputationSeed.map(x=>x.slug)).size,54,'Faction slugs must be unique');
assert.deepEqual(reputationStages.map(x=>x.name),['Hasserfüllt','Feindselig','Unfreundlich','Neutral','Freundlich','Wohlwollend','Respektvoll','Ehrfürchtig']);
assert.equal(reputationColors.hated.hex,'#CC4D38');
assert.equal(reputationColors.hostile.hex,'#CC4D38');
assert.equal(reputationColors.unfriendly.hex,'#BF4500');
assert.equal(reputationColors.neutral.hex,'#E6B300');
for(const key of ['friendly','honored','revered','exalted'])assert.equal(reputationColors[key].hex,'#00991A');

assert.equal(factionSeedByName('Stormwind')?.slug,'stormwind');
assert.equal(factionSeedByName('Sturmwind')?.slug,'stormwind');
assert.equal(factionSeedByName('Eisenschmiede')?.slug,'ironforge');
assert.equal(factionSeedByName('Donnerfels')?.slug,'thunder-bluff');
assert.equal(factionSeedByName('Unterstadt')?.slug,'undercity');
assert.equal(factionSeedByName('Gnomeregangnome')?.slug,'gnomeregan-exiles');
assert.equal(factionSeedByName('Zirkel des Cenarius')?.slug,'cenarion-circle');
assert.equal(factionSeedByName('Druiden der Nachtklaue')?.slug,'nightclaw-druids');
assert.equal(factionSeedByName('Der Hohe Orden')?.slug,'high-order');
assert.equal(factionSeedByName('Kirin Tor')?.slug,'kirin-tor');

assert.match(factionCrestFor(factionSeedByName('Stormwind')),/Stormwind\.png$/);
assert.match(factionCrestFor(factionSeedByName('Kirin Tor')),/Alliance_64\.png$/,'No invented Kirin Tor crest: use verified Alliance fallback');
assert.ok(foreverReputationSeed.every(x=>['alliance','horde','neutral'].includes(x.side)));
console.log('Reputation catalog: 54 factions, 14 Forever additions, canonical colors and crest fallbacks: OK');
