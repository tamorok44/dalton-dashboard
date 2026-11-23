import assert from 'node:assert/strict';
import {normalizeForeverDbClass,cachedGermanClassSpells,fetchForeverDbPublicClassTrainers,CLASS_BY_ID} from './class-training-store.mjs';

assert.equal(CLASS_BY_ID[8],'mage');
assert.equal(CLASS_BY_ID[11],'druid');

const publicTrainers=await fetchForeverDbPublicClassTrainers(8,{
  fetchImpl:async()=>({
    ok:true,status:200,
    json:async()=>({classTrainers:{'8':[
      {npc:331,n:'Maginor Dumas',sub:'Mage Trainer',side:'Alliance',m:1453,zone:'Stormwind',x:38.2,y:80.1,at:'forever',fv:1,seen:4},
      {npc:999,n:'Alter Classic-Lehrer',sub:'Mage Trainer',side:'Alliance',m:1453,zone:'Stormwind',x:40,y:80,fv:0},
      {npc:1000,n:'Gebirgslehrer',sub:'Mage Trainer',side:'Alliance',m:1416,zone:'Alterac Mountains',x:42,y:50,at:'forever',fv:1}
    ]}})
  })
});
assert.equal(publicTrainers.length,3);
assert.equal(publicTrainers[0].id,331);
assert.equal(publicTrainers[0].name,'Maginor Dumas');
assert.equal(publicTrainers[0].npcTitle,'Mage Trainer');
assert.equal(publicTrainers[0].location.zone,'Stormwind');
assert.equal(publicTrainers.find(source=>source.id===1000)?.location.zone,'Alteracgebirge','Sichtbare Lehrerorte folgen der source-backed deutschen ForeverDB-Map-ID-Zuordnung');
assert.equal(publicTrainers[0].location.uiMapId,1453);
assert.equal(publicTrainers[0].evidence,'forever-confirmed');
assert.equal(publicTrainers[1].evidence,'classic-unconfirmed');

const realSchema=normalizeForeverDbClass({
  id:8,name:'Magier',
  abilities:[{
    name:'Feuerball',line:'Fire',learned:'Trainer',newInForever:false,
    ranks:[{id:133,rank:'Rang 1',learnedLevel:1},{id:143,rank:'Rang 2',learnedLevel:6}]
  },{
    name:'Chilled',line:'Frost',learned:'Trainer',
    ranks:[{id:12484,rank:'',learnedLevel:1}]
  },{
    name:'Arkane Konzentration',line:'Arcane',learned:'Talent',
    ranks:[{id:11213,rank:'Rang 1',learnedLevel:15}]
  }]
},'mage');
assert.equal(realSchema.abilities.length,1,'Reales ForeverDB-Feld learned unterscheidet Trainer von Talent/Quest');
assert.equal(realSchema.abilities[0].school,'Fire');
assert.deepEqual(realSchema.abilities[0].ranks.map(rank=>rank.id),[143],'Automatisch bekannte Startzauber ohne Lehrerbeleg werden nicht als Kauf angeboten');
assert.deepEqual(realSchema.abilities[0].ranks.map(rank=>rank.requiredLevel),[6]);
assert.equal(realSchema.abilities[0].ranks[0].priceCopper,100);
assert.equal(realSchema.abilities[0].ranks[0].priceSource,'classic');
assert.equal(realSchema.abilities.some(ability=>ability.name==='Chilled'),false,'Interner Effekt ohne Unterrichtsevidenz bleibt fail-closed aus der Klassenausbildung');

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

const trainerRoles=normalizeForeverDbClass({
  name:'Magier',
  trainers:[
    {id:331,name:'Maginor Dumas',title:'Mage Trainer',side:'alliance',seenInForever:true,zone:'Sturmwind',x:38.2,y:80.1},
    {id:2485,name:'Larimaine Purdue',title:'Portal Trainer',side:'alliance',seenInForever:true,zone:'Sturmwind',x:39.9,y:81.4}
  ],
  abilities:[
    {name:'Feuerball',type:'Trainer',ranks:[{id:143,rank:'Rang 2',learnedLevel:6}]},
    {name:'Teleport: Stormwind',type:'Trainer',ranks:[{id:3561,rank:'',learnedLevel:20}]}
  ]
},'mage');
assert.equal(trainerRoles.abilities[0].ranks[0].sources.some(source=>/Portal Trainer/i.test(source.npcTitle||'')),false,'Portal-Lehrer bietet keine normalen Magierzauber an');
const teleport=trainerRoles.abilities.find(ability=>/Teleport/i.test(ability.name));
assert.ok(teleport);
assert.ok(teleport.ranks[0].sources.length>0&&teleport.ranks[0].sources.every(source=>/Portal Trainer/i.test(source.npcTitle||'')),'Teleport-Ränge werden ausschließlich Portal-Lehrern zugeordnet');

const hunter=normalizeForeverDbClass({
  name:'Jäger',
  abilities:[
    {name:'Beißen',line:'Beast Training',learned:'Trainer',ranks:[{id:17254,rank:'Rank 1',learnedLevel:1}]},
    {name:'Arkaner Schuss',line:'Marksmanship',learned:'Trainer',ranks:[{id:3044,rank:'Rank 1',learnedLevel:6}]}
  ]
},'hunter');
assert.equal(hunter.abilities.length,1,'Begleitertraining bleibt aus der Kategorie Klassenfähigkeiten heraus');
assert.equal(hunter.abilities[0].ranks[0].id,3044);

let publicFetches=0;
const localized=await cachedGermanClassSpells([133,143],{
  fetchImpl:async url=>{
    publicFetches++;
    const pathname=new URL(url).pathname;
    if(pathname.endsWith('/l10n/de/spells.json')){
      return {ok:true,status:200,json:async()=>({
        '133':{n:'Feuerball',r:'Rang 1'},
        '143':{n:'Feuerball',r:'Rang 2'}
      })};
    }
    if(pathname.endsWith('/classes.json')){
      return {ok:true,status:200,json:async()=>[
        {id:8,n:'Mage',abilities:[{n:'Fireball',ranks:[
          {id:133,lv:1,r:'Rank 1',ic:135812},
          {id:143,lv:6,r:'Rank 2',ic:135812}
        ]}]}
      ]};
    }
    throw new Error('Unerwartete öffentliche ForeverDB-Datei: '+pathname);
  }
});
assert.equal(publicFetches,2,'Deutsche Klassennamen und Icons werden aus zwei öffentlichen Builddateien statt einzelnen API-Spellrequests geladen');
assert.equal(localized[133].name,'Feuerball');
assert.equal(localized[143].rank,'Rang 2');
assert.equal(localized[143].iconId,135812);

console.log('Klassenmaster: Lehrerfähigkeiten, Ränge, Level, Quellen und Preis-Provenienz: OK');
