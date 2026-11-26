// Own display-only corrections. No changes to the raw primary proof,
// planner rule packs, or provider reads. Exact reviewed source and class
// fingerprints are mandatory; new snapshots require fresh review.
export const DISPLAY_CORRECTION_SOURCE='9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b';
export const DISPLAY_CORRECTION_CLASSES=Object.freeze({
  "1": "b413f38ab98a5ea84399c5850307b0f55f81375b76b47fbc49c62cb9fec5b4d4",
  "2": "8b6b219cd39f596ee51aa72c45ebb81100792323e6c7925f253721c0db9e75ae",
  "3": "2fb7fcb0bdd7aeed67de0e09cf62a46c1803be51e7ea089ae3e79107f4d63119",
  "4": "460978c32f241a579ebe88e15894ae8655c4503366666e676202dafd731965ad",
  "5": "a725838248d601b8c1cbc8bf2274a7be7edbadee65a96142e72ae212b9761d2d",
  "7": "c8af4b43c6f2f22e2db491409feffea0bd4d5efd9567b2dac1238407b5c6fa7f",
  "8": "6a4fd74ab6e2e9ac468fbfd98292ea2c6d48859c4ea44a9d672385f36dc474b3",
  "9": "063818bd857c04a7d28fb452866acd28bd760ed840951891160dbe445384e8cf",
  "11": "6d132472ec288437d5d5fc8c96a31208c8d0c740477c462b3ad3c90ae2616a92"
});
const provenance='Eigene deutsche Effektzusammenfassung nach Blizzard-Hotfix 25.11.2026 und Zephras Build 71139 (kein Originaltext)';
function summarize(node,descriptions,extra={}){
 return {...node,...extra,descriptions,descriptionSources:descriptions.map(()=>provenance),reviewNotice:'An den bestätigten Hotfix angepasst.'};
}
const ranks=(count,fn)=>Array.from({length:count},(_,i)=>fn(i+1));
function resolvedText(node,descriptions,notice,sources){
 return {...node,descriptions,descriptionSources:descriptions.map(()=> 'Geprüfte deutsche Effektzusammenfassung (kein Originaltext)'),reviewNotice:notice,reviewSources:sources};
}
const numericReviewIds=Object.freeze({"1":[105935],"2":[105702,105696],"3":[104966],"4":[105735,105709,110866],"5":[105840,105851],"7":[],"8":[105762],"9":[105896,105909],"11":[]});
const numericNotice='Zahlenwerte im Quelltext sind Tooltip-Angaben. Abweichende Skalierungswerte oder die tatsächliche serverseitige Wirkung sind noch nicht abschließend bestätigt.';

