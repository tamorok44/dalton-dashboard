import assert from 'node:assert/strict';
import charactersApi from '../api/characters.js';
import {createTalentPlannerHandler} from './talent-planner-api.mjs';
import {loadPreviewTalentObservation} from './talent-preview-observation.mjs';
import {TALENT_CATALOG_MAX_AGE_MS} from './talent-rule-watch.mjs';
import {talentAllocationDifference,compareTalentProgress,talentGuideOptions,talentAssistantGuide,planIsCurrent,specializationRecommendation,specializationSelection} from '../talent-planner.js';
import {talentPlanLibrary} from './talent-plan-index.mjs';
import release from '../data/talent-planning/release-catalog.json' with {type:'json'};
import proofs from '../data/talent-planning/catalog-proofs-2026-11-25.json' with {type:'json'};

const rules=release.rulePacks[0];
const klass=proofs.catalogs.find(entry=>entry.proof.classId===rules.classId).proof;
const checkedAt='2026-11-25T10:00:00.000Z';
const start=Date.parse(checkedAt);
const observation={status:'observed',checkedAt,checkedAtMs:start,revisionSince:checkedAt,
  clientBuild:rules.clientBuild,hotfixRevision:rules.hotfixRevision};
const master={classes:{[rules.classId]:klass},classMechanicsRevisions:{[rules.classId]:rules.catalogRevision},
  stale:false,checkedAt,sourceRevision:rules.sourceRevision,sourceFreshAt:{raw:checkedAt,localized:checkedAt}};
const mage={slug:'preview-mage',url:'https://foreverspec.com/de/armory/eu/preview-mage/',level:15,
  classId:8,blizzardCharacterId:555,scrapedAt:checkedAt,talentDetailsVerified:true,talentDetails:[]};
const warrior={...mage,slug:'preview-warrior',classId:1,blizzardCharacterId:556};
const query={character:mage.slug,tree:'11582',goal:'leveling',role:'damage',playStyle:'mixed',priority:'balanced',
  rank:'0',rankSource:'player_confirmed'};
let reads=0;
const roster=async()=>({data:{characters:[mage,warrior]}});
function handler(overrides={}){
  return createTalentPlannerHandler({enabled:()=>true,roster,observe:async()=>{reads++;return observation},
    master:async()=>master,clock:()=>start+1000,project:async value=>value,...overrides});
}
async function request(params,{endpoint=handler(),method='GET'}={}){
  const response={headers:{},setHeader(name,value){this.headers[name]=value},
    status(code){this.code=code;return this},json(body){this.body=body}};
  await endpoint({method,query:params},response);
  assert.equal(response.headers['Cache-Control'],'private, no-store');
  return response;
}
async function blocked(code,params=query,overrides={}){
  const {body}=await request(params,{endpoint:handler(overrides)});
  assert.equal(body.ok,false);
  assert.equal(body.code,code);
  assert.ok(!Object.hasOwn(body,'history'));
}
assert.equal((await request(query,{endpoint:handler({enabled:()=>false})})).code,404);
const previous=process.env.VERCEL_ENV;
try{
  process.env.VERCEL_ENV='production';
  assert.equal((await request({...query,view:'talent-planner'},{endpoint:charactersApi})).code,404);
}finally{
  if(previous===undefined)delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV=previous;
}
await blocked('unknown_character',{...query,character:'not-in-roster'});
await blocked('unknown_character',query,{roster:async()=>({data:{characters:[mage,{...mage,blizzardCharacterId:556}]}})});
await blocked('roster_unavailable',query,{roster:async()=>({fallback:true})});
assert.deepEqual((await request({character:warrior.slug})).body.profiles.map(p=>p.planId).sort(),['warrior-arms-dungeons','warrior-arms-leveling','warrior-arms-pvp','warrior-fury-dungeons','warrior-fury-leveling','warrior-fury-pvp','warrior-protection-dungeons','warrior-protection-leveling','warrior-protection-pvp']);
await blocked('no_approved_recommendation',{...query,character:warrior.slug});
await blocked('no_approved_recommendation',{...query,goal:'pvp'});
await blocked('no_approved_recommendation',{...query,tree:'99999'});
for(const rank of ['',undefined,'-1','00'])await blocked('unverified_legacy_rank',{...query,rank});
await blocked('unverified_legacy_rank',{...query,rankSource:undefined});
await blocked('unsupported_legacy_rank',{...query,rank:'1'});
await blocked('binding_unavailable',{...query,planId:'mage-arcane-leveling',version:'2',identity:'["eu","",555]'});
await blocked('binding_unavailable',{...query,planId:'mage-arcane-leveling',version:'1',identity:'["us","",555]'});
await blocked('binding_unavailable',{...query,goal:'pvp',planId:'mage-arcane-leveling',version:'1',identity:'["eu","",555]'});
assert.equal(reads,0,'rejected requests and profile discovery do not inspect catalogs or providers');

