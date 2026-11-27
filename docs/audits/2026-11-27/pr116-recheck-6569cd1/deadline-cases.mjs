import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {addonRequest,cronRequest,endpoint,gate,installRedisEnv,reply,withRedis} from '../pr116-recheck-177b147/redis-fixture.mjs';

const [, ,treePath,mode]=process.argv;
const tree=resolve(treePath);
const from=file=>import(join(tree,file));
const lock='dalton-dashboard:refresh:lock';
const rosterKey='dalton-dashboard:characters:v1';
const statusKey=slug=>'dalton-dashboard:addon-sync:v1:production:'+slug;
const observationIndex='dalton-dashboard:live-knowledge:v1:production:records:v2';
const keyFor=id=>'dalton-dashboard:live-knowledge:v1:production:record:trainer:1.60.1.71139:id-'+id;
const sampled=()=>Math.floor(Date.now()/1000)-120;
const date='2026-11-26';
const observed=id=>({capturedAt:sampled(),complete:true,npc:{id,name:'Audit Trainer'},services:[{name:'Audit Probe',priceCopper:21}]});
const payload=(syncId,{name='Audit One',id=undefined}={})=>{
  const capturedAt=sampled();
  return {schemaVersion:1,syncId,addon:{version:'0.1.0-beta.1',build:'71139',gameVersion:'1.60.1',locale:'deDE'},
    sections:{character:{name,classID:8,level:12,capturedAt},
      ...(id===undefined?{}:{interactions:{capturedAt,trainerHistory:[{...observed(id),capturedAt}]}})}};
};
const isSet=cmd=>cmd[0]==='SET'&&cmd[1]===lock;
const isRelease=cmd=>cmd[0]==='EVAL'&&Number(cmd[2])===1&&cmd[3]===lock;
const isObservation=cmd=>cmd[0]==='EVAL'&&cmd[3]===observationIndex;
const round=Math.round;
const record=(id,data)=>process.stdout.write(JSON.stringify({id,...data})+'\n');

installRedisEnv();
const {default:addon,config}=await from('api/addon-sync.js');
const {default:manual}=await from('api/refresh.js');
const {createDailySnapshotHandler,refreshDailyCharacters}=await from('api/daily-snapshot.js');
const {saveCharacters,loadCharacters,loadDailyProfileReceipt,acquireRefreshLock,releaseRefreshLock}=await from('scripts/character-store.mjs');
const {ADDON_WORK_MS,ADDON_CLEANUP_UNTIL_MS,ADDON_LEASE_SECONDS}=await from('scripts/sync-deadline.mjs');
assert.deepEqual([ADDON_WORK_MS,ADDON_CLEANUP_UNTIL_MS,config.maxDuration,ADDON_LEASE_SECONDS],[22000,27000,30,35]);
const call=async (handler,req)=>{
  const res=reply();
  await handler(req,res);
  return res;
};
const sync=body=>call(addon,addonRequest(body));

