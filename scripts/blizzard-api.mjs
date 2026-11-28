const REGION='eu';
const PROFILE_NAMESPACE='profile-forever-eu';
const API_BASE='https://'+REGION+'.api.blizzard.com';
const TOKEN_URL='https://oauth.battle.net/token';
let cachedToken=null;
let tokenRequest=null;

export const FOREVER_CHARACTER_ENDPOINTS={
  profile:'',
  status:'/status',
  equipment:'/equipment',
  professions:'/professions',
  statistics:'/statistics',
  specializations:'/specializations',
  media:'/character-media',
  achievements:'/achievements',
  appearance:'/appearance',
  collections:'/collections',
  dungeons:'/encounters/dungeons',
  raids:'/encounters/raids',
  mythicKeystone:'/mythic-keystone-profile',
  pvp:'/pvp-summary',
  quests:'/quests',
  completedQuests:'/quests/completed',
  reputations:'/reputations',
  titles:'/titles',
  hunterPets:'/hunter-pets',
  spells:'/spells',
  spellbook:'/spellbook'
};

export function blizzardApiConfigured(){
  return Boolean(process.env.BLIZZARD_CLIENT_ID&&process.env.BLIZZARD_CLIENT_SECRET);
}

function primitiveType(value){
  if(value===null)return 'null';
  if(Array.isArray(value))return 'array';
  if(typeof value==='number')return Number.isInteger(value)?'integer':'number';
  return typeof value;
}

function addType(map,path,type){
  const set=map.get(path)||new Set();
  set.add(type);
  map.set(path,set);
}

export function describeShape(value,{maxDepth=6,maxPaths=500}={}){
  const paths=new Map();
  let truncated=false;
  function walk(current,path,depth){
    if(paths.size>=maxPaths){truncated=true;return}
    addType(paths,path,primitiveType(current));
    if(depth>=maxDepth||current===null)return;
    if(Array.isArray(current)){
      for(const item of current.slice(0,5)){
        if(paths.size>=maxPaths){truncated=true;break}
        walk(item,path+'[]',depth+1);
      }
      return;
    }
    if(typeof current==='object'){
      for(const [key,item] of Object.entries(current)){
        if(paths.size>=maxPaths){truncated=true;break}
        walk(item,path+'.'+key,depth+1);
      }
    }
  }
  walk(value,'$',0);
  return {
    pathCount:paths.size,
    truncated,
    paths:[...paths.entries()].map(([path,types])=>({path,types:[...types].sort()}))
  };
}

function topLevelSample(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const sample={};
  for(const [key,item] of Object.entries(value)){
    if(Object.keys(sample).length>=40)break;
    if(item===null||['string','number','boolean'].includes(typeof item))sample[key]=item;
    else if(item&&typeof item==='object'&&!Array.isArray(item)){
      const compact={};
      for(const nested of ['id','name','slug','type']){
        const v=item[nested];
        if(v===null||['string','number','boolean'].includes(typeof v))compact[nested]=v;
      }
      if(Object.keys(compact).length)sample[key]=compact;
    }
  }
  return Object.keys(sample).length?sample:undefined;
}

function timeFields(value){
  const found=[];
  const pattern=/(last.*(?:login|logout|updated|modified)|timestamp|updated_at|created_at)/i;
  function walk(current,path,depth){
    if(found.length>=60||depth>7||current===null)return;
    if(Array.isArray(current)){
      for(const item of current.slice(0,5))walk(item,path+'[]',depth+1);
      return;
    }
    if(typeof current!=='object')return;
    for(const [key,item] of Object.entries(current)){
      const next=path+'.'+key;
      if(pattern.test(key)&&(item===null||['string','number','boolean'].includes(typeof item))){
        found.push({path:next,value:item});
      }
      walk(item,next,depth+1);
      if(found.length>=60)break;
    }
  }
  walk(value,'$',0);
  return found;
}

async function parseResponse(response){
  const text=await response.text();
  if(!text)return null;
  try{return JSON.parse(text)}catch{return {raw:text.slice(0,500)}}
}

