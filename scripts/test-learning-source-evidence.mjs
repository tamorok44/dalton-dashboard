import assert from 'node:assert/strict';
import {applyLearningSourceEvidence} from './learning-source-evidence.mjs';

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
    }
  ]
};
const evidence={
  schemaVersion:1,updatedOn:'2026-11-23',
  observations:[
    {npcId:257006,sourceType:'vendor',professionSlug:'cooking',craftedItemId:787,status:'present',build:'1.60.1.71037',observedOn:'2026-11-20',source:'external-live'},
    {npcId:257006,sourceType:'vendor',professionSlug:'cooking',craftedItemId:787,status:'absent',build:'1.60.1.71037',observedOn:'2026-11-23',source:'dalton-live'},
    {npcId:257006,sourceType:'vendor',professionSlug:'cooking',craftedItemId:21217,status:'present',priceCopper:5000,build:'1.60.1.71037',observedOn:'2026-11-23',source:'dalton-live'},
    {npcId:257006,sourceType:'trainer',professionSlug:'cooking',craftedItemId:17222,status:'present',priceCopper:4000,build:'1.60.1.71037',observedOn:'2026-11-23',source:'dalton-live'}
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
assert.equal(evaluated.learningSourceEvidence.blockedSourceCount,1);
assert.equal(evaluated.learningSourceEvidence.confirmedSourceCount,2);

const nextBuild=applyLearningSourceEvidence({...base,build:'1.60.1.72000'},evidence);
assert.equal(nextBuild.recipes[0].learning.sources.length,2,
  'Buildgebundene Beobachtungen werden nach einem Client-Buildwechsel nicht blind weiterverwendet');

console.log('Lernquellen-Evidenz: Buildbindung, negative Beobachtungen und Preispriorität: OK');
