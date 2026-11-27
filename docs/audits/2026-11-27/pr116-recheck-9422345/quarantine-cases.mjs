import assert from 'node:assert/strict';
import {join} from 'node:path';
import {reply,withRedis} from '../pr116-recheck-177b147/redis-fixture.mjs';
import {inventoryFor} from './inventory-fixture.mjs';

const build='1.60.1.71139';
const phaseVersion='__version:v2';
const qPrefix='__quarantine:v1:';
const prefix='dalton-dashboard:live-knowledge:v1:production:';

export async function runQuarantineCases({
  base,previous,head,reset,record,redis,commands,setBefore,setAfter,setUser,oldRoster,characters,status,
  dailyIndex,refreshLock,observationIndex,getStatus,call,previousAddon,payload,interactions,trainer,validNow,crash,expire,date
}){
  const load=(tree,file)=>import(join(tree,file));
  const live=await load(head,'scripts/live-knowledge-store.mjs');
  const olderLive=await load(previous,'scripts/live-knowledge-store.mjs');
  const {encodeCompactMaster}=await load(head,'scripts/compact-master-cache.mjs');
  const {buildLegacyReadProjection}=await load(head,'scripts/storage-rollback-projection.mjs');
  const {inspectKnowledgePair}=await load(head,'scripts/storage-reconciliation.mjs');
  const {acquireRefreshLock,releaseRefreshLock}=await load(head,'scripts/character-store.mjs');
  const {learningSourceEvidenceForIndex}=await load(head,'scripts/learning-source-evidence.mjs');
  const oldEvidence=await load(base,'scripts/learning-source-evidence.mjs');
  const read=key=>redis('HGET',observationIndex,key);
  const trainerKey=id=>prefix+'record:trainer:'+build+':id-'+id;
  const fields=()=>redis('HKEYS',observationIndex).filter(key=>key.startsWith(qPrefix)).sort();
  const allEvidence=()=>fields().map(field=>({field,raw:read(field),value:JSON.parse(read(field))}));
  const snapFor=(id,time,price)=>interactions(payload('direct-fixture',time),time,[trainer(id,time,price)]);
  const timeIso=(time=0)=>new Date((validNow+time)*1000).toISOString();
  const isObservation=cmd=>cmd[0]==='EVAL'&&cmd[3]===observationIndex;
  const buildView=()=>live.loadLiveKnowledge({build,kind:'trainer'});

  async function direct(module,request,slug='audit-one'){
    const token=await acquireRefreshLock();
    assert.ok(token);
    try{return await module.ingestAddonLiveKnowledge(request,{characterSlug:slug,lockToken:token});}
    finally{await releaseRefreshLock(token);}
  }
  async function seedConflict(id){
    const key=trainerKey(id);
    const a=await call(interactions(payload('modern-seed'),0,[trainer(id,0,11)]));
    const b=await call(interactions(payload('legacy-seed',0,[133],'Audit Two'),0,[trainer(id,0,22)]),previousAddon);
    assert.deepEqual([a.code,b.code],[200,200]);
    const modernRaw=read(key);
    const legacyRaw=redis('GET',key);
    assert.ok(modernRaw&&legacyRaw);
    assert.notEqual(modernRaw,legacyRaw);
    return {key,modernRaw,legacyRaw};
  }
  const repairRequest=(id,offset=5)=>interactions(payload('repair-core',offset,[133,143]),offset,[trainer(id,offset,44)]);

  reset();
  const source=await seedConflict(830);
  assert.equal((await buildView()).integrityIssues[0].preserved,true);
  assert.equal(fields().length,1);
  const readerEvidence=allEvidence()[0];
  assert.equal(readerEvidence.value.incoming,null);
  const result=await direct(live,snapFor(830,-1,3));
  assert.equal(result.quarantined,1);
  assert.equal(read(source.key),source.modernRaw);
  assert.equal(redis('GET',source.key),source.legacyRaw);
  const retained=allEvidence().find(row=>row.value.incoming);
  assert.equal(retained.value.modernRaw,source.modernRaw);
  assert.equal(retained.value.legacyRaw,source.legacyRaw);
  assert.equal(retained.value.incoming.entries[0].priceCopper,3);
  assert.equal((await direct(live,snapFor(830,-1,3))).quarantined,1);
  assert.equal(fields().length,2);
  const repair=await call(repairRequest(830));
  assert.equal(repair.code,200);
  assert.equal(repair.value.liveKnowledge.repaired,1);
  assert.equal(fields().length,3);
  assert.ok(allEvidence().every(q=>q.value.modernRaw===source.modernRaw&&q.value.legacyRaw===source.legacyRaw));
  const fresh=(await buildView())[0];
  assert.equal(fresh.latestSnapshot.entries[0].priceCopper,44);
  assert.equal((await call(repairRequest(830))).value.duplicate,true);
  assert.equal(fields().length,3);
  assert.equal(redis('GET',source.key),source.legacyRaw);
  const sameTimeLegacy=JSON.parse(source.legacyRaw);
  sameTimeLegacy.latestSnapshot.capturedAt=timeIso(5);
  sameTimeLegacy.lastObservedAt=timeIso(5);
  sameTimeLegacy.latestSnapshot.entries[0].priceCopper=55;
  sameTimeLegacy.observationIds=['legacy-modified-separately'];
  redis('SET',source.key,JSON.stringify(sameTimeLegacy));
  assert.equal((await buildView()).integrityIssues[0].reason,'conflicting_record');
  assert.equal((await direct(live,snapFor(830,6,66))).repaired,1);
  assert.equal((await buildView())[0].latestSnapshot.entries[0].priceCopper,66);
  assert.equal(fields().length,5);
  record('quarantine-raw-evidence-repeat-and-repair',{v1AndV2ExactStringsPreserved:true,oldIncomingQuarantined:true,
    exactReplayFieldCountUnchanged:true,newerRepairHttp:200,changedLegacyInvalidatesRepair:true,secondRepairPrice:66,
    quarantineFields:5,legacyStillPresent:true});

  for(const phase of ['addon-before-observation','addon-after-observation']){
    reset();
    const seeded=await seedConflict(831);
    const oldMark=read(phaseVersion);
    await crash(phase,repairRequest(831));
    const committed=phase==='addon-after-observation';
    assert.equal(fields().length,committed?1:0);
    assert.equal(read(seeded.key)===seeded.modernRaw,!committed);
    assert.equal(read(phaseVersion)===oldMark,!committed);
    assert.equal(redis('GET',seeded.key),seeded.legacyRaw);
    assert.equal(getStatus().pendingObservations,true);
    await expire(refreshLock);
    assert.equal((await call(repairRequest(831))).value.duplicate,true);
    assert.equal(fields().length,1);
    assert.equal((await buildView())[0].latestSnapshot.entries[0].priceCopper,44);
    record('quarantine-atomic-'+phase,{signal:'SIGKILL',recordQuarantineAndVersionCommittedTogether:committed,
      oneRetainedQuarantineAfterRetry:true});
  }

  reset();
  const denied=await seedConflict(832);
  let marker=read(phaseVersion);
  redis('ACL','SETUSER','audit-deny-quarantine','on','>audit-fixture-only','~*','+@all','-hset');
  try{
    setUser('audit-deny-quarantine');
    assert.equal((await call(repairRequest(832))).code,503);
    assert.equal(fields().length,0);
    assert.equal(read(denied.key),denied.modernRaw);
    assert.equal(read(phaseVersion),marker);
  }finally{setUser(null);redis('ACL','DELUSER','audit-deny-quarantine');}
  setBefore(async cmd=>{
    if(!isObservation(cmd))return;
    redis('SET',refreshLock,'audit-successor','EX',120);
  });
  const lost=await call(repairRequest(832));
  assert.equal(lost.code,503);
  assert.match(lost.value.error,/REFRESH_LOCK_LOST/);
  assert.equal(fields().length,0);
  assert.equal(read(denied.key),denied.modernRaw);
  assert.equal(read(phaseVersion),marker);
  assert.equal(redis('GET',refreshLock),'audit-successor');
  redis('DEL',refreshLock);
  setBefore(async()=>{});
  assert.equal((await call(repairRequest(832))).code,200);
  assert.equal(fields().length,1);
  record('quarantine-denied-hset-and-lock-loss',{failedHsetAndStaleOwnerChangedNothing:true,outboxLaterRecovered:true});

  reset();
  const overwritten=await seedConflict(833);
  const excluded=await buildView();
  assert.equal(excluded.integrityIssues[0].preserved,true);
  assert.equal(fields().length,1);
  assert.equal((await direct(olderLive,snapFor(833,5,55),'audit-two')).stored,1);
  assert.equal((await buildView())[0].latestSnapshot.entries[0].priceCopper,55);
  assert.equal(fields().length,1);
  assert.equal(allEvidence()[0].value.legacyRaw,overwritten.legacyRaw);
  assert.notEqual(redis('GET',overwritten.key),overwritten.legacyRaw);
  record('read-only-exclusion-does-not-retain-overwritten-legacy',{firstPairExcluded:true,rawLegacyOverwrittenByOldWriter:true,
    originalStillInQuarantine:true,currentRecoveredFromLaterLegacy:true});

  reset();
  await direct(live,snapFor(834,0,11));
  const futureBroken={kind:'trainer',build,npc:{id:834,name:'Modelltrainer'},observationIds:'wrong-fixture-type',
    latestSnapshot:{capturedAt:timeIso(15),entries:[]},lastObservedAt:timeIso(15)};
  const brokenKey=trainerKey(834);
  redis('SET',brokenKey,JSON.stringify(futureBroken));
  redis('SADD',prefix+'index',brokenKey);
  assert.equal(inspectKnowledgePair(read(brokenKey),redis('GET',brokenKey),brokenKey).latestTime,Date.parse(timeIso(15)));
  const olderRepair=await direct(live,snapFor(834,5,44));
  assert.equal(olderRepair.quarantined,1);
  assert.equal(JSON.parse(read(brokenKey)).latestSnapshot.capturedAt,timeIso());
  assert.equal(allEvidence()[0].value.legacyRaw,JSON.stringify(futureBroken));
  assert.equal((await direct(live,snapFor(834,16,45))).repaired,1);
  assert.equal((await buildView())[0].latestSnapshot.capturedAt,timeIso(16));
  record('quarantine-repair-ignores-readable-time-in-damaged-record',{olderRepairRejected:true,
    incomingOffsetSeconds:5,damagedRecordRetainedOffsetSeconds:15,laterRepairOffsetSeconds:16,oldBytesPreserved:true});

  reset();
  const growth=await seedConflict(835);
  for(let index=0;index<8;index++)assert.equal((await direct(live,snapFor(835,-2,100+index))).quarantined,1);
  assert.equal((await direct(live,snapFor(835,-2,100))).quarantined,1);
  assert.equal(fields().length,8);
  assert.equal(redis('TTL',observationIndex),-1);
  assert.ok(allEvidence().every(q=>q.value.modernRaw===growth.modernRaw&&q.value.legacyRaw===growth.legacyRaw));
  const streamedBytes=allEvidence().reduce((n,q)=>n+Buffer.byteLength(q.raw),0);
  commands.length=0;
  await buildView();
  assert.ok(commands.some(cmd=>cmd.type==='HKEYS'&&cmd.key===observationIndex));
  record('quarantine-growth-and-scan-cost',{distinctIncomingEvents:8,quarantineFields:8,exactReplayAdded:0,
    storedEvidenceJsonBytes:streamedBytes,quarantineIncludedInHkeys:fields().length,hashTtl:redis('TTL',observationIndex)});

  reset();
  const current=await seedConflict(836);
  redis('SREM',prefix+'index',current.key);
  const missed=await buildView();
  assert.equal(missed.length,0);
  assert.equal(missed.integrityIssues[0].reason,'conflicting_record');
  assert.equal(missed.integrityIssues[0].preserved,true);
  assert.equal(inspectKnowledgePair(read(current.key),redis('GET',current.key),current.key).reason,'conflicting_record');
  record('orphan-legacy-record-is-invisible-to-reconciliation-reader',{legacyValueExistsWithoutIndex:true,
    knownModernKeyFindsLegacyCounterpart:true,conflictingPriceExcluded:true});

  reset();
  await direct(live,snapFor(839,0,11));
  const wrongKey=trainerKey(839);
  const wrongRecord=JSON.parse(read(wrongKey));
  wrongRecord.npc.id=899;wrongRecord.latestSnapshot.npc.id=899;
  redis('HSET',observationIndex,wrongKey,JSON.stringify(wrongRecord));
  const wrongIdentity=await buildView();
  assert.equal(wrongIdentity.length,0);
  assert.equal(wrongIdentity.integrityIssues[0].reason,'invalid_record');
  assert.equal(allEvidence()[0].value.modernRaw,JSON.stringify(wrongRecord));
  record('observation-record-identity-not-bound-to-key',{keyNpcId:839,recordNpcId:899,
    structurallyValidWrongIdentityExcluded:true,rawEvidenceRetained:true});
  reset();
  const faulty=await seedConflict(837);
  assert.equal((await direct(live,snapFor(837,-1,90))).quarantined,1);
  const qRows=allEvidence().map(({field,raw})=>({field,raw}));
  const state=getStatus();
  const rawInputs={roster:oldRoster,addonStates:[state,JSON.parse(redis('GET',status('audit-two')))],
    knowledgePairs:[{key:faulty.key,modern:faulty.modernRaw,legacy:faulty.legacyRaw}],
    dailyRows:[{date,archiveStatus:'disabled'}],date,quarantineRecords:qRows};
  rawInputs.inventory=inventoryFor(rawInputs);
  assert.throws(()=>buildLegacyReadProjection({...rawInputs,quarantineRecords:[]}),/Inventurdifferenz/);
  assert.throws(()=>buildLegacyReadProjection({...rawInputs,addonStates:[state]}),/Inventurdifferenz/);
  assert.throws(()=>buildLegacyReadProjection({...rawInputs,dailyRows:[]}),/Inventurdifferenz/);
  const quarantinedProjection=buildLegacyReadProjection(rawInputs);
  assert.equal(quarantinedProjection.manifest.completeForLegacyReaders,false);
  assert.throws(()=>buildLegacyReadProjection({...rawInputs,knowledgePairs:[{key:faulty.key,modern:faulty.modernRaw}]}),/Beide Seiten/);
  assert.throws(()=>buildLegacyReadProjection({...rawInputs,knowledgePairs:[{key:faulty.key,modern:faulty.modernRaw,legacy:null}]}),/Inventurdifferenz/);
  assert.throws(()=>buildLegacyReadProjection({...rawInputs,knowledgePairs:[{key:faulty.key,modern:faulty.modernRaw,legacy:faulty.legacyRaw+' '}]}),/Inventurdifferenz/);
  const originalSource=[read(faulty.key),redis('GET',faulty.key),read(qRows[0].field)];
  await withRedis(async ({exec:target,restart})=>{
    for(const command of quarantinedProjection.commands)target(...command);
    assert.equal(target('HGET',observationIndex,qRows[0].field),qRows[0].raw);
    assert.equal(target('GET',faulty.key),null);
    const oldAddonProjection=JSON.parse(target('GET',status()));
    const oldRawRecipe={build,recipes:[{id:668550,professionSlug:'cooking',name:'Prüfzauber',
      craftedItem:{id:668551,name:'Modellprodukt'},learning:{sources:[]}}]};
    const residual=oldEvidence.learningSourceEvidenceForIndex(oldRawRecipe,[oldAddonProjection],[]);
    assert.ok(residual.observations.some(row=>row.npcId===837&&row.priceCopper===11));
    const generatedField=qPrefix+quarantinedProjection.manifest.quarantined[0].digest;
    const saved=JSON.parse(target('HGET',observationIndex,generatedField));
    assert.equal(saved.modernRaw,faulty.modernRaw);
    assert.equal(saved.legacyRaw,faulty.legacyRaw);
    assert.equal(target('SAVE'),'OK');
    await restart();
    assert.equal(target('HGET',observationIndex,qRows[0].field),qRows[0].raw);
  });
  assert.deepEqual([read(faulty.key),redis('GET',faulty.key),read(qRows[0].field)],originalSource);
  record('projection-independent-inventory-and-quarantine',{missingWholeKeysRejected:true,
    exactRawAndQuarantinePreservedAcrossRestore:true,conflictedProjectionIncompleteForOldReaders:true,
    omittingOrManipulatingKnownPairSideRejected:true,
    actualOldLearningReaderCanUseConflictingRawAddonPrice:true});

  reset();
  const zone='Pruefgebiet';
  const vendorId=840;
  const resourceId=668001;
  const goodPrice=2345,rawPrice=31003;
  const vendor={id:vendorId,name:'Audit Haendler',type:'vendor',evidence:'forever-confirmed',seenInForever:true,
    location:{zone,x:0.5,y:0.5},priceCopper:goodPrice,priceSource:'forever-observed',side:'neutral'};
  const item={id:resourceId,name:'Audit Gegenstand',quality:'COMMON'};
  const recipe={id:668002,professionSlug:'cooking',name:'Audit Gegenstand',requiredSkill:25,
    craftedItem:item,reagents:[],learning:{sources:[vendor]}};
  const index={build,complete:true,recipes:[recipe],professions:[{slug:'cooking',name:'Kochkunst',id:185}],
    generatedAt:timeIso()};
  redis('SET','dalton-dashboard:workshop:foreverdb:master:v2:gz1',encodeCompactMaster(index));
  redis('SET',characters,JSON.stringify({...oldRoster,characters:oldRoster.characters.map(ch=>({...ch,faction:'Allianz',
    professionDetailsVerified:true,professions:[{id:185,name:'Kochkunst',current:75,max:150,knownRecipes:[{id:668004,name:'Audit Folgerezept',
      craftedItem:{id:668005,name:'Audit Folgeprodukt'},reagents:[{...item,quantity:1}]}]}]}))}));
  const merchant={complete:true,capturedAt:validNow,npc:{id:vendorId,name:vendor.name},location:vendor.location,
    items:[{itemID:668003,name:'Rezept: Audit Gegenstand',priceCopper:rawPrice}]};
  const sync=payload('planner-evidence');
  sync.sections.interactions={capturedAt:validNow,merchantHistory:[merchant]};
  assert.equal((await call(sync)).code,200);
  const merchantKey=prefix+'record:merchant:'+build+':id-'+vendorId+':observer:audit-one';
  const rawRecord=JSON.parse(read(merchantKey));
  const variant=structuredClone(rawRecord);
  variant.latestSnapshot.entries[0].priceCopper=31009;
  variant.observationIds=['isolated-other-price'];
  const stateForEvidence=getStatus();
  const noConflictEvidence=learningSourceEvidenceForIndex(index,[stateForEvidence],await live.loadLiveKnowledge({build}));
  assert.ok(noConflictEvidence.observations.some(row=>row.priceCopper===rawPrice));
  redis('SET',merchantKey,JSON.stringify(variant));
  redis('SADD',prefix+'index',merchantKey);
  const candidates=await live.loadLiveKnowledge({build});
  assert.equal(candidates.integrityIssues.length,1);
  const filtered=learningSourceEvidenceForIndex(index,[stateForEvidence],candidates);
  assert.equal(filtered.observations.some(row=>row.priceCopper===rawPrice),false);
  assert.equal(oldEvidence.learningSourceEvidenceForIndex(index,[stateForEvidence],[]).observations.some(row=>row.priceCopper===rawPrice),true);

  const apis=await Promise.all(['workshop','location-planner','profession-planner'].map(name=>load(head,'api/'+name+'.js')));
  const params=[
    '/api/workshop?item='+resourceId,
    '/api/location-planner?character=audit-one&location='+zone,
    '/api/profession-planner?character=audit-one&location='+zone
  ];
  const invoke=async()=>{
    const reports=[];
    for(const [i,module] of apis.entries()){
      const response=reply();
      await module.default({method:'GET',url:params[i],headers:{}},response);
      assert.equal(response.code,200,params[i]);
      reports.push(response.value);
    }
    return reports;
  };
  const planners=await invoke();
  const rows=[
    planners[0].learningSources.filter(source=>source.id===vendorId),
    planners[1].actions.filter(action=>action.id===recipe.id).map(action=>action.source),
    planners[2].recipes.filter(row=>row.id===recipe.id).map(row=>row.source)
  ];
  assert.deepEqual(rows.map(list=>list.map(row=>row.priceCopper)),[[goodPrice],[goodPrice],[goodPrice]]);
  assert.ok(planners.every(report=>!JSON.stringify(report).includes('"priceCopper":'+rawPrice)));
  record('planner-api-excludes-conflicting-raw-price',{actualApiRoutes:['workshop','location-planner','profession-planner'],
    callStatuses:[200,200,200],stableCatalogPrice:[goodPrice,goodPrice,goodPrice],knownRawConflictExcluded:true,
    oldRawLearningEvidenceCanStillReintroduceThePrice:true});

  const cachedBuild='1.60.1.71140';
  redis('DEL',merchantKey);
  redis('SREM',prefix+'index',merchantKey);
  const oldRecords=await live.loadHistoricalMerchantKnowledge(cachedBuild);
  assert.equal(oldRecords.length,1);
  const oldVersion=await live.loadLiveKnowledgeVersion();
  redis('SET',prefix+'merchant-conflict-history:v1:gz1',encodeCompactMaster({build:cachedBuild,version:oldVersion,records:oldRecords}));
  redis('SET',merchantKey,'damaged-stored-value');
  redis('SADD',prefix+'index',merchantKey);
  assert.equal((await live.loadLiveKnowledge({build})).integrityIssues.length,1);
  const staleCached=await live.loadHistoricalMerchantKnowledge(cachedBuild);
  assert.equal(staleCached.length,0);
  assert.equal(staleCached.integrityIssues[0].preserved,true);
  assert.equal(await live.loadLiveKnowledgeVersion(),oldVersion);
  record('historical-projection-cache-can-hide-new-integrity-issue',{priorCachePresent:true,
    rawChangedWithoutVersionMarker:true,historicalCacheBypassed:true,historicalReadExcludesCorruption:true});
}
