import {AsyncLocalStorage} from 'node:async_hooks';

const budgets=new AsyncLocalStorage();
export const ADDON_WORK_MS=22000;
export const ADDON_CLEANUP_UNTIL_MS=27000;
export const ADDON_LEASE_SECONDS=22;
export const SERVER_CLOCK_MARGIN_MS=50;
const deadlineError=()=>new Error('ADDON_SYNC_DEADLINE');

export function assertSyncBudget(){
  const scope=budgets.getStore();
  if(scope&&(scope.signal.aborted||performance.now()>=scope.deadlineAt))throw deadlineError();
  return scope;
}

// One monotonic deadline for a request, not one full timeout per retry.
// Close the async context even if an external library ignores cancellation.
// Subsequent Redis calls originating in that context must not start.
export async function runSyncDeadline(deadlineAt,work){
  const controller=new AbortController();
  const scope={deadlineAt,signal:controller.signal};
  return budgets.run(scope,async()=>{
    assertSyncBudget();
    let timer;
    const expired=new Promise((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(deadlineError());},Math.max(0,deadlineAt-performance.now()));
    });
    try{
      const result=await Promise.race([Promise.resolve().then(()=>{assertSyncBudget();return work();}),expired]);
      assertSyncBudget();
      return result;
    }finally{clearTimeout(timer);controller.abort();}
  });
}

// Covers both fetch and JSON body consumption. Keep normal callers' 10s
// per-operation limit; a sync can use only its remaining shared budget.
export async function runRedisRequest(work){
  const scope=assertSyncBudget();
  const controller=new AbortController();
  const signal=scope?AbortSignal.any([controller.signal,scope.signal]):controller.signal;
  const ms=Math.min(10000,scope?Math.max(0,scope.deadlineAt-performance.now()):10000);
  let timer,onAbort;
  const stopped=new Promise((_,reject)=>{
    onAbort=()=>reject(scope?.signal.aborted?deadlineError():new Error('REDIS_REQUEST_TIMEOUT'));
    signal.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>controller.abort(),ms);
  });
  try{
    if(signal.aborted)throw deadlineError();
    const result=await Promise.race([Promise.resolve().then(()=>{assertSyncBudget();return work(signal);}),stopped]);
    assertSyncBudget();
    if(signal.aborted)throw new Error('REDIS_REQUEST_TIMEOUT');
    return result;
  }finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);controller.abort();}
}

export function armSyncFence({key,token,deadlineMs,permit=null}){
  const scope=assertSyncBudget();
  if(scope)scope.fence={key,token,deadlineMs,permit};
}
// Bind the exact authorized Redis record, not the bearer token. A changed
// or deleted record invalidates further writes in this request.
export function armDeviceWriteFence({key,raw}){
  const scope=assertSyncBudget();
  if(!scope||scope.deviceFence||typeof key!=='string'||!key||typeof raw!=='string'||!raw)throw Error('INVALID_DEVICE_FENCE');
  scope.deviceFence=Object.freeze({key,raw});
}
const reads=new Set(['GET','MGET','HGET','HMGET','HGETALL','HKEYS','HEXISTS','HLEN','SMEMBERS','SISMEMBER','SCARD','TYPE','TTL','PTTL','EXISTS','TIME','LRANGE','LLEN','ZRANGE','ZSCORE']);
const oneKeyWrites=new Set(['SET','HSET','HSETNX','HDEL','DEL','RPUSH','LPUSH','SADD','SREM','INCR','INCRBY','EXPIRE','PEXPIRE','SETEX','PSETEX','ZADD','ZREM']);
const READ_TABLE=[...reads].map(x=>x+'=true').join(',');
// The work scope can only send a mutating command through a live lock.
// Preserve existing Lua key/argument positions, remove the appended
// envelope before the original script, and recheck just before its first
// mutation. Single-command authoritative commits remain atomic.
export function fenceRedisCommand(command){
  const scope=assertSyncBudget(),f=scope?.fence;
  const op=String(command[0]).toUpperCase();
  if(reads.has(op))return command;
  const device=scope?.deviceFence;
  if(!f){if(device)throw Error('DEVICE_WRITE_FENCE_NOT_ARMED');return command;}
  let keys,args,script;
  if(op==='EVAL'){
    const n=Number(command[2]);
    if(!Number.isSafeInteger(n)||n<0||command.length<3+n)throw Error('Ungültiger Redis-Skriptaufruf');
    keys=command.slice(3,3+n);args=command.slice(3+n);script=String(command[1]);
  }else if(oneKeyWrites.has(op)){
    if(op==='DEL'&&command.length!==2)throw Error('Mehrschlüssel-DEL im Sync nicht unterstützt');
    keys=[command[1]];args=[op,...command.slice(2)];
    script='return redis.call(ARGV[1],KEYS[1],unpack(ARGV,2))';
  }else throw Error('Nicht freigegebener Redis-Befehl im Sync: '+op);
  let index=keys.indexOf(f.key),extra=false;
  if(index<0){index=keys.length;keys.push(f.key);extra=true;}
  // Append the device key last, then remove it before the original script.
  // Existing key and argument positions are preserved, including multi-key commits.
  if(f.permit)keys.push(f.permit);
  if(device)keys.push(device.key);
  const deviceEnvelope=device?"local deviceRaw=table.remove(ARGV); local deviceKey=table.remove(KEYS); ":"";
  const deviceCheck=device?" if rawRedis.call('GET',deviceKey)~=deviceRaw then error('DEVICE_AUTH_REVOKED') end; ":"";
  const permitEnvelope=f.permit?"local syncPermit=table.remove(KEYS); ":"";
  const permitCheck=f.permit?" if rawRedis.call('GET',syncPermit)~=syncDeadlineText then error('ADDON_PERMIT_REVOKED') end; ":"";
  const prefix="-- addon-sync-fence:v1\n"+deviceEnvelope+permitEnvelope+
    "local syncDeadlineText=table.remove(ARGV); local syncDeadline=tonumber(syncDeadlineText); local syncToken=table.remove(ARGV); local syncLock=KEYS["+ (index+1) +"]; "+
    (extra?"table.remove(KEYS); ":"")+
    "local rawRedis=redis; local function checkSyncFence() local t=rawRedis.call('TIME'); if tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)>=syncDeadline then error('ADDON_SYNC_DEADLINE') end; if rawRedis.call('GET',syncLock)~=syncToken then error('REFRESH_LOCK_LOST') end; "+permitCheck+deviceCheck+"end; checkSyncFence(); "+
    "local syncReads={"+READ_TABLE+"}; local mutationStarted=false; local function beforeSyncCommand(cmd) if not mutationStarted and not syncReads[string.upper(cmd)] then checkSyncFence(); mutationStarted=true end end; "+
    "local redis=setmetatable({call=function(cmd,...) beforeSyncCommand(cmd); return rawRedis.call(cmd,...) end,pcall=function(cmd,...) beforeSyncCommand(cmd); return rawRedis.pcall(cmd,...) end},{__index=rawRedis}); ";
  return ['EVAL',prefix+script,keys.length,...keys,...args,f.token,String(f.deadlineMs),...(device?[device.raw]:[])];
}