const info=(await request({character:mage.slug})).body;
assert.equal(info.profiles.length,9);
assert.equal(info.identity,'["eu","",555]');
assert.equal(info.profiles[0].name,'Arkan');
assert.deepEqual(info.profiles[0].supportedLegacyRanks,[0]);
assert.equal(talentGuideOptions(info.profiles).complete,false);
assert.equal(talentGuideOptions(info.profiles,{goal:'pvp'}).profiles.length,3);
assert.equal(talentGuideOptions(info.profiles,{goal:'leveling'}).profiles.length,3);
assert.deepEqual(talentGuideOptions(info.profiles,{goal:'leveling'}).fields.map(f=>f.key),['goal']);
assert.equal(talentGuideOptions(info.profiles,{goal:'pvp'}).unavailable,false);
assert.equal(info.profiles.find(p=>p.goal==='leveling'&&p.treeId===11582).planId,'mage-arcane-leveling');
assert.equal(info.profiles[0].version,1);
assert.deepEqual(info.specializations.map(p=>p.name),['Arkan','Feuer','Frost']);
assert.equal(info.specializationAdvice.length,3);
const magePvPGuide=talentGuideOptions(info.profiles,{goal:'pvp'});
assert.equal(specializationSelection(magePvPGuide,{},info.specializationAdvice).profile,null,'old two-option comparison must not select from three');
assert.equal(specializationSelection(magePvPGuide,{treeId:11594},info.specializationAdvice).profile.planId,'mage-fire-pvp');
const dungeonGuide=talentGuideOptions(info.profiles,{goal:'dungeons'});
assert.equal(dungeonGuide.profiles.length,3);
assert.equal(specializationSelection(dungeonGuide,{},info.specializationAdvice).profile,null);
assert.equal(specializationSelection(dungeonGuide,{treeId:11594},info.specializationAdvice).profile.planId,'mage-fire-dungeons');
const pilotGuide=talentGuideOptions(info.profiles,{goal:'leveling'});
assert.equal(specializationSelection(pilotGuide,{},info.specializationAdvice).profile,null);
assert.equal(specializationSelection(pilotGuide,{},info.specializationAdvice).recommended,null);
assert.equal(specializationSelection(talentGuideOptions([info.profiles.find(p=>p.goal==='leveling'&&p.treeId===11582)],{goal:'leveling'})).recommended.kind,'available');
assert.equal(specializationSelection(pilotGuide,{},info.specializationAdvice).recommended,null);
assert.equal(specializationSelection(pilotGuide,{treeId:11594}).treeId,11594);
assert.equal(specializationSelection(pilotGuide,{treeId:11594},info.specializationAdvice).profile.planId,'mage-fire-leveling-mixed-balanced');
assert.equal(specializationSelection(pilotGuide,{treeId:11601}).profile.planId,'mage-frost-leveling-mixed-balanced');
// Synthetic future profiles: the questions adapt to actual distinct approved
// plan identities, not class names, a roster size or internal priority axes.
const baseProfile={...info.profiles.find(p=>p.goal==='leveling'&&p.treeId===11582),classId:11,treeId:101,planId:'cat-leveling'};
const cat={...baseProfile,role:'damage',playStyle:'mixed'};
const bear={...baseProfile,role:'tank',playStyle:'mixed',planId:'bear-leveling'};
const heal={...baseProfile,role:'heal',playStyle:'mixed',treeId:102,planId:'heal-leveling'};
let adaptive=talentGuideOptions([cat,bear,heal],{goal:'leveling'});
assert.deepEqual(adaptive.fields.map(f=>f.key),['goal','role']);
assert.equal(adaptive.profiles.length,0);
adaptive=talentGuideOptions([cat,bear,heal],{goal:'leveling',role:'tank'});
assert.equal(adaptive.profiles[0].planId,'bear-leveling');
assert.deepEqual(adaptive.fields.map(f=>f.key),['goal','role']);
const catSolo={...cat,playStyle:'solo',planId:'cat-solo'};
adaptive=talentGuideOptions([cat,catSolo],{goal:'leveling'});
assert.deepEqual(adaptive.fields.map(f=>f.key),['goal','playStyle']);
assert.equal(talentGuideOptions([cat,catSolo],{goal:'leveling',playStyle:'solo'}).profiles[0].planId,'cat-solo');
const aliases=[cat,{...cat,role:'tank'},{...cat,playStyle:'solo'}];
assert.deepEqual(talentGuideOptions(aliases,{goal:'leveling'}).fields.map(f=>f.key),['goal']);
const niche={...cat,priority:'speed',planId:'niche-speed'};
assert.equal(talentGuideOptions([cat,niche],{goal:'leveling'}).profiles[0].planId,'cat-leveling');
assert.equal(talentGuideOptions([niche],{goal:'leveling'}).unavailable,true);
const altSpec={...cat,treeId:103,planId:'another-tree'};
const multi=talentGuideOptions([cat,altSpec],{goal:'leveling'});
assert.equal(multi.profiles.length,2);
assert.equal(specializationRecommendation(multi.profiles),null);
const comparative={options:[cat,altSpec],preferred:altSpec,reason:'Synthetic comparative test',evidenceIds:['fixture']};
assert.equal(specializationSelection(multi,{},[comparative]).profile.treeId,103);
assert.equal(specializationSelection(multi,{treeId:101},[comparative]).profile.treeId,101);
assert.equal(specializationSelection(multi,{treeId:101},[comparative]).recommended.profile.treeId,103);
assert.equal(specializationRecommendation([{...cat,version:2},altSpec],[comparative]),null);
assert.equal(specializationRecommendation(multi.profiles,[comparative,comparative]),null);
assert.equal(specializationRecommendation(multi.profiles,[{...comparative,evidenceIds:[]}]),null);
const sameGoals=['leveling','dungeons','pvp'].map(goal=>({...cat,goal}));
assert.deepEqual(talentGuideOptions(sameGoals).fields,[]);
assert.equal(talentGuideOptions(sameGoals).profiles.length,1);
assert.equal(talentGuideOptions(sameGoals.slice(0,2)).fields[0].key,'goal');
assert.equal(talentGuideOptions([cat,{...cat,planId:'conflicting-path'}],{goal:'leveling'}).unavailable,true);
const good=(await request({...query,planId:'mage-arcane-leveling',version:'1',identity:info.identity})).body;
assert.equal(good.ok,true);
assert.equal(good.history.length,51);
assert.equal(good.version,1);
assert.equal(good.evidence.catalogRevision,rules.catalogRevision);
assert.equal(good.evidence.sourceRevision,rules.sourceRevision);
assert.deepEqual(good.legacyRank,{rank:0,source:'player_confirmed'});
const firePlan=(await request({...query,tree:'11594'})).body;
assert.equal(firePlan.ok,true);
assert.equal(firePlan.version,2);
assert.equal(firePlan.history.length,51);
assert.equal(firePlan.history.find(p=>p.talentId===105786).level,25);
assert.equal(firePlan.history.find(p=>p.talentId===105781).level,42);
assert.deepEqual([11582,11594,11601].map(treeId=>firePlan.history.filter(p=>p.treeId===treeId).length),[18,31,2]);
await blocked('unsupported_legacy_rank',{...query,tree:'11594',rank:'1'});
assert.equal(good.character.talentDetailsVerified,false,'empty API records do not establish an empty learned tree');
await blocked('unverified_current_catalog',query,{master:async()=>({...master,stale:true})});
await blocked('unverified_current_catalog',query,{master:async()=>({...master,classMechanicsRevisions:{}})});
await blocked('unverified_current_rules',query,{master:async()=>({...master,sourceRevision:'a'.repeat(64)})});
await blocked('unverified_current_rules',query,{observe:async()=>({...observation,clientBuild:'1.60.1.71092'})});
const transition=(await request(query,{endpoint:handler({observe:async()=>({...observation,clientBuild:'1.60.1.71139',hotfixRevision:'a'.repeat(64)}),master:async()=>({...master,sourceRevision:'b'.repeat(64)})})})).body;
assert.equal(transition.ok,false);
assert.equal(transition.evidence.review.classMechanicsUnchanged,true);
assert.deepEqual(transition.evidence.review.reasons.map(r=>r.code),['client_build_changed','hotfix_changed','source_pair_changed_or_missing']);
assert.equal(transition.evidence.review.status,'review_required');
assert.equal(good.evidence.review.status,'matches');
await blocked('unverified_current_rules',{...query,tree:'11601'});
const updated=release.rulePacks.find(p=>p.revision==='mage-arcane-dungeons-rank0-71139');
const liveEndpoint=handler({master:async()=>({...master,sourceRevision:updated.sourceRevision}),observe:async()=>({...observation,clientBuild:updated.clientBuild,hotfixRevision:updated.hotfixRevision})});
for(const [tree,planId] of [['11582','mage-arcane-dungeons'],['11594','mage-fire-dungeons'],['11601','mage-frost-dungeons']]){
  const dungeonQuery={...query,tree,goal:'dungeons',playStyle:'group'};
  const result=(await request(dungeonQuery,{endpoint:liveEndpoint})).body;
  assert.equal(result.ok,true);
  assert.equal(result.planId,planId);
  assert.equal(result.history.length,51);
  await blocked('unverified_current_rules',dungeonQuery);
}
await blocked('unverified_current_rules',query,{observe:async()=>({...observation,hotfixRevision:'a'.repeat(64)})});
await blocked('unverified_current_rules',query,{observe:async()=>null});
await blocked('unverified_current_rules',query,{clock:()=>start+TALENT_CATALOG_MAX_AGE_MS});
await blocked('source_unavailable',query,{observe:async()=>{throw Error('Redis down')}});
await blocked('source_unavailable',query,{master:async()=>{throw Error('network down')}});

