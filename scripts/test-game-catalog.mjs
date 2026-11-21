import assert from 'node:assert/strict';
import {catalogField,collectCatalogRecords,normalizeCatalogRecord} from './game-catalog-store.mjs';
import {mediaField} from './media-registry.mjs';

assert.equal(catalogField('item',123),'item:123');
assert.equal(catalogField('unknown',123),null);
assert.equal(mediaField('item',123,'icon'),'item:123:icon');
assert.equal(mediaField('item','bad id','icon'),null);
assert.equal(normalizeCatalogRecord({type:'item',id:42,name:' Test '} ).name,'Test');

const records=collectCatalogRecords({characters:[{
  equipment:[{id:100,item:'Schwert',quality:'RARE',icon:'https://example.test/icon.jpg'}],
  reputations:[{id:72,name:'Sturmwind'}],
  professions:[{id:171,name:'Alchemie',knownRecipes:[{id:200,name:'Trank',craftedItem:{id:201,name:'Trank'},reagents:[{id:202,name:'Blume'}]}]}],
  activeQuests:[{id:300,name:'Quest'}],
  talentDetails:[{talents:[{id:400,name:'Talent',spellId:401}]}],
  hunterPets:{active:[{id:500,name:'Tier',family:{id:600,name:'Fuchs'},iconUrl:'https://example.test/pet.jpg'}],stable:[]}
} ]});
const keys=new Set(records.map(r=>r.type+':'+r.id));
for(const expected of ['item:100','faction:72','profession:171','recipe:200','item:201','item:202','quest:300','talent:400','spell:401','pet:500','pet-family:600']){
  assert.ok(keys.has(expected),'Katalog enthält '+expected);
}
const stormwind=records.find(record=>record.type==='faction'&&record.id==='72');
assert.equal(stormwind.slug,'stormwind','German observed faction names map onto the stable master slug');
assert.equal(stormwind.crestKind,'specific');
assert.match(stormwind.media.crestSourceUrl,/Stormwind\.png$/);
console.log('Game catalog: stable IDs, deduplication and media identity: OK');
