import assert from 'node:assert/strict';

const previous={
  url:process.env.KV_REST_API_URL,
  token:process.env.KV_REST_API_TOKEN,
  apiKey:process.env.FOREVERDB_API_KEY,
  fetch:globalThis.fetch
};
process.env.KV_REST_API_URL='https://redis.test';
process.env.KV_REST_API_TOKEN='test-token';
process.env.FOREVERDB_API_KEY='test-api-key';

const store=new Map();
function redisResult(result){
  return {ok:true,status:200,json:async()=>({result})};
}
globalThis.fetch=async (url,options={})=>{
  if(!String(url).startsWith('https://redis.test'))throw new Error('Unerwarteter globaler Fetch: '+url);
  const command=JSON.parse(options.body||'[]');
  const op=String(command[0]||'').toUpperCase();
  if(op==='GET')return redisResult(store.get(String(command[1]))??null);
  if(op==='SET'){
    const key=String(command[1]),value=String(command[2]);
    const upper=command.map(value=>String(value).toUpperCase());
    if(upper.includes('NX')&&store.has(key))return redisResult(null);
    store.set(key,value);
    return redisResult('OK');
  }
  if(op==='DEL'){
    let removed=0;
    for(const key of command.slice(1))if(store.delete(String(key)))removed++;
    return redisResult(removed);
  }
  if(op==='EVAL'){
    const key=String(command[3]),token=String(command[4]);
    if(key.includes(':daily-budget:')){
      assert.equal(command[2],2);
      const minute=command[4],n=Number(store.get(key)||0),m=Number(store.get(minute)||0);
      if(n>=Number(command[5]))return redisResult(-1);
      if(m>=Number(command[6]))return redisResult(-2);
      store.set(minute,String(m+1));store.set(key,String(n+1));return redisResult(n+1);
    }
    if(store.get(key)===token){store.delete(key);return redisResult(1)}
    return redisResult(0);
  }
  throw new Error('Nicht unterstützter Redis-Testbefehl: '+op);
};

const {getForeverDbMasterRecipeIndex}=await import('./workshop-store.mjs?budget-test=1');
const calls=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function response(payload,status=200){
  return {
    ok:status>=200&&status<300,status,
    headers:{get:()=>null},
    text:async()=>JSON.stringify(payload)
  };
}
const apiFetch=async url=>{
  const parsed=new URL(url);
  calls.push(parsed.pathname);
  if(parsed.pathname.endsWith('/meta'))return response({data:{build:'1.60.1.71037'}});
  if(parsed.pathname.includes('/professions/')){
    await sleep(12);
    const slug=parsed.pathname.split('/').pop();
    return response({
      data:{id:1,name:slug,ranks:[],trainers:[],recipes:[]},
      meta:{build:'1.60.1.71037',total:0}
    });
  }
  throw new Error('Unerwarteter ForeverDB-Testpfad: '+parsed.pathname);
};

const [first,parallel]=await Promise.all([
  getForeverDbMasterRecipeIndex({fetchImpl:apiFetch}),
  getForeverDbMasterRecipeIndex({fetchImpl:apiFetch})
]);
assert.equal(calls.filter(path=>path.includes('/professions/')).length,3,'Parallele Kaltstarts laden dank Redis-Lock nur einen 3-Berufe-Chunk');
assert.ok(first.refreshing||parallel.refreshing);

let current=first.masterComplete?first:parallel;
for(let i=0;i<5&&!current.masterComplete;i++)current=await getForeverDbMasterRecipeIndex({fetchImpl:apiFetch});
assert.equal(current.masterComplete,true,'Master wird in rate-limit-sicheren Chunks vollständig aufgebaut');
assert.equal(calls.filter(path=>path.endsWith('/meta')).length,1,'Meta wird beim Aufbau nur einmal innerhalb des 30-Minuten-Fensters geladen');
assert.equal(calls.filter(path=>path.includes('/professions/')).length,12,'Jeder der zwölf Berufe wird genau einmal geladen');

const beforeWarm=calls.length;
const warm=await getForeverDbMasterRecipeIndex({fetchImpl:apiFetch});
assert.equal(warm.masterComplete,true);
assert.equal(calls.length,beforeWarm,'Fertiger warmer Master benötigt keinen weiteren ForeverDB-Request');

const metaKey='dalton-dashboard:workshop:foreverdb:meta:v1';
const cachedMeta=JSON.parse(store.get(metaKey));
cachedMeta.generatedAt='2020-01-01T00:00:00.000Z';
store.set(metaKey,JSON.stringify(cachedMeta));
const stale=await getForeverDbMasterRecipeIndex({
  fetchImpl:async()=>{throw new Error('simuliertes Rate-Limit')}
});
assert.equal(stale.masterComplete,true,'Bei temporärem Meta-Ausfall bleibt der letzte vollständige Master nutzbar');

