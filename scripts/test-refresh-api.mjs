import assert from 'node:assert/strict';
import {PET_DB2_BASELINE,PET_DB2_REVIEWED_BUILD} from './pet-db2-baseline.mjs';
import {petDb2Url} from './pet-db2-audit.mjs';
import {createRequire} from 'node:module';
import handler,{refreshAuthorization} from '../api/refresh.js';
import {savePetRuleState} from './pet-rule-store.mjs';
import {imageStoreConfigured} from '../scripts/archive-images.mjs';

const require=createRequire(import.meta.url);
const snapshot=require('../data/characters.json');
const baseline=new Map(snapshot.characters.map(c=>[c.slug,c]));
const classIds={'Druide':11,'Magier':8,'Jäger':3};
const statLabels={
  HEALTH:'Gesundheit',MANA:'Mana',STRENGTH:'Stärke',AGILITY:'Beweglichkeit',STAMINA:'Ausdauer',
  INTELLECT:'Intelligenz',ARMOR:'Rüstung',ATTACKPOWER:'Angriffskraft',ITEMLEVEL:'Gegenstandsstufe'
};
const originalFetch=globalThis.fetch;
process.env.UPSTASH_REDIS_REST_URL='https://test-redis.example.com';
process.env.UPSTASH_REDIS_REST_TOKEN='test-token';
process.env.CRON_SECRET='test-cron-secret';
process.env.DALTON_MANUAL_REFRESH_TOKEN='synthetic-manual-refresh-code-0123456789';
process.env.VERCEL_ENV='production';
const manualRequest={method:'POST',headers:{authorization:'Bearer '+process.env.DALTON_MANUAL_REFRESH_TOKEN}};
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
let lock=null,cooldown=false,lockReleases=0,failPetRuleSave=false;

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
    class:{id:classIds[old.class],name:old.class},
    race:{name:old.race},
    faction:{name:old.faction},
    gender:old.gender,
    // German Armory profession labels may still be English; they must not replace de_DE Game-Data names.
    professions:{primaries:[{name:'Mining',tiers:[{skillPoints:61,maxSkillPoints:75}]}]},
    stats:{groups:[{stats:[
      ['HEALTH',old.stats.Gesundheit+50],['MANA',old.stats.Mana+50],
      ['STRENGTH',old.stats.Stärke],['AGILITY',old.stats.Beweglichkeit],
      ['STAMINA',old.stats.Ausdauer],['INTELLECT',old.stats.Intelligenz],
      ['ARMOR',old.stats.Rüstung+5],['ATTACKPOWER',old.stats.Angriffskraft],
      ['ITEMLEVEL',old.stats.Gegenstandsstufe]
    ].map(([key,value])=>({enum:key,name:statLabels[key],value:{value}}))}]},
    specs:[],
    media:{'main-raw':{url:old.imageUrl},avatar:{url:old.avatarUrl}}
  };
  return '<script>var characterProfileInitialState = '+JSON.stringify({character})+';</script>';
}
let peak=0,inFlight=0,requests=0,redisRequests=0,failSlug=null,failAll=false;
globalThis.fetch=async (url,options={})=>{
  if(String(url).startsWith('https://test-redis.example.com')){
    redisRequests++;
    const [op,key,value]=JSON.parse(options.body);
    assert.ok(op==='EVAL'||String(key).startsWith('dalton-dashboard:'),'Only dashboard-owned Redis keys');
    if(op==='GET')return {ok:true,json:async()=>({result:key==='dalton-dashboard:pet-rules:v1'?petRulesSaved:key==='dalton-dashboard:characters:v1'?saved:null})};
    if(op==='SET'){
      let result='OK';
      if(key==='dalton-dashboard:refresh:lock'){if(lock)result=null;else lock=value}
      else if(key==='dalton-dashboard:refresh:manual:cooldown'){if(cooldown)result=null;else cooldown=true}
      else if(key==='dalton-dashboard:pet-rules:v1'){
        if(failPetRuleSave)return {ok:true,json:async()=>({error:'pet rule write failed'})};
        petRulesSaved=value;
      }
      else saved=value;
      return {ok:true,json:async()=>({result})};
    }
    if(op==='RPUSH'){
      history.push(value);
      return {ok:true,json:async()=>({result:history.length})};
    }
    if(op==='EVAL'){
      const keys=JSON.parse(options.body);
      if(keys[3]==='dalton-dashboard:pet-rules:v1'){
        if(failPetRuleSave)return {ok:true,json:async()=>({error:'pet rule write failed'})};
        const next=JSON.parse(keys[5]);
        const previous=petRulesSaved?JSON.parse(petRulesSaved):null;
        if(!previous||previous.checkedAt<=next.checkedAt){
          const latest=previous?.talentRuleObservation;
          let observation=keys[7]==='preview'?latest:keys[8]?JSON.parse(keys[8]):undefined;
          if(keys[7]!=='preview'&&Number.isFinite(observation?.checkedAtMs)&&Number.isFinite(latest?.checkedAtMs)){
            const elapsed=observation.checkedAtMs-latest.checkedAtMs;
            const same=observation.status===latest.status&&observation.clientBuild===latest.clientBuild&&
              observation.hotfixRevision===latest.hotfixRevision;
            if(elapsed<0)observation=latest;
            else if(elapsed===0&&!same)observation={...observation,status:'review_required',revisionSince:null};
            else if(same&&observation.status==='observed'&&latest.revisionSince&&elapsed<keys[9]){
              observation={...observation,revisionSince:latest.revisionSince};
            }
          }
          next.talentRuleObservation=observation;
          petRulesSaved=JSON.stringify(next);
        }
        return {ok:true,json:async()=>({result:petRulesSaved})};
      }
      const result=keys[2]===1?(lock===keys[4]?(lock=null,lockReleases++,1):0):
        (lock===keys[6]?(saved=keys[7],'OK'):'ERROR');
      return {ok:true,json:async()=>({result})};
    }
    throw Error('Unexpected Redis command');
  }
  const sourceUrl=String(url);
  if(sourceUrl.startsWith('https://wago.tools/db2/')){
    const spec=Object.values(PET_DB2_BASELINE).find(spec=>petDb2Url(spec,PET_DB2_REVIEWED_BUILD)===sourceUrl);
    assert.ok(spec,'Only the reviewed DB2 datasets are requested');
    return {ok:true,status:200,text:async()=>[spec.header,...spec.rows].join('\n')};
  }
  if(sourceUrl.includes('worldofwarcraft.blizzard.com/en-us/news/24315281'))return {ok:true,status:200,text:async()=>'<li>Hunter Pets erroneously had 150% of their normal health. This is now corrected to 115% of their normal health.</li><li>Fixed an issue where pets had 0% critical strike chance on melee basic attacks.</li>'};
  if(sourceUrl.includes('us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes'))return {ok:true,status:200,text:async()=>`Pets now correctly benefit from Expertise.
Fixed an issue where pets were only ever inheriting the player's Melee Critical Strike chance instead of whichever is higher, melee or ranged.`};
  if(sourceUrl.includes('wowsims/forever/'))return {ok:true,status:200,text:async()=>"## Count of 2026-11-23 to 2026-11-24\n| 5 | 34 | 15,281 / 53,245 | 28.7% | 6,235 / 25,967 | 24.0% | 16.1% |\nAt 5/5 the white swings' 28.7% is their 12.8% before the hotfix plus the owners' 16.1%.\nThe abilities' slope is 0.93 (0.85 to 1.02, 386 reports)"};
  if(sourceUrl.includes('4evrbugs.com/bug/556'))return {ok:true,status:200,text:async()=>`White swings get none of the crit inherited from the hunter. Claw and Bite crit at about the Hunter's crit chance.`};
  if(sourceUrl.includes('foreverdb.net/changelog'))return {ok:true,status:200,text:async()=>`<main>
<h1>Build changelog</h1>
<p>What each WoW Forever client build added, removed or changed.</p>
<ul>
<li>Build 1.60.1.71091 (2026-11-22): 9 spells (9 changed); 80 items (3 added, 77 changed); 1 armor set (1 changed).</li>
<li>Build 1.60.1.70959 (2026-11-18): 1 class ability (1 changed); 2 talents (2 changed).</li>
</ul>
<p>Data from the WoW Forever client, build 1.60.1.71091, extracted 2026-11-22.</p>
</main>`};
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
  if(sourceUrl.includes('statrat.info/classes/hunter/levelling/'))return {ok:true,status:200,text:async()=>`Fox Damage (physical) ×1.00 Health ×1.00 Base armour ×1.05. Family passives · Forever client 70374. Physical damage and base armour.`};
  if(sourceUrl.includes('efficient.games/wowf/hunter-pets'))return {ok:true,status:200,text:async()=>`WoW Forever 1.60.1 (build 70959). Bite Rank 1 1 1 Charged 1 in play Bite Rank 2 8 4 Charged 4 in play. Trickster's Dance Rank 1 20 10. Dash Rank 1 30 15 for Boar, Cat, Fox, Hyena, Tallstrider, Wolf.`};
  if(sourceUrl.includes('mobalytics.gg/wow-forever/classes/hunter-leveling-1-60-vareion'))return {ok:true,status:200,text:async()=>`100% of your Crit strike 10% of your highest Attack Power source 30% of your Armor 1 Hunter Stamina = 2 Pet Health.`};
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
  const publicGet=fakeResponse();
  await handler({method:'GET',headers:manualRequest.headers},publicGet);
  assert.equal(publicGet.result().status,405);
  const invalid=fakeResponse();
  await handler({method:'POST',headers:{authorization:'Bearer incorrect'}},invalid);
  assert.equal(invalid.result().status,401);
  process.env.VERCEL_ENV='preview';
  const previewDenied=fakeResponse();
  await handler(manualRequest,previewDenied);assert.equal(previewDenied.result().status,401);
  const previewCron=fakeResponse();
  await handler({method:'POST',headers:{authorization:'Bearer test-cron-secret'}},previewCron);
  assert.equal(previewCron.result().status,401);
  process.env.VERCEL_ENV='production';
  assert.equal(refreshAuthorization(manualRequest,{VERCEL_ENV:'production'}),null);
  assert.equal(refreshAuthorization(manualRequest,{VERCEL_ENV:'production',DALTON_MANUAL_REFRESH_TOKEN:process.env.DALTON_MANUAL_REFRESH_TOKEN,
    SPELLBOOK_SYNC_TOKEN:process.env.DALTON_MANUAL_REFRESH_TOKEN}),null);
  assert.equal(redisRequests,0,'Unauthorized requests must never query Redis or consume cooldown');
  assert.equal(requests,0,'Unauthorized requests must never query Blizzard');

  failPetRuleSave=true;
  cooldown=false;
  const releasesBeforeRuleFailure=lockReleases;
  const ruleFailure=fakeResponse();
  await handler(manualRequest,ruleFailure);
  assert.equal(ruleFailure.result().status,503,'Pet-Regelprüfungsfehler darf den Refresh nicht als erfolgreich melden');
  assert.equal(lock,null,'Refresh-Lock wird auch freigegeben, wenn die Pet-Regelprüfung vor dem Profilabruf scheitert');
  assert.equal(lockReleases,releasesBeforeRuleFailure+1,'Fehler vor refreshAndPersist führt genau eine Lock-Freigabe aus');
  failPetRuleSave=false;
  cooldown=false;

  const ok=fakeResponse();
  await handler(manualRequest,ok);
  const result=ok.result();
  assert.equal(result.status,200);
  assert.equal(result.payload.success,4);
  assert.equal(result.payload.persisted,true);
  assert.ok(saved,'Redis contains a durable snapshot');
  assert.ok(petRulesSaved,'Redis contains a durable Pet rule state');
  assert.equal(result.payload.petRules.overall,'verified','Reviewed model and hotfix guard are checked before the profile refresh');
  assert.equal(result.payload.petRules.rules['pet.scaling.crit'].evidence,'reference_model');
  assert.equal(result.payload.petRules.rules['pet.scaling.health'].status,'verified');
  assert.equal(result.payload.petRules.rules['pet.scaling'].evidence,'reference_model');
  assert.equal(result.payload.petRules.rules['pet.crit.inheritance'].evidence,'official');
  assert.equal(result.payload.petRules.rules['pet.expertise'].evidence,'official');
  assert.equal(result.payload.petRules.rules['pet.autoswing.crit'].evidence,'official');
  assert.equal(result.payload.petRules.rules['pet.autoswing.crit'].status,'verified');
  assert.equal(result.payload.petRules.sources.foreverDbBuild.build,'1.60.1.71091');
  assert.ok(Array.isArray(result.payload.petRules.history)&&result.payload.petRules.history.length>0,'Rule state transitions are persisted and exposed');
  assert.ok(result.payload.changes>0,'Manual refresh reports meaningful changes');
  assert.equal(history.length,1,'Manual refresh appends one change batch');
  assert.equal(result.payload.data.characters.length,4);
  assert.ok(Number.isFinite(Date.parse(result.payload.data.generatedAt)));
  assert.ok(peak>=4,'Four Blizzard profiles are fetched concurrently');
  assert.equal(requests,4,'Only one authoritative request for each profile');
  for(const c of result.payload.data.characters){
    const old=baseline.get(c.slug);
    assert.equal(c.level,old.level+2,'Latest level is returned');
    assert.equal(c.professions[0].current,old.professions[0].current,'Without de_DE Game Data the last verified profession name/value is retained');
    assert.equal(c.professions[0].unverified,true,'Armory profession labels are never self-translated into visible data');
    assert.equal(c.stats.Gesundheit,old.stats.Gesundheit+50,'Latest source-backed German health value is returned');
    assert.equal(c.class,old.class,'German Armory class string is preserved verbatim');
    assert.equal(c.classId,classIds[old.class]);
    assert.equal(c.scrapeOk,true);
  }
  assert.equal(result.headers['Cache-Control'],'private, no-store');

  cooldown=false;
  failSlug='chucky-dalton';
  const partial=fakeResponse();
  await handler(manualRequest,partial);
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
  await handler(manualRequest,unavailable);
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
  await handler(manualRequest,throttled);
  assert.equal(throttled.result().status,429,'Manual refresh has a shared 60-second cooldown');
  const priorEnvironment=process.env.VERCEL_ENV;
  try{
    const checkedAt='2099-11-25T01:00:00.000Z';
    const observation={checkedAt,status:'observed',clientBuild:'1.60.1.71091',hotfixRevision:'a'.repeat(64)};
    const state={checkedAt,rulebookVersion:'test',history:[],talentRuleObservation:observation};
    process.env.VERCEL_ENV='production';
    assert.deepEqual(await savePetRuleState(state),state);
    assert.deepEqual(await savePetRuleState({...state,checkedAt:'2099-11-25T00:00:00.000Z',talentRuleObservation:null}),state);
    process.env.VERCEL_ENV='preview';
    const preview=await savePetRuleState({...state,checkedAt:'2099-11-25T02:00:00.000Z',
      talentRuleObservation:{...observation,status:'source_unavailable'}});
    assert.deepEqual(preview.talentRuleObservation,observation);
    assert.deepEqual(preview.history,[]);
    process.env.VERCEL_ENV='production';
    const productionSave=(time,{status='observed',digest=observation.hotfixRevision}={})=>savePetRuleState({
      ...state,checkedAt:time,talentRuleObservation:{
        checkedAt:time,checkedAtMs:Date.parse(time),revisionSince:status==='observed'?time:null,
        status,clientBuild:observation.clientBuild,hotfixRevision:digest
      }
    });
    const t1='2099-11-25T03:00:00.000Z',t2='2099-11-25T04:00:00.000Z';
    await productionSave(t1);
    const repeated=await productionSave(t2);
    assert.equal(repeated.talentRuleObservation.checkedAt,t2);
    assert.equal(repeated.talentRuleObservation.revisionSince,t1);
    assert.deepEqual(await productionSave(t1,{digest:'b'.repeat(64)}),repeated);
    const conflict=await productionSave(t2,{digest:'b'.repeat(64)});
    assert.equal(conflict.talentRuleObservation.status,'review_required');
    assert.equal(conflict.talentRuleObservation.revisionSince,null);
    const recoveredAt='2099-11-25T05:00:00.000Z';
    assert.equal((await productionSave(recoveredAt)).talentRuleObservation.revisionSince,recoveredAt);
    await productionSave('2099-11-25T06:00:00.000Z',{status:'source_unavailable',digest:null});
    const afterOutage='2099-11-25T07:00:00.000Z';
    assert.equal((await productionSave(afterOutage)).talentRuleObservation.revisionSince,afterOutage);
    const afterExpiry='2099-11-26T09:00:00.000Z';
    assert.equal((await productionSave(afterExpiry)).talentRuleObservation.revisionSince,afterExpiry);

  }finally{
    if(priorEnvironment===undefined)delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=priorEnvironment;
  }
  console.log('Manual API: parallel German Armory fetch, source-backed stats, profession fail-closed behavior and outages: OK');
}finally{
  globalThis.fetch=originalFetch;
}