const current=talentPlanLibrary.find(p=>p.id==='mage-arcane-leveling');
const archived={...current,active:false};
const newer={...current,version:2};
const versions=handler({library:[archived,newer]});
assert.equal((await request(query,{endpoint:versions})).body.version,2);
assert.equal((await request({...query,planId:current.id,version:'1',identity:info.identity},{endpoint:versions})).body.version,1);
assert.equal((await request({character:mage.slug},{endpoint:versions})).body.profiles.length,1);
const newCharacter={...mage,slug:'second-mage',blizzardCharacterId:777};
assert.equal((await request({character:newCharacter.slug},{endpoint:handler({roster:async()=>({data:{characters:[mage,newCharacter]}})})})).body.profiles.length,9);
assert.equal((await request({character:mage.slug},{endpoint:handler({roster:async()=>({data:{characters:[mage,{...mage,slug:'duplicate-id'}]}})})})).body.identity,null);
const stalePersonal=(await request(query,{endpoint:handler({roster:async()=>({data:{characters:[{...mage,scrapedAt:'2026-11-20T10:00:00Z'}]}})})})).body;
assert.equal(stalePersonal.ok,true);
assert.equal(stalePersonal.character.talentDetailsFresh,false);
assert.equal(stalePersonal.character.personalValidUntil,null);
assert.equal(good.character.talentDetailsFresh,true);
assert.equal(planIsCurrent(good,start+1000),true);
assert.equal(planIsCurrent(good,start+TALENT_CATALOG_MAX_AGE_MS),false);
const first=good.history[0];
assert.deepEqual(compareTalentProgress(good.history,{verified:false,ranks:new Map()},15),{status:'unknown'});
assert.equal(compareTalentProgress(good.history,{verified:true,ranks:new Map([[123,1]])},15).status,'different');
assert.equal(compareTalentProgress(good.history,{verified:true,ranks:new Map([[first.talentId,1]])},9).status,'different');
assert.equal(compareTalentProgress(good.history,{verified:true,ranks:new Map([[first.talentId,1]])},15).next.point,2);