globalThis.fetch=previous.fetch;
if(previous.url===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=previous.url;
if(previous.token===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=previous.token;
if(previous.apiKey===undefined)delete process.env.FOREVERDB_API_KEY;else process.env.FOREVERDB_API_KEY=previous.apiKey;

console.log('ForeverDB budget: distributed master lock, 30-minute meta cache, stale fallback and warm zero-request path: OK');

// Legacy JSON master can be migrated without a ForeverDB request, with byte-for-byte semantic fidelity.
const {readCompactMaster,writeCompactMaster,compressedMasterKey}=await import('./compact-master-cache.mjs');
const large={recipes:Array.from({length:300},(_,i)=>({id:i,name:'Testrezept '+i,source:{name:'Bekannter Händler',zone:'Stormwind',evidence:'forever-confirmed'}}))};
const legacyKey='test-large-master';
const fixture=new Map([[legacyKey,JSON.stringify(large)]]);
let legacyReads=0;
const fakeRedis=async ([op,key,value,...args])=>{
  if(op==='GET'){if(key===legacyKey)legacyReads++;return fixture.get(key)||null}
  if(op==='SET'){if(args.includes('NX')&&fixture.has(key))return null;fixture.set(key,value);return 'OK'}
  throw Error(op);
};
assert.deepEqual(await readCompactMaster(legacyKey,{redisImpl:fakeRedis,log:()=>{}}),large);
assert.equal(legacyReads,1);
assert.ok(fixture.get(compressedMasterKey(legacyKey)).length<fixture.get(legacyKey).length/2);
assert.deepEqual(await readCompactMaster(legacyKey,{redisImpl:fakeRedis}),large);
assert.equal(legacyReads,1,'Warm compressed master never fetches the large raw JSON');
assert.equal(fixture.get(legacyKey),JSON.stringify(large),'Legacy master is preserved for rollback');
await writeCompactMaster(legacyKey,{recipes:[]},{redisImpl:fakeRedis});
assert.deepEqual(await readCompactMaster(legacyKey,{redisImpl:fakeRedis}),{recipes:[]});

const {reserveForeverDbRequest,foreverDbBudgetKey,foreverDbMinuteBudgetKey,FOREVERDB_DAILY_BUDGET,FOREVERDB_MINUTE_BUDGET}=await import('./foreverdb-budget.mjs');
const day=new Date('2026-11-25T13:00:00Z');
const opts={apiKey:'fixture-key',now:day,enabled:true};
let count=FOREVERDB_DAILY_BUDGET-1;
const counter=async ([op,script,num,key,minute,limit,minuteLimit])=>{
  assert.equal(num,2);
  assert.equal(key,foreverDbBudgetKey(opts.apiKey,day));
  assert.equal(minute,foreverDbMinuteBudgetKey(opts.apiKey,day));
  assert.ok(!key.includes(opts.apiKey)&&!minute.includes(opts.apiKey));
  assert.equal(Number(minuteLimit),FOREVERDB_MINUTE_BUDGET);
  if(count>=Number(limit))return -1;
  return ++count;
};
assert.equal(await reserveForeverDbRequest({...opts,redisImpl:counter}),FOREVERDB_DAILY_BUDGET);
await assert.rejects(()=>reserveForeverDbRequest({...opts,redisImpl:counter}),error=>error.code==='FOREVERDB_INTERNAL_QUOTA');
assert.notEqual(foreverDbBudgetKey(opts.apiKey,day),foreverDbBudgetKey(opts.apiKey,new Date('2026-11-26T00:00:00Z')));

const {readBuildDelta,unchangedAcrossDelta}=await import('./build-delta.mjs');
const nextBuild='1.60.1.71091',previousBuild='1.60.1.71037';
const rows=[{type:'item',change:'changed',itemId:123},{type:'spell',change:'removed',spellId:456},{type:'ability',change:'changed'}];
const readPage=async()=>({data:{build:nextBuild,previousBuild,changes:rows},meta:{total:rows.length}});
const delta=await readBuildDelta(nextBuild,{readPage});
assert.equal(delta.complete,true);
assert.equal(unchangedAcrossDelta(delta,'item',124),true);
assert.equal(unchangedAcrossDelta(delta,'item',123),false);
assert.equal(unchangedAcrossDelta(delta,'spell',457),false,'Unresolved ability/rank changes prevent reuse of old spell data');
assert.equal((await readBuildDelta(nextBuild,{readPage:async()=>({data:{changes:[]},meta:{total:0}})})).complete,false);
assert.equal((await readBuildDelta(nextBuild,{readPage:async()=>({data:{build:nextBuild,previousBuild,changes:[{type:'item',change:'changed',id:1}]},meta:{total:1}})})).complete,false,'Generic change-row ID is not a typed entity ID');
assert.equal((await readBuildDelta(nextBuild,{readPage:async()=>({data:{build:nextBuild,previousBuild,changes:rows},meta:{total:9}}),maxPages:1})).complete,false);


// The combined reservation must preserve the daily counter across minute
// boundaries and fail closed at the internal minute limit.
{
  const counts=new Map();
  const reserve=async ([op,script,num,daily,minute,dailyLimit,minuteLimit])=>{
    assert.equal(op,'EVAL');assert.equal(num,2);
    const d=counts.get(daily)||0,m=counts.get(minute)||0;
    if(d>=Number(dailyLimit))return -1;
    if(m>=Number(minuteLimit))return -2;
    counts.set(daily,d+1);counts.set(minute,m+1);return d+1;
  };
  const time=new Date('2026-11-25T13:05:10Z');
  const results=await Promise.allSettled(Array.from({length:FOREVERDB_MINUTE_BUDGET+1},()=>reserveForeverDbRequest({...opts,now:time,redisImpl:reserve})));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,FOREVERDB_MINUTE_BUDGET);
  assert.equal(results.find(x=>x.status==='rejected').reason.code,'FOREVERDB_INTERNAL_RATE_LIMIT');
  assert.equal(counts.get(foreverDbBudgetKey(opts.apiKey,time)),FOREVERDB_MINUTE_BUDGET);
  assert.equal(await reserveForeverDbRequest({...opts,now:new Date('2026-11-25T13:06:00Z'),redisImpl:reserve}),FOREVERDB_MINUTE_BUDGET+1);
}
