import assert from 'node:assert/strict';
import {readRequestJson} from './request-json.mjs';
import addon from '../api/addon-sync.js';
import device from '../api/addon-device-enroll.js';
import spellbook from '../api/spellbook-sync.js';

const field={name:'Äther'};
const bytes=Buffer.from(JSON.stringify(field));
const stream=chunks=>({async *[Symbol.asyncIterator](){yield* chunks;}});
for(const request of [{body:field},{body:bytes},{body:bytes.toString()},stream([bytes.subarray(0,10),bytes.subarray(10)])]){
  assert.deepEqual(await readRequestJson(request,bytes.length),field);
  await assert.rejects(readRequestJson(request,bytes.length-1),{status:413});
}
let cancelled=false,pulls=0;
const unbounded={async *[Symbol.asyncIterator](){
  try{while(true){pulls++;yield Buffer.alloc(8);}}
  finally{cancelled=true;}
}};
await assert.rejects(readRequestJson(unbounded,12),{status:413});
assert.deepEqual([pulls,cancelled],[2,true]);
for(const body of ['{','null','[]',[],Buffer.from([0xff]),{a:()=>{}},{n:Infinity}]){
  await assert.rejects(readRequestJson({body},1000),{status:400});
}
const tooDeep=Array.from({length:50}).reduce(value=>({value}),0);
await assert.rejects(readRequestJson({body:tooDeep},1000),{status:400});
await assert.rejects(readRequestJson({headers:{'content-length':'1024'},body:{}},32),{status:413});
await assert.rejects(readRequestJson({headers:{'content-length':'8, 9'},body:{}},32),{status:400});

const saved={...process.env};
const originalFetch=globalThis.fetch;
try{
  let contacts=0;
  globalThis.fetch=async()=>{contacts++;throw Error('Unexpected provider access');};
  process.env.VERCEL_ENV='production';
  process.env.DALTON_SYNC_TOKEN='audit-only-master-token';
  process.env.SPELLBOOK_SYNC_TOKEN='audit-only-legacy-token';
  for(const [handler,limit] of [[device,20000],[spellbook,250000],[addon,900000]]){
    for(const form of ['parsed','string','stream']){
      const body={code:'ä'.repeat(limit/2)};
      const serialized=JSON.stringify(body);
      const input=form==='parsed'?{body}:form==='string'?{body:serialized}:stream([Buffer.from(serialized)]);
      const res={code:null,status(code){this.code=code;return this;},json(body){this.body=body;},setHeader(){}};
      await handler({method:'POST',headers:{authorization:'Bearer audit-only-master-token'},...input},res);
      assert.equal(res.code,413);
      assert.deepEqual(res.body,{error:'Anfrage ist zu groß'});
    }
  }
  assert.equal(contacts,0);
}finally{
  globalThis.fetch=originalFetch;
  for(const key of ['VERCEL_ENV','DALTON_SYNC_TOKEN','SPELLBOOK_SYNC_TOKEN']){
    if(saved[key]===undefined)delete process.env[key];
    else process.env[key]=saved[key];
  }
}
console.log('HTTP JSON boundaries: bytes, fragmented UTF-8, premature cancellation, object depth, scope and no provider IO on rejection: OK');
