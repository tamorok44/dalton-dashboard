import {timingSafeEqual} from 'node:crypto';
import {loadCharacters,saveCharacters,acquireRefreshLock,releaseRefreshLock} from '../scripts/character-store.mjs';
import {appendChangeBatch} from '../scripts/history-store.mjs';
import {cachedForeverDbClassMaster,cachedGermanClassSpells} from '../scripts/class-training-store.mjs';
import {parseSpellbookCode,applySpellbookSnapshot} from '../scripts/spellbook-sync.mjs';

export const config={maxDuration:30};

function safeEqual(a,b){
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length===right.length&&timingSafeEqual(left,right);
}
function requestCode(req){
  if(typeof req.body==='string'){
    try{return JSON.parse(req.body)?.code||null}catch{return null}
  }
  return req.body?.code||null;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Methode nicht erlaubt'})}
  const expected=process.env.SPELLBOOK_SYNC_TOKEN;
  if(!expected)return res.status(503).json({error:'Spellbook-Synchronisierung ist nicht konfiguriert'});
  let snapshot;
  try{snapshot=parseSpellbookCode(requestCode(req))}catch(error){
    return res.status(400).json({error:String(error.message).slice(0,160)});
  }
  if(!safeEqual(snapshot.token,expected))return res.status(401).json({error:'Spellbook-Code wurde nicht für dieses Dashboard erstellt'});
  delete snapshot.token;
  const lockToken=await acquireRefreshLock();
  if(!lockToken)return res.status(409).json({error:'Gerade läuft eine andere Datenaktualisierung. Bitte den Code gleich noch einmal übernehmen.'});
  try{
    const {data:before}=await loadCharacters();
    let classMaster=null;
    try{classMaster=await cachedForeverDbClassMaster(snapshot.classId)}catch(error){
      console.warn('Klassenmaster beim Spellbook-Sync nicht verfügbar:',String(error.message).slice(0,140));
    }
    const directIds=snapshot.entries.map(entry=>entry.id);
    let localized={};
    try{localized=await cachedGermanClassSpells(directIds,{maxFetch:30})}catch{}
    const syncedAt=new Date().toISOString();
    const updated=applySpellbookSnapshot(before,snapshot,{classMaster,localized,syncedAt});
    await saveCharacters(updated,lockToken);
    try{await appendChangeBatch(before,updated,{source:'spellbook-sync'})}catch(error){
      console.warn('Spellbook-Änderungschronik konnte nicht geschrieben werden:',String(error.message).slice(0,140));
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
    const status=/Charakter nicht gefunden|Klasse .*passt|Charakterlevel|zeitlich/.test(String(error.message))?400:503;
    return res.status(status).json({error:String(error.message).slice(0,180)});
  }finally{
    try{await releaseRefreshLock(lockToken)}catch(error){console.error('Spellbook-Lock konnte nicht freigegeben werden:',error)}
  }
}
