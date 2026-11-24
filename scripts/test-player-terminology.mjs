import assert from 'node:assert/strict';
import {
  VERIFIED_PLAYER_TERMINOLOGY,
  preferredGermanGameName,
  normalizeVerifiedPlayerTerminology,
  verifiedPlayerTerm,
  preferredForeverZoneName,
  foreverZoneIdentity
} from './player-terminology.mjs';

const professionIds=[129,164,165,171,182,185,186,197,202,333,356,393];
assert.deepEqual(Object.keys(VERIFIED_PLAYER_TERMINOLOGY.profession).map(Number).sort((a,b)=>a-b),professionIds);
assert.equal(verifiedPlayerTerm('profession',171)?.name,'Alchemie');
assert.equal(preferredGermanGameName('profession',171,'Alchimie'),'Alchemie',
  'Official player terminology must override conflicting technical client terminology');
assert.equal(preferredGermanGameName('profession',171,'Alchemy'),'Alchemie');
assert.equal(preferredGermanGameName('profession',999999,'Technischer Name'),'Technischer Name');
for(const [id,canonical,legacy] of [[1453,'Stormwind','Sturmwind'],[1455,'Ironforge','Eisenschmiede'],[1440,'Ashenvale','Eschental'],[2521,'Die Insel Zephras','Insel Zephras']]){
  assert.equal(verifiedPlayerTerm('zone',id)?.name,canonical);
  assert.equal(preferredGermanGameName('zone',id,canonical),canonical);
  assert.equal(preferredForeverZoneName(id,legacy),canonical);
  assert.equal(preferredForeverZoneName(null,legacy),canonical);
  assert.equal(foreverZoneIdentity(legacy),foreverZoneIdentity(canonical));
  assert.ok(verifiedPlayerTerm('zone',id)?.sources?.some(source=>new URL(source).hostname==='foreverdb.net'));
}
assert.equal(preferredForeverZoneName(1453,'Neuer Clientname'),'Neuer Clientname','A new source label is not overwritten by an old static name');
assert.equal(preferredForeverZoneName(999999,'Wald von Elwynn'),'Wald von Elwynn','Do not translate other German client labels');
assert.equal(preferredForeverZoneName(999999,'Winterspring'),'Winterspring','Do not translate English names in German Forever sources');
assert.ok(VERIFIED_PLAYER_TERMINOLOGY.sources.length>=2);
for(const source of VERIFIED_PLAYER_TERMINOLOGY.sources){
  const url=new URL(source);
  assert.equal(url.protocol,'https:');
  assert.equal(url.hostname,'worldofwarcraft.blizzard.com');
  assert.ok(url.pathname.startsWith('/de-de/'));
}
const normalized=normalizeVerifiedPlayerTerminology({
  generatedAt:'2026-11-21T12:00:00.000Z',
  characters:[
    {slug:'cole-dalton',professions:[{id:171,name:'Alchimie',current:58,max:75},{id:182,name:'Kräuterkunde',current:58,max:150}]},
    {slug:'viola-dalton',professions:[{id:171,name:'Alchemy',current:22,max:75}]}
  ]
});
assert.equal(normalized.characters[0].professions[0].name,'Alchemie');
assert.equal(normalized.characters[1].professions[0].name,'Alchemie');
assert.equal(normalized.characters[0].professions[1].name,'Kräuterkunde');

console.log('Verified player terminology: official German Blizzard Forever profession names override technical labels: OK');
