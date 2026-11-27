import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const sha256=value=>createHash('sha256').update(value).digest('hex');
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const objectDigest=value=>sha256(JSON.stringify(canonical(value)));
function rawDigest(value){
  if(value===null)return null;
  assert.equal(typeof value,'string','Originalwert muss als Zeichenkette oder explizit als null vorliegen');
  return sha256(value);
}
function sortedUnique(rows,id){
  assert.ok(Array.isArray(rows));
  const sorted=[...rows].sort((a,b)=>String(a[id]).localeCompare(String(b[id]),'en'));
  assert.ok(sorted.every(row=>typeof row[id]==='string'&&row[id]!==''),'Schlüssel fehlt');
  assert.equal(new Set(sorted.map(row=>row[id])).size,sorted.length,'Doppelter Schlüssel');
  return sorted.map(canonical);
}
const qPrefix='__quarantine:v1:';
function projectionInputs(bundle){
  assert.ok(['production','preview'].includes(bundle.scope),'Speicherbereich fehlt oder ist ungültig');
  assert.match(bundle.date,/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,'Projektionstag fehlt oder ist ungültig');
  for(const field of ['petMetadata','modernReceipt','legacyReceipt']){
    assert.ok(Object.hasOwn(bundle,field),'Projektionswerte müssen explizit erfasst sein');
    const value=bundle[field];
    assert.ok(value===null||(typeof value==='object'&&!Array.isArray(value)),'Ungültiger Projektionswert');
  }
  return {scope:bundle.scope,date:bundle.date,petMetadataSha256:objectDigest(bundle.petMetadata),
    modernReceiptSha256:objectDigest(bundle.modernReceipt),legacyReceiptSha256:objectDigest(bundle.legacyReceipt)};
}
function verifyQuarantineReferences(bundle){
  const evidenceByField=new Map();
  for(const row of bundle.quarantineRecords){
    const evidence=JSON.parse(row.raw);
    assert.ok(evidence?.schema===1&&typeof evidence.key==='string'&&
      evidence.key.startsWith('dalton-dashboard:live-knowledge:v1:'+bundle.scope+':record:')&&
      ['invalid_record','conflicting_record','invalid_storage_type','missing_repair_evidence','repair_evidence_unavailable'].includes(evidence.reason),'Ungültiger Quarantänebeleg');
    for(const side of ['modernRaw','legacyRaw']){
      assert.ok(Object.hasOwn(evidence,side));
      rawDigest(evidence[side]);
    }
    assert.ok(Object.hasOwn(evidence,'incoming'),'Unvollständiger Quarantänebeleg');
    assert.equal(row.field,qPrefix+objectDigest(evidence),'Quarantänefeld und Inhalt stimmen nicht überein');
    evidenceByField.set(row.field,evidence);
  }
  for(const row of bundle.knowledgePairs){
    for(const raw of [row.modern,row.legacy]){
      let marker;
      try{marker=JSON.parse(raw)?.migrationRepair;}catch{continue;}
      if(!marker)continue;
      const evidence=evidenceByField.get(qPrefix+marker.quarantineDigest);
      assert.ok(evidence,'Referenzierter Quarantänebeleg fehlt');
      assert.equal(evidence.key,row.key,'Quarantänebeleg gehört zu einem anderen Record');
      assert.equal(rawDigest(evidence.legacyRaw),marker.legacyDigest,'Quarantänebeleg passt nicht zum Legacy-Digest');
      assert.equal(evidence.incoming?.capturedAt,marker.resolvedAt,'Quarantänebeleg passt nicht zum Reparaturzeitpunkt');
      assert.ok(Number.isFinite(Date.parse(marker.resolvedAt)),'Ungültiger Reparaturzeitpunkt');
    }
  }
}
function summarize(bundle){
  assert.ok(bundle.roster&&Array.isArray(bundle.roster.characters));
  return {
    projectionInputs:projectionInputs(bundle),
    rosterSha256:objectDigest(bundle.roster),
    addons:sortedUnique(bundle.addonStates.map(row=>({slug:row.characterSlug,sha256:objectDigest(row)})),'slug'),
    knowledge:sortedUnique(bundle.knowledgePairs.map(row=>{
      assert.ok(Object.hasOwn(row,'modern')&&Object.hasOwn(row,'legacy'),'Beide Seiten müssen explizit erfasst sein');
      assert.ok(row.modern!==null||row.legacy!==null,'Paar ohne Original');
      return {key:row.key,modernSha256:rawDigest(row.modern),legacySha256:rawDigest(row.legacy)};
    }),'key'),
    days:sortedUnique(bundle.dailyRows.map(row=>({date:row.date,sha256:objectDigest(row)})),'date'),
    quarantine:sortedUnique(bundle.quarantineRecords.map(row=>({field:row.field,sha256:rawDigest(row.raw)})),'field')
  };
}
function verify(bundle,independent){
  const actual=summarize(bundle);
  const expected={
    projectionInputs:independent.projectionInputs,
    rosterSha256:independent.rosterSha256,
    addons:sortedUnique(independent.addons,'slug'),
    knowledge:sortedUnique(independent.knowledge,'key'),
    days:sortedUnique(independent.days,'date'),
    quarantine:sortedUnique(independent.quarantine,'field')
  };
  assert.deepEqual(actual,expected,'Inventurdifferenz');
  verifyQuarantineReferences(bundle);
  return {roster:bundle.roster.characters.length,addons:actual.addons.length,knowledge:actual.knowledge.length,
    days:actual.days.length,quarantine:actual.quarantine.length,verified:true};
}
function selfTest(){
  const key='dalton-dashboard:live-knowledge:v1:production:record:trainer:fixture:id-1';
  const legacy='{"value":1}', originalModern='{ "value":2 }';
  const evidence={schema:1,key,reason:'conflicting_record',legacyRaw:legacy,modernRaw:originalModern,
    incoming:{capturedAt:'2026-11-26T04:00:02Z'}};
  const digest=objectDigest(evidence);
  const modern=JSON.stringify({migrationRepair:{legacyDigest:sha256(legacy),quarantineDigest:digest,resolvedAt:evidence.incoming.capturedAt}});
  const q={field:qPrefix+digest,raw:JSON.stringify(evidence)};
  const pet={checkedAt:'2026-11-26T04:00:00Z'};
  const bundle={roster:{characters:[{slug:'audit-fixture'}]},addonStates:[],scope:'production',date:'2026-11-26',
    petMetadata:pet,modernReceipt:null,legacyReceipt:null,dailyRows:[],quarantineRecords:[q],knowledgePairs:[{key,legacy,modern}]};
  const independent={
    projectionInputs:{scope:'production',date:'2026-11-26',petMetadataSha256:objectDigest(pet),
      modernReceiptSha256:sha256('null'),legacyReceiptSha256:sha256('null')},
    rosterSha256:objectDigest({characters:[{slug:'audit-fixture'}]}),addons:[],days:[],
    quarantine:[{field:q.field,sha256:sha256(q.raw)}],
    knowledge:[{key,legacySha256:sha256(legacy),modernSha256:sha256(modern)}]
  };
  assert.equal(verify(bundle,independent).verified,true);
  assert.throws(()=>verify({...bundle,knowledgePairs:[{key,modern,legacy:null}]},independent),/Inventurdifferenz/);
  assert.throws(()=>verify({...bundle,quarantineRecords:[]},independent),/Inventurdifferenz/);
  assert.throws(()=>verify({...bundle,knowledgePairs:[{key,modern}]},independent),/Beide Seiten/);
  for(const patch of [{scope:'preview'},{date:'2026-11-25'},{petMetadata:null},{modernReceipt:{date:'2026-11-26'}},{legacyReceipt:{date:'2026-11-26'}}]){
    assert.throws(()=>verify({...bundle,...patch},independent),/Inventurdifferenz/);
  }
  assert.throws(()=>verify({...bundle,quarantineRecords:[]},{...independent,quarantine:[]}),/Referenzierter/);
  const wrongRaw=JSON.stringify({...evidence,legacyRaw:null});
  assert.throws(()=>verify({...bundle,quarantineRecords:[{field:q.field,raw:wrongRaw}]},
    {...independent,quarantine:[{field:q.field,sha256:sha256(wrongRaw)}]}),/feld und Inhalt/);
  process.stdout.write(JSON.stringify({inventorySelfTest:true,missingPairSideDetected:true,missingQuarantineDetected:true,
    metadataAndScopeBound:true,missingReferencedQuarantineDetected:true,nonmatchingQuarantineBytesDetected:true})+'\n');
}

const [bundlePath,inventoryPath]=process.argv.slice(2);
if(bundlePath==='--self-test')selfTest();
else{
  try{
    const bundle=JSON.parse(readFileSync(bundlePath,'utf8'));
    const independent=JSON.parse(readFileSync(inventoryPath,'utf8'));
    process.stdout.write(JSON.stringify(verify(bundle,independent))+'\n');
  }catch{
    process.stderr.write('Inventurprüfung fehlgeschlagen. Export und unabhängige Inventur müssen vollständig und übereinstimmend sein.\n');
    process.exitCode=1;
  }
}
