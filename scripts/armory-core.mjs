import {blizzardApiConfigured,fetchForeverProfile} from './blizzard-api.mjs';
const classNames = { Druid: 'Druide', Mage: 'Magier', Hunter: 'Jäger', Priest: 'Priester', Warlock: 'Hexenmeister', Paladin: 'Paladin', Warrior: 'Krieger', Rogue: 'Schurke', Shaman: 'Schamane' };
const professionNames = { Alchemy:'Alchemie', Herbalism:'Kräuterkunde', Mining:'Bergbau', Skinning:'Kürschnerei', Leatherworking:'Lederverarbeitung', Blacksmithing:'Schmiedekunst', Engineering:'Ingenieurskunst', Tailoring:'Schneiderei', Enchanting:'Verzauberkunst', Cooking:'Kochkunst', Fishing:'Angeln', 'First Aid':'Erste Hilfe' };
const statNames = { HEALTH:'Gesundheit', MANA:'Mana', STRENGTH:'Stärke', AGILITY:'Beweglichkeit', STAMINA:'Ausdauer', INTELLECT:'Intelligenz', SPIRIT:'Willenskraft', ARMOR:'Rüstung', ATTACKPOWER:'Angriffskraft', SPELLPOWER:'Zaubermacht', CRITICALSTRIKE:'Kritische Trefferchance', MELEECRIT:'Nahkampf-Krit', RANGEDCRIT:'Fernkampf-Krit', SPELLCRIT:'Zauber-Krit', DODGE:'Ausweichen', PARRY:'Parieren', BLOCK:'Blocken', ATTACKDPS:'Waffen-DPS', ATTACKSPEED:'Angriffsgeschwindigkeit', MANAREGEN:'Manaregeneration', ITEMLEVEL:'Gegenstandsstufe', DEFENSE:'Verteidigung' };
const statOrder = ['HEALTH','MANA','STRENGTH','INTELLECT','AGILITY','STAMINA','CRITICALSTRIKE','SPIRIT','ARMOR','ATTACKPOWER','SPELLPOWER','MELEECRIT','RANGEDCRIT','SPELLCRIT','DODGE','PARRY','BLOCK','ATTACKDPS','ATTACKSPEED','MANAREGEN','ITEMLEVEL','DEFENSE'];
const renderPattern = /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-main-raw\.png$/;
const avatarPattern = /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-avatar\.jpg$/;
const petIconPattern = /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/icons\/\d+\/\d+\.jpg$/;
const petRenderPattern = /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/npcs\/zoom\/creature-display-\d+\.jpg$/;

