import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import handler from '../api/refresh.js';

const require=createRequire(import.meta.url);
const snapshot=require('../data/characters.json');
const baseline=new Map(snapshot.characters.map(c=>[c.slug,c]));
const classEnglish={'Druide':'Druid','Magier':'Mage','Jäger':'Hunter'};
const professionEnglish={'Alchemie':'Alchemy','Kräuterkunde':'Herbalism','Bergbau':'Mining','Kürschnerei':'Skinning','Lederverarbeitung':'Leatherworking','Angeln':'Fishing','Kochkunst':'Cooking','Erste Hilfe':'First Aid'};
const originalFetch=globalThis.fetch;
process.env.UPSTASH_REDIS_REST_URL='https://test-redis.example.com';
process.env.UPSTASH_REDIS_REST_TOKEN='test-token';
process.env.CRON_SECRET='test-cron-secret';
let saved=null;
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
    if(op==='GET')return {ok:true,json:async()=>({result:saved})};
    if(op==='SET'){
      let result='OK';
      if(key==='dalton-dashboard:refresh:lock'){if(lock)result=null;else lock=value}
      else if(key==='dalton-dashboard:refresh:manual:cooldown'){if(cooldown)result=null;else cooldown=true}
      else saved=value;
      return {ok:true,json:async()=>({result})};
    }
    if(op==='EVAL'){
      const keys=JSON.parse(options.body);
      const result=keys[2]===1?(lock===keys[4]?(lock=null,lockReleases++,1):0):
        (lock===keys[5]?(saved=keys[6],'OK'):'ERROR');
      return {ok:true,json:async()=>({result})};
    }
    throw Error('Unexpected Redis command');
  }
  const slug=decodeURIComponent(String(url).split('/').at(-1));
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
  console.log('Manual API: parallel fetch, latest level/skills/stats, partial/total failure, cache controls: OK');
}finally{
  globalThis.fetch=originalFetch;
}
