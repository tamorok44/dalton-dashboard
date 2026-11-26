import {readdirSync,appendFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const phases=[
  {
    "label": "01 – Stammdaten und Architektur",
    "files": [
      "scripts/test-architecture-contract.mjs",
      "scripts/test-game-catalog.mjs",
      "scripts/test-player-terminology.mjs",
      "scripts/test-game-language.mjs",
      "scripts/test-talent-trees.mjs",
      "scripts/test-talent-build-review.mjs"
    ]
  },
  {
    "label": "02 – Talentregeln und vollständige Bibliothek",
    "files": [
      "scripts/test-talent-plan-core.mjs",
      "scripts/test-talent-plan-library.mjs",
      "scripts/test-talent-matrix-stress.mjs"
    ]
  },
  {
    "label": "03 – Datenhaltung, API und Zugriffsschutz",
    "files": [
      "scripts/test-armory.mjs",
      "scripts/test-blizzard-api.mjs",
      "scripts/test-forever-details.mjs",
      "scripts/test-history.mjs",
      "scripts/test-data-version.mjs",
      "scripts/test-foreverdb-budget.mjs",
      "scripts/test-refresh-api.mjs",
      "scripts/test-talent-planner-preview.mjs"
    ]
  },
  {
    "label": "04 – Fachmodule und Medien",
    "files": [
      "scripts/test-pet-rules.mjs",
      "scripts/test-pet-localization.mjs",
      "scripts/test-quest-catalog.mjs",
      "scripts/test-reputation-catalog.mjs",
      "scripts/test-media-resolver.mjs",
      "scripts/test-learning-source-evidence.mjs",
      "scripts/test-workshop.mjs",
      "scripts/test-profession-planner.mjs",
      "scripts/test-class-training-store.mjs",
      "scripts/test-live-knowledge.mjs",
      "scripts/test-location-planner.mjs"
    ]
  },
  {
    "label": "05 – Add-on und Synchronisierung",
    "files": [
      "scripts/test-spellbook-sync.mjs",
      "scripts/test-addon-sync.mjs",
      "scripts/test-addon-structure.mjs"
    ]
  },
  {
    "label": "06 – Oberfläche und Layout",
    "files": [
      "scripts/test-ui.mjs",
      "scripts/test-layout-contract.mjs"
    ]
  }
];
const expected=readdirSync(new URL('./',import.meta.url)).filter(f=>/^test-.*\.mjs$/.test(f)).map(f=>'scripts/'+f).sort();
const assigned=phases.flatMap(p=>p.files);
assert.deepEqual([...assigned].sort(),expected,'Every test script must belong to exactly one ordered phase');
const syntax=new Set(["talent-planner.js","app.js","hunter-pets.js","reputation-data.js","api/refresh.js","api/data-version.js","api/characters.js","api/daily-snapshot.js","api/workshop.js","api/profession-planner.js","api/location-planner.js","api/spellbook-sync.js","api/addon-sync.js","api/addon-sync-status.js","api/addon-device-enroll.js","api/addon-device-promote.js","scripts/character-store.mjs","scripts/player-terminology.mjs","scripts/data-version.mjs","scripts/history-store.mjs","scripts/daily-snapshot-store.mjs","scripts/refresh-service.mjs","scripts/archive-images.mjs","scripts/armory-core.mjs","scripts/blizzard-api.mjs","scripts/forever-details.mjs","scripts/quest-catalog-store.mjs","scripts/game-catalog-store.mjs","scripts/media-registry.mjs","scripts/media-resolver.mjs","scripts/reputation-catalog-store.mjs","scripts/workshop-core.mjs","scripts/profession-planner.mjs","scripts/location-planner.mjs","scripts/learning-source-evidence.mjs","scripts/workshop-foreverdb.mjs","scripts/workshop-store.mjs","scripts/foreverdb-api.mjs","scripts/class-training-store.mjs","scripts/classic-npc-display-ids.mjs","scripts/spellbook-sync.mjs","scripts/savedvariables-parser.mjs","scripts/addon-sync.mjs","scripts/addon-sync-store.mjs","scripts/addon-device-auth.mjs","scripts/live-knowledge-store.mjs","scripts/dalton-sync-client.mjs","scripts/pet-rulebook.mjs","scripts/pet-rule-store.mjs","scripts/pet-localization-store.mjs"]);
for(const dir of ['scripts','api'])for(const f of readdirSync(new URL('../'+dir+'/',import.meta.url),{withFileTypes:true})){
  if(f.isFile()&&/\.(?:mjs|js)$/.test(f.name))syntax.add(dir+'/'+f.name);
}
const results=[];
function run(phase,args){
  const start=performance.now();
  console.log('\n['+phase+'] node '+args.join(' '));
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',timeout:90000,killSignal:'SIGKILL'});
  const entry={phase,test:args.join(' '),status:result.status===0&&!result.error?'passed':'failed',
    ms:Math.round(performance.now()-start),exitCode:result.status,signal:result.signal??null,error:result.error?.code??null};
  results.push(entry);
  console.log(entry.status.toUpperCase()+' ('+entry.ms+' ms)'+(entry.error?' '+entry.error:''));
}
for(const file of [...syntax].sort())run('00 – Syntax',['--check',file]);
run('00 – Generierter Freigabeindex',['scripts/build-talent-plan-index.mjs','--check']);
for(const phase of phases)for(const file of phase.files)run(phase.label,[file]);
const failed=results.filter(x=>x.status==='failed');
const report={schemaVersion:1,node:process.version,commit:process.env.GITHUB_SHA??null,passed:results.length-failed.length,failed:failed.length,results};
console.log('\nGesamttest: '+report.passed+'/'+results.length+' bestanden; '+failed.length+' fehlgeschlagen.');
if(failed.length)console.error('Fehler:\n'+failed.map(x=>x.phase+' | '+x.test+' | '+(x.error??x.signal??x.exitCode)).join('\n'));
if(process.env.DALTON_TEST_REPORT)writeFileSync(process.env.DALTON_TEST_REPORT,JSON.stringify(report,null,2)+'\n');
if(process.env.GITHUB_STEP_SUMMARY){
  const groups=[...new Set(results.map(x=>x.phase))];
  const rows=groups.map(g=>{const a=results.filter(x=>x.phase===g);return '| '+g+' | '+a.filter(x=>x.status==='passed').length+'/'+a.length+' | '+Math.round(a.reduce((n,x)=>n+x.ms,0)/1000)+' s |';});
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Dalton-Gesamttest ('+process.version+')\n\n| Phase | Bestanden | Dauer |\n|---|---:|---:|\n'+rows.join('\n')+'\n\n'+(failed.length?'Fehler: '+failed.map(x=>x.test).join(', '):'Alle Prüfungen bestanden.')+'\n');
}
if(failed.length)process.exitCode=1;
