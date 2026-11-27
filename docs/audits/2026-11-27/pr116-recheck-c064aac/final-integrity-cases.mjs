import assert from 'node:assert/strict';
import {join} from 'node:path';
import {explicitInputs,inventoryFor} from '../pr116-recheck-26c1b74/inventory-fixture.mjs';
import {requireLegacyGate} from './migration-gate.mjs';
import {gate,redisCommand,withRedis} from '../pr116-recheck-177b147/redis-fixture.mjs';

const prefix='dalton-dashboard:live-knowledge:v1:production:';
const build='1.60.1.71139';
const qPrefix='__quarantine:v1:';
const statusKey='dalton-dashboard:addon-sync:v1:production:audit-one';

export async function runFinalIntegrityCases({
  head,reset,redis,record,commands,setBefore,setAfter,setUser,useRedisSocket,date,oldRoster,observationIndex,
  call,previousAddon,payload,interactions,trainer,crash,expire,refreshLock,restart,
}){
  const {loadLiveKnowledge,snapshotsFromAddonPayload}=await import(join(head,'scripts/live-knowledge-store.mjs'));
  const {buildLegacyReadProjection}=await import(join(head,'scripts/storage-rollback-projection.mjs'));
  const {knowledgeQuarantine,inspectKnowledgePair}=await import(join(head,'scripts/storage-reconciliation.mjs'));
  const {normalizeAddonSyncPayload}=await import(join(head,'scripts/addon-sync.mjs'));
  const view=()=>loadLiveKnowledge({build,kind:'trainer'});
  const keyFor=id=>prefix+'record:trainer:'+build+':id-'+id;
  const fieldValue=field=>redis('HGET',observationIndex,field);
  const state=()=>JSON.parse(redis('GET',statusKey));
  const request=(id,offset,price,syncId)=>interactions(payload(syncId,offset),offset,[trainer(id,offset,price)]);
  const byNew=(id,offset,price,syncId)=>call(request(id,offset,price,syncId));
  const incomingOf=body=>snapshotsFromAddonPayload(normalizeAddonSyncPayload(body),{characterSlug:'audit-one'})[0];
  const fields=()=>redis('HKEYS',observationIndex).filter(field=>field.startsWith(qPrefix));
  const byOld=(id,offset,price,syncId)=>call(interactions(payload(syncId,offset,[133],'Audit Two'),offset,[trainer(id,offset,price)]),previousAddon);
  const isCommit=cmd=>cmd[0]==='EVAL'&&cmd[3]===observationIndex;
  const isProofRead=cmd=>cmd[0]==='HGET'&&String(cmd[2]).startsWith(qPrefix);
  const restoreInput=(knowledgePairs,quarantineRecords=[])=>explicitInputs({roster:oldRoster,addonStates:[],dailyRows:[],date,knowledgePairs,quarantineRecords});
  const project=input=>buildLegacyReadProjection({...input,inventory:inventoryFor(input)});

  async function seed(id){
    assert.equal((await byNew(id,0,11,'new-for-'+id)).code,200);
    assert.equal((await byOld(id,0,22,'old-for-'+id)).code,200);
    return keyFor(id);
  }
  async function repaired(id){
    const key=await seed(id);
    const legacy=redis('GET',key);
    const reply=await byNew(id,10,31,'repaired-'+id);
    assert.equal(reply.code,200);
    assert.equal(reply.value.liveKnowledge.repaired,1);
    const modern=fieldValue(key),marker=JSON.parse(modern).migrationRepair;
    const field=qPrefix+marker.quarantineDigest;
    const raw=fieldValue(field);
    assert.ok(raw);
    return {key,legacy,modern,marker,field,raw};
  }

  reset();
  const repair=await repaired(980);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,31);
  const referenceMutations=[
    {...repair.marker,legacyDigest:'0'.repeat(64)},
    {...repair.marker,resolvedAt:'2001-01-01T00:00:00Z'},
    {...repair.marker,quarantineDigest:'0'.repeat(64)},
  ];
  for(const migrationRepair of referenceMutations){
    const modern=JSON.stringify({...JSON.parse(repair.modern),migrationRepair});
    redis('HSET',observationIndex,repair.key,modern);
    assert.equal((await view()).integrityIssues[0].reason,'missing_repair_evidence');
    assert.throws(()=>project(restoreInput([{key:repair.key,modern,legacy:repair.legacy}],[repair])),/Referenzierter Quarantänebeleg/);
  }
  redis('HSET',observationIndex,repair.key,repair.modern,repair.field,repair.raw+' ');
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,31);
  const forensic=project(restoreInput([{key:repair.key,modern:repair.modern,legacy:repair.legacy}],
    [{field:repair.field,raw:repair.raw+' '}]));
  assert.equal(forensic.manifest.completeForLegacyReaders,false);
  assert.throws(()=>requireLegacyGate(forensic),/Rollback-Sperre/);
  requireLegacyGate(project(restoreInput([])));
  const evidence=JSON.parse(repair.raw);
  const mismatched=knowledgeQuarantine(keyFor(981),evidence.modernRaw,evidence.legacyRaw,evidence.reason,evidence.incoming);
  const wrongKeyMarker={...repair.marker,quarantineDigest:mismatched.digest};
  const mismatchedModern=JSON.stringify({...JSON.parse(repair.modern),migrationRepair:wrongKeyMarker});
  redis('HSET',observationIndex,repair.key,mismatchedModern,mismatched.field,JSON.stringify(mismatched.evidence));
  assert.equal((await view()).integrityIssues[0].reason,'missing_repair_evidence');
  assert.throws(()=>project(restoreInput([{key:repair.key,modern:mismatchedModern,legacy:repair.legacy}],
    [{field:mismatched.field,raw:JSON.stringify(mismatched.evidence)}])),/Referenzierter Quarantänebeleg/);
  record('repair-reference-positive-and-negative-matrix',{keyBound:true,legacyDigestBound:true,captureTimeBound:true,
    missingOrWrongFieldDigestRejected:true,identicalParsedEvidenceWithDifferentWhitespaceAccepted:true,
    legacyActivationFlagFalseWithQuarantine:true,auditGateBlocksRealIncompleteProjection:true});

  reset();
  const badReference=await repaired(982);
  redis('HDEL',observationIndex,badReference.key,badReference.field);
  redis('SET',badReference.key,badReference.modern);
  redis('SADD',prefix+'index',badReference.key);
  const legacyOnly=await view();
  assert.equal(legacyOnly.length,0);
  assert.equal(legacyOnly.integrityIssues[0].reason,'missing_repair_evidence');
  assert.throws(()=>project(restoreInput([{key:badReference.key,modern:null,legacy:badReference.modern}])),/Referenzierter Quarantänebeleg/);
  record('legacy-half-repair-reference-skipped-at-runtime',{legacyPriceExcluded:true,runtimeIntegrityWarnings:1,
    offlineProjectionRejectsSameReference:true,priorFindingFixed:true});

  reset();
  const stuck=await seed(983);
  const beforeModern=fieldValue(stuck);
  let refusedField;
  setBefore(async cmd=>{
    if(!refusedField&&isCommit(cmd)&&String(cmd[14]).startsWith(qPrefix)){
      refusedField=cmd[14];
      redis('HSET',observationIndex,refusedField,'{"synthetic":"invalid existing evidence"}');
    }
  });
  const older=await byNew(983,-1,33,'evidence-collision');
  // A lower character timestamp would be rejected before observation handling.
  assert.equal(older.code,409);
  assert.equal(refusedField,undefined);
  const candidate=await byNew(983,10,33,'evidence-collision-new');
  assert.equal(candidate.code,200);
  assert.ok(refusedField);
  assert.equal(candidate.value.liveKnowledge.repaired,1);
  assert.notEqual(fieldValue(stuck),beforeModern);
  const marker=JSON.parse(fieldValue(stuck)).migrationRepair;
  const alternate=JSON.parse(fieldValue(qPrefix+marker.quarantineDigest));
  assert.equal(alternate.modernRaw,beforeModern);
  assert.deepEqual(alternate.collision,{field:refusedField,raw:'{"synthetic":"invalid existing evidence"}',previous:null});
  assert.equal(fieldValue(refusedField),alternate.collision.raw);
  assert.equal(state().pendingObservations,false);
  assert.equal((await call(payload('valid-core-continues',20,[133,143]))).code,200);
  assert.equal((await call(payload('other-core-can-finish',24,[133],'Audit Two'))).code,200);
  record('damaged-quarantine-blocks-valid-follow-up-core',{corruptBytesUnchanged:true,exactAlternateConfirmed:true,
    initialHttp:200,nextValidSameCharacterHttp:200,otherCharacterHttp:200,priorFindingFixed:true});

  reset();
  const race=await repaired(984);
  let removed=false;
  setBefore(async cmd=>{
    if(!removed&&isCommit(cmd)){
      removed=true;
      assert.equal(redis('HDEL',observationIndex,race.field),1);
    }
  });
  const committed=await byNew(984,20,51,'commit-after-proof-disappeared');
  assert.equal(committed.code,200);
  assert.ok(removed);
  assert.equal(state().pendingObservations,false);
  assert.equal(fieldValue(race.key),race.modern);
  assert.equal(committed.value.liveKnowledge.quarantined,1);
  assert.equal((await view()).integrityIssues[0].reason,'missing_repair_evidence');
  record('repair-proof-disappears-after-validation-before-commit',{oldWriterUsedDuringInterleaving:false,
    committedHttp:200,pendingCleared:true,activeRawUnchanged:true,quarantineInsteadOfPublication:true,priorFindingFixed:true});

  reset();
  const active=await repaired(985);
  assert.equal((await byNew(986,0,23,'healthy-neighbour')).code,409);
  assert.equal((await byNew(986,15,23,'healthy-neighbour')).code,200);
  let recordedError=false;
  setBefore(async cmd=>{
    if(!recordedError&&isProofRead(cmd)&&cmd[2]===active.field){
      recordedError=true;
      throw Error('Synthetic isolated HGET failure after HMGET and legacy type lookup');
    }
  });
  const partial=await view();
  assert.deepEqual(partial.map(row=>row.npc.id),[986]);
  assert.deepEqual(partial.integrityIssues,[{key:active.key,reason:'repair_evidence_unavailable',preserved:false}]);
  assert.ok(recordedError);
  assert.deepEqual((await view()).map(row=>row.npc.id).sort(),[985,986]);
  record('one-repair-proof-read-error-blocks-entire-view',{isolatedHgetError:true,healthyNeighbourPreserved:true,
    nextReadRecoversBoth:true,priorFindingFixed:true});

  for(const type of ['hash','zset']){
    reset();
    const id=type==='hash'?987:988,key=keyFor(id);
    assert.equal((await byNew(id,0,11,'before-typed-'+type)).code,200);
    if(type==='hash')redis('HSET',key,'legacy-field','legacy-fixture');
    else redis('ZADD',key,'3','legacy-fixture');
    const activeRaw=fieldValue(key);
    const result=await byNew(id,10,60,'typed-'+type);
    assert.equal(result.code,200);
    assert.equal(result.value.liveKnowledge.quarantined,1);
    assert.equal(state().pendingObservations,false);
    const quarantined=await view();
    assert.deepEqual(quarantined.integrityIssues,[{key,reason:'invalid_storage_type',preserved:false}]);
    assert.deepEqual(type==='hash'?redis('HGET',key,'legacy-field'):redis('ZSCORE',key,'legacy-fixture'),type==='hash'?'legacy-fixture':'3');
    assert.equal(redis('TYPE',key),type);
    assert.equal(fieldValue(key),activeRaw);
    record('typed-legacy-preserved-physical-'+type,{type,validCoreContinues:true,observedPriceExcluded:true,
      actualValueRemainsOnlyInOldKey:true});
  }

  reset();
  const timed=keyFor(989);
  assert.equal((await byOld(989,0,25,'old-with-known-time')).code,200);
  redis('HSET',observationIndex,timed,'{"truncated":');
  assert.equal(inspectKnowledgePair(fieldValue(timed),redis('GET',timed),timed).unknownTime,true);
  const late=await byNew(989,15,32,'recent-but-relative-order-unknown');
  assert.equal(late.code,200);
  assert.equal(late.value.liveKnowledge.quarantined,1);
  assert.equal((await view()).length,0);
  assert.equal(state().pendingObservations,false);
  record('unknown-order-retained-with-one-valid-timestamp',{knownHalfDoesNotHideUnknownHalf:true,
    laterCaptureSeparatelyPreserved:true,validCoreContinues:true});

  reset();
  const luaRead=await repaired(990);
  const readOnly='audit-redis-no-eval';
  redis('ACL','SETUSER',readOnly,'on','>audit-fixture-only','~*','+@all','-eval');
  try{
    setUser(readOnly);
    await assert.rejects(view(),/NOPERM|permission/i);
  }finally{
    setUser(null);
    redis('ACL','DELUSER',readOnly);
  }
  commands.length=0;
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,31);
  assert.equal(commands.filter(cmd=>cmd.type==='HGET'&&cmd.key===observationIndex).length,1);
  assert.equal(commands.filter(cmd=>cmd.type==='EVAL'&&cmd.key===luaRead.key).length,1);
  record('repaired-warm-read-and-readonly-lua-capability',{warmRequests:commands.length,extraProofRead:1,luaRequiredToRead:true,
    actualRedisAclDeniesLua:true});

  reset();
  await withRedis(async ({socket,exec:initial})=>{
    for(const key of redis('KEYS','*')){
      if(redis('TYPE',key)==='hash'){
        const pairs=redis('HGETALL',key);
        initial('HSET',key,...(Array.isArray(pairs)?pairs:Object.entries(pairs).flat()));
      }else initial('SET',key,redis('GET',key));
    }
    const principal='audit-old-writer',newPrincipal='audit-new-writer';
    for(const user of [principal,newPrincipal])initial('ACL','SETUSER',user,'on','>audit-fixture-only','~*','+@all');
    initial('ACL','SETUSER','default','off');
    const admin=(...command)=>redisCommand(socket,command,newPrincipal);
    useRedisSocket(socket);
    try{
      setUser(principal);
      assert.equal((await byOld(992,0,27,'old-before-fence')).code,200);
      const key=keyFor(992),kept=admin('GET',key);
      assert.ok(kept);
      assert.equal(admin('ACL','DELUSER',principal),1);
      assert.throws(()=>redisCommand(socket,['PING'],principal),/NOAUTH|WRONGPASS|AUTH/);
      const rejected=await byOld(992,10,59,'old-after-fence');
      assert.equal(rejected.code,503);
      assert.equal(admin('GET',key),kept);
      setUser(newPrincipal);
      assert.equal((await byNew(992,12,55,'candidate-after-fence')).code,200);
      assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,55);
      record('cutover-legacy-principal-revocation-fences-old-handler',{oldBuildCanWriteBeforeRevocation:true,
        sameHandlerHttpAfterRevocation:503,defaultUserDisabled:true,fullLegacyValueUnchanged:true,newIsolatedPrincipalWrites:true});
    }finally{
      setUser(null);
      useRedisSocket(null);
    }
  });

  reset();
  const typed=keyFor(991);
  assert.equal((await byNew(991,0,19,'typed-inventory-active')).code,200);
  redis('LPUSH',typed,'wrong-type-still-present');
  const form=restoreInput([{key:typed,modern:fieldValue(typed),legacy:null}]);
  const proj=project(form);
  assert.ok(proj.manifest.inventoryVerified&&proj.manifest.completeForLegacyReaders);
  assert.equal(redis('TYPE',typed),'list');
  record('physical-key-type-not-bound-to-offline-json-inventory',{wrongTypeExists:true,legacyNullAcceptedIfBothInputsAssumeAbsence:true,
    runtimeInventoryCannotObservePhysicalType:true,externalPhysicalTypeGateRequired:true});

  for(const mode of ['deleted','replaced']){
    reset();
    const basis=await repaired(1001);
    let attempts=0;
    setBefore(async cmd=>{
      if(!isCommit(cmd))return;
      attempts++;
      if(attempts!==1)return;
      assert.deepEqual(JSON.parse(cmd[17]),[[basis.field,basis.raw]]);
      if(mode==='deleted')redis('HDEL',observationIndex,basis.field);
      else redis('HSET',observationIndex,basis.field,'synthetic replacement');
    });
    const result=await byNew(1001,20,66,'advance-with-'+mode+'-proof');
    assert.equal(result.code,200);
    assert.equal(result.value.liveKnowledge.quarantined,1);
    assert.equal(attempts,2);
    assert.equal(fieldValue(basis.key),basis.modern);
    assert.equal(state().pendingObservations,false);
    record('repair-cas-'+mode+'-exact-proof',{attempts,resultHttp:200,activeUnchanged:true,
      newObservationQuarantined:true,validCoreContinues:true});
  }

  reset();
  const changing=await repaired(1002);
  let conflicts=0,serializedProofBytes=0;
  setBefore(async cmd=>{
    if(!isCommit(cmd))return;
    serializedProofBytes+=Buffer.byteLength(cmd[17]);
    redis('HSET',observationIndex,changing.field,changing.raw+' '.repeat(++conflicts));
  });
  const repeated=request(1002,20,67,'bounded-proof-churn');
  const bounded=await call(repeated);
  assert.equal(bounded.code,503);
  assert.match(bounded.value.error,/REPAIR_EVIDENCE_CHANGED/);
  assert.equal(conflicts,3);
  assert.equal(fieldValue(changing.key),changing.modern);
  assert.equal(state().pendingObservations,true);
  setBefore(async()=>{});
  assert.equal((await call(repeated)).value.duplicate,true);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,67);
  record('repair-cas-kernel-retry-bound',{commitAttempts:3,unstableHttp:503,pendingRetained:true,
    subsequentReplayRepairsOnce:true,actualBytesCompared:true,totalSerializedProofBytesInThreeAttempts:serializedProofBytes});

  for(const phase of ['addon-before-observation','addon-after-observation']){
    reset();
    const key=await seed(1003);
    const v2=fieldValue(key),v1=redis('GET',key);
    const body=request(1003,11,71,'crash-collision');
    const incoming=incomingOf(body);
    const primary=knowledgeQuarantine(key,v2,v1,'conflicting_record',incoming);
    const corrupted=' beschädigter Beleg \u0000 \n留 ';
    const [left,right]=corrupted.split(String.fromCharCode(0));
    redis('EVAL',"return redis.call('HSET',KEYS[1],ARGV[1],ARGV[2]..string.char(0)..ARGV[3])",1,observationIndex,primary.field,left,right);
    const q=knowledgeQuarantine(key,v2,v1,'conflicting_record',incoming,'string',{field:primary.field,raw:corrupted,previous:null});
    await crash(phase,body);
    const committed=phase==='addon-after-observation';
    assert.equal(state().pendingObservations,true);
    assert.equal(fieldValue(primary.field),corrupted);
    assert.equal(fieldValue(q.field),committed?JSON.stringify(q.evidence):null);
    assert.equal(fieldValue(key)===v2,!committed);
    await expire(refreshLock);
    const retry=await call(body);
    assert.equal(retry.code,200);
    assert.equal(retry.value.duplicate,true);
    assert.equal(fieldValue(q.field),JSON.stringify(q.evidence));
    assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,71);
    assert.equal(fields().length,2);
    record('collision-atomic-'+phase,{signal:'SIGKILL',alternateAndActiveVisibleTogether:committed,
      exactBinarySafeTextPreserved:true,pendingBeforeRetry:true,oneAlternateAfterRetry:true});
  }

  reset();
  const overloaded=await seed(1004);
  const v2=fieldValue(overloaded),v1=redis('GET',overloaded);
  const body=request(1004,13,78,'deep-collision');
  const incoming=incomingOf(body);
  const seen=[];
  let chain=null;
  for(let i=0;i<4;i++){
    const q=knowledgeQuarantine(overloaded,v2,v1,'conflicting_record',incoming,'string',chain);
    const raw='synthetic collision number '+i+' \n圭';
    redis('HSET',observationIndex,q.field,raw);
    seen.push({field:q.field,raw});
    chain={field:q.field,raw,previous:chain};
  }
  commands.length=0;
  const depth=await call(body);
  assert.equal(depth.code,503);
  assert.match(depth.value.error,/QUARANTINE_COLLISION_LIMIT/);
  assert.equal(commands.filter(cmd=>cmd.type==='HGET'&&cmd.key===observationIndex).length,5);
  assert.equal(fieldValue(overloaded),v2);
  assert.equal(state().pendingObservations,true);
  assert.equal((await call(payload('core-after-exhausted-collisions',18,[133,143]))).code,503);
  for(const row of seen)assert.equal(fieldValue(row.field),row.raw);
  // Remove the last collision only in the isolated fixture to prove recovery.
  redis('HDEL',observationIndex,seen.at(-1).field);
  assert.equal((await call(payload('core-after-removing-last-blocker',18,[133,143]))).code,200);
  const deepestAlternate=JSON.parse(fieldValue(seen.at(-1).field));
  const extracted=[];
  for(let entry=deepestAlternate.collision;entry;entry=entry.previous)extracted.unshift({field:entry.field,raw:entry.raw});
  assert.deepEqual(extracted,seen.slice(0,-1));
  assert.equal(deepestAlternate.modernRaw,v2);
  assert.equal(deepestAlternate.legacyRaw,v1);
  assert.equal(state().pendingObservations,false);
  record('collision-search-bound-and-recovery',{checkedSlots:4,propagatedHttp:503,followingCoreHttp:503,
    allOriginalBytesRemain:true,exactRecursiveCollisionEvidence:3,manualFixtureRecoveryHttp:200});

  reset();
  const offlineKey=await seed(1005);
  const originalModern=fieldValue(offlineKey),legacy=redis('GET',offlineKey);
  const offlineBody=request(1005,12,79,'offline-collision');
  const first=knowledgeQuarantine(offlineKey,originalModern,legacy,'conflicting_record',incomingOf(offlineBody));
  const corrupt='exact occupied primary \n原';
  redis('HSET',observationIndex,first.field,corrupt);
  assert.equal((await call(offlineBody)).value.liveKnowledge.repaired,1);
  const qRows=fields().map(field=>({field,raw:fieldValue(field)}));
  const restoredInput=restoreInput([{key:offlineKey,modern:fieldValue(offlineKey),legacy}],qRows);
  assert.throws(()=>project(restoredInput),/Ungültiger Quarantänebeleg/);
  const validEnvelopes=qRows.filter(row=>row.field!==first.field);
  assert.equal(JSON.parse(validEnvelopes[0].raw).collision.raw,corrupt);
  assert.throws(()=>buildLegacyReadProjection({...restoredInput,quarantineRecords:validEnvelopes,inventory:inventoryFor(restoredInput)}),/Inventurdifferenz/);
  const subset=project({...restoredInput,quarantineRecords:validEnvelopes});
  assert.equal(subset.manifest.completeForLegacyReaders,false);
  assert.equal(redis('SAVE'),'OK');
  await restart();
  for(const row of qRows)assert.equal(fieldValue(row.field),row.raw);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,79);
  record('offline-strict-projection-refuses-complete-collision-export',{originAndAlternatePresent:true,
    alternateContainsExactOriginal:true,completeInventoryRejectedForForensicProjection:true,
    silentlyOmittingPrimaryRejected:true,nativeRdbRetainsExactOriginalAndAlternate:true,rdbRecoveredActivePrice:79,degradedRestore:true});

  reset();
  const transient=await repaired(1006);
  let proofErrors=0;
  setBefore(async cmd=>{
    if(isProofRead(cmd)&&cmd[2]===transient.field&&proofErrors===0){
      proofErrors++;
      throw Error('Synthetic one-shot proof transport failure');
    }
  });
  const recoverable=request(1006,18,81,'only-temporary-proof-failure');
  const failedProof=await call(recoverable);
  assert.equal(failedProof.code,200);
  assert.equal(failedProof.value.liveKnowledge.stored,1);
  assert.equal(state().pendingObservations,false);
  assert.equal((await call(recoverable)).value.duplicate,true);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,81);
  assert.notEqual(fieldValue(transient.key),transient.modern);
  assert.ok(fields().every(field=>JSON.parse(fieldValue(field)).reason!=='repair_evidence_unavailable'));
  record('transient-proof-read-finalizes-fresh-evidence-without-replay',{onlyOneReadFailure:true,
    firstHttp:200,pendingClearedAfterCommit:true,automaticRetryPublishedPrice:81,noTerminalQuarantine:true,priorFindingFixed:true});

  reset();
  const vanished=await repaired(1007);
  redis('HDEL',observationIndex,vanished.field);
  let restoredBeforeCommit=false;
  setBefore(async cmd=>{
    if(!restoredBeforeCommit&&isCommit(cmd)){
      restoredBeforeCommit=true;
      assert.deepEqual(JSON.parse(cmd[17]),[[vanished.field,null]]);
      redis('HSET',observationIndex,vanished.field,vanished.raw);
    }
  });
  const gap=request(1007,19,83,'proof-recovered-before-commit');
  assert.equal((await call(gap)).value.liveKnowledge.stored,1);
  assert.equal((await call(gap)).value.duplicate,true);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,83);
  assert.deepEqual(fields(),[vanished.field]);
  record('restored-proof-not-compared-on-negative-branch',{proofRestoredBeforeCommit:restoredBeforeCommit,
    knownAbsenceInCas:true,automaticRetryPublishedPrice:83,noTerminalQuarantine:true,priorFindingFixed:true});

  reset();
  const lost=await repaired(1008);
  const due=request(1008,22,89,'duplicate-check-proof-cas');
  let lostResponse=false;
  setAfter(async cmd=>{
    if(!lostResponse&&isCommit(cmd)){
      lostResponse=true;
      throw Error('Fixture response lost after successful observation HSET');
    }
  });
  assert.equal((await call(due)).code,503);
  assert.equal(state().pendingObservations,true);
  assert.equal(JSON.parse(fieldValue(lost.key)).latestSnapshot.entries[0].priceCopper,89);
  let duplicateCas=false;
  setBefore(async cmd=>{
    if(!duplicateCas&&isCommit(cmd)){
      duplicateCas=true;
      assert.equal(cmd[7],'');
      assert.equal(cmd[14],'');
      assert.deepEqual(JSON.parse(cmd[17]),[[lost.field,lost.raw]]);
      redis('HDEL',observationIndex,lost.field);
    }
  });
  const retry=await call(due);
  assert.equal(retry.code,200);
  assert.equal(retry.value.duplicate,true);
  assert.equal(state().pendingObservations,false);
  assert.equal((await view()).integrityIssues[0].reason,'missing_repair_evidence');
  assert.ok(fields().some(field=>JSON.parse(fieldValue(field)).incoming?.entries[0]?.priceCopper===89));
  record('pending-duplicate-response-loss-fences-changed-proof',{firstHttp:503,duplicateProofCasRan:duplicateCas,
    finalDuplicateIsCoreReceipt:true,unverifiedPriceExcluded:true,observationPreservedSeparately:true});

  reset();
  const confirmed=await repaired(1009);
  const acknowledged=request(1009,10,31,'repaired-1009');
  redis('HDEL',observationIndex,confirmed.field);
  commands.length=0;
  const replay=await call(acknowledged);
  assert.ok(replay.value.duplicate);
  assert.ok(!commands.some(cmd=>cmd.key===observationIndex));
  assert.equal((await view()).length,0);
  record('confirmed-duplicate-keeps-historical-receipt-only',{http:200,acknowledgedCoreDuplicate:true,
    replayDidNotCheckCurrentObservationProof:true,missingProofStillBlocksPrice:true});

  reset();
  const readKey=await seed(1010);
  const readPrimary=knowledgeQuarantine(readKey,fieldValue(readKey),redis('GET',readKey),'conflicting_record');
  const bad='previous unreadable evidence';
  redis('HSET',observationIndex,readPrimary.field,bad);
  assert.deepEqual((await view()).integrityIssues,[{key:readKey,reason:'conflicting_record',preserved:true}]);
  const alt=knowledgeQuarantine(readKey,fieldValue(readKey),redis('GET',readKey),'conflicting_record',null,'string',
    {field:readPrimary.field,raw:bad,previous:null});
  assert.equal(fieldValue(alt.field),JSON.stringify(alt.evidence));
  assert.equal(fieldValue(readPrimary.field),bad);
  commands.length=0;
  assert.equal((await view()).integrityIssues[0].preserved,true);
  assert.ok(!commands.some(c=>c.type==='HSETNX'));
  record('reader-only-collision-has-no-alternate',{exclusionCorrect:true,occupiedEvidenceUnmodified:true,
    exactAlternateEvidenceFound:true,repeatWithoutWrites:true,priorFindingFixed:true});


  reset();
  const unavailable=await repaired(1040);
  const durable=request(1040,25,119,'persistent-proof-outbox');
  let failures=0;
  setBefore(async cmd=>{
    if(isProofRead(cmd)&&cmd[2]===unavailable.field){
      failures++;
      throw Error('Synthetic persistent proof outage');
    }
  });
  const firstDurable=await call(durable);
  assert.equal(firstDurable.code,503);
  assert.match(firstDurable.value.error,/REPAIR_EVIDENCE_UNAVAILABLE/);
  const untouchedState=redis('GET',statusKey);
  const normalized=normalizeAddonSyncPayload(durable);
  assert.equal(state().pendingObservations,true);
  assert.notEqual(state().receipts.at(-1).observationsConfirmed,true);
  assert.deepEqual(state().pendingObservationPayload.sections.interactions,normalized.sections.interactions);
  assert.equal(redis('TTL',statusKey),-1);
  assert.equal(await call(durable).then(result=>result.code),503);
  assert.equal((await call(payload('later-core-blocked-by-outage',27,[133,143]))).code,503);
  assert.equal(failures,9);
  assert.equal(redis('GET',statusKey),untouchedState);
  assert.equal((await call(payload('independent-character',28,[133],'Audit Two'))).code,200);
  assert.equal(redis('SAVE'),'OK');
  await restart();
  assert.equal(redis('GET',statusKey),untouchedState);
  assert.equal(fieldValue(unavailable.key),unavailable.modern);
  setBefore(async()=>{});
  assert.equal((await call(payload('later-core-drains-pending',27,[133,143]))).code,200);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,119);
  assert.equal(state().pendingObservations,false);
  assert.deepEqual(fields(),[unavailable.field]);
  record('persistent-proof-outbox-survives-rdb-and-later-core-drain',{rejectedHandlers:3,proofAttempts:failures,
    exactOutboxSurvivesRdb:true,receiptWasUnconfirmed:true,otherCharacterHttp:200,recoveryPrice:119});

  reset();
  const failed = await repaired(1041);
  const interrupted = request(1041,24,120,'deadline-kill-after-proof-retries');
  await crash('addon-proof-retry',interrupted);
  assert.equal(state().pendingObservations,true);
  assert.deepEqual(state().pendingObservationPayload.sections.interactions,normalizeAddonSyncPayload(interrupted).sections.interactions);
  assert.equal(fieldValue(failed.key),failed.modern);
  assert.ok(redis('PTTL',refreshLock)>0);
  assert.equal((await call(payload('second-user-during-dead-lease',27,[133],'Audit Two'))).code,409);
  await expire(refreshLock);
  assert.equal((await call(interrupted)).value.duplicate,true);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,120);
  assert.equal(state().pendingObservations,false);
  record('worker-killed-during-proof-retry-leaves-global-lock-and-outbox',{signal:'SIGKILL',untilLeaseExpiresOtherCharacterHttp:409,
    exactOutboxPreserved:true,idempotentReplayPublished:true,releaseWasSimulatedByExpiringLease:true});

  function createLegacyProof(basis,id){
    const modernRecord=JSON.parse(basis.modern);
    const evidence=JSON.parse(basis.raw);
    const recent=request(id,7,25,'independent-legacy-proof');
    const legacyIncoming=incomingOf(recent);
    const legacyProof=knowledgeQuarantine(basis.key,evidence.modernRaw,evidence.legacyRaw,evidence.reason,legacyIncoming);
    const marker={...basis.marker,resolvedAt:legacyIncoming.capturedAt,quarantineDigest:legacyProof.digest};
    const legacyRaw=JSON.stringify({...modernRecord,migrationRepair:marker,lastObservedAt:legacyIncoming.capturedAt,latestSnapshot:legacyIncoming});
    const proofRaw=JSON.stringify(legacyProof.evidence);
    redis('SET',basis.key,legacyRaw);
    redis('HSET',observationIndex,legacyProof.field,proofRaw);
    return {field:legacyProof.field,raw:proofRaw};
  }

  for(const offense of ['missing','damaged']){
    reset();
    const id=1042;
    const modern=await repaired(id), legacy=createLegacyProof(modern,id);
    assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,31);
    const wrong='{"damage":"original incorrect proof bytes"}';
    if(offense==='missing')redis('HDEL',observationIndex,modern.field);
    else redis('HSET',observationIndex,modern.field,wrong);
    let attempts=0;
    setBefore(async cmd=>{
      if(!isCommit(cmd))return;
      const manifest=JSON.parse(cmd[17]);
      if(++attempts===1){
        assert.deepEqual(manifest,[[modern.field,offense==='missing'?null:wrong],[legacy.field,legacy.raw]]);
        assert.equal(cmd[7],'');
        redis('HSET',observationIndex,modern.field,modern.raw);
      }else assert.deepEqual(manifest,[[modern.field,modern.raw],[legacy.field,legacy.raw]]);
    });
    const outcome=await byNew(id,26,128,'two-references-with-'+offense);
    assert.equal(outcome.code,200);
    assert.equal(outcome.value.liveKnowledge.stored,1);
    assert.equal(attempts,2);
    assert.equal(fields().length,2);
    assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,128);
    record('dual-reference-atomic-'+offense+'-recovery',{firstAttemptBindsBothReferences:true,retriedAfterByteChange:true,
      noRedundantTerminalQuarantine:true,currentPrice:128});
  }

  reset();
  const knownMissing=await repaired(1043), uncertain=createLegacyProof(knownMissing,1043);
  redis('HDEL',observationIndex,knownMissing.field);
  let secondFailures=0;
  setBefore(async cmd=>{
    if(isProofRead(cmd)&&cmd[2]===uncertain.field){
      secondFailures++;
      throw Error('Synthetic failure reading second of two references');
    }
  });
  const mixed=request(1043,25,131,'one-missing-other-unknown');
  assert.equal((await call(mixed)).code,503);
  assert.equal(secondFailures,3);
  assert.equal(state().pendingObservations,true);
  assert.deepEqual(fields(),[uncertain.field]);
  setBefore(async()=>{});
  redis('HSET',observationIndex,knownMissing.field,knownMissing.raw);
  assert.equal((await call(mixed)).value.duplicate,true);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,131);
  record('dual-reference-unknown-transport-prevents-terminal-classification',{missingFirstAndTransportFailedSecond:true,
    proofAttempts:3,pendingRetained:true,noNewQuarantine:true,restoredBothAndReplayed:true});

  for(const timing of ['after-commit-before-ack','after-ack']){
    reset();
    const terminal=await repaired(1044);
    redis('HDEL',observationIndex,terminal.field);
    let matched=false;
    setAfter(async cmd=>{
      if(!matched&&isCommit(cmd)&&cmd[7]===''&&cmd[14]){
        matched=true;
        if(timing==='after-commit-before-ack')redis('HSET',observationIndex,terminal.field,terminal.raw);
      }
    });
    const input=request(1044,25,136,'stable-missing-is-terminal');
    const accepted=await call(input);
    assert.equal(accepted.code,200);
    assert.equal(accepted.value.liveKnowledge.quarantined,1);
    assert.ok(matched);
    assert.equal(state().pendingObservations,false);
    if(timing==='after-ack')redis('HSET',observationIndex,terminal.field,terminal.raw);
    assert.equal((await call(input)).value.duplicate,true);
    assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,31);
    assert.ok(fields().some(field=>JSON.parse(fieldValue(field)).incoming?.entries[0]?.priceCopper===136));
    record('terminal-stable-quarantine-restore-'+timing,{receiptRemainsHistorical:true,exactIncomingStillAvailable:true,
      lateReferenceRestoreDoesNotAutoReplay:true,currentPriorPrice:31});
  }

  reset();
  const shared=await seed(1045);
  const sharedModern=fieldValue(shared),sharedLegacy=redis('GET',shared);
  const sharedPrimary=knowledgeQuarantine(shared,sharedModern,sharedLegacy,'conflicting_record');
  const badBytes=' corrupted occupied field \n 原';
  redis('HSET',observationIndex,sharedPrimary.field,badBytes);
  const next=knowledgeQuarantine(shared,sharedModern,sharedLegacy,'conflicting_record',null,'string',{field:sharedPrimary.field,raw:badBytes,previous:null});
  const bothAtWrite=gate();
  let competitors=0;
  setBefore(async cmd=>{
    if(cmd[0]!=='HSETNX'||cmd[2]!==next.field)return;
    if(++competitors===2)bothAtWrite.open();
    await bothAtWrite.ready;
  });
  const views=await Promise.all([view(),view()]);
  assert.ok(views.every(result=>result.integrityIssues[0].preserved));
  assert.equal(competitors,2);
  assert.equal(fields().length,2);
  assert.equal(fieldValue(next.field),JSON.stringify(next.evidence));
  commands.length=0;
  assert.equal((await view()).integrityIssues[0].preserved,true);
  assert.equal(commands.filter(op=>op.type==='HSETNX').length,0);
  record('concurrent-readers-deduplicate-collision-chain',{attemptingReaders:2,alternateFieldCount:1,
    followupWrites:0,corruptedOriginalAndBothPairBytesPreserved:true});

  reset();
  const blocked=await seed(1046);
  const knownV2=fieldValue(blocked),knownV1=redis('GET',blocked);
  let nested=null;
  const occupied=[];
  for(let i=0;i<4;i++){
    const q=knowledgeQuarantine(blocked,knownV2,knownV1,'conflicting_record',null,'string',nested);
    const raw='original corrupted slot '+i;
    redis('HSET',observationIndex,q.field,raw);
    occupied.push({field:q.field,raw});
    nested={field:q.field,raw,previous:nested};
  }
  commands.length=0;
  assert.equal((await view()).integrityIssues[0].preserved,false);
  assert.equal(commands.filter(op=>op.type==='HGET').length,4);
  assert.equal(commands.filter(op=>op.type==='HSETNX').length,0);
  for(const {field,raw} of occupied)assert.equal(fieldValue(field),raw);
  record('reader-collision-search-exhausted',{readSlots:4,writes:0,falsePreserved:true,allDamagedOriginalFieldsUnchanged:true});

  reset();
  const empty=keyFor(1047);
  let injected=false,attempts=0;
  setBefore(async cmd=>{
    if(!isCommit(cmd)||cmd[6]!==empty)return;
    attempts++;
    if(injected)return;
    injected=true;
    assert.equal(fieldValue(empty),null);
    redis('HSET',observationIndex,empty,'');
    assert.equal(fieldValue(empty),'');
  });
  const terminalEmpty=await byNew(1047,20,139,'absent-versus-empty-v2');
  assert.equal(terminalEmpty.code,200);
  assert.equal(terminalEmpty.value.liveKnowledge.stored,1);
  assert.equal(attempts,1);
  assert.equal(fields().length,0);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,139);
  record('cas-v2-absence-collides-with-empty-raw-value',{absentAtRead:true,emptyStringPresentBeforeCommit:true,
    actualCommitAttempts:1,overwrittenWithoutQuarantine:true,receiptHttp:200,findingConfirmed:true});

  reset();
  const bulkSize=32;
  commands.length=0;
  const many=interactions(payload('bulk-sequential'),0,Array.from({length:bulkSize},(_,i)=>trainer(1100+i,0,20+i)));
  const bulk=await call(many);
  assert.equal(bulk.code,200);
  assert.equal(bulk.value.liveKnowledge.stored,bulkSize);
  const qualified=commands.filter(op=>op.key===observationIndex||op.key?.startsWith(prefix+'record:'));
  assert.equal(qualified.length,3*bulkSize);
  record('bulk-normal-traffic-profile',{inputBytes:Buffer.byteLength(JSON.stringify(many)),observations:bulkSize,
    observationRedisCalls:qualified.length,allHandlerRedisCalls:commands.length,
    observationRequestBytes:qualified.reduce((sum,entry)=>sum+entry.bytes,0)});

  reset();
  const partialProof=await repaired(1049);
  const order=[1050,1049,1051];
  const batch=interactions(payload('partial-batch-proof-outage',25),25,order.map((id,i)=>trainer(id,25,142+i)));
  let batchFailures=0;
  setBefore(async cmd=>{
    if(isProofRead(cmd)&&cmd[2]===partialProof.field){
      batchFailures++;
      throw Error('Synthetic proof outage after first capture of the batch');
    }
  });
  assert.equal((await call(batch)).code,503);
  assert.equal(batchFailures,3);
  assert.equal(state().pendingObservations,true);
  const alreadyCommitted=fieldValue(keyFor(order[0]));
  assert.equal(JSON.parse(alreadyCommitted).observationCount,1);
  assert.equal(fieldValue(keyFor(order[1])),partialProof.modern);
  assert.equal(fieldValue(keyFor(order[2])),null);
  setBefore(async()=>{});
  assert.equal((await call(batch)).value.duplicate,true);
  assert.equal(fieldValue(keyFor(order[0])),alreadyCommitted);
  assert.equal(state().pendingObservations,false);
  const completed=new Map((await view()).map(row=>[row.npc.id,row.latestSnapshot.entries[0].priceCopper]));
  assert.deepEqual(order.map(id=>completed.get(id)),[142,143,144]);
  record('partial-batch-proof-outage-drains-without-duplicate-history',{firstCaptureAlreadyCommitted:true,secondDeferred:true,
    thirdNotYetReached:true,replayCompletesWholeBatch:true,firstRecordByteIdentical:true,finalPrices:[142,143,144]});

  reset();
  const timing=await repaired(1048);
  let timeoutAttempts=0;
  setBefore(async (cmd,options)=>{
    if(!isProofRead(cmd)||cmd[2]!==timing.field)return;
    timeoutAttempts++;
    const signal=options.signal;
    assert.ok(signal instanceof AbortSignal);
    await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  });
  const {config}=await import(join(head,'api/addon-sync.js'));
  const start=performance.now();
  const slow=await byNew(1048,25,141,'timeout-additive-function-duration');
  const elapsed=performance.now()-start;
  assert.equal(slow.code,503);
  assert.equal(timeoutAttempts,3);
  assert.ok(elapsed>=config.maxDuration*1000);
  assert.equal(state().pendingObservations,true);
  assert.equal(fieldValue(timing.key),timing.modern);
  setBefore(async()=>{});
  assert.equal((await byNew(1048,25,141,'timeout-additive-function-duration')).value.duplicate,true);
  assert.equal((await view())[0].latestSnapshot.entries[0].priceCopper,141);
  record('proof-timeouts-exceed-handler-deadline',{perRequestTimeoutMs:10000,attempts:3,
    handlerMaxDurationSeconds:config.maxDuration,elapsedMs:Math.round(elapsed),localEventuallyHttp:503,
    pendingRetainedAndReplaySucceeded:true,providerTerminationWasNotExecuted:true,findingConfirmed:true});

}
