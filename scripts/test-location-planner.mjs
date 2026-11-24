import assert from 'node:assert/strict';
import {buildLocationPlanner} from './location-planner.mjs';

const vendor=(id,name,zone,priceCopper,extra={})=>({
  type:'vendor',evidence:'forever-confirmed',side:'alliance',id,name,
  location:{zone,uiMapId:zone==='Stormwind'?1453:zone==='Ironforge'?1455:null,x:id/10,y:id/20},
  priceCopper,priceSource:priceCopper===null?null:'forever-observed',...extra
});
const trainer=(id,name,zone,priceCopper,extra={})=>({
  type:'trainer',evidence:'forever-confirmed',side:'alliance',id,name,
  location:{zone,uiMapId:zone==='Stormwind'?1453:zone==='Ironforge'?1455:null,x:id/10,y:id/20},
  priceCopper,priceSource:priceCopper===null?null:'forever-observed',...extra
});
const expertCookbookSource={
  type:'vendor',evidence:'forever-confirmed',side:'alliance',id:3955,name:'Shandrina',
  location:{zone:'Ashenvale',uiMapId:1440,x:49.6,y:67.1},
  priceCopper:10000,priceSource:'forever-observed'
};
const baseCharacter={
  slug:'cole-dalton',name:'Cole Dalton',player:'Christian',level:12,classId:8,class:'Magier',faction:'Allianz',
  professionDetailsVerified:true,
  knownClassAbilitiesVerified:true,
  knownClassAbilities:[{id:116,name:'Frostblitz',rank:'Rang 1'}],
  professions:[
    {id:171,name:'Alchemie',current:58,max:75,knownRecipes:[{id:100,name:'Bekanntes Rezept'}]},
    {id:185,name:'Kochkunst',current:130,max:150,knownRecipes:[]}
  ]
};
const data={generatedAt:'2026-11-22T12:00:00.000Z',characters:[baseCharacter]};
const recipes=[
  {id:100,name:'Bekanntes Rezept',professionSlug:'alchemy',requiredSkill:1,craftedItem:{id:500,name:'Bekannt'},learning:{sources:[vendor(1,'Alfred','Stormwind',50)]}},
  {id:101,name:'Elixier A',professionSlug:'alchemy',requiredSkill:25,craftedItem:{id:501,name:'Elixier A'},learning:{sources:[vendor(1,'Alfred','Stormwind',100),vendor(2,'Bruno','Stormwind',80),vendor(7,'Cäcilia','Stormwind',80),vendor(8,'Dietmar','Stormwind',null),vendor(9,'Borin','Ironforge',90)]}},
  {id:102,name:'Elixier B',professionSlug:'alchemy',requiredSkill:40,craftedItem:{id:502,name:'Elixier B'},learning:{sources:[vendor(1,'Alfred','Stormwind',200)]}},
  {id:103,name:'Zu schwer',professionSlug:'alchemy',requiredSkill:60,craftedItem:{id:503,name:'Zu schwer'},learning:{sources:[vendor(1,'Alfred','Stormwind',300)]}},
  {id:104,name:'Eisenschmiede-Rezept',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:504,name:'Fern'},learning:{sources:[vendor(3,'Clara','Ironforge',80)]}},
  {id:105,name:'Lehrerrezept',professionSlug:'alchemy',requiredSkill:50,craftedItem:{id:505,name:'Lehrer'},learning:{sources:[
    trainer(10,'Lehrer Eins','Stormwind',350),
    trainer(11,'Lehrer Classic','Stormwind',100,{priceSource:'classic'})
  ]}},
  {id:106,name:'Normales Rezept ohne Levelangabe',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:506,name:'Normal'},learning:{sources:[vendor(5,'Emil','Stormwind',90)]}},
  {id:107,name:'Classic unsicher',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:507,name:'Unsicher'},learning:{sources:[{...vendor(6,'Dora','Stormwind',70),evidence:'classic-unconfirmed'}]}}
];
const index={recipes,professions:[]};
const professionMasters={
  alchemy:{
    slug:'alchemy',name:'Alchemie',
    ranks:[
      {id:1,name:null,skillCap:75,requiredSkill:null,requiredLevel:null,sources:[]},
      {id:2,name:null,skillCap:150,requiredSkill:null,requiredLevel:null,priceCopper:null,sources:[]}
    ],
    trainers:[
      trainer(20,"Tel'Athir",'Stormwind',null,{npcTitle:'Journeyman Alchemist'}),
      trainer(21,'Lilliam','Stormwind',null,{npcTitle:'Journeyman Alchemist'})
    ]
  },
  cooking:{
    slug:'cooking',name:'Kochkunst',
    ranks:[
      {id:3,name:'Geselle',skillCap:150,requiredSkill:50,requiredLevel:10,sources:[]},
      {id:4,name:'Experte',skillCap:225,requiredSkill:null,requiredLevel:null,priceCopper:10000,sources:[expertCookbookSource]}
    ]
  }
};
const classMaster={
  slug:'mage',name:'Magier',
  abilities:[{
    id:116,name:'Frostblitz',school:'Frost',type:'Trainer',
    ranks:[
      {id:116,name:'Frostblitz',rank:'Rang 1',requiredLevel:4,priceCopper:100,priceSource:'forever-observed',sources:[trainer(30,'Magierlehrer','Stormwind',100)]},
      {id:205,name:'Frostblitz',rank:'Rang 2',requiredLevel:8,iconId:135846,priceCopper:200,priceSource:'forever-observed',sources:[trainer(30,'Magierlehrer','Stormwind',200)]},
      {id:837,name:'Frostblitz',rank:'Rang 3',requiredLevel:14,priceCopper:400,priceSource:'forever-observed',sources:[trainer(30,'Magierlehrer','Stormwind',400)]}
    ]
  }]
};
const extraActions=[{
  key:'pet:1',id:1,name:'Nicht belegte Begleiterfähigkeit',category:'companion-abilities',
  verified:false,availableNow:true,characterSlug:'cole-dalton',
  sources:[trainer(40,'Begleiterlehrer','Stormwind',100)]
}];

