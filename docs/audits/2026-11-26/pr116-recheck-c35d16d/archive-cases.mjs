import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {gunzipSync} from 'node:zlib';

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
  const {rosterKey}=await import(join(head,'scripts/daily-roster.mjs'));
  const store=await import(join(head,'scripts/daily-snapshot-store.mjs'));
  const legacy=await import(join(base,'scripts/daily-snapshot-store.mjs'));
  const known=['audit-one','audit-two'];
  const knownRoster=known.map((slug,i)=>({slug,id:101+i}));
  const rowRoster=knownRoster.map(row=>({...row,id:null}));
  const makePath=roster=>'history/private/v3/daily/'+date.replaceAll('-','/')+'/'+rosterKey(roster)+'/daltons-full.json.gz';
  const path=makePath(rowRoster);
  const names=Object.keys(FOREVER_CHARACTER_ENDPOINTS);
  const snapshot={snapshotAt:date+'T04:09:00Z',
    characters:Object.fromEntries(known.map((slug,index)=>[slug,Object.fromEntries(names.map(name=>
      [name,{ok:true,status:200,data:{id:index+101,name:slug}}]))]))};
  const forSlugs=slugs=>({...snapshot,characters:Object.fromEntries(slugs.map(slug=>[slug,snapshot.characters[slug]]))});
  const updateSize=()=>{
    const key='dalton-dashboard:characters:v1';
    const prior=JSON.parse(redis('GET',key));
    prior.characters.pop();redis('SET',key,JSON.stringify(prior));
  };
  process.env.VERCEL_BLOB_RETRIES='0';
  process.env.BLOB_READ_WRITE_TOKEN=mediaToken;
  delete process.env.DALTON_PRIVATE_ARCHIVE_TOKEN;
  await withBlobTransport(base,async agent=>{
    agent.get('https://vercel.com').intercept(apiPut).reply(request=>{
      const headers=headersOf(request);
      assert.equal(headers.get('authorization'),'Bearer '+mediaToken);
      assert.equal(headers.get('x-vercel-blob-access'),'public');
      assert.equal(headers.get('x-allow-overwrite'),'1');
      assert.deepEqual(JSON.parse(gunzipSync(request.body)),snapshot);
      const key=new URL(request.path,'https://vercel.com').searchParams.get('pathname');
      return {statusCode:200,data:doc(key,publicHost)};
    });
    assert.match((await legacy.saveDailySnapshot(snapshot,date)).url,/\.public\./);
    agent.assertNoPendingInterceptors();
  });
  let blocked=0;
  const unexpectedPut=async()=>{blocked++;throw Error('Unexpected write');};
  await assert.rejects(store.saveDailySnapshot(snapshot,date,{putImpl:unexpectedPut}),/nicht konfiguriert/);
  process.env.DALTON_PRIVATE_ARCHIVE_TOKEN=privateToken;
  process.env.VERCEL_ENV='preview';
  await assert.rejects(store.saveDailySnapshot(snapshot,date,{putImpl:unexpectedPut}),/nicht konfiguriert/);
  process.env.VERCEL_ENV='production';
  assert.equal(blocked,0);
  record('original-F01-and-fail-closed',{oldSdkAccess:'public',oldAllowOverwrite:true,previewUploads:0,noPrivateTokenUploads:0});

  reset();
  const objects=new Map();let putCalls=0,readCalls=0,rawCalls=0,refreshCalls=0;
  await withBlobTransport(head,async agent=>{
    const api=agent.get('https://vercel.com'),bucket=agent.get('https://'+host);
    bucket.intercept({method:'GET',path:request=>request.endsWith('?cache=0')}).reply(request=>{
      assert.equal(headersOf(request).get('authorization'),'Bearer '+privateToken);
      readCalls++;
      const stored=objects.get(new URL(request.path,'https://'+host).pathname.slice(1));
      return stored?{statusCode:200,data:stored,responseOptions:{headers:{'content-type':'application/gzip'}}}:
        {statusCode:404,data:'fixture missing'};
    }).persist();
    api.intercept(apiPut).reply(request=>{
      const headers=headersOf(request);
      assert.equal(headers.get('authorization'),'Bearer '+privateToken);
      assert.equal(headers.get('x-vercel-blob-access'),'private');
      assert.equal(headers.get('x-vercel-blob-store-id'),'auditstore');
      assert.equal(headers.get('x-allow-overwrite'),'0');
      assert.equal(headers.get('x-add-random-suffix'),'0');
      const incomingPath=new URL(request.path,'https://vercel.com').searchParams.get('pathname');
      if(objects.has(incomingPath))return {statusCode:400,data:{error:{code:'bad_request',message:'Fixture: immutable path already occupied'}}};
      objects.set(incomingPath,Buffer.from(request.body));
      putCalls++;
      return {statusCode:200,data:doc(incomingPath)};
    }).persist();
    let fail=true;
    setBefore(async command=>{
      if(isIndex(command)&&fail){fail=false;throw Error('Fixture stopped after Blob upload before index');}
    });
    const archiveDaily=daily({dailySnapshotStoreConfigured:()=>true,
      fetchForeverSnapshot:async slugs=>{rawCalls++;return forSlugs(slugs);},
      refreshDailyCharacters:async()=>{refreshCalls++;return writeProof();}});
    assert.equal((await runCron(archiveDaily)).code,503);
    assert.deepEqual(snapshotIndex(),[null,null]);
    const recovered=await runCron(archiveDaily);
    assert.equal(recovered.code,200);
    assert.equal(recovered.value.recovered,true);
    const meta=recovered.value.snapshot;
    const original=objects.get(path);
    assert.equal(meta.quality.status,'complete');
    assert.equal(meta.gzipBytes,original.length);
    assert.equal(snapshotIndex()[0],snapshotIndex()[1]);
    assert.deepEqual(JSON.parse(gunzipSync(original)),snapshot);
    assert.deepEqual([putCalls,readCalls,rawCalls,refreshCalls],[1,2,1,1]);
    await assert.rejects(store.saveDailySnapshot(snapshot,date,{expectedRoster:rowRoster}),/immutable path/);
    assert.equal(objects.get(path),original);
    record('archive-real-sdk-recovery',{http:[503,200],firstActualPut:1,authGetBeforeAndAfter:2,rawFetches:1,
      profileRuns:1,wholeArchiveBytes:meta.gzipBytes,sha256:meta.sha256,simulatedCollisionRejected:true});

    updateSize();
    const changed=await runCron(archiveDaily);
    assert.equal(changed.code,200);
    assert.equal(changed.value.snapshot.characters,1);
    assert.equal(changed.value.refresh.total,1);
    assert.notEqual(changed.value.snapshot.pathname,path);
    assert.equal(changed.value.snapshot.previousArchives[0].pathname,path);
    assert.equal(objects.get(path),original);
    assert.deepEqual([putCalls,refreshCalls],[2,2]);
    record('archive-roster-change',{result:200,distinctImmutableObjects:2,priorReferenceRetained:true,newRefresh:true});
  });

  reset();
  await writeProof();
  updateSize();
  await withBlobTransport(head,async agent=>{
    const singlePath=makePath(rowRoster.slice(0,1));
    agent.get('https://'+host).intercept({method:'GET',path:'/'+singlePath+'?cache=0'}).reply(404,'fixture missing');
    agent.get('https://vercel.com').intercept(apiPut).reply(200,doc(singlePath));
    const result=await runCron(daily({dailySnapshotStoreConfigured:()=>true,refreshDailyCharacters:writeProof,
      fetchForeverSnapshot:async slugs=>{assert.deepEqual(slugs,['audit-one']);return forSlugs(slugs);}}));
    assert.equal(result.code,200);
    assert.equal(result.value.refresh.total,1);
    assert.equal(result.value.snapshot.characters,1);
    agent.assertNoPendingInterceptors();
    record('archive-proof-roster-mismatch',{http:200,archivedCharacters:1,refreshReceiptCharacters:1,mismatchedPriorReceiptReplaced:true});
  });

  await withBlobTransport(head,async agent=>{
    agent.get('https://vercel.com').intercept(apiPut).reply(200,doc(path,publicHost));
    await assert.rejects(store.saveDailySnapshot(snapshot,date),/bestätigte private URL/);
    agent.assertNoPendingInterceptors();
  });
  const corrupt=Buffer.from('not actually gzip');
  await assert.rejects(store.recoverDailySnapshot(date,{expectedRoster:rowRoster,getImpl:async()=>({statusCode:200,
    blob:doc(path),stream:new Response(corrupt).body})}),/header|gzip/i);
  const withPartial=structuredClone(snapshot);
  withPartial.characters['audit-one'][names.at(-1)]={ok:false,status:503,data:{error:'fixture'}};
  assert.equal(store.classifySnapshot(withPartial).status,'partial');
  let lostEndpoints=0;
  process.env.BLIZZARD_CLIENT_ID='audit-fixture-only';
  process.env.BLIZZARD_CLIENT_SECRET='audit-fixture-only';
  const outage=await fetchForeverSnapshot(known,{fetchImpl:async url=>{
    if(new URL(url).hostname==='oauth.battle.net')return Response.json({access_token:'synthetic-credential',expires_in:30});
    lostEndpoints++;return Response.json({error:'Fixture unavailable'},{status:503});
  }});
  outage.snapshotAt=date+'T04:09:00Z';
  await assert.rejects(store.saveDailySnapshot(outage,date,{putImpl:unexpectedPut}),/bestätigtes Charakterprofil/);
  assert.equal(lostEndpoints,42);
  assert.equal(blocked,0);
  const duplicateId=structuredClone(snapshot);
  duplicateId.characters['audit-two'].profile.data.id=101;
  await assert.rejects(store.saveDailySnapshot(duplicateId,date,{putImpl:unexpectedPut}),/Doppelte Profil-ID/);
  const wrongIdentity=structuredClone(snapshot);
  wrongIdentity.characters['audit-two'].profile.data.id=999;
  assert.throws(()=>store.classifySnapshot(wrongIdentity,{expectedRoster:knownRoster,date}),/Profil-ID stimmt nicht/);
  assert.equal(store.classifySnapshot(wrongIdentity,{expectedRoster:rowRoster,date}).status,'complete');
  const errorIn200=structuredClone(snapshot);
  errorIn200.characters['audit-two'][names.at(-1)]={status:200,ok:true,data:{error:'Fixture failure despite 200'}};
  assert.equal(store.classifySnapshot(errorIn200,{expectedRoster:knownRoster,date}).status,'partial');
  const emptyEndpoints=structuredClone(snapshot);
  for(const entry of Object.values(emptyEndpoints.characters)){
    entry.profile.data={id:entry.profile.data.id};
    for(const name of names.filter(name=>name!=='profile'))entry[name].data=[];
  }
  assert.equal(store.classifySnapshot(emptyEndpoints,{expectedRoster:knownRoster,date}).status,'complete');
  record('archive-quality',{allFailedEndpoints:lostEndpoints,allFailedUploads:0,duplicateIdRejected:true,
    mismatchedKnownIdRejected:true,errorObject200MarkedPartial:true,corruptGzipRejected:true});
  record('archive-profile-and-schema-gaps',{unknownIdAcceptsDifferentProfile:true,identifiersOnlyAndEmptyEndpointArraysMarkedComplete:true});
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
  let deadlineElapsed,sdkElapsed,attemptedSdkFailures=0;
  await withBlobTransport(head,async agent=>{
    agent.get('https://vercel.com').intercept(apiPut).reply(()=>{
      attemptedSdkFailures++;return {statusCode:503,data:{error:{code:'service_unavailable',message:'Synthetic temporary unavailable'}}};
    }).persist();
    const {put}=await import(join(head,'node_modules/@vercel/blob/dist/index.js'));
    const started=performance.now();
    const short=AbortSignal.timeout(100);
    let background;
    const putImpl=(...args)=>{
      background=put(...args);
      return background;
    };
    await assert.rejects(store.saveDailySnapshot(snapshot,date,{signal:short,putImpl}),/abort|timeout/i);
    deadlineElapsed=Math.round(performance.now()-started);
    await assert.rejects(background);
    sdkElapsed=Math.round(performance.now()-started);
    assert.equal(attemptedSdkFailures,1);
    assert.ok(deadlineElapsed<500);
    assert.ok(sdkElapsed>500);
  });
  let streamCancelled=false;
  const held=setTimeout(()=>{},1000);
  const delayedStream=new ReadableStream({
    pull(){return new Promise(()=>{});},
    cancel(){streamCancelled=true;}
  });
  try{
    await assert.rejects(store.recoverDailySnapshot(date,{expectedRoster:rowRoster,signal:AbortSignal.timeout(30),
      getImpl:async()=>({statusCode:200,blob:doc(path),stream:delayedStream})}),/abort|timeout/i);
    assert.equal(streamCancelled,true);
  }finally{clearTimeout(held);}
  record('archive-time-budget',{exhaustedBudgetUploads:0,refreshPersisted:true,sdkAbortAfterMs:100,
    callerSettledAfterMs:deadlineElapsed,sdkPromiseSettledAfterMs:sdkElapsed,stalledStreamCancelled:streamCancelled,
    redisCommandsForBudgetCase:commands.length});
  delete process.env.VERCEL_BLOB_RETRIES;

  const large=structuredClone(snapshot);
  large.characters['audit-one'].profile.data.fixtureBytes=randomBytes(3*1024*1024).toString('base64');
  const started=performance.now();
  let uploadsPastDeadline=0,observedElapsed;
  const signal=AbortSignal.timeout(1);
  let result='resolved';
  try{
    await store.saveDailySnapshot(large,date,{signal,putImpl:async()=>{
      uploadsPastDeadline++;observedElapsed=Math.round(performance.now()-started);return doc(path);
    }});
  }catch(error){result=error.name;}
  assert.ok(uploadsPastDeadline===1&&observedElapsed>1);
  await wait(5);
  assert.equal(signal.aborted,true);
  record('archive-cpu-deadline-gap',{nominalMs:1,enteredPutAfterMs:observedElapsed,uploadsPastDeadline,callerResult:result});
}
