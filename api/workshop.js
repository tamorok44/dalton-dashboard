import {loadCharacters} from '../scripts/character-store.mjs';
import {
  buildWorkshopCatalog,
  publicWorkshopCatalog,
  searchWorkshopItems,
  workshopBrowseTree,
  workshopBrowseTreeForItems,
  workshopItemsFromRecipeIndex,
  buildProductionPlan,
  workshopProfessionSlugs,
  enrichWorkshopCatalogWithForeverDb,
  preferredForeverRecipeForItem,
  workshopLearningCandidates
} from '../scripts/workshop-core.mjs';
import {
  foreverDbConfigured,
  fetchForeverDbItem
} from '../scripts/foreverdb-api.mjs';
import {getForeverDbMasterRecipeIndex,cachedForeverDbRecipeSearch,cachedForeverDbItemSearch,cachedForeverDbSpell} from '../scripts/workshop-store.mjs';
import {resolveMediaAsset} from '../scripts/media-resolver.mjs';

function normalize(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE').trim();
}
function queryUrl(req){
  return new URL(req.url||'/api/workshop','https://dalton-dashboard-eight.vercel.app');
}
function publicItem(item){
  if(!item)return null;
  return {
    id:item.id,
    name:item.name,
    craftable:item.craftable===true,
    crafters:Array.isArray(item.crafters)?item.crafters:[],
    categoryPath:Array.isArray(item.categoryPath)?item.categoryPath:[],
    categorySource:item.categorySource||null
  };
}
function mergeRemoteItem(remote,local){
  return {
    id:remote.id,
    name:remote.name,
    sourceSearchName:remote.englishName||remote.name||null,
    sourceIconUrl:remote.icon||null,
    requiredLevel:remote.requiredLevel??null,
    craftable:local?.craftable===true,
    crafters:local?.crafters||[],
    categoryPath:local?.categoryPath||[],
    categorySource:local?.categorySource||null
  };
}
function publicDetailedItem(item){
  if(!item)return null;
  return {
    id:item.id,
    name:item.name,
    requiredLevel:item.requiredLevel??null,
    craftable:item.craftable===true,
    crafters:Array.isArray(item.crafters)?item.crafters:[],
    categoryPath:Array.isArray(item.categoryPath)?item.categoryPath:[],
    categorySource:item.categorySource||null,
    ...(item.iconUrl?{iconUrl:item.iconUrl}:{})
  };
}
function publicLearningRecipe(recipe){
  if(!recipe)return null;
  return {
    id:recipe.id??null,
    name:recipe.name||null,
    requiredSkill:recipe.requiredSkill??null,
    requiredCharacterLevel:recipe.requiredCharacterLevel??null,
    learningRequirementsVerified:recipe.learningRequirementsVerified===true,
    learning:{automatic:recipe.learning?.automatic===true}
  };
}
function publicLearningCandidate(candidate){
  return {
    slug:candidate?.slug||null,
    name:candidate?.name||null,
    player:candidate?.player||null,
    level:candidate?.level??null,
    profession:candidate?.profession||null,
    skill:candidate?.skill??null,
    skillCap:candidate?.skillCap??null,
    requiredSkill:candidate?.requiredSkill??null,
    requiredCharacterLevel:candidate?.requiredCharacterLevel??null,
    learningRequirementsVerified:candidate?.learningRequirementsVerified===true,
    gap:candidate?.gap??null,
    levelGap:candidate?.levelGap??null,
    status:candidate?.status||null
  };
}
function publicLearningSource(source){
  if(!source)return null;
  return {
    type:source.type||'source',
    side:source.side||null,
    id:source.id??null,
    name:source.name||null,
    location:source.location?{
      zone:source.location.zone||null,
      x:source.location.x??null,
      y:source.location.y??null,
      uiMapId:source.location.uiMapId??null,
      instance:source.location.instance||null
    }:null,
    evidence:source.evidence||'unknown',
    priceCopper:source.priceCopper??null,
    pricePerItem:source.pricePerItem??null,
    stack:source.stack??null,
    limitedStock:source.limitedStock??null,
    costs:Array.isArray(source.costs)?source.costs.map(cost=>({name:cost?.name||null,quantity:cost?.quantity??null})):[],
    reputationFaction:source.reputationFaction||null,
    dropChance:source.dropChance??null,
    observations:source.observations??null
  };
}
async function archiveWorkshopItemIcon(item){
  if(!item?.id||!item?.sourceIconUrl)return item;
  try{
    const iconUrl=await resolveMediaAsset({
      entityType:'item',
      entityId:item.id,
      role:'icon',
      sourceUrl:item.sourceIconUrl
    });
    return {...item,iconUrl:iconUrl||null};
  }catch(error){
    console.warn('Werkstatt-Icon konnte nicht archiviert werden:',String(error.message).slice(0,120));
    return item;
  }
}
function sortSuggestions(list,query){
  const needle=normalize(query);
  return [...list].sort((a,b)=>{
    const an=normalize(a.name),bn=normalize(b.name);
    const ap=an.startsWith(needle)?0:1,bp=bn.startsWith(needle)?0:1;
    return ap-bp||a.name.localeCompare(b.name,'de')||a.id-b.id;
  });
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, no-store');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'Methode nicht erlaubt'});
  }
  try{
    const stored=await loadCharacters();
    const catalog=buildWorkshopCatalog(stored.data);
    const url=queryUrl(req);
    const q=(url.searchParams.get('q')||'').trim();
    const itemId=Number(url.searchParams.get('item'));
    const quantity=Math.max(1,Math.min(9999,Math.ceil(Number(url.searchParams.get('quantity'))||1)));
    const remoteReady=foreverDbConfigured();
    const daltonProfessionSlugs=workshopProfessionSlugs(stored.data);

    if(q){
      const scope=url.searchParams.get('scope')==='craftable'?'craftable':'all';
      let suggestions=[];
      let source='blizzard-known';
      let remoteError=null;
      if(scope==='craftable'){
        suggestions=searchWorkshopItems(catalog,q,{limit:50,craftableOnly:true}).map(publicItem);
      }else if(remoteReady){
        try{
          const remote=await cachedForeverDbItemSearch(q,{limit:100});
          suggestions=remote.items.map(item=>publicItem(mergeRemoteItem(item,catalog.byItemId.get(item.id))));
          source='foreverdb';
        }catch(error){
          remoteError=String(error.message).slice(0,180);
        }
      }
      if(!suggestions.length&&scope==='all'){
        suggestions=searchWorkshopItems(catalog,q,{limit:50}).map(publicItem);
      }
      return res.status(200).json({
        query:q,
        scope,
        suggestions:sortSuggestions(suggestions,q).slice(0,10),
        source,
        fullCatalog:scope==='all'&&source==='foreverdb',
        foreverDbConfigured:remoteReady,
        remoteError
      });
    }

    if(Number.isInteger(itemId)&&itemId>0){
      const local=catalog.byItemId.get(itemId)||null;
      let item=publicItem(local);
      let source='blizzard-known';
      const remoteErrors=[];
      let recipeIndex=null,remoteRecipe=null,targetedRecipeSearch=null;
      if(remoteReady){
        try{
          const [remote,index]=await Promise.all([
            fetchForeverDbItem(itemId),
            getForeverDbMasterRecipeIndex({seedProfessionSlugs:daltonProfessionSlugs})
          ]);
          recipeIndex=index;
          enrichWorkshopCatalogWithForeverDb(catalog,index);
          item=await archiveWorkshopItemIcon(mergeRemoteItem(remote.item,catalog.byItemId.get(itemId)||local));
          source='foreverdb';
          remoteRecipe=preferredForeverRecipeForItem(index,itemId);
        }catch(error){
          remoteErrors.push(String(error.message).slice(0,180));
        }
        if(!local?.craftable&&!remoteRecipe&&item?.name){
          try{
            targetedRecipeSearch=await cachedForeverDbRecipeSearch(itemId,item.sourceSearchName||item.name);
            if(targetedRecipeSearch.recipes?.length){
              const targetedIndex={byItem:new Map([[itemId,targetedRecipeSearch.recipes]])};
              remoteRecipe=preferredForeverRecipeForItem(targetedIndex,itemId);
            }
          }catch(error){
            remoteErrors.push(String(error.message).slice(0,180));
          }
        }
      }
      if(!item)return res.status(404).json({error:'Gegenstand nicht gefunden'});
      const plan=buildProductionPlan(catalog,itemId,quantity);
      let learningRecipe=remoteRecipe;
      if(remoteRecipe?.id){
        try{
          const spell=await cachedForeverDbSpell(remoteRecipe.id,{build:recipeIndex?.build||null});
          learningRecipe=spell?.id?{
            ...remoteRecipe,
            requiredCharacterLevel:Number.isFinite(Number(spell.requiredLevel))?Number(spell.requiredLevel):null,
            learningRequirementsVerified:Number.isFinite(Number(spell.requiredLevel))
          }:{...remoteRecipe,learningRequirementsVerified:false};
        }catch(error){
          remoteErrors.push('Lernvoraussetzungen: '+String(error.message).slice(0,140));
          learningRecipe={...remoteRecipe,learningRequirementsVerified:false};
        }
      }else if(remoteRecipe){
        learningRecipe={...remoteRecipe,learningRequirementsVerified:false};
      }
      const learningCandidates=learningRecipe?workshopLearningCandidates(stored.data,learningRecipe):[];
      const learningSources=learningRecipe?.learning?.sources||[];
      const publicCandidates=learningCandidates.map(publicLearningCandidate);
      const publicSources=learningSources.map(publicLearningSource).filter(Boolean);
      const currentlyCraftable=Boolean(local?.craftable);
      return res.status(200).json({
        item:publicDetailedItem(item),
        quantity,
        plan,
        source,
        fullCatalog:source==='foreverdb',
        foreverDbConfigured:remoteReady,
        remoteError:remoteErrors.length?remoteErrors.join(' · '):null,
        craftableInGame:currentlyCraftable||Boolean(remoteRecipe),
        recipe:publicLearningRecipe(learningRecipe),
        learningCandidates:currentlyCraftable?[]:publicCandidates,
        learningSources:currentlyCraftable?[]:publicSources,
        learningSourcesAvailable:!currentlyCraftable&&Boolean(remoteRecipe)&&(remoteRecipe.learning?.automatic===true||learningSources.length>0),
        learningSourcesReason:currentlyCraftable
          ?null
          :!remoteReady
            ?'ForeverDB API-Key ist noch nicht konfiguriert.'
            :!remoteRecipe
              ?'ForeverDB kennt für diesen Gegenstand derzeit kein Herstellungsrezept.'
              :remoteRecipe.learning?.automatic===true
                ?'Das Rezept wird automatisch gelernt.'
                :learningSources.length
                  ?null
                  :'ForeverDB kennt für dieses Rezept derzeit keine konkrete Bezugsquelle.',
        recipeCatalog:{
          connected:Boolean(recipeIndex),
          build:recipeIndex?.build||null,
          generatedAt:recipeIndex?.generatedAt||null,
          cached:recipeIndex?.cached===true,
          complete:recipeIndex?.complete===true,
          requestCount:recipeIndex?.requestCount||0,
          targetedSearchRequests:targetedRecipeSearch?.requestCount||0,
          targetedSearchCached:targetedRecipeSearch?.cached===true
        }
      });
    }

    let recipeIndex=null,remoteError=null;
    if(remoteReady){
      try{
        recipeIndex=await getForeverDbMasterRecipeIndex({seedProfessionSlugs:daltonProfessionSlugs});
        enrichWorkshopCatalogWithForeverDb(catalog,recipeIndex);
      }catch(error){
        remoteError=String(error.message).slice(0,180);
      }
    }
    const publicCatalog=publicWorkshopCatalog(catalog);
    const masterItems=recipeIndex?workshopItemsFromRecipeIndex(catalog,recipeIndex):[];
    const fullMaster=recipeIndex?.masterComplete===true&&recipeIndex?.complete===true;
    return res.status(200).json({
      generatedAt:publicCatalog.generatedAt,
      craftableCount:publicCatalog.items.filter(item=>item.craftable).length,
      knownItemCount:publicCatalog.items.length,
      recipeItemCount:masterItems.length,
      browseCraftable:workshopBrowseTree(catalog),
      browseAll:workshopBrowseTreeForItems(masterItems),
      craftableItems:publicCatalog.items.filter(item=>item.craftable).map(publicItem),
      foreverDbConfigured:remoteReady,
      fullCatalog:fullMaster,
      remoteError,
      recipeCatalog:{
        connected:Boolean(recipeIndex),
        build:recipeIndex?.build||null,
        generatedAt:recipeIndex?.generatedAt||null,
        cached:recipeIndex?.cached===true,
        complete:fullMaster,
        refreshing:recipeIndex?.refreshing===true,
        refreshProgress:recipeIndex?.refreshProgress||null,
        recipeCount:recipeIndex?.recipes?.length||0,
        recipeItemCount:masterItems.length,
        professionCount:Array.isArray(recipeIndex?.professionSlugs)?recipeIndex.professionSlugs.length:0,
        requestCount:recipeIndex?.requestCount||0
      },
      sources:{
        knownRecipes:'Blizzard Forever API',
        fullRecipeCatalog:recipeIndex?'ForeverDB.net':null,
        fullItemSearch:remoteReady?'ForeverDB.net':null
      }
    });
  }catch(error){
    console.error('Werkstatt konnte nicht geladen werden:',error);
    return res.status(503).json({error:'Werkstatt derzeit nicht verfügbar'});
  }
}
