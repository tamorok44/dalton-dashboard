import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {dailySnapshotStoreConfigured,saveDailySnapshot} from './daily-snapshot-store.mjs';
import {dailyRefreshComplete} from '../api/daily-snapshot.js';
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Real network disabled')};
for(const key of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN','DALTON_PRIVATE_ARCHIVE_TOKEN','DALTON_SYNC_TOKEN','SPELLBOOK_SYNC_TOKEN','FOREVERDB_API_KEY','BLIZZARD_CLIENT_ID','BLIZZARD_CLIENT_SECRET'])delete process.env[key];
process.env.VERCEL_ENV='production';
process.env.BLOB_READ_WRITE_TOKEN='public-media-fixture';
process.env.BLOB_STORE_ID='public-media-fixture';
const snapshot={snapshotAt:'2026-11-26T05:00:00Z',characters:{test:{profile:{ok:true,data:{level:12}}}}};
let uploads=0;
const putImpl=async(path,body,options)=>{
  uploads++;
  assert.equal(options.access,'private');assert.equal(options.token,'private-archive-fixture');
  assert.equal(path,'history/daily/2026/11/26/daltons-full.json.gz');
  assert.deepEqual(JSON.parse(gunzipSync(body).toString()),snapshot);
  return {url:'https://store-fixture.private.blob.vercel-storage.com/'+path,pathname:path};
};
assert.equal(dailySnapshotStoreConfigured(),false);
await assert.rejects(saveDailySnapshot(snapshot,'2026-11-26',{putImpl}));
assert.equal(uploads,0,'public media credentials must never be used for raw snapshots');
process.env.DALTON_PRIVATE_ARCHIVE_TOKEN='private-archive-fixture';
process.env.VERCEL_ENV='preview';
assert.equal(dailySnapshotStoreConfigured(),false);
await assert.rejects(saveDailySnapshot(snapshot,'2026-11-26',{putImpl}));assert.equal(uploads,0);
process.env.VERCEL_ENV='production';
assert.equal(dailySnapshotStoreConfigured(),true);
const meta=await saveDailySnapshot(snapshot,'2026-11-26',{putImpl});
assert.equal(meta.archiveStatus,'private');assert.equal(uploads,1);
await assert.rejects(saveDailySnapshot(snapshot,'2026-11-26',{putImpl:async()=>({url:'https://fixture.public.blob.vercel-storage.com/test'})}),/private URL/);
assert.equal(dailyRefreshComplete({archiveStatus:'disabled',refresh:{persisted:true}},false),true);
assert.equal(dailyRefreshComplete({archiveStatus:'disabled',refresh:{persisted:true}},true),false);
assert.equal(dailyRefreshComplete({archiveStatus:'failed',refresh:{persisted:true}},true),false);
console.log('F01: production-only dedicated private archive; missing configuration fails closed: OK');
delete process.env.BLOB_STORE_ID;delete process.env.BLOB_READ_WRITE_TOKEN;delete process.env.DALTON_PRIVATE_ARCHIVE_TOKEN;
const date=(minutes=0)=>new Date(Date.now()+minutes*60000).toISOString();
function response(){return {http:200,value:null,setHeader(){},status(n){this.http=n;return this},json(value){this.value=value}}}

const {encodeCompactMaster}=await import('./compact-master-cache.mjs');
process.env.VERCEL_ENV='production';
process.env.UPSTASH_REDIS_REST_URL='https://offline-audit.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN='isolated-fixture';
process.env.DALTON_SYNC_TOKEN='isolated-fixture';
const {default:addon}=await import('../api/addon-sync.js');
let current=JSON.stringify({generatedAt:date(-4),characters:[
 {slug:'audit-one',name:'Audit One',classId:8,level:12},
 {slug:'audit-two',name:'Audit Two',classId:8,level:12}
]});
const classFixture=encodeCompactMaster({classMaster:{slug:'mage',abilities:[{ranks:[{id:133},{id:143}]}]}});
const state=new Map();
let receivedReads=0,owner=null,lockAttempts=0,forceConflict=false,loseBeforeStatus=false;
let allowSecond;
const allowSecondPromise=new Promise(resolve=>{allowSecond=resolve});
const commands=[];
globalThis.fetch=async(url,options={})=>{
  assert.equal(String(url),'https://offline-audit.invalid','auditor blocks all real destinations');
  const [op,k,a,...rest]=JSON.parse(options.body);
  commands.push(op);
  let result=null;
  if(op==='GET'){
    if(k.endsWith(':characters:v1')){
      result=current;
      receivedReads++;
      assert.ok(owner,'F02: roster read must take place while lock is held');
    }else if(k.includes('class-master')&&k.endsWith(':gz1'))result=classFixture;
    else result=state.get(k)??null;
  }else if(op==='SET'&&k.endsWith(':refresh:lock')){
    if(forceConflict)return Response.json({result:null});
    const attempted=++lockAttempts;
    if(attempted===2)await allowSecondPromise;
    assert.equal(owner,null);owner=a;result='OK';
  }else if(op==='HMGET'){
    result=[a,...rest].map(id=>JSON.stringify({id:Number(id),name:'Feuerball',rank:'Rang'}));
  }else if(op==='RPUSH'){result=1}
  else if(op==='EVAL'){
    const count=a,keys=rest.slice(0,count),values=rest.slice(count);
    if(keys[0].endsWith(':refresh:lock')&&keys.length===3){
      assert.equal(values[0],owner);
      current=values[1];result='OK';
    }else if(keys[0].endsWith(':refresh:lock')&&keys.length===1){
      assert.equal(values[0],owner);owner=null;result=1;
      allowSecond();
    }else if(keys[0].includes(':addon-sync:')){
      assert.equal(keys.length,3,'production addon status must be fenced');
      if(loseBeforeStatus||owner!==values[3])return Response.json({error:'REFRESH_LOCK_LOST'});
      state.set(keys[0],values[0]);result='OK';
    }else throw Error('Unexpected fixture Lua command');
  }else throw Error('Unsupported fixture command '+op);
  return Response.json({result});
};
const payload=name=>({schemaVersion:1,addon:{build:'71139',gameVersion:'1.60.1',locale:'deDE'},
  sections:{character:{name,classID:8,level:12,capturedAt:Math.floor(Date.now()/1000)},
    spellbook:{capturedAt:Math.floor(Date.now()/1000),entryCount:1,entries:[{spellID:143,name:'Feuerball',known:true}]}}});
const req=name=>({method:'POST',headers:{authorization:'Bearer isolated-fixture'},body:payload(name)});
const first=response(),second=response();
await Promise.all([addon(req('Audit One'),first),addon(req('Audit Two'),second)]);
assert.deepEqual([first.http,second.http],[200,200]);
assert.deepEqual([first.value.spellbookApplied,second.value.spellbookApplied],[true,true]);
const remaining=JSON.parse(current).characters.filter(c=>c.knownClassAbilitiesVerified===true).map(c=>c.slug);
assert.deepEqual(remaining,['audit-one','audit-two']);
assert.equal(receivedReads,2);
assert.equal(owner,null);
const savedBefore=current;
forceConflict=true;
const conflict=response();await addon(req('Audit One'),conflict);
assert.equal(conflict.http,409);assert.equal(current,savedBefore);assert.equal(receivedReads,2);
forceConflict=false;
const denied=response();await addon(req('Unknown Character'),denied);
assert.equal(denied.http,400);assert.equal(owner,null);assert.equal(current,savedBefore);
loseBeforeStatus=true;
const lost=response();await addon(req('Audit One'),lost);
assert.equal(lost.http,503);assert.equal(owner,null);
console.log('F02: two successful interleaved writes retain both characters, contention and lock-loss fail closed: OK');
globalThis.fetch=originalFetch;
