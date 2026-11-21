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

export const VERIFIED_PLAYER_TERMINOLOGY=Object.freeze({
  locale:'de-DE',
  verifiedAt:'2026-11-21',
  authority:'Blizzard Entertainment – offizielle deutsche World of Warcraft: Forever Spielerterminologie',
  sources:Object.freeze([
    BLIZZARD_FOREVER_PROFESSIONS_URL,
    BLIZZARD_FOREVER_STARTER_GUIDE_URL
  ]),
  profession:professionRecords
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
    authority:VERIFIED_PLAYER_TERMINOLOGY.authority,
    sources:[...VERIFIED_PLAYER_TERMINOLOGY.sources],
    verifiedAt:VERIFIED_PLAYER_TERMINOLOGY.verifiedAt
  }:null;
}

export function preferredGermanGameName(type,id,technicalName=null){
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
