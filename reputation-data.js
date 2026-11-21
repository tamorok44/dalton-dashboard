// WoW Forever reputation reference.
// Full faction list: ForeverDB client extraction, build 1.60.1.70959 (2026-11-20).
// Colors: Blizzard FACTION_*_COLOR / FACTION_BAR_COLORS for the Forever client.

export const REPUTATION_BUILD='1.60.1.70959';

export const reputationColors=Object.freeze({
  hated:Object.freeze({name:'Hasserfüllt',hex:'#CC4D38',light:'#E07A68',dark:'#7D2D21'}),
  hostile:Object.freeze({name:'Feindselig',hex:'#CC4D38',light:'#E07A68',dark:'#7D2D21'}),
  unfriendly:Object.freeze({name:'Unfreundlich',hex:'#BF4500',light:'#E27531',dark:'#743000'}),
  neutral:Object.freeze({name:'Neutral',hex:'#E6B300',light:'#F3D45D',dark:'#8B6900'}),
  friendly:Object.freeze({name:'Freundlich',hex:'#00991A',light:'#54C565',dark:'#005E11'}),
  honored:Object.freeze({name:'Wohlwollend',hex:'#00991A',light:'#54C565',dark:'#005E11'}),
  revered:Object.freeze({name:'Respektvoll',hex:'#00991A',light:'#54C565',dark:'#005E11'}),
  exalted:Object.freeze({name:'Ehrfürchtig',hex:'#00991A',light:'#54C565',dark:'#005E11'})
});

export const reputationStages=Object.freeze([
  Object.freeze({key:'hated',name:'Hasserfüllt',weight:1}),
  Object.freeze({key:'hostile',name:'Feindselig',weight:1}),
  Object.freeze({key:'unfriendly',name:'Unfreundlich',weight:1}),
  Object.freeze({key:'neutral',name:'Neutral',weight:1}),
  Object.freeze({key:'friendly',name:'Freundlich',weight:2}),
  Object.freeze({key:'honored',name:'Wohlwollend',weight:4}),
  Object.freeze({key:'revered',name:'Respektvoll',weight:7}),
  Object.freeze({key:'exalted',name:'Ehrfürchtig',weight:.333})
]);

const WIKI='https://warcraft.wiki.gg/images/';
export const factionCrests=Object.freeze({
  'darnassus':WIKI+'Darnassus.png',
  'gnomeregan-exiles':WIKI+'Gnomeregan.png',
  'ironforge':WIKI+'Ironforge.png',
  'stormwind':WIKI+'Stormwind.png',
  'darkspear-trolls':WIKI+'Darkspear.png',
  'orgrimmar':WIKI+'Orgrimmar.png',
  'thunder-bluff':WIKI+'Thunder_Bluff.png',
  'undercity':WIKI+'Undercity.png',
  'alliance':WIKI+'Alliance_64.png',
  'horde':WIKI+'Horde_64.png'
});
export const factionFallbackCrests=Object.freeze({
  alliance:WIKI+'Alliance_64.png',
  horde:WIKI+'Horde_64.png',
  neutral:WIKI+'Neutral_32.png'
});

