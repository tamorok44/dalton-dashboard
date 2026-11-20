import {fetchForeverSnapshot,blizzardApiConfigured} from '../scripts/blizzard-api.mjs';
import {saveDailySnapshot,dailySnapshotStoreConfigured} from '../scripts/daily-snapshot-store.mjs';
import {configured,loadCharacters,acquireRefreshLock,releaseRefreshLock} from '../scripts/character-store.mjs';
import {getDailySnapshot,registerDailySnapshot,acquireDailySnapshotLock,releaseDailySnapshotLock} from '../scripts/history-store.mjs';
import {refreshAndPersist} from '../scripts/refresh-service.mjs';

export const config={maxDuration:60};

export function berlinClock(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Europe/Berlin',
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour),minute:Number(parts.minute)};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  const secret=process.env.CRON_SECRET;
  if(!secret||req.headers?.authorization!=='Bearer '+secret)return res.status(401).json({error:'Nicht autorisiert'});
  const local=berlinClock();
  if(![5,6].includes(local.hour))return res.status(200).json({skipped:true,reason:'outside_early_morning_window',local});
  if(!configured())return res.status(503).json({error:'Datenbankverbindung fehlt'});
  if(!blizzardApiConfigured())return res.status(503).json({error:'Blizzard API-Zugangsdaten fehlen'});
  if(!dailySnapshotStoreConfigured())return res.status(503).json({error:'Blob-Speicher fehlt'});

  const existing=await getDailySnapshot(local.date);
  if(existing)return res.status(200).json({skipped:true,reason:'already_saved',snapshot:existing});

  const dailyLock=await acquireDailySnapshotLock(local.date);
  if(!dailyLock)return res.status(200).json({pending:true,reason:'daily_snapshot_running'});
  try{
    const secondCheck=await getDailySnapshot(local.date);
    if(secondCheck)return res.status(200).json({skipped:true,reason:'already_saved',snapshot:secondCheck});
    const {data:current}=await loadCharacters();
    const slugs=current.characters.map(c=>c.slug);
    const snapshot=await fetchForeverSnapshot(slugs);
    const meta=await saveDailySnapshot(snapshot,local.date);
    await registerDailySnapshot(meta);

    let refresh={pending:true,reason:'refresh_lock_unavailable'};
    const refreshLock=await acquireRefreshLock();
    if(refreshLock){
      try{
        const result=await refreshAndPersist({lockToken:refreshLock,source:'daily'});
        refresh={success:result.success,changes:result.changes,persisted:result.persisted===true};
      }finally{
        await releaseRefreshLock(refreshLock);
      }
    }
    return res.status(200).json({saved:true,snapshot:meta,refresh});
  }catch(error){
    console.error('Tages-Snapshot fehlgeschlagen:',error);
    return res.status(503).json({error:'Tages-Snapshot konnte nicht gespeichert werden'});
  }finally{
    try{await releaseDailySnapshotLock(local.date,dailyLock)}catch(error){console.error('Daily-Snapshot-Sperre konnte nicht freigegeben werden:',error)}
  }
}
