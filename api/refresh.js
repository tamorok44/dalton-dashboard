import {loadLiveKnowledgeVersion} from '../scripts/live-knowledge-store.mjs';
import {loadPublicAddonSyncStates} from '../scripts/addon-sync-store.mjs';
import {enrichKnowledgeMedia} from '../scripts/knowledge-media.mjs';
import {configured,acquireRefreshLock,releaseRefreshLock,manualCooldown} from '../scripts/character-store.mjs';
import {refreshAndPersist} from '../scripts/refresh-service.mjs';
import {ensurePetRuleState} from '../scripts/pet-rule-store.mjs';
import {publicPetRuleState} from '../scripts/pet-rulebook.mjs';
import {buildDataVersion} from '../scripts/data-version.mjs';
export const config={maxDuration:60};
let pending=null;

async function runLockedRefresh(lockToken,source){
  try{
    const petRuleState=await ensurePetRuleState({force:false});
    const result=await refreshAndPersist({lockToken,source});
    return {result,petRuleState};
  }finally{
    try{await releaseRefreshLock(lockToken)}catch(error){console.error('Redis-Refresh-Sperre konnte nicht freigegeben werden:',error)}
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Methode nicht erlaubt'})}
  if(req.method==='POST'){
    const secret=process.env.CRON_SECRET;
    if(!secret||req.headers?.authorization!=='Bearer '+secret)return res.status(401).json({error:'Nicht autorisiert'});
  }
  if(!configured())return res.status(503).json({error:'Datenbankverbindung fehlt; Live-Daten wurden nicht gespeichert'});
  try{
    if(pending){
      if(req.method==='POST')return res.status(200).json({pending:true,reason:'already_running'});
      return res.status(202).json({pending:true,reason:'already_running'});
    }
    if(req.method==='GET'&&!(await manualCooldown()))return res.status(429).json({error:'Aktualisierung wurde kürzlich gestartet. Bitte eine Minute warten.'});
    const lockToken=await acquireRefreshLock();
    if(!lockToken){
      if(req.method==='POST')return res.status(200).json({pending:true,reason:'already_running'});
      return res.status(202).json({pending:true,reason:'already_running'});
    }
    pending=runLockedRefresh(lockToken,req.method==='GET'?'manual':'scheduled')
      .finally(()=>{pending=null});
    const {result,petRuleState}=await pending;
    if(result.success===0)return res.status(503).json({error:'Die aktuellen Profilquellen sind nicht erreichbar; gespeicherte Daten bleiben erhalten'});
    const petRules=publicPetRuleState(petRuleState);
    const [addonSync,liveKnowledgeVersion]=await Promise.all([
      loadPublicAddonSyncStates((result.data?.characters||[]).map(c=>c.slug).filter(Boolean)),loadLiveKnowledgeVersion().catch(()=>null)
    ]);
    const dataVersion=buildDataVersion({data:result.data,petRules,addonSync,liveKnowledgeVersion});
    const media=await enrichKnowledgeMedia(result.data,result.petCatalog,{allowFetch:false}).catch(()=>({data:result.data,petCatalog:result.petCatalog}));
    return res.status(200).json({...result,...media,petRules,addonSync,dataVersion});
  }catch(error){
    console.error('Live-Abruf oder Speichern fehlgeschlagen:',error);
    return res.status(503).json({error:'Aktualisierung konnte nicht dauerhaft gespeichert werden'});
  }
}
