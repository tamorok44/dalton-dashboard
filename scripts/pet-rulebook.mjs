import {createHash} from 'node:crypto';

export const PET_RULEBOOK_VERSION='2026.11.21.1';

export const PET_RULES=Object.freeze({
  'fox.family.profile':Object.freeze({
    version:1,
    label:'Fuchs-Familienprofil',
    reviewedAt:'2026-11-21',
    sourceIds:Object.freeze(['blizzardHotfix','bindFox','wowForeverPets'])
  }),
  'fox.training':Object.freeze({
    version:1,
    label:'Fuchs-Ausbildungsstufen',
    reviewedAt:'2026-11-21',
    sourceIds:Object.freeze(['blizzardHotfix','bindFox'])
  }),
  'pet.scaling':Object.freeze({
    version:1,
    label:'Jägerbegleiter-Skalierung',
    reviewedAt:'2026-11-21',
    sourceIds:Object.freeze(['blizzardHotfix','wowheadScaling'])
  }),
  'pet.health.global':Object.freeze({
    version:1,
    label:'Globaler Begleiter-Gesundheitsfaktor',
    reviewedAt:'2026-11-21',
    validFrom:'2026-11-10',
    sourceIds:Object.freeze(['blizzardHotfix'])
  })
});

const sources=Object.freeze({
  blizzardHotfix:Object.freeze({
    label:'Blizzard Forever Hotfixes',
    url:'https://worldofwarcraft.blizzard.com/en-us/news/24315281',
    mode:'hotfix',
    semanticPatterns:Object.freeze([
      /pets?\s+(?:erroneously\s+)?had\s+150\s*%[\s\S]{0,180}?115\s*%/i
    ])
  }),
  wowheadScaling:Object.freeze({
    label:'Wowhead Forever Hunter Pet Scaling',
    url:'https://www.wowhead.com/forever/guide/classes/hunter/survival/overview-pve-dps',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /stamina[\s\S]{0,100}?every\s+1\s+player\s+stamina[\s\S]{0,80}?2\s+health/i,
      /armor[\s\S]{0,100}?pet\s+gains\s+30\s*%[\s\S]{0,80}?player(?:'s|’s)?\s+armor/i,
      /attack\s+power[\s\S]{0,120}?pet\s+gains\s+10\s*%[\s\S]{0,100}?highest\s+attack\s+power/i,
      /critical\s+strike[\s\S]{0,120}?pet\s+gains\s+100\s*%[\s\S]{0,100}?crit/i
    ])
  }),
  bindFox:Object.freeze({
    label:'Bind on Forever · Fox',
    url:'https://bindonforever.com/pets/fox',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /fox[\s\S]{0,120}?client\s+family\s+319/i,
      /trickster(?:'|’)?s\s+dance[\s\S]{0,180}?50\s*%\s+dodge[\s\S]{0,100}?30\s*%\s+faster\s+attacks[\s\S]{0,100}?12\s*s/i,
      /trickster(?:'|’)?s\s+dance[\s\S]{0,100}?pet\s+level\s+20/i,
      /bite[\s\S]{0,160}?rank\s+1\s+1[\s\S]{0,140}?rank\s+2\s+8[\s\S]{0,140}?rank\s+3\s+16/i,
      /rank\s+4\s+24[\s\S]{0,140}?rank\s+5\s+32[\s\S]{0,140}?rank\s+6\s+40[\s\S]{0,140}?rank\s+7\s+48[\s\S]{0,140}?rank\s+8\s+56/i,
      /dash[\s\S]{0,180}?rank\s+1\s+30[\s\S]{0,160}?rank\s+2\s+40[\s\S]{0,160}?rank\s+3\s+50/i,
      /fox\s+pets?\s+eat\s+meat/i
    ]),
    buildPattern:/build\s+(1\.60\.1\.\d+)/i
  }),
  wowForeverPets:Object.freeze({
    label:'WoW Forever Pet Families',
    url:'https://wow-forever.gg/pets/',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /fox[\s\S]{0,180}?damage\s+0\s*%[\s\S]{0,100}?armor\s+\+?5\s*%[\s\S]{0,100}?health\s+0\s*%/i,
      /fox[\s\S]{0,260}?eats\s+meat/i,
      /fox[\s\S]{0,320}?trickster(?:'|’)?s\s+dance[\s\S]{0,120}?dash[\s\S]{0,120}?bite/i
    ]),
    buildPattern:/build\s+(1\.60\.1\.\d+)/i
  })
});

export const PET_RULE_SOURCES=sources;

