import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {runArchiveCases} from './archive-cases.mjs';
import {runMigrationCases} from './migration-cases.mjs';
import {runRestoreCases} from './restore-cases.mjs';
import {addonRequest,cronRequest,endpoint,gate,installRedisEnv,redisCommand,reply,withRedis} from './redis-fixture.mjs';

const [base,first,previous,head]=process.argv.slice(2).map(path=>resolve(path));
assert.ok(base&&first&&previous&&head,'usage: node check.mjs AUDIT_BASE FIRST_CANDIDATE PREVIOUS_CANDIDATE NEW_CANDIDATE');
installRedisEnv();

const characters='dalton-dashboard:characters:v1';
const legacyVersion='dalton-dashboard:data-version:meta:v1';
const version='dalton-dashboard:core:compact:v2:production';
const previewCompact='dalton-dashboard:core:compact:v2:preview';
const refreshLock='dalton-dashboard:refresh:lock';
const status=(name='audit-one',scope='production')=>'dalton-dashboard:addon-sync:v1:'+scope+':'+name;
const dailyIndex='dalton-dashboard:history:daily:index:v1';
const dailyLast='dalton-dashboard:history:daily:last:v1';
const dailyLastField='__last:v2';
const date='2026-11-26';
const dailyLock='dalton-dashboard:history:daily:lock:'+date;
const observationIndex='dalton-dashboard:live-knowledge:v1:production:records:v2';
const observationVersion='__version:v2';
const validNow=Math.floor(Date.now()/1000)-180;
const oldRoster={generatedAt:new Date((validNow-10)*1000).toISOString(),characters:[
  {slug:'audit-one',name:'Audit One',classId:8,level:12},
  {slug:'audit-two',name:'Audit Two',classId:8,level:12}
]};
const oldArchive='https://audit-only.public.blob.vercel-storage.com/synthetic-legacy';
function payload(syncId,offset=0,ids=[133],name='Audit One'){
  const capturedAt=validNow+offset;
  return {schemaVersion:1,syncId,addon:{version:'0.1.0-beta.1',build:'71139',gameVersion:'1.60.1',locale:'deDE'},
    sections:{character:{name,classID:8,level:12,capturedAt},
      spellbook:{capturedAt,entryCount:ids.length,entries:ids.map(spellID=>({spellID,name:'Prüfzauber',known:true}))}}};
}
const trainer=(id,time,price=10)=>({capturedAt:validNow+time,complete:true,npc:{id,name:'Modelltrainer'},
  services:[{name:'Prüfzauber',priceCopper:price}]});
function interactions(body,offset,entries){
  body.sections.interactions={capturedAt:validNow+offset,trainerHistory:entries};
  return body;
}
const record=(id,result)=>process.stdout.write(JSON.stringify({id,...result})+'\n');
const count=(commands,match)=>commands.filter(match).length;
const isCore=command=>command[0]==='EVAL'&&command[3]?.startsWith('dalton-dashboard:addon-sync:');
const isObservation=command=>command[0]==='EVAL'&&command[3]===observationIndex;
const isIndex=command=>command[0]==='EVAL'&&command[3]===dailyIndex;

