import {HUNTER_PET_RULEBOOK_VERSION,hunterPetFamily,hunterPetCombatProfile,hunterPetMechanics} from './hunter-pets.js';
const cards=document.querySelector("#cards");const summary=document.querySelector("#summary");const status=document.querySelector("#status");const freshness=document.querySelector("#dataFreshness");const button=document.querySelector("#refreshButton");
const esc=v=>String(v??"nicht verfügbar").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const classColors={'Magier':'mage','Jäger':'hunter','Druide':'druid'};
const portraitScenes={
  'cole-dalton':{className:'scene-cole',firstName:'Cole',epithet:'Der Runenreiter',icon:'rune'},
  'dolly-dalton':{className:'scene-dolly',firstName:'Dolly',epithet:'Das Adlerauge',icon:'crosshair'},
  'chucky-dalton':{className:'scene-chucky',firstName:'Chucky',epithet:'Die Windsurferin',icon:'leaf'},
  'viola-dalton':{className:'scene-viola',firstName:'Viola',epithet:'Die Sonnenwandlerin',icon:'sun'}
};
const badgeIcons={
  rune:'<svg class="portrait-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1.8 15.1 8.9 22.2 12l-7.1 3.1L12 22.2l-3.1-7.1L1.8 12l7.1-3.1L12 1.8Z"/><path d="M12 7v10M7 12h10"/></svg>',
  crosshair:'<svg class="portrait-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="2.4"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></svg>',
  leaf:'<svg class="portrait-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2.5C10 2.5 3.5 7 3.5 14a6.5 6.5 0 0 0 6.5 6.5C17 20.5 21.5 13 21.5 2.5Z"/><path d="M3 22c2.1-5.2 6.5-9.3 13.3-12.2"/></svg>',
  sun:'<svg class="portrait-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.1"/><path d="M12 1.3v4M12 18.7v4M1.3 12h4M18.7 12h4M4.45 4.45l2.85 2.85m9.4 9.4 2.85 2.85M19.55 4.45 16.7 7.3m-9.4 9.4-2.85 2.85"/></svg>'
};
function portraitBadge(scene){
  if(!scene)return '';
  return '<span class="portrait-badge" aria-hidden="true">'+
    '<span class="portrait-badge-symbol">'+badgeIcons[scene.icon]+'</span>'+
    '<span class="portrait-badge-copy"><span class="portrait-badge-firstname">'+esc(scene.firstName)+'</span>'+
    '<span class="portrait-badge-epithet">'+esc(scene.epithet)+'</span></span></span>';
}
const mainStatNames=['Gesundheit','Mana','Stärke','Intelligenz','Beweglichkeit','Ausdauer','Kritische Trefferchance','Willenskraft','Waffen-DPS','Manaregeneration'];
const detailStatNames=['Rüstung','Angriffskraft','Zaubermacht','Nahkampf-Krit','Fernkampf-Krit','Zauber-Krit','Ausweichen','Parieren','Blocken','Angriffsgeschwindigkeit'];
const percentStatNames=new Set(['Kritische Trefferchance','Nahkampf-Krit','Fernkampf-Krit','Zauber-Krit','Ausweichen','Parieren','Blocken']);
const statIcons={
  'Gesundheit':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3.5 15.2 3.5 8.9A4.4 4.4 0 0 1 12 6.7a4.4 4.4 0 0 1 8.5 2.2c0 6.3-8.5 11.6-8.5 11.6Z"/></svg>',
  'Mana':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8M10 3v4l-4.6 8.1A3.9 3.9 0 0 0 8.8 21h6.4a3.9 3.9 0 0 0 3.4-5.9L14 7V3"/><path d="M7.8 15h8.4"/></svg>',
  'Stärke':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>',
  'Intelligenz':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M8.2 14.7A6 6 0 1 1 15.8 14.7c-1.1.8-1.5 1.6-1.6 2.3h-4.4c-.1-.7-.5-1.5-1.6-2.3Z"/></svg>',
  'Beweglichkeit':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 10.8c1.3-1 4.3-1 5.6 0 1.8 1.4 3.2 4.1 1.7 6.2-1.2 1.7-3.1.4-4.5.4s-3.3 1.3-4.5-.4c-1.5-2.1-.1-4.8 1.7-6.2Z"/><circle cx="6.4" cy="8" r="1.6"/><circle cx="10.1" cy="5.3" r="1.6"/><circle cx="13.9" cy="5.3" r="1.6"/><circle cx="17.6" cy="8" r="1.6"/></svg>',
  'Ausdauer':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 19 6v5.2c0 4.4-2.7 7.9-7 10-4.3-2.1-7-5.6-7-10V6l7-3.2Z"/><path d="M12 7v8M8 11h8"/></svg>',
  'Kritische Trefferchance':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="2"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg>',
  'Willenskraft':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m18.5 15 .8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7Z"/></svg>',
  'Waffen-DPS':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.7 3.2 6.1-1.1-1.1 6.1-9.1 9.1"/><path d="m8.9 13.6 1.5 1.5"/><path d="m7.2 15.3-3.9 3.9 1.5 1.5 3.9-3.9"/><path d="M14 7.3 16.7 10"/></svg>',
  'Manaregeneration':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5S6.5 8.6 6.5 13a5.5 5.5 0 0 0 8.7 4.5"/><path d="M14.2 11.2a4.2 4.2 0 1 1-.1 7.6"/><path d="m12.8 16.4 1.3 2.4 2.4-1.3"/></svg>'
};
function formatStatValue(name,value){
  if(value==null||value==='')return '–';
  const n=Number(value);
  if(!Number.isFinite(n))return String(value);
  if(percentStatNames.has(name))return new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n)+' %';
  return new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(n);
}
function statTile(name,value,stale=false,icon=false){
  return '<div class="stat-tile '+(icon?'stat-tile-main':'stat-tile-detail')+'">'+
    (icon?'<span class="stat-icon">'+(statIcons[name]||'')+'</span>':'')+
    '<span class="stat-copy"><small>'+esc(name)+(stale?' <span class="stale-value" title="Nicht im letzten Blizzard-Abruf bestätigt">· letzter Stand</span>':'')+'</small>'+
    '<strong>'+esc(formatStatValue(name,value))+'</strong></span></div>';
}
const characterStatExcludedNames=new Set(['Gegenstandsstufe']);
function characterStatNames(chars=[]){
  const ordered=[...mainStatNames,...detailStatNames],seen=new Set(ordered);
  for(const character of chars){
    for(const name of Object.keys(character?.stats||{})){
      if(characterStatExcludedNames.has(name)||seen.has(name))continue;
      seen.add(name);ordered.push(name);
    }
  }
  return ordered;
}
function statsPanel(c,open=false){
  const s=c.stats||{};
  const currentKeys=Array.isArray(c.statsFreshKeys)?c.statsFreshKeys:(c.statsVerified?Object.keys(s):[]);
  const verified=new Set(c.scrapeOk===false?[]:currentKeys);
  const isStale=name=>Object.hasOwn(s,name)&&!verified.has(name);
  const main=mainStatNames.map(name=>statTile(name,s[name],isStale(name),true)).join('');
  const rest=characterStatNames([c]).filter(name=>!mainStatNames.includes(name)).map(name=>statTile(name,s[name],isStale(name),false)).join('');
  return '<div class="section character-stats"><h3>Charakterwerte'+(c.scrapeOk!==false&&c.statsVerified?'':' · teilweise letzter Stand')+'</h3>'+
    '<div class="stat-grid stat-grid-main">'+main+'</div>'+
    '<details class="details attributes" data-detail-key="'+esc(c.slug)+':stats"'+(open?' open':'')+'>'+
      '<summary>Weitere Charakterwerte anzeigen</summary><div class="stat-grid stat-grid-detail">'+rest+'</div></details></div>';
}
const itemQualityNames={POOR:'Schlecht',COMMON:'Gewöhnlich',UNCOMMON:'Ungewöhnlich',RARE:'Selten',EPIC:'Episch',LEGENDARY:'Legendär',ARTIFACT:'Artefakt',HEIRLOOM:'Erbstück'};
const itemQualityClasses={POOR:'quality-poor',COMMON:'quality-common',UNCOMMON:'quality-uncommon',RARE:'quality-rare',EPIC:'quality-epic',LEGENDARY:'quality-legendary',ARTIFACT:'quality-artifact',HEIRLOOM:'quality-heirloom'};

