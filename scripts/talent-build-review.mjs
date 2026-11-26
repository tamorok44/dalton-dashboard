import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CLASS_BY_ID} from './class-training-store.mjs';
import {buildTalentMaster,TALENT_CLASS_IDS} from './talent-tree-store.mjs';
import {buildTalentCatalogProof,talentRevisionDigest,talentSourcePairDigest,talentStructureDigest} from './talent-catalog-proof.mjs';
import {hotfixArticleBody} from './pet-rulebook.mjs';
import {isTalentClientBuild,talentHotfixRevision} from './talent-rule-watch.mjs';

// Offline editorial tool only. No fetching, Redis writes, cron, or release
// mutation. Input files are exact public response bodies, not search snippets.
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=/^[a-f0-9]{64}$/;
const positive=v=>Number.isSafeInteger(v)&&v>0;
const sortNodes=nodes=>nodes.sort((a,b)=>a.id-b.id);
const sortEdges=edges=>edges.sort((a,b)=>a.id-b.id||a.rank-b.rank);
const sortTrees=trees=>trees.sort((a,b)=>a.id-b.id);

function primaryStructure(klass){
  return sortTrees(klass.trees.map(tree=>({id:tree.id,talents:sortNodes(tree.talents.map(node=>({
    id:node.id,row:node.row,column:node.column,maxRank:node.maxRank,requiredPoints:node.requiredPoints,
    prerequisites:sortEdges(node.prerequisites.map(({id,rank})=>({id,rank})))
  })))})));
}

function assertIndependentNode(node){
  assert.ok(positive(node.id)&&Number.isInteger(node.row)&&node.row>=0&&node.row<=10&&
    Number.isInteger(node.col)&&node.col>=0&&node.col<=3&&positive(node.maxRank)&&node.maxRank<=10&&
    node.points===node.row*5&&Array.isArray(node.req),'Invalid independent talent node');
  const ids=new Set();
  for(const edge of node.req){
    assert.ok(positive(edge.talent)&&positive(edge.rank)&&!ids.has(edge.talent),'Invalid independent prerequisite');
    // Do not discard additional edge conditions or claim an OR edge from an
    // unlabeled pair. Any unfamiliar independent schema needs a review.
    assert.deepEqual(Object.keys(edge).sort(),['rank','talent'],'Unknown independent prerequisite fields');
    ids.add(edge.talent);
  }
}

function cycles(trees){
  const found=[];
  for(const tree of trees){
    const nodes=new Map(tree.talents.map(node=>[node.id,node]));
    const active=new Set(),done=new Set();
    function visit(id,path){
      if(active.has(id)){found.push([...path.slice(path.indexOf(id)),id]);return}
      if(done.has(id)||!nodes.has(id))return;
      active.add(id);
      for(const edge of nodes.get(id).prerequisites)visit(edge.id,[...path,id]);
      active.delete(id);done.add(id);
    }
    for(const id of nodes.keys())visit(id,[]);
  }
  return found;
}

function differences(before,after){
  const index=trees=>new Map(trees.flatMap(tree=>tree.talents.map(node=>[node.id,{treeId:tree.id,...node}])));
  const left=index(before),right=index(after),changes=[];
  for(const id of [...new Set([...left.keys(),...right.keys()])].sort((a,b)=>a-b)){
    if(!left.has(id))changes.push({id,kind:'added'});
    else if(!right.has(id))changes.push({id,kind:'removed'});
    else{
      const a=left.get(id),b=right.get(id);
      const fields=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(key=>
        JSON.stringify(a[key])!==JSON.stringify(b[key]));
      if(fields.length)changes.push({id,kind:'changed',fields});
    }
  }
  return changes;
}

