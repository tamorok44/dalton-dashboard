import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import handler from '../api/refresh.js';
import {imageStoreConfigured} from '../scripts/archive-images.mjs';

const require=createRequire(import.meta.url);
const snapshot=require('../data/characters.json');
const baseline=new Map(snapshot.characters.map(c=>[c.slug,c]));
const classEnglish={'Druide':'Druid','Magier':'Mage','Jäger':'Hunter'};
const professionEnglish={'Alchemie':'Alchemy','Kräuterkunde':'Herbalism','Bergbau':'Mining','Kürschnerei':'Skinning','Lederverarbeitung':'Leatherworking','Angeln':'Fishing','Kochkunst':'Cooking','Erste Hilfe':'First Aid'};
const originalFetch=globalThis.fetch;
process.env.UPSTASH_REDIS_REST_URL='https://test-redis.example.com';
process.env.UPSTASH_REDIS_REST_TOKEN='test-token';
process.env.CRON_SECRET='test-cron-secret';
const previousBlobId=process.env.BLOB_STORE_ID;
const previousBlobToken=process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.BLOB_READ_WRITE_TOKEN;
assert.equal(imageStoreConfigured(),false,'No image storage when not connected');
process.env.BLOB_STORE_ID='test-store';
assert.equal(imageStoreConfigured(),true,'OIDC Blob store requires no read/write token');
delete process.env.BLOB_STORE_ID;
process.env.BLOB_READ_WRITE_TOKEN='legacy-token';
assert.equal(imageStoreConfigured(),true,'Existing token-based stores are still supported');
if(previousBlobId!==undefined)process.env.BLOB_STORE_ID=previousBlobId;
if(previousBlobToken!==undefined)process.env.BLOB_READ_WRITE_TOKEN=previousBlobToken;
else delete process.env.BLOB_READ_WRITE_TOKEN;
let saved=null,petRulesSaved=null;
let history=[];
let lock=null,cooldown=false,lockReleases=0;

