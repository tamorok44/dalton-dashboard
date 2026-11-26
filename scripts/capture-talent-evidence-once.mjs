import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewTalentBuild} from './talent-build-review.mjs';
import {talentSourcePairDigest} from './talent-catalog-proof.mjs';
const out='evidence-capture';
mkdirSync(out,{recursive:true});
const sha=v=>createHash('sha256').update(v).digest('hex');
const names={1:'warrior',2:'paladin',3:'hunter',4:'rogue',5:'priest',7:'shaman',8:'mage',9:'warlock',11:'druid'};
const expected='9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b';
const build='1.60.1.71139';
const requests=[
 ['raw','https://foreverdb.net/data/classes.json'],
 ['localized','https://foreverdb.net/data/l10n/de/classes.json'],
 ['official','https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-25-2026'],
 ...Object.entries(names).map(([id,name])=>['independent-'+id,'https://theforeverera.com/en/talents/'+name+'/']),
 ...Object.entries(names).map(([id,name])=>['hotfix-client-'+id,'https://wowforevertalents.com/'+name+'/'])
];
const bodies={},captures=[];
for(let i=0;i<requests.length;i+=3){
 await Promise.all(requests.slice(i,i+3).map(async([key,url])=>{
  try{
   const res=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Dalton-Dashboard evidence review (one-time)','Accept':key==='raw'||key==='localized'?'application/json':'text/html'}});
   const body=await res.text();
   if(!res.ok)throw Error('HTTP '+res.status);
   if(body.length>4000000)throw Error('Response size exceeds capture limit');
   bodies[key]=body;
   writeFileSync(out+'/'+key+(key==='raw'||key==='localized'?'.json':'.html'),body);
   const scripts=[...body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>m[2].length>500&&m[2].includes('talent')).map(m=>({attributes:m[1].slice(0,180),length:m[2].length,head:m[2].slice(0,220)})).slice(0,5);
   captures.push({key,url,sha256:sha(body),bytes:Buffer.byteLength(body),buildTags:[...new Set([...body.matchAll(/1\.60\.1\.\d{5}/g)].map(m=>m[0]))].slice(0,8),explicitBuild:body.match(/<small>build ([\d.]+)<\/small>/i)?.[1]??null,scripts});
  }catch(error){captures.push({key,url,error:String(error.message).slice(0,180)})}
 }));
}
let result={schemaVersion:1,kind:'one_time_independent_evidence_capture',capturedAt:new Date().toISOString(),expectedBuild:build,expectedSource:expected,captures:captures.sort((a,b)=>a.key.localeCompare(b.key)),approved:false};
if(bodies.raw&&bodies.localized){
 const actual=talentSourcePairDigest(sha(bodies.raw),sha(bodies.localized));
 result.actualSource=actual;
 if(actual===expected){
  try{
   const baselineCatalogs=JSON.parse(readFileSync('data/talent-planning/catalog-proofs-2026-11-25.json','utf8')).catalogs.filter(x=>x.sourceRevision===expected);
   const independentCaptures=Object.fromEntries(Object.keys(names).filter(id=>bodies['independent-'+id]).map(id=>[id,bodies['independent-'+id]]));
   const review=reviewTalentBuild({date:'2026-11-26',build,rawBody:bodies.raw,localizedBody:bodies.localized,expectedSourceRevision:expected,baselineCatalogs,independentCaptures});
   result.classes=review.classes;writeFileSync(out+'/full-review.json',JSON.stringify(review,null,2)+'\n');
  }catch(error){result.reviewError=String(error.message)}
 }else result.reviewError='Primary source differs from the observed release tuple; independent comparison cannot authorize release.';
}
writeFileSync(out+'/summary.json',JSON.stringify(result,null,2)+'\n');
console.log('DALTON_CAPTURE_SUMMARY '+JSON.stringify(result));
