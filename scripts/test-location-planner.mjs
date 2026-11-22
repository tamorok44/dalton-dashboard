import assert from 'node:assert/strict';
import {buildLocationPlanner} from './location-planner.mjs';

const vendor=(id,name,zone,priceCopper,extra={})=>({
  type:'vendor',evidence:'forever-confirmed',side:'alliance',id,name,
  location:{zone,uiMapId:zone==='Stormwind'?1453:zone==='Ironforge'?1455:null,x:id/10,y:id/20},
  priceCopper,...extra
});
const trainer=(id,name,zone,priceCopper,extra={})=>({
  type:'trainer',evidence:'forever-confirmed',side:'alliance',id,name,
  location:{zone,uiMapId:zone==='Stormwind'?1453:zone==='Ironforge'?1455:null,x:id/10,y:id/20},
  priceCopper,...extra
});
const expertCookbookSource={
  type:'vendor',evidence:'forever-confirmed',side:'alliance',id:3955,name:'Shandrina',
  location:{zone:'Ashenvale',uiMapId:1440,x:49.6,y:67.1},
  priceCopper:10000
};
const baseCharacter={
  slug:'cole-dalton',name:'Cole Dalton',player:'Christian',level:12,classId:8,class:'Magier',faction:'Allianz',
  professionDetailsVerified:true,
  professions:[
    {id:171,name:'Alchemie',current:58,max:75,knownRecipes:[{id:100,name:'Bekanntes Rezept'}]},
    {id:185,name:'Kochkunst',current:130,max:150,knownRecipes:[]}
  ]
};
const data={generatedAt:'2026-11-22T12:00:00.000Z',characters:[baseCharacter]};
const recipes=[
  {id:100,name:'Bekanntes Rezept',professionSlug:'alchemy',requiredSkill:1,craftedItem:{id:500,name:'Bekannt'},learning:{sources:[vendor(1,'Alfred','Stormwind',50)]}},
  {id:101,name:'Elixier A',professionSlug:'alchemy',requiredSkill:25,craftedItem:{id:501,name:'Elixier A'},learning:{sources:[vendor(1,'Alfred','Stormwind',100)]}},
  {id:102,name:'Elixier B',professionSlug:'alchemy',requiredSkill:40,craftedItem:{id:502,name:'Elixier B'},learning:{sources:[vendor(1,'Alfred','Stormwind',200)]}},
  {id:103,name:'Zu schwer',professionSlug:'alchemy',requiredSkill:60,craftedItem:{id:503,name:'Zu schwer'},learning:{sources:[vendor(1,'Alfred','Stormwind',300)]}},
  {id:104,name:'Eisenschmiede-Rezept',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:504,name:'Fern'},learning:{sources:[vendor(3,'Clara','Ironforge',80)]}},
  {id:105,name:'Lehrerrezept',professionSlug:'alchemy',requiredSkill:50,craftedItem:{id:505,name:'Lehrer'},learning:{sources:[trainer(10,'Lehrer Eins','Stormwind',350)]}},
  {id:106,name:'Normales Rezept ohne Levelangabe',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:506,name:'Normal'},learning:{sources:[vendor(5,'Emil','Stormwind',90)]}},
  {id:107,name:'Classic unsicher',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:507,name:'Unsicher'},learning:{sources:[{...vendor(6,'Dora','Stormwind',70),evidence:'classic-unconfirmed'}]}}
];
const index={recipes,professions:[]};
const professionMasters={
  alchemy:{
    slug:'alchemy',name:'Alchemie',
    ranks:[
      {id:1,name:'Lehrling',skillCap:75,requiredSkill:1,requiredLevel:5,sources:[]},
      {id:2,name:'Geselle',skillCap:150,requiredSkill:50,requiredLevel:10,priceCopper:500,sources:[trainer(20,'Alchemielehrer','Stormwind',500)]}
    ]
  },
  cooking:{
    slug:'cooking',name:'Kochkunst',
    ranks:[
      {id:3,name:'Geselle',skillCap:150,requiredSkill:50,requiredLevel:10,sources:[]},
      {id:4,name:'Experte',skillCap:225,requiredSkill:125,requiredLevel:20,priceCopper:10000,sources:[expertCookbookSource]}
    ]
  }
};
const extraActions=[{
  key:'class:1459',id:1459,name:'Arkane Fähigkeit',category:'class-abilities',
  verified:true,availableNow:true,characterSlug:'cole-dalton',
  sources:[trainer(30,'Magierlehrer','Stormwind',1000)]
},{
  key:'pet:1',id:1,name:'Nicht belegte Begleiterfähigkeit',category:'companion-abilities',
  verified:false,availableNow:true,characterSlug:'cole-dalton',
  sources:[trainer(40,'Begleiterlehrer','Stormwind',100)]
}];

