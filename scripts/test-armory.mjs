import assert from 'node:assert/strict';
import {extractGermanGear} from './armory-core.mjs';
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
assert.deepEqual(extractGermanGear('<html></html>',[]).length,0); // empty if no readable equipment
console.log('ForeverSpec equipment extractor: OK');
