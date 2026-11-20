import assert from 'node:assert/strict';
import {describeShape,probeForeverCharacter,fetchForeverSnapshot} from './blizzard-api.mjs';

process.env.BLIZZARD_CLIENT_ID='test-client';
process.env.BLIZZARD_CLIENT_SECRET='test-secret';

const calls=[];
const fakeResponse=(status,payload)=>({
  ok:status>=200&&status<300,
  status,
  async text(){return JSON.stringify(payload)}
});

const fetchImpl=async (url,options={})=>{
  calls.push({url:String(url),options});
  if(String(url)==='https://oauth.battle.net/token'){
    assert.equal(options.method,'POST');
    assert.match(options.headers.authorization,/^Basic /);
    return fakeResponse(200,{access_token:'secret-access-token',expires_in:86399});
  }
  assert.equal(options.headers.authorization,'Bearer secret-access-token');
  const parsed=new URL(String(url));
  assert.equal(parsed.searchParams.get('namespace'),'profile-forever-eu');
  if(parsed.pathname.endsWith('/equipment')){
    return fakeResponse(200,{equipped_items:[{slot:{type:'HEAD'},item:{id:123,name:'Test Hat'}}]});
  }
  return fakeResponse(200,{
    id:42,
    name:'Cole',
    surname:'Dalton',
    slug:'cole-dalton',
    level:11,
    last_login_timestamp:1795180000000,
    ruleset:{id:1,name:'PvP'}
  });
};

const shape=describeShape({a:1,b:[{c:'x'},{c:'y',d:true}]});
assert.ok(shape.paths.some(x=>x.path==='$.b[].c'&&x.types.includes('string')));
assert.ok(shape.paths.some(x=>x.path==='$.b[].d'&&x.types.includes('boolean')));

const result=await probeForeverCharacter('cole-dalton',{
  fetchImpl,
  endpointNames:['profile','equipment']
});
assert.equal(result.namespace,'profile-forever-eu');
assert.equal(result.oauth.ok,true);
assert.equal(result.endpoints.profile.status,200);
assert.equal(result.endpoints.equipment.status,200);
assert.ok(result.endpoints.profile.timeFields.some(x=>x.path==='$.last_login_timestamp'));
assert.ok(result.endpoints.equipment.schema.paths.some(x=>x.path==='$.equipped_items[].item.name'));
assert.equal(calls.length,3,'One OAuth request plus two API requests');
for(const call of calls.slice(1,3))assert.equal(new URL(call.url).searchParams.get('locale'),'en_GB','Diagnose bleibt standardmässig en_GB');

const beforeSnapshotCalls=calls.length;
const full=await fetchForeverSnapshot(['cole-dalton'],{
  fetchImpl,
  endpointNames:['profile','equipment','professions']
});
assert.equal(full.namespace,'profile-forever-eu');
assert.equal(full.locale,'de_DE','Vollsnapshots werden standardmässig mit deutschem Blizzard-Locale abgerufen');
assert.equal(Object.keys(full.characters['cole-dalton']).length,3);
assert.equal(full.characters['cole-dalton'].profile.status,200);
assert.equal(full.characters['cole-dalton'].equipment.status,200);
assert.equal(calls.length,beforeSnapshotCalls+3,'Cached OAuth token plus every requested raw snapshot endpoint');
for(const call of calls.slice(beforeSnapshotCalls))assert.equal(new URL(call.url).searchParams.get('locale'),'de_DE','Jeder Vollsnapshot-Endpunkt nutzt de_DE');
console.log('Blizzard Forever API client, schema inventory and raw snapshots: OK');
