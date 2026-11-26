import {createHash} from 'node:crypto';
import {HUNTER_PET_RULEBOOK_VERSION} from '../hunter-pets.js';
import {inspectPetDb2} from './pet-db2-audit.mjs';

export const PET_RULEBOOK_VERSION=HUNTER_PET_RULEBOOK_VERSION;

export const PET_EVIDENCE=Object.freeze({
  official:Object.freeze({label:'Offiziell',rank:5,description:'Direkt durch Blizzard dokumentiert.'}),
  client:Object.freeze({label:'Clientdaten',rank:4,description:'Aus aktuellen Forever-Clientdaten ableitbar.'}),
  measured:Object.freeze({label:'Gemessen',rank:3,description:'Durch reproduzierbare Ingame-Messungen bestätigt.'}),
  reference_model:Object.freeze({label:'Referenzmodell',rank:2,description:'Aktuelles, mehrfach gestütztes Modell; Serverkoeffizient nicht direkt veröffentlicht.'}),
  provisional:Object.freeze({label:'Vorläufig',rank:1,description:'Plausible Arbeitsannahme mit noch unzureichender Messbasis.'})
});

export const PET_RULES=Object.freeze({
  'fox.family.profile':Object.freeze({
    version:4,
    label:'Fuchs-Familienprofil',
    evidence:'client',
    evidenceNote:'Familien-ID, Futtermaske und Familienpassiv sind für 71037 und 71091 identisch; aktuelle DB2-Felder werden gegen die feste Referenz geprüft.',
    reviewedAt:'2026-11-25',
    sourceIds:Object.freeze(['blizzardHotfix','bindFox','sixtyToolsPets','statRatFox','foreverDbBuild','db2FoxProfile'])
  }),
  'fox.training':Object.freeze({
    version:4,
    label:'Fuchs-Ausbildungsstufen',
    evidence:'client',
    evidenceNote:'Fuchs-SkillLine 3016, Rangkosten, Zauberstufen, Fokusverbrauch und Effekte aller zwölf Ränge sind für 71037 und 71091 identisch und werden feldweise überwacht.',
    reviewedAt:'2026-11-25',
    sourceIds:Object.freeze(['blizzardHotfix','bindFox','efficientPets','foreverDbBuild','db2FoxTraining'])
  }),
  'pet.scaling':Object.freeze({
    version:6,
    label:'Jägerbegleiter-Skalierungskoeffizienten (Übersicht)',
    evidence:'reference_model',
    evidenceNote:'2 Gesundheit je Ausdauer, 30 % Rüstung, 10 % der höheren AP und 100 % Krit bleiben Referenzmodell. 100 % Trefferchance oder Expertise werden ausdrücklich nicht angenommen. Die unveränderte Client-Aura 415429 bestätigt nur die Struktur, nicht die numerischen Serverkoeffizienten.',
    reviewedAt:'2026-11-25',
    sourceIds:Object.freeze(['blizzardHotfix','wowheadScaling','foreverHunterScalingAudit','foreverDbBuild','db2Scaling'])
  }),
  'pet.scaling.health':Object.freeze({
    version:1,label:'Gesundheitsvererbung',evidence:'reference_model',
    evidenceNote:'2 Gesundheit je Ausdauer des Jägers; keine Aussage über Gesamtgesundheit.',
    reviewedAt:'2026-11-26',sourceIds:Object.freeze(['blizzardHotfix','wowheadScaling','foreverHunterScalingAudit','foreverDbBuild','db2Scaling'])
  }),
  'pet.scaling.armor':Object.freeze({
    version:1,label:'Rüstungsvererbung',evidence:'reference_model',
    evidenceNote:'30 % der Jägerrüstung als rechnerischer Beitrag vor Rundung.',
    reviewedAt:'2026-11-26',sourceIds:Object.freeze(['blizzardHotfix','wowheadScaling','foreverHunterScalingAudit','foreverDbBuild','db2Scaling'])
  }),
  'pet.scaling.ap':Object.freeze({
    version:1,label:'Angriffskraftvererbung',evidence:'reference_model',
    evidenceNote:'10 % der höheren Angriffskraft als Referenzmodell; getrennte Armory-Ausgangswerte fehlen.',
    reviewedAt:'2026-11-26',sourceIds:Object.freeze(['blizzardHotfix','wowheadScaling','foreverHunterScalingAudit','foreverDbBuild','db2Scaling'])
  }),
  'pet.scaling.crit':Object.freeze({
    version:2,label:'Numerische Krit-Vererbung',evidence:'reference_model',
    evidenceNote:'100 % des höheren Nah-/Fernkampf-Kritwerts als durch echte Forever-Kampflogs gestütztes Referenzmodell. WoWSims EV-0134: nach beobachtetem Rollout am 24.11. 28,7 % normale Krits bei Ferocity 5/5 gegenüber zuvor 12,8 % und 16,1 % Owner-Auto-Shot-Krit; 53.245 gelandete Angriffe. Frühere Fähigkeits-Krit-Steigung 0,93 (95%-Intervall 0,85–1,02). Kein exakt isolierter Serverkoeffizient; Build/Relog nicht erfasst. Individueller Beitrag nur mit beiden frischen getrennten Krit-Ausgangswerten, niemals Gesamt-Krit.',
    reviewedAt:'2026-11-26',sourceIds:Object.freeze(['blizzardHotfix','wowheadScaling','foreverHunterScalingAudit','foreverDbBuild','db2Scaling','blizzardBetaNotes','wowSimsCritLogs'])
  }),
  'pet.crit.inheritance':Object.freeze({
    version:1,
    label:'Krit-Vererbungsquelle',
    evidence:'official',
    evidenceNote:'Blizzard bestätigt die Vererbung aus dem höheren Nahkampf- oder Fernkampf-Kritwert; der numerische Faktor selbst wird dort nicht veröffentlicht.',
    reviewedAt:'2026-11-22',
    sourceIds:Object.freeze(['blizzardHotfix','blizzardBetaNotes'])
  }),
  'pet.autoswing.crit':Object.freeze({
    version:2,
    label:'Autoattack-Krit',
    evidence:'official',
    evidenceNote:'Blizzard bestätigt am 25.11. die Behebung des Fehlers mit 0 % Krit bei normalen Nahkampfangriffen. Keine neue numerische Krit-Chance dokumentiert; Fehlerbericht #556 ist historisch und als behoben markiert.',
    reviewedAt:'2026-11-26',
    validFrom:'2026-11-25',
    sourceIds:Object.freeze(['blizzardHotfix'])
  }),
  'pet.expertise':Object.freeze({
    version:1,
    label:'Expertise bei Begleitern',
    evidence:'official',
    evidenceNote:'Blizzard bestätigt, dass Begleiter korrekt von Expertise profitieren. Ein numerischer Hunter→Pet-Vererbungsfaktor ist nicht dokumentiert.',
    reviewedAt:'2026-11-22',
    sourceIds:Object.freeze(['blizzardHotfix','blizzardBetaNotes'])
  }),
  'pet.focus':Object.freeze({
    version:4,
    label:'Jägerbegleiter-Fokus',
    evidence:'client',
    evidenceNote:'PowerType 3 und Skalierungsaura 415429 bestätigen 100 Basisfokus, +50 Maximalfokus und 10 Fokus/Sekunde in beiden Builds; DB2-Felder werden laufend geprüft.',
    reviewedAt:'2026-11-25',
    sourceIds:Object.freeze(['blizzardHotfix','foreverHunterFocusAudit','foreverSimFocusAudit','foreverDbBuild','db2Focus'])
  }),
  'pet.health.global':Object.freeze({
    version:2,
    label:'Globaler Begleiter-Gesundheitsfaktor',
    evidence:'official',
    evidenceNote:'Blizzard-Hotfix: Pet-Gesundheit von irrtümlich 150 % auf 115 % des normalen Werts korrigiert.',
    reviewedAt:'2026-11-22',
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
  blizzardBetaNotes:Object.freeze({
    label:'Blizzard Forever Beta Development Notes',
    url:'https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /pets?\s+now\s+correctly\s+benefit\s+from\s+expertise/i,
      /pets?[\s\S]{0,180}?only\s+ever\s+inheriting[\s\S]{0,180}?melee\s+critical\s+strike[\s\S]{0,220}?whichever\s+is\s+higher,?\s*melee\s+or\s+ranged/i
    ])
  }),
  wowSimsCritLogs:Object.freeze({
    label:'WoWSims · Forever-Kampflogs EV-0134 (geprüfter Stand)',
    url:'https://raw.githubusercontent.com/wowsims/forever/680ed6f99191ff5884794a3d595176ae1a316353/docs/evidence/EV-0134-hunter-pet-and-hawk-crit-hawk-swing-and-melee-crits-in-live-logs.md',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /count of 2026-11-23 to 2026-11-24/i,
      /\|\s*5\s*\|\s*34\s*\|\s*15,281\s*\/\s*53,245\s*\|\s*28\.7%\s*\|\s*6,235\s*\/\s*25,967\s*\|\s*24\.0%\s*\|\s*16\.1%\s*\|/i,
      /at 5\/5 the white swings['’] 28\.7% is their 12\.8% before the hotfix plus the owners['’] 16\.1%/i,
      /abilities['’] slope is 0\.93\s*\(0\.85 to 1\.02, 386 reports\)/i
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
  foreverHunterScalingAudit:Object.freeze({
    label:'Forever Hunter Wiki · Pet Scaling',
    url:'https://github-wiki-see.page/m/classic-hunter/forever-hunter/wiki/Forever-Hunter-Patch-Notes',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /stamina:\s*1\s+player\s+stamina[\s\S]{0,50}?2\s+pet\s+health/i,
      /armor:\s*pet\s+gains\s+30\s*%\s+of\s+player\s+armor/i,
      /attack\s+power:\s*pet\s+gains\s+10\s*%[\s\S]{0,100}?highest\s+attack\s+power\s+source/i,
      /critical\s+strike:\s*pet\s+inherits\s+100\s*%[\s\S]{0,120}?melee\s+or\s+ranged\s+crit/i
    ])
  }),
  foreverHunterFocusAudit:Object.freeze({
    label:'Forever Hunter Wiki · Pet Focus',
    url:'https://github-wiki-see.page/m/classic-hunter/forever-hunter/wiki/Forever-Hunter-Patch-Notes',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /maximum\s+focus\s+increased[\s\S]{0,80}?100[\s\S]{0,80}?150/i,
      /focus\s+regeneration\s+is\s+now\s+continuous\s+at\s+10\s+focus\s+per\s+second/i
    ])
  }),
  foreverSimFocusAudit:Object.freeze({
    label:'WoW Forever Sim · Client Focus Audit',
    url:'https://raw.githubusercontent.com/gunba/wow-forever-sim/forever/docs/check_dispositions.md',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /powertype[\s\S]{0,120}?focus[\s\S]{0,140}?10\s+focus\/second\s+in\s+combat/i,
      /hunter\s+scaling\s+415429\s+adds\s+50\s+maximum\s+focus\s+to\s+the\s+base\s+100/i
    ])
  }),
  foreverDbBuild:Object.freeze({
    label:'ForeverDB · aktueller Clientbuild',
    url:'https://foreverdb.net/changelog',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /build\s+changelog/i,
      /data\s+from\s+the\s+wow\s+forever\s+client,?\s+build\s+1\.60\.1\.\d+,?\s+extracted\s+\d{4}-\d{2}-\d{2}/i
    ]),
    buildPattern:/data\s+from\s+the\s+wow\s+forever\s+client,?\s+build\s+(1\.60\.1\.\d+),?\s+extracted\s+\d{4}-\d{2}-\d{2}/i
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
  sixtyToolsPets:Object.freeze({
    label:'60.tools · WoW Forever Hunter Pets',
    url:'https://www.60.tools/guides/hunter-pets',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /fox[\s\S]{0,180}?0\s*%[\s\S]{0,100}?\+5\s*%[\s\S]{0,100}?0\s*%[\s\S]{0,140}?meat[\s\S]{0,180}?trickster(?:'|’)?s\s+dance/i
    ])
  }),
  statRatFox:Object.freeze({
    label:'StatRat · Forever Fox Client Passive',
    url:'https://statrat.info/classes/hunter/levelling/',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /fox[\s\S]{0,220}?damage\s*\(physical\)[\s\S]{0,100}?×1\.00[\s\S]{0,100}?health[\s\S]{0,100}?×1\.00[\s\S]{0,120}?base\s+armour[\s\S]{0,100}?×1\.05/i,
      /family\s+passives[\s\S]{0,120}?forever\s+client\s+70374/i
    ])
  }),
  efficientPets:Object.freeze({
    label:'Efficient Games · Forever Pet Training',
    url:'https://efficient.games/wowf/hunter-pets',
    mode:'markers',
    semanticPatterns:Object.freeze([
      /bite\s+rank\s+1\s+1\s+1[\s\S]{0,80}?bite\s+rank\s+2\s+8\s+4/i,
      /trickster(?:'|’)?s\s+dance\s+rank\s+1\s+20\s+10/i,
      /dash\s+rank\s+1\s+30\s+15\s+for\s+boar,\s*cat,\s*fox/i
    ]),
    buildPattern:/1\.60\.1\s*\(build\s+(\d+)\)/i
  })
});

