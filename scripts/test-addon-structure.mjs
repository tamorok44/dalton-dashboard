import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const root='addons/DaltonDashboard';
const required=[
  'DaltonDashboard.toc',
  'Core.lua',
  'DaltonDashboard.lua',
  'Modules/Character.lua',
  'Modules/Spellbook.lua',
  'Modules/Location.lua',
  'Modules/Instances.lua',
  'Modules/Inventory.lua',
  'Modules/HunterPet.lua',
  'README.md',
  'LICENSE'
];

for(const file of required){
  assert.ok(existsSync(root+'/'+file),'Addon-Datei fehlt: '+file);
}

const toc=readFileSync(root+'/DaltonDashboard.toc','utf8');
assert.ok(toc.includes('## Interface: 16001'));
assert.ok(toc.includes('## SavedVariables: DaltonDashboardDB'));
assert.ok(toc.includes('## SavedVariablesPerCharacter: DaltonDashboardCharDB'));

for(const file of required.filter(file=>file.endsWith('.lua'))){
  assert.ok(toc.includes(file),'TOC lädt Datei nicht: '+file);
}

const bundle=required.map(file=>readFileSync(root+'/'+file,'utf8')).join('\n');
assert.ok(!bundle.includes('PRIVATE_TOKEN_HERE'),'Privater Platzhalter darf nicht im Addon liegen');
assert.ok(!bundle.includes('DALTON_DASHBOARD_SYNC_TOKEN'),'Privater Sync-Schlüssel darf nicht im Addon liegen');
assert.ok(bundle.includes('C_SpellBook'));
assert.ok(bundle.includes('GetSavedInstanceInfo'));
assert.ok(bundle.includes('GetPlayerMapPosition'));
assert.ok(bundle.includes('GetContainerItemInfo'));
assert.ok(bundle.includes('GetPetHappiness'));
assert.ok(bundle.includes('GetStabledPetList'));
assert.ok(bundle.includes('moneyCopper'));
assert.ok(bundle.includes('SCHEMA_VERSION = 1'));

console.log('Dalton Dashboard Addon: Struktur, Privacy-Grenze und Datendomänen: OK');
