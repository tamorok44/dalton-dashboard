import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {authorizeDeviceToken,createDeviceEnrollment,redeemDeviceEnrollment} from '../addon-device-auth.mjs';
import {CHARACTER_KEY} from '../character-store.mjs';
import {loadAddonSyncStateForWrite} from '../addon-sync-store.mjs';
import enrollmentAPI from '../../api/addon-device-enroll.js';
import syncAPI from '../../api/addon-sync.js';

const production='https://primary-bridge.invalid';
const preview='https://preview-bridge.invalid';
const syncEndpoint=origin=>origin+'/api/addon-sync';
const digest=value=>createHash('sha256').update(value).digest('hex');
const inviteKey=(code,scope='production')=>'dalton-dashboard:addon-device:v1:'+scope+':invite:'+digest(code);
const client=fileURLToPath(new URL('../dalton-sync-client.mjs',import.meta.url));

async function call(handler,headers,body){
  const response={statusCode:0,value:null,setHeader(){},
    status(value){this.statusCode=value;return this;},json(value){this.value=value;}};
  await handler({method:'POST',headers,body},response);
  return response;
}
function latch(){
  let open;
  const ready=new Promise(resolve=>{open=resolve;});
  return {ready,open};
}

export async function verifyBridgeDeviceLifecycle({admin,restrict}){
  const root=await mkdtemp(join(tmpdir(),'dalton-device-lifecycle-'));
  const stateDir=join(root,'dalton-dashboard-bridge'),journalFile=join(stateDir,'pending-enrollment.json');
  const configFile=join(stateDir,'config.json'),lock=stateDir+'.mutation.lock';
  const socket=join(root,'fixture.sock');
  let intercept=null,scopeMismatch=false,serverError;
  const calls=[];
  const originalFetch=globalThis.fetch;
  const overrides={
    DALTON_PREVIEW_REDIS_REST_URL:'https://preview-redis-device-test.invalid',
    DALTON_PREVIEW_REDIS_REST_TOKEN:'synthetic-preview',
    DALTON_PRODUCTION_REDIS_ORIGIN:'https://device-test.invalid'
  };
  const savedEnv=Object.fromEntries(Object.keys(overrides).map(key=>[key,process.env[key]]));
  Object.assign(process.env,overrides);
  globalThis.fetch=(url,options)=>originalFetch(
    String(url)===overrides.DALTON_PREVIEW_REDIS_REST_URL?'https://device-test.invalid':url,options);
  const inScope=async(scope,operation)=>{
    const prior=process.env.VERCEL_ENV;
    process.env.VERCEL_ENV=scope;
    try{return await operation();}
    finally{process.env.VERCEL_ENV=prior;}
  };
  const server=createServer(async(req,res)=>{
    try{
      const chunks=[];
      for await(const part of req)chunks.push(part);
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const origin=req.headers['x-fixture-origin'];
      assert.ok([production,preview].includes(origin));
      const action=body.action??'enroll';
      calls.push({action,origin,authorization:req.headers.authorization});
      const result=await inScope(origin===production&&!scopeMismatch?'production':'preview',
        ()=>call(enrollmentAPI,req.headers,body));
      if(intercept&&await intercept({action,origin,result,req})){req.socket.destroy();return;}
      res.writeHead(result.statusCode,{'Content-Type':'application/json'});
      res.end(JSON.stringify(result.value));
    }catch(error){serverError=error;res.statusCode=500;res.end();}
  });
  const preload=join(root,'transport.mjs');
  await writeFile(preload,`
import {request} from 'node:http';
import {once} from 'node:events';
import {promises as fs} from 'node:fs';
import {basename} from 'node:path';
const rename=fs.rename;
fs.rename=async(from,to)=>{
  if(basename(to)==='config.json'&&process.env.AUDIT_FILE_FAULT==='before-rename')throw Error('fixture rename failed');
  const result=await rename(from,to);
  if(basename(to)==='config.json'&&process.env.AUDIT_FILE_FAULT==='after-rename')process.kill(process.pid,'SIGKILL');
  return result;
};
globalThis.fetch=async(url,options)=>{
  const target=new URL(url);
  if(target.pathname!=='/api/addon-device-enroll'||options.redirect!=='error')throw Error('Unexpected endpoint');
  const wire=request({socketPath:process.env.AUDIT_BRIDGE_SOCKET,path:target.pathname,method:'POST',
    headers:{...options.headers,'x-fixture-origin':target.origin}});
  wire.end(options.body);
  const [response]=await once(wire,'response');
  const parts=[];
  for await(const chunk of response)parts.push(chunk);
  return new Response(Buffer.concat(parts),{status:response.statusCode,headers:response.headers});
};`);
  const spawnBridge=(args,env={})=>new Promise((resolve,reject)=>{
    const processChild=spawn(process.execPath,['--import',preload,client,...args],{
      env:{PATH:process.env.PATH,XDG_CONFIG_HOME:root,AUDIT_BRIDGE_SOCKET:socket,...env},
      stdio:['ignore','pipe','pipe']
    });
    let output='';
    processChild.stdout.on('data',part=>output+=part);
    processChild.stderr.on('data',part=>output+=part);
    processChild.on('error',reject);
    processChild.on('close',(code,signal)=>resolve({code,signal,output}));
  });
  async function run(args,{ok=true,env={}}={}){
    const result=await spawnBridge(args,env);
    assert.equal(result.code,ok?0:1,result.output);
    assert.equal(serverError,undefined);
    return result.output;
  }
  const config=async()=>JSON.parse(await readFile(configFile,'utf8'));
  const journal=async()=>JSON.parse(await readFile(journalFile,'utf8'));
  const invite=(scope='production',slug='dolly-dalton')=>inScope(scope,()=>createDeviceEnrollment(slug));
  const enroll=(row,origin=production)=>['--enroll',row.code,'--endpoint',syncEndpoint(origin)];
  const active=(token,scope='production')=>inScope(scope,()=>authorizeDeviceToken(token));
  let serial=0;
  async function sync(token,{scope='production',slug='dolly-dalton',status=200}={}){
    const capturedAt=Math.floor(Date.now()/1000)-90+(++serial);
    const body={schemaVersion:1,syncId:'lifecycle-'+serial,addon:{build:'71139',gameVersion:'1.60.1',locale:'deDE'},
      sections:{character:{name:slug==='viola-dalton'?'Viola Dalton':'Dolly Dalton',classID:3,level:12,capturedAt}}};
    await inScope(scope,async()=>{
      const result=await call(syncAPI,{authorization:'Device '+token},body);
      assert.equal(result.statusCode,status,JSON.stringify(result.value));
      if(status===200)assert.equal((await loadAddonSyncStateForWrite(slug)).state.payload.syncId,body.syncId);
    });
  }
  try{
    await new Promise(resolve=>server.listen(socket,resolve));
    const unrelatedInvite=await invite();
    const unrelated=(await redeemDeviceEnrollment(unrelatedInvite.code)).token;
    await admin('SET',CHARACTER_KEY,JSON.stringify({generatedAt:new Date().toISOString(),characters:[
      {slug:'dolly-dalton',name:'Dolly Dalton',classId:3,level:12},
      {slug:'viola-dalton',name:'Viola Dalton',classId:3,level:12}
    ]}));

    const initial=await invite();
    intercept=({action,result})=>action==='enroll'&&result.statusCode===200;
    await run(enroll(initial),{ok:false});
    const first=(await journal()).proposedDeviceToken;
    assert.ok(await active(first));
    assert.ok(!calls.at(-1).authorization);
    await admin('DEL',inviteKey(initial.code)); // simulate the original invite TTL elapsing
    intercept=null;
    await run(['--resume-enrollment']);
    assert.equal((await config()).deviceToken,first);
    await run(enroll(initial)); // installer retry, same active ID and read-only confirmation
    assert.equal(calls.at(-1).action,'confirm');
    await assert.rejects(journal(),{code:'ENOENT'});

    const cancelled=await invite();
    intercept=({action})=>action==='enroll';
    await run(enroll(cancelled),{ok:false});
    const cancelledToken=(await journal()).proposedDeviceToken;
    assert.equal((await journal()).deviceScope,'production');
    scopeMismatch=true;
    assert.match(await run(['--cancel-enrollment'],{ok:false}),/HTTP 409/);
    assert.ok(await active(cancelledToken));
    assert.equal((await journal()).proposedDeviceToken,cancelledToken);
    scopeMismatch=false;
    intercept=({action,result})=>action==='cancel'&&result.statusCode===200;
    await run(['--cancel-enrollment'],{ok:false});
    assert.equal((await journal()).phase,'cancel');
    await run(['--resume-enrollment'],{ok:false});
    intercept=null;
    await run(['--cancel-enrollment']);
    assert.ok(await active(first));
    assert.equal(await active(cancelledToken),null);

    const legacyInvite=await invite();
    intercept=({action})=>action==='enroll';
    await run(enroll(legacyInvite),{ok:false});
    const legacyPending=await journal();
    await writeFile(journalFile,JSON.stringify({
      code:legacyPending.code,endpoint:legacyPending.endpoint,character:legacyPending.character,
      previewShareUrl:legacyPending.previewShareUrl,proposedDeviceToken:legacyPending.proposedDeviceToken
    }),{mode:0o600});
    intercept=null;
    scopeMismatch=true;
    assert.match(await run(['--cancel-enrollment'],{ok:false}),/HTTP 409/);
    assert.ok(await active(legacyPending.proposedDeviceToken));
    scopeMismatch=false;
    await run(['--cancel-enrollment']);
    assert.equal(await active(legacyPending.proposedDeviceToken),null);

    await run(enroll(await invite()));
    const sameCharacterReplacement=(await config()).deviceToken;
    await sync(first,{status:401});
    await sync(sameCharacterReplacement);
    await sync(unrelated);

    const replacement=await invite('production','viola-dalton');
    const legacyConfig=await config();
    delete legacyConfig.deviceScope; // supported config from the previous bridge
    await writeFile(configFile,JSON.stringify(legacyConfig),{mode:0o600});
    const entered=latch(),release=latch();
    try{
      await restrict('-del');
      await run(enroll(replacement),{ok:false});
      await restrict();
      const pending=await journal();
      assert.equal(pending.phase,'retire');
      assert.equal(pending.previous.deviceToken,sameCharacterReplacement);
      assert.equal(pending.previous.deviceScope,'production');
      assert.ok(calls.some(call=>call.action==='locate'&&call.authorization==='Device '+sameCharacterReplacement));
      assert.equal((await config()).deviceToken,sameCharacterReplacement);
      intercept=async({action,result})=>{
        if(action!=='revoke')return false;
        assert.equal(result.statusCode,200);
        entered.open();
        await release.ready;
        return true;
      };
      const retiring=run(['--resume-enrollment'],{ok:false});
      await Promise.race([entered.ready,retiring.then(()=>assert.fail('Retirement did not reach Redis'))]);
      assert.match(await run(['--revoke-device'],{ok:false}),/Andere Geräteverwaltung/);
      release.open();
      await retiring;
      assert.equal(await active(sameCharacterReplacement),null);
      assert.equal((await journal()).previous.deviceToken,sameCharacterReplacement);
      await run(['--cancel-enrollment'],{ok:false});
    }finally{release.open();intercept=null;await restrict();}
    await run(['--resume-enrollment']);
    const second=(await config()).deviceToken;
    await sync(first,{status:401});
    await sync(sameCharacterReplacement,{status:401});
    await sync(second,{slug:'viola-dalton'});
    await sync(unrelated);

    const moved=await invite('preview');
    await run(enroll(moved,preview),{ok:false,env:{AUDIT_FILE_FAULT:'before-rename'}});
    const ready=await journal();
    assert.equal(ready.phase,'activate');
    assert.equal(ready.previous.deviceToken,second);
    assert.equal(await active(second),null);
    assert.ok(await active(ready.proposedDeviceToken,'preview'));
    assert.deepEqual(calls.filter(item=>item.authorization==='Device '+second).map(item=>item.origin),[production]);
    const crashed=await spawnBridge(['--resume-enrollment'],{AUDIT_FILE_FAULT:'after-rename'});
    assert.equal(crashed.signal,'SIGKILL');
    assert.equal((await config()).deviceToken,ready.proposedDeviceToken);
    assert.equal((await journal()).phase,'activate');
    assert.match(await run(['--revoke-device'],{ok:false}),/Andere Geräteverwaltung/);
    await rm(lock,{recursive:true});
    await run(['--resume-enrollment']);
    const third=(await config()).deviceToken;
    assert.equal(third,ready.proposedDeviceToken);
    await sync(third,{scope:'preview'});

    // An alias serving the wrong deployment scope must never attest absence.
    await run(['--revoke-device','--endpoint',syncEndpoint(production)],{ok:false});
    assert.ok(await active(third,'preview'));
    await run(['--revoke-device']);
    await sync(third,{scope:'preview',status:401});
    await sync(second,{status:401});
    await sync(unrelated);
    assert.equal((await config()).deviceToken,undefined);

    // Installer retains the activation record until native steps are confirmed.
    const native=await invite(),owner='e'.repeat(32);
    await mkdir(lock);
    await writeFile(join(lock,'owner'),owner);
    const env={DALTON_BRIDGE_INSTALL_LOCK:owner,DALTON_BRIDGE_KEEP_ENROLLMENT:'1'};
    await run(enroll(native),{env});
    assert.equal((await journal()).phase,'activate');
    const nativeToken=(await config()).deviceToken;
    await run(['--finish-install'],{ok:false});
    await run(['--resume-enrollment'],{env});
    assert.equal((await config()).deviceToken,nativeToken);
    await run(['--finish-install'],{env});
    await assert.rejects(journal(),{code:'ENOENT'});
    await rm(lock,{recursive:true});

    const pending=await invite();
    intercept=({action})=>action==='enroll';
    await run(enroll(pending),{ok:false});
    const pendingToken=(await journal()).proposedDeviceToken;
    intercept=({action,result})=>action==='revoke'&&result.statusCode===200;
    await run(['--revoke-device'],{ok:false});
    assert.equal((await journal()).kind,'revoke');
    assert.equal((await journal()).enrollment.proposedDeviceToken,pendingToken);
    assert.equal((await config()).deviceToken,nativeToken);
    await run(['--resume-enrollment'],{ok:false});
    intercept=null;
    await run(['--revoke-device']);
    await sync(nativeToken,{status:401});
    await sync(pendingToken,{status:401});
    await sync(unrelated);
    await assert.rejects(journal(),{code:'ENOENT'});
    console.log('Bridge / real Redis: first claim, TTL and reply loss, scope mismatch, cancel retry, competing process, replacement, character and scope change, ACL/file failures, SIGKILL, installer continuation, revoke of pending and active, independent device preserved: OK');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await rm(root,{recursive:true,force:true});
    globalThis.fetch=originalFetch;
    for(const [key,value] of Object.entries(savedEnv))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
}
