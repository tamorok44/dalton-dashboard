import assert from 'node:assert/strict';
import {join} from 'node:path';
import {inventoryFor} from './inventory-fixture.mjs';
import {gate} from '../pr116-recheck-177b147/redis-fixture.mjs';

const build='1.60.1.71139';
const prefix='dalton-dashboard:live-knowledge:v1:production:';
const qPrefix='__quarantine:v1:';

export async function runReadEvidenceCases({
  head,reset,redis,record,commands,setBefore,setAfter,setUser,date,oldRoster,observationIndex,
  call,previousAddon,payload,interactions,trainer,crash,writeProof
}){
  const {loadLiveKnowledge,loadLiveKnowledgeVersion,publicLiveKnowledgeSummary}=await import(join(head,'scripts/live-knowledge-store.mjs'));
  const {inspectKnowledgePair,knowledgeQuarantine}=await import(join(head,'scripts/storage-reconciliation.mjs'));
  const {buildLegacyReadProjection}=await import(join(head,'scripts/storage-rollback-projection.mjs'));
  const view=()=>loadLiveKnowledge({build,kind:'trainer'});
  const keyFor=id=>prefix+'record:trainer:'+build+':id-'+id;
  const qFields=()=>redis('HKEYS',observationIndex).filter(key=>key.startsWith(qPrefix));
  const readField=field=>redis('HGET',observationIndex,field);
  const isAppend=cmd=>cmd[0]==='HSETNX'&&cmd[1]===observationIndex;
  const writeCount=()=>commands.filter(cmd=>cmd.type==='HSETNX').length;
  const byOld=(id,offset,price,syncId)=>call(interactions(payload(syncId,offset,[133],'Audit Two'),offset,[trainer(id,offset,price)]),previousAddon);
  const byNew=(id,offset,price,syncId)=>call(interactions(payload(syncId,offset),offset,[trainer(id,offset,price)]));
  async function seed(id){
    const key=keyFor(id);
    assert.equal((await byNew(id,0,11,'modern-read-evidence')).code,200);
    assert.equal((await byOld(id,0,22,'legacy-read-evidence')).code,200);
    const modern=readField(key),legacy=redis('GET',key);
    const inspected=inspectKnowledgePair(modern,legacy,key);
    assert.equal(inspected.reason,'conflicting_record');
    return {key,modern,legacy,q:knowledgeQuarantine(key,modern,legacy,inspected.reason)};
  }
  function requireEvidence(source){
    assert.deepEqual(JSON.parse(readField(source.q.field)),source.q.evidence);
  }

  reset();
  const source=await seed(940);
  const version=await loadLiveKnowledgeVersion();
  let interleaved=false;
  setBefore(async cmd=>{
    if(!interleaved&&isAppend(cmd)){
      interleaved=true;
      assert.equal((await byOld(940,5,31,'old-between-detection-and-evidence')).code,200);
    }
  });
  const reported=await view();
  assert.ok(interleaved);
  assert.deepEqual(reported.integrityIssues,[{key:source.key,reason:'conflicting_record',preserved:true}]);
  requireEvidence(source);
  assert.equal(readField(source.key),source.modern);
  assert.notEqual(redis('GET',source.key),source.legacy);
  assert.notEqual(await loadLiveKnowledgeVersion(),version);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,31);
  assert.deepEqual(qFields(),[source.q.field]);
  record('read-evidence-before-real-legacy-replacement',{originalRawHalvesPreserved:true,legacyWriterHttp:200,activeModernUnchanged:true,newLegacyPrice:31});

  reset();
  const race=await seed(941);
  const both=gate();
  let arrived=0;
  setBefore(async cmd=>{
    if(isAppend(cmd)){
      if(++arrived===2)both.open();
      await both.ready;
    }
  });
  const outcomes=await Promise.all([view(),view()]);
  assert.deepEqual(outcomes.map(rows=>rows.integrityIssues[0].preserved),[true,true]);
  assert.equal(arrived,2);
  requireEvidence(race);
  assert.equal(qFields().length,1);
  assert.equal((await view()).integrityIssues[0].preserved,true);
  assert.equal(writeCount(),2);
  record('read-evidence-concurrent-dedup',{concurrentHsetnx:2,uniqueFields:1,repeatedReadWrites:0,exactEvidence:true});

  reset();
  const refused=await seed(942);
  assert.equal((await byNew(943,3,17,'unaffected-observation')).code,200);
  redis('ACL','SETUSER','audit-reader-denied','on','>audit-fixture-only','~*','+@all','-hsetnx');
  try{
    setUser('audit-reader-denied');
    const denied=await view();
    assert.equal(denied.integrityIssues[0].preserved,false);
    assert.equal(publicLiveKnowledgeSummary(denied).unpreservedIntegrityRecords,1);
    assert.equal(denied[0].latestSnapshot.entries[0].priceCopper,17);
    assert.equal(qFields().length,0);
  }finally{
    setUser(null);
    redis('ACL','DELUSER','audit-reader-denied');
  }
  setAfter(async cmd=>{
    if(isAppend(cmd))throw Error('Synthetic response loss after server commit');
  });
  assert.equal((await view()).integrityIssues[0].preserved,false);
  requireEvidence(refused);
  setAfter(async()=>{});
  const beforeRetry=writeCount();
  assert.equal((await view()).integrityIssues[0].preserved,true);
  assert.equal(writeCount(),beforeRetry);
  record('read-evidence-acl-and-lost-response',{aclDenialVisible:true,unrelatedPrice:17,lostResponseReportedConservatively:true,retryFindsExactEvidence:true});

  for(const phase of ['read-before-quarantine','read-after-quarantine']){
    reset();
    const interrupted=await seed(944);
    await crash(phase);
    const committed=phase==='read-after-quarantine';
    assert.equal(qFields().length,committed?1:0);
    assert.equal((await byOld(944,8,48,'legacy-after-read-death')).code,200);
    assert.notEqual(redis('GET',interrupted.key),interrupted.legacy);
    assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,48);
    assert.equal(qFields().length,committed?1:0);
    if(committed)requireEvidence(interrupted);
    record(phase,{signal:'SIGKILL',evidenceCommitted:committed,exactOriginalPresentAfterLegacyReplacement:committed,
      reproducedLossBeforeFirstDurableWrite:!committed});
  }

  for(const scenario of ['damaged-existing','stale-field-list','nonmatching-concurrent-write']){
    reset();
    const damaged=await seed(945);
    const wrongValue=JSON.stringify({schema:1,key:damaged.key,modernRaw:null,legacyRaw:null,incoming:null,reason:'invalid_record'});
    if(scenario==='damaged-existing'||scenario==='stale-field-list')redis('HSET',observationIndex,damaged.q.field,wrongValue);
    if(scenario==='stale-field-list')setAfter(async(cmd,result)=>{
      if(cmd[0]==='HKEYS'&&result.includes(damaged.q.field))redis('HDEL',observationIndex,damaged.q.field);
    });
    if(scenario==='nonmatching-concurrent-write')setBefore(async cmd=>{
      if(isAppend(cmd))redis('HSET',observationIndex,damaged.q.field,wrongValue);
    });
    const damagedView=await view();
    assert.equal(damagedView.integrityIssues[0].preserved,true);
    assert.equal(publicLiveKnowledgeSummary(damagedView).unpreservedIntegrityRecords,0);
    assert.equal(readField(damaged.q.field),scenario==='stale-field-list'?null:wrongValue);
    assert.notEqual(readField(damaged.q.field),JSON.stringify(damaged.q.evidence));
    assert.equal((await byOld(945,5,33,'legacy-after-unverified-evidence')).code,200);
    assert.notEqual(redis('GET',damaged.key),damaged.legacy);
    record('read-evidence-false-preserved-'+scenario,{reportedPreserved:true,matchingRawEvidencePresent:false,
      legacyRawLaterReplaced:true,hsetnxAttempts:writeCount(),findingConfirmed:true});
  }

  reset();
  const separateVersions=await seed(949);
  const trainerRecord=JSON.parse(separateVersions.modern);
  const wrongSnapshot={...trainerRecord,latestSnapshot:{...trainerRecord.latestSnapshot,npc:{id:999,name:'Wrong NPC'}}};
  redis('HSET',observationIndex,separateVersions.key,JSON.stringify(wrongSnapshot));
  const merchantKey=prefix+'record:merchant:'+build+':id-953:observer:audit-one';
  const merchantRecord={...trainerRecord,kind:'merchant',npc:{id:953,name:'Audit Vendor'},characterSlug:'audit-one',
    latestSnapshot:{...trainerRecord.latestSnapshot,kind:'merchant',npc:{id:953,name:'Audit Vendor'},characterSlug:'audit-two'}};
  redis('HSET',observationIndex,merchantKey,JSON.stringify(merchantRecord));
  const identityIssues=(await loadLiveKnowledge({build})).integrityIssues;
  assert.equal(identityIssues.length,2);
  for(const key of [separateVersions.key,merchantKey]){
    assert.deepEqual(identityIssues.find(issue=>issue.key===key),{key,reason:'invalid_record',preserved:true});
  }
  assert.equal(qFields().length,2);
  record('read-evidence-snapshot-and-merchant-observer-identity',{keyNpcMatchesRecordButNotSnapshotExcluded:true,
    merchantObserverMismatchExcluded:true,bothPairsPreserved:true});

  reset();
  const typedKey=keyFor(946);
  assert.equal((await byNew(946,0,10,'before-wrong-type')).code,200);
  assert.ok(!redis('SMEMBERS',prefix+'index').includes(typedKey));
  assert.equal(redis('LPUSH',typedKey,'synthetic legacy debris'),1);
  assert.equal(redis('TYPE',typedKey),'list');
  assert.deepEqual(redis('MGET',typedKey),[null]);
  const typedView=await view();
  assert.equal(typedView[0].latestSnapshot.entries[0].priceCopper,10);
  assert.deepEqual(typedView.integrityIssues,[]);
  assert.equal((await byNew(946,5,21,'wrong-type-next-sync')).code,503);
  const state=JSON.parse(redis('GET','dalton-dashboard:addon-sync:v1:production:audit-one'));
  assert.equal(state.pendingObservations,true);
  assert.equal((await byNew(946,5,21,'wrong-type-next-sync')).code,503);
  record('read-evidence-unindexed-wrong-physical-type',{physicalType:'list',mget:[null],priceStillVisible:10,
    reportedIntegrityIssues:0,nextSyncHttp:503,outboxStillPending:true,repeatHttp:503,findingConfirmed:true});

  reset();
  const damagedKey=keyFor(947);
  const modernRaw='{"malformed":',legacyRaw='{"latestSnapshot":{"capturedAt":"unknown"},"lastObservedAt":"unknown"}';
  redis('HSET',observationIndex,damagedKey,modernRaw);
  redis('SET',damagedKey,legacyRaw);
  const ambiguous=inspectKnowledgePair(modernRaw,legacyRaw,damagedKey);
  assert.equal(ambiguous.reason,'invalid_record');
  assert.equal(ambiguous.latestTime,-Infinity);
  assert.equal((await view()).integrityIssues[0].preserved,true);
  const olderReplay=await byNew(947,-120,19,'older-capture-after-unknown-clock');
  assert.equal(olderReplay.code,200);
  assert.equal(olderReplay.value.liveKnowledge.repaired,1);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,19);
  assert.equal(qFields().length,2);
  record('read-evidence-repair-without-comparable-timestamps',{usablePriorTimestamps:0,oldCaptureAcceptedAsRepair:true,
    rawStillInQuarantine:true,orderingProved:false,findingConfirmed:true});

  reset();
  const proof=await writeProof();
  const bundle={roster:oldRoster,addonStates:[],knowledgePairs:[],dailyRows:[],quarantineRecords:[],date,
    modernReceipt:proof,legacyReceipt:null,petMetadata:{checkedAt:date+'T04:00:00Z',overall:'synthetic-a'}};
  const inventory=inventoryFor(bundle);
  const original=buildLegacyReadProjection({...bundle,inventory});
  const changedProof={...proof,generatedAt:date+'T04:45:00Z'};
  const changedPet={...bundle.petMetadata,overall:'synthetic-b'};
  const modified=buildLegacyReadProjection({...bundle,inventory,modernReceipt:null,legacyReceipt:changedProof,petMetadata:changedPet});
  const changedScope=buildLegacyReadProjection({...bundle,inventory,scope:'preview',date:'2026-11-25'});
  const metadata=projection=>projection.commands.find(cmd=>cmd[0]==='HSET'&&cmd.includes('pet'));
  const valueOf=(projection,field)=>{
    const hset=metadata(projection),index=hset.indexOf(field);
    return index<0?null:JSON.parse(hset[index+1]);
  };
  assert.deepEqual(valueOf(original,'daily-profile-refresh'),proof);
  assert.deepEqual(valueOf(modified,'daily-profile-refresh'),changedProof);
  assert.deepEqual(valueOf(modified,'pet'),changedPet);
  assert.equal(valueOf(changedScope,'daily-profile-refresh'),null);
  assert.equal(changedScope.manifest.scope,'preview');
  for(const projection of [original,modified,changedScope]){
    assert.equal(projection.manifest.inventoryVerified,true);
    assert.equal(projection.manifest.completeForLegacyReaders,true);
  }
  assert.notEqual(original.manifest.sha256,modified.manifest.sha256);
  record('restore-inventory-unbound-projection-inputs',{sameInventoryAcceptsChangedPet:true,sameInventoryAcceptsChangedReceiptValuesAndOrigin:true,
    sameInventoryAcceptsDifferentDateAndScope:true,inventoryAndLegacyCompletenessFlagsRemainTrue:true,findingConfirmed:true});

  reset();
  const repaired=await seed(948);
  assert.equal((await byNew(948,10,61,'repair-source-with-receipt')).value.liveKnowledge.repaired,1);
  const active=readField(repaired.key);
  const reference=JSON.parse(active).migrationRepair.quarantineDigest;
  assert.ok(readField(qPrefix+reference));
  redis('HDEL',observationIndex,qPrefix+reference);
  const omitted={roster:oldRoster,addonStates:[],knowledgePairs:[{key:repaired.key,modern:active,legacy:repaired.legacy}],
    dailyRows:[],quarantineRecords:[],date};
  const restoreWithoutEvidence=buildLegacyReadProjection({...omitted,inventory:inventoryFor(omitted)});
  assert.equal(restoreWithoutEvidence.manifest.inventoryVerified,true);
  assert.equal(restoreWithoutEvidence.manifest.completeForLegacyReaders,true);
  assert.equal(restoreWithoutEvidence.manifest.observations,1);
  const missing=(await view())[0];
  assert.equal(missing.latestSnapshot.entries[0].priceCopper,61);
  record('restore-repair-marker-without-referenced-evidence',{missingReferencedQuarantineAccepted:true,activePrice:61,
    inventoryVerified:true,completeForLegacyReaders:true,findingConfirmed:true});

  reset();
  for(let id=960;id<972;id++){
    const fromModern=await byNew(id,id-960,11,'many-modern-'+id);
    const fromLegacy=await byOld(id,id-960,22,'many-legacy-'+id);
    assert.deepEqual([fromModern.code,fromLegacy.code],[200,200]);
  }
  commands.length=0;
  const beforeMark=await loadLiveKnowledgeVersion();
  commands.length=0;
  const initial=await view();
  const initialCommands=commands.length,initialWrites=writeCount();
  const appendBytes=commands.filter(cmd=>cmd.type==='HSETNX').reduce((sum,cmd)=>sum+cmd.bytes,0);
  assert.equal(initial.integrityIssues.length,12);
  assert.equal(initialWrites,12);
  assert.equal(qFields().length,12);
  assert.equal(await loadLiveKnowledgeVersion(),beforeMark);
  commands.length=0;
  assert.equal((await view()).integrityIssues.length,12);
  assert.equal(writeCount(),0);
  record('read-evidence-command-amplification',{conflicts:12,firstReadCommands:initialCommands,appendWrites:initialWrites,
    appendRequestBytes:appendBytes,repeatReadCommands:commands.length,repeatAppendWrites:0,priceVersionUnchanged:true});
}
