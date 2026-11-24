import assert from 'node:assert/strict';
import {parseLuaSavedVariable} from './savedvariables-parser.mjs';
import {buildSafeAddonSyncPayload,normalizeAddonSyncPayload,addonSpellbookSnapshot,addonSyncContentIdentity,publicAddonSyncSummary} from './addon-sync.mjs';
import {mergeProfiles} from './character-store.mjs';
import {previewCookieFromSetCookie,relayCharDbsFromGlobalDb,relayRecordsFromGlobalDb} from './dalton-sync-client.mjs';
import {deviceMayCreateEnrollment,deviceMaySync,trustedCharacterName,trustedCharacterSlugs} from './addon-device-auth.mjs';

const lua='DaltonDashboardCharDB = {\n'+
'  ["meta"] = { ["addonVersion"] = "0.1.0-beta.1", ["gameVersion"] = "1.60.1", ["build"] = "71037", ["interface"] = 16001, ["locale"] = "deDE", ["lastUpdatedAt"] = 1795460000 },\n'+
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
assert.deepEqual(trustedCharacterSlugs(),['cole-dalton','chucky-dalton','dolly-dalton','viola-dalton']);
assert.equal(trustedCharacterName('chucky-dalton'),'Chucky Dalton');
assert.equal(trustedCharacterName('fremd'),null);
const coleDevice={characterSlug:'cole-dalton'};
const chuckyDevice={characterSlug:'chucky-dalton'};
assert.equal(deviceMaySync(coleDevice,'cole-dalton','dalton-local-bridge'),true,'Cole darf seinen eigenen Direkt-Sync senden');
assert.equal(deviceMaySync(coleDevice,'chucky-dalton','dalton-peer-relay'),true,'Cole darf vertrauenswürdigen Peer-Relay senden');
assert.equal(deviceMaySync(coleDevice,'chucky-dalton','dalton-local-bridge'),false,'Cole darf fremde Direkt-Syncs nicht vortäuschen');
assert.equal(deviceMaySync(chuckyDevice,'chucky-dalton','dalton-local-bridge'),true,'Peer-Gerät darf nur den eigenen Charakter direkt senden');
assert.equal(deviceMaySync(chuckyDevice,'dolly-dalton','dalton-peer-relay'),false,'Peer-Gerät darf keinen anderen Dalton relayn');
assert.equal(deviceMayCreateEnrollment(coleDevice,'dolly-dalton'),true,'Cole-Hub darf Peer-Codes erzeugen');
assert.equal(deviceMayCreateEnrollment(coleDevice,'cole-dalton'),false,'Cole-Gerät darf sich nicht selbst neu privilegieren');
assert.equal(deviceMayCreateEnrollment(chuckyDevice,'dolly-dalton'),false,'Peer-Geräte dürfen keine weiteren Geräte freischalten');

const globalRelay={
  relayInbox:{
    chucky:{receivedAt:1795461000,sender:'Chucky Dalton',charDb:{
      meta:{addonVersion:'0.1.0-beta.1',gameVersion:'1.60.1',build:'71037',interface:16001,locale:'deDE'},
      character:{name:'Chucky Dalton',classID:11,level:10},
      spellbook:{entries:[]}
    }},
    outsider:{charDb:{character:{name:'Nicht Dalton',classID:1,level:1}}}
  }
};
const relayDbs=relayCharDbsFromGlobalDb(globalRelay);
assert.equal(relayDbs.length,1,'Companion übernimmt nur vertrauenswürdige Dalton-Relay-Datensätze');
assert.equal(relayDbs[0].charDb.character.name,'Chucky Dalton');
const relayRecords=relayRecordsFromGlobalDb(globalRelay,{source:'fixture'});
assert.equal(relayRecords.length,1,'Relay-Postfach muss genau einen sicheren Payload erzeugen');
assert.equal(relayRecords[0].key,'relay:chucky dalton');
assert.equal(relayRecords[0].payload.client.transport,'dalton-peer-relay');
assert.equal(relayRecords[0].payload.sections.character.name,'Chucky Dalton');
assert.ok(!('inventory' in relayRecords[0].payload.sections)&&!('economy' in relayRecords[0].payload.sections),'Auch Relay-Payloads bleiben an der Privacy-Grenze');

const parsed=parseLuaSavedVariable(lua);
assert.equal(parsed.character.name,'Cole Dalton');
assert.equal(parsed.spellbook.entries.length,2);
assert.equal(parsed.locationHistory.entries.length,1);

