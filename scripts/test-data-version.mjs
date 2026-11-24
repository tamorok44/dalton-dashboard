import assert from 'node:assert/strict';
import {buildDataVersion} from './data-version.mjs';

const base=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'}
});
assert.equal(base.generatedAt,'2026-11-21T05:07:00.000Z');
assert.ok(base.version.startsWith('data-v3|'));
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

const liveKnowledge=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'},
  liveKnowledgeVersion:'2026-11-24T09:10:00.000Z'
});
assert.notEqual(liveKnowledge.version,base.version,'Live merchant/trainer knowledge changes must invalidate derived frontend views');

const addonSync=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'},
  addonSync:{'cole-dalton':{syncId:'sync-2',receivedAt:'2026-11-24T12:22:51.468Z'}}
});
assert.notEqual(addonSync.version,base.version,'A new AddOn/Bridge sync must invalidate the frontend version even without a Blizzard profile refresh');
assert.ok(addonSync.addonSyncVersion?.includes('cole-dalton:sync-2'),'AddOn sync signature is exposed for diagnostics');

const same=buildDataVersion({
  data:{generatedAt:'2026-11-21T05:07:00.000Z'},
  petRules:{checkedAt:'2026-11-21T05:06:30.000Z',rulebookVersion:'2026.11.22.2',overall:'verified'}
});
assert.equal(same.version,base.version,'Identical server data must keep a stable version');

console.log('Data version: character, pet-rule, live-knowledge and AddOn-sync freshness signature: OK');
