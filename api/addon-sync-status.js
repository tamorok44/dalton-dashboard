import {timingSafeEqual} from 'node:crypto';
import {loadAddonSyncState} from '../scripts/addon-sync-store.mjs';
import {publicAddonSyncSummary} from '../scripts/addon-sync.mjs';

function safeEqual(a,b){
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length===right.length&&timingSafeEqual(left,right);
}
function bearer(req){
  const raw=String(req.headers?.authorization||'');
  return raw.startsWith('Bearer ')?raw.slice(7):'';
}
function slug(value){
  return String(value||'').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Methode nicht erlaubt'})}
  const expected=process.env.DALTON_SYNC_TOKEN||process.env.SPELLBOOK_SYNC_TOKEN;
  if(!expected)return res.status(503).json({error:'Addon-Synchronisierung ist nicht konfiguriert'});
  if(!safeEqual(bearer(req),expected))return res.status(401).json({error:'Ungültige Addon-Sync-Berechtigung'});
  const url=new URL(req.url||'/api/addon-sync-status','https://dalton-dashboard.local');
  const characterSlug=slug(url.searchParams.get('character'));
  if(!characterSlug)return res.status(400).json({error:'Charakter fehlt'});
  try{
    const state=await loadAddonSyncState(characterSlug);
    if(!state)return res.status(404).json({error:'Noch kein Addon-Sync für diesen Charakter vorhanden'});
    return res.status(200).json({summary:publicAddonSyncSummary(state),state});
  }catch(error){
    console.error('Addon-Sync-Status fehlgeschlagen:',error);
    return res.status(503).json({error:'Addon-Sync-Status derzeit nicht verfügbar'});
  }
}
