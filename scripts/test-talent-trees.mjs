import assert from 'node:assert/strict';
import {normalizeTalentTrees,buildTalentMaster,projectTalentMaster,loadTalentMaster,TALENT_CLASS_IDS} from './talent-tree-store.mjs';
const node=(id,row,col)=>({id,df:id+100,sp:id+200,row,col,max:1,lv:10+5*row,...(row?{gate:[row*5,row-1]}:{}),ranks:[id+200],pre:[],ic:999});
const raw=[{id:8,trees:[{id:1,talents:[node(1,0,0),{...node(2,1,3),pre:[[1,1,1]]}]},{id:2,talents:[node(3,0,0)]},{id:3,talents:[node(4,0,0)]}]}];
const de={8:{n:'Magier',trees:{1:{n:'Arkan'},2:{n:'Feuer'},3:{n:'Frost'}},talents:{1:{n:'Talent eins',d:['Text']},2:{n:'Talent zwei',d:['Text']},3:{n:'Talent drei',d:['Text']},4:{n:'Talent vier',d:[]}}}};
const result=normalizeTalentTrees(raw,de,[8]);assert.equal(result[8].trees.length,3);assert.equal(result[8].trees[0].talents[1].profileId,102);assert.equal(result[8].trees[0].talents[1].prerequisites[0].conditionKnown,false);assert.equal(result[8].trees[2].talents[0].descriptions[0],null);
const wrong=structuredClone(raw);wrong[0].trees[0].talents[1].df=101;assert.deepEqual(normalizeTalentTrees(wrong,de,[8]),{});
const collision=structuredClone(raw);collision[0].trees[0].talents[1].row=0;collision[0].trees[0].talents[1].col=0;assert.deepEqual(normalizeTalentTrees(collision,de,[8]),{});
console.log('Talent catalog: typed profile IDs, coordinates, localized ranks and fail-closed prerequisites: OK');

const badGate=structuredClone(raw);badGate[0].trees[0].talents[1].gate=[4,0];assert.deepEqual(normalizeTalentTrees(badGate,de,[8]),{});
assert.equal(result[8].trees[0].talents[1].requiredPoints,5);
const reordered=structuredClone(raw);reordered[0].trees[0].talents.reverse();assert.deepEqual(normalizeTalentTrees(reordered,de,[8]),result);

const master=buildTalentMaster(raw,de,{now:0});
assert.deepEqual(master.expectedClassIds,[...TALENT_CLASS_IDS]);
assert.equal(Object.keys(master.classes).length,1);
assert.ok(master.missingClassIds.includes(2));
assert.deepEqual(projectTalentMaster(master,[]).classes,{});
assert.deepEqual(projectTalentMaster(master,[8,2]).classes,master.classes);
assert.equal(master.classRevisions[8],buildTalentMaster(reordered,de,{now:1}).classRevisions[8]);
const changed=structuredClone(raw);changed[0].trees[0].talents[0].d=['changed'];
assert.notEqual(master.classRevisions[8],buildTalentMaster(changed,de).classRevisions[8]);

// Shared request budget: repeated failed requests and different roster build
// hints cannot bypass the six-hour attempt marker.
const kv=new Map();
const redisImpl=async ([cmd,key,value,...args])=>{
  if(cmd==='GET')return kv.get(key)??null;
  if(cmd==='SET'){
    if(args.includes('NX')&&kv.has(key))return null;
    kv.set(key,value);return 'OK';
  }
  throw Error('unexpected command '+cmd);
};
let requests=0;
const fetchImpl=async()=>{requests++;throw Error('fixture outage')};
const options={enabled:true,redisImpl,fetchImpl,now:0};
assert.equal((await loadTalentMaster(options)).stale,true);
const first=requests;assert.ok(first>0&&first<=2);
await loadTalentMaster({...options,observedBuilds:'71091'});
await loadTalentMaster({...options,observedBuilds:'71092'});
assert.equal(requests,first);
assert.equal([...kv.keys()].filter(k=>k.endsWith(':attempt')).length,1);
console.log('Talent catalog: roster independence, revisions and bounded failure retries: OK');
