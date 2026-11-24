import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {HUNTER_PET_RULEBOOK_VERSION,hunterPetFamily,hunterPetCombatProfile,hunterPetMechanics} from '../hunter-pets.js';
import {reputationStages,reputationColors} from '../reputation-data.js';

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>fs.readFileSync(path.join(dir,f),'utf8');
const source=read('app.js'),css=read('styles.css'),data=JSON.parse(read('data/characters.json'));
// Legacy JSON fixture is normalized into the new source-backed shape only for UI unit tests.
const testClassIds={'Magier':8,'Jäger':3,'Druide':11};
const testStatEnums={
  Gesundheit:'HEALTH',Mana:'MANA','Stärke':'STRENGTH','Intelligenz':'INTELLECT','Beweglichkeit':'AGILITY','Ausdauer':'STAMINA',
  'Kritische Trefferchance':'CRITICALSTRIKE','Willenskraft':'SPIRIT','Waffen-DPS':'ATTACKDPS','Manaregeneration':'MANAREGEN',
  'Rüstung':'ARMOR','Angriffskraft':'ATTACKPOWER','Zaubermacht':'SPELLPOWER','Nahkampf-Krit':'MELEECRIT','Fernkampf-Krit':'RANGEDCRIT',
  'Zauber-Krit':'SPELLCRIT','Ausweichen':'DODGE','Parieren':'PARRY','Blocken':'BLOCK','Angriffsgeschwindigkeit':'ATTACKSPEED','Gegenstandsstufe':'ITEMLEVEL'
};
const testSlotTypes={
  Kopf:'HEAD',Hals:'NECK',Schultern:'SHOULDER',Rücken:'BACK',Brust:'CHEST',Hemd:'SHIRT',Wappenrock:'TABARD',Handgelenke:'WRIST',
  Hände:'HANDS',Taille:'WAIST',Beine:'LEGS',Füße:'FEET','Ring 1':'FINGER_1','Ring 2':'FINGER_2','Schmuck 1':'TRINKET_1','Schmuck 2':'TRINKET_2',
  Waffenhand:'MAIN_HAND',Nebenhand:'OFF_HAND',Distanzwaffe:'RANGED'
};
for(const c of data.characters){
  c.classId=testClassIds[c.class]||null;
  c.gameStringsVerified=true;c.gameStringsLocale='de_DE';
  c.statsDetails=Object.entries(c.stats||{}).filter(([name])=>testStatEnums[name]).map(([name,value])=>({enum:testStatEnums[name],name,value}));
  c.statsByEnum=Object.fromEntries(c.statsDetails.map(entry=>[entry.enum,entry.value]));
  c.statsFreshEnums=[...c.statsDetails.map(entry=>entry.enum)];
  for(const item of c.equipment||[])item.slotType=testSlotTypes[item.slot]||item.slotType;
}
const executableSource=source
  .replace("import {HUNTER_PET_RULEBOOK_VERSION,hunterPetFamily,hunterPetCombatProfile,hunterPetMechanics} from './hunter-pets.js';\n",'')
  .replace("import {reputationStages,reputationColors} from './reputation-data.js';\n",'');
const start=executableSource.indexOf('button.innerHTML=');
assert.ok(start>0,'App bootstrapping anchor exists');
const nodes=new Map();
const document={querySelector(selector){
  if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',hidden:selector==='#compareView'||selector==='#workshopView',querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}});
  return nodes.get(selector);
}};
const window={addEventListener(){}};
const location={hash:''};
const ui=new Function('document','window','location','HUNTER_PET_RULEBOOK_VERSION','hunterPetFamily','hunterPetCombatProfile','hunterPetMechanics','reputationStages','reputationColors',executableSource.slice(0,start)+'\nreturn {render,applyServerPayload,addonSyncState,addonPresence,instanceStatusPanel,recipeRows,professionRows,professionScale,sortProfessionsForDisplay,statsPanel,equipmentSlotOrder,keepNewestProfiles,experienceProgress,totalXpAtLevel,setActiveCharacterTab,hunterPetsPanel,hunterPetCombatPanel,characterTabsFor,classAbilitiesPanel,gameStatusPanel,reputationPanel,plannerState,plannerKnownCopper,plannerPrice,plannerPriceSource,plannerPriceTier,plannerPriceSourceLabel,plannerOffers,plannerCheapestKnownOffer,plannerRequestOfferSelection,plannerConfirmSwitch,plannerKeepSelection,plannerClearSelection,plannerSelectAllVisible,plannerSelectedActions,plannerSelectionHtml,plannerPriceWarningHtml,plannerSwitchHtml,plannerNpcHtml};')(document,window,location,HUNTER_PET_RULEBOOK_VERSION,hunterPetFamily,hunterPetCombatProfile,hunterPetMechanics,reputationStages,reputationColors);

const addonPayloadQa={
  data:{generatedAt:'2026-11-24T12:22:51.000Z',characters:[{...data.characters[0],slug:'cole-dalton',name:'Cole Dalton'}]},
  addonSync:{'cole-dalton':{
    characterSlug:'cole-dalton',receivedAt:'2026-11-24T12:22:51.468Z',syncId:'qa-sync',
    addonVersion:'0.1.0-beta.1',transport:'dalton-local-bridge',build:'71037',
    currentLocation:{zone:'Die Insel Zephras',subZone:'Valanaar',x:.621,y:.734,bindLocation:'Valanaar'},
    visitedInstances:[],visitedInstanceCount:0,lockoutCount:0,lockouts:[],merchantObservationCount:12,trainerObservationCount:5
  }},
  dataVersion:{version:'data-v3|qa-addon-sync'}
};
assert.equal(ui.applyServerPayload(addonPayloadQa,{force:true}),true,'Server payload with AddOn state is accepted');
const addonRendered=nodes.get('#cards').innerHTML;
assert.ok(addonRendered.includes('Valanaar'),'Synced location data is rendered directly below the character activity');
assert.ok(addonRendered.includes('62.1 / 73.4'),'WoW map coordinates are shown in the familiar xx.x / yy.y format without percent signs');
assert.ok(!addonRendered.includes('direkte Bridge')&&!addonRendered.includes('Build 71037'),'Technical transport/build diagnostics are hidden from the player-facing game status');
assert.ok(!addonRendered.includes('Standort-Historie')&&!addonRendered.includes('Händler & Lehrer'),'Internal history and live-evidence counters stay out of the player-facing game status');
assert.ok(addonRendered.includes('Instanzen &amp; Dungeons'),'Game tab is now the player-facing instances and dungeons area');

const classAbilityQa=ui.classAbilitiesPanel({
  knownClassAbilitiesVerified:true,
  knownClassAbilitiesCapturedAt:'2026-11-24T12:26:00.000Z',
  knownClassAbilities:[
    {id:5143,name:'Arkane Geschosse',rank:'Rang 1'},
    {id:1459,name:'Arkane Intelligenz',rank:'Rang 1'},
    {id:587,name:'Essen herbeizaubern',rank:'Rang 1'},
    {id:143,name:'Feuerball',rank:'Rang 2'},
    {id:2136,name:'Feuerschlag',rank:'Rang 1'},
    {id:116,name:'Frostblitz',rank:'Rang 1'},
    {id:205,name:'Frostblitz',rank:'Rang 2'},
    {id:122,name:'Frostnova',rank:'Rang 1'},
    {id:168,name:'Frostrüstung',rank:'Rang 1'},
    {id:7300,name:'Frostrüstung',rank:'Rang 2'},
    {id:118,name:'Verwandlung',rank:'Rang 1'},
    {id:5504,name:'Wasser herbeizaubern',rank:'Rang 1'},
    {id:5505,name:'Wasser herbeizaubern',rank:'Rang 2'}
  ]
});
assert.ok(classAbilityQa.includes('10 gelernte Fähigkeiten'),'13 gespeicherte Klassenränge werden auf 10 eindeutige Fähigkeiten verdichtet');
assert.ok(classAbilityQa.includes('Gelernte Fähigkeiten anzeigen · 10'),'Aufklappbereich zählt Fähigkeiten statt einzelner Ränge');
assert.equal((classAbilityQa.match(/<strong>Frostblitz<\/strong>/g)||[]).length,1,'Frostblitz erscheint nur einmal');
assert.match(classAbilityQa,/Frostblitz[\s\S]*?Rang 2/,'Frostblitz zeigt den höchsten gelernten Rang');
assert.equal((classAbilityQa.match(/<strong>Frostblitz<\/strong>/g)||[]).length,1,'Niedriger Frostblitz-Rang erzeugt keinen zweiten Listeneintrag');
assert.equal((classAbilityQa.match(/<strong>Frostrüstung<\/strong>/g)||[]).length,1,'Frostrüstung erscheint nur einmal');
assert.match(classAbilityQa,/Frostrüstung[\s\S]*?Rang 2/,'Frostrüstung zeigt Rang 2');
assert.equal((classAbilityQa.match(/<strong>Wasser herbeizaubern<\/strong>/g)||[]).length,1,'Wasser herbeizaubern erscheint nur einmal');
assert.match(classAbilityQa,/Wasser herbeizaubern[\s\S]*?Rang 2/,'Wasser herbeizaubern zeigt Rang 2');
assert.ok(!classAbilityQa.includes('gelernte Klassenränge'),'Alte Rang-Zählung wird nicht mehr angezeigt');

// Uniform 0–300 scale: current skill must not stretch to 100% at the old 75/150 cap.
const getSegments=html=>[...html.matchAll(/class="profession-segment (is-unlocked|is-locked)"><span class="profession-segment-fill" style="width:([0-9.]+)%"/g)]
  .map(m=>({state:m[1],width:Number(m[2])}));
const examples=[
  {current:37,max:75,widths:[49.33,0,0,0],unlocked:1},
  {current:75,max:75,widths:[100,0,0,0],unlocked:1},
  {current:75,max:150,widths:[100,0,0,0],unlocked:2},
  {current:99,max:150,widths:[100,32,0,0],unlocked:2},
  {current:170,max:225,widths:[100,100,26.67,0],unlocked:3},
  {current:240,max:300,widths:[100,100,100,20],unlocked:4},
  {current:0,max:75,widths:[0,0,0,0],unlocked:1},
  {current:300,max:300,widths:[100,100,100,100],unlocked:4}
];
for(const e of examples){
  const html=ui.professionRows([{name:'Angeln',current:e.current,max:e.max}]);
  const parts=getSegments(html);
  assert.equal(parts.length,4,'Exactly four skill segments for all ranks');
  assert.deepEqual(parts.map(p=>p.width),e.widths,'Precise fixed 75-point segments');
  assert.equal(parts.filter(p=>p.state==='is-unlocked').length,e.unlocked,'Cap must control unlocked segments');
  assert.equal((html.match(new RegExp('>'+e.current+'\\/'+e.max+'<','g'))||[]).length,1);
  assert.match(html,/aria-valuemax="300"/);
  assert.match(html,/role="progressbar"/);
}
const invalid=ui.professionRows([{name:'Angeln',current:20,max:0}]);
assert.deepEqual(getSegments(invalid).map(x=>x.width),[0,0,0,0]);
assert.ok(!invalid.includes('Lehrling')&&!invalid.includes('Geselle')&&!invalid.includes('Experte')&&!invalid.includes('Fachmann'));
assert.ok(!ui.professionRows([{name:'<script>',current:1,max:2}]).includes('<script>'));
assert.equal((ui.professionScale().match(/<span>/g)||[]).length,4);
const redundantRecipe=ui.recipeRows([{
  name:'Manabrunnen',
  craftedItem:{name:'Manabrunnen'},
  craftedQuantity:{value:1},
  reagents:[{name:'Friedensblume',quantity:1},{name:'Leere Phiole',quantity:1}]
}]);
assert.ok(!redundantRecipe.includes('Erstellt:'),'Identical recipe and crafted-item names must not be repeated');
assert.ok(redundantRecipe.includes('Materialien: 1× Friedensblume · 1× Leere Phiole'),'Materials remain visible when redundant crafted-item text is hidden');

