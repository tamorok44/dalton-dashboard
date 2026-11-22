import assert from 'node:assert/strict';
import {buildDataVersion} from './data-version.mjs';

const base=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'}
});
assert.equal(base.generatedAt,'2026-11-21T05:07:00.000Z');
assert.ok(base.version.startsWith('data-v1|'));
const newerCharacters=buildDataVersion({
  data:{generatedAt:'2026-11-21T06:10:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'}
});
assert.notEqual(newerCharacters.version,base.version,'New character data must change the global frontend version');

const newerPetRules=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T06:05:00.000Z',rulebookVersion:'2026.11.22.3',overall:'review_required'}
});
assert.notEqual(newerPetRules.version,base.version,'Pet rule updates must change the global frontend version even without a character refresh');

const same=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'}
});
assert.equal(same.version,base.version,'Identical server data must keep a stable version');

console.log('Data version: character and pet-rule freshness signature: OK');
