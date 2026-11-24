import assert from 'node:assert/strict';
import {parseLuaSavedVariable} from './savedvariables-parser.mjs';
import {buildSafeAddonSyncPayload,normalizeAddonSyncPayload,addonSpellbookSnapshot} from './addon-sync.mjs';
import {mergeProfiles} from './character-store.mjs';
import {previewCookieFromSetCookie} from './dalton-sync-client.mjs';

const lua='DaltonDashboardCharDB = {\n'+
'  ["meta"] = { ["addonVersion"] = "0.1.0-alpha.7", ["gameVersion"] = "1.60.1", ["build"] = "71037", ["interface"] = 16001, ["locale"] = "deDE", ["lastUpdatedAt"] = 1795460000 },\n'+
'  ["character"] = { ["name"] = "Cole Dalton", ["classID"] = 8, ["level"] = 11, ["capturedAt"] = 1795460000 },\n'+
'  ["spellbook"] = { ["capturedAt"] = 1795460000, ["entryCount"] = 2, ["entries"] = { [1] = { ["spellID"] = 143, ["name"] = "Feuerball", ["rank"] = "Rang 2", ["known"] = true }, [2] = { ["spellID"] = 205, ["name"] = "Frostblitz", ["rank"] = "Rang 2", ["known"] = true } } },\n'+
'  ["location"] = { ["zone"] = "Insel Zephras", ["subZone"] = "Valanaar", ["mapID"] = 2521, ["x"] = 0.62, ["y"] = 0.73 },\n'+
'  ["locationHistory"] = { ["entries"] = { [1] = { ["zone"] = "Insel Zephras", ["subZone"] = "Valanaar" } } },\n'+
'  ["interactions"] = { ["merchantHistory"] = { [1] = { ["npc"] = { ["id"] = 257006, ["name"] = "Nyalah Brightfire" }, ["complete"] = true } } },\n'+
'  ["economy"] = { ["moneyCopper"] = 999999 },\n'+
'  ["inventory"] = { ["bags"] = { ["totalSlots"] = 56 } }\n'+
'}';

assert.equal(
  previewCookieFromSetCookie(['_vercel_jwt=test-token; Max-Age=60; Path=/; Secure; HttpOnly','other=value; Path=/']),
  '_vercel_jwt=test-token',
  'Der Companion muss Vercels Preview-Cookie ohne manuelles Browser-Copy extrahieren'
);

const parsed=parseLuaSavedVariable(lua);
assert.equal(parsed.character.name,'Cole Dalton');
assert.equal(parsed.spellbook.entries.length,2);
assert.equal(parsed.locationHistory.entries.length,1);

const payload=buildSafeAddonSyncPayload(parsed,{syncId:'a'.repeat(64)});
assert.equal(payload.addon.version,'0.1.0-alpha.7');
assert.equal(payload.sections.character.name,'Cole Dalton');
assert.ok(!('economy' in payload.sections),'Gold bleibt aus dem Standard-Sync ausgeschlossen');
assert.ok(!('inventory' in payload.sections),'Taschen und Bank bleiben aus dem Standard-Sync ausgeschlossen');

const normalized=normalizeAddonSyncPayload(payload);
assert.equal(normalized.sections.interactions.merchantHistory[0].npc.id,257006);
assert.throws(()=>normalizeAddonSyncPayload({...payload,sections:{...payload.sections,economy:{moneyCopper:1}}}),/Sensibler Bereich/);

const classMaster={abilities:[
  {name:'Feuerball',ranks:[{id:133,requiredLevel:1},{id:143,requiredLevel:6}]}
]};
const spellSnapshot=addonSpellbookSnapshot(payload,classMaster);
assert.deepEqual(spellSnapshot.entries.map(entry=>entry.id),[143],'Server übernimmt nur Klassenzauber aus dem Klassenmaster');
assert.equal(addonSpellbookSnapshot(payload,{abilities:[]}),null,'Ein leerer Klassenmaster darf niemals das ungefilterte Spellbook freigeben');

const old={generatedAt:'2026-11-23T18:00:00.000Z',characters:[{
  slug:'cole-dalton',name:'Cole Dalton',knownClassAbilities:[{id:143,name:'Feuerball'}],
  knownClassAbilitiesVerified:true,knownClassAbilitiesSource:'WoW-Spellbook',
  knownClassAbilitiesCapturedAt:'2026-11-23T17:59:00.000Z',knownClassAbilitiesSyncedAt:'2026-11-23T18:00:00.000Z'
}]};
const latest={generatedAt:'2026-11-23T19:00:00.000Z',characters:[{
  slug:'cole-dalton',name:'Cole Dalton',knownClassAbilities:[],knownClassAbilitiesVerified:false
}]};
const merged=mergeProfiles(old,latest);
assert.equal(merged.characters[0].knownClassAbilitiesVerified,true,'Ein echter Ingame-Spellbook-Stand bleibt über normale Refreshes verifiziert');
assert.equal(merged.characters[0].knownClassAbilitiesSource,'WoW-Spellbook');
assert.equal(merged.characters[0].knownClassAbilities[0].id,143);

const originalVercelEnv=process.env.VERCEL_ENV;
process.env.VERCEL_ENV='preview';
const previewStoreSource=await import('node:fs/promises').then(fs=>fs.readFile(new URL('./addon-sync-store.mjs',import.meta.url),'utf8'));
assert.ok(previewStoreSource.includes("process.env.VERCEL_ENV==='production'?'production':'preview'"),'Preview-Sync muss einen eigenen Redis-Namensraum verwenden');
if(originalVercelEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=originalVercelEnv;

console.log('Addon Sync: SavedVariables-Parser, Privacy-Whitelist, Klassenfilter, Preview-Isolation und Refresh-Persistenz: OK');
