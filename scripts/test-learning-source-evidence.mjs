import assert from 'node:assert/strict';
import {applyLearningSourceEvidence,buildAddonLearningSourceEvidence,mergeLearningSourceEvidence} from './learning-source-evidence.mjs';

const vendor=(id,name,priceCopper)=>({
  type:'vendor',id,name,evidence:'forever-confirmed',seenInForever:true,
  location:{zone:'Zephras Isle'},priceCopper,priceSource:'forever-observed'
});
const trainer=(id,name,priceCopper)=>({
  type:'trainer',id,name,evidence:'forever-confirmed',seenInForever:true,
  location:{zone:'Zephras Isle'},priceCopper,priceSource:'forever-observed'
});
const base={
  build:'1.60.1.71037',
  recipes:[
    {
      id:100,professionSlug:'cooking',name:'Slitherskin Mackerel',craftedItem:{id:787,name:'Slitherskin Mackerel'},
      learning:{sources:[vendor(257006,'Nyalah Brightfire',40),vendor(123,'Other Vendor',40)]}
    },
    {
      id:101,professionSlug:'cooking',name:'Sagefish Delight',craftedItem:{id:21217,name:'Sagefish Delight'},
      learning:{sources:[vendor(257006,'Nyalah Brightfire',4000)]}
    },
    {
      id:102,professionSlug:'cooking',name:'Spider Sausage',craftedItem:{id:17222,name:'Spider Sausage'},
      learning:{sources:[trainer(257006,'Nyalah Brightfire',3000)]}
    },
    {
      id:103,professionSlug:'cooking',name:'Smoked Sagefish',craftedItem:{id:21072,name:'Smoked Sagefish'},
      learning:{sources:[]}
    }
  ]
};
const evidence={
  schemaVersion:1,updatedOn:'2026-11-23',
  observations:[
    {npcId:257006,sourceType:'vendor',professionSlug:'cooking',craftedItemId:787,status:'present',build:'1.60.1.71037',observedOn:'2026-11-20',source:'external-live'},
    {npcId:257006,sourceType:'vendor',professionSlug:'cooking',craftedItemId:787,status:'absent',build:'1.60.1.71037',observedOn:'2026-11-23',source:'dalton-live'},
    {npcId:257006,sourceType:'vendor',professionSlug:'cooking',craftedItemId:21217,status:'present',priceCopper:5000,build:'1.60.1.71037',observedOn:'2026-11-23',source:'dalton-live'},
    {npcId:257006,sourceType:'trainer',professionSlug:'cooking',craftedItemId:17222,status:'present',priceCopper:4000,build:'1.60.1.71037',observedOn:'2026-11-23',source:'dalton-live'},
    {npcId:257006,npcName:'Nyalah Brightfire',sourceType:'vendor',professionSlug:'cooking',craftedItemId:21072,status:'present',priceCopper:500,location:{zone:'Insel Zephras'},build:'1.60.1.71037',observedOn:'2026-11-23',source:'dalton-live'}
  ]
};

const evaluated=applyLearningSourceEvidence(base,evidence);
assert.deepEqual(evaluated.recipes[0].learning.sources.map(source=>source.id),[123],
  'Eine direkte negative Dalton-Beobachtung verdrängt eine ältere positive Händlerzuordnung, ohne andere Händler zu entfernen');
assert.equal(evaluated.recipes[1].learning.sources[0].priceCopper,5000,
  'Direkt beobachteter aktueller Preis überschreibt einen älteren Preis');
assert.equal(evaluated.recipes[1].learning.sources[0].offerEvidenceSource,'dalton-live');
assert.equal(evaluated.recipes[2].learning.sources[0].priceCopper,4000,
  'Die Evidenzschicht funktioniert auch für Lehrerangebote');
assert.equal(evaluated.recipes[3].learning.sources.length,1,
  'Eine direkte aktuelle Beobachtung ergänzt auch eine Bezugsquelle, die im Masterkatalog fehlt');
assert.equal(evaluated.recipes[3].learning.sources[0].id,257006);
assert.equal(evaluated.recipes[3].learning.sources[0].location.zone,'Insel Zephras');
assert.equal(evaluated.recipes[3].learning.sources[0].priceCopper,500);
assert.equal(evaluated.learningSourceEvidence.blockedSourceCount,1);
assert.equal(evaluated.learningSourceEvidence.confirmedSourceCount,3);

