import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const css=fs.readFileSync(path.join(dir,'styles.css'),'utf8');

const viewNames=[...new Set([...html.matchAll(/data-view-link=["']([^"']+)["']/g)].map(match=>match[1]))];
assert.ok(viewNames.length>=2,'Main navigation exposes its view targets');

for(const name of viewNames){
  const id=name+'View';
  const tagPattern=new RegExp("<[^>]+id=[\\\"']"+id+"[\\\"'][^>]*>",'i');
  const tag=html.match(tagPattern)?.[0]||'';
  assert.ok(tag,'Navigation target #'+id+' exists');
  const classes=tag.match(/class=["']([^"']*)["']/i)?.[1]?.split(/\s+/).filter(Boolean)||[];
  assert.ok(classes.includes('main-view'),'#'+id+' must use the shared main-view viewport contract');
}

assert.match(css,/\.main-view\s*\{[^}]*min-width\s*:\s*0[^}]*max-width\s*:\s*100%/s,'main-view constrains every top-level view');
assert.match(css,/\.main-view\s*>\s*\*\s*\{[^}]*min-width\s*:\s*0[^}]*max-width\s*:\s*100%/s,'direct view content also remains shrinkable');

const forbiddenSelectors=['body','main','.main-view','#charactersView','#compareView'];
for(const selector of forbiddenSelectors){
  const escaped=selector.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
  const rule=new RegExp(escaped+'[^{}]*\\{[^}]*overflow-x\\s*:\\s*(?:auto|scroll)','i');
  assert.ok(!rule.test(css),selector+' must never become the horizontal page scroller');
}

const allowedHorizontalScrollSelectors=new Set(['.character-tabs','.compare-scroll']);
const horizontalRules=[...css.matchAll(/([^{}]+)\{([^{}]*overflow-x\s*:\s*auto[^{}]*)\}/gi)]
  .map(match=>match[1].trim());
assert.ok(horizontalRules.length>0,'Known inner horizontal scrollers are present');
for(const selector of horizontalRules){
  const pieces=selector.split(',').map(part=>part.trim());
  const approved=pieces.every(part=>[...allowedHorizontalScrollSelectors].some(allowed=>part===allowed));
  assert.ok(approved,'Horizontal scrolling requires explicit CI approval: '+selector);
}
for(const allowed of allowedHorizontalScrollSelectors){
  assert.ok(horizontalRules.some(selector=>selector.split(',').map(x=>x.trim()).includes(allowed)),allowed+' remains an intentional inner scroller');
}

assert.match(css,/\.compare-scroll\s*\{[^}]*min-width\s*:\s*0[^}]*max-width\s*:\s*100%[^}]*overflow-x\s*:\s*auto[^}]*overscroll-behavior-inline\s*:\s*contain/s,
  'Comparison table scroll is contained inside its own viewport-safe wrapper');

console.log('UI layout contract: all main views stay viewport-safe; horizontal scroll is restricted to approved inner components: OK');
