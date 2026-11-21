import {professionSlugFromRecord} from './workshop-foreverdb.mjs';
function asArray(value){return Array.isArray(value)?value:[]}
function finiteNumber(value){const n=Number(value);return Number.isFinite(n)?n:null}
function integer(value){const n=Number(value);return Number.isInteger(n)?n:null}
function text(value){return typeof value==='string'?value.trim():''}
function normalizeSearch(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE').trim();
}
function uniqueSorted(values){
  return [...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'de'));
}
function recipeYield(quantity={}){
  const direct=finiteNumber(quantity?.value),minimum=finiteNumber(quantity?.minimum),maximum=finiteNumber(quantity?.maximum);
  if(direct!==null&&direct>0)return {min:direct,max:direct,variable:false};
  const min=minimum!==null&&minimum>0?minimum:1;
  const max=maximum!==null&&maximum>0?Math.max(min,maximum):min;
  return {min,max,variable:max!==min};
}
function fallbackCategoryPath({professionName,itemName,recipeName}){
  const value=normalizeSearch(itemName+' '+recipeName);
  if(/lager|camp|brunnen|leitstein|stuhl|zelt|feuer/.test(value))return ['Lager & Spezial','Lagerobjekte'];
  if(/rüstungsset|rustungsset|armor kit|waffenöl|waffenol|weapon oil|wetzstein|schleifstein|weightstone|zielfernrohr|scope/.test(value))return ['Verbesserungen'];
  if(/stiefel|armschiene|weste|brust|umhang|handschuh|gürtel|gurtel|hose|bein|schulter|helm|schild|schwert|axt|kolben|dolch|stab|bogen|gewehr|waffe/.test(value))return ['Ausrüstung & Gegenstände','Ausrüstung'];
  if(/barren|\bbar\b|farbstoff|säure|saeure|öl|oel|pulver|faden|stoff|leder|erz|stein|rohr|gehäuse|gehaeuse|teil/.test(value))return ['Materialien & Komponenten','Materialien'];
  if(/verband/.test(value))return ['Verbrauchsgüter','Verbände'];
  if(/trank|potion|elixier|elixir/.test(value))return ['Verbrauchsgüter','Tränke'];
  if(/gegenmittel|gegengift|anti-venom|heilmittel|schlammpackung|tourniquet|abschnürbinde/.test(value))return ['Verbrauchsgüter','Heilmittel'];
  if(professionName==='Kochkunst')return ['Verbrauchsgüter','Nahrung'];
  if(professionName==='Ingenieurskunst')return ['Geräte & Komponenten'];
  if(['Alchimie','Erste Hilfe'].includes(professionName))return ['Verbrauchsgüter'];
  return ['Sonstiges'];
}
function crafterRecord(character,profession){
  return {
    slug:text(character?.slug)||null,
    name:text(character?.name)||text(character?.slug)||'Unbekannter Dalton',
    player:text(character?.player)||null,
    profession:text(profession?.name)||'Unbekannter Beruf',
    professionId:integer(profession?.id),
    skill:finiteNumber(profession?.current),
    skillCap:finiteNumber(profession?.max)
  };
}
function recipeKey(recipe,profession){
  const id=integer(recipe?.id);
  if(id)return 'recipe:'+id;
  return 'fallback:'+String(integer(profession?.id)||text(profession?.name)||'unknown')+':'+normalizeSearch(recipe?.name)+':'+String(integer(recipe?.craftedItem?.id)||normalizeSearch(recipe?.craftedItem?.name));
}
function ensureItem(items,id,name){
  const numeric=integer(id);
  if(!numeric)return null;
  let item=items.get(numeric);
  if(!item){
    item={id:numeric,name:text(name)||('Item '+numeric),craftable:false,recipeKeys:new Set(),reagentFor:new Set()};
    items.set(numeric,item);
  }else if(!item.name&&name)item.name=text(name);
  return item;
}
export function buildWorkshopCatalog(data={}){
  const items=new Map(),recipes=new Map();
  for(const character of asArray(data?.characters)){
    for(const profession of asArray(character?.professions)){
      for(const recipe of asArray(profession?.knownRecipes)){
        const craftedId=integer(recipe?.craftedItem?.id);
        const craftedName=text(recipe?.craftedItem?.name);
        if(!craftedId||!craftedName)continue;
        const key=recipeKey(recipe,profession);
        let record=recipes.get(key);
        if(!record){
          record={
            key,
            id:integer(recipe?.id),
            name:text(recipe?.name)||craftedName,
            profession:text(profession?.name)||'Unbekannter Beruf',
            professionId:integer(profession?.id),
            craftedItem:{id:craftedId,name:craftedName},
            craftedQuantity:recipeYield(recipe?.craftedQuantity),
            reagents:asArray(recipe?.reagents).map(reagent=>({
              id:integer(reagent?.id),
              name:text(reagent?.name),
              quantity:finiteNumber(reagent?.quantity)
            })).filter(reagent=>reagent.id&&reagent.name&&reagent.quantity!==null&&reagent.quantity>0),
            crafters:[],
            categoryPath:fallbackCategoryPath({professionName:text(profession?.name),itemName:craftedName,recipeName:text(recipe?.name)}),
            categorySource:'derived-fallback'
          };
          recipes.set(key,record);
        }
        const crafter=crafterRecord(character,profession);
        if(!record.crafters.some(existing=>existing.slug===crafter.slug))record.crafters.push(crafter);
        const output=ensureItem(items,craftedId,craftedName);
        output.craftable=true;output.recipeKeys.add(key);
        for(const reagent of record.reagents){
          const item=ensureItem(items,reagent.id,reagent.name);
          if(item)item.reagentFor.add(key);
        }
      }
    }
  }
  const recipeList=[...recipes.values()].map(recipe=>({
    ...recipe,
    crafters:[...recipe.crafters].sort((a,b)=>a.name.localeCompare(b.name,'de'))
  })).sort((a,b)=>a.craftedItem.name.localeCompare(b.craftedItem.name,'de')||String(a.id??'').localeCompare(String(b.id??'')));
  const recipeByKey=new Map(recipeList.map(recipe=>[recipe.key,recipe]));
  const itemList=[...items.values()].map(item=>{
    const itemRecipes=[...item.recipeKeys].map(key=>recipeByKey.get(key)).filter(Boolean);
    const crafters=itemRecipes.flatMap(recipe=>recipe.crafters);
    const uniqueCrafters=[];
    for(const crafter of crafters)if(!uniqueCrafters.some(existing=>existing.slug===crafter.slug&&existing.profession===crafter.profession))uniqueCrafters.push(crafter);
    return {
      id:item.id,
      name:item.name,
      craftable:item.craftable,
      recipeKeys:[...item.recipeKeys],
      reagentFor:[...item.reagentFor],
      crafters:uniqueCrafters.sort((a,b)=>a.name.localeCompare(b.name,'de')),
      categoryPath:itemRecipes[0]?.categoryPath||['Materialien & Komponenten','Rohmaterialien'],
      categorySource:itemRecipes[0]?.categorySource||'derived-fallback'
    };
  }).sort((a,b)=>a.name.localeCompare(b.name,'de'));
  const byItemId=new Map(itemList.map(item=>[item.id,item]));
  const byRecipeKey=new Map(recipeList.map(recipe=>[recipe.key,recipe]));
  return {
    generatedAt:data?.generatedAt||null,
    items:itemList,
    recipes:recipeList,
    byItemId,
    byRecipeKey
  };
}
export function workshopProfessionSlugs(data={}){
  const slugs=new Set();
  for(const character of asArray(data?.characters)){
    for(const profession of asArray(character?.professions)){
      const slug=professionSlugFromRecord(profession);
      if(slug)slugs.add(slug);
    }
  }
  return [...slugs].sort((a,b)=>a.localeCompare(b,'en'));
}

