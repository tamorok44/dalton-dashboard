import assert from 'node:assert/strict';
import {publicClassData} from './class-training-store.mjs';
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
assert.notEqual(master.classMechanicsRevisions[8],buildTalentMaster(changed,de).classMechanicsRevisions[8]);
assert.equal(master.classMechanicsRevisions[8],buildTalentMaster(reordered,de).classMechanicsRevisions[8]);
const translation=structuredClone(de);
translation[8].talents[1].d=['Geänderter deutscher Text'];
assert.notEqual(master.classRevisions[8],buildTalentMaster(raw,translation).classRevisions[8]);
assert.equal(master.classMechanicsRevisions[8],buildTalentMaster(raw,translation).classMechanicsRevisions[8]);
assert.deepEqual(projectTalentMaster(master,[2]).classMechanicsRevisions,{});
const twoClasses=[...raw,{...structuredClone(raw[0]),id:2}];
const twoTranslations={...de,2:de[8]};
const classPair=buildTalentMaster(twoClasses,twoTranslations);
const secondChanged=structuredClone(twoClasses);
secondChanged[1].trees[0].talents[0].d=['Unterschiedliche Wirkung'];
const classPairChanged=buildTalentMaster(secondChanged,twoTranslations);
assert.equal(classPair.classMechanicsRevisions[8],classPairChanged.classMechanicsRevisions[8]);
assert.notEqual(classPair.classMechanicsRevisions[2],classPairChanged.classMechanicsRevisions[2]);



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

// The class-training process cache may contain a different revision.
await publicClassData({fetchImpl:async()=>new Response(JSON.stringify(changed))});
kv.clear();
let received=0;
const coldOptions={enabled:true,redisImpl,now:10_000,clock:()=>10_000+received*1000};
const fetched=[];
const cold=await loadTalentMaster({...coldOptions,fetchImpl:async(url,options)=>{
  fetched.push(new URL(url).pathname);
  assert.equal(options.cache,'no-cache');
  const original=new URL(url).pathname==='/data/classes.json';
  return {ok:true,headers:new Headers(original?{age:'5'}:{}),text:async()=>{
    received++;
    return JSON.stringify(original?raw:de);
  }};
}});
assert.equal(new Set(fetched).size,2);
assert.equal(cold.classRevisions[8],master.classRevisions[8]);
assert.match(cold.sourceRevision,/^[a-f0-9]{64}$/);
assert.match(cold.sourceDigests.raw,/^[a-f0-9]{64}$/);
assert.match(cold.sourceDigests.localized,/^[a-f0-9]{64}$/);
assert.equal(Date.parse(cold.sourceFreshAt.raw),7000);
assert.equal(Date.parse(cold.sourceFreshAt.localized),12000);
assert.equal(cold.checkedAt,cold.sourceFreshAt.raw);
assert.equal(cold.stale,false);

kv.clear();
const alternate=await loadTalentMaster({...coldOptions,fetchImpl:async url=>
  new Response(JSON.stringify(new URL(url).pathname==='/data/classes.json'?changed:de))});
assert.notEqual(alternate.sourceRevision,cold.sourceRevision);

kv.clear();
let unblock;
const barrier=new Promise(resolve=>{unblock=resolve});
let signalStarted;
const started=new Promise(resolve=>{signalStarted=resolve});
let parallelRequests=0;
const parallel={...coldOptions,now:12_000,fetchImpl:async url=>{
  parallelRequests++;
  signalStarted();
  await barrier;
  return new Response(JSON.stringify(new URL(url).pathname==='/data/classes.json'?raw:de));
}};
const winner=loadTalentMaster(parallel);
await started;
assert.equal((await loadTalentMaster(parallel)).stale,true);
assert.equal(parallelRequests,2);
unblock();
assert.equal((await winner).sourceRevision,cold.sourceRevision);
assert.equal((await loadTalentMaster(parallel)).sourceRevision,cold.sourceRevision);
assert.equal(parallelRequests,2);




