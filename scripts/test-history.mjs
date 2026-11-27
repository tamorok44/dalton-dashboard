import assert from 'node:assert/strict';
import {diffMeaningfulChanges,historyProjection} from './history-store.mjs';
import {berlinClock,dailyRefreshComplete} from '../api/daily-snapshot.js';

const base={
  generatedAt:'2026-11-20T10:00:00.000Z',
  characters:[{
    slug:'cole-dalton',name:'Cole Dalton',level:11,class:'Magier',race:'Himmelsgeborene',
    experience:100,lastLoginAt:'2026-11-20T09:00:00.000Z',
    professions:[{name:'Alchemie',current:58,max:75}],
    activeQuests:[{id:9001,name:'Ein großes Abenteuer'}],
    completedQuestIds:[8123],
    stats:{Gesundheit:200,Mana:500},
    equipment:[{slot:'Brust',item:'Altes Wams',level:8,quality:'COMMON',icon:'https://example.test/a.jpg'}],
    scrapedAt:'2026-11-20T10:00:00.000Z',imageCheckedAt:'2026-11-20T10:00:00.000Z',
    apiProfileCheckedAt:'2026-11-20T10:00:00.000Z'
  }]
};
const onlyVolatile=structuredClone(base);
onlyVolatile.generatedAt='2026-11-20T11:00:00.000Z';
onlyVolatile.characters[0].scrapedAt='2026-11-20T11:00:00.000Z';
onlyVolatile.characters[0].imageCheckedAt='2026-11-20T11:00:00.000Z';
onlyVolatile.characters[0].apiProfileCheckedAt='2026-11-20T11:00:00.000Z';
assert.deepEqual(diffMeaningfulChanges(base,onlyVolatile),[],'Abrufzeitpunkte erzeugen keine Historienereignisse');

const changed=structuredClone(onlyVolatile);
changed.characters[0].level=12;
changed.characters[0].experience=250;
changed.characters[0].professions[0].current=63;
changed.characters[0].equipment[0].item='Neues Wams';
changed.characters[0].completedQuestIds.push(9001);
changed.characters[0].hunterPets={active:[{name:'Slydris',level:6,family:{id:319,name:'Fuchs',slug:'fox'},active:true,summoned:true,slot:0}],stable:[]};
const changes=diffMeaningfulChanges(base,changed);
assert.ok(changes.some(x=>x.path==='level'&&x.before===11&&x.after===12));
assert.ok(changes.some(x=>x.path==='experience'&&x.before===100&&x.after===250));
assert.ok(changes.some(x=>x.path==='professions.Alchemie.current'&&x.after===63));
assert.ok(changes.some(x=>x.path==='equipment.Brust.item'&&x.after==='Neues Wams'));
assert.ok(changes.some(x=>x.path==='hunterPets.active'&&Array.isArray(x.after)&&x.after[0]?.name==='Slydris'),'Ein neuer Jägerbegleiter wird historisiert');
assert.ok(changes.some(x=>x.path==='completedQuests.9001'&&x.before===null&&x.after===true),'Ein neuer Questabschluss wird als einzelne ID statt als komplette Liste historisiert');
assert.ok(!changes.some(x=>x.path==='completedQuests'&&Array.isArray(x.after)),'Completed-Liste darf die Historie nicht mit Vollkopien aufblasen');
assert.ok(!Object.hasOwn(historyProjection(changed.characters[0]),'scrapedAt'));
console.log('Historie: nur fachliche Änderungen, keine Abrufzeitstempel: OK');

