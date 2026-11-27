import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {gate} from './redis-fixture.mjs';

export async function runMigrationCases({
  base,previous,head,reset,daily,runCron,writeProof,record,redis,commands,setBefore,setAfter,setUser,restart,date,
  oldRoster,rosterIds,characters,status,version,legacyVersion,dailyIndex,dailyLast,dailyLastField,refreshLock,
  observationIndex,observations,getStatus,call,previousAddon,payload,interactions,trainer,snapshotCore,validNow,crash,expire
}){
  const load=(tree,file)=>import(join(tree,file));
  const modernVersion=await load(head,'scripts/data-version.mjs');
  const oldVersion=await load(previous,'scripts/data-version.mjs');
  const baselineVersion=await load(base,'scripts/data-version.mjs');
  const modernKnowledge=await load(head,'scripts/live-knowledge-store.mjs');
  const oldKnowledge=await load(previous,'scripts/live-knowledge-store.mjs');
  const baselineKnowledge=await load(base,'scripts/live-knowledge-store.mjs');
  const modernHistory=await load(head,'scripts/history-store.mjs');
  const oldHistory=await load(previous,'scripts/history-store.mjs');
  const modernStore=await load(head,'scripts/character-store.mjs');
  const addonStore=await load(head,'scripts/addon-sync-store.mjs');
  const {normalizeAddonSyncPayload,buildSafeAddonSyncPayload}=await load(head,'scripts/addon-sync.mjs');
  const {parseLuaSavedVariable}=await load(head,'scripts/savedvariables-parser.mjs');
  const json=(...command)=>JSON.parse(redis(...command)??'null');
  const observationCmd=cmd=>cmd[0]==='EVAL'&&cmd[3]===observationIndex;
  const addonCmd=cmd=>cmd[0]==='EVAL'&&cmd[3]?.includes(':addon-sync:');

  reset();
  redis('HSET',legacyVersion,'pet','null');
  const oldPayload=interactions(payload('legacy-known'),0,[trainer(710,0,10)]);
  assert.equal((await call(oldPayload,previousAddon)).code,200);
  const legacySignature=await oldVersion.loadCurrentDataVersion();
  const modernReadsLegacy=await modernVersion.loadCurrentDataVersion();
  assert.deepEqual(modernReadsLegacy,legacySignature);
  assert.equal((await modernKnowledge.loadLiveKnowledge()).length,1);
  assert.equal(redis('GET',version),null);
  await wait(3);
  const newPayload=interactions(payload('forward-new',2,[133,143]),2,[trainer(710,2,20),trainer(711,2,22)]);
  assert.equal((await call(newPayload)).code,200);
  const aheadSignature=await modernVersion.loadCurrentDataVersion();
  assert.notEqual(aheadSignature.generatedAt,legacySignature.generatedAt);
  assert.match(aheadSignature.addonSyncVersion,/forward-new/);
  const oldReader=await oldVersion.loadCurrentDataVersion();
  assert.equal(oldReader.generatedAt,legacySignature.generatedAt);
  assert.match(oldReader.addonSyncVersion,/legacy-known/);
  assert.equal((await oldKnowledge.loadLiveKnowledge()).length,1);
  assert.deepEqual(await baselineVersion.loadCurrentDataVersion(),oldReader);
  assert.equal((await baselineKnowledge.loadLiveKnowledge()).length,1);
  assert.equal((await modernKnowledge.loadLiveKnowledge()).length,2);
  assert.equal((await addonStore.loadAddonSyncState('audit-one')).payload.syncId,'forward-new');

  await wait(3);
  const rollback=interactions(payload('rollback-write',4,[133]),4,[trainer(710,4,30)]);
  assert.equal((await call(rollback,previousAddon)).code,200);
  const recordedByOld=await oldVersion.loadCurrentDataVersion();
  const staleAfterForward=await modernVersion.loadCurrentDataVersion();
  const preferred=await modernKnowledge.loadLiveKnowledge();
  const oldObservations=await oldKnowledge.loadLiveKnowledge();
  assert.match(recordedByOld.addonSyncVersion,/rollback-write/);
  assert.notEqual(recordedByOld.generatedAt,aheadSignature.generatedAt);
  assert.equal(staleAfterForward.generatedAt,recordedByOld.generatedAt);
  assert.match(staleAfterForward.addonSyncVersion,/rollback-write/);
  assert.equal(getStatus().payload.syncId,'rollback-write');
  assert.equal(preferred.find(row=>row.npc.id===710).latestSnapshot.entries[0].priceCopper,30);
  assert.equal(oldObservations.find(row=>row.npc.id===710).latestSnapshot.entries[0].priceCopper,30);
  assert.equal(preferred.length,2);
  assert.equal(redis('SAVE'),'OK');
  await restart();
  assert.deepEqual(await modernVersion.loadCurrentDataVersion(),staleAfterForward);
  assert.equal(getStatus().payload.syncId,'rollback-write');
  record('rollback-and-rollforward-stale',{freshMigrationReadsLegacy:true,oldReaderMissesNewVersion:true,
    oldReaderMissesModernOnlyObservations:true,baselineReaderAlsoStale:true,forwardReaderUsesInterveningOldWrites:true,
    reconciledPrice:30,reconciliationSurvivedLocalRdbRestart:true});

  reset();
  const register=async(store,day)=>{
    const token=await store.acquireDailySnapshotLock(day);
    await store.registerDailySnapshot({date:day,archiveStatus:'disabled'},token);
    await store.releaseDailySnapshotLock(day,token);
  };
  await register(oldHistory,'2026-11-25');
  assert.equal((await modernHistory.getLastDailySnapshot()).date,'2026-11-25');
  await register(modernHistory,date);
  assert.equal((await modernHistory.getLastDailySnapshot()).date,date);
  assert.equal(json('GET',dailyLast).date,'2026-11-25');
  assert.equal((await oldHistory.getDailySnapshot(date)).date,date);
  await register(oldHistory,'2026-11-27');
  assert.equal(json('GET',dailyLast).date,'2026-11-27');
  assert.equal((await modernHistory.getLastDailySnapshot()).date,'2026-11-27');
  assert.equal(json('HGET',dailyIndex,dailyLastField).date,date);
  record('rollback-daily-pointer',{legacyFallbackWorksBeforeMigration:true,legacyDayRowsStillReadable:true,
    legacyPointerLagsForwardWrites:true,newReaderSelectsNewerRollbackDate:true});

  reset();
  redis('HSET',legacyVersion,'pet','null');
  assert.equal((await call(payload('compact-cost'),previousAddon)).code,200);
  await oldVersion.loadCurrentDataVersion();
  commands.length=0;
  await oldVersion.loadCurrentDataVersion();
  const oldReads=commands.map(command=>command.type);
  const oldBytes=commands.reduce((total,command)=>total+command.bytes,0);
  assert.equal((await call(interactions(payload('modern-cost',1,[133,143]),1,[trainer(713,1)]))).code,200);
  commands.length=0;
  await modernVersion.loadCurrentDataVersion();
  const modernReads=commands.map(command=>command.type);
  assert.equal(commands.some(command=>command.key===characters||command.key===status()),false);
  assert.equal(oldReads.length,2);
  assert.equal(modernReads.length,4);
  assert.ok(modernReads.includes('HGETALL')&&modernReads.includes('MGET')&&modernReads.includes('HGET')&&modernReads.includes('GET'));
  record('compact-version-warm-poll',{previousRestCommands:oldReads,currentRestCommands:modernReads,
    previousRequestJsonBytes:oldBytes,currentRequestJsonBytes:commands.reduce((total,command)=>total+command.bytes,0),
    fullRosterOrSyncPayloadReads:0,currentCompactResponseBytes:Buffer.byteLength(redis('GET',version))});

  reset();
  const newRow='dalton-dashboard:live-knowledge:v1:production:record:trainer:1.60.1.71139:id-800';
  redis('HSET',observationIndex,newRow,JSON.stringify({kind:'trainer',build:'1.60.1.71139',npc:{id:800}}));
  // A small fixture illustrates that both discovery operations return other builds' key names.
  const foreign=Array.from({length:256},(_,i)=>'dalton-dashboard:live-knowledge:v1:production:record:trainer:unrelated-build:id-'+(1000+i));
  redis('HSET',observationIndex,...foreign.slice(0,192).flatMap(key=>[key,'{}']));
  redis('SADD','dalton-dashboard:live-knowledge:v1:production:index',...foreign.slice(192));
  commands.length=0;
  const selected=await modernKnowledge.loadLiveKnowledge({build:'1.60.1.71139',kind:'trainer'});
  assert.equal(selected.length,1);
  const allLabels=[...redis('HKEYS',observationIndex),...redis('SMEMBERS','dalton-dashboard:live-knowledge:v1:production:index')];
  assert.equal(allLabels.length,257);
  assert.deepEqual(commands.map(command=>command.type),['SMEMBERS','HKEYS','HMGET']);
  record('observation-discovery-budget',{matchingBodiesRead:1,otherBuildKeyNamesReturned:256,
    indexLabelJsonBytes:Buffer.byteLength(JSON.stringify(allLabels)),commands:commands.map(cmd=>cmd.type)});

  reset();
  redis('SET',version,'not-compact-json');
  const invalid=snapshotCore();
  assert.equal((await call(payload('invalid-compact'))).code,503);
  assert.deepEqual(snapshotCore(),invalid);
  const token='limited-command-owner';
  redis('DEL',version);
  redis('SET',refreshLock,token,'EX',120);
  redis('ACL','SETUSER','minimal-fixture','on','>audit-fixture-only','~*','+eval','+type','+get','+mset');
  try{
    setUser('minimal-fixture');
    const restricted=await addonStore.saveAddonSyncState('audit-one',normalizeAddonSyncPayload(payload('minimal-mset')),
      {lockToken:token,roster:oldRoster});
    assert.equal(restricted.payload.syncId,'minimal-mset');
  }finally{
    setUser(null);redis('ACL','DELUSER','minimal-fixture');redis('DEL',refreshLock);
  }
  const identity=rosterIds(oldRoster);
  const data={...oldRoster,generatedAt:date+'T04:10:00Z'};
  const principle={date,roster:identity,source:'daily',total:2,success:2,persisted:true,generatedAt:data.generatedAt};
  const profileToken='fixture-profile-owner';
  redis('SET',refreshLock,profileToken,'EX',120);
  const priorCore=snapshotCore();
  redis('ACL','SETUSER','denied-profile','on','>audit-fixture-only','~*','+@all','-mset');
  try{
    setUser('denied-profile');
    await assert.rejects(modernStore.saveCharacters(data,profileToken,{dailyReceipt:principle}),/ACL|permission|can't run this command/i);
    assert.deepEqual(snapshotCore(),priorCore);
  }finally{
    setUser(null);redis('ACL','DELUSER','denied-profile');redis('DEL',refreshLock);
  }
  record('profile-mset-redis-restrictions',{corruptJsonMutations:0,minimalCommandAllowlistWorks:true,
    deniedProfileMsetMutationCount:0});

  reset();
  const memoryOwner='local-out-of-memory-owner';
  redis('SET',refreshLock,memoryOwner,'EX',120);
  const indexOwner=await modernHistory.acquireDailySnapshotLock(date);
  const unchanged=snapshotCore();
  const beforeDaily=redis('HGETALL',dailyIndex);
  redis('CONFIG','SET','maxmemory-policy','noeviction');
  redis('CONFIG','SET','maxmemory','1');
  try{
    await assert.rejects(addonStore.saveAddonSyncState('audit-one',normalizeAddonSyncPayload(payload('fixture-memory')),
      {lockToken:memoryOwner,roster:oldRoster}),/OOM|maxmemory/i);
    await assert.rejects(modernHistory.registerDailySnapshot({date,archiveStatus:'disabled'},indexOwner),/OOM|maxmemory/i);
    assert.deepEqual(snapshotCore(),unchanged);
    assert.deepEqual(redis('HGETALL',dailyIndex),beforeDaily);
  }finally{
    redis('CONFIG','SET','maxmemory','0');
    redis('DEL',refreshLock);
    await modernHistory.releaseDailySnapshotLock(date,indexOwner);
  }
  record('local-noeviction-limit',{msetRejected:true,hsetRejected:true,coreAndIndexUnchanged:true});

  reset();
  redis('ACL','SETUSER','observe-denied','on','>audit-fixture-only','~*','+@all','-hset');
  try{
    setUser('observe-denied');
    assert.equal((await call(interactions(payload('pending-outage'),0,[trainer(714,0)]))).code,503);
    assert.equal(getStatus().pendingObservations,true);
    assert.equal(observations().length,0);
    assert.equal(redis('HGET',observationIndex,'__version:v2'),null);
    assert.equal((await call(payload('cannot-drain',1,[133,143]))).code,503);
    assert.equal(getStatus().payload.syncId,'pending-outage');
  }finally{setUser(null);redis('ACL','DELUSER','observe-denied');}
  assert.equal((await call(payload('later-succeeds',2,[133,143]))).code,200);
  assert.equal(observations().length,1);
  assert.equal(getStatus().pendingObservations,false);
  record('observation-hset-denied-pending',{coreSaved:true,deniedRecordAndVersionMutations:0,newSync503UntilDrainWorks:true,
    afterPermissionRestored:200});

  reset();
  let lostFinalAck=true;
  setBefore(async cmd=>{
    if(lostFinalAck&&addonCmd(cmd)&&cmd[7]?.includes('"pendingObservations":false')){
      lostFinalAck=false;throw Error('Fixture failure before pending-clear MSET');
    }
  });
  const ack=interactions(payload('ack-observation'),0,[trainer(715,0)]);
  assert.equal((await call(ack)).code,503);
  assert.equal(getStatus().pendingObservations,true);
  assert.equal(observations().length,1);
  assert.equal((await call(ack)).value.duplicate,true);
  assert.equal(getStatus().pendingObservations,false);
  assert.equal(json('HGET',observationIndex,observations()[0]).observationCount,1);
  record('observation-ack-failure',{recordWrittenBeforeAck:true,retryIdempotent:true});

  for(const phase of ['addon-before-observation','addon-after-observation']){
    reset();
    await crash(phase,interactions(payload('observation-process-abort'),0,[trainer(720,0)]));
    assert.equal(getStatus().pendingObservations,true);
    const countAtCrash=observations().length;
    assert.equal(countAtCrash,phase.endsWith('after-observation')?1:0);
    await expire(refreshLock);
    assert.equal((await call(payload('next-after-crash',2,[133,143]))).code,200);
    assert.equal(getStatus().pendingObservations,false);
    assert.equal(json('HGET',observationIndex,observations()[0]).observationCount,1);
    record(phase,{signal:'SIGKILL',countAtCrash,countAfterRetry:1,laterSyncAccepted:true});
  }

  reset();
  process.env.VERCEL_ENV='preview';
  const observed=gate(),allowReturn=gate();
  let heldObservation=true;
  setAfter(async (cmd,result)=>{
    if(heldObservation&&cmd[0]==='EVAL'&&cmd[3]==='dalton-dashboard:live-knowledge:v1:preview:records:v2'){
      assert.equal(result,'OK');
      heldObservation=false;observed.open();await allowReturn.ready;
    }
  });
  try{
    const delayed=call(interactions(payload('preview-earlier'),0,[trainer(716,0)]));
    await observed.ready;
    const previewLock=refreshLock+':preview-addon';
    assert.ok(redis('GET',previewLock));
    const waiting=await call(payload('preview-later',2,[133,143]));
    assert.equal(waiting.code,409);
    allowReturn.open();
    assert.equal((await delayed).code,200);
    const newer=await call(payload('preview-later',2,[133,143]));
    assert.equal(newer.code,200);
    const final=json('GET',status('audit-one','preview'));
    assert.equal(final.payload.syncId,'preview-later');
    assert.ok(final.receipts.some(receipt=>receipt.id==='preview-later'));
    assert.equal(getStatus(),null);
    assert.equal(redis('GET',previewLock),null);
    record('preview-outbox-clear-overwrites-success',{earlier:200,concurrent:409,laterRetry:200,finalSync:'preview-later',
      laterReceiptLost:false,productionUntouched:true});
  }finally{allowReturn.open();process.env.VERCEL_ENV='production';}

  reset();
  const vars=parseLuaSavedVariable(readFileSync(join(head,'scripts/fixtures/bridge-savedvariables.lua'),'utf8'));
  vars.character.name='Audit One';vars.character.level=12;
  for(const name of ['character','spellbook','location'])vars[name].capturedAt=validNow;
  const historic=buildSafeAddonSyncPayload(vars,{syncId:'historical-prior'});
  assert.equal((await call(historic)).code,200);
  const second=structuredClone(historic);
  second.syncId='historical-updated';second.sections.character.level=13;
  second.sections.character.capturedAt++;
  delete second.sections.spellbook;
  second.sections.locationHistory.entries.push({zone:'Synthetischer Ort'});
  const accepted=await call(second);
  assert.equal(accepted.code,200);
  assert.deepEqual(accepted.value.ignoredSections,[{section:'locationHistory',reason:'legacy_capture_time_missing'}]);
  assert.equal(getStatus().payload.syncId,'historical-updated');
  assert.equal(getStatus().payload.sections.character.level,13);
  assert.deepEqual(getStatus().payload.sections.locationHistory,historic.sections.locationHistory);
  assert.deepEqual((await call(second)).value.ignoredSections,accepted.value.ignoredSections);
  record('legacy-changed-untimed-rejects-whole-sync',{firstImport:200,subsequentLegitimateUntimedChange:200,
    newerTimestampedCharacterSectionRetained:true,untimedSectionKeptAndReported:true});

  reset();
  assert.equal((await call(interactions(payload('existing-observations'),0,[trainer(717,-2),trainer(718,-1),trainer(719,0)]))).code,200);
  commands.length=0;
  assert.equal((await call(payload('omit-interactions',2,[133,143]))).code,200);
  const inheritedReads=commands.filter(command=>command.type==='HGET'&&command.key===observationIndex).length;
  const rewrites=commands.filter(command=>command.type==='EVAL'&&command.key===status()).length;
  assert.equal(inheritedReads,0);
  assert.equal(rewrites,1);
  assert.equal(observations().length,3);
  record('outbox-inherited-observation-cost',{requestIncludesObservations:false,inheritedRecordReads:inheritedReads,
    coreStateCommits:rewrites,existingObservations:3});

  reset();
  const first=await runCron(daily({refreshDailyCharacters:writeProof}));
  assert.equal(first.code,200);
  const supportedProof=await modernStore.loadDailyProfileReceipt(date);
  redis('DEL',version);
  redis('HSET',legacyVersion,'daily-profile-refresh',JSON.stringify(supportedProof));
  assert.deepEqual(await modernStore.loadDailyProfileReceipt(date),supportedProof);
  const cached=await runCron(daily());
  assert.equal(cached.value.reason,'already_completed');
  record('daily-receipt-legacy-location',{newLoaderReadsOldHash:true,completedDayIndexStillRecognized:true,
    validLegacyReceiptCanResumeBeforeDayIndex:true});
}