const nextBuild=applyLearningSourceEvidence({...base,build:'1.60.1.72000'},evidence);
assert.equal(nextBuild.recipes[0].learning.sources.length,2,
  'Buildgebundene Beobachtungen werden nach einem Client-Buildwechsel nicht blind weiterverwendet');

console.log('Lernquellen-Evidenz: Buildbindung, negative Beobachtungen und Preispriorität: OK');


const addonBase={
  build:'1.60.1.71037',
  recipes:[
    {
      id:200,professionSlug:'cooking',name:'Glitschhautmakrele',craftedItem:{id:787,name:'Glitschhautmakrele'},
      learning:{sources:[vendor(257006,'Nyalah Brightfire',40)]}
    },
    {
      id:201,professionSlug:'cooking',name:'Geräucherter Weisenfisch',craftedItem:{id:21072,name:'Geräucherter Weisenfisch'},
      learning:{sources:[{type:'item',id:21099,name:'Rezept: Geräucherter Weisenfisch',evidence:'forever-confirmed'}]}
    },
    {
      id:202,professionSlug:'cooking',name:'Weisenfisch Supreme',craftedItem:{id:21217,name:'Weisenfisch Supreme'},
      learning:{sources:[vendor(257006,'Nyalah Brightfire',4000)]}
    },
    {
      id:203,professionSlug:'cooking',name:'Spinnenwurst',craftedItem:{id:17222,name:'Spinnenwurst'},
      learning:{sources:[trainer(257006,'Nyalah Brightfire',3000)]}
    }
  ]
};
const addonState={
  characterSlug:'cole-dalton',
  receivedAt:'2026-11-24T08:36:00.000Z',
  payload:{
    addon:{version:'0.1.0-alpha.8',gameVersion:'1.60.1',build:'71037',locale:'deDE'},
    sections:{
      interactions:{
        merchantHistory:[
          {
            capturedAt:1795509206,complete:false,build:'71037',gameVersion:'1.60.1',
            npc:{id:257006,name:'Nyalah Brightfire'},
            location:{zone:'Die Insel Zephras',mapID:2521,x:0.6064,y:0.7269},
            items:{1:{itemID:21099,name:'Rezept: Geräucherter Weisenfisch',priceCopper:500}}
          },
          {
            capturedAt:1795509207,complete:true,build:'71037',gameVersion:'1.60.1',
            npc:{id:257006,name:'Nyalah Brightfire'},
            location:{zone:'Die Insel Zephras',mapID:2521,x:0.6064,y:0.7269},
            items:{
              1:{itemID:159,name:'Erfrischendes Quellwasser',priceCopper:25},
              10:{itemID:21099,name:'Rezept: Geräucherter Weisenfisch',priceCopper:500},
              11:{itemID:21219,name:'Rezept: Weisenfisch Supreme',priceCopper:5000}
            }
          }
        ],
        trainerHistory:[
          {
            capturedAt:1795509208,complete:true,build:'71037',gameVersion:'1.60.1',
            npc:{id:257006,name:'Nyalah Brightfire'},
            location:{zone:'Die Insel Zephras',mapID:2521,x:0.6064,y:0.7269},
            services:{
              1:{name:'Spinnenwurst',serviceType:'unavailable',priceCopper:4000,skillLine:'Kochkunst',requiredSkillName:'Kochkunst',requiredSkillRank:200}
            }
          }
        ]
      }
    }
  }
};
const addonEvidence=buildAddonLearningSourceEvidence(addonBase,[addonState]);
assert.ok(addonEvidence.observations.some(entry=>
  entry.source==='dalton-addon'&&entry.sourceType==='vendor'&&entry.recipeId===200&&entry.status==='absent'
),'Ein vollständiger Händler-Snapshot widerlegt eine bisherige Vendor-Zuordnung, wenn das Rezept tatsächlich fehlt');
assert.ok(addonEvidence.observations.some(entry=>
  entry.sourceType==='vendor'&&entry.recipeId===201&&entry.status==='present'&&entry.priceCopper===500&&entry.offerItemId===21099
),'Ein Rezeptgegenstand wird über seine Item-ID dem gelernten Rezept zugeordnet');
assert.ok(addonEvidence.observations.some(entry=>
  entry.sourceType==='vendor'&&entry.recipeId===202&&entry.status==='present'&&entry.priceCopper===5000
),'Ein lokalisierter Rezeptname kann eine fehlende/alte Händlerzuordnung korrekt bestätigen');
const spider=addonEvidence.observations.find(entry=>entry.sourceType==='trainer'&&entry.recipeId===203&&entry.status==='present');
assert.equal(spider?.priceCopper,4000);
assert.equal(spider?.requiredSkillRank,200);
assert.equal(spider?.requiredSkillName,'Kochkunst');

