import {createHash} from 'node:crypto';
import {resolveMediaAsset,imageStoreConfigured,sourceImageAllowed} from './media-resolver.mjs';
export {imageStoreConfigured} from './media-resolver.mjs';

function hash(s){return createHash('sha256').update(s).digest('hex').slice(0,24)}
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
  async function stored(url,prior,{bucket='icon',entityType,entityId,role}={}){
    if(!sourceImageAllowed(url))return undefined;
    if(prior)return resolveMediaAsset({entityType,entityId,role,sourceUrl:url,priorStoredUrl:prior}).catch(()=>prior);
    const cacheKey=[entityType,entityId,role,url].join('|');
    if(cache.has(cacheKey))return cache.get(cacheKey);
    if(bucket==='icon'&&newIcons>=6)return undefined;
    if(bucket==='portrait'&&newPortraits>=2)return undefined;
    if(bucket==='render'&&newRenders>=2)return undefined;
    if(bucket==='icon')newIcons++;
    else if(bucket==='portrait')newPortraits++;
    else newRenders++;

    const task=limited(()=>resolveMediaAsset({entityType,entityId,role,sourceUrl:url}))
      .catch(e=>{console.warn('Bildarchivierung fehlgeschlagen:',String(e.message).slice(0,130));return undefined});
    cache.set(cacheKey,task);
    return task;
  }
  const characters=[];
  for(const c of data.characters){
    const before=old.get(c.slug)||{};
    const next={...c};
    const mainTask=sourceImageAllowed(c.imageUrl)?stored(c.imageUrl,
      c.imageUrl===before.imageUrl&&c.imageCheckedAt===before.imageCheckedAt?before.storedImageUrl:null,
      {bucket:'portrait',entityType:'character',entityId:c.slug,role:'portrait-main'}):Promise.resolve(undefined);
    const avatarTask=sourceImageAllowed(c.avatarUrl)?stored(c.avatarUrl,
      c.avatarUrl===before.avatarUrl&&c.imageCheckedAt===before.imageCheckedAt?before.storedAvatarUrl:null,
      {bucket:'portrait',entityType:'character',entityId:c.slug,role:'portrait-avatar'}):Promise.resolve(undefined);

    const previousGear=new Map((before.equipment||[]).map(i=>[i.slot,i]));
    const equipmentTask=Promise.all((c.equipment||[]).map(async item=>{
      const prior=previousGear.get(item.slot);
      const copy={...item};
      if(sourceImageAllowed(item.icon)){
        const entityId=item.id||('icon-'+hash(item.icon));
        copy.storedIcon=await stored(item.icon,item.icon===prior?.icon?prior.storedIcon:null,
          {bucket:'icon',entityType:'item',entityId,role:'icon'});
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
      if(sourceImageAllowed(pet.iconUrl)){
        copy.storedIconUrl=await stored(pet.iconUrl,pet.iconUrl===prior.iconUrl?prior.storedIconUrl:null,
          {bucket:'icon',entityType:'pet',entityId:identity,role:'icon'});
      }
      if(sourceImageAllowed(pet.imageUrl)){
        copy.storedImageUrl=await stored(pet.imageUrl,pet.imageUrl===prior.imageUrl?prior.storedImageUrl:null,
          {bucket:'render',entityType:'pet',entityId:identity,role:'render'});
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