const payload=buildSafeAddonSyncPayload(parsed,{syncId:'a'.repeat(64)});
assert.equal(payload.addon.version,'0.1.0-beta.1');
assert.equal(payload.client.transportVersion,'0.1.0-beta.1','Safe sync payload must not fall back to an older release transport version');
assert.equal(payload.sections.character.name,'Cole Dalton');
assert.ok(!('economy' in payload.sections),'Gold bleibt aus dem Standard-Sync ausgeschlossen');
assert.ok(!('inventory' in payload.sections),'Taschen und Bank bleiben aus dem Standard-Sync ausgeschlossen');

const publicState=publicAddonSyncSummary({
  characterSlug:'cole-dalton',
  receivedAt:'2026-11-24T09:30:00.000Z',
  payload:{...payload,sections:{...payload.sections,
    location:{
      zone:'Insel Zephras',subZone:'Valanaar',bindLocation:'Valanaar',
      x:null,y:null,
      lastKnownCoordinates:{zone:'Insel Zephras',subZone:'Valanaar',mapID:2521,x:.621,y:.734,capturedAt:1795540000}
    },
    locationHistory:{entries:[
      {capturedAt:1795530000,instance:{name:'Die Tiefenmine',instanceType:'party',instanceID:321,difficultyID:1,difficultyName:'Normal',maxPlayers:5}},
      {capturedAt:1795535000,instance:{name:'Die Tiefenmine',instanceType:'party',instanceID:321,difficultyID:1,difficultyName:'Normal',maxPlayers:5}},
      {capturedAt:1795537000,instance:{name:'Die Welt',instanceType:'none',instanceID:1}}
    ]},
    interactions:{
      merchantHistory:[
        {npc:{id:257006,name:'Nyalah Brightfire'}},
        {npc:{id:257007,name:'Anderer Händler'}},
        {npc:{id:257006,name:'Nyalah Brightfire'}}
      ],
      trainerHistory:[
        {npc:{id:123,name:'Lehrer Eins'}},
        {npc:{id:123,name:'Lehrer Eins'}}
      ]
    },
    instances:{
      count:1,entries:[{name:'Die Tiefenmine',difficultyID:1,difficultyName:'Normal',resetAt:1795541400,locked:true,numEncounters:4,encounterProgress:1,instanceID:321}]
    }
  }}
});
assert.equal(publicState.lockouts.length,1);
assert.equal(publicState.lockouts[0].name,'Die Tiefenmine');
assert.equal(publicState.lockouts[0].difficultyID,1);
assert.equal(publicState.lockouts[0].encounterProgress,1);
assert.equal(publicState.currentLocation.x,.621,'Fehlende aktuelle Koordinate nutzt nur die letzte bekannte Koordinate am selben Ort');
assert.equal(publicState.currentLocation.y,.734);
assert.equal(publicState.visitedInstanceCount,1,'Mehrere Orts-Historieneinträge derselben Instanz werden zu einem Besuchsstatus verdichtet');
assert.equal(publicState.visitedInstances[0].name,'Die Tiefenmine');
assert.equal(publicState.merchantObservationCount,3,'Beobachtungshistorie bleibt vollständig erhalten');
assert.equal(publicState.merchantNpcCount,2,'Derselbe Händler wird für die NPC-Anzahl nur einmal gezählt');
assert.equal(publicState.trainerObservationCount,2);
assert.equal(publicState.trainerNpcCount,1,'Derselbe Lehrer wird für die NPC-Anzahl nur einmal gezählt');

const normalized=normalizeAddonSyncPayload(payload);
const sameContentLater=structuredClone(payload);
sameContentLater.addon.lastUpdatedAt='2026-11-24T10:30:00.000Z';
sameContentLater.sections.character.capturedAt=1795469999;
sameContentLater.sections.character.reason='PLAYER_LEVEL_UP';
sameContentLater.sections.location.capturedAt=1795469999;
sameContentLater.sections.location.reason='PLAYER_LOGOUT';
sameContentLater.sections.location.logout=true;
assert.deepEqual(
  addonSyncContentIdentity(payload),
  addonSyncContentIdentity(sameContentLater),
  'Reine Zeitstempel-, Reason- und Logout-Änderungen dürfen keinen neuen Upload auslösen'
);
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
