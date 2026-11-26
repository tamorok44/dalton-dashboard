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
import {registerDailySnapshot,getDailySnapshot,acquireDailySnapshotLock,releaseDailySnapshotLock} from './history-store.mjs';
import {encodeCompactMaster} from './compact-master-cache.mjs';
import {parseLuaSavedVariable} from './savedvariables-parser.mjs';
import {buildSafeAddonSyncPayload} from './addon-sync.mjs';

const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Real network disabled')};
for(const key of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN','DALTON_PRIVATE_ARCHIVE_TOKEN','DALTON_SYNC_TOKEN','SPELLBOOK_SYNC_TOKEN','FOREVERDB_API_KEY','BLIZZARD_CLIENT_ID','BLIZZARD_CLIENT_SECRET'])delete process.env[key];
process.env.VERCEL_ENV='production';
process.env.BLOB_READ_WRITE_TOKEN='public-media-fixture';
process.env.BLOB_STORE_ID='public-media-fixture';
const day='2026-11-26';
const snapshot={snapshotAt:day+'T05:00:00Z',characters:{test:Object.fromEntries(Object.keys(FOREVER_CHARACTER_ENDPOINTS).map(key=>[key,{status:200,ok:true,data:{id:123}}]))}};
let uploads=0,blob=null,compressed=null;
const putImpl=async(path,body,options)=>{
  uploads++;
  assert.equal(options.access,'private');assert.equal(options.token,'private-archive-fixture');
  assert.equal(options.allowOverwrite,false);assert.ok(options.abortSignal instanceof AbortSignal);
  assert.equal(path,'history/private/v3/daily/2026/11/26/'+rosterKey(['test'])+'/daltons-full.json.gz');
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
assert.equal(await recoverDailySnapshot(day,{getImpl,expectedSlugs:['test']}),null);
const bad=structuredClone(snapshot);
for(const v of Object.values(bad.characters.test)){v.status=503;v.ok=false;v.data={error:'offline'};}
await assert.rejects(saveDailySnapshot(bad,day,{putImpl}),/bestätigtes Charakterprofil/);
assert.equal(uploads,0,'all-endpoints failure is not a valid archive');
const partial=structuredClone(snapshot);partial.characters.test.hunterPets={status:404,ok:false,data:null};
assert.equal(classifySnapshot(partial).status,'partial');
const meta=await saveDailySnapshot(snapshot,day,{putImpl,expectedSlugs:['test']});
assert.equal(meta.archiveStatus,'private');assert.equal(meta.quality.status,'complete');assert.equal(uploads,1);
assert.deepEqual(await recoverDailySnapshot(day,{getImpl,expectedSlugs:['test']}),meta);
assert.equal(uploads,1,'orphaned upload is recovered rather than overwritten');
assert.equal(await recoverDailySnapshot(day,{getImpl,expectedSlugs:['other']}),null,'different roster has independent immutable object path');
const duplicated=structuredClone(snapshot);duplicated.characters.other=structuredClone(duplicated.characters.test);
assert.throws(()=>classifySnapshot(duplicated),/Doppelte Profil-ID/);
const errorProfile=structuredClone(snapshot);errorProfile.characters.test.profile.data={id:123,error:'fixture'};
assert.throws(()=>classifySnapshot(errorProfile),/bestätigtes Charakterprofil/);
const errorOptional=structuredClone(snapshot);errorOptional.characters.test.statistics.data={error:'fixture'};
assert.equal(classifySnapshot(errorOptional).status,'partial');
assert.throws(()=>classifySnapshot(snapshot,{expectedRoster:[{slug:'test',id:321}]}),/Profil-ID/);
const started=Date.now();
await assert.rejects(withinArchiveDeadline(()=>delay(1000),AbortSignal.timeout(35)));
assert.ok(Date.now()-started<500,'caller must not wait for SDK backoff');
await assert.rejects(saveDailySnapshot(snapshot,day,{putImpl:async()=>({url:'https://fixture.public.blob.vercel-storage.com/test',pathname:blob.pathname})}),/private URL/);

const proof={date:day,source:'daily',success:1,total:1,roster:[{slug:'test',id:null}],persisted:true,generatedAt:day+'T05:01:00Z'};
assert.equal(dailyRefreshComplete({date:day,archiveStatus:'disabled',refresh:{persisted:true}},false),false);
assert.equal(dailyRefreshComplete({date:day,archiveStatus:'disabled',refresh:proof},false),true);
assert.equal(dailyRefreshComplete({date:day,archiveStatus:'disabled',refresh:proof},true),false);
assert.equal(dailyRefreshComplete({date:day,archiveStatus:'failed',refresh:proof},true),false);
assert.equal(dailyRefreshComplete({...meta,refresh:{...proof,total:2}},true),false);
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
  loadCharacters:async()=>{events.push('roster');return {data:{characters:[{slug:currentSlug}]}}},
  recoverDailySnapshot:async()=>{events.push('recover');return uploadExists?meta:null},
  fetchForeverSnapshot:async()=>{events.push('raw');return snapshot},
  saveDailySnapshot:async()=>{events.push('private');if(failArchive)throw Error('fixture archive failed');uploadExists=true;return meta},
  registerDailySnapshot:async(value,token)=>{assert.equal(token,'daily-lock');events.push('register');if(failIndex)throw Error('index unavailable');stored=structuredClone(value)},
  refreshDailyCharacters:async()=>{events.push('refresh');persisted={...proof,roster:[{slug:currentSlug,id:null}]};return persisted},
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
  let restrictedUser=null;
  const cli=(...args)=>{
    const auth=restrictedUser?['--user',restrictedUser,'--pass','local-fixture-password','--no-auth-warning']:[];
    const r=spawnSync('redis-cli',['-s',socket,'--json','-e',...auth,...args.map(String)],{encoding:'utf8',timeout:5000});
    if(r.error||r.status!==0)throw Error((r.stderr||r.stdout||r.error?.message||'Redis failed').trim());
    try{return JSON.parse(r.stdout);}catch{throw Error(r.stdout.trim());}
  };
  try{
    for(let i=0;i<100&&!existsSync(socket);i++)await delay(20);
    assert.equal(cli('PING'),'PONG');
    process.env.UPSTASH_REDIS_REST_URL='https://offline-audit.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN='isolated-fixture';
    process.env.DALTON_SYNC_TOKEN='isolated-fixture';
    const {default:addon}=await import('../api/addon-sync.js');
    const rosterKey='dalton-dashboard:characters:v1',lockKey='dalton-dashboard:refresh:lock',versionKey='dalton-dashboard:data-version:meta:v1';
    const syncKey=slug=>'dalton-dashboard:addon-sync:v1:production:'+slug;
    cli('SET',rosterKey,JSON.stringify({generatedAt:date(-4),characters:[
      {slug:'audit-one',name:'Audit One',classId:8,level:12},
      {slug:'audit-two',name:'Audit Two',classId:8,level:12}
    ]}));
    const classFixture=encodeCompactMaster({classMaster:{slug:'mage',abilities:[{ranks:[{id:133},{id:143}]}]}});
    let mode=null,releaseRead=null,readReached=null;
    const waitRead=new Promise(r=>{readReached=r}),continueRead=new Promise(r=>{releaseRead=r});
    let pauseFirst=true;
    globalThis.fetch=async(url,options={})=>{
      assert.equal(String(url),'https://offline-audit.invalid','all real destinations blocked');
      const cmd=JSON.parse(options.body),[op,key]=cmd;
      try{
        if(op==='GET'&&key===rosterKey&&pauseFirst){
          pauseFirst=false;assert.ok(cli('GET',lockKey));readReached();await continueRead;
        }
        if(op==='GET'&&key.includes('class-master')&&key.endsWith(':gz1'))return Response.json({result:classFixture});
        if(op==='HMGET')return Response.json({result:cmd.slice(2).map(id=>JSON.stringify({id:Number(id),name:'Feuerball',rank:'Rang'}))});
        const isSync=op==='EVAL'&&cmd[3]?.includes(':addon-sync:');
        if(isSync&&mode==='lose-before'){cli('SET',lockKey,'other-owner');mode=null;}
        if(isSync&&mode==='fail-before'){mode=null;throw Error('fixture interruption before commit');}
        if(isSync&&mode==='drop-after'){mode=null;cli(...cmd);throw Error('fixture response lost after commit');}
        if(op==='SET'&&key.includes(':history:daily:lock:')&&mode==='drop-lock-reply'){mode=null;cli(...cmd);throw Error('fixture lock response lost');}
        if(op==='EVAL'&&cmd[3]?.includes(':live-knowledge:')&&mode==='fail-knowledge'){mode=null;throw Error('fixture interrupted before knowledge write');}
        return Response.json({result:cli(...cmd)});
      }catch(error){return Response.json({error:String(error.message)});}
    };
    const call=async body=>{const res=response();await addon({method:'POST',headers:{authorization:'Bearer isolated-fixture'},body},res);return res};
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
    cli('DEL',versionKey);cli('SET',versionKey,'invalid type');
    const third=payload('Audit One','third',[133],now+1);
    assert.equal((await call(third)).http,503);assert.equal(cli('GET',rosterKey),snapshotBefore);assert.equal(cli('GET',syncKey('audit-one')),stateBefore);
    cli('DEL',versionKey);
    cli('ACL','SETUSER','limited-sync','on','>local-fixture-password','~*','+@all','-mset');
    const beforeACL=[cli('GET',rosterKey),cli('GET',syncKey('audit-one')),cli('HGETALL',versionKey)];
    restrictedUser='limited-sync';
    const aclFailure=await call(third);
    restrictedUser=null;
    assert.equal(aclFailure.http,503);assert.match(aclFailure.value.error,/ACL_PREFLIGHT/);
    assert.deepEqual([cli('GET',rosterKey),cli('GET',syncKey('audit-one')),cli('HGETALL',versionKey)],beforeACL);
    cli('ACL','DELUSER','limited-sync');
    const observation=payload('Audit One','observation',[133,143],now+2);
    observation.sections.interactions={capturedAt:now+2,trainerHistory:[{capturedAt:now+2,complete:true,npc:{id:12345,name:'Test Trainer'},location:{zone:'Test'},services:[{name:'Test Ability',priceCopper:10}]}]};
    mode='fail-knowledge';
    assert.equal((await call(observation)).http,503);
    assert.equal((await loadAddonSyncState('audit-one')).payload.syncId,'observation');
    const knowledgeIndex='dalton-dashboard:live-knowledge:v1:production:index';
    assert.equal(cli('SCARD',knowledgeIndex),0);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,true);
    const later=payload('Audit One','later',[133,143],now+3);
    const repair=await call(later);
    assert.equal(repair.http,200);assert.equal(repair.value.duplicate,false);
    assert.equal((await loadAddonSyncState('audit-one')).pendingObservations,false);
    assert.equal(cli('SCARD',knowledgeIndex),1);
    const knowledgeKey=cli('SMEMBERS',knowledgeIndex)[0];
    const record=cli('GET',knowledgeKey);
    assert.equal(JSON.parse(record).observationCount,1);
    const restamped=structuredClone(observation);restamped.sections.interactions.trainerHistory[0].capturedAt++;
    const retry=await call(restamped);assert.equal(retry.value.duplicate,true);assert.equal(cli('GET',knowledgeKey),record);
    const twoPrices=payload('Audit One','two-prices',[133,143],now+4);
    const trainer=(priceCopper)=>({capturedAt:now+4,complete:true,npc:{id:12345,name:'Test Trainer'},services:[{name:'Test Ability',priceCopper}]});
    twoPrices.sections.interactions={capturedAt:now+4,trainerHistory:[trainer(20),trainer(30)]};
    assert.equal((await call(twoPrices)).http,200);
    const priced=JSON.parse(cli('GET',knowledgeKey));
    assert.equal(priced.observationCount,3);assert.equal(priced.services[0].priceCopper,30);
    assert.ok(priced.changes.some(x=>x.sameSecond===true&&x.previousEntries[0].priceCopper===20&&x.entries[0].priceCopper===30));
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
    assert.equal(JSON.parse(cli('GET',lastKey)).date,day);
    await releaseDailySnapshotLock(day,guard);
    await assert.rejects(registerDailySnapshot({...meta,refresh:actualProof},guard),/DAILY_LOCK_LOST/);
    const aclDay='2026-11-27',aclLock=await acquireDailySnapshotLock(aclDay);
    cli('ACL','SETUSER','limited-index','on','>local-fixture-password','~*','+@all','-set');
    restrictedUser='limited-index';
    await assert.rejects(registerDailySnapshot({date:aclDay,archiveStatus:'disabled'},aclLock),/ACL_PREFLIGHT/);
    restrictedUser=null;
    assert.equal(await getDailySnapshot(aclDay),null);assert.equal(JSON.parse(cli('GET',lastKey)).date,day);
    cli('ACL','DELUSER','limited-index');await releaseDailySnapshotLock(aclDay,aclLock);
    const older='2026-11-25',olderLock=await acquireDailySnapshotLock(older);
    await registerDailySnapshot({date:older,archiveStatus:'disabled'},olderLock);
    assert.equal(JSON.parse(cli('GET',lastKey)).date,day,'last pointer cannot move backwards');
    await releaseDailySnapshotLock(older,olderLock);
    console.log('F02/F03/F14 real isolated Redis: contention, lock loss, lost response, stale retry, type preflight, daily proof and atomic index: OK');
  }finally{
    globalThis.fetch=originalFetch;
    server.kill('SIGTERM');
    for(let i=0;i<100&&server.exitCode===null;i++)await delay(20);
    if(server.exitCode===null)server.kill('SIGKILL');
    rmSync(dir,{recursive:true,force:true});
  }
}
globalThis.fetch=originalFetch;
