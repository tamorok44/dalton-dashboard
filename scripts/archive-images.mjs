import {createHash} from 'node:crypto';
const portrait=/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-(?:main-raw\.png|avatar\.jpg)$/;
const icon=/^(?:https:\/\/render\.worldofwarcraft\.com\/forever-eu\/icons\/\d+\/\d+\.jpg|https:\/\/foreverspec\.com\/icons\/\d+\.webp)$/;
function hash(s){return createHash('sha256').update(s).digest('hex').slice(0,24)}
async function copyImage(url,path){
  const r=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('Bildquelle HTTP '+r.status);
  const type=(r.headers.get('content-type')||'').split(';')[0];
  if(!['image/png','image/jpeg','image/webp'].includes(type))throw Error('Ungültiges Bildformat');
  const body=Buffer.from(await r.arrayBuffer());
  if(body.length===0||body.length>5_000_000)throw Error('Bildgröße unzulässig');
  const {put}=await import('@vercel/blob');
  const result=await put(path,body,{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:type});
  return result.url;
}
export function imageStoreConfigured(){
  // Vercel Blob supports project-scoped OIDC (BLOB_STORE_ID) or the legacy read/write token.
  return Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN);
}
export async function archiveImages(data,previous){
  if(!imageStoreConfigured())return data;
  const old=new Map((previous.characters||[]).map(c=>[c.slug,c]));
  const cache=new Map();
  let newIcons=0;
  let newPortraits=0;
  let active=0;
  const waiting=[];
  async function limited(fn){
    if(active>=6)await new Promise(resolve=>waiting.push(resolve));
    active++;
    try{return await fn()}finally{active--;waiting.shift()?.()}
  }
  async function stored(url,path,prior,isIcon=false){
    if(prior)return prior;
    if(cache.has(url))return cache.get(url);
    // Archive old gear icons incrementally so the first refresh does not exceed server timeouts.
    if(isIcon&&newIcons>=4)return undefined;
    if(!isIcon&&newPortraits>=2)return undefined;
    if(isIcon)newIcons++;else newPortraits++;
    const task=limited(()=>copyImage(url,path)).catch(e=>{console.warn('Bildarchivierung fehlgeschlagen:',String(e.message).slice(0,130));return undefined});
    cache.set(url,task);
    return task;
  }
  const characters=[];
  for(const c of data.characters){
    const before=old.get(c.slug)||{};
    const next={...c};
    const mainTask=portrait.test(c.imageUrl||'')?stored(c.imageUrl,'portraits/'+c.slug+'/main-'+hash(c.imageUrl+'@'+(c.imageCheckedAt||''))+'.png',
      c.imageUrl===before.imageUrl&&c.imageCheckedAt===before.imageCheckedAt?before.storedImageUrl:null):Promise.resolve(undefined);
    const avatarTask=portrait.test(c.avatarUrl||'')?stored(c.avatarUrl,'portraits/'+c.slug+'/avatar-'+hash(c.avatarUrl+'@'+(c.imageCheckedAt||''))+'.jpg',
      c.avatarUrl===before.avatarUrl&&c.imageCheckedAt===before.imageCheckedAt?before.storedAvatarUrl:null):Promise.resolve(undefined);
    const previousGear=new Map((before.equipment||[]).map(i=>[i.slot,i]));
    const equipmentTask=Promise.all((c.equipment||[]).map(async item=>{
      const prior=previousGear.get(item.slot);
      const copy={...item};
      if(icon.test(item.icon||'')){
        const ext=item.icon.endsWith('.webp')?'webp':'jpg';
        copy.storedIcon=await stored(item.icon,'equipment/'+hash(item.icon)+'.'+ext,
          item.icon===prior?.icon?prior.storedIcon:null,true);
      }
      return copy;
    }));
    [next.storedImageUrl,next.storedAvatarUrl,next.equipment]=await Promise.all([mainTask,avatarTask,equipmentTask]);
    characters.push(next);
  }
  return {...data,characters};
}
