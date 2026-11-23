#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {existsSync,promises as fs,watch} from 'node:fs';
import {dirname,basename,join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {parseLuaSavedVariable} from './savedvariables-parser.mjs';
import {buildSafeAddonSyncPayload,publicAddonSyncSummary} from './addon-sync.mjs';

function args(argv){
  const out={watch:false,dryRun:false,file:null,endpoint:process.env.DALTON_SYNC_ENDPOINT||'https://dalton-dashboard-eight.vercel.app/api/addon-sync'};
  for(let i=0;i<argv.length;i++){
    const value=argv[i];
    if(value==='--watch')out.watch=true;
    else if(value==='--dry-run')out.dryRun=true;
    else if(value==='--file')out.file=argv[++i]||null;
    else if(value==='--endpoint')out.endpoint=argv[++i]||out.endpoint;
    else if(value==='--help')out.help=true;
    else throw new Error('Unbekannte Option: '+value);
  }
  return out;
}
function help(){
  console.log('Dalton Dashboard Sync Companion 0.1.0-alpha.5');
  console.log('  node scripts/dalton-sync-client.mjs [--file <DaltonDashboard.lua>] [--watch] [--dry-run] [--endpoint <URL>]');
  console.log('');
  console.log('Für echte Übertragung muss DALTON_SYNC_TOKEN in der lokalen Umgebung gesetzt sein.');
  console.log('Gold, Taschen und Bank werden vom Standard-Sync niemals übertragen.');
  console.log('Bei geschützten Vercel-Previews kann DALTON_SYNC_PREVIEW_SHARE_URL gesetzt werden.');
}
async function discoverFiles(){
  const wowRoots=[
    process.env.DALTON_WOW_ROOT,
    process.platform==='darwin'?'/Applications/World of Warcraft':null,
    process.platform==='darwin'?join(homedir(),'Applications','World of Warcraft'):null,
    process.env['PROGRAMFILES(X86)']?join(process.env['PROGRAMFILES(X86)'],'World of Warcraft'):null,
    process.env.PROGRAMFILES?join(process.env.PROGRAMFILES,'World of Warcraft'):null
  ].filter(Boolean).filter(existsSync);

  const accountRoots=[];
  for(const root of wowRoots){
    const directAccount=join(root,'WTF','Account');
    if(existsSync(directAccount))accountRoots.push(directAccount);

    let entries=[];
    try{entries=await fs.readdir(root,{withFileTypes:true})}catch{}
    for(const entry of entries){
      if(!entry.isDirectory())continue;
      const account=join(root,entry.name,'WTF','Account');
      if(existsSync(account))accountRoots.push(account);
    }
  }

  const found=[];
  async function walkSavedVariables(dir,depth){
    if(depth>7)return;
    let entries;
    try{entries=await fs.readdir(dir,{withFileTypes:true})}catch{return}
    for(const entry of entries){
      const full=join(dir,entry.name);
      if(entry.isDirectory()){
        if(entry.name==='Cache'||entry.name==='Logs')continue;
        await walkSavedVariables(full,depth+1);
      }else if(entry.isFile()&&entry.name==='DaltonDashboard.lua'&&/SavedVariables/i.test(full)){
        const stat=await fs.stat(full);
        found.push({file:full,mtime:stat.mtimeMs});
      }
    }
  }
  for(const root of [...new Set(accountRoots)])await walkSavedVariables(root,0);
  return found.sort((a,b)=>b.mtime-a.mtime);
}
async function resolveFile(explicit){
  if(explicit){
    const file=resolve(explicit);
    if(!existsSync(file))throw new Error('SavedVariables-Datei nicht gefunden: '+file);
    return file;
  }
  const matches=await discoverFiles();
  if(!matches.length)throw new Error('Keine DaltonDashboard.lua unter den üblichen WoW-Verzeichnissen gefunden. Bitte --file angeben.');
  if(matches.length>1){
    console.log('Mehrere SavedVariables-Dateien gefunden; verwendet wird die zuletzt geänderte:');
    for(const item of matches.slice(0,5))console.log('  '+item.file);
  }
  return matches[0].file;
}
async function readPayload(file){
  const raw=await fs.readFile(file,'utf8');
  const charDb=parseLuaSavedVariable(raw,'DaltonDashboardCharDB');
  const safePayload=buildSafeAddonSyncPayload(charDb);
  const hash=createHash('sha256').update(JSON.stringify(safePayload)).digest('hex');
  return {hash,payload:{...safePayload,syncId:hash}};
}
export function previewCookieFromSetCookie(values=[]){
  return values
    .map(value=>String(value||'').split(';')[0].trim())
    .filter(value=>value.startsWith('_vercel_jwt='))
    .join('; ');
}
async function previewCookie(shareUrl){
  if(!shareUrl)return null;
  const url=new URL(shareUrl);
  if(url.protocol!=='https:')throw new Error('Preview-Share-Link muss HTTPS verwenden');
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(response.status<200||response.status>=400)throw new Error('Preview-Freigabe HTTP '+response.status);
  const raw=typeof response.headers.getSetCookie==='function'
    ?response.headers.getSetCookie()
    :[response.headers.get('set-cookie')].filter(Boolean);
  const cookie=previewCookieFromSetCookie(raw);
  if(!cookie)throw new Error('Preview-Freigabe hat keinen Vercel-Zugangscookie geliefert');
  return cookie;
}
async function postPayload(endpoint,token,payload,{cookie=null}={}){
  const url=new URL(endpoint);
  if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('Sync-Endpunkt muss HTTPS verwenden');
  const headers={
    Authorization:'Bearer '+token,
    'Content-Type':'application/json',
    'User-Agent':'DaltonDashboardSync/0.1.0-alpha.5'
  };
  if(cookie)headers.Cookie=cookie;
  const response=await fetch(url,{
    method:'POST',
    headers,
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(20000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('Sync HTTP '+response.status+': '+String(body.error||response.statusText).slice(0,180));
  return body;
}
async function main(){
  const options=args(process.argv.slice(2));
  if(options.help){help();return}
  const file=await resolveFile(options.file);
  console.log('SavedVariables: '+file);
  let lastHash=null;
  let running=false;
  let rerun=false;
  const previewAuthCookie=await previewCookie(process.env.DALTON_SYNC_PREVIEW_SHARE_URL||null);

  const sync=async()=>{
    if(running){rerun=true;return}
    running=true;
    try{
      const {hash,payload}=await readPayload(file);
      if(hash===lastHash)return;
      const localSummary=publicAddonSyncSummary({characterSlug:null,receivedAt:null,payload});
      if(options.dryRun){
        console.log(JSON.stringify({dryRun:true,summary:localSummary},null,2));
        lastHash=hash;
        return;
      }
      const token=process.env.DALTON_SYNC_TOKEN;
      if(!token)throw new Error('DALTON_SYNC_TOKEN ist lokal nicht gesetzt');
      const result=await postPayload(options.endpoint,token,payload,{cookie:previewAuthCookie});
      lastHash=hash;
      console.log('Synchronisiert: '+String(result.character?.name||result.character?.slug||'Charakter')+
        ' · Spellbook '+String(result.summary?.spellbookEntryCount??0)+
        ' · Orte '+String(result.summary?.locationHistoryCount??0)+
        ' · Händler '+String(result.summary?.merchantObservationCount??0)+
        ' · Lehrer '+String(result.summary?.trainerObservationCount??0));
    }finally{
      running=false;
      if(rerun){rerun=false;setTimeout(()=>sync().catch(error=>console.error(error.message)),1000)}
    }
  };

  await sync();
  if(!options.watch)return;
  console.log('Beobachtung aktiv. WoW schreibt SavedVariables bei Logout bzw. /reload; dann wird automatisch synchronisiert.');
  let timer=null;
  const watcher=watch(dirname(file),(event,filename)=>{
    if(filename&&String(filename)!==basename(file))return;
    clearTimeout(timer);
    timer=setTimeout(()=>sync().catch(error=>console.error(error.message)),900);
  });
  process.on('SIGINT',()=>{watcher.close();process.exit(0)});
  process.on('SIGTERM',()=>{watcher.close();process.exit(0)});
}
const invokedDirectly=Boolean(process.argv[1])&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(invokedDirectly){
  main().catch(error=>{
    console.error('Dalton Sync: '+error.message);
    process.exitCode=1;
  });
}
