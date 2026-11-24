#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {existsSync,promises as fs,watch} from 'node:fs';
import {dirname,basename,join,resolve} from 'node:path';
import {homedir,platform} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {parseLuaSavedVariable} from './savedvariables-parser.mjs';
import {buildSafeAddonSyncPayload,publicAddonSyncSummary,addonSyncContentIdentity} from './addon-sync.mjs';

const execFileAsync=promisify(execFile);
const VERSION='0.1.0-alpha.11';
const TRUSTED_NAMES=new Set(['cole dalton','chucky dalton','dolly dalton','viola dalton']);

function normalizedName(value){return String(value||'').trim().toLocaleLowerCase('de-DE')}
function configFile(){
  if(platform()==='win32'){
    const base=process.env.LOCALAPPDATA||join(homedir(),'AppData','Local');
    return join(base,'DaltonDashboardBridge','config.json');
  }
  if(platform()==='darwin')return join(homedir(),'Library','Application Support','DaltonDashboardBridge','config.json');
  return join(process.env.XDG_CONFIG_HOME||join(homedir(),'.config'),'dalton-dashboard-bridge','config.json');
}
async function loadConfig(){
  try{return JSON.parse(await fs.readFile(configFile(),'utf8'))}catch{return {}}
}
async function saveConfig(value){
  const file=configFile();
  await fs.mkdir(dirname(file),{recursive:true});
  await fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  return file;
}
async function enrollDevice(endpoint,code,character=null,previewShareUrl=null){
  const base=new URL(endpoint);
  base.pathname=base.pathname.replace(/\/api\/addon-sync$/,'/api/addon-device-enroll');
  const cookie=await previewCookie(previewShareUrl);
  const response=await fetch(base,{
    method:'POST',
    headers:{'Content-Type':'application/json','User-Agent':'DaltonDashboardBridge/'+VERSION,...(cookie?{Cookie:cookie}:{})},
    body:JSON.stringify({code,character}),
    signal:AbortSignal.timeout(15000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('Einrichtung fehlgeschlagen: '+String(body.error||response.statusText).slice(0,180));
  const current=await loadConfig();
  const file=await saveConfig({...current,deviceToken:body.deviceToken,characterSlug:body.characterSlug,characterName:body.characterName,endpoint,previewShareUrl:previewShareUrl||null});
  return {...body,configFile:file};
}
async function revokeDevice(config){
  const token=config?.deviceToken;
  if(!token)return {revoked:false,alreadyAbsent:true};
  const endpoint=config.endpoint||process.env.DALTON_SYNC_ENDPOINT||'https://dalton-dashboard-eight.vercel.app/api/addon-sync';
  const base=new URL(endpoint);
  base.pathname=base.pathname.replace(/\/api\/addon-sync$/,'/api/addon-device-enroll');
  const cookie=await previewCookie(config.previewShareUrl||process.env.DALTON_SYNC_PREVIEW_SHARE_URL||null);
  const headers={
    Authorization:'Device '+token,
    'Content-Type':'application/json',
    'User-Agent':'DaltonDashboardBridge/'+VERSION
  };
  if(cookie)headers.Cookie=cookie;
  const response=await fetch(base,{
    method:'POST',
    headers,
    body:JSON.stringify({action:'revoke'}),
    signal:AbortSignal.timeout(15000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('Gerätezugang konnte nicht widerrufen werden: '+String(body.error||response.statusText).slice(0,180));
  const clean={...config};
  delete clean.deviceToken;
  clean.revokedAt=new Date().toISOString();
  await saveConfig(clean);
  return {revoked:true,characterName:config.characterName||null};
}
async function createEnrollment(endpoint,characterSlug,auth,{previewShareUrl=null}={}){
  if(!auth)throw new Error('Kein berechtigter Hub-Zugang für Einrichtungscodes vorhanden');
  const base=new URL(endpoint);
  base.pathname=base.pathname.replace(/\/api\/addon-sync$/,'/api/addon-device-enroll');
  const cookie=await previewCookie(previewShareUrl);
  const headers={Authorization:auth,'Content-Type':'application/json','User-Agent':'DaltonDashboardBridge/'+VERSION};
  if(cookie)headers.Cookie=cookie;
  const response=await fetch(base,{
    method:'POST',
    headers,
    body:JSON.stringify({action:'create',characterSlug}),
    signal:AbortSignal.timeout(15000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('Einrichtungscode konnte nicht erstellt werden: '+String(body.error||response.statusText).slice(0,180));
  return body;
}
function trustedCharacter(charDb){return TRUSTED_NAMES.has(normalizedName(charDb?.character?.name))}
function variablePattern(name){return new RegExp('(?:^|[\\r\\n])\\s*'+name+'\\s*=','m')}

function args(argv){
  const out={watch:false,dryRun:false,file:null,enroll:null,createEnroll:null,revokeDevice:false,character:null,previewShareUrl:null,endpoint:process.env.DALTON_SYNC_ENDPOINT||'https://dalton-dashboard-eight.vercel.app/api/addon-sync'};
  for(let i=0;i<argv.length;i++){
    const value=argv[i];
    if(value==='--watch')out.watch=true;
    else if(value==='--dry-run')out.dryRun=true;
    else if(value==='--file')out.file=argv[++i]||null;
    else if(value==='--endpoint')out.endpoint=argv[++i]||out.endpoint;
    else if(value==='--enroll')out.enroll=argv[++i]||null;
    else if(value==='--create-enroll')out.createEnroll=argv[++i]||null;
    else if(value==='--revoke-device')out.revokeDevice=true;
    else if(value==='--character')out.character=argv[++i]||null;
    else if(value==='--preview-share-url')out.previewShareUrl=argv[++i]||null;
    else if(value==='--help')out.help=true;
    else throw new Error('Unbekannte Option: '+value);
  }
  return out;
}
function help(){
  console.log('Dalton Dashboard Sync Companion '+VERSION);
  console.log('  node scripts/dalton-sync-client.mjs [--file <DaltonDashboard.lua>] [--watch] [--dry-run] [--endpoint <URL>]');
  console.log('  node scripts/dalton-sync-client.mjs --enroll <Einrichtungscode>');
  console.log('  node scripts/dalton-sync-client.mjs --create-enroll <character-slug>   # nur Administrator');
  console.log('  node scripts/dalton-sync-client.mjs --revoke-device                    # Gerätezugang widerrufen');
  console.log('');
  console.log('Synchronisiert Coles eigenen Datensatz und das ingame empfangene Dalton-Relay-Postfach.');
  console.log('Normale Spieler verwenden einen individuellen Gerätezugang; Cole kann damit zusätzlich Peer-Codes erzeugen.');
  console.log('Gold, Taschen und Bank werden vom Standard-Sync niemals übertragen.');
  console.log('Bei geschützten Vercel-Previews kann DALTON_SYNC_PREVIEW_SHARE_URL gesetzt werden.');
}
async function spotlightSavedVariables(){
  if(process.platform!=='darwin')return [];
  try{
    const {stdout}=await execFileAsync('/usr/bin/mdfind',[
      "kMDItemFSName == 'DaltonDashboard.lua'c"
    ],{maxBuffer:1024*1024});
    const candidates=String(stdout||'')
      .split(/\r?\n/)
      .map(value=>value.trim())
      .filter(Boolean)
      .filter(value=>/\/WTF\/Account\//i.test(value)&&/\/SavedVariables\/DaltonDashboard\.lua$/i.test(value));
    const found=[];
    for(const file of [...new Set(candidates)]){
      try{
        const stat=await fs.stat(file);
        if(stat.isFile())found.push({file,mtime:stat.mtimeMs,source:'Spotlight'});
      }catch{}
    }
    return found;
  }catch{
    return [];
  }
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

  const found=[...(await spotlightSavedVariables())];
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
        found.push({file:full,mtime:stat.mtimeMs,source:'WoW-Pfad'});
      }
    }
  }
  for(const root of [...new Set(accountRoots)])await walkSavedVariables(root,0);

  const unique=new Map();
  for(const item of found){
    const previous=unique.get(item.file);
    if(!previous||item.mtime>previous.mtime)unique.set(item.file,item);
  }
  return [...unique.values()].sort((a,b)=>b.mtime-a.mtime);
}
async function classifyCandidates(matches,{characterName=null}={}){
  const character=[],relay=[];
  const wanted=characterName?normalizedName(characterName):null;
  for(const item of matches){
    let raw;
    try{raw=await fs.readFile(item.file,'utf8')}catch{continue}
    if(variablePattern('DaltonDashboardCharDB').test(raw)){
      try{
        const db=parseLuaSavedVariable(raw,'DaltonDashboardCharDB');
        if(trustedCharacter(db)&&(!wanted||normalizedName(db.character?.name)===wanted))character.push({...item,charDb:db});
      }catch{}
    }
    if(variablePattern('DaltonDashboardDB').test(raw)&&raw.includes('relayInbox')){
      relay.push({...item,raw});
    }
  }
  return {character,relay};
}
async function resolveSources(explicit,{characterName=null}={}){
  let explicitCharacter=null,explicitRelay=null;
  if(explicit){
    const file=resolve(explicit);
    if(!existsSync(file))throw new Error('SavedVariables-Datei nicht gefunden: '+file);
    const raw=await fs.readFile(file,'utf8');
    if(variablePattern('DaltonDashboardCharDB').test(raw)){
      const explicitDb=parseLuaSavedVariable(raw,'DaltonDashboardCharDB');
      if(!characterName||normalizedName(explicitDb.character?.name)===normalizedName(characterName))explicitCharacter={file,raw};
    }
    if(variablePattern('DaltonDashboardDB').test(raw)&&raw.includes('relayInbox'))explicitRelay={file,raw};
    if(!explicitCharacter&&!explicitRelay)throw new Error('Die angegebene Datei enthält keine Dalton-Dashboard-SavedVariables.');
  }

  const matches=await discoverFiles();
  const classified=await classifyCandidates(matches,{characterName});
  const characterFile=explicitCharacter?.file||classified.character[0]?.file||null;
  const relayFile=explicitRelay?.file||classified.relay[0]?.file||null;

  if(!characterFile&&!relayFile){
    throw new Error('Keine passenden DaltonDashboard.lua gefunden. Bitte WoW mit aktiviertem AddOn starten und einmal /reload ausführen.');
  }
  return {characterFile,relayFile};
}
async function resolveSourcesWithRetry(explicit,watchMode,{characterName=null}={}){
  while(true){
    try{return await resolveSources(explicit,{characterName})}
    catch(error){
      if(!watchMode)throw error;
      console.error('Dalton Bridge wartet auf WoW-SavedVariables: '+String(error.message||error).slice(0,180));
      await new Promise(resolve=>setTimeout(resolve,30000));
    }
  }
}
function localDiagnosticsSummary(charDb){
  const interactions=charDb?.diagnostics?.interactions;
  const relay=charDb?.diagnostics?.relay;
  if(!interactions&&!relay)return null;
  return {
    interactions:interactions&&typeof interactions==='object'?{
      lastEvent:interactions.lastEvent||null,
      lastEventAt:interactions.lastEventAt||null,
      eventCount:Number(interactions.eventCount)||0,
      eventCounts:interactions.eventCounts||{},
      lastMerchantCaptureOK:interactions.lastMerchantCaptureOK??null,
      lastMerchantCaptureDetail:interactions.lastMerchantCaptureDetail||null,
      lastTrainerCaptureOK:interactions.lastTrainerCaptureOK??null,
      lastTrainerCaptureDetail:interactions.lastTrainerCaptureDetail||null
    }:null,
    relay:relay&&typeof relay==='object'?relay:null
  };
}
function payloadRecord(charDb,{key,transport,source,diagnostics=null}){
  const safePayload=buildSafeAddonSyncPayload(charDb);
  safePayload.client={transport,transportVersion:VERSION};
  const hash=createHash('sha256').update(JSON.stringify(addonSyncContentIdentity(safePayload))).digest('hex');
  return {
    key,
    hash,
    payload:{...safePayload,syncId:hash},
    source,
    localDiagnostics:diagnostics
  };
}
async function readCharacterRecord(file){
  if(!file)return null;
  const raw=await fs.readFile(file,'utf8');
  const charDb=parseLuaSavedVariable(raw,'DaltonDashboardCharDB');
  if(!trustedCharacter(charDb))return null;
  return payloadRecord(charDb,{
    key:'local:'+normalizedName(charDb.character.name),
    transport:'dalton-local-bridge',
    source:file,
    diagnostics:localDiagnosticsSummary(charDb)
  });
}
export function relayCharDbsFromGlobalDb(globalDb){
  const inbox=globalDb?.relayInbox;
  if(!inbox||typeof inbox!=='object'||Array.isArray(inbox))return [];
  return Object.entries(inbox)
    .map(([inboxKey,entry])=>({inboxKey,charDb:entry?.charDb}))
    .filter(entry=>entry.charDb&&typeof entry.charDb==='object'&&trustedCharacter(entry.charDb))
    .filter(entry=>normalizedName(entry.charDb.character?.name)!=='cole dalton');
}
async function readRelayRecords(file){
  if(!file)return [];
  const raw=await fs.readFile(file,'utf8');
  const globalDb=parseLuaSavedVariable(raw,'DaltonDashboardDB');
  const records=[];
  for(const {inboxKey,charDb} of relayCharDbsFromGlobalDb(globalDb)){
    const charDb=entry?.charDb;
    if(!charDb||typeof charDb!=='object'||!trustedCharacter(charDb))continue;
    const name=normalizedName(charDb.character?.name);
    if(!name||name==='cole dalton')continue;
    try{
      records.push(payloadRecord(charDb,{
        key:'relay:'+name,
        transport:'dalton-peer-relay',
        source:file+'#'+inboxKey,
        diagnostics:null
      }));
    }catch(error){
      console.error('Relay-Datensatz übersprungen: '+String(error.message||error).slice(0,180));
    }
  }
  return records.sort((a,b)=>a.key.localeCompare(b.key,'de'));
}
async function readRecords(sources){
  const records=[];
  const local=await readCharacterRecord(sources.characterFile);
  if(local)records.push(local);
  records.push(...await readRelayRecords(sources.relayFile));
  return records;
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
async function postPayload(endpoint,auth,payload,{cookie=null}={}){
  const url=new URL(endpoint);
  if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('Sync-Endpunkt muss HTTPS verwenden');
  const headers={
    Authorization:auth,
    'Content-Type':'application/json',
    'User-Agent':'DaltonDashboardSync/'+VERSION
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
  if(options.createEnroll){
    const config=await loadConfig();
    if(config.endpoint&&!process.env.DALTON_SYNC_ENDPOINT)options.endpoint=config.endpoint;
    const masterToken=process.env.DALTON_SYNC_TOKEN||null;
    const auth=masterToken?'Bearer '+masterToken:(config.deviceToken?'Device '+config.deviceToken:null);
    const created=await createEnrollment(options.endpoint,options.createEnroll,auth,{
      previewShareUrl:options.previewShareUrl||config.previewShareUrl||process.env.DALTON_SYNC_PREVIEW_SHARE_URL||null
    });
    console.log('Einrichtungscode für '+String(created.characterName||created.characterSlug)+':');
    console.log(created.code);
    console.log('Gültig für '+Math.round(Number(created.expiresInSeconds||0)/3600)+' Stunden und genau einmal.');
    return;
  }
  if(options.enroll){
    const enrolled=await enrollDevice(options.endpoint,options.enroll,options.character,options.previewShareUrl);
    console.log('Bridge gekoppelt: '+String(enrolled.characterName||enrolled.characterSlug));
    console.log('Konfiguration: '+enrolled.configFile);
    return;
  }
  if(options.revokeDevice){
    const config=await loadConfig();
    const result=await revokeDevice(config);
    if(result.alreadyAbsent)console.log('Kein aktiver Gerätezugang vorhanden.');
    else console.log('Gerätezugang widerrufen: '+String(result.characterName||'Dalton-Gerät'));
    return;
  }

  const config=await loadConfig();
  if(config.endpoint&&!process.env.DALTON_SYNC_ENDPOINT)options.endpoint=config.endpoint;
  const sources=await resolveSourcesWithRetry(options.file,options.watch,{characterName:config.deviceToken?config.characterName:null});
  if(sources.characterFile)console.log('Eigener Charakter: '+sources.characterFile);
  if(sources.relayFile)console.log('Relay-Postfach: '+sources.relayFile);

  const lastHashes=new Map();
  let running=false;
  let rerun=false;
  const previewAuthCookie=await previewCookie(options.previewShareUrl||config.previewShareUrl||process.env.DALTON_SYNC_PREVIEW_SHARE_URL||null);

  const sync=async()=>{
    if(running){rerun=true;return}
    running=true;
    try{
      const records=await readRecords(sources);
      if(!records.length)return;
      const deviceToken=config.deviceToken||process.env.DALTON_DEVICE_TOKEN||null;
      const masterToken=process.env.DALTON_SYNC_TOKEN||null;
      const auth=options.dryRun?null:(masterToken?'Bearer '+masterToken:(deviceToken?'Device '+deviceToken:null));
      if(!options.dryRun&&!auth)throw new Error('Bridge ist noch nicht eingerichtet');

      for(const record of records){
        if(lastHashes.get(record.key)===record.hash)continue;
        const localSummary=publicAddonSyncSummary({characterSlug:null,receivedAt:null,payload:record.payload});
        if(options.dryRun){
          console.log(JSON.stringify({
            dryRun:true,
            key:record.key,
            transport:record.payload.client?.transport,
            summary:localSummary,
            localDiagnostics:record.localDiagnostics
          },null,2));
          lastHashes.set(record.key,record.hash);
          continue;
        }

        try{
          const result=await postPayload(options.endpoint,auth,record.payload,{cookie:previewAuthCookie});
          lastHashes.set(record.key,record.hash);
          console.log('Synchronisiert: '+String(result.character?.name||result.character?.slug||record.key)+
            ' · Transport '+String(record.payload.client?.transport||'unbekannt')+
            ' · Spellbook '+String(result.summary?.spellbookEntryCount??0)+
            ' · Orte '+String(result.summary?.locationHistoryCount??0)+
            ' · Händler '+String(result.summary?.merchantObservationCount??0)+
            ' · Lehrer '+String(result.summary?.trainerObservationCount??0));
        }catch(error){
          console.error(record.key+': '+String(error.message||error).slice(0,220));
        }
      }
    }finally{
      running=false;
      if(rerun){rerun=false;setTimeout(()=>sync().catch(error=>console.error(error.message)),1000)}
    }
  };

  await sync();
  if(!options.watch)return;

  console.log('Beobachtung aktiv. Nach /reload oder Logout synchronisiert der Companion Coles Daten und das Relay-Postfach automatisch.');
  const files=[sources.characterFile,sources.relayFile].filter(Boolean);
  const byDirectory=new Map();
  for(const file of files){
    const dir=dirname(file);
    if(!byDirectory.has(dir))byDirectory.set(dir,new Set());
    byDirectory.get(dir).add(basename(file));
  }

  let timer=null;
  const watchers=[];
  for(const [dir,names] of byDirectory){
    const watcher=watch(dir,(event,filename)=>{
      if(filename&&!names.has(String(filename)))return;
      clearTimeout(timer);
      timer=setTimeout(()=>sync().catch(error=>console.error(error.message)),900);
    });
    watchers.push(watcher);
  }
  const close=()=>{for(const watcher of watchers)watcher.close();process.exit(0)};
  process.on('SIGINT',close);
  process.on('SIGTERM',close);
}
const invokedDirectly=import.meta.main===true||(Boolean(process.argv[1])&&import.meta.url===pathToFileURL(process.argv[1]).href);
if(invokedDirectly){
  main().catch(error=>{
    console.error('Dalton Sync: '+error.message);
    process.exitCode=1;
  });
}
