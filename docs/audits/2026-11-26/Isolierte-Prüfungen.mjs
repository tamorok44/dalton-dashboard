import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const base=resolve(process.argv[2]??process.cwd());
const moduleFor=path=>import(pathToFileURL(resolve(base,path)).href);
// Wall-clock independent synthetic data. Every network path below is replaced
// with an in-process stub. No cloud client performs a real request.
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('External connections disabled by audit fixture')};
for(const k of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN',
  'BLIZZARD_CLIENT_ID','BLIZZARD_CLIENT_SECRET','FOREVERDB_API_KEY','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN',
  'DALTON_SYNC_TOKEN','SPELLBOOK_SYNC_TOKEN','CRON_SECRET','VERCEL_ENV']){
  delete process.env[k];
}
const findings=[];
const note=(code,actual,expected)=>findings.push({code,actual,expected});
const date=(minutes=0)=>new Date(Date.now()+minutes*60000).toISOString();
const {buildWorkshopCatalog,buildProductionPlan}=await moduleFor('scripts/workshop-core.mjs');
const recipe=(id,quantity,reagents)=>({id,name:'Rezept '+id,craftedItem:{id,name:'Objekt '+id},
  craftedQuantity:{value:quantity},reagents:reagents.map(id=>({id,name:'Objekt '+id,quantity:1}))});
const catalogFor=recipes=>buildWorkshopCatalog({characters:[{slug:'audit-crafter',name:'Test',
  professions:[{id:171,name:'Alchemie',current:200,max:225,knownRecipes:recipes}]}]});
const pooled=buildProductionPlan(catalogFor([recipe(1,1,[2,3]),recipe(2,1,[4]),recipe(3,1,[4]),recipe(4,2,[5])]),1);
const expectedCopperFreeUnits=Math.ceil((1+1)/2);
assert.equal(pooled.externalMaterials[0].id,5);
assert.equal(pooled.externalMaterials[0].quantity,2);
note('F07a',pooled.externalMaterials[0].quantity,expectedCopperFreeUnits);
const cyclic=buildProductionPlan(catalogFor([recipe(6,1,[7]),recipe(7,1,[6])]),6);
assert.equal(cyclic.tree.materials[0].materials[0].status,'cycle-detected');
assert.equal(cyclic.tree.status,'craftable');
assert.deepEqual(cyclic.externalMaterials,[]);
note('F07b',{root:cyclic.tree.status,external:cyclic.externalMaterials.length},'unresolved dependency, not a complete plan');

const {applySpellbookSnapshot}=await moduleFor('scripts/spellbook-sync.mjs');
const newer={slug:'audit-mage',name:'Audit Mage',classId:8,level:12,
  knownClassAbilitiesVerified:true,knownClassAbilitiesCapturedAt:date(-5),knownClassAbilities:[{id:133},{id:143}]};
const older={characterSlug:newer.slug,classId:8,level:12,capturedAt:date(-20),entries:[{id:133,name:'Feuerball'}]};
const restored=applySpellbookSnapshot({generatedAt:date(-4),characters:[newer]},older).characters[0];
assert.deepEqual(restored.knownClassAbilities.map(x=>x.id),[133]);
note('F03',{persistedIds:[133],captureMovesBack:Date.parse(restored.knownClassAbilitiesCapturedAt)<Date.parse(newer.knownClassAbilitiesCapturedAt)},
  {persistedIds:[133,143],captureMovesBack:false});

const {buildLocationPlanner}=await moduleFor('scripts/location-planner.mjs');
const source={id:123,type:'trainer',name:'Testlehrer',side:'horde',evidence:'forever-confirmed',
  location:{zone:'Testregion',x:51,y:51}};
const extras=[{verified:true,availableNow:true,category:'class-abilities',id:4401,name:'Testfähigkeit',sources:[source]}];
function offers(faction){
  return buildLocationPlanner({characters:[{slug:'audit-crafter',name:'Test',classId:8,level:20,faction}]},{},
    {characterSlug:'audit-crafter',location:'Testregion',extraActions:extras}).actions.length;
}
assert.deepEqual([offers('Allianz'),offers('Horde'),offers(null)],[0,1,1]);
note('F08',{alliance:0,horde:1,unknown:1},{alliance:0,horde:1,unknown:0});

const {fetchForeverSnapshot,FOREVER_CHARACTER_ENDPOINTS}=await moduleFor('scripts/blizzard-api.mjs');
process.env.BLIZZARD_CLIENT_ID='audit-fixture';
process.env.BLIZZARD_CLIENT_SECRET='audit-fixture';
const observed=await fetchForeverSnapshot(['audit-a','audit-b'],{fetchImpl:async url=>
  String(url).startsWith('https://oauth.battle.net/')?
    Response.json({access_token:'synthetic-oauth',expires_in:3600}):Response.json({error:'outage fixture'},{status:503})});
