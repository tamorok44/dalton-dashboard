import {publicCharacterData} from '../scripts/public-character-profile.mjs';
import {timingSafeEqual} from 'node:crypto';
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

function matchesToken(value,expected){
  if(typeof value!=='string'||typeof expected!=='string'||!expected||value.length>512)return false;
  const left=Buffer.from(value),right=Buffer.from(expected);
  return left.length===right.length&&timingSafeEqual(left,right);
}
export function refreshAuthorization(req,env=process.env){
  if(env.VERCEL_ENV!=='production')return null;
  const authorization=req.headers?.authorization;
  if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))return null;
  const token=authorization.slice(7);
  const scheduled=env.CRON_SECRET;
  const manual=env.DALTON_MANUAL_REFRESH_TOKEN;
  if(matchesToken(token,scheduled))return 'scheduled';
  // This credential is restricted to this route and must not reuse a
  // privileged application/cron/device setup token.
  const other=[scheduled,env.DALTON_SYNC_TOKEN,env.SPELLBOOK_SYNC_TOKEN,env.DALTON_PREVIEW_SETUP_TOKEN,
    env.BLIZZARD_CLIENT_SECRET,env.FOREVERDB_API_KEY,env.KV_REST_API_TOKEN,env.UPSTASH_REDIS_REST_TOKEN,env.BLOB_READ_WRITE_TOKEN,env.DALTON_PRIVATE_ARCHIVE_TOKEN];
  if(typeof manual==='string'&&manual.length>=32&&manual.length<=256&&!other.some(secret=>secret&&matchesToken(manual,secret))&&matchesToken(token,manual))return 'manual';
  return null;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Live-Aktualisierung erfordert einen autorisierten POST-Aufruf'})}
  const source=refreshAuthorization(req);
  if(!source)return res.status(401).json({error:'Nicht autorisiert'});
  const manual=source==='manual';
  if(!configured())return res.status(503).json({error:'Datenbankverbindung fehlt; Live-Daten wurden nicht gespeichert'});
  try{
    if(pending){
      if(!manual)return res.status(200).json({pending:true,reason:'already_running'});
      return res.status(202).json({pending:true,reason:'already_running'});
    }
    if(manual&&!(await manualCooldown()))return res.status(429).json({error:'Aktualisierung wurde kürzlich gestartet. Bitte eine Minute warten.'});
    const lockToken=await acquireRefreshLock();
    if(!lockToken){
      if(!manual)return res.status(200).json({pending:true,reason:'already_running'});
      return res.status(202).json({pending:true,reason:'already_running'});
    }
    pending=runLockedRefresh(lockToken,source)
      .finally(()=>{pending=null});
    const {result,petRuleState}=await pending;
    if(result.success===0)return res.status(503).json({error:'Die aktuellen Profilquellen sind nicht erreichbar; gespeicherte Daten bleiben erhalten'});
    const petRules=publicPetRuleState(petRuleState);
    const [addonSync,liveKnowledgeVersion]=await Promise.all([
      loadPublicAddonSyncStates((result.data?.characters||[]).map(c=>c.slug).filter(Boolean)),loadLiveKnowledgeVersion().catch(()=>null)
    ]);
    const dataVersion=buildDataVersion({data:result.data,petRules,addonSync,liveKnowledgeVersion});
    const media=await enrichKnowledgeMedia(result.data,result.petCatalog,{allowFetch:false}).catch(()=>({data:result.data,petCatalog:result.petCatalog}));
    return res.status(200).json({...result,...media,data:publicCharacterData(media.data),petRules,addonSync,dataVersion});
  }catch(error){
    console.error('Live-Abruf oder Speichern fehlgeschlagen:',error);
    return res.status(503).json({error:'Aktualisierung konnte nicht dauerhaft gespeichert werden'});
  }
}
