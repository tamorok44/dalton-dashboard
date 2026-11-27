import assert from 'node:assert/strict';
import {gunzipSync,gzipSync} from 'node:zlib';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {FOREVER_CHARACTER_ENDPOINTS} from './blizzard-api.mjs';
import {rosterKey} from './daily-roster.mjs';
import {dailySnapshotStoreConfigured,saveDailySnapshot,recoverDailySnapshot,classifySnapshot,withinArchiveDeadline} from './daily-snapshot-store.mjs';
import {dailyRefreshComplete,createDailySnapshotHandler,refreshDailyCharacters} from '../api/daily-snapshot.js';
import {prepareAddonSync,saveAddonSyncState,loadAddonSyncState} from './addon-sync-store.mjs';
import {saveCharacters,loadDailyProfileReceipt,acquireRefreshLock,releaseRefreshLock} from './character-store.mjs';
import {registerDailySnapshot,getDailySnapshot,getLastDailySnapshot,acquireDailySnapshotLock,releaseDailySnapshotLock} from './history-store.mjs';
import {encodeCompactMaster} from './compact-master-cache.mjs';
import {parseLuaSavedVariable} from './savedvariables-parser.mjs';
import {buildSafeAddonSyncPayload} from './addon-sync.mjs';
import {buildLegacyReadProjection} from './storage-rollback-projection.mjs';

