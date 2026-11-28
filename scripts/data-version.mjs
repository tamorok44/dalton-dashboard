import {selectVersionEvidence} from './storage-reconciliation.mjs';
import {VERSION_METADATA_KEY,CORE_COMPACT_KEY,PREVIEW_COMPACT_KEY,versionScope,addonVersionField,characterVersionMetadata,petVersionMetadata,addonVersionMetadata,parseVersionMetadata,canonicalProfileGeneration} from './version-metadata.mjs';
import {loadCharacters,loadCharactersForWrite,configured,redis} from './character-store.mjs';
import {loadPublicPetRuleState} from './pet-rule-store.mjs';
import {loadLiveKnowledgeVersion} from './live-knowledge-store.mjs';
import {loadPublicAddonSyncStates,loadAddonSyncState} from './addon-sync-store.mjs';

function addonSyncSignature(addonSync={}){
  return Object.entries(addonSync&&typeof addonSync==='object'?addonSync:{})
    .filter(([,state])=>state&&typeof state==='object')
    .map(([slug,state])=>[slug,state.syncId||'',state.receivedAt||''].join(':'))
    .sort()
    .join(',');
}
export function buildDataVersion({data,petRules,liveKnowledgeVersion,addonSync}={}){
  const generatedAt=typeof data?.generatedAt==='string'?data.generatedAt:null;
  const petRulesCheckedAt=typeof petRules?.checkedAt==='string'?petRules.checkedAt:null;
  const rulebookVersion=typeof petRules?.rulebookVersion==='string'?petRules.rulebookVersion:null;
  const petRuleOverall=typeof petRules?.overall==='string'?petRules.overall:null;
  const addonSyncVersion=addonSyncSignature(addonSync);
  return {
    version:['data-v3',generatedAt||'',petRulesCheckedAt||'',rulebookVersion||'',petRuleOverall||'',liveKnowledgeVersion||'',addonSyncVersion].join('|'),
    generatedAt,
    petRulesCheckedAt,
    rulebookVersion,
    petRuleOverall,
    liveKnowledgeVersion:liveKnowledgeVersion||null,
    addonSyncVersion:addonSyncVersion||null
  };
}
async function legacyDataVersion(){
  const [{data},petRules,liveKnowledgeVersion]=await Promise.all([
    loadCharacters(),loadPublicPetRuleState().catch(()=>null),loadLiveKnowledgeVersion().catch(()=>null)
  ]);
  const addonSync=await loadPublicAddonSyncStates((data?.characters||[]).map(c=>c.slug).filter(Boolean));
  return buildDataVersion({data,petRules,liveKnowledgeVersion,addonSync});
}
export async function readCompactVersion({redisImpl=redis,readCharacters=loadCharacters,readPet=loadPublicPetRuleState,readAddon=loadAddonSyncState,readLive=loadLiveKnowledgeVersion}={}){
  const production=versionScope()==='production';
  const [raw,compactRows,liveKnowledgeVersion]=await Promise.all([
    redisImpl(['HGETALL',VERSION_METADATA_KEY]),
    redisImpl(['MGET',CORE_COMPACT_KEY,...(production?[]:[PREVIEW_COMPACT_KEY])]),
    readLive()
  ]);
  const parseCompact=value=>{
    if(value==null)return {};
    const parsed=JSON.parse(value);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Ungültige kompakte Kerndaten');
    return parsed;
  };
  const core=parseCompact(compactRows?.[0]),scoped=production?core:parseCompact(compactRows?.[1]);
  const fields=new Map();
  for(let i=0;i<(raw||[]).length;i+=2)fields.set(raw[i],raw[i+1]);
  // HSETNX migration avoids overwriting metadata written by a concurrent sync.
  async function field(name,read){
    if(fields.has(name))return parseVersionMetadata(fields.get(name));
    const value=await read();
    await redisImpl(['HSETNX',VERSION_METADATA_KEY,name,JSON.stringify(value)]);
    return parseVersionMetadata(await redisImpl(['HGET',VERSION_METADATA_KEY,name]));
  }
  async function reconciled(name,modern,timeField,read){
    if(modern==null)return field(name,read);
    const legacy=parseVersionMetadata(fields.get(name));
    const selected=selectVersionEvidence(modern,legacy,timeField);
    return selected.conflict?read():selected.value;
  }
  async function characterEvidence(){
    const verified=async()=>characterVersionMetadata((await readCharacters()).data);
    const valid=value=>canonicalProfileGeneration(value?.generatedAt)&&Array.isArray(value.slugs)&&
      value.slugs.length>0&&value.slugs.every(slug=>typeof slug==='string'&&/^[a-z0-9-]+$/i.test(slug))&&
      new Set(value.slugs).size===value.slugs.length;
    const modern=core.characters,legacy=parseVersionMetadata(fields.get('characters'));
    if(modern==null){
      if(!fields.has('characters'))return field('characters',verified);
      return valid(legacy)?legacy:verified();
    }
    if(!valid(modern))return verified();
    if(!valid(legacy))return modern;
    const next=canonicalProfileGeneration(modern.generatedAt),prior=canonicalProfileGeneration(legacy.generatedAt);
    const sameSlugs=modern.slugs.length===legacy.slugs.length&&legacy.slugs.every(slug=>modern.slugs.includes(slug));
    // Only the new compact value participates in the current atomic commit.
    // A newer legacy hint or different membership requires the real roster.
    return prior>next||!sameSlugs?verified():modern;
  }
  const [characters,petRules]=await Promise.all([
    characterEvidence(),
    field('pet',async()=>petVersionMetadata(await readPet()))
  ]);
  const entries=await Promise.all((characters?.slugs||[]).map(async slug=>[slug,await reconciled(addonVersionField(slug),scoped.addon?.[slug],'receivedAt',async()=>addonVersionMetadata(await readAddon(slug)))]));
  return buildDataVersion({data:characters,petRules,liveKnowledgeVersion,addonSync:Object.fromEntries(entries)});
}
export async function loadCurrentDataVersion(){
  if(!configured())return legacyDataVersion();
  return readCompactVersion({readCharacters:()=>loadCharactersForWrite({allowPreviewMissing:true})});
}