const cache=new Map();
let calls=0,now=start;
const redisImpl=async([cmd,key,value,,operation,ttl])=>{
  if(cmd==='GET')return cache.get(key)?.expires>now?cache.get(key).value:null;
  if(cmd==='SET'){
    assert.ok(key.endsWith(':preview:v1:attempt'));
    assert.equal(operation,'EX');
    assert.equal(ttl,21600);
    if(cache.get(key)?.expires>now)return null;
    cache.set(key,{value,expires:now+ttl*1000});
    return 'OK';
  }
  throw Error('Unexpected command '+cmd);
};
const call=(...args)=>loadPreviewTalentObservation({clock:()=>now,check:async({now:date})=>{
  calls++;
  const checkedAt=date.toISOString();
  return {...observation,checkedAt,checkedAtMs:now,revisionSince:checkedAt};
},redisImpl:async command=>{
  if(command[0]!=='EVAL')return redisImpl(command);
  const [,,,lock,key,token,value,ttl]=command;
  assert.ok(key.endsWith(':preview:v1'));
  assert.equal(cache.get(lock).value,token);
  cache.set(key,{value,expires:now+ttl*1000});
  return 'OK';
},...args[0]});
const joined=await Promise.all([call(),call()]);
assert.equal(joined.filter(Boolean).length,1);
assert.equal(calls,1);
assert.deepEqual(await call(),observation);
now+=TALENT_CATALOG_MAX_AGE_MS;
assert.equal((await call()).revisionSince,checkedAt);
assert.equal(calls,2);
now+=TALENT_CATALOG_MAX_AGE_MS;
await assert.rejects(call({check:async()=>{throw Error('upstream unavailable')}}),/upstream unavailable/);
assert.equal(await call(),null,'failed attempts count toward the shared budget');
assert.equal(calls,2);
console.log('Talent Preview: roster, exact binding, rank, live gates, no fallback, shared attempt budget and personal progress: OK');

 // An allocation comparison is independent of the number already spent.
