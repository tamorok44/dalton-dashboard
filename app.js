const heroCast=document.querySelector("#heroCast");const cards=document.querySelector("#cards");const summary=document.querySelector("#summary");const status=document.querySelector("#status");const freshness=document.querySelector("#dataFreshness");const button=document.querySelector("#refreshButton");
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
const mainStatNames=['Gesundheit','Mana','Rüstung','Gegenstandsstufe'];
const secondaryStatNames=['Stärke','Beweglichkeit','Ausdauer','Intelligenz','Angriffskraft'];
function statsPanel(c,open=false){
  const s=c.stats||{};
  const main=mainStatNames.map(name=>'<div class="vital"><small>'+esc(name)+'</small><strong>'+esc(s[name]??'–')+'</strong></div>').join('');
  const rest=secondaryStatNames.map(name=>row(name,s[name]??'–')).join('');
  return '<div class="section character-stats"><h3>Charakterwerte'+(c.statsVerified?'':' · letzter bekannter Stand')+'</h3><div class="vitals">'+main+'</div><details class="details attributes" data-detail-key="'+esc(c.slug)+':stats"'+(open?' open':'')+'><summary>Weitere Charakterwerte anzeigen</summary><div class="rows">'+rest+'</div></details></div>';
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
function professionRows(list=[]){
  if(!list.length)return row('Berufe','nicht verfügbar');
  return list.map(p=>{
    const current=Number(p.current),max=Number(p.max);
    const valid=Number.isFinite(current)&&Number.isFinite(max)&&max>0;
    const currentSkill=valid?Math.max(0,current):0;
    const rank=valid?professionRank(max):'Rang unbekannt';
    const fraction=valid?Math.round(current)+'/'+Math.round(max):'–/–';
    const label=String(p.name||'Beruf')+(p.unverified?' · letzter Stand':'');
    const stageSegments=professionStages.map((stage,index)=>{
      const from=index*75,unlocked=valid&&max>from;
      const pct=valid?Math.max(0,Math.min(100,((currentSkill-from)/75)*100)):0;
      return '<span class="profession-segment '+(unlocked?'is-unlocked':'is-locked')+'">'+
        '<span class="profession-segment-fill" style="width:'+pct.toFixed(2)+'%"></span></span>';
    }).join('');
    return '<div class="profession">'+
      '<div class="profession-head"><span class="profession-label">'+esc(label)+'</span>'+
      '<span class="profession-rank">'+esc(rank)+'</span></div>'+
      '<div class="profession-track" role="progressbar" aria-label="'+esc(label)+'" aria-valuemin="0" aria-valuemax="300" aria-valuenow="'+(valid?Math.max(0,Math.min(300,Math.round(currentSkill))):0)+'" aria-valuetext="'+esc(valid?fraction+' · '+rank:'kein bestätigter Stand')+'">'+
      stageSegments+
      '<span class="profession-overlay" aria-hidden="true">'+esc(fraction)+'</span>'+
      '</div></div>';
  }).join('');
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
    const safeIcon=/^(https:\/\/render\.worldofwarcraft\.com\/forever-eu\/icons\/\d+\/\d+\.jpg|https:\/\/foreverspec\.com\/icons\/\d+\.webp)$/.test(item.icon||'');
    const icon=safeIcon?'<img class="equip-icon" src="'+esc(item.icon)+'" alt="" loading="lazy">':'<span class="equip-placeholder" aria-hidden="true">—</span>';
    const quality=String(item.quality||'').toUpperCase();
    const qualityClass=itemQualityClasses[quality]||'quality-unknown';
    const qualityTitle=itemQualityNames[quality]?' title="'+esc('Qualität: '+itemQualityNames[quality])+'"':'';
    return '<div class="equip equip-filled">'+icon+'<div><b>'+esc(slot)+'</b><span class="equip-name '+qualityClass+'"'+qualityTitle+'>'+esc(item.item)+'</span>'+(item.level?' <small>· Gegenstandsstufe '+esc(item.level)+'</small>':'')+'</div></div>';
  }).join('');
  const verified=c.equipmentVerified?'':' · letzter bekannter Stand';
  const languageNote=c.equipmentLanguage==='en'?' · Namen derzeit auf Englisch':c.equipmentLanguage==='gemischt'?' · teilweise englische Namen':'';
  return '<details class="details" data-detail-key="'+esc(c.slug)+':equipment"'+(open?' open':'')+'><summary>Ausrüstung anzeigen · '+available.size+'/'+equipmentSlotOrder.length+' belegt'+verified+languageNote+'</summary><div class="equipment">'+rows+'</div></details>';
}

