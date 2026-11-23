import assert from 'node:assert/strict';
import {parseSpellbookCode,expandKnownClassAbilities,applySpellbookSnapshot} from './spellbook-sync.mjs';

const code='DALTON1|secret-token|cole-dalton|8|11|1795417200|143:Feuerball:Rang%202,7300:Frostr%C3%BCstung:Rang%202';
const parsed=parseSpellbookCode(code);
assert.equal(parsed.characterSlug,'cole-dalton');
assert.equal(parsed.classId,8);
assert.equal(parsed.level,11);
assert.equal(parsed.entries.length,2);
assert.equal(parsed.entries[1].name,'Frostrüstung');
assert.equal(parsed.entries[0].rank,'Rang 2');

const classMaster={abilities:[
  {name:'Feuerball',ranks:[
    {id:133,requiredLevel:1},{id:143,requiredLevel:6},{id:145,requiredLevel:12}
  ]},
  {name:'Frostrüstung',ranks:[
    {id:168,requiredLevel:1},{id:7300,requiredLevel:10}
  ]}
]};
const expanded=expandKnownClassAbilities(parsed.entries,classMaster,{
  133:{id:133,name:'Feuerball',rank:'Rang 1'},
  168:{id:168,name:'Frostrüstung',rank:'Rang 1'}
});
assert.deepEqual(expanded.map(x=>x.id).sort((a,b)=>a-b),[133,143,168,7300]);
assert.equal(expanded.find(x=>x.id===133).inferredFromHigherRank,true);
assert.equal(expanded.find(x=>x.id===168).name,'Frostrüstung');

const data={generatedAt:'2026-11-23T05:00:00.000Z',characters:[
  {slug:'cole-dalton',name:'Cole Dalton',classId:8,level:11}
]};
const now=new Date('2026-11-23T06:00:00.000Z').toISOString();
const snapshot={...parsed,capturedAt:'2026-11-23T05:55:00.000Z'};
const updated=applySpellbookSnapshot(data,snapshot,{
  classMaster,
  localized:{133:{name:'Feuerball',rank:'Rang 1'},168:{name:'Frostrüstung',rank:'Rang 1'}},
  syncedAt:now
});
const cole=updated.characters[0];
assert.equal(updated.generatedAt,now);
assert.equal(cole.knownClassAbilitiesVerified,true);
assert.equal(cole.knownClassAbilitiesSource,'WoW-Spellbook');
assert.equal(cole.knownClassAbilitiesCapturedLevel,11);
assert.equal(cole.knownClassAbilities.length,4);
assert.equal(cole.knownClassAbilitiesCapturedAt,'2026-11-23T05:55:00.000Z');

assert.throws(()=>parseSpellbookCode('nichts'),/Ungültiger Spellbook-Code/);
assert.throws(()=>applySpellbookSnapshot(data,{...snapshot,classId:11},{syncedAt:now}),/Klasse/);
assert.throws(()=>applySpellbookSnapshot(data,{...snapshot,level:20},{syncedAt:now}),/Charakterlevel/);

console.log('Spellbook Sync: Code, Rang-Expansion, Validierung und persistenter Lernstand: OK');
