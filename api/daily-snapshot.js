import {canonicalRoster,rosterMatches,rosterKey} from '../scripts/daily-roster.mjs';
import {fetchForeverSnapshot,blizzardApiConfigured} from '../scripts/blizzard-api.mjs';
import {saveDailySnapshot,recoverDailySnapshot,dailySnapshotStoreConfigured,withinArchiveDeadline,archivePath,verifyBlob} from '../scripts/daily-snapshot-store.mjs';
import {configured,loadCharacters,acquireRefreshLock,releaseRefreshLock,loadDailyProfileReceipt} from '../scripts/character-store.mjs';
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
const identities=data=>canonicalRoster(data.characters.map(c=>({slug:c.slug,id:c.blizzardCharacterId??null})));
export function profileRefreshComplete(receipt,date,expectedRoster=null){
  return receipt?.source==='daily'&&receipt.date===date&&receipt.persisted===true&&
    Number.isInteger(receipt.total)&&receipt.total>0&&receipt.success===receipt.total&&Number.isFinite(Date.parse(receipt.generatedAt))&&
    Array.isArray(receipt.roster)&&receipt.roster.length===receipt.total&&rosterMatches(receipt.roster,expectedRoster??receipt.roster);
}
function privateArchiveComplete(meta,expectedRoster=null){
  try{verifyBlob(meta,archivePath(meta.date,meta.roster));}catch{return false;}
  return meta?.archiveStatus==='private'&&['complete','partial'].includes(meta.quality?.status)&&meta.quality?.identity==='roster_id_and_slug'&&
    typeof meta.url==='string'&&/^https:\/\/[^/]+\.private\.blob\.vercel-storage\.com\//.test(meta.url)&&
    typeof meta.sha256==='string'&&/^[a-f0-9]{64}$/.test(meta.sha256)&&Array.isArray(meta.roster)&&
    meta.characters===meta.roster.length&&rosterMatches(meta.roster,expectedRoster??meta.roster)&&meta.rosterKey===rosterKey(meta.roster);
}
export function dailyRefreshComplete(snapshotMeta,archiveConfigured=false){
  return Boolean(profileRefreshComplete(snapshotMeta?.refresh,snapshotMeta?.date)&&
    (privateArchiveComplete(snapshotMeta,snapshotMeta?.refresh?.roster)||(!archiveConfigured&&snapshotMeta?.archiveStatus==='disabled')));
}

export async function refreshDailyCharacters(date,{takeLock=acquireRefreshLockWithRetry,releaseLock=releaseRefreshLock,readReceipt=loadDailyProfileReceipt,refresh=refreshAndPersist,readRoster=loadCharacters}={}){
  const refreshLock=await takeLock();
  if(!refreshLock)return {pending:true,reason:'refresh_lock_unavailable',persisted:false};
  try{
    const prior=await readReceipt(date);
    if(profileRefreshComplete(prior,date,identities((await readRoster()).data)))return prior;
    const result=await refresh({lockToken:refreshLock,source:'daily',dailyDate:date});
    return result.dailyReceipt??{source:'daily',date,success:result.success||0,persisted:false,reason:'profile_refresh_not_persisted'};
  }finally{
    await releaseLock(refreshLock);
  }
}

const dailyDependencies={configured,blizzardApiConfigured,dailySnapshotStoreConfigured,getDailySnapshot,
  acquireDailySnapshotLock,releaseDailySnapshotLock,ensurePetRuleState,loadCharacters,
  fetchForeverSnapshot,saveDailySnapshot,recoverDailySnapshot,registerDailySnapshot,refreshDailyCharacters,
  loadDailyProfileReceipt,publicPetRuleState,berlinClock,clock:Date.now};

