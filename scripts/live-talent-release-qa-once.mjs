import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {checkTalentRuleSources} from './pet-rulebook.mjs';
import {buildTalentMaster} from './talent-tree-store.mjs';
import {fetchPublicClassFile} from './class-training-store.mjs';
import {talentSourcePairDigest} from './talent-catalog-proof.mjs';
import {talentPlanLibrary} from './talent-plan-index.mjs';
import {resolveApprovedTalentPlan} from './talent-plan-core.mjs';
import release from '../data/talent-planning/release-catalog.json' with {type:'json'};
import {describeTalentRuleReview} from './talent-rule-watch.mjs';
const report={schemaVersion:1,kind:'one_time_public_source_qa',capturedAt:new Date().toISOString(),productionDataRead:false,productionWrite:false,requests:[],checks:[]};
const fetchImpl=async (input,init={})=>{
 const url=String(input);const response=await fetch(input,{...init,signal:init.signal??AbortSignal.timeout(20000)});
 report.requests.push({url,status:response.status,age:response.headers.get('age')});return response;
};
const hash=s=>createHash('sha256').update(s).digest('hex');
async function capture(path){
 const response=await fetchPublicClassFile(path,{fetchImpl,cache:'no-cache'});
 if(!response.ok)throw Error('HTTP '+response.status+' '+path);
 const body=await response.text(),age=response.headers.get('age')??'0';
 if(!/^\d+$/.test(age))throw Error('Invalid cache age');
 return {data:JSON.parse(body),digest:hash(body),freshAt:Date.now()-1000*Number(age)};
}
try{
 const observation=await checkTalentRuleSources({fetchImpl,now:new Date()});
 report.observation=observation;
 const [raw,de]=await Promise.all([capture('classes.json'),capture('l10n/de/classes.json')]);
 const master=buildTalentMaster(raw.data,de.data,{now:Math.min(raw.freshAt,de.freshAt)});
 master.sourceRevision=talentSourcePairDigest(raw.digest,de.digest);
 master.sourceFreshAt={raw:new Date(raw.freshAt).toISOString(),localized:new Date(de.freshAt).toISOString()};
 master.stale=false;
 const now=Date.now();
 report.sourceRevision=master.sourceRevision;
 report.catalogCheckedAt=master.checkedAt;report.missingClassIds=master.missingClassIds;
 report.classMechanicsRevisions=master.classMechanicsRevisions;
 for(const plan of talentPlanLibrary.filter(p=>p.active!==false&&p.status==='approved')){
   const pack=release.rulePacks.find(p=>p.revision===plan.ruleRevision&&p.legacyTalentedRank===0);
   for(const profile of plan.profiles){
     const result=resolveApprovedTalentPlan(profile,[plan],master,release.rulePacks,{ruleObservation:observation,legacyTalentedRank:0,now,revalidations:release.revalidations});
     report.checks.push({id:plan.id,version:plan.version,profile,ok:result.ok,code:result.code??null,points:result.history?.length??0,diagnostics:describeTalentRuleReview(observation,pack,master,now)});
   }
 }
 report.passed=report.checks.filter(c=>c.ok).length;
 report.failed=report.checks.filter(c=>!c.ok).length;
}catch(e){report.error=String(e.message)}
finally{writeFileSync('live-talent-qa.json',JSON.stringify(report,null,2)+'\n');console.log('DALTON_LIVE_QA '+JSON.stringify(report))}
if(report.error||!report.checks.length||report.failed)process.exitCode=1;