const sampleHistory=[
  {level:10,talentId:1,rank:1},{level:11,talentId:1,rank:2},
  {level:12,talentId:2,rank:1},{level:13,talentId:2,rank:2}
];
const known=ranks=>({verified:true,ranks:new Map(ranks)});
assert.equal(talentAllocationDifference(sampleHistory,{verified:false,ranks:new Map()},12),null);
assert.equal(talentAllocationDifference(sampleHistory,known([[1,-1]]),12),null);
assert.equal(talentAllocationDifference(sampleHistory,known([]),0),null);
assert.deepEqual(talentAllocationDifference(sampleHistory,known([[1,2],[2,1]]),12),
  {level:12,plannedPoints:3,learnedPoints:3,rows:[]});
assert.deepEqual(talentAllocationDifference(sampleHistory,known([[1,1],[3,1]]),12),
  {level:12,plannedPoints:3,learnedPoints:2,rows:[{talentId:1,planned:2,learned:1},{talentId:2,planned:1,learned:0},{talentId:3,planned:0,learned:1}]});
assert.deepEqual(talentAllocationDifference(sampleHistory,known([[1,2]]),11).rows,[]);
assert.deepEqual(talentAllocationDifference(sampleHistory,known([[1,2]]),12).rows,[{talentId:2,planned:1,learned:0}]);
assert.deepEqual(talentAllocationDifference(sampleHistory,known([[1,1]]),9).rows,[{talentId:1,planned:0,learned:1}]);
console.log('Talent allocation: level-specific differences, unspent ambiguity and verified data: OK');

// Every class exposes its orientation without provider reads or research allocations.
const coverage=(await import('../data/talent-planning/coverage-2026-11-25.json',{with:{type:'json'}})).default;
const allRoster=Object.keys(coverage.classes).map(id=>({...mage,slug:'qa-class-'+id,classId:Number(id),blizzardCharacterId:700+Number(id)}));
const orientationEndpoint=handler({roster:async()=>({data:{characters:allRoster}})});
const initialReads=reads;
for(const c of allRoster){
 const info=(await request({character:c.slug},{endpoint:orientationEndpoint})).body;
 assert.equal(info.specializations.length,3);
 assert.ok(info.specializations.every(s=>s.roles.length&&s.focus.length));
 assert.ok(info.profiles.every(p=>p.classId===c.classId&&p.supportedLegacyRanks.includes(0)));
 assert.equal(talentAssistantGuide(info.profiles,{},info.specializations).fields[0].key,'goal');
 for(const goal of coverage.goals)for(const role of new Set(info.specializations.flatMap(s=>s.roles))){
   const g=talentAssistantGuide(info.profiles,{goal,role},info.specializations);
   assert.deepEqual(g.orientation.map(s=>s.treeId),info.specializations.filter(s=>s.roles.includes(role)).map(s=>s.treeId));
   assert.ok(g.profiles.every(p=>p.role===role&&p.goal===goal));
   if(!info.profiles.some(p=>p.goal===goal&&p.role===role)){
     assert.equal(specializationSelection(g,{},info.specializationAdvice).profile,null);
     assert.equal(specializationSelection(g,{},info.specializationAdvice).recommended,null);
     assert.equal(g.unavailable,true);
   }
 }
}
assert.equal(reads,initialReads,'orientation remains offline, no provider reads');
const rolesInfo=(await request({character:'qa-class-11'},{endpoint:orientationEndpoint})).body;
assert.deepEqual(talentAssistantGuide([], {goal:'dungeons'},rolesInfo.specializations).fields.map(f=>f.key),['goal','role']);
assert.equal(talentAssistantGuide([], {goal:'dungeons',role:'tank'},rolesInfo.specializations).orientation[0].treeId,11347);
assert.equal(talentAssistantGuide(info.profiles,{goal:'leveling'},info.specializations).fields.length,1);
console.log('Talent assistant: all nine classes, role navigation, exact reviewed defaults, unavailable alternatives and zero provider reads: OK');

