const classNames = { Druid: 'Druide', Mage: 'Magier', Hunter: 'Jäger', Priest: 'Priester', Warlock: 'Hexenmeister', Paladin: 'Paladin', Warrior: 'Krieger', Rogue: 'Schurke', Shaman: 'Schamane' };
const professionNames = { Alchemy:'Alchemie', Herbalism:'Kräuterkunde', Mining:'Bergbau', Skinning:'Kürschnerei', Leatherworking:'Lederverarbeitung', Blacksmithing:'Schmiedekunst', Engineering:'Ingenieurskunst', Tailoring:'Schneiderei', Enchanting:'Verzauberkunst', Cooking:'Kochkunst', Fishing:'Angeln', 'First Aid':'Erste Hilfe' };
const statNames = { HEALTH:'Gesundheit', MANA:'Mana', STRENGTH:'Stärke', AGILITY:'Beweglichkeit', STAMINA:'Ausdauer', INTELLECT:'Intelligenz', SPIRIT:'Willenskraft', ARMOR:'Rüstung', ATTACKPOWER:'Angriffskraft', ITEMLEVEL:'Gegenstandsstufe', DEFENSE:'Verteidigung' };
const statOrder = ['HEALTH','MANA','STRENGTH','AGILITY','STAMINA','INTELLECT','SPIRIT','ARMOR','ATTACKPOWER','ITEMLEVEL','DEFENSE'];
const renderPattern = /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-main-raw\.png$/;
const avatarPattern = /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-avatar\.jpg$/;

async function fetchCharacter(slug,locale="en-gb") {
  const url='https://worldofwarcraft.blizzard.com/'+locale+'/forever/eu/armory/character/'+encodeURIComponent(slug);
  const response=await fetch(url, { headers:{ 'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'accept':'text/html', 'accept-language':locale==='de-de'?'de-DE,de;q=0.9':'en-GB,en;q=0.9' }, signal:AbortSignal.timeout(25000) });
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
  const raw=c.stats||{};
  const groups=[
    ...(Array.isArray(raw.groups)?raw.groups:[]),
    ...(Array.isArray(raw.basic?.groups)?raw.basic.groups:[]),
    {stats:[...(raw.basic?.primary||[]),...(raw.basic?.secondary||[])]}
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
  if(trees===null)return 'noch keine verteilt';
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
async function germanGearFor(slug,name,baseGear){
 const response=await fetch('https://foreverspec.com/de/armory/eu/'+encodeURIComponent(slug)+'/',{
  headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','accept':'text/html','accept-language':'de-DE,de;q=0.9'},
  signal:AbortSignal.timeout(15000)
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
    const c=await fetchCharacter(old.slug);
    const level=Number(c.level);
    if(!Number.isInteger(level)||level<10||level>60)throw new Error('Unplausibles Level');
    const ps=professions(c);
    if(ps.length===0)throw new Error('Offizielle Berufe fehlen');
    const st=stats(c),eq=gear(c),ta=talents(c);
    let localizedGear=null,localizationError,localizedSource='ForeverSpec';
    try{localizedGear=await germanGearFor(old.slug,old.name,eq)}catch(e){
      localizationError=String(e.message).slice(0,160);
      console.warn(old.name+': ForeverSpec: '+localizationError);
      try{
        const germanProfile=await fetchCharacter(old.slug,'de-de');
        const deGear=gear(germanProfile);
        const englishBySlot=new Map(eq.map(x=>[x.slot,x.item]));
        const distinct=deGear.filter(x=>x.item!==englishBySlot.get(x.slot)).length;
        console.log(old.name+': Blizzard de-DE '+deGear.length+' Teile, '+distinct+' übersetzte Namen');
        if(deGear.length>=Math.max(1,eq.length-1)&&distinct>0){
          const previousBySlot=new Map((old.equipment||[]).map(x=>[slotKey(x.slot),x]));
          const iconId=u=>String(u||'').match(/(\d+)\.(?:webp|jpg)$/)?.[1];
          localizedGear=deGear.map(x=>{
            const p=previousBySlot.get(slotKey(x.slot));
            const icon=p&&iconId(p.icon)===iconId(x.icon)&&p.level===x.level?p.icon:x.icon;
            return {...x,slot:slotKey(x.slot),icon};
          });
          localizedSource='Blizzard Armory (de-DE)';
        }
      }catch(deErr){console.warn(old.name+': Blizzard de-DE: '+String(deErr.message).slice(0,120))}
    }
    // Die deutschsprachige Quelle benennt Gegenstände, die Qualität kommt aus Blizzard.
    // So bleiben Seltenheitsfarben erhalten, auch wenn ForeverSpec keine Qualität liefert.
    if(localizedGear){
      const originalBySlot=new Map(eq.map(x=>[slotKey(x.slot),x]));
      localizedGear=localizedGear.map(x=>{
        const quality=x.quality||originalBySlot.get(slotKey(x.slot))?.quality;
        return {...x,...(quality?{quality}:{})};
      });
    }
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
      equipment:localizedGear||(old.equipmentLanguage==='de'&&old.equipment?.length?old.equipment:(eq.length?eq:old.equipment)),
      equipmentLanguage:(localizedGear||old.equipmentLanguage==='de'&&old.equipment?.length)?'de':'en',
      equipmentSource:localizedGear?localizedSource:(old.equipmentLanguage==='de'&&old.equipment?.length?'ForeverSpec':'Blizzard Armory'),
      equipmentError:localizationError,
      talents:ta||old.talents,
      imageUrl:renderPattern.test(img||'')?img:old.imageUrl,
      avatarUrl:avatarPattern.test(avatar||'')?avatar:old.avatarUrl,
      imageCheckedAt:renderPattern.test(img||'')?now:old.imageCheckedAt,
      scrapedAt:now,
      sourceUpdatedAt:timestamp(c.lastUpdatedTimestamp)||old.sourceUpdatedAt,
      statsVerified:Object.keys(st).length>0,
      equipmentVerified:Boolean(localizedGear),
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
return {success,data:{generatedAt:new Date().toISOString(),characters:updated.sort((a,b)=>a.name.localeCompare(b.name,'de'))}};
}

export {extractGermanGear,gear};
