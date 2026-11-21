import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function productiveFiles(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory()){
      if(!['.git','node_modules','.vercel'].includes(entry.name))out.push(...productiveFiles(path.join(dir,entry.name)));
    }else if(/\.(?:js|mjs)$/.test(entry.name)&&!/^test-/.test(entry.name)){
      out.push(path.join(dir,entry.name));
    }
  }
  return out;
}
const productiveSources=productiveFiles(root).map(file=>({
  file:path.relative(root,file).replaceAll('\\','/'),
  source:fs.readFileSync(file,'utf8')
}));
const globallyForbiddenTranslations=[
  'foreverCategoryLabels',
  'translatedForeverCategory',
  'PROFESSION_NAMES',
  'PROFESSION_SLUG_BY_NAME'
];
for(const {file,source} of productiveSources){
  for(const token of globallyForbiddenTranslations){
    assert.ok(!source.includes(token),file+' contains forbidden manual game translation: '+token);
  }
}

const armory=fs.readFileSync(new URL('./armory-core.mjs',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('./blizzard-api.mjs',import.meta.url),'utf8');
const refresh=fs.readFileSync(new URL('./refresh-service.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const pets=fs.readFileSync(new URL('../hunter-pets.js',import.meta.url),'utf8');
const reputation=fs.readFileSync(new URL('../reputation-data.js',import.meta.url),'utf8');

for(const forbidden of ['const classNames','const professionNames','const statNames','const treeNames','const itemQualityNames']){
  assert.ok(!armory.includes(forbidden)&&!app.includes(forbidden),'No manual game-string translation table: '+forbidden);
}
for(const forbidden of ["const slotKey=","head:'Kopf'","ranged:'Distanzwaffe'","'Füsse':'Füße'"]){
  assert.ok(!armory.includes(forbidden),'No manual equipment-slot translation fallback: '+forbidden);
}
for(const forbidden of ['Lehrling','Geselle','Experte','Fachmann']){
  assert.ok(!app.includes(forbidden),'Profession rank is not manually translated: '+forbidden);
}
for(const forbidden of ['Beißen','Tanz des Täuschers',"diet:Object.freeze(['Fleisch'])"]){
  assert.ok(!pets.includes(forbidden),'Unsourced pet game string removed from frontend model: '+forbidden);
}
assert.ok(!reputation.includes("name:'Hasserfüllt'")&&!reputation.includes("name:'Freundlich'"),'Reputation stage names are not manually maintained');
assert.match(armory,/fetchCharacter\(slug,locale="de-de"\)/);
assert.match(armory,/fetchForeverProfile\(old\.slug,\{locale:'de_DE'\}\)/);
assert.match(api,/fetchForeverProfile\(slug,\{fetchImpl=fetch,locale='de_DE'\}/);
assert.match(refresh,/locale:'de_DE'/);
assert.match(app,/Klasse nicht verfügbar/);
assert.match(app,/Volk nicht verfügbar/);
assert.match(app,/Fraktion nicht verfügbar/);
assert.match(app,/gameStringsVerified===true/);
assert.ok(!app.includes("'+item.qualityName"),'Unverified textual quality localization is not displayed');
assert.ok(!app.includes('family.diet'),'Pet diet text is not taken from a manually translated rulebook');
console.log('Game language guard: visible WoW strings come from German source data, not translation tables: OK');
