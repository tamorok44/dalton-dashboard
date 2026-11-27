import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const candidate='c064aacffe33e2533a6eb96b475010489bdbe50a';
const writerGroups=['vercel-urls','scheduled-and-queued','manual-and-external','read-side-mutations'];
const credentialGroups=['upstash-rest','upstash-tcp','vercel-blob'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function digest(value){
  assert.match(value,/^[0-9a-f]{64}$/,'Ungültiger Nachweis-Hash');
  return value;
}
function timestamp(value){
  assert.match(value,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,'Zeitstempel muss UTC sein');
  const parsed=Date.parse(value);
  assert.ok(Number.isFinite(parsed),'Ungültiger Zeitstempel');
  return parsed;
}
function checkCoverage(groups,names){
  assert.deepEqual(groups.map(group=>group.name).sort(),[...names].sort(),'Unvollständige Abdeckung der Schreiber');
  for(const group of groups){
    assert.ok(Number.isInteger(group.inventoriedCount)&&group.inventoriedCount>=0);
    assert.equal(group.deniedOrDisabledCount,group.inventoriedCount,'Offene Schreibmöglichkeit');
    digest(group.inventoryEvidenceSha256);
    digest(group.denialEvidenceSha256);
  }
}
export function checkFreeze(evidence){
  assert.equal(evidence.commit,candidate,'Falscher Kandidat');
  digest(evidence.sourceIdSha256);
  checkCoverage(evidence.writerGroups,writerGroups);
  checkCoverage(evidence.credentialGroups,credentialGroups);
  assert.ok(evidence.credentialGroups.find(group=>group.name==='upstash-rest').inventoriedCount>0,'Upstash-REST fehlt');
  const blocked=timestamp(evidence.entrypointsBlockedAt);
  const revoked=timestamp(evidence.revocationEffectiveAt);
  const drained=timestamp(evidence.inFlightDrainedAt);
  assert.ok(blocked<=revoked&&revoked<=drained,'Ungültige Reihenfolge der Stilllegung');
  assert.ok(Number.isInteger(evidence.maxInFlightSeconds)&&evidence.maxInFlightSeconds>=60,'Unzureichende Wartezeit');
  assert.ok(drained-revoked>=evidence.maxInFlightSeconds*1000,'Drain-Zeit unterschritten');
  const [first,second]=evidence.quietSamples;
  assert.equal(evidence.quietSamples.length,2);
  assert.ok(timestamp(first.at)>=drained,'Erste Inventurprobe liegt vor Stilllegung');
  assert.ok(timestamp(second.at)-timestamp(first.at)>=evidence.maxInFlightSeconds*1000,'Ruhefenster zu kurz');
  assert.equal(digest(first.sourceFingerprintSha256),digest(second.sourceFingerprintSha256),'Quelle hat sich verändert');
  assert.equal(evidence.unexpectedSuccessfulWrites,0,'Schreibverkehr bleibt aktiv');
  for(const field of ['providerLogsSha256','positiveReadControlSha256','inFlightEvidenceSha256'])digest(evidence[field]);
  return second.at;
}
export function bindExport(evidence,exportBytes,inventoryBytes){
  const quietEnd=timestamp(checkFreeze(evidence));
  const packet=evidence.authoritativeExport;
  assert.ok(timestamp(packet.startedAt)>=quietEnd,'Export vor belegter Stilllegung');
  assert.ok(timestamp(packet.verifiedAt)>=timestamp(packet.startedAt),'Inventur vor Export');
  assert.equal(packet.exportSha256,sha(exportBytes),'Export-Digest weicht ab');
  assert.equal(packet.inventorySha256,sha(inventoryBytes),'Inventur-Digest weicht ab');
  const first=digest(evidence.quietSamples[0].sourceFingerprintSha256);
  assert.equal(digest(packet.fingerprintSha256),first,'Export weicht von eingefrorener Quelle ab');
  assert.equal(packet.unresolvedTypeOrIndexDiscrepancies,0,'Physische Inventurdifferenzen offen');
}
export function requireLegacyGate(projection){
  assert.equal(projection?.manifest?.inventoryVerified,true,'Inventurprüfung fehlt');
  assert.equal(projection.manifest.completeForLegacyReaders,true,'Historische Leser durch Rollback-Sperre blockiert');
  assert.equal(digest(projection.manifest.sha256),sha(JSON.stringify(projection.commands)),'Projektionsbefehle passen nicht zum Manifest');
}

function selfTest(){
  const date='2026-11-27T12:';
  const proof=sha('synthetic-evidence');
  const groups=names=>names.map(name=>({name,inventoriedCount:1,deniedOrDisabledCount:1,
    inventoryEvidenceSha256:proof,denialEvidenceSha256:proof}));
  const exportBytes=Buffer.from('synthetic export'),inventoryBytes=Buffer.from('synthetic inventory');
  const evidence={commit:candidate,sourceIdSha256:proof,writerGroups:groups(writerGroups),credentialGroups:groups(credentialGroups),
    entrypointsBlockedAt:date+'00:00Z',revocationEffectiveAt:date+'01:00Z',inFlightDrainedAt:date+'02:00Z',maxInFlightSeconds:60,
    quietSamples:[{at:date+'02:01Z',sourceFingerprintSha256:proof},{at:date+'03:01Z',sourceFingerprintSha256:proof}],
    unexpectedSuccessfulWrites:0,providerLogsSha256:proof,positiveReadControlSha256:proof,inFlightEvidenceSha256:proof,
    authoritativeExport:{startedAt:date+'03:02Z',verifiedAt:date+'04:00Z',exportSha256:sha(exportBytes),inventorySha256:sha(inventoryBytes),
      fingerprintSha256:proof,unresolvedTypeOrIndexDiscrepancies:0}};
  assert.equal(checkFreeze(evidence),date+'03:01Z');
  bindExport(evidence,exportBytes,inventoryBytes);
  assert.throws(()=>checkFreeze({...evidence,writerGroups:evidence.writerGroups.slice(1)}),/Unvollständige/);
  const oneLive=structuredClone(evidence);
  oneLive.credentialGroups[0].deniedOrDisabledCount=0;
  assert.throws(()=>checkFreeze(oneLive),/Offene Schreibmöglichkeit/);
  assert.throws(()=>checkFreeze({...evidence,inFlightDrainedAt:date+'01:59Z'}),/Drain-Zeit/);
  assert.throws(()=>checkFreeze({...evidence,unexpectedSuccessfulWrites:1}),/Schreibverkehr/);
  const stale=structuredClone(evidence);
  stale.quietSamples[1].sourceFingerprintSha256=sha('changed');
  assert.throws(()=>checkFreeze(stale),/verändert/);
  const premature=structuredClone(evidence);
  premature.authoritativeExport.startedAt=date+'02:59Z';
  assert.throws(()=>bindExport(premature,exportBytes,inventoryBytes),/vor belegter Stilllegung/);
  assert.throws(()=>bindExport(evidence,Buffer.from('other export'),inventoryBytes),/Export-Digest/);
  const projection={commands:[],manifest:{inventoryVerified:true,completeForLegacyReaders:true,sha256:sha('[]')}};
  requireLegacyGate(projection);
  assert.throws(()=>requireLegacyGate({...projection,manifest:{...projection.manifest,completeForLegacyReaders:false}}),/Rollback-Sperre/);
  assert.throws(()=>requireLegacyGate({...projection,commands:[['SET','fixture','wrong']]}),/Projektionsbefehle/);
  return {freezeEvidenceGuard:true,authoritativeExportGate:true,legacyActivationGate:true,providerContacted:false};
}
async function main(){
  const [mode,evidencePath,exportPath,inventoryPath,treePath]=process.argv.slice(2);
  if(mode==='--self-test')return selfTest();
  assert.ok(['freeze','restore','legacy-reader'].includes(mode));
  const evidence=JSON.parse(readFileSync(evidencePath));
  const quietEnd=checkFreeze(evidence);
  if(mode==='freeze')return {freezeEvidenceConsistent:true,quietEnd};
  const exportBytes=readFileSync(exportPath),inventoryBytes=readFileSync(inventoryPath);
  bindExport(evidence,exportBytes,inventoryBytes);
  const tree=resolve(treePath);
  assert.equal(execFileSync('git',['-C',tree,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),candidate);
  execFileSync('git',['-C',tree,'diff','--quiet','HEAD','--','scripts']);
  const {buildLegacyReadProjection}=await import(pathToFileURL(join(tree,'scripts/storage-rollback-projection.mjs')).href);
  const projection=buildLegacyReadProjection({...JSON.parse(exportBytes),inventory:JSON.parse(inventoryBytes)});
  if(mode==='legacy-reader')requireLegacyGate(projection);
  return {freezeEvidenceConsistent:true,inventoryVerified:projection.manifest.inventoryVerified,
    completeForLegacyReaders:projection.manifest.completeForLegacyReaders,projectionSha256:projection.manifest.sha256};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{process.stdout.write(JSON.stringify(await main())+'\n');}
  catch{process.stderr.write('Freigabesperre. Stilllegungsnachweise, Export, Inventur und Kompatibilität prüfen.\n');process.exitCode=1;}
}
