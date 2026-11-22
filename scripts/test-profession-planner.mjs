import assert from 'node:assert/strict';
import {buildProfessionPlanner} from './profession-planner.mjs';

const data={
  generatedAt:'2026-11-22T12:00:00.000Z',
  characters:[{
    slug:'cole-dalton',name:'Cole Dalton',player:'Christian',level:12,faction:'Allianz',
    professions:[
      {id:171,name:'Alchemie',current:58,max:75,knownRecipes:[{id:100,name:'Bekanntes Rezept'}]},
      {id:182,name:'Kräuterkunde',current:58,max:150,knownRecipes:[]}
    ]
  }]
};
const vendor=(id,name,zone,priceCopper,extra={})=>({
  type:'vendor',evidence:'forever-confirmed',side:'alliance',id,name,
  location:{zone,x:id/10,y:id/20,uiMapId:84},priceCopper,...extra
});
const recipes=[
  {id:100,name:'Bekanntes Rezept',professionSlug:'alchemy',requiredSkill:1,craftedItem:{id:500,name:'Bekannt'},learning:{sources:[vendor(1,'Alfred','Sturmwind',50)]}},
  {id:101,name:'Elixier A',professionSlug:'alchemy',requiredSkill:25,craftedItem:{id:501,name:'Elixier A'},learning:{sources:[vendor(1,'Alfred','Sturmwind',100)]}},
  {id:102,name:'Elixier B',professionSlug:'alchemy',requiredSkill:40,craftedItem:{id:502,name:'Elixier B'},learning:{sources:[vendor(1,'Alfred','Sturmwind',200),vendor(2,'Berta','Sturmwind',150)]}},
  {id:103,name:'Zu schwer',professionSlug:'alchemy',requiredSkill:60,craftedItem:{id:503,name:'Zu schwer'},learning:{sources:[vendor(1,'Alfred','Sturmwind',300)]}},
  {id:104,name:'Eisenschmiede-Rezept',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:504,name:'Fern'},learning:{sources:[vendor(3,'Clara','Eisenschmiede',80)]}},
  {id:105,name:'Classic unsicher',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:505,name:'Unsicher'},learning:{sources:[{...vendor(4,'Dora','Sturmwind',70),evidence:'classic-unconfirmed'}]}},
  {id:106,name:'Lehrerwissen',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:506,name:'Lehrer'},learning:{sources:[{...vendor(5,'Lehrer','Sturmwind',60),type:'trainer'}]}},
  {id:107,name:'Anforderung unbekannt',professionSlug:'alchemy',requiredSkill:null,craftedItem:{id:507,name:'Unbekannt'},learning:{sources:[vendor(6,'Emil','Sturmwind',90)]}},
  {id:108,name:'Horde-Angebot',professionSlug:'alchemy',requiredSkill:10,craftedItem:{id:508,name:'Horde'},learning:{sources:[{...vendor(7,'Feind','Sturmwind',90),side:'horde'}]}}
];
const index={recipes};

const overview=buildProfessionPlanner(data,index,{characterSlug:'cole-dalton'});
assert.equal(overview.selectedCharacter.name,'Cole Dalton');
assert.equal(overview.counts.availableNow,3,'Only unknown, skill-eligible, Forever-confirmed vendor recipes count');
assert.deepEqual(overview.locations.map(x=>[x.name,x.recipeCount]),[['Eisenschmiede',1],['Sturmwind',2]]);
assert.equal(overview.vendors.length,0,'No vendor list before a location is selected');

const stormwind=buildProfessionPlanner(data,index,{characterSlug:'cole-dalton',location:'Sturmwind'});
assert.equal(stormwind.selectedLocation,'Sturmwind');
assert.equal(stormwind.counts.atLocation,2);
assert.equal(stormwind.vendors.length,1,'Coverage preference groups both recipes at the vendor covering the most recipes');
assert.equal(stormwind.vendors[0].name,'Alfred');
assert.deepEqual(stormwind.vendors[0].recipes.map(r=>r.id),[101,102]);
assert.equal(stormwind.vendors[0].recipes[1].source.priceCopper,200);
assert.equal(stormwind.vendors[0].recipes[1].alternatives[0].name,'Berta');
assert.equal(stormwind.vendors[0].recipes[1].alternatives[0].priceCopper,150,'Cheaper alternative remains visible even when route grouping prefers the higher-coverage vendor');
assert.equal(stormwind.counts.knownPrices,2);
assert.equal(stormwind.counts.unknownPrices,0);

assert.throws(()=>buildProfessionPlanner(data,index,{characterSlug:'unknown'}),/Charakter nicht gefunden/);
console.log('Profession planner: unknown + learnable + confirmed vendor + location + grouping rules: OK');
