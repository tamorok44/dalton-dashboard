import {loadCharacters} from '../scripts/character-store.mjs';
import {
  buildWorkshopCatalog,
  publicWorkshopCatalog,
  searchWorkshopItems,
  workshopBrowseTree,
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
import {getForeverDbRecipeIndex,cachedForeverDbRecipeSearch,cachedForeverDbItemSearch} from '../scripts/workshop-store.mjs';

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
    englishName:remote.englishName||null,
    quality:remote.quality??null,
    itemClass:remote.itemClass??null,
    subclass:remote.subclass??null,
    inventoryType:remote.inventoryType??null,
    requiredLevel:remote.requiredLevel??null,
    icon:remote.icon??null,
    craftable:local?.craftable===true,
    crafters:local?.crafters||[],
    categoryPath:local?.categoryPath||[],
    categorySource:local?.categorySource||null
  };
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
      let suggestions=[];
      let source='blizzard-known';
      let remoteError=null;
      if(remoteReady){
        try{
          const remote=await cachedForeverDbItemSearch(q,{limit:100});
          suggestions=remote.items.map(item=>mergeRemoteItem(item,catalog.byItemId.get(item.id)));
          source='foreverdb';
        }catch(error){
          remoteError=String(error.message).slice(0,180);
        }
      }
      if(!suggestions.length){
        suggestions=searchWorkshopItems(catalog,q,{limit:50}).map(publicItem);
      }
      return res.status(200).json({
        query:q,
        suggestions:sortSuggestions(suggestions,q).slice(0,10),
        source,
        fullCatalog:source==='foreverdb',
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
            getForeverDbRecipeIndex({professionSlugs:daltonProfessionSlugs})
          ]);
          recipeIndex=index;
          enrichWorkshopCatalogWithForeverDb(catalog,index);
          item=mergeRemoteItem(remote.item,catalog.byItemId.get(itemId)||local);
          source='foreverdb';
          remoteRecipe=preferredForeverRecipeForItem(index,itemId);
        }catch(error){
          remoteErrors.push(String(error.message).slice(0,180));
        }
        if(!local?.craftable&&!remoteRecipe&&item?.name){
          try{
            targetedRecipeSearch=await cachedForeverDbRecipeSearch(itemId,item.englishName||item.name);
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
      const learningCandidates=remoteRecipe?workshopLearningCandidates(stored.data,remoteRecipe):[];
      const learningSources=remoteRecipe?.learning?.sources||[];
      const currentlyCraftable=Boolean(local?.craftable);
      return res.status(200).json({
        item,
        quantity,
        plan,
        source,
        fullCatalog:source==='foreverdb',
        foreverDbConfigured:remoteReady,
        remoteError:remoteErrors.length?remoteErrors.join(' · '):null,
        craftableInGame:currentlyCraftable||Boolean(remoteRecipe),
        recipe:remoteRecipe,
        learningCandidates:currentlyCraftable?[]:learningCandidates,
        learningSources:currentlyCraftable?[]:learningSources,
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
          professionSlugs:recipeIndex?.professionSlugs||[],
          requestCount:recipeIndex?.requestCount||0,
          targetedSearchRequests:targetedRecipeSearch?.requestCount||0,
          targetedSearchCached:targetedRecipeSearch?.cached===true
        }
      });
    }

    let recipeIndex=null,remoteError=null;
    if(remoteReady){
      try{
        recipeIndex=await getForeverDbRecipeIndex({professionSlugs:daltonProfessionSlugs});
        enrichWorkshopCatalogWithForeverDb(catalog,recipeIndex);
      }catch(error){
        remoteError=String(error.message).slice(0,180);
      }
    }
    const publicCatalog=publicWorkshopCatalog(catalog);
    return res.status(200).json({
      generatedAt:publicCatalog.generatedAt,
      craftableCount:publicCatalog.items.filter(item=>item.craftable).length,
      knownItemCount:publicCatalog.items.length,
      browse:workshopBrowseTree(catalog),
      craftableItems:publicCatalog.items.filter(item=>item.craftable).map(publicItem),
      foreverDbConfigured:remoteReady,
      fullCatalog:remoteReady,
      remoteError,
      recipeCatalog:{
        connected:Boolean(recipeIndex),
        build:recipeIndex?.build||null,
        generatedAt:recipeIndex?.generatedAt||null,
        cached:recipeIndex?.cached===true,
        complete:recipeIndex?.complete===true,
        recipeCount:recipeIndex?.recipes?.length||0,
        professionSlugs:recipeIndex?.professionSlugs||[],
        requestCount:recipeIndex?.requestCount||0
      },
      sources:{
        knownRecipes:'Blizzard Forever API',
        categories:recipeIndex?'ForeverDB.net':null,
        fullCatalog:remoteReady?'ForeverDB.net':null
      }
    });
  }catch(error){
    console.error('Werkstatt konnte nicht geladen werden:',error);
    return res.status(503).json({error:'Werkstatt derzeit nicht verfügbar'});
  }
}
