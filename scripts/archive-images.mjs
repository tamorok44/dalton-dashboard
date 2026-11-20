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
  const result=await put(path,body,{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:type,token:process.env.BLOB_READ_WRITE_TOKEN});
  return result.url;
}
export async function archiveImages(data,previous){
  if(!process.env.BLOB_READ_WRITE_TOKEN)return data;
  const old=new Map((previous.characters||[]).map(c=>[c.slug,c]));
  const cache=new Map();
  async function stored(url,path,prior){
    if(prior)return prior;
    if(cache.has(url))return cache.get(url);
    try{
      const result=await copyImage(url,path);
      cache.set(url,result);
      return result;
    }catch(e){console.warn('Bildarchivierung fehlgeschlagen:',String(e.message).slice(0,130));return undefined}
  }
  const characters=[];
  for(const c of data.characters){
    const before=old.get(c.slug)||{};
    const next={...c};
    if(portrait.test(c.imageUrl||'')){
      next.storedImageUrl=await stored(c.imageUrl,'portraits/'+c.slug+'/main-'+hash(c.imageUrl+'@'+(c.imageCheckedAt||''))+'.png',
        c.imageUrl===before.imageUrl&&c.imageCheckedAt===before.imageCheckedAt?before.storedImageUrl:null);
    }
    if(portrait.test(c.avatarUrl||'')){
      next.storedAvatarUrl=await stored(c.avatarUrl,'portraits/'+c.slug+'/avatar-'+hash(c.avatarUrl+'@'+(c.imageCheckedAt||''))+'.jpg',
        c.avatarUrl===before.avatarUrl&&c.imageCheckedAt===before.imageCheckedAt?before.storedAvatarUrl:null);
    }
    const previousGear=new Map((before.equipment||[]).map(i=>[i.slot,i]));
    next.equipment=[];
    for(const item of c.equipment||[]){
      const prior=previousGear.get(item.slot);
      const copy={...item};
      if(icon.test(item.icon||'')){
        const ext=item.icon.endsWith('.webp')?'webp':'jpg';
        copy.storedIcon=await stored(item.icon,'equipment/'+hash(item.icon)+'.'+ext,
          item.icon===prior?.icon?prior.storedIcon:null);
      }
      next.equipment.push(copy);
    }
    characters.push(next);
  }
  return {...data,characters};
}
