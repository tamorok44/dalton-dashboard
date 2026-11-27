import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validQuarantineEvidence,repairMarkerMatches} from './storage-reconciliation.mjs';
const sha256=value=>createHash('sha256').update(value).digest('hex');
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const objectDigest=value=>sha256(JSON.stringify(canonical(value)));
function rawDigest(value){
  if(value===null)return null;
  assert.equal(typeof value,'string','Originalwert muss als Zeichenkette oder explizit als null vorliegen');
  return sha256(value);
}
function sortedUnique(rows,id){
  assert.ok(Array.isArray(rows),'Export-Inventur fehlt');
  const sorted=[...rows].sort((a,b)=>String(a[id]).localeCompare(String(b[id]),'en'));
  assert.ok(sorted.every(row=>typeof row[id]==='string'&&row[id]!==''),'Schlüssel fehlt');
  assert.equal(new Set(sorted.map(row=>row[id])).size,sorted.length,'Doppelter Schlüssel');
  return sorted.map(canonical);
}
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
function verifyReferences(bundle){
  const evidence=new Map();
  const prefix='dalton-dashboard:live-knowledge:v1:'+bundle.scope+':record:';
  for(const row of bundle.quarantineRecords){
    assert.ok(validQuarantineEvidence(row.field,row.raw),'Ungültiger Quarantänebeleg');
    assert.ok(JSON.parse(row.raw).key.startsWith(prefix),'Falscher Quarantäne-Scope');
    evidence.set(row.field,row.raw);
  }
  for(const row of bundle.knowledgePairs){
    assert.ok(row.key.startsWith(prefix),'Falscher Record-Scope');
    for(const raw of [row.modern,row.legacy]){
      let marker;
      try{marker=JSON.parse(raw)?.migrationRepair;}catch{continue;}
      if(marker)assert.ok(repairMarkerMatches(row.key,marker,evidence.get('__quarantine:v1:'+marker.quarantineDigest)),'Referenzierter Quarantänebeleg fehlt oder ist ungültig');
    }
  }
}
export function summarizeRestoreInventory(bundle){
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
export function verifyRestoreInventory(bundle,independent){
  const actual=summarizeRestoreInventory(bundle);
  assert.ok(independent,'Unabhängige Export-Inventur erforderlich');
  const expected={projectionInputs:independent.projectionInputs,rosterSha256:independent.rosterSha256,addons:sortedUnique(independent.addons,'slug'),
    knowledge:sortedUnique(independent.knowledge,'key'),days:sortedUnique(independent.days,'date'),quarantine:sortedUnique(independent.quarantine,'field')};
  assert.deepEqual(actual,expected,'Export-Inventur: Inventurdifferenz');
  verifyReferences(bundle);
  return actual;
}
