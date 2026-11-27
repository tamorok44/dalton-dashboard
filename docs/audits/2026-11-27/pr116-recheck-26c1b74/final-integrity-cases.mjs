import assert from 'node:assert/strict';
import {join} from 'node:path';
import {explicitInputs,inventoryFor} from './inventory-fixture.mjs';
import {requireLegacyGate} from './migration-gate.mjs';
import {redisCommand,withRedis} from '../pr116-recheck-177b147/redis-fixture.mjs';

const prefix='dalton-dashboard:live-knowledge:v1:production:';
const build='1.60.1.71139';
const qPrefix='__quarantine:v1:';
const statusKey='dalton-dashboard:addon-sync:v1:production:audit-one';

export async function runFinalIntegrityCases({
  head,reset,redis,record,commands,setBefore,setAfter,setUser,useRedisSocket,date,oldRoster,observationIndex,
  call,previousAddon,payload,interactions,trainer,
}){
  const {loadLiveKnowledge}=await import(join(head,'scripts/live-knowledge-store.mjs'));
  const {buildLegacyReadProjection}=await import(join(head,'scripts/storage-rollback-projection.mjs'));
  const {knowledgeQuarantine,inspectKnowledgePair}=await import(join(head,'scripts/storage-reconciliation.mjs'));
  const view=()=>loadLiveKnowledge({build,kind:'trainer'});
  const keyFor=id=>prefix+'record:trainer:'+build+':id-'+id;
  const fieldValue=field=>redis('HGET',observationIndex,field);
  const state=()=>JSON.parse(redis('GET',statusKey));
  const byNew=(id,offset,price,syncId)=>call(interactions(payload(syncId,offset),offset,[trainer(id,offset,price)]));
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
  assert.equal(legacyOnly[0].latestSnapshot.entries[0].priceCopper,31);
  assert.deepEqual(legacyOnly.integrityIssues,[]);
  assert.throws(()=>project(restoreInput([{key:badReference.key,modern:null,legacy:badReference.modern}])),/Referenzierter Quarantänebeleg/);
  record('legacy-half-repair-reference-skipped-at-runtime',{priceFromLegacyWithMissingReference:31,runtimeIntegrityWarnings:0,
    offlineProjectionRejectsSameReference:true,findingConfirmed:true});

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
  assert.equal(candidate.code,503);
  assert.ok(refusedField);
  assert.equal(fieldValue(stuck),beforeModern);
  assert.equal(fieldValue(refusedField),'{"synthetic":"invalid existing evidence"}');
  assert.equal(state().pendingObservations,true);
  assert.equal((await call(payload('valid-core-blocked',20,[133,143]))).code,503);
  assert.equal(state().payload.syncId,'evidence-collision-new');
  assert.equal((await call(payload('other-core-can-finish',24,[133],'Audit Two'))).code,200);
  redis('HDEL',observationIndex,refusedField);
  assert.equal((await call(payload('valid-core-unblocked',20,[133,143]))).code,200);
  assert.equal(state().pendingObservations,false);
  record('damaged-quarantine-blocks-valid-follow-up-core',{corruptBytesUnchanged:true,activeRecordNotFalselyCommitted:true,
    initialHttp:503,nextValidSameCharacterHttp:503,otherCharacterHttp:200,requiresManualRecovery:true,findingConfirmed:true});

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
  assert.equal(JSON.parse(fieldValue(race.key)).latestSnapshot.entries[0].priceCopper,51);
  assert.equal((await view()).integrityIssues[0].reason,'missing_repair_evidence');
  record('repair-proof-disappears-after-validation-before-commit',{oldWriterUsedDuringInterleaving:false,
    committedHttp:200,pendingCleared:true,priceSubsequentlyExcluded:true,findingConfirmed:true});

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
  await assert.rejects(view(),/Synthetic isolated HGET failure/);
  assert.ok(recordedError);
  assert.deepEqual((await view()).map(row=>row.npc.id).sort(),[985,986]);
  record('one-repair-proof-read-error-blocks-entire-view',{isolatedHgetError:true,healthyNeighbourLostFromResponse:true,
    nextReadRecoversBoth:true,findingConfirmed:true});

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
}
