import assert from 'node:assert/strict';
import {extractGermanGear,extractGermanStatLabels,gear,refreshCharacters} from './armory-core.mjs';

const html=`<!doctype html><title>Cole Dalton - ForeverSpec</title>
<div class="arm-panel"><div class="a-slot side-l" data-itemtype="back" data-itemid="7731373" data-itemlevel="8">
  <div class="slot-info"><div class="slot-name">Einfacher Umhang des Jägers</div><div class="slot-level">8 · Rücken</div></div>
</div><div class="a-slot side-r" data-itemtype="mainhand" data-itemid="454058" data-itemlevel="10">
  <div class="slot-info"><div class="slot-name">Fleckliger Ritualdolch</div><div class="slot-level">10 · Waffenhand</div></div>
</div></div>`;
const parsed=extractGermanGear(html,[]);
assert.deepEqual(parsed.map(x=>x.item),['Einfacher Umhang des Jägers','Fleckliger Ritualdolch']);

const direct=gear({gear:[
  {id:1001,name:'Abgenutzte Lederweste',slot:{type:'CHEST',name:'Brust'},level:{value:9},quality:{type:'POOR',name:'Schlecht'}},
  {id:1002,name:'Ausbildungsschwert',slot:{type:'MAIN_HAND',name:'Waffenhand'},level:{value:10},quality:{type:'UNCOMMON',name:'Ungewöhnlich'}}
]});
assert.deepEqual(direct.map(x=>x.slot),['Brust','Waffenhand']);
assert.deepEqual(direct.map(x=>x.slotType),['CHEST','MAIN_HAND']);
assert.deepEqual(direct.map(x=>x.qualityName),['Schlecht','Ungewöhnlich']);
assert.equal(direct[0].id,1001);

const statLocaleScript="<script>window.localeStrings={"+
  "'character.stats.stamina.name': \"Ausdauer\","+
  "'character.stats.critical-strike.name': \"Kritische Trefferchance\""+
  "};</script>";
assert.deepEqual(extractGermanStatLabels(statLocaleScript),{STAMINA:'Ausdauer',CRITICALSTRIKE:'Kritische Trefferchance'});

const originalFetch=globalThis.fetch;
process.env.BLIZZARD_CLIENT_ID='test-client';
process.env.BLIZZARD_CLIENT_SECRET='test-secret';

const originalMedia='https://render.worldofwarcraft.com/forever-eu/character/12/34567-main-raw.png';
const itemIcon='https://render.worldofwarcraft.com/forever-eu/icons/56/222.jpg';
const labels={
  HEALTH:'Gesundheit',MANA:'Mana',STRENGTH:'Stärke',AGILITY:'Beweglichkeit',
  STAMINA:'Ausdauer',INTELLECT:'Intelligenz',ARMOR:'Rüstung',
  ATTACKPOWER:'Angriffskraft',SPELLPOWER:'Zaubermacht',DODGE:'Ausweichen',
  ITEMLEVEL:'Gegenstandsstufe',CRITICALSTRIKE:'Kritische Trefferchance',SPIRIT:'Willenskraft'
};
const fakeOld={
  slug:'qa-dalton',name:'QA Dalton',level:10,classId:3,class:'Jäger',
  race:'Himmelsgeborener des Hohen Ordens',faction:'Allianz',
  equipmentLanguage:'de',
  equipment:[{id:8000,slotType:'CHEST',slot:'Brust',item:'Altes Wams',icon:'https://render.worldofwarcraft.com/forever-eu/icons/56/111.jpg',level:7,quality:'COMMON',localized:true}],
  professions:[{id:186,name:'Bergbau',current:4,max:75,knownRecipes:[]}],
  stats:{Gesundheit:42,Mana:100},
  statsByEnum:{HEALTH:42,MANA:100},
  statsDetails:[{enum:'HEALTH',name:'Gesundheit',value:42},{enum:'MANA',name:'Mana',value:100}],
  imageUrl:'https://render.worldofwarcraft.com/forever-eu/character/12/1234-main-raw.png'
};