async function accessToken(fetchImpl){
  const now=Date.now();
  if(cachedToken?.expiresAt>now+300000){
    return {token:cachedToken.token,expiresIn:Math.max(0,Math.floor((cachedToken.expiresAt-now)/1000))};
  }
  if(tokenRequest)return tokenRequest;
  tokenRequest=(async()=>{
    const id=process.env.BLIZZARD_CLIENT_ID;
    const secret=process.env.BLIZZARD_CLIENT_SECRET;
    if(!id||!secret)throw new Error('Blizzard API-Zugangsdaten fehlen');
    const basic=Buffer.from(id+':'+secret).toString('base64');
    const response=await fetchImpl(TOKEN_URL,{
      method:'POST',
      headers:{
        authorization:'Basic '+basic,
        'content-type':'application/x-www-form-urlencoded'
      },
      body:'grant_type=client_credentials',
      signal:AbortSignal.timeout(15000)
    });
    const payload=await parseResponse(response);
    if(!response.ok||!payload?.access_token)throw new Error('Blizzard OAuth HTTP '+response.status);
    const expiresIn=Number(payload.expires_in)||3600;
    cachedToken={token:payload.access_token,expiresAt:Date.now()+expiresIn*1000};
    return {token:payload.access_token,expiresIn};
  })();
  try{return await tokenRequest}finally{tokenRequest=null}
}

function endpointUrl(slug,suffix,locale){
  const url=new URL(API_BASE+'/profile/wow/character/'+encodeURIComponent(slug)+suffix);
  url.searchParams.set('namespace',PROFILE_NAMESPACE);
  url.searchParams.set('locale',locale);
  return url;
}

function gameDataUrl(path,namespace,locale='de_DE'){
  if(typeof namespace!=='string'||!/^static-[a-z0-9._]+-forever-eu$/i.test(namespace))throw new Error('Ungültiger Forever-Game-Data-Namespace');
  const url=new URL(API_BASE+path);
  url.searchParams.set('namespace',namespace);
  url.searchParams.set('locale',locale);
  return url;
}

export async function fetchForeverReputationIndex({namespace,fetchImpl=fetch,locale='de_DE'}={}){
  const {token}=await accessToken(fetchImpl);
  const response=await fetchImpl(gameDataUrl('/data/wow/reputation-faction/index',namespace,locale),{
    headers:{authorization:'Bearer '+token,accept:'application/json'},
    signal:AbortSignal.timeout(15000)
  });
  const body=await parseResponse(response);
  if(!response.ok)throw new Error('Blizzard Forever reputation index HTTP '+response.status);
  const list=Array.isArray(body?.factions)?body.factions:Array.isArray(body?.reputation_factions)?body.reputation_factions:[];
  return list.map(entry=>({
    id:Number(entry?.id)||Number(entry?.faction?.id)||null,
    name:entry?.name||entry?.faction?.name||null,
    href:entry?.key?.href||entry?.faction?.key?.href||null
  })).filter(entry=>Number.isInteger(entry.id)&&entry.id>0&&entry.name);
}

