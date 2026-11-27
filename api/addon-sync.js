import {randomUUID} from 'node:crypto';
import {runSyncDeadline,assertSyncBudget,ADDON_WORK_MS,ADDON_CLEANUP_UNTIL_MS} from '../scripts/sync-deadline.mjs';
import {loadCharacters,acquireRefreshLock,releaseRefreshLock} from '../scripts/character-store.mjs';
import {appendChangeBatch} from '../scripts/history-store.mjs';
import {cachedForeverDbClassMaster,cachedGermanClassSpells} from '../scripts/class-training-store.mjs';
import {resolveSpellbookCharacter,applySpellbookSnapshot} from '../scripts/spellbook-sync.mjs';
import {resolveMediaAsset} from '../scripts/media-resolver.mjs';
import {normalizeAddonSyncPayload,addonSpellbookSnapshot,publicAddonSyncSummary} from '../scripts/addon-sync.mjs';
import {loadAddonSyncState,saveAddonSyncState,prepareAddonSync} from '../scripts/addon-sync-store.mjs';
import {ingestAddonLiveKnowledge,snapshotsFromAddonPayload} from '../scripts/live-knowledge-store.mjs';
import {authorizeDeviceToken,deviceMaySync,masterSyncTokenMatches} from '../scripts/addon-device-auth.mjs';

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

const reply=(status,body)=>({status,body});
export function createAddonSyncHandler({workMs=ADDON_WORK_MS,cleanupUntilMs=ADDON_CLEANUP_UNTIL_MS}={}){
  if(!(workMs>0&&cleanupUntilMs>workMs&&workMs<=ADDON_WORK_MS&&cleanupUntilMs<=ADDON_CLEANUP_UNTIL_MS))throw Error('Ungültiges Sync-Zeitbudget');
  return async function handler(req,res){
    res.setHeader('Cache-Control','private, no-store');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Methode nicht erlaubt'});}
    const started=performance.now(),ownership={token:null};
    let result;
    try{
      result=await runSyncDeadline(started+workMs,()=>syncRequest(req,ownership));
    }catch(error){
      console.warn('Addon-Sync-Zeitbudget oder Anfrage fehlgeschlagen:',String(error.message).slice(0,140));
      result=reply(503,{error:String(error.message).slice(0,180)});
    }finally{
      // The token is known before SET. Even an ambiguous acquisition may
      // be cleaned up, but never delete another owner's lease.
      if(ownership.token){
        try{await runSyncDeadline(started+cleanupUntilMs,()=>releaseRefreshLock(ownership.token,{addon:true}));}
        catch(error){
          console.warn('Addon-Sync-Lock konnte nicht freigegeben werden:',String(error.message).slice(0,140));
          // If revocation cannot be proved, do not respond before the
          // absolute work cutoff. Permit and lease expire by that cutoff
          // on a normally progressing provider clock.
          const remaining=started+workMs-performance.now();
          if(remaining>0)await new Promise(resolve=>setTimeout(resolve,Math.ceil(remaining)));
        }
      }
    }
    return res.status(result.status).json(result.body);
  };
}
export default createAddonSyncHandler();