const endpoints=Object.values(observed.characters).flatMap(Object.values);
assert.equal(endpoints.length,2*Object.keys(FOREVER_CHARACTER_ENDPOINTS).length);
assert.equal(endpoints.filter(e=>e.ok).length,0);
note('F06',{returned:true,endpoints:endpoints.length,successful:0},'raw snapshot classification must fail before archival when every endpoint fails');

const {createTalentPlannerHandler}=await moduleFor('scripts/talent-planner-api.mjs');
function response(){
  return {http:200,value:null,setHeader(){},status(n){this.http=n;return this},json(value){this.value=value}};
}
let observes=0;
const handler=createTalentPlannerHandler({enabled:()=>true,roster:async()=>({data:{characters:[newer]}}),
  observe:async()=>{observes++;throw Error('synthetic network outage')}});
for(const q of [{character:'not-in-roster'},{character:newer.slug,tree:'11582',goal:'leveling',role:'damage',playStyle:'mixed',priority:'balanced'}]){
  const res=response();
  await handler({method:'GET',query:q},res);
  assert.equal(res.value.ok,false);
  assert.ok([400,404,409].includes(res.http));
}
assert.equal(observes,0);
note('Kontrolle-Talent',{unneededProviderChecks:observes},{unneededProviderChecks:0});

const {encodeCompactMaster}=await moduleFor('scripts/compact-master-cache.mjs');
process.env.VERCEL_ENV='production';
process.env.UPSTASH_REDIS_REST_URL='https://offline-audit.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN='isolated-fixture';
process.env.DALTON_SYNC_TOKEN='isolated-fixture';
const {default:addon}=await moduleFor('api/addon-sync.js');
let current=JSON.stringify({generatedAt:date(-4),characters:[
 {slug:'audit-one',name:'Audit One',classId:8,level:12},
 {slug:'audit-two',name:'Audit Two',classId:8,level:12}
]});
const classFixture=encodeCompactMaster({classMaster:{slug:'mage',abilities:[{ranks:[{id:133},{id:143}]}]}});
const state=new Map();
let receivedReads=0,owner=null;
let bothRead,allowSecond;
const bothReadPromise=new Promise(resolve=>{bothRead=resolve});
const allowSecondPromise=new Promise(resolve=>{allowSecond=resolve});
const commands=[];
globalThis.fetch=async(url,options={})=>{
  assert.equal(String(url),'https://offline-audit.invalid','auditor blocks all real destinations');
  const [op,k,a,...rest]=JSON.parse(options.body);
  commands.push(op);
  let result=null;
  if(op==='GET'){
    if(k.endsWith(':characters:v1')){
      result=current;
      receivedReads++;
      if(receivedReads===2)bothRead();
      await bothReadPromise;
    }else if(k.includes('class-master')&&k.endsWith(':gz1'))result=classFixture;
    else result=state.get(k)??null;
  }else if(op==='SET'&&k.endsWith(':refresh:lock')){
    const attempted=commands.filter(v=>v==='SET').length;
    if(attempted===2)await allowSecondPromise;
    assert.equal(owner,null);owner=a;result='OK';
  }else if(op==='HMGET'){
    result=[a,...rest].map(id=>JSON.stringify({id:Number(id),name:'Feuerball',rank:'Rang'}));
  }else if(op==='RPUSH'){result=1}
  else if(op==='EVAL'){
    const count=a,keys=rest.slice(0,count),values=rest.slice(count);
    if(keys[0].endsWith(':refresh:lock')&&keys.length===3){
      assert.equal(values[0],owner);
      current=values[1];result='OK';
    }else if(keys[0].endsWith(':refresh:lock')&&keys.length===1){
      assert.equal(values[0],owner);owner=null;result=1;
      allowSecond();
    }else if(keys[0].includes(':addon-sync:')){
      state.set(keys[0],values[0]);result='OK';
    }else throw Error('Unexpected fixture Lua command');
  }else throw Error('Unsupported fixture command '+op);
  return Response.json({result});
};
const payload=name=>({schemaVersion:1,addon:{build:'71139',gameVersion:'1.60.1',locale:'deDE'},
  sections:{character:{name,classID:8,level:12,capturedAt:Math.floor(Date.now()/1000)},
    spellbook:{capturedAt:Math.floor(Date.now()/1000),entryCount:1,entries:[{spellID:143,name:'Feuerball',known:true}]}}});
const req=name=>({method:'POST',headers:{authorization:'Bearer isolated-fixture'},body:payload(name)});
const first=response(),second=response();
await Promise.all([addon(req('Audit One'),first),addon(req('Audit Two'),second)]);
assert.deepEqual([first.http,second.http],[200,200]);
assert.deepEqual([first.value.spellbookApplied,second.value.spellbookApplied],[true,true]);
const remaining=JSON.parse(current).characters.filter(c=>c.knownClassAbilitiesVerified===true).map(c=>c.slug);
assert.deepEqual(remaining,['audit-two']);
note('F02',{separateSuccessfulUpdates:2,persistedCharacters:remaining.length},
  {separateSuccessfulUpdates:2,persistedCharacters:2});
globalThis.fetch=originalFetch;
console.log(JSON.stringify(findings,null,2));
