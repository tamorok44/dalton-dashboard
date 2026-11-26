import {fetchForeverSnapshot,blizzardApiConfigured} from '../scripts/blizzard-api.mjs';
import {saveDailySnapshot,dailySnapshotStoreConfigured} from '../scripts/daily-snapshot-store.mjs';
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
export function dailyRefreshComplete(snapshotMeta,archiveConfigured=false){
  return snapshotMeta?.refresh?.persisted===true&&snapshotMeta.archiveStatus!=='failed'&&
    !(archiveConfigured&&snapshotMeta.archiveStatus==='disabled');
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

const dailyDependencies={configured,blizzardApiConfigured,dailySnapshotStoreConfigured,getDailySnapshot,
  acquireDailySnapshotLock,releaseDailySnapshotLock,ensurePetRuleState,loadCharacters,
  fetchForeverSnapshot,saveDailySnapshot,registerDailySnapshot,refreshDailyCharacters,
  publicPetRuleState,berlinClock};

// Dependency injection is solely for offline lifecycle tests. Production uses
// the same handler with its normal server dependencies.
export function createDailySnapshotHandler(overrides={}){
  const {configured,blizzardApiConfigured,dailySnapshotStoreConfigured,getDailySnapshot,
    acquireDailySnapshotLock,releaseDailySnapshotLock,ensurePetRuleState,loadCharacters,
    fetchForeverSnapshot,saveDailySnapshot,registerDailySnapshot,refreshDailyCharacters,
    publicPetRuleState,berlinClock}={...dailyDependencies,...overrides};
  return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  const secret=process.env.CRON_SECRET;
  if(!secret||req.headers?.authorization!=='Bearer '+secret)return res.status(401).json({error:'Nicht autorisiert'});
  if(process.env.VERCEL_ENV!=='production')return res.status(200).json({skipped:true,reason:'non_production'});
  const local=berlinClock();
  if(![5,6].includes(local.hour))return res.status(200).json({skipped:true,reason:'outside_early_morning_window',local});
  if(!configured())return res.status(503).json({error:'Datenbankverbindung fehlt'});
  if(!blizzardApiConfigured())return res.status(503).json({error:'Blizzard API-Zugangsdaten fehlen'});
  const archiveConfigured=dailySnapshotStoreConfigured();

  const existing=await getDailySnapshot(local.date);
  if(dailyRefreshComplete(existing,archiveConfigured))return res.status(200).json({skipped:true,reason:'already_completed',snapshot:existing});

  const dailyLock=await acquireDailySnapshotLock(local.date);
  if(!dailyLock)return res.status(200).json({pending:true,reason:'daily_snapshot_running'});
  try{
    const secondCheck=await getDailySnapshot(local.date);
    if(dailyRefreshComplete(secondCheck,archiveConfigured))return res.status(200).json({skipped:true,reason:'already_completed',snapshot:secondCheck});

    let meta=secondCheck||existing||null;
    const previousRefresh=meta?.refresh;
    let petRuleState;
    let saved=false;
    if(!meta||['disabled','failed'].includes(meta.archiveStatus)){
      // Regelprüfung bewusst vor Snapshot und Profil-Refresh: neue Livewerte dürfen nie mit ungeprüften Pet-Regeln verrechnet werden.
      petRuleState=await ensurePetRuleState({force:!meta});
      if(archiveConfigured){
        try{
          const {data:current}=await loadCharacters();
          const slugs=current.characters.map(c=>c.slug);
          const snapshot=await fetchForeverSnapshot(slugs);
          meta=await saveDailySnapshot(snapshot,local.date);
          if(previousRefresh?.persisted===true)meta={...meta,refresh:previousRefresh};
          await registerDailySnapshot(meta);
          saved=true;
        }catch(error){
          // Do not leak credentials, raw payloads or provider URLs in logs.
          console.error('Privates Tagesarchiv fehlgeschlagen');
          meta={date:local.date,createdAt:new Date().toISOString(),archiveStatus:'failed'};
        }
      }else{
        // Fail closed for raw data, but do not disable the dashboard's daily refresh.
        meta={date:local.date,createdAt:new Date().toISOString(),archiveStatus:'disabled'};
      }
    }else{
      // Ein bereits archivierter Snapshot wird nie erneut geschrieben. Ein unvollständiger Profil-Refresh darf aber wiederholt werden.
      petRuleState=await ensurePetRuleState({force:false});
    }

    const refresh=previousRefresh?.persisted===true?previousRefresh:await refreshDailyCharacters();
    const completedMeta={
      ...meta,
      refresh:{...refresh,attemptedAt:new Date().toISOString()}
    };
    await registerDailySnapshot(completedMeta);
    return res.status(meta.archiveStatus==='failed'?503:200).json({
      saved,
      retried:!saved,
      snapshot:completedMeta,
      refresh,
      petRules:publicPetRuleState(petRuleState)
    });
  }catch(error){
    console.error('Tageslauf fehlgeschlagen:',error);
    return res.status(503).json({error:'Tageslauf konnte nicht vollständig abgeschlossen werden'});
  }finally{
    try{await releaseDailySnapshotLock(local.date,dailyLock)}catch(error){console.error('Daily-Snapshot-Sperre konnte nicht freigegeben werden:',error)}
  }
}
}
export default createDailySnapshotHandler();
