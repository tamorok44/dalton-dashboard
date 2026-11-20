import assert from 'node:assert/strict';
import {collectKnownRecipeRefs,enrichWithForeverDetails} from './forever-details.mjs';

const snapshot={
  locale:'de_DE',
  characters:{
    'cole-dalton':{
      professions:{ok:true,data:{
        primaries:[{
          profession:{id:171,name:'Alchemie'},
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
        reputations:[{faction:{id:72,name:'Sturmwind'},standing:{raw:3100,value:100,max:6000,tier:4,name:'Freundlich'}}]
      }},
      quests:{ok:true,data:{in_progress:[{id:9001,name:'Ein großes Abenteuer'}]}}
    }
  }
};

const refs=collectKnownRecipeRefs(snapshot);
assert.equal(refs.length,1);
assert.equal(refs[0].id,1832);

const source={generatedAt:'2026-11-20T18:00:00.000Z',characters:[{
  slug:'cole-dalton',name:'Cole Dalton',professions:[],talents:'Frost: 2'
}]};
const enriched=enrichWithForeverDetails(source,snapshot,{
  1832:{
    id:1832,name:'Schwaches Trollblutelixier',
    craftedItem:{id:3382,name:'Schwaches Trollblutelixier'},
    craftedQuantity:{minimum:1,maximum:1,value:1},
    reagents:[{id:2447,name:'Friedensblume',quantity:1}]
  }
});
const cole=enriched.characters[0];
assert.equal(cole.professions[0].name,'Alchemie');
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
console.log('Forever-Detaildaten: deutsche Rezepte, Talente, Ruf und Quests: OK');
