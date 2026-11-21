import {createHash} from 'node:crypto';
import {loadMediaRecord,saveMediaRecord} from './media-registry.mjs';

const portrait=/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-(?:main-raw\.png|avatar\.jpg)$/;
const icon=/^(?:https:\/\/render\.worldofwarcraft\.com\/forever-eu\/icons\/\d+\/\d+\.jpg|https:\/\/foreverspec\.com\/icons\/\d+\.webp)$/;
const petRender=/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/npcs\/zoom\/creature-display-\d+\.jpg$/;
function hash(s){return createHash('sha256').update(s).digest('hex').slice(0,24)}
function safePart(value){return String(value??'unknown').replace(/[^a-z0-9:_-]+/gi,'-').slice(0,96)||'unknown'}
async function copyImage(url,path){
  const r=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('Bildquelle HTTP '+r.status);
  const type=(r.headers.get('content-type')||'').split(';')[0];
  if(!['image/png','image/jpeg','image/webp'].includes(type))throw Error('Ungültiges Bildformat');
  const body=Buffer.from(await r.arrayBuffer());
  if(body.length===0||body.length>5_000_000)throw Error('Bildgröße unzulässig');
  const {put}=await import('@vercel/blob');
  const result=await put(path,body,{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:type});
  return {url:result.url,contentType:type};
}
export function imageStoreConfigured(){
  return Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN);
}
export async function archiveImages(data,previous){
  if(!imageStoreConfigured())return data;
  const old=new Map((previous.characters||[]).map(c=>[c.slug,c]));
  const cache=new Map();
  let newIcons=0;
  let newPortraits=0;
  let newRenders=0;
  let active=0;
  const waiting=[];
  async function limited(fn){
    if(active>=6)await new Promise(resolve=>waiting.push(resolve));
    active++;
    try{return await fn()}finally{active--;waiting.shift()?.()}
  }
  async function stored(url,path,prior,{bucket='icon',entityType=null,entityId=null,role=null}={}){
    if(prior)return prior;
    if(cache.has(url))return cache.get(url);
    if(bucket==='icon'&&newIcons>=6)return undefined;
    if(bucket==='portrait'&&newPortraits>=2)return undefined;
    if(bucket==='render'&&newRenders>=2)return undefined;
    if(bucket==='icon')newIcons++;
    else if(bucket==='portrait')newPortraits++;
    else newRenders++;

    const task=limited(async()=>{
      if(entityType&&entityId&&role){
        try{
          const known=await loadMediaRecord(entityType,entityId,role);
          if(known?.sourceUrl===url&&known?.storedUrl)return known.storedUrl;
        }catch(error){
          console.warn('Medienregister konnte nicht gelesen werden:',String(error.message).slice(0,100));
        }
      }
      const copied=await copyImage(url,path);
      if(entityType&&entityId&&role){
        try{await saveMediaRecord(entityType,entityId,role,{sourceUrl:url,storedUrl:copied.url,contentType:copied.contentType})}
        catch(error){console.warn('Medienregister konnte nicht geschrieben werden:',String(error.message).slice(0,100))}
      }
      return copied.url;
    }).catch(e=>{console.warn('Bildarchivierung fehlgeschlagen:',String(e.message).slice(0,130));return undefined});
    cache.set(url,task);
    return task;
  }
  const characters=[];
  for(const c of data.characters){
    const before=old.get(c.slug)||{};
    const next={...c};
    const mainTask=portrait.test(c.imageUrl||'')?stored(c.imageUrl,'portraits/'+c.slug+'/main-'+hash(c.imageUrl+'@'+(c.imageCheckedAt||''))+'.png',
      c.imageUrl===before.imageUrl&&c.imageCheckedAt===before.imageCheckedAt?before.storedImageUrl:null,{bucket:'portrait'}):Promise.resolve(undefined);
    const avatarTask=portrait.test(c.avatarUrl||'')?stored(c.avatarUrl,'portraits/'+c.slug+'/avatar-'+hash(c.avatarUrl+'@'+(c.imageCheckedAt||''))+'.jpg',
      c.avatarUrl===before.avatarUrl&&c.imageCheckedAt===before.imageCheckedAt?before.storedAvatarUrl:null,{bucket:'portrait'}):Promise.resolve(undefined);

    const previousGear=new Map((before.equipment||[]).map(i=>[i.slot,i]));
    const equipmentTask=Promise.all((c.equipment||[]).map(async item=>{
      const prior=previousGear.get(item.slot);
      const copy={...item};
      if(icon.test(item.icon||'')){
        const ext=item.icon.endsWith('.webp')?'webp':'jpg';
        const entityId=item.id||('icon-'+hash(item.icon));
        copy.storedIcon=await stored(item.icon,'media/item/'+safePart(entityId)+'/icon-'+hash(item.icon)+'.'+ext,
          item.icon===prior?.icon?prior.storedIcon:null,{bucket:'icon',entityType:'item',entityId,role:'icon'});
      }
      return copy;
    }));

    const previousPets=new Map(
      [...(before.hunterPets?.active||[]),...(before.hunterPets?.stable||[])].map(p=>[
        String(p.creatureId||p.id||p.displayId||'')+'|'+String(p.slot??'')+'|'+String(p.name||''),p
      ])
    );
    const archivePet=async pet=>{
      const copy={...pet};
      const displayId=pet.displayId||String(pet.imageUrl||'').match(/creature-display-(\d+)\.jpg$/)?.[1]||null;
      if(displayId&&!copy.displayId)copy.displayId=Number(displayId);
      const identity=pet.creatureId||pet.id||(displayId?'display-'+displayId:'pet-'+hash((pet.name||'')+'|'+(pet.iconUrl||'')));
      const prior=previousPets.get(String(pet.creatureId||pet.id||pet.displayId||'')+'|'+String(pet.slot??'')+'|'+String(pet.name||''))||{};
      if(icon.test(pet.iconUrl||'')){
        copy.storedIconUrl=await stored(pet.iconUrl,'media/pet/'+safePart(identity)+'/icon-'+hash(pet.iconUrl)+'.jpg',
          pet.iconUrl===prior.iconUrl?prior.storedIconUrl:null,{bucket:'icon',entityType:'pet',entityId:identity,role:'icon'});
      }
      if(petRender.test(pet.imageUrl||'')){
        copy.storedImageUrl=await stored(pet.imageUrl,'media/pet/'+safePart(identity)+'/render-'+hash(pet.imageUrl)+'.jpg',
          pet.imageUrl===prior.imageUrl?prior.storedImageUrl:null,{bucket:'render',entityType:'pet',entityId:identity,role:'render'});
      }
      return copy;
    };
    const petTask=Promise.all([
      Promise.all((c.hunterPets?.active||[]).map(archivePet)),
      Promise.all((c.hunterPets?.stable||[]).map(archivePet))
    ]).then(([activePets,stablePets])=>c.hunterPets?{...c.hunterPets,active:activePets,stable:stablePets}:c.hunterPets);

    [next.storedImageUrl,next.storedAvatarUrl,next.equipment,next.hunterPets]=await Promise.all([mainTask,avatarTask,equipmentTask,petTask]);
    characters.push(next);
  }
  return {...data,characters};
}
