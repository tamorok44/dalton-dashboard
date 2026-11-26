import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';

export const endpoint='https://redis-audit.invalid';
const binaries={
  server:process.env.AUDIT_REDIS_SERVER||'redis-server',
  client:process.env.AUDIT_REDIS_CLI||'redis-cli'
};
const localEnv={PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH};

export function redisCommand(socket,command,user){
  const args=['-s',socket,'--json','-e',...(user?['--user',user]:[]),...command.map(String)];
  const result=spawnSync(binaries.client,args,{env:{...localEnv,...(user?{REDISCLI_AUTH:'audit-fixture-only'}:{})},
    encoding:'utf8',timeout:4000,maxBuffer:8*1024*1024});
  if(result.error||result.status!==0)throw Error(String(result.stdout||result.stderr||result.error?.message).trim());
  return JSON.parse(result.stdout);
}

export async function withRedis(callback){
  const path=mkdtempSync(join(tmpdir(),'dalton-audit-'));
  const socket=join(path,'redis.sock');
  let server,exit;
  const start=async()=>{
    server=spawn(binaries.server,['--port','0','--unixsocket',socket,'--unixsocketperm','700',
      '--protected-mode','yes','--save','','--appendonly','no','--dir',path],{env:localEnv,stdio:'ignore'});
    exit=once(server,'exit');
    for(let count=0;count<160&&!existsSync(socket)&&server.exitCode===null;count++)await wait(15);
    assert.equal(redisCommand(socket,['PING']),'PONG','private local Redis required');
  };
  const stop=async()=>{
    if(server?.exitCode===null&&server?.signalCode===null){server.kill('SIGTERM');await exit;}
  };
  try{
    await start();
    return await callback({
      socket, exec:(...command)=>redisCommand(socket,command),
      restart:async()=>{await stop();await start();}
    });
  }finally{
    await stop();
    rmSync(path,{recursive:true,force:true});
  }
}

export function installRedisEnv(){
  for(const key of Object.keys(process.env)){
    if(/^(VERCEL_|BLOB_|DALTON_|KV_REST_|UPSTASH_|FOREVERDB_|BLIZZARD_|CRON_SECRET$)/.test(key))delete process.env[key];
  }
  Object.assign(process.env,{UPSTASH_REDIS_REST_URL:endpoint,UPSTASH_REDIS_REST_TOKEN:'audit-fixture-only',
    DALTON_SYNC_TOKEN:'audit-fixture-only',CRON_SECRET:'audit-fixture-only',VERCEL_ENV:'production'});
}

export function reply(){
  return {code:200,headers:{},setHeader(key,value){this.headers[key]=value;},
    status(code){this.code=code;return this;},json(value){this.value=value;}};
}
export function gate(){
  let open;
  const ready=new Promise(resolve=>{open=resolve;});
  return {ready,open};
}
export function addonRequest(body){
  return {method:'POST',headers:{authorization:'Bearer audit-fixture-only'},body};
}
export const cronRequest={method:'GET',headers:{authorization:'Bearer audit-fixture-only'}};
