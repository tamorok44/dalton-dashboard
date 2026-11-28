import {timingSafeEqual} from 'node:crypto';
import {loadCharactersForWrite,saveCharacters,acquireRefreshLock,releaseRefreshLock} from '../scripts/character-store.mjs';
import {appendChangeBatch} from '../scripts/history-store.mjs';
import {cachedForeverDbClassMaster,cachedGermanClassSpells} from '../scripts/class-training-store.mjs';
import {parseSpellbookCode,resolveSpellbookCharacter,applySpellbookSnapshot} from '../scripts/spellbook-sync.mjs';
import {archiveKnownAbilityIcons} from '../scripts/knowledge-media.mjs';
import {readRequestJson,RequestJsonError} from '../scripts/request-json.mjs';

export const config={maxDuration:30};

function safeEqual(a,b){
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length===right.length&&timingSafeEqual(left,right);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Methode nicht erlaubt'})}
  if(process.env.VERCEL_ENV!=='production')return res.status(403).json({error:'Spellbook-Synchronisierung nur in Produktion verfügbar'});
  const expected=process.env.SPELLBOOK_SYNC_TOKEN;
  if(!expected)return res.status(503).json({error:'Spellbook-Synchronisierung ist nicht konfiguriert'});
  let snapshot;
  try{
    const body=await readRequestJson(req,250000);
    if(typeof body.code!=='string')throw new RequestJsonError(400,'Ungültiger Spellbook-Code');
    snapshot=parseSpellbookCode(body.code);
  }catch(error){
    return res.status(error instanceof RequestJsonError?error.status:400).json({error:String(error.message).slice(0,160)});
  }
  if(!safeEqual(snapshot.token,expected))return res.status(401).json({error:'Spellbook-Code wurde nicht für dieses Dashboard erstellt'});
  delete snapshot.token;
  let lockToken=null;
  try{
    lockToken=await acquireRefreshLock();
    if(!lockToken)return res.status(409).json({error:'Gerade läuft eine andere Datenaktualisierung. Bitte den Code gleich noch einmal übernehmen.'});
    const {data:before,raw:expectedRoster}=await loadCharactersForWrite();
    const targetCharacter=resolveSpellbookCharacter(before,snapshot);
    snapshot.characterSlug=targetCharacter.slug;
    let classMaster=null;
    try{classMaster=await cachedForeverDbClassMaster(snapshot.classId)}catch(error){
      console.warn('Klassenmaster beim Spellbook-Sync nicht verfügbar:',String(error.message).slice(0,140));
    }
    const directIds=snapshot.entries.map(entry=>entry.id);
    let localized={};
    try{localized=await cachedGermanClassSpells(directIds,{maxFetch:30})}catch{}
    const syncedAt=new Date().toISOString();
    let updated=applySpellbookSnapshot(before,snapshot,{classMaster,localized,syncedAt});
    if(updated!==before){
      updated=await archiveKnownAbilityIcons(updated,snapshot.characterSlug);
      await saveCharacters(updated,lockToken,{expectedRoster});
      try{await appendChangeBatch(before,updated,{source:'spellbook-sync'})}catch(error){
        console.warn('Spellbook-Änderungschronik konnte nicht geschrieben werden:',String(error.message).slice(0,140));
      }
    }
    const character=updated.characters.find(entry=>entry.slug===snapshot.characterSlug);
    return res.status(200).json({
      data:updated,
      character:{
        slug:character.slug,
        knownClassAbilities:character.knownClassAbilities,
        knownClassAbilitiesVerified:true,
        knownClassAbilitiesSource:character.knownClassAbilitiesSource,
        knownClassAbilitiesCapturedAt:character.knownClassAbilitiesCapturedAt,
        knownClassAbilitiesSyncedAt:character.knownClassAbilitiesSyncedAt
      },
      count:character.knownClassAbilities.length
    });
  }catch(error){
    console.error('Spellbook-Synchronisierung fehlgeschlagen:',error);
    const status=String(error.message).startsWith('STALE_SPELLBOOK')?409:/Charakter nicht gefunden|Klasse .*passt|Charakterlevel|zeitlich/.test(String(error.message))?400:503;
    return res.status(status).json({error:status===503?'Die Synchronisierung konnte derzeit nicht bestätigt werden.':String(error.message).slice(0,180)});
  }finally{
    if(lockToken)try{await releaseRefreshLock(lockToken)}catch(error){console.error('Spellbook-Lock konnte nicht freigegeben werden:',error)}
  }
}