export function createDailySnapshotHandler(overrides={}){
  const {configured,blizzardApiConfigured,dailySnapshotStoreConfigured,getDailySnapshot,
    acquireDailySnapshotLock,releaseDailySnapshotLock,ensurePetRuleState,loadCharacters,
    fetchForeverSnapshot,saveDailySnapshot,recoverDailySnapshot,registerDailySnapshot,refreshDailyCharacters,
    loadDailyProfileReceipt,publicPetRuleState,berlinClock,clock}={...dailyDependencies,...overrides};
  return async function handler(req,res){
  const started=clock();
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
  let dailyLock=null;
  try{
    dailyLock=await acquireDailySnapshotLock(local.date);
    if(!dailyLock)return res.status(200).json({pending:true,reason:'daily_snapshot_running'});
    const existing=await getDailySnapshot(local.date);
    const currentRoster=identities((await loadCharacters()).data);
    if(dailyRefreshComplete(existing,archiveConfigured)&&rosterMatches(existing.refresh.roster,currentRoster)){
      // Repair a pointer left behind by a pre-atomic historical writer.
      await registerDailySnapshot(existing,dailyLock);
      return res.status(200).json({skipped:true,reason:'already_completed',snapshot:existing});
    }
    const petRuleState=await ensurePetRuleState({force:!existing});
    let refresh=await loadDailyProfileReceipt(local.date);
    if(!profileRefreshComplete(refresh,local.date,currentRoster))refresh=await refreshDailyCharacters(local.date);
    // Refresh takes priority. A retry finds its durable receipt, even if the
    // process died after committing the profile but before the daily index.
    let meta=existing||null,saved=false,recovered=false;
    const legacyArchive=existing?.legacyArchive??(existing?.url&&!privateArchiveComplete(existing)?{url:existing.url,pathname:existing.pathname??null,sha256:existing.sha256??null,archiveStatus:'legacy_unverified'}:null);
    const previousArchives=[...(Array.isArray(existing?.previousArchives)?existing.previousArchives:[])];
    if(privateArchiveComplete(existing)&&!privateArchiveComplete(existing,refresh?.roster)){
      const {previousArchives:ignored,refresh:oldReceipt,legacyArchive:legacy,...reference}=existing;
      if(!previousArchives.some(x=>x.pathname===reference.pathname))previousArchives.push(reference);
    }
    if(!privateArchiveComplete(meta,refresh?.roster)||!profileRefreshComplete(refresh,local.date)){
      const failedMeta=archiveStatus=>({date:local.date,createdAt:new Date().toISOString(),archiveStatus,...(legacyArchive?{legacyArchive}:{})});
      if(!archiveConfigured)meta=failedMeta('disabled');
      else if(!profileRefreshComplete(refresh,local.date))meta=failedMeta('failed');
      else{
        const remaining=Math.min(12000,50000-(clock()-started));
        if(remaining<2000)meta=failedMeta('failed');
        else{
          const signal=AbortSignal.timeout(remaining),deadlineAt=performance.now()+remaining;
          try{
            const roster=canonicalRoster(refresh.roster);
            const slugs=roster.map(c=>c.slug);
            meta=await recoverDailySnapshot(local.date,{signal,deadlineAt,expectedRoster:roster});
            if(meta)recovered=true;
            else{
              const fetchImpl=(url,options={})=>fetch(url,{...options,signal:AbortSignal.any([signal,...(options.signal?[options.signal]:[])])});
              const snapshot=await withinArchiveDeadline(()=>fetchForeverSnapshot(slugs,{fetchImpl}),signal,deadlineAt);
              signal.throwIfAborted();
              meta=await saveDailySnapshot(snapshot,local.date,{signal,deadlineAt,expectedRoster:roster});
              saved=true;
            }
            if(!privateArchiveComplete(meta,refresh.roster))throw new Error('Archivmetadaten nicht bestätigt');
            if(legacyArchive)meta={...meta,legacyArchive};
          }catch{
            console.error('Privates Tagesarchiv fehlgeschlagen oder Zeitbudget erschöpft');
            meta=failedMeta('failed');
          }
        }
      }
    }
    const completedMeta={...meta,refresh,...(legacyArchive?{legacyArchive}:{}),...(previousArchives.length?{previousArchives}:{})};
    await registerDailySnapshot(completedMeta,dailyLock);
    const complete=dailyRefreshComplete(completedMeta,archiveConfigured)&&rosterMatches(refresh?.roster,identities((await loadCharacters()).data));
    return res.status(complete?200:503).json({saved,recovered,retried:Boolean(existing),snapshot:completedMeta,refresh,petRules:publicPetRuleState(petRuleState)});
  }catch(error){
    console.error('Tageslauf fehlgeschlagen:',error);
    return res.status(503).json({error:'Tageslauf konnte nicht vollständig abgeschlossen werden'});
  }finally{
    try{if(dailyLock)await releaseDailySnapshotLock(local.date,dailyLock)}catch(error){console.error('Daily-Snapshot-Sperre konnte nicht freigegeben werden:',error)}
  }
}
}
export default createDailySnapshotHandler();
