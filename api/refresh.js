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
    const dataVersion=buildDataVersion({data:result.data,petRules});
    return res.status(200).json({...result,petRules,dataVersion});
  }catch(error){
    console.error('Live-Abruf oder Speichern fehlgeschlagen:',error);
    return res.status(503).json({error:'Aktualisierung konnte nicht dauerhaft gespeichert werden'});
  }
}