export function publicWorkshopCatalog(catalog){
  return {
    generatedAt:catalog?.generatedAt||null,
    items:asArray(catalog?.items),
    recipes:asArray(catalog?.recipes)
  };
}
export function searchWorkshopItems(catalog,query,{limit=10,craftableOnly=false}={}){
  const needle=normalizeSearch(query);
  if(!needle)return [];
  const candidates=asArray(catalog?.items).filter(item=>!craftableOnly||item.craftable).map(item=>({
    item,
    normalized:normalizeSearch(item.name)
  })).filter(entry=>entry.normalized.includes(needle));
  candidates.sort((a,b)=>{
    const ap=a.normalized.startsWith(needle)?0:1,bp=b.normalized.startsWith(needle)?0:1;
    return ap-bp||a.item.name.localeCompare(b.item.name,'de');
  });
  return candidates.slice(0,Math.max(1,Math.min(50,Number(limit)||10))).map(({item})=>item);
}
export function workshopBrowseTree(catalog){
  const root={};
  for(const item of asArray(catalog?.items).filter(item=>item.craftable)){
    const path=asArray(item.categoryPath).filter(Boolean);
    let node=root;
    for(const segment of path){
      node[segment]??={_items:[]};
      node=node[segment];
    }
    node._items.push({id:item.id,name:item.name,crafters:item.crafters});
  }
  function sortNode(node){
    const sorted={};
    for(const key of Object.keys(node).filter(key=>key!=='_items').sort((a,b)=>a.localeCompare(b,'de')))sorted[key]=sortNode(node[key]);
    sorted._items=asArray(node._items).sort((a,b)=>a.name.localeCompare(b.name,'de'));
    return sorted;
  }
  return sortNode(root);
}
function preferredRecipe(catalog,item){
  return asArray(item?.recipeKeys).map(key=>catalog?.byRecipeKey?.get(key)).filter(Boolean)
    .sort((a,b)=>String(a.id??'').localeCompare(String(b.id??'')))[0]||null;
}
function planNode(catalog,itemId,quantity,path){
  const id=integer(itemId),requested=Math.max(1,Math.ceil(finiteNumber(quantity)||1));
  const item=catalog?.byItemId?.get(id);
  if(!item)return {item:{id,name:'Item '+id},quantity:requested,craftable:false,status:'unknown-item',materials:[]};
  if(path.has(id))return {item:{id:item.id,name:item.name},quantity:requested,craftable:item.craftable,status:'cycle-detected',materials:[]};
  const recipe=preferredRecipe(catalog,item);
  if(!recipe)return {item:{id:item.id,name:item.name},quantity:requested,craftable:false,status:'must-obtain',materials:[]};
  const yieldInfo=recipe.craftedQuantity||{min:1,max:1,variable:false};
  const crafts=Math.max(1,Math.ceil(requested/Math.max(1,yieldInfo.min||1)));
  const nextPath=new Set(path);nextPath.add(id);
  const materials=recipe.reagents.map(reagent=>{
    const required=reagent.quantity*crafts;
    const child=planNode(catalog,reagent.id,required,nextPath);
    return {...child,perCraft:reagent.quantity};
  });
  return {
    item:{id:item.id,name:item.name},
    quantity:requested,
    craftable:true,
    status:'craftable',
    recipe:{
      id:recipe.id,
      name:recipe.name,
      profession:recipe.profession,
      professionId:recipe.professionId,
      crafters:recipe.crafters,
      craftsRequired:crafts,
      yieldPerCraft:{min:yieldInfo.min,max:yieldInfo.max,variable:yieldInfo.variable},
      outputRange:{min:crafts*yieldInfo.min,max:crafts*yieldInfo.max}
    },
    materials
  };
}
function collectExternal(node,totals){
  if(!node)return;
  if(node.status==='must-obtain'||node.status==='unknown-item'){
    const id=node.item?.id;
    if(!id)return;
    const current=totals.get(id)||{id,name:node.item?.name||('Item '+id),quantity:0};
    current.quantity+=Number(node.quantity)||0;totals.set(id,current);return;
  }
  for(const material of asArray(node.materials))collectExternal(material,totals);
}
export function buildProductionPlan(catalog,itemId,quantity=1){
  const tree=planNode(catalog,itemId,quantity,new Set());
  const totals=new Map();collectExternal(tree,totals);
  return {
    requested:{itemId:integer(itemId),quantity:Math.max(1,Math.ceil(finiteNumber(quantity)||1))},
    tree,
    externalMaterials:[...totals.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'))
  };
}


function rootForForeverCategories(categories=[],fallbackRoot='Sonstiges'){
  const value=normalizeSearch(categories.join(' '));
  if(/camping|camp/.test(value))return 'Lager & Spezial';
  if(/armor kits|weapon oils|sharpen|weightstone|scope|enchant/.test(value))return 'Verbesserungen';
  if(/boots|bracers|chest|cloak|gloves|belt|pants|leggings|shoulder|helm|head|shield|sword|axe|mace|dagger|staff|wand|gun|bow|weapon|armor/.test(value))return 'Ausrüstung & Gegenstände';
  if(/bar|reagent|component|part|metal|stone|leather|cloth|thread|dye|acid/.test(value))return 'Materialien & Komponenten';
  if(/potion|elixir|flask|brew|food|meal|cuisine|bandage/.test(value))return 'Verbrauchsgüter';
  return fallbackRoot;
}
function cleanedForeverCategoryPath(recipe,fallbackPath=[]){
  const fallback=asArray(fallbackPath).filter(Boolean);
  const fallbackRoot=fallback[0]||'Sonstiges';
  const root=rootForForeverCategories(asArray(recipe?.categoryPath),fallbackRoot);
  const detail=fallback[1]||null;
  return detail?[root,detail]:[root];
}
function preferredForeverRecipe(recipes=[],localRecipeId=null){
  return [...recipes].sort((a,b)=>{
    const am=localRecipeId&&Number(a?.id)===Number(localRecipeId)?0:1;
    const bm=localRecipeId&&Number(b?.id)===Number(localRecipeId)?0:1;
    const as=a?.speculation===true?1:0,bs=b?.speculation===true?1:0;
    return am-bm||as-bs||(Number(a?.requiredSkill)||9999)-(Number(b?.requiredSkill)||9999)||(Number(a?.id)||0)-(Number(b?.id)||0);
  })[0]||null;
}
export function enrichWorkshopCatalogWithForeverDb(catalog,index){
  if(!catalog||!index?.byItem)return catalog;
  for(const item of asArray(catalog.items)){
    const remoteRecipes=index.byItem.get(Number(item.id))||[];
    if(!remoteRecipes.length)continue;
    const localRecipe=asArray(item.recipeKeys).map(key=>catalog.byRecipeKey.get(key)).find(Boolean);
    const remote=preferredForeverRecipe(remoteRecipes,localRecipe?.id);
    if(!remote)continue;
    item.categoryPath=cleanedForeverCategoryPath(remote,item.categoryPath);
    item.categorySource='foreverdb-client';
    item.foreverDbRecipeId=remote.id??null;
    item.requiredSkill=remote.requiredSkill??null;
    for(const key of asArray(item.recipeKeys)){
      const recipe=catalog.byRecipeKey.get(key);
      if(!recipe)continue;
      const match=preferredForeverRecipe(remoteRecipes,recipe.id);
      if(!match)continue;
      recipe.categoryPath=cleanedForeverCategoryPath(match,recipe.categoryPath);
      recipe.categorySource='foreverdb-client';
      recipe.requiredSkill=match.requiredSkill??null;
      recipe.learning=match.learning||null;
      recipe.foreverDbRecipeId=match.id??null;
    }
  }
  return catalog;
}
export function foreverRecipesForItem(index,itemId){
  return index?.byItem?.get(Number(itemId))||[];
}
export function preferredForeverRecipeForItem(index,itemId){
  return preferredForeverRecipe(foreverRecipesForItem(index,itemId));
}
export function workshopLearningCandidates(data,recipe){
  if(!recipe)return [];
  const required=finiteNumber(recipe.requiredSkill);
  const candidates=[];
  for(const character of asArray(data?.characters)){
    for(const profession of asArray(character?.professions)){
      const slug=professionSlugFromRecord(profession);
      if(!slug||slug!==recipe.professionSlug)continue;
      const skill=finiteNumber(profession?.current),cap=finiteNumber(profession?.max);
      const gap=required===null||skill===null?null:Math.max(0,Math.ceil(required-skill));
      candidates.push({
        slug:character?.slug||null,
        name:character?.name||character?.slug||'Dalton',
        player:character?.player||null,
        level:finiteNumber(character?.level),
        profession:profession?.name||null,
        professionSlug:slug,
        skill,
        skillCap:cap,
        requiredSkill:required,
        gap,
        status:required===null||skill===null?'profession-match':gap===0?'can-learn-now':'skill-gap'
      });
    }
  }
  return candidates.sort((a,b)=>{
    const order={'can-learn-now':0,'skill-gap':1,'profession-match':2};
    return (order[a.status]??9)-(order[b.status]??9)||(a.gap??9999)-(b.gap??9999)||a.name.localeCompare(b.name,'de');
  });
}
