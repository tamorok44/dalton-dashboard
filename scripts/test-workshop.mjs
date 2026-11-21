import assert from 'node:assert/strict';
import {
  buildWorkshopCatalog,
  searchWorkshopItems,
  workshopBrowseTree,
  buildProductionPlan,
  enrichWorkshopCatalogWithForeverDb,
  workshopLearningCandidates
} from './workshop-core.mjs';
import {
  searchForeverDbItems,
  fetchForeverDbItem,
  fetchForeverDbProfession
} from './foreverdb-api.mjs';
import {
  normalizeForeverDbRecipe,
  hydrateRecipeIndex,
  fetchForeverDbRecipeIndex,
  searchForeverDbRecipesForItem
} from './workshop-foreverdb.mjs';

const data={
  generatedAt:'2026-11-21T12:00:00.000Z',
  characters:[
    {
      slug:'chucky-dalton',name:'Chucky Dalton',player:'Valentin',
      professions:[{id:186,name:'Bergbau',current:46,max:75,knownRecipes:[
        {id:3324,name:'Kupfer verhütten',craftedItem:{id:2840,name:'Kupferbarren'},craftedQuantity:{value:1},reagents:[{id:2770,name:'Kupfererz',quantity:1}]}
      ]}]
    },
    {
      slug:'dolly-dalton',name:'Dolly Dalton',player:'Max',
      professions:[{id:165,name:'Lederverarbeitung',current:20,max:75,knownRecipes:[
        {id:9001,name:'Testklinge',craftedItem:{id:99001,name:'Kupfer-Testklinge'},craftedQuantity:{value:1},reagents:[{id:2840,name:'Kupferbarren',quantity:2},{id:2318,name:'Leichtes Leder',quantity:1}]}
      ]}]
    }
  ]
};
const catalog=buildWorkshopCatalog(data);
assert.equal(catalog.recipes.length,2);
assert.equal(catalog.byItemId.get(2840).craftable,true);
assert.equal(catalog.byItemId.get(2770).craftable,false);
assert.equal(catalog.byItemId.get(2840).crafters[0].name,'Chucky Dalton');

const suggestions=searchWorkshopItems(catalog,'Kup',{limit:10});
assert.deepEqual(suggestions.map(item=>item.name),['Kupfer-Testklinge','Kupferbarren','Kupfererz'],
  'Namensanfänge werden alphabetisch vor anderen Treffern sortiert');

const browse=workshopBrowseTree(catalog);
const browseText=JSON.stringify(browse);
assert.ok(browseText.includes('Kupfer-Testklinge'));
assert.ok(browseText.includes('Kupferbarren'));
assert.ok(!browseText.includes('Kupfererz'),'Dropdown enthält nur tatsächlich craftbare Gegenstände');

const plan=buildProductionPlan(catalog,99001,5);
assert.equal(plan.tree.recipe.craftsRequired,5);
const bars=plan.tree.materials.find(item=>item.item.id===2840);
assert.equal(bars.quantity,10);
assert.equal(bars.recipe.craftsRequired,10);
assert.equal(bars.materials[0].item.id,2770);
assert.equal(bars.materials[0].quantity,10);
assert.deepEqual(plan.externalMaterials,[
  {id:2770,name:'Kupfererz',quantity:10},
  {id:2318,name:'Leichtes Leder',quantity:5}
]);

const variableData={
  generatedAt:data.generatedAt,
  characters:[{slug:'cole-dalton',name:'Cole Dalton',player:'Christian',professions:[{
    id:171,name:'Alchimie',current:100,max:150,knownRecipes:[{
      id:9100,name:'Testausbeute',craftedItem:{id:99002,name:'Testausbeute'},craftedQuantity:{minimum:2,maximum:4},
      reagents:[{id:2447,name:'Friedensblume',quantity:1}]
    }]
  }]}]
};
const variable=buildProductionPlan(buildWorkshopCatalog(variableData),99002,5);
assert.equal(variable.tree.recipe.craftsRequired,3,'Variable Ausbeute plant konservativ mit der garantierten Mindestausbeute');
assert.deepEqual(variable.tree.recipe.outputRange,{min:6,max:12});
assert.equal(variable.externalMaterials[0].quantity,3);