const overview=buildLocationPlanner(data,index,{characterSlug:'cole-dalton',professionMasters,extraActions,classMaster});
assert.equal(overview.counts.availableNow,7,'Globale Anzahl zählt eindeutige Lernziele – dieselbe Erledigung an mehreren Orten nur einmal');
assert.deepEqual(overview.locations.map(x=>[x.name,x.actionCount]),[['Eisenschmiede',2],['Sturmwind',6]],
  'Ortszahlen dürfen dasselbe Lernziel je Ort enthalten, ohne die globale eindeutige Anzahl aufzublähen');
assert.equal(overview.locations.reduce((sum,entry)=>sum+entry.actionCount,0),8,'Ortszählungen können sich wegen alternativer Orte überschneiden');
assert.ok(overview.counts.availableNow<overview.locations.reduce((sum,entry)=>sum+entry.actionCount,0),'Globale Zählung darf überschneidende Ortsangebote niemals doppelt zählen');

const withKnownZero=buildLocationPlanner(data,index,{characterSlug:'cole-dalton',professionMasters,extraActions,classMaster,knownLocations:['Insel Zephras']});
assert.equal(withKnownZero.locations.find(entry=>entry.name==='Insel Zephras')?.actionCount,0,'Bekannte Orte bleiben auch ohne aktuelle Erledigung in der Ortsliste');
const zephras=buildLocationPlanner(data,index,{characterSlug:'cole-dalton',location:'Insel Zephras',professionMasters,extraActions,classMaster,knownLocations:['Insel Zephras']});
assert.equal(zephras.selectedLocation,'Insel Zephras','Ein bekannter Ort mit 0 Erledigungen bleibt auswählbar');
assert.equal(zephras.counts.atLocation,0);
assert.equal(zephras.actions.length,0);
assert.equal(zephras.npcs.length,0);

