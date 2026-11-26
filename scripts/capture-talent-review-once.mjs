import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fetchPublicClassFile} from './class-training-store.mjs';
import {buildTalentMaster} from './talent-tree-store.mjs';
import {buildTalentCatalogProof,talentSourcePairDigest,talentRevisionDigest,talentStructureDigest} from './talent-catalog-proof.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const build='1.60.1.71139',expected='9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b';
const get=async p=>{const r=await p;if(!r.ok)throw Error('HTTP '+r.status);return r.text()};
try{
 const [raw,de,html]=await Promise.all([
 get(fetchPublicClassFile('classes.json',{cache:'no-cache'})),
 get(fetchPublicClassFile('l10n/de/classes.json',{cache:'no-cache'})),
 get(fetch('https://www.forever-xp.com/talents/mage/',{signal:AbortSignal.timeout(15000),headers:{'user-agent':'Mozilla/5.0 (compatible; DaltonDashboard/1.0; +https://dalton-dashboard-eight.vercel.app)'}}))
 ]);
 const rawSha256=sha(raw),localizedSha256=sha(de),sourceRevision=talentSourcePairDigest(rawSha256,localizedSha256);
 assert.equal(sourceRevision,expected,'Unexpected source pair; no attestation');
 const primary=JSON.parse(raw),master=buildTalentMaster(primary,JSON.parse(de));
 for(const [id,klass] of Object.entries(master.classes)){
   const proof=buildTalentCatalogProof(klass,primary.find(c=>c.id===Number(id)));
   console.log('TALENT_EXACT_CLASS '+JSON.stringify({catalogRevision:talentRevisionDigest(proof),sourceRevision,proof}));
 }
 assert.ok(html.includes('build 1.60.1.71139'),'Current independent build label absent');
 const embedded=html.match(/<script\b[^>]*id="talent-data"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
 assert.ok(embedded,'Missing independent talent data');
 const secondary=JSON.parse(embedded);
 assert.equal(secondary.id,8);
 assert.equal(secondary.trees.length,3);
 const sorted=xs=>xs.sort((a,b)=>a.id-b.id);
 const primaryTrees=sorted(master.classes[8].trees.map(t=>({id:t.id,talents:sorted(t.talents.map(n=>({id:n.id,row:n.row,column:n.column,maxRank:n.maxRank,requiredPoints:n.requiredPoints,prerequisites:sorted(n.prerequisites.map(({id,rank,conditionKnown})=>{assert.equal(conditionKnown,true);return {id,rank}}))})))})));
 const ids={Arcane:11582,Fire:11594,Frost:11601};
 const secondaryTrees=sorted(secondary.trees.map(t=>({id:ids[t.name],talents:sorted(t.talents.map(n=>{
 assert.ok(Number.isInteger(n.need)&&n.need===n.row*5);
 assert.ok(n.req===null&&n.reqRank===null||Number.isInteger(n.req)&&Number.isInteger(n.reqRank)&&n.reqRank>0);
 return {id:n.id,row:n.row,column:n.col,maxRank:n.ranks,requiredPoints:n.need,prerequisites:n.req===null?[]:[{id:n.req,rank:n.reqRank}]};
 }))})));
 const diff=primaryTrees.flatMap(t=>t.talents.flatMap(n=>{const s=secondaryTrees.find(x=>x.id===t.id)?.talents.find(x=>x.id===n.id);return JSON.stringify(n)===JSON.stringify(s)?[]:[{primary:n,secondary:s}]}));
 const result={status:diff.length===0&&secondaryTrees.flatMap(t=>t.talents).length===53?'structure_matches':'structure_differs',build,classId:8,catalogRevision:master.classMechanicsRevisions[8],sourceRevision,rawSha256,localizedSha256,captureSha256:sha(html),comparisonDigest:talentStructureDigest({trees:primaryTrees}),primaryNormalizedSha256:talentRevisionDigest(primaryTrees),independentNormalizedSha256:talentRevisionDigest(secondaryTrees),talentCount:53,unknownPrerequisites:[],cyclicPrerequisites:[],diff};
 console.log('TALENT_FINAL_COMPARISON '+JSON.stringify(result));
}catch(error){console.log('TALENT_FINAL_ERROR '+String(error.message).slice(0,300))}
