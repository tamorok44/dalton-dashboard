import assert from 'node:assert/strict';
import {collectKnownRecipeRefs,collectLocalizedRefs,enrichWithForeverDetails} from './forever-details.mjs';

const snapshot={
  locale:'de_DE',
  characters:{
    'cole-dalton':{
      professions:{ok:true,data:{
        primaries:[{
          profession:{id:171,name:'Alchemy',key:{href:'https://eu.api.blizzard.com/data/wow/profession/171?namespace=static-1.60.1_70399-forever-eu'}},
          tiers:[{
            skill_points:58,max_skill_points:75,
            tier:{id:2937,name:'Alchemie'},
            known_recipes:[{id:1832,name:'Schwaches Trollblutelixier',key:{href:'https://eu.api.blizzard.com/data/wow/recipe/1832?namespace=static-1.60.1_70399-forever-eu'}}]
          }]
        }],
        secondaries:[]
      }},
      specializations:{ok:true,data:{
        specialization_groups:[{is_active:true,specializations:[{
          specialization:{id:64,name:'Frost'},spent_points:2,
          talents:[{talent:{id:135309,name:'Verbesserter Frostblitz'},talent_rank:2,spell_tooltip:{spell:{id:11070,name:'Verbesserter Frostblitz'},description:'Verringert die Zauberzeit von Frostblitz.'}}]
        }]}]
      }},
      reputations:{ok:true,data:{
        reputations:[{faction:{id:72,name:'Stormwind',key:{href:'https://eu.api.blizzard.com/data/wow/reputation-faction/72?namespace=static-1.60.1_70399-forever-eu'}},standing:{raw:3100,value:100,max:6000,tier:4,name:'Freundlich'}}]
      }},
      quests:{ok:true,data:{in_progress:[{id:9001,name:'A Grand Adventure',key:{href:'https://eu.api.blizzard.com/data/wow/quest/9001?namespace=static-1.60.1_70399-forever-eu'}}]}},
      completedQuests:{ok:true,data:{quests:[{id:8123},{id:9001},{id:8123}]}},
      spells:{ok:false,status:404,data:{detail:'Not Found'}},
      spellbook:{ok:true,data:{
        entries:[
          {spell:{id:1459,name:'Arkane Intelligenz'},rank:'Rang 1'},
          {spell_id:133,name:'Feuerball',rank_name:'Rang 2'}
        ]
      }}
    }
  }
};

const refs=collectKnownRecipeRefs(snapshot);
assert.equal(refs.length,1);
assert.equal(refs[0].id,1832);

const source={generatedAt:'2026-11-20T18:00:00.000Z',characters:[{
  slug:'cole-dalton',name:'Cole Dalton',professions:[],talents:'Frost: 2'
}]};
const localizedRefs=collectLocalizedRefs(snapshot);
assert.equal(localizedRefs.length,3);

const enriched=enrichWithForeverDetails(source,snapshot,{
  1832:{
    id:1832,name:'Schwaches Trollblutelixier',
    craftedItem:{id:3382,name:'Schwaches Trollblutelixier'},
    craftedQuantity:{minimum:1,maximum:1,value:1},
    reagents:[{id:2447,name:'Friedensblume',quantity:1}]
  }
},{
  'profession:171':'Alchimie',
  'faction:72':'Sturmwind',
  'quest:9001':'Ein großes Abenteuer'
});
const cole=enriched.characters[0];
assert.equal(cole.professions[0].name,'Alchemie','Official Blizzard player terminology overrides conflicting technical de_DE profession label');
assert.equal(cole.professions[0].knownRecipes[0].name,'Schwaches Trollblutelixier');
assert.equal(cole.professions[0].knownRecipes[0].reagents[0].name,'Friedensblume');
assert.equal(cole.talentDetails[0].talents[0].name,'Verbesserter Frostblitz');
assert.equal(cole.talentDetails[0].talents[0].rank,2);
assert.equal(cole.reputations[0].name,'Sturmwind');
assert.equal(cole.reputations[0].standing.name,'Freundlich');
assert.equal(cole.activeQuests[0].name,'Ein großes Abenteuer');
assert.equal(cole.professionDetailsVerified,true);
assert.equal(cole.talentDetailsVerified,true);
assert.equal(cole.reputationsVerified,true);
assert.equal(cole.questsVerified,true);
assert.deepEqual(cole.completedQuestIds,[8123,9001]);
assert.equal(cole.completedQuestsVerified,true);
assert.equal(cole.knownClassAbilitiesVerified,true);
assert.equal(cole.knownClassAbilitiesSource,'blizzard-spellbook');
assert.deepEqual(cole.knownClassAbilities.map(entry=>entry.id),[133,1459]);
assert.equal(cole.knownClassAbilities.find(entry=>entry.id===1459)?.name,'Arkane Intelligenz');

