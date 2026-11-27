import assert from 'node:assert/strict';
import {snapshotsFromAddonPayload,loadLiveKnowledge} from './live-knowledge-store.mjs';
import {liveKnowledgeDiscoveries,liveKnowledgeAsAddonStates,buildLiveKnowledgeLearningSourceEvidence} from './learning-source-evidence.mjs';

const payload={
  addon:{gameVersion:'1.60.1',build:'71037'},
  sections:{interactions:{
    merchantHistory:[
      {
        capturedAt:1795509206,complete:false,
        npc:{id:257006,name:'Nyalah Brightfire'},
        location:{zone:'Die Insel Zephras',mapID:2521,x:.60,y:.72},
        items:{1:{itemID:999001,name:'Rezept: Neues Testgericht',priceCopper:1234}}
      },
      {
        capturedAt:1795509207,complete:true,
        npc:{id:257006,name:'Nyalah Brightfire'},
        location:{zone:'Die Insel Zephras',mapID:2521,x:.60,y:.72},
        items:{
          1:{itemID:21099,name:'Rezept: Geräucherter Weisenfisch',priceCopper:500},
          2:{itemID:999001,name:'Rezept: Neues Testgericht',priceCopper:1234}
        }
      }
    ],
    trainerHistory:[
      {
        capturedAt:1795509208,complete:true,
        npc:{id:257006,name:'Nyalah Brightfire'},
        location:{zone:'Die Insel Zephras',mapID:2521},
        services:{1:{name:'Spinnenwurst',priceCopper:4000,skillLine:'Kochkunst',requiredSkillRank:200}}
      }
    ]
  }}
};

const snapshots=snapshotsFromAddonPayload(payload);
assert.equal(snapshots.length,2,'Nur vollständige Händlerfenster und positive Trainerstände werden als Livewissen normalisiert');
const merchant=snapshots.find(entry=>entry.kind==='merchant');
const trainer=snapshots.find(entry=>entry.kind==='trainer');
assert.equal(merchant.build,'1.60.1.71037');
assert.equal(merchant.entries.length,2);
assert.equal(merchant.entries[1].itemID,999001);
assert.equal(trainer.entries[0].requiredSkillRank,200);

const records=[
  {
    kind:'merchant',build:'1.60.1.71037',npc:{id:257006,name:'Nyalah Brightfire'},
    firstObservedAt:'2026-11-24T08:30:00.000Z',lastObservedAt:'2026-11-24T08:33:27.000Z',
    latestSnapshot:merchant,
    offers:merchant.entries.map(entry=>({
      key:'item:'+entry.itemID,itemID:entry.itemID,name:entry.name,
      firstSeenAt:'2026-11-24T08:30:00.000Z',lastSeenAt:'2026-11-24T08:33:27.000Z',
      currentlyPresent:true,priceCopper:entry.priceCopper
    }))
  },
  {
    kind:'trainer',build:'1.60.1.71037',npc:{id:257006,name:'Nyalah Brightfire'},
    lastObservedAt:'2026-11-24T08:33:28.000Z',latestSnapshot:trainer,
    services:trainer.entries
  }
];

const recipeIndex={
  build:'1.60.1.71037',
  recipes:[
    {
      id:25704,professionSlug:'cooking',name:'Geräucherter Weisenfisch',
      craftedItem:{id:21072,name:'Geräucherter Weisenfisch'},
      learning:{sources:[{type:'item',id:21099,name:'Rezept: Geräucherter Weisenfisch'}]}
    },
    {
      id:17222,professionSlug:'cooking',name:'Spinnenwurst',
      craftedItem:{id:17222,name:'Spinnenwurst'},
      learning:{sources:[]}
    }
  ]
};

const discoveries=liveKnowledgeDiscoveries(recipeIndex,records);
assert.equal(discoveries.length,1,'Nur noch nicht zuordenbare Live-Lerngegenstände werden als Discovery ausgegeben');
assert.equal(discoveries[0].itemID,999001);
assert.equal(discoveries[0].npcId,257006);
assert.equal(discoveries[0].priceCopper,1234);

const synthetic=liveKnowledgeAsAddonStates(records);
assert.equal(synthetic.length,2);
const evidence=buildLiveKnowledgeLearningSourceEvidence(recipeIndex,records);
assert.ok(evidence.observations.some(entry=>entry.source==='dalton-addon'&&entry.recipeId===25704&&entry.status==='present'));
assert.ok(evidence.observations.some(entry=>entry.source==='dalton-addon'&&entry.sourceType==='trainer'&&entry.recipeName==='Spinnenwurst'));

