import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {setTimeout as timer} from 'node:timers/promises';
import {gunzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const base=resolve(process.argv[2]),head=resolve(process.argv[3]);
const redisServer=process.env.AUDIT_REDIS_SERVER;
const redisCli=process.env.AUDIT_REDIS_CLI;
const directory=mkdtempSync(join(tmpdir(),'dalton-pr116-'));
const socket=join(directory,'redis.sock');
const env={PATH:'/usr/bin:/bin',LD_LIBRARY_PATH:process.env.AUDIT_REDIS_LIB};
const child=spawn(redisServer,['--port','0','--unixsocket',socket,'--unixsocketperm','700','--protected-mode','yes','--save','','--appendonly','no','--dir',directory],{env,stdio:['ignore','inherit','inherit']});
const exit=once(child,'exit');
const results={};
const requested=[];
const unexpected=[];
let beforeCommand=async()=>{},afterCommand=async()=>{};
let haveChildError=false;
child.on('error',()=>{haveChildError=true});
function redis(...command){
  const raw=execFileSync(redisCli,['-s',socket,'--json',...command.map(String)],{env,encoding:'utf8',timeout:1500});
  if(raw.startsWith('error:'))throw Error(JSON.parse(raw.slice(6)));
  return JSON.parse(raw);
}
function record(id,data){results[id]=data;process.stdout.write(JSON.stringify({id,...data})+'\n')}
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(value){this.value=value}}}
function deferred(){let release;const promise=new Promise(resolve=>{release=resolve});return {promise,release}}
const refreshLock='dalton-dashboard:refresh:lock';
const rosterKey='dalton-dashboard:characters:v1';
const statusKey=(scope='production')=>'dalton-dashboard:addon-sync:v1:'+scope+':audit-one';
const index='dalton-dashboard:history:daily:index:v1';
const last='dalton-dashboard:history:daily:last:v1';
const dailyLock='dalton-dashboard:history:daily:lock:2026-11-26';
const local={date:'2026-11-26',hour:5,minute:7};
const now=Math.floor(Date.now()/1000)-100;
const oldRoster={generatedAt:new Date((now-100)*1000).toISOString(),characters:[
  {slug:'audit-one',name:'Audit One',classId:8,level:12},
  {slug:'audit-two',name:'Audit Two',classId:8,level:12}
]};
const spellIds=()=>JSON.parse(redis('GET',rosterKey)).characters.map(c=>c.knownClassAbilities?.map(a=>a.spellId??a.id)??[]);
const states=(scope='production')=>JSON.parse(redis('GET',statusKey(scope))??'null');
const publicUrl='https://fixture.public.blob.vercel-storage.com/snapshot';
const privateUrl='https://fixture.private.blob.vercel-storage.com/snapshot';
const privateRow={date:local.date,createdAt:'2026-11-26T04:07:00Z',archiveStatus:'private',url:privateUrl};
const rawFixture={snapshotAt:'2026-11-26T04:07:00Z',characters:{fixture:{profile:{ok:true,data:{level:12,last_login_timestamp:0}},equipment:{ok:true,data:{equipped_items:[]}}}}};

async function sdkWrite(directory,store,token,access,{replyUrl=access==='public'?publicUrl:privateUrl}={}){
  const {MockAgent,setGlobalDispatcher,getGlobalDispatcher}=createRequire(join(directory,'package.json'))('undici');
  const previous=getGlobalDispatcher();
  const agent=new MockAgent();
  agent.disableNetConnect();
  let seen;
  agent.get('https://vercel.com').intercept({
    path:path=>path.startsWith('/api/blob/?pathname='),
    method:'PUT'
  }).reply(options=>{
    const headers=new Headers(options.headers);
    assert.deepEqual(JSON.parse(gunzipSync(options.body)),rawFixture);
    assert.equal(headers.get('x-vercel-blob-access'),access);
    assert.equal(headers.get('authorization'),'Bearer '+token);
    assert.equal(headers.get('x-add-random-suffix'),'0');
    assert.equal(headers.get('x-allow-overwrite'),'1');
    seen={access,bytes:options.body.length,path:new URL(options.path,'https://vercel.com').searchParams.get('pathname')};
    return {statusCode:200,data:{url:replyUrl,pathname:seen.path,downloadUrl:replyUrl}};
  });
  setGlobalDispatcher(agent);
  try{
    if(access==='private'&&replyUrl===publicUrl){
      await assert.rejects(store.saveDailySnapshot(rawFixture,local.date),/private URL/);
    }else assert.equal((await store.saveDailySnapshot(rawFixture,local.date)).url,replyUrl);
    assert.ok(seen);
    agent.assertNoPendingInterceptors();
    return seen;
  }finally{setGlobalDispatcher(previous);await agent.close()}
}

