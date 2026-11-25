import {professionSlugFromRecord} from './workshop-foreverdb.mjs';
const array=v=>Array.isArray(v)?v:[];
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
const norm=v=>String(v||'').trim().normalize('NFC').toLocaleLowerCase('de-DE');
// Verified crosswalks, not translations or guessed spell/recipe-ID equality.
// Profile ID, profession, original name and current master output/spell must agree.
const crosswalk=[
  {professionId:129,profileId:54191,original:'Minor Healing Potion',itemId:118,spellId:1244431,source:'https://foreverdb.net/de/spell/1244431',itemSource:'https://foreverdb.net/de/item/118'},
  {professionId:182,profileId:52642,original:'Incense Candle',itemId:279962,spellId:1229705,source:'https://foreverdb.net/spell/1229705',itemSource:'https://foreverdb.net/de/item/279962'}
];
function isBaseKnowledge(p,r){return norm(p.name)&&norm(p.name)===norm(r.name)&&!id(r.craftedItem?.id)&&!array(r.reagents).length}
function currentMasterMatch(p,r,master){
  const slug=professionSlugFromRecord(p);
  const recipes=array(master?.recipes).filter(x=>x.professionSlug===slug&&x.speculation!==true&&id(x.craftedItem?.id));
  const output=id(r.craftedItem?.id);
  if(output){
    const same=recipes.filter(x=>id(x.craftedItem?.id)===output);
    return same.length===1?same[0]:null;
  }
  const link=crosswalk.find(x=>x.professionId===id(p.id)&&x.profileId===id(r.id)&&norm(x.original)===norm(r.name));
  if(link){
    const matches=recipes.filter(x=>id(x.craftedItem.id)===link.itemId&&id(x.id)===link.spellId);
    return matches.length===1?matches[0]:null;
  }
  const key=norm(r.name);
  if(!key)return null;
  const matches=recipes.filter(x=>[x.name,x.englishName,x.craftedItem.name].some(n=>norm(n)===key));
  return matches.length===1?matches[0]:null;
}
function validReagents(values){
  return Array.isArray(values)&&values.length>0&&values.every(x=>id(x?.id)&&typeof x.name==='string'&&x.name.trim()&&Number.isFinite(Number(x.quantity))&&Number(x.quantity)>0);
}
export function repairProfessionKnowledge(data,master){
  if(!Array.isArray(data?.characters))return data;
  return {...data,characters:data.characters.map(c=>({...c,professions:array(c.professions).map(p=>({...p,knownRecipes:array(p.knownRecipes).map(r=>{
    if(isBaseKnowledge(p,r))return {...r,knowledgeKind:'profession-basic',recipeDetailsStatus:'not-applicable'};
    const output=id(r.craftedItem?.id),complete=output&&validReagents(r.reagents);
    if(complete)return {...r,knowledgeKind:'crafting',recipeDetailsStatus:r.recipeDetailsStatus==='previous'?'previous':'verified'};
    const match=currentMasterMatch(p,r,master);
    if(match&&validReagents(match.reagents)&&typeof match.craftedItem.name==='string'&&match.craftedItem.name.trim()){
      const q=match.craftedQuantity||{};
      return {...r,originalRecipeName:r.originalRecipeName||r.name,name:match.craftedItem.name,craftedItem:match.craftedItem,
        craftedQuantity:r.craftedQuantity||{minimum:q.min??null,maximum:q.max??null,value:q.min===q.max?q.min??null:null},
        reagents:match.reagents,knowledgeKind:'crafting',recipeDetailsStatus:'verified',recipeDetailsSource:'ForeverDB.net',recipeDetailsBuild:master.build||null,foreverDbRecipeId:match.id};
    }
    return {...r,knowledgeKind:output?'crafting':'unresolved',recipeDetailsStatus:'unavailable'};
  })}))}))};
}
export function preserveKnownRecipeDetails(data,previous){
  const prior=new Map(array(previous?.characters).flatMap(c=>array(c.professions).flatMap(p=>array(p.knownRecipes).map(r=>[c.slug+':'+p.id+':'+r.id,r]))));
  return {...data,characters:array(data?.characters).map(c=>({...c,professions:array(c.professions).map(p=>({...p,knownRecipes:array(p.knownRecipes).map(r=>{
    const old=prior.get(c.slug+':'+p.id+':'+r.id);
    if(!id(r.craftedItem?.id)&&old&&id(old.craftedItem?.id)&&validReagents(old.reagents)){
      return {...old,...r,name:old.name,craftedItem:old.craftedItem,craftedQuantity:old.craftedQuantity,reagents:old.reagents,recipeDetailsStatus:'previous',recipeDetailsSource:old.recipeDetailsSource||'Blizzard Forever'};
    }
    return r;
  })}))}))};
}