function characterGender(character) {
  const fields=[
    character?.gender?.type,character?.gender?.name,character?.gender,
    character?.sex?.type,character?.sex?.name,character?.sex,
    character?.bodyType?.name,character?.bodyType?.type,
    character?.body_type?.name,character?.body_type?.type
  ];
  for(const field of fields) {
    if(typeof field!=='string')continue;
    const value=field.trim().toLowerCase();
    if(value==='female'||value==='weiblich')return 'female';
    if(value==='male'||value==='männlich')return 'male';
  }
  return null;
}
async function fetchCharacter(slug,locale="en-gb") {
  const url='https://worldofwarcraft.blizzard.com/'+locale+'/forever/eu/armory/character/'+encodeURIComponent(slug);
  const response=await fetch(url, { headers:{ 'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'accept':'text/html', 'accept-language':locale==='de-de'?'de-DE,de;q=0.9':'en-GB,en;q=0.9' }, signal:AbortSignal.timeout(20000) });
  if(!response.ok) throw new Error('Blizzard HTTP '+response.status);
  const html=await response.text();
  const match=html.match(/var characterProfileInitialState = (\{.*?\});\s*<\/script>/s);
  if(!match)throw new Error('Offizieller Charakterdatensatz nicht gefunden');
  const character=JSON.parse(match[1]).character;
  if(!character || character.slug?.toLowerCase()!==slug.toLowerCase())throw new Error('Charakterkennung passt nicht zum angefragten Profil');
  return character;
}

function normalizeHunterPet(pet){
  if(!pet||typeof pet!=='object')return null;
  const name=typeof pet.name==='string'?pet.name.trim():'';
  const level=Number(pet.level),slot=Number(pet.slot);
  const family=pet.family&&typeof pet.family==='object'?{
    id:Number.isInteger(Number(pet.family.id))?Number(pet.family.id):undefined,
    name:typeof pet.family.name==='string'?pet.family.name:undefined,
    enum:typeof pet.family.enum==='string'?pet.family.enum:undefined,
    slug:typeof pet.family.slug==='string'?pet.family.slug:undefined
  }:undefined;
  const iconUrl=pet.icon?.url;
  const imageUrl=pet.render?.url;
  if(!name)return null;
  return {
    name,
    ...(Number.isInteger(level)?{level}:{}),
    ...(family?{family}:{}),
    active:pet.active===true,
    ...(pet.summoned===true||pet.summoned===false?{summoned:pet.summoned}:{}),
    ...(Number.isInteger(slot)?{slot}:{}),
    ...(petIconPattern.test(iconUrl||'')?{iconUrl}:{}),
    ...(petRenderPattern.test(imageUrl||'')?{imageUrl}:{}),
    source:'Blizzard Stable'
  };
}
async function fetchHunterStable(slug,locale="de-de"){
  const url='https://worldofwarcraft.blizzard.com/'+locale+'/forever/eu/armory/character/'+encodeURIComponent(slug)+'/collections/stable.json';
  const response=await fetch(url,{
    headers:{
      'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'accept':'application/json,text/plain,*/*',
      'accept-language':locale==='de-de'?'de-DE,de;q=0.9':'en-GB,en;q=0.9'
    },
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('Blizzard-Stall HTTP '+response.status);
  const payload=JSON.parse(await response.text());
  if(!payload?.pets||!Array.isArray(payload.pets.active)||!Array.isArray(payload.pets.stable)){
    throw new Error('Blizzard-Stall lieferte kein gültiges Pet-Objekt');
  }
  return {
    active:payload.pets.active.map(normalizeHunterPet).filter(Boolean),
    stable:payload.pets.stable.map(normalizeHunterPet).filter(Boolean)
  };
}
function professions(c) {
  const list=[...(c.professions?.primaries||[]),...(c.professions?.secondaries||[])];
  return list.map(p=>({name:professionNames[p.name]||p.name,current:p.tiers?.[0]?.skillPoints,max:p.tiers?.[0]?.maxSkillPoints,unverified:false}))
    .filter(p=>p.name&&Number.isFinite(p.current)&&Number.isFinite(p.max)&&p.max>0);
}
function stats(c) {
  const raw=c.stats||{};
  const groups=[
    ...(Array.isArray(raw.groups)?raw.groups:[]),
    ...(Array.isArray(raw.basic?.groups)?raw.basic.groups:[]),
    {stats:[...(raw.basic?.primary||[]),...(raw.basic?.secondary||[])]},
    {stats:Array.isArray(raw.overview)?raw.overview:[]}
  ];
  const values=new Map();
  for(const group of groups)for(const stat of group.stats||[]) {
    const n=stat?.value?.value;
    if(stat?.enum&&Number.isFinite(n))values.set(stat.enum,n);
  }
  const result={};
  for(const key of statOrder)if(values.has(key))result[statNames[key]]=values.get(key);
  return result;
}
const slotNames={HEAD:'Kopf',NECK:'Hals',SHOULDER:'Schultern',BACK:'Rücken',CHEST:'Brust',SHIRT:'Hemd',WRIST:'Handgelenke',HANDS:'Hände',WAIST:'Taille',LEGS:'Beine',FEET:'Füße',FINGER_1:'Ring 1',FINGER_2:'Ring 2',FINGER:'Ring',TRINKET_1:'Schmuck 1',TRINKET_2:'Schmuck 2',MAIN_HAND:'Waffenhand',OFF_HAND:'Nebenhand',RANGED:'Distanzwaffe',TABARD:'Wappenrock'};
function gear(c) {
  const raw=c.gear;
  const entries=Array.isArray(raw)?raw:(raw&&typeof raw==='object'?Object.values(raw):[]);
  return entries.map(entry=>{
    if(!entry||typeof entry!=='object')return null;
    const name=entry.name||entry.item?.name;
    const slotType=entry.slot?.type||entry.slot?.name||entry.slot;
    const slot=slotNames[slotType]||entry.slot?.name||slotType;
    const icon=entry.media?.content?.assets?.find(a=>a.key==='icon')?.value;
    const level=entry.level?.value;
    // Blizzard übermittelt die originale Gegenstandsqualität, z.B. {type:"UNCOMMON",name:"Uncommon"}.
    const rawQuality=entry.quality??entry.item?.quality;
    const qualityType=typeof rawQuality==='string'?rawQuality:rawQuality?.type;
    const allowedQualities=['POOR','COMMON','UNCOMMON','RARE','EPIC','LEGENDARY','ARTIFACT','HEIRLOOM'];
    const quality=typeof qualityType==='string'&&allowedQualities.includes(qualityType.toUpperCase())?qualityType.toUpperCase():undefined;
    return typeof name==='string'&&slot?{slot:String(slot),item:name,icon:typeof icon==='string'?icon:undefined,level:Number.isFinite(level)?level:undefined,...(quality?{quality}:{})}:null;
  }).filter(Boolean);
}
const treeNames={'Feral Combat':'Wilder Kampf',Balance:'Gleichgewicht',Restoration:'Wiederherstellung',Arcane:'Arkan',Fire:'Feuer',Frost:'Frost','Beast Mastery':'Tierherrschaft',Marksmanship:'Treffsicherheit',Survival:'Überleben'};
function talents(c) {
  const s=c.specs;
  const trees=Array.isArray(s)?s:Array.isArray(s?.specializations)?s.specializations:Array.isArray(s?.specs)?s.specs:null;
  if(trees===null)return null;
  if(trees.length===0)return 'noch keine verteilt';
  const entries=trees.filter(t=>Number.isFinite(Number(t.spentPoints))&&Number(t.spentPoints)>0);
  if(entries.length===0)return 'noch keine verteilt';
  return entries.map(t=>(treeNames[t.name]||t.name||t.id||'Talente')+': '+Number(t.spentPoints)).join(' · ');
}
function timestamp(v){
  if(typeof v==='string' && !/^\d+(?:\.\d+)?$/.test(v)){const parsed=Date.parse(v);return Number.isFinite(parsed)?new Date(parsed).toISOString():undefined;}
  const n=Number(v);
  if(!Number.isFinite(n)||n<=0)return undefined;
  const d=new Date(n>1e12?n:n*1000);
  return Number.isFinite(d.getTime())?d.toISOString():undefined;
}


const htmlText=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|auml|ouml|uuml|Auml|Ouml|Uuml|szlig);/gi,(_,e)=>{
 const d={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',auml:'ä',ouml:'ö',uuml:'ü',Auml:'Ä',Ouml:'Ö',Uuml:'Ü',szlig:'ß'};
 return e.startsWith('#x')?String.fromCodePoint(parseInt(e.slice(2),16)):e.startsWith('#')?String.fromCodePoint(parseInt(e.slice(1),10)):d[e]||'&'+e+';';
}).replace(/\s+/g,' ').trim();
const attribute=(tag,key)=>tag.match(new RegExp('\\b'+key+'\\s*=\\s*(["\\x27])([\\s\\S]*?)\\1','i'))?.[2]||'';
const slotKey=s=>({'Füsse':'Füße','Distanz':'Distanzwaffe'}[s]||s);
function extractGermanGear(html,baseGear){
 const tags=[...html.matchAll(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\ba-slot\b[^"']*["'][^>]*>/gi)];
 const names={head:'Kopf',neck:'Hals',shoulders:'Schultern',back:'Rücken',chest:'Brust',shirt:'Hemd',wrists:'Handgelenke',hands:'Hände',waist:'Taille',legs:'Beine',feet:'Füße',ring1:'Ring 1',ring2:'Ring 2',trinket1:'Schmuck 1',trinket2:'Schmuck 2',mainhand:'Waffenhand',offhand:'Nebenhand',ranged:'Distanzwaffe'};
 const gear=[];
 for(let i=0;i<tags.length;i++){
   const tag=tags[i][0],id=attribute(tag,'data-itemid');
   if(!/^\d+$/.test(id))continue;
   const section=html.slice(tags[i].index+tag.length,tags[i+1]?.index||html.length);
   const name=htmlText(section.match(/<(?:div|span)\b[^>]*\bclass\s*=\s*["'][^"']*\bslot-name\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span)>/i)?.[1]);
   const desc=htmlText(section.match(/<(?:div|span)\b[^>]*\bclass\s*=\s*["'][^"']*\bslot-level\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span)>/i)?.[1]);
   const slot=slotKey(desc.replace(/^\d+\s*[·•\-–]\s*/,'').trim()||names[attribute(tag,'data-itemtype').toLowerCase()]);
   const level=Number(attribute(tag,'data-itemlevel'))||Number(desc.match(/^\d+/)?.[0])||undefined;
   if(name&&slot&&!/^leer$/i.test(name))gear.push({slot,item:name,icon:'https://foreverspec.com/icons/'+id+'.webp',level});
 }
 if(!gear.length){
   for(const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
     try{
       const value=JSON.parse(script[1]),values=Array.isArray(value)?value:[value];
       const l=values.find(x=>x?.['@type']==='ItemList'&&Array.isArray(x.itemListElement));
       for(const x of l?.itemListElement||[]){
         const item=x.item||x,name=htmlText(item.name),slot=slotKey(htmlText(item.description));
         const level=Number(item.additionalProperty?.value)||undefined;
         if(name&&slot)gear.push({slot,item:name,level});
       }
     }catch{}
     if(gear.length)break;
   }
 }
 if(!gear.length)throw new Error('ForeverSpec lieferte keine auslesbare Ausrüstung');
 const old=new Map((baseGear||[]).map(x=>[slotKey(x.slot),x]));
 return [...new Map(gear.map(g=>[g.slot,{...g,icon:g.icon||old.get(g.slot)?.icon,level:g.level||old.get(g.slot)?.level}])).values()];
}
// Vergleich mit dem aktuellen offiziellen englischen Profil: veraltete ForeverSpec-
// oder lokalisierte Blizzard-Ausrüstung darf niemals aktuelle Gegenstände überschreiben.
const normalizedSlot=slot=>slotKey(slot||'');
const iconId=url=>String(url||'').match(/\/(\d+)\.(?:webp|jpg)(?:\?|$)/)?.[1];
function equipmentMatches(current,translated){
 if(!Array.isArray(current)||!Array.isArray(translated)||current.length!==translated.length)return false;
 const translatedBySlot=new Map(translated.map(x=>[normalizedSlot(x.slot),x]));
 if(translatedBySlot.size!==current.length)return false;
 return current.every(x=>{
   const other=translatedBySlot.get(normalizedSlot(x.slot));
   return other&&x.level===other.level&&iconId(x.icon)&&iconId(x.icon)===iconId(other.icon);
 });
}
function preserveCurrentTranslations(current,previous){
 const oldBySlot=new Map((previous||[]).map(x=>[normalizedSlot(x.slot),x]));
 return current.map(item=>{
   const previousItem=oldBySlot.get(normalizedSlot(item.slot));
   // Ein alter deutscher Name ist nur sicher, wenn auch der offizielle englische
   // Ursprungsname, das Icon und die Stufe unverändert geblieben sind.
   const unchanged=previousItem?.sourceName===item.item &&
     previousItem.level===item.level &&
     iconId(previousItem.icon)&&iconId(previousItem.icon)===iconId(item.icon);
   return unchanged
     ? {...item,item:previousItem.item,icon:previousItem.icon,sourceName:item.item,localized:true}
     : {...item,sourceName:item.item,localized:false};
 });
}

async function germanGearFor(slug,name,baseGear){
 const response=await fetch('https://foreverspec.com/de/armory/eu/'+encodeURIComponent(slug)+'/',{
  headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','accept':'text/html','accept-language':'de-DE,de;q=0.9'},
  signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw new Error('ForeverSpec HTTP '+response.status);
 const html=await response.text();
 if(!html.toLowerCase().includes(name.toLowerCase())&&!html.toLowerCase().includes(slug.toLowerCase())){
  throw new Error('ForeverSpec-Profil nicht bestätigt (HTML '+html.length+' Zeichen)');
 }
 return extractGermanGear(html,baseGear);
}

export async function refreshCharacters(characters){
const updated=[];
let success=0;
for(const old of characters){
  try{
    const apiCheckedAt=new Date().toISOString();
    let apiProfileError;
    const apiProfilePromise=blizzardApiConfigured()
      ?fetchForeverProfile(old.slug).catch(error=>{
        apiProfileError=String(error.message).slice(0,160);
        console.warn(old.name+': Blizzard Forever API: '+apiProfileError);
        return null;
      })
      :Promise.resolve(null);
    const c=await fetchCharacter(old.slug);
    const apiProfile=await apiProfilePromise;
    const sourceClassName=apiProfile?.character_class?.name||c.class?.name;
    let hunterPets=old.hunterPets||{active:[],stable:[]};
    let hunterPetsVerified=old.hunterPetsVerified===true;
    let hunterPetsError=old.hunterPetsError;
    let hunterPetsCheckedAt=old.hunterPetsCheckedAt;
    if(sourceClassName==='Hunter'){
      hunterPetsCheckedAt=new Date().toISOString();
      try{
        hunterPets=await fetchHunterStable(old.slug,'de-de');
        hunterPetsVerified=true;
        hunterPetsError=undefined;
      }catch(error){
        hunterPetsVerified=false;
        hunterPetsError=String(error.message).slice(0,160);
        console.warn(old.name+': Blizzard-Stall: '+hunterPetsError);
      }
    }else{
      hunterPets={active:[],stable:[]};
      hunterPetsVerified=false;
      hunterPetsError=undefined;
      hunterPetsCheckedAt=undefined;
    }
    const apiLevel=Number(apiProfile?.level);
    const level=Number.isInteger(apiLevel)?apiLevel:Number(c.level);
    if(!Number.isInteger(level)||level<10||level>60)throw new Error('Unplausibles Level');
    const ps=professions(c);
    const knownProfessions=new Map((old.professions||[]).map(p=>[p.name,{...p,unverified:true}]));
    for(const p of ps){
      const prior=knownProfessions.get(p.name);
      knownProfessions.set(p.name,{
        ...p,
        ...(prior?.id?{id:prior.id}:{}),
        ...(prior?.tierId?{tierId:prior.tierId}:{}),
        ...(prior?.tierName?{tierName:prior.tierName}:{}),
        ...(Array.isArray(prior?.knownRecipes)?{knownRecipes:prior.knownRecipes}:{})
      });
    }
    // Never silently remove a profession when Blizzard returns a partial result.
    const currentProfessions=[...knownProfessions.values()];
    const professionsVerified=ps.length>0&&currentProfessions.every(p=>!p.unverified);
    const st=stats(c),eq=gear(c),ta=talents(c);
    const hasOfficialGear=Array.isArray(c.gear)||(c.gear!==null&&typeof c.gear==='object');
    let localizedGear=null,localizationError,localizedSource;
    // Fast path: don't re-fetch localized gear if the officially verified
    // equipment is unchanged. This is the common case for skill/level updates.
    const previousBySlot=new Map((old.equipment||[]).map(x=>[normalizedSlot(x.slot),x]));
    const translationsReusable=old.equipmentLanguage==='de'&&hasOfficialGear&&eq.length>0&&eq.length===(old.equipment||[]).length&&
      eq.every(item=>{
        const prior=previousBySlot.get(normalizedSlot(item.slot));
        return prior?.sourceName===item.item&&prior.level===item.level&&
          Boolean(iconId(prior.icon))&&iconId(prior.icon)===iconId(item.icon);
      });
    if(hasOfficialGear&&eq.length&&!translationsReusable){
      // Offizielles deutsches Blizzard-Profil zuerst: weniger Verzögerung,
      // keine Abhängigkeit von der häufig unzugänglichen ForeverSpec-Seite.
      try{
        const germanProfile=await fetchCharacter(old.slug,'de-de');
        const deGear=gear(germanProfile);
        if(!equipmentMatches(eq,deGear))throw new Error('Deutsche Blizzard-Ausrüstung weicht vom aktuellen englischen Profil ab');
        localizedGear=deGear;
        localizedSource='Blizzard Armory (de-DE)';
      }catch(deErr){
        localizationError=String(deErr.message).slice(0,160);
        console.warn(old.name+': Blizzard de-DE: '+localizationError);
        try{
          const fromForeverSpec=await germanGearFor(old.slug,old.name,eq);
          if(!equipmentMatches(eq,fromForeverSpec))throw new Error('ForeverSpec-Ausrüstung weicht vom aktuellen Blizzard-Profil ab');
          localizedGear=fromForeverSpec;
          localizedSource='ForeverSpec';
        }catch(fsErr){console.warn(old.name+': ForeverSpec: '+String(fsErr.message).slice(0,160))}
      }
    }
    const equipment= !hasOfficialGear ? old.equipment||[] :
      localizedGear ? localizedGear.map(x=>{
        const source=eq.find(e=>normalizedSlot(e.slot)===normalizedSlot(x.slot));
        return {...x,quality:source?.quality||x.quality,sourceName:source?.item,localized:true};
      }) : preserveCurrentTranslations(eq,old.equipment);
    const localizedCount=equipment.filter(x=>x.localized).length;
    const equipmentLanguage= !hasOfficialGear ? old.equipmentLanguage||'de':
      equipment.length===0||localizedCount===equipment.length?'de':
      localizedCount===0?'en':'gemischt';
    const equipmentSource= !hasOfficialGear ? old.equipmentSource||'Letzter bestätigter Stand':
      localizedGear ? localizedSource:translationsReusable?(old.equipmentSource||'Blizzard Armory, bestätigte Übersetzungen'):'Blizzard Armory (en-GB), aktuelle Gegenstände';
    const requiredStats=['Gesundheit','Mana','Stärke','Beweglichkeit','Ausdauer','Intelligenz','Kritische Trefferchance','Willenskraft','Rüstung','Angriffskraft','Zaubermacht','Ausweichen','Gegenstandsstufe'];
    const statsVerified=requiredStats.every(k=>Number.isFinite(st[k]));
    const img=c.media?.['main-raw']?.url;
    const avatar=c.media?.avatar?.url;
    const now=new Date().toISOString();
    const next={
      ...old,
      level,
      class:classNames[sourceClassName]||old.class,
      race:String(apiProfile?.race?.name||c.race?.name||'').includes('Skyborne')?'Himmelsgeborene':old.race,
      gender:characterGender(apiProfile)||characterGender(c)||old.gender||null,
      faction:apiProfile?.faction?.name==='Alliance'?'Allianz':apiProfile?.faction?.name||old.faction||'Allianz',
      blizzardCharacterId:Number.isInteger(Number(apiProfile?.id))?Number(apiProfile.id):old.blizzardCharacterId,
      experience:Number.isInteger(Number(apiProfile?.experience))?Number(apiProfile.experience):old.experience,
      achievementPoints:Number.isInteger(Number(apiProfile?.achievement_points))?Number(apiProfile.achievement_points):old.achievementPoints,
      averageItemLevel:Number.isInteger(Number(apiProfile?.average_item_level))?Number(apiProfile.average_item_level):old.averageItemLevel,
      equippedItemLevel:Number.isInteger(Number(apiProfile?.equipped_item_level))?Number(apiProfile.equipped_item_level):old.equippedItemLevel,
      ruleset:apiProfile?.ruleset?.name?{id:Number(apiProfile.ruleset.id)||undefined,name:apiProfile.ruleset.name}:old.ruleset,
      professions:currentProfessions,
      professionsVerified,
      professionDetailsVerified:false,
      hunterPets,
      hunterPetsVerified,
      hunterPetsCheckedAt,
      hunterPetsError,
      stats:{...(old.stats||{}),...st},
      // Provenance of each stat; old fallback values are never called fresh.
      statsFreshKeys:Object.keys(st),
      equipment,
      equipmentLanguage,
      equipmentSource,
      equipmentError:localizationError,
      equipmentVerified:hasOfficialGear,
      talents:ta===null?(old.talents||'nicht verfügbar'):ta,
      talentDetailsVerified:false,
      reputationsVerified:false,
      questsVerified:false,
      completedQuestsVerified:false,
      imageUrl:renderPattern.test(img||'')?img:old.imageUrl,
      avatarUrl:avatarPattern.test(avatar||'')?avatar:old.avatarUrl,
      // Keep the same render URL and cache key until Blizzard changes it.
      imageCheckedAt:renderPattern.test(img||'')&&
        (img!==old.imageUrl||(timestamp(c.lastUpdatedTimestamp)&&timestamp(c.lastUpdatedTimestamp)!==old.sourceUpdatedAt))
        ?now:old.imageCheckedAt,
      scrapedAt:now,
      lastLoginAt:timestamp(apiProfile?.last_login_timestamp??c.lastLoginTimestamp??c.last_login_timestamp)||old.lastLoginAt,
      sourceUpdatedAt:timestamp(c.lastUpdatedTimestamp)||old.sourceUpdatedAt,
      apiProfileVerified:Boolean(apiProfile),
      apiProfileCheckedAt:apiCheckedAt,
      apiProfileError:apiProfile?undefined:apiProfileError||old.apiProfileError,
      statsVerified,
      imageVerified:renderPattern.test(img||''),
      talentsVerified:ta!==null,
      scrapeOk:true,
      scrapeError:undefined,
      dataStatus:'live',
      source:apiProfile?'Blizzard API + Armory':'Blizzard Armory'
    };
    updated.push(next);
    success++;
    const petCount=(next.hunterPets?.active?.length||0)+(next.hunterPets?.stable?.length||0);
    console.log(old.name+': Level '+level+', Berufe '+ps.length+', Stats '+Object.keys(st).length+', Ausrüstung '+eq.length+', Talente '+String(ta)+', Begleiter '+petCount+', Bild '+Boolean(next.imageUrl));
  }catch(e){
    updated.push({...old,scrapeOk:false,scrapeError:String(e.message).slice(0,180)});
    console.error(old.name+': '+e.message+' – letzter Stand bleibt erhalten');
  }
}
return {success,data:{generatedAt:new Date().toISOString(),characters:updated.sort((a,b)=>a.name.localeCompare(b.name,'de'))}};
}

export {extractGermanGear,gear};
