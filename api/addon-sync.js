import {loadCharacters,saveCharacters,acquireRefreshLock,releaseRefreshLock} from '../scripts/character-store.mjs';
import {appendChangeBatch} from '../scripts/history-store.mjs';
import {cachedForeverDbClassMaster,cachedGermanClassSpells} from '../scripts/class-training-store.mjs';
import {resolveSpellbookCharacter,applySpellbookSnapshot} from '../scripts/spellbook-sync.mjs';
import {resolveMediaAsset} from '../scripts/media-resolver.mjs';
import {normalizeAddonSyncPayload,addonSpellbookSnapshot,publicAddonSyncSummary} from '../scripts/addon-sync.mjs';
import {loadAddonSyncState,saveAddonSyncState} from '../scripts/addon-sync-store.mjs';
import {ingestAddonLiveKnowledge} from '../scripts/live-knowledge-store.mjs';
import {authorizeDeviceToken,masterSyncTokenMatches} from '../scripts/addon-device-auth.mjs';

export const config={maxDuration:30};

function authValue(req,scheme){
  const raw=String(req.headers?.authorization||'');
  const prefix=scheme+' ';
  return raw.startsWith(prefix)?raw.slice(prefix.length):'';
}
async function requestBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'){
    if(req.body.length>900000)throw new Error('Addon-Sync-Anfrage ist zu groß');
    return JSON.parse(req.body);
  }
  if(typeof req[Symbol.asyncIterator]!=='function')return null;
  let raw='';
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>900000)throw new Error('Addon-Sync-Anfrage ist zu groß');
  }
  return JSON.parse(raw||'null');
}
async function archiveKnownAbilityIcons(data,characterSlug){
  const characters=[...(data?.characters||[])];
  const index=characters.findIndex(character=>character?.slug===characterSlug);
  if(index<0)return data;
  const character=characters[index];
  const abilities=await Promise.all((character.knownClassAbilities||[]).map(async ability=>{
    const iconId=Number(ability?.iconId);
    if(!Number.isInteger(iconId)||iconId<=0)return ability;
    try{
      const iconUrl=await resolveMediaAsset({
        entityType:'spell',
        entityId:ability.id,
        role:'icon',
        sourceUrl:'https://foreverdb.net/icons/'+iconId+'.webp',
        priorStoredUrl:ability.iconUrl||null
      });
      return {...ability,iconUrl:iconUrl||ability.iconUrl||null};
    }catch(error){
      console.warn('Addon-Sync-Spellicon konnte nicht archiviert werden:',String(error.message).slice(0,120));
      return ability;
    }
  }));
  characters[index]={...character,knownClassAbilities:abilities};
  return {...data,characters};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Methode nicht erlaubt'})}

  const masterAuthorized=masterSyncTokenMatches(authValue(req,'Bearer'));
  const deviceToken=authValue(req,'Device');
  const device=masterAuthorized?null:await authorizeDeviceToken(deviceToken);
  if(!masterAuthorized&&!device)return res.status(401).json({error:'Ungültige Addon-Sync-Berechtigung'});

  let payload;
  try{payload=normalizeAddonSyncPayload(await requestBody(req))}catch(error){
    return res.status(400).json({error:String(error.message).slice(0,180)});
  }

  const previewIsolated=process.env.VERCEL_ENV!=='production';
  let lockToken=null;

  try{
    const {data:before}=await loadCharacters();
    const characterSection=payload.sections.character;
    const target=resolveSpellbookCharacter(before,{characterSlug:characterSection.name,classId:characterSection.classID});
    if(device&&device.characterSlug!==target.slug){
      return res.status(403).json({error:'Dieser Gerätezugang darf nur '+String(device.characterName||device.characterSlug)+' synchronisieren'});
    }
    const previousState=await loadAddonSyncState(target.slug);
    if(previousState?.payload?.syncId&&previousState.payload.syncId===payload.syncId){
      return res.status(200).json({
        duplicate:true,
        liveKnowledge:{duplicate:true},
        character:{slug:target.slug,name:target.name},
        summary:publicAddonSyncSummary(previousState)
      });
    }

    lockToken=previewIsolated?'preview-isolated':await acquireRefreshLock();
    if(!lockToken)return res.status(409).json({error:'Gerade läuft eine andere Datenaktualisierung. Bitte die Synchronisierung erneut auslösen.'});

    const liveKnowledge=await ingestAddonLiveKnowledge(payload);
    let updated=before;
    let spellbookApplied=false;
    let classMaster=null;
    const rawBuild=String(payload.addon?.build||'');
    const build=/^\d+$/.test(rawBuild)&&payload.addon?.gameVersion
      ?String(payload.addon.gameVersion)+'.'+rawBuild
      :rawBuild||null;
    try{
      classMaster=await cachedForeverDbClassMaster(characterSection.classID,{build});
    }catch(error){
      console.warn('Klassenmaster beim Addon-Sync nicht verfügbar:',String(error.message).slice(0,140));
    }

    const snapshot=addonSpellbookSnapshot(payload,classMaster);
    if(snapshot&&classMaster&&!previewIsolated){
      snapshot.characterSlug=target.slug;
      const directIds=snapshot.entries.map(entry=>entry.id);
      let localized={};
      try{localized=await cachedGermanClassSpells(directIds)}catch{}
      updated=applySpellbookSnapshot(before,snapshot,{classMaster,localized,syncedAt:new Date().toISOString()});
      updated=await archiveKnownAbilityIcons(updated,target.slug);
      await saveCharacters(updated,lockToken);
      try{await appendChangeBatch(before,updated,{source:'addon-sync'})}catch(error){
        console.warn('Addon-Sync-Änderungschronik konnte nicht geschrieben werden:',String(error.message).slice(0,140));
      }
      spellbookApplied=true;
    }

    const state=await saveAddonSyncState(target.slug,payload);
    const character=(updated.characters||before.characters).find(entry=>entry.slug===target.slug)||target;
    return res.status(200).json({
      duplicate:false,
      previewIsolated,
      spellbookApplied,
      liveKnowledge,
      character:{slug:character.slug,name:character.name,knownClassAbilitiesVerified:character.knownClassAbilitiesVerified===true},
      summary:publicAddonSyncSummary(state)
    });
  }catch(error){
    console.error('Addon-Synchronisierung fehlgeschlagen:',error);
    const status=/Charakter nicht gefunden|Klasse .*passt|Charakterlevel|zeitlich|unvollständig|nicht unterstützt/.test(String(error.message))?400:503;
    return res.status(status).json({error:String(error.message).slice(0,180)});
  }finally{
    if(lockToken&&!previewIsolated){
      try{await releaseRefreshLock(lockToken)}catch(error){console.error('Addon-Sync-Lock konnte nicht freigegeben werden:',error)}
    }
  }
}