let germanName='Neues Wams';
let qualityType='RARE',qualityName='Selten';
let gearAvailable=true,partialStats=false,missingSpecs=false,armoryAvailable=true,apiAvailable=true;
let germanFetches=0,englishFetches=0,oauthFetches=0,apiFetches=0,stableFetches=0;

const fakeCharacter=()=>({
  slug:'qa-dalton',
  level:12,
  class:{id:3,name:'Jäger'},
  race:{id:95,name:'Himmelsgeborener des Hohen Ordens'},
  faction:{type:'ALLIANCE',name:'Allianz'},
  gender:{type:'MALE',name:'Männlich'},
  professions:{primaries:[{name:'Mining',tiers:[{skillPoints:61,maxSkillPoints:75}]}]},
  stats:partialStats
    ?{groups:[{stats:[{enum:'HEALTH',name:'Gesundheit',value:{value:100}}]}]}
    :{groups:[
      {stats:['HEALTH','MANA','STRENGTH','AGILITY','STAMINA','INTELLECT','ARMOR','ATTACKPOWER','SPELLPOWER','DODGE','ITEMLEVEL']
        .map((key,i)=>({enum:key,value:{value:100+i}}))},
      {stats:[{enum:'CRITICALSTRIKE',value:{value:5.25}}]}
    ],overview:[{enum:'SPIRIT',value:{value:31}}]},
  media:{'main-raw':{url:originalMedia},avatar:{url:'https://render.worldofwarcraft.com/forever-eu/character/12/34567-avatar.jpg'}},
  specs:missingSpecs?undefined:[]
});

const htmlFor=()=>{
  const c=fakeCharacter();
  if(gearAvailable)c.gear=[{
    id:9001,name:germanName,slot:{type:'CHEST',name:'Brust'},level:{value:12},
    quality:{type:qualityType,name:qualityName},
    media:{content:{assets:[{key:'icon',value:itemIcon}]}}
  }];
  const localeKeyByEnum={HEALTH:'health',MANA:'mana',STRENGTH:'strength',AGILITY:'agility',STAMINA:'stamina',INTELLECT:'intellect',ARMOR:'armor',ATTACKPOWER:'attack-power',SPELLPOWER:'spell-power',DODGE:'dodge',ITEMLEVEL:'item-level',CRITICALSTRIKE:'critical-strike',SPIRIT:'spirit'};
  const statLocale=Object.entries(labels).map(([enumKey,name])=>
    "'character.stats."+localeKeyByEnum[enumKey]+".name': "+JSON.stringify(name)
  ).join(',');
  return '<script>var characterProfileInitialState = '+JSON.stringify({character:c})+';</script><script>window.localeStrings={'+statLocale+'};</script>';
};

globalThis.fetch=async (url,options={})=>{
  const u=String(url);
  if(u==='https://oauth.battle.net/token'){
    oauthFetches++;
    return {ok:true,status:200,text:async()=>JSON.stringify({access_token:'test-api-token',expires_in:86399})};
  }
  if(u.startsWith('https://eu.api.blizzard.com/profile/wow/character/qa-dalton')){
    apiFetches++;
    const parsed=new URL(u);
    assert.equal(parsed.searchParams.get('locale'),'de_DE','Visible profile strings must be requested in de_DE');
    if(!apiAvailable)return {ok:false,status:503,text:async()=>JSON.stringify({detail:'Unavailable'})};
    return {ok:true,status:200,text:async()=>JSON.stringify({
      id:123456,name:'QA',surname:'Dalton',level:12,experience:4321,achievement_points:25,
      last_login_timestamp:1795176000000,average_item_level:12,equipped_item_level:12,
      gender:{type:'MALE',name:'Männlich'},faction:{type:'ALLIANCE',name:'Allianz'},
      race:{id:95,name:'Himmelsgeborener des Hohen Ordens'},character_class:{id:3,name:'Jäger'},
      ruleset:{id:1,name:'PvP'}
    })};
  }
  if(u.endsWith('/collections/stable.json')){
    stableFetches++;
    assert.ok(u.includes('/de-de/'),'Pet strings must come from the German stable');
    return {ok:true,status:200,text:async()=>JSON.stringify({pets:{
      active:[{
        id:7001,creature:{id:8001},active:true,family:{id:319,name:'Fuchs',enum:'FOX',slug:'fox'},
        icon:{url:'https://render.worldofwarcraft.com/forever-eu/icons/56/458223.jpg'},
        level:6,name:'Slydris',render:{url:'https://render.worldofwarcraft.com/forever-eu/npcs/zoom/creature-display-139280.jpg'},
        slot:0,summoned:true
      }],
      stable:[]
    }})};
  }
  if(u.includes('/de-de/')){
    germanFetches++;
    if(!armoryAvailable)return {ok:false,status:503,text:async()=>''};
    return {ok:true,status:200,text:async()=>htmlFor()};
  }
  if(u.includes('/en-gb/')){
    englishFetches++;
    throw new Error('English Armory must not be used as a visible fallback');
  }
  throw new Error('Unbekannter Testabruf: '+u);
};

