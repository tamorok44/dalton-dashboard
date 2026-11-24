import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const excludedDirs=new Set(['.git','node_modules','.vercel']);
function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory()){
      if(!excludedDirs.has(entry.name))out.push(...walk(path.join(dir,entry.name)));
      continue;
    }
    if(/\.(?:js|mjs)$/.test(entry.name)&&!/^test-/.test(entry.name))out.push(path.join(dir,entry.name));
  }
  return out;
}
const prodFiles=walk(root);
const rel=file=>path.relative(root,file).replaceAll('\\','/');
const sourceByFile=new Map(prodFiles.map(file=>[rel(file),fs.readFileSync(file,'utf8')]));

const policy=fs.readFileSync(path.join(root,'docs','architecture-contracts.md'),'utf8');
for(const required of ['Externe APIs zuerst klären','Sprache / WoW-Begriffe','Medien / Bilder','Dalton-CI','Interaktionskontrollen','Werkstatt-Masterkatalog','Ortsplaner','Datenfrische / Frontend-Synchronisierung','Betrieb / Persistenz','Merge-Gates']){
  assert.ok(policy.includes(required),'Architecture policy is missing required section: '+required);
}

// LANGUAGE CONTRACT
const forbiddenTranslationSymbols=[
  'foreverCategoryLabels',
  'translatedForeverCategory',
  'PROFESSION_NAMES',
  'PROFESSION_SLUG_BY_NAME'
];
for(const [file,source] of sourceByFile){
  for(const token of forbiddenTranslationSymbols){
    assert.ok(!source.includes(token),file+' must not define manual game-string translations: '+token);
  }
}
const manualProfessionTranslation=/(?:alchemy|blacksmithing|enchanting|engineering|leatherworking|tailoring|herbalism|mining|skinning|cooking|first-aid|fishing)\s*['"]?\s*:\s*['"][^'"]+['"]/i;
const manualCategoryTranslation=/(?:leather boots|leather bracers|leather chestguards|smelted bars|recovery potions|healing potions|armor kits|weapon oils)\s*['"]?\s*:\s*['"][^'"]+['"]/i;
for(const [file,source] of sourceByFile){
  assert.ok(!manualProfessionTranslation.test(source),file+' contains a manual profession translation table');
  assert.ok(!manualCategoryTranslation.test(source),file+' contains a manual recipe/category translation table');
}
assert.ok(!sourceByFile.get('app.js')?.includes('recipe.professionSlug'),'Frontend must never render an untranslated profession slug');
assert.ok(sourceByFile.has('scripts/player-terminology.mjs'),'Verified player terminology master is required');
const terminologySource=sourceByFile.get('scripts/player-terminology.mjs')||'';
assert.ok(terminologySource.includes("171:Object.freeze({name:'Alchemie'})"),'Official German player term for profession 171 must be Alchemie');
assert.ok(terminologySource.includes("1453:Object.freeze({name:'Stormwind'"),'German Forever client term for map 1453 must be Stormwind');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes('preferredForeverZoneName'),'Location planner zones must pass through verified stable-ID terminology');
assert.ok(terminologySource.includes('worldofwarcraft.blizzard.com/de-de/'),'Player terminology master must cite official German Blizzard sources');
assert.ok((sourceByFile.get('scripts/forever-details.mjs')||'').includes('preferredGermanGameName'),'Technical localized strings must pass through verified player terminology priority');
assert.ok((sourceByFile.get('scripts/character-store.mjs')||'').includes('normalizeVerifiedPlayerTerminology'),'Persisted character data must be normalized at the central store boundary');
assert.ok(policy.includes('offizielle deutsche Blizzard-Spieler-/UI-Terminologie'),'Language policy must define player-facing source priority');

// MEDIA CONTRACT
const directRegistryUsers=[...sourceByFile.entries()]
  .filter(([file,source])=>source.includes("media-registry.mjs")&&file!=='scripts/media-resolver.mjs')
  .map(([file])=>file);
assert.deepEqual(directRegistryUsers,[],'Only media-resolver.mjs may access the media registry directly');
assert.ok(sourceByFile.get('scripts/archive-images.mjs')?.includes('resolveMediaAsset'),
  'Existing character/item/pet archiving must use the central media resolver');
assert.ok(sourceByFile.get('api/workshop.js')?.includes('resolveMediaAsset'),
  'Workshop media must use the central media resolver');
assert.ok(sourceByFile.get('api/workshop.js')?.includes('item:publicDetailedItem(item)'),
  'Workshop responses must pass selected items through the public media-safe projection');
assert.ok(!/icon\s*:\s*remote\.icon/.test(sourceByFile.get('api/workshop.js')||''),
  'Raw ForeverDB icon URLs must never be returned directly');
const workshopApi=sourceByFile.get('api/workshop.js')||'';
assert.ok(workshopApi.includes('recipe:publicLearningRecipe(learningRecipe)'),
  'Workshop must project remote recipes before sending them to the browser');
assert.ok(workshopApi.includes('learningSources:currentlyCraftable?[]:publicSources'),
  'Workshop must project remote learning sources before sending them to the browser');
assert.ok(!workshopApi.includes('recipe:remoteRecipe'),
  'Raw ForeverDB recipe objects must never reach the browser');
assert.ok(!workshopApi.includes('professionSlugs:recipeIndex'),
  'Technical external profession slugs must stay server-side');
const browserSource=sourceByFile.get('app.js')||'';
assert.ok(browserSource.includes('function segmentedControl('),'Shared segmented control component is required for binary view filters');
for(const id of ['compare-mode','workshop-search-mode','workshop-browse-mode']){
  assert.ok(browserSource.includes("'"+id+"'"),'Missing required shared segmented filter: '+id);
}
assert.ok(!browserSource.includes('compareDifferences'),'Legacy compare checkbox filter must not return');
for(const token of ['checkForNewData','/api/data-version','visibilitychange','pageshow','invalidateWorkshopData','DATA_FRESHNESS_INTERVAL_MS']){
  assert.ok(browserSource.includes(token),'Global data freshness contract missing frontend token: '+token);
}
assert.ok(sourceByFile.has('api/data-version.js'),'Lightweight data-version endpoint is required');
assert.ok(sourceByFile.has('scripts/data-version.mjs'),'Central data-version module is required');
assert.ok((sourceByFile.get('api/refresh.js')||'').includes('dataVersion'),'Manual refresh must return the global data version');
assert.ok((sourceByFile.get('api/characters.js')||'').includes('dataVersion'),'Stored-data API must return the global data version');
assert.ok((sourceByFile.get('api/daily-snapshot.js')||'').includes('acquireRefreshLockWithRetry'),'Daily refresh must retry a temporarily occupied refresh lock');
const refreshApi=sourceByFile.get('api/refresh.js')||'';
const dailyApi=sourceByFile.get('api/daily-snapshot.js')||'';
assert.ok(refreshApi.includes('async function runLockedRefresh')&&refreshApi.includes('releaseRefreshLock(lockToken)'),'Refresh lock release must cover pre-refresh validation failures');
assert.ok(dailyApi.includes('dailyRefreshComplete(existing)')&&dailyApi.includes('registerDailySnapshot(completedMeta)'),'Daily snapshot must not suppress retry of an incomplete persisted refresh');
const vercelConfig=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
assert.deepEqual(vercelConfig.regions,['fra1'],'Vercel functions must stay colocated with Redis and Blob in Frankfurt');
const dailySchedules=(vercelConfig.crons||[]).filter(job=>job.path==='/api/daily-snapshot').map(job=>job.schedule).sort();
assert.deepEqual(dailySchedules,['37 4 * * *','7 4 * * *'],'Daily snapshot requires primary and idempotent retry schedules');
const responseHeaders=Object.fromEntries((vercelConfig.headers?.[0]?.headers||[]).map(header=>[header.key,header.value]));
assert.equal(responseHeaders['X-Content-Type-Options'],'nosniff','Basic response hardening must keep MIME sniffing disabled');
const workflow=fs.readFileSync(path.join(root,'.github','workflows','update-data.yml'),'utf8');
for(const required of ['node-version: ["22", "26"]','npm ci --ignore-scripts','npm audit --audit-level=high','npm test']){
  assert.ok(workflow.includes(required),'CI must preserve reproducible dual-runtime gate: '+required);
}
assert.ok(browserSource.includes("if(changedItem&&!preserveQuantity)workshopState.quantity=1"),'Workshop item-scoped quantity must reset to 1 when the item ID changes');
assert.ok(browserSource.includes("preserveQuery:true,preserveQuantity:true"),'Same-item refresh paths must explicitly preserve workshop quantity');
assert.ok(policy.includes('Gegenstandsbezogene Eingaben gehören zur ausgewählten Item-ID'),'Workshop item-scoped state rule must stay documented');
const workshopStore=sourceByFile.get('scripts/workshop-store.mjs')||'';
assert.ok(workshopStore.includes('META_TTL_SECONDS=30*60'),'ForeverDB build meta must be capped at two API checks per hour');
assert.ok(workshopStore.includes('MASTER_REFRESH_LOCK_KEY')&&workshopStore.includes("'NX','EX'"),'ForeverDB master rebuild must use a distributed Redis lock');
assert.ok(workshopStore.includes('cachedForeverDbItem'),'ForeverDB item details must have a shared build-scoped cache');
assert.ok((sourceByFile.get('api/workshop.js')||'').includes('cachedForeverDbItem(itemId'),'Workshop selected item must use the shared item cache');
assert.ok(!(sourceByFile.get('api/workshop.js')||'').includes('cachedForeverDbRecipeSearch'),'Normal workshop requests must never trigger the 12-profession targeted recipe-search fanout');
assert.ok(policy.includes('5.000 API-Key-Requests pro Tag und 30 pro Minute'),'ForeverDB free-tier request budget must be an explicit architecture constraint');
assert.ok(policy.includes('verteilten Redis-Lock'),'ForeverDB rebuild concurrency protection must stay documented');
assert.ok(sourceByFile.has('api/location-planner.js'),'Location planner API is required');
assert.ok(sourceByFile.has('scripts/location-planner.mjs'),'Location planner core is required');
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes('getForeverDbMasterRecipeIndex'),'Location planner must reuse the persistent Workshop recipe master');
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes('evaluatedRecipeIndex?.professions'),'Location planner must reuse profession ranks/trainers from the shared recipe master after applying the evidence layer');
assert.ok(!(sourceByFile.get('api/location-planner.js')||'').includes('cachedForeverDbProfessionMasters'),'Location planner must not refetch profession masters already contained in the shared recipe master');
assert.ok(sourceByFile.has('scripts/learning-source-evidence.mjs'),'Build-scoped learning-source evidence layer is required');
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes('applyLearningSourceEvidence'),'Location planner must apply current learning-source evidence before building routes');
assert.ok((sourceByFile.get('api/profession-planner.js')||'').includes('applyLearningSourceEvidence'),'Profession planner must use the same learning-source evidence rules');
assert.ok((sourceByFile.get('api/workshop.js')||'').includes('applyLearningSourceEvidence'),'Workshop learning sources must use the same learning-source evidence rules');
assert.ok(sourceByFile.has('scripts/class-training-store.mjs'),'Central class-training master is required');
assert.ok((sourceByFile.get('scripts/class-training-store.mjs')||'').includes('companionTrainingAbility'),'Hunter Beast Training must stay outside class training');
assert.ok((sourceByFile.get('scripts/class-training-store.mjs')||'').includes('cachedGermanClassSpells'),'Visible class spell localization must use the centralized German spell cache');
assert.ok((sourceByFile.get('scripts/class-training-store.mjs')||'').includes('publicGermanSpellData'),'Visible class spell localization must prefer ForeverDB public build files');
assert.ok(!(sourceByFile.get('scripts/class-training-store.mjs')||'').includes('fetchForeverDbSpell'),'Class localization must not consume one ForeverDB API request per spell');
assert.ok((sourceByFile.get('scripts/spellbook-sync.mjs')||'').includes('iconId'),'Spellbook snapshots must preserve stable class-spell icon IDs');
assert.ok((sourceByFile.get('scripts/class-training-store.mjs')||'').includes("zone:'Insel Zephras'"),'Class trainer fallback must use the canonical German Zephras location');
assert.ok(sourceByFile.has('scripts/class-trainer-zones-de.mjs'),'Source-backed German class-trainer zone catalog is required');
assert.ok((sourceByFile.get('scripts/class-training-store.mjs')||'').includes('CLASS_TRAINER_ZONE_DE'),'Class trainer zones must be localized centrally by stable uiMapId');
assert.ok(policy.includes('/de/maps/{uiMapId}')&&policy.includes('technische englische Namen'),'Architecture contract must keep technical English trainer zones out of the visible UI');
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes("'Klassenfähigkeit #'"),'Missing spell localization must use neutral German ID fallback, never English technical text');
assert.ok(policy.includes('Jäger-Begleitertraining')&&policy.includes('keine Klassenfähigkeit'),'Architecture contract must keep pet training out of class abilities');
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes('cachedForeverDbClassMaster'),'Location planner must load the shared build-scoped class master');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes('classTrainingActions'),'Location planner must derive class training centrally instead of injecting ad-hoc rows');
assert.ok((sourceByFile.get('scripts/refresh-service.mjs')||'').includes("'spells','spellbook'"),'Character refresh must probe personal spellbook-capable Forever profile endpoints');
assert.ok((sourceByFile.get('scripts/forever-details.mjs')||'').includes('knownClassAbilitiesVerified'),'Personal learned class ranks need an explicit verification flag');
assert.ok((sourceByFile.get('app.js')||'').includes("action.category==='class-abilities'&&action.learnedState==='unknown'")&&(sourceByFile.get('app.js')||'').includes('continue;'),'Bulk selection must skip class ranks whose personal learned state is unknown');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes("source?.evidence==='forever-confirmed'"),'Location planner must fail closed to Forever-confirmed NPC sources');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes('currentSkill<requiredSkill||level<requiredLevel'),'Location planner must reject profession rank training when skill or character level is not met');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes('fallbackProfessionRankRequiredSkill'),'Profession rank skill fallbacks must stay isolated from normal recipe learning');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes('fallbackProfessionRankRequiredLevel'),'Profession rank level fallbacks must stay isolated from normal recipe learning');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes('fallbackProfessionRankPriceCopper'),'Profession rank price fallbacks must stay isolated from normal recipe learning');
assert.ok(policy.includes('4 S 50 K (Geselle), 50 S (Experte) und 4 G 50 S (Fachmann)'),'Alchemy Classic rank price fallback must stay explicitly bounded and documented');
assert.ok(policy.includes('Level-Fallbacks werden nur für die dort konkret dokumentierten Berufs-/Rangkombinationen hinterlegt'),'Profession rank level fallbacks must stay explicitly bounded in the architecture contract');
assert.ok((sourceByFile.get('scripts/workshop-foreverdb.mjs')||'').includes('sideFromEntry'),'ForeverDB NPC faction fields must be normalized before location planning');
assert.ok(policy.includes('Geselle 50, Experte 125'),'Classic profession-rank fallback thresholds must stay explicitly bounded in the architecture contract');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes("action?.verified===true")&&(sourceByFile.get('scripts/location-planner.mjs')||'').includes("action?.availableNow===true"),'Externally injected companion actions must be explicitly verified and currently available');
assert.ok(policy.includes('Level allein darf niemals als Beweis'),'Personal class-spell knowledge must never be inferred from character level');
assert.ok(policy.includes('Bereits gelernte Klassenränge werden')&&policy.includes('sichtbar dokumentiert'),'Verified learned class ranks must be visible, not only used as an internal filter');
assert.ok(sourceByFile.has('scripts/spellbook-sync.mjs'),'Central spellbook snapshot normalizer is required');
assert.ok(sourceByFile.has('api/spellbook-sync.js'),'Private spellbook sync endpoint is required');
assert.ok(sourceByFile.has('api/addon-sync.js'),'Private full addon sync endpoint is required');
assert.ok(sourceByFile.has('scripts/addon-sync.mjs')&&sourceByFile.has('scripts/addon-sync-store.mjs'),'Addon sync needs centralized validation and persistence');
assert.ok((sourceByFile.get('api/spellbook-sync.js')||'').includes('timingSafeEqual')&&(sourceByFile.get('api/spellbook-sync.js')||'').includes('SPELLBOOK_SYNC_TOKEN'),'Spellbook writes must require the private sync token with constant-time comparison');
assert.ok(sourceByFile.has('scripts/addon-device-auth.mjs')&&sourceByFile.has('api/addon-device-enroll.js'),'Addon sync device authorization and one-time enrollment are required');
assert.ok(sourceByFile.has('api/addon-device-promote.js'),'Cole preview device needs an explicit production-promotion endpoint');
assert.ok((sourceByFile.get('scripts/addon-device-auth.mjs')||'').includes('timingSafeEqual')&&(sourceByFile.get('scripts/addon-device-auth.mjs')||'').includes('DALTON_SYNC_TOKEN'),'Master addon sync token must stay constant-time compared at the centralized auth boundary');
assert.ok((sourceByFile.get('api/addon-sync.js')||'').includes('authorizeDeviceToken')&&(sourceByFile.get('api/addon-sync.js')||'').includes('masterSyncTokenMatches'),'Addon sync must accept only the master token or a validated per-device token');
assert.ok((sourceByFile.get('api/addon-sync.js')||'').includes('deviceMaySync(device,target.slug,payload.client?.transport)'),'Device authorization must pass character and transport through the centralized policy');
const deviceAuthSource=sourceByFile.get('scripts/addon-device-auth.mjs')||'';
assert.ok(deviceAuthSource.includes("if(own===target)return true")&&deviceAuthSource.includes("own==='cole-dalton'")&&deviceAuthSource.includes("transport||'')==='dalton-peer-relay'"),'Device tokens stay character-bound; only Cole hub may forward trusted peer-relay payloads');
assert.ok(deviceAuthSource.includes("deviceMayCreateEnrollment")&&deviceAuthSource.includes("String(targetSlug)!=='cole-dalton'"),'Only Cole hub may create one-time enrollment codes for other trusted Dalton characters, never for itself');
assert.ok(deviceAuthSource.includes('promoteColeDeviceToProduction')&&deviceAuthSource.includes("device.characterSlug!=='cole-dalton'"),'Production promotion must be restricted to the authenticated Cole preview hub');
const promoteApi=sourceByFile.get('api/addon-device-promote.js')||'';
assert.ok(promoteApi.includes("process.env.VERCEL_ENV==='production'")&&promoteApi.includes('promoteColeDeviceToProduction'),'Production-promotion endpoint must be disabled in production and validate the preview Cole device');
assert.ok((sourceByFile.get('api/addon-sync.js')||'').includes("process.env.VERCEL_ENV!=='production'")&&(sourceByFile.get('api/addon-sync.js')||'').includes('previewIsolated'),'Preview addon sync must never write verified spellbook data into the shared production character store');
assert.ok((sourceByFile.get('scripts/addon-sync-store.mjs')||'').includes("?'production':'preview'"),'Addon sync raw-state Redis keys must be environment-scoped');
assert.ok(sourceByFile.has('scripts/live-knowledge-store.mjs'),'Persistent build-scoped Dalton live-knowledge store is required');
assert.ok((sourceByFile.get('scripts/live-knowledge-store.mjs')||'').includes("record:'+kind+':'+encodeURIComponent(build)"),'Live knowledge must be keyed by build, NPC and interaction kind');
assert.ok((sourceByFile.get('scripts/live-knowledge-store.mjs')||'').includes('changes.slice(-CHANGE_LIMIT)'),'Live knowledge must keep only bounded factual change history instead of unbounded snapshots');
assert.ok((sourceByFile.get('api/addon-sync.js')||'').includes('ingestAddonLiveKnowledge(payload)'),'Every addon sync must feed the shared live-knowledge layer');
assert.ok((sourceByFile.get('scripts/data-version.mjs')||'').includes('loadLiveKnowledgeVersion'),'Live-knowledge changes must participate in the global frontend data version');
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes('liveKnowledgeDiscoveries'),'Location planner must surface unresolved live learning-item discoveries without pretending they are classified recipes');
assert.ok((sourceByFile.get('app.js')||'').includes('Live beobachtete neue Händlerangebote'),'Frontend must visibly separate unresolved live discoveries from selectable confirmed actions');
assert.ok(policy.includes('Dalton-Livewissen ist charakterunabhängig')&&policy.includes('vollständigen Fenster'),'Architecture policy must define persistent shared live knowledge and fail-closed negative merchant evidence');
const addonSyncSource=sourceByFile.get('scripts/addon-sync.mjs')||'';
const whitelistStart=addonSyncSource.indexOf('const SAFE_SECTION_NAMES');
const whitelistEnd=addonSyncSource.indexOf(']);',whitelistStart);
const addonSyncWhitelist=whitelistStart>=0&&whitelistEnd>whitelistStart?addonSyncSource.slice(whitelistStart,whitelistEnd+3):'';
assert.ok(addonSyncWhitelist.includes("'character'")&&addonSyncWhitelist.includes("'interactions'"),'Addon sync must use an explicit section whitelist');
assert.ok(!addonSyncWhitelist.includes("'economy'")&&!addonSyncWhitelist.includes("'inventory'"),'Sensitive economy/inventory sections must stay outside the default sync whitelist');
assert.ok(addonSyncSource.includes("for(const forbidden of ['economy','inventory'])"),'Server must actively reject sensitive economy/inventory sections even if a client injects them');
assert.ok((sourceByFile.get('scripts/class-training-store.mjs')||'').includes('fetchForeverDbPublicClassTrainers'),'Class training must consume the central current Forever class-trainer dataset');
assert.ok(sourceByFile.has('scripts/class-training-classic-costs.mjs'),'Central Classic class-trainer cost fallback is required');
assert.ok((sourceByFile.get('scripts/class-training-store.mjs')||'').includes('classicTrainerCost'),'Class rank pricing must use the bounded central Classic trainer-cost fallback');
assert.ok((sourceByFile.get('scripts/class-training-store.mjs')||'').includes('lessonVerified'),'Class ranks without actual lesson evidence must stay fail-closed');
assert.ok((sourceByFile.get('scripts/class-training-store.mjs')||'').includes('trainerRoleMatchesAbility'),'Portal and pet trainers must not be treated as generic class trainers');
assert.ok(policy.includes('Startzauber, interne Auren und Effekte')&&policy.includes('fail-closed unsichtbar'),'Architecture contract must reject class rows without lesson evidence');
assert.ok((sourceByFile.get('scripts/forever-details.mjs')||'').includes("character?.knownClassAbilitiesSource==='WoW-Spellbook'"),'Normal profile refresh must preserve a verified ingame spellbook snapshot');
const addonRoot=path.join(root,'addons','DaltonDashboard');
const addonCore=fs.readFileSync(path.join(addonRoot,'Core.lua'),'utf8');
const addonEntry=fs.readFileSync(path.join(addonRoot,'DaltonDashboard.lua'),'utf8');
const addonSpellbook=fs.readFileSync(path.join(addonRoot,'Modules','Spellbook.lua'),'utf8');
const addonLocation=fs.readFileSync(path.join(addonRoot,'Modules','Location.lua'),'utf8');
const addonInteractions=fs.readFileSync(path.join(addonRoot,'Modules','Interactions.lua'),'utf8');
const addonInstances=fs.readFileSync(path.join(addonRoot,'Modules','Instances.lua'),'utf8');
const addonInventory=fs.readFileSync(path.join(addonRoot,'Modules','Inventory.lua'),'utf8');
const addonHunter=fs.readFileSync(path.join(addonRoot,'Modules','HunterPet.lua'),'utf8');
const addonToc=fs.readFileSync(path.join(addonRoot,'DaltonDashboard.toc'),'utf8');
const addonBundle=[addonCore,addonEntry,addonSpellbook,addonLocation,addonInteractions,addonInstances,addonInventory,addonHunter,addonToc].join('\n');
assert.ok(addonSpellbook.includes('C_SpellBook.GetSpellBookItemInfo')&&addonSpellbook.includes('C_SpellBook.IsSpellKnown'),'Forever addon must read the actual player spellbook');
assert.ok(addonToc.includes('## Interface: 16001'),'Forever addon must declare the current Forever 1.60.1 interface version');
assert.ok(addonToc.includes('## SavedVariablesPerCharacter: DaltonDashboardCharDB'),'Forever addon must persist collected data per character');
for(const required of ['Modules/Spellbook.lua','Modules/Location.lua','Modules/Interactions.lua','Modules/Instances.lua','Modules/Inventory.lua','Modules/HunterPet.lua']){
  assert.ok(addonToc.includes(required),'Forever addon must load collector module: '+required);
}
assert.ok(addonLocation.includes('GetPlayerMapPosition')&&addonLocation.includes('GetBindLocation'),'Forever addon must capture real client location and bind location');
assert.ok(addonLocation.includes('locationHistory')&&addonLocation.includes('HISTORY_LIMIT'),'Forever addon must keep a bounded event-driven location history');
assert.ok(addonInteractions.includes('MERCHANT_SHOW')&&addonInteractions.includes('TRAINER_SHOW'),'Forever addon must capture merchant and trainer observations from client events');
assert.ok(addonInstances.includes('GetSavedInstanceInfo'),'Forever addon must capture real instance lockouts');
assert.ok(addonInventory.includes('GetContainerItemInfo'),'Forever addon must capture bags and last readable bank state');
assert.ok(addonHunter.includes('GetPetHappiness')&&addonHunter.includes('SpellBookSpellBank.Pet'),'Forever addon must capture real hunter-pet state and pet spellbook');
assert.ok(!fs.existsSync(path.join(addonRoot,'Config.lua')),'CurseForge addon must not require a committed private-token config file');
assert.ok(!addonBundle.includes('DALTON_DASHBOARD_SYNC_TOKEN')&&!addonBundle.includes('PRIVATE_TOKEN_HERE'),'CurseForge addon must never contain the private dashboard sync credential');
assert.ok(policy.includes('SPELLBOOK_SYNC_TOKEN')&&policy.includes('niemals im Repository, Frontend oder Addon-Paket'),'Architecture contract must keep sync credentials outside the addon');
assert.ok(policy.includes('Gold, Taschen und Bank')&&policy.includes('nicht übertragen'),'Architecture contract must keep sensitive local data outside the default sync');
assert.ok(policy.includes('Ein Lernziel besitzt genau eine stabile Erledigungs-ID'),'Location planner must distinguish one learning target from multiple NPC offers');
assert.ok(policy.includes('ein stilles Opt-out ist verboten'),'Manual vendor switches must require explicit confirmation');
assert.ok(policy.includes('direkt am neu angeklickten Angebot sichtbar'),'Vendor-switch confirmation must remain visible at the clicked offer in long lists');
assert.ok(policy.includes('forever-observed')&&policy.includes('classic'),'Price provenance contract must distinguish Forever observations from Classic fallbacks');
assert.ok(policy.includes('Spell-`baseCost` ist **kein** Ersatz'),'Spell baseCost must never be reused as trainer gold price');
assert.ok(policy.includes('Voraussichtliche Gesamtkosten'),'Classic fallback totals must remain visibly provisional');
assert.ok((sourceByFile.get('scripts/workshop-foreverdb.mjs')||'').includes('inheritTrainerPrice'),'Trainer price inheritance must stay centralized in the ForeverDB adapter');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes("if(provenance==='forever-observed')return 0"),'Location planner must rank confirmed Forever prices ahead of Classic fallback prices');
assert.ok((sourceByFile.get('app.js')||'').includes("Classic-Preis · noch nicht in Forever bestätigt"),'Frontend must label Classic fallback prices explicitly');
assert.ok(policy.includes('Bestätigte aktuelle Forever-Daten sind der Normalfall')&&policy.includes('kein zusätzliches Bestätigungslabel'),'Confirmed Forever data must stay the unlabeled UI default');
assert.ok(!(sourceByFile.get('app.js')||'').includes("return 'Forever-Preis'"),'Frontend must not add a redundant Forever confirmation label');
assert.ok((sourceByFile.get('scripts/location-planner.mjs')||'').includes('mergeActionCandidates'),'Location planner must deduplicate learning targets centrally');
assert.ok((sourceByFile.get('app.js')||'').includes('selected:new Map()'),'Location planner UI must keep at most one source per learning target');
assert.ok((sourceByFile.get('app.js')||'').includes('plannerCheapestKnownOffer'),'Location planner UI must centralize cheapest-offer selection');
assert.ok(browserSource.includes("fetch('/api/location-planner?'"),'Location planner frontend must use its server-side API');
assert.ok(browserSource.includes('invalidateLocationPlannerData({reloadVisible:true})'),'Character refresh must invalidate the location planner');
assert.ok(policy.includes('Kategorien und Lernziele bleiben echte Mehrfachauswahlen'),'Location planner checkbox exception must stay documented at learning-target level');
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes("entityType:'npc'"),'NPC portraits must use the central entity-based media resolver');
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes('resolveMediaAsset'),'NPC portraits must be archived through the central media resolver');
assert.ok(sourceByFile.has('scripts/classic-npc-display-ids.mjs'),'Central visual-only Classic NPC display fallback is required');
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes('classicNpcDisplayId'),'NPC portraits may use the bounded Classic display-ID fallback without per-NPC ForeverDB API calls');
assert.ok(!(sourceByFile.get('api/location-planner.js')||'').includes('cachedForeverDbVendor'),'Location planner must never create a ForeverDB vendor N+1 for portraits');
const knowledgeMedia=sourceByFile.get('scripts/knowledge-media.mjs')||'';
assert.ok((sourceByFile.get('api/location-planner.js')||'').includes('enrichPlannerKnowledgeMedia')&&knowledgeMedia.includes("return ref('spell',action.id,action.iconId)")&&knowledgeMedia.includes('resolveMediaAsset({entityType:entry.type,entityId:entry.id'),'Class-spell icons must use the central media resolver');
assert.ok(knowledgeMedia.includes("ref('item',recipe?.craftedItem?.id)||ref('recipe',recipe?.id)")&&knowledgeMedia.includes("ref('profession',action.professionId)"),'Profession and recipe media identities must remain explicit and shared');
assert.ok((sourceByFile.get('api/spellbook-sync.js')||'').includes('archiveKnownAbilityIcons'),'Verified learned class abilities must persist archived icons with the spellbook snapshot');
const checkboxMarkup=[...browserSource.matchAll(/<input[^>]+type=["']checkbox["'][^>]*>/g)].map(match=>match[0]);
assert.ok(checkboxMarkup.length>0,'Character multi-selection checkboxes should remain available');
for(const markup of checkboxMarkup){
  const allowed=markup.includes('data-compare-character')||markup.includes('data-location-category')||markup.includes('data-location-action');
  assert.ok(allowed,'Checkboxes are reserved for approved true multi-selection controls: '+markup);
}
for(const host of ['render.worldofwarcraft.com','foreverdb.net/icons/','foreverspec.com/icons/']){
  assert.ok(!browserSource.includes(host),'Browser code must not hard-code external game image hosts: '+host);
}

// UI / CI CONTRACT
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const viewNames=[...new Set([...html.matchAll(/data-view-link=["']([^"']+)["']/g)].map(match=>match[1]))];
assert.ok(viewNames.length>=3,'Architecture contract expects all main views from navigation');
for(const name of viewNames){
  const id=name+'View';
  const tag=html.match(new RegExp("<[^>]+id=[\\\"']"+id+"[\\\"'][^>]*>",'i'))?.[0]||'';
  assert.ok(tag.includes('main-view'),'#'+id+' must use shared main-view CI');
  const sectionStart=html.indexOf(tag);
  const nextViewCandidates=viewNames.map(other=>html.indexOf('id="'+other+'View"',sectionStart+tag.length)).filter(x=>x>sectionStart);
  const sectionEnd=nextViewCandidates.length?Math.min(...nextViewCandidates):html.indexOf('</main>',sectionStart);
  const section=html.slice(sectionStart,sectionEnd);
  assert.ok(section.includes('roster-heading')&&section.includes('roster-title')&&section.includes('roster-kicker'),
    '#'+id+' must use the shared Dalton section-heading CI');
}

// Existing Character/Comparison CSS predates the strict token-only rule.
// Workshop and every future view are held to it.
const tokenOnlyViews=viewNames.filter(name=>!['characters','compare'].includes(name));
for(const name of tokenOnlyViews){
  const prefix=name.replace(/[^a-z0-9_-]/gi,'');
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match=>match[1].split(',').some(selector=>selector.includes('.'+prefix+'-')||selector.includes('#'+prefix)));
  assert.ok(rules.length>0,'Token-only view '+name+' must have identifiable view-specific CSS');
  for(const [,selector,body] of rules){
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body),name+' CI must use centralized color tokens, raw hex in '+selector.trim());
    assert.ok(!/rgba?\s*\(/i.test(body),name+' CI must use centralized color tokens/color-mix, raw rgb(a) in '+selector.trim());
    const rawFontSize=body.match(/font-size\s*:\s*([^;]+)/i)?.[1]?.trim();
    if(rawFontSize)assert.ok(rawFontSize.startsWith('var('),name+' CI must use semantic typography token in '+selector.trim());
  }
}

console.log('Architecture contract: global language, media, CI and view rules: OK');
