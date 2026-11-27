import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {addonRequest,cronRequest,endpoint,gate,installRedisEnv,redisCommand,reply,withRedis} from '../pr116-recheck-177b147/redis-fixture.mjs';

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
const isScript=(cmd,header)=>cmd[0]==='EVAL'&&String(cmd[1]).startsWith('-- '+header+':v1');
const isIssue=cmd=>isScript(cmd,'addon-permit-issue');
const isAcquire=cmd=>isScript(cmd,'addon-lock-acquire');
const isRelease=cmd=>isScript(cmd,'addon-lock-revoke');
const isCore=cmd=>cmd[0]==='EVAL'&&cmd[3]===statusKey('audit-one');
const isObservation=cmd=>cmd[0]==='EVAL'&&cmd[3]===observationIndex;
const round=Math.round;
const record=(id,data)=>process.stdout.write(JSON.stringify({id,...data})+'\n');

installRedisEnv();
const {default:addon,config}=await from('api/addon-sync.js');
const {default:manual}=await from('api/refresh.js');
const {createDailySnapshotHandler,refreshDailyCharacters}=await from('api/daily-snapshot.js');
const {saveCharacters,loadCharacters,loadDailyProfileReceipt,acquireRefreshLock,releaseRefreshLock,redis:requestRedis}=await from('scripts/character-store.mjs');
const {ADDON_WORK_MS,ADDON_CLEANUP_UNTIL_MS,ADDON_LEASE_SECONDS,runSyncDeadline}=await from('scripts/sync-deadline.mjs');
assert.deepEqual([ADDON_WORK_MS,ADDON_CLEANUP_UNTIL_MS,config.maxDuration,ADDON_LEASE_SECONDS],[22000,27000,30,22]);
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
  let aclUser=null;
  let transport=(cmd,options,execute)=>execute();
  const response=fn=>{
    try{return Response.json({result:fn()});}catch(error){return Response.json({error:error.message});}
  };
  globalThis.fetch=async (url,options={})=>{
    assert.equal(String(url),endpoint);
    const cmd=JSON.parse(options.body);
    counters.push({cmd,sent:performance.now()});
    return transport(cmd,options,()=>response(()=>redisCommand(socket,cmd,aclUser)));
  };
  const status=slug=>JSON.parse(redis('GET',statusKey(slug)));
  const recordAt=id=>redis('HGET',observationIndex,keyFor(id));
  const firstAt=(start,pred)=>round(counters.find(({cmd})=>pred(cmd)).sent-start);
  const sleepUntil=(start,ms)=>wait(Math.max(0,start+ms-performance.now()));

  if(mode==='late-observation'){
    const noted=gate(),delDone=gate();
    const id=1200,body=payload('late-commit',{id});
    let stalled=0,attempted=0,lateAt,cleanupAt,lateResult;
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
        lateResult=await execute().json();
        noted.open();
        return Response.json(lateResult);
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
    assert.equal(redis('GET',lock),null);
    assert.equal((await sync(payload('other-during-delay',{name:'Audit Two'}))).code,200);
    await noted.ready;
    assert.ok(lateAt>replyMs);
    assert.match(lateResult.error,/ADDON_SYNC_DEADLINE/);
    assert.equal(recordAt(id),null);
    assert.equal(redis('GET',statusKey('audit-one')),pendingRaw);
    await delDone.ready;
    assert.equal(redis('GET',lock),null);
    assert.equal((await sync(body)).value.duplicate,true);
    assert.equal(status('audit-one').pendingObservations,false);
    assert.equal(JSON.parse(recordAt(id)).observationCount,1);
    assert.equal((await sync(payload('other-after-delay',{name:'Audit Two'}))).code,200);
    record('late-dispatched-observation-commits-after-fenced-cleanup-deadline',{replyHttp:503,replyMs,
      cleanupStartedMs:cleanupAt,providerExecutedMs:lateAt,clientSignalAborted:true,
      lateObservationRejected:true,pendingThenIdempotentRecovery:true,priorFindingFixed:true});
    return;
  }

  if(mode==='late-observation-fenced'){
    const completed=gate();
    let dispatched=false,afterRelease;
    const started=performance.now();
    transport=async (cmd,options,execute)=>{
      if(isObservation(cmd)&&!dispatched){
        dispatched=true;
        await sleepUntil(started,15500);
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
    const executed=gate();
    let token,executedAt,lateResult,permit;
    const started=performance.now();
    transport=async (cmd,options,execute)=>{
      if(isAcquire(cmd)&&!token){
        token=cmd[5];
        permit=cmd[4];
        assert.equal(redis('GET',permit),cmd[6]);
        await sleepUntil(started,28200);
        assert.equal(options.signal.aborted,true);
        executedAt=round(performance.now()-started);
        lateResult=await execute().json();
        executed.open();
        return Response.json(lateResult);
      }
      return execute();
    };
    const expired=await sync(payload('late-provider-lock'));
    const replyMs=round(performance.now()-started);
    assert.equal(expired.code,503);
    assert.ok(replyMs>=9800&&replyMs<12000);
    assert.equal(status('audit-one'),null);
    assert.equal(redis('GET',lock),null);
    assert.equal(redis('GET',permit),null);
    assert.ok(firstAt(started,isRelease)<replyMs);
    await executed.ready;
    assert.ok(executedAt>27000&&executedAt>replyMs);
    assert.match(lateResult.error,/ADDON_SYNC_DEADLINE/);
    assert.equal(redis('GET',lock),null);
    assert.equal((await sync(payload('other-after-late-acquire',{name:'Audit Two'}))).code,200);
    record('late-provider-lease-is-created-after-empty-cleanup',{replyHttp:503,replyMs,providerSetMs:executedAt,
      cleanupAtMs:firstAt(started,isRelease),lateAcquireRejected:true,otherCharacterHttp:200,noCoreMutation:true,priorFindingFixed:true});
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
    assert.ok(initialTtl>20000&&initialTtl<=22000);
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
    assert.ok(leaseEndMs>=21400&&leaseEndMs<24000);
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
    assert.equal(await releaseRefreshLock(originalToken,{addon:true}),1);
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
    transport=async(cmd,options,execute)=>{
      if(isAcquire(cmd)&&!knownToken){
        knownToken=cmd[5];
        assert.equal((await execute().json()).result,'OK');
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
    transport=async(cmd,options,execute)=>{
      if(isAcquire(cmd)){
        assert.equal((await execute().json()).result,null);
        throw Error('Synthetic ambiguous failed lock attempt');
      }
      if(isRelease(cmd))sentCleanup=true;
      return execute();
    };
    assert.equal((await sync(payload('ambiguous-cannot-release-foreign-owner'))).code,503);
    assert.ok(sentCleanup);
    assert.equal(redis('GET',lock),different);
    transport=(cmd,options,execute)=>execute();
    await releaseRefreshLock(different);
    let blockedRelease=false;
    transport=async(cmd,options,execute)=>{
      if(isRelease(cmd)&&!blockedRelease){
        blockedRelease=true;
        throw Error('Synthetic release rejected');
      }
      return execute();
    };
    const started=performance.now();
    assert.equal((await sync(payload('committed-but-release-refused'))).code,200);
    const replyMs=round(performance.now()-started);
    assert.ok(blockedRelease);
    assert.ok(replyMs>=21900&&replyMs<23000);
    assert.equal(redis('GET',lock),null);
    assert.equal((await sync(payload('after-release-refused',{name:'Audit Two'}))).code,200);
    record('ambiguous-acquire-token-fenced-and-failed-release-visible',{ambiguousRecoveredHttp:200,
      ambiguousForeignOwnerHttp:503,foreignOwnerPreserved:true,committedDespiteFailedReleaseHttp:200,
      waitUntilOriginalDeadlineMs:replyMs,anotherCharacterAfterReplyHttp:200,leaseGone:true});
    return;
  }

  if(mode==='delayed-permit'){
    const done=gate();
    let permit;
    const start=performance.now();
    transport=async(cmd,options,execute)=>{
      if(isIssue(cmd)&&!permit){
        permit=cmd[3];
        await sleepUntil(start,13500);
        assert.equal(options.signal.aborted,true);
        const result=await execute().json();
        done.open({result,time:round(performance.now()-start)});
        return Response.json(result);
      }
      return execute();
    };
    const expired=await sync(payload('uncertain-permit-only'));
    const replyMs=round(performance.now()-start);
    assert.equal(expired.code,503);
    assert.ok(replyMs>=9800&&replyMs<12000);
    assert.equal(redis('GET',permit),null);
    const {result,time}=await done.ready;
    assert.equal(result.result,'OK');
    assert.ok(time>replyMs&&time<22000);
    assert.equal(redis('GET',lock),null);
    const remaining=redis('PTTL',permit);
    assert.ok(remaining>0&&remaining<9000);
    assert.equal(counters.filter(({cmd})=>isAcquire(cmd)).length,0);
    assert.equal((await sync(payload('other-unblocked-by-inert-permit',{name:'Audit Two'}))).code,200);
    await wait(remaining+25);
    assert.equal(redis('GET',permit),null);
    record('delayed-sole-issue-inert-until-original-cutoff',{replyMs,issueMs:time,remainingPermitMs:remaining,
      noLockCommandWasDispatched:true,noSharedLock:true,otherCharacterHttp:200,permitNaturallyExpired:true});
    return;
  }

  if(mode==='issue-after-cutoff'){
    const done=gate();
    let key;
    const start=performance.now();
    transport=async(cmd,options,execute)=>{
      if(isIssue(cmd)&&!key){
        key=cmd[3];
        await sleepUntil(start,28200);
        assert.equal(options.signal.aborted,true);
        const delivered=await execute().json();
        done.open({delivered,ms:round(performance.now()-start)});
        return Response.json(delivered);
      }
      return execute();
    };
    const out=await sync(payload('first-issue-delayed-beyond-cutoff'));
    const replyMs=round(performance.now()-start);
    assert.equal(out.code,503);
    assert.ok(replyMs<22000);
    const {delivered,ms}=await done.ready;
    assert.match(delivered.error,/ADDON_SYNC_DEADLINE/);
    assert.ok(ms>=27000);
    assert.equal(redis('GET',key),null);
    assert.equal(redis('GET',lock),null);
    assert.ok(!counters.some(({cmd})=>isAcquire(cmd)));
    record('permit-issue-after-absolute-cutoff-is-rejected',{replyMs,issueExecutedMs:ms,
      redisDeadlineRejection:true,noPermitAndNoGlobalLease:true});
    return;
  }

  for(const replayIssue of [false,true]){
    if(mode!==(replayIssue?'permit-replay-after-revoke':'late-acquire-before-deadline'))continue;
    const done=gate();
    const start=performance.now();
    let originalIssue,permit,token;
    transport=async(cmd,options,execute)=>{
      if(isIssue(cmd)&&!originalIssue){
        permit=cmd[3];
        originalIssue=execute;
        return execute();
      }
      if(isAcquire(cmd)&&!token){
        token=cmd[5];
        await sleepUntil(start,13500);
        assert.equal(options.signal.aborted,true);
        let duplicate;
        if(replayIssue)duplicate=await originalIssue().json();
        const actual=await execute().json();
        done.open({duplicate,actual,time:round(performance.now()-start)});
        return Response.json(actual);
      }
      return execute();
    };
    const expired=await sync(payload('revoked-acquisition'));
    const replyMs=round(performance.now()-start);
    assert.equal(expired.code,503);
    assert.ok(replyMs>=9800&&replyMs<12000);
    assert.equal(redis('GET',permit),null);
    assert.equal(redis('GET',lock),null);
    const received=await done.ready;
    assert.ok(received.time>replyMs&&received.time<22000);
    if(!replayIssue){
      assert.match(received.actual.error,/ADDON_PERMIT_REVOKED/);
      assert.equal(redis('GET',lock),null);
      assert.equal((await sync(payload('after-revocation',{name:'Audit Two'}))).code,200);
      record('acknowledged-revocation-fences-delayed-acquire-before-cutoff',{replyMs,acquireAttemptMs:received.time,
        rejectedWhileOriginallyUnexpired:true,revokedPermitUnavailable:true,otherCharacterHttp:200});
      return;
    }
    assert.equal(received.duplicate.result,'OK');
    assert.equal(received.actual.result,'OK');
    assert.equal(redis('GET',lock),token);
    const restoredTtl=redis('PTTL',lock);
    assert.ok(restoredTtl>0&&restoredTtl<9000);
    assert.equal((await sync(payload('other-blocked-by-replayed-permit',{name:'Audit Two'}))).code,409);
    await wait(restoredTtl+25);
    assert.equal(redis('GET',lock),null);
    assert.equal((await sync(payload('other-after-resurrected-permit-expiry',{name:'Audit Two'}))).code,200);
    record('replayed-issuance-resurrects-confirmed-revoked-permit',{replyMs,acquireAttemptMs:received.time,
      originalIssuanceReplayedByTransport:true,revocationPreviouslyConfirmed:true,postReplyLockCreated:true,
      blockedOtherCharacterHttp:409,expiredAtOriginalCutoff:true,findingConfirmed:true});
    return;
  }

  if(mode==='client-clock-offset'){
    const wall=Date.now;
    let observations=0;
    transport=(cmd,options,execute)=>{
      if(isIssue(cmd)){
        const time=redis('TIME');
        const now=Number(time[0])*1000+Math.floor(Number(time[1])/1000);
        assert.ok(Number(cmd[4])-now<=22000&&Number(cmd[4])-now>20000);
        observations++;
      }
      return execute();
    };
    try{
      for(const hours of [-8,8]){
        Date.now=()=>wall()+hours*3600000;
        const time=await runSyncDeadline(performance.now()+22000,async()=>{
          const token=await acquireRefreshLock({addon:true});
          assert.ok(token);
          assert.equal(await requestRedis(['SET','dalton-audit:clock-offset','clock sample checked']),'OK');
          await releaseRefreshLock(token,{addon:true});
          return true;
        });
        assert.ok(time);
      }
    }finally{Date.now=wall;}
    assert.equal(redis('GET','dalton-audit:clock-offset'),'clock sample checked');
    assert.equal(redis('GET',lock),null);
    record('opposite-client-wall-clock-offsets-use-redis-time',{offsetHours:[-8,8],leaseSamples:observations,
      bothFencedWritesSucceeded:true,localWallClockUnusedForLease:true});
    return;
  }

  if(mode==='provider-clock-divergence'){
    // Simulated split clocks across transport responses and the Redis executor.
    // No host clock is changed, and every mutation still runs on real Redis.
    const scoped=gate();
    const start=performance.now();
    let shifted=false,firstObservation=false;
    transport=async(cmd,options,execute)=>{
      if(cmd[0]==='TIME'&&!shifted){
        shifted=true;
        const time=(await execute().json()).result;
        return Response.json({result:[String(Number(time[0])+40),time[1]]});
      }
      if(isRelease(cmd))throw Error('Synthetic cleanup not executed');
      if(isObservation(cmd)&&!firstObservation){
        firstObservation=true;
        await sleepUntil(start,23500);
        assert.ok(options.signal.aborted);
        const data=await execute().json();
        scoped.open(data);
        return Response.json(data);
      }
      return execute();
    };
    const out=await sync(payload('synthetic-provider-clocks-disagree',{id:1220}));
    const replyMs=round(performance.now()-start);
    assert.equal(out.code,503);
    assert.ok(replyMs>=21900&&replyMs<23000);
    assert.equal(recordAt(1220),null);
    const remaining=redis('PTTL',lock);
    assert.ok(remaining>38000&&remaining<41000);
    assert.equal((await scoped.ready).result,'OK');
    assert.ok(recordAt(1220));
    record('simulated-provider-clock-divergence-defeats-max-lease',{sampledClockAheadSeconds:40,replyMs,
      liveRedisLeaseRemainingAfterReplyMs:remaining,lateObservationAccepted:true,
      providerClockDivergenceWasSynthetic:true,conditionalRiskConfirmed:true});
    return;
  }

  if(mode==='late-core-commit'){
    const {encodeCompactMaster}=await from('scripts/compact-master-cache.mjs');
    redis('SET','dalton-dashboard:foreverdb:class-master:v8:mage:1.60.1.71139:gz1',encodeCompactMaster({classMaster:{slug:'mage',abilities:[{ranks:[{id:133}]}]}}));
    redis('HSET','dalton-dashboard:foreverdb:class-spell-locale:v2','133',JSON.stringify({id:133,name:'Audit Spielzauber'}));
    const base=redis('GET',rosterKey),done=gate();
    const start=performance.now();
    let saved=false,oldToken;
    transport=async(cmd,options,execute)=>{
      if(isCore(cmd)&&!saved){
        saved=true;
        oldToken=cmd.at(-2);
        await sleepUntil(start,23500);
        assert.ok(options.signal.aborted);
        const data=await execute().json();
        done.open(data);
        return Response.json(data);
      }
      if(isRelease(cmd))throw Error('Synthetic release rejected');
      return execute();
    };
    const body=payload('late-core-and-roster',{id:1221});
    body.sections.spellbook={capturedAt:body.sections.character.capturedAt,entryCount:1,entries:[{spellID:133,name:'Audit Spielzauber',known:true}]};
    const out=await sync(body);
    assert.equal(out.code,503);
    const elapsed=round(performance.now()-start);
    assert.ok(elapsed>=21900&&elapsed<23000);
    assert.equal(redis('GET',lock),null);
    // Deliberately restore the stale token after cutoff to test the script's absolute check independently of TTL.
    redis('SET',lock,oldToken,'EX',10);
    assert.match((await done.ready).error,/ADDON_SYNC_DEADLINE/);
    assert.equal(redis('GET',rosterKey),base);
    assert.equal(redis('GET',statusKey('audit-one')),null);
    assert.equal(redis('GET','dalton-dashboard:core:compact:v2:production'),null);
    redis('DEL',lock);
    transport=(cmd,options,execute)=>execute();
    assert.equal((await sync(body)).code,200);
    assert.equal(status('audit-one').pendingObservations,false);
    assert.equal(JSON.parse(redis('GET',rosterKey)).characters[0].knownClassAbilities[0].id,133);
    assert.equal(JSON.parse(recordAt(1221)).observationCount,1);
    record('late-core-mset-rejected-even-with-stale-token-recreated',{replyMs:elapsed,
      authoritativeRosterAndReceiptUnchanged:true,exercisedDeadlineSeparatelyFromLease:true,
      laterSyncPersistedRosterAndObservationExactlyOnce:true});
    return;
  }

  if(mode==='late-cache-and-history'){
    const {appendChangeBatch}=await from('scripts/history-store.mjs');
    const cache='dalton-audit:late-cache',chronicle='dalton-dashboard:history:changes:v1';
    const base=JSON.parse(redis('GET',rosterKey)),later=structuredClone(base);
    later.characters[0].level++;
    const done=gate();
    const attempts=[];
    const start=performance.now();
    let hold=true;
    transport=async(cmd,options,execute)=>{
      if(hold&&[cache,chronicle].includes(cmd[3])){
        assert.match(cmd[1],/^-- addon-sync-fence:v1/);
        await sleepUntil(start,23500);
        assert.ok(options.signal.aborted);
        const out=await execute().json();
        attempts.push(out);
        if(attempts.length===2)done.open();
        return Response.json(out);
      }
      return execute();
    };
    const run=()=>runSyncDeadline(performance.now()+22000,async()=>{
      const token=await acquireRefreshLock({addon:true});
      assert.ok(token);
      await Promise.all([requestRedis(['HSET',cache,'class','synthetic cache']),appendChangeBatch(base,later,{source:'addon-sync'})]);
      await releaseRefreshLock(token,{addon:true});
    });
    await assert.rejects(run(),/REDIS_REQUEST_TIMEOUT/);
    await done.ready;
    assert.ok(attempts.every(result=>/ADDON_SYNC_DEADLINE/.test(result.error)));
    assert.equal(redis('TYPE',cache),'none');
    assert.equal(redis('LLEN',chronicle),0);
    assert.equal(redis('GET',lock),null);
    hold=false;
    await run();
    assert.equal(redis('HGET',cache,'class'),'synthetic cache');
    assert.equal(redis('LLEN',chronicle),1);
    record('late-cache-and-history-are-server-fenced',{actualLateEvals:attempts.length,lateCacheAndHistoryRejected:true,
      earlySameCommandsSucceeded:true,positiveHistoryEntries:1});
    return;
  }

  if(mode==='permissions'){
    const user='audit-time-off';
    redis('ACL','SETUSER',user,'on','>audit-fixture-only','~*','+@all','-time');
    aclUser=user;
    try{
      assert.equal((await sync(payload('deny-time'))).code,503);
      assert.equal(redis('GET',lock),null);
      assert.equal(redis('GET',statusKey('audit-one')),null);
      const manualToken=await acquireRefreshLock();
      assert.ok(manualToken);
      await releaseRefreshLock(manualToken);
    }finally{aclUser=null;redis('ACL','DELUSER',user);}
    const mutateUser='audit-hset-off';
    redis('ACL','SETUSER',mutateUser,'on','>audit-fixture-only','~*','+@all','-hset');
    aclUser=mutateUser;
    const body=payload('lua-hset-denied-on-server',{id:1222});
    try{
      assert.equal((await sync(body)).code,503);
      assert.equal(recordAt(1222),null);
      assert.equal(status('audit-one').pendingObservations,true);
      assert.equal(redis('GET',lock),null);
    }finally{aclUser=null;redis('ACL','DELUSER',mutateUser);}
    assert.equal((await sync(body)).value.duplicate,true);
    assert.equal(JSON.parse(recordAt(1222)).observationCount,1);
    record('redis-acl-time-and-lua-mutation-denials',{noPermitOnTimeDenial:true,manualLeaseStillPermitted:true,
      deniedLuaMutationRetainedOutbox:true,retryAfterGrantPersistedOnce:true});
    return;
  }

  throw Error('Unknown deadline test mode');
});