await withRedis(async ({socket,exec:redis,restart})=>{
  const json=(...cmd)=>JSON.parse(redis(...cmd)??'null');
  const getStatus=()=>json('GET',status());
  const ids=(name='audit-one')=>json('GET',characters).characters.find(c=>c.slug===name).knownClassAbilities?.map(v=>v.id)??[];
  const snapshotCore=()=>[redis('GET',characters),redis('GET',status()),redis('GET',version)];
  const snapshotIndex=()=>[redis('HGET',dailyIndex,date),redis('HGET',dailyIndex,dailyLastField)];
  const observations=()=>redis('HKEYS',observationIndex).filter(key=>key!==observationVersion);
  const commands=[];
  let before=async()=>{},after=async()=>{},providers=null,redisUser=null,redisSocket=socket;
  globalThis.fetch=async(url,options={})=>{
    if(String(url)!==endpoint){
      if(providers)return providers(new URL(url),options);
      throw Error('External network disabled');
    }
    const command=JSON.parse(options.body);
    commands.push({type:command[0],key:command[0]==='EVAL'?command[3]:command[1],bytes:Buffer.byteLength(options.body)});
    await before(command);
    let result;
    try{result=redisCommand(redisSocket,command,redisUser);}catch(error){return Response.json({error:error.message});}
    await after(command,result);
    return Response.json({result});
  };
  const load=(tree,file)=>import(join(tree,file));
  const {default:baseline}=await load(base,'api/addon-sync.js');
  const {default:prior}=await load(first,'api/addon-sync.js');
  const {default:previousAddon}=await load(previous,'api/addon-sync.js');
  const {default:addon}=await load(head,'api/addon-sync.js');
  const {encodeCompactMaster}=await load(head,'scripts/compact-master-cache.mjs');
  const {parseLuaSavedVariable}=await load(head,'scripts/savedvariables-parser.mjs');
  const {buildSafeAddonSyncPayload,normalizeAddonSyncPayload}=await load(head,'scripts/addon-sync.mjs');
  const {saveAddonSyncState}=await load(head,'scripts/addon-sync-store.mjs');
  const {saveCharacters,loadCharacters,loadDailyProfileReceipt}=await load(head,'scripts/character-store.mjs');
  const {createDailySnapshotHandler,refreshDailyCharacters,profileRefreshComplete}=await load(head,'api/daily-snapshot.js');
  const {acquireDailySnapshotLock,releaseDailySnapshotLock,registerDailySnapshot,getLastDailySnapshot}=await load(head,'scripts/history-store.mjs');
  const classMaster=encodeCompactMaster({classMaster:{slug:'mage',abilities:[{ranks:[{id:133},{id:143}]}]}});
  function reset(roster=oldRoster){
    before=async()=>{};after=async()=>{};providers=null;redisUser=null;
    redis('FLUSHDB');
    redis('SET',characters,JSON.stringify(roster));
    for(const build of ['70790','71139'])redis('SET','dalton-dashboard:foreverdb:class-master:v8:mage:1.60.1.'+build+':gz1',classMaster);
    for(const id of [133,143])redis('HSET','dalton-dashboard:foreverdb:class-spell-locale:v2',id,JSON.stringify({id,name:'Prüfzauber'}));
    commands.length=0;
  }
  async function call(body,handler=addon,request=addonRequest(body)){
    const res=reply();
    await handler(request,res);
    return res;
  }
  async function crash(phase,body){
    const args={tree:head,socket,phase,payload:body,date};
    const worker=spawn(process.execPath,[fileURLToPath(new URL('./crash-worker.mjs',import.meta.url)),JSON.stringify(args)],
      {env:{PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,
        AUDIT_REDIS_CLI:process.env.AUDIT_REDIS_CLI,AUDIT_REDIS_SERVER:process.env.AUDIT_REDIS_SERVER},
       stdio:['ignore','pipe','inherit']});
    const exited=once(worker,'exit');
    const controller=new AbortController();
    try{
      const [marker]=await Promise.race([once(worker.stdout,'data'),
        exited.then(()=>{throw Error('Worker exited before checkpoint');}),
        wait(4000,null,{signal:controller.signal}).then(()=>{throw Error('Worker checkpoint timed out');})]);
      assert.match(String(marker),/redis-commit-checkpoint/);
    }finally{
      controller.abort();
      if(worker.exitCode===null)worker.kill('SIGKILL');
      const [,signal]=await exited;
      assert.equal(signal,'SIGKILL');
    }
  }
  async function expire(key){
    assert.equal(redis('PEXPIRE',key,'1'),1);
    await wait(10);
    assert.equal(redis('GET',key),null);
  }
  const rosterIds=roster=>roster.characters.map(c=>({slug:c.slug,id:c.blizzardCharacterId??null}));
  const proof={date,source:'daily',success:2,total:2,persisted:true,generatedAt:date+'T04:08:00Z',roster:rosterIds(oldRoster)};
  const indexRow={date,archiveStatus:'disabled',refresh:proof};
  async function writeProof(day=date){
    const token='local-profile-owner';
    assert.equal(redis('SET',refreshLock,token,'NX'),'OK');
    try{
      const {data}=await loadCharacters();
      data.generatedAt=day+'T04:08:00Z';
      const dailyReceipt={...proof,date:day,generatedAt:data.generatedAt,roster:rosterIds(data),success:data.characters.length,total:data.characters.length};
      await saveCharacters(data,token,{dailyReceipt});
      return dailyReceipt;
    }finally{redis('DEL',refreshLock);}
  }
  function daily(overrides={}){
    return createDailySnapshotHandler({configured:()=>true,blizzardApiConfigured:()=>true,dailySnapshotStoreConfigured:()=>false,
      berlinClock:()=>({date,hour:5,minute:7}),ensurePetRuleState:async()=>({}),publicPetRuleState:()=>({}),...overrides});
  }
  const runCron=async(handler,request=cronRequest)=>{
    const res=reply();await handler(request,res);return res;
  };

  reset();
  const bothRead=gate(),allowSecond=gate();
  let reads=0,locks=0;
  after=async command=>{
    if(command[0]==='GET'&&command[1]===characters){
      if(++reads===2)bothRead.open();
      await bothRead.ready;
    }
    if(command[0]==='EVAL'&&command[2]===1&&command[3]===refreshLock)allowSecond.open();
  };
  before=async command=>{
    if(command[0]==='SET'&&command[1]===refreshLock&&++locks===2)await allowSecond.ready;
  };
  const oldResponses=await Promise.all([call(payload('base-one'),baseline),call(payload('base-two',0,[143],'Audit Two'),baseline)]);
  assert.deepEqual(oldResponses.map(x=>x.code),[200,200]);
  assert.equal(json('GET',characters).characters.filter(x=>x.knownClassAbilitiesVerified===true).length,1);
  record('original-F02',{http:[200,200],persistedCharacters:1,redis:'real'});

  for(const [tag,handler] of [['prior',prior],['current',addon]]){
    reset();
    let interrupted=true;
    before=async command=>{
      if(interrupted&&isCore(command)){interrupted=false;throw Error('Fixture interruption before sync commit');}
    };
    assert.equal((await call(payload('old'),handler)).code,503);
    const beforeRetry=ids();
    assert.deepEqual(beforeRetry,tag==='prior'?[133]:[]);
    assert.equal(getStatus(),null);
    assert.equal((await call(payload('newer',2,[133,143]),handler)).code,200);
    const late=await call(payload('old'),handler);
    assert.equal(late.code,tag==='prior'?200:409);
    assert.deepEqual(ids(),tag==='prior'?[133]:[133,143]);
    record(tag+'-partial-retry',{beforeRetry,lateHttp:late.code,endIds:ids(),endSync:getStatus().payload.syncId});
  }

  reset();
  const entering=gate(),allow=gate();
  let waitOnce=true;
  before=async command=>{
    if(waitOnce&&command[0]==='GET'&&command[1]===characters){
      waitOnce=false;assert.ok(redis('GET',refreshLock));entering.open();await allow.ready;
    }
  };
  const one=call(payload('fixture-one'));
  await entering.ready;
  const two=payload('fixture-two',0,[143],'Audit Two');
  assert.equal((await call(two)).code,409);
  assert.equal(count(commands,c=>c.type==='GET'&&c.key===characters),1);
  allow.open();
  assert.equal((await one).code,200);
  assert.equal((await call(two)).code,200);
  assert.deepEqual([ids(),ids('audit-two')],[[133],[133,143]]);
  for(const key of ['audit-one','audit-two']){
    const state=json('GET',status(key));
    assert.equal(json('GET',version).addon[key].syncId,state.payload.syncId);
  }
  assert.equal(json('GET',version).characters.generatedAt,json('GET',characters).generatedAt);
  record('current-F02-contention',{http:[200,409,200],persistedCharacters:2,coherentVersion:true});

  for(const phase of ['addon-before','addon-after']){
    reset();
    const baselineState=snapshotCore();
    await crash(phase,payload('hard-abort'));
    const committed=phase.endsWith('after');
    if(committed){
      assert.ok(snapshotCore().every((item,i)=>item!==baselineState[i]));
      assert.deepEqual(ids(),[133]);assert.equal(getStatus().payload.syncId,'hard-abort');
    }else assert.deepEqual(snapshotCore(),baselineState);
    assert.ok(redis('PTTL',refreshLock)>0);
    assert.equal((await call(payload('hard-abort'))).code,409);
    await expire(refreshLock);
    const result=await call(payload('hard-abort'));
    assert.equal(result.code,200);
    assert.equal(result.value.duplicate,committed);
    record(phase,{signal:'SIGKILL',coreCommitted:committed,immediateHttp:409,afterExpireDuplicate:result.value.duplicate});
  }

  reset();
  const old=payload('old');
  assert.equal((await call(old)).code,200);
  let drop=true;
  after=async command=>{if(drop&&isCore(command)){drop=false;throw Error('Fixture lost response after Redis commit');}};
  const lost=payload('lost',2,[133,143]);
  assert.equal((await call(lost)).code,503);
  assert.equal(getStatus().payload.syncId,'lost');
  assert.equal((await call(payload('next',4,[133]))).code,200);
  const original=(await call(lost));
  assert.equal(original.value.duplicate,true);
  assert.equal(getStatus().payload.syncId,'next');
  assert.deepEqual(ids(),[133]);
  assert.equal((await call({...lost,syncId:'unknown-late'})).code,409);
  assert.equal((await call({...lost,sections:payload('lost',2,[133]).sections})).code,409);
  record('lost-response-and-late',{duringDrop:503,knownRetry:200,unrecognizedLate:409,reusedIdDifferentContent:409,latestRetained:true});

  reset();
  const {default:spellbook}=await load(head,'api/spellbook-sync.js');
  process.env.SPELLBOOK_SYNC_TOKEN='audit-fixture-only';
  redis('SET','dalton-dashboard:foreverdb:class-master:v8:mage:current:gz1',classMaster);
  const submitCode=async (time,id)=>{
    const res=reply();
    await spellbook({method:'POST',body:{code:['DALTON1','audit-fixture-only','audit-one',8,12,time,id+':Pr%C3%BCfzauber:Rang'].join('|')}},res);
    return res;
  };
  assert.equal((await submitCode(validNow+3,143)).code,200);
  assert.equal((await submitCode(validNow+1,133)).code,409);
  assert.deepEqual(ids(),[133,143]);
  assert.equal(redis('GET',refreshLock),null);
  delete process.env.SPELLBOOK_SYNC_TOKEN;
  record('legacy-spellbook-endpoint',{currentHttp:200,olderHttp:409,latestIds:ids()});

  for(const key of [characters,status(),version]){
    reset();
    redis('DEL',key);redis('LPUSH',key,'unexpected-fixture-type');
    const capture=()=>[characters,status(),version].map(k=>redis('DUMP',k));
    const initial=capture();
    redis('SET',refreshLock,'test-owner','EX',120);
    await assert.rejects(saveAddonSyncState('audit-one',normalizeAddonSyncPayload(payload('wrong-type')),
      {lockToken:'test-owner',roster:oldRoster}),/INVALID_STORAGE_TYPE/);
    assert.deepEqual(capture(),initial);
  }
  reset();
  redis('LPUSH',refreshLock,'unexpected-fixture-type');
  await assert.rejects(saveAddonSyncState('audit-one',normalizeAddonSyncPayload(payload('wrong-type-lock')),
    {lockToken:'test-owner',roster:oldRoster}),/WRONGTYPE/);
  assert.deepEqual(snapshotCore().slice(1),[null,null]);
  record('redis-type-preflight',{protectedKeys:4,coreMutations:0});

  reset();
  const committedValues=snapshotCore();
  before=async command=>{if(isCore(command))redis('SET',refreshLock,'successor-owner','EX',120);};
  assert.equal((await call(interactions(payload('lost-owner'),0,[trainer(301,0)]))).code,503);
  assert.deepEqual(snapshotCore(),committedValues);
  assert.equal(redis('GET',refreshLock),'successor-owner');
  assert.equal(observations().length,0);
  record('lost-lock-before-commit',{http:503,rosterOrStatusChanged:false,observationStored:false,successorPreserved:true});

  reset();
  redis('ACL','SETUSER','limited-fixture','on','>audit-fixture-only','~*','+@all','-mset');
  redisUser='limited-fixture';
  const previousValues=snapshotCore();
  const rejected=await call(payload('acl-interruption'));
  assert.equal(rejected.code,503);
  assert.match(rejected.value.error,/ACL|permission|can't run this command/i);
  assert.deepEqual(ids(),[]);
  assert.equal(getStatus(),null);
  assert.deepEqual(snapshotCore(),previousValues);
  redisUser=null;
  redis('ACL','DELUSER','limited-fixture');
  record('redis-runtime-no-rollback',{http:503,profileCommitted:false,statusCommitted:false,compactVersionChanged:false,mutation:'MSET'});

  reset();
  const noPassword=addonRequest(payload('unauthorized'));
  noPassword.headers.authorization='Bearer not-authorized-fixture';
  assert.equal((await call(null,addon,noPassword)).code,401);
  assert.equal(commands.length,0);
  const beforePreview=snapshotCore();
  process.env.VERCEL_ENV='preview';
  assert.equal((await call(payload('preview'))).code,200);
  assert.deepEqual(ids(),[]);
  assert.equal(getStatus(),null);
  assert.equal(json('GET',status('audit-one','preview')).payload.syncId,'preview');
  assert.equal(json('GET',previewCompact).addon['audit-one'].syncId,'preview');
  assert.deepEqual(snapshotCore(),beforePreview);
  assert.equal(redis('GET',refreshLock),null);
  process.env.VERCEL_ENV='production';
  record('addon-authorization-preview',{unauthorized:401,redisOpsUnauthorized:0,productionWritesFromPreview:0});

  reset();
  let dropped=false;
  const evidence=interactions(payload('observe'),0,[trainer(601,-2),trainer(602,-1)]);
  before=async command=>{
    if(isObservation(command)&&command[6].endsWith('id-602')&&!dropped){dropped=true;throw Error('Fixture second observation interrupted');}
  };
  assert.equal((await call(evidence)).code,503);
  assert.equal(getStatus().payload.syncId,'observe');
  assert.equal(getStatus().pendingObservations,true);
  assert.equal(observations().length,1);
  assert.equal((await call(payload('between',5,[133,143]))).code,200);
  assert.equal(observations().length,2);
  assert.equal(getStatus().pendingObservations,false);
  const changedTime=structuredClone(evidence);
  changedTime.sections.interactions.trainerHistory[1].capturedAt+=1;
  assert.equal((await call(changedTime)).value.duplicate,true);
  assert.equal((await call(evidence)).value.duplicate,true);
  assert.equal(observations().length,2);
  for(const key of observations())assert.equal(json('HGET',observationIndex,key).observationCount,1);
  assert.deepEqual(ids(),[133,143]);
  record('observation-resume',{firstHttp:503,afterLaterSync:2,afterRestampedRetry:2,afterExactRetry:2,latestCoreRetained:true});

  reset();
  const spaced=interactions(payload('same-second'),0,[trainer(603,0,10),trainer(603,0,20)]);
  assert.equal((await call(spaced)).code,200);
  const [trainerKey]=observations();
  const trainerValue=json('HGET',observationIndex,trainerKey);
  assert.equal(trainerValue.observationCount,2);
  assert.equal(trainerValue.latestSnapshot.entries[0].priceCopper,20);
  assert.ok(trainerValue.changes.some(change=>change.sameSecond&&change.previousEntries[0].priceCopper===10&&change.entries[0].priceCopper===20));
  record('same-second-observation',{suppliedObservations:2,persistedObservations:2,persistedPrices:[10,20],currentPrice:20});

  reset();
  for(let i=0;i<66;i++)assert.equal((await call(payload('receipt-'+i,i,i%2?[143]:[133]))).code,200);
  const receipts=getStatus().receipts;
  assert.equal(receipts.length,64);assert.equal(receipts[0].id,'receipt-2');assert.equal(receipts.at(-1).id,'receipt-65');
  assert.equal((await call(payload('receipt-2',2))).value.duplicate,true);
  assert.equal((await call(payload('receipt-0'))).code,409);
  assert.equal(getStatus().receipts.length,64);
  const totalReceiptBytes=Buffer.byteLength(JSON.stringify(receipts));
  assert.ok(totalReceiptBytes<16000);
  record('receipt-bound',{successfulSyncs:66,count:64,first:receipts[0].id,last:receipts.at(-1).id,evictedRetry:409,totalReceiptBytes});

  commands.length=0;
  assert.equal((await call(payload('receipt-66',66,[133]))).code,200);
  const receiptFullOps=commands.length;
  const receiptFullWire=commands.reduce((bytes,command)=>bytes+command.bytes,0);
  const fullMemory=redis('MEMORY','USAGE',status());
  reset();
  assert.equal((await call(payload('receipt-0'),prior)).code,200);
  commands.length=0;
  assert.equal((await call(payload('receipt-66',66,[133]),prior)).code,200);
  const oldOps=commands.length;
  const oldWire=commands.reduce((bytes,command)=>bytes+command.bytes,0);
  const oldMemory=redis('MEMORY','USAGE',status());
  record('warm-sync-redis-cost',{firstCandidate:{commands:oldOps,requestJsonBytes:oldWire,syncStateBytes:oldMemory},
    currentWithFullReceipts:{commands:receiptFullOps,requestJsonBytes:receiptFullWire,syncStateBytes:fullMemory}});

  reset();
  const vars=parseLuaSavedVariable(readFileSync(join(head,'scripts/fixtures/bridge-savedvariables.lua'),'utf8'));
  vars.character.name='Audit One';vars.character.level=12;
  for(const name of ['character','spellbook','location'])vars[name].capturedAt=validNow;
  const historical=buildSafeAddonSyncPayload(vars,{syncId:'savedvariables-v1'});
  assert.ok(historical.sections.locationHistory);
  assert.equal(historical.sections.locationHistory.capturedAt,undefined);
  assert.equal(historical.sections.instances.capturedAt,undefined);
  const priorAccepts=await call(historical,prior);
  assert.equal(priorAccepts.code,200);
  const noReceipts=getStatus();assert.equal(noReceipts.receipts,undefined);
  const migration=await call(historical);
  assert.equal(migration.code,200);assert.equal(migration.value.duplicate,true);
  const withChanges=structuredClone(historical);
  withChanges.syncId='savedvariables-v1-new-live-capture';
  withChanges.sections.character.capturedAt+=1;
  withChanges.sections.spellbook.capturedAt+=1;
  withChanges.sections.spellbook.entries[0].spellID=133;
  assert.equal((await call(withChanges)).code,200);
  const migrated=getStatus();
  assert.equal(migrated.receipts.length,2);assert.ok(migrated.payload.sections.locationHistory);
  reset();
  const cleanImport=await call(historical);
  assert.equal(cleanImport.code,200);
  assert.equal(getStatus().payload.sections.locationHistory.capturedAt,undefined);
  record('legacy-savedvariables',{oldStatusReadAndRetried:true,firstNewSyncPreservesSections:true,knownLegacyReceiptMigrated:true,
    cleanImportHttp:cleanImport.code,legacyTimestampMissing:['locationHistory','instances']});

  reset();
  const addonAtMaster=gate(),lastDenied=gate();
  let lockAttempts=0;
  before=async command=>{
    if(command[0]==='GET'&&command[1].includes('class-master')){
      addonAtMaster.open();
      await lastDenied.ready;
    }
  };
  after=async(command,result)=>{
    if(command[0]==='SET'&&command[1]===refreshLock&&++lockAttempts===4){
      assert.equal(result,null);
      lastDenied.open();
      await stalledAddon;
    }
  };
  const stalledAddon=call(payload('no-daily-proof'));
  await addonAtMaster.ready;
  const withheld=await runCron(daily());
  assert.equal(await loadDailyProfileReceipt(date),null);
  assert.equal((await stalledAddon).code,200);
  assert.equal(lockAttempts,4);
  assert.equal(withheld.code,503);
  assert.equal(withheld.value.refresh.persisted,false);
  record('daily-addon-overlap',{addonHttp:200,cronHttp:503,realFailedCronLockAttempts:3,dailyReceipt:null});

  reset();
  providers=(url)=>{
    assert.equal(url.hostname,'worldofwarcraft.blizzard.com','only synthetic Armory responder permitted');
    const slug=url.pathname.split('/').at(-1);
    const character={slug,level:15,class:{id:8,name:'Magier'},race:{name:'Mensch'},faction:{name:'Allianz'},gear:[]};
    return new Response('var characterProfileInitialState = '+JSON.stringify({character})+';</script>');
  };
  const actual=await runCron(daily());
  assert.equal(actual.code,200);
  assert.equal(actual.value.refresh.success,2);
  assert.equal(profileRefreshComplete(await loadDailyProfileReceipt(date),date),true);
  assert.ok(json('GET',characters).characters.every(x=>x.level===15&&x.scrapeOk===true));
  const durable=await loadDailyProfileReceipt(date);
  assert.equal(redis('SAVE'),'OK');
  await restart();
  assert.deepEqual(await loadDailyProfileReceipt(date),durable);
  assert.equal((await runCron(daily())).value.reason,'already_completed');
  record('daily-actual-refresh',{armoryFixtures:2,persistedLevels:[15,15],proofSurvivedRedisRestart:true,afterRestartSkipped:true});

  reset();
  providers=url=>{
    assert.equal(url.hostname,'worldofwarcraft.blizzard.com');
    const slug=url.pathname.split('/').at(-1);
    return slug==='audit-two'?new Response('',{status:503}):
      new Response('var characterProfileInitialState = '+JSON.stringify({character:{slug,level:15,class:{id:8,name:'Magier'}}})+';</script>');
  };
  const incomplete=await runCron(daily());
  assert.equal(incomplete.code,503);
  assert.equal(incomplete.value.refresh.success,1);
  assert.equal(profileRefreshComplete(await loadDailyProfileReceipt(date),date),false);
  record('daily-partial-profile',{http:503,success:1,total:2,treatedAsComplete:false});

  for(const phase of ['profile-before','profile-after','daily-before-index','daily-after-index']){
    reset();
    await crash(phase);
    const committed=phase!=='profile-before';
    assert.equal(profileRefreshComplete(await loadDailyProfileReceipt(date),date),committed);
    const indexed=snapshotIndex();
    assert.equal(indexed.every(Boolean),phase==='daily-after-index');
    assert.equal(Boolean(indexed[0]),Boolean(indexed[1]));
    const cronRetry=await runCron(daily());
    assert.equal(cronRetry.value.reason,'daily_snapshot_running');
    await expire(dailyLock);
    if(redis('GET',refreshLock))await expire(refreshLock);
    let called=0;
    const follow=await runCron(daily({refreshDailyCharacters:async()=>{called++;return writeProof();}}));
    assert.equal(follow.code,200);
    assert.equal(called,committed?0:1);
    assert.equal(snapshotIndex()[0],snapshotIndex()[1]);
    record(phase,{signal:'SIGKILL',profileCommit:committed,indexAndPointerCommitted:phase==='daily-after-index',
      refreshOnRetry:called,duplicateCronWhileLocked:true});
  }

  reset();
  const today=await acquireDailySnapshotLock(date);
  redis('SET',dailyLast,'broken-pointer-json');
  await assert.rejects(registerDailySnapshot(indexRow,today),/JSON|Expected value/);
  assert.deepEqual(snapshotIndex(),[null,null]);
  assert.equal(redis('GET',dailyLast),'broken-pointer-json');
  redis('DEL',dailyLast);redis('LPUSH',dailyLast,'wrong-type');
  await assert.rejects(registerDailySnapshot(indexRow,today),/WRONGTYPE/);
  assert.equal(redis('HGET',dailyIndex,date),null);
  redis('DEL',dailyLast);redis('LPUSH',dailyIndex,'wrong-type');
  await assert.rejects(registerDailySnapshot(indexRow,today),/INVALID_STORAGE_TYPE/);
  assert.equal(redis('GET',dailyLast),null);
  redis('DEL',dailyIndex);
  await registerDailySnapshot(indexRow,today);
  await releaseDailySnapshotLock(date,today);
  await assert.rejects(registerDailySnapshot({...indexRow,archiveStatus:'failed'},today),/DAILY_LOCK_LOST/);
  const earlier='2026-11-25',earlierLock=await acquireDailySnapshotLock(earlier);
  await registerDailySnapshot({date:earlier,archiveStatus:'failed'},earlierLock);
  await releaseDailySnapshotLock(earlier,earlierLock);
  assert.equal((await getLastDailySnapshot()).date,date);
  assert.equal(snapshotIndex()[0],snapshotIndex()[1]);
  record('daily-atomic-index',{badJsonWrites:0,wrongTypeWrites:0,staleOwnerWrites:0,lastDidNotRegress:true});

  reset();
  const indexOwner=await acquireDailySnapshotLock(date);
  redis('ACL','SETUSER','limited-index','on','>audit-fixture-only','~*','+@all','-hset');
  redisUser='limited-index';
  await assert.rejects(registerDailySnapshot(indexRow,indexOwner),/ACL|permission|can't run this command/i);
  redisUser=null;
  redis('ACL','DELUSER','limited-index');
  assert.deepEqual(snapshotIndex(),[null,null]);
  await registerDailySnapshot(indexRow,indexOwner);
  await releaseDailySnapshotLock(date,indexOwner);
  assert.equal(snapshotIndex()[0],snapshotIndex()[1]);
  record('daily-runtime-index-partial',{deniedCommand:'HSET',indexChanged:false,pointerChanged:false,retryCommitsBoth:true});

  reset();
  let missingLease=true;
  let dailyTtl;
  after=async command=>{
    if(command[0]==='SET'&&command[1]===dailyLock&&missingLease){
      missingLease=false;dailyTtl=redis('PTTL',dailyLock);throw Error('Fixture lock acquisition response lost');
    }
  };
  const lostLease=await runCron(daily({refreshDailyCharacters:writeProof}));
  assert.ok(dailyTtl>0&&dailyTtl<=120000);
  assert.equal(lostLease.code,200);
  assert.equal(redis('GET',dailyLock),null);
  assert.equal((await runCron(daily())).value.reason,'already_completed');
  record('daily-acquisition-lost-reply',{unhandledRejection:false,redisLockSeconds:Math.round(dailyTtl/1000),
    cronHttp:lostLease.code,lockReleased:true});

  reset();
  redis('HSET',dailyIndex,date,JSON.stringify({date,url:oldArchive,refresh:{persisted:true}}));
  const legacy=await runCron(daily({refreshDailyCharacters:writeProof}));
  assert.equal(legacy.code,200);
  assert.equal(legacy.value.snapshot.legacyArchive.url,oldArchive);
  const denied=await runCron(daily(),{method:'GET',headers:{authorization:'Bearer invalid-fixture'}});
  assert.equal(denied.code,401);
  record('daily-legacy-and-auth',{legacyReferencePreserved:true,legacyReferenceUsedAsPrivate:false,unauthorized:401});

  reset();
  let historyCalls=0;
  let firstIndex=true;
  before=async command=>{if(isIndex(command)&&firstIndex){firstIndex=false;throw Error('Fixture lost day index');}};
  const profileThenArchive=daily({refreshDailyCharacters:async()=>{historyCalls++;return writeProof();}});
  assert.equal((await runCron(profileThenArchive)).code,503);
  assert.ok(await loadDailyProfileReceipt(date));
  assert.equal((await runCron(profileThenArchive)).code,200);
  assert.equal(historyCalls,1);
  record('daily-index-retry',{refreshInvocations:historyCalls,dailyProofRecovered:true});

  await runArchiveCases({base,head,reset,daily,runCron,writeProof,record,redis,commands,isIndex,
    setBefore:fn=>{before=fn;},snapshotIndex,date});

  await runMigrationCases({base,previous,head,reset,daily,runCron,writeProof,record,redis,commands,
    setBefore:fn=>{before=fn;},setAfter:fn=>{after=fn;},setUser:name=>{redisUser=name;},
    socket,restart,date,oldRoster,rosterIds,characters,status,version,legacyVersion,dailyIndex,dailyLast,dailyLastField,
    dailyLock,refreshLock,observationIndex,observations,getStatus,call,previousAddon,addon,payload,interactions,trainer,
    crash,expire,snapshotCore,validNow});

  await runRestoreCases({base,previous,head,reset,daily,runCron,writeProof,record,redis,commands,
    setBefore:fn=>{before=fn;},setAfter:fn=>{after=fn;},useRedisSocket:value=>{redisSocket=value??socket;},restart,date,oldRoster,rosterIds,characters,status,
    version,legacyVersion,dailyIndex,dailyLast,dailyLastField,refreshLock,observationIndex,observations,getStatus,
    call,previousAddon,payload,interactions,trainer,validNow});

});
