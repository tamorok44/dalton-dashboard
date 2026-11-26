import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';

const privateToken='audit_blob_rw_auditstore_fixture-only';
const mediaToken='audit_blob_rw_auditmedia_fixture-only';
const host='auditstore.private.blob.vercel-storage.com';
const publicHost='auditmedia.public.blob.vercel-storage.com';

async function withBlobTransport(tree,action){
  const {MockAgent,getGlobalDispatcher,setGlobalDispatcher}=createRequire(join(tree,'package.json'))('undici');
  const prior=getGlobalDispatcher();
  const agent=new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  try{return await action(agent);}
  finally{setGlobalDispatcher(prior);await agent.close();}
}
const apiPut={path:path=>path.startsWith('/api/blob/?pathname='),method:'PUT'};
const headersOf=request=>new Headers(request.headers);
function doc(path,storage=host){
  const url='https://'+storage+'/'+path;
  return {url,pathname:path,downloadUrl:url,contentType:'application/gzip',etag:'"fixture"'};
}

export async function runArchiveCases({base,head,reset,daily,runCron,record,writeProof,redis,commands,isIndex,setBefore,snapshotIndex,date}){
  const {FOREVER_CHARACTER_ENDPOINTS,fetchForeverSnapshot}=await import(join(head,'scripts/blizzard-api.mjs'));
  const install=await import(join(head,'scripts/daily-snapshot-store.mjs'));
  const legacy=await import(join(base,'scripts/daily-snapshot-store.mjs'));
  const known=['audit-one','audit-two'];
  const names=Object.keys(FOREVER_CHARACTER_ENDPOINTS);
  const path='history/private/v2/daily/'+date.replaceAll('-','/')+'/daltons-full.json.gz';
  const snapshot={snapshotAt:date+'T04:09:00Z',
    characters:Object.fromEntries(known.map((slug,index)=>[slug,Object.fromEntries(names.map(name=>
      [name,{ok:true,status:200,data:{id:index+101,name:slug}}]))]))};
  process.env.VERCEL_BLOB_RETRIES='0';
  process.env.BLOB_READ_WRITE_TOKEN=mediaToken;
  delete process.env.DALTON_PRIVATE_ARCHIVE_TOKEN;
  await withBlobTransport(base,async agent=>{
    const api=agent.get('https://vercel.com');
    api.intercept(apiPut).reply(request=>{
      assert.equal(headersOf(request).get('authorization'),'Bearer '+mediaToken);
      assert.equal(headersOf(request).get('x-vercel-blob-access'),'public');
      assert.equal(headersOf(request).get('x-allow-overwrite'),'1');
      assert.deepEqual(JSON.parse(gunzipSync(request.body)),snapshot);
      const key=new URL(request.path,'https://vercel.com').searchParams.get('pathname');
      return {statusCode:200,data:doc(key,publicHost)};
    });
    const uploaded=await legacy.saveDailySnapshot(snapshot,date);
    assert.match(uploaded.url,/\.public\./);
    agent.assertNoPendingInterceptors();
  });
  let blocked=0;
  const unexpectedPut=async()=>{blocked++;throw Error('Unexpected write');};
  await assert.rejects(install.saveDailySnapshot(snapshot,date,{putImpl:unexpectedPut}),/nicht konfiguriert/);
  process.env.DALTON_PRIVATE_ARCHIVE_TOKEN=privateToken;
  process.env.VERCEL_ENV='preview';
  await assert.rejects(install.saveDailySnapshot(snapshot,date,{putImpl:unexpectedPut}),/nicht konfiguriert/);
  process.env.VERCEL_ENV='production';
  assert.equal(blocked,0);
  record('original-F01-and-fail-closed',{oldSdkAccess:'public',oldAllowOverwrite:true,previewUploads:0,noPrivateTokenUploads:0});

  reset();
  let written=null,putCalls=0,readCalls=0,rawCalls=0,refreshCalls=0,recovery=null,archiveOwnershipFails=false;
  await withBlobTransport(head,async agent=>{
    const api=agent.get('https://vercel.com');
    const bucket=agent.get('https://'+host);
    bucket.intercept({method:'GET',path:'/'+path+'?cache=0'}).reply(request=>{
      const headers=headersOf(request);
      assert.equal(headers.get('authorization'),'Bearer '+privateToken);
      readCalls++;
      return written?{statusCode:200,data:written,responseOptions:{headers:{'content-type':'application/gzip'}}}:
        {statusCode:404,data:'fixture missing'};
    }).persist();
    api.intercept(apiPut).reply(request=>{
      const headers=headersOf(request);
      assert.equal(headers.get('authorization'),'Bearer '+privateToken);
      assert.equal(headers.get('x-vercel-blob-access'),'private');
      assert.equal(headers.get('x-vercel-blob-store-id'),'auditstore');
      assert.equal(headers.get('x-allow-overwrite'),'0');
      assert.equal(headers.get('x-add-random-suffix'),'0');
      assert.equal(new URL(request.path,'https://vercel.com').searchParams.get('pathname'),path);
      if(!written){
        written=Buffer.from(request.body);
        assert.deepEqual(JSON.parse(gunzipSync(written)),snapshot);
        putCalls++;
        return {statusCode:200,data:doc(path)};
      }
      const later=JSON.parse(gunzipSync(request.body));
      assert.notDeepEqual(later,snapshot);
      archiveOwnershipFails=true;
      return {statusCode:400,data:{error:{code:'bad_request',message:'Fixture: immutable path already occupied'}}};
    }).persist();

    let fail=true;
    setBefore(async command=>{
      if(isIndex(command)&&fail){fail=false;throw Error('Fixture stopped after Blob response before Redis metadata');}
    });
    const archiveDaily=daily({dailySnapshotStoreConfigured:()=>true,
      fetchForeverSnapshot:async()=>{rawCalls++;return snapshot;},
      refreshDailyCharacters:async()=>{refreshCalls++;return writeProof();}});
    const cancelled=await runCron(archiveDaily);
    assert.equal(cancelled.code,503);
    assert.deepEqual(snapshotIndex(),[null,null]);
    const next=await runCron(archiveDaily);
    assert.equal(next.code,200);
    assert.equal(next.value.recovered,true);
    recovery=next.value.snapshot;
    assert.equal(recovery.quality.status,'complete');
    assert.equal(recovery.rawBytes,Buffer.byteLength(JSON.stringify(snapshot)));
    assert.equal(recovery.gzipBytes,written.length);
    assert.equal(snapshotIndex()[0],snapshotIndex()[1]);
    assert.deepEqual([putCalls,readCalls,rawCalls,refreshCalls],[1,2,1,1]);
    const later=structuredClone(snapshot);
    later.characters['audit-one'].profile.data.id=777;
    await assert.rejects(install.saveDailySnapshot(later,date),/immutable path/);
    assert.equal(archiveOwnershipFails,true);
    assert.deepEqual(JSON.parse(gunzipSync(written)),snapshot);
    await assert.rejects(install.recoverDailySnapshot(date,{expectedSlugs:['audit-three']}),/Roster/);
    assert.equal(readCalls,3);

    const older=JSON.parse(snapshotIndex()[0]);
    redis('HDEL','dalton-dashboard:history:daily:index:v1',date);
    const changed=JSON.parse(redis('GET','dalton-dashboard:characters:v1'));
    changed.characters.pop();
    redis('SET','dalton-dashboard:characters:v1',JSON.stringify(changed));
    const blockedRecovery=await runCron(archiveDaily);
    assert.equal(blockedRecovery.code,503);
    assert.equal(blockedRecovery.value.snapshot.archiveStatus,'failed');
    assert.equal(rawCalls,1);
    assert.equal(putCalls,1);
    assert.equal(refreshCalls,1);
    assert.equal(JSON.parse(snapshotIndex()[1]).date,older.date);
  });
  record('archive-real-sdk-recovery',{http:[503,200],firstActualPut:1,authGetBeforeAndAfter:2,rawFetches:1,
    profileRuns:1,wholeArchiveBytes:recovery.gzipBytes,sha256:recovery.sha256,simulatedCollisionRejected:true});
  record('archive-roster-change',{result:503,additionalUploads:0,sameDayRetryBlockedUntilRosterMatches:true});

  reset();
  await writeProof();
  const afterChange=JSON.parse(redis('GET','dalton-dashboard:characters:v1'));
  afterChange.characters.pop();
  redis('SET','dalton-dashboard:characters:v1',JSON.stringify(afterChange));
  const changedSnapshot=structuredClone(snapshot);
  delete changedSnapshot.characters['audit-two'];
  await withBlobTransport(head,async agent=>{
    agent.get('https://'+host).intercept({method:'GET',path:'/'+path+'?cache=0'}).reply(404,'fixture missing');
    agent.get('https://vercel.com').intercept(apiPut).reply(200,doc(path));
    const response=await runCron(daily({dailySnapshotStoreConfigured:()=>true,
      refreshDailyCharacters:async()=>{throw Error('Old roster receipt should have been checked');},
      fetchForeverSnapshot:async slugs=>{assert.deepEqual(slugs,['audit-one']);return changedSnapshot;}}));
    assert.equal(response.code,200);
    assert.equal(response.value.snapshot.characters,1);
    assert.equal(response.value.refresh.total,2);
    agent.assertNoPendingInterceptors();
  });
  record('archive-proof-roster-mismatch',{http:200,archivedCharacters:1,refreshReceiptCharacters:2});

  await withBlobTransport(head,async agent=>{
    agent.get('https://vercel.com').intercept(apiPut).reply(200,doc(path,publicHost));
    await assert.rejects(install.saveDailySnapshot(snapshot,date),/bestätigte private URL/);
    agent.assertNoPendingInterceptors();
  });

  const corrupt=Buffer.from('not actually gzip');
  await assert.rejects(install.recoverDailySnapshot(date,{getImpl:async()=>({statusCode:200,
    blob:doc(path),stream:new Response(corrupt).body})}),/header|gzip/i);
  const withPartial=structuredClone(snapshot);
  withPartial.characters['audit-one'][names.at(-1)]={ok:false,status:503,data:{error:'fixture'}};
  assert.equal(install.classifySnapshot(withPartial).status,'partial');
  let lostEndpoints=0;
  process.env.BLIZZARD_CLIENT_ID='audit-fixture-only';
  process.env.BLIZZARD_CLIENT_SECRET='audit-fixture-only';
  const outage=await fetchForeverSnapshot(known,{fetchImpl:async url=>{
    if(new URL(url).hostname==='oauth.battle.net')return Response.json({access_token:'synthetic-credential',expires_in:30});
    lostEndpoints++;
    return Response.json({error:'Fixture unavailable'},{status:503});
  }});
  outage.snapshotAt=date+"T04:09:00Z";
  await assert.rejects(install.saveDailySnapshot(outage,date,{putImpl:unexpectedPut}),/bestätigtes Charakterprofil/);
  assert.equal(lostEndpoints,42);
  assert.equal(blocked,0);
  const wrongIdentity=structuredClone(snapshot);
  wrongIdentity.characters['audit-one'].profile.data={id:101,name:'Wrong Fixture'};
  wrongIdentity.characters['audit-two'].profile.data={id:101,name:'Wrong Fixture'};
  wrongIdentity.characters['audit-two'][names.at(-1)]={status:200,ok:true,data:{error:'Fixture failure despite 200'}};
  assert.equal(install.classifySnapshot(wrongIdentity,{expectedSlugs:known,date}).status,'complete');
  record('archive-quality',{allFailedEndpoints:lostEndpoints,allFailedUploads:0,optionalFailure:'partial',corruptGzipRejected:true,
    duplicateProfileIdAndErrorObjectAcceptedAs:'complete'});
  delete process.env.BLIZZARD_CLIENT_ID;
  delete process.env.BLIZZARD_CLIENT_SECRET;

  reset();
  let clockCalls=0,attempts=0;
  const skipped=daily({dailySnapshotStoreConfigured:()=>true,
    clock:()=>clockCalls++===0?0:49000,refreshDailyCharacters:writeProof,
    recoverDailySnapshot:async()=>{attempts++;throw Error('Forbidden within exhausted budget');}});
  const outcome=await runCron(skipped);
  assert.equal(outcome.code,503);
  assert.equal(outcome.value.refresh.persisted,true);
  assert.equal(attempts,0);
  assert.equal(outcome.value.snapshot.archiveStatus,'failed');
  process.env.VERCEL_BLOB_RETRIES='1';
  let retryElapsed,attemptedSdkFailures=0;
  await withBlobTransport(head,async agent=>{
    agent.get('https://vercel.com').intercept(apiPut).reply(()=>{
      attemptedSdkFailures++;
      return {statusCode:503,data:{error:{code:'service_unavailable',message:'synthetic temporary unavailable'}}};
    }).persist();
    const started=performance.now();
    const short=AbortSignal.timeout(100);
    await assert.rejects(install.saveDailySnapshot(snapshot,date,{signal:short}));
    retryElapsed=Math.round(performance.now()-started);
    assert.equal(short.aborted,true);
    assert.equal(attemptedSdkFailures,1);
    assert.ok(retryElapsed>=500&&retryElapsed<10000,'backoff remains pending after abort signal');
  });
  record('archive-time-budget',{exhaustedBudgetUploads:0,refreshPersisted:true,sdkSingleRetry:true,
    sdkAbortAfterMs:100,sdkPromiseSettledAfterMs:retryElapsed,redisCommandsForBudgetCase:commands.length});
  delete process.env.VERCEL_BLOB_RETRIES;
}
