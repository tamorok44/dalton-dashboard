import assert from 'node:assert/strict';
import {
  buildWorkshopCatalog,
  searchWorkshopItems,
  workshopBrowseTree,
  buildProductionPlan,
  workshopBrowseTreeForItems,
  workshopItemsFromRecipeIndex,
  enrichWorkshopCatalogWithForeverDb,
  workshopLearningCandidates
} from './workshop-core.mjs';
import {
  searchForeverDbItems,
  fetchForeverDbItem,
  fetchForeverDbProfession,
  fetchForeverDbMeta,
  fetchForeverDbSpell,
  PROFESSION_SLUGS
} from './foreverdb-api.mjs';
import {
  normalizeForeverDbRecipe,
  hydrateRecipeIndex,
  fetchForeverDbRecipeIndex,
  fetchForeverDbProfessionMaster,
  searchForeverDbRecipesForItem
} from './workshop-foreverdb.mjs';
import {
  mergeRecipeIndexes,
  missingMasterProfessionSlugs,
  nextMasterProfessionChunk
} from './workshop-store.mjs';

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
assert.deepEqual(catalog.byItemId.get(2840).categoryPath,['Materialien & Komponenten','Materialien'],
  'Externe Kategorien beeinflussen nur die eigene UI-Taxonomie und werden nicht manuell übersetzt');
assert.equal(catalog.byItemId.get(2840).categorySource,'foreverdb-client');

const categoryData={
  generatedAt:data.generatedAt,
  characters:[{
    slug:'dolly-dalton',name:'Dolly Dalton',player:'Max',professions:[
      {id:165,name:'Lederverarbeitung',current:10,max:75,knownRecipes:[{
        id:2160,name:'Handgenähte Lederstiefel',craftedItem:{id:2302,name:'Handgenähte Lederstiefel'},craftedQuantity:{value:1},reagents:[{id:2318,name:'Leichtes Leder',quantity:2}]
      }]},
      {id:129,name:'Erste Hilfe',current:20,max:75,knownRecipes:[{
        id:1838,name:'Leinenverband',craftedItem:{id:1251,name:'Leinenverband'},craftedQuantity:{value:1},reagents:[{id:2589,name:'Leinenstoff',quantity:1}]
      }]}
    ]
  }]
};
const categoryCatalog=buildWorkshopCatalog(categoryData);
const categoryRecipes=[
  normalizeForeverDbRecipe({
    id:2160,name:'Handgenähte Lederstiefel',makes:{item:{id:2302,name:'Handgenähte Lederstiefel'},count:1},
    category:{name:'Leather Boots',parent:{name:'Leatherworking'}}
  },'leatherworking'),
  normalizeForeverDbRecipe({
    id:1838,name:'Leinenverband',makes:{item:{id:1251,name:'Leinenverband'},count:1},
    category:{name:'Bandages',parent:{name:'First Aid'}}
  },'first-aid')
].filter(Boolean);
enrichWorkshopCatalogWithForeverDb(categoryCatalog,hydrateRecipeIndex({generatedAt:data.generatedAt,complete:true,recipes:categoryRecipes}));
assert.deepEqual(categoryCatalog.byItemId.get(2302).categoryPath,['Ausrüstung & Gegenstände','Ausrüstung'],
  'Ausrüstung bleibt in einer eigenen deutschen UI-Taxonomie statt externen Kategorien zu übersetzen');
assert.deepEqual(categoryCatalog.byItemId.get(1251).categoryPath,['Verbrauchsgüter','Verbände'],
  'Verbände werden über die eigene UI-Taxonomie deutsch gruppiert');

