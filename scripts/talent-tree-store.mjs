import {randomUUID,createHash} from 'node:crypto';
import {configured,redis} from './character-store.mjs';
import {readCompactMaster,writeCompactMaster} from './compact-master-cache.mjs';
import {publicClassData,CLASS_BY_ID} from './class-training-store.mjs';
import {knowledgeIcons} from './knowledge-media.mjs';
import {mediaIconKey} from './media-resolver.mjs';

const LEGACY_KEY='dalton-dashboard:talent-tree-catalog:v2';
const KEY='dalton-dashboard:talent-tree-catalog:v3:all-classes';
export const TALENT_CLASS_IDS=Object.freeze(Object.keys(CLASS_BY_ID).map(Number).sort((a,b)=>a-b));
const MAX_AGE=6*60*60*1000;
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
async function fetchGermanClassData(fetchImpl=fetch){
  const response=await fetchImpl('https://foreverdb.net/data/l10n/de/classes.json',{headers:{Accept:'application/json','User-Agent':'Dalton-Dashboard/1.0 (+https://dalton-dashboard-eight.vercel.app)'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('ForeverDB deutsche Klassendaten HTTP '+response.status);
  return response.json();
}
// The source content fingerprint is not a verified client build or Hotfix revision.
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function buildTalentMaster(raw,de,{now=Date.now(),observedBuilds=''}={}){
  const classes=normalizeTalentTrees(raw,de,TALENT_CLASS_IDS);
  const classRevisions={};
  for(const [id,c] of Object.entries(classes)){
    const source=arr(raw).find(x=>x.id===Number(id));
    // Include source effects and prerequisite tuples, even when localized texts
    // are missing or an extra condition is not understood.
    const rawNodes=arr(source?.trees).flatMap(t=>arr(t.talents)).sort((a,b)=>a.id-b.id)
      .map(t=>({id:t.id,effects:t.d??null,pre:t.pre}));
    classRevisions[id]=createHash('sha256').update(JSON.stringify(canonical({class:c,rawNodes}))).digest('hex');
  }
  return {classes,classRevisions,expectedClassIds:[...TALENT_CLASS_IDS],
    missingClassIds:TALENT_CLASS_IDS.filter(id=>!classes[id]),checkedAt:new Date(now).toISOString(),
    observedBuilds,source:'ForeverDB.net',verifiedClientBuild:null};
}
export function projectTalentMaster(master,ids){
  const wanted=new Set(ids);
  return {...master,classes:Object.fromEntries(Object.entries(master?.classes||{}).filter(([id])=>wanted.has(Number(id)))),
    classRevisions:Object.fromEntries(Object.entries(master?.classRevisions||{}).filter(([id])=>wanted.has(Number(id))))};
}
export async function loadTalentMaster({fetchImpl=fetch,redisImpl=redis,enabled=configured(),now=Date.now(),observedBuilds=''}={}){
  if(!enabled)return {classes:{},classRevisions:{},missingClassIds:[...TALENT_CLASS_IDS],stale:true};
  let saved=await readCompactMaster(KEY,{redisImpl}).catch(()=>null);
  const fresh=value=>value&&TALENT_CLASS_IDS.every(id=>value.classes?.[id]?.trees?.length===3&&value.classRevisions?.[id])&&value.observedBuilds===observedBuilds&&now-Date.parse(value.checkedAt)>=0&&now-Date.parse(value.checkedAt)<MAX_AGE;
  const recentAttempt=value=>value&&value.observedBuilds===observedBuilds&&now-Date.parse(value.checkedAt)>=0&&now-Date.parse(value.checkedAt)<MAX_AGE;
  let stale=!fresh(saved);
  // A partial source snapshot is retried at the normal cadence, not on every UI visit.
  if(stale&&!recentAttempt(saved)){
    const token=randomUUID(),lock=KEY+':lock';
    const acquired=await redisImpl(['SET',lock,token,'NX','EX',45]).catch(()=>null);
    if(acquired==='OK'){
      try{
        const [raw,de]=await Promise.all([publicClassData({fetchImpl}),fetchGermanClassData(fetchImpl)]);
        const candidate=buildTalentMaster(raw,de,{now,observedBuilds});
        if(Object.keys(candidate.classes).length){
          // Retain previously observed classes only as explicitly stale display
          // fallbacks; never treat them as part of the current source snapshot.
          candidate.fallbackClasses={...saved?.fallbackClasses,...saved?.classes};
          for(const id of Object.keys(candidate.classes))delete candidate.fallbackClasses[id];
          const written=await writeCompactMaster(KEY,candidate,{redisImpl});
          if(written==='OK'){saved=candidate;stale=!fresh(saved)}
        }
      }catch(error){console.warn('Talentbaum-Katalog nicht aktualisiert:',String(error.message).slice(0,120))}
      finally{await redisImpl(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lock,token]).catch(()=>{})}
    }
  }
  if(!saved)return {classes:{},classRevisions:{},missingClassIds:[...TALENT_CLASS_IDS],stale:true};
  return {...saved,stale};
}
export async function loadTalentTreeCatalog(data,addonSync={}, {fetchImpl=fetch,redisImpl=redis,enabled=configured(),resolveIcons=knowledgeIcons,now=Date.now()}={}){
  const ids=[...new Set(arr(data?.characters).map(c=>c.classId).filter(positive))].sort((a,b)=>a-b);
  if(!ids.length)return {classes:{},stale:true};
  const builds=[...new Set(Object.values(addonSync||{}).map(s=>String(s?.build||'')).filter(b=>/^\d{4,8}$|^\d+\.\d+\.\d+\.\d+$/.test(b)))].sort();
  const hint=builds.join('|');
  const master=await loadTalentMaster({fetchImpl,redisImpl,enabled,now,observedBuilds:hint});
  const projected=projectTalentMaster(master,ids);
  let classes=projected.classes;
  let stale=master.stale;
  const missing=ids.filter(id=>!classes[id]);
  if(missing.length&&enabled){
    // Migration fallback for the existing read-only character view only.
    const legacy=await readCompactMaster(LEGACY_KEY+':'+ids.join('-'),{redisImpl}).catch(()=>null);
    for(const id of missing){
      const fallback=master.fallbackClasses?.[id]||legacy?.classes?.[id];
      if(fallback)classes={...classes,[id]:fallback};
    }
    stale=true;
  }
  const refs=Object.values(classes).flatMap(c=>c.trees.flatMap(t=>t.talents.map(n=>({type:'spell',id:n.spellId,iconId:n.iconId}))));
  const icons=enabled?await resolveIcons(refs,{characterSlug:data.characters?.[0]?.slug,maxNew:48,allowFetch:!stale}).catch(()=>({})): {};
  // Keep the existing public response lean; only the character projection has icons.
  return {checkedAt:master.checkedAt,source:master.source,observedBuilds:master.observedBuilds,stale,
    classes:Object.fromEntries(Object.entries(classes).map(([id,c])=>[id,{...c,trees:c.trees.map(t=>({...t,talents:t.talents.map(n=>({...n,iconUrl:icons[mediaIconKey('spell',n.spellId)]||null}))}))}]))};
}