const transformedRecipe=ui.recipeRows([{
  name:'Kupfer verhütten',
  craftedItem:{name:'Kupferbarren'},
  craftedQuantity:{value:1},
  reagents:[{name:'Kupfererz',quantity:1}]
}]);
assert.ok(transformedRecipe.includes('Erstellt: <strong>Kupferbarren</strong>'),'Different crafted-item names remain visible');

const multiYieldRecipe=ui.recipeRows([{
  name:'Testprodukt',
  craftedItem:{name:'Testprodukt'},
  craftedQuantity:{value:2},
  reagents:[]
}]);
assert.ok(multiYieldRecipe.includes('Erstellt: <strong>Testprodukt × 2</strong>'),'A non-default crafted quantity remains visible even when names match');
const orderedNames=list=>ui.sortProfessionsForDisplay(list.map(name=>({name}))).map(x=>x.name);
assert.deepEqual(orderedNames(['Alchimie','Kräuterkunde','Kochkunst','Angeln','Erste Hilfe']),['Kräuterkunde','Alchimie','Angeln','Kochkunst','Erste Hilfe']);
assert.deepEqual(orderedNames(['Lederverarbeitung','Kürschnerei','Kochkunst','Angeln','Erste Hilfe']),['Kürschnerei','Lederverarbeitung','Angeln','Kochkunst','Erste Hilfe']);
assert.deepEqual(orderedNames(['Kürschnerei','Bergbau','Kochkunst','Angeln','Erste Hilfe']),['Kürschnerei','Bergbau','Angeln','Kochkunst','Erste Hilfe']);
const statDetails=[
  ['HEALTH','Gesundheit',202],['MANA','Mana',535],['STRENGTH','Stärke',18],['INTELLECT','Intelligenz',40],
  ['AGILITY','Beweglichkeit',26],['STAMINA','Ausdauer',23],['CRITICALSTRIKE','Kritische Trefferchance',5.0068],
  ['SPIRIT','Willenskraft',31],['ATTACKDPS','Waffen-DPS',5.081841],['MANAREGEN','Manaregeneration',38],
  ['ARMOR','Rüstung',99],['ATTACKPOWER','Angriffskraft',8],['SPELLPOWER','Zaubermacht',0],
  ['DODGE','Ausweichen',5.2468],['PARRY','Parieren',4.88],['BLOCK','Blocken',0],['ATTACKSPEED','Angriffsgeschwindigkeit',1.961]
].map(([enumKey,name,value])=>({enum:enumKey,name,value}));
const statQa=ui.statsPanel({slug:'qa',scrapeOk:true,statsVerified:true,statsFreshEnums:statDetails.map(x=>x.enum),statsDetails:statDetails});
assert.equal((statQa.match(/stat-tile stat-tile-main/g)||[]).length,10);
assert.equal((statQa.match(/stat-tile stat-tile-detail/g)||[]).length,7);
assert.ok(statQa.includes('5,0 %')&&statQa.includes('5,2 %')&&statQa.includes('4,9 %'));
assert.match(statQa,/Waffen-DPS[\s\S]*?>5,08</);
assert.match(statQa,/Manaregeneration[\s\S]*?>38</);
assert.match(statQa,/Angriffsgeschwindigkeit[\s\S]*?>1,96</);
assert.match(statQa,/Zaubermacht[\s\S]*?>0</);
assert.ok(!statQa.includes('Nahkampf-Krit'),'Unsourced stat labels are not invented');

const chuckyXp=ui.experienceProgress({level:10,experience:5143});
assert.ok(chuckyXp.includes('5.143 / 7.600 XP'),'Chucky XP is shown as progress within level 10');
assert.ok(!chuckyXp.includes('67,7 %'),'Visible XP percentage is deliberately omitted');
assert.ok(!chuckyXp.includes('Gesamt-XP'),'Cumulative XP thresholds are deliberately omitted');
assert.ok(chuckyXp.includes('Level 10')&&chuckyXp.includes('Level 11'),'Current and next level frame the bar');
assert.equal(ui.totalXpAtLevel(10),27600);
assert.equal(ui.totalXpAtLevel(11),35200);