// Editorial candidates are intentionally kept outside the browser/API release catalog.
const {readFileSync:readAssistantMatrix}=await import('node:fs');
const assistantMatrix=JSON.parse(readAssistantMatrix(new URL('../docs/talent-planner-assistant-review-2026-11-26.json',import.meta.url),'utf8'));
assert.equal(assistantMatrix.releaseEligible,false);
const assistantKeys=new Set();
for(const entry of assistantMatrix.rows){
 const key=JSON.stringify([entry.classId,entry.role,entry.goal]);
 assert.ok(!assistantKeys.has(key));assistantKeys.add(key);
 assert.equal(entry.status,'research_only');assert.equal(entry.releaseEligible,false);
 assert.deepEqual(entry.optionTreeIds,coverage.classes[entry.classId].filter(t=>t.roles.includes(entry.role)).map(t=>t.treeId));
 assert.ok(entry.optionTreeIds.includes(entry.preferredTreeId));
 assert.equal(entry.kind,entry.optionTreeIds.length>1?'comparative_candidate':'role_match');
 assert.ok(entry.reason.length>20&&entry.sourceUrls.length&&entry.sourceUrls.every(url=>new URL(url).protocol==='https:'));
}
const expectedAssistantKeys=Object.entries(coverage.classes).flatMap(([id,trees])=>[...new Set(trees.flatMap(t=>t.roles))].flatMap(role=>coverage.goals.map(goal=>JSON.stringify([Number(id),role,goal]))));
assert.deepEqual([...assistantKeys].sort(),expectedAssistantKeys.sort());
assert.equal(assistantMatrix.rows.filter(x=>x.kind==='comparative_candidate').length,24);
console.log('Assistant research matrix: all 48 class/role/goal decisions, 24 comparative candidates, release disabled: OK');

// New class approvals remain bound to the exact source and rank zero.
const shamanPacks=release.rulePacks.filter(p=>p.classId===7);
for(const planId of ["shaman-elemental-leveling","shaman-restoration-dungeons"]){
 const plan=talentPlanLibrary.find(p=>p.id===planId);
 assert.ok(plan);
 const pack=shamanPacks.find(p=>p.revision===plan.ruleRevision);
 const proof=proofs.catalogs.find(c=>c.catalogRevision===pack.catalogRevision).proof;
 const profile=plan.profiles[0];
 const q={...query,character:'qa-class-7',tree:String(plan.treeId),goal:profile.goal,role:profile.role,playStyle:profile.playStyle,priority:profile.priority};
 const overrides={roster:async()=>({data:{characters:allRoster}}),master:async()=>({...master,classes:{7:proof},classMechanicsRevisions:{7:pack.catalogRevision},sourceRevision:pack.sourceRevision}),observe:async()=>({...observation,clientBuild:pack.clientBuild,hotfixRevision:pack.hotfixRevision})};
 const result=(await request(q,{endpoint:handler(overrides)})).body;
 assert.equal(result.ok,true,planId+': '+JSON.stringify(result));
 assert.equal(result.planId,planId);
 assert.equal(result.history.length,51);
 await blocked('unsupported_legacy_rank',{...q,rank:'1'},overrides);
}
console.log('Shaman: exact-build rank-zero release and higher-rank denial: OK');