const stormwind=buildLocationPlanner(data,index,{characterSlug:'cole-dalton',location:'Sturmwind',professionMasters,extraActions,classMaster});
assert.equal(stormwind.selectedLocation,'Sturmwind');
assert.equal(stormwind.counts.atLocation,6);
assert.equal(stormwind.actions.some(action=>action.id===106),true,'Normale Rezepte benötigen keine erfundene Charakterlevel-Prüfung');
assert.equal(stormwind.actions.some(action=>action.name==='Nicht belegte Begleiterfähigkeit'),false,'Unbestätigte Begleiteraktionen bleiben unsichtbar');
const elixirA=stormwind.actions.find(action=>action.id===101);
assert.equal(stormwind.actions.filter(action=>action.id===101).length,1,'Dasselbe Lernziel bleibt trotz mehrerer Händler genau eine Erledigung');
assert.equal(elixirA?.source.name,'Bruno','Der niedrigste bestätigte Preis wird als automatische Quelle bevorzugt');
assert.equal(elixirA?.source.priceCopper,80);
assert.equal(elixirA?.alternatives.length,3,'Am ausgewählten Ort werden nur die dortigen Alternativen angeboten');
assert.equal(elixirA?.alternatives.some(source=>source.name==='Alfred'&&source.priceCopper===100),true);
assert.equal(elixirA?.alternatives.some(source=>source.name==='Dietmar'&&source.priceCopper===null),true);
assert.equal(stormwind.npcs.filter(npc=>npc.actions.some(action=>action.key===elixirA.key)).length,4,'Alle bestätigten Händlerangebote bleiben am jeweiligen NPC sichtbar');
assert.equal(new Set(stormwind.npcs.flatMap(npc=>npc.actions.filter(action=>action.key===elixirA.key).map(action=>action.source.key))).size,4);
const ironforge=buildLocationPlanner(data,index,{characterSlug:'cole-dalton',location:'Eisenschmiede',professionMasters,extraActions,classMaster});
assert.equal(ironforge.actions.filter(action=>action.id===101).length,1,'Dasselbe Elixier erscheint auch in Eisenschmiede nur einmal');
assert.equal(ironforge.actions.find(action=>action.id===101)?.source.name,'Borin');
const trainerRecipe=stormwind.actions.find(action=>action.id===105);
assert.equal(trainerRecipe?.source.role,'Lehrer');
assert.equal(trainerRecipe?.source.name,'Lehrer Eins','Ein bestätigter Forever-Preis hat Vorrang vor einem numerisch billigeren Classic-Fallback');
assert.equal(trainerRecipe?.source.priceCopper,350);
assert.equal(trainerRecipe?.source.priceSource,'forever-observed');
assert.equal(trainerRecipe?.alternatives.find(source=>source.name==='Lehrer Classic')?.priceSource,'classic');
assert.equal(stormwind.actions.some(action=>action.type==='profession-training'&&action.profession==='Alchemie'),true,
  'Jetzt mögliche Berufsausbildung wird aufgenommen, wenn Rang, Level und Quelle belegt sind');
assert.equal(stormwind.actions.find(action=>action.type==='profession-training'&&action.profession==='Alchemie')?.requiredSkill,50,
  'Geselle verwendet bei fehlendem API-Mindestskill den belegten Classic-Trainerwert 50');
const journeymanAlchemy=stormwind.actions.find(action=>action.type==='profession-training'&&action.profession==='Alchemie');
assert.equal(journeymanAlchemy?.requiredLevel,10,
  'Geselle verwendet bei fehlendem API-Level den dokumentierten Classic-Trainerwert 10');
assert.equal(journeymanAlchemy?.requiredLevelSource,'classic-trainer');
assert.equal(journeymanAlchemy?.source.name,'Lilliam',
  'Bei mehreren bestätigten Rang-Lehrern wird der günstigste bestätigte Preis bevorzugt');
