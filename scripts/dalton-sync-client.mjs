#!/usr/bin/env node
import {createHash,randomBytes,randomUUID} from 'node:crypto';
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
const pendingConfigFile=()=>join(dirname(configFile()),'pending-enrollment.json');
async function readLocalState(file,missing={}){
  try{
    const value=JSON.parse(await fs.readFile(file,'utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Ungültige Bridge-Konfiguration');
    return value;
  }catch(error){if(error.code==='ENOENT')return missing;throw error;}
}
const loadConfig=()=>readLocalState(configFile());
// Exclusive interprocess lock outside the installation directory. Never
// steal a lock by age: a paused process could still commit. Fail closed.
async function withConfigMutation(operation){
  const dir=dirname(configFile()),lock=dir+'.mutation.lock';
  const owner=process.env.DALTON_BRIDGE_INSTALL_LOCK;
  if(owner){
    await assertInstallLock(lock,owner);
    return operation();
  }
  await fs.mkdir(dirname(dir),{recursive:true});
  try{await fs.mkdir(lock,{mode:0o700})}
  catch(error){if(error.code==='EEXIST')throw Error('Andere Geräteverwaltung aktiv oder unterbrochen; bitte nach Prüfung erneut versuchen');throw error;}
  try{return await operation()}
  finally{await fs.rmdir(lock)}
}
async function assertInstallLock(lock,owner){
  const marker=await fs.readFile(join(lock,'owner'),'utf8').catch(()=>null);
  if(!/^[a-f0-9]{32}$/i.test(owner)||marker?.trim()!==owner)
    throw Error('Sperre für Bridge-Installation oder Deinstallation nicht bestätigt');
}
async function saveLocalState(file,value){
  const dir=dirname(file);
  const owner=process.env.DALTON_BRIDGE_INSTALL_LOCK;
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const tmp=join(dir,'.config-'+randomUUID()+'.tmp');
  let handle;
  try{
    handle=await fs.open(tmp,'wx',0o600);
    await handle.writeFile(JSON.stringify(value,null,2)+'\n');
    await handle.sync();
    await handle.close();handle=null;
    if(owner)await assertInstallLock(dir+'.mutation.lock',owner);
    await fs.rename(tmp,file);
    await syncStateDirectory(dir);
    return file;
  }finally{if(handle)await handle.close();await fs.rm(tmp,{force:true})}
}
async function syncStateDirectory(dir){
  if(platform()==='win32')return;
  const directory=await fs.open(dir,'r');
  try{await directory.sync();}finally{await directory.close();}
}
async function removeJournal(){
  const file=pendingConfigFile();
  const owner=process.env.DALTON_BRIDGE_INSTALL_LOCK;
  if(owner)await assertInstallLock(dirname(file)+'.mutation.lock',owner);
  await fs.rm(file,{force:true});
  await syncStateDirectory(dirname(file));
}
const saveConfig=value=>saveLocalState(configFile(),value);
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
async function confirmedJson(response,operation){
  const type=response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(!response.ok)throw Error(operation+' fehlgeschlagen (HTTP '+response.status+')');
  if(response.status!==200||type!=='application/json')return null;
  const body=await response.json().catch(()=>null);
  return body&&typeof body==='object'&&!Array.isArray(body)&&!Object.hasOwn(body,'error')?body:null;
}
const validDeviceToken=value=>typeof value==='string'&&/^ddv1_[A-Za-z0-9_-]{43}$/.test(value);
const validScope=value=>value==='production'||value==='preview';
const codeDigest=code=>createHash('sha256').update(code).digest('hex');

function deviceReference(config){
  if(!Object.hasOwn(config,'deviceToken'))return null;
  if(typeof config.deviceToken!=='string'||!config.deviceToken||config.deviceScope!=null&&!validScope(config.deviceScope))
    throw Error('Gespeicherter Gerätezugang ist beschädigt');
  const endpoint=secureBridgeEndpoint(config.endpoint??DEFAULT_ENDPOINT).href;
  return {deviceToken:config.deviceToken,endpoint,deviceScope:config.deviceScope??null,
    previewShareUrl:config.previewShareUrl??null,characterName:config.characterName??null};
}
function sameDevice(left,right){
  if(!left||!right)return left===right;
  return left.deviceToken===right.deviceToken&&left.endpoint===right.endpoint&&
    (!left.deviceScope||!right.deviceScope||left.deviceScope===right.deviceScope);
}
function candidate(journal){
  return {endpoint:journal.endpoint,previewShareUrl:journal.previewShareUrl,deviceToken:journal.proposedDeviceToken,
    deviceScope:journal.pairing?.deviceScope??journal.deviceScope??null};
}
function enrollmentIdentityMatches(current,journal){
  // A previous-version journal may accompany an already activated candidate.
  return current&&current.deviceToken===journal.proposedDeviceToken&&current.endpoint===journal.endpoint&&
    (!journal.pairing||current.deviceScope===journal.pairing.deviceScope);
}
function journalReference(value){
  if(value===null)return null;
  if(!value||typeof value.deviceToken!=='string'||typeof value.endpoint!=='string')
    throw Error('Offener Gerätezugang ist beschädigt');
  return deviceReference(value);
}
async function loadDeviceJournal(current){
  const record=await readLocalState(pendingConfigFile(),null);
  if(!record)return null;
  if(!Object.hasOwn(record,'kind')){
    // Before this version, the active configuration was overwritten directly.
    // Keep the original candidate and snapshot whichever predecessor survives.
    record.endpoint=secureBridgeEndpoint(record.endpoint).href;
    record.kind='enroll';
    record.phase='claim';
    record.previous=enrollmentIdentityMatches(current,record)?null:current;
  }
  if(record.kind==='revoke'){
    const previous=journalReference(record.previous);
    const enrollment=record.enrollment===null?null:validatedEnrollment(record.enrollment);
    if(!previous&&!enrollment)throw Error('Offener Widerruf ist beschädigt');
    return {...record,previous,enrollment};
  }
  return validatedEnrollment(record);
}
function validatedEnrollment(record){
  if(record?.kind!=='enroll'||!['claim','retire','activate','cancel'].includes(record.phase)||
    !/^dalton-[A-Za-z0-9_-]{32}$/.test(record.code)||!validDeviceToken(record.proposedDeviceToken)||
    typeof record.endpoint!=='string'||record.character!==null&&!TRUSTED_SLUGS.has(record.character))
    throw Error('Ausstehende Einrichtung ist beschädigt');
  const endpoint=secureBridgeEndpoint(record.endpoint).href;
  if(record.deviceScope!=null&&!validScope(record.deviceScope))throw Error('Gespeicherte Kopplungsumgebung ist beschädigt');
  const previous=journalReference(record.previous);
  const pairing=record.pairing;
  if(['retire','activate'].includes(record.phase)&&
    (!validScope(pairing?.deviceScope)||!TRUSTED_SLUGS.has(pairing.characterSlug)||
      normalizedName(pairing.characterName)!==pairing.characterSlug.replace('-',' ')||
      typeof pairing.deviceId!=='string'||!pairing.deviceId))
    throw Error('Kopplungsbeleg ist beschädigt');
  return {...record,endpoint,previous};
}
const saveJournal=value=>saveLocalState(pendingConfigFile(),value);

function scopedShare(ref,override){
  const origin=secureBridgeEndpoint(ref.endpoint).origin;
  const share=override?.previewShareUrl!=null&&secureBridgeEndpoint(override.endpoint).origin===origin
    ?override.previewShareUrl:ref.previewShareUrl;
  validateShareUrl(share,origin);
  return share;
}
function sameOrigin(left,right){return secureBridgeEndpoint(left).origin===secureBridgeEndpoint(right).origin}
function requireKnownOrigin(override,refs){
  if(override?.endpoint&&!refs.some(ref=>ref&&sameOrigin(override.endpoint,ref.endpoint)))
    throw Error('Gespeicherte Kopplung gehört zu einem anderen HTTPS-Ziel');
}
function assertConfigDevice(expected,actual){
  if(!sameDevice(expected,actual))throw Error('Lokale Kopplung wurde inzwischen geändert');
}
async function deviceRequest(ref,body,operation,{override=null,auth=null}={}){
  const base=enrollmentEndpoint(ref.endpoint);
  const cookie=await previewCookie(scopedShare(ref,override),base.origin);
  const response=await fetch(base,{
    method:'POST',redirect:'error',
    headers:{'Content-Type':'application/json','User-Agent':'DaltonDashboardBridge/'+VERSION,
      ...(cookie?{Cookie:cookie}:{}),...(auth?{Authorization:'Device '+auth}:{})},
    body:JSON.stringify({...body,...(ref.deviceScope?{expectedScope:ref.deviceScope}:{})}),
    signal:AbortSignal.timeout(15000)
  });
  const result=await confirmedJson(response,operation);
  if(ref.deviceScope&&result&&result.scope!==ref.deviceScope)throw Error('Geräteumgebung wurde nicht eindeutig bestätigt');
  return result;
}
async function readEnrollmentScope(journal,override,existing=false){
  const request=existing?{action:'inspect',code:journal.code,proposedDeviceToken:journal.proposedDeviceToken}:{action:'scope'};
  const body=await deviceRequest(candidate(journal),request,'Umgebungsprüfung',{override});
  if(!validScope(body?.scope))throw Error('Kopplungsumgebung wurde nicht eindeutig bestätigt');
  return body.scope;
}
async function bindDeviceScope(ref,override){
  if(!ref||ref.deviceScope)return ref;
  const body=await deviceRequest(ref,{action:'locate'},'Umgebungsprüfung',{override,auth:ref.deviceToken});
  if(!validScope(body?.scope))throw Error('Umgebung des alten Gerätezugangs wurde nicht eindeutig bestätigt');
  return {...ref,deviceScope:body.scope};
}
async function claimDevice(journal,override){
  const body=await deviceRequest(candidate(journal),{
    code:journal.code,character:journal.character,proposedDeviceToken:journal.proposedDeviceToken,
    ...(journal.pairing?{action:'confirm',expectedDeviceId:journal.pairing.deviceId}:{})
  },'Einrichtung',{override});
  if(!body||body.deviceToken!==journal.proposedDeviceToken||!validScope(body.scope)||
    typeof body.deviceId!=='string'||!body.deviceId||!TRUSTED_SLUGS.has(body.characterSlug)||
    normalizedName(body.characterName)!==body.characterSlug.replace('-',' ')||
    journal.character&&body.characterSlug!==journal.character||
    journal.pairing&&body.deviceId!==journal.pairing.deviceId)
    throw Error('Ungültige Kopplungsantwort; lokale Kopplung bleibt erhalten');
  return {deviceId:body.deviceId,deviceScope:body.scope,characterSlug:body.characterSlug,characterName:body.characterName};
}
async function retireDevice(ref,override){
  const body=await deviceRequest(ref,{action:'revoke'},'Widerruf',{override,auth:ref.deviceToken});
  if(!(body?.revoked===true&&body.alreadyRevoked===false)&&!(body?.revoked===false&&body.alreadyRevoked===true))
    throw Error('Widerruf nicht eindeutig bestätigt; lokale Kopplung bleibt erhalten');
}
async function cancelCandidate(journal,override){
  const body=await deviceRequest(candidate(journal),{
    action:'cancel',code:journal.code,proposedDeviceToken:journal.proposedDeviceToken
  },'Abbruch der Einrichtung',{override});
  if(body?.cancelled!==true)throw Error('Abbruch der Einrichtung wurde nicht eindeutig bestätigt');
}

export async function enrollDevice(endpoint,code,character=null,previewShareUrl=null){
  const base=secureBridgeEndpoint(endpoint);
  validateShareUrl(previewShareUrl,base.origin);
  return withConfigMutation(()=>enrollDeviceLocked(base.href,code,character,previewShareUrl));
}
async function enrollDeviceLocked(endpoint,code,character=null,previewShareUrl=null){
  if(!/^dalton-[A-Za-z0-9_-]{32}$/.test(code))throw Error('Ungültiger Einrichtungscode');
  const config=await loadConfig();
  const current=deviceReference(config);
  let journal=await loadDeviceJournal(current);
  const requested=character?normalizedName(character).replace(' ','-'):null;
  if(journal){
    if(journal.kind!=='enroll'||journal.code!==code||journal.endpoint!==endpoint||journal.character!==requested)
      throw Error('Eine frühere Geräteverwaltung ist offen. Bitte zuerst fortsetzen oder widerrufen.');
  }else if(current&&config.enrollmentDigest===codeDigest(code)){
    if(current.endpoint!==endpoint||requested&&requested!==config.characterSlug)
      throw Error('Einrichtungscode gehört zu einer anderen Kopplung');
    const pairing=await claimDevice({code,endpoint,character:requested,previewShareUrl:previewShareUrl??current.previewShareUrl,
      proposedDeviceToken:current.deviceToken,pairing:config});
    return {...pairing,deviceToken:current.deviceToken,configFile:configFile()};
  }else{
    journal={kind:'enroll',phase:'claim',code,endpoint,character:requested,previewShareUrl:previewShareUrl??null,
      proposedDeviceToken:'ddv1_'+randomBytes(32).toString('base64url'),previous:current};
    journal.deviceScope=await readEnrollmentScope(journal);
    assertConfigDevice(current,deviceReference(await loadConfig()));
    await saveJournal(journal);
  }
  return completeEnrollment(config,current,journal,{endpoint,previewShareUrl});
}
async function completeEnrollment(config,current,journal,override){
  if(journal.kind!=='enroll'||journal.phase==='cancel')
    throw Error('Ein Widerruf oder Abbruch ist offen. Bitte den begonnenen Vorgang abschließen.');
  requireKnownOrigin(override,[candidate(journal),journal.previous]);
  if(!enrollmentIdentityMatches(current,journal))assertConfigDevice(journal.previous,current);
  const pairing=await claimDevice(journal,override);
  assertConfigDevice(current,deviceReference(await loadConfig()));
  if(journal.phase==='claim'){
    // A cancellation can preserve the previous credential only before this point.
    const previous=await bindDeviceScope(journal.previous,override);
    assertConfigDevice(current,deviceReference(await loadConfig()));
    journal={...journal,phase:'retire',pairing,previous,previewShareUrl:scopedShare(candidate(journal),override)};
    await saveJournal(journal);
  }
  if(journal.phase==='retire'){
    if(journal.previous)await retireDevice(journal.previous,override);
    assertConfigDevice(current,deviceReference(await loadConfig()));
    journal={...journal,phase:'activate'};
    await saveJournal(journal);
  }
  const next={...config,...pairing,deviceToken:journal.proposedDeviceToken,endpoint:journal.endpoint,
    previewShareUrl:scopedShare(candidate(journal),override)??null,enrollmentDigest:codeDigest(journal.code)};
  delete next.revokedAt;
  const file=await saveConfig(next);
  if(!process.env.DALTON_BRIDGE_INSTALL_LOCK||process.env.DALTON_BRIDGE_KEEP_ENROLLMENT!=='1')
    await removeJournal();
  return {...pairing,deviceToken:next.deviceToken,configFile:file};
}
async function cancelPendingEnrollment(config,override){
  const current=deviceReference(config);
  let journal=await loadDeviceJournal(current);
  if(!journal)return false;
  if(journal.kind!=='enroll'||!['claim','cancel'].includes(journal.phase))
    throw Error('Ablösung oder Widerruf wurde begonnen. Bitte fortsetzen oder alle Zugänge widerrufen.');
  assertConfigDevice(journal.previous,current);
  requireKnownOrigin(override,[candidate(journal)]);
  if(!candidate(journal).deviceScope)journal={...journal,deviceScope:await readEnrollmentScope(journal,override,true)};
  await saveJournal({...journal,phase:'cancel'});
  await cancelCandidate(journal,override);
  assertConfigDevice(current,deviceReference(await loadConfig()));
  await removeJournal();
  return true;
}
export async function revokeDevice(config,{endpoint=config.endpoint||process.env.DALTON_SYNC_ENDPOINT||DEFAULT_ENDPOINT,previewShareUrl=config.previewShareUrl||process.env.DALTON_SYNC_PREVIEW_SHARE_URL||null}={}){
  assertStoredDeviceOrigin(config,endpoint);
  validateShareUrl(previewShareUrl,secureBridgeEndpoint(endpoint).origin);
  return withConfigMutation(async()=>{
    assertConfigDevice(deviceReference(config),deviceReference(await loadConfig()));
    return revokeDeviceLocked(await loadConfig(),{endpoint,previewShareUrl});
  });
}
async function revokeDeviceLocked(config,override){
  const current=deviceReference(config);
  const open=await loadDeviceJournal(current);
  if(!open&&!current)return {revoked:false,alreadyAbsent:true};
  let enrollment=open?.kind==='revoke'?open.enrollment:open;
  let installed=open?.kind==='revoke'?open.previous:current;
  const refs=[installed,enrollment?.previous,enrollment&&candidate(enrollment)].filter(Boolean);
  requireKnownOrigin(override,refs);
  if(current&&!refs.some(ref=>sameDevice(ref,current)))throw Error('Lokale Kopplung wurde inzwischen geändert');
  if(enrollment&&!candidate(enrollment).deviceScope)
    enrollment={...enrollment,deviceScope:await readEnrollmentScope(enrollment,override,true)};
  installed=await bindDeviceScope(installed,override);
  if(enrollment?.previous)enrollment={...enrollment,previous:sameDevice(installed,enrollment.previous)
    ?installed:await bindDeviceScope(enrollment.previous,override)};
  assertConfigDevice(current,deviceReference(await loadConfig()));
  // Persist the intent before the first revoke, even for a single active device.
  // The candidate and both origins stay available after any lost ACK.
  await saveJournal({kind:'revoke',previous:installed,enrollment});
  if(enrollment)await cancelCandidate(enrollment,override);
  const retired=new Set();
  for(const ref of [installed,enrollment?.previous]){
    if(!ref)continue;
    const identity=JSON.stringify([ref.endpoint,ref.deviceScope,ref.deviceToken]);
    if(retired.has(identity))continue;
    await retireDevice(ref,override);
    retired.add(identity);
  }
  assertConfigDevice(current,deviceReference(await loadConfig()));
  if(current){
    const clean={...config,revokedAt:new Date().toISOString()};
    delete clean.deviceToken;
    delete clean.enrollmentDigest;
    delete clean.deviceId;
    delete clean.deviceScope;
    await saveConfig(clean);
  }
  await removeJournal();
  return {revoked:true,characterName:current?.characterName??installed?.characterName??null};
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
  const body=await confirmedJson(response,'Einrichtungscode');
  if(!body||!/^dalton-[A-Za-z0-9_-]{32}$/.test(body.code)||body.characterSlug!==characterSlug||
    normalizedName(body.characterName)!==characterSlug.replace('-',' ')||
    !Number.isSafeInteger(body.expiresInSeconds)||body.expiresInSeconds<=0||body.expiresInSeconds>86400)
    throw Error('Einrichtungscode wurde nicht eindeutig bestätigt');
  return body;
}
function trustedCharacter(charDb){return TRUSTED_NAMES.has(normalizedName(charDb?.character?.name))}
function variablePattern(name){return new RegExp('(?:^|[\\r\\n])\\s*'+name+'\\s*=','m')}

// Parse and validate the entire command before reading config, discovering
// files, fetching preview cookies, or entering any credential-bearing path.
export function args(argv){
  const out={watch:false,dryRun:false,file:null,enroll:null,createEnroll:null,revokeDevice:false,cancelEnrollment:false,resumeEnrollment:false,finishInstall:false,promoteProduction:false,character:null,previewShareUrl:null,endpointProvided:false,endpoint:null};
  const switches=new Map([['--watch','watch'],['--dry-run','dryRun'],['--revoke-device','revokeDevice'],['--cancel-enrollment','cancelEnrollment'],['--resume-enrollment','resumeEnrollment'],['--finish-install','finishInstall'],['--promote-production','promoteProduction'],['--help','help']]);
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
  const management=[out.enroll,out.createEnroll,out.revokeDevice,out.cancelEnrollment,out.resumeEnrollment,out.finishInstall,out.promoteProduction].filter(Boolean).length;
  if(out.dryRun&&management)throw Error('--dry-run kann nicht mit Geräteverwaltung kombiniert werden');
  if(management>1)throw Error('Nur ein Geräteverwaltungsbefehl gleichzeitig erlaubt');
  if(management&&(out.watch||out.file))throw Error('Geräteverwaltung kann nicht mit Sync-Optionen kombiniert werden');
  if(out.character&&!out.enroll)throw Error('--character ist nur bei --enroll erlaubt');
  if(out.help&&seen.size>1)throw Error('--help muss allein stehen');
  if(out.help)return out;
  if(out.finishInstall&&(seen.size!==1||!process.env.DALTON_BRIDGE_INSTALL_LOCK))throw Error('Installationsabschluss erfordert die Installationssperre');
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
  const explicitShare=options.previewShareUrl??env.DALTON_SYNC_PREVIEW_SHARE_URL;
  const explicit=options.endpointProvided?options.endpoint:env.DALTON_SYNC_ENDPOINT;
  const endpoint=secureBridgeEndpoint(explicit??(options.dryRun?DEFAULT_ENDPOINT:config.endpoint??DEFAULT_ENDPOINT)).href;
  let previewShareUrl=explicitShare??null;
  if(!options.dryRun&&explicitShare==null&&config.previewShareUrl){
    let stored;
    try{stored=secureBridgeEndpoint(config.endpoint??DEFAULT_ENDPOINT)}catch(error){if(!options.enroll||!explicit)throw error;}
    if(stored?.origin===new URL(endpoint).origin)previewShareUrl=config.previewShareUrl;
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
  console.log('  node scripts/dalton-sync-client.mjs --cancel-enrollment                # offene Einrichtung abbrechen');
  console.log('  node scripts/dalton-sync-client.mjs --resume-enrollment                # offene Einrichtung fortsetzen');
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
  const body=await confirmedJson(response,'Sync');
  if(!body||typeof body.duplicate!=='boolean'||typeof body.character?.slug!=='string'||
    !body.summary||typeof body.summary!=='object'||Array.isArray(body.summary)||
    (body.acceptedSyncId??body.summary.syncId)!==payload.syncId||
    typeof body.character.name!=='string'||normalizedName(body.character.name)!==normalizedName(payload.sections?.character?.name))
    throw Error('Synchronisation wurde nicht eindeutig bestätigt; Daten bleiben für einen erneuten Versuch erhalten');
  return body;
}
export async function main(argv=process.argv.slice(2),{readConfig=loadConfig}={}){
  const options=args(argv);
  if(options.help){help();return}
  if(options.enroll||options.revokeDevice||options.cancelEnrollment||options.resumeEnrollment||options.finishInstall){
    return withConfigMutation(async()=>{
      const config=await readConfig();
      if(options.enroll){
        const target=resolveBridgeTarget(options,config);
        const enrolled=await enrollDeviceLocked(target.endpoint,options.enroll,options.character,target.previewShareUrl);
        reportEnrollment(enrolled);
        return;
      }
      const current=deviceReference(config);
      const journal=await loadDeviceJournal(current);
      if(options.finishInstall){
        if(!current||!config.deviceId||!config.enrollmentDigest||
          (journal&&(journal.kind!=='enroll'||journal.phase!=='activate'||!enrollmentIdentityMatches(current,journal))))
          throw Error('Kopplung für die Installation ist nicht bestätigt');
        if(journal)await removeJournal();
        return;
      }
      const enrollment=journal?.kind==='revoke'?journal.enrollment:journal;
      const explicitEndpoint=options.endpoint??process.env.DALTON_SYNC_ENDPOINT;
      const previewShareUrl=options.previewShareUrl??process.env.DALTON_SYNC_PREVIEW_SHARE_URL;
      const override=explicitEndpoint||previewShareUrl?{
        endpoint:explicitEndpoint??((options.resumeEnrollment||options.cancelEnrollment)?enrollment?.endpoint:current?.endpoint??enrollment?.endpoint)
          ??DEFAULT_ENDPOINT,
        previewShareUrl
      }:null;
      if(options.cancelEnrollment){
        const cancelled=await cancelPendingEnrollment(config,override);
        console.log(cancelled?'Offene Einrichtung aufgelöst.':'Keine offene Einrichtung vorhanden.');
        return;
      }
      if(options.resumeEnrollment){
        if(!journal)throw Error('Keine offene Einrichtung vorhanden');
        reportEnrollment(await completeEnrollment(config,current,journal,override));
        return;
      }
      const result=await revokeDeviceLocked(config,override);
      if(result.alreadyAbsent)console.log('Kein aktiver Gerätezugang vorhanden.');
      else console.log('Gerätezugang widerrufen: '+String(result.characterName||'Dalton-Gerät'));
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
function reportEnrollment(enrolled){
  console.log('Bridge gekoppelt: '+enrolled.characterName);
  console.log('Konfiguration: '+enrolled.configFile);
}
const invokedDirectly=import.meta.main===true||(Boolean(process.argv[1])&&import.meta.url===pathToFileURL(process.argv[1]).href);
if(invokedDirectly){
  main().catch(error=>{
    console.error('Dalton Sync: '+error.message);
    process.exitCode=1;
  });
}