const hunterInfo=(await request({character:'qa-class-3'},{endpoint:orientationEndpoint})).body;
for(const goal of ['leveling','pvp']){
 const g=talentAssistantGuide(hunterInfo.profiles,{goal,role:'damage'},hunterInfo.specializations);
 assert.equal(specializationSelection(g,{},hunterInfo.specializationAdvice).profile.treeId,11371);
 assert.equal(specializationSelection(g,{treeId:11370},hunterInfo.specializationAdvice).profile.treeId,11370);
 assert.equal(specializationSelection(g,{treeId:11372},hunterInfo.specializationAdvice).profile,null);
}
const warriorInfo=(await request({character:'qa-class-1'},{endpoint:orientationEndpoint})).body;
const warriorGuide=talentAssistantGuide(warriorInfo.profiles,{goal:'leveling',role:'damage'},warriorInfo.specializations);
assert.equal(specializationSelection(warriorGuide,{},warriorInfo.specializationAdvice).profile.planId,'warrior-arms-leveling');
assert.equal(specializationSelection(warriorGuide,{treeId:11657},warriorInfo.specializationAdvice).profile.planId,'warrior-fury-leveling');
const warriorDungeonGuide=talentAssistantGuide(warriorInfo.profiles,{goal:'dungeons',role:'damage'},warriorInfo.specializations);
assert.equal(specializationSelection(warriorDungeonGuide,{},warriorInfo.specializationAdvice).profile.planId,'warrior-arms-dungeons');
assert.equal(specializationSelection(warriorDungeonGuide,{treeId:11657},warriorInfo.specializationAdvice).profile.planId,'warrior-fury-dungeons');
const warlockInfo=(await request({character:'qa-class-9'},{endpoint:orientationEndpoint})).body;
const warlockDungeonGuide=talentAssistantGuide(warlockInfo.profiles,{goal:'dungeons'},warlockInfo.specializations);
assert.equal(specializationSelection(warlockDungeonGuide,{},warlockInfo.specializationAdvice).profile.planId,'warlock-destruction-dungeons');
assert.equal(specializationSelection(warlockDungeonGuide,{treeId:11629},warlockInfo.specializationAdvice).profile.planId,'warlock-affliction-dungeons');
const shamanInfo=(await request({character:'qa-class-7'},{endpoint:orientationEndpoint})).body;
const shamanGuide=talentAssistantGuide(shamanInfo.profiles,{goal:'leveling',role:'damage'},shamanInfo.specializations);
assert.equal(specializationSelection(shamanGuide,{},shamanInfo.specializationAdvice).profile.planId,'shaman-enhancement-leveling');
assert.equal(specializationSelection(shamanGuide,{treeId:11326},shamanInfo.specializationAdvice).profile.planId,'shaman-elemental-leveling');
const shamanDungeonGuide=talentAssistantGuide(shamanInfo.profiles,{goal:'dungeons',role:'damage'},shamanInfo.specializations);
assert.equal(specializationSelection(shamanDungeonGuide,{},shamanInfo.specializationAdvice).profile.planId,'shaman-enhancement-dungeons');
assert.equal(specializationSelection(shamanDungeonGuide,{treeId:11326},shamanInfo.specializationAdvice).profile.planId,'shaman-elemental-dungeons');
for(const id of ['shaman-enhancement-leveling','warlock-destruction-leveling','priest-shadow-leveling','priest-shadow-dungeons','warrior-protection-dungeons','warlock-destruction-dungeons','warrior-arms-leveling','warrior-fury-leveling','mage-arcane-pvp','mage-fire-pvp','priest-shadow-pvp','warlock-destruction-pvp','warrior-protection-leveling','warrior-protection-pvp','warrior-arms-dungeons','warrior-fury-dungeons','warrior-fury-pvp','warlock-affliction-dungeons','warrior-arms-pvp','rogue-combat-dungeons','rogue-combat-leveling','rogue-combat-pvp','rogue-assassination-leveling','rogue-assassination-dungeons','rogue-assassination-pvp','priest-discipline-leveling','priest-discipline-dungeons','priest-discipline-pvp','priest-holy-leveling','priest-holy-dungeons','priest-holy-pvp','paladin-holy-leveling','paladin-holy-dungeons','paladin-holy-pvp','paladin-protection-pvp','paladin-retribution-leveling','paladin-retribution-dungeons','paladin-retribution-pvp','mage-frost-leveling-mixed-balanced','mage-frost-dungeons','mage-frost-pvp']){
 const plan=talentPlanLibrary.find(p=>p.id===id),pack=release.rulePacks.find(p=>p.revision===plan.ruleRevision),proof=proofs.catalogs.find(c=>c.catalogRevision===pack.catalogRevision).proof,profile=plan.profiles[0];
 const q={...query,character:'qa-class-'+plan.classId,tree:String(plan.treeId),goal:profile.goal,role:profile.role,playStyle:profile.playStyle,priority:profile.priority};
 const overrides={roster:async()=>({data:{characters:allRoster}}),master:async()=>({...master,classes:{[plan.classId]:proof},classMechanicsRevisions:{[plan.classId]:pack.catalogRevision},sourceRevision:pack.sourceRevision}),observe:async()=>({...observation,clientBuild:pack.clientBuild,hotfixRevision:pack.hotfixRevision})};
 const result=(await request(q,{endpoint:handler(overrides)})).body;
 assert.equal(result.ok,true,id+': '+JSON.stringify(result));assert.equal(result.history.length,51);
 await blocked('unsupported_legacy_rank',{...q,rank:'1'},overrides);
}
console.log('Additional rank-zero plans and reviewed Shaman comparative choice: OK');