const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Real network disabled')};
for(const key of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN','DALTON_PRIVATE_ARCHIVE_TOKEN','DALTON_SYNC_TOKEN','SPELLBOOK_SYNC_TOKEN','FOREVERDB_API_KEY','BLIZZARD_CLIENT_ID','BLIZZARD_CLIENT_SECRET'])delete process.env[key];
process.env.VERCEL_ENV='production';
process.env.BLOB_READ_WRITE_TOKEN='public-media-fixture';
process.env.BLOB_STORE_ID='public-media-fixture';
const day='2026-11-26';
const testRoster=[{slug:'test',id:123}];
const snapshot={snapshotAt:day+'T05:00:00Z',characters:{test:Object.fromEntries(Object.keys(FOREVER_CHARACTER_ENDPOINTS).map(key=>[key,{status:200,ok:true,data:key==='profile'?{id:123,name:'Test',level:12}:{id:123,entries:[]}}]))}};
let uploads=0,blob=null,compressed=null;
const putImpl=async(path,body,options)=>{
  uploads++;
  assert.equal(options.access,'private');assert.equal(options.token,'private-archive-fixture');
  assert.equal(options.allowOverwrite,false);assert.ok(options.abortSignal instanceof AbortSignal);
  assert.equal(path,'history/private/v3/daily/2026/11/26/'+rosterKey(testRoster)+'/daltons-full.json.gz');
  assert.deepEqual(JSON.parse(gunzipSync(body).toString()),snapshot);
  compressed=Buffer.from(body);blob={url:'https://store-fixture.private.blob.vercel-storage.com/'+path,pathname:path};
  return blob;
};
const getImpl=async(path,options)=>{
  assert.equal(options.access,'private');assert.equal(options.token,'private-archive-fixture');
  assert.equal(options.useCache,false);assert.ok(options.abortSignal instanceof AbortSignal);
  if(!blob||path!==blob.pathname)return null;
  return {statusCode:200,blob,stream:new Response(compressed).body};
};
assert.equal(dailySnapshotStoreConfigured(),false);
await assert.rejects(saveDailySnapshot(snapshot,day,{putImpl}));
assert.equal(uploads,0,'public media credentials must never be used for raw snapshots');
process.env.DALTON_PRIVATE_ARCHIVE_TOKEN='private-archive-fixture';
process.env.VERCEL_ENV='preview';
assert.equal(dailySnapshotStoreConfigured(),false);
await assert.rejects(saveDailySnapshot(snapshot,day,{putImpl}));assert.equal(uploads,0);
process.env.VERCEL_ENV='production';
assert.equal(dailySnapshotStoreConfigured(),true);
assert.equal(await recoverDailySnapshot(day,{getImpl,expectedRoster:testRoster}),null);
const bad=structuredClone(snapshot);
for(const v of Object.values(bad.characters.test)){v.status=503;v.ok=false;v.data={error:'offline'};}
await assert.rejects(saveDailySnapshot(bad,day,{putImpl,expectedRoster:testRoster}),/bestätigtes Charakterprofil/);
assert.equal(uploads,0,'all-endpoints failure is not a valid archive');
const partial=structuredClone(snapshot);partial.characters.test.hunterPets={status:404,ok:false,data:null};
assert.equal(classifySnapshot(partial).status,'partial');
const meta=await saveDailySnapshot(snapshot,day,{putImpl,expectedRoster:testRoster});
assert.equal(meta.archiveStatus,'private');assert.equal(meta.quality.status,'complete');assert.equal(uploads,1);
assert.deepEqual(await recoverDailySnapshot(day,{getImpl,expectedRoster:testRoster}),meta);
assert.equal(uploads,1,'orphaned upload is recovered rather than overwritten');
assert.equal(await recoverDailySnapshot(day,{getImpl,expectedRoster:[{slug:'other',id:321}]}),null,'different roster has independent immutable object path');
const duplicated=structuredClone(snapshot);duplicated.characters.other=structuredClone(duplicated.characters.test);duplicated.characters.other.profile.data.name='Other';
assert.throws(()=>classifySnapshot(duplicated),/Doppelte Profil-ID/);
const errorProfile=structuredClone(snapshot);errorProfile.characters.test.profile.data={id:123,error:'fixture'};
assert.throws(()=>classifySnapshot(errorProfile),/bestätigtes Charakterprofil/);
const errorOptional=structuredClone(snapshot);errorOptional.characters.test.statistics.data={error:'fixture'};
assert.equal(classifySnapshot(errorOptional).status,'partial');
assert.throws(()=>classifySnapshot(snapshot,{expectedRoster:[{slug:'test',id:321}]}),/Profil-ID/);
assert.throws(()=>classifySnapshot(snapshot,{expectedRoster:[{slug:'test',id:null}]}),/Profil-ID nicht/);
const wrongName=structuredClone(snapshot);wrongName.characters.test.profile.data.name='Andere';
assert.throws(()=>classifySnapshot(wrongName,{expectedRoster:testRoster}),/Name oder Stufe/);
const idOnly=structuredClone(snapshot);idOnly.characters.test.profile.data={id:123};
assert.throws(()=>classifySnapshot(idOnly,{expectedRoster:testRoster}),/bestätigtes Charakterprofil/);
const empty=structuredClone(snapshot);empty.characters.test.statistics.data={id:123};
assert.equal(classifySnapshot(empty,{expectedRoster:testRoster}).status,'partial');
const noPutBefore=uploads;
const large=structuredClone(snapshot);large.characters.test.statistics.data={entries:Array.from({length:25000},(_,i)=>({id:i,name:'Synthetic'}))};
await assert.rejects(saveDailySnapshot(large,day,{putImpl,expectedRoster:testRoster,signal:AbortSignal.timeout(1),deadlineAt:performance.now()+1}),/Archivfrist|aborted|timeout|operation/i);
assert.equal(uploads,noPutBefore,'no provider PUT may start after synchronous work exhausted budget');
const started=Date.now();
await assert.rejects(withinArchiveDeadline(()=>delay(1000),AbortSignal.timeout(35)));
assert.ok(Date.now()-started<500,'caller must not wait for SDK backoff');
const monotonicStart=performance.now();
await assert.rejects(withinArchiveDeadline(()=>delay(1000),new AbortController().signal,performance.now()+35),/Archivfrist/);
assert.ok(performance.now()-monotonicStart<500,'independent monotonic deadline bounds the caller');
await assert.rejects(saveDailySnapshot(snapshot,day,{expectedRoster:testRoster,putImpl:async()=>({url:'https://fixture.public.blob.vercel-storage.com/test',pathname:blob.pathname})}),/private URL/);

const proof={date:day,source:'daily',success:1,total:1,roster:testRoster,persisted:true,generatedAt:day+'T05:01:00Z'};
assert.equal(dailyRefreshComplete({date:day,archiveStatus:'disabled',refresh:{persisted:true}},false),false);
assert.equal(dailyRefreshComplete({date:day,archiveStatus:'disabled',refresh:proof},false),true);
assert.equal(dailyRefreshComplete({date:day,archiveStatus:'disabled',refresh:proof},true),false);
assert.equal(dailyRefreshComplete({date:day,archiveStatus:'failed',refresh:proof},true),false);
assert.equal(dailyRefreshComplete({...meta,refresh:{...proof,total:2}},true),false);
assert.equal(dailyRefreshComplete({...meta,refresh:proof},true),true);
assert.equal(dailyRefreshComplete({...meta,refresh:proof,pathname:'wrong',url:meta.url.replace(meta.pathname,'wrong')},true),false);
const {selectDailyReceipt}=await import('./storage-reconciliation.mjs');
const reordered=Object.fromEntries(Object.entries(proof).reverse());
assert.deepEqual(selectDailyReceipt(proof,reordered,day),proof);
assert.equal(dailyRefreshComplete({...meta,refresh:{...proof,roster:[{slug:'other',id:null}]}},true),false);
const pending=await refreshDailyCharacters(day,{takeLock:async()=>null,readReceipt:async()=>{throw Error('No lock')},refresh:async()=>{throw Error('No lock')}});
assert.equal(pending.persisted,false,'Addon write cannot be mistaken for a profile refresh');
let persisted=null,stored=null,privateConfigured=false,failArchive=false,failIndex=false,uploadExists=false,failLock=false,currentSlug='test';
const events=[];
process.env.CRON_SECRET='isolated-cron';
const daily=createDailySnapshotHandler({
  configured:()=>true,blizzardApiConfigured:()=>true,dailySnapshotStoreConfigured:()=>privateConfigured,
  berlinClock:()=>({date:day,hour:5,minute:7}),
  getDailySnapshot:async()=>stored,acquireDailySnapshotLock:async()=>{events.push('lock');if(failLock)throw Error('lock reply unavailable');return 'daily-lock'},
  releaseDailySnapshotLock:async()=>events.push('release'),
  ensurePetRuleState:async()=>{events.push('rules');return {}},
  loadDailyProfileReceipt:async()=>persisted,
  loadCharacters:async()=>{events.push('roster');return {data:{characters:[{slug:currentSlug,blizzardCharacterId:currentSlug==='test'?123:321}]}}},
  recoverDailySnapshot:async()=>{events.push('recover');return uploadExists?meta:null},
  fetchForeverSnapshot:async()=>{events.push('raw');return snapshot},
  saveDailySnapshot:async()=>{events.push('private');if(failArchive)throw Error('fixture archive failed');uploadExists=true;return meta},
  registerDailySnapshot:async(value,token)=>{assert.equal(token,'daily-lock');events.push('register');if(failIndex)throw Error('index unavailable');stored=structuredClone(value)},
  refreshDailyCharacters:async()=>{events.push('refresh');persisted={...proof,roster:[{slug:currentSlug,id:currentSlug==='test'?123:321}]};return persisted},
  publicPetRuleState:()=>({})
});
function response(){return {http:200,value:null,setHeader(){},status(n){this.http=n;return this},json(value){this.value=value}}}
const runDaily=async()=>{const res=response();await daily({method:'GET',headers:{authorization:'Bearer isolated-cron'}},res);return res};
const disabled=await runDaily();
assert.equal(disabled.http,200);assert.equal(stored.archiveStatus,'disabled');assert.deepEqual(stored.refresh,proof);
assert.deepEqual(events,['lock','roster','rules','refresh','register','roster','release']);
events.length=0;assert.equal((await runDaily()).value.reason,'already_completed');assert.deepEqual(events,['lock','roster','register','release']);
events.length=0;privateConfigured=true;failArchive=true;
const failed=await runDaily();assert.equal(failed.http,503);assert.equal(stored.archiveStatus,'failed');
assert.deepEqual(stored.refresh,proof);assert.deepEqual(events,['lock','roster','rules','recover','raw','private','register','release']);
events.length=0;failArchive=false;failIndex=true;
assert.equal((await runDaily()).http,503);assert.equal(uploadExists,true);
assert.deepEqual(events,['lock','roster','rules','recover','raw','private','register','release']);
events.length=0;failIndex=false;
const recovered=await runDaily();assert.equal(recovered.http,200);assert.equal(stored.archiveStatus,'private');assert.equal(recovered.value.recovered,true);
assert.deepEqual(stored.refresh,proof);assert.deepEqual(events,['lock','roster','rules','recover','register','roster','release']);
events.length=0;currentSlug='other';
assert.equal((await runDaily()).http,503,'mismatched recovered archive cannot complete changed roster');
assert.equal(stored.refresh.roster[0].slug,'other');assert.ok(events.includes('refresh'));
events.length=0;failLock=true;assert.equal((await runDaily()).http,503);assert.deepEqual(events,['lock']);failLock=false;
events.length=0;process.env.VERCEL_ENV='preview';
assert.equal((await runDaily()).value.reason,'non_production');assert.deepEqual(events,[]);
process.env.VERCEL_ENV='production';delete process.env.CRON_SECRET;
console.log('F01/F06/F14: private immutable archive, quality gate, orphan recovery and verified daily refresh: OK');
delete process.env.BLOB_STORE_ID;delete process.env.BLOB_READ_WRITE_TOKEN;delete process.env.DALTON_PRIVATE_ARCHIVE_TOKEN;

const date=(minutes=0)=>new Date(Date.now()+minutes*60000).toISOString();
const now=Math.floor(Date.now()/1000);
const payload=(name,id,spells,stamp=now)=>({schemaVersion:1,syncId:id,addon:{build:'71139',gameVersion:'1.60.1',locale:'deDE'},
  sections:{character:{name,classID:8,level:12,capturedAt:stamp},
    spellbook:{capturedAt:stamp,entryCount:spells.length,entries:spells.map(spellID=>({spellID,name:'Feuerball',known:true}))}}});
const old=payload('Audit One','old',[133],now-60),newer=payload('Audit One','new',[133,143],now);
const legacy=structuredClone(old);legacy.sections.locationHistory={entries:[]};legacy.sections.instances={lockouts:[]};
assert.deepEqual(prepareAddonSync(null,legacy).payload.sections.instances,legacy.sections.instances);
assert.deepEqual(prepareAddonSync(null,legacy).payload.sections.locationHistory,legacy.sections.locationHistory);
const legacyNext=structuredClone(legacy);legacyNext.syncId='legacy-next';legacyNext.sections.character.capturedAt++;legacyNext.sections.character.level=13;legacyNext.sections.locationHistory.entries.push({zone:'Test'});
const legacyFollow=prepareAddonSync({payload:legacy},legacyNext);
assert.equal(legacyFollow.payload.sections.character.level,13);
assert.deepEqual(legacyFollow.payload.sections.locationHistory,legacy.sections.locationHistory);
assert.deepEqual(legacyFollow.ignoredSections,[{section:'locationHistory',reason:'legacy_capture_time_missing'}]);
const oldPrep=prepareAddonSync(null,old);
const newerPrep=prepareAddonSync({payload:oldPrep.payload,receipts:oldPrep.receipts},newer);
assert.equal(prepareAddonSync({payload:newerPrep.payload,receipts:newerPrep.receipts},old).duplicate,true);
assert.throws(()=>prepareAddonSync({payload:newerPrep.payload,receipts:newerPrep.receipts},{...old,syncId:'unknown-old'}),/SYNC_CONFLICT/);
assert.throws(()=>prepareAddonSync({payload:newerPrep.payload,receipts:newerPrep.receipts},payload('Audit One','new',[133],now)),/SYNC_CONFLICT/);
const missing=payload('Audit One','missing',[133,143],now+1);delete missing.sections.spellbook;
assert.deepEqual(prepareAddonSync({payload:newerPrep.payload,receipts:newerPrep.receipts},missing).payload.sections.spellbook,newer.sections.spellbook);
console.log('F03: bounded receipts, older capture and identity conflicts, missing-domain preservation: OK');

const hasRedis=['redis-server','redis-cli'].every(command=>spawnSync(command,['--version'],{stdio:'ignore'}).status===0);
if(!hasRedis){
  assert.notEqual(process.env.DALTON_REQUIRE_LOCAL_REDIS,'1','CI must provide real local Redis');
  console.log('F02 real Redis: SKIPPED locally (redis-server / redis-cli absent); mandatory on CI');
}else{
  const dir=mkdtempSync(join(tmpdir(),'dalton-redis-audit-')),socket=join(dir,'redis.sock');
  const server=spawn('redis-server',['--port','0','--unixsocket',socket,'--unixsocketperm','700','--save','','--appendonly','no','--dir',dir],{stdio:'ignore'});
  let restrictedUser=null,database=0;
  const cli=(...args)=>{
    const auth=restrictedUser?['--user',restrictedUser,'--pass','local-fixture-password','--no-auth-warning']:[];
    const r=spawnSync('redis-cli',['-s',socket,'-n',String(database),'--json','-e',...auth,...args.map(String)],{encoding:'utf8',timeout:5000});
    if(r.error||r.status!==0)throw Error((r.stderr||r.stdout||r.error?.message||'Redis failed').trim());
    try{return JSON.parse(r.stdout);}catch{throw Error(r.stdout.trim());}
  };
  try{
    for(let i=0;i<100&&!existsSync(socket);i++)await delay(20);
    assert.equal(cli('PING'),'PONG');
    process.env.UPSTASH_REDIS_REST_URL='https://offline-audit.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN='isolated-fixture';
    process.env.DALTON_SYNC_TOKEN='isolated-fixture';
    const {default:addon,createAddonSyncHandler}=await import('../api/addon-sync.js');
    const boundedAddon=createAddonSyncHandler({workMs:700,cleanupUntilMs:1200});
    const {ADDON_LEASE_SECONDS,runSyncDeadline}=await import('./sync-deadline.mjs');
    assert.equal(ADDON_LEASE_SECONDS,22);
    const rosterKey='dalton-dashboard:characters:v1',lockKey='dalton-dashboard:refresh:lock',versionKey='dalton-dashboard:core:compact:v2:production';
    const syncKey=slug=>'dalton-dashboard:addon-sync:v1:production:'+slug;
    cli('SET',rosterKey,JSON.stringify({generatedAt:date(-4),characters:[
      {slug:'audit-one',name:'Audit One',classId:8,level:12},
      {slug:'audit-two',name:'Audit Two',classId:8,level:12}
    ]}));
    const classFixture=encodeCompactMaster({observedBuild:'1.60.1.71139',classMaster:{slug:'mage',abilities:[{ranks:[{id:133},{id:143}]}]}});
    let mode=null,proofTarget=null,restoreProof=null,collisionTarget=null,lateCommand=null,stalledRelease=null,stallObserved=false,releaseRead=null,readReached=null,previewObserved=null,previewRelease=null;const observedPreview=new Promise(r=>{previewObserved=r}),continuePreview=new Promise(r=>{previewRelease=r});
    const waitRead=new Promise(r=>{readReached=r}),continueRead=new Promise(r=>{releaseRead=r});
    let pauseFirst=true;
    globalThis.fetch=async(url,options={})=>{
      assert.equal(String(url),'https://offline-audit.invalid','all real destinations blocked');
      const cmd=JSON.parse(options.body),[op,key]=cmd;
      try{
        if(op==='GET'&&key===rosterKey&&pauseFirst){
          pauseFirst=false;assert.ok(cli('GET',lockKey));readReached();await continueRead;
        }
        if(op==='GET'&&key==='dalton-dashboard:foreverdb:class-master:v9:mage:1.60.1.71139:gz1')return Response.json({result:classFixture});
        if(op==='HMGET'&&key.includes('class-'))return Response.json({result:cmd.slice(2).map(id=>JSON.stringify({id:Number(id),name:'Feuerball',rank:'Rang'}))});
        const isSync=op==='EVAL'&&cmd[3]?.includes(':addon-sync:');
        if(isSync&&mode==='lose-before'){cli('SET',lockKey,'other-owner');mode=null;}
        if(isSync&&mode==='fail-before'){mode=null;throw Error('fixture interruption before commit');}
        if(isSync&&mode==='drop-after'){mode=null;cli(...cmd);throw Error('fixture response lost after commit');}
        if(op==='SET'&&key.includes(':history:daily:lock:')&&mode==='drop-lock-reply'){mode=null;cli(...cmd);throw Error('fixture lock response lost');}
        if(op==='EVAL'&&cmd[3]?.includes(':live-knowledge:')&&mode==='fail-knowledge'){mode=null;throw Error('fixture interrupted before knowledge write');}
        const knowledgeCommit=op==='EVAL'&&cmd[3]==='dalton-dashboard:live-knowledge:v1:production:records:v2'&&cmd.length>=18;
        if(mode==='empty-record-before-commit'&&knowledgeCommit){
          mode=null;assert.equal(cmd[18],'0');cli('HSET',cmd[3],cmd[6],'');
        }
        if(mode==='stall-proof-read'&&op==='HGET'&&cmd[2]===proofTarget){
          mode=null;stallObserved=true;await new Promise(resolve=>{stalledRelease=resolve});
        }
        if(mode==='defer-acquire'&&op==='EVAL'&&cmd[3]===lockKey&&cmd[1].includes('addon-lock-acquire:v1')){
          mode=null;lateCommand=cmd;throw Error('fixture acquisition transport lost before execution');
        }
        if(mode==='defer-observation-and-cleanup'&&knowledgeCommit){
          mode='stall-release';lateCommand=cmd;stallObserved=true;await new Promise(resolve=>{stalledRelease=resolve});
          return Response.json({result:'delayed transport'});
        }
        if(mode==='stall-lock-reply'&&op==='EVAL'&&cmd[3]===lockKey&&cmd[1].includes('addon-lock-acquire:v1')){
          mode=null;assert.equal(cli(...cmd),'OK');stallObserved=true;
          assert.ok(cli('PTTL',lockKey)>0&&cli('PTTL',lockKey)<=22000);
          await new Promise(resolve=>{stalledRelease=resolve});
          return Response.json({result:'OK'});
        }
        if(mode==='stall-release'&&op==='EVAL'&&cmd[3]===lockKey&&String(cmd[1]).includes("redis.call('DEL'")){
          mode=null;stallObserved=true;await new Promise(resolve=>{stalledRelease=resolve});
          return Response.json({result:0});
        }
        if((mode==='fail-proof-read'||mode==='persistent-proof-read')&&op==='HGET'&&cmd[2]===proofTarget){if(mode==='fail-proof-read')mode=null;throw Error('fixture proof read unavailable');}
        if(mode==='restore-proof-before-commit'&&knowledgeCommit){
          mode=null;
          const checked=JSON.parse(cmd[17]);
          assert.ok(checked.some(([field,raw])=>field===proofTarget&&raw===null),'missing proof must be fenced even with additional v1 references');
          assert.equal(new Set(checked.map(([field])=>field)).size,checked.length);
          cli('HSET',cmd[3],proofTarget,restoreProof);
        }
        if(mode==='drop-proof-before-commit'&&knowledgeCommit){mode=null;cli('HDEL',cmd[3],proofTarget);}
        if(mode==='collide-before-commit'&&knowledgeCommit&&String(cmd[14]).startsWith('__quarantine:v1:')){
          mode=null;collisionTarget=cmd[14];cli('HSET',cmd[3],collisionTarget,'{"corrupt-fixture":true}');
        }
        const result=cli(...cmd);
        if(mode==='hold-preview-observation'&&op==='EVAL'&&cmd[3]==='dalton-dashboard:live-knowledge:v1:preview:records:v2'){
          mode=null;previewObserved();await continuePreview;
        }
        return Response.json({result});
      }catch(error){return Response.json({error:String(error.message)});}
    };
    const call=async (body,handler=addon)=>{const res=response();await handler({method:'POST',headers:{authorization:'Bearer isolated-fixture'},body},res);return res};
    const firstCall=call(old);await waitRead;
    const vars=parseLuaSavedVariable(readFileSync(new URL('./fixtures/bridge-savedvariables.lua',import.meta.url),'utf8'));
    vars.character.name='Audit Two';vars.character.level=12;
    for(const name of ['character','spellbook','location'])vars[name].capturedAt=now;
    const secondPayload=buildSafeAddonSyncPayload(vars,{syncId:'savedvariables-v1'});
    assert.equal(secondPayload.sections.locationHistory.capturedAt,undefined);
    assert.equal(secondPayload.sections.instances.capturedAt,undefined);
    assert.equal((await call(secondPayload)).http,409);
    releaseRead();
    assert.equal((await firstCall).http,200);
    assert.equal((await call(secondPayload)).http,200);
    const roster=()=>JSON.parse(cli('GET',rosterKey));
    const ids=slug=>roster().characters.find(x=>x.slug===slug).knownClassAbilities.map(x=>x.id).sort((a,b)=>a-b);
    assert.deepEqual(ids('audit-one'),[133]);assert.deepEqual(ids('audit-two'),[133,143]);
    const oldState=cli('GET',syncKey('audit-one')),oldRoster=cli('GET',rosterKey);
    mode='fail-before';
    assert.equal((await call(newer)).http,503);assert.equal(cli('GET',rosterKey),oldRoster);assert.equal(cli('GET',syncKey('audit-one')),oldState);
    mode='lose-before';
    assert.equal((await call(newer)).http,503);assert.equal(cli('GET',rosterKey),oldRoster);assert.equal(cli('GET',syncKey('audit-one')),oldState);assert.equal(cli('GET',lockKey),'other-owner');
    cli('DEL',lockKey);
    mode='drop-after';
    assert.equal((await call(newer)).http,503);assert.deepEqual(ids('audit-one'),[133,143]);
    assert.equal((await call(newer)).value.duplicate,true);
    assert.equal((await call(old)).value.duplicate,true);
    assert.deepEqual(ids('audit-one'),[133,143]);assert.equal((await loadAddonSyncState('audit-one')).payload.syncId,'new');
    assert.equal((await call({...old,syncId:'unrecognized-old'})).http,409);
    const snapshotBefore=cli('GET',rosterKey),stateBefore=cli('GET',syncKey('audit-one'));
    cli('DEL',versionKey);cli('HSET',versionKey,'bad','type');
    const third=payload('Audit One','third',[133],now+1);
    assert.equal((await call(third)).http,503);assert.equal(cli('GET',rosterKey),snapshotBefore);assert.equal(cli('GET',syncKey('audit-one')),stateBefore);
    cli('DEL',versionKey);
    cli('ACL','SETUSER','limited-sync','on','>local-fixture-password','~*','+@all','-mset');
    const beforeACL=[cli('GET',rosterKey),cli('GET',syncKey('audit-one')),cli('GET',versionKey)];
    restrictedUser='limited-sync';
    const aclFailure=await call(third);
    restrictedUser=null;
    assert.equal(aclFailure.http,503);assert.match(aclFailure.value.error,/NOPERM|ACL|permission|can't run this command/i);
    assert.deepEqual([cli('GET',rosterKey),cli('GET',syncKey('audit-one')),cli('GET',versionKey)],beforeACL);
    cli('ACL','DELUSER','limited-sync');
    const observation=payload('Audit One','observation',[133,143],now+2);
    observation.sections.interactions={capturedAt:now+2,trainerHistory:[{capturedAt:now+2,complete:true,npc:{id:12345,name:'Test Trainer'},location:{zone:'Test'},services:[{name:'Test Ability',priceCopper:10}]}]};
    mode='fail-knowledge';
    assert.equal((await call(observation)).http,503);
    assert.equal((await loadAddonSyncState('audit-one')).payload.syncId,'observation');
    const knowledgeIndex='dalton-dashboard:live-knowledge:v1:production:records:v2';
    const knowledgeRecords=()=>cli('HKEYS',knowledgeIndex).filter(key=>key.includes(':record:'));
    assert.equal(knowledgeRecords().length,0);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,true);
    const later=payload('Audit One','later',[133,143],now+3);
    const repair=await call(later);
    assert.equal(repair.http,200);assert.equal(repair.value.duplicate,false);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,false);
    assert.equal(knowledgeRecords().length,1);
    const knowledgeKey=knowledgeRecords()[0];
    const record=cli('HGET',knowledgeIndex,knowledgeKey);
    assert.equal(JSON.parse(record).observationCount,1);
    const restamped=structuredClone(observation);restamped.sections.interactions.trainerHistory[0].capturedAt++;
    const retry=await call(restamped);assert.equal(retry.value.duplicate,true);assert.equal(cli('HGET',knowledgeIndex,knowledgeKey),record);
    const twoPrices=payload('Audit One','two-prices',[133,143],now+4);
    const trainer=(priceCopper)=>({capturedAt:now+4,complete:true,npc:{id:12345,name:'Test Trainer'},services:[{name:'Test Ability',priceCopper}]});
    twoPrices.sections.interactions={capturedAt:now+4,trainerHistory:[trainer(20),trainer(30)]};
    assert.equal((await call(twoPrices)).http,200);
    const priced=JSON.parse(cli('HGET',knowledgeIndex,knowledgeKey));
    assert.equal(priced.observationCount,3);assert.equal(priced.services[0].priceCopper,30);
    assert.ok(priced.changes.some(x=>x.sameSecond===true&&x.previousEntries[0].priceCopper===20&&x.entries[0].priceCopper===30));
    // Actual scoped preview lock: hold the response after writing the
    // earlier observation, then try the later request before the ack.
    const beforePreview=cli('GET',syncKey('audit-one'));
    process.env.VERCEL_ENV='preview';
    try{
      const early=payload('Audit One','preview-first',[133],now+5);
      early.sections.interactions={capturedAt:now+5,trainerHistory:[{capturedAt:now+5,complete:true,npc:{id:12345,name:'Test Trainer'},services:[{name:'Test Ability',priceCopper:10}]}]};
      const late=payload('Audit One','preview-second',[133,143],now+6);
      mode='hold-preview-observation';const firstPreview=call(early);await observedPreview;
      assert.equal((await call(late)).http,409);
      previewRelease();assert.equal((await firstPreview).http,200);
      assert.equal((await call(late)).http,200);
      const finalPreview=await loadAddonSyncState('audit-one');
      assert.equal(finalPreview.payload.syncId,'preview-second');
      assert.ok(finalPreview.receipts.some(x=>x.id==='preview-first')&&finalPreview.receipts.some(x=>x.id==='preview-second'));
      assert.equal(cli('GET',syncKey('audit-one')),beforePreview,'preview must not change production state');
      assert.equal(cli('GET',lockKey+':preview-addon'),null);
    }finally{previewRelease();process.env.VERCEL_ENV='production';}
    const refreshLock=await acquireRefreshLock();
    const actualProof={...proof,success:2,total:2,roster:[{slug:'audit-one',id:null},{slug:'audit-two',id:null}]};
    const nextRoster={...roster(),generatedAt:actualProof.generatedAt};
    await saveCharacters(nextRoster,refreshLock,{dailyReceipt:actualProof});
    await releaseRefreshLock(refreshLock);
    assert.deepEqual(await loadDailyProfileReceipt(day),actualProof);
    mode='drop-lock-reply';
    const guard=await acquireDailySnapshotLock(day);
    assert.ok(guard);assert.equal(cli('GET','dalton-dashboard:history:daily:lock:'+day),guard);
    await registerDailySnapshot({...meta,refresh:actualProof},guard);
    assert.equal((await getDailySnapshot(day)).sha256,meta.sha256);
    const lastKey='dalton-dashboard:history:daily:last:v1';
    assert.equal((await getLastDailySnapshot()).date,day);
    await releaseDailySnapshotLock(day,guard);
    await assert.rejects(registerDailySnapshot({...meta,refresh:actualProof},guard),/DAILY_LOCK_LOST/);
    const aclDay='2026-11-27',aclLock=await acquireDailySnapshotLock(aclDay);
    cli('ACL','SETUSER','limited-index','on','>local-fixture-password','~*','+@all','-hset');
    restrictedUser='limited-index';
    await assert.rejects(registerDailySnapshot({date:aclDay,archiveStatus:'disabled'},aclLock),/NOPERM|ACL|permission|can't run this command/i);
    restrictedUser=null;
    assert.equal(await getDailySnapshot(aclDay),null);assert.equal((await getLastDailySnapshot()).date,day);assert.equal(cli('GET',lastKey),null,'legacy pointer is never dual-written');
    cli('ACL','DELUSER','limited-index');await releaseDailySnapshotLock(aclDay,aclLock);
    const older='2026-11-25',olderLock=await acquireDailySnapshotLock(older);
    await registerDailySnapshot({date:older,archiveStatus:'disabled'},olderLock);
    assert.equal((await getLastDailySnapshot()).date,day,'last pointer cannot move backwards');
    await releaseDailySnapshotLock(older,olderLock);
    // Re-upgrade: an intervening v1 write must never hide newer daily data.
    const newDay='2026-11-28',newRow={date:newDay,archiveStatus:'disabled'};
    cli('HSET','dalton-dashboard:history:daily:index:v1',newDay,JSON.stringify(newRow));cli('SET',lastKey,JSON.stringify(newRow));
    assert.equal((await getLastDailySnapshot()).date,newDay);
    const oldDayLock=await acquireDailySnapshotLock(older);
    await registerDailySnapshot({date:older,archiveStatus:'disabled'},oldDayLock);
    await releaseDailySnapshotLock(older,oldDayLock);
    assert.equal((await getLastDailySnapshot()).date,newDay);
    const legacyReceipt={...actualProof,generatedAt:day+'T06:00:00Z'};
    cli('HSET','dalton-dashboard:data-version:meta:v1','daily-profile-refresh',JSON.stringify(legacyReceipt));
    assert.deepEqual(await loadDailyProfileReceipt(day),legacyReceipt);
    // Prepare an offline old-reader projection from both formats and restore
    // it into a separate local DB, not into the active source database.
    const sourceRoster=roster(),states=[await loadAddonSyncState('audit-one'),await loadAddonSyncState('audit-two')];
    const modernRecord=JSON.parse(cli('HGET',knowledgeIndex,knowledgeKey));
    const legacyRecord=structuredClone(modernRecord);
    legacyRecord.latestSnapshot.capturedAt=new Date((now+8)*1000).toISOString();
    legacyRecord.lastObservedAt=legacyRecord.latestSnapshot.capturedAt;
    legacyRecord.latestSnapshot.entries[0].priceCopper=40;legacyRecord.services[0].priceCopper=40;legacyRecord.services[0].lastSeenAt=legacyRecord.lastObservedAt;
    legacyRecord.observationIds.push('intervening-legacy-fixture');
    const {summarizeRestoreInventory}=await import('./restore-inventory.mjs');
    const input={roster:sourceRoster,addonStates:states,knowledgePairs:[{key:knowledgeKey,modern:JSON.stringify(modernRecord),legacy:JSON.stringify(legacyRecord)}],
      dailyRows:[await getDailySnapshot(day),newRow],quarantineRecords:[],petMetadata:null,modernReceipt:actualProof,legacyReceipt,date:day,scope:'production'};
    input.inventory=summarizeRestoreInventory(input);
    for(const patch of [{date:'2026-11-25'},{scope:'preview'},{petMetadata:{changed:true}},{modernReceipt:null},{legacyReceipt:null}]){
      assert.throws(()=>buildLegacyReadProjection({...input,...patch}),/Inventurdifferenz/);
    }
    const markerInput={...input,knowledgePairs:[{...input.knowledgePairs[0],modern:JSON.stringify({...modernRecord,migrationRepair:{quarantineDigest:'a'.repeat(64),legacyDigest:null,resolvedAt:modernRecord.lastObservedAt}})}]};
    markerInput.inventory=summarizeRestoreInventory(markerInput);
    assert.throws(()=>buildLegacyReadProjection(markerInput),/Referenzierter Quarantänebeleg/);
    assert.throws(()=>buildLegacyReadProjection({...input,knowledgePairs:[{...input.knowledgePairs[0],legacy:null}]}),/Inventurdifferenz/);
    assert.throws(()=>buildLegacyReadProjection({...input,knowledgePairs:[{key:knowledgeKey,modern:JSON.stringify(modernRecord)}]}),/Beide Seiten/);
    const projection=buildLegacyReadProjection(input);
    assert.equal(projection.manifest.latestDate,newDay);assert.equal(projection.manifest.observations,1);
    assert.throws(()=>buildLegacyReadProjection({...input,knowledgePairs:[]}),/Export-Inventur/);
    const conflictLegacy=structuredClone(modernRecord);conflictLegacy.observationIds=['disjoint'];conflictLegacy.latestSnapshot.entries[0].priceCopper=99;
    const conflictInput={...input,knowledgePairs:[{key:knowledgeKey,modern:JSON.stringify(modernRecord),legacy:JSON.stringify(conflictLegacy)}]};
    conflictInput.inventory=summarizeRestoreInventory(conflictInput);
    const conflictedProjection=buildLegacyReadProjection(conflictInput);
    assert.equal(conflictedProjection.manifest.completeForLegacyReaders,false);assert.equal(conflictedProjection.manifest.quarantined.length,1);
    assert.ok(conflictedProjection.commands.some(c=>c[0]==='HSET'&&c[2].startsWith('__quarantine:v1:')));
    assert.ok(!conflictedProjection.commands.some(c=>c[0]==='SET'&&c[1]===knowledgeKey));
    const pendingInput={...input,addonStates:[{...states[0],pendingObservations:true},states[1]]};
    assert.throws(()=>buildLegacyReadProjection(pendingInput),/Inventurdifferenz/);
    pendingInput.inventory=summarizeRestoreInventory(pendingInput);
    assert.throws(()=>buildLegacyReadProjection(pendingInput),/Ausstehende Beobachtungen/);
    const rawRoster=cli('GET',rosterKey),rawStates=states.map(state=>[syncKey(state.characterSlug),cli('GET',syncKey(state.characterSlug))]);
    database=1;
    try{
      assert.equal(cli('DBSIZE'),0);
      for(const command of projection.commands)cli(...command);
      assert.deepEqual(JSON.parse(cli('GET',rosterKey)),JSON.parse(rawRoster));
      for(const [key,value] of rawStates)assert.deepEqual(JSON.parse(cli('GET',key)),JSON.parse(value));
      assert.equal(JSON.parse(cli('HGET','dalton-dashboard:data-version:meta:v1','addon:production:audit-one')).syncId,states[0].payload.syncId);
      assert.equal(JSON.parse(cli('GET',knowledgeKey)).latestSnapshot.entries[0].priceCopper,40);
      assert.equal(JSON.parse(cli('GET',lastKey)).date,newDay);
      assert.equal(cli('SISMEMBER','dalton-dashboard:live-knowledge:v1:production:index',knowledgeKey),1);
      const {loadLiveKnowledge}=await import('./live-knowledge-store.mjs');
      assert.equal((await loadLiveKnowledge()).find(x=>x.npc.id===12345).latestSnapshot.entries[0].priceCopper,40);
      assert.deepEqual(await loadDailyProfileReceipt(day),legacyReceipt);
    }finally{database=0;}
    assert.equal(cli('GET',rosterKey),rawRoster,'offline projection never changes the source');
    const {loadLiveKnowledge,publicLiveKnowledgeSummary}=await import('./live-knowledge-store.mjs');
    const legacyIndex='dalton-dashboard:live-knowledge:v1:production:index';
    const conflictRaw=JSON.stringify(conflictLegacy);
    cli('SET',knowledgeKey,conflictRaw);cli('SADD',legacyIndex,knowledgeKey);
    const independentKey=knowledgeKey.replace('id-12345','id-12346');
    const independent={...modernRecord,npc:{id:12346,name:'Independent'},latestSnapshot:{...modernRecord.latestSnapshot,npc:{id:12346,name:'Independent'}}};
    cli('HSET',knowledgeIndex,independentKey,JSON.stringify(independent));
    const ambiguous=await loadLiveKnowledge();
    assert.equal(ambiguous.length,1);assert.equal(ambiguous[0].npc.id,12346);
    assert.equal(publicLiveKnowledgeSummary(ambiguous).excludedIntegrityRecords,1);
    const readQuarantine=cli('HKEYS',knowledgeIndex).filter(k=>k.startsWith('__quarantine:v1:'));
    assert.ok(readQuarantine.some(k=>JSON.parse(cli('HGET',knowledgeIndex,k)).legacyRaw===conflictRaw),'Read conflict is durably preserved before next legacy write');
    const replacement=JSON.stringify({...conflictLegacy,observationIds:['replaced']});
    cli('SET',knowledgeKey,replacement);
    assert.ok(readQuarantine.some(k=>JSON.parse(cli('HGET',knowledgeIndex,k)).legacyRaw===conflictRaw));
    cli('SET',knowledgeKey,conflictRaw);
    await loadLiveKnowledge();
    assert.deepEqual(cli('HKEYS',knowledgeIndex).filter(k=>k.startsWith('__quarantine:v1:')).sort(),readQuarantine.sort(),'Repeat read does not grow quarantine');
    // Older observation of an unresolved pair is durably quarantined, not
    // asserted as current; a strictly later one can repair the active view.
    const conflictSync=payload('Audit One','conflict-sync',[133,143],now+9);
    conflictSync.sections.interactions={capturedAt:now+9,trainerHistory:[trainer(98)]};
    const conflicted=await call(conflictSync);assert.equal(conflicted.http,200);assert.equal(conflicted.value.liveKnowledge.quarantined,1);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,false);
    assert.equal(cli('GET',knowledgeKey),conflictRaw);
    assert.ok(cli('HKEYS',knowledgeIndex).some(k=>k.startsWith('__quarantine:v1:')));
    const fresh=payload('Audit One','fresh-evidence',[133,143],now+10);
    fresh.sections.interactions={capturedAt:now+10,trainerHistory:[{...trainer(50),capturedAt:now+10}]};
    const repaired=await call(fresh);assert.equal(repaired.http,200);assert.equal(repaired.value.liveKnowledge.repaired,1);
    const freshRows=await loadLiveKnowledge();assert.equal(freshRows.find(x=>x.npc.id===12345).latestSnapshot.entries[0].priceCopper,50);
    assert.equal(cli('GET',knowledgeKey),conflictRaw);
    cli('SET',knowledgeKey,'{broken-json');
    const damaged=await loadLiveKnowledge();assert.equal(damaged.length,1);assert.equal(publicLiveKnowledgeSummary(damaged).excludedIntegrityRecords,1);
    const repairBroken=payload('Audit One','repair-broken',[133,143],now+11);
    repairBroken.sections.interactions={capturedAt:now+11,trainerHistory:[{...trainer(60),capturedAt:now+11}]};
    const brokenResult=await call(repairBroken);assert.equal(brokenResult.http,200);assert.equal(brokenResult.value.liveKnowledge.quarantined,1);
    assert.ok(!(await loadLiveKnowledge()).some(x=>x.npc.id===12345),'unknown capture ordering never repairs automatically');
    assert.equal(cli('GET',knowledgeKey),'{broken-json');
    assert.equal(JSON.parse(cli('HGET',knowledgeIndex,knowledgeKey)).latestSnapshot.entries[0].priceCopper,50);
    // Malformed structure with a valid future capture must still fence
    // earlier repairs. No published price is rolled back.
    const invalidLater=JSON.parse(cli('HGET',knowledgeIndex,knowledgeKey));
    invalidLater.latestSnapshot.capturedAt=new Date((now+15)*1000).toISOString();
    invalidLater.latestSnapshot.entries=null;
    cli('SET',knowledgeKey,JSON.stringify(invalidLater));
    const earlyRepair=payload('Audit One','repair-too-early',[133,143],now+12);
    earlyRepair.sections.interactions={capturedAt:now+12,trainerHistory:[{...trainer(70),capturedAt:now+12}]};
    const earlyResult=await call(earlyRepair);assert.equal(earlyResult.http,200);assert.equal(earlyResult.value.liveKnowledge.quarantined,1);
    assert.equal(JSON.parse(cli('HGET',knowledgeIndex,knowledgeKey)).latestSnapshot.entries[0].priceCopper,50);
    const lateRepair=payload('Audit One','repair-after-floor',[133,143],now+16);
    lateRepair.sections.interactions={capturedAt:now+16,trainerHistory:[{...trainer(80),capturedAt:now+16}]};
    const lateResult=await call(lateRepair);assert.equal(lateResult.http,200);assert.equal(lateResult.value.liveKnowledge.repaired,1);
    assert.equal((await loadLiveKnowledge()).find(x=>x.npc.id===12345).latestSnapshot.entries[0].priceCopper,80);
    // Both storage halves are subject to the same repair proof contract.
    const repairedRaw=cli('HGET',knowledgeIndex,knowledgeKey),legacyBefore=cli('GET',knowledgeKey);
    const repairedMarker=JSON.parse(repairedRaw).migrationRepair;
    proofTarget='__quarantine:v1:'+repairedMarker.quarantineDigest;
    const validProof=cli('HGET',knowledgeIndex,proofTarget);
    assert.ok(validProof);
    cli('HDEL',knowledgeIndex,knowledgeKey);cli('SET',knowledgeKey,repairedRaw);
    assert.equal((await loadLiveKnowledge()).find(x=>x.npc.id===12345).latestSnapshot.entries[0].priceCopper,80);
    cli('HDEL',knowledgeIndex,proofTarget);
    const legacyMissing=await loadLiveKnowledge();
    assert.ok(!legacyMissing.some(x=>x.npc.id===12345));
    assert.equal(legacyMissing.integrityIssues.find(x=>x.key===knowledgeKey).reason,'missing_repair_evidence');
    cli('SET',knowledgeKey,legacyBefore);
    cli('HSET',knowledgeIndex,knowledgeKey,repairedRaw,proofTarget,validProof);
    // A single proof read failure must not discard the healthy neighbour.
    mode='fail-proof-read';
    const unavailable=await loadLiveKnowledge();
    assert.ok(unavailable.some(x=>x.npc.id===12346));
    assert.ok(!unavailable.some(x=>x.npc.id===12345));
    assert.equal(unavailable.integrityIssues.find(x=>x.key===knowledgeKey).reason,'repair_evidence_unavailable');
    assert.equal((await loadLiveKnowledge()).find(x=>x.npc.id===12345).latestSnapshot.entries[0].priceCopper,80);
    // Transient proof read: retry without losing the fresh capture.
    const transient=payload('Audit One','transient-proof',[133,143],now+17);
    transient.sections.interactions={capturedAt:now+17,trainerHistory:[{...trainer(81),capturedAt:now+17}]};
    mode='fail-proof-read';
    assert.equal((await call(transient)).http,200);
    assert.equal((await loadLiveKnowledge()).find(x=>x.npc.id===12345).latestSnapshot.entries[0].priceCopper,81);
    const pending=payload('Audit One','persistent-proof',[133,143],now+18);
    pending.sections.interactions={capturedAt:now+18,trainerHistory:[{...trainer(82),capturedAt:now+18}]};
    mode='persistent-proof-read';
    assert.equal((await call(pending)).http,503);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,true);
    mode=null;
    assert.equal((await call(pending)).value.duplicate,true);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,false);
    assert.equal((await loadLiveKnowledge()).find(x=>x.npc.id===12345).latestSnapshot.entries[0].priceCopper,82);
    // Negative proof state is fenced too: restore it before CAS.
    cli('HDEL',knowledgeIndex,proofTarget);restoreProof=validProof;
    const recovered=payload('Audit One','restore-negative-proof',[133,143],now+19);
    recovered.sections.interactions={capturedAt:now+19,trainerHistory:[{...trainer(83),capturedAt:now+19}]};
    mode='restore-proof-before-commit';
    const recoveredResponse=await call(recovered);assert.equal(recoveredResponse.http,200,JSON.stringify(recoveredResponse.value));assert.equal(recoveredResponse.value.liveKnowledge.stored,1);
    assert.equal((await loadLiveKnowledge()).find(x=>x.npc.id===12345).latestSnapshot.entries[0].priceCopper,83);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,false);
    // A non-cooperative provider read must not consume the whole function
    // window or keep the global lease held. Resume the exact durable outbox.
    const timed=payload('Audit One','bounded-proof-timeout',[133,143],now+20);
    timed.sections.interactions={capturedAt:now+20,trainerHistory:[{...trainer(84),capturedAt:now+20}]};
    mode='stall-proof-read';stallObserved=false;const timeoutStart=performance.now();
    const timedResult=await call(timed,boundedAddon);
    assert.equal(timedResult.http,503);assert.ok(stallObserved);
    assert.ok(performance.now()-timeoutStart<1800,'shared deadline and cleanup must bound caller');
    assert.equal(cli('GET',lockKey),null);
    const savedPending=await loadAddonSyncState('audit-one');
    assert.equal(savedPending.pendingObservations,true);
    assert.equal(savedPending.pendingObservationPayload.sections.interactions.trainerHistory[0].services[0].priceCopper,84);
    const rawBeforeLate=cli('HGET',knowledgeIndex,knowledgeKey);
    stalledRelease();await delay(30);
    assert.equal(cli('HGET',knowledgeIndex,knowledgeKey),rawBeforeLate,'late response must not start another commit');
    assert.equal((await call(payload('Audit Two','after-deadline-other',[133,143],now+20))).http,200);
    assert.equal((await call(timed)).http,200);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,false);
    assert.equal((await loadLiveKnowledge()).find(x=>x.npc.id===12345).latestSnapshot.entries[0].priceCopper,84);
    const beforeRace=cli('HGET',knowledgeIndex,knowledgeKey);
    // Delete a verified proof after validation but before the atomic commit.
    // Retry must quarantine the new capture, not publish price 85.
    const raced=payload('Audit One','raced-proof',[133,143],now+21);
    raced.sections.interactions={capturedAt:now+21,trainerHistory:[{...trainer(85),capturedAt:now+21}]};
    mode='drop-proof-before-commit';
    const raceResult=await call(raced);
    assert.equal(raceResult.http,200);assert.equal(raceResult.value.liveKnowledge.quarantined,1);
    assert.equal(cli('HGET',knowledgeIndex,knowledgeKey),beforeRace);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,false);
    assert.ok(!(await loadLiveKnowledge()).some(x=>x.npc.id===12345));
    // Collision discovered only inside the write CAS. Preserve corrupt
    // bytes in place and use a new content-addressed envelope.
    const collision=payload('Audit One','collision-recovery',[133,143],now+22);
    collision.sections.interactions={capturedAt:now+22,trainerHistory:[{...trainer(86),capturedAt:now+22}]};
    mode='collide-before-commit';
    const collisionResult=await call(collision);
    assert.equal(collisionResult.http,200);assert.equal(collisionResult.value.liveKnowledge.quarantined,1);
    assert.equal(cli('HGET',knowledgeIndex,collisionTarget),'{"corrupt-fixture":true}');
    assert.ok(cli('HKEYS',knowledgeIndex).filter(k=>k.startsWith('__quarantine:v1:')).some(k=>{
      const q=JSON.parse(cli('HGET',knowledgeIndex,k));
      return q.collision?.field===collisionTarget&&q.collision.raw==='{"corrupt-fixture":true}'&&q.incoming?.entries?.[0]?.priceCopper===86;
    }));
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,false);
    assert.equal((await call(payload('Audit One','after-collision-core',[133,143],now+23))).http,200);
    // Reader-only collision in real Redis; never overwrite primary.
    const {knowledgeQuarantine}=await import('./storage-reconciliation.mjs');
    const readQ=knowledgeQuarantine(knowledgeKey,beforeRace,cli('GET',knowledgeKey),'missing_repair_evidence');
    cli('HSET',knowledgeIndex,readQ.field,'corrupt read primary');
    const readConflict=await loadLiveKnowledge();
    assert.equal(readConflict.integrityIssues.find(x=>x.key===knowledgeKey).preserved,true);
    assert.equal(cli('HGET',knowledgeIndex,readQ.field),'corrupt read primary');
    const alternate=cli('HKEYS',knowledgeIndex).filter(k=>k.startsWith('__quarantine:v1:')).find(k=>{
      try{const q=JSON.parse(cli('HGET',knowledgeIndex,k));return q.collision?.field===readQ.field&&q.incoming===null&&q.modernRaw===beforeRace;}catch{return false;}
    });
    assert.ok(alternate);
    const qCount=cli('HLEN',knowledgeIndex);
    await loadLiveKnowledge();assert.equal(cli('HLEN',knowledgeIndex),qCount);
    // Wrong-type legacy key: retain the source list; no active price,
    // persist the incoming observation without blocking later core sync.
    cli('DEL',knowledgeKey);cli('RPUSH',knowledgeKey,'original-list-value');
    const badType=await loadLiveKnowledge();
    assert.ok(!badType.some(x=>x.npc.id===12345));
    assert.equal(publicLiveKnowledgeSummary(badType).unpreservedIntegrityRecords,1);
    const typedSync=payload('Audit One','typed-conflict',[133,143],now+24);
    typedSync.sections.interactions={capturedAt:now+24,trainerHistory:[{...trainer(90),capturedAt:now+24}]};
    const typedResult=await call(typedSync);
    assert.equal(typedResult.http,200);assert.equal(typedResult.value.liveKnowledge.quarantined,1);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,false);
    assert.deepEqual(cli('LRANGE',knowledgeKey,0,-1),['original-list-value']);
    // Corrupt an existing evidence field; neither listing nor HSETNX
    // existence can count as successful preservation.
    const typeProof=cli('HKEYS',knowledgeIndex).filter(k=>k.startsWith('__quarantine:v1:')).find(k=>{try{const q=JSON.parse(cli('HGET',knowledgeIndex,k));return q.reason==='invalid_storage_type'&&q.incoming===null;}catch{return false;}});
    assert.ok(typeProof);
    cli('HSET',knowledgeIndex,typeProof,'{"corrupt":true}');
    assert.equal(publicLiveKnowledgeSummary(await loadLiveKnowledge()).unpreservedIntegrityRecords,1);
    // Missing and empty values are not interchangeable CAS states.
    const emptyKey=knowledgeKey.replace('id-12345','id-12347');
    const emptySync=payload('Audit One','empty-cas-race',[133,143],now+25);
    emptySync.sections.interactions={capturedAt:now+25,trainerHistory:[{...trainer(91),npc:{id:12347,name:'Empty CAS fixture'},capturedAt:now+25}]};
    assert.equal(cli('HGET',knowledgeIndex,emptyKey),null);
    mode='empty-record-before-commit';
    const emptyResult=await call(emptySync);
    assert.equal(emptyResult.http,200,JSON.stringify(emptyResult.value));
    assert.equal(emptyResult.value.liveKnowledge.quarantined,1);
    assert.equal(cli('HGET',knowledgeIndex,emptyKey),'');
    assert.ok(cli('HKEYS',knowledgeIndex).filter(k=>k.startsWith('__quarantine:v1:')).some(k=>{
      try{const q=JSON.parse(cli('HGET',knowledgeIndex,k));return q.key===emptyKey&&q.modernRaw===''&&q.incoming?.entries?.[0]?.priceCopper===91;}catch{return false;}
    }));
    // A SET that succeeded but whose response never arrived still has a
    // known token, so bounded cleanup releases exactly that lease.
    mode='stall-lock-reply';stallObserved=false;
    const uncertain=payload('Audit One','uncertain-lock',[133,143],now+26);
    assert.equal((await call(uncertain,boundedAddon)).http,503);
    assert.ok(stallObserved);assert.equal(cli('GET',lockKey),null);
    stalledRelease();await delay(20);
    assert.equal((await call(uncertain)).http,200);
    // If cleanup itself stalls, answer within reserve; token expires.
    mode='stall-release';stallObserved=false;
    const cleanup=payload('Audit One','stalled-cleanup',[133,143],now+27);
    const cleanupStart=performance.now();
    assert.equal((await call(cleanup,boundedAddon)).http,200);
    assert.ok(stallObserved);assert.ok(performance.now()-cleanupStart<1800);
    assert.equal(cli('GET',lockKey),null,'lease expires at work cutoff even when cleanup stalls');
    stalledRelease();
    assert.equal((await call(payload('Audit Two','after-lease-expiry',[133,143],now+27))).http,200);
    // Real late acquisition after an EMPTY but successful cleanup, before
    // the original server deadline. Revoked permit, not client abort, rejects it.
    const delayedAcquire=payload('Audit One','deferred-acquire',[133,143],now+28);
    mode='defer-acquire';lateCommand=null;
    const delayedAcquireResult=await call(delayedAcquire);
    assert.equal(delayedAcquireResult.http,503);assert.ok(lateCommand);
    assert.equal(cli('GET',lockKey),null);
    const acquireCommand=lateCommand;
    const [sec,micros]=cli('TIME').map(Number);
    assert.ok(sec*1000+micros/1000<Number(acquireCommand.at(-1)),'exercise revocation BEFORE expiry');
    assert.equal(cli('GET',acquireCommand[4]),null);
    assert.throws(()=>cli(...acquireCommand),/ADDON_PERMIT_REVOKED/);
    assert.equal(cli('GET',lockKey),null);
    assert.equal((await call(payload('Audit Two','after-deferred-acquire',[133,143],now+28))).http,200);
    assert.equal((await call(delayedAcquire)).http,200);
    // Real observation command executes AFTER 503 while cleanup did not
    // execute. Even artificially retaining the original token cannot bypass TIME.
    const lateKey=knowledgeKey.replace('id-12345','id-12348');
    const delayedCommit=payload('Audit One','deferred-observation',[133,143],now+29);
    delayedCommit.sections.interactions={capturedAt:now+29,trainerHistory:[{...trainer(92),npc:{id:12348,name:'Delayed commit fixture'},capturedAt:now+29}]};
    mode='defer-observation-and-cleanup';lateCommand=null;stallObserved=false;
    const lateStart=performance.now(),delayedCommitResult=await call(delayedCommit,boundedAddon);
    assert.equal(delayedCommitResult.http,503);assert.ok(lateCommand&&stallObserved);
    assert.ok(performance.now()-lateStart<1800);
    const commitCommand=lateCommand;
    assert.equal(cli('GET',lockKey),null);
    assert.equal(cli('HGET',knowledgeIndex,lateKey),null);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,true);
    assert.throws(()=>cli(...commitCommand),/ADDON_SYNC_DEADLINE/);
    cli('SET',lockKey,commitCommand.at(-2),'EX',2);
    assert.throws(()=>cli(...commitCommand),/ADDON_SYNC_DEADLINE/);
    assert.equal(cli('HGET',knowledgeIndex,lateKey),null);
    cli('DEL',lockKey);stalledRelease();
    assert.equal((await call(payload('Audit Two','after-deferred-commit',[133,143],now+29))).http,200);
    assert.equal((await call(delayedCommit)).http,200);
    const exactlyOnce=JSON.parse(cli('HGET',knowledgeIndex,lateKey));
    assert.equal(exactlyOnce.observationCount,1);assert.equal(exactlyOnce.latestSnapshot.entries[0].priceCopper,92);
    assert.equal((await call(delayedCommit)).value.duplicate,true);
    assert.equal(cli('HGET',knowledgeIndex,lateKey),JSON.stringify(exactlyOnce));
    // Closing a scope also blocks subsequent Redis commands in work that
    // ignored cancellation and finished after the deadline.
    const {redis}=await import('./character-store.mjs');let lateError=null;
    await assert.rejects(runSyncDeadline(performance.now()+20,async()=>{
      await delay(50);try{await redis(['SET','audit:late-forbidden','1']);}catch(error){lateError=error.message;}
    }),/ADDON_SYNC_DEADLINE/);
    await delay(60);assert.equal(lateError,'ADDON_SYNC_DEADLINE');assert.equal(cli('GET','audit:late-forbidden'),null);
    // F18: use the actual handler, actual central Redis fence and a real
    // isolated Redis server. Never issue a real device token or call providers.
    const {createHash}=await import('node:crypto');
    const {armDeviceWriteFence,armSyncFence}=await import('./sync-deadline.mjs');
    const syntheticDevice='ddv1_'+'f18-fixture-'.repeat(4);
    const deviceHash=createHash('sha256').update(syntheticDevice).digest('hex');
    const deviceKey='dalton-dashboard:addon-device:v1:production:token:'+deviceHash;
    const deviceRaw=JSON.stringify({schemaVersion:1,deviceId:'qa-f18',characterSlug:'cole-dalton',revokedAt:null});
    const {authorizeDeviceTokenWithProof}=await import('./addon-device-auth.mjs');
    const previousFetch=globalThis.fetch;
    cli('SET',deviceKey,deviceRaw);
    const authProof=await authorizeDeviceTokenWithProof(syntheticDevice);
    assert.deepEqual(authProof.proof,{key:deviceKey,raw:deviceRaw});
    assert.equal(await authorizeDeviceTokenWithProof(syntheticDevice,{targetScope:'preview'}),null);
    const fenceKey='audit:f18:lease',fenceToken='qa-f18-lease';
    const protectedKey='audit:f18:protected';
    cli('SET',fenceKey,fenceToken,'EX',60);
    const serverTime=cli('TIME');
    const cutoff=Number(serverTime[0])*1000+Math.floor(Number(serverTime[1])/1000)+20000;
    await runSyncDeadline(performance.now()+10000,async()=>{
      armDeviceWriteFence(authProof.proof);
      assert.equal(await redis(['GET',deviceKey]),deviceRaw);
      await assert.rejects(redis(['SET',protectedKey,'before-lock']),/DEVICE_WRITE_FENCE_NOT_ARMED/);
      armSyncFence({key:fenceKey,token:fenceToken,deadlineMs:cutoff});
      assert.equal(await redis(['SET',protectedKey,'accepted']),'OK');
      cli('DEL',deviceKey);
      await assert.rejects(redis(['SET',protectedKey,'revoked']),/DEVICE_AUTH_REVOKED/);
      await assert.rejects(redis(['EVAL',"return redis.call('SET',KEYS[1],ARGV[1])",1,protectedKey,'revoked-lua']),/DEVICE_AUTH_REVOKED/);
      assert.equal(cli('GET',protectedKey),'accepted');
      cli('SET',deviceKey,JSON.stringify({...authProof.record,deviceId:'changed'}));
      await assert.rejects(redis(['HSET','audit:f18:hash','field','changed-record']),/DEVICE_AUTH_REVOKED/);
      assert.equal(cli('EXISTS','audit:f18:hash'),0);
      cli('SET',deviceKey,deviceRaw);
      assert.equal(await redis(['EVAL',"return redis.call('MSET',KEYS[1],ARGV[1],KEYS[2],ARGV[2])",2,protectedKey,'audit:f18:second','atomic','second']),'OK');
    });
    assert.equal(cli('GET',protectedKey),'atomic');
    assert.equal(cli('GET','audit:f18:second'),'second');
    cli('DEL',fenceKey);

    const coleState=syncKey('cole-dalton');
    const originalRoster=JSON.parse(cli('GET',rosterKey));
    cli('SET',rosterKey,JSON.stringify({...originalRoster,characters:[...originalRoster.characters,{slug:'cole-dalton',name:'Cole Dalton',classId:8,level:12}]}));
    const deviceCall=async body=>{
      const res=response();
      await addon({method:'POST',headers:{authorization:'Device '+syntheticDevice},body},res);
      return res;
    };
    const f18Payload=payload('Cole Dalton','f18-first',[133],now+30);
    let revokedBeforeCore=false;
    const unchangedCore=[cli('GET',rosterKey),cli('GET',coleState),cli('GET',versionKey)];
    try{
      globalThis.fetch=async(url,options)=>{
        const cmd=JSON.parse(options.body);
        if(!revokedBeforeCore&&cmd[0]==='EVAL'&&cmd[3]===coleState&&cmd[1].includes('addon-sync-fence:v1')){
          revokedBeforeCore=true;
          assert.ok(cmd.includes(deviceKey),'Device key must reach actual core commit');
          cli('DEL',deviceKey);
        }
        return previousFetch(url,options);
      };
      const rejectedCore=await deviceCall(f18Payload);
      assert.equal(rejectedCore.http,401,JSON.stringify(rejectedCore.value));
      assert.ok(revokedBeforeCore);
      assert.deepEqual([cli('GET',rosterKey),cli('GET',coleState),cli('GET',versionKey)],unchangedCore);
      assert.equal(cli('GET',lockKey),null,'Revocation must not prevent lease cleanup');
      assert.equal((await deviceCall(f18Payload)).http,401);
      cli('SET',deviceKey,deviceRaw);
      globalThis.fetch=previousFetch;
      assert.equal((await deviceCall(f18Payload)).http,200,'Active device can still sync');
      const committedState=cli('GET',coleState);
      assert.ok(committedState);
      assert.equal(JSON.parse(committedState).payload.syncId,'f18-first');
      // A revoked device may not finish an observation write after its
      // authoritative core commit. The durable pending receipt must survive.
      const later=payload('Cole Dalton','f18-observation',[133],now+31);
      const f18NpcId=12359;
      later.sections.interactions={capturedAt:now+31,trainerHistory:[{...trainer(93),npc:{id:f18NpcId,name:'F18 observation fixture'},capturedAt:now+31}]};
      const f18KnowledgeKey=knowledgeKey.replace('id-12345','id-'+f18NpcId);
      let revokedBeforeObservation=false;
      globalThis.fetch=async(url,options)=>{
        const cmd=JSON.parse(options.body);
        if(!revokedBeforeObservation&&cmd[0]==='EVAL'&&cmd[3]===knowledgeIndex&&cmd.includes(f18KnowledgeKey)&&cmd.includes(deviceKey)){
          revokedBeforeObservation=true;
          cli('DEL',deviceKey);
        }
        return previousFetch(url,options);
      };
      const rejectedObservation=await deviceCall(later);
      assert.equal(rejectedObservation.http,401,JSON.stringify(rejectedObservation.value));
      assert.ok(revokedBeforeObservation,'Device proof must reach real observation commit');
      assert.equal(cli('HGET',knowledgeIndex,f18KnowledgeKey),null);
      const pending=await loadAddonSyncState('cole-dalton');
      assert.equal(pending.payload.syncId,'f18-observation');
      assert.equal(pending.pendingObservations,true);
      assert.equal(cli('GET',lockKey),null);
      globalThis.fetch=previousFetch;
      assert.equal((await deviceCall(later)).http,401);
      // A distinct, newly authorized credential may recover the prior
      // accepted core's pending observation exactly once.
      const replacementToken='ddv1_'+'f18-replacement-'.repeat(3);
      const replacementKey='dalton-dashboard:addon-device:v1:production:token:'+createHash('sha256').update(replacementToken).digest('hex');
      cli('SET',replacementKey,JSON.stringify({...authProof.record,deviceId:'qa-f18-replacement'}));
      try{
        const recovered=response();
        await addon({method:'POST',headers:{authorization:'Device '+replacementToken},body:later},recovered);
        assert.equal(recovered.http,200,JSON.stringify(recovered.value));
        assert.equal(recovered.value.duplicate,true);
        assert.equal((await loadAddonSyncState('cole-dalton')).pendingObservations,false);
        const fact=JSON.parse(cli('HGET',knowledgeIndex,f18KnowledgeKey));
        assert.equal(fact.observationCount,1);
        assert.equal(fact.latestSnapshot.entries[0].priceCopper,93);
      }finally{cli('DEL',replacementKey);}

    }finally{
      globalThis.fetch=previousFetch;
      cli('DEL',deviceKey);
    }
    // Real Redis: one combined reservation per attempt; no network to ForeverDB.
    {
      const {reserveForeverDbRequest,foreverDbBudgetKey,foreverDbMinuteBudgetKey,FOREVERDB_DAILY_BUDGET,FOREVERDB_MINUTE_BUDGET}=await import('./foreverdb-budget.mjs');
      const apiKey='qa-isolated-budget',time=new Date('2026-11-25T13:05:10Z');
      const opts={apiKey,now:time,enabled:true,redisImpl:redis};
      const dayKey=foreverDbBudgetKey(apiKey,time),minuteKey=foreverDbMinuteBudgetKey(apiKey,time);
      const results=await Promise.allSettled(Array.from({length:FOREVERDB_MINUTE_BUDGET+1},()=>reserveForeverDbRequest(opts)));
      assert.equal(results.filter(x=>x.status==='fulfilled').length,FOREVERDB_MINUTE_BUDGET);
      assert.equal(results.find(x=>x.status==='rejected').reason.code,'FOREVERDB_INTERNAL_RATE_LIMIT');
      assert.equal(Number(cli('GET',dayKey)),FOREVERDB_MINUTE_BUDGET);
      assert.ok(Number(cli('TTL',minuteKey))>0);
      assert.equal(await reserveForeverDbRequest({...opts,now:new Date('2026-11-25T13:06:00Z')}),FOREVERDB_MINUTE_BUDGET+1);
      cli('SET',dayKey,String(FOREVERDB_DAILY_BUDGET));
      await assert.rejects(reserveForeverDbRequest({...opts,now:new Date('2026-11-25T13:07:00Z')}),/Tagesbudget/);
      assert.equal(cli('GET',foreverDbMinuteBudgetKey(apiKey,new Date('2026-11-25T13:07:00Z'))),null);
      cli('DEL',dayKey,minuteKey,foreverDbMinuteBudgetKey(apiKey,new Date('2026-11-25T13:06:00Z')));
      console.log('F10 real Redis: combined quota, concurrent minute limit, rollover and TTL OK');
    }
    console.log('F18 real Redis: pre-lock denial, single-key and Lua commit fencing, revoked/changed device, API core denial, lease cleanup and active-device compatibility: OK');
    console.log('F02/F03/F14 real isolated Redis: contention, preview fencing, lock loss, lost response, stale retry, permission failures, daily proof, index reconciliation and offline legacy-reader projection: OK');
  }finally{
    globalThis.fetch=originalFetch;
    server.kill('SIGTERM');
    for(let i=0;i<100&&server.exitCode===null;i++)await delay(20);
    if(server.exitCode===null)server.kill('SIGKILL');
    rmSync(dir,{recursive:true,force:true});
  }
}
globalThis.fetch=originalFetch;