const winter=berlinClock(new Date('2026-01-15T04:07:00.000Z'));
const summer=berlinClock(new Date('2026-07-15T04:07:00.000Z'));
assert.equal(winter.hour,5,'04:07 UTC corresponds to 05:07 in Berlin winter time');
assert.equal(summer.hour,6,'04:07 UTC corresponds to 06:07 in Berlin summer time');
const winterRetry=berlinClock(new Date('2026-01-15T04:37:00.000Z'));
const summerRetry=berlinClock(new Date('2026-07-15T04:37:00.000Z'));
assert.equal(winterRetry.hour,5,'04:37 UTC remains inside the Berlin winter retry window');
assert.equal(summerRetry.hour,6,'04:37 UTC remains inside the Berlin summer retry window');
assert.equal(dailyRefreshComplete(null),false,'Ohne Snapshot-Metadaten ist der Tageslauf nicht vollständig');
assert.equal(dailyRefreshComplete({date:'2026-11-22'}),false,'Ein gespeicherter Snapshot allein darf einen fehlgeschlagenen Profil-Refresh nicht verdecken');
assert.equal(dailyRefreshComplete({refresh:{persisted:false}}),false,'Nicht persistierter Refresh bleibt wiederholbar');
assert.equal(dailyRefreshComplete({refresh:{persisted:true}}),true,'Erst ein persistierter Profil-Refresh schliesst den Tageslauf ab');

// Exercise the actual authenticated daily handler without network or storage.
const {createDailySnapshotHandler}=await import('../api/daily-snapshot.js');
const {dailySnapshotStoreConfigured,saveDailySnapshot}=await import('./daily-snapshot-store.mjs');
const oldEnv=process.env.CRON_SECRET,oldScope=process.env.VERCEL_ENV;
process.env.VERCEL_ENV='production';
process.env.CRON_SECRET='synthetic-privacy-test';
let stored=null,events=[],persisted=false,dependencyCalls=0;
const touched=value=>{dependencyCalls++;return value};
const run=createDailySnapshotHandler({
  clock:()=>touched({date:'2026-11-27',hour:5,minute:7}),configured:()=>touched(true),blizzardConfigured:()=>touched(true),
  getDailySnapshot:async()=>touched(stored),registerDailySnapshot:async meta=>{stored=structuredClone(meta);events.push('register');},
  acquireDailySnapshotLock:async()=>{events.push('lock');return 'local-lock';},
  releaseDailySnapshotLock:async(date,token)=>{assert.equal(token,'local-lock');events.push('release');},
  ensurePetRuleState:async({force})=>{events.push('rules:'+force);return {};},
  refreshDailyCharacters:async()=>{events.push('refresh');return {persisted};},publicPetRuleState:()=>null
});
const call=async(auth='Bearer synthetic-privacy-test')=>{
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await run({method:'GET',headers:{authorization:auth}},res);return res;
};
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Network forbidden in privacy regression');};
try{
  assert.equal(dailySnapshotStoreConfigured(),false);
  await assert.rejects(saveDailySnapshot({private:'synthetic'},'2026-11-27'),/deaktiviert/);
  for(const scope of ['preview','development','',undefined,'Production']){
    if(scope===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=scope;
    assert.equal((await call()).code,403,'Valid Cron token must not permit non-production daily writes');
  }
  assert.equal(dependencyCalls,0,'Non-production requests must not consult even the clock, configuration or read store');
  assert.deepEqual(events,[]);assert.equal(stored,null);
  process.env.VERCEL_ENV='production';
  assert.equal((await call('wrong')).code,401);assert.deepEqual(events,[]);assert.equal(dependencyCalls,0);
  const first=await call();assert.equal(first.code,200);assert.equal(first.body.saved,false);
  assert.equal(stored.archiveStatus,'disabled');assert.equal(stored.url,null);
  assert.equal(dailyRefreshComplete(stored),false);assert.deepEqual(events,['lock','rules:true','register','refresh','register','release']);
  events=[];persisted=true;
  const retry=await call();assert.equal(retry.body.retried,true);assert.equal(dailyRefreshComplete(stored),true);
  assert.deepEqual(events,['lock','rules:false','refresh','register','release']);
  events=[];assert.equal((await call()).body.reason,'already_completed');assert.deepEqual(events,[]);
  stored={date:'2026-11-27',url:'https://synthetic.invalid/old.gz',refresh:{persisted:false}};
  const historical=await call();assert.equal(historical.body.archiveStatus,'legacy_public');assert.equal(stored.url,'https://synthetic.invalid/old.gz');
  console.log('Privacy: raw archive disabled, daily refresh and retry preserved, old reference unchanged: OK');
}finally{
  globalThis.fetch=originalFetch;
  if(oldEnv===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldEnv;
  if(oldScope===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldScope;
}
