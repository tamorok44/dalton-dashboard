import assert from 'node:assert/strict';
import {normalizeTalentTrees} from './talent-tree-store.mjs';
const node=(id,row,col)=>({id,df:id+100,sp:id+200,row,col,max:1,lv:10+5*row,ranks:[id+200],pre:[],ic:999});
const raw=[{id:8,trees:[{id:1,talents:[node(1,0,0),{...node(2,1,3),pre:[[1,1,1]]}]},{id:2,talents:[node(3,0,0)]},{id:3,talents:[node(4,0,0)]}]}];
const de={8:{n:'Magier',trees:{1:{n:'Arkan'},2:{n:'Feuer'},3:{n:'Frost'}},talents:{1:{n:'Talent eins',d:['Text']},2:{n:'Talent zwei',d:['Text']},3:{n:'Talent drei',d:['Text']},4:{n:'Talent vier',d:[]}}}};
const result=normalizeTalentTrees(raw,de,[8]);assert.equal(result[8].trees.length,3);assert.equal(result[8].trees[0].talents[1].profileId,102);assert.equal(result[8].trees[0].talents[1].prerequisites[0].conditionKnown,false);assert.equal(result[8].trees[2].talents[0].descriptions[0],null);
const wrong=structuredClone(raw);wrong[0].trees[0].talents[1].df=101;assert.deepEqual(normalizeTalentTrees(wrong,de,[8]),{});
const collision=structuredClone(raw);collision[0].trees[0].talents[1].row=0;collision[0].trees[0].talents[1].col=0;assert.deepEqual(normalizeTalentTrees(collision,de,[8]),{});
console.log('Talent catalog: typed profile IDs, coordinates, localized ranks and fail-closed prerequisites: OK');