async function syncRequest(req,ownership){

  const masterAuthorized=masterSyncTokenMatches(authValue(req,'Bearer'));
  const deviceToken=authValue(req,'Device');
  const device=masterAuthorized?null:await authorizeDeviceToken(deviceToken);
  if(!masterAuthorized&&!device)return reply(401,{error:'Ungültige Addon-Sync-Berechtigung'});

  let payload;
  try{payload=normalizeAddonSyncPayload(await requestBody(req))}catch(error){
    return reply(400,{error:String(error.message).slice(0,180)});
  }

  const previewIsolated=process.env.VERCEL_ENV!=='production';
  let lockToken=null;

  try{
    // The entire production read/modify/write sequence must use the same lock.
    // Taking it after reading the roster would allow an older roster to erase
    // an already successful sync for another character.
    ownership.token=randomUUID();
    lockToken=await acquireRefreshLock({addon:true,token:ownership.token});
    if(!lockToken){return reply(409,{error:'Gerade läuft eine andere Datenaktualisierung. Bitte die Synchronisierung erneut auslösen.'});}
    const {data:before}=await loadCharacters();
    const characterSection=payload.sections.character;
    const target=resolveSpellbookCharacter(before,{characterSlug:characterSection.name,classId:characterSection.classID});
    if(Number(target.classId)!==Number(characterSection.classID))throw new Error('Klasse des Addon-Syncs passt nicht zum Charakter');
    if(device&&!deviceMaySync(device,target.slug,payload.client?.transport)){
      return reply(403,{error:'Dieser Gerätezugang darf diesen Charakter oder Transportweg nicht synchronisieren'});
    }
    let previousState=await loadAddonSyncState(target.slug);
    const writeOptions={lockToken};
    const confirmedReceipts=receipts=>(Array.isArray(receipts)?receipts:[]).map((receipt,i,all)=>i===all.length-1?{...receipt,observationsConfirmed:true}:receipt);
    // A durable outbox is held in the same character state as the core commit.
    // Drain it before accepting a new sync, so no later receipt can hide it.
    if(previousState?.pendingObservations===true){
      await ingestAddonLiveKnowledge(previousState.pendingObservationPayload??previousState.payload,{characterSlug:target.slug,lockToken:writeOptions.lockToken});
      previousState=await saveAddonSyncState(target.slug,previousState.payload,{...writeOptions,receipts:confirmedReceipts(previousState.receipts),receivedAt:previousState.receivedAt,pendingObservations:false});
    }
    const prepared=prepareAddonSync(previousState,payload);
    if(prepared.duplicate){
      // An acknowledged core commit may have been followed by an interrupted
      // knowledge write. Replaying observations is idempotent and fenced.
      const liveKnowledge=prepared.replayPayload?await ingestAddonLiveKnowledge(prepared.replayPayload,{characterSlug:target.slug,lockToken}):{stored:0,duplicates:0,changed:0};
      return reply(200,{
        duplicate:true,liveKnowledge,ignoredSections:prepared.ignoredSections,
        character:{slug:target.slug,name:target.name},
        summary:publicAddonSyncSummary(previousState)
      });
    }

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

    const entries=payload.sections.spellbook?.entries;
    const containsSpellbook=entries&&typeof entries==='object'&&Object.keys(entries).length>0;
    if(!previewIsolated&&containsSpellbook&&(!Array.isArray(classMaster?.abilities)||!classMaster.abilities.length))
      throw new Error('Klassenstammdaten derzeit nicht verfügbar; Synchronisation erneut versuchen');
    const snapshot=addonSpellbookSnapshot(payload,classMaster);
    if(snapshot&&classMaster&&!previewIsolated){
      snapshot.characterSlug=target.slug;
      const directIds=snapshot.entries.map(entry=>entry.id);
      let localized={};
      try{localized=await cachedGermanClassSpells(directIds)}catch{}
      updated=applySpellbookSnapshot(before,snapshot,{classMaster,localized,syncedAt:new Date().toISOString()});
      spellbookApplied=updated!==before;
      if(spellbookApplied)updated=await archiveKnownAbilityIcons(updated,target.slug);
    }

    // Only the accepted, actually supplied interaction domain may create
    // pending work. Inherited history must not be replayed on every sync.
    const incomingInteractions=payload.sections.interactions;
    const pendingObservationPayload=incomingInteractions&&prepared.payload.sections.interactions===incomingInteractions
      ?{addon:payload.addon,sections:{interactions:incomingInteractions}}:null;
    const pendingObservations=Boolean(pendingObservationPayload&&snapshotsFromAddonPayload(pendingObservationPayload,{characterSlug:target.slug}).length);
    assertSyncBudget();
    let state=await saveAddonSyncState(target.slug,prepared.payload,{lockToken,roster:spellbookApplied?updated:null,receipts:pendingObservations?prepared.receipts:confirmedReceipts(prepared.receipts),pendingObservations,pendingObservationPayload});
    const liveKnowledge=pendingObservations?await ingestAddonLiveKnowledge(pendingObservationPayload,{characterSlug:target.slug,lockToken}):{stored:0,duplicates:0,changed:0};
    if(pendingObservations)state=await saveAddonSyncState(target.slug,state.payload,{...writeOptions,receipts:confirmedReceipts(state.receipts),receivedAt:state.receivedAt,pendingObservations:false});
    if(spellbookApplied){
      try{await appendChangeBatch(before,updated,{source:'addon-sync'})}catch(error){
        console.warn('Addon-Sync-Änderungschronik konnte nicht geschrieben werden:',String(error.message).slice(0,140));
      }
    }
    const character=(updated.characters||before.characters).find(entry=>entry.slug===target.slug)||target;
    return reply(200,{
      duplicate:false,
      ignoredSections:prepared.ignoredSections,
      previewIsolated,
      spellbookApplied,
      liveKnowledge,
      character:{slug:character.slug,name:character.name,knownClassAbilitiesVerified:character.knownClassAbilitiesVerified===true},
      summary:publicAddonSyncSummary(state)
    });
  }catch(error){
    console.error('Addon-Synchronisierung fehlgeschlagen:',error);
    const status=/^(SYNC_CONFLICT|STALE_SPELLBOOK)/.test(String(error.message))?409:/Charakter nicht gefunden|Klasse .*passt|Charakterlevel|zeitlich|unvollständig|nicht unterstützt/.test(String(error.message))?400:503;
    return reply(status,{error:String(error.message).slice(0,180)});
  }
}
