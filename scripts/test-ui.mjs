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
const ui=new Function('document',source.slice(0,start)+'\nreturn {render,professionRows,equipmentSlotOrder};')(document);

// A 75/150 progress bar must be exactly half-filled, never guessed.
const p=ui.professionRows([{name:'Angeln',current:75,max:150}]);
assert.match(p,/width:50\.00%/);
assert.match(p,/>75\/150<\/span>/);
assert.equal((p.match(/75\/150/g)||[]).length,1,'Skill fraction should appear exactly once');
assert.match(p,/role="progressbar"/);
assert.match(p,/aria-valuenow="75"/);
assert.match(ui.professionRows([{name:'Test',current:0,max:75}]),/width:0\.00%/);
assert.match(ui.professionRows([{name:'Test',current:150,max:150}]),/width:100\.00%/);
assert.match(ui.professionRows([{name:'Test',current:200,max:150}]),/width:100\.00%/);
assert.match(ui.professionRows([{name:'Test',current:20,max:0}]),/width:0\.00%/);
assert.ok(!ui.professionRows([{name:'<script>',current:1,max:2}]).includes('<script>'));

ui.render(data);
const cards=nodes.get('#cards').innerHTML;
assert.equal((cards.match(/class="profession"/g)||[]).length,data.characters.reduce((n,c)=>n+c.professions.length,0));
assert.equal((cards.match(/class="vital"/g)||[]).length,data.characters.length*4);
assert.equal((cards.match(/Ausrüstung anzeigen/g)||[]).length,data.characters.length);
assert.equal((cards.match(/class="equip-name quality-/g)||[]).length,data.characters.reduce((n,c)=>n+c.equipment.length,0));
assert.equal(ui.equipmentSlotOrder.length,19);
for(const [slug,klass] of Object.entries({
  'cole-dalton':'scene-cole','dolly-dalton':'scene-dolly','chucky-dalton':'scene-chucky','viola-dalton':'scene-viola'
})){
  assert.match(cards,new RegExp('portrait '+klass));
  assert.ok(css.includes('.portrait.'+klass+'::before'));
  assert.ok(css.includes('url("/'+klass+'.svg")'));
  const scene=read(klass+'.svg');
  assert.match(scene,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(scene,/<\/svg>\s*$/);
}
assert.ok(!/\.vital:last-child\s*\{\s*border-color:\s*var\(--class\)/.test(css),
  'Item-level frame must match other vital tiles, not use the class color');
assert.ok(!/\.vital:last-child\s+strong\s*\{\s*color:\s*var\(--class\)/.test(css),
  'Item-level number must use neutral color');
console.log('UI QA: four Western backdrops, neutral item-level, 20 profession bars, rarity and gear: OK');
