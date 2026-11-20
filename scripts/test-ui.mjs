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
const ui=new Function('document',source.slice(0,start)+'\nreturn {render,professionRows,professionScale,sortProfessionsForDisplay,statsPanel,equipmentSlotOrder,keepNewestProfiles,experienceProgress,totalXpAtLevel,setActiveCharacterTab};')(document);

// Uniform 0â€“300 scale: current skill must not stretch to 100% at the old 75/150 cap.
const getSegments=html=>[...html.matchAll(/class="profession-segment (is-unlocked|is-locked)"><span class="profession-segment-fill" style="width:([0-9.]+)%"/g)]
  .map(m=>({state:m[1],width:Number(m[2])}));
const examples=[
  {current:37,max:75,rank:'Lehrling',widths:[49.33,0,0,0],unlocked:1},
  {current:75,max:75,rank:'Lehrling',widths:[100,0,0,0],unlocked:1},
  {current:75,max:150,rank:'Geselle',widths:[100,0,0,0],unlocked:2},
  {current:99,max:150,rank:'Geselle',w¶»§q«^