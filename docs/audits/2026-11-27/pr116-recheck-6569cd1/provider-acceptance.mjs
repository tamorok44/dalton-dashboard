import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const candidate='6569cd13173d23ce8be1b57aa40d4afc6aeab7bd';
const fixtureEndpoint='https://dalton-audit-provider.invalid';
const keyRoot='dalton-dashboard:';
const numberOfRequests=155;
const selectors=new Set(['DEL','EXISTS','GET','HDEL','HGET','HKEYS','HMGET','HSET','HSETNX','LPUSH','LRANGE','MGET','PTTL','SET','SMEMBERS','TYPE']);
const projectKeys=command=>{
  const op=command[0];
  if(op==='EVAL'){
    const count=Number(command[2]);
    assert.ok(Number.isInteger(count)&&count>0&&count<=16&&count+3<=command.length);
    return Array.from({length:count},(_,i)=>i+3);
  }
  assert.ok(selectors.has(op),'Befehl außerhalb des Testplans');
  return ['DEL','EXISTS','MGET'].includes(op)?command.slice(1).map((_,i)=>i+1):[1];
};
function namespaced(command,prefix,tracked){
  const result=[...command];
  for(const i of projectKeys(command)){
    assert.ok(typeof command[i]==='string'&&command[i].startsWith(keyRoot),'Redis-Schlüssel außerhalb des Testplans');
    result[i]=prefix+command[i];
    tracked.add(result[i]);
  }
  return result;
}
function redisOrigin(raw){
  const url=new URL(raw);
  assert.ok(url.protocol==='https:'&&url.hostname.endsWith('.upstash.io')&&url.pathname==='/'&&
    !url.username&&!url.password&&!url.port&&!url.search&&!url.hash,'Ungültiger Upstash-HTTPS-Origin');
  return url.origin;
}
function storeId(value){
  assert.ok(/^[a-z0-9]+$/i.test(value),'Ungültige Store-ID');
  return value.toLowerCase();
}
function targetConfig(env){
  if(env.VERCEL_ENV==='production'||env.DALTON_AUDIT_TARGET_CONFIRMATION!=='ISOLATED_DISPOSABLE_TEST_RESOURCES')
    throw Error('Explizite Freigabe für getrennte Testressourcen fehlt');
  const must=label=>{assert.ok(env[label],label+' fehlt');return env[label];};
  const origin=redisOrigin(must('DALTON_AUDIT_UPSTASH_TEST_ORIGIN'));
  const productionOrigin=redisOrigin(must('DALTON_AUDIT_UPSTASH_PRODUCTION_ORIGIN'));
  assert.notEqual(origin,productionOrigin,'Redis-Testziel entspricht dem Produktionsziel');
  const id=storeId(must('DALTON_AUDIT_BLOB_TEST_STORE_ID'));
  assert.notEqual(id,storeId(must('DALTON_AUDIT_BLOB_PRODUCTION_STORE_ID')),'Blob-Testziel entspricht dem Produktionsziel');
  const privateToken=must('DALTON_AUDIT_BLOB_TEST_WRITE_TOKEN');
  const redisWrite=must('DALTON_AUDIT_UPSTASH_TEST_WRITE_TOKEN');
  const redisRead=must('DALTON_AUDIT_UPSTASH_TEST_READ_TOKEN');
  assert.notEqual(redisRead,redisWrite,'Dedizierte Leseberechtigung erforderlich');
  assert.ok(privateToken.startsWith('vercel_blob_rw_')&&privateToken.split('_')[3]?.toLowerCase()===id,
    'Blob-Test-Token passt nicht zur freigegebenen Store-ID');
  return {origin,id,privateToken,redisWrite,redisRead};
}
function selfTest(){
  const tracked=new Set();
  assert.deepEqual(namespaced(['EVAL','return ARGV[1]',1,'dalton-dashboard:key','dalton-dashboard:unchanged'],'probe:',tracked),
    ['EVAL','return ARGV[1]',1,'probe:dalton-dashboard:key','dalton-dashboard:unchanged']);
  assert.throws(()=>namespaced(['FLUSHDB'],'probe:',tracked),/außerhalb/);
  assert.throws(()=>namespaced(['GET','foreign:key'],'probe:',tracked),/außerhalb/);
  assert.throws(()=>targetConfig({VERCEL_ENV:'production'}),/Freigabe/);
  assert.throws(()=>redisOrigin('https://some.upstash.io/path'),/Origin/);
  process.stdout.write(JSON.stringify({targetGuards:true,namespaceMapping:true,providerContacted:false})+'\n');
}

