import assert from 'node:assert/strict';
import {join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {withRedis} from '../pr116-recheck-177b147/redis-fixture.mjs';
import {explicitInputs,inventoryFor} from '../pr116-recheck-26c1b74/inventory-fixture.mjs';

export async function runRestoreCases({
  base,previous,head,reset,daily,runCron,writeProof,record,redis,commands,setBefore,setAfter,useRedisSocket,
  restart,date,oldRoster,characters,status,version,legacyVersion,dailyIndex,dailyLast,refreshLock,
  observationIndex,observations,getStatus,call,previousAddon,payload,interactions,trainer
}){
  const load=(tree,file)=>import(join(tree,file));
  const {buildLegacyReadProjection}=await load(head,'scripts/storage-rollback-projection.mjs');
  const modernStore=await load(head,'scripts/character-store.mjs');
  const modernHistory=await load(head,'scripts/history-store.mjs');
  const modernKnowledge=await load(head,'scripts/live-knowledge-store.mjs');
  const modernVersion=await load(head,'scripts/data-version.mjs');
  const {withinArchiveDeadline,classifySnapshot}=await load(head,'scripts/daily-snapshot-store.mjs');
  const json=(...args)=>JSON.parse(redis(...args)??'null');
  const isObservation=cmd=>cmd[0]==='EVAL'&&cmd[3]===observationIndex;
  const legacyObservationIndex='dalton-dashboard:live-knowledge:v1:production:index';
  const byId=id=>`dalton-dashboard:live-knowledge:v1:production:record:trainer:1.60.1.71139:id-${id}`;
  const historical=await Promise.all([base,previous].map(async tree=>({
    version:await load(tree,'scripts/data-version.mjs'),
    knowledge:await load(tree,'scripts/live-knowledge-store.mjs'),
    store:await load(tree,'scripts/character-store.mjs'),
    addon:await load(tree,'scripts/addon-sync-store.mjs'),
    history:await load(tree,'scripts/history-store.mjs')
  })));

  reset();
  redis('HSET',legacyVersion,'pet','null');
  for(const [syncId,time,price,handler] of [['older-first',0,10,previousAddon],['modern-second',2,20,undefined],['older-third',4,30,previousAddon]]){
    assert.equal((await call(interactions(payload(syncId,time),time,[trainer(801,time,price)]),handler)).code,200);
  }
  const key=byId(801);
  const expected=(await modernKnowledge.loadLiveKnowledge({build:'1.60.1.71139',kind:'trainer'}))[0];
  assert.equal(expected.latestSnapshot.entries[0].priceCopper,30);
  assert.equal(expected.observationIds.length,3);
  assert.equal(expected.changes.length,3);
  assert.equal(expected.migrationEvidence.reconciled,true);
  assert.match((await modernVersion.loadCurrentDataVersion()).addonSyncVersion,/older-third/);
  const proof=await writeProof();
  const completion=await runCron(daily());
  assert.equal(completion.code,200);
  const input=explicitInputs({
    roster:json('GET',characters),addonStates:[getStatus()],date,
    knowledgePairs:[{key,modern:redis('HGET',observationIndex,key),legacy:redis('GET',key)}],
    dailyRows:[json('HGET',dailyIndex,date)],petMetadata:null,modernReceipt:proof
  });
  input.inventory=inventoryFor(input);
  const oldState=redis('GET',status()),actualRoster=redis('GET',characters);
  const source=[actualRoster,oldState,redis('GET',key),redis('HGET',observationIndex,key),redis('GET',version)];
  const projection=buildLegacyReadProjection(input);
  assert.deepEqual(buildLegacyReadProjection(input),projection);
  assert.equal(projection.manifest.observations,1);
  assert.throws(()=>buildLegacyReadProjection({...input,knowledgePairs:[]}),/Export-Inventur/);
  const pendingInput={...input,addonStates:[{...getStatus(),pendingObservations:true}]};
  assert.throws(()=>buildLegacyReadProjection(pendingInput),/Inventurdifferenz/);
  pendingInput.inventory=inventoryFor(pendingInput);
  assert.throws(()=>buildLegacyReadProjection(pendingInput),/Ausstehende Beobachtungen/);
  await withRedis(async ({socket,exec:target,restart:restartTarget})=>{
    assert.equal(target('DBSIZE'),0);
    useRedisSocket(socket);
    try{
      for(const command of projection.commands)target(...command);
      assert.equal((await historical[0].store.loadCharacters()).fallback,false);
      assert.equal((await historical[0].addon.loadAddonSyncState('audit-one')).payload.syncId,'older-third');
      assert.equal(JSON.parse(target('GET',characters)).generatedAt,input.roster.generatedAt);
      assert.equal(target('SAVE'),'OK');
      await restartTarget();
      for(const old of historical){
        const view=await old.store.loadCharacters();
        assert.equal(view.fallback,false);
        assert.deepEqual(JSON.parse(JSON.stringify(view.data)),input.roster);
        assert.equal((await old.addon.loadAddonSyncState('audit-one')).payload.syncId,'older-third');
        const signature=await old.version.loadCurrentDataVersion();
        assert.equal(signature.generatedAt,input.roster.generatedAt);
        assert.match(signature.addonSyncVersion,/older-third/);
        const replayed=(await old.knowledge.loadLiveKnowledge({build:'1.60.1.71139',kind:'trainer'}))[0];
        assert.equal(replayed.latestSnapshot.entries[0].priceCopper,30);
        assert.deepEqual(replayed.observationIds,expected.observationIds);
        assert.deepEqual(replayed.changes,expected.changes);
        assert.deepEqual(await old.history.getDailySnapshot(date),completion.value.snapshot);
      }
      assert.deepEqual(await historical[1].store.loadDailyProfileReceipt(date),proof);
      assert.equal(JSON.parse(target('GET',dailyLast)).date,date);
    }finally{useRedisSocket(null);}
  });
  assert.deepEqual([redis('GET',characters),redis('GET',status()),redis('GET',key),redis('HGET',observationIndex,key),redis('GET',version)],source);
  record('offline-projection-actual-old-readers',{historicalCheckouts:2,latestPrice:30,distinctObservationIds:3,
    changes:3,unchangedSource:true,targetSurvivedRdbRestart:true,manifestDeterministic:true});
  record('offline-projection-restore-preconditions',{projectedCommandsIncludeRosterAndAddonPayload:true,
    historicalReadersUseProjectedValues:true,omittedHistoryExportRejected:true});

  reset();
  assert.equal((await call(interactions(payload('global-modern',0),0,[trainer(802,0,20)]))).code,200);
  assert.equal((await call(interactions(payload('global-legacy',0,[133],'Audit Two'),0,[trainer(802,0,30),trainer(803,0,50)]),previousAddon)).code,200);
  const legacyRecord=json('GET',byId(802)),modernRecord=json('HGET',observationIndex,byId(802));
  assert.notEqual(legacyRecord.latestSnapshot.entries[0].priceCopper,modernRecord.latestSnapshot.entries[0].priceCopper);
  assert.equal(legacyRecord.latestSnapshot.capturedAt,modernRecord.latestSnapshot.capturedAt);
  assert.ok(redis('SISMEMBER',legacyObservationIndex,byId(803)));
  const healthy=await modernKnowledge.loadLiveKnowledge({build:'1.60.1.71139',kind:'trainer'});
  assert.equal(healthy.length,1);
  assert.equal(healthy[0].npc.id,803);
  assert.deepEqual(healthy.integrityIssues,[{key:byId(802),reason:'conflicting_record',preserved:true}]);
  const sameSecondInput=explicitInputs({roster:oldRoster,addonStates:[],date,dailyRows:[],
    knowledgePairs:[{key:byId(802),legacy:redis('GET',byId(802)),modern:redis('HGET',observationIndex,byId(802))}]});
  sameSecondInput.inventory=inventoryFor(sameSecondInput);
  const isolated=buildLegacyReadProjection(sameSecondInput);
  assert.equal(isolated.manifest.completeForLegacyReaders,false);
  assert.equal(isolated.manifest.quarantined.length,1);
  const later=await call(interactions(payload('newer-capture',2),2,[trainer(802,2,40)]));
  assert.equal(later.code,200);
  assert.equal(later.value.liveKnowledge.repaired,1);
  assert.equal(getStatus().pendingObservations,false);
  assert.equal((await call(payload('ordinary-sync',3,[133,143]))).code,200);
  assert.equal(json('HGET',observationIndex,byId(802)).latestSnapshot.entries[0].priceCopper,40);
  record('mixed-writers-same-second-conflict',{oldAndNewWriteHttp:[200,200],onlyConflictingRecordExcluded:true,
    unrelatedRecordAvailable:true,projectionQuarantines:true,newerCaptureHttp:200,followingCoreHttp:200,pendingCleared:true});

  reset();
  assert.equal((await call(interactions(payload('unrelated-good',0),0,[trainer(804,0,10),trainer(805,0,20)]))).code,200);
  redis('SET',byId(804),'broken-legacy-json');
  redis('SADD',legacyObservationIndex,byId(804));
  const intact=await modernKnowledge.loadLiveKnowledge({build:'1.60.1.71139',kind:'trainer'});
  assert.deepEqual(intact.map(row=>row.npc.id),[805]);
  assert.deepEqual(intact.integrityIssues,[{key:byId(804),reason:'invalid_record',preserved:true}]);
  assert.equal((await historical[0].knowledge.loadLiveKnowledge({build:'1.60.1.71139',kind:'trainer'})).length,0);
  assert.ok(redis('HGET',observationIndex,byId(805)));
  record('malformed-legacy-observation-blast-radius',{modernHashRecords:2,healthyRecordReturned:true,previousReaderSkippedMalformedRecord:true});

  reset();
  assert.equal((await call(interactions(payload('cas-seed',0),0,[trainer(806,0,10)]),previousAddon)).code,200);
  const legacyBefore=json('GET',byId(806));
  let interleave=true,casAttempts=0;
  setBefore(async cmd=>{
    if(!isObservation(cmd)||cmd[6]!==byId(806))return;
    casAttempts++;
    if(interleave){
      interleave=false;
      redis('SET',byId(806),JSON.stringify({...legacyBefore,fixtureRevision:2}));
    }else assert.equal(redis('HGET',observationIndex,byId(806)),null);
  });
  const cas=await call(interactions(payload('reconcile-cas',2),2,[trainer(806,2,20)]));
  assert.equal(cas.code,200);
  assert.equal(casAttempts,2);
  assert.equal(getStatus().pendingObservations,false);
  const afterCas=await call(payload('after-cas-retry',3,[133,143]));
  assert.equal(afterCas.code,200);
  assert.equal(json('HGET',observationIndex,byId(806)).latestSnapshot.entries[0].priceCopper,20);
  assert.equal(json('GET',byId(806)).fixtureRevision,2);
  record('legacy-cas-interleaved-write',{firstHttp:200,staleHsetSuppressed:true,automaticReread:true,legacyStillIntact:true,subsequentCoreHttp:200});

  reset();
  redis('HSET',legacyVersion,'pet','null');
  assert.equal((await call(payload('tie-authoritative'))).code,200);
  const compact=json('GET',version);
  redis('HSET',legacyVersion,'addon:production:audit-one',JSON.stringify({
    receivedAt:compact.addon['audit-one'].receivedAt,syncId:'tie-stale-format'
  }));
  commands.length=0;
  const versionView=await modernVersion.loadCurrentDataVersion();
  assert.match(versionView.addonSyncVersion,/tie-authoritative/);
  assert.equal(commands.filter(cmd=>cmd.type==='GET'&&cmd.key===status()).length,1);
  record('equal-version-time-authoritative-fallback',{conflictingLegacySyncIgnored:true,fullPayloadReads:1});

  reset();
  const receipt=await writeProof();
  assert.equal((await modernStore.loadDailyProfileReceipt(date)).generatedAt,receipt.generatedAt);
  const legacyEquivalent=Object.fromEntries(Object.entries(json('GET',version).dailyReceipt).reverse());
  redis('HSET',legacyVersion,'daily-profile-refresh',JSON.stringify(legacyEquivalent));
  assert.deepEqual(await modernStore.loadDailyProfileReceipt(date),receipt);
  let redundantRefreshes=0;
  const renewed=await runCron(daily({refreshDailyCharacters:async()=>{redundantRefreshes++;return writeProof();}}));
  assert.equal(renewed.code,200);
  assert.equal(redundantRefreshes,0);
  record('equivalent-daily-receipts-order-sensitive',{identicalEvidenceDifferentKeyOrderAccepted:true,redundantRefreshes});

  reset();
  process.env.VERCEL_ENV='preview';
  const previewLock=refreshLock+':preview-addon';
  let expireBeforeAck=true;
  setBefore(async cmd=>{
    if(expireBeforeAck&&cmd[0]==='EVAL'&&cmd[3]===status('audit-one','preview')&&cmd[6]?.includes('"pendingObservations":false')){
      expireBeforeAck=false;
      redis('SET',previewLock,'fixture-successor','EX','120');
    }
  });
  try{
    const lose=await call(interactions(payload('preview-fenced-ack',0),0,[trainer(807,0)]));
    assert.equal(lose.code,503);
    assert.match(lose.value.error,/REFRESH_LOCK_LOST/);
    assert.equal(redis('GET',previewLock),'fixture-successor');
    assert.equal(json('GET',status('audit-one','preview')).pendingObservations,true);
    redis('DEL',previewLock);
    const resumed=await call(payload('preview-after-loss',2));
    assert.equal(resumed.code,200);
    assert.equal(json('GET',status('audit-one','preview')).payload.syncId,'preview-after-loss');
    assert.equal(json('GET',status('audit-one','preview')).pendingObservations,false);
    assert.equal(getStatus(),null);
    record('preview-lease-loss-before-pending-clear',{interruptedHttp:503,successorPreserved:true,pendingPreserved:true,retryHttp:200});
  }finally{process.env.VERCEL_ENV='production';}

  reset();
  let rejected=0;
  setBefore(async cmd=>{if(isObservation(cmd))throw Error('Fixture sustained observation failure');});
  assert.equal((await call(interactions(payload('outage-origin'),0,[trainer(808,0)]))).code,503);
  for(let i=1;i<=6;i++){
    if(i===4){assert.equal(redis('SAVE'),'OK');await restart();}
    const res=await call(payload('outage-follow-'+i,i,[133,143]));
    if(res.code===503)rejected++;
    assert.equal(getStatus().payload.syncId,'outage-origin');
    assert.equal(getStatus().pendingObservations,true);
  }
  assert.equal(rejected,6);
  assert.equal(redis('TTL',status()),-1);
  assert.equal((await call(payload('unaffected-character',7,[133],'Audit Two'))).code,200);
  assert.equal(observations().length,0);
  setBefore(async()=>{});
  assert.equal((await call(payload('outage-recovered',8,[133,143]))).code,200);
  assert.equal(json('HGET',observationIndex,byId(808)).observationCount,1);
  assert.equal(getStatus().pendingObservations,false);
  commands.length=0;
  const confirmedReplay=await call(payload('outage-recovered',8,[133,143]));
  assert.equal(confirmedReplay.value.duplicate,true);
  assert.equal(commands.filter(cmd=>cmd.key===observationIndex).length,0);
  record('sustained-observation-outage',{laterSameCharacter503:rejected,otherCharacter200:true,outboxSurvivesRedisRestart:true,
    pendingHasNoTtl:true,oneObservationOnRecovery:true,confirmedReplayObservationReads:0});

  const emptySignal=new AbortController().signal;
  const started=performance.now();
  let finish,workCompleted=false;
  const pending=new Promise(resolve=>{finish=resolve;});
  const watchdog=setTimeout(()=>finish(),1500);
  try{
    await assert.rejects(withinArchiveDeadline(async()=>{await pending;workCompleted=true;},emptySignal,started+4),/Archivfrist/);
    assert.equal(workCompleted,false);
  }finally{clearTimeout(watchdog);finish();}
  record('monotone-deadline-without-matching-signal',{nominalMs:4,elapsedMs:Math.round(performance.now()-started),
    signalAborted:false,callerRejectedWhileWorkStillPending:true});

  reset();
  const knownRoster=oldRoster.characters.map((character,i)=>({...character,blizzardCharacterId:901+i}));
  redis('SET',characters,JSON.stringify({...oldRoster,characters:knownRoster}));
  const knownProof=await writeProof();
  const {rosterKey}=await load(head,'scripts/daily-roster.mjs');
  const fixturePath='legacy-fixture/different-object';
  const unverified={date,archiveStatus:'private',url:'https://fixture.private.blob.vercel-storage.com/'+fixturePath,
    pathname:fixturePath,sha256:'1'.repeat(64),roster:knownProof.roster,rosterKey:rosterKey(knownProof.roster),
    characters:2,refresh:knownProof,quality:{status:'complete',identity:'roster_id_and_slug'}};
  const token=await modernHistory.acquireDailySnapshotLock(date);
  await modernHistory.registerDailySnapshot(unverified,token);
  await modernHistory.releaseDailySnapshotLock(date,token);
  let recovered=0;
  const bypass=await runCron(daily({dailySnapshotStoreConfigured:()=>true,
    recoverDailySnapshot:async()=>{recovered++;return null;},fetchForeverSnapshot:async()=>{throw Error('Synthetic miss');}}));
  assert.equal(bypass.code,503);
  assert.equal(bypass.value.snapshot.archiveStatus,'failed');
  assert.equal(recovered,1);

  const {FOREVER_CHARACTER_ENDPOINTS}=await load(head,'scripts/blizzard-api.mjs');
  const sparse={snapshotAt:date+'T04:10:00Z',characters:Object.fromEntries(knownProof.roster.map(row=>[
    row.slug,Object.fromEntries(Object.keys(FOREVER_CHARACTER_ENDPOINTS).map(endpoint=>[endpoint,{
      ok:true,status:200,data:endpoint==='profile'?{id:row.id,name:row.slug,level:15}:{unrelatedFixtureField:true}
    }]))
  ]))};
  assert.equal(classifySnapshot(sparse,{expectedRoster:knownProof.roster,date}).status,'complete');
  record('archive-metadata-and-semantic-scope',{noncanonicalIndexedPathRejected:fixturePath,objectVerificationReads:recovered,
    unidentifiedOptionalPayloadSchemaCountedComplete:true});
}