export const PET_RULE_SOURCES=sources;

// Eine neue Regelwerk-Version ist keine pauschale Freigabe aller Quellen.
// Ausschließlich dokumentierte Übergänge dürfen einen alten Fingerabdruck ersetzen;
// die bisherige Semantik muss sich dabei bytegenau (nach Normalisierung) bestätigen.
// ForeverDBs globaler Build-Wächter und sämtliche anderen Quellen bleiben unverändert.
const reviewedBuildTransitions=Object.freeze({
  bindFox:Object.freeze({
    rulebookVersion:'2026.11.25.1',
    fromRulebookVersion:'2026.11.22.2',
    from:Object.freeze(['1.60.1.70959','1.60.1.71037']),
    to:'1.60.1.71091'
  })
});

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
// Exact reviewed additions, not a blanket digest reset. The identical Hunter/Warlock
// sentence can occur twice. The Hawk lines concern summoned hawks, not tamed pets.
const reviewedHotfixLines=Object.freeze([
  'fixed an issue where pets had 0% critical strike chance on melee basic attacks.',
  "summoned hawks now attack the target they're summoned on even if the player's pet is set to passive.",
  'summoned hawks are now dismissed when the dismiss pet spell is completed.'
]);
const fixedCritLine=reviewedHotfixLines[0];
function changedEvidence(before,after){
  const counts=new Map();
  for(const line of before)counts.set(line,(counts.get(line)||0)-1);
  for(const line of after)counts.set(line,(counts.get(line)||0)+1);
  return [...counts].filter(([,n])=>n!==0).map(([line])=>line);
}
function hotfixRuleScope(line){
  // Only unambiguous single-topic sentences are scoped. Unknown, mixed or
  // broad pet changes conservatively block every hotfix-dependent rule.
  if(line===fixedCritLine)return ['pet.scaling','pet.scaling.crit','pet.crit.inheritance','pet.autoswing.crit'];
  if(reviewedHotfixLines.slice(1).includes(line))return [];
  if(/^hunter pets? now (?:gain|gains) (?:a different amount of|\d+\s*%) armor from (?:their|its) owner\.$/.test(line))
    return ['pet.scaling','pet.scaling.armor'];
  if(/^hunter pets? now (?:gain|gains) (?:a different amount of|\d+\s*%) attack power from (?:their|its) owner\.$/.test(line))
    return ['pet.scaling','pet.scaling.ap'];
  if(/^hunter pets? now (?:gain|gains) (?:a different amount of|\d+\s*%) critical strike chance from (?:their|its) owner\.$/.test(line))
    return ['pet.scaling','pet.scaling.crit','pet.crit.inheritance','pet.autoswing.crit'];
  return null;
}
function inspectHotfixEvidence(semantic,previousSource,previousRulebookVersion){
  const evidence=semantic.evidence;
  const digest=sha(evidence.join('\n'));
  const oldDigest=previousSource?.baselineDigest||null;
  let baselineEvidence=Array.isArray(previousSource?.baselineEvidence)&&sha(previousSource.baselineEvidence.join('\n'))===oldDigest
    ?previousSource.baselineEvidence:null;
  // A legacy digest is migrated only when it exactly matches the current
  // evidence minus the specifically reviewed additions. No unknown change
  // can be swallowed by the rulebook version bump.
  const legacy=evidence.filter((line,i)=>i===0||!reviewedHotfixLines.includes(line));
  const approved=Boolean(oldDigest&&['2026.11.25.3','2026.11.26.1','2026.11.26.2'].includes(previousRulebookVersion)&&
    ['2026.11.26.1','2026.11.26.2'].includes(PET_RULEBOOK_VERSION)&&evidence.includes(fixedCritLine)&&sha(legacy.join('\n'))===oldDigest);
  if(!oldDigest||oldDigest===digest||approved)baselineEvidence=evidence;
  const baselineDigest=(!oldDigest||approved)?digest:oldDigest;
  const changed=digest!==baselineDigest;
  let affectedRuleIds=null;
  if(changed&&baselineEvidence){
    const changes=changedEvidence(baselineEvidence,evidence).map(hotfixRuleScope);
    if(changes.every(scope=>scope!==null))affectedRuleIds=[...new Set(changes.flat())];
  }
  return {status:changed?'review_required':'verified',reason:changed?'source_evidence_changed':null,
    digest,baselineDigest,baselineEvidence,affectedRuleIds,
    fixedCritPresent:evidence.includes(fixedCritLine),reviewedTransition:approved?'2026.11.25.3→2026.11.26.1':null};
}
async function inspectSource(id,definition,{fetchImpl=fetch,previousSource=null,previousRulebookVersion=null}={}){
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
        baselineDigest:previousSource?.baselineDigest||null,
        baselineEvidence:previousSource?.baselineEvidence||null,
        baselineBuild:previousSource?.baselineBuild||null
      };
    }
    if(id==='blizzardHotfix')return {id,label:definition.label,url:definition.url,build:null,...inspectHotfixEvidence(semantic,previousSource,previousRulebookVersion)};
    const build=definition.buildPattern?.exec(text)?.[1]||null;
    // Der alte Fox-Marker kann die Buildnummer zusätzlich im Treffertext enthalten.
    // Rekonstruktion ersetzt ausschließlich die erkannte vollständige Buildkennung;
    // alle übrigen normalisierten Zeichen müssen dem alten Digest entsprechen.
    const digestForBuild=value=>{
      const evidence=id==='bindFox'&&build&&value&&value!==build
        ?semantic.evidence.map(marker=>marker.replaceAll(build,value))
        :semantic.evidence;
      return sha([...evidence,value?'build='+value:''].filter(Boolean).join('\n'));
    };
    if(id==='foreverDbBuild'){
      // Nur Build-Erkennung. Die vier abhängigen Regeln benötigen zusätzlich ihre
      // eigenen DB2-Prüfergebnisse; ohne diese ist keine Freigabe möglich.
      return {id,label:definition.label,url:definition.url,build,status:build?'verified':'review_required',reason:build?null:'current_build_unknown',baselineDigest:previousSource?.baselineDigest||null};
    }
    const digest=digestForBuild(build);
    const oldDigest=previousSource?.baselineDigest||null;
    const approval=reviewedBuildTransitions[id];
    // Legacy-Speicherstände kennen baselineBuild noch nicht. Ein explizit geprüfter
    // Vorgänger wird nur akzeptiert, wenn er den gespeicherten Digest exakt reproduziert.
    const baselineBuild=previousSource?.baselineBuild||
      (oldDigest&&previousSource?.build&&digestForBuild(previousSource.build)===oldDigest?previousSource.build:null)||
      (oldDigest&&approval?.from.find(value=>digestForBuild(value)===oldDigest))||null;
    const buildOnly=Boolean(oldDigest&&baselineBuild&&build&&build!==baselineBuild&&digestForBuild(baselineBuild)===oldDigest);
    const approved=Boolean(buildOnly&&(['bindFox','efficientPets'].includes(id)||Boolean(approval&&
      PET_RULEBOOK_VERSION===approval.rulebookVersion&&
      [approval.fromRulebookVersion,approval.rulebookVersion].includes(previousRulebookVersion)&&
      approval.from.includes(baselineBuild)&&build===approval.to)));
    const nextBaseline=approved||!oldDigest?digest:oldDigest;
    const changed=digest!==nextBaseline;
    return {
      id,label:definition.label,url:definition.url,
      status:changed?'review_required':'verified',
      reason:changed?(buildOnly?'source_build_changed':'source_evidence_changed'):null,
      digest,baselineDigest:nextBaseline,baselineBuild:approved||!oldDigest?build:baselineBuild,build
    };
  }catch(error){
    return {
      id,label:definition.label,url:definition.url,status:'source_unavailable',
      reason:String(error?.message||error).slice(0,180),
      baselineDigest:previousSource?.baselineDigest||null,
      baselineEvidence:previousSource?.baselineEvidence||null,
      baselineBuild:previousSource?.baselineBuild||null,
      build:previousSource?.build||null
    };
  }
}
function worstStatus(statuses){
  if(statuses.includes('review_required'))return 'review_required';
  if(statuses.includes('source_unavailable'))return 'source_unavailable';
  return 'verified';
}