export function compareIndependentTalentClass(klass,html,expectedBuild){
  const build=html.match(/<small>build ([\d.]+)<\/small>/i)?.[1];
  assert.ok(isTalentClientBuild(build)&&build===expectedBuild,'Independent capture build mismatch');
  const embedded=html.match(/<script\s+type="application\/json"\s+data-tc-data>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(embedded,'Independent capture has no embedded talent data');
  const secondary=JSON.parse(embedded);
  assert.equal(secondary.cls,CLASS_BY_ID[klass.classId],'Independent capture class mismatch');
  assert.ok(Array.isArray(secondary.trees)&&secondary.trees.length===3,'Independent capture incomplete');
  const primary=primaryStructure(klass);
  const usedTrees=new Set(),usedNodes=new Set();
  const normalized=sortTrees(secondary.trees.map(tree=>{
    assert.ok(Array.isArray(tree.talents)&&tree.talents.length>0,'Missing independent tree');
    for(const node of tree.talents){assertIndependentNode(node);assert.ok(!usedNodes.has(node.id),'Duplicate independent talent ID');usedNodes.add(node.id)}
    // Identify stable tree IDs by shared talent IDs, never by page order.
    const ids=new Set(tree.talents.map(n=>n.id));
    const matches=primary.filter(t=>t.talents.some(n=>ids.has(n.id)));
    assert.equal(matches.length,1,'Cannot uniquely associate independent tree');
    const id=matches[0].id;
    assert.ok(!usedTrees.has(id),'Duplicate independent tree');usedTrees.add(id);
    return {id,talents:sortNodes(tree.talents.map(node=>({
      id:node.id,row:node.row,column:node.col,maxRank:node.maxRank,requiredPoints:node.points,
      prerequisites:sortEdges(node.req.map(({talent,rank})=>({id:talent,rank})))
    })))};
  }));
  const unknown=klass.trees.flatMap(t=>t.talents.filter(n=>n.prerequisites.some(p=>p.conditionKnown!==true)).map(n=>n.id));
  const cyclic=cycles(primary);
  const primaryDigest=talentRevisionDigest(primary),independentDigest=talentRevisionDigest(normalized);
  return {status:primaryDigest!==independentDigest?'structure_differs':unknown.length||cyclic.length?'edge_review_required':'structure_matches',
    classId:klass.classId,build,talentCount:primary.flatMap(t=>t.talents).length,
    primaryNormalizedSha256:primaryDigest,independentNormalizedSha256:independentDigest,
    comparisonDigest:talentStructureDigest({trees:primary}),
    captureSha256:sha(html),unknownPrerequisites:unknown,cyclicPrerequisites:cyclic,changes:differences(primary,normalized)};
}

function hotfixSections(body){
  const canonical=body.trim().replace(/\s+/g,' ');
  const headings=[...canonical.matchAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d{2}\b/g)];
  const sections=new Map();
  for(const [index,match] of headings.entries()){
    const date=match[0];
    assert.ok(!sections.has(date),'Repeated date in hotfix text needs manual review');
    sections.set(date,sha(canonical.slice(match.index,headings[index+1]?.index??canonical.length).trim()));
  }
  return sections;
}

export function reviewHotfixDelta(previousHtml,currentHtml,expectedPrevious,expectedCurrent){
  const before=hotfixArticleBody(previousHtml),after=hotfixArticleBody(currentHtml);
  const previousRevision=talentHotfixRevision(before),currentRevision=talentHotfixRevision(after);
  assert.ok(digest.test(expectedPrevious)&&previousRevision===expectedPrevious,'Previous hotfix capture does not match release digest');
  assert.ok(digest.test(expectedCurrent)&&currentRevision===expectedCurrent,'Current hotfix capture does not match live digest');
  const left=hotfixSections(before),right=hotfixSections(after);
  return {previousRevision,currentRevision,previousCaptureSha256:sha(previousHtml),currentCaptureSha256:sha(currentHtml),
    dateSections:[...new Set([...left.keys(),...right.keys()])].map(date=>({date,status:!left.has(date)?'added':!right.has(date)?'removed':left.get(date)===right.get(date)?'unchanged':'changed',
      previousSha256:left.get(date)??null,currentSha256:right.get(date)??null})),
    // This is a review aid, never a statement about affected classes or
    // undocumented server-side changes. A human/agent must review the delta.
    completeHotfixReview:false};
}