console.log('Live-Wissen: Normalisierung, persistierbare Snapshots und unbekannte Lerngegenstände: OK');

const calls=[];const scope=process.env.VERCEL_ENV==='production'?'production':'preview';
const pref='dalton-dashboard:live-knowledge:v1:'+scope+':record:';
const current=[pref+'merchant:1.60.1.71037:id-257006',pref+'trainer:1.60.1.71037:id-257006'];
const old=pref+'merchant:1.60.1.70999:id-257006';
const found=await loadLiveKnowledge({build:'1.60.1.71037',kind:'merchant',enabled:true,redisImpl:async command=>{
  calls.push(command);
  if(command[0]==='SMEMBERS')return [...current,old];
  if(command[0]==='HKEYS')return [];
  if(command[0]==='MGET')return command.slice(1).map(()=>JSON.stringify(records[0]));
  throw Error(command[0]);
}});
assert.equal(found.length,1);
assert.deepEqual(calls.find(c=>c[0]==='MGET'),['MGET',current[0]],'Read only matching build and kind, no obsolete snapshot payloads');

const personal=snapshotsFromAddonPayload(payload,{characterSlug:'cole-dalton'});
assert.equal(personal.find(s=>s.kind==='merchant').characterSlug,'cole-dalton');
const personalRecords=records.map(r=>r.kind==='merchant'?{...r,characterSlug:'cole-dalton'}:r);
assert.equal(liveKnowledgeAsAddonStates(personalRecords)[0].characterSlug,'cole-dalton');

const historicalCalls=[];const {loadHistoricalMerchantKnowledge}=await import('./live-knowledge-store.mjs');
const cache=new Map();const oldRecord={...records[0],build:'1.60.1.70999',latestSnapshot:{...merchant,build:'1.60.1.70999'},changes:[{large:'history'}]};
const fake=async ([op,key,...args])=>{
 historicalCalls.push([op,key,...args]);
 if(op==='GET')return key.endsWith(':version')?'v1':cache.get(key)||null;
 if(op==='SET'){cache.set(key,args[0]);return 'OK'}
 if(op==='SMEMBERS')return [...current,old];
 if(op==='HKEYS')return [];
 if(op==='HGET')return null;
 if(op==='MGET')return [key,...args].map(()=>JSON.stringify(oldRecord));
 throw Error(op);
};
const history=await loadHistoricalMerchantKnowledge('1.60.1.71037',{redisImpl:fake,enabled:true});
assert.equal(history.length,1);assert.equal(history[0].build,'1.60.1.70999');assert.equal(history[0].changes,undefined);
assert.deepEqual(await loadHistoricalMerchantKnowledge('1.60.1.71037',{redisImpl:fake,enabled:true}),history);
assert.equal(historicalCalls.filter(c=>c[0]==='MGET').length,2,'Historical migration reads must detect unmarked legacy writes');

const migratedCalls=[];const modernRecord=records[0];
const modern=await loadLiveKnowledge({build:'1.60.1.71037',kind:'merchant',enabled:true,redisImpl:async command=>{
 migratedCalls.push(command);if(command[0]==='SMEMBERS')return [current[1],old];if(command[0]==='HKEYS')return ['__version:v2',current[0]];if(command[0]==='HMGET')return [JSON.stringify(modernRecord)];if(command[0]==='MGET')return [null];throw Error(command[0]);
}});assert.equal(modern.length,1);assert.equal(modern[0].npc.id,257006);assert.equal(migratedCalls.filter(c=>c[0]==='MGET').length,1);

const {reconcileKnowledgeRecords}=await import('./storage-reconciliation.mjs');
const v2={...records[1],observationIds:['v2'],observationCount:1,latestSnapshot:{...trainer,capturedAt:'2026-11-26T05:00:00Z',entries:[{name:'Spinnenwurst',priceCopper:20}]},services:[{key:'spinnenwurst',priceCopper:20,lastSeenAt:'2026-11-26T05:00:00Z'}]};
const v1={...v2,observationIds:['v1'],latestSnapshot:{...v2.latestSnapshot,capturedAt:'2026-11-26T06:00:00Z',entries:[{name:'Spinnenwurst',priceCopper:30}]},services:[{key:'spinnenwurst',priceCopper:30,lastSeenAt:'2026-11-26T06:00:00Z'}]};
const merged=reconcileKnowledgeRecords(v2,v1);assert.equal(merged.latestSnapshot.entries[0].priceCopper,30);assert.deepEqual(new Set(merged.observationIds),new Set(['v1','v2']));
assert.throws(()=>reconcileKnowledgeRecords(v2,{...v1,latestSnapshot:{...v1.latestSnapshot,capturedAt:v2.latestSnapshot.capturedAt}}),/MIGRATION_CONFLICT/);
const both=await loadLiveKnowledge({build:trainer.build,kind:'trainer',enabled:true,redisImpl:async ([op])=>{if(op==='SMEMBERS'||op==='HKEYS')return [current[1]];if(op==='HMGET')return [JSON.stringify(v2)];if(op==='MGET')return [JSON.stringify(v1)];throw Error(op);}});assert.equal(both[0].latestSnapshot.entries[0].priceCopper,30);

