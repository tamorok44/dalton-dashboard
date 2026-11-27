import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
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
export function summarizeRestoreInventory(bundle){
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
export function verifyRestoreInventory(bundle,independent){
  const actual=summarizeRestoreInventory(bundle);
  assert.ok(independent,'Unabhängige Export-Inventur erforderlich');
  const expected={rosterSha256:independent.rosterSha256,addons:sortedUnique(independent.addons,'slug'),
    knowledge:sortedUnique(independent.knowledge,'key'),days:sortedUnique(independent.days,'date'),quarantine:sortedUnique(independent.quarantine,'field')};
  assert.deepEqual(actual,expected,'Export-Inventur: Inventurdifferenz');
  return actual;
}
