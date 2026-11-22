import assert from 'node:assert/strict';
import {normalizeForeverDbClass,cachedGermanClassSpells,CLASS_BY_ID} from './class-training-store.mjs';

assert.equal(CLASS_BY_ID[8],'mage');
assert.equal(CLASS_BY_ID[11],'druid');

const realSchema=normalizeForeverDbClass({
  id:8,name:'Magier',
  abilities:[{
    name:'Feuerball',line:'Fire',learned:'Trainer',newInForever:false,
    ranks:[{id:133,rank:'Rang 1',learnedLevel:1},{id:143,rank:'Rang 2',learnedLevel:6}]
  },{
    name:'Arkane Konzentration',line:'Arcane',learned:'Talent',
    ranks:[{id:11213,rank:'Rang 1',learnedLevel:15}]
  }]
},'mage');
assert.equal(realSchema.abilities.length,1,'Reales ForeverDB-Feld learned unterscheidet Trainer von Talent/Quest');
assert.equal(realSchema.abilities[0].school,'Fire');
assert.deepEqual(realSchema.abilities[0].ranks.map(rank=>rank.id),[133,143]);
assert.deepEqual(realSchema.abilities[0].ranks.map(rank=>rank.requiredLevel),[1,6]);

const mage=normalizeForeverDbClass({
  id:8,name:'Magier',
  trainers:[
    {id:331,name:'Maginor Dumas',title:'Meistermagier',side:'alliance',seenInForever:true,zone:'Sturmwind',x:38.2,y:80.1}
  ],
  abilities:[
    {
      id:116,name:'Frostblitz',type:'Trainer',school:'Frost',
      ranks:[
        {id:116,rank:'Rang 1',learnAtLevel:4,trainerCost:100,trainerCostSource:'forever'},
        {id:205,rank:'Rang 2',learnAtLevel:8,trainerCost:200,trainerCostSource:'classic'}
      ]
    },
    {
      id:11213,name:'Arkane Konzentration',type:'Talent',ranks:[
        {id:11213,rank:'Rang 1',requiredLevel:10}
      ]
    },
    {
      id:999,name:'Questzauber',type:'Quest',ranks:[{id:999,requiredLevel:10}]
    }
  ]
},'mage');

assert.equal(mage.slug,'mage');
assert.equal(mage.abilities.length,1,'Nur echte Lehrerfähigkeiten gehören in den Klassen-Ausbildungs-Master');
assert.equal(mage.abilities[0].name,'Frostblitz');
assert.deepEqual(mage.abilities[0].ranks.map(rank=>rank.id),[116,205]);
assert.equal(mage.abilities[0].ranks[0].requiredLevel,4);
assert.equal(mage.abilities[0].ranks[0].priceCopper,100);
assert.equal(mage.abilities[0].ranks[0].priceSource,'forever-observed');
assert.equal(mage.abilities[0].ranks[1].priceSource,'classic');
assert.equal(mage.abilities[0].ranks[0].sources.length,1,'Klassenlehrer auf Klassenebene werden als Quellen vererbt');
assert.equal(mage.abilities[0].ranks[0].sources[0].name,'Maginor Dumas');
assert.equal(mage.abilities[0].ranks[0].sources[0].evidence,'forever-confirmed');
assert.equal(mage.abilities[0].ranks[0].sources[0].priceCopper,100,'Rangpreis wird an den konkreten Lehrer vererbt');

const nested=normalizeForeverDbClass({
  name:'Druide',
  abilities:[{
    name:'Heilende Berührung',kind:'Class Trainer',
    ranks:[{
      spell:{id:5185,name:'Heilende Berührung'},rankName:'Rang 1',required_level:1,
      learnedFrom:{
        trainerCost:80,trainerCostSource:'forever',
        trainers:[{npc:{id:4217,name:'Mathrengyl Bearwalker'},side:'alliance',seen_in_forever:true,location:{zone:'Darnassus',x:35.4,y:8.4}}]
      }
    }]
  }]
},'druid');
assert.equal(nested.abilities[0].ranks[0].sources[0].id,4217);
assert.equal(nested.abilities[0].ranks[0].sources[0].priceCopper,80);
assert.equal(nested.abilities[0].ranks[0].sources[0].priceSource,'forever-observed');

const fallback=normalizeForeverDbClass({
  name:'Magier',
  abilities:[{
    name:'Frostblitz',type:'Ausbilder',
    ranks:[{spellId:205,rank:'Rang 2',learnedLevel:8}]
  }]
},'mage');
assert.equal(fallback.trainers.length,3,'Fehlt ein Lehrerobjekt in der Klassen-API, nutzt der Master die zentral bestätigten Zephras-Lehrer');
assert.equal(fallback.trainers[0].evidence,'forever-confirmed');
assert.equal(fallback.abilities[0].ranks[0].sources.length,3);
assert.equal(fallback.abilities[0].ranks[0].sources[0].location.zone,'Insel Zephras');
assert.equal(fallback.abilities[0].ranks[0].requiredLevel,8,'ForeverDB-Feld learnedLevel wird als Lernlevel erkannt');

const hunter=normalizeForeverDbClass({
  name:'Jäger',
  abilities:[
    {name:'Beißen',line:'Beast Training',learned:'Trainer',ranks:[{id:17254,rank:'Rank 1',learnedLevel:1}]},
    {name:'Arkaner Schuss',line:'Marksmanship',learned:'Trainer',ranks:[{id:3044,rank:'Rank 1',learnedLevel:6}]}
  ]
},'hunter');
assert.equal(hunter.abilities.length,1,'Begleitertraining bleibt aus der Kategorie Klassenfähigkeiten heraus');
assert.equal(hunter.abilities[0].ranks[0].id,3044);

const previousKey=process.env.FOREVERDB_API_KEY;
process.env.FOREVERDB_API_KEY='test-key';
const localized=await cachedGermanClassSpells([133,143],{
  fetchImpl:async url=>{
    const id=Number(new URL(url).pathname.split('/').pop());
    const data=id===133
      ?{id:133,name:'Feuerball',rank:'Rang 1',requiredLevel:1}
      :{id:143,name:'Feuerball',rank:'Rang 2',requiredLevel:6};
    return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({data})};
  }
});
if(previousKey===undefined)delete process.env.FOREVERDB_API_KEY;else process.env.FOREVERDB_API_KEY=previousKey;
assert.equal(localized[133].name,'Feuerball');
assert.equal(localized[143].rank,'Rang 2');

console.log('Klassenmaster: Lehrerfähigkeiten, Ränge, Level, Quellen und Preis-Provenienz: OK');
