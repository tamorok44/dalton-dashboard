#!/usr/bin/env node
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,promises as fs,watch} from 'node:fs';
import {dirname,basename,join,resolve} from 'node:path';
import {homedir,platform} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {parseLuaSavedVariable} from './savedvariables-parser.mjs';
import {buildSafeAddonSyncPayload,publicAddonSyncSummary,addonSyncContentIdentity} from './addon-sync.mjs';

const execFileAsync=promisify(execFile);
const VERSION='0.1.0-beta.1';
const DEFAULT_ENDPOINT='https://dalton-dashboard-eight.vercel.app/api/addon-sync';
const TRUSTED_NAMES=new Set(['cole dalton','chucky dalton','dolly dalton','viola dalton']);
const TRUSTED_SLUGS=new Set([...TRUSTED_NAMES].map(name=>name.replace(' ','-')));

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
  try{
    const value=JSON.parse(await fs.readFile(configFile(),'utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Ungültige Bridge-Konfiguration');
    return value;
  }catch(error){if(error.code==='ENOENT')return {};throw error;}
}
// Exclusive interprocess lock outside the installation directory. Never
// steal a lock by age: a paused process could still commit. Fail closed.
async function withConfigMutation(operation){
  const dir=dirname(configFile()),lock=dir+'.mutation.lock';
  await fs.mkdir(dirname(dir),{recursive:true});
  try{await fs.mkdir(lock,{mode:0o700})}
  catch(error){if(error.code==='EEXIST')throw Error('Andere Geräteverwaltung aktiv oder unterbrochen; bitte nach Prüfung erneut versuchen');throw error;}
  try{return await operation()}
  finally{await fs.rmdir(lock)}
}
async function saveConfig(value){
  const file=configFile(),dir=dirname(file);
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const tmp=join(dir,'.config-'+randomUUID()+'.tmp');
  let handle;
  try{
    handle=await fs.open(tmp,'wx',0o600);
    await handle.writeFile(JSON.stringify(value,null,2)+'\n');
    await handle.sync();
    await handle.close();handle=null;
    await fs.rename(tmp,file);
    return file;
  }finally{if(handle)await handle.close();await fs.rm(tmp,{force:true})}
}
// All credential-bearing requests share one transport boundary, including
// enrollment and revoke. No plaintext loopback exceptions or redirects.
export function secureBridgeEndpoint(endpoint){
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/addon-sync')throw Error('Sync-Endpunkt muss eine HTTPS-URL ohne Zugangsdaten, Query oder Fragment sein');
  return url;
}
function enrollmentEndpoint(endpoint){
  const url=secureBridgeEndpoint(endpoint);
  url.pathname='/api/addon-device-enroll';
  return url;
}
export async function enrollDevice(endpoint,code,character=null,previewShareUrl=null){
  const base=enrollmentEndpoint(endpoint);
  validateShareUrl(previewShareUrl,base.origin);
  return withConfigMutation(()=>enrollDeviceLocked(endpoint,code,character,previewShareUrl));
}
async function enrollDeviceLocked(endpoint,code,character=null,previewShareUrl=null){
  const base=enrollmentEndpoint(endpoint);
  const current=await loadConfig();
  const cookie=await previewCookie(previewShareUrl,base.origin);
  const response=await fetch(base,{
    method:'POST',
    redirect:'error',
    headers:{'Content-Type':'application/json','User-Agent':'DaltonDashboardBridge/'+VERSION,...(cookie?{Cookie:cookie}:{})},
    body:JSON.stringify({code,character}),
    signal:AbortSignal.timeout(15000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('Einrichtung fehlgeschlagen: '+String(body.error||response.statusText).slice(0,180));
  if(typeof body.deviceToken!=='string'||!/^ddv1_[A-Za-z0-9_-]{43}$/.test(body.deviceToken)||!TRUSTED_SLUGS.has(body.characterSlug)||normalizedName(body.characterName)!==body.characterSlug.replace('-',' '))throw Error('Ungültige Kopplungsantwort; lokale Konfiguration bleibt erhalten');
  const next={...current,deviceToken:body.deviceToken,characterSlug:body.characterSlug,characterName:body.characterName,endpoint,previewShareUrl:previewShareUrl||null};
  delete next.revokedAt;
  const file=await saveConfig(next);
  return {...body,configFile:file};
}
export async function revokeDevice(config,{endpoint=config.endpoint||process.env.DALTON_SYNC_ENDPOINT||DEFAULT_ENDPOINT,previewShareUrl=config.previewShareUrl||process.env.DALTON_SYNC_PREVIEW_SHARE_URL||null}={}){
  if(!config?.deviceToken)return {revoked:false,alreadyAbsent:true};
  assertStoredDeviceOrigin(config,endpoint);
  validateShareUrl(previewShareUrl,secureBridgeEndpoint(endpoint).origin);
  return withConfigMutation(()=>revokeDeviceLocked(config,{endpoint,previewShareUrl}));
}
async function revokeDeviceLocked(config,{endpoint,previewShareUrl}){
  const token=config?.deviceToken;
  if(!token)return {revoked:false,alreadyAbsent:true};
  assertStoredDeviceOrigin(config,endpoint);
  const base=enrollmentEndpoint(endpoint);
  const cookie=await previewCookie(previewShareUrl,base.origin);
  const headers={
    Authorization:'Device '+token,
    'Content-Type':'application/json',
    'User-Agent':'DaltonDashboardBridge/'+VERSION
  };
  if(cookie)headers.Cookie=cookie;
  const response=await fetch(base,{
    method:'POST',
    redirect:'error',
    headers,
    body:JSON.stringify({action:'revoke'}),
    signal:AbortSignal.timeout(15000)
  });
  // Never discard the only local credential without an explicit positive
  // acknowledgement from the expected API. 2xx alone is not evidence.
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error('Gerätezugang konnte nicht widerrufen werden: '+String(body?.error||response.statusText).slice(0,180));
  const jsonType=String(response.headers?.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const confirmed=body&&typeof body==='object'&&!Array.isArray(body)&&!Object.hasOwn(body,'error')&&
    ((body.revoked===true&&body.alreadyRevoked===false)||(body.revoked===false&&body.alreadyRevoked===true));
  if(response.status!==200||jsonType!=='application/json'||!confirmed)throw Error('Widerruf nicht eindeutig bestätigt; lokale Kopplung bleibt erhalten');
  const current=await loadConfig();
  // Protect against older, nonparticipating writers as well.
  if(current.deviceToken!==token||secureBridgeEndpoint(current.endpoint??DEFAULT_ENDPOINT).origin!==base.origin)throw Error('Lokale Kopplung wurde inzwischen geändert; neue Kopplung bleibt erhalten');
  const clean={...current};
  delete clean.deviceToken;
  clean.revokedAt=new Date().toISOString();
  await saveConfig(clean);
  return {revoked:true,characterName:config.characterName||null};
}
export async function createEnrollment(endpoint,characterSlug,auth,{previewShareUrl=null}={}){
  if(!auth)throw new Error('Kein berechtigter Hub-Zugang für Einrichtungscodes vorhanden');
  const base=enrollmentEndpoint(endpoint);
  const cookie=await previewCookie(previewShareUrl,base.origin);
  const headers={Authorization:auth,'Content-Type':'application/json','User-Agent':'DaltonDashboardBridge/'+VERSION};
  if(cookie)headers.Cookie=cookie;
  const response=await fetch(base,{
    method:'POST',
    redirect:'error',
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

// Parse and validate the entire command before reading config, discovering
// files, fetching preview cookies, or entering any credential-bearing path.
export function args(argv){
  const out={watch:false,dryRun:false,file:null,enroll:null,createEnroll:null,revokeDevice:false,promoteProduction:false,character:null,previewShareUrl:null,endpointProvided:false,endpoint:null};
  const switches=new Map([['--watch','watch'],['--dry-run','dryRun'],['--revoke-device','revokeDevice'],['--promote-production','promoteProduction'],['--help','help']]);
  const values=new Map([['--file','file'],['--endpoint','endpoint'],['--enroll','enroll'],['--create-enroll','createEnroll'],['--character','character'],['--preview-share-url','previewShareUrl']]);
  const seen=new Set();
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];
    if(!switches.has(flag)&&!values.has(flag))throw Error('Unbekannte Option: '+String(flag));
    if(seen.has(flag))throw Error('Option mehrfach angegeben: '+flag);
    seen.add(flag);
    if(switches.has(flag)){out[switches.get(flag)]=true;continue;}
    const value=argv[++i];
    if(typeof value!=='string'||!value.trim()||value.trimStart().startsWith('-'))throw Error(flag+' benötigt einen gültigen Argumentwert');
    out[values.get(flag)]=value;
    if(flag==='--endpoint')out.endpointProvided=true;
  }
  const management=[out.enroll,out.createEnroll,out.revokeDevice,out.promoteProduction].filter(Boolean).length;
  if(out.dryRun&&management)throw Error('--dry-run kann nicht mit Geräteverwaltung kombiniert werden');
  if(management>1)throw Error('Nur ein Geräteverwaltungsbefehl gleichzeitig erlaubt');
  if(management&&(out.watch||out.file))throw Error('Geräteverwaltung kann nicht mit Sync-Optionen kombiniert werden');
  if(out.character&&!out.enroll)throw Error('--character ist nur bei --enroll erlaubt');
  if(out.help&&seen.size>1)throw Error('--help muss allein stehen');
  if(out.help)return out;
  if(out.promoteProduction)throw Error('Automatische Geräteübernahme deaktiviert. Bitte einen regulären Einrichtungscode für die Produktionsumgebung verwenden.');
  if(out.enroll&&!/^dalton-[A-Za-z0-9_-]{32}$/.test(out.enroll))throw Error('Ungültiger Einrichtungscode');
  if(out.createEnroll&&!TRUSTED_SLUGS.has(out.createEnroll))throw Error('Unbekannter Dalton-Charakter');
  if(out.character&&!TRUSTED_SLUGS.has(out.character)&&!TRUSTED_NAMES.has(normalizedName(out.character)))throw Error('Unbekannter Dalton-Charakter');
  const explicitEndpoint=out.endpointProvided?out.endpoint:process.env.DALTON_SYNC_ENDPOINT;
  const explicitShare=out.previewShareUrl??process.env.DALTON_SYNC_PREVIEW_SHARE_URL;
  const origin=explicitEndpoint!==undefined?secureBridgeEndpoint(explicitEndpoint).origin:undefined;
  validateShareUrl(explicitShare,origin);
  return out;
}
// CLI > environment > saved configuration > default. A stored device
// credential belongs to its original origin, never an arbitrary override.
export function resolveBridgeTarget(options,config={},env=process.env){
  const endpoint=secureBridgeEndpoint(options.endpointProvided?options.endpoint:(env.DALTON_SYNC_ENDPOINT??config.endpoint??DEFAULT_ENDPOINT)).href;
  const explicitShare=options.previewShareUrl??env.DALTON_SYNC_PREVIEW_SHARE_URL;
  let previewShareUrl=explicitShare??null;
  if(explicitShare==null&&config.previewShareUrl){
    const stored=secureBridgeEndpoint(config.endpoint??DEFAULT_ENDPOINT);
    if(stored.origin===new URL(endpoint).origin)previewShareUrl=config.previewShareUrl;
  }
  validateShareUrl(previewShareUrl,new URL(endpoint).origin);
  return {endpoint,previewShareUrl};
}
function assertStoredDeviceOrigin(config,endpoint){
  if(config.deviceToken&&secureBridgeEndpoint(config.endpoint??DEFAULT_ENDPOINT).origin!==secureBridgeEndpoint(endpoint).origin)
    throw Error('Gespeicherter Gerätezugang gehört zu einem anderen HTTPS-Ziel. Bitte Zielumgebung separat koppeln.');
}
function bridgeAuthorization(config,endpoint,env=process.env){
  if(env.DALTON_SYNC_TOKEN)return 'Bearer '+env.DALTON_SYNC_TOKEN;
  if(env.DALTON_DEVICE_TOKEN)return 'Device '+env.DALTON_DEVICE_TOKEN;
  assertStoredDeviceOrigin(config,endpoint);
  return config.deviceToken?'Device '+config.deviceToken:null;
}
function help(){
  console.log('Dalton Dashboard Sync Companion '+VERSION);
  console.log('  node scripts/dalton-sync-client.mjs [--file <DaltonDashboard.lua>] [--watch] [--dry-run] [--endpoint <URL>]');
  console.log('  node scripts/dalton-sync-client.mjs --enroll <Einrichtungscode>');
  console.log('  node scripts/dalton-sync-client.mjs --create-enroll <character-slug>   # nur Administrator');
  console.log('  node scripts/dalton-sync-client.mjs --revoke-device                    # Gerätezugang widerrufen');
  console.log('  Produktionskopplung: regulären Einrichtungscode der Zielumgebung verwenden.');
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
export function relayRecordsFromGlobalDb(globalDb,{source='relay'}={}){
  const records=[];
  for(const {inboxKey,charDb} of relayCharDbsFromGlobalDb(globalDb)){
    if(!charDb||typeof charDb!=='object'||!trustedCharacter(charDb))continue;
    const name=normalizedName(charDb.character?.name);
    if(!name||name==='cole dalton')continue;
    try{
      records.push(payloadRecord(charDb,{
        key:'relay:'+name,
        transport:'dalton-peer-relay',
        source:source+'#'+inboxKey,
        diagnostics:null
      }));
    }catch(error){
      console.error('Relay-Datensatz übersprungen: '+String(error.message||error).slice(0,180));
    }
  }
  return records.sort((a,b)=>a.key.localeCompare(b.key,'de'));
}
async function readRelayRecords(file){
  if(!file)return [];
  const raw=await fs.readFile(file,'utf8');
  const globalDb=parseLuaSavedVariable(raw,'DaltonDashboardDB');
  return relayRecordsFromGlobalDb(globalDb,{source:file});
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
function validateShareUrl(shareUrl,expectedOrigin){
  if(shareUrl==null)return null;
  const url=new URL(shareUrl);
  if(url.protocol!=='https:'||url.username||url.password||(expectedOrigin!==undefined&&url.origin!==expectedOrigin))throw new Error('Preview-Share-Link muss denselben HTTPS-Ursprung wie der Sync-Endpunkt verwenden');
  return url;
}
async function previewCookie(shareUrl,expectedOrigin){
  const url=validateShareUrl(shareUrl,expectedOrigin);
  if(!url)return null;
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(response.status<200||response.status>=400)throw new Error('Preview-Freigabe HTTP '+response.status);
  const raw=typeof response.headers.getSetCookie==='function'
    ?response.headers.getSetCookie()
    :[response.headers.get('set-cookie')].filter(Boolean);
  const cookie=previewCookieFromSetCookie(raw);
  if(!cookie)throw new Error('Preview-Freigabe hat keinen Vercel-Zugangscookie geliefert');
  return cookie;
}
export async function postPayload(endpoint,auth,payload,{cookie=null}={}){
  const url=secureBridgeEndpoint(endpoint);
  const headers={
    Authorization:auth,
    'Content-Type':'application/json',
    'User-Agent':'DaltonDashboardSync/'+VERSION
  };
  if(cookie)headers.Cookie=cookie;
  const response=await fetch(url,{
    method:'POST',
    redirect:'error',
    headers,
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(20000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('Sync HTTP '+response.status+': '+String(body.error||response.statusText).slice(0,180));
  return body;
}
export async function main(argv=process.argv.slice(2),{readConfig=loadConfig}={}){
  const options=args(argv);
  if(options.help){help();return}
  if(options.enroll||options.revokeDevice){
    return withConfigMutation(async()=>{
      const config=await readConfig();
      const target=resolveBridgeTarget(options,config);
      if(options.enroll){
        const enrolled=await enrollDeviceLocked(target.endpoint,options.enroll,options.character,target.previewShareUrl);
        console.log('Bridge gekoppelt: '+String(enrolled.characterName||enrolled.characterSlug));
        console.log('Konfiguration: '+enrolled.configFile);
      }else{
        const result=await revokeDeviceLocked(config,target);
        if(result.alreadyAbsent)console.log('Kein aktiver Gerätezugang vorhanden.');
        else console.log('Gerätezugang widerrufen: '+String(result.characterName||'Dalton-Gerät'));
      }
    });
  }
  const config=await readConfig();
  const target=resolveBridgeTarget(options,config);
  options.endpoint=target.endpoint;
  if(options.createEnroll){
    const auth=bridgeAuthorization(config,target.endpoint);
    const created=await createEnrollment(target.endpoint,options.createEnroll,auth,{previewShareUrl:target.previewShareUrl});
    console.log('Einrichtungscode für '+String(created.characterName||created.characterSlug)+':');
    console.log(created.code);
    console.log('Gültig für '+Math.round(Number(created.expiresInSeconds||0)/3600)+' Stunden und genau einmal.');
    return;
  }
  const auth=options.dryRun?null:bridgeAuthorization(config,target.endpoint);
  if(!options.dryRun&&!auth)throw Error('Bridge ist noch nicht eingerichtet');
  const sources=await resolveSourcesWithRetry(options.file,options.watch,{characterName:config.deviceToken?config.characterName:null});
  if(sources.characterFile)console.log('Eigener Charakter: '+sources.characterFile);
  if(sources.relayFile)console.log('Relay-Postfach: '+sources.relayFile);

  const lastHashes=new Map();
  let running=false;
  let rerun=false;
  const previewAuthCookie=options.dryRun?null:await previewCookie(target.previewShareUrl,secureBridgeEndpoint(target.endpoint).origin);

  const sync=async()=>{
    if(running){rerun=true;return}
    running=true;
    try{
      const records=await readRecords(sources);
      if(!records.length)return;

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
            ' · Händler '+String(result.summary?.merchantNpcCount??result.summary?.merchantObservationCount??0)+' NPCs'+
            ' · Lehrer '+String(result.summary?.trainerNpcCount??result.summary?.trainerObservationCount??0)+' NPCs');
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