const repQa={reputationsVerified:true,reputations:[
  {id:72,name:'Stormwind',standing:{tier:4,name:'Freundlich',value:100,max:6000}},
  {id:47,name:'Ironforge',standing:{tier:3,name:'Neutral',value:2000,max:3000}},
  {id:609,name:'Zirkel des Cenarius',standing:{tier:2,name:'Unfreundlich',value:1200,max:3000}}
]};
ui.render({generatedAt:'2026-11-21T12:00:00.000Z',characters:[{...data.characters[0],slug:'rep-qa',name:'Rep QA',reputations:repQa.reputations,reputationsVerified:true}]},{
  reputationCatalog:{build:'1.60.1.70959',expected:54,records:{
    '72':{id:'72',slug:'stormwind',crestKind:'specific',media:{crestSourceUrl:'https://warcraft.wiki.gg/images/Stormwind.png'}},
    '47':{id:'47',slug:'ironforge',crestKind:'specific',media:{crestSourceUrl:'https://warcraft.wiki.gg/images/Ironforge.png'}},
    'slug:stormwind':{id:'slug:stormwind',slug:'stormwind',crestKind:'specific',media:{
      crestSourceUrl:'https://warcraft.wiki.gg/images/Stormwind.png',
      crestStoredUrl:'https://qa.public.blob.vercel-storage.com/media/faction/shared/stormwind.png'
    }}
  }}
});
const repHtml=nodes.get('#cards').innerHTML;
assert.ok(repHtml.includes('reputation-standing" style="--rep-color:#00991A'),'Friendly status uses canonical Blizzard green');
assert.ok(repHtml.includes('reputation-standing" style="--rep-color:#E6B300'),'Neutral status uses canonical Blizzard yellow');
assert.ok(repHtml.includes('reputation-standing" style="--rep-color:#BF4500'),'Unfriendly status uses canonical Blizzard orange');
assert.ok(repHtml.includes('https://qa.public.blob.vercel-storage.com/media/faction/shared/stormwind.png'),'Archived master crest is preferred for observed Blizzard IDs');
assert.equal((repHtml.match(/class="reputation-segment /g)||[]).length,24,'Three reputation rows retain eight segments each');
assert.ok(repHtml.includes('is-current" style="--rep-color:#00991A'),'Current reputation segment is explicitly marked');
assert.ok(repHtml.includes('style="--rep-color:#CC4D38;--rep-light:#E07A68;--rep-dark:#7D2D21"'),'Hostile stages use canonical Blizzard red');
assert.ok(css.includes('.reputation-crest{'),'Faction crest styling exists');
assert.ok(css.includes('.reputation-segment.is-current{'),'Current reputation segment gets a visible outline');

ui.render(data);
assert.ok(nodes.get('#cards').innerHTML.includes('Zuletzt im Spiel: von Blizzard nicht angegeben'),
  'Do not invent a login timestamp from the periodic data refresh or scrape time');
const loginData=structuredClone(data);
const loginCole=loginData.characters.find(c=>c.slug==='cole-dalton');
loginCole.lastLoginAt='2026-11-20T10:11:12.000Z';
loginCole.gameStringsVerified=true;
loginCole.gameStringsLocale='de_DE';
loginCole.faction='Allianz';
loginCole.ruleset={id:1,name:'PvP'};
ui.render(loginData);
assert.ok(nodes.get('#cards').innerHTML.includes('Zuletzt im Spiel: <strong>20.11.26, 11:11</strong>'),
  'Display the genuine official Blizzard API last-login time in German local time');
assert.ok(nodes.get('#cards').innerHTML.includes('Allianz · EU-PvP'),
  'Faction and ruleset are rendered from API-backed character metadata');

const petData=structuredClone(data);
const petDolly=petData.characters.find(c=>c.slug==='dolly-dalton');
petDolly.classId=3;
petDolly.hunterPetsVerified=true;
petDolly.hunterPetsCheckedAt='2026-11-21T09:32:58.000Z';
petDolly.hunterPets={
  active:[{
    name:'Slydris',level:6,active:true,summoned:true,slot:0,
    family:{id:319,name:'Fuchs',enum:'FOX',slug:'fox'},
    iconUrl:'https://render.worldofwarcraft.com/forever-eu/icons/56/458223.jpg',
    imageUrl:'https://render.worldofwarcraft.com/forever-eu/npcs/zoom/creature-display-139280.jpg'
  }],
  stable:[{name:'Lobo',level:5,active:false,slot:1,family:{id:1,name:'Wolf',enum:'WOLF',slug:'wolf'},iconUrl:'https://render.worldofwarcraft.com/forever-eu/icons/56/132203.jpg'}]
};
petDolly.statsByEnum={...(petDolly.statsByEnum||{}),STAMINA:30,ARMOR:256,CRITICALSTRIKE:5.0689,ATTACKPOWER:63,HEALTH:500};
petDolly.statsFreshEnums=['STAMINA','ARMOR','CRITICALSTRIKE','ATTACKPOWER','HEALTH'];
petDolly.statsDetails=[
  {enum:'STAMINA',name:'Ausdauer',value:30},{enum:'ARMOR',name:'Rüstung',value:256},
  {enum:'CRITICALSTRIKE',name:'Kritische Trefferchance',value:5.0689},{enum:'ATTACKPOWER',name:'Angriffskraft',value:63},
  {enum:'HEALTH',name:'Gesundheit',value:500}
];
petDolly.talentDetailsVerified=true;
petDolly.talentDetails=[{
  id:50,name:'Tierherrschaft',spentPoints:1,talents:[{
    id:134438,name:'Belastbarkeit-Ausbildung',rank:1,spellId:19583,
    description:'Erhöht die Gesundheit und Rüstung Eurer Begleiter um 3%.'
  }]
}];

const verifiedPetCatalog={
  fox:{
    slug:'fox',name:'Fuchs',build:'1.60.1.70959',locale:'de-DE',
    source:'ForeverDB deutsche Forever-Clientextraktion',
    abilities:[
      {id:17253,name:'Beißen Rang 1',requiredLevel:1,description:'Den Feind beißen und ihm 7 bis 9 Punkt(e) Schaden zufügen.'},
      {id:17255,name:'Beißen Rang 2',requiredLevel:8,description:'Den Feind beißen und ihm 16 bis 18 Punkt(e) Schaden zufügen.'},
      {id:17256,name:'Beißen Rang 3',requiredLevel:16,description:'Den Feind beißen und ihm 24 bis 28 Punkt(e) Schaden zufügen.'},
      {id:1310612,name:'Tanz des Täuschers Rang 1',requiredLevel:20,description:'Erhöht die Ausweichchance Eures Begleiters 12 Sek. lang um 50%.'},
      {id:17257,name:'Beißen Rang 4',requiredLevel:24,description:'Den Feind beißen und ihm 31 bis 37 Punkt(e) Schaden zufügen.'},
      {id:23099,name:'Spurt Rang 1',requiredLevel:30,description:'Erhöht das Bewegungstempo um 40% für 15 Sek..'},
      {id:17258,name:'Beißen Rang 5',requiredLevel:32},
      {id:17259,name:'Beißen Rang 6',requiredLevel:40},
      {id:23109,name:'Spurt Rang 2',requiredLevel:40},
      {id:17260,name:'Beißen Rang 7',requiredLevel:48},
      {id:23110,name:'Spurt Rang 3',requiredLevel:50},
      {id:17261,name:'Beißen Rang 8',requiredLevel:56}
    ]
  }
};
const verifiedPetRules={
  rulebookVersion:'2026.11.22.2',checkedAt:'2026-11-22T04:07:00.000Z',overall:'verified',
  rules:{
    'fox.family.profile':{status:'verified',version:3,evidence:'client',evidenceLabel:'Clientdaten',evidenceNote:'Clientdaten'},
    'fox.training':{status:'verified',version:3,evidence:'client',evidenceLabel:'Clientdaten',evidenceNote:'Clientdaten'},
    'pet.scaling':{status:'verified',version:4,evidence:'reference_model',evidenceLabel:'Referenzmodell',evidenceNote:'Serverkoeffizient nicht direkt veröffentlicht'},
    'pet.crit.inheritance':{status:'verified',version:1,evidence:'official',evidenceLabel:'Offiziell',evidenceNote:'Höherer Nah-/Fernkampf-Kritwert als Quelle'},
    'pet.autoswing.crit':{status:'verified',version:1,evidence:'measured',evidenceLabel:'Gemessen',evidenceNote:'White-Swing-Abweichung kontrolliert gemessen'},
    'pet.expertise':{status:'verified',version:1,evidence:'official',evidenceLabel:'Offiziell',evidenceNote:'Pets profitieren von Expertise; kein numerischer Faktor'},
    'pet.focus':{status:'verified',version:3,evidence:'client',evidenceLabel:'Clientdaten',evidenceNote:'Clientdaten'},
    'pet.health.global':{status:'verified',version:2,evidence:'official',evidenceLabel:'Offiziell',evidenceNote:'Blizzard-Hotfix'}
  },
  history:[
    {at:'2026-11-22T04:07:00.000Z',type:'rulebook_version',fromRulebookVersion:'2026.11.22.1',toRulebookVersion:'2026.11.22.2'},
    {at:'2026-11-22T04:07:00.000Z',type:'rule_state',ruleId:'pet.scaling',label:'Jägerbegleiter-Skalierungskoeffizienten',fromStatus:'verified',toStatus:'verified',fromEvidence:'reference_model',toEvidence:'reference_model'}
  ]
};
ui.render(petData,{petRules:verifiedPetRules,petCatalog:verifiedPetCatalog});
const petPanel=ui.hunterPetsPanel(petDolly);
assert.ok(petPanel.includes('Slydris')&&petPanel.includes('Fuchs')&&petPanel.includes('Stufe 6'),'Live pet identity is rendered');
assert.ok(petPanel.includes('5 Stufen')&&petPanel.includes('hinter Dolly'),'Pet-to-hunter level gap is explained');
assert.ok(petPanel.includes('Schaden')&&petPanel.includes('±0 %')&&petPanel.includes('+5 %'),'Fox family modifiers are shown');





assert.ok(petPanel.includes('Lobo')&&petPanel.includes('Weitere gezähmte Begleiter · 1'),'Stable pets are rendered separately');
assert.ok(petPanel.includes('JETZT ERLERNBAR')&&petPanel.includes('Beißen Rang 1')&&petPanel.includes('Jetzt erlernbar'),'Current learnable rank is immediately visible');
assert.ok(petPanel.includes('ALS NÄCHSTES')&&petPanel.includes('Beißen Rang 2')&&petPanel.includes('Ab Stufe 8 · noch 2 Stufen'),'The very next rank is highlighted separately');
assert.ok(petPanel.includes('Spätere Fähigkeiten und Ränge')&&petPanel.includes('Tanz des Täuschers Rang 1')&&petPanel.includes('Spurt Rang 1'),'Later progression remains accessible without competing with the next unlock');
assert.ok(petPanel.includes('class="details pet-training-later"'),'Later pet progression reuses the dashboard details/summary component');
assert.ok(petPanel.includes('class="stat-tile stat-tile-detail pet-family-stat"'),'Pet family values reuse the character stat-tile component');
assert.ok(petPanel.includes('class="stat-tile pet-training-card is-now"')&&petPanel.includes('class="stat-tile pet-training-card is-next"'),'Current and next pet abilities use dashboard stat-card styling');
assert.ok(!petPanel.includes('pet-training-label'),'Pet status labels no longer float outside their cards');
assert.ok(!petPanel.includes('deutsche Clientdaten')&&!petPanel.includes('Referenzmodell')&&!petPanel.includes('Clientdaten'),'Technical source/evidence jargon is hidden from normal player view');
assert.ok(!petPanel.includes('noch nicht aus der Pet-Datenquelle angebunden'),'No unfinished database placeholder is exposed to users');
const combat=ui.hunterPetCombatPanel(petDolly,petDolly.hunterPets.active[0]);
assert.ok(combat.includes('Gesundheit aus Dolly')&&combat.includes('>+60<'),'30 Stamina produces exactly +60 inherited pet health');
assert.ok(combat.includes('Rüstung aus Dolly')&&combat.includes('>+76,8<'),'30% of 256 Armor is shown as 76.8 before server rounding');
assert.ok(combat.includes('Vererbte Krit-Komponente aus Dolly')&&combat.includes('>+5,07 %-Pkt.<'),'Crit is shown only as an inherited component');
assert.ok(!combat.includes('Kritische Trefferchance aus Dolly'),'Inherited crit must not be presented as the effective pet crit chance');
assert.ok(combat.includes('tatsächliche Krit-Chance der Autoangriffe wird daraus nicht abgeleitet'),'Autoattack crit remains semantically separate from inherited crit');
assert.ok(combat.includes('Forever-Gesundheitsfaktor')&&combat.includes('>115 %<'),'Official 115% global pet health factor is shown');
assert.ok(combat.includes('Belastbarkeit-Ausbildung')&&combat.includes('>Rang 1<')&&combat.includes('um 3%'),'Live Endurance Training rank is shown from Blizzard talent data');
assert.ok(combat.includes('Maximaler Fokus')&&combat.includes('>150<'),'Verified maximum Focus is shown');
assert.ok(combat.includes('Fokusregeneration')&&combat.includes('>+10/Sek.<'),'Verified continuous Focus regeneration is shown');
assert.ok(combat.includes('Angriffskraft aus Dolly')&&combat.includes('Nahkampf-/Fernkampf-Angriffskraft'),'AP inheritance remains blocked without an unambiguous highest AP source');
assert.ok(!combat.includes('Referenzmodell')&&!combat.includes('Clientdaten')&&!combat.includes('Offiziell'),'Combat panel does not expose technical evidence categories');
assert.ok(combat.includes('Warum fehlen Gesamtleben, Gesamtrüstung und DPS?'),'Combat panel explains the strict calculation boundary');
assert.ok(combat.includes('Trefferchance und Expertise')&&combat.includes('Autoangriffe'),'Hit, expertise and white-swing crit stay outside unsupported total calculations');
const derived=hunterPetCombatProfile(petDolly);
assert.equal(derived.inherited.health.value,60);
assert.equal(derived.inherited.armor.value,76.8);
assert.equal(derived.inherited.crit.value,5.0689);
assert.equal(derived.focus.maximum,150);
assert.equal(derived.focus.regenPerSecond,10);
assert.equal(derived.enduranceTraining.rank,1);

ui.render(petData,{petRules:verifiedPetRules,petCatalog:verifiedPetCatalog});
const petCards=nodes.get('#cards').innerHTML;
assert.ok(!petCards.includes('Quellenstand aktuell'),'Normal player view hides technical source status');
assert.ok(!petCards.includes('Referenzmodell')&&!petCards.includes('Clientdaten')&&!petCards.includes('Offiziell')&&!petCards.includes('Regelstatus-Protokoll'),'Normal player view hides evidence and rule-history jargon');
const blockedRules=structuredClone(verifiedPetRules);
blockedRules.overall='review_required';
blockedRules.rules['fox.family.profile'].status='review_required';
blockedRules.rules['fox.training'].status='review_required';
blockedRules.rules['pet.scaling'].status='review_required';
blockedRules.rules['pet.crit.inheritance'].status='review_required';
blockedRules.rules['pet.autoswing.crit'].status='review_required';
blockedRules.rules['pet.expertise'].status='review_required';
blockedRules.rules['pet.focus'].status='review_required';
blockedRules.rules['pet.health.global'].status='review_required';
ui.render(petData,{petRules:blockedRules,petCatalog:verifiedPetCatalog});
const blockedPetPanel=ui.hunterPetsPanel(petDolly);
assert.ok(blockedPetPanel.includes('Einige Begleiterwerte werden gerade geprüft'),'A detected rule change is shown in player-friendly language');
assert.ok(blockedPetPanel.includes('Familienprofil vorübergehend nicht verfügbar'),'Family values fail closed when their rule changes');
assert.ok(blockedPetPanel.includes('Ausbildungsdaten vorübergehend nicht verfügbar'),'Training values fail closed when their rule changes');
assert.ok(blockedPetPanel.includes('Slydris')&&blockedPetPanel.includes('Stufe 6'),'Blizzard live identity stays visible even when rules are blocked');
assert.ok(!blockedPetPanel.includes('<small>Schaden</small>'),'Blocked rule-derived family numbers are not rendered');
assert.ok(!blockedPetPanel.includes('Gesundheit aus Dolly'),'Blocked scaling rule hides inherited calculations');
assert.ok(!blockedPetPanel.includes('>115 %<'),'Blocked health rule hides the global health factor');
assert.ok(!blockedPetPanel.includes('Maximaler Fokus'),'Blocked focus rule hides focus mechanics');
const critSourceBlocked=structuredClone(verifiedPetRules);
critSourceBlocked.overall='review_required';
critSourceBlocked.rules['pet.crit.inheritance'].status='review_required';
ui.render(petData,{petRules:critSourceBlocked,petCatalog:verifiedPetCatalog});
const critBlockedPanel=ui.hunterPetCombatPanel(petDolly,petDolly.hunterPets.active[0]);
assert.ok(critBlockedPanel.includes('Gesundheit aus Dolly')&&critBlockedPanel.includes('Rüstung aus Dolly'),'Independent scaling contributions remain visible when only the official crit-source rule is blocked');
assert.ok(!critBlockedPanel.includes('Vererbte Krit-Komponente aus Dolly'),'Crit component fails closed independently when its official source rule is blocked');

const staleRuleVersion=structuredClone(verifiedPetRules);
staleRuleVersion.rulebookVersion='2026.11.21.3';
ui.render(petData,{petRules:staleRuleVersion,petCatalog:verifiedPetCatalog});
const staleVersionPanel=ui.hunterPetsPanel(petDolly);
assert.ok(staleVersionPanel.includes('Einige Begleiterwerte sind vorübergehend nicht verfügbar'),'A stale rulebook version is never trusted by the new frontend');
assert.ok(!staleVersionPanel.includes('Gesundheit aus Dolly'),'New calculations remain hidden until the matching rulebook version is verified');
ui.render(petData,{petRules:verifiedPetRules,petCatalog:verifiedPetCatalog});

ui.render(petData,{petRules:verifiedPetRules,petCatalog:verifiedPetCatalog});
assert.equal((petCards.match(/>Begleiter<\/button>/g)||[]).length,1,'Only the hunter gets a companion tab');
assert.ok(ui.characterTabsFor(petDolly).some(tab=>tab.id==='pets'),'Hunter tab model includes companions');
assert.ok(!ui.characterTabsFor(petData.characters.find(c=>c.slug==='cole-dalton')).some(tab=>tab.id==='pets'),'Non-hunters do not get a companion tab');

const questData=structuredClone(data);
const questBySlug=new Map(questData.characters.map(character=>[character.slug,character]));
for(const character of questData.characters){
  character.activeQuests=[];
  character.completedQuestIds=[];
  character.questsVerified=true;
  character.completedQuestsVerified=true;
}
questBySlug.get('cole-dalton').activeQuests=[
  {id:1001,name:'Gemeinsam für alle'},
  {id:1002,name:'Gemeinsam für drei'},
  {id:1003,name:'Gemeinsam für zwei'},
  {id:1004,name:'Nur für Cole'}
];
questBySlug.get('chucky-dalton').activeQuests=[
  {id:1001,name:'Gemeinsam für alle'},
  {id:1002,name:'Gemeinsam für drei'},
  {id:1003,name:'Gemeinsam für zwei'}
];
questBySlug.get('dolly-dalton').activeQuests=[
  {id:1001,name:'Gemeinsam für alle'},
  {id:1002,name:'Gemeinsam für drei'}
];
questBySlug.get('viola-dalton').activeQuests=[{id:1001,name:'Gemeinsam für alle'}];
questBySlug.get('dolly-dalton').completedQuestIds=[1003];
questBySlug.get('viola-dalton').completedQuestIds=[1003,1004];
ui.render(questData,{questCatalog:{1001:{id:1001,title:'Gemeinsam für alle',description:'Erledige die gemeinsame Aufgabe.',area:'Testgebiet',minimumLevel:10}}});
const questCards=nodes.get('#cards').innerHTML;
const coleMarker=questCards.indexOf('<h2 class="name">Cole Dalton</h2>');
const coleStart=questCards.lastIndexOf('<article class="card ',coleMarker);
const coleEnd=questCards.indexOf('</article>',coleMarker);
const coleArea=questCards.slice(coleStart,coleEnd);
const q1=coleArea.indexOf('Gemeinsam für alle');
const q2=coleArea.indexOf('Gemeinsam für drei');
const q3=coleArea.indexOf('Gemeinsam für zwei');
const q4=coleArea.indexOf('Nur für Cole');
assert.ok(q1>=0&&q1<q2&&q2<q3&&q3<q4,'Quests werden bei jedem Rendern gruppenweit 4/4 → 3/4 → 2/4 → 1/4 sortiert');
assert.ok(coleArea.includes('Auch offen: Chucky · Dolly · Viola'),'Gemeinsame Quest nennt alle anderen offenen Daltons');
assert.ok(coleArea.includes('Auch offen: Chucky'),'2/4-Quest nennt den anderen offenen Dalton');
assert.ok(coleArea.includes('Bereits abgeschlossen: Dolly · Viola'),'Questvergleich nennt andere Daltons, die die Quest bereits abgeschlossen haben');
assert.ok(coleArea.includes('Bereits abgeschlossen: Viola'),'Individuelle offene Quest kann einen bereits fertigen Dalton nennen');
assert.ok(!coleArea.includes('Auch offen: Cole'),'Aktueller Charakter wird in der Auch-offen-Liste nicht wiederholt');
assert.ok(!coleArea.includes('Bereits abgeschlossen: Cole'),'Aktueller Charakter wird in der Abschlussliste nicht wiederholt');
assert.ok(coleArea.includes('Beschreibung & Gebiet'),'Questdetails sind innerhalb des Quest-Reiters aufklappbar');
assert.ok(coleArea.includes('Erledige die gemeinsame Aufgabe.'),'Zentraler Quest-Katalog liefert die Blizzard-Beschreibung in die Anzeige');
assert.ok(coleArea.includes('Testgebiet'),'Questgebiet wird aus dem zentralen Katalog angezeigt');
ui.render(data);
// The hero illustration remains unchanged, including its static colour overlay.
// Character renders belong exclusively to the profile cards below the banner.
assert.ok(read('index.html').includes('<div id="heroCast" class="hero-cast" aria-hidden="true"></div>'),
  'Preserve the static hero layer and its colour treatment');
assert.ok(css.includes('.hero-cast::after{'),'Preserve the original hero overlay');
assert.equal(nodes.get('#heroCast')?.innerHTML??'', '', 'Hero must not contain dynamic character images');
assert.ok(!source.includes('hero-figure'), 'No character renders may be injected into the hero');
const cards=nodes.get('#cards').innerHTML;
assert.equal((cards.match(/class="profession"/g)||[]).length,data.characters.reduce((n,c)=>n+c.professions.length,0));
const testMainStatEnums=new Set(['HEALTH','MANA','STRENGTH','INTELLECT','AGILITY','STAMINA','CRITICALSTRIKE','SPIRIT','ATTACKDPS','MANAREGEN']);
const expectedMainStats=data.characters.reduce((n,c)=>n+(c.statsDetails||[]).filter(entry=>testMainStatEnums.has(entry.enum)).length,0);
const expectedDetailStats=data.characters.reduce((n,c)=>n+(c.statsDetails||[]).filter(entry=>!testMainStatEnums.has(entry.enum)).length,0);
assert.equal((cards.match(/class="stat-tile stat-tile-main"/g)||[]).length,expectedMainStats);
assert.equal((cards.match(/class="stat-tile stat-tile-detail"/g)||[]).length,expectedDetailStats);
assert.equal((cards.match(/class="profession-rank"/g)||[]).length,0,'No manually translated profession rank is rendered');
assert.ok(css.includes('.roster-title{flex:1 1 auto;min-width:0}'),'Shared roster title can shrink on narrow screens');
assert.ok(css.includes('#compareContent{min-width:0;max-width:100%}'),'Comparison content is constrained to the viewport');
assert.ok(css.includes('.compare-scroll{width:100%;min-width:0;max-width:100%;overflow-x:auto'),'Only the comparison table scroller may overflow horizontally');
assert.ok(css.includes('.roster-rule{display:none}'),'Decorative roster rules are removed on narrow screens');
assert.equal((cards.match(/class="profession-scale"/g)||[]).length,4,'Every character shows a shared 300-point reference');
assert.equal((cards.match(/class="profession-overlay"/g)||[]).length,20,'One visible fraction in each bar');
assert.ok(ui.characterTabsFor({slug:'dolly-test',classId:3,class:'Jägerin'}).some(tab=>tab.id==='pets'),
  'Hunter companion tab is keyed by class ID and remains visible for Blizzard de-DE class name Jägerin');
assert.ok(!ui.characterTabsFor({slug:'mage-test',classId:8,class:'Magier'}).some(tab=>tab.id==='pets'),
  'Non-hunters do not receive the companion tab');
assert.ok(ui.characterTabsFor({slug:'mage-test',classId:8,class:'Magier'}).some(tab=>tab.id==='abilities'),
  'Every class gets the Klassenfähigkeiten tab');
assert.ok(ui.characterTabsFor({slug:'mage-test',classId:8,class:'Magier'}).some(tab=>tab.id==='game'&&tab.label==='Instanzen & Dungeons'),
  'Every character gets the Instanzen & Dungeons tab');
const spellbookOpen=ui.classAbilitiesPanel({slug:'cole-dalton',name:'Cole Dalton',knownClassAbilitiesVerified:false,knownClassAbilities:[]});
assert.ok(spellbookOpen.includes('WoW-Forever-AddOn erforderlich'));
assert.ok(spellbookOpen.includes('CurseForge'));
assert.ok(!spellbookOpen.includes('/dalton')&&!spellbookOpen.includes('Spellbook übernehmen'),'Dashboard darf keinen manuellen Spellbook-Code mehr verlangen');
const gameStatusMissing=ui.gameStatusPanel({slug:'chucky-dalton',name:'Chucky Dalton',classId:11});
assert.ok(gameStatusMissing.includes('WoW-Forever-AddOn erforderlich')&&gameStatusMissing.includes('CurseForge'),'Instanzbereich erklärt vor dem ersten Sync die AddOn-Voraussetzung');
const presence=ui.addonPresence({slug:'cole-dalton',name:'Cole Dalton'},{
  currentLocation:{zone:'Die Insel Zephras',subZone:'Valanaar',x:.621,y:.734,bindLocation:'Valanaar'}
});
assert.ok(presence.includes('Ruhestein')&&presence.includes('Valanaar')&&presence.includes('62.1 / 73.4'),'Ruhestein und letzter Standort stehen direkt bei der Charakteraktivität');
const gameStatusSynced=ui.gameStatusPanel({slug:'cole-dalton',name:'Cole Dalton',classId:8},{
  receivedAt:'2026-11-24T09:30:00.000Z',
  visitedInstances:[
    {name:'Die Tiefenmine',instanceType:'party',instanceID:321,difficultyID:1,difficultyName:'Normal',lastSeenAt:'2026-11-23T20:00:00.000Z'},
    {name:'Der alte Raid',instanceType:'raid',instanceID:654,difficultyID:1,difficultyName:'Normal',lastSeenAt:'2026-11-22T20:00:00.000Z'}
  ],
  lockouts:[
    {name:'Die Tiefenmine',instanceID:321,difficultyID:1,difficultyName:'Normal',resetAt:'2026-11-25T09:30:00.000Z',locked:true,numEncounters:4,encounterProgress:4},
    {name:'Offene Höhlen',instanceID:999,difficultyID:1,difficultyName:'Normal',locked:true,numEncounters:5,encounterProgress:2}
  ]
});
assert.ok(gameStatusSynced.includes('Instanzen &amp; Dungeons')&&gameStatusSynced.includes('3 erfasst'),'Instanzbereich zählt eindeutige besuchte oder aktuell gebundene Instanzen');
assert.ok(gameStatusSynced.includes('Die Tiefenmine')&&gameStatusSynced.includes('Abgeschlossen'),'Vollständiger Bossfortschritt wird als abgeschlossen bezeichnet');
assert.ok(gameStatusSynced.includes('Offene Höhlen')&&gameStatusSynced.includes('2/5 Bosse'),'Teilfortschritt bleibt sichtbar');
assert.ok(gameStatusSynced.includes('Der alte Raid')&&gameStatusSynced.includes('Besucht'),'Historisch erkannte Instanz ohne aktuellen Fortschritt wird nur als besucht bezeichnet');
assert.ok(!gameStatusSynced.includes('Ruhestein')&&!gameStatusSynced.includes('Letzter Standort'),'Standortdaten sind nicht mehr Teil des Instanz-Reiters');
assert.ok(!gameStatusSynced.includes('Lockouts'),'Technische Lockout-Terminologie wird nicht angezeigt');

const spellbookVerified=ui.classAbilitiesPanel({
  slug:'cole-dalton',name:'Cole Dalton',knownClassAbilitiesVerified:true,
  knownClassAbilitiesCapturedAt:'2026-11-23T05:55:00.000Z',
  knownClassAbilities:[
    {id:133,name:'Feuerball',rank:'Rang 1',iconUrl:'https://blob.example/spell-133.webp'},
    {id:143,name:'Feuerball',rank:'Rang 2',iconUrl:'https://blob.example/spell-143.webp',inferredFromHigherRank:true}
  ]
});
assert.ok(spellbookVerified.includes('1 gelernte Fähigkeiten'));
assert.ok(spellbookVerified.includes('Feuerball')&&spellbookVerified.includes('Rang 2'));
assert.ok(spellbookVerified.includes('Durch höheren bekannten Rang mitgelernt'));
assert.ok(spellbookVerified.includes('class="spellbook-ability-icon"')&&spellbookVerified.includes('https://blob.example/spell-143.webp'),'Gelernte Klassenfähigkeiten zeigen das archivierte Zauberbild vorne an');
const expectedCharacterTabs=data.characters.reduce((count,character)=>count+8+(Number(character.classId)===3?1:0),0);
assert.equal((cards.match(/data-character-tab=/g)||[]).length,expectedCharacterTabs,'Only hunters receive the additional companion tab');
assert.equal((cards.match(/class="character-tab is-active"/g)||[]).length,data.characters.length,'Exactly one tab is initially active per character');
assert.equal((cards.match(/data-character-panel=/g)||[]).length,expectedCharacterTabs,'All applicable tab panels remain available without showing them at once');
assert.ok(source.includes("setActiveCharacterTab(button.dataset.characterSlug,button.dataset.characterTab)"),'A tab click changes only the selected character card');
assert.ok(source.includes('function addonDataRequirement'),'AddOn-abhängige Dashboardbereiche verwenden eine zentrale Statuskomponente');
assert.ok(!source.includes('data-spellbook-code')&&!source.includes('Spellbook übernehmen'),'Manueller Spellbook-Code ist aus der Dashboard-Oberfläche entfernt');
assert.ok(css.includes('.section h3::before{content:"";display:inline-block;width:7px'));
assert.ok(css.includes('.character-presence{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'),'Ruhestein und Standort nutzen auf breiten Displays ein Zweispaltenraster');
assert.ok(css.includes('@media(max-width:520px){\n  .character-presence{grid-template-columns:1fr}'),'Ruhestein und Standort fallen auf schmalen Displays auf eine Spalte zurück');
assert.ok(css.includes('.addon-instance-list{display:grid'),'Instanz- und Dungeonliste nutzt das zentrale responsive Listenmuster');
assert.ok(css.includes('.details summary::before{content:"›";font-size:1.25rem;line-height:1;color:var(--class,#d6b27a)}'));
const wowClassColors={mage:'#3fc7eb',hunter:'#aad372',druid:'#ff7c0a'};
for(const [klass,color] of Object.entries(wowClassColors)){
  assert.ok(css.includes('--wow-class-'+klass+':'+color+';'),klass+' canonical WoW class token is exact');
  assert.ok(css.includes('.card.'+klass+'{--class:var(--wow-class-'+klass+');'),klass+' card consumes the canonical WoW class token');
  const marker='.card.'+klass+'{\n  --skill-light:';
  const paletteStart=css.indexOf(marker);
  assert.ok(paletteStart>=0,klass+' has unique skill palette');
  const block=css.slice(paletteStart,css.indexOf('}',paletteStart)+1);
  assert.ok(block.includes('--skill-mid:var(--class)'),klass+' progress fill consumes the same canonical class color');
}
assert.ok(!css.includes('#67d4f0'),'Former lightened Mage class color must not return');
assert.ok(!css.includes('#ff9b48'),'Former lightened Druid class color must not return');

const wowQualityColors={
  poor:'#9d9d9d',common:'#ffffff',uncommon:'#1eff00',rare:'#0070dd',
  epic:'#a335ee',legendary:'#ff8000',artifact:'#e6cc80',heirloom:'#00ccff'
};
for(const [quality,color] of Object.entries(wowQualityColors)){
  assert.ok(css.includes('--wow-quality-'+quality+':'+color+';'),quality+' canonical WoW quality token is exact');
  assert.ok(css.includes('.quality-'+quality+'{color:var(--wow-quality-'+quality+')}'),quality+' display consumes the canonical WoW quality token');
}

const definedCustomProperties=new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match=>match[1]));
for(const match of css.matchAll(/var\((--[\w-]+)/g)){
  assert.ok(definedCustomProperties.has(match[1]),'CSS custom property is defined before use: '+match[1]);
}
assert.ok(css.includes('.profession-segment.is-unlocked{background:linear-gradient(180deg,var(--skill-open-top'),'The unlocked stage uses class shades');
assert.ok(css.includes('var(--skill-mid,#6fc6c3)'),'The achieved section uses class color');
assert.ok(css.includes('.experience-fill{position:absolute;inset:0 auto 0 0;min-width:0;background:linear-gradient(180deg,var(--skill-light,#b6efe4) 0%,var(--skill-mid,#6fc6c3) 33%,var(--skill-bottom,#368998) 78%,var(--skill-shadow,#226c80) 100%)'),'XP uses the same four-stop class palette as professions and reputation');
assert.ok(!css.includes('--skill-dark'),'No undefined shared XP color variable may return');
assert.ok(css.includes('.profession-legend span:nth-child(1)::before{background:var(--skill-mid'),'Achieved legend follows class');
assert.ok(css.includes('.profession-legend span:nth-child(2)::before{background:var(--skill-open-mid'),'Unlocked legend follows class');
assert.ok(css.includes('background:linear-gradient(180deg,#10171f,#171c26)'),'Locked segments stay neutral');
const sharedBarTypography='.profession-overlay,.reputation-overlay,.experience-overlay{';
assert.ok(css.includes(sharedBarTypography),'Profession, reputation and XP overlays share one typography rule');
const sharedBarStart=css.indexOf(sharedBarTypography);
const sharedBarBlock=css.slice(sharedBarStart,css.indexOf('}',sharedBarStart)+1);
assert.ok(sharedBarBlock.includes('font:var(--weight-bar) var(--type-bar)/1.2 var(--body)'),'All three progress bars use the same centralized CI typography tokens');
assert.ok(sharedBarBlock.includes('letter-spacing:.025em'),'All three progress bars use the same letter spacing');
assert.ok(sharedBarBlock.includes('font-variant-numeric:tabular-nums'),'All three progress bars align numbers consistently');
assert.ok(sharedBarBlock.includes('1px 0 #04101b,-1px 0 #04101b'),'All three progress bars use the same text shadow');

assert.equal((cards.match(/Ausrüstung anzeigen/g)||[]).length,data.characters.length);
assert.equal((cards.match(/class="equip-name quality-/g)||[]).length,data.characters.reduce((n,c)=>n+c.equipment.length,0));
assert.equal(ui.equipmentSlotOrder.length,19);
for(const [slug,klass] of Object.entries({
  'cole-dalton':'scene-cole','dolly-dalton':'scene-dolly','chucky-dalton':'scene-chucky','viola-dalton':'scene-viola'
})){
  assert.match(cards,new RegExp('portrait '+klass));
  assert.ok(css.includes('.portrait.'+klass+'::before'));
  assert.ok(css.includes('url("/'+klass+'.svg') && css.includes('.portrait.'+klass+'::before'));
  // Druid scene and hunter scene are intentionally versioned to bypass stale PWA/browser artwork caches.
  const scene=read(klass+'.svg');
  assert.match(scene,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(scene,/<\/svg>\s*$/);
  assert.ok(!scene.includes('#67d4f0'),'Scene artwork must not contain the former lightened Mage class color');
  assert.ok(!scene.includes('#ff9b48'),'Scene artwork must not contain the former lightened Druid class color');
}

const expectedCards=[
  {name:'Chucky Dalton',klass:'druid',scene:'scene-chucky',color:'#ff7c0a'},
  {name:'Cole Dalton',klass:'mage',scene:'scene-cole',color:'#3fc7eb'},
  {name:'Dolly Dalton',klass:'hunter',scene:'scene-dolly',color:'#aad372'},
  {name:'Viola Dalton',klass:'druid',scene:'scene-viola',color:'#ff7c0a'}
];
for(const {name,klass,scene,color} of expectedCards){
  const marker=cards.indexOf('<h2 class="name">'+name+'</h2>');
  const start=cards.lastIndexOf('<article class="card ',marker);
  assert.ok(start>=0 && marker>start,'Character exists: '+name);
  assert.ok(cards.slice(start,marker).startsWith('<article class="card '+klass+'">'),'Right class for '+name);
  const area=cards.slice(start,cards.indexOf('</article>',marker));
  assert.ok(area.includes('portrait '+scene+'"'),'Correct backdrop for '+name);
  assert.ok(css.includes('--wow-class-'+klass+':'+color+';'),'Canonical WoW class color for '+name);
}
// The official Blizzard profile can override Chucky's grammatically correct nickname.
// Four distinct portrait emblems: unique nickname, character name and class-inspired SVG icon.
const expectedBadges=[
  {name:'Cole Dalton',klass:'mage',firstName:'Cole',nickname:'Der Runenreiter',icon:'rune'},
  {name:'Dolly Dalton',klass:'hunter',firstName:'Dolly',nickname:'Das Adlerauge',icon:'crosshair'},
  {name:'Chucky Dalton',klass:'druid',firstName:'Chucky',nickname:data.characters.find(c=>c.slug==='chucky-dalton')?.gender==='male'?'Der Windsurfer':'Die Windsurferin',icon:'leaf'},
  {name:'Viola Dalton',klass:'druid',firstName:'Viola',nickname:'Die Sonnenwandlerin',icon:'sun'}
];
assert.equal((cards.match(/class="portrait-badge"/g)||[]).length,4,'One personalized badge per Blizzard portrait');
for(const p of expectedBadges){
  const marker=cards.indexOf('<h2 class="name">'+p.name+'</h2>');
  const start=cards.lastIndexOf('<article class="card ',marker);
  const end=cards.indexOf('</article>',marker);
  assert.ok(start>=0 && end>start,'Character card for '+p.name);
  const area=cards.slice(start,end);
  assert.ok(area.startsWith('<article class="card '+p.klass+'">'),'Correct class for badge '+p.name);
  assert.ok(area.includes('portrait-badge-firstname">'+p.firstName+'</span>'),'Correct first name for '+p.name);
  assert.ok(area.includes('portrait-badge-epithet">'+p.nickname+'</span>'),'Correct epithet for '+p.name);
  assert.ok(area.includes('portrait-badge-icon'),'SVG class icon visible for '+p.name);
}
assert.ok(!cards.includes('scene-label'),'No old place names in portrait badges');
assert.ok(css.includes('.portrait .portrait-badge{'),'Badge style exists');
assert.ok(css.includes('border:1px solid var(--class,#d4ae79)'),'Badges use class border color');
assert.ok(css.includes('.portrait-badge-symbol{'),'SVG badges styled');
const chucky=read('scene-chucky.svg'),dolly=read('scene-dolly.svg');
assert.match(chucky,/<linearGradient id="sky"[^>]*><stop stop-color="#e5b89b"/,'Chucky bright warm day');
assert.ok(chucky.includes("mining, skinning"),"Chucky mining and skinning scene");
assert.match(dolly,/<linearGradient id="sky"[^>]*><stop stop-color="#9bc4b9"/,'Dolly bright green frontier sky');
assert.ok(dolly.includes("leatherworking, skinning"),"Dolly leatherworking and skinning scene");
assert.ok(css.includes('url("/scene-chucky.svg?v=wow-colors-20261121a")'));
assert.ok(css.includes('url("/scene-dolly.svg?v=wow-colors-20261121a")'));
assert.ok(!/\.vital:last-child\s*\{\s*border-color:\s*var\(--class\)/.test(css),
  'Item-level frame must match other vital tiles, not use the class color');
assert.ok(!/\.vital:last-child\s+strong\s*\{\s*color:\s*var\(--class\)/.test(css),
  'Item-level number must use neutral color');

// Golden sheriff-star header and daylight/western landscape should not regress.
const heroHtml=read('index.html'),crest=read('dalton-crest.svg'),sky=read('skyborne-horizon.svg'),icon=read('icon.svg'),trayIcon=read('bridge-tray.svg'),bridgeBranding=read('bridge-branding.svg'),manifest=JSON.parse(read('manifest.webmanifest'));
assert.ok(heroHtml.includes('data-view-link="workshop"'),'Werkstatt ist dritter Hauptreiter');
assert.ok(heroHtml.includes('id="workshopView" class="main-view workshop-view"'),'Werkstatt nutzt verbindlichen main-view-Vertrag');
assert.ok(source.includes("location.hash==='#werkstatt'?'workshop'"),'Werkstatt hat eigene Hash-Route');
assert.ok(source.includes("workshopFetch('/api/workshop"),'Werkstatt nutzt serverseitige API');
assert.ok(source.includes("function segmentedControl("),'Binäre Ansichtsfilter verwenden die gemeinsame Segment-Komponente');
assert.ok(source.includes("segmentedControl('compare-mode'"),'Vergleich nutzt den gemeinsamen Segment-Schalter');
assert.ok(source.includes("segmentedControl('workshop-search-mode'"),'Werkstatt-Lupe nutzt den gemeinsamen Segment-Schalter');
assert.ok(source.includes("workshopState.query.trim().length<3")&&source.includes("setTimeout(()=>searchWorkshop(workshopState.query),350)"),'Werkstattsuche bündelt kurze Tippfolgen, bevor ForeverDB angefragt wird');
assert.ok(source.includes("segmentedControl('workshop-browse-mode'"),'Werkstatt-Dropdown nutzt den gemeinsamen Segment-Schalter');
assert.ok(!source.includes('compareDifferences'),'Alte Vergleichs-Checkbox ist entfernt');
assert.ok(source.includes("searchMode:'all'")&&source.includes("browseMode:'craftable'"),'Werkstatt hat die vereinbarten unabhängigen Standardfilter');
assert.ok(source.includes("scope='+encodeURIComponent(mode)"),'Lupe übergibt ihren Filtermodus an die API');
assert.ok(source.includes("overview?.browseAll")&&source.includes("overview?.browseCraftable"),'Geführte Auswahl kann zwischen Vollkatalog und Herstellbar-Katalog wechseln');
assert.ok(source.includes("fetch('/api/data-version?t='"),'Offene Dashboards prüfen eine leichte serverseitige Datenversion');
assert.ok(source.includes("setInterval(()=>{if(document.visibilityState==='visible')checkForNewData()}"),'Sichtbare Tabs prüfen den Serverstand regelmäßig');
assert.ok(source.includes("document.addEventListener('visibilitychange'"),'Rückkehr in einen versteckten Tab löst sofort eine Frischeprüfung aus');
assert.ok(source.includes("window.addEventListener('focus'"),'Fokus auf das Dashboard löst sofort eine Frischeprüfung aus');
assert.ok(source.includes("function applyServerPayload(")&&source.includes("invalidateWorkshopData({reloadVisible:true})"),'Ein zentraler Payload-Pfad aktualisiert alle Ansichten und invalidiert abgeleitete Werkstattdaten');
assert.ok(source.includes("if(!compareView.hidden)renderComparison()"),'Charaktere und Vergleich teilen denselben gerenderten Datenstand');
assert.ok(source.includes("workshopDataEpoch++"),'Veraltete laufende Werkstattanfragen können nach einem Datenwechsel nicht zurückschreiben');
assert.ok(source.includes("async function selectWorkshopItem(itemId,{preserveQuery=false,preserveQuantity=false}={})"),'Werkstatt-Auswahl unterscheidet Gegenstandswechsel von bewusstem Mengenerhalt');
assert.ok(source.includes("if(changedItem&&!preserveQuantity)workshopState.quantity=1"),'Ein anderer Gegenstand setzt die Menge auf eins zurück');
assert.ok(source.includes("selectWorkshopItem(workshopState.selected.item.id,{preserveQuery:true,preserveQuantity:true})"),'Mengenänderung am selben Gegenstand behält die gewählte Menge');
assert.ok(source.includes("selectWorkshopItem(selectedId,{preserveQuery:true,preserveQuantity:true})"),'Automatisches Neuladen desselben Gegenstands behält die gewählte Menge');
assert.ok(heroHtml.includes('href="#ortsplaner" data-view-link="planner">Ortsplaner</a>'),'Ortsplaner ersetzt den Berufsplaner als Hauptreiter');
assert.ok(heroHtml.includes('id="plannerView" class="main-view planner-view"')&&heroHtml.includes('aria-label="Ortsplaner"'),'Ortsplaner nutzt den verbindlichen main-view-Vertrag');
assert.ok(source.includes("location.hash==='#ortsplaner'")&&source.includes("location.hash==='#berufsplaner'"),'Ortsplaner hat eine eigene Hash-Route und übernimmt alte Berufsplaner-Lesezeichen');
assert.ok(source.includes("fetch('/api/location-planner?'"),'Ortsplaner nutzt die serverseitige Planner-API');
assert.ok(source.includes('data-location-category')&&source.includes('data-location-action')&&source.includes('data-location-source'),'Kategorien und NPC-Angebote verwenden die vorgesehenen Auswahlkennungen');
assert.ok(source.includes('selected:new Map()'),'Die manuelle Auswahl bildet genau ein NPC-Angebot je Lernziel ab');
assert.ok(source.includes('plannerCheapestKnownOffer'),'Die automatische Auswahl verwendet eine zentrale Preislogik');
assert.ok(source.includes('plannerState.pendingSwitch'),'Anbieterwechsel werden nicht still ausgeführt');
assert.ok(source.includes("const locationCategoryDefaults=['class-abilities','profession-recipes','profession-training','companion-abilities']"),'Alle vier Ortsplaner-Kategorien sind standardmäßig aktiv');
assert.ok(source.includes('plannerClearSelection()'),'Charakter-/Ortswechsel und Dateninvalidierung verwenden eine zentrale Auswahl-Rücksetzung');
assert.ok(source.includes('invalidateLocationPlannerData({reloadVisible:true})'),'Neue Charakterdaten invalidieren den Ortsplaner');
assert.ok(source.includes('Es erscheinen ausschließlich vollständig bestätigte Erledigungen')||source.includes('nur bestätigte Dinge'),'Ortsplaner erklärt seine fail-closed Auswahl');
assert.ok(css.includes('.planner-view{')&&css.includes('.planner-recipe-choice{')&&css.includes('.planner-npc-avatar{'),'Ortsplaner verwendet die bestehende tokenbasierte Dalton-CI inklusive NPC-Avatar');
assert.ok(css.includes('.main-navigation{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}'),'Vier Hauptreiter bleiben auf Mobilgeräten ohne Seiten-Scroll bedienbar');
assert.ok(css.includes('.segmented-control{')&&css.includes('.segmented-option.is-active'),'Segment-Schalter ist als gemeinsame Dalton-CI-Komponente gestaltet');

const plannerAction={
  key:'recipe:9001',name:'Testrezept',category:'profession-recipes',
  source:{key:'npc:2',name:'Günstig',role:'Händler',sourceType:'vendor',location:{zone:'Sturmwind'},priceCopper:80,priceSource:'forever-observed'},
  alternatives:[
    {key:'npc:1',name:'Teuer',role:'Händler',sourceType:'vendor',location:{zone:'Sturmwind'},priceCopper:100,priceSource:'forever-observed'},
    {key:'npc:3',name:'Unbekannt',role:'Händler',location:{zone:'Sturmwind'},priceCopper:null}
  ]
};
const plannerData={actions:[plannerAction],categories:[{id:'profession-recipes',label:'Berufsrezepte'}]};
ui.plannerState.categories=new Set(['profession-recipes']);
ui.plannerState.selected.clear();
ui.plannerState.pendingSwitch=null;
assert.equal(ui.plannerKnownCopper(null),null,'Fehlender Preis bleibt unbekannt und wird niemals zu 0 Kupfer');
assert.equal(ui.plannerKnownCopper(''),null,'Leerer Preis bleibt unbekannt');
assert.equal(ui.plannerPrice(null),'Preis noch nicht bekannt','Fehlender Preis wird sichtbar als unbekannt ausgewiesen');
assert.equal(ui.plannerPriceSourceLabel({priceCopper:100,priceSource:'forever-observed'}),'','Bestätigte Forever-Preise tragen kein Sonderlabel');
assert.equal(ui.plannerPriceSourceLabel({priceCopper:100,priceSource:'classic'}),'Classic-Preis · noch nicht in Forever bestätigt');
assert.ok(!ui.plannerNpcHtml({key:'npc:2',name:'Günstig',role:'Händler',location:{zone:'Sturmwind'}},plannerData,[plannerAction]).includes('Forever-Preis'),'Bestätigte Preise bleiben auch in NPC-Karten unlabeled');
assert.equal(ui.plannerCheapestKnownOffer(plannerAction)?.key,'npc:2','Günstigstes bestätigtes Angebot wird erkannt');
const mixedTrustAction={
  key:'recipe:trust',name:'Vertrauens-Test',category:'profession-recipes',
  source:{key:'npc:10',name:'Forever',role:'Lehrer',sourceType:'trainer',location:{zone:'Sturmwind'},priceCopper:100,priceSource:'forever-observed'},
  alternatives:[{key:'npc:11',name:'Classic billiger',role:'Lehrer',sourceType:'trainer',location:{zone:'Sturmwind'},priceCopper:50,priceSource:'classic'}]
};
assert.equal(ui.plannerCheapestKnownOffer(mixedTrustAction)?.key,'npc:10','Bestätigter Forever-Preis schlägt einen billigeren unbestätigten Classic-Fallback');
ui.plannerSelectAllVisible(plannerData);
assert.equal(ui.plannerState.selected.get(plannerAction.key),'npc:2','Alle auswählen legt das Lernziel einmal beim günstigsten Anbieter ab');
assert.equal(ui.plannerState.selected.size,1,'Ein Lernziel erzeugt nur eine Auswahlposition');
const selectedCost=ui.plannerSelectedActions(plannerData).reduce((sum,action)=>sum+(ui.plannerKnownCopper(action.source?.priceCopper)??0),0);
assert.equal(selectedCost,80,'Gesamtkosten enthalten das eindeutige Lernziel genau einmal zum günstigsten bestätigten Preis');
assert.ok(ui.plannerSelectionHtml(plannerData).includes(ui.plannerPrice(80)),'Gerenderte Gesamtliste zeigt den gewählten günstigsten Preis');
assert.equal(ui.plannerRequestOfferSelection(plannerAction.key,'npc:1',true),'conflict','Zweites Angebot desselben Lernziels erzeugt einen Wechselkonflikt');
assert.equal(ui.plannerState.selected.get(plannerAction.key),'npc:2','Konflikt verändert die bestehende Auswahl noch nicht');
assert.equal(ui.plannerSwitchHtml(plannerAction,plannerAction.source),'','Konflikthinweis erscheint nicht beim weiterhin ausgewählten alten Anbieter');
assert.ok(ui.plannerSwitchHtml(plannerAction,plannerAction.alternatives[0]).includes('Bisherige Auswahl behalten'),'Konflikthinweis erscheint direkt beim neu angeklickten Angebot und bietet Beibehalten an');
assert.ok(ui.plannerSwitchHtml(plannerAction,plannerAction.alternatives[0]).includes('Zu Teuer wechseln'),'Konflikthinweis bietet dort den expliziten Wechsel an');
assert.ok(ui.plannerSwitchHtml(plannerAction,plannerAction.alternatives[0]).includes('role="alert"'),'Konflikthinweis wird als unmittelbar relevante Meldung ausgezeichnet');
ui.plannerKeepSelection();
assert.equal(ui.plannerState.pendingSwitch,null,'Bisherige Auswahl behalten schliesst nur den Konflikt');
assert.equal(ui.plannerState.selected.get(plannerAction.key),'npc:2','Bisherige Auswahl behalten lässt den günstigeren Anbieter unverändert');
assert.equal(ui.plannerRequestOfferSelection(plannerAction.key,'npc:1',true),'conflict');
assert.equal(ui.plannerConfirmSwitch(),true);
assert.equal(ui.plannerState.selected.get(plannerAction.key),'npc:1','Bestätigter Wechsel ersetzt die Quelle atomar');
assert.equal(ui.plannerState.selected.size,1,'Auch nach einem Wechsel existiert nur eine Auswahlposition');
assert.ok(ui.plannerPriceWarningHtml(plannerAction,plannerAction.alternatives[0]).includes('Günstiger verfügbar'),'Teurere manuelle Auswahl weist auf den günstigeren Anbieter hin');
assert.ok(ui.plannerPriceWarningHtml(plannerAction,plannerAction.alternatives[0]).includes('Günstig'),'Preiswarnung nennt den günstigeren NPC');
ui.plannerSelectAllVisible(plannerData);
assert.equal(ui.plannerState.selected.get(plannerAction.key),'npc:2','Automatische Auswahl normalisiert eine teurere manuelle Auswahl wieder auf den günstigsten Anbieter');
assert.equal(ui.plannerSelectedActions(plannerData).length,1,'Gesamtsumme arbeitet mit eindeutigen Lernzielen statt Händlerzeilen');
const tiedAction={
  key:'recipe:9002',name:'Preisgleiches Rezept',category:'profession-recipes',
  source:{key:'npc:4',name:'Gleich A',role:'Händler',location:{zone:'Sturmwind'},priceCopper:50},
  alternatives:[{key:'npc:5',name:'Gleich B',role:'Händler',location:{zone:'Sturmwind'},priceCopper:50}]
};
assert.equal(ui.plannerPriceWarningHtml(tiedAction,tiedAction.alternatives[0]),'','Preisgleichstand erzeugt keine falsche Preiswarnung');
const rankAction={
  key:'profession-rank:alchemy:2',name:'Alchemie · Geselle',category:'profession-training',
  source:{key:'npc:6',name:'Lehrer',role:'Lehrer',sourceType:'trainer',location:{zone:'Sturmwind'},priceCopper:500,priceSource:'classic'},
  alternatives:[]
};
const twoTargets={actions:[plannerAction,rankAction],categories:[...plannerData.categories,{id:'profession-training',label:'Berufsausbildung'}]};
ui.plannerState.categories=new Set(['profession-recipes','profession-training']);
ui.plannerState.selected.clear();
ui.plannerSelectAllVisible(twoTargets);
assert.equal(ui.plannerState.selected.size,2,'Tatsächlich verschiedene Lernziele bzw. Ränge bleiben separat auswählbar');
assert.equal(ui.plannerSelectedActions(twoTargets).length,2,'Getrennte Ränge werden nicht miteinander dedupliziert');
const unknownClassAction={
  key:'class-spell:205',name:'Frostblitz · Rang 2',category:'class-abilities',requiredLevel:8,learnedState:'unknown',iconUrl:'https://blob.example/spell-205.webp',
  source:{key:'npc:331',name:'Magierlehrer',role:'Lehrer',sourceType:'trainer',location:{zone:'Sturmwind'},priceCopper:200,priceSource:'forever-observed'},
  alternatives:[]
};
const verifiedClassAction={...unknownClassAction,key:'class-spell:2136',name:'Feuerschlag · Rang 1',id:2136,learnedState:'not-known'};
const classPlannerData={actions:[unknownClassAction,verifiedClassAction],categories:[{id:'class-abilities',label:'Klassenfähigkeiten'}]};
ui.plannerState.categories=new Set(['class-abilities']);
ui.plannerState.selected.clear();
ui.plannerSelectAllVisible(classPlannerData);
assert.equal(ui.plannerState.selected.has(unknownClassAction.key),false,'Unbekannter persönlicher Klassen-Lernstand wird nie automatisch ausgewählt');
assert.equal(ui.plannerState.selected.has(verifiedClassAction.key),true,'Verifiziert noch nicht gelernter Klassenrang bleibt automatisch auswählbar');
assert.ok(ui.plannerNpcHtml({key:'npc:331',name:'Magierlehrer',role:'Lehrer',location:{zone:'Sturmwind'}},classPlannerData,[unknownClassAction]).includes('Persönlicher Lernstand noch nicht automatisch auslesbar'),'Offener Klassen-Lernstand wird direkt am Lernziel sichtbar');
const plannerClassHtml=ui.plannerNpcHtml({key:'npc:331',name:'Magierlehrer',role:'Lehrer',location:{zone:'Sturmwind'}},classPlannerData,[unknownClassAction]);
assert.ok(plannerClassHtml.includes('class="planner-action-icon"')&&plannerClassHtml.includes('https://blob.example/spell-205.webp'),'Klassenfähigkeiten zeigen im Ortsplaner das Zauberbild vor dem Namen');
assert.ok(plannerClassHtml.includes('planner-npc-avatar is-fallback'),'NPC ohne verfügbares Renderbild behält einen sichtbaren Avatarplatz');
ui.plannerState.categories=new Set(['profession-recipes','profession-training']);
ui.plannerState.selected.clear();
ui.plannerSelectAllVisible(twoTargets);
const mixedSelectionHtml=ui.plannerSelectionHtml(twoTargets);
assert.ok(mixedSelectionHtml.includes('Voraussichtliche Gesamtkosten'),'Classic-Preis kennzeichnet die Gesamtsumme als voraussichtlich');
assert.ok(mixedSelectionHtml.includes('noch nicht in Forever bestätigten Classic-Preisen'),'Classic-Anteil der Gesamtsumme wird transparent ausgewiesen');

assert.ok(heroHtml.includes('WANTED · AZEROTH'));
assert.ok(heroHtml.includes('Vier Abenteurer. Eine berüchtigte Bande.'));
assert.ok(heroHtml.includes('Noch keine Legenden, aber schon gesucht.'),'Hero uses grammatically correct comma');
assert.ok(heroHtml.includes('CHUCKY · COLE · DOLLY · VIOLA'));
assert.ok(!heroHtml.includes('Vier Himmelsgeborene. Ein wilder Himmel.'));
assert.match(crest,/sechszackiger Dalton-Sheriffstern/);
assert.ok(crest.includes('>D</text>') && crest.includes('url(#blueEnamel)'));
assert.ok(icon.includes('Dalton-Sheriffstern')&&icon.includes('>D</text>'),'Dashboard-App-Icon uses the Dalton sheriff-star D');
assert.ok(icon.includes('<rect width="512" height="512" fill="url(#bg)"/>'),'Dashboard app icon is opaque and full-bleed for macOS maskable icons');
assert.ok(trayIcon.includes('kompakt')&&trayIcon.includes('>D</text>'),'Compact Dalton icon remains recognizable at small sizes');
assert.ok(bridgeBranding.includes('Branding Sheriffstern')&&bridgeBranding.includes('stroke-dasharray="7 11"'),'Bridge branding keeps the more ornate selected variant');
assert.equal(manifest.icons.length,3,'Web app manifest exposes Android any, Android maskable and iOS raster fallback icons');
assert.equal(manifest.icons[0].src,'/android-icon.svg');
assert.equal(manifest.icons[0].sizes,'any');
assert.equal(manifest.icons[0].purpose,'any','Android regular icon uses the full-bleed Dalton sheriff-star');
assert.equal(manifest.icons[1].src,'/android-icon-maskable.svg');
assert.equal(manifest.icons[1].sizes,'any');
assert.equal(manifest.icons[1].purpose,'maskable','Android adaptive icon uses the padded maskable Dalton sheriff-star');
assert.equal(manifest.icons[2].src,'/apple-touch-icon.png?v=ios-20261124c','iOS PNG remains available as raster fallback');
assert.ok(heroHtml.includes('<link rel="icon" href="/bridge-tray.svg"'),'Compact variant is used as the browser favicon');
assert.ok(heroHtml.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=ios-20261124c" sizes="180x180">'),'iOS receives a real PNG Dalton sheriff-star as Apple touch icon');
assert.equal(manifest.icons[0].purpose,'any','Android regular manifest icon uses the unambiguous any purpose');
const sw=read('sw.js');
assert.ok(sw.includes('"/icon.svg"')&&sw.includes('"/android-icon.svg"')&&sw.includes('"/android-icon-maskable.svg"')&&sw.includes('"/bridge-tray.svg"')&&sw.includes('"/bridge-branding.svg"')&&sw.includes('"/apple-touch-icon.png?v=ios-20261124c"'),'All Dalton branding icons including Android and iOS variants are available offline');
const addonCi=read('.github/workflows/addon-ci.yml');
assert.ok(addonCi.includes('Dalton Dashboard Bridge.svg')&&addonCi.includes('Dalton Dashboard Kompakt.svg'),'Bridge player packages ship the matching icon family');
assert.ok(sky.includes('url(#day)') && sky.includes('url(#sunMist)'));
const mobileSky=read('skyborne-mainstreet-mobile.svg');
for(const scene of [sky,mobileSky]){
  assert.ok(scene.includes('SALOON') && scene.includes('water tower') && scene.includes('Telegraph'),'Main Street must show three distinctive Western elements');
  assert.ok(scene.includes('Wide dusty main street') && scene.includes('url(#road)'),'Street creates perspective to the horizon');
  assert.ok(!scene.includes('floating island') && !scene.includes('Hoher Orden'),'No old skyborne/Order motifs');
}
assert.ok(mobileSky.includes('width="900" height="1200"'),'Separate portrait asset for iPhone');
assert.ok(sky.includes('width="1600" height="730"'),'Wide desktop asset for hero');
assert.ok(css.includes('skyborne-mainstreet-mobile.svg?v=mainstreet-20261120c'),'Mobile composition active in CSS');
const cssAssetVersion=heroHtml.split('styles.css?v=')[1]?.split('"')[0];
const jsAssetVersion=heroHtml.split('app.js?v=')[1]?.split('"')[0];
assert.ok(cssAssetVersion && jsAssetVersion,'CSS and JS each have a cache-busting version (they may differ when only one asset changes)');
assert.ok(read('sw.js').includes('/styles.css?v='+cssAssetVersion) && read('sw.js').includes('/app.js?v='+jsAssetVersion),'Service worker uses the current CSS and JS asset versions');
assert.ok(read('sw.js').includes('skyborne-mainstreet-mobile.svg?v=mainstreet-20261120c'),'Offline cache includes portrait scene');

assert.ok(!sky.includes('url(#moon)') && !sky.includes('#071526'));
assert.ok(css.includes('skill-energy-flow 3.8s linear infinite'));
assert.ok(css.includes('skill-light-sweep 7.6s ease-in-out infinite'));
assert.ok(css.includes('.profession-segment-fill::before{') && css.includes('.profession-segment-fill::after{'));
assert.ok(css.includes('prefers-reduced-motion:reduce'));


// Daten werden ausschliesslich ueber /api/refresh beim Klick aktualisiert;
// GitHub prueft bei Code-Pushes nur noch die Tests, ohne Daten zu committen.
const updateWorkflow=read('.github/workflows/update-data.yml');
const refreshApi=read('api/refresh.js');
const refreshService=read('scripts/refresh-service.mjs');
const vercelConfig=read('vercel.json');
assert.ok(!/^\s*schedule:/m.test(updateWorkflow),'No timed GitHub data updates');
assert.ok(!updateWorkflow.includes('official-scrape.mjs'),'CI no longer scrapes Blizzard automatically');
assert.ok(!updateWorkflow.includes('git push'),'CI must never publish timestamp-only data commits');
assert.ok(updateWorkflow.includes('run: npm test'),'Keep tests on code changes');
assert.ok(source.includes("button.addEventListener('click',refreshLive)"),'Manual button still calls Blizzard live');
assert.ok(source.includes("fetch('/api/refresh?t='+Date.now()"),'Refresh button requests live API');
assert.ok(refreshService.includes('refreshCharacters([c])'),'Shared refresh service fetches Blizzard character profiles');
assert.ok(refreshApi.includes("runLockedRefresh(lockToken,req.method==='GET'?'manual':'scheduled')"),'Manual and scheduled refresh sources stay distinguishable');
assert.ok(vercelConfig.includes('"schedule": "7 4 * * *"')&&vercelConfig.includes('"schedule": "37 4 * * *"'),'Primary and idempotent retry Vercel cron are configured');
const dailySnapshot=read('api/daily-snapshot.js');
assert.ok(dailySnapshot.indexOf('ensurePetRuleState({force:true})')<dailySnapshot.indexOf('fetchForeverSnapshot(slugs)'),'Daily rule verification runs before the Blizzard snapshot');
assert.ok(dailySnapshot.indexOf('petRuleState=await ensurePetRuleState')<dailySnapshot.indexOf('const refresh=await refreshDailyCharacters()'),'Daily rule verification runs before the persistent character refresh');
assert.ok(refreshApi.indexOf('ensurePetRuleState({force:false})')<refreshApi.indexOf('refreshAndPersist({lockToken,source})'),'Manual refresh reuses or refreshes the rule guard before Blizzard profile refresh');
assert.ok(source.includes("setInterval(()=>{if(document.visibilityState==='visible')checkForNewData()}"),'Only the lightweight stored-data version is checked periodically');
assert.ok(!/setInterval\([\s\S]{0,300}refreshLive/.test(source),'Periodic checks must never trigger Blizzard live refreshes');
assert.ok(!source.includes('automatische Aktualisierung läuft unabhängig weiter'),'No false automatic-update promises');


/* Western design contract – old cosmological decorations and Ordens copy must not return. */
assert.ok(!heroHtml.includes('Hoher Orden') && !source.includes('Hoher Orden'));
assert.ok(!source.includes('automatischer Abgleich etwa alle 30 Minuten'));
assert.ok(heroHtml.includes('id="dataFreshness"') && source.includes('Zuletzt aktualisiert: '));
assert.ok(!source.includes('Profil abgerufen: '),'Per-character refresh timestamps are removed');
assert.ok(!source.includes(' · Blizzard API'),'Per-field source labels are removed');
assert.ok(source.includes('class="equipment-overview"'),'Equipped item level belongs to the equipment tab');
assert.ok(!source.includes("mainStatNames=['Gesundheit','Mana','Rüstung','Gegenstandsstufe']"),'Item level is no longer a character-stat tile');
assert.ok(!source.includes("Ø Gegenstandsstufe"),'Average item level is not shown in the frontend');
assert.ok(!source.includes("Angelegte Gegenstandsstufe"),'Redundant equipped label is removed');
assert.ok(css.includes('rotate(16deg)') && !css.includes('rotate(8deg)'));
assert.ok(css.includes('margin:27px auto 0') && css.includes('margin-top:23px'));
assert.ok(css.includes('main{margin-top:22px}'));
assert.ok(!css.includes('radial-gradient(#f8db9e'));
assert.ok(!/[✦✧✶✣✳✴★☆]/.test(heroHtml+source+css),'No sky star symbols on page');
assert.ok(!css.includes('0 11px 21px rgba(2,7,16,.86)'),'No oversized black hero shadow');
for(const id of ['cole','dolly','chucky','viola']){
 const scene=read('scene-'+id+'.svg');
 assert.ok(scene.includes('Main professions:'),'Every backdrop has occupational props');
 assert.ok(!/<g fill="#[^"]+"><circle cx="41"/.test(scene),'No star fields in scenes');
 assert.ok(scene.includes('<circle cx="740" cy="257" r="61"'),'All scenes share warm daylight');
}
assert.ok(read('scene-cole.svg').includes('alchemy, herbalism'));
assert.ok(read('scene-viola.svg').includes('alchemy, herbalism'));
assert.ok(!/#[0-9a-f]{6}/i.test(read('scene-viola.svg').match(/#(?:477050|6f9e6e|6c9969)/g)||''),'No green Viola foliage');
assert.ok(css.includes('skill-energy-flow') && css.includes('skill-light-sweep'));
assert.ok(!/^\s*schedule:/m.test(updateWorkflow));


const levelSvg=read('level-sheriff.svg');
assert.equal((cards.match(/class="level" aria-label="Stufe /g)||[]).length,data.characters.length,'Each character receives a labeled sheriff-star level badge');
assert.equal((cards.match(/class="level-inner"/g)||[]).length,data.characters.length,'Every level badge contains its level number');
assert.ok(levelSvg.includes('Sechszackiger Sheriffstern'),'Level art is a sheriff star');
assert.ok(levelSvg.includes('<polygon') && levelSvg.includes('url(#goldMetal)'),'Six-point star has golden arms');
assert.ok(css.includes('background:url("/level-sheriff.svg?v=level-sheriff-20261120b")'),'CSS displays sheriff star, not circular gradient');
assert.ok(css.includes('transform:rotate(16deg)') && css.includes('.level-inner{') && css.includes('padding-top:2px;transform:none;'),'Star, label and number all tilt together by 16 degrees');
assert.ok(!css.includes('transform:rotate(-16deg)'),'Level text must not be counter-rotated');
assert.ok(!/\\.level\\{[^}]*border-radius:50%/.test(css),'Level is no longer a round badge');
assert.ok(css.includes('.level{width:72px;height:72px}'),'Mobile sheriff star is fully sized');


/* Dynamic-data contract: simulate changing official profiles and re-render.
   No displayed level, group metric, skill, stat, talent or equipment is hard-coded. */
const changed=structuredClone(data);
const cole=changed.characters.find(c=>c.slug==='cole-dalton');
const oldLevel=cole.level;
cole.level=oldLevel+7;
const alchemy=cole.professions.find(p=>p.name==='Alchemie');
alchemy.current=74;alchemy.max=150;
cole.stats.Gesundheit=987;
cole.statsByEnum.HEALTH=987;
cole.statsDetails.find(entry=>entry.enum==='HEALTH').value=987;
cole.statsFreshKeys=['Gesundheit'];cole.statsFreshEnums=['HEALTH'];cole.statsVerified=false;
cole.equipment[0].item='QA neuer Stab aus der Armory';
cole.talents='Arkan: 7';
cole.talentsVerified=true;
changed.generatedAt='2026-11-20T15:32:00.000Z';
ui.render(changed,{live:true,success:4});
const changedCards=nodes.get('#cards').innerHTML;
const changedSummary=nodes.get('#summary').innerHTML;
const changedLevels=changed.characters.map(c=>c.level);
assert.ok(changedCards.includes('class="level" aria-label="Stufe '+cole.level+'"'),'Live level updates sheriff badge');
assert.ok(changedCards.includes('QA neuer Stab aus der Armory'),'Live equipment changes');
assert.ok(changedCards.includes('Arkan: 7'),'Live talent distribution changes');
assert.ok(changedCards.includes('987'),'Live health changes');
assert.ok(changedCards.includes('Mana <span class="stale-value"'),'Missing stat clearly marked stale');
assert.ok(changedCards.includes('74/150'),'Live skill numerator and rank cap');
assert.ok(changedSummary.includes(Math.min(...changedLevels)+'–'+Math.max(...changedLevels)),'Group min/max are recomputed');
assert.ok(changedSummary.includes((changedLevels.reduce((a,b)=>a+b,0)/changedLevels.length).toFixed(1)),'Group average is recomputed');
assert.ok(changedSummary.includes((Math.max(...changedLevels)-Math.min(...changedLevels))+' Level'),'Level gap is recomputed');
assert.ok(nodes.get('#dataFreshness').textContent.includes('Zuletzt aktualisiert'),'Visible live timestamp');
assert.ok(!source.includes('await load({silent:true})'),'Refresh button does not fetch stale JSON first');
/* A second click with a partial Blizzard response must keep the latest known
   in-session skill, mana, equipment and talent values, not the old snapshot. */
cole.stats.Mana=680;
cole.statsByEnum.MANA=680;
cole.statsDetails.find(entry=>entry.enum==='MANA').value=680;
ui.render(changed,{live:true,success:4});
const partial=structuredClone(data);
const partialCole=partial.characters.find(c=>c.slug==='cole-dalton');
partialCole.level=cole.level;
partialCole.scrapeOk=true;
partialCole.scrapedAt='2026-11-20T16:00:00.000Z';
partialCole.stats.Gesundheit=991;
partialCole.statsByEnum.HEALTH=991;
partialCole.statsDetails.find(entry=>entry.enum==='HEALTH').value=991;
partialCole.statsFreshKeys=['Gesundheit'];
partialCole.statsFreshEnums=['HEALTH'];
partialCole.statsVerified=false;
partialCole.professions.find(p=>p.name==='Alchemie').unverified=true;
partialCole.equipmentVerified=false;
partialCole.talentsVerified=false;
partialCole.talents='unbestätigt';
partialCole.imageVerified=false;
const partialMerged=ui.keepNewestProfiles(partial);
const updatedCole=partialMerged.characters.find(c=>c.slug==='cole-dalton');
assert.equal(updatedCole.statsByEnum.HEALTH,991,'New confirmed health value wins');
assert.equal(updatedCole.statsByEnum.MANA,680,'Latest in-session fallback is retained');
assert.equal(updatedCole.professions.find(p=>p.name==='Alchemie').current,74,'Earlier live skill is not replaced by snapshot');
assert.equal(updatedCole.professions.find(p=>p.name==='Alchemie').unverified,true,'Fallback skill stays visibly unverified');
assert.equal(updatedCole.equipment[0].item,'QA neuer Stab aus der Armory','Equipment fallback uses last in-session set');
assert.equal(updatedCole.talents,'Arkan: 7','Talent fallback uses last in-session distribution');
assert.equal(updatedCole.imageUrl,cole.imageUrl,'Last live image is kept on partial media failure');
ui.render(partialMerged,{live:true,success:4});
const failed=structuredClone(data);
const failedCole=failed.characters.find(c=>c.slug==='cole-dalton');
failedCole.scrapeOk=false;
failedCole.scrapedAt='2020-01-01T00:00:00.000Z';
const preserved=ui.keepNewestProfiles(failed);
assert.equal(preserved.characters.find(c=>c.slug==='cole-dalton').level,cole.level,'Failed fetch cannot roll back a newer live level');
assert.equal(preserved.characters.find(c=>c.slug==='cole-dalton').scrapeOk,false,'Reused data are marked stale');
ui.render(preserved,{live:true,success:3});
assert.ok(nodes.get('#status').textContent.includes('3 von 4 Profilen'),'Partial refresh clearly reported');
assert.ok(css.includes('.stale-value{'),'Stale-value formatting available');


/* Asset performance: a phone must not preload a desktop scene, and the
   service worker must use the exact URLs referenced by live CSS. */
const workerAssetList=read('sw.js');
const getAssetVersion=asset=>{
  const marker=asset+'?v=';
  const suffix=css.split(marker)[1]?.split('"')[0];
  return suffix?marker+suffix:null;
};
const expectedHero=getAssetVersion('skyborne-horizon.svg');
const expectedMobileHero=getAssetVersion('skyborne-mainstreet-mobile.svg');
assert.ok(expectedHero&&expectedMobileHero,'Both hero scenes must be referenced');
assert.ok(heroHtml.includes('media="(min-width: 741px)" href="/'+expectedHero+'"'),'Desktop hero preloaded only at desktop widths');
assert.ok(heroHtml.includes('media="(max-width: 740px)" href="/'+expectedMobileHero+'"'),'Mobile hero preloaded only on phones');
for(const id of ['cole','dolly','chucky','viola']){
  const fromCss=getAssetVersion('/scene-'+id+'.svg');
  assert.ok(fromCss&&workerAssetList.includes(fromCss),'Service worker uses live CSS scene URL for '+id);
}


/* Typeface contract: exactly two font stacks, one intentional italic and
   a small set of reusable label/body sizes across all character cards. */
const typeGuide=read('TYPOGRAFIE.md');
assert.ok(heroHtml.includes('Noch keine Legenden, aber schon gesucht.'),'Correct German headline punctuation');
assert.ok(!heroHtml.includes('Noch keine Legenden. Aber schon gesucht.'),'No obsolete slogan');
const heroBottom=heroHtml.split('<div class="hero-bottomline">')[1]?.split('</div>')[0];
assert.ok(heroBottom?.includes('CHUCKY · COLE · DOLLY · VIOLA'),'All four names still in order');
assert.ok(!heroBottom?.includes('EU · PvP'),'EU-PvP is not duplicated at the bottom of the title image');
assert.ok(heroHtml.includes('ALLIANZ · EU-PVP'),'Server info remains in the top-right header');
assert.ok(!heroHtml.includes('━━━━━━━━ • ━━━━━━━━') && !heroHtml.includes('footer-ornament'),'No decorative text line in footer');
assert.ok(!css.includes('.footer-ornament'),'Orphan footer style removed');
assert.ok(css.includes('justify-content:center;text-align:center'),'Names are centered in header');
for(const token of ['--type-caption:', '--type-small:', '--type-body:', '--type-lead:', '--leading-copy:', '--tracking-label:']){
  assert.ok(css.includes(token),'Shared typography token '+token);
}
assert.equal((css.match(/font-style:italic|font:italic/g)||[]).length,2,'Only Die and the third hero claim use italic styling');
for(const selector of ['.hero-story{','.roster-title p{','.refresh-hint{']){
  const block=css.split(selector)[1]?.split('}')[0]||'';
  assert.ok(block.includes('font-family:var(--body)'),selector+' uses the information font');
  if(selector==='.hero-story{')assert.ok(block.includes('font-style:italic'),selector+' is intentionally italic');
  else assert.ok(block.includes('font-style:normal'),selector+' is not italic');
}
assert.ok(css.includes('.hero-story{margin:14px 0 0;color:#f8dfb5')&&css.includes('font-weight:700'),'Motto remains readable as the third hero hierarchy level');
assert.ok(!css.includes('font-size:.43rem'),'Ultra-small phone header text removed');
assert.ok(!css.includes('font-weight:850')&&!css.includes('font-weight:900'),'Excessively heavy weight variants removed');
assert.ok(typeGuide.includes('Western-/Titelschrift')&&typeGuide.includes('Informationsschrift'),'Typography mapping is documented');

console.log('UI QA: per-character tabs, hunter companion, simplified XP, stats, profession order, quest details, rarity and gear: OK');
