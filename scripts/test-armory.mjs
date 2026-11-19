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
  {name:'Worn Leather Vest',slot:{type:'CHEST'},level:{value:9},quality:{type:'POOR',name:'Poor'}},
  {name:'Training Sword of the Gorilla',slot:{type:'MAIN_HAND'},level:{value:10},quality:{type:'UNCOMMON',name:'Uncommon'}},
  {name:'Ancient Heirloom',slot:{type:'FINGER_1'},level:{value:1},quality:{type:'COMMON',name:'Common'}},
  {name:'Item without quality',slot:{type:'RANGED'},level:{value:3}}
]});
assert.deepEqual(officialGear.map(x=>x.quality),['POOR','UNCOMMON','COMMON',undefined]);
assert.deepEqual(officialGear.map(x=>x.slot),['Brust','Waffenhand','Ring 1','Distanzwaffe']);
assert.deepEqual(officialGear.map(x=>x.level),[9,10,1,3]);
console.log('ForeverSpec and Blizzard gear quality extractors: OK');


/* Integrationstest: beide Aktualisierungswege verwenden refreshCharacters.
   Deutsche Namen, Seltenheit und Bilder müssen nach jedem Abruf aktuell sein.
   Fällt die Übersetzung aus, dürfen keine veralteten deutschen Namen bleiben. */
const originalFetch=globalThis.fetch;
const originalMedia='https://render.worldofwarcraft.com/forever-eu/character/12/34567-main-raw.png';
const itemIcon='https://render.worldofwarcraft.com/forever-eu/icons/56/222.jpg';
const fakeOld={
  slug:'qa-dalton',name:'QA Dalton',level:10,class:'Jäger',
  equipmentLanguage:'de',
  equipment:[{slot:'Brust',item:'Altes Wams',sourceName:'Old Chest',icon:'https://render.worldofwarcraft.com/forever-eu/icons/56/111.jpg',level:7,quality:'COMMON',localized:true}],
  professions:[{name:'Bergbau',current:4,max:75}],stats:{Gesundheit:42,Mana:100},
  imageUrl:'https://render.worldofwarcraft.com/forever-eu/character/12/1234-main-raw.png'
};
let englishName='New Chest', germanName='Neues Wams',qualityType='RARE',deAvailable=true,gearAvailable=true,partialStats=false;
const fakeCharacter=(locale)=>{
 const c={
  slug:'qa-dalton',level:12,class:{name:'Hunter'},professions:{primaries:[{name:'Mining',tiers:[{skillPoints:61,maxSkillPoints:75}]}]},
  stats:{groups:[{stats:(partialStats?['HEALTH']:['HEALTH','MANA','STRENGTH','AGILITY','STAMINA','INTELLECT','ARMOR','ATTACKPOWER','ITEMLEVEL']).map((name,i)=>({enum:name,value:{value:100+i}}))}]},
  media:{'main-raw':{url:originalMedia},avatar:{url:'https://render.worldofwarcraft.com/forever-eu/character/12/34567-avatar.jpg'}},
  specs:[],
 };
 if(gearAvailable)c.gear=[{name:locale==='de-de'?germanName:englishName,slot:{type:'CHEST'},level:{value:12},quality:{type:qualityType},media:{content:{assets:[{key:'icon',value:itemIcon}]}}}];
 return c;
};
const htmlFor=locale=>'<script>var characterProfileInitialState = '+JSON.stringify({character:fakeCharacter(locale)})+';</script>';
globalThis.fetch=async url=>{
 const u=String(url);
 if(u.includes('foreverspec.com'))return {ok:false,status:503};
 if(u.includes('/de-de/'))return deAvailable?{ok:true,text:async()=>htmlFor('de-de')}:{ok:false,status:503};
 if(u.includes('/en-gb/'))return {ok:true,text:async()=>htmlFor('en-gb')};
 throw new Error('Unbekannter Testabruf: '+u);
};
try{
 let r=await refreshCharacters([fakeOld]);
 assert.equal(r.success,1);
 let c=r.data.characters[0];
 assert.equal(c.equipment[0].item,'Neues Wams');
 assert.equal(c.equipment[0].quality,'RARE');
 assert.equal(c.equipment[0].sourceName,'New Chest');
 assert.equal(c.equipment[0].level,12);
 assert.equal(c.equipmentLanguage,'de');
 assert.equal(c.imageUrl,originalMedia);
 assert.equal(c.imageVerified,true);
 assert.equal(c.statsVerified,true);
 assert.equal(c.professions[0].current,61);
 assert.equal(c.equipmentVerified,true);
 // Trotz gleichem Icon und Level: geänderter offizieller Gegenstandsname wird aktuell.
 deAvailable=false;englishName='Fresh Chest';qualityType='EPIC';
 r=await refreshCharacters([c]);c=r.data.characters[0];
 assert.equal(r.success,1);
 assert.equal(c.equipment[0].item,'Fresh Chest');
 assert.equal(c.equipment[0].quality,'EPIC');
 assert.equal(c.equipmentLanguage,'en');
 assert.equal(c.equipmentVerified,true);
 // Und bei erneut funktionierender Übersetzung wieder aktuelle deutsche Bezeichnung.
 deAvailable=true;germanName='Frisches Wams';
 r=await refreshCharacters([c]);c=r.data.characters[0];
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
 console.log('Gemeinsamer Live-/Auto-Abruf, Qualität, Bild und sichere Fallbacks: OK');
}finally{globalThis.fetch=originalFetch}