const fullMasterSeed=hydrateRecipeIndex({
  generatedAt:data.generatedAt,
  build:'1.60.1.70959',
  complete:false,
  professionSlugs:['alchemy','cooking','engineering','first-aid','fishing','herbalism','leatherworking','mining'],
  recipes:[remoteRecipe]
});
const missingBefore=missingMasterProfessionSlugs(fullMasterSeed);
assert.equal(missingBefore.length,4,'Acht vorhandene Dalton-Berufe lassen genau vier Master-Berufe offen');
assert.deepEqual(nextMasterProfessionChunk(fullMasterSeed,3),missingBefore.slice(0,3));
const syntheticMissing=missingBefore.map((slug,index)=>({
  ...remoteRecipe,
  id:8000+index,
  professionSlug:slug,
  craftedItem:{id:88000+index,name:'Master-Test '+index}
}));
const fullMaster=mergeRecipeIndexes(fullMasterSeed,hydrateRecipeIndex({
  generatedAt:data.generatedAt,
  build:'1.60.1.70959',
  complete:true,
  professionSlugs:missingBefore,
  recipes:syntheticMissing
}));
assert.equal(fullMaster.professionSlugs.length,PROFESSION_SLUGS.size,'Master umfasst alle 12 Berufe');
assert.equal(fullMaster.complete,true);
assert.deepEqual(missingMasterProfessionSlugs(fullMaster),[]);

const masterItems=workshopItemsFromRecipeIndex(catalog,fullMaster);
assert.ok(masterItems.some(item=>item.id===2840&&item.craftable),'Bekanntes Dalton-Rezept bleibt als herstellbar markiert');
assert.ok(masterItems.some(item=>item.id===88000&&!item.craftable),'Vollkatalog enthält auch nicht durch die Daltons herstellbare Rezepte');
const fullBrowseText=JSON.stringify(workshopBrowseTreeForItems(masterItems));
assert.ok(fullBrowseText.includes('Master-Test 0'),'Geführte Auswahl kann den vollständigen Masterkatalog anzeigen');
const craftableBrowseText=JSON.stringify(workshopBrowseTreeForItems(masterItems,{craftableOnly:true}));
assert.ok(!craftableBrowseText.includes('Master-Test 0'),'Herstellbar-Filter blendet nicht craftbare Mastereinträge aus');

const learningData={
  characters:[
    {slug:'chucky-dalton',name:'Chucky Dalton',player:'Valentin',level:10,professions:[{id:186,name:'Bergbau',current:46,max:75}]},
    {slug:'cole-dalton',name:'Cole Dalton',player:'Christian',level:11,professions:[{id:171,name:'Alchimie',current:58,max:75}]}
  ]
};
const candidates=workshopLearningCandidates(learningData,{
  ...remoteRecipe,requiredSkill:50
});
assert.equal(candidates.length,1);
assert.equal(candidates[0].name,'Chucky Dalton');
assert.equal(candidates[0].gap,4);
assert.equal(candidates[0].status,'skill-gap');

const normalRecipe=workshopLearningCandidates(learningData,{
  ...remoteRecipe,requiredSkill:40
});
assert.equal(normalRecipe[0].gap,0);
assert.equal(normalRecipe[0].status,'can-learn-now','Normale Rezepte werden nicht mit dem Level des hergestellten Gegenstands oder Craft-Spells gesperrt');

const explicitlyLevelBlocked=workshopLearningCandidates(learningData,{
  ...remoteRecipe,requiredSkill:40,requiredCharacterLevel:20,learningRequirementsVerified:true
});
assert.equal(explicitlyLevelBlocked[0].gap,0);
assert.equal(explicitlyLevelBlocked[0].levelGap,10);
assert.equal(explicitlyLevelBlocked[0].status,'level-gap','Eine ausdrücklich belegte zusätzliche Rezept-Levelanforderung bleibt unterstützt');

