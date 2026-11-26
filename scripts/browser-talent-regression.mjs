import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync,statSync,createReadStream} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createTalentPlannerHandler} from './talent-planner-api.mjs';
import {correctTalentDisplay} from './talent-display-corrections.mjs';
import coverage from '../data/talent-planning/coverage-2026-11-25.json' with {type:'json'};
import release from '../data/talent-planning/release-catalog.json' with {type:'json'};
import proofs from '../data/talent-planning/catalog-proofs-2026-11-25.json' with {type:'json'};

const root=fileURLToPath(new URL('../',import.meta.url)),reportDir=resolve(process.env.DALTON_BROWSER_REPORT||'browser-report');
mkdirSync(reportDir,{recursive:true});
const tool=process.env.DALTON_PLAYWRIGHT_MODULE;
assert.ok(tool,'Provide the separately installed pinned Playwright module');
const pw=await import(pathToFileURL(resolve(tool)).href);
const engine=process.env.DALTON_BROWSER||'chromium';
assert.ok(['chromium','firefox','webkit'].includes(engine));
const rules=release.rulePacks.find(p=>p.revision==='mage-arcane-dungeons-rank0-71139');
const proof=proofs.catalogs.find(p=>p.proof.classId===8&&p.sourceRevision===rules.sourceRevision).proof;
const names={1:'Krieger',2:'Paladin',3:'Jäger',4:'Schurke',5:'Priester',7:'Schamane',8:'Magier',9:'Hexenmeister',11:'Druide'};
const roster=Object.keys(coverage.classes).map(id=>({slug:'qa-class-'+id,name:'QA '+names[id],player:'Browser-Test',class:names[id],classId:Number(id),level:15,race:'Testvolk',faction:'Allianz',gameStringsVerified:true,
  url:'https://foreverspec.com/de/armory/eu/qa-class-'+id+'/',blizzardCharacterId:700+Number(id),scrapedAt:new Date().toISOString(),scrapeOk:true,stats:{},statsDetails:[],statsByEnum:{},equipment:[],professions:[],talentDetailsVerified:false}));
const now=Date.now(),checkedAt=new Date(now).toISOString();
const observation={status:'observed',checkedAt,checkedAtMs:now,revisionSince:checkedAt,clientBuild:rules.clientBuild,hotfixRevision:rules.hotfixRevision};
const currentProofs=proofs.catalogs.filter(c=>c.sourceRevision===rules.sourceRevision);
const master={classes:Object.fromEntries(currentProofs.map(c=>[c.proof.classId,c.proof])),classMechanicsRevisions:Object.fromEntries(currentProofs.map(c=>[c.proof.classId,c.catalogRevision])),stale:false,checkedAt,sourceRevision:rules.sourceRevision,sourceFreshAt:{raw:checkedAt,localized:checkedAt}};
let providerReads=0;
const handler=createTalentPlannerHandler({enabled:()=>true,roster:async()=>({data:{characters:roster}}),observe:async()=>{providerReads++;return observation},master:async()=>master,clock:()=>now,
 project:async p=>({...p,trees:p.trees.map(t=>{
   const rowColumns=new Map();
   return {...t,name:coverage.classes[p.classId].find(s=>s.treeId===t.id).treeName,talents:[...t.talents].sort((a,b)=>a.row-b.row||a.id-b.id).map(n=>{
     const col=rowColumns.get(n.row)||0;rowColumns.set(n.row,col+1);
     // Synthetic coordinates and labels for rendering tests; not a client attestation.
     return {...n,column:col,profileId:n.id,name:'Testtalent '+n.id,descriptions:Array(n.maxRank).fill('Deutscher Testtext für diesen Talentrang.'),descriptionSources:Array(n.maxRank).fill('Testdaten'),iconUrl:null};
   })};
 })})});
