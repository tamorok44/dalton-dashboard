import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]??process.cwd());
assert.ok(process.env.DALTON_PLAYWRIGHT_MODULE,'Set DALTON_PLAYWRIGHT_MODULE to the separately installed Playwright index.mjs');
const moduleFor=path=>import(pathToFileURL(resolve(root,path)).href);
const {chromium}=await import(pathToFileURL(resolve(process.env.DALTON_PLAYWRIGHT_MODULE)).href);
const {buildWorkshopCatalog,publicWorkshopCatalog}=await moduleFor('scripts/workshop-core.mjs');
const {buildLocationPlanner}=await moduleFor('scripts/location-planner.mjs');
const seed=JSON.parse(await readFile(resolve(root,'data/characters.json'),'utf8')).characters;
let count=4,revision=1;
const data=()=>({generatedAt:new Date(1795719600000+revision*60000).toISOString(),
  characters:Array.from({length:count},(_,i)=>{
    const c=structuredClone(seed[i%seed.length]);
    const {class:characterClass,race,gender,stats,talents,professions,equipment,equipmentLanguage,
      equipmentSource,professionsVerified,equipmentVerified}=c;
    return {class:characterClass,race,gender,stats,talents,professions,equipment,equipmentLanguage,
      equipmentSource,professionsVerified,equipmentVerified,
      slug:'audit-'+i,name:'Prüfcharakter '+i,player:'Testspieler',classId:[11,8,3,11][i%4],
      url:'https://foreverspec.com/de/armory/eu/audit-'+i+'/',level:10+i,statsVerified:true,
      blizzardCharacterId:5000+i,talentsVerified:false,imageUrl:null,avatarUrl:null}
  })});
const paths={};
const kinds={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1'),p=u.pathname;
  paths[p]=(paths[p]??0)+1;
  const send=(value,code=200)=>res.writeHead(code,{'content-type':'application/json','cache-control':'private,no-store'}).end(JSON.stringify(value));
  if(p==='/api/characters'&&!u.searchParams.has('view'))return send({data:data(),dataVersion:{version:'fixture-'+revision}});
  if(p==='/api/characters'&&u.searchParams.get('view')==='talent-planner')return send({ok:true,profiles:[],specializations:[],specializationAdvice:[]});
  if(p==='/api/characters')return send({classes:{},stale:true});
  if(p==='/api/data-version')return send({version:'fixture-'+revision});
  if(p==='/api/refresh'){revision++;return send({data:data(),dataVersion:{version:'fixture-'+revision},success:count})}
  if(p==='/api/workshop')return send({...publicWorkshopCatalog(buildWorkshopCatalog(data())),recipeCatalog:{connected:false}});
  if(p==='/api/location-planner')return send(buildLocationPlanner(data(),{recipes:[],professions:[]},{
    ...(u.searchParams.has('character')?{characterSlug:u.searchParams.get('character'),knownLocations:[{name:'Testregion'}]}:{}),
    location:u.searchParams.get('location')??null}));
  if(p.startsWith('/api/'))return send({error:'fixture'},503);
  if(p==='/data/characters.json')return send(data());
  const asset=p==='/'?'/index.html':p;
  if(!/^\/[a-zA-Z0-9-]+\.(?:html|css|js|svg|png|webmanifest)$/.test(asset))return res.writeHead(404).end();
  const file=resolve(root,'.'+asset);
  if(!file.startsWith(root+sep))return res.writeHead(404).end();
  try{
    await stat(file);
    res.writeHead(200,{'content-type':kinds[extname(file)]??'application/octet-stream'}).end(await readFile(file));
  }catch{res.writeHead(404).end()}
});
await new Promise((ok,bad)=>{server.on('error',bad);server.listen(0,'127.0.0.1',ok)});
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.DALTON_AUDIT_CHROMIUM||'/usr/bin/chromium',headless:true});
const rows=[];
try{
  for(const size of [4,16]){
    count=size;
    const ctx=await browser.newContext({viewport:{width:520,height:850},serviceWorkers:'block'});
    const page=await ctx.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
    const cdp=await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.goto(origin);
    await page.waitForFunction(n=>document.querySelectorAll('#cards article').length===n,size);
    const state=await page.evaluate(()=>({
      characters:document.querySelectorAll('#cards article').length,
      documentNodes:document.querySelectorAll('*').length,
      cardNodes:document.querySelectorAll('#cards *').length,
      loadedToRenderMs:Math.round(performance.now()),
      reflowW:document.documentElement.scrollWidth,viewportW:innerWidth,
      versionRequests:performance.getEntriesByType('resource').filter(f=>f.name.includes('/api/data-version')).length
    }));
    await cdp.send('HeapProfiler.collectGarbage');
    state.jsHeapBytes=(await cdp.send('Runtime.getHeapUsage')).usedSize;
    const sections=[];
    for(const [link,target] of [['compare','#compareView'],['workshop','#workshopView'],['planner','#plannerView'],['talentPlanner','#talentPlannerView'],['characters','#charactersView']]){
      await page.locator('[data-view-link="'+link+'"]').click();
      await page.locator(target).waitFor({state:'visible'});
      if(link==='compare'){
        await page.locator('[data-compare-character]').nth(0).check();
        await page.locator('[data-compare-character]').nth(1).check();
        await page.locator('.compare-table').waitFor();
      }
      if(link==='workshop')await page.locator('#workshopSearch').waitFor();
      if(link==='talentPlanner')await page.locator('#talentPlannerCharacter').waitFor();
      const measures=[];
      for(const width of [320,390,520,740,1440]){
        await page.setViewportSize({width,height:850});
        measures.push(await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth})));
      }
      sections.push({link,measures});
    }
    await page.locator('[data-view-link="talentPlanner"]').click();
    await page.locator('#refreshButton').click();
    await page.waitForFunction(()=>!document.querySelector('#refreshButton').disabled);
    const afterRefresh=await page.locator('[data-view-link="talentPlanner"]').isVisible();
    assert.equal(afterRefresh,true);
    rows.push({size,state,sections,errors,afterRefresh});
    await ctx.close();
  }
  const assets=[];
  for(const file of ['app.js','styles.css','talent-planner.js','sw.js']){
    const b=await readFile(resolve(root,file));assets.push({file,raw:b.length,gzip:gzipSync(b).length});
  }
  console.log(JSON.stringify({caseType:'Benign local fixture, CPU 4x Chromium',rows,paths,assets},null,2));
}finally{await browser.close();server.close()}
