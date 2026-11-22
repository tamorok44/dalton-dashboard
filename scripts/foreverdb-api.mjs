const API_BASE='https://foreverdb.net/api/v1';
const PROFESSION_SLUGS=new Set(['alchemy','blacksmithing','enchanting','engineering','leatherworking','tailoring','herbalism','mining','skinning','cooking','first-aid','fishing']);

export function foreverDbConfigured(){
  return Boolean(process.env.FOREVERDB_API_KEY);
}
function headers(){
  const key=process.env.FOREVERDB_API_KEY;
  if(!key)throw new Error('ForeverDB API-Key fehlt');
  return {
    'X-API-Key':key,
    'Accept':'application/json',
    'User-Agent':'Dalton-Dashboard/1.0 (+https://dalton-dashboard-eight.vercel.app)'
  };
}
function buildUrl(path,params={}){
  const url=new URL(API_BASE+path);
  url.searchParams.set('lang','de');
  for(const [key,value] of Object.entries(params)){
    if(value===null||value===undefined||value==='')continue;
    url.searchParams.set(key,String(value));
  }
  return url;
}
async function request(path,{params={},fetchImpl=fetch}={}){
  const response=await fetchImpl(buildUrl(path,params),{
    headers:headers(),
    signal:AbortSignal.timeout(15000)
  });
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload={error:text.slice(0,240)}}
  if(response.status===429){
    const retry=response.headers?.get?.('retry-after');
    const error=new Error('ForeverDB Rate-Limit erreicht'+(retry?' · Retry-After '+retry:''));
    error.code='FOREVERDB_RATE_LIMIT';throw error;
  }
  if(response.status===402){
    const error=new Error('ForeverDB Tageskontingent erreicht');
    error.code='FOREVERDB_QUOTA';throw error;
  }
  if(response.status===401||response.status===403){
    const error=new Error('ForeverDB API-Key wurde abgelehnt');
    error.code='FOREVERDB_AUTH';throw error;
  }
  if(!response.ok){
    const message=payload?.error?.message||payload?.error||payload?.message||('HTTP '+response.status);
    const error=new Error('ForeverDB: '+String(message).slice(0,180));
    error.code='FOREVERDB_HTTP_'+response.status;throw error;
  }
  return payload;
}
function listFromPayload(payload,keys=[]){
  if(Array.isArray(payload?.data))return payload.data;
  for(const key of keys)if(Array.isArray(payload?.data?.[key]))return payload.data[key];
  if(Array.isArray(payload))return payload;
  return [];
}
function compactItem(raw={}){
  return {
    id:Number.isInteger(Number(raw?.id))?Number(raw.id):null,
    name:raw?.name||raw?.nameLocalized||raw?.localizedName||null,
    englishName:raw?.nameEn||raw?.englishName||null,
    quality:raw?.quality??null,
    itemClass:raw?.class??raw?.itemClass??null,
    subclass:raw?.subclass??raw?.itemSubclass??null,
    inventoryType:raw?.slot??raw?.inventoryType??null,
    requiredLevel:Number.isFinite(Number(raw?.requiredLevel??raw?.levelRequirement))?Number(raw.requiredLevel??raw.levelRequirement):null,
    icon:raw?.icon??raw?.iconUrl??null
  };
}
export async function fetchForeverDbMeta({fetchImpl=fetch}={}){
  const payload=await request('/meta',{fetchImpl});
  const data=payload?.data??payload??{};
  return {
    build:data?.build||data?.gameBuild||data?.clientBuild||payload?.meta?.build||payload?.meta?.gameBuild||payload?.meta?.clientBuild||null,
    rawMeta:payload?.meta||null
  };
}
export async function searchForeverDbItems(query,{limit=10,offset=0,fetchImpl=fetch}={}){
  const q=String(query??'').trim();
  if(!q)return {items:[],meta:null};
  const payload=await request('/items',{params:{q,limit:Math.max(1,Math.min(100,Number(limit)||10)),offset:Math.max(0,Number(offset)||0)},fetchImpl});
  return {
    items:listFromPayload(payload,['items','results']).map(compactItem).filter(item=>item.id&&item.name),
    meta:payload?.meta||null
  };
}
export async function fetchForeverDbItem(id,{fetchImpl=fetch}={}){
  const numeric=Number(id);
  if(!Number.isInteger(numeric)||numeric<=0)throw new Error('Ungültige ForeverDB Item-ID');
  const payload=await request('/items/'+numeric,{fetchImpl});
  const raw=payload?.data??payload;
  return {item:compactItem(raw),meta:payload?.meta||null};
}
export async function fetchForeverDbProfession(slug,{query='',limit=100,offset=0,fetchImpl=fetch}={}){
  if(!PROFESSION_SLUGS.has(slug))throw new Error('Unbekannter ForeverDB-Beruf');
  const payload=await request('/professions/'+slug,{params:{q:query||undefined,limit:Math.max(1,Math.min(100,Number(limit)||100)),offset:Math.max(0,Number(offset)||0)},fetchImpl});
  return {
    data:payload?.data??payload,
    recipes:listFromPayload(payload,['recipes','results']),
    meta:payload?.meta||null
  };
}

