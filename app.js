const heroCast=document.querySelector("#heroCast");const cards=document.querySelector("#cards");const summary=document.querySelector("#summary");const status=document.querySelector("#status");const button=document.querySelector("#refreshButton");
const esc=v=>String(v??"nicht verfügbar").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const classColors={'Magier':'mage','Jäger':'hunter','Druide':'druid'};
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
function professionRows(list=[]){return list.length?list.map(p=>row(p.name+(p.unverified?" · älterer Stand":""),`${p.current ?? "–"}/${p.max ?? "–"}`)).join(""):row("Berufe","nicht verfügbar")}


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
    const icon=safeIcon?'<img class="equip-icon" src="'+esc(item.icon)+'" alt="" loading="lazy">':'<span class="equip-placeholder" aria-hidden="true">✦</span>';
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
  const image=validRender(c.imageUrl)?c.imageUrl:null;
  const avatar=/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-avatar\.jpg$/.test(c.avatarUrl||"")?c.avatarUrl:null;
  if(!image)return '<div class="portrait portrait-missing"><span>Charakterbild noch nicht verfügbar</span></div>';
  const version=encodeURIComponent(c.imageCheckedAt||c.scrapedAt||"");
  return '<figure class="portrait"><img class="character-render" src="'+esc(image+'?v='+version)+'" data-fallback="'+esc(avatar?avatar+'?v='+version:'')+'" alt="'+esc('Charakterbild von '+c.name)+'" loading="lazy" decoding="async"><figcaption>'+(c.imageVerified===false?'Letztes bekanntes Blizzard-Charakterbild':'Original-Charakterbild von Blizzard · nach letztem Logout')+'</figcaption></figure>';
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
 status.textContent=`${live?"Gerade live abgerufen":"Letzter gespeicherter Datenstand"}: ${new Date(data.generatedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"})} · automatischer Abgleich etwa alle 30 Minuten.`;
 cards.innerHTML=chars.map((c,index)=>`<article class="card ${classColors[c.class]||'other'}">
  <div class="cardhead">
    <div class="card-intro">
      <span class="card-overline">✦ &nbsp; STECKBRIEF NR. ${String(index+1).padStart(2,'0')} / 04</span>
      <h2 class="name">${esc(c.name)}</h2>
      <p class="player">Abenteurer: <strong>${esc(c.player)}</strong></p>
    </div>
    <div class="level"><span>Stufe</span>${esc(c.level)}</div>
  </div>
  ${renderPortrait(c)}
  <div class="meta"><span class="pill">${esc(c.class)}</span><span class="pill">Himmelsgeborene · Hoher Orden</span><span class="pill">Allianz · EU-PvP</span></div>
  <p class="status">${c.scrapeOk===false?"⚠ Automatischer Abruf fehlgeschlagen – letzter bekannter Stand":c.scrapedAt?"Profil abgerufen: "+esc(new Date(c.scrapedAt).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})):c.sourceUpdatedLabel?"ForeverSpec geprüft: "+esc(c.sourceUpdatedLabel):"Gespeicherte Profildaten"}</p>
  <div class="section"><h3>Talente${c.talentsVerified?"":" · letzter bekannter Stand"}</h3><div class="rows">${row("Verteilung",c.talents||"nicht verfügbar")}</div></div>
  <div class="section"><h3>Berufe</h3><div class="rows">${professionRows(c.professions)}</div></div>
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
  await load({silent:true});
  status.textContent="Neuester gespeicherter Stand geladen · Live-Profile werden im Hintergrund abgefragt …";
  try{
    const r=await fetch('/api/refresh?t='+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const response=await r.json();
    if(!response.data||!response.success)throw new Error('Keine aktuellen Profile');
    lastGeneratedAt=response.data.generatedAt;
    render(response.data,{live:true});
    if(response.success<response.data.characters.length){status.textContent+=' · Einige Profile zeigen den letzten bestätigten Stand.'}
  }catch(e){
    status.innerHTML='<span class="error">Live-Abruf derzeit nicht verfügbar. Der gespeicherte Stand bleibt sichtbar; die automatische Aktualisierung läuft unabhängig weiter.</span>';
  }finally{button.disabled=false;button.textContent="↻ Aktualisieren"}
}
button.innerHTML='<span aria-hidden="true">↻</span> Aktualisieren';
button.addEventListener('click',refreshLive);
load();
setInterval(()=>{if(!document.hidden&&!button.disabled)load({silent:true})},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!button.disabled)load({silent:true})});
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