// A failed class remains a display fallback, without changing another class's
// freshness or causing the Preview request to write shared media or master data.
const {encodeCompactMaster}=await import('./compact-master-cache.mjs');
const previousEnv=process.env.VERCEL_ENV;
let productionCatalog,previewCatalog;
try{
  process.env.VERCEL_ENV='production';
  ({loadTalentTreeCatalog:productionCatalog}=await import('./talent-tree-store.mjs?production'));
  process.env.VERCEL_ENV='preview';
  ({loadTalentTreeCatalog:previewCatalog}=await import('./talent-tree-store.mjs?preview'));
}finally{
  if(previousEnv===undefined)delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV=previousEnv;
}
const {mediaIconKey}=await import('./media-resolver.mjs');
const fallback=structuredClone(master.classes[8]);
fallback.classId=2;
for(const tree of fallback.trees)for(const talent of tree.talents)talent.spellId+=1000;
const packed=encodeCompactMaster({...master,fallbackClasses:{2:fallback}});
const roster={characters:[{classId:8},{classId:2},{classId:4}]};
for(const [loadCatalog,suffix] of [[productionCatalog,''],[previewCatalog,':preview']]){
  const commands=[];
  const result=await loadCatalog(roster,{},{
    enabled:true,now:100,
    redisImpl:async command=>{
      commands.push(command);
      return command[1]==='dalton-dashboard:talent-tree-catalog:v3:all-classes'+suffix+':gz1'?packed:null;
    },
    fetchImpl:()=>assert.fail('A warm partial master must not fetch class files'),
    resolveIcons:async (refs,{allowFetch,fetchableKeys})=>{
      assert.equal(allowFetch,suffix==='');
      assert.equal(refs.length,8);
      assert.equal(fetchableKeys.size,4);
      assert.ok(fetchableKeys.has(mediaIconKey('spell',201)));
      assert.ok(!fetchableKeys.has(mediaIconKey('spell',1201)));
      return {[mediaIconKey('spell',1201)]:'https://example.test/archived.jpg'};
    }
  });
  assert.equal(result.stale,false);
  assert.deepEqual(result.missingClassIds,[2,4]);
  assert.deepEqual(result.fallbackClassIds,[2]);
  assert.ok(result.classes[8]);
  assert.equal(result.classes[2].trees[0].talents[0].iconUrl,'https://example.test/archived.jpg');
  assert.equal(result.classes[4],undefined);
  assert.ok(commands.every(([operation])=>operation==='GET'));
  assert.equal(commands.length,suffix?1:3);
}
console.log('Talent catalog: partial availability, read-only fallbacks and Preview isolation: OK');

// Display patches are source-bound and must never alter the raw planning master.
const {correctTalentDisplay,DISPLAY_CORRECTION_SOURCE,DISPLAY_CORRECTION_CLASSES}=await import('./talent-display-corrections.mjs');
const fake=(id,ids)=>({classId:id,trees:[{id:1,talents:ids.map(id=>({id,name:'Alt',profileId:id,spellId:id,maxRank:5,rankSpellIds:Array(5).fill(id),descriptions:['alt'],prerequisites:id===104964?[{id:104961,rank:1},{id:104970,rank:1}]:id===113631?[{id:105323,rank:1,conditionKnown:false}]:[]}))}]});
for(const [id,ids] of [[2,[105330,113631]],[3,[104964,104966]],[8,[105764,105762]],[11,[104923,104924,104931,104933,104935,104936,104937,113563]]]){
 const c=fake(id,ids),before=JSON.stringify(c),master={classes:{[id]:c},sourceRevision:DISPLAY_CORRECTION_SOURCE,classMechanicsRevisions:{[id]:DISPLAY_CORRECTION_CLASSES[id]}};
 assert.equal(correctTalentDisplay(c,{...master,sourceRevision:'changed'}),c);
 assert.equal(correctTalentDisplay(c,{...master,classMechanicsRevisions:{}}),c);
 assert.equal(correctTalentDisplay(structuredClone(c),master).displayCorrection,undefined);
 const out=correctTalentDisplay(c,master),n=out.trees[0].talents;
 assert.equal(out.displayCorrection,true);assert.equal(JSON.stringify(c),before);
 if(id===2){assert.match(n[0].descriptions[0],/60 Minuten/);assert.equal(n[1].prerequisites[0].conditionKnown,true)}
 if(id===3){assert.deepEqual(n[0].prerequisites.map(p=>p.id),[104970]);assert.match(n[1].reviewNotice,/serverseitige Wirkung/);}
 if(id===8){assert.match(n[0].descriptions[0],/Der nächste/);assert.match(n[0].descriptions[1],/nächsten zwei/);assert.match(n[1].reviewNotice,/serverseitige Wirkung/);}
 if(id===11){assert.match(n.find(t=>t.id===104924).descriptions[4],/10 %.*Hurrikan und Gelassenheit/);assert.equal(out.personalMappingUnverified,true);assert.equal(n.find(t=>t.id===104933).maxRank,2);assert.equal(n.find(t=>t.id===104936).spellId,408258);assert.equal(n.find(t=>t.id===104936).profileId,null);assert.deepEqual(n.find(t=>t.id===104936).rankSpellIds,[]);assert.match(n.find(t=>t.id===113563).descriptions[0],/40 Energie/)}
}
console.log('Exact-source display corrections, immutable raw proof, unresolved personal mapping: OK');

const {displayedTalentText,unresolvedTalentText}=await import('../talent-text-quality.js');
const {auditTalentLocalization}=await import('./talent-localization-audit.mjs');
assert.equal(unresolvedTalentText('1 ?:Einsätze'),true);
assert.equal(unresolvedTalentText('Wandelt ? Mana in ? Energie um.'),true);
assert.equal(unresolvedTalentText('Erhöht den Schaden um 10 %.'),false);
assert.ok(!displayedTalentText('1 ?:Einsätze').includes('?'));
assert.equal(displayedTalentText(null),'Deutscher Originaltext derzeit nicht verfügbar.');
const audit=auditTalentLocalization({classes:{8:{classId:8,trees:[{id:1,name:'Frost',talents:[{id:4,name:'Test',maxRank:2,descriptions:['? Mana',null]}]}]}},stale:false});
assert.equal(audit.summary.availableClasses,1);assert.equal(audit.summary.issues,2);assert.equal(audit.summary.exactReviewedClasses,0);assert.equal(audit.summary.ranks,2);
console.log('Localization: placeholders, missing ranks, exact-source correction and preview audit: OK');