const incompleteOnly=buildAddonLearningSourceEvidence(addonBase,[{
  payload:{addon:{gameVersion:'1.60.1',build:'71037'},sections:{interactions:{merchantHistory:[
    {capturedAt:1795509206,complete:false,npc:{id:257006,name:'Nyalah Brightfire'},items:{}}
  ]}}}
}]);
assert.ok(!incompleteOnly.observations.some(entry=>entry.status==='absent'),
  'Unvollständige Händlerfenster dürfen niemals negative Evidenz erzeugen');

const addonEvaluated=applyLearningSourceEvidence(addonBase,mergeLearningSourceEvidence(addonEvidence),{characterSlug:'cole-dalton'});
assert.equal(addonEvaluated.recipes[0].learning.sources.length,0,
  'Die echte Addon-Beobachtung entfernt Nyalah als Glitschhautmakrelen-Quelle');
assert.equal(addonEvaluated.recipes[1].learning.sources.some(source=>source.id===257006&&source.priceCopper===500),true,
  'Die Addon-Beobachtung ergänzt Nyalah als aktuelle Quelle für Geräucherten Weisenfisch');
assert.equal(addonEvaluated.recipes[2].learning.sources.find(source=>source.id===257006)?.priceCopper,5000);
assert.equal(addonEvaluated.recipes[3].learning.sources.find(source=>source.id===257006)?.priceCopper,4000);

console.log('Addon-Liveevidenz: vollständige Händlerfenster, Rezept-Item-Mapping und Traineranforderungen: OK');

const otherView=applyLearningSourceEvidence(addonBase,addonEvidence,{characterSlug:'dolly-dalton'});
assert.equal(otherView.recipes[0].learning.sources.length,1,'Coles fehlendes Angebot darf bei Dolly nicht gelöscht werden');
assert.equal(otherView.recipes[2].learning.sources[0].priceCopper,4000,'Coles persönlicher Preis überschreibt nicht Dollys Quelle');
const sharedView=applyLearningSourceEvidence(addonBase,addonEvidence);
assert.equal(sharedView.recipes[0].learning.sources.length,1,'Gemeinsamer Katalog bleibt von persönlicher negativer Beobachtung unberührt');
const anonymous=buildAddonLearningSourceEvidence(addonBase,[{...addonState,characterSlug:null}]);
assert.equal(applyLearningSourceEvidence(addonBase,anonymous,{characterSlug:'cole-dalton'}).recipes[0].learning.sources.length,1,'Alte Beobachtung ohne Zuordnung bleibt historisch');
const conflicting=mergeLearningSourceEvidence(addonEvidence,{observations:[{...addonEvidence.observations.find(o=>o.recipeId===200&&o.status==='absent'),characterSlug:'dolly-dalton',status:'present',priceCopper:70}]});
assert.equal(applyLearningSourceEvidence(addonBase,conflicting,{characterSlug:'cole-dalton'}).recipes[0].learning.sources.length,0);
assert.equal(applyLearningSourceEvidence(addonBase,conflicting,{characterSlug:'dolly-dalton'}).recipes[0].learning.sources[0].priceCopper,70);

// A large catalog must not change the exact result of personal evidence.
const unrelated=Array.from({length:2300},(_,i)=>({id:10000+i,name:'Unrelated '+i,professionSlug:'cooking',craftedItem:{id:40000+i,name:'Other '+i},learning:{sources:[vendor(40000+i,'Other vendor '+i,50)]}}));
const expanded={...addonBase,recipes:[...addonBase.recipes,...unrelated]};
const expandedEvidence=buildAddonLearningSourceEvidence(expanded,[addonState]);
assert.deepEqual(expandedEvidence,addonEvidence,'Indexing must not broaden or lose exact evidence matches');
assert.deepEqual(applyLearningSourceEvidence(expanded,expandedEvidence,{characterSlug:'cole-dalton'}).recipes.slice(0,addonBase.recipes.length),addonEvaluated.recipes);