const row=(a,b)=>`<div class="row"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;
// WoW Classic/Forever: ein gemeinsamer Maßstab von 0 bis 300, vier Stufen zu je 75.
const professionStages=[
  {end:75,rank:'Lehrling'},
  {end:150,rank:'Geselle'},
  {end:225,rank:'Experte'},
  {end:300,rank:'Fachmann'}
];
function professionRank(max){
  return professionStages.find(stage=>stage.end===max)?.rank||'Rang unbekannt';
}
function professionScale(){
  return '<div class="profession-scale" aria-label="Berufsskala: 75, 150, 225, 300">'+
    professionStages.map(stage=>'<span title="'+esc(stage.rank)+'">'+stage.end+'</span>').join('')+
    '</div>';
}
function knowledgeLabel(name){
  if(name==='Bergbau')return 'Verhüttung & Fähigkeiten';
  if(['Kräuterkunde','Kürschnerei','Angeln'].includes(name))return 'Fähigkeiten & Camping';
  return 'Rezepte & Fähigkeiten';
}
function craftedQuantityText(quantity){
  if(!quantity)return '';
  const min=Number(quantity.minimum),max=Number(quantity.maximum),value=Number(quantity.value);
  if(Number.isFinite(value)&&value>1)return ' × '+Math.round(value);
  if(Number.isFinite(min)&&Number.isFinite(max)&&min!==max)return ' × '+Math.round(min)+'–'+Math.round(max);
  return '';
}
function recipeRows(recipes=[]){
  if(!recipes.length)return '<p class="knowledge-empty">Blizzard meldet derzeit keine einzelnen Kenntnisse.</p>';
  return '<div class="knowledge-list">'+recipes.map(recipe=>{
    const recipeName=String(recipe?.name||'').trim();
    const craftedName=String(recipe?.craftedItem?.name||'').trim();
    const craftedQuantity=craftedQuantityText(recipe?.craftedQuantity);
    const sameAsRecipe=Boolean(recipeName&&craftedName&&recipeName.localeCompare(craftedName,'de',{sensitivity:'base'})===0);
    const crafted=craftedName&&(!sameAsRecipe||craftedQuantity)
      ?'<span class="recipe-crafted">Erstellt: <strong>'+esc(craftedName)+esc(craftedQuantity)+'</strong></span>'
      :'';
    const reagents=(recipe?.reagents||[]).filter(x=>x?.name).map(x=>(Number.isFinite(Number(x.quantity))?Math.round(Number(x.quantity))+'× ':'')+x.name);
    const materials=reagents.length?'<span class="recipe-reagents">Materialien: '+esc(reagents.join(' · '))+'</span>':'';
    const hasDetails=Boolean(crafted||materials);
    return '<div class="recipe-entry">'+
      '<div class="recipe-name"><span class="recipe-dot" aria-hidden="true"></span><strong>'+esc(recipeName||'Kenntnis')+'</strong></div>'+
      (hasDetails?'<div class="recipe-meta">'+crafted+materials+'</div>':'')+
      '</div>';
  }).join('')+'</div>';
}
const gatheringProfessions=new Set(['Kräuterkunde','Kürschnerei','Bergbau']);
const secondaryProfessionOrder=new Map([['Angeln',100],['Kochkunst',110],['Erste Hilfe',120]]);
function sortProfessionsForDisplay(list=[]){
  return list.map((profession,index)=>({profession,index})).sort((a,b)=>{
    const an=a.profession?.name||'',bn=b.profession?.name||'';
    const ap=secondaryProfessionOrder.has(an)?secondaryProfessionOrder.get(an):(gatheringProfessions.has(an)?0:10);
    const bp=secondaryProfessionOrder.has(bn)?secondaryProfessionOrder.get(bn):(gatheringProfessions.has(bn)?0:10);
    return ap-bp||a.index-b.index;
  }).map(entry=>entry.profession);
}
function professionRows(list=[],previousOnly=false,slug='',openDetails=new Set()){
  if(!list.length)return row('Berufe','nicht verfügbar');
  return sortProfessionsForDisplay(list).map(p=>{
    const current=p.current==null?NaN:Number(p.current),max=p.max==null?NaN:Number(p.max);
    const valid=Number.isFinite(current)&&Number.isFinite(max)&&max>0;
    const currentSkill=valid?Math.max(0,current):0;
    const rank=valid?professionRank(max):'Rang unbekannt';
    const fraction=valid?Math.round(current)+'/'+Math.round(max):'–/–';
    const label=String(p.name||'Beruf')+(p.unverified||previousOnly?' · letzter Stand':'');
    const stageSegments=professionStages.map((stage,index)=>{
      const from=index*75,unlocked=valid&&max>from;
      const pct=valid?Math.max(0,Math.min(100,((currentSkill-from)/75)*100)):0;
      return '<span class="profession-segment '+(unlocked?'is-unlocked':'is-locked')+'">'+
        '<span class="profession-segment-fill" style="width:'+pct.toFixed(2)+'%"></span></span>';
    }).join('');
    const recipes=Array.isArray(p.knownRecipes)?p.knownRecipes:[];
    const detailKey=slug+':profession:'+(p.id||p.name||'unknown');
    const knowledge=recipes.length
      ?'<details class="profession-knowledge" data-detail-key="'+esc(detailKey)+'"'+(openDetails.has(detailKey)?' open':'')+'>'+
        '<summary>'+esc(knowledgeLabel(p.name))+' · '+recipes.length+'</summary>'+recipeRows(recipes)+'</details>'
      :'';
    return '<div class="profession">'+
      '<div class="profession-head"><span class="profession-label">'+esc(label)+'</span>'+
      '<span class="profession-rank">'+esc(rank)+'</span></div>'+
      '<div class="profession-track" role="progressbar" aria-label="'+esc(label)+'" aria-valuemin="0" aria-valuemax="300" aria-valuenow="'+(valid?Math.max(0,Math.min(300,Math.round(currentSkill))):0)+'" aria-valuetext="'+esc(valid?fraction+' · '+rank:'kein bestätigter Stand')+'">'+
      stageSegments+
      '<span class="profession-overlay" aria-hidden="true">'+esc(fraction)+'</span>'+
      '</div>'+knowledge+'</div>';
  }).join('');
}

function professionsPanel(c,openDetails=new Set()){
  return '<div class="section professions-section"><h3>Berufe'+(c.professionDetailsVerified===false?' · Kenntnisse letzter bekannter Stand':'')+'</h3>'+
    professionScale()+'<div class="professions-list">'+professionRows(c.professions,c.scrapeOk===false,c.slug,openDetails)+'</div>'+
    '<div class="profession-legend"><span>Erreicht</span><span>Freigeschaltet</span><span>Noch gesperrt</span></div></div>';
}

function talentPanel(c){
  const trees=Array.isArray(c.talentDetails)?c.talentDetails:[];
  const active=trees.filter(tree=>Number(tree.spentPoints)>0||(tree.talents||[]).length);
  if(!active.length){
    return '<div class="section"><h3>Talente'+(c.talentDetailsVerified===false?' · letzter bekannter Stand':'')+'</h3><div class="rows">'+row('Verteilung',c.talents||'noch keine verteilt')+'</div></div>';
  }
  const body=active.map(tree=>'<div class="talent-tree">'+
    '<div class="talent-tree-head"><strong>'+esc(tree.name)+'</strong><span>'+esc(tree.spentPoints)+' '+(Number(tree.spentPoints)===1?'Punkt':'Punkte')+'</span></div>'+
    '<div class="talent-list">'+(tree.talents||[]).map(talent=>'<div class="talent-entry">'+
      '<div class="talent-entry-head"><strong>'+esc(talent.name)+'</strong>'+(Number.isFinite(Number(talent.rank))?'<span>Rang '+esc(talent.rank)+'</span>':'')+'</div>'+
      (talent.description?'<p>'+esc(talent.description)+'</p>':'')+
    '</div>').join('')+'</div></div>').join('');
  return '<div class="section talents-section"><h3>Talente'+(c.talentDetailsVerified===false?' · letzter bekannter Stand':'')+'</h3><div class="talent-trees">'+body+'</div></div>';
}

const reputationStages=[
  {name:'Hasserfüllt',weight:1},{name:'Feindselig',weight:1},{name:'Unfreundlich',weight:1},{name:'Neutral',weight:1},
  {name:'Freundlich',weight:2},{name:'Wohlwollend',weight:4},{name:'Respektvoll',weight:7},{name:'Ehrfürchtig',weight:.333}
];
function reputationStageIndex(standing={}){
  const byName=reputationStages.findIndex(stage=>stage.name===standing.name);
  if(byName>=0)return byName;
  const tier=Number(standing.tier);
  return Number.isInteger(tier)&&tier>=0&&tier<reputationStages.length?tier:-1;
}
function reputationPanel(c){
  const list=Array.isArray(c.reputations)?c.reputations:[];
  if(!list.length)return '';
  const columns='repeat(4,minmax(0,1fr)) 2fr 4fr 7fr minmax(7px,.333fr)';
  const rows=list.map(rep=>{
    const standing=rep.standing||{},index=reputationStageIndex(standing);
    const value=Number(standing.value),max=Number(standing.max);
    const valid=Number.isFinite(value)&&Number.isFinite(max)&&max>0;
    const segments=reputationStages.map((stage,i)=>{
      const pct=index<0?0:i<index?100:i===index&&valid?Math.max(0,Math.min(100,value/max*100)):0;
      return '<span class="reputation-segment '+(i<=index?'is-reached':'is-future')+'" title="'+esc(stage.name)+'">'+
        '<span class="reputation-segment-fill" style="width:'+pct.toFixed(2)+'%"></span></span>';
    }).join('');
    const fraction=valid?Math.round(value)+'/'+Math.round(max):'–/–';
    return '<div class="reputation">'+
      '<div class="reputation-head"><span>'+esc(rep.name)+'</span><strong>'+esc(standing.name||'Unbekannt')+'</strong></div>'+
      '<div class="reputation-track" style="grid-template-columns:'+columns+'" role="progressbar" aria-label="'+esc(rep.name)+'" aria-valuemin="0" aria-valuemax="'+esc(valid?max:0)+'" aria-valuenow="'+esc(valid?Math.round(value):0)+'" aria-valuetext="'+esc(fraction+' · '+(standing.name||'Unbekannt'))+'">'+
        segments+'<span class="reputation-overlay" aria-hidden="true">'+esc(fraction)+'</span>'+
      '</div></div>';
  }).join('');
  return '<div class="section reputation-section"><h3>Ruf'+(c.reputationsVerified===false?' · letzter bekannter Stand':'')+'</h3><div class="reputations-list">'+rows+'</div></div>';
}

const xpToNextByLevel=[null,400,900,1400,2100,2800,3600,4500,5400,6500,7600,8800,10100,11400,12900,14400,16000,17700,19400,21300,23200,25200,27300,29400,31700,34000,36400,38900,41400,44300,47400,50800,54500,58600,62800,67100,71600,76100,80800,85700,90700,95800,101000,106300,111800,117500,123200,129100,135100,141200,147500,153900,160400,167100,173900,180800,187900,195000,202300,209800,null];
function totalXpAtLevel(level){
  const target=Math.max(1,Math.min(60,Number(level)||1));
  let total=0;
  for(let current=1;current<target;current++)total+=Number(xpToNextByLevel[current])||0;
  return total;
}
function experienceProgress(c){
  const level=Number(c.level),current=Number(c.experience);
  if(!Number.isInteger(level)||level<1||!Number.isFinite(current))return '';
  if(level>=60){
    return '<div class="experience-progress"><div class="experience-levels"><strong>Level 60</strong><span>Maximalstufe</span></div></div>';
  }
  const needed=Number(xpToNextByLevel[level]);
  if(!Number.isFinite(needed)||needed<=0)return '';
  const safe=Math.max(0,Math.min(needed,current));
  const pct=safe/needed*100;
  const nf=new Intl.NumberFormat('de-DE');
  return '<div class="experience-progress">'+
    '<div class="experience-track" role="progressbar" aria-label="Erfahrung bis Level '+esc(level+1)+'" aria-valuemin="0" aria-valuemax="'+esc(needed)+'" aria-valuenow="'+esc(Math.round(safe))+'" aria-valuetext="'+esc(nf.format(safe)+' von '+nf.format(needed)+' XP')+'">'+
      '<span class="experience-fill" style="width:'+pct.toFixed(2)+'%"></span>'+
      '<span class="experience-overlay" aria-hidden="true">'+esc(nf.format(safe)+' / '+nf.format(needed)+' XP')+'</span>'+
    '</div>'+
    '<div class="experience-levels"><strong>Level '+esc(level)+'</strong><strong>Level '+esc(level+1)+'</strong></div>'+
  '</div>';
}

const petRenderPattern=/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/npcs\/zoom\/creature-display-\d+\.jpg$/;
const petIconPattern=/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/icons\/\d+\/\d+\.jpg$/;
function signedPercent(value){
  const n=Number(value);
  if(!Number.isFinite(n))return '–';
  if(n===0)return '±0 %';
  return (n>0?'+':'')+new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(n)+' %';
}
function petAbilityCard(ability,petLevel){
  const ranks=[...(ability?.ranks||[])].sort((a,b)=>a.level-b.level);
  const available=ranks.filter(rank=>Number(rank.level)<=petLevel).at(-1)||null;
  const next=ranks.find(rank=>Number(rank.level)>petLevel)||null;
  const first=ranks[0]||null;
  const state=available?'is-available':'is-locked';
  const status=available
    ?'Bis Rang '+available.rank+' trainierbar'+(next?' · nächster Rang ab Stufe '+next.level:' · höchster Rang erreicht')
    :(first?'Ab Begleiterstufe '+first.level+' trainierbar':'Ausbildungsstufe unbekannt');
  return '<div class="pet-ability '+state+'">'+
    '<div class="pet-ability-head"><div><strong>'+esc(ability.name)+'</strong><span>'+esc(ability.kind||'Fähigkeit')+'</span></div>'+
      '<span class="pet-ability-status">'+(available?'Verfügbar':'Gesperrt')+'</span></div>'+
    '<p>'+esc(status)+'</p>'+
    (ability.description?'<p class="pet-ability-description">'+esc(ability.description)+(ability.cooldown?' · Abklingzeit '+esc(ability.cooldown):'')+'</p>':'')+
    '<small>Nicht mit „bereits gelernt“ gleichzusetzen.</small>'+
  '</div>';
}
let displayedPetRules=null;
function petRuleStatus(ruleId){
  if(displayedPetRules?.rulebookVersion!==HUNTER_PET_RULEBOOK_VERSION)return 'source_unavailable';
  return displayedPetRules?.rules?.[ruleId]?.status||'source_unavailable';
}
function petRuleVerified(ruleId){return petRuleStatus(ruleId)==='verified'}
function petRuleBanner(){
  const state=displayedPetRules;
  if(!state||state.rulebookVersion!==HUNTER_PET_RULEBOOK_VERSION){
    return '<div class="pet-rule-banner is-unverified"><strong>Regelprüfung noch nicht bestätigt</strong><span>Regelbasierte Werte bleiben ausgeblendet, bis der Server genau diese Regelwerk-Version gegen die Forever-Quellen geprüft hat.</span></div>';
  }
  const rules=Object.values(state.rules||{});
  const verified=rules.filter(rule=>rule.status==='verified').length;
  const checked=Number.isFinite(Date.parse(state.checkedAt||''))
    ?new Date(state.checkedAt).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'})
    :'unbekannt';
  if(state.overall==='verified'){
    return '<div class="pet-rule-banner is-verified"><strong>Regelstand bestätigt · '+verified+'/'+rules.length+'</strong><span>Geprüft '+esc(checked)+' · Regelwerk '+esc(state.rulebookVersion||'–')+'</span></div>';
  }
  const review=rules.some(rule=>rule.status==='review_required');
  return '<div class="pet-rule-banner '+(review?'is-review':'is-unverified')+'"><strong>'+(review?'Regeländerung erkannt':'Regelprüfung unvollständig')+'</strong><span>Betroffene regelbasierte Werte sind vorsorglich ausgeblendet. Blizzard-Livedaten zu Slydris und Stall bleiben davon unberührt. · Geprüft '+esc(checked)+'</span></div>';
}
function petRuleUnavailable(title){
  return '<div class="pet-rule-blocked"><strong>'+esc(title)+'</strong><span>Vorübergehend nicht angezeigt, weil die zugrunde liegende Forever-Regel nicht als aktuell bestätigt ist.</span></div>';
}

function hunterPetMiniCard(pet){
  const icon=petIconPattern.test(pet?.iconUrl||'')?'<img src="'+esc(pet.iconUrl)+'" alt="" loading="lazy">':'<span class="pet-mini-placeholder" aria-hidden="true">•</span>';
  return '<div class="pet-mini">'+icon+'<div><strong>'+esc(pet?.name||'Begleiter')+'</strong>'+
    '<span>'+esc(pet?.family?.name||'Familie unbekannt')+(Number.isInteger(Number(pet?.level))?' · Stufe '+esc(pet.level):'')+'</span></div></div>';
}
function petNumber(value,{minimumFractionDigits=0,maximumFractionDigits=2}={}){
  const n=Number(value);
  return Number.isFinite(n)?new Intl.NumberFormat('de-DE',{minimumFractionDigits,maximumFractionDigits}).format(n):'–';
}
function hunterPetCombatPanel(c,active){
  if(!active)return '';
  const profile=hunterPetCombatProfile(c);
  const scalingAllowed=petRuleVerified('pet.scaling');
  const focusAllowed=petRuleVerified('pet.focus');
  const healthRuleAllowed=petRuleVerified('pet.health.global');
  const inherited=profile.inherited||{};
  const inheritedRows=[];
  if(scalingAllowed&&inherited.health){
    inheritedRows.push('<div class="pet-combat-stat"><small>Gesundheit aus Dolly</small><strong>+'+esc(petNumber(inherited.health.value))+'</strong><span>'+esc(petNumber(inherited.health.input))+' Ausdauer × 2</span></div>');
  }
  if(scalingAllowed&&inherited.armor){
    inheritedRows.push('<div class="pet-combat-stat"><small>Rüstung aus Dolly</small><strong>+'+esc(petNumber(inherited.armor.value,{maximumFractionDigits:1}))+'</strong><span>'+esc(petNumber(inherited.armor.input))+' Rüstung × 30 % · rechnerischer Anteil vor Server-Rundung</span></div>');
  }
  if(scalingAllowed&&inherited.crit){
    inheritedRows.push('<div class="pet-combat-stat"><small>Krit aus Dolly</small><strong>+'+esc(petNumber(inherited.crit.value,{minimumFractionDigits:2,maximumFractionDigits:2}))+' %-Pkt.</strong><span>100 % des aktuellen Blizzard-Armory-Kritwerts</span></div>');
  }
  const inheritedBlock=scalingAllowed
    ?'<div class="pet-combat-grid">'+inheritedRows.join('')+
      '<div class="pet-combat-stat is-unavailable"><small>Angriffskraft aus Dolly</small><strong>–</strong><span>'+esc(inherited.attackPower?.reason||'Der benötigte Ausgangswert ist online nicht eindeutig verfügbar.')+'</span></div></div>'
    :petRuleUnavailable('Vererbte Kampfwerte vorübergehend gesperrt');

  const modifiers=[];
  if(healthRuleAllowed){
    modifiers.push('<div class="pet-combat-stat"><small>Forever-Gesundheitsfaktor</small><strong>'+esc(profile.globalHealth.percent)+' %</strong><span>Offizieller aktueller Pet-Gesundheitsstand seit 10.11.2026</span></div>');
  }
  if(profile.enduranceTraining){
    modifiers.push('<div class="pet-combat-stat"><small>'+esc(profile.enduranceTraining.name)+'</small><strong>Rang '+esc(profile.enduranceTraining.rank??'–')+'</strong><span>'+esc(profile.enduranceTraining.description||'Blizzard-Live-Talent')+'</span></div>');
  }
  if(focusAllowed){
    modifiers.push('<div class="pet-combat-stat"><small>Maximaler Fokus</small><strong>'+esc(profile.focus.maximum)+'</strong><span>Forever-Petressource</span></div>');
    modifiers.push('<div class="pet-combat-stat"><small>Fokusregeneration</small><strong>+'+esc(profile.focus.regenPerSecond)+'/Sek.</strong><span>kontinuierlich · voller Pool in 15 Sek.</span></div>');
  }
  const modifiersBlock=modifiers.length?'<div class="pet-combat-grid">'+modifiers.join('')+'</div>':'';

  return '<div class="pet-subsection pet-combat">'+
    '<div class="pet-subsection-head"><div><span class="pet-overline">KAMPFPROFIL</span><h4>Verifizierte Werte & Beiträge</h4></div><span class="pet-source">Livewerte + Regelwerk</span></div>'+
    '<p class="pet-combat-intro">Diese Zahlen sind bewusst keine geschätzten Gesamtwerte. Angezeigt werden nur exakt belegbare Beiträge und aktive Modifikatoren.</p>'+
    '<div class="pet-combat-group"><span class="pet-combat-label">Von Dolly geerbt</span>'+inheritedBlock+'</div>'+
    (modifiersBlock?'<div class="pet-combat-group"><span class="pet-combat-label">Aktive Regeln & Talente</span>'+modifiersBlock+'</div>':'')+
    '<div class="pet-combat-caveat"><strong>Warum fehlen Gesamtleben, Gesamtrüstung und DPS?</strong><span>Blizzard veröffentlicht Slydris’ Grundwerte, aktuell trainierte passive Ränge, Zufriedenheit und die höhere Nah-/Fernkampf-Angriffskraft nicht vollständig online. Diese Größen werden deshalb nicht hochgerechnet.</span></div>'+
  '</div>';
}

function hunterPetsPanel(c){
  const group=c.hunterPets&&typeof c.hunterPets==='object'?c.hunterPets:{active:[],stable:[]};
  const activeList=Array.isArray(group.active)?group.active:[];
  const stableList=Array.isArray(group.stable)?group.stable:[];
  const active=activeList.find(pet=>pet?.active===true)||activeList[0]||null;
  const verified=c.hunterPetsVerified===true&&c.scrapeOk!==false;
  const staleLabel=verified?'':' · letzter bestätigter Stand';
  if(!active&&!stableList.length){
    return '<div class="section hunter-pets-section"><h3>Begleiter'+staleLabel+'</h3>'+
      '<p class="knowledge-empty">'+(c.hunterPetsCheckedAt?'Blizzard meldet derzeit keinen Jägerbegleiter und keinen belegten Stallplatz.':'Der Blizzard-Stall wurde für diesen gespeicherten Stand noch nicht abgerufen. Beim nächsten Aktualisieren wird er automatisch geladen.')+'</p></div>';
  }
  const petLevel=Number(active?.level),characterLevel=Number(c.level);
  const validPetLevel=Number.isInteger(petLevel);
  const validCharacterLevel=Number.isInteger(characterLevel);
  const gap=validPetLevel&&validCharacterLevel?characterLevel-petLevel:null;
  const family=active?hunterPetFamily(active.family?.slug):null;
  const render=petRenderPattern.test(active?.imageUrl||'')?active.imageUrl:null;
  const badges=[
    active?.active?'<span>Aktiver Begleiter</span>':'',
    active?.summoned===true?'<span>Derzeit gerufen</span>':''
  ].filter(Boolean).join('');
  const gapCopy=gap===null?'Stufenabstand nicht berechenbar':
    gap>0?active.name+' liegt '+gap+' '+(gap===1?'Stufe':'Stufen')+' hinter '+c.name.replace(/\s+Dalton$/,'')+'. Mitkämpfen lassen, damit der Begleiter aufholt.':
    gap===0?active.name+' ist auf derselben Stufe wie '+c.name.replace(/\s+Dalton$/,'')+'.':
    active.name+' liegt '+Math.abs(gap)+' '+(Math.abs(gap)===1?'Stufe':'Stufen')+' vor dem Jäger.';
  const hero=active?'<div class="pet-hero">'+
    '<div class="pet-render">'+(render?'<img src="'+esc(render)+'" alt="'+esc('Begleiter '+active.name)+'" loading="lazy" decoding="async">':'<span>Kein Renderbild verfügbar</span>')+'</div>'+
    '<div class="pet-identity"><span class="pet-overline">JÄGERBEGLEITER · BLIZZARD LIVE</span><h4>'+esc(active.name)+'</h4>'+
      '<p>'+esc(active.family?.name||'Familie unbekannt')+(validPetLevel?' · Stufe '+esc(petLevel):'')+'</p>'+
      (badges?'<div class="pet-badges">'+badges+'</div>':'')+
      '<div class="pet-level-gap"><strong>'+esc(validPetLevel?'Stufe '+petLevel:'Stufe unbekannt')+'</strong><span>'+esc(gapCopy)+'</span></div>'+
    '</div></div>':'<p class="knowledge-empty">Kein aktiver Begleiter gemeldet.</p>';
  const familyRuleId=family?.ruleIds?.profile;
  const trainingRuleId=family?.ruleIds?.training;
  const familyAllowed=Boolean(active&&family&&familyRuleId&&petRuleVerified(familyRuleId));
  const trainingAllowed=Boolean(active&&family&&trainingRuleId&&petRuleVerified(trainingRuleId));
  const familyProfile=active&&family
    ?(familyAllowed?'<div class="pet-subsection"><div class="pet-subsection-head"><div><span class="pet-overline">FAMILIENPROFIL</span><h4>'+esc(family.name)+'</h4></div><span class="pet-source">Regelwerk bestätigt</span></div>'+
      '<div class="pet-family-stats">'+
        '<div><small>Schaden</small><strong>'+esc(signedPercent(family.modifiers.damage))+'</strong></div>'+
        '<div><small>Rüstung</small><strong>'+esc(signedPercent(family.modifiers.armor))+'</strong></div>'+
        '<div><small>Leben</small><strong>'+esc(signedPercent(family.modifiers.health))+'</strong></div>'+
        '<div><small>Futter</small><strong>'+esc(family.diet.join(' · '))+'</strong></div>'+
      '</div></div>'
      :petRuleUnavailable('Familienprofil vorübergehend gesperrt'))
    :'';
  const training=active&&family
    ?(trainingAllowed?'<div class="pet-subsection"><div class="pet-subsection-head"><div><span class="pet-overline">AUSBILDUNG</span><h4>Was '+esc(active.name)+' auf seiner Stufe trainieren kann</h4></div><span class="pet-source">Regelwerk bestätigt · keine Lernstand-Schätzung</span></div>'+
      '<div class="pet-abilities">'+family.abilities.map(ability=>petAbilityCard(ability,validPetLevel?petLevel:0)).join('')+'</div>'+
      '<p class="pet-note">Die Stufen zeigen, was für einen Fuchs grundsätzlich trainierbar ist. Blizzard veröffentlicht online nicht, welche Ränge '+esc(active.name)+' tatsächlich gelernt hat.</p></div>'
      :petRuleUnavailable('Ausbildungsregeln vorübergehend gesperrt'))
    :'';
  const care=active?'<div class="pet-subsection"><div class="pet-subsection-head"><div><span class="pet-overline">PFLEGE & SPIELMECHANIK</span><h4>Wichtig im Spiel</h4></div></div>'+
    '<div class="pet-tips">'+
      (familyAllowed?'<div><strong>Füttern</strong><span>'+esc(family.diet.join(' · '))+' bereithalten. Zufriedenheit beeinflusst den Schaden des Begleiters.</span></div>':'')+
      '<div><strong>Knurren</strong><span>Solo meist automatisch aktiv lassen. In Gruppen mit einem Tank automatisches Knurren ausschalten.</span></div>'+
      '<div><strong>Treue & Ausbildungspunkte</strong><span>Treue, Zufriedenheit, freie/verbrauchte Ausbildungspunkte und das tatsächlich gelernte Pet-Zauberbuch sind Forever-Clientwerte. Blizzard veröffentlicht sie derzeit nicht in der Online-Armory; deshalb zeigt das Dashboard keine Schätzwerte.</span></div>'+
    '</div></div>':'';
  const stable='<div class="pet-subsection"><div class="pet-subsection-head"><div><span class="pet-overline">STALL</span><h4>Weitere gezähmte Begleiter · '+stableList.length+'</h4></div><span class="pet-source">'+(verified?'Blizzard live':'letzter Stand')+'</span></div>'+
    (stableList.length?'<div class="pet-stable-list">'+stableList.map(hunterPetMiniCard).join('')+'</div>':'<p class="knowledge-empty">Noch kein weiterer Begleiter eingestallt.</p>')+'</div>';
  const combat=active?hunterPetCombatPanel(c,active):'';
  return '<div class="section hunter-pets-section"><h3>Begleiter'+staleLabel+'</h3>'+petRuleBanner()+hero+combat+familyProfile+training+care+stable+'</div>';
}

function shortCharacterName(character){
  const name=String(character?.name||character?.player||'').trim();
  return name.replace(/\s+Dalton$/i,'')||'Unbekannt';
}
function questGroupStatus(chars=[]){
  const byId=new Map();
  const ensure=(id,name)=>{
    const numeric=Number(id);
    if(!Number.isInteger(numeric))return null;
    if(!byId.has(numeric))byId.set(numeric,{id:numeric,name:name||null,open:[],completed:[]});
    const entry=byId.get(numeric);
    if(!entry.name&&name)entry.name=name;
    return entry;
  };
  for(const character of chars){
    const seenOpen=new Set();
    for(const quest of Array.isArray(character.activeQuests)?character.activeQuests:[]){
      const entry=ensure(quest?.id,quest?.name);
      if(entry&&!seenOpen.has(entry.id)){entry.open.push(character);seenOpen.add(entry.id)}
    }
    const seenCompleted=new Set();
    for(const id of Array.isArray(character.completedQuestIds)?character.completedQuestIds:[]){
      const entry=ensure(id,null);
      if(entry&&!seenCompleted.has(entry.id)){entry.completed.push(character);seenCompleted.add(entry.id)}
    }
  }
  const ordered=[...byId.values()].filter(entry=>entry.open.length).sort((a,b)=>
    b.open.length-a.open.length||String(a.name||'').localeCompare(String(b.name||''),'de')
  );
  return {
    byId,
    rank:new Map(ordered.map((entry,index)=>[entry.id,index])),
    completedFresh:chars.every(character=>character.completedQuestsVerified===true)
  };
}
function questsPanel(c,group,questCatalog={},openDetails=new Set()){
  const quests=[...(Array.isArray(c.activeQuests)?c.activeQuests:[])].sort((a,b)=>{
    const ar=group?.rank?.get(Number(a?.id))??Number.MAX_SAFE_INTEGER;
    const br=group?.rank?.get(Number(b?.id))??Number.MAX_SAFE_INTEGER;
    return ar-br||String(a?.name||'').localeCompare(String(b?.name||''),'de');
  });
  const stale=(c.questsVerified===false?' · letzter bekannter Stand':'')+
    (group?.completedFresh===false?' · Abschlussstatus letzter bekannter Stand':'');
  if(!quests.length)return '<div class="section quests-section"><h3>Aktive Quests · 0'+stale+'</h3><p class="knowledge-empty">Keine aktiven Quests gemeldet.</p></div>';
  const rows=quests.map(quest=>{
    const id=Number(quest?.id);
    const status=group?.byId?.get(id);
    const detail=questCatalog?.[id]||questCatalog?.[String(id)]||null;
    const title=detail?.title||quest.name;
    const alsoOpen=(status?.open||[]).filter(other=>other.slug!==c.slug).map(shortCharacterName);
    const completedBy=(status?.completed||[]).filter(other=>other.slug!==c.slug).map(shortCharacterName);
    const meta=[
      alsoOpen.length?'<span class="quest-shared">Auch offen: '+esc(alsoOpen.join(' · '))+'</span>':'',
      completedBy.length?'<span class="quest-completed">Bereits abgeschlossen: '+esc(completedBy.join(' · '))+'</span>':''
    ].filter(Boolean).join('');
    const detailKey=c.slug+':quest:'+(Number.isInteger(id)?id:'unknown');
    const detailRows=[
      detail?.area?'<div class="quest-detail-row"><span>Gebiet</span><strong>'+esc(detail.area)+'</strong></div>':'',
      Number.isInteger(Number(detail?.minimumLevel))?'<div class="quest-detail-row"><span>Mindeststufe</span><strong>'+esc(detail.minimumLevel)+'</strong></div>':''
    ].filter(Boolean).join('');
    const expandable=detail&&(detail.description||detailRows)
      ?'<details class="quest-detail" data-detail-key="'+esc(detailKey)+'"'+(openDetails.has(detailKey)?' open':'')+'>'+
        '<summary>Beschreibung & Gebiet</summary>'+detailRows+
        (detail.description?'<p class="quest-description">'+esc(detail.description)+'</p>':'')+'</details>'
      :'';
    return '<div class="quest-entry"><span aria-hidden="true">›</span><div class="quest-copy"><strong>'+esc(title)+'</strong>'+
      (meta?'<div class="quest-meta">'+meta+'</div>':'')+expandable+'</div></div>';
  }).join('');
  return '<div class="section quests-section"><h3>Aktive Quests · '+quests.length+stale+'</h3><div class="quest-list">'+rows+'</div></div>';
}

// Feste Slot-Reihenfolge: links oben nach unten, dann Ringe/Schmuck und Waffen.
// Alle Charaktere verwenden dieselben 19 Plätze, auch wenn sie leer sind.
const equipmentSlotOrder=[
  'Kopf','Hals','Schultern','Rücken','Brust','Hemd','Wappenrock','Handgelenke',
  'Hände','Taille','Beine','Füße','Ring 1','Ring 2','Schmuck 1','Schmuck 2',
  'Waffenhand','Nebenhand','Distanzwaffe'
];
const equipmentSlotAliases={
  'Füsse':'Füße','Distanz':'Distanzwaffe','Fernkampf':'Distanzwaffe',
  'Ring':'Ring 1','Finger':'Ring 1','Finger 1':'Ring 1','Finger 2':'Ring 2',
  'Schmuck':'Schmuck 1','Trinket 1':'Schmuck 1','Trinket 2':'Schmuck 2',
  'Schildhand':'Nebenhand','Nebenwaffe':'Nebenhand','Offhand':'Nebenhand'
};
function equipmentPanel(c,open=false){
  const available=new Map();
  for(const item of c.equipment||[]){
    const slot=equipmentSlotAliases[item.slot]||item.slot;
    if(equipmentSlotOrder.includes(slot)&&item.item&&!available.has(slot))available.set(slot,item);
  }
  const rows=equipmentSlotOrder.map(slot=>{
    const item=available.get(slot);
    if(!item)return '<div class="equip equip-empty"><span class="equip-placeholder" aria-hidden="true">–</span><div><b>'+esc(slot)+'</b><span>Leer</span></div></div>';
    const iconUrl=item.storedIcon||item.icon;
    const safeIcon=/^(https:\/\/render\.worldofwarcraft\.com\/forever-eu\/icons\/\d+\/\d+\.jpg|https:\/\/foreverspec\.com\/icons\/\d+\.webp)$/.test(iconUrl||'')||validBlob(iconUrl);
    const icon=safeIcon?'<img class="equip-icon" src="'+esc(iconUrl)+'" alt="" loading="lazy">':'<span class="equip-placeholder" aria-hidden="true">—</span>';
    const quality=String(item.quality||'').toUpperCase();
    const qualityClass=itemQualityClasses[quality]||'quality-unknown';
    const qualityTitle=itemQualityNames[quality]?' title="'+esc('Qualität: '+itemQualityNames[quality])+'"':'';
    return '<div class="equip equip-filled">'+icon+'<div><b>'+esc(slot)+'</b><span class="equip-name '+qualityClass+'"'+qualityTitle+'>'+esc(item.item)+'</span>'+(item.level?' <small>· Gegenstandsstufe '+esc(item.level)+'</small>':'')+'</div></div>';
  }).join('');
  const verified=c.equipmentVerified&&c.scrapeOk!==false?'':' · letzter bekannter Stand';
  const languageNote=c.equipmentLanguage==='en'?' · Namen derzeit auf Englisch':c.equipmentLanguage==='gemischt'?' · teilweise englische Namen':'';
  const itemLevel=Number.isFinite(Number(c.equippedItemLevel))?Number(c.equippedItemLevel):null;
  const overview=itemLevel===null?'':'<div class="equipment-overview"><small>Gegenstandsstufe</small><strong>'+esc(itemLevel)+'</strong></div>';
  return '<div class="section equipment-section"><h3>Ausrüstung</h3>'+overview+
    '<details class="details" data-detail-key="'+esc(c.slug)+':equipment"'+(open?' open':'')+'><summary>Ausrüstung anzeigen · '+available.size+'/'+equipmentSlotOrder.length+' belegt'+verified+languageNote+'</summary><div class="equipment">'+rows+'</div></details></div>';
}

const validBlob=u=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname.endsWith('.public.blob.vercel-storage.com')&&/^(?:\/portraits\/|\/equipment\/)/.test(x.pathname)}catch{return false}};
const validRender = u => /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-main-raw\.png$/.test(u||"");
function renderPortrait(c){
  const configuredScene=portraitScenes[c.slug]||null;
  // Blizzard-Geschlecht ist zuverlässiger als die Pose oder der visuelle Renderer.
  const scene=configuredScene&&c.slug==='chucky-dalton'&&c.gender==='male'
    ? {...configuredScene,epithet:'Der Windsurfer'} : configuredScene;
  const image=validBlob(c.storedImageUrl)?c.storedImageUrl:validRender(c.imageUrl)?c.imageUrl:null;
  const avatar=validBlob(c.storedAvatarUrl)?c.storedAvatarUrl:/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-avatar\.jpg$/.test(c.avatarUrl||"")?c.avatarUrl:null;
  if(!image)return '<div class="portrait portrait-missing"><span>Charakterbild noch nicht verfügbar</span></div>';
  const version=encodeURIComponent(c.imageCheckedAt||c.scrapedAt||"");
  return '<figure class="portrait '+(scene?scene.className:'')+'">'+portraitBadge(scene)+'<img class="character-render" src="'+esc(image+'?v='+version)+'" data-fallback="'+esc(avatar?avatar+'?v='+version:'')+'" alt="'+esc('Charakterbild von '+c.name)+'" loading="lazy" decoding="async"><figcaption>'+(c.imageVerified===false?'Letztes bekanntes Charakterbild':'Charakterbild · nach letztem Logout')+'</figcaption></figure>';
}
function installPortraitFallbacks(){
  cards.querySelectorAll('img.character-render').forEach(img=>img.addEventListener('error',()=>{
    const fallback=img.dataset.fallback;
    if(fallback && img.src!==fallback){img.src=fallback;img.dataset.fallback='';return}
    const parent=img.closest('.portrait');if(parent){parent.classList.add('portrait-missing');parent.innerHTML='<span>Charakterbild vorübergehend nicht verfügbar</span>'}
  }));
}

const baseCharacterTabs=[
  {id:'stats',label:'Charakterwerte'},
  {id:'equipment',label:'Ausrüstung'},
  {id:'talents',label:'Talente'},
  {id:'quests',label:'Quests'},
  {id:'professions',label:'Berufe'},
  {id:'reputation',label:'Ruf'}
];
const activeCharacterTabs=new Map();
let displayedQuestCatalog={};
function characterTabsFor(c){
  if(c.class!=='Jäger')return baseCharacterTabs;
  const tabs=[...baseCharacterTabs];
  tabs.splice(3,0,{id:'pets',label:'Begleiter'});
  return tabs;
}
function activeCharacterTabFor(c){
  const tabs=characterTabsFor(c);
  const desired=activeCharacterTabs.get(c.slug)||'stats';
  return tabs.some(tab=>tab.id===desired)?desired:'stats';
}
function characterTabsNav(c){
  const active=activeCharacterTabFor(c);
  return '<div class="character-tabs" role="tablist" aria-label="Details von '+esc(c.name)+'">'+characterTabsFor(c).map(tab=>{
    const selected=tab.id===active;
    return '<button type="button" role="tab" class="character-tab'+(selected?' is-active':'')+'" data-character-slug="'+esc(c.slug)+'" data-character-tab="'+tab.id+'" aria-selected="'+String(selected)+'" aria-controls="'+esc(c.slug+'-panel-'+tab.id)+'">'+esc(tab.label)+'</button>';
  }).join('')+'</div>';
}
function characterTabPanel(c,id,content){
  const active=activeCharacterTabFor(c);
  return '<section id="'+esc(c.slug+'-panel-'+id)+'" class="character-tab-panel" role="tabpanel" data-character-slug="'+esc(c.slug)+'" data-character-panel="'+id+'"'+(id===active?'':' hidden')+'>'+content+'</section>';
}
function setActiveCharacterTab(slug,tab){
  const character=displayedData?.characters?.find(item=>item.slug===slug);
  if(!character||!characterTabsFor(character).some(item=>item.id===tab))return;
  activeCharacterTabs.set(slug,tab);
  cards.querySelectorAll('[data-character-tab]').forEach(button=>{
    if(button.dataset.characterSlug!==slug)return;
    const selected=button.dataset.characterTab===tab;
    button.classList.toggle('is-active',selected);
    button.setAttribute('aria-selected',String(selected));
  });
  cards.querySelectorAll('[data-character-panel]').forEach(panel=>{
    if(panel.dataset.characterSlug!==slug)return;
    panel.hidden=panel.dataset.characterPanel!==tab;
  });
}
function installCharacterTabs(){
  cards.querySelectorAll('button[data-character-tab]').forEach(button=>
    button.addEventListener('click',()=>setActiveCharacterTab(button.dataset.characterSlug,button.dataset.characterTab))
  );
}

let displayedData=null;
function keepNewestProfiles(data){
  if(!displayedData)return data;
  const priorBySlug=new Map((displayedData.characters||[]).map(c=>[c.slug,c]));
  return {...data,characters:(data.characters||[]).map(c=>{
    const prior=priorBySlug.get(c.slug);
    if(!prior)return c;
    if(c.scrapeOk===false){
      const oldTime=Date.parse(prior.scrapedAt||''),failedTime=Date.parse(c.scrapedAt||'');
      if(!Number.isFinite(oldTime)||(Number.isFinite(failedTime)&&oldTime<=failedTime))return c;
      return {...prior,scrapeOk:false,scrapeError:c.scrapeError};
    }
    // Live fields always win. For only those subfields that Blizzard omitted,
    // reuse the latest value from this browser session instead of regressing
    // to the older build-time JSON snapshot.
    const liveStats=new Set(Array.isArray(c.statsFreshKeys)?c.statsFreshKeys:
      c.statsVerified?Object.keys(c.stats||{}):[]);
    const mergedStats={...c.stats};
    for(const [key,value] of Object.entries(prior.stats||{})){
      if(!liveStats.has(key))mergedStats[key]=value;
    }
    const priorSkills=new Map((prior.professions||[]).map(p=>[p.name,p]));
    const mergedProfessions=(c.professions||[]).map(p=>{
      const previous=priorSkills.get(p.name);
      return p.unverified&&previous?{...previous,unverified:true}:p;
    });
    const keepPreviousImage=c.imageVerified===false&&prior.imageUrl;
    return {...c,
      stats:mergedStats,
      professions:mergedProfessions,
      equipment:c.equipmentVerified===false&&prior.equipment?prior.equipment:c.equipment,
      talents:c.talentsVerified===false&&prior.talents!=null?prior.talents:c.talents,
      hunterPets:c.hunterPetsVerified===false&&prior.hunterPets?prior.hunterPets:c.hunterPets,
      imageUrl:keepPreviousImage?prior.imageUrl:c.imageUrl,
      avatarUrl:keepPreviousImage?prior.avatarUrl:c.avatarUrl,
      imageCheckedAt:keepPreviousImage?prior.imageCheckedAt:c.imageCheckedAt
    };
  })};
}
function lastActivity(c){
 const options={dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'};
 const login=Date.parse(c.lastLoginAt||'');
 if(Number.isFinite(login)){
   return 'Zuletzt im Spiel: <strong>'+esc(new Date(login).toLocaleString('de-DE',options))+'</strong>';
 }
 return 'Zuletzt im Spiel: von Blizzard nicht angegeben';
}
function render(data,{live=false,success=null,questCatalog=displayedQuestCatalog,petRules=displayedPetRules}={}){
 displayedData=data;
 displayedQuestCatalog=questCatalog||{};
 displayedPetRules=petRules||null;
 const openDetails=new Set([...cards.querySelectorAll('details[data-detail-key][open]')].map(el=>el.dataset.detailKey));
 const chars=[...(data.characters||[])].sort((a,b)=>a.name.localeCompare(b.name,'de'));
 const questStatus=questGroupStatus(chars);

const levels=chars.map(c=>c.level).filter(n=>Number.isInteger(n)&&n>0);
 const min=levels.length?Math.min(...levels):null,max=levels.length?Math.max(...levels):null;
 const avg=levels.length?(levels.reduce((a,b)=>a+b,0)/levels.length).toFixed(1):"–";
 summary.innerHTML=[["Gruppenlevel",levels.length?`${min}–${max}`:"–"],["Durchschnitt",avg],["Abstand",levels.length?`${max-min} Level`:"–"],["Charaktere",chars.length]].map(([a,b])=>`<div class="stat"><small>${a}</small><strong>${b}</strong></div>`).join("");
 const stamp=Number.isFinite(Date.parse(data.generatedAt))?new Date(data.generatedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"unbekannt";
 if(freshness)freshness.textContent="Zuletzt aktualisiert: "+stamp;
 const total=chars.length;
 const freshCount=live?(Number.isInteger(success)?success:chars.filter(c=>c.scrapeOk!==false).length):null;
 status.textContent=live
   ? freshCount<total?`${freshCount} von ${total} Profilen aktuell abgerufen. Für die übrigen werden ältere Daten angezeigt.`
                     :`Alle ${total} Blizzard-Profile erfolgreich aktualisiert.`
   :"Gespeicherter Stand. Für aktuelle Daten oben auf „Aktualisieren“ klicken.";
 cards.innerHTML=chars.map((c,index)=>`<article class="card ${classColors[c.class]||'other'}">
  <div class="cardhead">
    <div class="card-intro">
      <span class="card-overline">STECKBRIEF NR. ${String(index+1).padStart(2,'0')} / 04</span>
      <h2 class="name">${esc(c.name)}</h2>
      <p class="player">Abenteurer: <strong>${esc(c.player)}</strong></p>
    </div>
    <div class="level" aria-label="Stufe ${esc(c.level)}"><div class="level-inner"><span>Stufe</span><strong>${esc(c.level)}</strong></div></div>
  </div>
  ${renderPortrait(c)}
  <p class="status activity-note">${lastActivity(c)}</p>
  <div class="meta"><span class="pill">${esc(c.class)}</span><span class="pill">${esc(c.race||"Himmelsgeborene")}</span><span class="pill">${esc(c.faction||'Allianz')} · EU-${esc(c.ruleset?.name||'PvP')}</span></div>
  ${c.scrapeOk===false?'<p class="status profile-warning">⚠ Letzter Profilabruf fehlgeschlagen – gespeicherter Stand</p>':''}
  ${experienceProgress(c)}
  ${characterTabsNav(c)}
  <div class="character-tab-panels">
    ${characterTabPanel(c,'talents',talentPanel(c))}
    ${c.class==='Jäger'?characterTabPanel(c,'pets',hunterPetsPanel(c)):''}
    ${characterTabPanel(c,'professions',professionsPanel(c,openDetails))}
    ${characterTabPanel(c,'reputation',reputationPanel(c))}
    ${characterTabPanel(c,'quests',questsPanel(c,questStatus,displayedQuestCatalog,openDetails))}
    ${characterTabPanel(c,'stats',statsPanel(c,openDetails.has(c.slug+':stats')))}
    ${characterTabPanel(c,'equipment',equipmentPanel(c,openDetails.has(c.slug+':equipment')))}
  </div>
 </article>`).join("");
 installPortraitFallbacks();
 installCharacterTabs();
 if(!compareView.hidden)renderComparison();
}

/* Shared Redis payload powers both views; comparison never fetches or persists separately. */
const comparisonState={selected:new Set(),expanded:new Set(['stats','equipment','talents','quests','professions','reputation']),mode:'all'};
const comparisonSections=[['stats','Charakterwerte'],['equipment','Ausrüstung'],['talents','Talente'],['quests','Quests'],['professions','Berufe'],['reputation','Ruf']];
const compareRoot=document.querySelector('#compareContent');
const charactersView=document.querySelector('#charactersView');
const compareView=document.querySelector('#compareView');
function setMainView(view){
  const compare=view==='compare';
  charactersView.hidden=compare;compareView.hidden=!compare;
  document.querySelectorAll('[data-view-link]').forEach(a=>{
    const on=a.dataset.viewLink===view;a.classList.toggle('is-active',on);
    if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  if(compare)renderComparison();
}
function syncMainView(){setMainView(location.hash==='#vergleich'?'compare':'characters')}
window.addEventListener('hashchange',syncMainView);
function cmpNumber(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function cmpEntry(value,score=null,extra='',stale=false){
  return {value:value===null||value===undefined||value===''?'–':String(value),score:cmpNumber(score),extra,stale};
}
function cmpTableRow(label,values,chars,{direction=1,comparable=true}={}){
  const scores=values.map(v=>v?.score).filter(v=>v!==null&&v!==undefined&&Number.isFinite(v));
  const min=scores.length?Math.min(...scores):null,max=scores.length?Math.max(...scores):null;
  const diff=comparable&&scores.length>=2&&max!==min;
  return '<tr><th scope="row">'+esc(label)+'</th>'+values.map(v=>{
    const missing=!v||v.value==='–';
    const state=!diff||missing||v.score===null?'':(v.score===max?(direction===1?'best':'worst'):v.score===min?(direction===1?'worst':'best'):'middle');
    return '<td class="'+(state?'compare-'+state:'')+'">'+
      '<span class="compare-value">'+esc(v?.value??'–')+'</span>'+
      (v?.extra?'<small>'+esc(v.extra)+'</small>':'')+
      (v?.stale?'<small class="stale-value">Letzter Stand</small>':'')+
      '</td>';
  }).join('')+'</tr>';
}
function cmpSectionRows(id,chars){
  const rows=[];
  const push=(label,fn,opts={})=>rows.push(cmpTableRow(label,chars.map(fn),chars,opts));
  if(id==='stats'){
    push('Level',c=>cmpEntry(c.level,c.level));
    push('Erfahrung (aktuelle Stufe)',c=>cmpEntry(c.experience==null?'–':new Intl.NumberFormat('de-DE').format(c.experience),c.experience));
    const keys=characterStatNames(chars);
    for(const key of keys)push(key,c=>cmpEntry(formatStatValue(key,c.stats?.[key]),c.stats?.[key],'',c.scrapeOk===false||!(c.statsFreshKeys|| (c.statsVerified?Object.keys(c.stats||{}):[])).includes(key)));
  }
  if(id==='equipment'){
    push('Gegenstandsstufe',c=>cmpEntry(c.equippedItemLevel??c.stats?.['Gegenstandsstufe'],c.equippedItemLevel??c.stats?.['Gegenstandsstufe']));
    const slots=chars.map(c=>{const m=new Map();for(const item of c.equipment||[]){const key=equipmentSlotAliases[item.slot]||item.slot;if(!m.has(key)&&item.item)m.set(key,item)}return m});
    for(const slot of equipmentSlotOrder)push(slot,(c,i)=>{const it=slots[i].get(slot);return it?cmpEntry(it.item,it.level,'Stufe '+(it.level??'–')+' · '+(itemQualityNames[String(it.quality||'').toUpperCase()]||'Qualität unbekannt'),c.equipmentVerified===false||c.scrapeOk===false):cmpEntry(c.equipmentVerified===false?'–':'Leer',null,'',c.equipmentVerified===false||c.scrapeOk===false)},{comparable:true});
  }
  if(id==='talents'){
    push('Talentverteilung',c=>cmpEntry(c.talents||'Nicht verfügbar',null,'',c.talentsVerified===false));
    const trees=[...new Set(chars.flatMap(c=>(c.talentDetails||[]).map(t=>t.name)))].sort((a,b)=>a.localeCompare(b,'de'));
    for(const tree of trees){
      push('Talentbaum: '+tree,c=>{const t=(c.talentDetails||[]).find(x=>x.name===tree);return t?cmpEntry(t.spentPoints+' Punkte',t.spentPoints,'',c.talentDetailsVerified===false):cmpEntry('–')},{comparable:false});
      const talents=[...new Set(chars.flatMap(c=>((c.talentDetails||[]).find(t=>t.name===tree)?.talents||[]).map(t=>t.name)))].sort((a,b)=>a.localeCompare(b,'de'));
      for(const name of talents)push('↳ '+name,c=>{const t=(c.talentDetails||[]).find(x=>x.name===tree)?.talents?.find(x=>x.name===name);return t?cmpEntry('Rang '+(t.rank??'–'),t.rank,t.description||'',c.talentDetailsVerified===false):cmpEntry('–')},{comparable:false});
    }
  }
  if(id==='quests'){
    push('Aktive Quests',c=>cmpEntry(Array.isArray(c.activeQuests)?c.activeQuests.length:'–',Array.isArray(c.activeQuests)?c.activeQuests.length:null,'',c.questsVerified===false),{comparable:false});
    push('Bekannte abgeschlossene Quests',c=>cmpEntry(Array.isArray(c.completedQuestIds)?c.completedQuestIds.length:'–',null,'',c.completedQuestsVerified!==true),{comparable:false});
    const ids=new Map();
    for(const c of chars)for(const q of c.activeQuests||[])if(Number.isInteger(Number(q.id)))ids.set(Number(q.id),displayedQuestCatalog?.[q.id]?.title||q.name||'Quest '+q.id);
    for(const [id,name] of [...ids].sort((a,b)=>a[1].localeCompare(b[1],'de')))push(name,c=>{
      if((c.activeQuests||[]).some(q=>Number(q.id)===id))return cmpEntry('Offen',null,'',c.questsVerified===false);
      if((c.completedQuestIds||[]).some(q=>Number(q)===id))return cmpEntry('Abgeschlossen',null,'',c.completedQuestsVerified!==true);
      return cmpEntry(c.questsVerified===true&&c.completedQuestsVerified===true?'Nicht aktiv':'Unbekannt',null,'',true);
    },{comparable:false});
  }
  if(id==='professions'){
    const names=[...new Set(chars.flatMap(c=>(c.professions||[]).map(p=>p.name)))];
    const ordered=sortProfessionsForDisplay(names.map(name=>({name}))).map(p=>p.name);
    for(const name of ordered){
      push(name,c=>{const p=(c.professions||[]).find(x=>x.name===name);return p?cmpEntry((p.current??'–')+' / '+(p.max??'–'),p.current,professionRank(Number(p.max)),p.unverified||c.scrapeOk===false):cmpEntry(c.professionsVerified===true?'Nicht erlernt':'–',null,'',c.professionsVerified!==true)});
      const recipes=[...new Set(chars.flatMap(c=>((c.professions||[]).find(p=>p.name===name)?.knownRecipes||[]).map(r=>r.name)))].sort((a,b)=>a.localeCompare(b,'de'));
      for(const recipe of recipes)push('↳ '+recipe,c=>{const p=(c.professions||[]).find(x=>x.name===name);const r=p?.knownRecipes?.find(x=>x.name===recipe);return cmpEntry(r?'Erlernt':(c.professionDetailsVerified===true?'Nicht erlernt':'Unbekannt'),null,'',c.professionDetailsVerified!==true)},{comparable:false});
    }
  }
  if(id==='reputation'){
    const names=[...new Set(chars.flatMap(c=>(c.reputations||[]).map(r=>r.name)))].sort((a,b)=>a.localeCompare(b,'de'));
    for(const name of names)push(name,c=>{const r=(c.reputations||[]).find(x=>x.name===name);if(!r)return cmpEntry('–',null,'',c.reputationsVerified!==true);
      const st=r.standing||{},stage=reputationStageIndex(st),v=cmpNumber(st.value),max=cmpNumber(st.max);
      const score=stage<0?null:stage*100000+(v!==null&&max>0?v/max*1000:0);
      return cmpEntry((st.name||'Unbekannt')+' · '+(v??'–')+'/'+(max??'–'),score,'',c.reputationsVerified===false);
    });
  }
  return rows;
}
function renderComparison(){
  if(!compareRoot||!displayedData)return;
  const all=[...(displayedData.characters||[])].sort((a,b)=>a.name.localeCompare(b.name,'de'));
  const selected=all.filter(c=>comparisonState.selected.has(c.slug));
  const choices='<fieldset class="compare-choices"><legend>Charaktere auswählen · '+selected.length+' von '+all.length+'</legend>'+all.map(c=>
    '<label class="compare-choice"><input type="checkbox" data-compare-character="'+esc(c.slug)+'" '+(comparisonState.selected.has(c.slug)?'checked':'')+'><span>'+esc(c.name)+'</span></label>'
  ).join('')+'</fieldset>';
  const content=selected.length<2?'<p class="compare-empty">Bitte mindestens zwei Charaktere auswählen, um den Vergleich zu starten.</p>':
    '<div class="compare-toolbar"><span>'+selected.length+' Charaktere · alphabetisch geordnet</span><label><input type="checkbox" id="compareDifferences" '+(comparisonState.mode==='differences'?'checked':'')+'> Nur Unterschiede</label></div>'+
    '<div class="compare-scroll" tabindex="0" aria-label="Vergleichstabelle horizontal scrollen"><table class="compare-table"><thead><tr><th scope="col">Merkmal</th>'+selected.map(c=>'<th scope="col"><span class="compare-character-name">'+esc(c.name)+'</span><small>'+esc(c.class||'')+' · Level '+esc(c.level??'–')+'</small></th>').join('')+'</tr></thead><tbody>'+
    comparisonSections.map(([id,label])=>{
      const rows=cmpSectionRows(id,selected);
      const visible=comparisonState.mode==='differences'?rows.filter(row=>{const cells=[...row.matchAll(/<span class="compare-value">([^<]*)<\/span>/g)].map(m=>m[1]);return new Set(cells).size>1;}):rows;
      return '<tr class="compare-section-heading"><th colspan="'+(selected.length+1)+'"><button type="button" data-compare-section="'+id+'" aria-expanded="'+comparisonState.expanded.has(id)+'">'+(comparisonState.expanded.has(id)?'▾ ':'▸ ')+esc(label)+' · '+visible.length+'</button></th></tr>'+
        (comparisonState.expanded.has(id)?visible.join(''):'');
    }).join('')+'</tbody></table></div><p class="compare-legend"><span class="compare-best">Bester Wert</span><span class="compare-middle">Zwischenwert</span><span class="compare-worst">Niedrigster Wert</span><span>Gleich / nicht bewertbar: neutral</span></p>';
  compareRoot.innerHTML=choices+content;
  compareRoot.querySelectorAll('[data-compare-character]').forEach(input=>input.addEventListener('change',()=>{
    if(input.checked)comparisonState.selected.add(input.dataset.compareCharacter);else comparisonState.selected.delete(input.dataset.compareCharacter);
    renderComparison();
  }));
  compareRoot.querySelectorAll('[data-compare-section]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.compareSection;if(comparisonState.expanded.has(id))comparisonState.expanded.delete(id);else comparisonState.expanded.add(id);renderComparison();
  }));
  compareRoot.querySelector('#compareDifferences')?.addEventListener('change',e=>{comparisonState.mode=e.target.checked?'differences':'all';renderComparison()});
}

let lastGeneratedAt=null;
async function load(){
  status.textContent="Dauerhaft gespeicherte Daten werden geladen …";
  try{
    const r=await fetch('/api/characters?t='+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error("HTTP "+r.status);
    const result=await r.json();
    const data=result.data;
    if(!lastGeneratedAt||Date.parse(data.generatedAt)>Date.parse(lastGeneratedAt)){
      lastGeneratedAt=data.generatedAt;render(data,{questCatalog:result.questCatalog||{},petRules:result.petRules||null});
    }
  }catch(e){if(!displayedData){
      try{const fallback=await fetch('/data/characters.json',{cache:'no-store'});if(!fallback.ok)throw Error('Fallback');render(await fallback.json());status.textContent='Datenbank derzeit nicht verfügbar – letzter GitHub-Sicherungsstand.';}
      catch{status.innerHTML='<span class="error">Gespeicherte Daten konnten nicht geladen werden.</span>'}
    }}
}
async function refreshLive(){
  if(button.disabled)return;
  button.disabled=true;button.textContent="↻ Wird aktualisiert …";
  if(freshness)freshness.textContent="Live-Abfrage läuft …";
  status.textContent="Blizzard-Profile werden jetzt direkt abgefragt …";
  try{
    const r=await fetch('/api/refresh?t='+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const response=await r.json();
    if(response.pending){status.textContent='Eine andere Aktualisierung läuft bereits. Der zuletzt gespeicherte Datenstand bleibt sichtbar.';return;}
    if(!response.data||!response.success)throw new Error('Keine aktuellen Profile');
    lastGeneratedAt=response.data.generatedAt;
    render(response.data,{live:true,success:response.success,questCatalog:response.questCatalog||{},petRules:response.petRules||null});
  }catch(e){
    status.innerHTML='<span class="error">Live-Abruf derzeit nicht verfügbar. Der gespeicherte Stand bleibt sichtbar. Bitte später erneut auf „Aktualisieren“ klicken.</span>';
    if(freshness&&lastGeneratedAt){const t=Number.isFinite(Date.parse(lastGeneratedAt))?new Date(lastGeneratedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"unbekannt";freshness.textContent="Letzter angezeigter Datenstand: "+t;}
  }finally{button.disabled=false;button.textContent="↻ Aktualisieren"}
}
button.innerHTML='<span aria-hidden="true">↻</span> Aktualisieren';
button.addEventListener('click',refreshLive);
load();
syncMainView();
// Live-Aufrufe hier nur per Button; ein täglicher Server-Snapshot archiviert zusätzlich den vollständigen Blizzard-Datenstand.
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