const remoteRecipe=normalizeForeverDbRecipe({
  id:3324,
  name:'Kupfer verhütten',
  skill:{orange:1,yellow:25,green:47,grey:70,orangeSource:'client'},
  makes:{item:{id:2840,name:'Kupferbarren'},count:1},
  reagents:[{item:{id:2770,name:'Kupfererz'},count:1}],
  category:{name:'Verhüttete Barren',parent:{name:'Bergbau'}},
  learnedFrom:{sources:{
    alliance:{
      trainers:[
        {id:100,name:'Gelman Steinhandschuh',location:{zone:'Sturmwind',uiMapId:84,x:59.2,y:37.8},seenInForever:true,trainerCost:10,trainerCostSource:'forever'},
        {id:101,name:'Geofram Felszehe',location:{zone:'Eisenschmiede',x:50.3,y:26},seenInForever:true,trainerCost:10}
      ],
      vendors:[
        {id:200,name:'Testhändler',location:{zone:'Sturmwind',x:60,y:40},seenInForever:false,price:250,limitedStock:1}
      ]
    },
    drops:[
      {creature:{id:300,name:'Testkreatur'},location:{zone:'Westfall'},seenInForever:true,players:4}
    ]
  }}
},'mining');
assert.equal(remoteRecipe.craftedItem.id,2840);
assert.equal(remoteRecipe.requiredSkill,1);
assert.deepEqual(remoteRecipe.categoryPath,['Bergbau','Verhüttete Barren']);
assert.equal(remoteRecipe.learning.sources.length,4,'Alle bekannten Quellen bleiben erhalten');
assert.equal(remoteRecipe.learning.sources.filter(source=>source.evidence==='forever-confirmed').length,3);
assert.equal(remoteRecipe.learning.sources.filter(source=>source.evidence==='classic-unconfirmed').length,1);
assert.ok(remoteRecipe.learning.sources.some(source=>source.type==='vendor'&&source.limitedStock===1));
assert.ok(remoteRecipe.learning.sources.some(source=>source.type==='drop'&&source.name==='Testkreatur'));

const index=hydrateRecipeIndex({generatedAt:data.generatedAt,complete:true,recipes:[remoteRecipe]});
enrichWorkshopCatalogWithForeverDb(catalog,index);
assert.deepEqual(catalog.byItemId.get(2840).categoryPath,['Materialien & Komponenten','Verhüttete Barren'],
  'Beruf wird nicht als Browse-Einstieg verwendet; Forever-Kategorie verfeinert die Gegenstandsgruppe');
assert.equal(catalog.byItemId.get(2840).categorySource,'foreverdb-client');

const candidates=workshopLearningCandidates({
  characters:[
    {slug:'chucky-dalton',name:'Chucky Dalton',player:'Valentin',level:10,professions:[{name:'Bergbau',current:46,max:75}]},
    {slug:'cole-dalton',name:'Cole Dalton',player:'Christian',level:11,professions:[{name:'Alchimie',current:58,max:75}]}
  ]
},{...remoteRecipe,requiredSkill:50});
assert.equal(candidates.length,1);
assert.equal(candidates[0].name,'Chucky Dalton');
assert.equal(candidates[0].gap,4);
assert.equal(candidates[0].status,'skill-gap');

