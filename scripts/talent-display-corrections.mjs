// Own display-only corrections. No changes to the raw primary proof,
// planner rule packs, or provider reads. Exact reviewed source and class
// fingerprints are mandatory; new snapshots require fresh review.
export const DISPLAY_CORRECTION_SOURCE='9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b';
export const DISPLAY_CORRECTION_CLASSES=Object.freeze({
  2:'8b6b219cd39f596ee51aa72c45ebb81100792323e6c7925f253721c0db9e75ae',
  3:'2fb7fcb0bdd7aeed67de0e09cf62a46c1803be51e7ea089ae3e79107f4d63119',
  11:'6d132472ec288437d5d5fc8c96a31208c8d0c740477c462b3ad3c90ae2616a92'
});
const provenance='Eigene deutsche Effektzusammenfassung nach Blizzard-Hotfix 25.11.2026 und Zephras Build 71139 (kein Originaltext)';
function summarize(node,descriptions,extra={}){
 return {...node,...extra,descriptions,descriptionSources:descriptions.map(()=>provenance),reviewNotice:'An den bestätigten Hotfix angepasst.'};
}
const ranks=(count,fn)=>Array.from({length:count},(_,i)=>fn(i+1));
const decimal=n=>String(n/10).replace('.',',');
const corrections={
  2:{
    105330:n=>summarize(n,['Schwört einem Verbündeten einen Eid für 60 Minuten und verstärkt die Heilung durch Heiliges Licht, Lichtblitz und Heiliger Schock auf diesem Ziel. Nur ein Eid gleichzeitig. Die exakte Heilskalierung ist noch in Prüfung.']),
    113631:n=>({...n,prerequisites:n.prerequisites.map(p=>p.id===105323?{...p,conditionKnown:true}:p),reviewNotice:'Voraussetzung Heiliger Schock durch unabhängigen Clientdatenabgleich bestätigt; keine Live-Lernprobe.'})
  },
  3:{
    104964:n=>({...n,prerequisites:n.prerequisites.filter(p=>p.id===104970),reviewNotice:'Talentverknüpfung nach unabhängigen Clientdaten korrigiert; keine Live-Lernprobe.'})
  },
  11:{
    104923:n=>summarize(n,ranks(5,r=>'Verkürzt die Zauberzeit von Zorn und Sternenfeuer um '+decimal(r)+' Sek. und senkt die Manakosten von Zorn um '+10*r+' %.'),{name:'Zorn des Sternenlichts'}),
    104931:n=>summarize(n,ranks(2,r=>'Erhöht Schaden und kritische Trefferchance von Mondfeuer um '+5*r+' %. Sternenfeuer verliert mit '+50*r+' % Wahrscheinlichkeit keine Zauberzeit durch erlittenen Schaden.'),{name:'Mond und Sterne'}),
    104933:n=>summarize(n,[8,15].map(v=>'Sternenfeuer hat eine Chance von '+v+' %, das Ziel 3 Sek. zu betäuben.'),{maxRank:2,rankSpellIds:n.rankSpellIds.slice(0,2)}),
    104935:n=>summarize(n,[7,13,20].map((v,i)=>'Erhöht die kritische Trefferchance von Zorn um '+v+' %. Zorn verkürzt die Zauberzeit der nächsten zwei Sternenfeuer-Zauber um '+['0,17','0,33','0,50'][i]+' Sek.; bis zu vier Aufladungen, 15 Sek. Dauer.')),
    104936:n=>summarize(n,ranks(5,r=>'Wirkst du Anregen auf ein anderes Ziel, erhältst du selbst '+20*r+' % der Wirkung.'),{name:'Traumzustand',spellId:408258,rankSpellIds:[],profileId:null,iconId:null}),
    104937:n=>summarize(n,['Moonkingestalt erhöht Arkan- und Naturschaden um 10 %, die Auslösechance von Omen der Klarsicht um 100 % und den Rüstungsbeitrag von Gegenständen um 360 %. Gruppen- und Schlachtzugsmitglieder im Umkreis von 45 Metern erhalten 3 % kritische Trefferchance. Die Gestalt schützt vor Verwandlung und verhindert Heilzauber; Gestaltwechsel löst Verwandlung und Bewegungseinschränkungen.'])
  }
};
export function correctTalentDisplay(klass,master){
 const id=klass?.classId,table=corrections[id];
 if(!table||master?.sourceRevision!==DISPLAY_CORRECTION_SOURCE||
    master.classMechanicsRevisions?.[id]!==DISPLAY_CORRECTION_CLASSES[id]||
    master.classes?.[id]!==klass)return klass;
 const found=new Set(klass.trees.flatMap(t=>t.talents.map(n=>n.id)));
 if(!Object.keys(table).every(k=>found.has(Number(k))))return klass;
 return {...klass,displayCorrection:true,
   ...(id===11?{personalMappingUnverified:true}:{}),
   trees:klass.trees.map(t=>({...t,talents:t.talents.map(n=>table[n.id]?table[n.id](n):n)}))};
}
