import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>fs.readFileSync(path.join(dir,f),'utf8');
const source=read('app.js'),css=read('styles.css'),data=JSON.parse(read('data/characters.json'));
const start=source.indexOf('button.innerHTML=');
assert.ok(start>0,'App bootstrapping anchor exists');
const nodes=new Map();
const document={querySelector(selector){
  if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',querySelectorAll:()=>[],addEventListener(){}});
  return nodes.get(selector);
}};
const ui=new Function('document',source.slice(0,start)+'\nreturn {render,professionRows,professionScale,equipmentSlotOrder,keepNewestProfiles};')(document);

// Uniform 0–300 scale: current skill must not stretch to 100% at the old 75/150 cap.
const getSegments=html=>[...html.matchAll(/class="profession-segment (is-unlocked|is-locked)"><span class="profession-segment-fill" style="width:([0-9.]+)%"/g)]
  .map(m=>({state:m[1],width:Number(m[2])}));
const examples=[
  {current:37,max:75,rank:'Lehrling',widths:[49.33,0,0,0],unlocked:1},
  {current:75,max:75,rank:'Lehrling',widths:[100,0,0,0],unlocked:1},
  {current:75,max:150,rank:'Geselle',widths:[100,0,0,0],unlocked:2},
  {current:99,max:150,rank:'Geselle',widths:[100,32,0,0],unlocked:2},
  {current:170,max:225,rank:'Experte',widths:[100,100,26.67,0],unlocked:3},
  {current:240,max:300,rank:'Fachmann',widths:[100,100,100,20],unlocked:4},
  {current:0,max:75,rank:'Lehrling',widths:[0,0,0,0],unlocked:1},
  {current:300,max:300,rank:'Fachmann',widths:[100,100,100,100],unlocked:4}
];
for(const e of examples){
  const html=ui.professionRows([{name:'Angeln',current:e.current,max:e.max}]);
  const parts=getSegments(html);
  assert.equal(parts.length,4,'Exactly four skill segments for all ranks');
  assert.deepEqual(parts.map(p=>p.width),e.widths,'Precise fixed 75-point segments');
  assert.equal(parts.filter(p=>p.state==='is-unlocked').length,e.unlocked,'Cap must control unlocked segments');
  assert.match(html,new RegExp('class="profession-rank">'+e.rank+'</span>'));
  assert.equal((html.match(new RegExp('>'+e.current+'\\/'+e.max+'<','g'))||[]).length,1);
  assert.match(html,/aria-valuemax="300"/);
  assert.match(html,/role="progressbar"/);
}
const invalid=ui.professionRows([{name:'Angeln',current:20,max:0}]);
assert.deepEqual(getSegments(invalid).map(x=>x.width),[0,0,0,0]);
assert.match(invalid,/Rang unbekannt/);
assert.ok(!ui.professionRows([{name:'<script>',current:1,max:2}]).includes('<script>'));
assert.equal((ui.professionScale().match(/<span title=/g)||[]).length,4);

ui.render(data);
const cards=nodes.get('#cards').innerHTML;
assert.equal((cards.match(/class="profession"/g)||[]).length,data.characters.reduce((n,c)=>n+c.professions.length,0));
assert.equal((cards.match(/class="vital"/g)||[]).length,data.characters.length*4);
assert.equal((cards.match(/class="profession-rank"/g)||[]).length,20,'Every profession has a visible training rank');
assert.equal((cards.match(/class="profession-scale"/g)||[]).length,4,'Every character shows a shared 300-point reference');
assert.equal((cards.match(/class="profession-overlay"/g)||[]).length,20,'One visible fraction in each bar');
assert.ok(!css.includes('.vital:nth-child(2) strong{color:#91dbe7}'),'Mana must not be blue');
assert.ok(css.includes('.section h3::before{content:"";display:inline-block;width:7px'));
assert.ok(css.includes('.details summary::before{content:"›";font-size:1.25rem;line-height:1;color:var(--class,#d6b27a)}'));
assert.ok(css.includes('.card.hunter{--class:#aad372')&&css.includes('.card.druid{--class:#ff9b48'));
const colorsByClass={
  mage:{mid:'#67d4f0',unlocked:'#24576c'},
  hunter:{mid:'#aad372',unlocked:'#3e5d3d'},
  druid:{mid:'#ff9b48',unlocked:'#75462c'}
};
for(const [klass,expected] of Object.entries(colorsByClass)){
  const marker='.card.'+klass+'{\n  --skill-light:';
  const start=css.indexOf(marker);
  assert.ok(start>=0,klass+' has unique skill palette');
  const block=css.slice(start,css.indexOf('}',start)+1);
  assert.ok(block.includes('--skill-mid:'+expected.mid),klass+' fill matches exact WoW class color');
  assert.ok(block.includes('--skill-open-mid:'+expected.unlocked),klass+' unlock is a darker class shade');
}
assert.ok(css.includes('.profession-segment.is-unlocked{background:linear-gradient(180deg,var(--skill-open-top'),'The unlocked stage uses class shades');
assert.ok(css.includes('var(--skill-mid,#6fc6c3)'),'The achieved section uses class color');
assert.ok(css.includes('.profession-legend span:nth-child(1)::before{background:var(--skill-mid'),'Achieved legend follows class');
assert.ok(css.includes('.profession-legend span:nth-child(2)::before{background:var(--skill-open-mid'),'Unlocked legend follows class');
assert.ok(css.includes('background:linear-gradient(180deg,#10171f,#171c26)'),'Locked segments stay neutral');