const previousKey=process.env.FOREVERDB_API_KEY;
process.env.FOREVERDB_API_KEY='test-key';
const requests=[];
const fakeFetch=async url=>{
  requests.push(String(url));
  const parsed=new URL(url);
  let body;
  if(parsed.pathname.includes('/professions/')){
    const slug=parsed.pathname.split('/').at(-1);
    const query=parsed.searchParams.get('q');
    const offset=Number(parsed.searchParams.get('offset')||0);
    const matchingRecipe={
      id:3324,
      name:'Kupfer verhütten',
      skill:{orange:1,yellow:25,green:47,grey:70},
      makes:{item:{id:2840,name:'Kupferbarren'},count:1},
      reagents:[{item:{id:2770,name:'Kupfererz'},count:1}],
      category:{name:'Verhüttete Barren',parent:{name:'Bergbau'}},
      learnedFrom:{sources:{alliance:{trainers:[{id:100,name:'Gelman Steinhandschuh',seenInForever:true}]}}}
    };
    const recipes=query
      ?(slug==='mining'&&query==='Kupferbarren'?[matchingRecipe]:[])
      :slug==='mining'?[matchingRecipe]:
       slug==='alchemy'?[{...matchingRecipe,id:5000+offset,makes:{item:{id:90000+offset,name:'Alchemietest '+offset},count:1}}]:[];
    body={data:{recipes},meta:{total:slug==='alchemy'?150:recipes.length,build:'test'}};
  }else if(parsed.pathname.endsWith('/items/2840')){
    body={data:{id:2840,name:'Kupferbarren',quality:1,class:7,slot:0,requiredLevel:0},meta:{build:'test'}};
  }else{
    body={data:[{id:2840,name:'Kupferbarren'},{id:2770,name:'Kupfererz'}],meta:{total:2}};
  }
  return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(body)};
};
const beforeScoped=requests.length;
const scopedIndex=await fetchForeverDbRecipeIndex({
  professionSlugs:['mining','alchemy'],
  maxRequests:10,
  fetchImpl:fakeFetch
});
assert.deepEqual(scopedIndex.professionSlugs,['alchemy','mining']);
assert.equal(scopedIndex.requestCount,3,'Zwei Dalton-Berufe mit einer zweiten Alchemie-Seite benötigen nur drei Requests');
assert.ok(scopedIndex.byItem.get(2840)?.length===1,'Scoped recipe index retains the mining recipe');
assert.equal(requests.length-beforeScoped,3);

const beforeTargeted=requests.length;
const targeted=await searchForeverDbRecipesForItem(2840,'Kupferbarren',{fetchImpl:fakeFetch});
assert.equal(targeted.requestCount,12,'Gezielte Fremdrezept-Suche fragt jeden Beruf genau einmal ab');
assert.equal(targeted.recipes.length,1);
assert.equal(targeted.recipes[0].professionSlug,'mining');
assert.equal(targeted.recipes[0].craftedItem.id,2840);
assert.equal(requests.length-beforeTargeted,12);

const remoteSearch=await searchForeverDbItems('Kup',{limit:10,fetchImpl:fakeFetch});
assert.equal(remoteSearch.items.length,2);
assert.equal(remoteSearch.items[0].name,'Kupferbarren');
assert.ok(!Object.hasOwn(remoteSearch.items[0],'raw'),'Rohe ForeverDB-Payloads werden nicht an die Oberfläche gereicht');
const remoteItem=await fetchForeverDbItem(2840,{fetchImpl:fakeFetch});
assert.equal(remoteItem.item.id,2840);
const profession=await fetchForeverDbProfession('mining',{fetchImpl:fakeFetch});
assert.equal(profession.recipes.length,1);
assert.ok(requests.every(url=>new URL(url).searchParams.get('lang')==='de'),'ForeverDB wird mit deutschen Clientnamen abgefragt');
if(previousKey===undefined)delete process.env.FOREVERDB_API_KEY;else process.env.FOREVERDB_API_KEY=previousKey;

console.log('Werkstatt: Katalog, Autocomplete, Browse, Mengenplanung, Produktionsbaum und ForeverDB-Adapter: OK');