function decodeEntities(value){
  return String(value||'')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&ndash;|&#8211;/gi,'–')
    .replace(/&mdash;|&#8212;/gi,'—')
    .replace(/&rsquo;|&#8217;/gi,'’')
    .replace(/&#x27;/gi,"'");
}
function htmlText(html){
  return decodeEntities(String(html||'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/p>|<\/li>|<\/h\d>|<\/tr>|<\/div>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .replace(/[\t\r ]+/g,' ')
    .replace(/\n\s+/g,'\n')
    .replace(/\n{2,}/g,'\n')
    .trim();
}
function normalized(value){
  return String(value||'').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
}
function sha(value){
  return createHash('sha256').update(String(value)).digest('hex');
}
function markerEvidence(text,patterns){
  const evidence=[];
  for(const pattern of patterns){
    const match=text.match(pattern);
    if(!match)return {ok:false,evidence,missing:String(pattern)};
    evidence.push(normalized(match[0]));
  }
  return {ok:true,evidence};
}
function hotfixEvidence(text,patterns){
  const semantics=markerEvidence(text,patterns);
  if(!semantics.ok)return semantics;
  const relevant=text.split(/\n+/).map(line=>line.trim()).filter(line=>
    line.length>=20&&line.length<=900&&/\b(pet|pets|companion|companions|tame|tamed|taming|stable|loyalty|happiness)\b/i.test(line)
  );
  if(!relevant.length)return {ok:false,evidence:semantics.evidence,missing:'pet-relevant hotfix lines'};
  return {ok:true,evidence:[...semantics.evidence,...relevant.map(normalized).sort()]};
}
async function inspectSource(id,definition,{fetchImpl=fetch,previousSource=null,sameRulebook=false}={}){
  try{
    const response=await fetchImpl(definition.url,{
      headers:{'user-agent':'Mozilla/5.0 (compatible; DaltonDashboard/1.0; +https://dalton-dashboard-eight.vercel.app)','accept':'text/html,application/xhtml+xml'},
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw new Error('HTTP '+response.status);
    const text=htmlText(await response.text());
    const semantic=definition.mode==='hotfix'
      ?hotfixEvidence(text,definition.semanticPatterns)
      :markerEvidence(text,definition.semanticPatterns);
    if(!semantic.ok){
      return {
        id,label:definition.label,url:definition.url,status:'review_required',
        reason:'expected_rule_evidence_missing',missing:semantic.missing,
        baselineDigest:sameRulebook?previousSource?.baselineDigest:null
      };
    }
    const build=definition.buildPattern?.exec(text)?.[1]||null;
    const digest=sha([...semantic.evidence,build?'build='+build:''].filter(Boolean).join('\n'));
    const baselineDigest=sameRulebook&&previousSource?.baselineDigest?previousSource.baselineDigest:digest;
    const changed=Boolean(sameRulebook&&previousSource?.baselineDigest&&digest!==previousSource.baselineDigest);
    return {
      id,label:definition.label,url:definition.url,
      status:changed?'review_required':'verified',
      reason:changed?'source_evidence_changed':null,
      digest,baselineDigest,build
    };
  }catch(error){
    return {
      id,label:definition.label,url:definition.url,status:'source_unavailable',
      reason:String(error?.message||error).slice(0,180),
      baselineDigest:sameRulebook?previousSource?.baselineDigest:null,
      build:sameRulebook?previousSource?.build:null
    };
  }
}
function worstStatus(statuses){
  if(statuses.includes('review_required'))return 'review_required';
  if(statuses.includes('source_unavailable'))return 'source_unavailable';
  return 'verified';
}

export async function verifyPetRulebook({fetchImpl=fetch,previousState=null,now=new Date()}={}){
  const sameRulebook=previousState?.rulebookVersion===PET_RULEBOOK_VERSION;
  const sourceEntries=await Promise.all(Object.entries(sources).map(async([id,definition])=>[
    id,await inspectSource(id,definition,{fetchImpl,previousSource:previousState?.sources?.[id],sameRulebook})
  ]));
  const sourceResults=Object.fromEntries(sourceEntries);
  const rules=Object.fromEntries(Object.entries(PET_RULES).map(([id,rule])=>{
    const statuses=rule.sourceIds.map(sourceId=>sourceResults[sourceId]?.status||'source_unavailable');
    const status=worstStatus(statuses);
    return [id,{
      id,label:rule.label,version:rule.version,status,
      reviewedAt:rule.reviewedAt,validFrom:rule.validFrom||null,
      sourceIds:[...rule.sourceIds]
    }];
  }));
  return {
    rulebookVersion:PET_RULEBOOK_VERSION,
    checkedAt:now.toISOString(),
    overall:worstStatus(Object.values(rules).map(rule=>rule.status)),
    rules,
    sources:sourceResults
  };
}

export function publicPetRuleState(state){
  if(!state)return null;
  return {
    rulebookVersion:state.rulebookVersion||null,
    checkedAt:state.checkedAt||null,
    overall:state.overall||'source_unavailable',
    rules:Object.fromEntries(Object.entries(state.rules||{}).map(([id,rule])=>[id,{
      id,label:rule.label,version:rule.version,status:rule.status,reviewedAt:rule.reviewedAt,validFrom:rule.validFrom||null
    }])),
    sources:Object.fromEntries(Object.entries(state.sources||{}).map(([id,source])=>[id,{
      id,label:source.label,url:source.url,status:source.status,build:source.build||null,reason:source.reason||null
    }]))
  };
}