const overview=buildLocationPlanner(data,index,{characterSlug:'cole-dalton',professionMasters,extraActions});
assert.equal(overview.counts.availableNow,7,'Nur jetzt mögliche Rezepte, Berufsausbildungen und verifizierte Zusatzaktionen zählen');
assert.deepEqual(overview.locations.map(x=>[x.name,x.actionCount]),[['Eisenschmiede',1],['Sturmwind',6]],
  'Level-20-Berufsausbildung taucht für einen Level-12-Charakter an keinem Ort auf');

const stormwind=buildLocationPlanner(data,index,{characterSlug:'cole-dalton',location:'Sturmwind',professionMasters,extraActions});
assert.equal(stormwind.selectedLocation,'Sturmwind');
assert.equal(stormwind.counts.atLocation,6);
assert.equal(stormwind.actions.some(action=>action.id===106),true,'Normale Rezepte benötigen keine erfundene Charakterlevel-Prüfung');
assert.equal(stormwind.actions.some(action=>action.name==='Nicht belegte Begleiterfähigkeit'),false,'Unbestätigte Begleiteraktionen bleiben unsichtbar');
assert.equal(stormwind.actions.find(action=>action.id===101)?.source.name,'Alfred');
assert.equal(stormwind.actions.find(action=>action.id===105)?.source.role,'Lehrer');
assert.equal(stormwind.actions.some(action=>action.type==='profession-training'&&action.profession==='Alchemie'),true,
  'Jetzt mögliche Berufsausbildung wird aufgenommen, wenn Rang, Level und Quelle belegt sind');
assert.equal(stormwind.actions.some(action=>action.category==='class-abilities'),true,'Verifizierte externe Klassenaktion kann vom gemeinsamen Resolver aufgenommen werden');
assert.deepEqual(Object.fromEntries(stormwind.categories.map(c=>[c.id,c.actionCount])),{
  'class-abilities':1,
  'profession-recipes':4,
  'profession-training':1,
  'companion-abilities':0
});
assert.equal(stormwind.counts.knownPrices,6);
assert.equal(stormwind.counts.unknownPrices,0);

const level20Data={...data,characters:[{...baseCharacter,level:20}]};
const level20=buildLocationPlanner(level20Data,index,{characterSlug:'cole-dalton',professionMasters,extraActions});
assert.ok(level20.locations.some(location=>location.name==='Eschental'),
  'Kochkunst-Experte wird erst ab belegtem Charakterlevel 20 als Reiseerledigung freigeschaltet');
const ashenvale=buildLocationPlanner(level20Data,index,{characterSlug:'cole-dalton',location:'Eschental',professionMasters,extraActions});
const expertCooking=ashenvale.actions.find(action=>action.type==='profession-training'&&action.profession==='Kochkunst');
assert.ok(expertCooking,'Expertenkochbuch erscheint ab Level 20 und Kochkunst 125+');
assert.equal(expertCooking.requiredLevel,20);
assert.equal(expertCooking.requiredSkill,125);
assert.equal(expertCooking.source.name,'Shandrina');

const unverifiedData={...data,characters:[{...baseCharacter,professionDetailsVerified:false}]};
const unverified=buildLocationPlanner(unverifiedData,index,{characterSlug:'cole-dalton',professionMasters});
assert.equal(unverified.actions.length,0);
assert.equal(unverified.counts.availableNow,1,
  'Unbestätigter Rezeptstand blendet Rezepte aus; eine unabhängig belegte Berufsausbildung darf weiter ermittelt werden');

assert.throws(()=>buildLocationPlanner(data,index,{characterSlug:'unknown'}),/Charakter nicht gefunden/);
console.log('Ortsplaner: Rezepte, Berufsausbildung, Level, Quellen, Kategorien und fail-closed Regeln: OK');
