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
function summarize(bundle){
  assert.ok(bundle.roster&&Array.isArray(bundle.roster.characters));
  return {
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
    rosterSha256:independent.rosterSha256,
    addons:sortedUnique(independent.addons,'slug'),
    knowledge:sortedUnique(independent.knowledge,'key'),
    days:sortedUnique(independent.days,'date'),
    quarantine:sortedUnique(independent.quarantine,'field')
  };
  assert.deepEqual(actual,expected,'Inventurdifferenz');
  return {roster:bundle.roster.characters.length,addons:actual.addons.length,knowledge:actual.knowledge.length,
    days:actual.days.length,quarantine:actual.quarantine.length,verified:true};
}
function selfTest(){
  const bundle={roster:{characters:[{slug:'audit-fixture'}]},addonStates:[],
    dailyRows:[],quarantineRecords:[{field:'fixture-q',raw:'{"synthetic":true}'}],
    knowledgePairs:[{key:'fixture-key',legacy:'{"value":1}',modern:'{ "value":2 }'}]};
  const independent={
    rosterSha256:objectDigest({characters:[{slug:'audit-fixture'}]}),addons:[],days:[],
    quarantine:[{field:'fixture-q',sha256:sha256('{"synthetic":true}')}],
    knowledge:[{key:'fixture-key',legacySha256:sha256('{"value":1}'),modernSha256:sha256('{ "value":2 }')}]
  };
  assert.equal(verify(bundle,independent).verified,true);
  assert.throws(()=>verify({...bundle,knowledgePairs:[{key:'fixture-key',modern:'{ "value":2 }',legacy:null}]},independent),/Inventurdifferenz/);
  assert.throws(()=>verify({...bundle,quarantineRecords:[]},independent),/Inventurdifferenz/);
  assert.throws(()=>verify({...bundle,knowledgePairs:[{key:'fixture-key',modern:'{ "value":2 }'}]},independent),/Beide Seiten/);
  process.stdout.write(JSON.stringify({inventorySelfTest:true,missingPairSideDetected:true,missingQuarantineDetected:true})+'\n');
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
