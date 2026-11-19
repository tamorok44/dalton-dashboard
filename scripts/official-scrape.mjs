import fs from 'node:fs/promises';

const dataFile = new URL('../data/characters.json', import.meta.url);
const previous = JSON.parse(await fs.readFile(dataFile, 'utf8'));
const classNames = { Druid: 'Druide', Mage: 'Magier', Hunter: 'Jäger', Priest: 'Priester', Warlock: 'Hexenmeister', Paladin: 'Paladin', Warrior: 'Krieger', Rogue: 'Schurke', Shaman: 'Schamane' };
const professionNames = { Alchemy:'Alchemie', Herbalism:'Kräuterkunde', Mining:'Bergbau', Skinning:'Kürschnerei', Leatherworking:'Lederverarbeitung', Blacksmithing:'Schmiedekunst', Engineering:'Ingenieurskunst', Tailoring:'Schneiderei', Enchanting:'Verzauberkunst', Cooking:'Kochkunst', Fishing:'Angeln', 'First Aid':'Erste Hilfe' };
const statNames = { HEALTH:'Gesundheit', MANA:'Mana', STRENGTH:'Stärke', AGILITY:'Beweglichkeit', STAMINA:'Ausdauer', INTELLECT:'Intelligenz', SPIRIT:'Willenskraft', ARMOR:'Rüstung', ATTACKPOWER:'Angriffskraft', ITEMLEVEL:'Gegenstandsstufe', DEFENSE:'Verteidigung' };
const statOrder = ['HEALTH','MANA','STRENGTH','AGILITY','STAMINA','INTELLECT','SPIRIT','ARMOR','ATTACKPOWER','ITEMLEVEL','DEFENSE'];
const renderPattern = /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-main-raw\.png$/;
const avatarPattern = /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-avatar\.jpg$/;

async function fetchCharacter(slug) {
  const url='https://worldofwarcraft.blizzard.com/en-gb/forever/eu/armory/character/'+encodeURIComponent(slug);
  const response=await fetch(url, { headers:{ 'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'accept':'text/html', 'accept-language':'en-GB,en;q=0.9' }, signal:AbortSignal.timeout(25000) });
  if(!response.ok) throw new Error('Blizzard HTTP '+response.status);
  const html=await response.text();
  const match=html.match(/var characterProfileInitialState = (\{.*?\});\s*<\/script>/s);
  if(!match)throw new Error('Offizieller Charakterdatensatz nicht gefunden');
  const character=JSON.parse(match[1]).character;
  if(!character || character.slug?.toLowerCase()!==slug.toLowerCase())throw new Error('Charakterkennung passt nicht zum angefragten Profil');
  return character;
}
function professions(c) {
  const list=[...(c.professions?.primaries||[]),...(c.professions?.secondaries||[])];
  return list.map(p=>({name:professionNames[p.name]||p.name,current:p.tiers?.[0]?.skillPoints,max:p.tiers?.[0]?.maxSkillPoints,unverified:false}))
    .filter(p=>p.name&&Number.isFinite(p.current)&&Number.isFinite(p.max)&&p.max>0);
}
function stats(c) {
  const values=new Map();
  const groups=c.stats?.basic?.groups||[];
  for(const group of groups)for(const stat of group.stats||[]) {
    const n=stat?.value?.value;
    if(stat?.enum&&Number.isFinite(n))values.set(stat.enum,n);
  }
  const result={};
  for(const key of statOrder)if(values.has(key))result[statNames[key]]=values.get(key);
  return result;
}
function gear(c) {
  const raw=c.gear;
  const items=Array.isArray(raw)?raw:Array.isArray(raw?.items)?raw.items:Array.isArray(raw?.equippedItems)?raw.equippedItems:Array.isArray(raw?.equipped)?raw.equipped:[];
  return items.map(entry=>{
    const item=entry.item||entry;
    const name=item.name?.name||item.name||entry.name;
    const slot=entry.slot?.name||entry.slot?.type||entry.slot||entry.equipmentSlot?.name||entry.equipmentSlot;
    return name&&slot?{slot:String(slot),item:String(name)}:null;
  }).filter(Boolean);
}
function talents(c) {
  const s=c.specs;
  if(s===null || s===undefined)return null;
  const trees=Array.isArray(s)?s:Array.isArray(s.specializations)?s.specializations:Array.isArray(s.specs)?s.specs:[];
  if(trees.length===0)return null;
  const vals=trees.map(t=>Number(t.spentPoints??t.pointsSpent??t.points??NaN));
  if(vals.every(Number.isFinite))return vals.join(' / ');
  return null;
}
function timestamp(v){
  const n=Number(v);
  if(!Number.isFinite(n)||n<=0)return undefined;
  const d=new Date(n>1e12?n:n*1000);
  return Number.isFinite(d.getTime())?d.toISOString():undefined;
}

const updated=[];
let success=0;
for(const old of previous.characters){
  try{
    const c=await fetchCharacter(old.slug);
    if(old.slug==='chucky-dalton'){
      console.log('DIAG official gear',JSON.stringify(c.gear).slice(0,10000));
      console.log('DIAG official specs',JSON.stringify(c.specs).slice(0,10000));
      console.log('DIAG official stats keys',Object.keys(c.stats||{}));
    }
    const level=Number(c.level);
    if(!Number.isInteger(level)||level<10||level>60)throw new Error('Unplausibles Level');
    const ps=professions(c);
    if(ps.length===0)throw new Error('Offizielle Berufe fehlen');
    const st=stats(c),eq=gear(c),ta=talents(c);
    const img=c.media?.['main-raw']?.url;
    const avatar=c.media?.avatar?.url;
    const now=new Date().toISOString();
    const next={
      ...old,
      level,
      class:classNames[c.class?.name]||old.class,
      race:c.race?.name?.includes('Skyborne')?'Himmelsgeborene':old.race,
      professions:ps,
      stats:Object.keys(st).length?st:old.stats,
      equipment:eq.length?eq:old.equipment,
      talents:ta||old.talents,
      imageUrl:renderPattern.test(img||'')?img:old.imageUrl,
      avatarUrl:avatarPattern.test(avatar||'')?avatar:old.avatarUrl,
      imageCheckedAt:renderPattern.test(img||'')?now:old.imageCheckedAt,
      scrapedAt:now,
      sourceUpdatedAt:timestamp(c.lastUpdatedTimestamp)||old.sourceUpdatedAt,
      statsVerified:Object.keys(st).length>0,
      equipmentVerified:eq.length>0,
      talentsVerified:ta!==null,
      scrapeOk:true,
      scrapeError:undefined,
      dataStatus:'auto',
      source:'Blizzard Armory'
    };
    updated.push(next);
    success++;
    console.log(old.name+': Level '+level+', Berufe '+ps.length+', Stats '+Object.keys(st).length+', Ausrüstung '+eq.length+', Talente '+String(ta)+', Bild '+Boolean(next.imageUrl));
  }catch(e){
    updated.push({...old,scrapeOk:false,scrapeError:String(e.message).slice(0,180)});
    console.error(old.name+': '+e.message+' – letzter Stand bleibt erhalten');
  }
}
if(success===0){console.error('Alle Blizzard-Abrufe fehlgeschlagen; bestehende Daten bleiben unverändert.');process.exitCode=1}
else{
  updated.sort((a,b)=>a.name.localeCompare(b.name,'de'));
  await fs.writeFile(dataFile,JSON.stringify({generatedAt:new Date().toISOString(),characters:updated},null,2)+'\n');
  console.log('Blizzard-Profile aktualisiert: '+success+'/'+updated.length);
}
