import {HUNTER_PET_RULEBOOK_VERSION,hunterPetFamily,hunterPetCombatProfile,hunterPetMechanics} from './hunter-pets.js';
import {reputationStages,reputationColors} from './reputation-data.js';
const cards=document.querySelector("#cards");const summary=document.querySelector("#summary");const status=document.querySelector("#status");const freshness=document.querySelector("#dataFreshness");const button=document.querySelector("#refreshButton");
const esc=v=>String(v??"nicht verfügbar").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const classColorsById={8:'mage',3:'hunter',11:'druid'};
const classColor=c=>classColorsById[Number(c?.classId)]||'other';
const isHunter=c=>Number(c?.classId)===3;
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
const mainStatEnums=['HEALTH','MANA','STRENGTH','INTELLECT','AGILITY','STAMINA','CRITICALSTRIKE','SPIRIT','ATTACKDPS','MANAREGEN'];
const percentStatEnums=new Set(['CRITICALSTRIKE','MELEECRIT','RANGEDCRIT','SPELLCRIT','DODGE','PARRY','BLOCK']);
const statIconsByEnum={
  HEALTH:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3.5 15.2 3.5 8.9A4.4 4.4 0 0 1 12 6.7a4.4 4.4 0 0 1 8.5 2.2c0 6.3-8.5 11.6-8.5 11.6Z"/></svg>',
  MANA:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8M10 3v4l-4.6 8.1A3.9 3.9 0 0 0 8.8 21h6.4a3.9 3.9 0 0 0 3.4-5.9L14 7V3"/><path d="M7.8 15h8.4"/></svg>',
  STRENGTH:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>',
  INTELLECT:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M8.2 14.7A6 6 0 1 1 15.8 14.7c-1.1.8-1.5 1.6-1.6 2.3h-4.4c-.1-.7-.5-1.5-1.6-2.3Z"/></svg>',
  AGILITY:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 10.8c1.3-1 4.3-1 5.6 0 1.8 1.4 3.2 4.1 1.7 6.2-1.2 1.7-3.1.4-4.5.4s-3.3 1.3-4.5-.4c-1.5-2.1-.1-4.8 1.7-6.2Z"/><circle cx="6.4" cy="8" r="1.6"/><circle cx="10.1" cy="5.3" r="1.6"/><circle cx="13.9" cy="5.3" r="1.6"/><circle cx="17.6" cy="8" r="1.6"/></svg>',
  STAMINA:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 19 6v5.2c0 4.4-2.7 7.9-7 10-4.3-2.1-7-5.6-7-10V6l7-3.2Z"/><path d="M12 7v8M8 11h8"/></svg>',
  CRITICALSTRIKE:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="2"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg>',
  SPIRIT:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m18.5 15 .8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7Z"/></svg>',
  ATTACKDPS:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.7 3.2 6.1-1.1-1.1 6.1-9.1 9.1"/><path d="m8.9 13.6 1.5 1.5"/><path d="m7.2 15.3-3.9 3.9 1.5 1.5 3.9-3.9"/><path d="M14 7.3 16.7 10"/></svg>',
  MANAREGEN:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5S6.5 8.6 6.5 13a5.5 5.5 0 0 0 8.7 4.5"/><path d="M14.2 11.2a4.2 4.2 0 1 1-.1 7.6"/><path d="m12.8 16.4 1.3 2.4 2.4-1.3"/></svg>'
};
function formatStatValue(entry){
  const n=Number(entry?.value);
  if(!Number.isFinite(n))return '–';
  if(percentStatEnums.has(entry?.enum))return new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n)+' %';
  return new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(n);
}
function statTile(entry,stale=false,icon=false){
  const name=entry?.name;
  if(typeof name!=='string'||!name.trim())return '';
  return '<div class="stat-tile '+(icon?'stat-tile-main':'stat-tile-detail')+'">'+
    (icon?'<span class="stat-icon">'+(statIconsByEnum[entry.enum]||'')+'</span>':'')+
    '<span class="stat-copy"><small>'+esc(name)+(stale?' <span class="stale-value" title="Nicht im letzten Blizzard-Abruf bestätigt">· letzter Stand</span>':'')+'</small>'+
    '<strong>'+esc(formatStatValue(entry))+'</strong></span></div>';
}
function statsPanel(c,open=false){
  const details=Array.isArray(c.statsDetails)?c.statsDetails.filter(entry=>entry?.name&&entry?.enum):[];
  const fresh=new Set(Array.isArray(c.statsFreshEnums)?c.statsFreshEnums:[]);
  const byEnum=new Map(details.map(entry=>[entry.enum,entry]));
  const main=mainStatEnums.map(key=>byEnum.get(key)).filter(Boolean);
  const rest=details.filter(entry=>!mainStatEnums.includes(entry.enum));
  const mainHtml=main.map(entry=>statTile(entry,!fresh.has(entry.enum),true)).join('');
  const restHtml=rest.map(entry=>statTile(entry,!fresh.has(entry.enum),false)).join('');
  if(!details.length)return '<div class="section character-stats"><h3>Charakterwerte</h3><p class="knowledge-empty">Deutsche Blizzard-Bezeichnungen sind für diesen Stand nicht bestätigt.</p></div>';
  return '<div class="section character-stats"><h3>Charakterwerte'+(c.scrapeOk!==false&&c.statsVerified?'':' · teilweise letzter Stand')+'</h3>'+
    '<div class="stat-grid stat-grid-main">'+mainHtml+'</div>'+
    (restHtml?'<details class="details attributes" data-detail-key="'+esc(c.slug)+':stats"'+(open?' open':'')+'>'+
      '<summary>Weitere Charakterwerte anzeigen</summary><div class="stat-grid stat-grid-detail">'+restHtml+'</div></details>':'')+'</div>';
}
const itemQualityClasses={POOR:'quality-poor',COMMON:'quality-common',UNCOMMON:'quality-uncommon',RARE:'quality-rare',EPIC:'quality-epic',LEGENDARY:'quality-legendary',ARTIFACT:'quality-artifact',HEIRLOOM:'quality-heirloom'};

