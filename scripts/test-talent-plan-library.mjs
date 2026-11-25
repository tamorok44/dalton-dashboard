import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {profileKey} from './talent-plan-core.mjs';

const folder=new URL('../data/talent-planning/',import.meta.url);
const files=readdirSync(folder).filter(name=>name.endsWith('.json')).sort();
const identities=new Set();
const activeProfiles=new Set();
const activePaths=new Set();
let planCount=0;
for(const file of files){
  const entry=JSON.parse(readFileSync(new URL(file,folder),'utf8'));
  if(Array.isArray(entry.sources)&&!Object.hasOwn(entry,'points'))continue;
  const plan=entry;
  planCount++;
  const identity=JSON.stringify([plan.id,plan.version]);
  assert.ok(typeof plan.id==='string'&&plan.id.trim(),file);
  assert.ok(Number.isSafeInteger(plan.version)&&plan.version>0,file);
  assert.ok(!identities.has(identity),file+' duplicates a plan identity');
  identities.add(identity);
  assert.equal(plan.schemaVersion,1,file);
  assert.ok(['research_only','approved','retired'].includes(plan.status),file);
  assert.equal(plan.requiresRespec,false,file);
  assert.equal(plan.points.length,51,file);
  const ranks=new Map();
  for(const {talentId,rank} of plan.points){
    assert.ok(Number.isSafeInteger(talentId)&&talentId>0,file);
    assert.equal(rank,(ranks.get(talentId)??0)+1,file+' skips or repeats a rank');
    ranks.set(talentId,rank);
  }
  assert.ok(plan.profiles.length>0,file);
  const ownProfiles=new Set();
  for(const profile of plan.profiles){
    const key=profileKey(profile);
    assert.ok(key,file);
    assert.equal(profile.classId,plan.classId,file);
    assert.equal(profile.treeId,plan.treeId,file);
    assert.ok(!ownProfiles.has(key),file+' repeats a profile');
    ownProfiles.add(key);
    if(plan.status==='approved'){
      assert.ok(!activeProfiles.has(key),file+' overlaps another approved plan');
      activeProfiles.add(key);
    }
  }
  if(plan.status==='approved'){
    const path=JSON.stringify([plan.classId,plan.points.map(({talentId,rank})=>[talentId,rank])]);
    assert.ok(!activePaths.has(path),file+' duplicates an approved allocation sequence');
    activePaths.add(path);
    assert.match(plan.catalogRevision,/^[a-f0-9]{64}$/,file);
    assert.ok(plan.ruleRevision&&plan.review?.evidenceIds?.length&&plan.review?.rationale&&plan.review?.reviewedAt,file);
  }
}
assert.ok(planCount>0,'The talent plan library must include its pilot');
console.log('Talent plan library: unique identities, profiles and approved paths: OK');
