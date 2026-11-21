import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const excludedDirs=new Set(['.git','node_modules','.vercel']);
function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory()){
      if(!excludedDirs.has(entry.name))out.push(...walk(path.join(dir,entry.name)));
      continue;
    }
    if(/\.(?:js|mjs)$/.test(entry.name)&&!/^test-/.test(entry.name))out.push(path.join(dir,entry.name));
  }
  return out;
}
const prodFiles=walk(root);
const rel=file=>path.relative(root,file).replaceAll('\\','/');
const sourceByFile=new Map(prodFiles.map(file=>[rel(file),fs.readFileSync(file,'utf8')]));

// LANGUAGE CONTRACT
const forbiddenTranslationSymbols=[
  'foreverCategoryLabels',
  'translatedForeverCategory',
  'PROFESSION_NAMES',
  'PROFESSION_SLUG_BY_NAME'
];
for(const [file,source] of sourceByFile){
  for(const token of forbiddenTranslationSymbols){
    assert.ok(!source.includes(token),file+' must not define manual game-string translations: '+token);
  }
}
const manualProfessionTranslation=/(?:alchemy|blacksmithing|enchanting|engineering|leatherworking|tailoring|herbalism|mining|skinning|cooking|first-aid|fishing)\s*['"]?\s*:\s*['"][^'"]+['"]/i;
const manualCategoryTranslation=/(?:leather boots|leather bracers|leather chestguards|smelted bars|recovery potions|healing potions|armor kits|weapon oils)\s*['"]?\s*:\s*['"][^'"]+['"]/i;
for(const [file,source] of sourceByFile){
  assert.ok(!manualProfessionTranslation.test(source),file+' contains a manual profession translation table');
  assert.ok(!manualCategoryTranslation.test(source),file+' contains a manual recipe/category translation table');
}
assert.ok(!sourceByFile.get('app.js')?.includes('recipe.professionSlug'),'Frontend must never render an untranslated profession slug');

// MEDIA CONTRACT
const directRegistryUsers=[...sourceByFile.entries()]
  .filter(([file,source])=>source.includes("media-registry.mjs")&&file!=='scripts/media-resolver.mjs')
  .map(([file])=>file);
assert.deepEqual(directRegistryUsers,[],'Only media-resolver.mjs may access the media registry directly');
assert.ok(sourceByFile.get('scripts/archive-images.mjs')?.includes('resolveMediaAsset'),
  'Existing character/item/pet archiving must use the central media resolver');
assert.ok(sourceByFile.get('api/workshop.js')?.includes('resolveMediaAsset'),
  'Workshop media must use the central media resolver');
assert.ok(sourceByFile.get('api/workshop.js')?.includes('item:publicDetailedItem(item)'),
  'Workshop responses must pass selected items through the public media-safe projection');
assert.ok(!/icon\s*:\s*remote\.icon/.test(sourceByFile.get('api/workshop.js')||''),
  'Raw ForeverDB icon URLs must never be returned directly');
const browserSource=sourceByFile.get('app.js')||'';
for(const host of ['render.worldofwarcraft.com','foreverdb.net/icons/','foreverspec.com/icons/']){
  assert.ok(!browserSource.includes(host),'Browser code must not hard-code external game image hosts: '+host);
}

// UI / CI CONTRACT
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const viewNames=[...new Set([...html.matchAll(/data-view-link=["']([^"']+)["']/g)].map(match=>match[1]))];
assert.ok(viewNames.length>=3,'Architecture contract expects all main views from navigation');
for(const name of viewNames){
  const id=name+'View';
  const tag=html.match(new RegExp("<[^>]+id=[\\\"']"+id+"[\\\"'][^>]*>",'i'))?.[0]||'';
  assert.ok(tag.includes('main-view'),'#'+id+' must use shared main-view CI');
  const sectionStart=html.indexOf(tag);
  const nextViewCandidates=viewNames.map(other=>html.indexOf('id="'+other+'View"',sectionStart+tag.length)).filter(x=>x>sectionStart);
  const sectionEnd=nextViewCandidates.length?Math.min(...nextViewCandidates):html.indexOf('</main>',sectionStart);
  const section=html.slice(sectionStart,sectionEnd);
  assert.ok(section.includes('roster-heading')&&section.includes('roster-title')&&section.includes('roster-kicker'),
    '#'+id+' must use the shared Dalton section-heading CI');
}

// Existing Character/Comparison CSS predates the strict token-only rule.
// Workshop and every future view are held to it.
const tokenOnlyViews=viewNames.filter(name=>!['characters','compare'].includes(name));
for(const name of tokenOnlyViews){
  const prefix=name.replace(/[^a-z0-9_-]/gi,'');
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match=>match[1].split(',').some(selector=>selector.includes('.'+prefix+'-')||selector.includes('#'+prefix)));
  assert.ok(rules.length>0,'Token-only view '+name+' must have identifiable view-specific CSS');
  for(const [,selector,body] of rules){
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body),name+' CI must use centralized color tokens, raw hex in '+selector.trim());
    assert.ok(!/rgba?\s*\(/i.test(body),name+' CI must use centralized color tokens/color-mix, raw rgb(a) in '+selector.trim());
    const rawFontSize=body.match(/font-size\s*:\s*([^;]+)/i)?.[1]?.trim();
    if(rawFontSize)assert.ok(rawFontSize.startsWith('var('),name+' CI must use semantic typography token in '+selector.trim());
  }
}

console.log('Architecture contract: global language, media, CI and view rules: OK');
