import {readFileSync,writeFileSync} from 'node:fs';
import {buildTalentMaster} from './talent-tree-store.mjs';
import {compareIndependentTalentClass} from './talent-build-review.mjs';
import {talentSourcePairDigest} from './talent-catalog-proof.mjs';
import {createHash} from 'node:crypto';
const read=f=>readFileSync('evidence-capture/'+f,'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const raw=read('raw.json'),localized=read('localized.json');
const actual=talentSourcePairDigest(sha(raw),sha(localized));
if(actual!=='9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b')throw Error('source changed');
const master=buildTalentMaster(JSON.parse(raw),JSON.parse(localized));
const results=[];
for(const id of [1,2,3,4,5,7,8,9,11]){
 const klass=master.classes[id];
 const html=read('independent-'+id+'.html');
 const cmp=compareIndependentTalentClass(klass,html,'1.60.1.71091');
 results.push({...cmp,primaryBuild:'1.60.1.71139',releaseEligible:false});
}
const report={schemaVersion:1,kind:'cross_build_diagnostic_only',sourceRevision:actual,primaryBuild:'1.60.1.71139',independentBuild:'1.60.1.71091',results,releaseEligible:false};
writeFileSync('evidence-capture/review-summary.json',JSON.stringify(report,null,2)+'\n');
console.log('DALTON_CROSS_BUILD '+JSON.stringify(report));
const rawClass=JSON.parse(raw);
for(const id of [3,2,11]){
 const c=rawClass.find(x=>x.id===id);
 console.log('RAW_SCHEMA '+id+' '+JSON.stringify({keys:Object.keys(c),treeKeys:Object.keys(c.talentTrees?.[0]??c.trees?.[0]??{})}));
 const k=master.classes[id];
 console.log('TARGET_NODES '+JSON.stringify(k.trees.flatMap(t=>t.talents.filter(n=>[104964,104961,104970,113631,105323,104923,104931,104933,104936,104937,104935].includes(n.id)).map(n=>({id:n.id,tree:t.id,name:n.name,row:n.row,column:n.column,maxRank:n.maxRank,prerequisites:n.prerequisites})))));
}
