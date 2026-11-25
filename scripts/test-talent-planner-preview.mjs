import assert from 'node:assert/strict';
import charactersApi from '../api/characters.js';
import {createTalentPlannerHandler} from './talent-planner-api.mjs';
import {loadPreviewTalentObservation} from './talent-preview-observation.mjs';
import {TALENT_CATALOG_MAX_AGE_MS} from './talent-rule-watch.mjs';
import {compareTalentProgress,talentGuideOptions,planIsCurrent} from '../talent-planner.js';
import {talentPlanLibrary} from './talent-plan-index.mjs';
import release from '../data/talent-planning/release-catalog.json' with {type:'json'};
import proofs from '../data/talent-planning/catalog-proofs-2026-11-25.json' with {type:'json'};

const rules=release.rulePacks[0];
const klass=proofs.catalogs.find(entry=>entry.proof.classId===rules.classId).proof;
const checkedAt='2026-11-25T10:00:00.000Z';
const start=Date.parse(checkedAt);
const observation={status:'observed',checkedAt,checkedAtMs:start,revisionSince:checkedAt,
  clientBuild:rules.clientBuild,hotfixRevision:rules.hotfixRevision};
const master={classes:{[rules.classId]:klass},classMechanicsRevisions:{[rules.classId]:rules.catalogRevision},
  stale:false,checkedAt,sourceRevision:rules.sourceRevision,sourceFreshAt:{raw:checkedAt,localized:checkedAt}};
const mage={slug:'preview-mage',url:'https://foreverspec.com/de/armory/eu/preview-mage/',level:15,
  classId:8,blizzardCharacterId:555,scrapedAt:checkedAt,talentDetailsVerified:true,talentDetails:[]};
const warrior={...mage,slug:'preview-warrior',classId:1,blizzardCharacterId:556};
const query={character:mage.slug,tree:'11582',goal:'leveling',role:'damage',playStyle:'mixed',priority:'balanced',
  rank:'0',rankSource:'player_confirmed'};
let reads=0;
const roster=async()=>({data:{characters:[mage,warrior]}});
function handler(overrides={}){
  return createTalentPlannerHandler({enabled:()=>true,roster,observe:async()=>{reads++;return observation},
    master:async()=>master,clock:()=>start+1000,project:async value=>value,...overrides});
}
async function request(params,{endpoint=handler(),method='GET'}={}){
  const response={headers:{},setHeader(name,value){this.headers[name]=value},
    status(code){this.code=code;return this},json(body){this.body=body}};
  await endpoint({method,query:params},response);
  assert.equal(response.headers['Cache-Control'],'private, no-store');
  return response;
}
async function blocked(code,params=query,overrides={}){
  const {body}=await request(params,{endpoint:handler(overrides)});
  assert.equal(body.ok,false);
  assert.equal(body.code,code);
  assert.ok(!Object.hasOwn(body,'history'));
}
assert.equal((await request(query,{endpoint:handler({enabled:()=>false})})).code,404);
const previous=process.env.VERCEL_ENV;
try{
  process.env.VERCEL_ENV='production';
  assert.equal((await request({...query,view:'talent-planner'},{endpoint:charactersApi})).code,404);
}finally{
  if(previous===undefined)delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV=previous;
}
await blocked('unknown_character',{...query,character:'not-in-roster'});
await blocked('unknown_character',query,{roster:async()=>({data:{characters:[mage,{...mage,blizzardCharacterId:556}]}})});
await blocked('roster_unavailable',query,{roster:async()=>({fallback:true})});
assert.deepEqual((await request({character:warrior.slug})).body.profiles,[]);
await blocked('no_approved_recommendation',{...query,character:warrior.slug});
await blocked('no_approved_recommendation',{...query,goal:'pvp'});
await blocked('no_approved_recommendation',{...query,tree:'11601'});
for(const rank of ['',undefined,'-1','00'])await blocked('unverified_legacy_rank',{...query,rank});
await blocked('unverified_legacy_rank',{...query,rankSource:undefined});
await blocked('unsupported_legacy_rank',{...query,rank:'1'});
await blocked('binding_unavailable',{...query,planId:'mage-arcane-leveling',version:'2',identity:'["eu","",555]'});
await blocked('binding_unavailable',{...query,planId:'mage-arcane-leveling',version:'1',identity:'["us","",555]'});
await blocked('binding_unavailable',{...query,goal:'pvp',planId:'mage-arcane-leveling',version:'1',identity:'["eu","",555]'});
assert.equal(reads,0,'rejected requests and profile discovery do not inspect catalogs or providers');

