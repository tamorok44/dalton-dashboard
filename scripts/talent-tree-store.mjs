import {randomUUID,createHash} from 'node:crypto';
import {configured,redis} from './character-store.mjs';
import {compressedMasterKey,decodeCompactMaster,readCompactMaster,writeCompactMaster} from './compact-master-cache.mjs';
import {fetchPublicClassFile,CLASS_BY_ID} from './class-training-store.mjs';
import {knowledgeIcons} from './knowledge-media.mjs';
import {mediaIconKey} from './media-resolver.mjs';
import {buildTalentCatalogProof,talentRevisionDigest,talentSourcePairDigest} from './talent-catalog-proof.mjs';
import {TALENT_CATALOG_MAX_AGE_MS,talentCatalogIsFresh} from './talent-rule-watch.mjs';

const LEGACY_KEY='dalton-dashboard:talent-tree-catalog:v2';
// Preview experiments must not overwrite the production master if Redis is shared.
const isProduction=process.env.VERCEL_ENV==='production';
const KEY='dalton-dashboard:talent-tree-catalog:v3:all-classes'+(isProduction?'':':preview');
export const TALENT_CLASS_IDS=Object.freeze(Object.keys(CLASS_BY_ID).map(Number).sort((a,b)=>a-b));
const ATTEMPT_SECONDS=TALENT_CATALOG_MAX_AGE_MS/1000;
const arr=v=>Array.isArray(v)?v:[];
const positive=v=>Number.isSafeInteger(v)&&v>0;
const word=v=>typeof v==='string'&&v.trim()?v.trim():null;
const cell=(r,c)=>r+':'+c;
export function normalizeTalentTrees(classes,localized,classIds){
  const result={};
  for(const id of classIds){
    const raw=arr(classes).find(c=>c.id===id),de=localized?.[String(id)];
    if(!raw||!de||arr(raw.trees).length!==3)continue;
    const trees=[];
    const allIds=new Set(),profileIds=new Set();
    let valid=true;
    for(const tree of raw.trees){
      const name=word(de.trees?.[tree.id]?.n);
      if(!positive(tree.id)||!name||!arr(tree.talents).length){valid=false;break}
      const talents=[],positions=new Set();
      for(const t of tree.talents){
        const translated=de.talents?.[t.id],title=word(translated?.n);
        if(!positive(t.id)||!positive(t.df)||!positive(t.sp)||!title||!Number.isInteger(t.row)||t.row<0||t.row>10||!Number.isInteger(t.col)||t.col<0||t.col>3||!positive(t.max)||t.max>10||!positive(t.lv)||allIds.has(t.id)||profileIds.has(t.df)||positions.has(cell(t.row,t.col))||arr(t.ranks).length!==t.max||!t.ranks.every(positive)||!Array.isArray(t.pre)){
          valid=false;break;
        }
        // Compare the extracted point gate with the independently documented
        // earlier-row rule. Reject inconsistent future source schemas.
        const requiredPoints=t.row===0?0:t.gate?.[0];
        if(requiredPoints!==t.row*5){valid=false;break}
        const pre=t.pre.map(p=>{
          if(!Array.isArray(p)||!positive(p[0])||!positive(p[1]))return null;
          // Nature's Splendor: the extra tuple value does not add a separately
          // documented player requirement; exact edge corroborated independently.
          const verifiedEdge=id===11&&tree.id===11328&&t.id===104928&&p.length===3&&p[0]===104927&&p[1]===2&&p[2]===1;
          return {id:p[0],rank:p[1],conditionKnown:p.length===2||verifiedEdge,...(verifiedEdge?{evidence:'https://theforeverera.com/de/talents/druid/natures-splendor/'}:{})};
        });
        if(pre.some(p=>!p)){valid=false;break}
        positions.add(cell(t.row,t.col));allIds.add(t.id);profileIds.add(t.df);
        const descriptions=Array.from({length:t.max},(_,i)=>word(translated?.d?.[i]));
        const descriptionSources=descriptions.map(d=>d?'ForeverDB deutscher Clienttext':null);
        // Explicit German effect summary, NOT a purported original tooltip.
        // Match exact spell, rank count AND current source effect text; changed
        // game data cannot silently inherit this verified fallback.
        const arctic=id===8&&tree.id===11601&&t.sp===16757&&t.max===2&&
          [10,20].every((v,i)=>t.d?.[i]===('Increases the range of your Frostbolt, Ice Lance, and Blizzard spells and the radius of your Frost Nova and Cone of Cold spells by '+v+'%.'));
        if(arctic)for(const [i,v] of [10,20].entries())if(!descriptions[i]){
          descriptions[i]='Reichweite von Frostblitz, Eislanze und Blizzard sowie Radius von Frostnova und Kältekegel jeweils um '+v+' % erhöht.';
          descriptionSources[i]='Geprüfte deutsche Effektzusammenfassung (kein Originaltext)';
        }
        talents.push({id:t.id,profileId:t.df,name:title,row:t.row,column:t.col,maxRank:t.max,requiredLevel:t.lv,requiredPoints,spellId:t.sp,rankSpellIds:t.ranks,iconId:positive(t.ic)?t.ic:null,
          descriptions,descriptionSources,prerequisites:pre});
      }
      if(!valid)break;
      const byId=new Map(talents.map(t=>[t.id,t]));
      if(talents.some(t=>t.prerequisites.some(p=>!byId.has(p.id)||p.rank>byId.get(p.id).maxRank))){valid=false;break}
      trees.push({id:tree.id,name,talents:talents.sort((a,b)=>a.row-b.row||a.column-b.column||a.id-b.id)});
    }
    if(valid&&trees.length===3&&new Set(trees.map(t=>t.id)).size===3)result[id]={classId:id,name:word(de.n),trees};
  }
  return result;
}
async function captureClassFile(path,fetchImpl,clock){
  const response=await fetchPublicClassFile(path,{fetchImpl,cache:'no-cache'});
  if(!response.ok)throw Error('ForeverDB Klassendaten '+path+' HTTP '+response.status);
  const body=await response.text();
  const receivedAt=clock();
  const age=response.headers?.get('age');
  if(age!==null&&age!==undefined&&!/^\d+$/.test(age))throw Error('Ungültiges Cache-Alter der Klassendaten');
  const freshAt=receivedAt-1000*Number(age??0);
  return {data:JSON.parse(body),digest:createHash('sha256').update(body).digest('hex'),freshAt};
}
// The source content fingerprint is not a verified client build or Hotfix revision.
export function buildTalentMaster(raw,de,{now=Date.now(),observedBuilds=''}={}){
  const classes=normalizeTalentTrees(raw,de,TALENT_CLASS_IDS);
  const classRevisions={},classMechanicsRevisions={};
  for(const [id,c] of Object.entries(classes)){
    const source=arr(raw).find(x=>x.id===Number(id));
    // Include source effects and prerequisite tuples, even when localized texts
    // are missing or an extra condition is not understood.
    const rawNodes=arr(source?.trees).flatMap(t=>arr(t.talents)).sort((a,b)=>a.id-b.id)
      .map(t=>({id:t.id,effects:t.d??null,pre:t.pre}));
    classRevisions[id]=talentRevisionDigest({class:c,rawNodes});
    classMechanicsRevisions[id]=talentRevisionDigest(buildTalentCatalogProof(c,source));
  }
  return {classes,classRevisions,classMechanicsRevisions,expectedClassIds:[...TALENT_CLASS_IDS],
    missingClassIds:TALENT_CLASS_IDS.filter(id=>!classes[id]),checkedAt:new Date(now).toISOString(),
    observedBuilds,source:'ForeverDB.net',verifiedClientBuild:null};
}
export function projectTalentMaster(master,ids){
  const wanted=new Set(ids);
  return {...master,classes:Object.fromEntries(Object.entries(master?.classes||{}).filter(([id])=>wanted.has(Number(id)))),
    classRevisions:Object.fromEntries(Object.entries(master?.classRevisions||{}).filter(([id])=>wanted.has(Number(id)))),
    classMechanicsRevisions:Object.fromEntries(Object.entries(master?.classMechanicsRevisions||{}).filter(([id])=>wanted.has(Number(id))))};
}
export async function loadTalentMaster({fetchImpl=fetch,redisImpl=redis,enabled=configured(),clock=Date.now,now=clock(),observedBuilds=''}={}){
  if(!enabled)return {classes:{},classRevisions:{},missingClassIds:[...TALENT_CLASS_IDS],stale:true};
  let saved=await readCompactMaster(KEY,{redisImpl}).catch(()=>null);
  let stale=!talentCatalogIsFresh(saved?.checkedAt,now);
  // A partial source snapshot is retried at the normal cadence, not on every UI visit.
  if(stale){
    const token=randomUUID();
    // A persistent global attempt budget also covers failures and changing rosters.
    // At most one attempt per six hours across all instances; two public files.
    const acquired=await redisImpl(['SET',KEY+':attempt',token,'NX','EX',ATTEMPT_SECONDS]).catch(()=>null);
    if(acquired==='OK'){
      try{
        const [raw,localized]=await Promise.all([
          captureClassFile('classes.json',fetchImpl,clock),
          captureClassFile('l10n/de/classes.json',fetchImpl,clock)
        ]);
        const candidate=buildTalentMaster(raw.data,localized.data,{
          now:Math.min(raw.freshAt,localized.freshAt),observedBuilds
        });
        candidate.sourceRevision=talentSourcePairDigest(raw.digest,localized.digest);
        candidate.sourceDigests={raw:raw.digest,localized:localized.digest};
        candidate.sourceFreshAt={
          raw:new Date(raw.freshAt).toISOString(),localized:new Date(localized.freshAt).toISOString()
        };
        if(Object.keys(candidate.classes).length){
          // Retain previously observed classes only as explicitly stale display
          // fallbacks; never treat them as part of the current source snapshot.
          candidate.fallbackClasses={...saved?.fallbackClasses,...saved?.classes};
          for(const id of Object.keys(candidate.classes))delete candidate.fallbackClasses[id];
          const written=await writeCompactMaster(KEY,candidate,{redisImpl});
          if(written==='OK'){saved=candidate;stale=!talentCatalogIsFresh(saved.checkedAt,clock())}
        }
      }catch(error){console.warn('Talentbaum-Katalog nicht aktualisiert:',String(error.message).slice(0,120))}

    }
  }
  if(!saved)return {classes:{},classRevisions:{},missingClassIds:[...TALENT_CLASS_IDS],stale:true};
  // Keep the build observations from the source acquisition; later roster hints
  // are not evidence that the cached source was extracted from those builds.
  return {...saved,stale,latestObservedBuilds:observedBuilds};
}
const refsFor=entries=>Object.values(entries).flatMap(c=>c.trees.flatMap(t=>
  t.talents.map(n=>({type:'spell',id:n.spellId,iconId:n.iconId}))));
