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
  'Modules/Interactions.lua',
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
assert.ok(toc.includes('## Version: 0.1.0-alpha.6'));
assert.ok(toc.includes('## SavedVariables: DaltonDashboardDB'));
assert.ok(toc.includes('## SavedVariablesPerCharacter: DaltonDashboardCharDB'));

for(const file of required.filter(file=>file.endsWith('.lua'))){
  assert.ok(toc.includes(file),'TOC lädt Datei nicht: '+file);
}

const bundle=required.map(file=>readFileSync(root+'/'+file,'utf8')).join('\n');
assert.ok(!bundle.includes('PRIVATE_TOKEN_HERE'),'Privater Platzhalter darf nicht im Addon liegen');
assert.ok(!bundle.includes('DALTON_DASHBOARD_SYNC_TOKEN'),'Privater Sync-Schlüssel darf nicht im Addon liegen');
assert.ok(bundle.includes('C_SpellBook'));
assert.ok(bundle.includes('SPELLS_CHANGED'));
assert.ok(bundle.includes('GetSavedInstanceInfo'));
assert.ok(bundle.includes('GetInstanceLockTimeRemaining'));
assert.ok(bundle.includes('GetPlayerMapPosition'));
assert.ok(bundle.includes('MERCHANT_SHOW'));
assert.ok(bundle.includes('TRAINER_SHOW'));
assert.ok(bundle.includes('C_MerchantFrame.GetItemInfo'));
assert.ok(bundle.includes('GetMerchantItemInfo'),'Forever addon must support the verified Vanilla merchant API fallback');
assert.ok(bundle.includes('GetNumTrainerServices'));
assert.ok(bundle.includes('GetTrainerServiceSkillReq'));
assert.ok(bundle.includes('GetTrainerServiceAbilityReq'));
assert.ok(bundle.includes('locationHistory'));
assert.ok(bundle.includes('GetContainerItemInfo'));
assert.ok(bundle.includes('FetchPurchasedBankTabData'));
assert.ok(bundle.includes('C_Bank.CanViewBank'));
assert.ok(bundle.includes('BANK_TABS_CHANGED'));
assert.ok(bundle.includes('Enum.BagIndex'));
assert.ok(bundle.includes('GetPetHappiness'));
assert.ok(bundle.includes('GetPetTrainingPoints'));
assert.ok(bundle.includes('GetStabledPetList'));
assert.ok(bundle.includes('moneyCopper'));
assert.ok(bundle.includes('SCHEMA_VERSION = 1'));

for(const unsupported of [
  'LEARNED_SPELL_IN_TAB',
  'CRAFT_SHOW',
  'CRAFT_UPDATE',
  'PET_SPELL_POWER_UPDATE',
  'PLAYER_FACTION_UPDATE'
]){
  assert.ok(!bundle.includes(unsupported),'Nicht unterstütztes Forever-Event darf nicht zurückkehren: '+unsupported);
}

const inventory=readFileSync(root+'/Modules/Inventory.lua','utf8');
assert.ok(!inventory.includes('PLAYER_LOGOUT'),'Inventar darf beim Logout keinen gültigen Snapshot überschreiben');
assert.ok(inventory.includes('letzter gültiger Stand bleibt erhalten'),'Inventar muss bei unlesbaren Daten fail-closed bleiben');

assert.ok(!bundle.includes('https://dalton-dashboard-eight.vercel.app/api/addon-sync'),'WoW-Addon darf keinen Netzwerk-Endpunkt enthalten');

console.log('Dalton Dashboard Addon: Struktur, Forever-Events, Privacy-Grenze und Datendomänen: OK');