const info=(await request({character:mage.slug})).body;
assert.equal(info.profiles.length,1);
assert.equal(info.identity,'["eu","",555]');
assert.equal(info.profiles[0].name,'Arkan');
assert.deepEqual(info.profiles[0].supportedLegacyRanks,[0]);
assert.equal(talentGuideOptions(info.profiles).complete,false);
assert.equal(talentGuideOptions(info.profiles,{goal:'pvp'}).profiles.length,0);
assert.equal(talentGuideOptions(info.profiles,{goal:'leveling'}).profiles.length,1);
assert.equal(talentGuideOptions(info.profiles,{goal:'leveling'}).fields.length,4);
const good=(await request({...query,planId:'mage-arcane-leveling',version:'1',identity:info.identity})).body;
assert.equal(good.ok,true);
assert.equal(good.history.length,51);
assert.equal(good.version,1);
assert.equal(good.evidence.catalogRevision,rules.catalogRevision);
assert.equal(good.evidence.sourceRevision,rules.sourceRevision);
assert.deepEqual(good.legacyRank,{rank:0,source:'player_confirmed'});
assert.equal(good.character.talentDetailsVerified,false,'empty API records do not establish an empty learned tree');
await blocked('unverified_current_catalog',query,{master:async()=>({...master,stale:true})});
await blocked('unverified_current_catalog',query,{master:async()=>({...master,classMechanicsRevisions:{}})});
await blocked('unverified_current_rules',query,{master:async()=>({...master,sourceRevision:'a'.repeat(64)})});
await blocked('unverified_current_rules',query,{observe:async()=>({...observation,clientBuild:'1.60.1.71092'})});
await blocked('unverified_current_rules',query,{observe:async()=>({...observation,hotfixRevision:'a'.repeat(64)})});
await blocked('unverified_current_rules',query,{observe:async()=>null});
await blocked('unverified_current_rules',query,{clock:()=>start+TALENT_CATALOG_MAX_AGE_MS});
await blocked('source_unavailable',query,{observe:async()=>{throw Error('Redis down')}});
await blocked('source_unavailable',query,{master:async()=>{throw Error('network down')}});

const [current]=talentPlanLibrary;
const archived={...current,active:false};
const newer={...current,version:2};
const versions=handler({library:[archived,newer]});
assert.equal((await request(query,{endpoint:versions})).body.version,2);
assert.equal((await request({...query,planId:current.id,version:'1',identity:info.identity},{endpoint:versions})).body.version,1);
assert.equal((await request({character:mage.slug},{endpoint:versions})).body.profiles.length,1);
const newCharacter={...mage,slug:'second-mage',blizzardCharacterId:777};
assert.equal((await request({character:newCharacter.slug},{endpoint:handler({roster:async()=>({data:{characters:[mage,newCharacter]}})})})).body.profiles.length,1);
assert.equal((await request({character:mage.slug},{endpoint:handler({roster:async()=>({data:{characters:[mage,{...mage,slug:'duplicate-id'}]}})})})).body.identity,null);
const stalePersonal=(await request(query,{endpoint:handler({roster:async()=>({data:{characters:[{...mage,scrapedAt:'2026-11-20T10:00:00Z'}]}})})})).body;
assert.equal(stalePersonal.ok,true);
assert.equal(stalePersonal.character.talentDetailsFresh,false);
assert.equal(stalePersonal.character.personalValidUntil,null);
assert.equal(good.character.talentDetailsFresh,true);
assert.equal(planIsCurrent(good,start+1000),true);
assert.equal(planIsCurrent(good,start+TALENT_CATALOG_MAX_AGE_MS),false);
const first=good.history[0];
assert.deepEqual(compareTalentProgress(good.history,{verified:false,ranks:new Map()},15),{status:'unknown'});
assert.equal(compareTalentProgress(good.history,{verified:true,ranks:new Map([[123,1]])},15).status,'different');
assert.equal(compareTalentProgress(good.history,{verified:true,ranks:new Map([[first.talentId,1]])},9).status,'different');
assert.equal(compareTalentProgress(good.history,{verified:true,ranks:new Map([[first.talentId,1]])},15).next.point,2);

const cache=new Map();
let calls=0,now=start;
const redisImpl=async([cmd,key,value,,operation,ttl])=>{
  if(cmd==='GET')return cache.get(key)?.expires>now?cache.get(key).value:null;
  if(cmd==='SET'){
    assert.ok(key.endsWith(':preview:v1:attempt'));
    assert.equal(operation,'EX');
    assert.equal(ttl,21600);
    if(cache.get(key)?.expires>now)return null;
    cache.set(key,{value,expires:now+ttl*1000});
    return 'OK';
  }
  throw Error('Unexpected command '+cmd);
};
const call=(...args)=>loadPreviewTalentObservation({clock:()=>now,check:async({now:date})=>{
  calls++;
  const checkedAt=date.toISOString();
  return {...observation,checkedAt,checkedAtMs:now,revisionSince:checkedAt};
},redisImpl:async command=>{
  if(command[0]!=='EVAL')return redisImpl(command);
  const [,,,lock,key,token,value,ttl]=command;
  assert.ok(key.endsWith(':preview:v1'));
  assert.equal(cache.get(lock).value,token);
  cache.set(key,{value,expires:now+ttl*1000});
  return 'OK';
},...args[0]});
const joined=await Promise.all([call(),call()]);
assert.equal(joined.filter(Boolean).length,1);
assert.equal(calls,1);
assert.deepEqual(await call(),observation);
now+=TALENT_CATALOG_MAX_AGE_MS;
assert.equal((await call()).revisionSince,checkedAt);
assert.equal(calls,2);
now+=TALENT_CATALOG_MAX_AGE_MS;
await assert.rejects(call({check:async()=>{throw Error('upstream unavailable')}}),/upstream unavailable/);
assert.equal(await call(),null,'failed attempts count toward the shared budget');
assert.equal(calls,2);
console.log('Talent Preview: roster, exact binding, rank, live gates, no fallback, shared attempt budget and personal progress: OK');
