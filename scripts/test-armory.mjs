import assert from 'node:assert/strict';
import {extractGermanGear,gear,refreshCharacters} from './armory-core.mjs';
const html=`<!doctype html><title>Cole Dalton - ForeverSpec</title>
<div class="arm-panel"><div class="a-slot side-l" data-itemtype="back" data-itemid="7731373" data-itemlevel="8">
  <div class="slot-icon"><img src="/icons/7731373.webp"></div>
  <div class="slot-info"><div class="slot-name">Einfacher Umhang des Jägers</div><div class="slot-level">8 · Rücken</div></div>
</div><div class="a-slot side-r" data-itemtype="mainhand" data-itemid="454058" data-itemlevel="10">
  <div class="slot-info"><div class="slot-name">Fleckliger Ritualdolch</div><div class="slot-level">10 · Waffenhand</div></div>
</div><div class="a-slot" data-itemtype="head" data-itemid="" data-itemlevel="0"><div class="slot-name">Leer</div></div></div>`;
const result=extractGermanGear(html,[]);
assert.equal(result.length,2);
assert.deepEqual(result.map(x=>x.slot),['Rücken','Waffenhand']);
assert.deepEqual(result.map(x=>x.item),['Einfacher Umhang des Jägers','Fleckliger Ritualdolch']);
assert.equal(result[0].icon,'https://foreverspec.com/icons/7731373.webp');
assert.equal(result[1].level,10);
assert.throws(()=>extractGermanGear('<html></html>',[]),/keine auslesbare Ausrüstung/);
const officialGear=gear({gear:[
  {id:1001,name:'Abgenutzte Lederweste',slot:{type:'CHEST',name:'Brust'},level:{value:9},quality:{type:'POOR',name:'Schlecht'}},
  {name:'Ausbildungsschwert des Gorillas',slot:{type:'MAIN_HAND',name:'Waffenhand'},level:{value:10},quality:{type:'UNCOMMON',name:'Ungewöhnlich'}},
  {name:'Uraltes Erbstück',slot:{type:'FINGER_1',name:'Ring 1'},level:{value:1},quality:{type:'COMMON',name:'Gewöhnlich'}},
  {name:'Gegenstand ohne Qualität',slot:{type:'RANGED',name:'Distanzwaffe'},level:{value:3}}
]});
assert.deepEqual(officialGear.map(x=>x.quality),['POOR','UNCOMMON','COMMON',undefined]);
assert.deepEqual(officialGear.map(x=>x.slot),['Brust','Waffenhand','Ring 1','Distanzwaffe']);
assert.deepEqual(officialGear.map(x=>x.level),[9,10,1,3]);
assert.equal(officialGear[0].id,1001,'Official item ID is retained');
assert.equal(result[0].id,7731373,'ForeverSpec item ID is retained');
console.log('ForeverSpec and Blizzard gear quality extractors: OK');


/* Integrationstest: beide Aktualisierungswege verwenden refreshCharacters.
   Deutsche Namen, Seltenheit und Bilder müssen nach jedem Abruf aktuell sein.
   Fällt die Übersetzung aus, dürfen keine veralteten deutschen Namen bleiben. */
