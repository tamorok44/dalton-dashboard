import {AsyncLocalStorage} from 'node:async_hooks';

const budgets=new AsyncLocalStorage();
export const ADDON_WORK_MS=22000;
export const ADDON_CLEANUP_UNTIL_MS=27000;
export const ADDON_LEASE_SECONDS=35;
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
