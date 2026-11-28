import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createDeviceEnrollment,redeemDeviceEnrollment,authorizeDeviceToken,revokeDeviceToken} from './addon-device-auth.mjs';

// Explicit isolated CI service only. Never accept a real Redis URL/token.
const container=process.env.DALTON_TEST_REDIS_CONTAINER;
assert.match(container||'',/^[a-f0-9]{12,64}$/,'Dedicated Docker Redis service required');
const exec=promisify(execFile);
const password='synthetic-device-regression';
const prefix='dalton-dashboard:addon-device:v1:production:';
const hash=s=>createHash('sha256').update(s).digest('hex');
const inviteKey=s=>prefix+'invite:'+hash(s);
const tokenKey=s=>prefix+'token:'+hash(s);
let user='fixture',intercept=null;
async function command(args,{admin=false}={}){
  const flags=admin?[]:['--user',user,'-a',password,'--no-auth-warning'];
  const {stdout}=await exec('docker',['exec',container,'redis-cli',...flags,'--json',...args.map(String)],{timeout:10000});
  const result=stdout.trim();
  if(result.startsWith('error:'))throw Error(result);
  return JSON.parse(result);
}
const admin=(...args)=>command(args,{admin:true});
const oldFetch=globalThis.fetch;
const oldEnv=Object.fromEntries(['VERCEL_ENV','KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'].map(k=>[k,process.env[k]]));
delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.VERCEL_ENV='production';
process.env.KV_REST_API_URL='https://device-test.invalid';
process.env.KV_REST_API_TOKEN='synthetic-only';
globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://device-test.invalid');
  const args=JSON.parse(options.body);
  try{
    if(intercept)return Response.json({result:await intercept(args,()=>command(args))});
    return Response.json({result:await command(args)});
  }catch(error){return Response.json({error:String(error.message)})}
};
async function invite(){return createDeviceEnrollment('dolly-dalton')}
function bothRead(key){
  let count=0,release;
  const barrier=new Promise(r=>{release=r});
  intercept=async(args,run)=>{
    const value=await run();
    if(args[0]==='GET'&&args[1]===key&&++count<=2){
      if(count===2)release();
      await barrier;
    }
    return value;
  };
}
async function allow(...rules){await admin('ACL','SETUSER',user,'reset','on','>'+password,'~'+prefix+'*','+@all',...rules)}
try{
  assert.equal(await admin('DBSIZE'),0,'CI service must start empty');
  await allow();

  // A denied SET NX must not return an invitation that never existed.
  intercept=async(args,run)=>args[0]==='SET'?null:run();
  await assert.rejects(invite(),/nicht gespeichert/);
  intercept=null;

  const first=await invite();
  const key=inviteKey(first.code);
  const raw=await admin('GET',key);
  await allow('-mset');
  await assert.rejects(redeemDeviceEnrollment(first.code));
  assert.equal(await admin('GET',key),raw,'Write denial must not consume invitation');
  assert.equal(await admin('PTTL',key)>0,true);
  assert.deepEqual(await admin('KEYS',prefix+'token:*'),[]);
  await allow();

  bothRead(key);
  const results=await Promise.allSettled([redeemDeviceEnrollment(first.code),redeemDeviceEnrollment(first.code)]);
  intercept=null;
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'Exactly one concurrent redemption');
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const device=results.find(r=>r.status==='fulfilled').value;
  assert.equal((await authorizeDeviceToken(device.token)).deviceId,device.deviceId);
  assert.deepEqual(JSON.parse(await admin('GET',key)),{consumed:true});
  assert.equal(await admin('PTTL',key)>0,true);
  assert.equal(await admin('PTTL',tokenKey(device.token)),-1,'Device is not an expiring invite');
  await assert.rejects(redeemDeviceEnrollment(first.code),/bereits verwendet/);

  // Real handler: absence of a Redis binding is not absence of a device.
  const {default:enrollmentApi}=await import('../api/addon-device-enroll.js');
  const revokeApi=async(token)=>{
    const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await enrollmentApi({method:'POST',headers:{authorization:'Device '+token},body:{action:'revoke'}},res);
    return res;
  };
  delete process.env.KV_REST_API_URL;delete process.env.KV_REST_API_TOKEN;
  let calls=0;
  intercept=async(args,run)=>{calls++;return run();};
  const unbound=await revokeApi(device.token);
  assert.equal(unbound.code,503);
  assert.ok(!Object.hasOwn(unbound.body,'alreadyRevoked'));
  assert.equal(calls,0);
  process.env.KV_REST_API_URL='https://device-test.invalid';process.env.KV_REST_API_TOKEN='synthetic-only';
  assert.ok(await authorizeDeviceToken(device.token),'Binding loss must not be reported as revocation');
  const invalid=await revokeApi('not-a-device-token');
  assert.equal(invalid.code,401);
  intercept=async(args,run)=>args[0]==='DEL'?null:run();
  assert.equal((await revokeApi(device.token)).code,503);
  assert.ok(await authorizeDeviceToken(device.token));
  intercept=null;
  const revoked=await Promise.all([revokeDeviceToken(device.token),revokeDeviceToken(device.token)]);
  intercept=null;
  assert.deepEqual(revoked.sort(),[false,true]);
  assert.equal(await authorizeDeviceToken(device.token),null);
  const retry=await revokeApi(device.token);
  assert.equal(retry.code,200);
  assert.deepEqual(retry.body,{revoked:false,alreadyRevoked:true});
  // A malformed record is not interpreted as missing: remove it by key.
  await admin('SET',tokenKey(device.token),'malformed-fixture');
  const malformed=await revokeApi(device.token);
  assert.equal(malformed.code,200);
  assert.deepEqual(malformed.body,{revoked:true,alreadyRevoked:false});
  assert.equal(await admin('GET',tokenKey(device.token)),null);

  const expired=await invite();
  const expiredKey=inviteKey(expired.code);
  intercept=async(args,run)=>{
    if(args[0]==='EVAL')await admin('DEL',expiredKey);
    return run();
  };
  await assert.rejects(redeemDeviceEnrollment(expired.code),/abgelaufen/);
  intercept=null;
  assert.deepEqual(await admin('KEYS',prefix+'token:*'),[]);

  const changed=await invite();
  const changedKey=inviteKey(changed.code);
  intercept=async(args,run)=>{
    if(args[0]==='EVAL')await admin('SET',changedKey,JSON.stringify({characterSlug:'viola-dalton'}),'EX',60);
    return run();
  };
  await assert.rejects(redeemDeviceEnrollment(changed.code),/ungültig/);
  intercept=null;
  assert.equal(JSON.parse(await admin('GET',changedKey)).characterSlug,'viola-dalton');
  assert.deepEqual(await admin('KEYS',prefix+'token:*'),[]);

  const collision=await invite();
  let collidedKey;
  intercept=async(args,run)=>{
    if(args[0]==='EVAL'){
      collidedKey=args[4];
      await admin('SET',collidedKey,'existing-device');
    }
    return run();
  };
  await assert.rejects(redeemDeviceEnrollment(collision.code),/nicht gespeichert/);
  intercept=null;
  assert.equal(await admin('GET',collidedKey),'existing-device');
  assert.equal(JSON.parse(await admin('GET',inviteKey(collision.code))).characterSlug,'dolly-dalton');
  await admin('DEL',collidedKey);

  const cleanup=await invite();
  await allow('-pexpire');
  const cleanupDevice=await redeemDeviceEnrollment(cleanup.code);
  assert.equal(await admin('PTTL',inviteKey(cleanup.code)),-1,'Failed cleanup leaves invalid marker');
  assert.deepEqual(JSON.parse(await admin('GET',inviteKey(cleanup.code))),{consumed:true});
  assert.equal((await authorizeDeviceToken(cleanupDevice.token)).deviceId,cleanupDevice.deviceId);
  await assert.rejects(redeemDeviceEnrollment(cleanup.code),/bereits verwendet/);
  await allow('-del');
  await assert.rejects(revokeDeviceToken(cleanupDevice.token));
  assert.ok(await authorizeDeviceToken(cleanupDevice.token),'Denied revoke must not claim success');
  await allow();
  assert.equal(await revokeDeviceToken(cleanupDevice.token),true);

  const lost=await invite();
  intercept=async(args,run)=>{
    const value=await run();
    if(args[0]==='EVAL')throw Error('synthetic lost response after commit');
    return value;
  };
  await assert.rejects(redeemDeviceEnrollment(lost.code),/lost response/);
  intercept=null;
  assert.deepEqual(JSON.parse(await admin('GET',inviteKey(lost.code))),{consumed:true});
  assert.equal((await admin('KEYS',prefix+'token:*')).length,1);
  await assert.rejects(redeemDeviceEnrollment(lost.code),/bereits verwendet/);
  // Actual enrollment API must pass the issuer to the atomic write boundary.
  const hubToken='ddv1_'+'synthetic-hub-'.repeat(4);
  const hubKey=tokenKey(hubToken);
  const hubRaw=JSON.stringify({schemaVersion:1,deviceId:'qa-hub',characterSlug:'cole-dalton',revokedAt:null});
  const apiCall=async(token,characterSlug)=>{
    const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await enrollmentApi({method:'POST',headers:{authorization:'Device '+token},body:{action:'create',characterSlug}},res);
    return res;
  };
  await admin('SET',hubKey,hubRaw);
  const allowed=await apiCall(hubToken,'dolly-dalton');
  assert.equal(allowed.code,200);
  assert.equal(JSON.parse(await admin('GET',inviteKey(allowed.body.code))).characterSlug,'dolly-dalton');
  const beforeInvites=(await admin('KEYS',prefix+'invite:*')).sort();
  assert.equal((await apiCall(hubToken,'cole-dalton')).code,401);
  assert.equal((await apiCall(hubToken,'constructor')).code,401);
  let raced=false;
  intercept=async(args,run)=>{
    if(args[0]==='EVAL'&&args[3]===hubKey){
      raced=true;
      await admin('DEL',hubKey);
    }
    return run();
  };
  assert.equal((await apiCall(hubToken,'viola-dalton')).code,401);
  intercept=null;
  assert.ok(raced,'Issuer revalidation must be atomic at invitation write');
  assert.deepEqual((await admin('KEYS',prefix+'invite:*')).sort(),beforeInvites);
  assert.equal((await apiCall(hubToken,'viola-dalton')).code,401);
  await assert.rejects(redeemDeviceEnrollment(allowed.body.code),/Nicht berechtigt/);
  await admin('SET',hubKey,hubRaw);
  const raceInvite=await createDeviceEnrollment('viola-dalton',{issuerToken:hubToken});
  const raceKey=inviteKey(raceInvite.code),raceRaw=await admin('GET',raceKey);
  const tokensBefore=(await admin('KEYS',prefix+'token:*')).filter(k=>k!==hubKey).sort();
  intercept=async(args,run)=>{if(args[0]==='EVAL'&&args[3]===raceKey)await admin('DEL',hubKey);return run()};
  await assert.rejects(redeemDeviceEnrollment(raceInvite.code),/Nicht berechtigt/);
  intercept=null;
  assert.equal(await admin('GET',raceKey),raceRaw);
  assert.deepEqual((await admin('KEYS',prefix+'token:*')).sort(),tokensBefore);
  const legacy=await invite();await admin('SET',inviteKey(legacy.code),JSON.stringify({characterSlug:'dolly-dalton'}),'EX',60);
  await assert.rejects(redeemDeviceEnrollment(legacy.code),/neu erstellen/);
  // G01 on both isolated Redis versions: strict read envelopes and exact
  // atomic base proof, even if a transport supplies a plausible wrong roster.
  {
    const {CHARACTER_KEY,loadCharacters,loadCharactersForWrite,saveCharacters,acquireRefreshLock,releaseRefreshLock}=await import('./character-store.mjs');
    const {saveAddonSyncState,loadAddonSyncStateForWrite}=await import('./addon-sync-store.mjs');
    const {nextProfileGeneration}=await import('./version-metadata.mjs');
    const compactKey='dalton-dashboard:core:compact:v2:production';
    const addonKey='dalton-dashboard:addon-sync:v1:production:g01-one';
    const summaryKey='dalton-dashboard:addon-summary:v1:production:g01-one';
    await admin('ACL','SETUSER',user,'reset','on','>'+password,'~dalton-dashboard:*','+@all');
    const initial={generatedAt:new Date().toISOString(),characters:[{slug:'g01-one',name:'G01 One',classId:8,level:12},{slug:'g01-two',name:'G01 Two',classId:8,level:12}]};
    const raw=JSON.stringify(initial);
    await admin('SET',CHARACTER_KEY,raw);
    const lock=await acquireRefreshLock();assert.ok(lock);
    try{
      const baseline=await loadCharactersForWrite();
      assert.equal(baseline.raw,raw);
      for(const result of [undefined,false,0,{},[],null,'','{}','null']){
        intercept=async(args,run)=>args[0]==='GET'&&args[1]===CHARACTER_KEY?result:run();
        await assert.rejects(loadCharactersForWrite());
        if(result!==null)await assert.rejects(loadCharacters());
        assert.equal(await admin('GET',CHARACTER_KEY),raw);
      }
      intercept=null;
      const next={...baseline.data,generatedAt:nextProfileGeneration(baseline.data)};
      await assert.rejects(saveCharacters(next,lock),/PROFILE_BASE_REQUIRED/);
      await assert.rejects(saveCharacters(next,lock,{expectedRoster:JSON.stringify({...initial,characters:initial.characters.slice(0,1)})}),/PROFILE_BASE_CHANGED/);
      await assert.rejects(saveCharacters({...next,characters:next.characters.slice(0,1)},lock,{expectedRoster:raw}),/PROFILE_ROSTER_CHANGED/);
      assert.equal(await admin('GET',CHARACTER_KEY),raw);
      assert.equal(await admin('GET',compactKey),null);
      const persisted=await saveCharacters(next,lock,{expectedRoster:raw});
      assert.equal(await admin('GET',CHARACTER_KEY),persisted);
      const payload={schemaVersion:1,syncId:'g01-first',sections:{character:{name:'G01 One',classID:8,level:12}}};
      const next2={...next,generatedAt:nextProfileGeneration(next)};
      await assert.rejects(saveAddonSyncState('g01-one',payload,{lockToken:lock,roster:next2,expectedRoster:raw,expectedState:null}),/PROFILE_BASE_CHANGED/);
      assert.equal(await admin('GET',addonKey),null);
      await saveAddonSyncState('g01-one',payload,{lockToken:lock,roster:next2,expectedRoster:persisted,expectedState:null});
      const before=await Promise.all([CHARACTER_KEY,compactKey,addonKey,summaryKey].map(k=>admin('GET',k)));
      assert.ok(before.every(x=>typeof x==='string'));
      intercept=async(args,run)=>args[0]==='GET'&&args[1]===addonKey?undefined:run();
      await assert.rejects(loadAddonSyncStateForWrite('g01-one'),/REDIS_RESPONSE_UNCONFIRMED/);
      intercept=null;
      await assert.rejects(saveAddonSyncState('g01-one',{...payload,syncId:'g01-second'},{lockToken:lock,expectedRoster:before[0],expectedState:null}),/ADDON_BASE_CHANGED/);
      assert.deepEqual(await Promise.all([CHARACTER_KEY,compactKey,addonKey,summaryKey].map(k=>admin('GET',k))),before);
    }finally{intercept=null;await releaseRefreshLock(lock);}
    console.log('G01 Redis: confirmed baseline, malformed/false-null reads, roster membership and atomic Add-on state CAS OK');
  }
  console.log('F18 API issuer regression: allowed peer enrollment, self/prototype denial, revoked issuer before mutation, no new invite: OK');
  console.log('Redis device regression: NX failure, denied MSET, concurrent redemption/revocation, expiry, CAS, collision, cleanup denial, revoke denial and ambiguous response: OK');
}finally{
  globalThis.fetch=oldFetch;
  for(const [k,v] of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