const validRender = u => /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-main-raw\.png$/.test(u||"");
function renderPortrait(c){
  const configuredScene=portraitScenes[c.slug]||null;
  // Blizzard-Geschlecht ist zuverlässiger als die Pose oder der visuelle Renderer.
  const scene=configuredScene&&c.slug==='chucky-dalton'&&c.gender==='male'
    ? {...configuredScene,epithet:'Der Windsurfer'} : configuredScene;
  const image=validRender(c.imageUrl)?c.imageUrl:null;
  const avatar=/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-avatar\.jpg$/.test(c.avatarUrl||"")?c.avatarUrl:null;
  if(!image)return '<div class="portrait portrait-missing"><span>Charakterbild noch nicht verfügbar</span></div>';
  const version=encodeURIComponent(c.imageCheckedAt||c.scrapedAt||"");
  return '<figure class="portrait '+(scene?scene.className:'')+'">'+portraitBadge(scene)+'<img class="character-render" src="'+esc(image+'?v='+version)+'" data-fallback="'+esc(avatar?avatar+'?v='+version:'')+'" alt="'+esc('Charakterbild von '+c.name)+'" loading="lazy" decoding="async"><figcaption>'+(c.imageVerified===false?'Letztes bekanntes Blizzard-Charakterbild':'Original-Charakterbild von Blizzard · nach letztem Logout')+'</figcaption></figure>';
}
function installPortraitFallbacks(){
  cards.querySelectorAll('img.character-render').forEach(img=>img.addEventListener('error',()=>{
    const fallback=img.dataset.fallback;
    if(fallback && img.src!==fallback){img.src=fallback;img.dataset.fallback='';return}
    const parent=img.closest('.portrait');if(parent){parent.classList.add('portrait-missing');parent.innerHTML='<span>Charakterbild vorübergehend nicht verfügbar</span>'}
  }));
}