const row=(a,b)=>`<div class="row"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;
// WoW Classic/Forever: ein gemeinsamer Maßstab von 0 bis 300, vier Stufen zu je 75.
const professionStages=[75,150,225,300];
function professionScale(){
  return '<div class="profession-scale" aria-label="Berufsskala: 75, 150, 225, 300">'+
    professionStages.map(end=>'<span>'+end+'</span>').join('')+
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
    const fraction=valid?Math.round(current)+'/'+Math.round(max):'–/–';
    const label=String(p.name||'Beruf')+(p.unverified||previousOnly?' · letzter Stand':'');
    const stageSegments=professionStages.map((end,index)=>{
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
      '</div>'+
      '<div class="profession-track" role="progressbar" aria-label="'+esc(label)+'" aria-valuemin="0" aria-valuemax="300" aria-valuenow="'+(valid?Math.max(0,Math.min(300,Math.round(currentSkill))):0)+'" aria-valuetext="'+esc(valid?fraction:'kein bestätigter Stand')+'">'+
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

function reputationStageIndex(standing={}){
  const tier=Number(standing.tier);
  return Number.isInteger(tier)&&tier>=0&&tier<reputationStages.length?tier:-1;
}
function reputationColor(stage){
  return reputationColors[stage?.key]||{hex:'#B59A70',light:'#D7C39D',dark:'#66533B'};
}
function safeFactionCrest(url){
  if(typeof url!=='string')return null;
  if(validBlob(url))return url;
  try{
    const parsed=new URL(url);
    return parsed.protocol==='https:'&&parsed.hostname==='warcraft.wiki.gg'&&parsed.pathname.startsWith('/images/')?url:null;
  }catch{return null}
}
const reputationFallbackCrest='<svg viewBox="0 0 32 36" aria-hidden="true"><path d="M16 2.5 27 6.8v9.4c0 8.1-4.4 13.8-11 17.3C9.4 30 5 24.3 5 16.2V6.8L16 2.5Z"/><path d="M16 8v18M10.5 13.5h11"/></svg>';
function factionVisual(rep){
  const record=displayedReputationCatalog?.records?.[String(rep?.id)]||null;
  const master=record?.slug?displayedReputationCatalog?.records?.['slug:'+record.slug]||null:null;
  const url=safeFactionCrest(record?.media?.crestStoredUrl)||
    safeFactionCrest(master?.media?.crestStoredUrl)||
    safeFactionCrest(record?.media?.crestSourceUrl)||
    safeFactionCrest(master?.media?.crestSourceUrl);
  const kind=record?.crestKind||master?.crestKind||'generic';
  const title=kind==='specific'?'Fraktionswappen':kind==='side-fallback'?'Fraktionszugehörigkeit':kind==='neutral-fallback'?'Neutrale Fraktion':'Fraktion';
  return '<span class="reputation-crest is-'+esc(kind)+'" title="'+esc(title)+'">'+
    (url?'<img src="'+esc(url)+'" alt="" loading="lazy" decoding="async">':reputationFallbackCrest)+'</span>';
}
function reputationPanel(c){
  const list=Array.isArray(c.reputations)?c.reputations:[];
  if(!list.length)return '';
  const columns='repeat(4,minmax(0,1fr)) 2fr 4fr 7fr minmax(7px,.333fr)';
  const rows=list.map(rep=>{
    const standing=rep.standing||{},index=reputationStageIndex(standing);
    const currentStage=index>=0?reputationStages[index]:null;
    const currentColor=reputationColor(currentStage);
    const value=Number(standing.value),max=Number(standing.max);
    const valid=Number.isFinite(value)&&Number.isFinite(max)&&max>0;
    const segments=reputationStages.map((stage,i)=>{
      const pct=index<0?0:i<index?100:i===index&&valid?Math.max(0,Math.min(100,value/max*100)):0;
      const color=reputationColor(stage);
      const classes=['reputation-segment',i<=index?'is-reached':'is-future',i===index?'is-current':''].filter(Boolean).join(' ');
      const style='--rep-color:'+color.hex+';--rep-light:'+color.light+';--rep-dark:'+color.dark;
      return '<span class="'+classes+'" style="'+style+'" title="'+esc('Rufstufe '+(i+1)+(i===index&&standing.name?' · '+standing.name:''))+'">'+
        '<span class="reputation-segment-fill" style="width:'+pct.toFixed(2)+'%"></span></span>';
    }).join('');
    const fraction=valid?Math.round(value)+'/'+Math.round(max):'–/–';
    const standingStyle='--rep-color:'+currentColor.hex+';--rep-light:'+currentColor.light+';--rep-dark:'+currentColor.dark;
    return '<div class="reputation">'+
      '<div class="reputation-head"><span class="reputation-faction">'+factionVisual(rep)+'<span>'+esc(rep.name)+'</span></span>'+
      '<strong class="reputation-standing" style="'+standingStyle+'">'+esc(standing.name||'Unbekannt')+'</strong></div>'+
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
  const tp=rank=>Number.isFinite(Number(rank?.trainingPoints))?' · '+Number(rank.trainingPoints)+' TP':'';
  const status=available
    ?'Bis Rang '+available.rank+' trainierbar'+tp(available)+(next?' · nächster Rang ab Stufe '+next.level+tp(next):' · höchster Rang erreicht')
    :(first?'Ab Begleiterstufe '+first.level+' trainierbar'+tp(first):'Ausbildungsstufe unbekannt');
  return '<div class="pet-ability '+state+'">'+
    '<div class="pet-ability-head"><div><strong>'+esc(ability.name)+'</strong><span>'+esc(ability.kind||'Fähigkeit')+'</span></div>'+
      '<span class="pet-ability-status">'+(available?'Verfügbar':'Gesperrt')+'</span></div>'+
    '<p>'+esc(status)+'</p>'+
    (ability.description?'<p class="pet-ability-description">'+esc(ability.description)+(ability.cooldown?' · Abklingzeit '+esc(ability.cooldown):'')+'</p>':'')+
    '<small>Nicht mit „bereits gelernt“ gleichzusetzen.</small>'+
  '</div>';
}
let displayedPetRules=null;
let displayedPetCatalog={};
function petRuleStatus(ruleId){
  if(displayedPetRules?.rulebookVersion!==HUNTER_PET_RULEBOOK_VERSION)return 'source_unavailable';
  return displayedPetRules?.rules?.[ruleId]?.status||'source_unavailable';
}
function petRuleVerified(ruleId){return petRuleStatus(ruleId)==='verified'}
function petRuleBanner(){
  const state=displayedPetRules;
  if(!state||state.rulebookVersion!==HUNTER_PET_RULEBOOK_VERSION){
    return '<div class="pet-rule-banner is-unverified"><strong>Einige Begleiterwerte sind vorübergehend nicht verfügbar</strong><span>Berechnete Werte werden erst wieder angezeigt, sobald ihre Grundlage bestätigt ist.</span></div>';
  }
  if(state.overall==='verified')return '';
  const review=Object.values(state.rules||{}).some(rule=>rule.status==='review_required');
  return '<div class="pet-rule-banner '+(review?'is-review':'is-unverified')+'"><strong>'+(review?'Einige Begleiterwerte werden gerade geprüft':'Einige Begleiterwerte sind vorübergehend nicht verfügbar')+'</strong><span>Betroffene berechnete Werte sind vorsorglich ausgeblendet. Slydris und der Stall bleiben davon unberührt.</span></div>';
}
function petRuleUnavailable(title){
  return '<div class="pet-rule-blocked"><strong>'+esc(title)+'</strong><span>Vorübergehend nicht verfügbar.</span></div>';
}

function hunterPetMiniCard(pet){
  const iconUrl=validBlob(pet?.storedIconUrl)?pet.storedIconUrl:petIconPattern.test(pet?.iconUrl||'')?pet.iconUrl:null;
  const icon=iconUrl?'<img src="'+esc(iconUrl)+'" alt="" loading="lazy">':'<span class="pet-mini-placeholder" aria-hidden="true">•</span>';
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
    inheritedRows.push('<div class="pet-combat-stat"><small>'+esc((inherited.health.unitName||'Abgeleiteter Wert')+' aus Dolly')+'</small><strong>+'+esc(petNumber(inherited.health.value))+'</strong><span>'+esc(petNumber(inherited.health.input))+(inherited.health.inputName?' '+esc(inherited.health.inputName):'')+' × 2</span></div>');
  }
  if(scalingAllowed&&inherited.armor){
    inheritedRows.push('<div class="pet-combat-stat"><small>'+esc((inherited.armor.unitName||'Abgeleiteter Wert')+' aus Dolly')+'</small><strong>+'+esc(petNumber(inherited.armor.value,{maximumFractionDigits:1}))+'</strong><span>'+esc(petNumber(inherited.armor.input))+(inherited.armor.inputName?' '+esc(inherited.armor.inputName):'')+' × 30 % · rechnerischer Anteil vor Server-Rundung</span></div>');
  }
  if(scalingAllowed&&inherited.crit){
    inheritedRows.push('<div class="pet-combat-stat"><small>'+esc((inherited.crit.unitName||'Abgeleiteter Wert')+' aus Dolly')+'</small><strong>+'+esc(petNumber(inherited.crit.value,{minimumFractionDigits:2,maximumFractionDigits:2}))+' %-Pkt.</strong><span>100 % des aktuellen Blizzard-Armory-Werts'+(inherited.crit.inputName?' · '+esc(inherited.crit.inputName):'')+'</span></div>');
  }
  const inheritedBlock=scalingAllowed
    ?'<div class="pet-combat-grid">'+inheritedRows.join('')+
      '<div class="pet-combat-stat is-unavailable"><small>Angriffskraft aus Dolly</small><strong>–</strong><span>'+esc(inherited.attackPower?.reason||'Der benötigte Ausgangswert ist online nicht eindeutig verfügbar.')+'</span></div></div>'
    :petRuleUnavailable('Vererbte Kampfwerte vorübergehend nicht verfügbar');

  const modifiers=[];
  if(healthRuleAllowed){
    modifiers.push('<div class="pet-combat-stat"><small>Forever-Gesundheitsfaktor</small><strong>'+esc(profile.globalHealth.percent)+' %</strong><span>Aktueller Pet-Gesundheitsstand seit 10.11.2026</span></div>');
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
    '<div class="pet-subsection-head"><div><span class="pet-overline">KAMPFPROFIL</span><h4>Werte & Beiträge</h4></div></div>'+
    '<div class="pet-combat-group"><span class="pet-combat-label">Von Dolly geerbt</span>'+inheritedBlock+'</div>'+
    (modifiersBlock?'<div class="pet-combat-group"><span class="pet-combat-label">Weitere Werte & Talente</span>'+modifiersBlock+'</div>':'')+
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
  const render=validBlob(active?.storedImageUrl)?active.storedImageUrl:petRenderPattern.test(active?.imageUrl||'')?active.imageUrl:null;
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
    '<div class="pet-identity"><span class="pet-overline">JÄGERBEGLEITER</span><h4>'+esc(active.name)+'</h4>'+
      '<p>'+esc(active.family?.name||'Familie unbekannt')+(validPetLevel?' · Stufe '+esc(petLevel):'')+'</p>'+
      (badges?'<div class="pet-badges">'+badges+'</div>':'')+
      '<div class="pet-level-gap"><strong>'+esc(validPetLevel?'Stufe '+petLevel:'Stufe unbekannt')+'</strong><span>'+esc(gapCopy)+'</span></div>'+
    '</div></div>':'<p class="knowledge-empty">Kein aktiver Begleiter gemeldet.</p>';
  const familyRuleId=family?.ruleIds?.profile;
  const trainingRuleId=family?.ruleIds?.training;
  const familyAllowed=Boolean(active&&family&&familyRuleId&&petRuleVerified(familyRuleId));
  const trainingAllowed=Boolean(active&&family&&trainingRuleId&&petRuleVerified(trainingRuleId));
  const familyProfile=active&&family
    ?(familyAllowed?'<div class="pet-subsection"><div class="pet-subsection-head"><div><span class="pet-overline">FAMILIENPROFIL</span><h4>'+esc(active.family?.name||'Begleiterfamilie')+'</h4></div></div>'+
      '<div class="pet-family-stats stat-grid">'+
        '<div class="stat-tile stat-tile-detail pet-family-stat"><small>Schaden</small><strong>'+esc(signedPercent(family.modifiers.damage))+'</strong></div>'+
        '<div class="stat-tile stat-tile-detail pet-family-stat"><small>Rüstung</small><strong>'+esc(signedPercent(family.modifiers.armor))+'</strong></div>'+
        '<div class="stat-tile stat-tile-detail pet-family-stat"><small>Leben</small><strong>'+esc(signedPercent(family.modifiers.health))+'</strong></div>'+
      '</div></div>'
      :petRuleUnavailable('Familienprofil vorübergehend nicht verfügbar'))
    :'';
  const localizedFamily=active?.family?.slug?displayedPetCatalog?.[active.family.slug]||null:null;
  const localizedAbilities=Array.isArray(localizedFamily?.abilities)
    ?localizedFamily.abilities.filter(ability=>ability?.name).sort((a,b)=>(Number(a.requiredLevel)||999)-(Number(b.requiredLevel)||999)||Number(a.id)-Number(b.id))
    :[];
  const abilityBaseName=ability=>String(ability?.name||'').replace(/\s+Rang\s+\d+$/i,'').trim();
  const knownLevels=localizedAbilities.filter(ability=>Number.isInteger(Number(ability.requiredLevel)));
  const currentByAbility=new Map();
  if(Number.isInteger(petLevel)){
    for(const ability of knownLevels.filter(ability=>Number(ability.requiredLevel)<=petLevel)){
      const key=abilityBaseName(ability);
      const prior=currentByAbility.get(key);
      if(!prior||Number(ability.requiredLevel)>Number(prior.requiredLevel))currentByAbility.set(key,ability);
    }
  }
  const currentAbilities=[...currentByAbility.values()].sort((a,b)=>Number(a.requiredLevel)-Number(b.requiredLevel));
  const futureAbilities=knownLevels.filter(ability=>!Number.isInteger(petLevel)||Number(ability.requiredLevel)>petLevel)
    .sort((a,b)=>Number(a.requiredLevel)-Number(b.requiredLevel)||Number(a.id)-Number(b.id));
  const nextLevel=futureAbilities.length?Number(futureAbilities[0].requiredLevel):null;
  const nextAbilities=Number.isInteger(nextLevel)?futureAbilities.filter(ability=>Number(ability.requiredLevel)===nextLevel):[];
  const laterAbilities=Number.isInteger(nextLevel)?futureAbilities.filter(ability=>Number(ability.requiredLevel)>nextLevel):futureAbilities;
  const abilityCard=(ability,state)=>{
    const required=Number(ability.requiredLevel);
    const remaining=Number.isInteger(petLevel)&&Number.isInteger(required)?Math.max(0,required-petLevel):null;
    const stateLabel=state==='now'?'Jetzt erlernbar':state==='next'
      ?('Ab Stufe '+required+(remaining>0?' · noch '+remaining+' '+(remaining===1?'Stufe':'Stufen'):''))
      :('Ab Stufe '+required);
    const groupLabel=state==='now'?'JETZT ERLERNBAR':state==='next'?'ALS NÄCHSTES':'SPÄTER';
    return '<div class="stat-tile pet-training-card is-'+state+'"><span class="pet-training-status">'+esc(groupLabel)+'</span>'+
      '<div class="pet-training-card-head"><strong>'+esc(ability.name)+'</strong><span>'+esc(stateLabel)+'</span></div>'+
      (ability.description?'<p>'+esc(ability.description)+'</p>':'')+'</div>';
  };
  const currentHtml=currentAbilities.length
    ?'<div class="pet-training-group is-now">'+currentAbilities.map(ability=>abilityCard(ability,'now')).join('')+'</div>'
    :'<div class="pet-training-group is-now"><div class="stat-tile pet-training-empty"><small>JETZT ERLERNBAR</small><span>Auf dieser Stufe ist keine neue Fähigkeit verfügbar.</span></div></div>';
  const nextHtml=nextAbilities.length
    ?'<div class="pet-training-group is-next">'+nextAbilities.map(ability=>abilityCard(ability,'next')).join('')+'</div>'
    :'';
  const laterHtml=laterAbilities.length
    ?'<details class="details pet-training-later"><summary>Spätere Fähigkeiten und Ränge · '+laterAbilities.length+'</summary><div class="pet-training-later-list">'+laterAbilities.map(ability=>abilityCard(ability,'later')).join('')+'</div></details>'
    :'';
  const training=active&&family
    ?(trainingAllowed&&localizedAbilities.length
      ?'<div class="pet-subsection"><div class="pet-subsection-head"><div><span class="pet-overline">AUSBILDUNG</span><h4>Fähigkeiten</h4></div></div>'+
        '<div class="pet-training-overview">'+currentHtml+nextHtml+'</div>'+laterHtml+
        '<p class="pet-note">„Jetzt erlernbar“ bedeutet: Slydris hat die nötige Stufe. Ob die Fähigkeit bereits gelernt wurde, kann Blizzard online derzeit nicht anzeigen.</p></div>'
      :trainingAllowed?'':petRuleUnavailable('Ausbildungsdaten vorübergehend nicht verfügbar'))
    :'';
  const care=active?'<div class="pet-subsection"><div class="pet-subsection-head"><div><span class="pet-overline">PFLEGE & SPIELMECHANIK</span><h4>Was online nicht sichtbar ist</h4></div></div>'+
    '<div class="pet-tips">'+
      '<div><strong>Treue & Ausbildungspunkte</strong><span>Treue, Zufriedenheit, freie/verbrauchte Ausbildungspunkte und das tatsächlich gelernte Pet-Zauberbuch veröffentlicht Blizzard derzeit nicht in der Online-Armory. Deshalb werden dafür keine Schätzwerte angezeigt.</span></div>'+
    '</div></div>':'';
  const stable='<div class="pet-subsection"><div class="pet-subsection-head"><div><span class="pet-overline">STALL</span><h4>Weitere gezähmte Begleiter · '+stableList.length+'</h4></div></div>'+
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

// Technische Slot-IDs steuern nur die Reihenfolge. Sichtbare Slotnamen kommen ausschließlich aus der deutschen Blizzard-Quelle.
const equipmentSlotOrder=[
  'HEAD','NECK','SHOULDER','BACK','CHEST','SHIRT','TABARD','WRIST',
  'HANDS','WAIST','LEGS','FEET','FINGER_1','FINGER_2','TRINKET_1','TRINKET_2',
  'MAIN_HAND','OFF_HAND','RANGED'
];
function equipmentPanel(c,open=false){
  const available=new Map();
  for(const item of c.equipment||[]){
    const slotType=String(item?.slotType||'');
    if(equipmentSlotOrder.includes(slotType)&&item.item&&!available.has(slotType))available.set(slotType,item);
  }
  const rows=equipmentSlotOrder.map(slotType=>{
    const item=available.get(slotType);
    if(!item)return '<div class="equip equip-empty"><span class="equip-placeholder" aria-hidden="true">–</span><div><b>Ausrüstungsplatz</b><span>Leer</span></div></div>';
    const iconUrl=item.storedIcon||item.icon;
    const safeIcon=/^(https:\/\/render\.worldofwarcraft\.com\/forever-eu\/icons\/\d+\/\d+\.jpg|https:\/\/foreverspec\.com\/icons\/\d+\.webp)$/.test(iconUrl||'')||validBlob(iconUrl);
    const icon=safeIcon?'<img class="equip-icon" src="'+esc(iconUrl)+'" alt="" loading="lazy">':'<span class="equip-placeholder" aria-hidden="true">—</span>';
    const quality=String(item.quality||'').toUpperCase();
    const qualityClass=itemQualityClasses[quality]||'quality-unknown';
    const qualityTitle='';
    return '<div class="equip equip-filled">'+icon+'<div><b>'+esc(item.slot||'Ausrüstungsplatz')+'</b><span class="equip-name '+qualityClass+'"'+qualityTitle+'>'+esc(item.item)+'</span>'+(item.level?' <small>· Gegenstandsstufe '+esc(item.level)+'</small>':'')+'</div></div>';
  }).join('');
  const verified=c.equipmentVerified&&c.scrapeOk!==false?'':' · letzter bekannter Stand';
  const itemLevel=Number.isFinite(Number(c.equippedItemLevel))?Number(c.equippedItemLevel):null;
  const overview=itemLevel===null?'':'<div class="equipment-overview"><small>Gegenstandsstufe</small><strong>'+esc(itemLevel)+'</strong></div>';
  return '<div class="section equipment-section"><h3>Ausrüstung</h3>'+overview+
    '<details class="details" data-detail-key="'+esc(c.slug)+':equipment"'+(open?' open':'')+'><summary>Ausrüstung anzeigen · '+available.size+'/'+equipmentSlotOrder.length+' belegt'+verified+'</summary><div class="equipment">'+rows+'</div></details></div>';
}

const validBlob=u=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname.endsWith('.public.blob.vercel-storage.com')&&/^(?:\/portraits\/|\/equipment\/|\/media\/)/.test(x.pathname)}catch{return false}};
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
let displayedReputationCatalog={build:null,expected:0,records:{}};
function characterTabsFor(c){
  if(!isHunter(c))return baseCharacterTabs;
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
    const liveStatEnums=new Set(Array.isArray(c.statsFreshEnums)?c.statsFreshEnums:
      c.statsVerified?Object.keys(c.statsByEnum||{}):[]);
    const mergedStatsByEnum={...c.statsByEnum};
    for(const [key,value] of Object.entries(prior.statsByEnum||{})){
      if(!liveStatEnums.has(key))mergedStatsByEnum[key]=value;
    }
    const detailByEnum=new Map((prior.statsDetails||[]).filter(x=>x?.enum).map(x=>[x.enum,x]));
    for(const entry of c.statsDetails||[])if(entry?.enum)detailByEnum.set(entry.enum,entry);
    const mergedStatsDetails=[...detailByEnum.values()];
    const priorSkills=new Map((prior.professions||[]).map(p=>[p.name,p]));
    const mergedProfessions=(c.professions||[]).map(p=>{
      const previous=priorSkills.get(p.name);
      return p.unverified&&previous?{...previous,unverified:true}:p;
    });
    const keepPreviousImage=c.imageVerified===false&&prior.imageUrl;
    return {...c,
      stats:mergedStats,
      statsByEnum:mergedStatsByEnum,
      statsDetails:mergedStatsDetails,
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
function render(data,{live=false,success=null,questCatalog=displayedQuestCatalog,petRules=displayedPetRules,reputationCatalog=displayedReputationCatalog,petCatalog=displayedPetCatalog}={}){
 displayedData=data;
 displayedQuestCatalog=questCatalog||{};
 displayedPetRules=petRules||null;
 displayedReputationCatalog=reputationCatalog||{build:null,expected:0,records:{}};
 displayedPetCatalog=petCatalog||{};
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
 cards.innerHTML=chars.map((c,index)=>`<article class="card ${classColor(c)}">
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
  <div class="meta"><span class="pill">${esc(c.gameStringsVerified===true?c.class:'Klasse nicht verfügbar')}</span><span class="pill">${esc(c.gameStringsVerified===true?c.race:'Volk nicht verfügbar')}</span><span class="pill">${esc(c.gameStringsVerified===true?c.faction:'Fraktion nicht verfügbar')} · EU-${esc(c.ruleset?.name||'Regelwerk nicht verfügbar')}</span></div>
  ${c.scrapeOk===false?'<p class="status profile-warning">⚠ Letzter Profilabruf fehlgeschlagen – gespeicherter Stand</p>':''}
  ${experienceProgress(c)}
  ${characterTabsNav(c)}
  <div class="character-tab-panels">
    ${characterTabPanel(c,'talents',talentPanel(c))}
    ${isHunter(c)?characterTabPanel(c,'pets',hunterPetsPanel(c)):''}
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
function segmentedControl(id,value,options,label){
  return '<div class="segmented-control" data-segmented-control="'+esc(id)+'" role="radiogroup" aria-label="'+esc(label)+'">'+
    options.map(([optionValue,optionLabel])=>'<button type="button" class="segmented-option '+(value===optionValue?'is-active':'')+'" data-segmented-value="'+esc(optionValue)+'" role="radio" aria-checked="'+(value===optionValue?'true':'false')+'">'+esc(optionLabel)+'</button>').join('')+
    '</div>';
}
const comparisonState={selected:new Set(),expanded:new Set(['stats','equipment','talents','quests','professions','reputation']),mode:'all'};
const comparisonSections=[['stats','Charakterwerte'],['equipment','Ausrüstung'],['talents','Talente'],['quests','Quests'],['professions','Berufe'],['reputation','Ruf']];
const compareRoot=document.querySelector('#compareContent');
const charactersView=document.querySelector('#charactersView');
const compareView=document.querySelector('#compareView');
const workshopRoot=document.querySelector('#workshopContent');
const workshopView=document.querySelector('#workshopView');
function setMainView(view){
  const compare=view==='compare',workshop=view==='workshop';
  charactersView.hidden=compare||workshop;
  compareView.hidden=!compare;
  workshopView.hidden=!workshop;
  document.querySelectorAll('[data-view-link]').forEach(a=>{
    const on=a.dataset.viewLink===view;a.classList.toggle('is-active',on);
    if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  if(compare)renderComparison();
  if(workshop)loadWorkshopOverview();
}
function syncMainView(){
  const view=location.hash==='#vergleich'?'compare':location.hash==='#werkstatt'?'workshop':'characters';
  setMainView(view);
}
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
    const namesByEnum=new Map();
    for(const c of chars)for(const entry of Array.isArray(c.statsDetails)?c.statsDetails:[]){
      if(entry?.enum&&entry?.name&&!namesByEnum.has(entry.enum))namesByEnum.set(entry.enum,entry.name);
    }
    const orderedEnums=[
      ...mainStatEnums.filter(key=>namesByEnum.has(key)),
      ...[...namesByEnum.keys()].filter(key=>!mainStatEnums.includes(key))
    ];
    for(const enumKey of orderedEnums){
      const label=namesByEnum.get(enumKey);
      push(label,c=>{
        const detail=(c.statsDetails||[]).find(entry=>entry?.enum===enumKey);
        const value=c.statsByEnum?.[enumKey];
        return cmpEntry(detail?formatStatValue({...detail,value}):'–',value,'',c.scrapeOk===false||!(c.statsFreshEnums||[]).includes(enumKey));
      });
    }
  }
  if(id==='equipment'){
    push('Gegenstandsstufe',c=>cmpEntry(c.equippedItemLevel??c.statsByEnum?.ITEMLEVEL,c.equippedItemLevel??c.statsByEnum?.ITEMLEVEL));
    const slots=chars.map(c=>{const m=new Map();for(const item of c.equipment||[]){const key=item?.slotType;if(key&&!m.has(key)&&item.item)m.set(key,item)}return m});
    for(const slotType of equipmentSlotOrder){
      const label=slots.map(m=>m.get(slotType)?.slot).find(Boolean);
      if(!label)continue;
      push(label,(c,i)=>{const it=slots[i].get(slotType);return it?cmpEntry(it.item,it.level,'Stufe '+(it.level??'–'),c.equipmentVerified===false||c.scrapeOk===false):cmpEntry(c.equipmentVerified===false?'–':'Leer',null,'',c.equipmentVerified===false||c.scrapeOk===false)},{comparable:true});
    }
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
      push(name,c=>{const p=(c.professions||[]).find(x=>x.name===name);return p?cmpEntry((p.current??'–')+' / '+(p.max??'–'),p.current,'',p.unverified||c.scrapeOk===false):cmpEntry(c.professionsVerified===true?'Nicht erlernt':'–',null,'',c.professionsVerified!==true)});
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
    '<div class="compare-toolbar"><span>'+selected.length+' Charaktere · alphabetisch geordnet</span>'+segmentedControl('compare-mode',comparisonState.mode,[['all','Alle Werte'],['differences','Nur Unterschiede']],'Vergleichsansicht')+'</div>'+
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
  compareRoot.querySelectorAll('[data-segmented-control="compare-mode"] [data-segmented-value]').forEach(button=>button.addEventListener('click',()=>{
    comparisonState.mode=button.dataset.segmentedValue==='differences'?'differences':'all';
    renderComparison();
  }));
}

const workshopState={
  overview:null,
  loading:false,
  error:null,
  query:'',
  suggestions:[],
  searchMode:'all',
  browseMode:'craftable',
  selected:null,
  quantity:1,
  browsePath:[]
};
let workshopSearchTimer=null;
function workshopNodeAtPath(tree,path=[]){
  let node=tree||{};
  for(const segment of path){
    if(!node||!node[segment])break;
    node=node[segment];
  }
  return node||{};
}
function workshopCategoryKeys(node){
  return Object.keys(node||{}).filter(key=>key!=='_items').sort((a,b)=>a.localeCompare(b,'de'));
}
function workshopBrowseHtml(){
  const tree=workshopState.browseMode==='all'
    ?workshopState.overview?.browseAll||{}
    :workshopState.overview?.browseCraftable||{};
  let node=tree,html='',path=[];
  for(let depth=0;depth<5;depth++){
    const keys=workshopCategoryKeys(node);
    if(!keys.length)break;
    const chosen=workshopState.browsePath[depth]&&keys.includes(workshopState.browsePath[depth])?workshopState.browsePath[depth]:'';
    const label=depth===0?'Kategorie':depth===1?'Unterkategorie':'Typ '+depth;
    html+='<label class="workshop-field"><span>'+esc(label)+'</span><select data-workshop-browse-level="'+depth+'"><option value="">Bitte wählen …</option>'+
      keys.map(key=>'<option value="'+esc(key)+'"'+(chosen===key?' selected':'')+'>'+esc(key)+'</option>').join('')+'</select></label>';
    if(!chosen)break;
    path.push(chosen);node=node[chosen]||{};
  }
  const items=Array.isArray(node?._items)?node._items:[];
  if(items.length){
    html+='<label class="workshop-field"><span>Gegenstand</span><select id="workshopBrowseItem"><option value="">Bitte wählen …</option>'+
      items.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join('')+'</select></label>';
  }
  return html||'<p class="workshop-muted">'+(workshopState.browseMode==='all'?'Noch keine Gegenstände im vollständigen Rezeptkatalog verfügbar.':'Noch keine aktuell herstellbaren Gegenstände kategorisiert.')+'</p>';
}
function workshopCrafterText(crafters=[]){
  if(!crafters.length)return 'Keiner der Daltons kann diesen Gegenstand aktuell herstellen.';
  return crafters.map(c=>c.name+(c.profession?' · '+c.profession:'')+(Number.isFinite(Number(c.skill))?' '+c.skill+'/'+(c.skillCap??'–'):'')).join(' · ');
}
function workshopCopper(value){
  const n=Math.max(0,Math.round(Number(value)||0));
  const gold=Math.floor(n/10000),silver=Math.floor((n%10000)/100),copper=n%100;
  return [gold?gold+' G':'',silver?silver+' S':'',copper||(!gold&&!silver)?copper+' K':''].filter(Boolean).join(' ');
}
function workshopLearningCandidatesHtml(result){
  const list=Array.isArray(result.learningCandidates)?result.learningCandidates:[];
  if(!list.length)return '<p class="workshop-muted">Keiner der Daltons besitzt aktuell den passenden Beruf.</p>';
  return '<div class="workshop-learning-candidates">'+list.map(candidate=>{
    const status=candidate.status==='can-learn-now'
      ?'<span class="workshop-learning-state is-ready">Beruf/Skill reicht jetzt</span>'
      :candidate.status==='skill-gap'
        ?'<span class="workshop-learning-state">Noch '+esc(candidate.gap)+' Skillpunkt'+(candidate.gap===1?'':'e')+'</span>'
        :'<span class="workshop-learning-state">Passender Beruf</span>';
    const skill=Number.isFinite(Number(candidate.skill))
      ?esc(candidate.skill)+'/'+esc(candidate.skillCap??'–')
      :'Skill unbekannt';
    const requirement=Number.isFinite(Number(candidate.requiredSkill))?' · benötigt '+esc(candidate.requiredSkill):'';
    return '<div class="workshop-learning-candidate"><div><strong>'+esc(candidate.name)+'</strong><span>'+esc(candidate.profession)+' · '+skill+requirement+'</span></div>'+status+'</div>';
  }).join('')+'</div>';
}
const workshopSourceTypeLabels={trainer:'Lehrer',vendor:'Händler',quest:'Quest',drop:'Beute',object:'Objekt',item:'Rezeptgegenstand',source:'Quelle'};
const workshopSideLabels={alliance:'Allianz',horde:'Horde',neutral:'Neutral/sonstige'};
function workshopSourceHtml(source){
  const location=source.location||{};
  const coords=Number.isFinite(Number(location.x))&&Number.isFinite(Number(location.y))
    ?Number(location.x).toLocaleString('de-DE',{maximumFractionDigits:1})+' / '+Number(location.y).toLocaleString('de-DE',{maximumFractionDigits:1})
    :'';
  const where=[location.zone,coords,location.instance].filter(Boolean).join(' · ');
  const details=[
    source.side?workshopSideLabels[source.side]||source.side:'',
    where,
    Number.isFinite(Number(source.priceCopper))?workshopCopper(source.priceCopper):'',
    Number.isFinite(Number(source.limitedStock))?'Vorrat '+source.limitedStock:'',
    source.reputationFaction?'Ruf: '+source.reputationFaction:''
  ].filter(Boolean).join(' · ');
  const evidence=source.evidence==='forever-confirmed'
    ?'<span class="workshop-source-evidence is-confirmed">In Forever bestätigt</span>'
    :source.evidence==='classic-unconfirmed'
      ?'<span class="workshop-source-evidence is-classic">Classic-Daten · nicht bestätigt</span>'
      :'<span class="workshop-source-evidence">Status unbekannt</span>';
  return '<div class="workshop-source-card"><div class="workshop-source-main"><span class="workshop-source-type">'+esc(workshopSourceTypeLabels[source.type]||source.type||'Quelle')+'</span><strong>'+esc(source.name||'Unbekannte Quelle')+'</strong>'+evidence+'</div>'+
    (details?'<span class="workshop-source-details">'+esc(details)+'</span>':'')+'</div>';
}
function workshopLearningHtml(result){
  const recipe=result.recipe;
  if(!recipe)return '<section class="workshop-learning"><h4>Wer könnte es lernen?</h4><p>'+esc(result.learningSourcesReason||'Für diesen Gegenstand ist kein Herstellungsrezept bekannt.')+'</p></section>';
  const candidates=Array.isArray(result.learningCandidates)?result.learningCandidates:[];
  const verifiedProfession=candidates.find(candidate=>candidate.profession)?.profession||null;
  const requirement=Number.isFinite(Number(recipe.requiredSkill))
    ?' · benötigt '+(verifiedProfession?esc(verifiedProfession)+' ':'Berufsfertigkeit ')+esc(recipe.requiredSkill)
    :verifiedProfession?' · '+esc(verifiedProfession):'';
  const sources=Array.isArray(result.learningSources)?result.learningSources:[];
  const confirmed=sources.filter(source=>source.evidence==='forever-confirmed');
  const other=sources.filter(source=>source.evidence!=='forever-confirmed');
  const sourceHtml=recipe.learning?.automatic===true
    ?'<div class="workshop-learning-auto">Automatisch gelernt'+requirement+'</div>'
    :sources.length
      ?'<div class="workshop-source-groups">'+
        (confirmed.length?'<div><h5>In WoW Forever bestätigt · '+confirmed.length+'</h5>'+confirmed.map(workshopSourceHtml).join('')+'</div>':'')+
        (other.length?'<details class="workshop-source-unconfirmed"><summary>Weitere Quellen · '+other.length+'</summary>'+other.map(workshopSourceHtml).join('')+'</details>':'')+
        '</div>'
      :'<p>'+esc(result.learningSourcesReason||'ForeverDB kennt derzeit keine konkrete Bezugsquelle.')+'</p>';
  return '<section class="workshop-learning"><h4>Wer könnte es lernen?</h4>'+
    '<p class="workshop-recipe-line"><strong>'+esc(recipe.name||result.item?.name||'Rezept')+'</strong>'+requirement+'</p>'+
    workshopLearningCandidatesHtml(result)+
    '<div class="workshop-learning-sources"><h5>Bezugsquellen</h5>'+sourceHtml+'</div></section>';
}
function workshopTreeHtml(node,depth=0){
  if(!node?.item)return '';
  const craftable=node.status==='craftable'&&node.recipe;
  const status=craftable
    ?'<span class="workshop-node-status is-craftable">Herstellbar · '+esc(workshopCrafterText(node.recipe.crafters||[]))+'</span>'
    :'<span class="workshop-node-status is-obtain">Muss beschafft werden</span>';
  const recipe=craftable
    ?'<div class="workshop-node-meta"><span>'+esc(node.recipe.profession||'Beruf')+'</span><span>'+esc(node.recipe.craftsRequired)+'× Herstellung</span>'+
      (node.recipe.yieldPerCraft?.variable?'<span>Ausbeute '+esc(node.recipe.yieldPerCraft.min)+'–'+esc(node.recipe.yieldPerCraft.max)+'</span>':'')+'</div>'
    :'';
  const children=(node.materials||[]).map(child=>workshopTreeHtml(child,depth+1)).join('');
  return '<div class="workshop-tree-node" style="--workshop-depth:'+depth+'"><div class="workshop-node-card">'+
    '<div class="workshop-node-title"><strong>'+esc(node.quantity)+'× '+esc(node.item.name)+'</strong>'+status+'</div>'+recipe+'</div>'+
    (children?'<div class="workshop-tree-children">'+children+'</div>':'')+'</div>';
}
function workshopResultHtml(){
  const result=workshopState.selected;
  if(!result)return '<div class="workshop-placeholder"><strong>Noch kein Gegenstand ausgewählt.</strong><span>Nutze die Suche oder taste dich über die Kategorien vor.</span></div>';
  const item=result.item||{};
  const tree=result.plan?.tree;
  const topCrafters=tree?.recipe?.crafters||item.crafters||[];
  const craftable=tree?.status==='craftable';
  const base=(result.plan?.externalMaterials||[]);
  return '<article class="workshop-result">'+
    '<div class="workshop-result-head"><div><span class="workshop-kicker">'+(craftable?'DIE DALTONS KÖNNEN DAS':'DERZEIT NICHT IM REPERTOIRE')+'</span><h3>'+esc(item.name||('Item '+item.id))+'</h3>'+
    '<p>'+esc(workshopCrafterText(topCrafters))+'</p></div>'+
    (craftable?'<label class="workshop-quantity"><span>Menge</span><input id="workshopQuantity" type="number" min="1" max="9999" step="1" value="'+esc(workshopState.quantity)+'"></label>':'')+'</div>'+
    (craftable&&tree?'<section class="workshop-production"><h4>Produktionsbaum</h4>'+workshopTreeHtml({...tree,item:{...tree.item,name:item.name||tree.item?.name}},0)+'</section>':'')+
    (craftable&&base.length?'<section class="workshop-base-materials"><h4>Am Ende zu beschaffen</h4><div class="workshop-material-grid">'+base.map(material=>'<div><strong>'+esc(material.quantity)+'×</strong><span>'+esc(material.name)+'</span></div>').join('')+'</div></section>':'')+
    (!craftable?workshopLearningHtml(result):'')+
    (result.source==='foreverdb'?'<p class="workshop-credit">Datenquelle: <a href="https://foreverdb.net" target="_blank" rel="noopener">ForeverDB.net</a></p>':'')+
    '</article>';
}
function renderWorkshop(){
  if(!workshopRoot)return;
  if(workshopState.loading&&!workshopState.overview){
    workshopRoot.innerHTML='<p class="compare-empty">Werkstatt wird geladen …</p>';return;
  }
  if(workshopState.error&&!workshopState.overview){
    workshopRoot.innerHTML='<p class="error">'+esc(workshopState.error)+'</p>';return;
  }
  const overview=workshopState.overview||{};
  const suggestions=workshopState.suggestions.length
    ?'<div class="workshop-suggestions" role="listbox">'+workshopState.suggestions.map(item=>
      '<button type="button" data-workshop-suggestion="'+esc(item.id)+'"><span><strong>'+esc(item.name)+'</strong>'+
      '<small>'+(item.craftable?'✓ '+esc((item.crafters||[]).map(c=>c.name).join(' · ')):'Kein Dalton-Crafter')+'</small></span><span aria-hidden="true">›</span></button>'
    ).join('')+'</div>':'';
  const catalogNote=overview.recipeCatalog?.connected
    ?overview.recipeCatalog.complete
      ?'<span class="workshop-source-ok">ForeverDB verbunden · '+esc(overview.recipeCatalog.recipeCount||0)+' Rezepte · '+esc(overview.recipeCatalog.professionCount||12)+' Berufe</span>'
      :'<span class="workshop-source-note">Vollkatalog wird aufgebaut · '+esc(overview.recipeCatalog.refreshProgress?.completed||overview.recipeCatalog.professionCount||0)+'/'+esc(overview.recipeCatalog.refreshProgress?.total||12)+' Berufe</span>'
    :overview.foreverDbConfigured
      ?'<span class="workshop-source-note">ForeverDB-Key vorhanden · Rezeptkatalog derzeit nicht erreichbar</span>'
      :'<span class="workshop-source-note">Aktuell Blizzard-Werkstattdaten · ForeverDB noch nicht verbunden</span>';
  workshopRoot.innerHTML=
    '<div class="workshop-shell">'+
      '<section class="workshop-search-panel"><div class="workshop-search-head"><div><span class="workshop-kicker">DIREKTER WEG</span><h3>Gegenstand suchen</h3></div>'+catalogNote+'</div>'+
        '<div class="view-filter-row"><span>Anzeige</span>'+segmentedControl('workshop-search-mode',workshopState.searchMode,[['all','Alle'],['craftable','Herstellbar']],'Suchbereich')+'</div>'+
        '<div class="workshop-search-wrap"><span class="workshop-search-icon" aria-hidden="true">⌕</span><input id="workshopSearch" type="search" autocomplete="off" placeholder="z. B. Kupferbarren" value="'+esc(workshopState.query)+'" aria-label="Gegenstand suchen">'+suggestions+'</div>'+
      '</section>'+
      '<section class="workshop-browse-panel"><div><span class="workshop-kicker">GEFÜHRTE AUSWAHL</span><h3>Gegenstände durchstöbern</h3><p>'+(workshopState.browseMode==='craftable'?'Nur Gegenstände, die mindestens ein Dalton aktuell herstellen kann.':'Alle herstellbaren Gegenstände aus dem vollständigen Rezeptkatalog.')+'</p><div class="view-filter-row"><span>Anzeige</span>'+segmentedControl('workshop-browse-mode',workshopState.browseMode,[['all','Alle'],['craftable','Herstellbar']],'Dropdown-Katalog')+'</div></div><div class="workshop-browse-fields">'+workshopBrowseHtml()+'</div></section>'+
      workshopResultHtml()+
      ((overview.recipeCatalog?.connected||workshopState.selected?.source==='foreverdb')?'<p class="workshop-global-credit">ForeverDB-Daten: <a href="https://foreverdb.net" target="_blank" rel="noopener">ForeverDB.net</a></p>':'')+
    '</div>';
  workshopRoot.querySelectorAll('[data-segmented-control="workshop-search-mode"] [data-segmented-value]').forEach(button=>button.addEventListener('click',()=>{
    const next=button.dataset.segmentedValue==='craftable'?'craftable':'all';
    if(next===workshopState.searchMode)return;
    workshopState.searchMode=next;
    workshopState.suggestions=[];
    const query=workshopState.query;
    renderWorkshop();
    if(query.trim().length>=2)searchWorkshop(query);
  }));
  workshopRoot.querySelectorAll('[data-segmented-control="workshop-browse-mode"] [data-segmented-value]').forEach(button=>button.addEventListener('click',()=>{
    workshopState.browseMode=button.dataset.segmentedValue==='all'?'all':'craftable';
    workshopState.browsePath=[];
    renderWorkshop();
  }));
  const search=workshopRoot.querySelector('#workshopSearch');
  search?.addEventListener('input',()=>{
    workshopState.query=search.value;
    clearTimeout(workshopSearchTimer);
    if(workshopState.query.trim().length<2){workshopState.suggestions=[];renderWorkshop();return;}
    workshopSearchTimer=setTimeout(()=>searchWorkshop(workshopState.query),180);
  });
  workshopRoot.querySelectorAll('[data-workshop-suggestion]').forEach(button=>button.addEventListener('click',()=>selectWorkshopItem(Number(button.dataset.workshopSuggestion))));
  workshopRoot.querySelectorAll('[data-workshop-browse-level]').forEach(select=>select.addEventListener('change',()=>{
    const level=Number(select.dataset.workshopBrowseLevel);
    workshopState.browsePath=[...workshopState.browsePath.slice(0,level),select.value].filter(Boolean);
    renderWorkshop();
  }));
  workshopRoot.querySelector('#workshopBrowseItem')?.addEventListener('change',event=>{
    const id=Number(event.target.value);if(Number.isInteger(id)&&id>0)selectWorkshopItem(id);
  });
  workshopRoot.querySelector('#workshopQuantity')?.addEventListener('change',event=>{
    const quantity=Math.max(1,Math.min(9999,Math.ceil(Number(event.target.value)||1)));
    workshopState.quantity=quantity;
    if(workshopState.selected?.item?.id)selectWorkshopItem(workshopState.selected.item.id,{preserveQuery:true});
  });
}
let workshopDataEpoch=0;
async function workshopFetch(url){
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error('Werkstatt HTTP '+response.status);
  return response.json();
}
async function loadWorkshopOverview(){
  if(workshopState.overview||workshopState.loading)return;
  const epoch=workshopDataEpoch;
  workshopState.loading=true;workshopState.error=null;renderWorkshop();
  try{
    const overview=await workshopFetch('/api/workshop?t='+Date.now());
    if(epoch!==workshopDataEpoch)return;
    workshopState.overview=overview;
  }catch(error){
    if(epoch===workshopDataEpoch)workshopState.error='Werkstattdaten konnten nicht geladen werden.';
  }finally{
    if(epoch===workshopDataEpoch){workshopState.loading=false;renderWorkshop()}
  }
}
async function searchWorkshop(query){
  const current=query.trim();
  if(current.length<2)return;
  const epoch=workshopDataEpoch;
  try{
    const mode=workshopState.searchMode;
    const result=await workshopFetch('/api/workshop?q='+encodeURIComponent(current)+'&scope='+encodeURIComponent(mode)+'&t='+Date.now());
    if(epoch!==workshopDataEpoch||workshopState.query.trim()!==current||workshopState.searchMode!==mode)return;
    workshopState.suggestions=result.suggestions||[];
  }catch{
    if(epoch===workshopDataEpoch)workshopState.suggestions=[];
  }
  if(epoch!==workshopDataEpoch)return;
  renderWorkshop();
  const input=workshopRoot?.querySelector('#workshopSearch');if(input){input.focus();input.setSelectionRange?.(input.value.length,input.value.length)}
}
async function selectWorkshopItem(itemId,{preserveQuery=false}={}){
  if(!Number.isInteger(itemId)||itemId<=0)return;
  const epoch=workshopDataEpoch;
  try{
    const result=await workshopFetch('/api/workshop?item='+itemId+'&quantity='+workshopState.quantity+'&t='+Date.now());
    if(epoch!==workshopDataEpoch)return;
    workshopState.selected=result;
    workshopState.suggestions=[];
    if(!preserveQuery)workshopState.query=result.item?.name||workshopState.query;
  }catch{
    if(epoch!==workshopDataEpoch)return;
    workshopState.selected=null;workshopState.error='Gegenstand konnte nicht geladen werden.';
  }
  if(epoch===workshopDataEpoch)renderWorkshop();
}
function invalidateWorkshopData({reloadVisible=true}={}){
  const selectedId=Number(workshopState.selected?.item?.id);
  workshopDataEpoch++;
  workshopState.overview=null;
  workshopState.loading=false;
  workshopState.error=null;
  workshopState.suggestions=[];
  workshopState.selected=null;
  if(!workshopView.hidden){
    renderWorkshop();
    if(reloadVisible){
      loadWorkshopOverview();
      if(Number.isInteger(selectedId)&&selectedId>0)selectWorkshopItem(selectedId,{preserveQuery:true});
    }
  }
}

let lastGeneratedAt=null;
let lastDataVersion=null;
let dataLoadPromise=null;
let versionCheckPromise=null;
function payloadDataVersion(payload={}){
  if(typeof payload?.dataVersion?.version==='string'&&payload.dataVersion.version)return payload.dataVersion.version;
  return ['data-v1',payload?.data?.generatedAt||'',payload?.petRules?.checkedAt||'',payload?.petRules?.rulebookVersion||'',payload?.petRules?.overall||''].join('|');
}
function applyServerPayload(payload,{live=false,success=null,force=false}={}){
  const data=payload?.data;
  if(!data||!Array.isArray(data.characters))return false;
  const nextVersion=payloadDataVersion(payload);
  const nextGeneratedAt=typeof data.generatedAt==='string'?data.generatedAt:null;
  const characterDataChanged=nextGeneratedAt!==lastGeneratedAt;
  if(!force&&lastDataVersion&&nextVersion===lastDataVersion)return false;
  lastDataVersion=nextVersion;
  lastGeneratedAt=nextGeneratedAt;
  render(data,{
    live,
    success,
    questCatalog:payload.questCatalog||{},
    petRules:payload.petRules||null,
    reputationCatalog:payload.reputationCatalog||{},
    petCatalog:payload.petCatalog||{}
  });
  if(characterDataChanged)invalidateWorkshopData({reloadVisible:true});
  return true;
}
async function load({silent=false,force=false}={}){
  if(dataLoadPromise)return dataLoadPromise;
  dataLoadPromise=(async()=>{
    if(!silent)status.textContent="Dauerhaft gespeicherte Daten werden geladen …";
    try{
      const r=await fetch('/api/characters?t='+Date.now(),{cache:"no-store"});
      if(!r.ok)throw new Error("HTTP "+r.status);
      const result=await r.json();
      applyServerPayload(result,{force});
      return true;
    }catch(e){
      if(!displayedData&&!silent){
        try{
          const fallback=await fetch('/data/characters.json',{cache:'no-store'});
          if(!fallback.ok)throw Error('Fallback');
          const fallbackData=await fallback.json();
          lastGeneratedAt=fallbackData.generatedAt||null;
          render(fallbackData);
          status.textContent='Datenbank derzeit nicht verfügbar – letzter GitHub-Sicherungsstand.';
        }catch{
          status.innerHTML='<span class="error">Gespeicherte Daten konnten nicht geladen werden.</span>';
        }
      }
      return false;
    }
  })();
  try{return await dataLoadPromise}finally{dataLoadPromise=null}
}
async function checkForNewData(){
  if(document.visibilityState==='hidden'||button.disabled||versionCheckPromise)return false;
  versionCheckPromise=(async()=>{
    try{
      const response=await fetch('/api/data-version?t='+Date.now(),{cache:'no-store'});
      if(!response.ok)return false;
      const version=await response.json();
      if(!version?.version)return false;
      if(!lastDataVersion||version.version!==lastDataVersion){
        await load({silent:true,force:true});
        return true;
      }
      return false;
    }catch{return false}
  })();
  try{return await versionCheckPromise}finally{versionCheckPromise=null}
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
    if(response.pending){
      status.textContent='Eine andere Aktualisierung läuft bereits. Der neue Serverstand wird automatisch übernommen, sobald er gespeichert ist.';
      setTimeout(()=>checkForNewData(),5000);
      return;
    }
    if(!response.data||!response.success)throw new Error('Keine aktuellen Profile');
    applyServerPayload(response,{live:true,success:response.success,force:true});
  }catch(e){
    status.innerHTML='<span class="error">Live-Abruf derzeit nicht verfügbar. Der gespeicherte Stand bleibt sichtbar. Bitte später erneut auf „Aktualisieren“ klicken.</span>';
    if(freshness&&lastGeneratedAt){const t=Number.isFinite(Date.parse(lastGeneratedAt))?new Date(lastGeneratedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"unbekannt";freshness.textContent="Letzter angezeigter Datenstand: "+t;}
  }finally{button.disabled=false;button.textContent="↻ Aktualisieren"}
}
button.innerHTML='<span aria-hidden="true">↻</span> Aktualisieren';
button.addEventListener('click',refreshLive);
load();
syncMainView();

const DATA_FRESHNESS_INTERVAL_MS=60*1000;
setInterval(()=>{if(document.visibilityState==='visible')checkForNewData()},DATA_FRESHNESS_INTERVAL_MS);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForNewData()});
window.addEventListener('focus',()=>checkForNewData());
window.addEventListener('pageshow',()=>checkForNewData());
window.addEventListener('online',()=>checkForNewData());
// Nur die leichte Datenversion wird automatisch geprüft; echte Blizzard-Liveabrufe bleiben Button/Cron vorbehalten.
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
