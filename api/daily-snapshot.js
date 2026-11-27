import {blizzardApiConfigured} from '../scripts/blizzard-api.mjs';
import {disabledArchiveMetadata} from '../scripts/daily-snapshot-store.mjs';
import {configured,loadCharacters,acquireRefreshLock,releaseRefreshLock} from '../scripts/character-store.mjs';
import {getDailySnapshot,registerDailySnapshot,acquireDailySnapshotLock,releaseDailySnapshotLock} from '../scripts/history-store.mjs';
import {refreshAndPersist} from '../scripts/refresh-service.mjs';
import {ensurePetRuleState} from '../scripts/pet-rule-store.mjs';
import {publicPetRuleState} from '../scripts/pet-rulebook.mjs';

export const config={maxDuration:60};

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function acquireRefreshLockWithRetry({attempts=3,delayMs=2500}={}){
  for(let attempt=0;attempt<attempts;attempt++){
    const token=await acquireRefreshLock();
    if(token)return token;
    if(attempt<attempts-1)await sleep(delayMs);
  }
  return null;
}

export function berlinClock(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Europe/Berlin',
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour),minute:Number(parts.minute)};
}
export function dailyRefreshComplete(snapshotMeta){
  return snapshotMeta?.refresh?.persisted===true;
}

async function refreshDailyCharacters(){
  let refresh={pending:true,reason:'refresh_lock_unavailable',persisted:false};
  const beforeRefreshGeneratedAt=(await loadCharacters()).data?.generatedAt||null;
  const refreshLock=await acquireRefreshLockWithRetry();
  if(refreshLock){
    try{
      const result=await refreshAndPersist({lockToken:refreshLock,source:'daily'});
      refresh={success:result.success,changes:result.changes??null,persisted:result.persisted===true};
    }finally{
      await releaseRefreshLock(refreshLock);
    }
  }else{
    const afterRefreshGeneratedAt=(await loadCharacters()).data?.generatedAt||null;
    const concurrentCompleted=Number.isFinite(Date.parse(afterRefreshGeneratedAt||''))&&
      (!Number.isFinite(Date.parse(beforeRefreshGeneratedAt||''))||Date.parse(afterRefreshGeneratedAt)>Date.parse(beforeRefreshGeneratedAt));
    if(concurrentCompleted)refresh={success:1,changes:null,persisted:true,reason:'concurrent_refresh_completed'};
  }
  return refresh;
}

// Dependency injection permits a network-free regression of the real handler.
export function createDailySnapshotHandler(deps={}){
const {clock=berlinClock,configured:redisConfigured=configured,blizzardConfigured=blizzardApiConfigured,
  getDailySnapshot:readSnapshot=getDailySnapshot,registerDailySnapshot:registerSnapshot=registerDailySnapshot,
  acquireDailySnapshotLock:takeLock=acquireDailySnapshotLock,releaseDailySnapshotLock:releaseLock=releaseDailySnapshotLock,
  ensurePetRuleState:ensureRules=ensurePetRuleState,refreshDailyCharacters:refreshCharacters=refreshDailyCharacters,
  publicPetRuleState:publicRules=publicPetRuleState}=deps;
return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  const secret=process.env.CRON_SECRET;
  if(!secret||req.headers?.authorization!=='Bearer '+secret)return res.status(401).json({error:'Nicht autorisiert'});
  const local=clock();
  if(![5,6].includes(local.hour))return res.status(200).json({skipped:true,reason:'outside_early_morning_window',local});
  if(!redisConfigured())return res.status(503).json({error:'Datenbankverbindung fehlt'});
  if(!blizzardConfigured())return res.status(503).json({error:'Blizzard API-Zugangsdaten fehlen'});

  const existing=await readSnapshot(local.date);
  if(dailyRefreshComplete(existing))return res.status(200).json({skipped:true,reason:'already_completed',snapshot:existing});

  const dailyLock=await takeLock(local.date);
  if(!dailyLock)return res.status(200).json({pending:true,reason:'daily_snapshot_running'});
  try{
    const secondCheck=await readSnapshot(local.date);
    if(dailyRefreshComplete(secondCheck))return res.status(200).json({skipped:true,reason:'already_completed',snapshot:secondCheck});

    let meta=secondCheck||existing||null;
    let petRuleState;
    const firstAttempt=!meta;
    if(firstAttempt){
      // Privacy containment: do not fetch full raw profiles for public archives.
      // Keep the existing daily refresh and its retry marker independent of Blob.
      petRuleState=await ensureRules({force:true});
      meta=disabledArchiveMetadata(local.date);
      await registerSnapshot(meta);
    }else{
      // Never delete or overwrite historical archive references.
      petRuleState=await ensureRules({force:false});
    }

    const refresh=await refreshCharacters();
    const completedMeta={
      ...meta,
      refresh:{...refresh,attemptedAt:new Date().toISOString()}
    };
    await registerSnapshot(completedMeta);
    return res.status(200).json({
      saved:false,
      retried:!firstAttempt,
      archiveStatus:completedMeta.archiveStatus||'legacy_public',
      snapshot:completedMeta,
      refresh,
      petRules:publicRules(petRuleState)
    });
  }catch(error){
    console.error('Tageslauf fehlgeschlagen:',error);
    return res.status(503).json({error:'Tageslauf konnte nicht vollständig abgeschlossen werden'});
  }finally{
    try{await releaseLock(local.date,dailyLock)}catch(error){console.error('Daily-Snapshot-Sperre konnte nicht freigegeben werden:',error)}
  }
}

}
export default createDailySnapshotHandler();
