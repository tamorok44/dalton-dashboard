import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {withRedis} from '../pr116-recheck-177b147/redis-fixture.mjs';
import {runProviderAcceptance} from './provider-acceptance.mjs';

const tree=resolve(process.argv[2]);
const {MockAgent,setGlobalDispatcher,getGlobalDispatcher}=createRequire(join(tree,'package.json'))('undici');
const nativeDispatcher=getGlobalDispatcher();
const nativeFetch=globalThis.fetch;
const agent=new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);
const config={origin:'https://audit-fixture.upstash.io',id:'auditstore',
  privateToken:'vercel_'+'blob_rw_auditstore_synthetic-only',redisWrite:'audit-fixture-write',redisRead:'audit-fixture-read'};
const host=config.id+'.private.blob.vercel-storage.com';
const objects=new Map();
try{
  await withRedis(async ({exec:local})=>{
    globalThis.fetch=async (url,options={})=>{
      const address=new URL(url);
      if(address.origin===config.origin){
        const command=JSON.parse(options.body);
        assert.ok(command[0]==='EVAL'||String(command[1]).startsWith('audit:pr116:'));
        if(new Headers(options.headers).get('authorization')==='Bearer '+config.redisRead&&['EVAL','HSETNX'].includes(command[0]))
          return Response.json({error:'read-only token cannot write'},{status:403});
        try{return Response.json({result:local(...command)});}
        catch{return Response.json({error:'synthetic Redis refusal'});}
      }
      assert.equal(address.hostname,host);
      assert.equal(options.redirect,'manual');
      assert.ok(objects.has(address.pathname.slice(1)));
      return new Response('',{status:403});
    };
    const api=agent.get('https://vercel.com');
    const privateStore=agent.get('https://'+host);
    api.intercept({method:'PUT',path:path=>path.startsWith('/api/blob/?pathname=')}).reply(request=>{
      const pathname=new URL(request.path,'https://vercel.com').searchParams.get('pathname');
      assert.equal(new Headers(request.headers).get('x-vercel-blob-access'),'private');
      assert.equal(new Headers(request.headers).get('x-allow-overwrite'),'0');
      if(objects.has(pathname))return {statusCode:400,data:{error:{code:'bad_request',message:'Synthetic collision'}}};
      objects.set(pathname,Buffer.from(request.body));
      const url='https://'+host+'/'+pathname;
      return {statusCode:200,data:{url,downloadUrl:url,pathname}};
    }).persist();
    privateStore.intercept({method:'GET',path:path=>path.includes('?cache=0')}).reply(request=>{
      assert.equal(new Headers(request.headers).get('authorization'),'Bearer '+config.privateToken);
      const path=new URL(request.path,'https://'+host).pathname.slice(1);
      return objects.has(path)?{statusCode:200,data:objects.get(path)}:{statusCode:404,data:'gone'};
    }).persist();
    api.intercept({method:'POST',path:'/api/blob/delete'}).reply(request=>{
      const [url]=JSON.parse(String(request.body)).urls;
      assert.equal(new URL(url).hostname,host);
      assert.equal(objects.delete(new URL(url).pathname.slice(1)),true);
      return {statusCode:200,data:{}};
    });
    assert.equal(await runProviderAcceptance(tree,config),true);
    assert.equal(local('DBSIZE'),0);
    assert.equal(objects.size,0);
    agent.assertNoPendingInterceptors();
  });
}finally{
  globalThis.fetch=nativeFetch;
  setGlobalDispatcher(nativeDispatcher);
  await agent.close();
}
