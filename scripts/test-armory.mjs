import assert from 'node:assert/strict';
import {extractGermanGear,gear,refreshCharacters} from './armory-core.mjs';
const html=`<!doctype html><title>Cole Dalton - ForeverSpec</title>
<div class="arm-panel"><div class="a-slot side-l" data-itemtype="back" data-itemid="7731373" data-itemlevel="8">
  <div class="slot-icon"><img src="/icons/7731373.webp"></div>
  <div class="slot-info"><div class="slot-name">Einfacher Umhang des JÃ¤gers</div><div class="slot-level">8 Â· RÃ¼cken</div></div>
</div><div class="a-slot side-r" data-itemtype="mainhand" data-itemid="454058" data-itemlevel="10">
  <div class="slot-info"><div class="slot-name">Fleckliger Ritualdolch</div><div class="slot-level">10 Â· Waffenhand</div></div>
</div><div class="a-slot" data-itemtype="head" data-itemid="" data-itemlevel="0"><div class="slot-name">Leer</div></div></div>`;
const result=extractGermanGear(html,[]);
assert.equal(result.length,2);
assert.deepEqual(result.map(x=>x.slot),['RÃ¼cken','Waffenhand']);
assert.deepEqual(result.map(x=>x.item),['Einfacher Umhang des JÃ¤gers','Fleckliger Ritualdolch']);
assert.equal(result[0].icon,'https://foreverspec.com/icons/7731373.webp');
assert.equal(result[1].level,10);
assert.throws(()=>extractGermanGear('<html></html>',[]),/keine auslesbare AusrÃ¼stung/);
const officialGear=gear({gear:[
  {name:'Worn Leather Vest',slot:{type:'CHEST'},level:{value:9},quality:{type:'POOR',name:'Poor'}},
  {name:'Training Sword of the Gorilla',slot:{type:'MAIN_HAND'},level:{value:10},qu¶»§q«^