try{
  for(let i=0;i<100&&!existsSync(socket)&&!haveChildError&&child.exitCode===null;i++)await timer(20);
  assert.equal(redis('PING'),'PONG');
  for(const variable of Object.keys(process.env)){
    if(/^(VERCEL_|BLOB_|DALTON_|KV_REST_|UPSTASH_|FOREVERDB_|BLIZZARD_)/.test(variable))delete process.env[variable];
  }
  Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_BLOB_RETRIES:'0',BLOB_READ_WRITE_TOKEN:'media-token-fixture'});
  const baseline=await import(join(base,'scripts/daily-snapshot-store.mjs'));
  const candidate=await import(join(head,'scripts/daily-snapshot-store.mjs'));
  const oldUpload=await sdkWrite(base,baseline,'media-token-fixture','public');
  assert.equal(candidate.dailySnapshotStoreConfigured(),false);
  let blockedCalls=0;
  const blockedPut=async()=>{blockedCalls++;throw Error('unexpected put')};
  await assert.rejects(candidate.saveDailySnapshot(rawFixture,local.date,{putImpl:blockedPut}),/nicht konfiguriert/);
  process.env.DALTON_PRIVATE_ARCHIVE_TOKEN='archive-token-fixture';
  process.env.VERCEL_ENV='preview';
  await assert.rejects(candidate.saveDailySnapshot(rawFixture,local.date,{putImpl:blockedPut}),/nicht konfiguriert/);
  assert.equal(blockedCalls,0);
  process.env.VERCEL_ENV='production';
  const newUpload=await sdkWrite(head,candidate,'archive-token-fixture','private');
  assert.equal(oldUpload.path,newUpload.path);
  await sdkWrite(head,candidate,'archive-token-fixture','private',{replyUrl:publicUrl});
  record('F01-sdk',{oldUpload,newUpload,publicResponseRejected:true,disabledOrPreviewUploads:blockedCalls});

  Object.assign(process.env,{UPSTASH_REDIS_REST_URL:'https://offline-review.invalid',
    UPSTASH_REDIS_REST_TOKEN:'redis-fixture',DALTON_SYNC_TOKEN:'sync-fixture',CRON_SECRET:'cron-fixture'});
  globalThis.fetch=async(url,options={})=>{
    if(String(url)!=='https://offline-review.invalid'){
      unexpected.push(String(url));throw Error('External transport blocked');
    }
    const command=JSON.parse(options.body);
    requested.push(command.slice(0,2));
    await beforeCommand(command);
    let result;
    try{result=redis(...command)}catch(error){return Response.json({error:error.message})}
    await afterCommand(command,result);
    return Response.json({result});
  };
  const {encodeCompactMaster}=await import(join(head,'scripts/compact-master-cache.mjs'));
  const {VERSION_METADATA_KEY}=await import(join(head,'scripts/version-metadata.mjs'));
  const {saveAddonSyncState}=await import(join(head,'scripts/addon-sync-store.mjs'));
  const {default:addon}=await import(join(head,'api/addon-sync.js'));
  const {createDailySnapshotHandler}=await import(join(head,'api/daily-snapshot.js'));
  const reset=()=>{
    beforeCommand=async()=>{};afterCommand=async()=>{};
    redis('FLUSHDB');
    redis('SET',rosterKey,JSON.stringify(oldRoster));
    redis('SET','dalton-dashboard:foreverdb:class-master:v8:mage:1.60.1.71139:gz1',
      encodeCompactMaster({classMaster:{slug:'mage',abilities:[{ranks:[{id:133},{id:143}]}]}}));
    for(const id of [133,143])redis('HSET','dalton-dashboard:foreverdb:class-spell-locale:v2',id,JSON.stringify({id,name:'Prüfzauber'}));
    requested.length=0;
  };
  const makeRequest=(name,syncId,offset=0,ids=[133],interactions)=>{
    const capturedAt=now+offset;
    return {method:'POST',headers:{authorization:'Bearer sync-fixture'},body:{schemaVersion:1,syncId,addon:{build:'71139',gameVersion:'1.60.1',locale:'deDE'},
      sections:{character:{name,classID:8,level:12,capturedAt},
        spellbook:{capturedAt,entryCount:ids.length,entries:ids.map(spellID=>({spellID,name:'Prüfzauber',known:true}))},
        ...(interactions?{interactions}:{})}}};
  };
  const runAddon=async request=>{const res=response();await addon(request,res);return res};
  const addonEval=cmd=>cmd[0]==='EVAL'&&cmd[3]===statusKey();

  reset();
  const reached=deferred(),resume=deferred();
  beforeCommand=async command=>{
    if(command[0]==='GET'&&command[1]===rosterKey&&!requested.some(([op,key])=>op==='GET'&&key===statusKey())){
      assert.ok(redis('GET',refreshLock));reached.release();await resume.promise;
    }
  };
  const first=runAddon(makeRequest('Audit One','one'));
  await reached.promise;
  const requestsBefore=requested.filter(([op,k])=>op==='GET'&&(k===rosterKey||k.includes(':addon-sync:'))).length;
  const conflict=await runAddon(makeRequest('Audit Two','two'));
  assert.equal(conflict.code,409);
  assert.equal(requested.filter(([op,k])=>op==='GET'&&(k===rosterKey||k.includes(':addon-sync:'))).length,requestsBefore);
  resume.release();
  const firstResponse=await first;
  const secondResponse=await runAddon(makeRequest('Audit Two','two'));
  assert.deepEqual([firstResponse.code,secondResponse.code],[200,200]);
  assert.deepEqual(spellIds(),[[133],[133]]);
  assert.equal(redis('GET',refreshLock),null);
  const duplicate=await runAddon(makeRequest('Audit Two','two'));
  assert.equal(duplicate.value.duplicate,true);
  record('F02-contention',{status:[firstResponse.code,conflict.code,secondResponse.code],persistedSpellIds:spellIds(),duplicate:true,lockReleased:true});

  reset();
  beforeCommand=async cmd=>{if(addonEval(cmd))throw Error('Simulated Redis transport interruption before status')};
  const interrupted=await runAddon(makeRequest('Audit One','old-sync',0,[133]));
  assert.equal(interrupted.code,503);
  assert.deepEqual(spellIds()[0],[133]);
  assert.equal(states(),null);
  const partial={code:interrupted.code,ids:spellIds()[0],status:states()};
  beforeCommand=async()=>{};
  const newer=await runAddon(makeRequest('Audit One','new-sync',50,[133,143]));
  assert.equal(newer.code,200);
  const savedNewer=spellIds()[0];
  assert.deepEqual(savedNewer,[133,143]);
  const replay=await runAddon(makeRequest('Audit One','old-sync',0,[133]));
  assert.equal(replay.code,200);
  assert.equal(replay.value.duplicate,false);
  assert.deepEqual(spellIds()[0],[133]);
  assert.equal(states().payload.syncId,'old-sync');
  record('F02-F03-partial-and-retry',{partial,newer:savedNewer,retry:spellIds()[0],retryDuplicate:replay.value.duplicate});

  reset();
  const hardCrashProgram = `
    import {execFileSync} from 'node:child_process';
    const [registry, redisCli, socket, worktree, request] = process.argv.slice(1);
    globalThis.fetch=async(url,options)=>{
      if(String(url)!==registry)throw Error('External transport blocked');
      const command=JSON.parse(options.body);
      if(command[0]==='EVAL'&&command[3]==='dalton-dashboard:addon-sync:v1:production:audit-one'){
        process.stdout.write('status-checkpoint\\n');
        setInterval(()=>{},1000);
        await new Promise(()=>{});
      }
      const raw=execFileSync(redisCli,['-s',socket,'--json',...command.map(String)],{encoding:'utf8',timeout:1500});
      return Response.json({result:JSON.parse(raw)});
    };
    const {default: run}=await import(worktree+'/api/addon-sync.js');
    await run(JSON.parse(request),{setHeader(){},status(){return this},json(){}});
  `;
  const hardCrash=spawn(process.execPath,['--input-type=module','--eval',hardCrashProgram,
    process.env.UPSTASH_REDIS_REST_URL,redisCli,socket,head,JSON.stringify(makeRequest('Audit One','hard-abort'))],
    {env:{...process.env,...env},stdio:['ignore','pipe','inherit']});
  const childExit=once(hardCrash,'exit');
  try{
    const [checkpoint]=await Promise.race([once(hardCrash.stdout,'data'),childExit.then(()=>{throw Error('Child exited before checkpoint')}),timer(2500).then(()=>{throw Error('Checkpoint timeout')})]);
    assert.match(String(checkpoint),/status-checkpoint/);
  }finally{if(hardCrash.exitCode===null)hardCrash.kill('SIGKILL');await childExit}
  const ttlMs=redis('PTTL',refreshLock);
  assert.ok(ttlMs>0&&ttlMs<=120000);
  assert.deepEqual(spellIds()[0],[133]);
  assert.equal(states(),null);
  const immediateRetry=await runAddon(makeRequest('Audit One','hard-abort'));
  assert.equal(immediateRetry.code,409);
  redis('PEXPIRE',refreshLock,1);
  await timer(20);
  const expiredRetry=await runAddon(makeRequest('Audit One','hard-abort'));
  assert.equal(expiredRetry.code,200);
  assert.equal(states().payload.syncId,'hard-abort');
  record('F02-hard-process-abort',{profilePersisted:true,statusMissing:true,lockTtlMs:ttlMs,immediateRetry:immediateRetry.code,afterExpiry:expiredRetry.code});

  reset();
  beforeCommand=async cmd=>{
    if(addonEval(cmd))redis('SET',refreshLock,'synthetic-successor');
  };
  const lost=await runAddon(makeRequest('Audit One','lost'));
  assert.equal(lost.code,503);
  assert.deepEqual(spellIds()[0],[133]);
  assert.equal(states(),null);
  assert.equal(redis('GET',refreshLock),'synthetic-successor');
  record('F02-lost-lock',{code:lost.code,ids:spellIds()[0],status:states(),successorLockRetained:true});

  reset();
  afterCommand=async cmd=>{if(addonEval(cmd))throw Error('Simulated response lost after status commit')};
  const lostReply=await runAddon(makeRequest('Audit One','lost-reply'));
  assert.equal(lostReply.code,503);
  assert.equal(states().payload.syncId,'lost-reply');
  afterCommand=async()=>{};
  const rereply=await runAddon(makeRequest('Audit One','lost-reply'));
  assert.equal(rereply.value.duplicate,true);
  record('F02-lost-reply',{code:lostReply.code,retry:rereply.code,duplicate:rereply.value.duplicate});

  reset();
  const interactions={trainerHistory:[{npc:{id:101,name:'Prüftrainer'},capturedAt:now,services:[{name:'Prüfzauber'}]}]};
  beforeCommand=async cmd=>{
    if(cmd[0]==='GET'&&cmd[1].includes(':production:record:trainer:'))redis('SET',refreshLock,'synthetic-successor');
  };
  const preempted=await runAddon(makeRequest('Audit One','preempted',0,[143],interactions));
  assert.equal(preempted.code,503);
  assert.deepEqual(spellIds()[0],[]);
  assert.equal(states(),null);
  const records=redis('KEYS','dalton-dashboard:live-knowledge:v1:production:record:*');
  assert.equal(records.length,1);
  assert.equal(redis('GET',refreshLock),'synthetic-successor');
  record('F02-unfenced-live-knowledge',{code:preempted.code,observations:records.length,rosterChanged:false,statusChanged:false,successorLockRetained:true});

  reset();
  redis('SET',refreshLock,'synthetic-owner');
  redis('SET',VERSION_METADATA_KEY,'wrong-type-fixture');
  await assert.rejects(saveAddonSyncState('audit-one',{syncId:'metadata-error'},{lockToken:'synthetic-owner'}),/WRONGTYPE/);
  assert.equal(states().payload.syncId,'metadata-error');
  record('F02-lua-no-rollback',{statusPersisted:true,versionError:'WRONGTYPE'});

  reset();
  const unauthed=makeRequest('Audit One','unauthorized');
  unauthed.headers.authorization='Bearer unrelated-fixture';
  assert.equal((await runAddon(unauthed)).code,401);
  assert.equal(requested.length,0);
  process.env.VERCEL_ENV='preview';
  const preview=await runAddon(makeRequest('Audit One','preview',0,[143],interactions));
  assert.equal(preview.code,200);
  assert.equal(preview.value.spellbookApplied,false);
  assert.deepEqual(spellIds()[0],[]);
  assert.equal(states(),null);
  assert.equal(states('preview').payload.syncId,'preview');
  assert.equal(redis('GET',refreshLock),null);
  assert.deepEqual(redis('KEYS','dalton-dashboard:live-knowledge:v1:production:*'),[]);
  assert.equal(redis('HEXISTS',VERSION_METADATA_KEY,'addon:production:audit-one'),0);
  assert.equal(redis('HEXISTS',VERSION_METADATA_KEY,'addon:preview:audit-one'),1);
  record('Security-addon',{unauthorizedNoCommands:true,previewNoProfileOrProductionStatusWrites:true,previewVersionNamespaced:true});
  process.env.VERCEL_ENV='production';

  const dailyRequest={method:'GET',headers:{authorization:'Bearer cron-fixture'}};
  function dailyHarness(overrides={}){
    const calls={upload:0,raw:0,refresh:0};
    const handler=createDailySnapshotHandler({
      configured:()=>true,blizzardApiConfigured:()=>true,dailySnapshotStoreConfigured:()=>true,
      berlinClock:()=>local,ensurePetRuleState:async()=>({}),publicPetRuleState:()=>({}),
      fetchForeverSnapshot:async()=>{calls.raw++;return rawFixture},
      saveDailySnapshot:async()=>{calls.upload++;return privateRow},
      refreshDailyCharacters:async()=>{calls.refresh++;return {success:1,persisted:true}},
      ...overrides
    });
    return {calls,run:async(request=dailyRequest)=>{const res=response();await handler(request,res);return res}};
  }
  function dailyRow(){return JSON.parse(redis('HGET',index,local.date)??'null')}
  function lastRow(){return JSON.parse(redis('GET',last)??'null')}
  const indexWrite=cmd=>cmd[0]==='HSET'&&cmd[1]===index;
  const lastWrite=cmd=>cmd[0]==='SET'&&cmd[1]===last;
  const refreshPersisted=cmd=>JSON.parse(cmd.at(-1)).refresh?.persisted===true;

  reset();
  const legacy={date:local.date,url:publicUrl,refresh:{persisted:true}};
  redis('HSET',index,local.date,JSON.stringify(legacy));
  const legacyHarness=dailyHarness();
  const legacyResult=await legacyHarness.run();
  assert.equal(legacyResult.value.reason,'already_completed');
  assert.equal(legacyResult.value.snapshot.url,publicUrl);
  assert.deepEqual(legacyHarness.calls,{upload:0,raw:0,refresh:0});
  const cronDenied=dailyHarness();
  assert.equal((await cronDenied.run({method:'GET',headers:{authorization:'Bearer unrelated-fixture'}})).code,401);
  assert.deepEqual(cronDenied.calls,{upload:0,raw:0,refresh:0});
  record('F01-legacy-and-authorization',{legacyPublicReferenceRetained:true,cronUnauthorized:401,noWrite:true});

  reset();
  const abortArchive=dailyHarness();
  let failOnce=true;
  beforeCommand=async cmd=>{if(indexWrite(cmd)&&failOnce){failOnce=false;throw Error('Interrupted after Blob upload') }};
  assert.equal((await abortArchive.run()).code,503);
  assert.equal(dailyRow().archiveStatus,'failed');
  assert.equal(dailyRow().refresh.persisted,true);
  assert.equal((await abortArchive.run()).code,200);
  assert.deepEqual(abortArchive.calls,{upload:2,raw:2,refresh:1});
  record('Daily-upload-abort',{...abortArchive.calls,profileRepeated:false,archiveOverwritten:true});

  reset();
  const abortIndex=dailyHarness();
  let failIndex=true;
  beforeCommand=async cmd=>{if(indexWrite(cmd)&&refreshPersisted(cmd)&&failIndex){failIndex=false;throw Error('Interrupted before final daily index')}};
  assert.equal((await abortIndex.run()).code,503);
  assert.equal(dailyRow().refresh,undefined);
  assert.equal((await abortIndex.run()).code,200);
  assert.deepEqual(abortIndex.calls,{upload:1,raw:1,refresh:2});
  record('Daily-final-index-abort',{...abortIndex.calls,profileRepeated:true,archiveRepeated:false});

  reset();
  const abortLast=dailyHarness();
  let failLast=true;
  beforeCommand=async cmd=>{if(lastWrite(cmd)&&refreshPersisted(cmd)&&failLast){failLast=false;throw Error('Interrupted before daily last pointer')}};
  assert.equal((await abortLast.run()).code,503);
  assert.equal(dailyRow().refresh.persisted,true);
  assert.equal(lastRow().refresh,undefined);
  assert.equal((await abortLast.run()).value.reason,'already_completed');
  assert.equal(lastRow().refresh,undefined);
  record('Daily-last-pointer-abort',{...abortLast.calls,dayComplete:true,lastPointerComplete:false,retryRepairs:false});

  reset();
  const dailyParallel=dailyHarness();
  const dailyEntered=deferred(),dailyResume=deferred();
  beforeCommand=async cmd=>{if(indexWrite(cmd)&&!refreshPersisted(cmd)){dailyEntered.release();await dailyResume.promise}};
  const dailyPromise=dailyParallel.run();
  await dailyEntered.promise;
  const pending=await dailyParallel.run();
  assert.equal(pending.value.reason,'daily_snapshot_running');
  dailyResume.release();
  assert.equal((await dailyPromise).code,200);
  assert.equal(redis('GET',dailyLock),null);
  record('Daily-contention',{...dailyParallel.calls,second:pending.value.reason,lockReleased:true});

  reset();
  // Omit the override to run the actual default refresh implementation.
  const runOverlap=async()=>{
    const res=response();
    const handler=createDailySnapshotHandler({configured:()=>true,blizzardApiConfigured:()=>true,
      dailySnapshotStoreConfigured:()=>false,berlinClock:()=>local,
      ensurePetRuleState:async()=>({}),publicPetRuleState:()=>({})});
    await handler(dailyRequest,res);
    return res;
  };
  const deniedAttempt=deferred();
  const injectedAddonInProgress=deferred();
  let lockAttempts=0;
  beforeCommand=async cmd=>{
    if(cmd[0]==='GET'&&cmd[1].includes('class-master')){
      injectedAddonInProgress.release();
      await deniedAttempt.promise;
    }
    if(cmd[0]==='SET'&&cmd[1]===refreshLock&&++lockAttempts===4){
      assert.ok(redis('GET',refreshLock),'Addon must still own the lock before the third cron attempt');
    }
  };
  afterCommand=async(cmd,result)=>{
    if(cmd[0]==='SET'&&cmd[1]===refreshLock&&lockAttempts===4){
      assert.equal(result,null);
      deniedAttempt.release();
      await addonInFlight;
    }
  };
  const addonInFlight=runAddon(makeRequest('Audit One','cron-overlap'));
  await injectedAddonInProgress.promise;
  const falselyComplete=await runOverlap();
  assert.equal((await addonInFlight).code,200);
  assert.equal(falselyComplete.value.refresh.reason,'concurrent_refresh_completed');
  assert.equal(falselyComplete.value.refresh.persisted,true);
  assert.equal((await runOverlap()).value.reason,'already_completed');
  assert.equal(states().payload.syncId,'cron-overlap');
  record('Daily-addon-overlap',{attempts:lockAttempts-1,addonStatus:200,reason:falselyComplete.value.refresh.reason,subsequentCronSkipped:true});

  reset();
  const {fetchForeverSnapshot}=await import(join(head,'scripts/blizzard-api.mjs'));
  process.env.BLIZZARD_CLIENT_ID='blizzard-fixture';
  process.env.BLIZZARD_CLIENT_SECRET='blizzard-fixture';
  const allFailed=await fetchForeverSnapshot(['audit-one','audit-two'],{fetchImpl:async url=>
    String(url).startsWith('https://oauth.battle.net/')
      ?Response.json({access_token:'oauth-fixture',expires_in:3600})
      :Response.json({error:'outage fixture'},{status:503})});
  const endpoints=Object.values(allFailed.characters).flatMap(Object.values);
  assert.equal(endpoints.length,42);
  assert.equal(endpoints.filter(endpoint=>endpoint.ok).length,0);
  let archivedFailed=false;
  const poorArchive=dailyHarness({fetchForeverSnapshot:async()=>allFailed,
    saveDailySnapshot:async raw=>{assert.equal(raw,allFailed);archivedFailed=true;return privateRow}});
  const poorResult=await poorArchive.run();
  assert.equal(poorResult.code,200);
  assert.equal(poorResult.value.snapshot.archiveStatus,'private');
  assert.equal(archivedFailed,true);
  assert.equal((await poorArchive.run()).value.reason,'already_completed');
  record('F06-archive-of-failed-endpoints',{total:endpoints.length,ok:0,archived:archivedFailed,subsequentCronSkipped:true});

  assert.deepEqual(unexpected,[]);
  record('offline-check',{unexpectedDestinations:unexpected.length});
}finally{
  if(child.exitCode===null&&!haveChildError){child.kill('SIGTERM');await exit;}
  rmSync(directory,{recursive:true,force:true});
}
