import assert from 'node:assert/strict';
import {questCatalogIdentity} from './quest-catalog-store.mjs';

const ref={
  type:'quest',
  id:92709,
  href:'https://eu.api.blizzard.com/data/wow/quest/92709?namespace=static-1.60.1_70399-forever-eu'
};
const identity=questCatalogIdentity(ref,{locale:'de_DE'});
assert.deepEqual(identity,{
  id:92709,
  locale:'de_DE',
  namespace:'static-1.60.1_70399-forever-eu',
  field:'de_DE:static-1.60.1_70399-forever-eu:92709',
  latestField:'de_DE:92709'
});
assert.equal(questCatalogIdentity({...ref,href:'https://example.com/data/wow/quest/92709'}),null);
console.log('Quest-Katalog: Quest-ID, Locale und Forever-Build bilden einen stabilen Schlüssel: OK');

const {questStartMediaReference}=await import('./quest-media.mjs');
assert.deepEqual(questStartMediaReference({id:1,starts:[{type:'npc',id:54,name:'Test',source:'classic'}]},1),{type:'npc',id:54,name:'Test',evidence:'classic-unconfirmed',role:'portrait'});
assert.equal(questStartMediaReference({id:1,starts:[{type:'item',id:54}]},1).role,'icon');
assert.equal(questStartMediaReference({id:1,starts:[{type:'npc',id:54},{type:'npc',id:55}]},1),null);
assert.equal(questStartMediaReference({id:2,starts:[{type:'npc',id:54}]},1),null);
assert.equal(questStartMediaReference({id:1,ends:[{type:'npc',id:54}]},1),null);