export function reviewTalentBuild({date,build,rawBody,localizedBody,expectedSourceRevision,baselineCatalogs=[],independentCaptures={},hotfix}){
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&isTalentClientBuild(build),'Invalid review identity');
  assert.ok(digest.test(expectedSourceRevision),'Expected exact live source revision required');
  const rawSha256=sha(rawBody),localizedSha256=sha(localizedBody);
  const sourceRevision=talentSourcePairDigest(rawSha256,localizedSha256);
  assert.equal(sourceRevision,expectedSourceRevision,'Captured source pair does not match live observation');
  const raw=JSON.parse(rawBody),localized=JSON.parse(localizedBody);
  const master=buildTalentMaster(raw,localized);
  const proofs=[],classes=[];
  for(const id of TALENT_CLASS_IDS){
    const klass=master.classes[id];
    if(!klass){classes.push({classId:id,status:'primary_incomplete'});continue}
    const proof=buildTalentCatalogProof(klass,raw.find(c=>c.id===id));
    const catalogRevision=talentRevisionDigest(proof);
    assert.equal(catalogRevision,master.classMechanicsRevisions[id]);
    const baseline=baselineCatalogs.find(c=>c.proof?.classId===id);
    if(baseline)assert.equal(talentRevisionDigest(baseline.proof),baseline.catalogRevision,'Invalid baseline catalog proof');
    const record={classId:id,catalogRevision,baselineCatalogRevision:baseline?.catalogRevision??null,
      mechanicsUnchanged:baseline?baseline.catalogRevision===catalogRevision:null,
      mechanicsChanges:baseline?differences(baseline.proof.trees,proof.trees):null,
      status:'independent_capture_missing'};
    if(independentCaptures[id]){
      try{
        const comparison=compareIndependentTalentClass(klass,independentCaptures[id],build);
        record.status=comparison.status;record.comparison=comparison;
      }catch(error){record.status='independent_capture_unverified';record.error=String(error.message).slice(0,240)}
    }
    proofs.push({catalogRevision,sourceRevision,proof});
    classes.push(record);
  }
  return {schemaVersion:1,kind:'talent_build_review_candidate',date,build,sourcePair:{rawSha256,localizedSha256,revision:sourceRevision},
    hotfix:hotfix?reviewHotfixDelta(hotfix.previousHtml,hotfix.currentHtml,hotfix.previousRevision,hotfix.currentRevision):null,
    classes,catalogs:proofs,approved:false};
}

// Use a manifest with exact observed digests and paths to local response bodies.
// Print only review artifacts; never write release-catalog.json.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,3,'Usage: node scripts/talent-build-review.mjs capture-manifest.json');
  const manifestPath=resolve(process.argv[2]),folder=dirname(manifestPath);
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const load=path=>readFileSync(resolve(folder,path),'utf8');
  const independentCaptures=Object.fromEntries(Object.entries(manifest.independent??{}).map(([id,path])=>[id,load(path)]));
  const baselineCatalogs=manifest.baselineProofs?JSON.parse(load(manifest.baselineProofs)).catalogs:[];
  console.log(JSON.stringify(reviewTalentBuild({date:manifest.date,build:manifest.build,expectedSourceRevision:manifest.expectedSourceRevision,
    rawBody:load(manifest.raw),localizedBody:load(manifest.localized),baselineCatalogs,independentCaptures,
    hotfix:manifest.hotfix?{previousHtml:load(manifest.hotfix.previous),currentHtml:load(manifest.hotfix.current),
      previousRevision:manifest.hotfix.previousRevision,currentRevision:manifest.hotfix.currentRevision}:null}),null,2));
}