const f=(slug,name,side='neutral',extra={})=>Object.freeze({slug,name,side,...extra});
export const foreverReputationSeed=Object.freeze([
  f('darnassus','Darnassus','alliance'),
  f('gnomeregan-exiles','Gnomeregan Exiles','alliance'),
  f('ironforge','Ironforge','alliance'),
  f('stormwind','Stormwind','alliance'),
  f('silverwing-sentinels','Silverwing Sentinels','alliance'),
  f('stormpike-guard','Stormpike Guard','alliance'),
  f('the-league-of-arathor','The League of Arathor','alliance'),
  f('theramore-expeditionary-force','Theramore Expeditionary Force','alliance',{forever:true}),
  f('darkspear-trolls','Darkspear Trolls','horde'),
  f('orgrimmar','Orgrimmar','horde'),
  f('thunder-bluff','Thunder Bluff','horde'),
  f('undercity','Undercity','horde'),
  f('darkspear-raiders','Darkspear Raiders','horde',{forever:true}),
  f('frostwolf-clan','Frostwolf Clan','horde'),
  f('the-defilers','The Defilers','horde'),
  f('warsong-outriders','Warsong Outriders','horde'),
  f('booty-bay','Booty Bay'),
  f('everlook','Everlook'),
  f('gadgetzan','Gadgetzan'),
  f('powderfuse','Powderfuse','neutral',{forever:true}),
  f('ratchet','Ratchet'),
  f('alliance','Alliance','alliance'),
  f('argent-dawn','Argent Dawn'),
  f('azeroth-commerce-authority','Azeroth Commerce Authority','alliance'),
  f('barkskin-burrow','Barkskin Burrow','neutral',{forever:true}),
  f('bloodsail-buccaneers','Bloodsail Buccaneers'),
  f('bolderok-clan',"Bolder'ok Clan",'horde',{forever:true}),
  f('brood-of-nozdormu','Brood of Nozdormu'),
  f('brotherhood-of-the-horse','Brotherhood of the Horse','alliance',{forever:true}),
  f('cenarion-circle','Cenarion Circle'),
  f('cenarion-scouts','Cenarion Scouts','neutral',{forever:true}),
  f('darkmoon-faire','Darkmoon Faire'),
  f('durotar-supply-and-logistics','Durotar Supply and Logistics','horde'),
  f('earthen-ring','Earthen Ring','horde',{forever:true}),
  f('emerald-wardens','Emerald Wardens'),
  f('gelkis-clan-centaur','Gelkis Clan Centaur'),
  f('guardians-of-hyjal','Guardians of Hyjal','neutral',{forever:true}),
  f('high-order','High Order','alliance',{forever:true}),
  f('horde','Horde','horde'),
  f('hydraxian-waterlords','Hydraxian Waterlords'),
  f('kirin-tor','Kirin Tor','alliance',{forever:true}),
  f('magram-clan-centaur','Magram Clan Centaur'),
  f('nightclaw-druids','Nightclaw Druids','neutral',{forever:true}),
  f('ravasaur-trainers','Ravasaur Trainers','horde'),
  f('ravenholdt','Ravenholdt'),
  f('shendralar',"Shen'dralar"),
  f('syndicate','Syndicate'),
  f('the-watchers','The Watchers','neutral',{forever:true}),
  f('thorium-brotherhood','Thorium Brotherhood'),
  f('timbermaw-hold','Timbermaw Hold'),
  f('wildhammer-clan','Wildhammer Clan','alliance'),
  f('windshapers','Windshapers','horde',{forever:true}),
  f('wintersaber-trainers','Wintersaber Trainers','alliance'),
  f('zandalar-tribe','Zandalar Tribe')
]);

export function normalizeFactionName(value=''){
  return String(value).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
}
const aliases=new Map([
  ['gnomeregangnome','gnomeregan-exiles'],
  ['gnomeregan exiles','gnomeregan-exiles'],
  ['schildwachen der silverwing','silverwing-sentinels'],
  ['stormpikegarde','stormpike-guard'],
  ['der bund von arathor','the-league-of-arathor'],
  ['expeditionskorps von theramore','theramore-expeditionary-force'],
  ['darkspear','darkspear-trolls'],
  ['darkspear rauber','darkspear-raiders'],
  ['frostwolfklan','frostwolf-clan'],
  ['die entweihten','the-defilers'],
  ['warsongvorhut','warsong-outriders'],
  ['argentumdammerung','argent-dawn'],
  ['handelskommission von azeroth','azeroth-commerce-authority'],
  ['bau der baumrindenfurbolgs','barkskin-burrow'],
  ['blutsegelbukaniere','bloodsail-buccaneers'],
  ['klan der bolder ok','bolderok-clan'],
  ['brut nozdormus','brood-of-nozdormu'],
  ['bruderschaft des pferds','brotherhood-of-the-horse'],
  ['zirkel des cenarius','cenarion-circle'],
  ['cenarische spaher','cenarion-scouts'],
  ['dunkelmond jahrmarkt','darkmoon-faire'],
  ['versorgung und logistik durotar','durotar-supply-and-logistics'],
  ['der irdene ring','earthen-ring'],
  ['smaragdwarter','emerald-wardens'],
  ['gelkisklan','gelkis-clan-centaur'],
  ['wachter des hyjal','guardians-of-hyjal'],
  ['der hohe orden','high-order'],
  ['hydraxianer','hydraxian-waterlords'],
  ['druiden der nachtklaue','nightclaw-druids'],
  ['ravasaurusausbilder','ravasaur-trainers'],
  ['die behuter','the-watchers'],
  ['thoriumbruderschaft','thorium-brotherhood'],
  ['holzschlundfeste','timbermaw-hold'],
  ['wildhammerklan','wildhammer-clan'],
  ['windformer','windshapers'],
  ['wintersablerausbilder','wintersaber-trainers'],
  ['stamm der zandalar','zandalar-tribe']
]);
for(const entry of foreverReputationSeed){
  aliases.set(normalizeFactionName(entry.name),entry.slug);
  aliases.set(normalizeFactionName(entry.slug),entry.slug);
}
export function factionSeedByName(name){
  const slug=aliases.get(normalizeFactionName(name));
  return slug?foreverReputationSeed.find(entry=>entry.slug===slug)||null:null;
}
export function factionCrestFor(seed){
  if(!seed)return factionFallbackCrests.neutral;
  return factionCrests[seed.slug]||factionFallbackCrests[seed.side]||factionFallbackCrests.neutral;
}
export function factionCrestKindFor(seed){
  if(!seed)return 'neutral-fallback';
  if(Object.hasOwn(factionCrests,seed.slug))return 'specific';
  return seed.side==='neutral'?'neutral-fallback':'side-fallback';
}
