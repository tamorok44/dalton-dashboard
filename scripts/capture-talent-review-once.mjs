import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fetchPublicClassFile} from './class-training-store.mjs';
import {buildTalentMaster} from './talent-tree-store.mjs';
import {buildTalentCatalogProof,talentSourcePairDigest} from './talent-catalog-proof.mjs';
import {reviewTalentBuild,compareIndependentTalentClass} from './talent-build-review.mjs';
import {hotfixArticleBody} from './pet-rulebook.mjs';
import {talentHotfixRevision} from './talent-rule-watch.mjs';

// One-time public editorial capture, not a server job. No secrets, Redis,
// provider account credentials, cache deletion, or release writes.
const sha=s=>createHash('sha256').update(s).digest('hex');
const build='1.60.1.71139';
const expected='9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b';
const oldHotfix='ed43bdd2c1225b594ec34f99b4bffbf51942affd6d56c4148e24aced5df43afd';
const currentHotfix='409f97269c59bb22c7ba4f8fc2c0bd68cb8d1b4898585883c6ffc598ca0af78d';
const get=async response=>{const r=await response;if(!r.ok)throw Error('HTTP '+r.status);return r.text()};
const page=url=>get(fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; DaltonDashboard/1.0; +https://dalton-dashboard-eight.vercel.app)','accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(15000)}));
const captures=await Promise.allSettled([
  get(fetchPublicClassFile('classes.json',{cache:'no-cache'})),
  get(fetchPublicClassFile('l10n/de/classes.json',{cache:'no-cache'})),
  page('https://theforeverera.com/en/talents/mage/'),
  page('https://worldofwarcraft.blizzard.com/en-us/news/24315281')
]);
const result={schemaVersion:1,kind:'one_time_public_capture',capturedAt:new Date().toISOString(),build,releaseEligible:false,requests:captures.map((r,i)=>({index:i,status:r.status,...(r.status==='rejected'?{reason:String(r.reason.message).slice(0,200)}:{sha256:sha(r.value),length:r.value.length})}))};
const val=i=>captures[i].status==='fulfilled'?captures[i].value:null;
try{
  if(val(0)&&val(1)){
    const raw=JSON.parse(val(0)),de=JSON.parse(val(1));
    const master=buildTalentMaster(raw,de);
    const rawSha256=sha(val(0)),localizedSha256=sha(val(1)),sourceRevision=talentSourcePairDigest(rawSha256,localizedSha256);
    result.sourcePair={rawSha256,localizedSha256,sourceRevision,expected,exactMatch:sourceRevision===expected};
    result.classRevisions=master.classMechanicsRevisions;
    result.classCount=Object.keys(master.classes).length;
    if(val(2))try{result.mageComparison=compareIndependentTalentClass(master.classes[8],val(2),build)}catch(e){result.mageComparison={status:'unverified',reason:e.message.slice(0,240)}}
    if(sourceRevision===expected){
      const old=JSON.parse(readFileSync(new URL('../data/talent-planning/catalog-proofs-2026-11-25.json',import.meta.url),'utf8'));
      const review=reviewTalentBuild({date:'2026-11-26',build,rawBody:val(0),localizedBody:val(1),expectedSourceRevision:expected,baselineCatalogs:old.catalogs,independentCaptures:val(2)?{8:val(2)}:{}});
      result.classReview=review.classes;
      // Normalized proof is sufficient for editorial review; no raw data rehosting.
      result.mageCatalog=review.catalogs.find(c=>c.proof.classId===8);
    }
  }
}catch(e){result.catalogError=String(e.message).slice(0,240)}
try{
  if(val(3)){
    const canonical=hotfixArticleBody(val(3)).trim().replace(/\s+/g,' ');
    const actual=talentHotfixRevision(canonical);
    const heading=/\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d{2}\b/g;
    const sections=[...canonical.matchAll(heading)];
    const preamble=canonical.slice(0,sections[0]?.index??0);
    const older=sections.find(s=>s[0]==='November 23, 2026');
    // Only an exact canonical digest can establish that dropping newer dated
    // sections recovers the historical article. Never assert a match otherwise.
    const recovered=older?talentHotfixRevision(preamble+canonical.slice(older.index)):null;
    result.hotfix={actual,expected:currentHotfix,exactMatch:actual===currentHotfix,recoveredPreviousRevision:recovered,expectedPrevious:oldHotfix,
      oldCanonicalRecovered:recovered===oldHotfix,dateHeadings:sections.map(s=>s[0]),completeHotfixReview:false};
  }
}catch(e){result.hotfixError=String(e.message).slice(0,240)}
console.log('TALENT_CAPTURE_RESULT '+JSON.stringify(result));