assert.equal(journeymanAlchemy?.source.priceCopper,450,'Fehlender ForeverDB-Rangpreis nutzt ausschließlich den dokumentierten Alchemie-Classic-Fallback');
assert.equal(journeymanAlchemy?.source.priceSource,'classic');
assert.equal(journeymanAlchemy?.alternatives.some(source=>source.name==="Tel'Athir"&&source.priceCopper===450&&source.priceSource==='classic'),true);
const frostboltRank2=stormwind.actions.find(action=>action.category==='class-abilities');
assert.equal(frostboltRank2?.id,205,'Bereits gelernter Rang 1 wird bei verifiziertem Spellbook ausgeblendet');
assert.equal(frostboltRank2?.name,'Frostblitz · Rang 2');
assert.equal(frostboltRank2?.iconId,135846,'Klassenlernziel trägt die stabile Icon-ID aus dem gemeinsamen Klassenmaster');
assert.equal(frostboltRank2?.learnedState,'not-known');
assert.equal(frostboltRank2?.source.name,'Magierlehrer');
assert.deepEqual(Object.fromEntries(stormwind.categories.map(c=>[c.id,c.actionCount])),{
  'class-abilities':1,
  'profession-recipes':4,
  'profession-training':1,
  'companion-abilities':0
});
assert.equal(stormwind.counts.knownPrices,6,'Der Preisstatus zählt eindeutige Lernziele, nicht zusätzliche NPC-Angebote');
assert.equal(stormwind.counts.confirmedPrices,5);
assert.equal(stormwind.counts.classicPrices,1,'Classic-Preise bleiben nutzbar, werden aber separat von bestätigten Forever-Preisen gezählt');
assert.equal(stormwind.counts.unknownPriceSources,0);
assert.equal(stormwind.counts.unknownPrices,0,'Eine unbekannte Alternative macht ein Lernziel mit bestätigtem günstigstem Preis nicht unbepreist');

const unknownSpellbookData={...data,characters:[{...baseCharacter,knownClassAbilitiesVerified:false,knownClassAbilities:[]}]};
const unknownSpellbook=buildLocationPlanner(unknownSpellbookData,index,{characterSlug:'cole-dalton',location:'Sturmwind',professionMasters,extraActions,classMaster});
const unknownClassActions=unknownSpellbook.actions.filter(action=>action.category==='class-abilities');
assert.deepEqual(unknownClassActions.map(action=>action.id),[116,205],'Ohne persönlichen Spellbook-Stand werden fällige Klassenränge nicht fälschlich als bereits gelernt entfernt');
assert.ok(unknownClassActions.every(action=>action.learnedState==='unknown'&&action.learnedStateVerified===false));

const level9Data={...data,characters:[{...baseCharacter,level:9}]};
const level9=buildLocationPlanner(level9Data,index,{characterSlug:'cole-dalton',location:'Sturmwind',professionMasters,extraActions,classMaster});
assert.equal(level9.actions.some(action=>action.type==='profession-training'&&action.profession==='Alchemie'),false,
  'Journeyman-Alchemie bleibt unter Charakterlevel 10 trotz Skill 58 ausgeblendet');

const level20Data={...data,characters:[{...baseCharacter,level:20}]};
const level20=buildLocationPlanner(level20Data,index,{characterSlug:'cole-dalton',professionMasters,extraActions,classMaster});
assert.ok(level20.locations.some(location=>location.name==='Eschental'),
  'Kochkunst-Experte wird erst ab belegtem Charakterlevel 20 als Reiseerledigung freigeschaltet');
const ashenvale=buildLocationPlanner(level20Data,index,{characterSlug:'cole-dalton',location:'Eschental',professionMasters,extraActions,classMaster});
const expertCooking=ashenvale.actions.find(action=>action.type==='profession-training'&&action.profession==='Kochkunst');
assert.ok(expertCooking,'Expertenkochbuch erscheint ab Level 20 und Kochkunst 125+');
assert.equal(expertCooking.requiredLevel,20);
assert.equal(expertCooking.requiredLevelSource,'classic-trainer');
assert.equal(expertCooking.requiredSkill,125);
assert.equal(expertCooking.source.name,'Shandrina');

const unverifiedData={...data,characters:[{...baseCharacter,professionDetailsVerified:false}]};
const unverified=buildLocationPlanner(unverifiedData,index,{characterSlug:'cole-dalton',professionMasters});
assert.equal(unverified.actions.length,0);
assert.equal(unverified.counts.availableNow,1,
  'Unbestätigter Rezeptstand blendet Rezepte aus; eine unabhängig belegte Berufsausbildung darf weiter ermittelt werden');

assert.throws(()=>buildLocationPlanner(data,index,{characterSlug:'unknown'}),/Charakter nicht gefunden/);
console.log('Ortsplaner: eindeutige Lernziele, Mehranbieterpreise, Berufsausbildung, Quellen und fail-closed Regeln: OK');