export async function runProviderAcceptance(tree,config){
  assert.equal(execFileSync('git',['-C',tree,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),candidate,'Falscher Kandidat');
  execFileSync('git',['-C',tree,'diff','--quiet','HEAD','--','api','scripts','package-lock.json']);
  const suffix=randomUUID();
  const tracked=new Set();
  const nativeFetch=globalThis.fetch;
  const started=performance.now(),counts={requests:0,requestBytes:0,responseBytes:0};
  let readOnly=false,denyOnlyQuarantine=false,beforeSend=async()=>{},archiveUrl,destroyBlob,stage='start';
  let primaryError=null,cleanupError=false;
  const emit=(phase,data)=>process.stdout.write(JSON.stringify({phase,...data})+'\n');
  const upstream=async(command,token,{cleanup=false}={})=>{
    if(!cleanup)assert.ok(counts.requests<numberOfRequests,'Redis-Testbudget erschöpft');
    const body=JSON.stringify(command);
    assert.ok(Buffer.byteLength(body)<=65536,'Redis-Fixture zu groß');
    counts.requests++;counts.requestBytes+=Buffer.byteLength(body);
    const response=await nativeFetch(config.origin,{method:'POST',redirect:'error',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},body,signal:AbortSignal.timeout(6000)});
    const raw=await response.text();
    counts.responseBytes+=Buffer.byteLength(raw);
    const parsed=JSON.parse(raw);
    const retryCode=String(parsed.error??'').match(/\b(REPAIR_EVIDENCE_CHANGED|QUARANTINE_EVIDENCE_CONFLICT|OBSERVATION_CONFLICT)\b/)?.[1];
    return {ok:response.ok&&!parsed.error,result:parsed.result,retryCode,
      permissionDenied:[401,403].includes(response.status)||/read.?only|noperm|permission|not allowed|not authorized/i.test(String(parsed.error??''))};
  };
  for(const name of ['KV_REST_API_URL','KV_REST_API_TOKEN','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN','VERCEL_BLOB_API_URL','NEXT_PUBLIC_VERCEL_BLOB_API_URL','VERCEL_OIDC_TOKEN'])
    delete process.env[name];
  Object.assign(process.env,{
    VERCEL_ENV:'production',UPSTASH_REDIS_REST_URL:fixtureEndpoint,UPSTASH_REDIS_REST_TOKEN:'local-routing-fixture',
    DALTON_PRIVATE_ARCHIVE_TOKEN:config.privateToken,VERCEL_BLOB_RETRIES:'0'
  });
  globalThis.fetch=async(url,options={})=>{
    assert.equal(String(url),fixtureEndpoint,'Unerwartetes App-Ziel');
    const command=JSON.parse(options.body);
    const mapped=namespaced(command,'audit:pr116:'+suffix+':',tracked);
    await beforeSend(command,mapped);
    const restricted=readOnly||(denyOnlyQuarantine&&mapped[0]==='HSETNX');
    const response=await upstream(mapped,restricted?config.redisRead:config.redisWrite);
    return Response.json(response.ok?{result:response.result}:{error:response.permissionDenied
      ?'Provider-Testberechtigung verweigert':response.retryCode??'Provider-Testbefehl fehlgeschlagen'});
  };
  const from=file=>import(join(tree,file));
  try{
    stage='redis-single-commands';
    const store=await from('scripts/character-store.mjs');
    const {saveAddonSyncState,loadAddonSyncState}=await from('scripts/addon-sync-store.mjs');
    const {registerDailySnapshot,getLastDailySnapshot,acquireDailySnapshotLock,releaseDailySnapshotLock}=await from('scripts/history-store.mjs');
    const {ingestAddonLiveKnowledge,loadLiveKnowledge,snapshotsFromAddonPayload}=await from('scripts/live-knowledge-store.mjs');
    const {knowledgeQuarantine}=await from('scripts/storage-reconciliation.mjs');
    const {CORE_COMPACT_KEY}=await from('scripts/version-metadata.mjs');
    const date=new Date().toISOString().slice(0,10);
    const slug='audit-'+suffix.slice(0,8);
    const roster={generatedAt:new Date().toISOString(),characters:[{slug,name:slug,blizzardCharacterId:101}]};
    const sync={syncId:'audit-baseline',sections:{character:{name:slug,classID:8,level:15}}};
    const lock=await store.acquireRefreshLock({addon:true});
    assert.ok(lock);
    const leaseMs=await store.redis(['PTTL',keyRoot+'refresh:lock']);
    assert.ok(leaseMs>0&&leaseMs<=35000);
    const core=()=>store.redis(['MGET',store.CHARACTER_KEY,keyRoot+'addon-sync:v1:production:'+slug,CORE_COMPACT_KEY]);
    try{
      await saveAddonSyncState(slug,sync,{lockToken:lock,roster});
      const prior=await core();
      assert.ok(prior.every(Boolean));
      assert.equal((await loadAddonSyncState(slug)).payload.syncId,'audit-baseline');
      readOnly=true;
      assert.deepEqual(await core(),prior);
      await assert.rejects(saveAddonSyncState(slug,{...sync,syncId:'denied-by-read-only'},{lockToken:lock,roster}),/Provider-Testberechtigung verweigert/);
      readOnly=false;
      assert.deepEqual(await core(),prior);
      await assert.rejects(saveAddonSyncState(slug,{...sync,syncId:'denied-by-lock'},{lockToken:'stale-audit-owner',roster}));
      assert.deepEqual(await core(),prior);

      const captureAt=Math.floor(Date.now()/1000)-30;
      const obs=(price,offset=0,id=606)=>({addon:{build:'1.60.1.71139'},
        sections:{interactions:{trainerHistory:[{capturedAt:captureAt+offset,
          npc:{id,name:'Audit Fixture'},complete:true,services:[{name:'Audit Rezept',priceCopper:price}]}]}}});
      await ingestAddonLiveKnowledge(obs(10),{lockToken:lock});
      const recordsKey=keyRoot+'live-knowledge:v1:production:records:v2';
      const [recordKey]= (await store.redis(['HKEYS',recordsKey])).filter(key=>key.includes(':record:'));
      assert.ok(recordKey);
      const recordRaw=await store.redis(['HGET',recordsKey,recordKey]);
      const legacy=JSON.parse(recordRaw);
      legacy.latestSnapshot.entries[0].priceCopper=99;
      legacy.observationIds=['independent-audit-fixture'];
      const legacyRaw=JSON.stringify(legacy);
      await store.redis(['SET',recordKey,legacyRaw]);
      const oldVersion=await store.redis(['HGET',recordsKey,'__version:v2']);
      const fields=async()=> (await store.redis(['HKEYS',recordsKey])).filter(key=>key.startsWith('__quarantine:v1:'));
      const read=()=>loadLiveKnowledge({kind:'trainer'});
      const saved=async()=>Promise.all((await fields()).map(async field=>JSON.parse(await store.redis(['HGET',recordsKey,field]))));
      let readOnlyLua;
      readOnly=true;
      try{
        const probe=await store.redis(['EVAL',"return redis.call('TYPE',KEYS[1]).ok",1,recordKey]);
        assert.equal(probe,'string');
        readOnlyLua='allowed';
      }catch(error){
        assert.match(error.message,/Provider-Testberechtigung verweigert/);
        readOnlyLua='denied';
      }
      await assert.rejects(ingestAddonLiveKnowledge(obs(300,10),{lockToken:lock}),/Provider-Testberechtigung verweigert/);
      readOnly=false;
      denyOnlyQuarantine=true;
      const refusedRead=await read();
      denyOnlyQuarantine=false;
      assert.equal(refusedRead.length,0);
      assert.deepEqual(refusedRead.integrityIssues,[{key:recordKey,reason:'conflicting_record',preserved:false}]);
      assert.equal((await fields()).length,0);
      assert.equal(await store.redis(['TYPE',recordKey]),'string');
      assert.deepEqual(await store.redis(['MGET',recordKey]),[legacyRaw]);
      const acceptedRead=await read();
      assert.equal(acceptedRead.length,0);
      assert.deepEqual(acceptedRead.integrityIssues,[{key:recordKey,reason:'conflicting_record',preserved:true}]);
      assert.equal((await read()).integrityIssues[0].preserved,true);
      assert.equal(await store.redis(['HGET',recordsKey,recordKey]),recordRaw);
      assert.equal(await store.redis(['HGET',recordsKey,'__version:v2']),oldVersion);
      const [readCopy,...extra]=await saved();
      assert.ok(readCopy);
      assert.equal(extra.length,0);
      assert.equal(readCopy.incoming,null);
      assert.equal(readCopy.modernRaw,recordRaw);
      assert.equal(readCopy.legacyRaw,legacyRaw);
      const [readField]=await fields();
      const cleanReadRaw=await store.redis(['HGET',recordsKey,readField]);
      const damagedReadRaw='{"synthetic":"wrong evidence"}';
      await store.redis(['HSET',recordsKey,readField,damagedReadRaw]);
      assert.equal((await read()).integrityIssues[0].preserved,true);
      assert.equal(await store.redis(['HGET',recordsKey,readField]),damagedReadRaw);
      const alternateRead=knowledgeQuarantine(recordKey,recordRaw,legacyRaw,'conflicting_record',null,'string',
        {field:readField,raw:damagedReadRaw,previous:null});
      assert.equal(await store.redis(['HGET',recordsKey,alternateRead.field]),JSON.stringify(alternateRead.evidence));
      await store.redis(['HSET',recordsKey,readField,cleanReadRaw]);
      const [incoming]=snapshotsFromAddonPayload(obs(300,10));
      const primary=knowledgeQuarantine(recordKey,recordRaw,legacyRaw,'conflicting_record',incoming);
      const damage='{"synthetic":"occupied digest 例"}';
      await store.redis(['HSET',recordsKey,primary.field,damage]);
      const repaired=await ingestAddonLiveKnowledge(obs(300,10),{lockToken:lock});
      assert.equal(repaired.repaired,1);
      assert.equal(await store.redis(['HGET',recordsKey,primary.field]),damage);
      const active=await store.redis(['HGET',recordsKey,recordKey]);
      const proofField='__quarantine:v1:'+JSON.parse(active).migrationRepair.quarantineDigest;
      const proofRaw=await store.redis(['HGET',recordsKey,proofField]);
      const alternate=JSON.parse(proofRaw);
      assert.deepEqual(alternate.collision,{field:primary.field,raw:damage,previous:null});
      assert.equal(alternate.modernRaw,recordRaw);
      assert.equal(alternate.legacyRaw,legacyRaw);
      assert.equal((await read())[0].latestSnapshot.entries[0].priceCopper,300);
      let attempted=0;
      beforeSend=async (cmd,mapped)=>{
        if(cmd[0]!=='EVAL'||cmd[3]!==recordsKey||cmd[6]!==recordKey)return;
        if(++attempted!==1)return;
        assert.deepEqual(JSON.parse(cmd[17]),[[proofField,proofRaw]]);
        const removed=await upstream(['HDEL',mapped[3],proofField],config.redisWrite);
        assert.ok(removed.ok&&removed.result===1,'Isolierter Beleg konnte nicht entfernt werden');
      };
      const changed=await ingestAddonLiveKnowledge(obs(301,11),{lockToken:lock});
      beforeSend=async()=>{};
      assert.equal(attempted,2);
      assert.equal(changed.quarantined,1);
      assert.equal(await store.redis(['HGET',recordsKey,recordKey]),active);
      await store.redis(['HSET',recordsKey,proofField,proofRaw]);
      await store.redis(['HDEL',recordsKey,proofField]);
      let restoreAttempts=0;
      beforeSend=async (cmd,mapped)=>{
        if(cmd[0]!=='EVAL'||cmd[3]!==recordsKey||cmd[6]!==recordKey)return;
        if(++restoreAttempts!==1)return;
        assert.deepEqual(JSON.parse(cmd[17]),[[proofField,null]]);
        const restored=await upstream(['HSET',mapped[3],proofField,proofRaw],config.redisWrite);
        assert.ok(restored.ok,'Isolierter Beleg konnte nicht wiederhergestellt werden');
      };
      assert.equal((await ingestAddonLiveKnowledge(obs(302,12),{lockToken:lock})).stored,1);
      beforeSend=async()=>{};
      assert.equal(restoreAttempts,2);
      let oneFailure=true;
      beforeSend=async cmd=>{
        if(oneFailure&&cmd[0]==='HGET'&&cmd[2]===proofField){
          oneFailure=false;
          throw Error('Synthetic proof transport timeout');
        }
      };
      assert.equal((await ingestAddonLiveKnowledge(obs(303,13),{lockToken:lock})).stored,1);
      beforeSend=async()=>{};
      assert.equal(oneFailure,false);
      assert.equal((await read())[0].latestSnapshot.entries[0].priceCopper,303);
      emit('redis-commit-evidence',{collisionEnvelopePreservesOriginal:true,validatedProofComparedInCommit:true,
        attemptsAfterProofRemoval:attempted,unverifiedNewPriceNotCommitted:true,
        attemptsAfterProofRestoration:restoreAttempts,oneShotTransportFailureRecovered:true,readerAlternateExact:true});
      const typedKey=recordKey.replace(/id-606$/,'id-607');
      assert.notEqual(typedKey,recordKey);
      await ingestAddonLiveKnowledge(obs(15,0,607),{lockToken:lock});
      await store.redis(['LPUSH',typedKey,'synthetic-typed-legacy']);
      const typed=await read();
      assert.deepEqual(typed.integrityIssues,[{key:typedKey,reason:'invalid_storage_type',preserved:false}]);
      assert.equal((await ingestAddonLiveKnowledge(obs(16,10,607),{lockToken:lock})).quarantined,1);
      assert.deepEqual(await store.redis(['LRANGE',typedKey,0,-1]),['synthetic-typed-legacy']);
      emit('redis-reader-capabilities',{typeAwareLua:true,readOnlyLua,refusedHsetnx:true,
        exactEvidenceContentRequired:true,typedLegacyLeftIntact:true});

    }finally{
      readOnly=false;
      denyOnlyQuarantine=false;
      beforeSend=async()=>{};
      await store.releaseRefreshLock(lock,{addon:true});
    }
    const dayLock=await acquireDailySnapshotLock(date);
    assert.ok(dayLock);
    try{
      const daily={date,archiveStatus:'disabled'};
      await registerDailySnapshot(daily,dayLock);
      assert.deepEqual(await getLastDailySnapshot(),daily);
      readOnly=true;
      await assert.rejects(registerDailySnapshot({...daily,archiveStatus:'failed'},dayLock),/Provider-Testberechtigung verweigert/);
      readOnly=false;
      assert.deepEqual(await getLastDailySnapshot(),daily);
    }finally{
      readOnly=false;
      await releaseDailySnapshotLock(date,dayLock);
    }
    emit(stage,{msetAndHset:true,readonlyDenialsPreservedState:true,staleLockFenced:true,addonLeaseMs:leaseMs,readerHsetnxAndReadOnlyRefusal:true,readerReplayDeduplicates:true,quarantineAndRepair:true});

    stage='blob-private-object';
    const {archivePath,saveDailySnapshot,recoverDailySnapshot}=await from('scripts/daily-snapshot-store.mjs');
    const {FOREVER_CHARACTER_ENDPOINTS}=await from('scripts/blizzard-api.mjs');
    const blob=await from('node_modules/@vercel/blob/dist/index.js');
    const expectedRoster=[{slug,id:101}];
    const snapshot={snapshotAt:new Date().toISOString(),characters:{
      [slug]:Object.fromEntries(Object.keys(FOREVER_CHARACTER_ENDPOINTS).map(name=>[name,{ok:true,status:200,
        data:name==='profile'?{id:101,name:slug,level:15}:{fixture:true}}]))
    }};
    const blobDate=snapshot.snapshotAt.slice(0,10);
    const canonical=archivePath(blobDate,expectedRoster);
    archiveUrl='https://'+config.id+'.private.blob.vercel-storage.com/'+canonical;
    destroyBlob=async()=>{
      const signal=AbortSignal.timeout(6000);
      await blob.del(archiveUrl,{token:config.privateToken,abortSignal:signal});
      const left=await blob.get(canonical,{access:'private',token:config.privateToken,useCache:false,abortSignal:signal});
      if(left?.stream)await left.stream.cancel();
      assert.equal(left,null);
    };
    const first=await saveDailySnapshot(snapshot,blobDate,{expectedRoster});
    assert.equal(first.url,archiveUrl);
    const auth=await recoverDailySnapshot(blobDate,{expectedRoster});
    assert.equal(auth?.sha256,first.sha256);
    const anonymous=await nativeFetch(archiveUrl,{redirect:'manual',signal:AbortSignal.timeout(6000)});
    await anonymous.body?.cancel();
    assert.ok([401,403,404].includes(anonymous.status),'Anonymer Zugriff wurde nicht verweigert');
    const changed=structuredClone(snapshot);
    changed.characters[slug].profile.data.level++;
    await assert.rejects(saveDailySnapshot(changed,blobDate,{expectedRoster}));
    assert.equal((await recoverDailySnapshot(blobDate,{expectedRoster}))?.sha256,first.sha256);
    emit(stage,{authenticatedRecovery:true,anonymousStatus:anonymous.status,overwriteRejected:true,bytes:first.gzipBytes});
  }catch(error){
    primaryError=error;
  }finally{
    globalThis.fetch=nativeFetch;
    if(destroyBlob){try{await destroyBlob();}catch{cleanupError=true;}}
    if(tracked.size>0){
      try{
        const names=[...tracked];
        const dropped=await upstream(['DEL',...names],config.redisWrite,{cleanup:true});
        const remaining=await upstream(['EXISTS',...names],config.redisWrite,{cleanup:true});
        assert.ok(dropped.ok&&remaining.ok&&remaining.result===0);
      }catch{cleanupError=true;}
    }
    emit('finished',{...counts,elapsedMs:Math.round(performance.now()-started),cleanupPassed:!cleanupError,
      result:primaryError||cleanupError?'failed':'passed',...(primaryError?{failedPhase:stage,errorType:primaryError.name}:{})});
  }
  return !primaryError&&!cleanupError;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  if(process.argv[2]==='--self-test')selfTest();
  else{
    try{if(!await runProviderAcceptance(resolve(process.argv[2]),targetConfig(process.env)))process.exitCode=1;}
    catch{process.stderr.write('Abnahme vor Providerzugriff gestoppt. Zielkonfiguration, Commit und Abhängigkeiten prüfen.\n');process.exitCode=1;}
  }
}