const fixtureClass=p=>({...p,trees:p.trees.map(t=>{const columns=new Map();return {...t,name:coverage.classes[p.classId].find(s=>s.treeId===t.id).treeName,talents:[...t.talents].sort((a,b)=>a.row-b.row||a.id-b.id).map(n=>{const column=columns.get(n.row)||0;columns.set(n.row,column+1);return {...n,column,profileId:n.id,name:'Testtalent '+n.id,descriptions:Array(n.maxRank).fill('Deutscher Testtext'),descriptionSources:Array(n.maxRank).fill('Testdaten'),iconUrl:null}})}})});
const displayMaster={...master,classes:Object.fromEntries(currentProofs.map(c=>[c.proof.classId,fixtureClass(c.proof)]))};
const displayCatalog={classes:Object.fromEntries(Object.entries(displayMaster.classes).map(([id,c])=>[id,correctTalentDisplay(c,displayMaster)])),stale:false,missingClassIds:[],fallbackClassIds:[]};
for(const c of roster.filter(c=>[2,3,11].includes(c.classId))){c.talentDetailsVerified=true;c.talentDetails=displayMaster.classes[c.classId].trees.map(t=>({name:t.name,spentPoints:0,talents:[]}));}
let plannerRequests=0,discoveryBytes=0,pathBytes=0,unexpected=[],displayRequests=0;
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://127.0.0.1');
 const send=(status,body)=>{const json=JSON.stringify(body);res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(json);return Buffer.byteLength(json)};
 if(url.pathname==='/api/characters'&&url.searchParams.get('view')==='talent-planner'){
   plannerRequests++;
   const query=Object.fromEntries(url.searchParams);
   if(query.character==='qa-class-1'&&!query.tree)await new Promise(r=>setTimeout(r,120));
   let code=200;
   await handler({method:'GET',query},{setHeader(){},status(v){code=v;return this},json(body){const bytes=send(code,body);if(query.tree)pathBytes=Math.max(pathBytes,bytes);else discoveryBytes=Math.max(discoveryBytes,bytes)}});
   return;
 }
 if(url.pathname==='/api/characters'&&url.searchParams.get('view')==='talents'){displayRequests++;return send(200,displayCatalog)}
 if(url.pathname==='/api/characters')return send(200,{data:{generatedAt:checkedAt,characters:roster},dataVersion:{version:'qa-browser-v1'},talentPlannerPreview:true});
 if(url.pathname==='/api/data-version')return send(200,{version:'qa-browser-v1'});
 if(url.pathname.startsWith('/api/')){unexpected.push(url.pathname);return send(404,{ok:false})}
 const pathname=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
 const file=resolve(root,'.'+pathname);
 if(!file.startsWith(root.endsWith(sep)?root:root+sep)||!statSync(file).isFile())throw Error('Not found');
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});createReadStream(file).pipe(res);
 }catch{if(!res.headersSent)res.writeHead(404);res.end('Not found')}
});
await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)});
const origin='http://127.0.0.1:'+server.address().port;
const browser=await pw[engine].launch({headless:true});
const cases=[{name:'desktop',options:{viewport:{width:1440,height:900}}},{name:'compact',options:{viewport:{width:320,height:720}}}];
if(engine==='chromium')cases.push({name:'android',options:{...pw.devices['Pixel 7']}});
if(engine==='webkit')cases.push({name:'iphone',options:{...pw.devices['iPhone 13']}});
const scriptBytes=readFileSync(resolve(root,'talent-planner.js'));
const report={engine,platform:process.platform,fixture:'synthetic roster and graph labels/coordinates, real approved plan engine; no live services',rawScriptBytes:scriptBytes.length,gzipScriptBytes:gzipSync(scriptBytes).length,cases:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function p95(values){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]}
try{
 assert.ok(report.rawScriptBytes<=40000&&report.gzipScriptBytes<=12000,'Talent planner JS size budget exceeded');
 for(const item of cases){
  const context=await browser.newContext({...item.options,serviceWorkers:'block',locale:'de-DE',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],outside=[];
  let cdp=null;
  const baselineRequests=plannerRequests;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();outside.push(url);return route.abort()});
  const result={name:item.name,status:'failed'};
  try{
   await page.goto(origin+'/#talentplaner');
   const character=page.locator('#talentPlannerCharacter');
   await character.waitFor({state:'visible'});
   assert.equal(await character.locator('option').count(),10);
   const choose=async id=>{await character.selectOption('qa-class-'+id);await page.locator('#talentGuide-goal').waitFor({state:'visible'})};
   const goal=page.locator('#talentGuide-goal'),role=page.locator('#talentGuide-role'),spec=page.locator('#talentPlannerProfile'),rank=page.locator('#talentPlannerLegacy');
   // All classes, including currently unavailable classes, permit meaningful navigation.
   for(const id of Object.keys(coverage.classes)){
     await choose(id);await goal.selectOption('pvp');
     const roles=[...new Set(coverage.classes[id].flatMap(t=>t.roles))];
     if(roles.length>1){await role.waitFor({state:'visible'});await role.selectOption(roles.includes('tank')?'tank':roles[0])}
     else assert.equal(await role.count(),0);
     await spec.waitFor({state:'visible'});
     assert.equal(await page.locator('[data-plan-result]').count(),0);
     const defaultTree={1:'11670',7:'11363',8:'11582',9:'11637'}[Number(id)];
     const hasDefault=Boolean(defaultTree);
      assert.equal(await page.locator('button[type=submit].talent-planner-action').count(),hasDefault?1:0,'only a reviewed default may enable confirmation');
      if(hasDefault)assert.equal(await spec.inputValue(),defaultTree,'reviewed PvP default');
     assert.ok((await page.locator('.talent-guide-orientation').innerText()).includes([1,3,7,8,9].includes(Number(id))?'Plan fachlich freigegeben':'Plan noch in Prüfung'));
   }
   await choose(3);await goal.selectOption('pvp');
   assert.equal(await page.locator('button[type=submit].talent-planner-action').count(),0,'no reviewed comparative hunter PvP default');
   await spec.selectOption('11371');assert.equal(await page.locator('button[type=submit].talent-planner-action').count(),1);
   await spec.selectOption('11370');assert.equal(await page.locator('button[type=submit].talent-planner-action').count(),1);
   await spec.selectOption('11372');assert.equal(await page.locator('button[type=submit].talent-planner-action').count(),0);
   await choose(2);await goal.selectOption('dungeons');await role.selectOption('tank');assert.equal(await spec.inputValue(),'11541');
   await choose(8);await goal.selectOption('pvp');
   assert.equal(await spec.inputValue(),'11582','reviewed group PvP default among released Mage plans');
   await spec.selectOption('11582');assert.equal(await page.locator('button[type=submit].talent-planner-action').count(),1);
   await spec.selectOption('11594');assert.equal(await page.locator('button[type=submit].talent-planner-action').count(),1);
   await spec.selectOption('11601');assert.equal(await page.locator('button[type=submit].talent-planner-action').count(),0);
   await choose(5);await goal.selectOption('pvp');await role.selectOption('damage');assert.equal(await spec.inputValue(),'11622');
   await choose(1);await goal.selectOption('dungeons');await role.selectOption('damage');assert.equal(await spec.inputValue(),'11650');await spec.selectOption('11657');assert.equal(await spec.inputValue(),'11657');
   await choose(9);await goal.selectOption('dungeons');assert.equal(await spec.inputValue(),'11637');await spec.selectOption('11629');assert.equal(await spec.inputValue(),'11629');
   await choose(8);await goal.selectOption('leveling');
   assert.equal(await spec.inputValue(),'11582','reviewed comparative recommendation should be preselected');
   assert.equal(await role.count(),0);
   assert.equal(await page.locator('#talentGuide-playStyle').count(),0);
   await spec.selectOption('11594');assert.equal(await spec.inputValue(),'11594','manual alternative retained');
   await spec.selectOption('11601');assert.equal(await page.locator('button[type=submit].talent-planner-action').count(),0);
   await spec.selectOption('11582');await rank.selectOption('1');
   const beforeRank=plannerRequests;
   await page.locator('button[type=submit].talent-planner-action').click();
   assert.ok((await page.locator('#talentPlannerMessage').innerText()).includes('nicht freigegeben'));
   assert.equal(plannerRequests,beforeRank,'unsupported rank must be blocked before request');
   await rank.selectOption('0');await page.locator('button[type=submit].talent-planner-action').click();
   await page.locator('[data-plan-result] .talent-grid').waitFor({state:'visible'});
   const afterResolve=plannerRequests;
   const layout=await page.evaluate(()=>{
     const root=document.querySelector('#talentPlannerContent'),grid=root.querySelector('.talent-grid'),nodes=[...grid.querySelectorAll('.talent-node')];
     return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,rootWidth:root.clientWidth,rootScroll:root.scrollWidth,
       gridWidth:grid.clientWidth,gridScroll:grid.scrollWidth,buttons:nodes.length,minTarget:Math.min(...nodes.map(n=>n.getBoundingClientRect().width)),domNodes:root.querySelectorAll('*').length};
   });
   result.layout=layout;
   assert.ok(layout.rootScroll<=layout.rootWidth+2,'planner horizontal overflow '+JSON.stringify(layout));
   assert.ok(layout.gridScroll<=layout.gridWidth+6,'talent grid overflow '+JSON.stringify(layout));
   assert.ok(layout.minTarget>=32&&layout.domNodes<1500,'touch target / DOM budget '+JSON.stringify(layout));
   assert.ok(layout.documentWidth<=layout.viewport+2,'document horizontal overflow '+JSON.stringify(layout));
   await page.screenshot({path:resolve(reportDir,item.name+'-plan.png'),fullPage:true});
   if(engine==='chromium'){
     cdp=await context.newCDPSession(page);
     await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
     await cdp.send('HeapProfiler.collectGarbage');
     result.heapBefore=(await cdp.send('Runtime.getHeapUsage')).usedSize;
   }
   const timings=await page.evaluate(()=>{
     const root=document.querySelector('#talentPlannerContent'),samples=[];
     for(let i=0;i<18;i++){
       const start=performance.now();
       const level=root.querySelector('#talentPlannerLevel');level.value=String(i%2?60:15);level.dispatchEvent(new Event('change',{bubbles:true}));
       const trees=root.querySelectorAll('[data-plan-tree]');trees[i%trees.length].click();
       const node=root.querySelector('.talent-node');node.click();
       // Force layout to include actual rendering cost, not just event dispatch.
       root.getBoundingClientRect();
       samples.push(performance.now()-start);
     }
     const node=root.querySelector('.talent-node');
     window.dispatchEvent(new Event('focus'));
     return {samples,sameNode:node===root.querySelector('.talent-node'),steps:root.querySelectorAll('.talent-planner-steps li').length,detail:!!root.querySelector('.talent-node-detail')};
   });
   result.interactionP95Ms=p95(timings.samples);result.interactionMaxMs=Math.max(...timings.samples);result.cpuThrottle=cdp?4:1;
   assert.ok(timings.sameNode,'unchanged focus must not rebuild the tree');
   assert.equal(timings.steps,51);assert.equal(timings.detail,true);
   assert.ok(result.interactionP95Ms<500,'interaction budget (three local interactions plus layout) '+result.interactionP95Ms);
   assert.equal(plannerRequests,afterResolve,'level/tree/node/focus must not fetch a talent plan');
   if(cdp){
     await cdp.send('HeapProfiler.collectGarbage');result.heapAfter=(await cdp.send('Runtime.getHeapUsage')).usedSize;
     result.heapGrowthBytes=result.heapAfter-result.heapBefore;
     assert.ok(result.heapGrowthBytes<8*1024*1024,'unexpected retained JS heap growth');
     await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   }
   await page.locator('[data-plan-remember]').click();
   await page.reload();await character.waitFor({state:'visible'});await character.selectOption('qa-class-8');
   await page.locator('[data-plan-forget]').waitFor({state:'visible'});
   await page.locator('[data-plan-forget]').click();await goal.waitFor({state:'visible'});
   assert.equal(await page.locator('[data-plan-forget]').count(),0);
   // A delayed character reply may never replace a newer selection.
   await character.selectOption('qa-class-1');await character.selectOption('qa-class-8');
   await goal.waitFor({state:'visible'});await sleep(180);
   await goal.selectOption('dungeons');
   assert.equal(await spec.inputValue(),'11582');
   await page.screenshot({path:resolve(reportDir,item.name+'-guide.png'),fullPage:true});
   // Exercise newly approved class routes and the actual corrected character view.
   await choose(7);await goal.selectOption('dungeons');await role.selectOption('damage');
   assert.equal(await spec.inputValue(),'11363','Shaman dungeon comparative default');
   await spec.selectOption('11326');assert.equal(await spec.inputValue(),'11326','Shaman dungeon alternative');
   await choose(7);await goal.selectOption('leveling');await role.selectOption('damage');
   assert.equal(await spec.inputValue(),'11363','Shaman comparative default');
   await spec.selectOption('11326');assert.equal(await spec.inputValue(),'11326','Shaman alternative');
   await spec.selectOption('11363');await rank.selectOption('0');
   await page.locator('button[type=submit].talent-planner-action').click();
   await page.locator('[data-plan-result] .talent-grid').waitFor({state:'visible'});
   assert.equal(await page.locator('.talent-planner-steps li').count(),6,'initial preview uses character level 15');
   await page.locator('#talentPlannerLevel').selectOption('60');
   assert.equal(await page.locator('.talent-planner-steps li').count(),51,'complete rank-zero path at level 60');
   await choose(9);await goal.selectOption('leveling');
   await spec.selectOption('11637');await rank.selectOption('0');
   await page.locator('button[type=submit].talent-planner-action').click();
   await page.locator('[data-plan-result] .talent-grid').waitFor({state:'visible'});
   assert.equal(await page.locator('.talent-planner-steps li').count(),6,'initial preview uses character level 15');
   await page.locator('#talentPlannerLevel').selectOption('60');
   assert.equal(await page.locator('.talent-planner-steps li').count(),51,'complete rank-zero path at level 60');
   await page.evaluate(()=>{location.hash='#charaktere'});
   const beforeDisplay=displayRequests,beforePlan=plannerRequests;
   async function showTalent(classId,id){
     await page.locator('button[data-character-slug="qa-class-'+classId+'"][data-character-tab="talents"]').click();
     const panel=page.locator('#qa-class-'+classId+'-panel-talents');
     await panel.locator('.talent-grid').waitFor({state:'visible'});
     const tree=displayCatalog.classes[classId].trees.find(t=>t.talents.some(n=>n.id===id));
     await panel.locator('[data-talent-tree="'+tree.id+'"]').click();
     await panel.locator('[data-talent-node="'+id+'"]').click();
     return panel;
   }
   const pal=await showTalent(2,105330);
   assert.ok((await pal.locator('.talent-node-detail').innerText()).includes('60 Minuten'));
   assert.ok((await pal.locator('.workshop-credit').innerText()).includes('Zephras'));
   const hunt=await showTalent(3,104964);
   assert.equal(await hunt.locator('.talent-prerequisites li').count(),1);
   assert.ok((await hunt.locator('.talent-prerequisites').innerText()).includes('104970'));
   const druid=await showTalent(11,104936);
   assert.ok((await druid.locator('.talent-summary').innerText()).includes('Talentstand nicht bestätigt'));
   assert.ok((await druid.locator('.talent-node-detail').innerText()).includes('Traumzustand'));
   assert.equal(await druid.locator('.talent-rank-description').count(),5);
   await druid.locator('[data-talent-node="104933"]').click();
   assert.equal(await druid.locator('.talent-rank-description').count(),2);
   assert.ok((await druid.locator('.talent-node-detail').innerText()).includes('15 %'));
   assert.equal(displayRequests,beforeDisplay+1,'single cached character catalog fetch');
   assert.equal(plannerRequests,beforePlan,'character view must not trigger plan requests');
   await page.screenshot({path:resolve(reportDir,item.name+'-hotfix.png'),fullPage:true});
   result.additionalClassPaths=2;result.correctedCharacterViews=3;result.characterCatalogReads=displayRequests-beforeDisplay;
   assert.deepEqual(errors,[],'browser page errors');
   assert.deepEqual(unexpected,[],'unexpected backend endpoints');
   result.plannerRequests=plannerRequests-baselineRequests;
   result.externalRequestsBlocked=outside.length;
   result.status='passed';
  }catch(error){
    result.error=String(error.stack||error);
    await page.screenshot({path:resolve(reportDir,item.name+'-failure.png'),fullPage:true}).catch(()=>{});
    console.error(result.error);
  }finally{report.cases.push(result);await context.close()}
 }
 report.discoveryBytes=discoveryBytes;report.pathBytes=pathBytes;report.providerReads=providerReads;
 assert.ok(discoveryBytes>0&&discoveryBytes<20000,'discovery payload budget');
 assert.ok(pathBytes>0&&pathBytes<100000,'plan payload budget');
 assert.equal(providerReads,3*cases.filter(c=>report.cases.find(x=>x.name===c.name)?.status==='passed').length,'only explicit successful plan requests may inspect rules');
 assert.ok(report.cases.every(c=>c.status==='passed'),'browser regression failed');
}finally{
 writeFileSync(resolve(reportDir,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log('DALTON_BROWSER_REPORT '+JSON.stringify(report));
 await browser.close();await new Promise(ok=>server.close(ok));
}