const originalFetch=globalThis.fetch;
process.env.BLIZZARD_CLIENT_ID='test-client';
process.env.BLIZZARD_CLIENT_SECRET='test-secret';
const originalMedia='https://render.worldofwarcraft.com/forever-eu/character/12/34567-main-raw.png';
const itemIcon='https://render.worldofwarcraft.com/forever-eu/icons/56/222.jpg';
const fakeOld={
  slug:'qa-dalton',name:'QA Dalton',level:10,class:'Jäger',classId:3,
  equipmentLanguage:'de',
  equipment:[{slot:'Brust',item:'Altes Wams',sourceName:'Old Chest',icon:'https://render.worldofwarcraft.com/forever-eu/icons/56/111.jpg',level:7,quality:'COMMON',localized:true}],
  professions:[{name:'Bergbau',current:4,max:75}],stats:{Gesundheit:42,Mana:100},
  imageUrl:'https://render.worldofwarcraft.com/forever-eu/character/12/1234-main-raw.png'
};
let englishName='New Chest', germanName='Neues Wams',qualityType='RARE',deAvailable=true,gearAvailable=true,partialStats=false,partialProfessions=false,missingSpecs=false;
let germanFetches=0,englishFetches=0,foreverSpecFetches=0,oauthFetches=0,apiFetches=0,stableFetches=0,apiAvailable=true;
const fakeCharacter=(locale)=>{
 const de=locale==='de-de';
 const statLabels={HEALTH:'Gesundheit',MANA:'Mana',STRENGTH:'Stärke',AGILITY:'Beweglichkeit',STAMINA:'Ausdauer',INTELLECT:'Intelligenz',ARMOR:'Rüstung',ATTACKPOWER:'Angriffskraft',SPELLPOWER:'Zaubermacht',DODGE:'Ausweichen',ITEMLEVEL:'Gegenstandsstufe',CRITICALSTRIKE:'Kritische Trefferchance',SPIRIT:'Willenskraft'};
 const c={
  slug:'qa-dalton',level:12,class:{id:3,type:'HUNTER',name:de?'Jäger':'Hunter'},professions:partialProfessions?{primaries:[]}:{primaries:[{name:de?'Bergbau':'Mining',tiers:[{skillPoints:61,maxSkillPoints:75}]}]},
  stats:partialStats
    ?{groups:[{stats:[{enum:'HEALTH',name:de?'Gesundheit':'Health',value:{value:100}}]}]}
    :{groups:[
       {stats:['HEALTH','MANA','STRENGTH','AGILITY','STAMINA','INTELLECT','ARMOR','ATTACKPOWER','SPELLPOWER','DODGE','ITEMLEVEL'].map((key,i)=>({enum:key,name:de?statLabels[key]:key,value:{value:100+i}}))},
       {stats:[{enum:'CRITICALSTRIKE',name:de?statLabels.CRITICALSTRIKE:'Critical Strike',value:{value:5.25}}]}
     ],overview:[{enum:'SPIRIT',name:de?statLabels.SPIRIT:'Spirit',value:{value:31}}]},
  media:{'main-raw':{url:originalMedia},avatar:{url:'https://render.worldofwarcraft.com/forever-eu/character/12/34567-avatar.jpg'}},
  specs:[],
 };
 if(missingSpecs)delete c.specs;
 if(gearAvailable)c.gear=[{id:9001,name:de?germanName:englishName,slot:{type:'CHEST',name:de?'Brust':'Chest'},level:{value:12},quality:{type:qualityType,name:de?'Episch':'Epic'},media:{content:{assets:[{key:'icon',value:itemIcon}]}}}];
 return c;
};
const htmlFor=locale=>'<script>var characterProfileInitialState = '+JSON.stringify({character:fakeCharacter(locale)})+';</script>';
globalThis.fetch=async (url,options={})=>{
 const u=String(url);
 if(u==='https://oauth.battle.net/token'){
   oauthFetches++;
   assert.match(options.headers.authorization,/^Basic /);
   return {ok:true,status:200,text:async()=>JSON.stringify({access_token:'test-api-token',expires_in:86399})};
 }
 if(u.startsWith('https://eu.api.blizzard.com/profile/wow/character/qa-dalton')){
   apiFetches++;
   if(!apiAvailable)return {ok:false,status:503,text:async()=>JSON.stringify({detail:'Unavailable'})};
   const de=new URL(u).searchParams.get('locale')==='de_DE';
   return {ok:true,status:200,text:async()=>JSON.stringify({
     id:123456,name:'QA',surname:'Dalton',level:12,experience:4321,achievement_points:25,
     last_login_timestamp:1795176000000,average_item_level:12,equipped_item_level:12,
     gender:{type:'MALE',name:de?'Männlich':'Male'},faction:{type:'ALLIANCE',name:de?'Allianz':'Alliance'},
     race:{id:95,name:de?'Himmelsgeborene des Hohen Ordens':'High Order Skyborne'},character_class:{id:3,name:de?'Jäger':'Hunter'},
     ruleset:{id:1,name:'PvP'}
   })};
 }
 if(u.endsWith('/collections/stable.json')){
   stableFetches++;
   return {ok:true,status:200,text:async()=>JSON.stringify({pets:{
     active:[{
       id:7001,creature:{id:8001},active:true,family:{id:319,name:'Fuchs',enum:'FOX',slug:'fox'},
       icon:{url:'https://render.worldofwarcraft.com/forever-eu/icons/56/458223.jpg'},
       level:6,name:'Slydris',
       render:{url:'https://render.worldofwarcraft.com/forever-eu/npcs/zoom/creature-display-139280.jpg'},
       slot:0,summoned:true,collected:true
     }],
     stable:[]
   }})};
 }
 if(u.includes('foreverspec.com')){foreverSpecFetches++;return {ok:false,status:503}}
 if(u.includes('/de-de/')){germanFetches++;return deAvailable?{ok:true,text:async()=>htmlFor('de-de')}:{ok:false,status:503}}
 if(u.includes('/en-gb/')){englishFetches++;return {ok:true,text:async()=>htmlFor('en-gb')}}

 throw new Error('Unbekannter Testabruf: '+u);
};
try{
 let r=await refreshCharacters([fakeOld]);
 assert.equal(r.success,1);
 let c=r.data.characters[0];
 assert.equal(c.equipment[0].item,'Neues Wams');
 assert.equal(c.equipment[0].quality,'RARE');
 assert.equal(c.equipment[0].sourceName,'Neues Wams');
 assert.equal(c.equipment[0].level,12);
 assert.equal(c.equipment[0].id,9001,'Equipment keeps the stable item ID');
 assert.equal(c.equipmentLanguage,'de');
 assert.equal(c.imageUrl,originalMedia);
 assert.equal(c.imageVerified,true);
 assert.equal(c.statsVerified,true);
 assert.equal(c.professions[0].current,61);
 assert.equal(c.equipmentVerified,true);
 assert.equal(c.blizzardCharacterId,123456);
 assert.equal(c.experience,4321);
 assert.equal(c.achievementPoints,25);
 assert.equal(c.lastLoginAt,new Date(1795176000000).toISOString());
 assert.equal(c.class,'Jäger');
 assert.equal(c.classId,3);
 assert.equal(c.race,'Himmelsgeborene des Hohen Ordens');
 assert.equal(c.faction,'Allianz');
 assert.equal(c.ruleset.name,'PvP');
 assert.equal(c.apiProfileVerified,true);
 assert.equal(c.source,'Blizzard API + Armory');
 assert.equal(c.hunterPetsVerified,true);
 assert.equal(c.hunterPets.active.length,1);
 assert.equal(c.hunterPets.active[0].name,'Slydris');
 assert.equal(c.hunterPets.active[0].family.name,'Fuchs');
 assert.equal(c.hunterPets.active[0].level,6);
 assert.equal(c.hunterPets.active[0].summoned,true);
 assert.equal(c.hunterPets.active[0].id,7001);
 assert.equal(c.hunterPets.active[0].creatureId,8001);
 assert.equal(c.hunterPets.active[0].displayId,139280,'Pet render display ID is retained as media identity fallback');
 assert.equal(c.hunterPets.stable.length,0);
 // The German Armory remains the authoritative visible source on every refresh.
 const priorGerman=germanFetches,priorEnglish=englishFetches,priorImageChecked=c.imageCheckedAt;
 r=await refreshCharacters([c]);c=r.data.characters[0];
 assert.equal(germanFetches,priorGerman+1,'The German Blizzard Armory is fetched as the primary visible source');
 assert.equal(c.equipment[0].item,'Neues Wams');
 assert.equal(c.imageCheckedAt,priorImageChecked,'Unchanged character portrait retains cache key');
 // Fällt die deutsche Blizzard-Quelle aus, bleibt der letzte bestätigte deutsche Stand erhalten.
 deAvailable=false;englishName='Fresh Chest';qualityType='EPIC';
 r=await refreshCharacters([c]);c=r.data.characters[0];
 assert.equal(r.success,0);
 assert.equal(c.equipment[0].item,'Neues Wams');
 assert.equal(c.equipmentLanguage,'de');
 assert.equal(c.scrapeOk,false);
 // Sobald die deutsche Quelle wieder verfügbar ist, wird ausschließlich deren neuer String übernommen.
 deAvailable=true;germanName='Frisches Wams';
 r=await refreshCharacters([c]);c=r.data.characters[0];
 assert.equal(r.success,1);
 assert.equal(c.equipment[0].item,'Frisches Wams');
 assert.equal(c.equipment[0].quality,'EPIC');
 assert.equal(c.equipmentLanguage,'de');
 // Fehlendes Ausrüstungsfeld -> bewährte Altwerte ausdrücklich unbestätigt.
 gearAvailable=false;
 r=await refreshCharacters([c]);c=r.data.characters[0];
 assert.equal(c.equipmentVerified,false);
 assert.equal(c.equipment[0].item,'Frisches Wams');
 // Teilweise Profilwerte: ältere Werte bleiben sichtbar, aber nicht als frisch markiert.
 partialStats=true;
 r=await refreshCharacters([c]);c=r.data.characters[0];
 assert.equal(c.statsVerified,false);
 assert.equal(c.stats.Mana,101);
 assert.deepEqual(c.statsFreshKeys,['Gesundheit'],'Only the value received from Blizzard is fresh');
 partialProfessions=true;missingSpecs=true;apiAvailable=false;
 const confirmedLogin=c.lastLoginAt;
 r=await refreshCharacters([c]);c=r.data.characters[0];
 assert.equal(c.professions.length,1,'Missing profession is retained');
 assert.equal(c.professions[0].name,'Bergbau');
 assert.equal(c.professions[0].unverified,true);
 assert.equal(c.professionsVerified,false);
 assert.equal(c.talentsVerified,false,'Unavailable talent tree is not misread as zero points');
 assert.equal(c.talents,'noch keine verteilt','Previously known talents retained');
 assert.equal(c.scrapeOk,true,'Incomplete subfields do not invalidate an otherwise updated profile');
 assert.equal(c.apiProfileVerified,false,'API outage does not invalidate the existing Armory refresh');
 assert.equal(c.lastLoginAt,confirmedLogin,'Last verified API login survives a temporary API outage');
 assert.ok(apiFetches>=6,'Official Forever profile is checked on every refresh');
 assert.equal(oauthFetches,1,'OAuth token is reused instead of requested for every profile refresh');
 assert.equal(englishFetches,0,'No English Armory request is needed for visible game strings');
 assert.ok(stableFetches>=6,'Hunter stable JSON is refreshed together with the character');
 console.log('Blizzard refresh: updated gear, professions, hunter stable, stale stats provenance, talents and request efficiency: OK');
}finally{globalThis.fetch=originalFetch}