const decimal=n=>String(n/10).replace('.',',');
const corrections={
  1:{
    105935:n=>resolvedText(n,['Verlangsamt nahe Gegner laut Talent- und Zauberdetails in einem Radius von 10 Metern 6 Sek. lang um 50 %.'],'Der Grundradius, die Dauer und der Verlangsamungseffekt sind anhand der aktuellen Zauberdetails belegt; keine eigene Reichweitenmessung.',[{label:'Zephras',url:'https://zephras.com/forever/enUS/spell/12323/'},{label:'Wowhead',url:'https://www.wowhead.com/forever/spell%3D12323/piercing-howl'}])
  },
  2:{
    105330:n=>summarize(n,['Schwört einem Verbündeten einen Eid für 60 Minuten und verstärkt die Heilung durch Heiliges Licht, Lichtblitz und Heiliger Schock auf diesem Ziel. Nur ein Eid gleichzeitig. Die exakte Heilskalierung ist noch in Prüfung.']),
    113631:n=>({...n,prerequisites:n.prerequisites.map(p=>p.id===105323?{...p,conditionKnown:true}:p),reviewNotice:'Voraussetzung Heiliger Schock durch unabhängigen Clientdatenabgleich bestätigt; keine Live-Lernprobe.'})
  },
  3:{
    104964:n=>({...n,prerequisites:n.prerequisites.filter(p=>p.id===104970),reviewNotice:'Talentverknüpfung nach unabhängigen Clientdaten korrigiert; keine Live-Lernprobe.'})
  },
  7:{
    104741:n=>resolvedText(n,ranks(5,r=>'Schaden durch Nahkampfangriffe kann einen Stapel erzeugen, der Zauberzeit und Manakosten des nächsten Blitzschlags um 20 % verringert. Bis zu fünf Stapel, 30 Sek. Dauer. Auf Rang '+r+' beträgt die vorgesehene Auslöserate laut Hotfix '+(5+r)+' pro Minute; die Chance pro Angriff hängt vom Waffentempo ab.'),'Die neue Rangstaffelung stammt aus den offiziellen Hotfixes. Die Auslöserate ist ein Regelwert, keine garantierte Trefferzahl pro Minute.',[{label:'Blizzard',url:'https://worldofwarcraft.blizzard.com/de-de/news/24315281/wow-forever-hotfixes-november-13-2026'},{label:'WoW Forever Talents',url:'https://wowforevertalents.com/shaman/talents/maelstrom-weapon/'}])
  },
  8:{
    105764:n=>resolvedText(n,[1,2].map(r=>'Kälteeffekte haben laut aktuellem Clienttext eine Chance von 15 %, Eisige Finger auszulösen. '+(r===1?'Der nächste gewirkte Zauber wirkt':'Die nächsten zwei gewirkten Zauber wirken')+' so, als wäre das Ziel eingefroren. Der Effekt hält 15 Sek. an.'),'Unaufgelöste Mehrzahl im deutschen Quelltext bereinigt; die Zahl der Zauber ist quellenübergreifend belegt. Auslösechance und tatsächliches Verhalten sind nicht serverseitig gemessen.',[{label:'TalentsForever',url:'https://talentsforever.com/mage/talents/fingers-of-frost'},{label:'METAMMO',url:'https://metammo.com/wow-forever/abilities/fingers-of-frost-mage'}])
  },
  11:{
    113563:n=>resolvedText(n,['Wandelt in Katzengestalt Mana sofort in 40 Energie um. Effekte, die Gestaltwandel verbilligen, senken auch die Kosten von Machtverschiebung.'],'Die Energieangabe ist durch Blizzard und weitere Quellen belegt; die genaue Manakostenberechnung wird nicht als gemessener Serverwert angegeben.',[{label:'Blizzard',url:'https://news.blizzard.com/de-de/article/24301515/world-of-warcraft-forever-klassenuebersicht-jaeger-und-druide'},{label:'Wowhead',url:'https://www.wowhead.com/forever/de/spell%3D1322605/machtverschiebung'}]),
    104923:n=>summarize(n,ranks(5,r=>'Verkürzt die Zauberzeit von Zorn und Sternenfeuer um '+decimal(r)+' Sek. und senkt die Manakosten von Zorn um '+10*r+' %.'),{name:'Zorn des Sternenlichts'}),
    104924:n=>summarize(n,ranks(5,r=>'Erhöht periodischen Schaden und Heilung um '+2*r+' %. Seit dem Hotfix vom 25.11. gilt dies auch korrekt für Hurrikan und Gelassenheit.')),
    104931:n=>summarize(n,ranks(2,r=>'Erhöht Schaden und kritische Trefferchance von Mondfeuer um '+5*r+' %. Sternenfeuer verliert mit '+50*r+' % Wahrscheinlichkeit keine Zauberzeit durch erlittenen Schaden.'),{name:'Mond und Sterne'}),
    104933:n=>summarize(n,[8,15].map(v=>'Sternenfeuer hat eine Chance von '+v+' %, das Ziel 3 Sek. zu betäuben.'),{maxRank:2,rankSpellIds:n.rankSpellIds.slice(0,2)}),
    104935:n=>summarize(n,[7,13,20].map((v,i)=>'Erhöht die kritische Trefferchance von Zorn um '+v+' %. Zorn verkürzt die Zauberzeit der nächsten zwei Sternenfeuer-Zauber um '+['0,17','0,33','0,50'][i]+' Sek.; bis zu vier Aufladungen, 15 Sek. Dauer.')),
    104936:n=>summarize(n,ranks(5,r=>'Wirkst du Anregen auf ein anderes Ziel, erhältst du selbst '+20*r+' % der Wirkung.'),{name:'Traumzustand',spellId:408258,rankSpellIds:[],profileId:null,iconId:null}),
    104937:n=>summarize(n,['Mondkingestalt erhöht Arkan- und Naturschaden um 10 %, die Auslösechance von Omen der Klarsicht um 100 % und den Rüstungsbeitrag von Gegenständen um 360 %. Gruppen- und Schlachtzugsmitglieder im Umkreis von 45 Metern erhalten 3 % kritische Trefferchance. Die Gestalt schützt vor Verwandlung und verhindert Heilzauber; Gestaltwechsel löst Verwandlung und Bewegungseinschränkungen.'])
  }
};
// The source's shortened labels are preserved for exact Armory matching.
function treeLabel(tree,classId){
 const names=classId===7?{11363:['Verstärk','Verstärkung'],11362:['Wiederherst','Wiederherstellung']}:classId===11?{11340:['Wiederherst','Wiederherstellung']}:null;
 const alias=names?.[tree.id];
 return alias&&tree.name===alias[0]?{sourceName:tree.name,name:alias[1]}:{};
}
export function correctTalentDisplay(klass,master){
 const id=klass?.classId,table=corrections[id]??{},numericIds=numericReviewIds[id]??[];
 if((!Object.keys(table).length&&!numericIds.length)||master?.sourceRevision!==DISPLAY_CORRECTION_SOURCE||
    master.classMechanicsRevisions?.[id]!==DISPLAY_CORRECTION_CLASSES[id]||
    master.classes?.[id]!==klass)return klass;
 const found=new Set(klass.trees.flatMap(t=>t.talents.map(n=>n.id)));
 if(!Object.keys(table).every(k=>found.has(Number(k))))return klass;
 return {...klass,displayCorrection:true,
   ...(id===11?{personalMappingUnverified:true,personalMappingUnverifiedTalentIds:[104936]}:{}),
   trees:klass.trees.map(t=>({...t,...treeLabel(t,id),talents:t.talents.map(n=>{
     const node=table[n.id]?table[n.id](n):n;
     return numericIds.includes(n.id)?{...node,reviewNotice:[node.reviewNotice,numericNotice].filter(Boolean).join(' ')}:node;
   })}))};
}
