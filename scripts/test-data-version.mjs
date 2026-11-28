import assert from 'node:assert/strict';
import {buildDataVersion,readCompactVersion} from './data-version.mjs';

const base=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'}
});
assert.equal(base.generatedAt,'2026-11-21T05:07:00.000Z');
assert.ok(base.version.startsWith('data-v3|'));
const newerCharacters=buildDataVersion({
  data:{generatedAt:'2026-11-21T06:10:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'}
});
assert.notEqual(newerCharacters.version,base.version,'New character data must change the global frontend version');

const newerPetRules=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T06:05:00.000Z',rulebookVersion:'2026.11.22.3',overall:'review_required'}
});
assert.notEqual(newerPetRules.version,base.version,'Pet rule updates must change the global frontend version even without a character refresh');

const liveKnowledge=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'},
  liveKnowledgeVersion:'2026-11-24T09:10:00.000Z'
});
assert.notEqual(liveKnowledge.version,base.version,'Live merchant/trainer knowledge changes must invalidate derived frontend views');

const addonSync=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'},
  addonSync:{'cole-dalton':{syncId:'sync-2',receivedAt:'2026-11-24T12:22:51.468Z'}}
});
assert.notEqual(addonSync.version,base.version,'A new AddOn/Bridge sync must invalidate the frontend version even without a Blizzard profile refresh');
assert.ok(addonSync.addonSyncVersion?.includes('cole-dalton:sync-2'),'AddOn sync signature is exposed for diagnostics');

const same=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'}
});
assert.equal(same.version,base.version,'Identical server data must keep a stable version');

console.log('Data version: character, pet-rule, live-knowledge and AddOn-sync freshness signature: OK');

const fields=new Map();let fullReads=0;const compact=new Map();
const redisStub=async ([command,key,field,value])=>{
  if(command==='MGET')return [key,field,value].filter(Boolean).map(k=>compact.get(k)||null);
  if(command==='HGETALL')return [...fields.entries()].flat();
  if(command==='HSETNX'){if(!fields.has(field))fields.set(field,value);return 1;}
  if(command==='HGET')return fields.get(field)||null;
  throw Error(command);
};
const inputs={redisImpl:redisStub,readCharacters:async()=>{fullReads++;return {data:{generatedAt:'2026-11-21T05:07:00.000Z',characters:[{slug:'cole-dalton'},{slug:'dolly-dalton'}]}}},readPet:async()=>{fullReads++;return {checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'}},readAddon:async slug=>{fullReads++;return slug==='cole-dalton'?{receivedAt:'2026-11-24T12:22:51.468Z',payload:{syncId:'sync-2'}}:null},readLive:async()=>null};
const initial=await readCompactVersion(inputs);
assert.equal(initial.version,addonSync.version);
assert.equal(fullReads,4);
assert.equal((await readCompactVersion(inputs)).version,initial.version);
assert.equal(fullReads,4,'Warm polling must not read any full character, pet, or addon payload, including never synced characters');
fields.set('characters',JSON.stringify({generatedAt:'2026-11-25T05:07:00.000Z',slugs:['cole-dalton','dolly-dalton']}));
assert.notEqual((await readCompactVersion(inputs)).version,initial.version);
assert.equal(fullReads,4);

const coreKey='dalton-dashboard:core:compact:v2:production';
const scopedKey='dalton-dashboard:core:compact:v2:'+(process.env.VERCEL_ENV==='production'?'production':'preview');
compact.set(coreKey,JSON.stringify({characters:{generatedAt:'2026-11-26T06:00:00Z',slugs:['cole-dalton','dolly-dalton']},addon:{}}));
const scoped=JSON.parse(compact.get(scopedKey)||'{}');scoped.addon={'cole-dalton':{syncId:'v2',receivedAt:'2026-11-26T06:01:00Z'}};compact.set(scopedKey,JSON.stringify(scoped));
const modern=await readCompactVersion(inputs);assert.equal(modern.generatedAt,'2026-11-26T06:00:00Z');assert.ok(modern.addonSyncVersion.includes('cole-dalton:v2'));assert.equal(fullReads,4,'modern compact metadata is preferred without full payload reads');
fields.set('characters',JSON.stringify({generatedAt:'2026-11-26T07:00:00Z',slugs:['cole-dalton','dolly-dalton']}));
const legacyAddonField='addon:'+(process.env.VERCEL_ENV==='production'?'production':'preview')+':cole-dalton';
fields.set(legacyAddonField,JSON.stringify({syncId:'intervening-v1',receivedAt:'2026-11-26T07:01:00Z'}));
const upgraded=await readCompactVersion(inputs);
assert.equal(upgraded.generatedAt,'2026-11-21T05:07:00.000Z');
assert.ok(upgraded.addonSyncVersion.includes('intervening-v1'));
assert.equal(fullReads,5,'a conflicting legacy hint requires the authoritative roster');
const actualUpgrade=await readCompactVersion({...inputs,readCharacters:async()=>({data:{
  generatedAt:'2026-11-26T07:00:00Z',characters:[{slug:'cole-dalton'},{slug:'dolly-dalton'}]
}})});
assert.equal(actualUpgrade.generatedAt,'2026-11-26T07:00:00Z','a verified historical writer can still be observed');
fields.set('characters',JSON.stringify({generatedAt:'2026-11-26T06:00:00.000Z',slugs:['cole-dalton','dolly-dalton']}));
assert.equal((await readCompactVersion(inputs)).generatedAt,'2026-11-21T05:07:00.000Z','Equal v1 and v2 hints alone do not prove a half-restored roster');
