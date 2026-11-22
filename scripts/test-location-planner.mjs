import assert from 'node:assert/strict';
import {buildLocationPlanner,locationPlannerRecipeSpellIds} from './location-planner.mjs';

const vendor=(id,name,zone,priceCopper,extra={})=>({
  type:'vendor',evidence:'forever-confirmed',side:'alliance',id,name,
  location:{zone,uiMapId:zone==='Stormwind'?1453:1455,x:id/10,y:id/20},
  priceCopper,...extra
});
const trainer=(id,name,zone,priceCopper,extra={})=>({
  type:'trainer',evidence:'forever-confirmed',side:'alliance',id,name,
  location:{zone,uiMapId:zone==='Stormwind'?1453:1455,x:id/10,y:id/20},
  priceCopper,...extra
});
const data={
  generatedAt:'2026-11-22T12:00:00.000Z',
  characters:[{
    slug:'cole-dalton',name:'Cole Dalton',player:'Christian',level:12,classId:8,class:'Magier',faction:'Allianz',
    professionDetailsVerified:true,
    professions:[{id:171,name:'Alchemie',current:58,max:75,knownRecipes:[{id:100,name:'Bekanntes Rezept'}]}]
  }]
};
const recipes=[
  {id:100,name:'Bekanntes Rezept',professionSlug:'alchemy',requiredSkill:1,craftedItem:{id:500,name:'Bekannt'},learning:{sources:[vendor(1,'Alfred','Stormwind',50)]}},
  {id:101,name:'Elixier A',professionSlug:'alchemy',requiredSkill:25,craftedItem:{id:501,name:'Elixier A'},learning:{sources:[vendor(1,'Alfred','Stormwind',100)]}},
  {id:102,name:'Elixier B',professionSlug:'alchemy',requiredSkill:40,craftedItem:{id:502,name:'Elixier B'},learning:{sources:[vendor(1,'Alfred','Stormwind',200)]}},
  {id:103,name:'Zu schwer',professionSlug:'alchemy',requiredSkill:60,craftedItem:{id:503,name:'Zu schwer'},learning:{sources:[vendor(1,'Alfred','Stormwind',300)]}},
  {id:104,name:'Eisenschmiede-Rezept',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:504,name:'Fern'},learning:{sources:[vendor(3,'Clara','Ironforge',80)]}},
  {id:105,name:'Lehrerrezept',professionSlug:'alchemy',requiredSkill:50,craftedItem:{id:505,name:'Lehrer'},learning:{sources:[trainer(10,'Lehrer Eins','Stormwind',350)]}},
  {id:106,name:'Spell unbekannt',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:506,name:'Unbekannt'},learning:{sources:[vendor(5,'Emil','Stormwind',90)]}},
  {id:107,name:'Classic unsicher',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:507,name:'Unsicher'},learning:{sources:[{...vendor(6,'Dora','Stormwind',70),evidence:'classic-unconfirmed'}]}}
];
const index={
  recipes,
  professions:[{
    slug:'alchemy',name:'Alchemie',
    ranks:[
      {id:1,name:'Lehrling',skillCap:75,requiredSkill:1,requiredLevel:5,sources:[]},
      {id:2,name:'Geselle',skillCap:150,requiredSkill:50,requiredLevel:10,priceCopper:500,sources:[trainer(20,'Alchemielehrer','Stormwind',500)]}
    ],
    trainers:[]
  }]
};
const spellDetails={
  100:{id:100,requiredLevel:1},
  101:{id:101,requiredLevel:10},
  102:{id:102,requiredLevel:15},
  104:{id:104,requiredLevel:10},
  105:{id:105,requiredLevel:10}
};
const ids=locationPlannerRecipeSpellIds(data,index,'cole-dalton');
assert.deepEqual(ids,[101,102,104,105,106],'Nur unbekannte, skillfähige Rezepte mit bestätigter NPC-Quelle benötigen Spell-Prüfung');

const extraActions=[{
  key:'class:1459',id:1459,name:'Arkane Fähigkeit',category:'class-abilities',
  verified:true,availableNow:true,characterSlug:'cole-dalton',
  sources:[trainer(30,'Magierlehrer','Stormwind',1000)]
},{
  key:'pet:1',id:1,name:'Nicht belegte Begleiterfähigkeit',category:'companion-abilities',
  verified:false,availableNow:true,characterSlug:'cole-dalton',
  sources:[trainer(40,'Begleiterlehrer','Stormwind',100)]
}];

const overview=buildLocationPlanner(data,index,{characterSlug:'cole-dalton',spellDetails,extraActions});
assert.equal(overview.counts.availableNow,5,'Levelgesperrte und unbestätigte Rezepte bleiben aus dem aktuellen Ortsplan');
assert.deepEqual(overview.locations.map(x=>[x.name,x.actionCount]),[['Eisenschmiede',1],['Sturmwind',4]],
  'Orte entstehen nur aus aktuell bestätigten Erledigungen');

const stormwind=buildLocationPlanner(data,index,{characterSlug:'cole-dalton',location:'Sturmwind',spellDetails,extraActions});
assert.equal(stormwind.selectedLocation,'Sturmwind');
assert.equal(stormwind.counts.atLocation,4);
assert.equal(stormwind.actions.some(action=>action.id===102),false,'Rezept mit ausreichendem Skill aber zu niedrigem Charakterlevel wird nicht gezeigt');
assert.equal(stormwind.actions.some(action=>action.id===106),false,'Fehlende Spell-Lernvoraussetzung bleibt fail-closed');
assert.equal(stormwind.actions.some(action=>action.name==='Nicht belegte Begleiterfähigkeit'),false,'Unbestätigte Begleiteraktionen bleiben unsichtbar');
assert.equal(stormwind.actions.find(action=>action.id===101)?.source.name,'Alfred');
assert.equal(stormwind.actions.find(action=>action.id===105)?.source.role,'Lehrer');
assert.equal(stormwind.actions.some(action=>action.type==='profession-training'),true,'Jetzt mögliche Berufsrang-Ausbildung wird aufgenommen, wenn Rang und Lehrer direkt belegt sind');
assert.equal(stormwind.actions.some(action=>action.category==='class-abilities'),true,'Verifizierte externe Klassenaktion kann vom gemeinsamen Resolver aufgenommen werden');
assert.deepEqual(Object.fromEntries(stormwind.categories.map(c=>[c.id,c.actionCount])),{
  'class-abilities':1,
  'profession-recipes':2,
  'profession-training':1,
  'companion-abilities':0
});
assert.equal(stormwind.counts.knownPrices,4);
assert.equal(stormwind.counts.unknownPrices,0);

const unverifiedData={...data,characters:[{...data.characters[0],professionDetailsVerified:false}]};
assert.deepEqual(locationPlannerRecipeSpellIds(unverifiedData,index,'cole-dalton'),[],
  'Unbestätigter bekannter Rezeptstand darf keine möglicherweise bereits gelernten Rezepte anbieten');

assert.throws(()=>buildLocationPlanner(data,index,{characterSlug:'unknown'}),/Charakter nicht gefunden/);
console.log('Ortsplaner: Level, Skill, Quellen, Kategorien, NPC-Gruppierung und fail-closed Regeln: OK');
