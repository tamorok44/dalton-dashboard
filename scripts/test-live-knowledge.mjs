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
const current=[pref+'merchant:1.60.1.71037:id-1',pref+'trainer:1.60.1.71037:id-2'];
const old=pref+'merchant:1.60.1.70999:id-1';
const found=await loadLiveKnowledge({build:'1.60.1.71037',kind:'merchant',enabled:true,redisImpl:async command=>{
  calls.push(command);
  if(command[0]==='SMEMBERS')return [...current,old];
  if(command[0]==='MGET')return command.slice(1).map(()=>JSON.stringify(records[0]));
  throw Error(command[0]);
}});
assert.equal(found.length,1);
assert.deepEqual(calls[1],['MGET',current[0]],'Read only matching build and kind, no obsolete snapshot payloads');

const personal=snapshotsFromAddonPayload(payload,{characterSlug:'cole-dalton'});
assert.equal(personal.find(s=>s.kind==='merchant').characterSlug,'cole-dalton');
const personalRecords=records.map(r=>r.kind==='merchant'?{...r,characterSlug:'cole-dalton'}:r);
assert.equal(liveKnowledgeAsAddonStates(personalRecords)[0].characterSlug,'cole-dalton');