export function foreverProfileSlug(body){
  return [body?.name,body?.surname].filter(value=>typeof value==='string'&&value.trim()).join('-').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

export async function fetchForeverProfile(slug,{fetchImpl=fetch,locale='de_DE'}={}){
  if(!/^[a-z0-9-]+$/i.test(slug))throw new Error('Ungültiger Charakter-Slug');
  const {token}=await accessToken(fetchImpl);
  const response=await fetchImpl(endpointUrl(slug,'',locale),{
    headers:{authorization:'Bearer '+token,accept:'application/json'},
    signal:AbortSignal.timeout(15000)
  });
  const body=await parseResponse(response);
  if(!response.ok)throw new Error('Blizzard Forever API HTTP '+response.status);
  const returnedSlug=foreverProfileSlug(body);
  if(!Number.isSafeInteger(body?.id)||body.id<=0||returnedSlug!==slug.toLowerCase())throw new Error('Blizzard API-Profil passt nicht zum angefragten Charakter');
  return body;
}

export async function probeForeverCharacter(slug,{
  fetchImpl=fetch,
  locale='en_GB',
  endpointNames=Object.keys(FOREVER_CHARACTER_ENDPOINTS)
}={}){
  if(!/^[a-z0-9-]+$/i.test(slug))throw new Error('Ungültiger Charakter-Slug');
  const {token,expiresIn}=await accessToken(fetchImpl);
  const endpoints={};
  await Promise.all(endpointNames.map(async name=>{
    const suffix=FOREVER_CHARACTER_ENDPOINTS[name];
    if(suffix===undefined)throw new Error('Unbekannter Diagnose-Endpunkt: '+name);
    const response=await fetchImpl(endpointUrl(slug,suffix,locale),{
      headers:{authorization:'Bearer '+token,accept:'application/json'},
      signal:AbortSignal.timeout(15000)
    });
    const body=await parseResponse(response);
    const base={status:response.status,ok:response.ok};
    if(response.ok){
      endpoints[name]={
        ...base,
        topLevelKeys:body&&typeof body==='object'&&!Array.isArray(body)?Object.keys(body):[],
        sample:topLevelSample(body),
        timeFields:timeFields(body),
        schema:describeShape(body)
      };
    }else{
      endpoints[name]={...base,error:body?.detail||body?.title||body?.type||body?.raw||null};
    }
  }));
  return {
    checkedAt:new Date().toISOString(),
    region:REGION,
    namespace:PROFILE_NAMESPACE,
    locale,
    slug,
    oauth:{ok:true,expiresIn},
    endpoints
  };
}


export async function fetchForeverSnapshot(slugs,{
  fetchImpl=fetch,
  locale='de_DE',
  endpointNames=Object.keys(FOREVER_CHARACTER_ENDPOINTS)
}={}){
  if(!Array.isArray(slugs)||!slugs.length)throw new Error('Keine Charaktere für Snapshot angegeben');
  for(const slug of slugs){
    if(!/^[a-z0-9-]+$/i.test(slug))throw new Error('Ungültiger Charakter-Slug');
  }
  const {token}=await accessToken(fetchImpl);
  const snapshot={
    snapshotAt:new Date().toISOString(),
    region:REGION,
    namespace:PROFILE_NAMESPACE,
    locale,
    characters:{}
  };
  for(const slug of slugs)snapshot.characters[slug]={};
  await Promise.all(slugs.flatMap(slug=>endpointNames.map(async name=>{
    const suffix=FOREVER_CHARACTER_ENDPOINTS[name];
    if(suffix===undefined)throw new Error('Unbekannter Snapshot-Endpunkt: '+name);
    const response=await fetchImpl(endpointUrl(slug,suffix,locale),{
      headers:{authorization:'Bearer '+token,accept:'application/json'},
      signal:AbortSignal.timeout(15000)
    });
    const body=await parseResponse(response);
    snapshot.characters[slug][name]={
      status:response.status,
      ok:response.ok,
      data:body
    };
  })));
  return snapshot;
}


function recipeResourceUrl(href,locale){
  const url=new URL(href);
  if(url.protocol!=='https:'||url.hostname!==REGION+'.api.blizzard.com')throw new Error('Ungültiger Blizzard-Rezeptlink');
  if(!/^\/data\/wow\/recipe\/\d+$/.test(url.pathname))throw new Error('Ungültiger Blizzard-Rezeptpfad');
  const namespace=url.searchParams.get('namespace')||'';
  if(!/-forever-eu$/.test(namespace))throw new Error('Ungültiger Forever-Rezept-Namespace');
  url.searchParams.set('locale',locale);
  return url;
}

function normalizeRecipeDetail(body){
  const quantity=body?.crafted_quantity;
  return {
    id:Number(body?.id)||null,
    name:body?.name||null,
    craftedItem:body?.crafted_item?{
      id:Number(body.crafted_item.id)||null,
      name:body.crafted_item.name||null
    }:null,
    craftedQuantity:quantity?{
      minimum:Number.isFinite(Number(quantity.minimum))?Number(quantity.minimum):null,
      maximum:Number.isFinite(Number(quantity.maximum))?Number(quantity.maximum):null,
      value:Number.isFinite(Number(quantity.value))?Number(quantity.value):null
    }:null,
    reagents:Array.isArray(body?.reagents)?body.reagents.map(entry=>({
      id:Number(entry?.reagent?.id)||null,
      name:entry?.reagent?.name||null,
      quantity:Number.isFinite(Number(entry?.quantity))?Number(entry.quantity):null
    })).filter(entry=>entry.name):[]
  };
}

export async function fetchForeverRecipeDetails(recipes,{
  fetchImpl=fetch,
  locale='de_DE'
}={}){
  const refs=[...new Map((Array.isArray(recipes)?recipes:[])
    .filter(recipe=>Number.isInteger(Number(recipe?.id))&&typeof recipe?.href==='string')
    .map(recipe=>[Number(recipe.id),recipe])).values()];
  if(!refs.length)return {};
  const {token}=await accessToken(fetchImpl);
  const entries=await Promise.all(refs.map(async recipe=>{
    try{
      const response=await fetchImpl(recipeResourceUrl(recipe.href,locale),{
        headers:{authorization:'Bearer '+token,accept:'application/json'},
        signal:AbortSignal.timeout(15000)
      });
      const body=await parseResponse(response);
      if(!response.ok||Number(body?.id)!==recipe.id)return [recipe.id,null];
      return [recipe.id,normalizeRecipeDetail(body)];
    }catch{
      return [recipe.id,null];
    }
  }));
  return Object.fromEntries(entries.filter(([,detail])=>detail));
}


function localizedResourceUrl(href,locale){
  const url=new URL(href);
  if(url.protocol!=='https:'||url.hostname!==REGION+'.api.blizzard.com')throw new Error('Ungültiger Blizzard-Game-Data-Link');
  if(!url.pathname.startsWith('/data/wow/'))throw new Error('Ungültiger Blizzard-Game-Data-Pfad');
  const namespace=url.searchParams.get('namespace')||'';
  if(!/-forever-eu$/.test(namespace))throw new Error('Ungültiger Forever-Game-Data-Namespace');
  url.searchParams.set('locale',locale);
  return url;
}


function normalizeQuestDetail(body,ref,locale){
  let namespace='';
  try{namespace=new URL(ref.href).searchParams.get('namespace')||''}catch{}
  const text=value=>typeof value==='string'&&value.trim()?value.trim():null;
  return {
    id:Number(body?.id)||Number(ref?.id)||null,
    title:text(body?.title)||text(body?.name),
    description:text(body?.description),
    area:text(body?.area?.name)||text(body?.zone?.name)||text(body?.category?.name),
    minimumLevel:Number.isInteger(Number(body?.requirements?.min_character_level))?Number(body.requirements.min_character_level):null,
    locale,
    namespace,
    fetchedAt:new Date().toISOString()
  };
}

export async function fetchForeverQuestDetails(refs,{
  fetchImpl=fetch,
  locale='de_DE'
}={}){
  const unique=[...new Map((Array.isArray(refs)?refs:[])
    .filter(ref=>ref?.type==='quest'&&Number.isInteger(Number(ref?.id))&&typeof ref?.href==='string')
    .map(ref=>[Number(ref.id),ref])).values()];
  if(!unique.length)return {};
  const {token}=await accessToken(fetchImpl);
  const entries=await Promise.all(unique.map(async ref=>{
    try{
      const response=await fetchImpl(localizedResourceUrl(ref.href,locale),{
        headers:{authorization:'Bearer '+token,accept:'application/json'},
        signal:AbortSignal.timeout(15000)
      });
      const body=await parseResponse(response);
      if(!response.ok)return [Number(ref.id),null];
      const detail=normalizeQuestDetail(body,ref,locale);
      return [Number(ref.id),detail?.title?detail:null];
    }catch{
      return [Number(ref.id),null];
    }
  }));
  return Object.fromEntries(entries.filter(([,detail])=>detail));
}

export async function fetchForeverLocalizedNames(refs,{
  fetchImpl=fetch,
  locale='de_DE'
}={}){
  const unique=[...new Map((Array.isArray(refs)?refs:[])
    .filter(ref=>ref?.type&&Number.isInteger(Number(ref?.id))&&typeof ref?.href==='string')
    .map(ref=>[String(ref.type)+':'+Number(ref.id),ref])).values()];
  if(!unique.length)return {};
  const {token}=await accessToken(fetchImpl);
  const entries=await Promise.all(unique.map(async ref=>{
    const key=String(ref.type)+':'+Number(ref.id);
    try{
      const response=await fetchImpl(localizedResourceUrl(ref.href,locale),{
        headers:{authorization:'Bearer '+token,accept:'application/json'},
        signal:AbortSignal.timeout(15000)
      });
      const body=await parseResponse(response);
      const localizedName=typeof body?.name==='string'&&body.name?body.name:typeof body?.title==='string'&&body.title?body.title:null;
      if(!response.ok||!localizedName)return [key,null];
      return [key,localizedName];
    }catch{
      return [key,null];
    }
  }));
  return Object.fromEntries(entries.filter(([,name])=>name));
}

/** An explicitly typed media identity in an observed Forever namespace. */
export async function fetchForeverMediaIcon(type,id,{namespace,fetchImpl=fetch,locale='de_DE'}={}){
  if(!['profession','recipe','item','spell'].includes(type)||!Number.isInteger(Number(id))||Number(id)<=0)return null;
  const url=gameDataUrl('/data/wow/media/'+type+'/'+Number(id),namespace,locale);
  const {token}=await accessToken(fetchImpl);
  const response=await fetchImpl(url,{headers:{authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(6000)});
  if(response.status===404)return null;
  if(!response.ok)throw Error('Blizzard-Medien HTTP '+response.status);
  const body=await parseResponse(response);
  return (Array.isArray(body?.assets)?body.assets:[]).find(asset=>asset?.key==='icon'&&typeof asset.value==='string')?.value||null;
}