export async function verifyPetRulebook({fetchImpl=fetch,previousState=null,now=new Date()}={}){
  const sourceEntries=await Promise.all(Object.entries(sources).map(async([id,definition])=>[
    id,await inspectSource(id,definition,{fetchImpl,previousSource:previousState?.sources?.[id],previousRulebookVersion:previousState?.rulebookVersion})
  ]));
  const sourceResults=Object.fromEntries(sourceEntries);
  const builds=['foreverDbBuild','bindFox'].map(id=>sourceResults[id]?.build).filter(b=>/^1\.60\.1\.\d+$/.test(b||''));
  const latestBuild=builds.sort((a,b)=>Number(b.split('.').at(-1))-Number(a.split('.').at(-1)))[0];
  Object.assign(sourceResults,await inspectPetDb2({build:latestBuild,fetchImpl}));
  const rules=Object.fromEntries(Object.entries(PET_RULES).map(([id,rule])=>{
    const statuses=rule.sourceIds.map(sourceId=>{
      const source=sourceResults[sourceId];
      if(sourceId==='blizzardHotfix'&&source?.status==='review_required'&&
        Array.isArray(source.affectedRuleIds)&&!source.affectedRuleIds.includes(id))return 'verified';
      return source?.status||'source_unavailable';
    });
    if(['pet.autoswing.crit','pet.scaling.crit'].includes(id)&&sourceResults.blizzardHotfix?.fixedCritPresent!==true&&sourceResults.blizzardHotfix?.status!=='source_unavailable')statuses.push('review_required');
    if(rule.requiresNewMeasurement)statuses.push('review_required');
    const status=worstStatus(statuses);
    return [id,{
      id,label:rule.label,version:rule.version,status,
      evidence:rule.evidence||'provisional',
      evidenceLabel:PET_EVIDENCE[rule.evidence||'provisional']?.label||'Vorläufig',
      evidenceNote:rule.evidenceNote||null,
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
      id,label:rule.label,version:rule.version,status:rule.status,
      evidence:rule.evidence||'provisional',evidenceLabel:rule.evidenceLabel||PET_EVIDENCE[rule.evidence||'provisional']?.label||'Vorläufig',
      evidenceNote:rule.evidenceNote||null,reviewedAt:rule.reviewedAt,validFrom:rule.validFrom||null
    }])),
    sources:Object.fromEntries(Object.entries(state.sources||{}).map(([id,source])=>[id,{
      id,label:source.label,url:source.url,status:source.status,build:source.build||null,reason:source.reason||null,
      ...(Array.isArray(source.affectedRuleIds)?{affectedRuleIds:source.affectedRuleIds}:{}),
      ...(source.reviewedTransition?{reviewedTransition:source.reviewedTransition}:{}),
      ...(source.reviewedBuild?{reviewedBuild:source.reviewedBuild,checkedKeys:source.checkedKeys}: {})
    }])),
    history:Array.isArray(state.history)?state.history.slice(-40):[]
  };
}