function fakeResponse(req){
  let status=200,payload=null;
  return {
    headers:{},
    setHeader(key,value){this.headers[key]=value;},
    status(code){status=code;return this;},
    json(body){payload=body;return this;},
    result(){return {status,payload,headers:this.headers};}
  };
}
function armoryHtml(old){
  const character={
    slug:old.slug,level:old.level+2,
    class:{name:classEnglish[old.class]},
    gender:old.gender,professions:{
      primaries:old.professions.slice(0,2).map(p=>({
        name:professionEnglish[p.name],
        tiers:[{skillPoints:p.current+2,maxSkillPoints:p.max}]
      })),
      secondaries:old.professions.slice(2).map(p=>({
        name:professionEnglish[p.name],
        tiers:[{skillPoints:p.current+2,maxSkillPoints:p.max}]
      }))
    },
    stats:{groups:[{stats:[
      ['HEALTH',old.stats.Gesundheit+50],['MANA',old.stats.Mana+50],
      ['STRENGTH',old.stats.Stärke],['AGILITY',old.stats.Beweglichkeit],
      ['STAMINA',old.stats.Ausdauer],['INTELLECT',old.stats.Intelligenz],
      ['ARMOR',old.stats.Rüstung+5],['ATTACKPOWER',old.stats.Angriffskraft],
      ['ITEMLEVEL',old.stats.Gegenstandsstufe]
    ].map(([key,value])=>({enum:key,value:{value}}))}]},
    specs:[],
    media:{'main-raw':{url:old.imageUrl},avatar:{url:old.avatarUrl}}
  };
  return '<script>var characterProfileInitialState = '+JSON.stringify({character})+';</script>';
}
let peak=0,inFlight=0,requests=0,failSlug=null,failAll=false;
globalThis.fetch=async (url,options={})=>{
  if(String(url).startsWith('https://test-redis.example.com')){
    const [op,key,value]=JSON.parse(options.body);
    assert.ok(op==='EVAL'||String(key).startsWith('dalton-dashboard:'),'Only dashboard-owned Redis keys');
    if(op==='GET')return {ok:true,json:async()=>({result:key==='dalton-dashboard:pet-rules:v1'?petRulesSaved:saved})};
    if(op==='SET'){
      let result='OK';
      if(key==='dalton-dashboard:refresh:lock'){if(lock)result=null;else lock=value}
      else if(key==='dalton-dashboard:refresh:manual:cooldown'){if(cooldown)result=null;else cooldown=true}
      else if(key==='dalton-dashboard:pet-rules:v1')petRulesSaved=value;
      else saved=value;
      return {ok:true,json:async()=>({result})};
    }
    if(op==='RPUSH'){
      history.push(value);
      return {ok:true,json:async()=>({result:history.length})};
    }
    if(op==='EVAL'){
      const keys=JSON.parse(options.body);
      const result=keys[2]===1?(lock===keys[4]?(lock=null,lockReleases++,1):0):
        (lock===keys[5]?(saved=keys[6],'OK'):'ERROR');
      return {ok:true,json:async()=>({result})};
    }
    throw Error('Unexpected Redis command');
  }
  const sourceUrl=String(url);
  if(sourceUrl.includes('worldofwarcraft.blizzard.com/en-us/news/24315281'))return {ok:true,status:200,text:async()=>'<li>Hunter Pets erroneously had 150% of their normal health. This is now corrected to 115% of their normal health.</li>'};
  if(sourceUrl.includes('wowhead.com/forever/guide/classes/hunter/survival'))return {ok:true,status:200,text:async()=>`Stamina: Every 1 player Stamina gives the pet 2 Health.
Armor: Pet gains 30% of the player's Armor.
Attack Power: Pet gains 10% of the player's highest Attack Power source.
Critical Strike: Pet gains 100% of the player's Crit chance.`};
  if(sourceUrl.includes('bindonforever.com/pets/fox'))return {ok:true,status:200,text:async()=>`build 1.60.1.70959 Fox is the one new family in WoW Forever client family 319.
Trickster's Dance gives 50% dodge and 30% faster attacks for 12 s. Pet level 20.
Bite Rank 1 1 Rank 2 8 Rank 3 16 Rank 4 24 Rank 5 32 Rank 6 40 Rank 7 48 Rank 8 56.
Dash Rank 1 30 Rank 2 40 Rank 3 50. Fox pets eat meat.`};
  if(sourceUrl.includes('60.tools/guides/hunter-pets'))return {ok:true,status:200,text:async()=>`Family Damage Armor Health Diet Its own abilities Fox 0% +5% 0% Meat Trickster's Dance.`};
  if(sourceUrl.includes('github-wiki-see.page/m/classic-hunter/forever-hunter/wiki/Forever-Hunter-Patch-Notes'))return {ok:true,status:200,text:async()=>`Pet Scaling and Stats
Stamina: 1 player Stamina → 2 pet Health
Armor: Pet gains 30% of player Armor
Attack Power: Pet gains 10% of the player's highest Attack Power source
Critical Strike: Pet inherits 100% of the higher of the Hunter's melee or ranged Crit chance
Pet Focus
Maximum Focus increased from 100 to 150
Focus regeneration is now continuous at 10 Focus per second, filling the full 150 Focus pool in 15 sec.`};
  if(sourceUrl.includes('raw.githubusercontent.com/gunba/wow-forever-sim/forever/docs/check_dispositions.md'))return {ok:true,status:200,text:async()=>`The client PowerType row for Focus in build 69977 supplies a concrete 10 Focus/second in combat, and Hunter scaling 415429 adds 50 maximum Focus to the base 100.`};
  const slug=decodeURIComponent(sourceUrl.split('/').at(-1));
  const profile=baseline.get(slug);
  assert.ok(profile,'Only configured Dalton profiles are requested');
  requests++;inFlight++;peak=Math.max(peak,inFlight);
  await new Promise(resolve=>queueMicrotask(resolve));
  inFlight--;
  if(failAll||slug===failSlug)return {ok:false,status:503};
  return {ok:true,text:async()=>armoryHtml(profile)};
};