// End-to-end HTTP handler matrix (retained source, simulated current observation).
// Every research cell must deny before provider access; every approved cell
// must return precisely the reviewed chronological allocation.
const {readdirSync:readMatrixDir}=await import('node:fs');
const planFolder=new URL('../data/talent-planning/',import.meta.url);
const matrixPlans=readMatrixDir(planFolder).filter(f=>/-v\d+\.json$/.test(f)).map(f=>JSON.parse(readAssistantMatrix(new URL(f,planFolder),'utf8'))).filter(p=>p.active!==false&&p.status!=='retired');
const {profileKey:matrixProfileKey}=await import('./talent-plan-core.mjs');
const currentPack=release.rulePacks.find(p=>p.clientBuild==='1.60.1.71139');
const currentProofs=proofs.catalogs.filter(c=>c.sourceRevision===currentPack.sourceRevision);
const matrixMaster={...master,classes:Object.fromEntries(currentProofs.map(c=>[c.proof.classId,c.proof])),classMechanicsRevisions:Object.fromEntries(currentProofs.map(c=>[c.proof.classId,c.catalogRevision])),sourceRevision:currentPack.sourceRevision};
const matrixObservation={...observation,clientBuild:currentPack.clientBuild,hotfixRevision:currentPack.hotfixRevision};
let matrixReads=0,matrixMasterReads=0,matrixProjects=0,httpCalls=0,eligibleCells=0,deniedCells=0,cells=0,negative=0;
const config={roster:async()=>({data:{characters:allRoster}}),observe:async()=>{matrixReads++;return matrixObservation},master:async()=>{matrixMasterReads++;return matrixMaster},project:async v=>{matrixProjects++;return v}};
const endpoint=handler(config);
const available=talentPlanLibrary.filter(p=>p.active!==false&&p.status==='approved');
for(const [id,trees] of Object.entries(coverage.classes))for(const tree of trees)for(const role of tree.roles)for(const goal of coverage.goals){
 const classId=Number(id);
 const profiles=[...new Map(matrixPlans.flatMap(p=>p.profiles.filter(x=>x.classId===classId&&x.treeId===tree.treeId&&x.role===role&&x.goal===goal)).map(x=>[matrixProfileKey(x),x])).values()];
 assert.ok(profiles.length);
 for(let rank=0;rank<=5;rank++){
   let success=false;cells++;
   for(const profile of profiles){
     const expected=available.filter(p=>p.profiles.some(x=>matrixProfileKey(x)===matrixProfileKey(profile)));
     assert.ok(expected.length<=1);
     const plan=expected[0],allowed=!!plan&&plan.supportedLegacyRanks.includes(rank);
     const q={character:'qa-class-'+id,tree:String(tree.treeId),goal,role,playStyle:profile.playStyle,priority:profile.priority,rank:String(rank),rankSource:'player_confirmed'};
     const before=[matrixReads,matrixMasterReads,matrixProjects];
     const res=await request(q,{endpoint});httpCalls++;
     if(allowed){
       success=true;assert.equal(res.code,200);assert.equal(res.body.ok,true);
       assert.equal(res.body.planId,plan.id);assert.equal(res.body.version,plan.version);
       assert.deepEqual(res.body.history.map(({talentId,rank})=>({talentId,rank})),plan.points);
       assert.deepEqual([matrixReads,matrixMasterReads,matrixProjects],before.map(x=>x+1));
       const variants=[
        ['unverified_current_rules',{observe:async()=>({...matrixObservation,clientBuild:'1.60.1.99999'})}],
        ['unverified_current_rules',{observe:async()=>({...matrixObservation,hotfixRevision:'f'.repeat(64)})}],
        ['unverified_current_catalog',{master:async()=>({...matrixMaster,stale:true})}],
        ['unverified_current_rules',{master:async()=>({...matrixMaster,sourceRevision:'f'.repeat(64)})}],
        ['unverified_current_rules',{observe:async()=>({...matrixObservation,checkedAt:'2020-01-01T00:00:00Z',revisionSince:'2020-01-01T00:00:00Z'})}]
       ];
       for(const [code,overrides] of variants){
         const result=await request(q,{endpoint:handler({...config,...overrides,project:async()=>{throw Error('Denied request must not project')}})});
         assert.equal(result.body.ok,false);assert.equal(result.body.code,code,plan.id+' '+code);assert.ok(!Object.hasOwn(result.body,'history'));negative++;
       }
       const denied=await request(q,{endpoint:handler({...config,enabled:()=>false})});
       assert.equal(denied.code,404);assert.ok(!Object.hasOwn(denied.body,'history'));negative++;
     }else{
       assert.equal(res.code,409);
       assert.equal(res.body.code,plan?'unsupported_legacy_rank':'no_approved_recommendation');
       assert.ok(!Object.hasOwn(res.body,'history'));
       assert.deepEqual([matrixReads,matrixMasterReads,matrixProjects],before,'Rejected profile touched data sources');
     }
   }
   if(success)eligibleCells++;else deniedCells++;
 }
}
assert.equal(cells,504);assert.equal(eligibleCells+deniedCells,cells);
console.log('DALTON_HTTP_MATRIX '+JSON.stringify({cells,eligibleCells,deniedCells,httpCalls,negativeTests:negative,liveServices:false}));