const unavailable=enrichWithForeverDetails(source,{
  snapshotAt:'2026-11-22T21:00:00.000Z',
  characters:{'cole-dalton':{
    spells:{ok:false,status:404,data:{}},
    spellbook:{ok:false,status:404,data:{}}
  }}
});
assert.equal(unavailable.characters[0].knownClassAbilitiesVerified,false);
assert.deepEqual(unavailable.characters[0].knownClassAbilities,[]);

const localSource={
  ...source,
  characters:[{
    ...source.characters[0],
    knownClassAbilities:[{id:133,name:'Feuerball',rank:'Rang 1'}],
    knownClassAbilitiesVerified:true,
    knownClassAbilitiesSource:'WoW-Spellbook',
    knownClassAbilitiesCapturedAt:'2026-11-23T05:55:00.000Z',
    knownClassAbilitiesSyncedAt:'2026-11-23T06:00:00.000Z',
    knownClassAbilitiesCapturedLevel:11
  }]
};
const preservedLocal=enrichWithForeverDetails(localSource,{
  snapshotAt:'2026-11-23T07:00:00.000Z',
  characters:{'cole-dalton':{
    spells:{ok:false,status:404,data:{}},
    spellbook:{ok:false,status:404,data:{}}
  }}
});
assert.equal(preservedLocal.characters[0].knownClassAbilitiesVerified,true,'Fehlende Online-Spellbook-API entwertet keinen echten Ingame-Snapshot');
assert.equal(preservedLocal.characters[0].knownClassAbilitiesSource,'WoW-Spellbook');
assert.equal(preservedLocal.characters[0].knownClassAbilitiesCapturedAt,'2026-11-23T05:55:00.000Z');
assert.deepEqual(preservedLocal.characters[0].knownClassAbilities.map(entry=>entry.id),[133]);
console.log('Forever-Detaildaten: deutsche Rezepte, Talente, Ruf, Quests und persönlicher Spellbook-Status: OK');

const {repairProfessionKnowledge,preserveKnownRecipeDetails}=await import('./profession-knowledge.mjs');
const raw={characters:[{slug:'cole-dalton',professions:[{id:129,name:'Erste Hilfe',knownRecipes:[{id:54191,name:'Minor Healing Potion',reagents:[]},{id:54192,name:'Geringer Heiltrank',craftedItem:{id:858,name:'Geringer Heiltrank'},reagents:[{id:1,name:'Testmaterial',quantity:1}]}]},{id:182,name:'Kräuterkunde',knownRecipes:[{id:1419,name:'Kräuterkunde'},{id:54115,name:'Kräuterkunde'},{id:52642,name:'Incense Candle',reagents:[]},{id:999,name:'Unbekannt'}]}]}]};
const master={build:'1.60.1.71091',recipes:[{id:1244431,professionSlug:'first-aid',name:'Schwacher Heiltrank',craftedItem:{id:118,name:'Schwacher Heiltrank'},reagents:[{id:2447,name:'Friedensblume',quantity:1}]},{id:1229705,professionSlug:'herbalism',name:'Räucherkerze',craftedItem:{id:279962,name:'Räucherkerze'},reagents:[{id:2447,name:'Friedensblume',quantity:1}]}]};
const fixed=repairProfessionKnowledge(raw,master);
assert.equal(fixed.characters[0].professions[0].knownRecipes[0].craftedItem.id,118);
assert.equal(fixed.characters[0].professions[0].knownRecipes[1].craftedItem.id,858);
assert.equal(fixed.characters[0].professions[1].knownRecipes[2].name,'Räucherkerze');
assert.equal(fixed.characters[0].professions[1].knownRecipes[3].recipeDetailsStatus,'unavailable');
assert.equal(fixed.characters[0].professions[1].knownRecipes.filter(r=>r.knowledgeKind==='profession-basic').length,2);
assert.equal(preserveKnownRecipeDetails(raw,fixed).characters[0].professions[0].knownRecipes[0].recipeDetailsStatus,'previous');
const unrelated={characters:[{slug:'test',professions:[{id:185,name:'Kochkunst',knownRecipes:[{id:999,name:'A new recipe'}]}]}]};
const newRecipe={id:12345,professionSlug:'cooking',name:'Neues Gericht',englishName:'A new recipe',craftedItem:{id:99999,name:'Neues Gericht'},reagents:[{id:1,name:'Zutat',quantity:1}]};
assert.equal(repairProfessionKnowledge(unrelated,{recipes:[newRecipe]}).characters[0].professions[0].knownRecipes[0].name,'Neues Gericht');
assert.equal(repairProfessionKnowledge(unrelated,{recipes:[newRecipe,{...newRecipe,id:12346,craftedItem:{id:99998,name:'Anderes Gericht'}}]}).characters[0].professions[0].knownRecipes[0].recipeDetailsStatus,'unavailable');
