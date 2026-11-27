import assert from 'node:assert/strict';
import {parseSpellbookCode,resolveSpellbookCharacter,expandKnownClassAbilities,applySpellbookSnapshot} from './spellbook-sync.mjs';

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
    {id:133,requiredLevel:1,iconId:135812},{id:143,requiredLevel:6,iconId:135812},{id:145,requiredLevel:12,iconId:135812}
  ]},
  {name:'Frostrüstung',ranks:[
    {id:168,requiredLevel:1,iconId:135843},{id:7300,requiredLevel:10,iconId:135843}
  ]}
]};
const expanded=expandKnownClassAbilities(parsed.entries,classMaster,{
  133:{id:133,name:'Feuerball',rank:'Rang 1'},
  168:{id:168,name:'Frostrüstung',rank:'Rang 1'}
});
assert.deepEqual(expanded.map(x=>x.id).sort((a,b)=>a-b),[133,143,168,7300]);
assert.equal(expanded.find(x=>x.id===133).inferredFromHigherRank,true);
assert.equal(expanded.find(x=>x.id===133).iconId,135812,'Mitgelernt markierte niedrigere Ränge behalten die stabile Spell-Icon-ID');
assert.equal(expanded.find(x=>x.id===168).name,'Frostrüstung');

const data={generatedAt:'2026-11-23T05:00:00.000Z',characters:[
  {slug:'cole-dalton',name:'Cole Dalton',classId:8,level:11}
]};
assert.equal(resolveSpellbookCharacter(data,{characterSlug:'cole',classId:8}).slug,'cole-dalton','UnitName-Vorname wird eindeutig auf den Forever-Slug mit Nachnamen abgebildet');
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

assert.throws(()=>applySpellbookSnapshot(updated,{...snapshot,capturedAt:'2026-11-23T05:54:00Z'},{classMaster}),/STALE_SPELLBOOK/);
assert.throws(()=>applySpellbookSnapshot(updated,{...snapshot,entries:[{id:133}]},{classMaster}),/STALE_SPELLBOOK/);
assert.equal(applySpellbookSnapshot(updated,snapshot,{classMaster}),updated,'Equal timestamp and same IDs are idempotent');
console.log('Spellbook Sync: Code, Rang-Expansion, Validierung und persistenter Lernstand: OK');


// Legacy spellbook endpoint must never touch providers in non-production,
// even if a production-capable token is accidentally present.
{
  const {default:legacyHandler}=await import('../api/spellbook-sync.js');
  const before=process.env.VERCEL_ENV,token=process.env.SPELLBOOK_SYNC_TOKEN,fetchBefore=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw Error('Forbidden provider call in preview')};
    process.env.SPELLBOOK_SYNC_TOKEN='synthetic-legacy-spellbook-token';
    for(const scope of ['preview','development','',undefined]){
      if(scope===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=scope;
      const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
      await legacyHandler({method:'POST',body:{code:'synthetic'}},res);
      assert.equal(res.code,403);
    }
  }finally{
    globalThis.fetch=fetchBefore;
    if(before===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=before;
    if(token===undefined)delete process.env.SPELLBOOK_SYNC_TOKEN;else process.env.SPELLBOOK_SYNC_TOKEN=token;
  }
}


// F13: full Sync names may not use ambiguous prefixes or duplicate
// identities. Old manual codes retain a unique, explicit first-name fallback.
{
  const roster={characters:[
    {slug:'cole-dalton',name:'Cole Dalton',classId:8,realm:{slug:'forever-test'}},
    {slug:'cole-other',name:'Cole Other',classId:8,realm:{slug:'another-realm'}}
  ]};
  const resolve=(name,realm,legacy=false)=>resolveSpellbookCharacter(roster,{characterSlug:name,classId:8,realm},{allowLegacyFirstName:legacy});
  assert.equal(resolve('Cole Dalton','Forever Test').slug,'cole-dalton');
  assert.equal(resolve('Cole-Dalton',null).slug,'cole-dalton');
  assert.throws(()=>resolve('Cole',null),/nicht eindeutig/);
  assert.throws(()=>resolve('Cole',null,true),/nicht eindeutig/);
  assert.throws(()=>resolve('Cole Dal',null),/nicht eindeutig/);
  assert.throws(()=>resolve('Cole Dalton','another-realm'),/Realm/);
  assert.throws(()=>resolveSpellbookCharacter({characters:[roster.characters[0],{...roster.characters[0]}]},{characterSlug:'cole-dalton',classId:8}),/nicht eindeutig/);
}