function render(data,{live=false}={}){
 const openDetails=new Set([...cards.querySelectorAll('details[data-detail-key][open]')].map(el=>el.dataset.detailKey));
 const chars=[...(data.characters||[])].sort((a,b)=>a.name.localeCompare(b.name,'de'));
 if(heroCast){
   heroCast.innerHTML=chars.filter(c=>validRender(c.imageUrl)).map((c,i)=>{
     const version=encodeURIComponent(c.imageCheckedAt||c.scrapedAt||'');
     return '<img class="hero-figure hero-figure-'+(i+1)+'" src="'+esc(c.imageUrl+'?v='+version)+'" alt="" loading="eager" decoding="async">';
   }).join('');
 }
const levels=chars.map(c=>Number(c.level)).filter(Number.isFinite);const min=Math.min(...levels),max=Math.max(...levels),avg=levels.length?(levels.reduce((a,b)=>a+b,0)/levels.length).toFixed(1):"–";
 summary.innerHTML=[["Gruppenlevel",levels.length?`${min}–${max}`:"–"],["Durchschnitt",avg],["Abstand",levels.length?`${max-min} Level`:"–"],["Charaktere",chars.length]].map(([a,b])=>`<div class="stat"><small>${a}</small><strong>${b}</strong></div>`).join("");
 const stamp=Number.isFinite(Date.parse(data.generatedAt))?new Date(data.generatedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"unbekannt";
 if(freshness)freshness.textContent=(live?"Zuletzt live abgefragt: ":"Gespeicherter Stand: ")+stamp;
 status.textContent=live?"Blizzard-Profile gerade manuell abgefragt.":"Für aktuelle Charakterdaten oben auf „Aktualisieren“ klicken.";
 cards.innerHTML=chars.map((c,index)=>`<article class="card ${classColors[c.class]||'other'}">
  <div class="cardhead">
    <div class="card-intro">
      <span class="card-overline">STECKBRIEF NR. ${String(index+1).padStart(2,'0')} / 04</span>
      <h2 class="name">${esc(c.name)}</h2>
      <p class="player">Abenteurer: <strong>${esc(c.player)}</strong></p>
    </div>
    <div class="level"><span>Stufe</span>${esc(c.level)}</div>
  </div>
  ${renderPortrait(c)}
  <div class="meta"><span class="pill">${esc(c.class)}</span><span class="pill">${esc(c.race||"Himmelsgeborene")}</span><span class="pill">Allianz · EU-PvP</span></div>
  <p class="status">${c.scrapeOk===false?"⚠ Letzter Profilabruf fehlgeschlagen – gespeicherter Stand":c.scrapedAt?"Profil abgerufen: "+esc(new Date(c.scrapedAt).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})):c.sourceUpdatedLabel?"ForeverSpec geprüft: "+esc(c.sourceUpdatedLabel):"Gespeicherte Profildaten"}</p>
  <div class="section"><h3>Talente${c.talentsVerified?"":" · letzter bekannter Stand"}</h3><div class="rows">${row("Verteilung",c.talents||"nicht verfügbar")}</div></div>
  <div class="section professions-section"><h3>Berufe</h3>${professionScale()}<div class="professions-list">${professionRows(c.professions)}</div><div class="profession-legend"><span>Erreicht</span><span>Freigeschaltet</span><span>Noch gesperrt</span></div></div>
  ${statsPanel(c,openDetails.has(c.slug+':stats'))}
  ${equipmentPanel(c,openDetails.has(c.slug+':equipment'))}
 </article>`).join("");
 installPortraitFallbacks();
}
let lastGeneratedAt=null;
async function load({silent=false}={}){
  if(!silent)status.textContent="Gespeicherte Daten werden geladen …";
  try{
    const r=await fetch('/data/characters.json?t='+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error("HTTP "+r.status);
    const data=await r.json();
    if(!silent||!lastGeneratedAt||Date.parse(data.generatedAt)>Date.parse(lastGeneratedAt)){lastGeneratedAt=data.generatedAt;render(data)}
  }catch(e){if(!silent)status.innerHTML='<span class="error">Gespeicherte Daten konnten nicht geladen werden.</span>'}
}
async function refreshLive(){
  if(button.disabled)return;
  button.disabled=true;button.textContent="↻ Wird aktualisiert …";
  if(freshness)freshness.textContent="Live-Abfrage läuft …";
  await load({silent:true});
  status.textContent="Blizzard-Profile werden jetzt direkt abgefragt …";
  try{
    const r=await fetch('/api/refresh?t='+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const response=await r.json();
    if(!response.data||!response.success)throw new Error('Keine aktuellen Profile');
    lastGeneratedAt=response.data.generatedAt;
    render(response.data,{live:true});
    if(response.success<response.data.characters.length){status.textContent+=' · Einige Profile zeigen den letzten bestätigten Stand.'}
  }catch(e){
    status.innerHTML='<span class="error">Live-Abruf derzeit nicht verfügbar. Der gespeicherte Stand bleibt sichtbar. Bitte später erneut auf „Aktualisieren“ klicken.</span>';
    if(freshness&&lastGeneratedAt){const t=Number.isFinite(Date.parse(lastGeneratedAt))?new Date(lastGeneratedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"unbekannt";freshness.textContent="Letzter angezeigter Datenstand: "+t;}
  }finally{button.disabled=false;button.textContent="↻ Aktualisieren"}
}
button.innerHTML='<span aria-hidden="true">↻</span> Aktualisieren';
button.addEventListener('click',refreshLive);
load();
// Neue Blizzard-Profildaten ausschliesslich auf ausdruecklichen Button-Klick abrufen.
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