const previousKey=process.env.FOREVERDB_API_KEY;
process.env.FOREVERDB_API_KEY='test-key';
const requests=[];
const fakeFetch=async url=>{
  requests.push(String(url));
  const parsed=new URL(url);
  let body;
  if(parsed.pathname.endsWith('/meta')){
    body={data:{build:'1.60.1.70959'},meta:{}};
  }else if(parsed.pathname.includes('/professions/')){
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
      ?(slug==='mining'&&query==='Copper Bar'?[matchingRecipe]:[])
      :slug==='mining'?[matchingRecipe]:
       slug==='alchemy'?[{...matchingRecipe,id:5000+offset,makes:{item:{id:90000+offset,name:'Alchemietest '+offset},count:1}}]:[];
    body={data:{
      recipes,
      ...(slug==='mining'?{
        ranks:[
          {id:1000,name:'Lehrling',skillCap:75,requiredSkill:1,requiredLevel:5},
          {id:1001,name:'Geselle',skillCap:150,requiredSkill:50,requiredLevel:10,priceCopper:450}
        ],
        trainers:[
          {id:2000,name:'Gelman Steinhandschuh',title:'Gesellenbergmann',zone:'Sturmwind',x:59.2,y:37.8,seenInForever:true}
        ]
      }:{})
    },meta:{total:slug==='alchemy'?150:recipes.length,build:'test'}};
  }else if(parsed.pathname.endsWith('/items/2840')){
    body={data:{id:2840,name:'Kupferbarren',quality:1,class:7,slot:0,requiredLevel:0},meta:{build:'test'}};
  }else if(parsed.pathname.endsWith('/spells/3324')){
    body={data:{id:3324,name:'Kupfer verhütten',rank:'',requiredLevel:10,baseCost:100},meta:{build:'test'}};
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
const targeted=await searchForeverDbRecipesForItem(2840,'Copper Bar',{fetchImpl:fakeFetch});
assert.equal(targeted.requestCount,12,'Gezielte Fremdrezept-Suche fragt jeden Beruf genau einmal ab');
assert.equal(targeted.recipes.length,1);
assert.equal(targeted.recipes[0].professionSlug,'mining');
assert.equal(targeted.recipes[0].craftedItem.id,2840);
assert.equal(requests.length-beforeTargeted,12);

const remoteMeta=await fetchForeverDbMeta({fetchImpl:fakeFetch});
assert.equal(remoteMeta.build,'1.60.1.70959');

const remoteSearch=await searchForeverDbItems('Kup',{limit:10,fetchImpl:fakeFetch});
assert.equal(remoteSearch.items.length,2);
assert.equal(remoteSearch.items[0].name,'Kupferbarren');
assert.ok(!Object.hasOwn(remoteSearch.items[0],'raw'),'Rohe ForeverDB-Payloads werden nicht an die Oberfläche gereicht');
const remoteItem=await fetchForeverDbItem(2840,{fetchImpl:fakeFetch});
assert.equal(remoteItem.item.id,2840);
const profession=await fetchForeverDbProfession('mining',{fetchImpl:fakeFetch});
assert.equal(profession.recipes.length,1);
const professionMaster=await fetchForeverDbProfessionMaster('mining',{fetchImpl:fakeFetch});
assert.equal(professionMaster.profession.slug,'mining');
assert.equal(professionMaster.profession.ranks[1].requiredLevel,10);
assert.equal(professionMaster.profession.ranks[1].requiredSkill,50);
assert.equal(professionMaster.profession.trainers[0].evidence,'forever-confirmed');
assert.equal(professionMaster.profession.trainers[0].npcTitle,'Gesellenbergmann');
const remoteSpell=await fetchForeverDbSpell(3324,{fetchImpl:fakeFetch});
assert.equal(remoteSpell.spell.id,3324);
assert.equal(remoteSpell.spell.requiredLevel,10);
assert.equal(remoteSpell.spell.baseCostCopper,100);

assert.ok(requests.every(url=>new URL(url).searchParams.get('lang')==='de'),'ForeverDB wird mit deutschen Clientnamen abgefragt');
if(previousKey===undefined)delete process.env.FOREVERDB_API_KEY;else process.env.FOREVERDB_API_KEY=previousKey;

console.log('Werkstatt: Katalog, Autocomplete, Browse, Mengenplanung, Produktionsbaum und ForeverDB-Adapter: OK');