const {publicLiveKnowledgeSummary}=await import('./live-knowledge-store.mjs');
const sameSecond={...v1,latestSnapshot:{...v1.latestSnapshot,capturedAt:v2.latestSnapshot.capturedAt}};
const otherKey=pref+'trainer:1.60.1.71037:id-3';
const other={...v2,npc:{id:3,name:'Unabhängiger Lehrer'},latestSnapshot:{...v2.latestSnapshot,npc:{id:3,name:'Unabhängiger Lehrer'}}};
for(const oldRaw of [JSON.stringify(sameSecond),'{invalid-json']){
  const rows=await loadLiveKnowledge({build:trainer.build,kind:'trainer',enabled:true,redisImpl:async ([op])=>{
    if(op==='SMEMBERS')return [current[1]];
    if(op==='HKEYS')return [current[1],otherKey];
    if(op==='HMGET')return [JSON.stringify(v2),JSON.stringify(other)];
    if(op==='MGET')return [oldRaw,null];
    if(op==='HSETNX')return 1;
    throw Error(op);
  }});
  assert.equal(rows.length,1);assert.equal(rows[0].npc.id,3);
  assert.equal(publicLiveKnowledgeSummary(rows).excludedIntegrityRecords,1);
}

const {combineLiveKnowledge,liveKnowledgeEvidenceKeys}=await import('./live-knowledge-store.mjs');
const {learningSourceEvidenceForIndex}=await import('./learning-source-evidence.mjs');
const trainerConflictKey=liveKnowledgeEvidenceKeys({sourceType:'trainer',build:trainer.build,npcId:trainer.npc.id,npcName:trainer.npc.name})[0];
const omitted=[];Object.defineProperty(omitted,'integrityIssues',{value:[{key:trainerConflictKey,reason:'conflicting_record'}]});
const combined=combineLiveKnowledge([],omitted);
const safeEvidence=learningSourceEvidenceForIndex(recipeIndex,[{characterSlug:'cole-dalton',payload}],combined);
assert.ok(!safeEvidence.observations.some(o=>o.source==='dalton-addon'&&o.sourceType==='trainer'&&o.npcId===trainer.npc.id&&o.build===trainer.build));
assert.ok(safeEvidence.observations.some(o=>o.source==='dalton-addon'&&o.sourceType==='vendor'));

const wrongIdentity={...v2,npc:{id:999,name:'Fremder NPC'},latestSnapshot:{...v2.latestSnapshot,npc:{id:999,name:'Fremder NPC'}}};
const qWrites=[];
const orphan=await loadLiveKnowledge({build:trainer.build,kind:'trainer',enabled:true,redisImpl:async ([op,...args])=>{
  if(op==='SMEMBERS')return [];
  if(op==='HKEYS')return [current[1],otherKey];
  if(op==='HMGET')return [JSON.stringify(v2),JSON.stringify(other)];
  if(op==='MGET')return [JSON.stringify(sameSecond),null];
  if(op==='HSETNX'){qWrites.push(args);return 1;}
  throw Error(op);
}});
assert.equal(orphan.length,1);assert.equal(orphan[0].npc.id,3);assert.equal(qWrites.length,1);
assert.equal(JSON.parse(qWrites[0][2]).legacyRaw,JSON.stringify(sameSecond));
const wrongRows=await loadLiveKnowledge({build:trainer.build,kind:'trainer',enabled:true,redisImpl:async ([op])=>{
  if(op==='SMEMBERS')return [];
  if(op==='HKEYS')return [current[1]];
  if(op==='HMGET')return [JSON.stringify(wrongIdentity)];
  if(op==='MGET')return [null];
  if(op==='HSETNX')throw Error('fixture write denied');
  throw Error(op);
}});
assert.equal(wrongRows.length,0);assert.equal(publicLiveKnowledgeSummary(wrongRows).unpreservedIntegrityRecords,1);