function withTalentIcons(klass,icons){
  return {...klass,trees:klass.trees.map(tree=>({...tree,talents:tree.talents.map(node=>({
    ...node,iconUrl:icons[mediaIconKey('spell',node.spellId)]||null
  }))}))};
}
export async function loadTalentPlannerClass(klass){
  const icons=await knowledgeIcons(refsFor({[klass.classId]:klass}),{allowFetch:false});
  return withTalentIcons(klass,icons);
}

export async function loadTalentTreeCatalog(data,addonSync={}, {fetchImpl=fetch,redisImpl=redis,enabled=configured(),resolveIcons=knowledgeIcons,now=Date.now()}={}){
  const ids=[...new Set(arr(data?.characters).map(c=>c.classId).filter(positive))].sort((a,b)=>a-b);
  if(!ids.length)return {classes:{},stale:true};
  const builds=[...new Set(Object.values(addonSync||{}).map(s=>String(s?.build||'')).filter(b=>/^\d{4,8}$|^\d+\.\d+\.\d+\.\d+$/.test(b)))].sort();
  const hint=builds.join('|');
  const master=await loadTalentMaster({fetchImpl,redisImpl,enabled,now,observedBuilds:hint});
  const projected=projectTalentMaster(master,ids);
  let classes=projected.classes;
  const missing=ids.filter(id=>!classes[id]);
  if(missing.length&&enabled){
    // Read legacy display data only when necessary. Avoid the generic cache
    // migration here because it can write to shared production keys.
    const legacyIds=missing.filter(id=>!master.fallbackClasses?.[id]);
    let legacy=null;
    if(isProduction&&legacyIds.length){
      const key=LEGACY_KEY+':'+ids.join('-');
      try{
        const packed=await redisImpl(['GET',compressedMasterKey(key)]);
        legacy=packed?decodeCompactMaster(packed):JSON.parse(await redisImpl(['GET',key]));
      }catch{/* A failed migration read must not suppress current classes. */}
    }
    for(const id of missing){
      const fallback=master.fallbackClasses?.[id]||legacy?.classes?.[id];
      if(fallback)classes={...classes,[id]:fallback};
    }
  }
  const refs=refsFor(classes);
  const fetchableKeys=new Set(refsFor(projected.classes).map(n=>mediaIconKey(n.type,n.id)));
  const icons=enabled?await resolveIcons(refs,{characterSlug:data.characters?.[0]?.slug,maxNew:48,
    allowFetch:isProduction&&!master.stale,fetchableKeys}).catch(()=>({})): {};
  // The global flag describes cache age. Fallback provenance is per class.
  return {checkedAt:master.checkedAt,source:master.source,observedBuilds:master.observedBuilds,stale:master.stale,
    missingClassIds:missing,fallbackClassIds:missing.filter(id=>classes[id]),
    classes:Object.fromEntries(Object.entries(classes).map(([id,c])=>[id,withTalentIcons(c,icons)]))};
}