await withRedis(async ({socket,exec:redis})=>{
  redis('SET',rosterKey,JSON.stringify({generatedAt:date+'T03:00:00.000Z',characters:[
    {slug:'audit-one',name:'Audit One',classId:8,level:12,blizzardCharacterId:1001},
    {slug:'audit-two',name:'Audit Two',classId:8,level:12,blizzardCharacterId:1002},
  ]}));
  const counters=[];
  let transport=(cmd,options,execute)=>execute();
  const response=fn=>{
    try{return Response.json({result:fn()});}catch(error){return Response.json({error:error.message});}
  };
  globalThis.fetch=async (url,options={})=>{
    assert.equal(String(url),endpoint);
    const cmd=JSON.parse(options.body);
    counters.push({cmd,sent:performance.now()});
    return transport(cmd,options,()=>response(()=>redis(...cmd)));
  };
  const status=slug=>JSON.parse(redis('GET',statusKey(slug)));
  const recordAt=id=>redis('HGET',observationIndex,keyFor(id));
  const firstAt=(start,pred)=>round(counters.find(({cmd})=>pred(cmd)).sent-start);
  const sleepUntil=(start,ms)=>wait(Math.max(0,start+ms-performance.now()));

  if(mode==='late-observation'){
    const noted=gate(),delDone=gate();
    const id=1200,body=payload('late-commit',{id});
    let stalled=0,attempted=0,lateAt,cleanupAt;
    const started=performance.now();
    transport=async (cmd,options,execute)=>{
      if(cmd[0]==='GET'&&[rosterKey,statusKey('audit-one')].includes(cmd[1])&&stalled<2){
        stalled++;
        await wait(9000);
        assert.equal(options.signal.aborted,false);
      }
      if(isObservation(cmd)&&++attempted===1){
        await sleepUntil(started,28200);
        assert.equal(options.signal.aborted,true);
        lateAt=round(performance.now()-started);
        const result=execute();
        noted.open();
        return result;
      }
      if(isRelease(cmd)&&cleanupAt===undefined){
        cleanupAt=round(performance.now()-started);
        await sleepUntil(started,29000);
        assert.equal(options.signal.aborted,true);
        const result=execute();
        delDone.open();
        return result;
      }
      return execute();
    };
    const expired=await sync(body);
    const replyMs=round(performance.now()-started);
    assert.equal(expired.code,503);
    assert.match(expired.value.error,/ADDON_SYNC_DEADLINE/);
    assert.ok(replyMs>=26750&&replyMs<28000);
    assert.ok(cleanupAt>=21800&&cleanupAt<23000);
    assert.equal(stalled,2);
    assert.equal(status('audit-one').pendingObservations,true);
    const pendingRaw=redis('GET',statusKey('audit-one'));
    assert.equal(recordAt(id),null);
    assert.ok(redis('GET',lock));
    assert.equal((await sync(payload('other-during-delay',{name:'Audit Two'}))).code,409);
    await noted.ready;
    assert.ok(lateAt>replyMs&&lateAt<ADDON_LEASE_SECONDS*1000);
    assert.equal(JSON.parse(recordAt(id)).latestSnapshot.entries[0].priceCopper,21);
    assert.equal(redis('GET',statusKey('audit-one')),pendingRaw);
    await delDone.ready;
    assert.equal(redis('GET',lock),null);
    assert.equal((await sync(body)).value.duplicate,true);
    assert.equal(status('audit-one').pendingObservations,false);
    assert.equal(JSON.parse(recordAt(id)).observationCount,1);
    assert.equal((await sync(payload('other-after-delay',{name:'Audit Two'}))).code,200);
    record('late-dispatched-observation-commits-after-fenced-cleanup-deadline',{replyHttp:503,replyMs,
      cleanupStartedMs:cleanupAt,providerExecutedMs:lateAt,clientSignalAborted:true,
      activeObservationCreatedAfterHttpReply:true,pendingThenIdempotentRecovery:true,findingConfirmed:true});
    return;
  }

  if(mode==='late-observation-fenced'){
    const completed=gate();
    let dispatched=false,afterRelease;
    const started=performance.now();
    transport=async (cmd,options,execute)=>{
      if(isObservation(cmd)&&!dispatched){
        dispatched=true;
        await sleepUntil(started,23000);
        assert.equal(options.signal.aborted,true);
        afterRelease=await execute().json();
        completed.open();
        return Response.json(afterRelease);
      }
      return execute();
    };
    const body=payload('late-commit-successfully-fenced',{id:1202});
    const timedOut=await sync(body);
    const elapsed=round(performance.now()-started);
    assert.equal(timedOut.code,503);
    assert.ok(elapsed>=9800&&elapsed<12000);
    assert.equal(recordAt(1202),null);
    assert.equal(redis('GET',lock),null);
    const successor=await acquireRefreshLock();
    await completed.ready;
    assert.match(afterRelease.error,/REFRESH_LOCK_LOST/);
    assert.equal(redis('GET',lock),successor);
    assert.equal(recordAt(1202),null);
    assert.equal(status('audit-one').pendingObservations,true);
    await releaseRefreshLock(successor);
    assert.equal((await sync(body)).value.duplicate,true);
    assert.equal(JSON.parse(recordAt(1202)).observationCount,1);
    record('late-dispatched-observation-is-fenced-after-successful-release',{replyHttp:503,replyMs:elapsed,
      lateLuaRejected:true,noEffectOnSuccessor:true,unchangedOutboxThenIdempotentRecovery:true});
    return;
  }

  if(mode==='late-acquisition'){
    const acquired=gate();
    let token,executedAt;
    const started=performance.now();
    transport=async (cmd,options,execute)=>{
      if(isSet(cmd)&&!token){
        token=cmd[2];
        assert.deepEqual(cmd.slice(3),['EX',35,'NX']);
        await sleepUntil(started,28200);
        assert.equal(options.signal.aborted,true);
        executedAt=round(performance.now()-started);
        const result=execute();
        acquired.open();
        return result;
      }
      return execute();
    };
    const expired=await sync(payload('late-provider-lock'));
    const replyMs=round(performance.now()-started);
    assert.equal(expired.code,503);
    assert.ok(replyMs>=9800&&replyMs<12000);
    assert.equal(status('audit-one'),null);
    assert.equal(redis('GET',lock),null);
    assert.ok(firstAt(started,isRelease)<replyMs);
    await acquired.ready;
    assert.ok(executedAt>27000&&executedAt>replyMs);
    assert.equal(redis('GET',lock),token);
    const realTtl=redis('PTTL',lock);
    assert.ok(realTtl>=34000&&realTtl<=35000);
    assert.equal((await sync(payload('other-blocked-by-late-set',{name:'Audit Two'}))).code,409);
    assert.equal(status('audit-two'),null);
    record('late-provider-lease-is-created-after-empty-cleanup',{replyHttp:503,replyMs,providerSetMs:executedAt,
      cleanupAtMs:firstAt(started,isRelease),leaseAfterHandlerMs:realTtl,otherCharacterHttp:409,
      noCoreMutation:true,findingConfirmed:true});
    return;
  }

  if(mode==='late-read-resume'){
    const finished=gate(),lateResult=gate();
    const started=performance.now();
    transport=(cmd,options,execute)=>{
      if(cmd[0]!=='GET'||cmd[1]!==rosterKey)return execute();
      const actual=execute();
      return {ok:true,json:async()=>{
        await sleepUntil(started,23200);
        assert.equal(options.signal.aborted,true);
        const json=await actual.json();
        lateResult.open();
        return json;
      }};
    };
    const expired=await sync(payload('late-json-body'));
    const replyMs=round(performance.now()-started);
    assert.equal(expired.code,503);
    assert.match(expired.value.error,/REDIS_REQUEST_TIMEOUT/);
    assert.ok(replyMs>=9800&&replyMs<12000);
    assert.equal(redis('GET',lock),null);
    const before=counters.length;
    const lateUpload=async function*(){
      await sleepUntil(started,33500);
      yield JSON.stringify(payload('late-request-body'));
      finished.open();
    };
    const outerStart=performance.now();
    const deferredRequest={method:'POST',headers:{authorization:'Bearer audit-fixture-only'},[Symbol.asyncIterator]:lateUpload};
    const out=await call(addon,deferredRequest);
    const uploadReplyMs=round(performance.now()-outerStart);
    await lateResult.ready;
    await finished.ready;
    await wait(10);
    assert.equal(out.code,503);
    assert.equal(counters.length,before);
    assert.equal(status('audit-one'),null);
    assert.equal(redis('GET',lock),null);
    record('ignored-body-and-late-handler-continuation-cannot-start-redis',{redisJsonHttp:503,redisJsonReplyMs:replyMs,
      lateJsonSettled:true,bodyDeadlineHttp:503,bodyReplyMs:uploadReplyMs,newDispatchesAfterClose:0});
    return;
  }

  if(mode==='late-request-body'){
    const finished=gate();
    const started=performance.now();
    const chunks=async function*(){
      await sleepUntil(started,23500);
      yield JSON.stringify(payload('late-request-body'));
      finished.open();
    };
    const out=await call(addon,{method:'POST',headers:{authorization:'Bearer audit-fixture-only'},[Symbol.asyncIterator]:chunks});
    const elapsed=round(performance.now()-started);
    assert.equal(out.code,503);
    assert.match(out.value.error,/ADDON_SYNC_DEADLINE/);
    assert.ok(elapsed>=21800&&elapsed<23300);
    await finished.ready;
    await wait(15);
    assert.equal(counters.length,0);
    assert.equal(status('audit-one'),null);
    record('closed-default-request-context-refuses-late-first-redis-dispatch',{http:503,replyMs:elapsed,
      ignoredBodyResolvedAfterDeadline:true,newRedisCommands:0});
    return;
  }

  if(mode==='crash-and-shared-lease'){
    const body=payload('killed-with-outbox',{id:1201});
    const start=performance.now();
    const child=spawn(process.execPath,[fileURLToPath(new URL('../pr116-recheck-c064aac/crash-worker.mjs',import.meta.url)),
      JSON.stringify({tree,socket,phase:'addon-before-observation',payload:body,date})],
      {env:{PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,AUDIT_REDIS_CLI:process.env.AUDIT_REDIS_CLI,
        AUDIT_REDIS_SERVER:process.env.AUDIT_REDIS_SERVER},
        stdio:['ignore','pipe','inherit']});
    const exited=once(child,'exit');
    const timeout=new AbortController();
    try{
      const [message]=await Promise.race([once(child.stdout,'data'),
        exited.then(()=>{throw Error('Worker exited before the Redis checkpoint');}),
        wait(5000,null,{signal:timeout.signal}).then(()=>{throw Error('No Redis checkpoint');})]);
      assert.match(String(message),/redis-commit-checkpoint/);
    }finally{
      timeout.abort();
      child.kill('SIGKILL');
      const [,reason]=await exited;
      assert.equal(reason,'SIGKILL');
    }
    const originalToken=redis('GET',lock);
    const initialTtl=redis('PTTL',lock);
    assert.ok(initialTtl>33000&&initialTtl<=35000);
    const pendingRaw=redis('GET',statusKey('audit-one'));
    assert.equal(status('audit-one').pendingObservations,true);
    assert.equal(recordAt(1201),null);
    assert.equal((await sync(payload('other-before-expiry',{name:'Audit Two'}))).code,409);
    const manualBusy=await call(manual,{method:'GET'});
    assert.equal(manualBusy.code,202);
    assert.equal(manualBusy.value.reason,'already_running');
    let profileCalls=0,dailyTtl;
    const daily=createDailySnapshotHandler({
      blizzardApiConfigured:()=>true,dailySnapshotStoreConfigured:()=>false,ensurePetRuleState:async()=>null,publicPetRuleState:()=>null,
      berlinClock:()=>({date,hour:5,minute:7}),
      refreshDailyCharacters:day=>refreshDailyCharacters(day,{refresh:async ({lockToken})=>{
        profileCalls++;
        dailyTtl=redis('PTTL',lock);
        const {data}=await loadCharacters();
        data.generatedAt=day+'T04:08:00.000Z';
        const dailyReceipt={date:day,source:'daily',persisted:true,success:data.characters.length,total:data.characters.length,
          generatedAt:data.generatedAt,roster:data.characters.map(c=>({slug:c.slug,id:c.blizzardCharacterId}))};
        await saveCharacters(data,lockToken,{dailyReceipt});
        return {dailyReceipt};
      }})
    });
    const dailyBusy=await call(daily,cronRequest);
    assert.equal(dailyBusy.code,503);
    assert.equal(dailyBusy.value.refresh.reason,'refresh_lock_unavailable');
    assert.equal(profileCalls,0);
    assert.equal(await loadDailyProfileReceipt(date),null);
    assert.equal(redis('GET',lock),originalToken);
    const remainder=redis('PTTL',lock);
    assert.ok(remainder>0);
    await wait(remainder+15);
    assert.equal(redis('GET',lock),null);
    const leaseEndMs=round(performance.now()-start);
    assert.ok(leaseEndMs>=34500);
    assert.equal(redis('GET',statusKey('audit-one')),pendingRaw);
    assert.equal((await sync(payload('other-after-real-expiry',{name:'Audit Two'}))).code,200);
    const quota=await call(daily,cronRequest);
    assert.equal(quota.code,200);
    assert.equal(profileCalls,1);
    assert.ok(dailyTtl>118000&&dailyTtl<=120000);
    assert.ok(await loadDailyProfileReceipt(date));
    assert.equal((await sync(body)).value.duplicate,true);
    assert.equal(status('audit-one').pendingObservations,false);
    assert.equal(JSON.parse(recordAt(1201)).observationCount,1);
    assert.equal(status('audit-two').payload.syncId,'other-after-real-expiry');
    const successor=await acquireRefreshLock();
    assert.ok(successor);
    assert.equal((await sync(payload('while-shared-owner-active'))).code,409);
    assert.equal(await releaseRefreshLock(originalToken,{addon:true}),0);
    assert.equal(redis('GET',lock),successor);
    await releaseRefreshLock(successor);
    record('actual-35-second-expiry-sigkill-add-on-manual-and-daily',{signal:'SIGKILL',initialLeaseMs:initialTtl,leaseEndMs,
      manualWhileHeldHttp:202,dailyWhileHeldHttp:503,otherAfterExpiryHttp:200,dailyAfterExpiryHttp:200,
      dailyLeaseMs:dailyTtl,dailyReceiptWritten:true,oldReleaseCannotDeleteSuccessor:true,
      pendingSurvivedByteForByte:true,unchangedLeaseExpiry:true});
    return;
  }

  if(mode==='byte-cas'){
    const cases=['missing-v1-to-empty','empty-v1-to-missing','empty-v2-to-missing','v2-exact-raw-bytes'];
    const evidence=[];
    const shift=body=>{
      body.sections.character.capturedAt+=10;
      body.sections.interactions.capturedAt+=10;
      for(const row of body.sections.interactions.trainerHistory)row.capturedAt+=10;
      return body;
    };
    for(const [index,kind] of cases.entries()){
      redis('DEL',statusKey('audit-one'));
      const id=1210+index;
      const key=keyFor(id);
      if(kind==='empty-v1-to-missing')redis('SET',key,'');
      if(kind==='empty-v2-to-missing')redis('HSET',observationIndex,key,'');
      if(kind==='v2-exact-raw-bytes')assert.equal((await sync(payload('seed-exact-v2',{id}))).code,200);
      const original=recordAt(id);
      const attempts=[];
      transport=(cmd,options,execute)=>{
        if(isObservation(cmd)&&cmd[6]===key){
          attempts.push({v2:cmd[18],v1:cmd[19],raw:cmd[10]});
          if(attempts.length===1){
            switch(kind){
              case 'missing-v1-to-empty': redis('SET',key,''); break;
              case 'empty-v1-to-missing': redis('DEL',key); break;
              case 'empty-v2-to-missing': redis('HDEL',observationIndex,key); break;
              case 'v2-exact-raw-bytes': redis('HSET',observationIndex,key,original+' \n'); break;
            }
          }
        }
        return execute();
      };
      const result=await sync(shift(payload('exact-cas-'+index,{id})));
      transport=(cmd,options,execute)=>execute();
      assert.equal(result.code,200);
      assert.equal(attempts.length,2);
      assert.equal(status('audit-one').pendingObservations,false);
      if(kind==='missing-v1-to-empty'){
        assert.deepEqual(attempts.map(x=>x.v1),['0','1']);
        assert.equal(result.value.liveKnowledge.quarantined,1);
        assert.equal(recordAt(id),null);
        const q=redis('HKEYS',observationIndex).filter(field=>field.startsWith('__quarantine:v1:')).map(field=>JSON.parse(redis('HGET',observationIndex,field)));
        assert.ok(q.some(row=>row.key===key&&row.legacyRaw===''&&row.modernRaw===null));
      }else{
        assert.equal(result.value.liveKnowledge.stored,1);
        assert.ok(recordAt(id));
        if(kind==='empty-v1-to-missing')assert.deepEqual(attempts.map(x=>x.v1),['1','0']);
        if(kind==='empty-v2-to-missing')assert.deepEqual(attempts.map(x=>x.v2),['1','0']);
        if(kind==='v2-exact-raw-bytes')assert.deepEqual(attempts.map(x=>x.raw),[original,original+' \n']);
      }
      evidence.push({case:kind,attempts:attempts.length,confirmedHttp:result.code});
    }
    record('presence-and-exact-value-matrix-both-storage-formats',{cases:evidence,emptyLegacyOriginalInQuarantine:true});
    return;
  }

  if(mode==='acquisition-and-release-loss'){
    let knownToken=null,recoveredByRead=false;
    transport=(cmd,options,execute)=>{
      if(isSet(cmd)&&!knownToken){
        knownToken=cmd[2];
        assert.equal(execute().status,200);
        throw Error('Synthetic loss of successful lock response');
      }
      if(cmd[0]==='GET'&&cmd[1]===lock)recoveredByRead=true;
      return execute();
    };
    assert.equal((await sync(payload('ambiguous-lease-response'))).code,200);
    assert.ok(recoveredByRead);
    assert.equal(redis('GET',lock),null);
    const different=await acquireRefreshLock();
    let sentCleanup=false;
    transport=(cmd,options,execute)=>{
      if(isSet(cmd)){execute();throw Error('Synthetic ambiguous failed lock attempt');}
      if(isRelease(cmd))sentCleanup=true;
      return execute();
    };
    assert.equal((await sync(payload('ambiguous-cannot-release-foreign-owner'))).code,503);
    assert.ok(sentCleanup);
    assert.equal(redis('GET',lock),different);
    transport=(cmd,options,execute)=>execute();
    await releaseRefreshLock(different);
    let blockedRelease=false;
    transport=(cmd,options,execute)=>{
      if(isRelease(cmd)){blockedRelease=true;throw Error('Synthetic release rejected');}
      return execute();
    };
    assert.equal((await sync(payload('committed-but-release-refused'))).code,200);
    assert.ok(blockedRelease);
    const ttl=redis('PTTL',lock);
    assert.ok(ttl>33000&&ttl<=35000);
    assert.equal((await sync(payload('after-release-refused',{name:'Audit Two'}))).code,409);
    record('ambiguous-acquire-token-fenced-and-failed-release-visible',{ambiguousRecoveredHttp:200,
      ambiguousForeignOwnerHttp:503,foreignOwnerPreserved:true,committedDespiteFailedReleaseHttp:200,
      anotherCharacterUntilExpiryHttp:409,remainingTtlMs:ttl});
    return;
  }

  throw Error('Unknown deadline test mode');
});
