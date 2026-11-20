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
const ui=new Function('document',source.slice(0,start)+'\nreturn {render,professionRows,professionScale,equipmentSlotOrder};')(document);

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
assert.ok(css.includes('.section h3::before{content:"✦";font-size:.65rem;color:var(--class,#d6b27a)}'));
assert.ok(css.includes('.details summary::before{content:"◇";font-size:1.13rem;line-height:1;color:var(--class,#d6b27a)}'));
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
assert.match(chucky,/<linearGradient id="sky"[^>]*><stop stop-color="#392836"/,'Chucky warm dusk sky');
assert.match(chucky,/<g fill="#ac612f"/,'Chucky orange autumn foliage, not green');
assert.match(dolly,/<linearGradient id="sky"[^>]*><stop stop-color="#153e3c"/,'Dolly green frontier sky');
assert.match(dolly,/<path d="M0 679[^"]*" fill="#65805c"/,'Dolly green canyon, not orange');
assert.ok(css.includes('url("/scene-chucky.svg?v=20261120b")'));
assert.ok(css.includes('url("/scene-dolly.svg?v=20261120b")'));
assert.ok(!/\.vital:last-child\s*\{\s*border-color:\s*var\(--class\)/.test(css),
  'Item-level frame must match other vital tiles, not use the class color');
assert.ok(!/\.vital:last-child\s+strong\s*\{\s*color:\s*var\(--class\)/.test(css),
  'Item-level number must use neutral color');

// Golden sheriff-star header and daylight/western landscape should not regress.
const heroHtml=read('index.html'),crest=read('dalton-crest.svg'),sky=read('skyborne-horizon.svg'),icon=read('icon.svg');
assert.ok(heroHtml.includes('WANTED · AZEROTH'));
assert.ok(heroHtml.includes('Vier Abenteurer. Eine berüchtigte Bande.'));
assert.ok(heroHtml.includes('Noch keine Legenden. Aber schon gesucht.'));
assert.ok(heroHtml.includes('COLE · DOLLY · CHUCKY · VIOLA'));
assert.ok(!heroHtml.includes('Vier Himmelsgeborene. Ein wilder Himmel.'));
assert.match(crest,/sechszackiger Dalton-Sheriffstern/);
assert.ok(crest.includes('>D</text>') && crest.includes('url(#blueEnamel)'));
assert.ok(icon.includes('Dalton-Sheriffstern'));
assert.ok(sky.includes('Daylight: no stars') && sky.includes('url(#sun)'));
assert.ok(!sky.includes('url(#moon)') && !sky.includes('#071526'));
assert.ok(css.includes('skill-energy-flow 3.8s linear infinite'));
assert.ok(css.includes('skill-light-sweep 7.6s ease-in-out infinite'));
assert.ok(css.includes('.profession-segment-fill::before{') && css.includes('.profession-segment-fill::after{'));
assert.ok(css.includes('prefers-reduced-motion:reduce'));

console.log('UI QA: sheriff daylight header, animated profession fills and four Western backdrops, neutral 4 stats, class icons, 4-tier profession bars, rarity and gear: OK');
