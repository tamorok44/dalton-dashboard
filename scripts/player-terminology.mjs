const BLIZZARD_FOREVER_PROFESSIONS_URL='https://worldofwarcraft.blizzard.com/de-de/news/24301516';
const BLIZZARD_FOREVER_STARTER_GUIDE_URL='https://worldofwarcraft.blizzard.com/de-de/news/24315280/einsteigerleitfaden-f%C3%BCr-neue-spieler-willkommen-bei-world-of-warcraft';

const professionRecords=Object.freeze({
  129:Object.freeze({name:'Erste Hilfe'}),
  164:Object.freeze({name:'Schmiedekunst'}),
  165:Object.freeze({name:'Lederverarbeitung'}),
  171:Object.freeze({name:'Alchemie'}),
  182:Object.freeze({name:'Kräuterkunde'}),
  185:Object.freeze({name:'Kochkunst'}),
  186:Object.freeze({name:'Bergbau'}),
  197:Object.freeze({name:'Schneiderei'}),
  202:Object.freeze({name:'Ingenieurskunst'}),
  333:Object.freeze({name:'Verzauberkunst'}),
  356:Object.freeze({name:'Angeln'}),
  393:Object.freeze({name:'Kürschnerei'})
});

// Verified against German Forever client-extracted sources, not Retail/Classic
// marketing terminology. Aliases are for identity/search only, never UI labels.
const FOREVER_ZONE_SOURCES=Object.freeze([
  'https://foreverdb.net/de/zones',
  'https://foreverdb.net/de/travel',
  'https://foreverdb.net/de/vendors'
]);
const zoneRecords=Object.freeze({
  1440:Object.freeze({name:'Ashenvale',aliases:Object.freeze(['Eschental']),sources:FOREVER_ZONE_SOURCES}),
  1453:Object.freeze({name:'Stormwind',aliases:Object.freeze(['Sturmwind','Stormwind City']),sources:FOREVER_ZONE_SOURCES}),
  1455:Object.freeze({name:'Ironforge',aliases:Object.freeze(['Eisenschmiede']),sources:FOREVER_ZONE_SOURCES}),
  2521:Object.freeze({name:'Die Insel Zephras',aliases:Object.freeze(['Insel Zephras']),sources:Object.freeze(['https://foreverdb.net/de/vendors']),clientEvidence:Object.freeze({locale:'deDE',build:'71037',observedAt:'2026-11-24T11:30:16.000Z'})})
});
function normalizedZoneText(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE').trim().replace(/^(?:die|der|das)\s+/,'');
}
function zoneRecordMatches(record,name){
  const key=normalizedZoneText(name);
  return key&&[record.name,...record.aliases].some(value=>normalizedZoneText(value)===key);
}
const zoneByAlias=new Map(Object.values(zoneRecords).flatMap(record=>[record.name,...record.aliases].map(value=>[normalizedZoneText(value),record])));
export function preferredForeverZoneName(id,name=null){
  const raw=typeof name==='string'&&name.trim()?name.trim():null;
  const byId=zoneRecords[numericId(id)];
  // If a current source reports a different, not historically equivalent name,
  // preserve it rather than silently overwriting a future client change.
  if(byId&&(!raw||zoneRecordMatches(byId,raw)))return byId.name;
  return (raw&&zoneByAlias.get(normalizedZoneText(raw))?.name)||raw;
}
export function foreverZoneIdentity(value){
  return normalizedZoneText(preferredForeverZoneName(null,value));
}

export const VERIFIED_PLAYER_TERMINOLOGY=Object.freeze({
  locale:'de-DE',
  verifiedAt:'2026-11-22',
  authority:'Blizzard Entertainment – offizielle deutsche World of Warcraft Spielerterminologie',
  sources:Object.freeze([
    BLIZZARD_FOREVER_PROFESSIONS_URL,
    BLIZZARD_FOREVER_STARTER_GUIDE_URL
  ]),
  profession:professionRecords,
  zone:zoneRecords
});

function numericId(value){
  const id=Number(value);
  return Number.isInteger(id)&&id>0?id:null;
}

export function verifiedPlayerTerm(type,id){
  const key=String(type||'');
  const numeric=numericId(id);
  if(!numeric)return null;
  const record=VERIFIED_PLAYER_TERMINOLOGY[key]?.[numeric];
  return record?{
    ...record,
    type:key,
    id:numeric,
    locale:VERIFIED_PLAYER_TERMINOLOGY.locale,
    authority:key==='zone'?'WoW Forever – deutsche Clientextraktion und beobachtete Clientnamen':VERIFIED_PLAYER_TERMINOLOGY.authority,
    sources:[...(Array.isArray(record.sources)?record.sources:VERIFIED_PLAYER_TERMINOLOGY.sources)],
    verifiedAt:key==='zone'?'2026-11-24':VERIFIED_PLAYER_TERMINOLOGY.verifiedAt
  }:null;
}

export function preferredGermanGameName(type,id,technicalName=null){
  if(type==='zone')return preferredForeverZoneName(id,technicalName);
  return verifiedPlayerTerm(type,id)?.name||
    (typeof technicalName==='string'&&technicalName.trim()?technicalName.trim():null);
}

export function normalizeVerifiedPlayerTerminology(data){
  if(!data||!Array.isArray(data.characters))return data;
  return {
    ...data,
    characters:data.characters.map(character=>({
      ...character,
      professions:Array.isArray(character.professions)
        ?character.professions.map(profession=>{
          const name=preferredGermanGameName('profession',profession?.id,profession?.name);
          return name?{...profession,name}:{...profession};
        })
        :character.professions
    }))
  };
}

// A verified world location is not conditional on anyone's character progress.
export function verifiedForeverLocations(){
  return Object.entries(zoneRecords).map(([id,record])=>({uiMapId:Number(id),name:record.name}));
}
