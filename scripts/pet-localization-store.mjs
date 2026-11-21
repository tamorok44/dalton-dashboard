import {configured,redis} from './character-store.mjs';

const PREFIX='dalton-dashboard:pet-localization:v2:';
const SOURCE_ORIGIN='https://foreverdb.net';
const CACHE_SECONDS=24*60*60;

function decodeEntities(value=''){
  return String(value)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&auml;/gi,'ä').replace(/&ouml;/gi,'ö').replace(/&uuml;/gi,'ü')
    .replace(/&Auml;/g,'Ä').replace(/&Ouml;/g,'Ö').replace(/&Uuml;/g,'Ü').replace(/&szlig;/gi,'ß')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function text(value=''){
  return decodeEntities(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function safeSlug(value=''){
  const slug=String(value).toLowerCase().trim();
  return /^[a-z0-9-]{1,80}$/.test(slug)?slug:null;
}
function familyUrl(slug){return SOURCE_ORIGIN+'/de/pets/'+encodeURIComponent(slug)}
function spellUrl(id){return SOURCE_ORIGIN+'/de/spell/'+Number(id)}
async function fetchHtml(url,fetchImpl=fetch){
  const response=await fetchImpl(url,{
    headers:{'user-agent':'Dalton-Dashboard/1.0 (+https://dalton-dashboard-eight.vercel.app)','accept-language':'de-DE,de;q=0.9','accept':'text/html,application/xhtml+xml'},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error('ForeverDB HTTP '+response.status);
  return response.text();
}
export function parseGermanPetFamilyPage(html='',slug=''){
  const source=String(html);
  const ids=[...source.matchAll(/href=["']\/de\/spell\/(\d+)["']/gi)].map(match=>Number(match[1])).filter(Number.isInteger);
  const build=/Build\s+(1\.60\.1\.\d+)/i.exec(text(source))?.[1]||null;
  const heading=/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(source)?.[1];
  const requiredLevels={};
  for(const match of source.matchAll(/<li\b[^>]*>([\s\S]*?href=["']\/de\/spell\/(\d+)["'][\s\S]*?)<\/li>/gi)){
    const level=/ab\s+(?:Begleiter|Haustier)stufe\s*(\d+)/i.exec(text(match[1]))?.[1];
    if(level)requiredLevels[Number(match[2])]=Number(level);
  }
  return {
    slug:safeSlug(slug),
    name:heading?text(heading).replace(/:\s*Jägerbegleiterfamilie$/i,'').trim():null,
    build,
    spellIds:[...new Set(ids)],
    requiredLevels
  };
}
export function parseGermanPetSpellPage(html='',id){
  const source=String(html);
  const heading=/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(source)?.[1];
  const name=heading?text(heading).trim():null;
  const plain=text(source);
  const levelMatch=/(?:Benötigt|Haustierstufe|Begleiterstufe)\s+Stufe?\s*(\d+)|Benötigt\s+Stufe\s+(\d+)/i.exec(plain);
  const requiredLevel=Number(levelMatch?.[1]||levelMatch?.[2])||null;
  return {
    id:Number(id),
    name,
    requiredLevel,
    sourceUrl:spellUrl(id)
  };
}
async function fetchGermanPetFamily(slug,{fetchImpl=fetch}={}){
  const familyHtml=await fetchHtml(familyUrl(slug),fetchImpl);
  const family=parseGermanPetFamilyPage(familyHtml,slug);
  if(!family.slug||!family.spellIds.length)throw new Error('Keine deutschen Pet-Spell-IDs gefunden');
  const abilities=(await Promise.all(family.spellIds.slice(0,20).map(async id=>{
    try{
      const spell=parseGermanPetSpellPage(await fetchHtml(spellUrl(id),fetchImpl),id);
      return {...spell,requiredLevel:spell.requiredLevel||family.requiredLevels?.[id]||null};
    }
    catch(error){
      console.warn('Deutscher Pet-Spell '+id+' konnte nicht geladen werden:',String(error.message).slice(0,120));
      return null;
    }
  }))).filter(entry=>entry?.id&&entry?.name);
  if(!abilities.length)throw new Error('Keine deutschen Pet-Spell-Namen gefunden');
  return {
    slug:family.slug,
    name:family.name,
    build:family.build,
    locale:'de-DE',
    source:'ForeverDB deutsche Forever-Clientextraktion',
    sourceUrl:familyUrl(slug),
    checkedAt:new Date().toISOString(),
    abilities
  };
}
export async function loadGermanPetLocalization(slug){
  const keySlug=safeSlug(slug);
  if(!keySlug||!configured())return null;
  const raw=await redis(['GET',PREFIX+keySlug]);
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{return null}
}
export async function ensureGermanPetLocalization(slug,{fetchImpl=fetch,force=false}={}){
  const keySlug=safeSlug(slug);
  if(!keySlug)return null;
  const existing=await loadGermanPetLocalization(keySlug).catch(()=>null);
  if(existing&&!force){
    const age=Date.now()-Date.parse(existing.checkedAt||'');
    if(Number.isFinite(age)&&age>=0&&age<CACHE_SECONDS*1000)return existing;
  }
  try{
    const fresh=await fetchGermanPetFamily(keySlug,{fetchImpl});
    if(configured())await redis(['SET',PREFIX+keySlug,JSON.stringify(fresh),'EX',CACHE_SECONDS]);
    return fresh;
  }catch(error){
    if(existing)return existing;
    throw error;
  }
}
export async function ensureGermanPetLocalizations(slugs=[],options={}){
  const unique=[...new Set((Array.isArray(slugs)?slugs:[]).map(safeSlug).filter(Boolean))];
  const entries=await Promise.all(unique.map(async slug=>{
    try{return [slug,await ensureGermanPetLocalization(slug,options)]}
    catch(error){
      console.warn('Deutsche Pet-Daten '+slug+' nicht verfügbar:',String(error.message).slice(0,160));
      return [slug,null];
    }
  }));
  return Object.fromEntries(entries.filter(([,value])=>value));
}
export async function loadGermanPetLocalizations(slugs=[]){
  const unique=[...new Set((Array.isArray(slugs)?slugs:[]).map(safeSlug).filter(Boolean))];
  const entries=await Promise.all(unique.map(async slug=>[slug,await loadGermanPetLocalization(slug).catch(()=>null)]));
  return Object.fromEntries(entries.filter(([,value])=>value));
}
