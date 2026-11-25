import {VERSION_METADATA_KEY,addonVersionField,addonVersionMetadata} from './version-metadata.mjs';
import {redis,configured} from './character-store.mjs';
import {publicAddonSyncSummary} from './addon-sync.mjs';

function environmentScope(){
  return process.env.VERCEL_ENV==='production'?'production':'preview';
}
function keyFor(characterSlug){
  return 'dalton-dashboard:addon-sync:v1:'+environmentScope()+':'+characterSlug;
}

export async function saveAddonSyncState(characterSlug,payload){
  if(!configured())throw new Error('Redis-Datenbank nicht konfiguriert');
  if(!characterSlug||!payload)throw new Error('Addon-Sync-Status unvollständig');
  const state={characterSlug,receivedAt:new Date().toISOString(),payload};
  await redis(['EVAL',"redis.call('SET',KEYS[1],ARGV[1]); redis.call('HSET',KEYS[2],ARGV[2],ARGV[3]); return 'OK'",2,keyFor(characterSlug),VERSION_METADATA_KEY,JSON.stringify(state),addonVersionField(characterSlug),JSON.stringify(addonVersionMetadata(state))]);
  return state;
}

export async function loadAddonSyncState(characterSlug){
  if(!configured())return null;
  const value=await redis(['GET',keyFor(characterSlug)]);
  if(!value)return null;
  const parsed=JSON.parse(value);
  return parsed&&typeof parsed==='object'?parsed:null;
}

export async function loadAddonSyncStates(characterSlugs=[]){
  const result={};
  for(const slug of characterSlugs){
    try{
      const state=await loadAddonSyncState(slug);
      if(state)result[slug]=state;
    }catch(error){
      console.warn('Addon-Sync-Rohstatus konnte nicht geladen werden:',String(error.message).slice(0,140));
    }
  }
  return result;
}

export async function loadPublicAddonSyncStates(characterSlugs=[]){
  const result={};
  for(const slug of characterSlugs){
    try{
      const state=await loadAddonSyncState(slug);
      if(state)result[slug]=publicAddonSyncSummary(state);
    }catch(error){
      console.warn('Addon-Sync-Status konnte nicht geladen werden:',String(error.message).slice(0,140));
    }
  }
  return result;
}