assert.equal((cards.match(/Ausrüstung anzeigen/g)||[]).length,data.characters.length);
assert.equal((cards.match(/class="equip-name quality-/g)||[]).length,data.characters.reduce((n,c)=>n+c.equipment.length,0));
assert.equal(ui.equipmentSlotOrder.length,19);
for(const [slug,klass] of Object.entries({
  'cole-dalton':'scene-cole','dolly-dalton':'scene-dolly','chucky-dalton':'scene-chucky','viola-dalton':'scene-viola'
})){
  assert.match(cards,new RegExp('portrait '+klass));
  assert.ok(css.includes('.portrait.'+klass+'::before'));
  assert.ok(css.includes('url("/'+klass+'.svg') && css.includes('.portrait.'+klass+'::before'));
  // Druid scene and hunter scene are intentionally versioned to bypass stale PWA/browser artwork caches.
  const scene=read(klass+'.svg');
  assert.match(scene,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(scene,/<\/svg>\s*$/);
}

const expectedCards=[
  {name:'Chucky Dalton',klass:'druid',scene:'scene-chucky',color:'#ff9b48'},
  {name:'Cole Dalton',klass:'mage',scene:'scene-cole',color:'#67d4f0'},
  {name:'Dolly Dalton',klass:'hunter',scene:'scene-dolly',color:'#aad372'},
  {name:'Viola Dalton',klass:'druid',scene:'scene-viola',color:'#ff9b48'}
];
for(const {name,klass,scene,color} of expectedCards){
  const marker=cards.indexOf('<h2 class="name">'+name+'</h2>');
  const start=cards.lastIndexOf('<article class="card ',marker);
  assert.ok(start>=0 && marker>start,'Character exists: '+name);
  assert.ok(cards.slice(start,marker).startsWith('<article class="card '+klass+'">'),'Right class for '+name);
  const area=cards.slice(start,cards.indexOf('</article>',marker));
  assert.ok(area.includes('portrait '+scene+'"'),'Correct backdrop for '+name);
  assert.ok(css.includes('--class:'+color),'Class color for '+name);
}
// The official Blizzard profile can override Chucky's grammatically correct nickname.
// Four distinct portrait emblems: unique nickname, character name and class-inspired SVG icon.
const expectedBadges=[
  {name:'Cole Dalton',klass:'mage',firstName:'Cole',nickname:'Der Runenreiter',icon:'rune'},
  {name:'Dolly Dalton',klass:'hunter',firstName:'Dolly',nickname:'Das Adlerauge',icon:'crosshair'},
  {name:'Chucky Dalton',klass:'druid',firstName:'Chucky',nickname:data.characters.find(c=>c.slug==='chucky-dalton')?.gender==='male'?'Der Windsurfer':'Die Windsurferin',icon:'leaf'},
  {name:'Viola Dalton',klass:'druid',firstName:'Viola',nickname:'Die Sonnenwandlerin',icon:'sun'}
];
assert.equal((cards.match(/class="portrait-badge"/g)||[]).length,4,'One personalized badge per Blizzard portrait');
for(const p of expectedBadges){
  const marker=cards.indexOf('<h2 class="name">'+p.name+'</h2>');
  const start=cards.lastIndexOf('<article class="card ',marker);
  const end=cards.indexOf('</article>',marker);
  assert.ok(start>=0 && end>start,'Character card for '+p.name);
  const area=cards.slice(start,end);
  assert.ok(area.startsWith('<article class="card '+p.klass+'">'),'Correct class for badge '+p.name);
  assert.ok(area.includes('portrait-badge-firstname">'+p.firstName+'</span>'),'Correct first name for '+p.name);
  assert.ok(area.includes('portrait-badge-epithet">'+p.nickname+'</span>'),'Correct epithet for '+p.name);
  assert.ok(area.includes('portrait-badge-icon'),'SVG class icon visible for '+p.name);
}
assert.ok(!cards.includes('scene-label'),'No old place names in portrait badges');
assert.ok(css.includes('.portrait .portrait-badge{'),'Badge style exists');
assert.ok(css.includes('border:1px solid var(--class,#d4ae79)'),'Badges use class border color');
assert.ok(css.includes('.portrait-badge-symbol{'),'SVG badges styled');
const chucky=read('scene-chucky.svg'),dolly=read('scene-dolly.svg');
assert.match(chucky,/<linearGradient id="sky"[^>]*><stop stop-color="#e5b89b"/,'Chucky bright warm day');
assert.ok(chucky.includes("mining, skinning"),"Chucky mining and skinning scene");
assert.match(dolly,/<linearGradient id="sky"[^>]*><stop stop-color="#9bc4b9"/,'Dolly bright green frontier sky');
assert.ok(dolly.includes("leatherworking, skinning"),"Dolly leatherworking and skinning scene");
assert.ok(css.includes('url("/scene-chucky.svg?v=frontier-unified-20261120a")'));
assert.ok(css.includes('url("/scene-dolly.svg?v=frontier-unified-20261120a")'));
assert.ok(!/\.vital:last-child\s*\{\s*border-color:\s*var\(--class\)/.test(css),
  'Item-level frame must match other vital tiles, not use the class color');
assert.ok(!/\.vital:last-child\s+strong\s*\{\s*color:\s*var\(--class\)/.test(css),
  'Item-level number must use neutral color');

// Golden sheriff-star header and daylight/western landscape should not regress.
const heroHtml=read('index.html'),crest=read('dalton-crest.svg'),sky=read('skyborne-horizon.svg'),icon=read('icon.svg');
assert.ok(heroHtml.includes('WANTED · AZEROTH'));
assert.ok(heroHtml.includes('Vier Abenteurer. Eine berüchtigte Bande.'));
assert.ok(heroHtml.includes('Noch keine Legenden. Aber schon gesucht.'));
assert.ok(heroHtml.includes('CHUCKY · COLE · DOLLY · VIOLA'));
assert.ok(!heroHtml.includes('Vier Himmelsgeborene. Ein wilder Himmel.'));
assert.match(crest,/sechszackiger Dalton-Sheriffstern/);
assert.ok(crest.includes('>D</text>') && crest.includes('url(#blueEnamel)'));
assert.ok(icon.includes('Dalton-Sheriffstern'));
assert.ok(sky.includes('url(#day)') && sky.includes('url(#sunMist)'));
const mobileSky=read('skyborne-mainstreet-mobile.svg');
for(const scene of [sky,mobileSky]){
  assert.ok(scene.includes('SALOON') && scene.includes('water tower') && scene.includes('Telegraph'),'Main Street must show three distinctive Western elements');
  assert.ok(scene.includes('Wide dusty main street') && scene.includes('url(#road)'),'Street creates perspective to the horizon');
  assert.ok(!scene.includes('floating island') && !scene.includes('Hoher Orden'),'No old skyborne/Order motifs');
}
assert.ok(mobileSky.includes('width="900" height="1200"'),'Separate portrait asset for iPhone');
assert.ok(sky.includes('width="1600" height="730"'),'Wide desktop asset for hero');
assert.ok(css.includes('skyborne-mainstreet-mobile.svg?v=mainstreet-20261120c'),'Mobile composition active in CSS');
const cssAssetVersion=heroHtml.split('styles.css?v=')[1]?.split('"')[0];
const jsAssetVersion=heroHtml.split('app.js?v=')[1]?.split('"')[0];
assert.ok(cssAssetVersion && cssAssetVersion===jsAssetVersion,'Versioned CSS and JS are synchronized');
assert.ok(read('sw.js').includes('/styles.css?v='+cssAssetVersion) && read('sw.js').includes('/app.js?v='+jsAssetVersion),'Service worker uses the current CSS and JS asset versions');
assert.ok(read('sw.js').includes('skyborne-mainstreet-mobile.svg?v=mainstreet-20261120c'),'Offline cache includes portrait scene');

assert.ok(!sky.includes('url(#moon)') && !sky.includes('#071526'));
assert.ok(css.includes('skill-energy-flow 3.8s linear infinite'));
assert.ok(css.includes('skill-light-sweep 7.6s ease-in-out infinite'));
assert.ok(css.includes('.profession-segment-fill::before{') && css.includes('.profession-segment-fill::after{'));
assert.ok(css.includes('prefers-reduced-motion:reduce'));


// Daten werden ausschliesslich ueber /api/refresh beim Klick aktualisiert;
// GitHub prueft bei Code-Pushes nur noch die Tests, ohne Daten zu committen.
const updateWorkflow=read('.github/workflows/update-data.yml');
const refreshApi=read('api/refresh.js');
assert.ok(!/^\s*schedule:/m.test(updateWorkflow),'No timed GitHub data updates');
assert.ok(!updateWorkflow.includes('official-scrape.mjs'),'CI no longer scrapes Blizzard automatically');
assert.ok(!updateWorkflow.includes('git push'),'CI must never publish timestamp-only data commits');
assert.ok(updateWorkflow.includes('run: npm test'),'Keep tests on code changes');
assert.ok(source.includes("button.addEventListener('click',refreshLive)"),'Manual button still calls Blizzard live');
assert.ok(source.includes("fetch('/api/refresh?t='+Date.now()"),'Refresh button requests live API');
assert.ok(refreshApi.includes('refreshCharacters([c])'),'Live API fetches Blizzard character profiles');
assert.ok(!source.includes('setInterval('),'No periodic background refresh in client');
assert.ok(!source.includes('automatische Aktualisierung läuft unabhängig weiter'),'No false automatic-update promises');


/* Western design contract – old cosmological decorations and Ordens copy must not return. */
assert.ok(!heroHtml.includes('Hoher Orden') && !source.includes('Hoher Orden'));
assert.ok(!source.includes('automatischer Abgleich etwa alle 30 Minuten'));
assert.ok(heroHtml.includes('id="dataFreshness"') && source.includes('Zuletzt live abgefragt: '));
assert.ok(source.includes('Gespeicherter Stand: '));
assert.ok(css.includes('rotate(16deg)') && !css.includes('rotate(8deg)'));
assert.ok(css.includes('margin:27px auto 0') && css.includes('margin-top:23px'));
assert.ok(css.includes('main{margin-top:22px}'));
assert.ok(!css.includes('radial-gradient(#f8db9e'));
assert.ok(!/[✦✧✶✣✳✴★☆]/.test(heroHtml+source+css),'No sky star symbols on page');
assert.ok(!css.includes('0 11px 21px rgba(2,7,16,.86)'),'No oversized black hero shadow');
for(const id of ['cole','dolly','chucky','viola']){
 const scene=read('scene-'+id+'.svg');
 assert.ok(scene.includes('Main professions:'),'Every backdrop has occupational props');
 assert.ok(!/<g fill="#[^"]+"><circle cx="41"/.test(scene),'No star fields in scenes');
 assert.ok(scene.includes('<circle cx="740" cy="257" r="61"'),'All scenes share warm daylight');
}
assert.ok(read('scene-cole.svg').includes('alchemy, herbalism'));
assert.ok(read('scene-viola.svg').includes('alchemy, herbalism'));
assert.ok(!/#[0-9a-f]{6}/i.test(read('scene-viola.svg').match(/#(?:477050|6f9e6e|6c9969)/g)||''),'No green Viola foliage');
assert.ok(css.includes('skill-energy-flow') && css.includes('skill-light-sweep'));
assert.ok(!/^\s*schedule:/m.test(updateWorkflow));


const levelSvg=read('level-sheriff.svg');
assert.equal((cards.match(/class="level" aria-label="Stufe /g)||[]).length,data.characters.length,'Each character receives a labeled sheriff-star level badge');
assert.equal((cards.match(/class="level-inner"/g)||[]).length,data.characters.length,'Every level badge contains its level number');
assert.ok(levelSvg.includes('Sechszackiger Sheriffstern'),'Level art is a sheriff star');
assert.ok(levelSvg.includes('<polygon') && levelSvg.includes('url(#goldMetal)'),'Six-point star has golden arms');
assert.ok(css.includes('background:url("/level-sheriff.svg?v=level-sheriff-20261120b")'),'CSS displays sheriff star, not circular gradient');
assert.ok(css.includes('transform:rotate(16deg)') && css.includes('.level-inner{') && css.includes('padding-top:2px;transform:none;'),'Star, label and number all tilt together by 16 degrees');
assert.ok(!css.includes('transform:rotate(-16deg)'),'Level text must not be counter-rotated');
assert.ok(!/\\.level\\{[^}]*border-radius:50%/.test(css),'Level is no longer a round badge');
assert.ok(css.includes('.level{width:72px;height:72px}'),'Mobile sheriff star is fully sized');


/* Dynamic-data contract: simulate changing official profiles and re-render.
   No displayed level, group metric, skill, stat, talent or equipment is hard-coded. */
const changed=structuredClone(data);
const cole=changed.characters.find(c=>c.slug==='cole-dalton');
const oldLevel=cole.level;
cole.level=oldLevel+7;
const alchemy=cole.professions.find(p=>p.name==='Alchemie');
alchemy.current=74;alchemy.max=150;
cole.stats.Gesundheit=987;
cole.statsFreshKeys=['Gesundheit'];cole.statsVerified=false;
cole.equipment[0].item='QA neuer Stab aus der Armory';
cole.talents='Arkan: 7';
cole.talentsVerified=true;
changed.generatedAt='2026-11-20T15:32:00.000Z';
ui.render(changed,{live:true,success:4});
const changedCards=nodes.get('#cards').innerHTML;
const changedSummary=nodes.get('#summary').innerHTML;
const changedLevels=changed.characters.map(c=>c.level);
assert.ok(changedCards.includes('class="level" aria-label="Stufe '+cole.level+'"'),'Live level updates sheriff badge');
assert.ok(changedCards.includes('QA neuer Stab aus der Armory'),'Live equipment changes');
assert.ok(changedCards.includes('Arkan: 7'),'Live talent distribution changes');
assert.ok(changedCards.includes('987'),'Live health changes');
assert.ok(changedCards.includes('Mana <span class="stale-value"'),'Missing stat clearly marked stale');
assert.ok(changedCards.includes('74/150'),'Live skill numerator and rank cap');
assert.ok(changedCards.includes('Geselle'),'Live training rank changes');
assert.ok(changedSummary.includes(Math.min(...changedLevels)+'–'+Math.max(...changedLevels)),'Group min/max are recomputed');
assert.ok(changedSummary.includes((changedLevels.reduce((a,b)=>a+b,0)/changedLevels.length).toFixed(1)),'Group average is recomputed');
assert.ok(changedSummary.includes((Math.max(...changedLevels)-Math.min(...changedLevels))+' Level'),'Level gap is recomputed');
assert.ok(nodes.get('#dataFreshness').textContent.includes('Zuletzt live abgefragt'),'Visible live timestamp');
assert.ok(!source.includes('await load({silent:true})'),'Refresh button does not fetch stale JSON first');
const failed=structuredClone(data);
const failedCole=failed.characters.find(c=>c.slug==='cole-dalton');
failedCole.scrapeOk=false;
failedCole.scrapedAt='2020-01-01T00:00:00.000Z';
const preserved=ui.keepNewestProfiles(failed);
assert.equal(preserved.characters.find(c=>c.slug==='cole-dalton').level,cole.level,'Failed fetch cannot roll back a newer live level');
assert.equal(preserved.characters.find(c=>c.slug==='cole-dalton').scrapeOk,false,'Reused data are marked stale');
ui.render(preserved,{live:true,success:3});
assert.ok(nodes.get('#status').textContent.includes('3 von 4 Profilen'),'Partial refresh clearly reported');
assert.ok(css.includes('.stale-value{'),'Stale-value formatting available');


/* Asset performance: don't preload a desktop landscape on a phone, and
   ensure the service worker never downloads an obsolete duplicate URL. */
const workerAssetList=read('sw.js');
const expectedHero=css.match(/skyborne-horizon\\.svg\\?v=[^"]+/)?.[0];
const expectedMobileHero=css.match(/skyborne-mainstreet-mobile\\.svg\\?v=[^"]+/)?.[0];
assert.ok(expectedHero&&expectedMobileHero);
assert.ok(heroHtml.includes('media="(min-width: 741px)" href="/'+expectedHero+'"'),'Desktop image is preloaded only at desktop widths');
assert.ok(heroHtml.includes('media="(max-width: 740px)" href="/'+expectedMobileHero+'"'),'Mobile image is preloaded only at mobile widths');
for(const id of ['cole','dolly','chucky','viola']){
  const fromCss=css.match(new RegExp('/scene-'+id+'\\\\.svg\\\\?v=[^"]+'))?.[0];
  assert.ok(fromCss&&workerAssetList.includes(fromCss),'Service worker uses actual CSS scene URL for '+id);
}

console.log('UI QA: sheriff daylight header, animated profession fills and four Western backdrops, neutral 4 stats, class icons, 4-tier profession bars, rarity and gear: OK');