try{
  let result=await refreshCharacters([fakeOld]);
  assert.equal(result.success,1);
  let c=result.data.characters[0];

  assert.equal(c.class,'Jäger');
  assert.equal(c.classId,3);
  assert.equal(c.race,'Himmelsgeborener des Hohen Ordens');
  assert.equal(c.faction,'Allianz');
  assert.equal(c.gameStringsVerified,true);
  assert.equal(c.gameStringsLocale,'de_DE');
  assert.equal(c.equipment[0].item,'Neues Wams');
  assert.equal(c.equipment[0].slot,'Brust');
  assert.equal(c.equipment[0].slotType,'CHEST');
  assert.equal(c.equipment[0].quality,'RARE');
  assert.equal(c.equipment[0].qualityName,'Selten');
  assert.equal(c.equipmentLanguage,'de');
  assert.equal(c.equipmentSource,'Blizzard Armory (de-DE)');
  assert.equal(c.source,'Blizzard API de_DE + Armory de-DE');

  assert.equal(c.statsByEnum.STAMINA,104);
  assert.equal(c.stats.Ausdauer,104);
  assert.equal(c.statsDetails.find(x=>x.enum==='STAMINA').name,'Ausdauer');
  assert.ok(c.statsFreshEnums.includes('CRITICALSTRIKE'));
  assert.equal(c.statsVerified,true);

  // Armory profession names are intentionally not surfaced as German translations.
  assert.equal(c.professions[0].name,'Bergbau');
  assert.equal(c.professions[0].current,4);
  assert.equal(c.professions[0].unverified,true);
  assert.equal(c.professionsVerified,false);

  assert.equal(c.hunterPets.active[0].family.name,'Fuchs');
  assert.equal(c.hunterPets.active[0].name,'Slydris');
  assert.equal(englishFetches,0);

  germanName='Frisches Wams';qualityType='EPIC';qualityName='Episch';
  result=await refreshCharacters([c]);c=result.data.characters[0];
  assert.equal(c.equipment[0].item,'Frisches Wams');
  assert.equal(c.equipment[0].qualityName,'Episch');

  partialStats=true;
  result=await refreshCharacters([c]);c=result.data.characters[0];
  assert.equal(c.statsVerified,false);
  assert.deepEqual(c.statsFreshEnums,['HEALTH']);
  assert.equal(c.statsDetails.find(x=>x.enum==='MANA').name,'Mana','Previously source-backed German labels survive partial data');
  assert.equal(c.statsByEnum.MANA,101,'Last verified value survives a partial refresh');

  armoryAvailable=false;
  const previousItem=c.equipment[0].item;
  result=await refreshCharacters([c]);
  assert.equal(result.success,0,'A missing German Armory does not trigger an English visible fallback');
  c=result.data.characters[0];
  assert.equal(c.equipment[0].item,previousItem);
  assert.equal(c.scrapeOk,false);
  assert.equal(englishFetches,0);

  assert.ok(germanFetches>=3);
  assert.ok(apiFetches>=3);
  assert.equal(oauthFetches,1);
  assert.ok(stableFetches>=3);
  console.log('German game strings: visible character data stays source-backed and never falls back to self-translation: OK');
}finally{
  globalThis.fetch=originalFetch;
}