try{
  const rejected=fakeResponse();
  await handler({method:'PUT'},rejected);
  assert.equal(rejected.result().status,405,'Unsupported methods are rejected');
  assert.equal(requests,0,'Invalid method must not query Blizzard');

  const denied=fakeResponse();
  await handler({method:'POST',headers:{}},denied);
  assert.equal(denied.result().status,401);

  const ok=fakeResponse();
  await handler({method:'GET'},ok);
  const result=ok.result();
  assert.equal(result.status,200);
  assert.equal(result.payload.success,4);
  assert.equal(result.payload.persisted,true);
  assert.ok(saved,'Redis contains a durable snapshot');
  assert.ok(petRulesSaved,'Redis contains a durable Pet rule state');
  assert.equal(result.payload.petRules.overall,'verified','Rule guard is checked before the profile refresh');
  assert.ok(result.payload.changes>0,'Manual refresh reports meaningful changes');
  assert.equal(history.length,1,'Manual refresh appends one change batch');
  assert.equal(result.payload.data.characters.length,4);
  assert.ok(Number.isFinite(Date.parse(result.payload.data.generatedAt)));
  assert.ok(peak>=4,'Four Blizzard profiles are fetched concurrently');
  assert.equal(requests,4,'Only one authoritative request for each profile');
  for(const c of result.payload.data.characters){
    const old=baseline.get(c.slug);
    assert.equal(c.level,old.level+2,'Latest level is returned');
    assert.equal(c.professions[0].current,old.professions[0].current+2,'Latest skill is returned');
    assert.equal(c.stats.Gesundheit,old.stats.Gesundheit+50,'Latest health is returned');
    assert.equal(c.scrapeOk,true);
  }
  assert.equal(result.headers['Cache-Control'],'private, no-store');

  cooldown=false;
  failSlug='chucky-dalton';
  const partial=fakeResponse();
  await handler({method:'GET'},partial);
  const partialResult=partial.result();
  assert.equal(partialResult.status,200,'Partial failure does not hide successful profiles');
  assert.equal(partialResult.payload.success,3);
  assert.equal(partialResult.payload.data.characters.length,4);
  assert.equal(partialResult.payload.data.characters.find(c=>c.slug===failSlug).scrapeOk,false);
  assert.equal(partialResult.payload.data.characters.find(c=>c.slug===failSlug).level,baseline.get(failSlug).level+2,'Partially failed profile preserves last persisted live level');
  assert.equal(partialResult.payload.data.characters.find(c=>c.slug==='cole-dalton').scrapeOk,true);

  cooldown=false;
  failAll=true;
  const unavailable=fakeResponse();
  await handler({method:'GET'},unavailable);
  assert.equal(unavailable.result().status,503,'Total outage must not claim fresh data');
  assert.ok(unavailable.result().payload.error);
  const scheduled=fakeResponse();
  failAll=false;failSlug=null;
  await handler({method:'POST',headers:{authorization:'Bearer test-cron-secret'}},scheduled);
  assert.equal(scheduled.result().status,200,'Authorized scheduled update succeeds');
  assert.ok(lockReleases>=3,'Distributed lock is released after runs');
  lock='other-instance';
  const savedBeforeConflict=saved, requestsBeforeConflict=requests;
  const overlapping=fakeResponse();
  await handler({method:'POST',headers:{authorization:'Bearer test-cron-secret'}},overlapping);
  assert.equal(overlapping.result().status,200,'Scheduled overlapping requests are acknowledged');
  assert.equal(overlapping.result().payload.pending,true,'Overlapping requests are not treated as a completed refresh');
  assert.equal(saved,savedBeforeConflict,'No stale data overwrites when another instance holds the lock');
  assert.equal(requests,requestsBeforeConflict,'Locked request does not contact Blizzard');
  lock=null;
  cooldown=true;
  const throttled=fakeResponse();
  await handler({method:'GET'},throttled);
  assert.equal(throttled.result().status,429,'Manual refresh has a shared 60-second cooldown');
  console.log('Manual API: parallel fetch, latest level/skills/stats, partial/total failure, cache controls: OK');
}finally{
  globalThis.fetch=originalFetch;
}