function compactSpell(raw={}){
  const requiredLevel=Number(raw?.requiredLevel??raw?.required_level??raw?.levelRequirement??raw?.level_requirement??0);
  const baseCost=Number(raw?.baseCost??raw?.base_cost??raw?.cost??raw?.trainingCost??raw?.training_cost);
  return {
    id:Number.isInteger(Number(raw?.id))?Number(raw.id):null,
    name:raw?.name||raw?.nameLocalized||raw?.localizedName||null,
    rank:raw?.rank||raw?.rankName||raw?.rank_name||null,
    requiredLevel:Number.isFinite(requiredLevel)&&requiredLevel>=0?requiredLevel:null,
    baseCostCopper:Number.isFinite(baseCost)&&baseCost>=0?Math.round(baseCost):null,
    icon:raw?.icon??raw?.iconUrl??null
  };
}
export async function fetchForeverDbSpell(id,{fetchImpl=fetch}={}){
  const numeric=Number(id);
  if(!Number.isInteger(numeric)||numeric<=0)throw new Error('Ungültige ForeverDB Spell-ID');
  const payload=await request('/spells/'+numeric,{fetchImpl});
  const raw=payload?.data??payload;
  return {spell:compactSpell(raw),meta:payload?.meta||null};
}
export async function fetchForeverDbClass(name,{fetchImpl=fetch}={}){
  const slug=String(name??'').trim().toLocaleLowerCase('en-US');
  if(!/^[a-z][a-z-]{2,30}$/.test(slug))throw new Error('Ungültige ForeverDB Klassenkennung');
  const payload=await request('/classes/'+encodeURIComponent(slug),{fetchImpl});
  return {data:payload?.data??payload,meta:payload?.meta||null};
}
function compactVendor(raw={}){
  const displayId=Number(raw?.displayId??raw?.display_id??raw?.creatureDisplayId??raw?.creature_display_id??raw?.display?.id);
  const renderUrl=raw?.render?.url??raw?.renderUrl??raw?.render_url??raw?.imageUrl??raw?.image_url??null;
  return {
    id:Number.isInteger(Number(raw?.id))?Number(raw.id):null,
    name:raw?.name||raw?.nameLocalized||raw?.localizedName||null,
    title:raw?.title||null,
    displayId:Number.isInteger(displayId)&&displayId>0?displayId:null,
    renderUrl:typeof renderUrl==='string'&&renderUrl.startsWith('https://')?renderUrl:null
  };
}
export async function fetchForeverDbVendor(id,{fetchImpl=fetch}={}){
  const numeric=Number(id);
  if(!Number.isInteger(numeric)||numeric<=0)throw new Error('Ungültige ForeverDB Händler-ID');
  const payload=await request('/vendors/'+numeric,{fetchImpl});
  const raw=payload?.data??payload;
  return {vendor:compactVendor(raw),meta:payload?.meta||null};
}

export {PROFESSION_SLUGS};
