const cards=document.querySelector("#cards");const summary=document.querySelector("#summary");const status=document.querySelector("#status");const button=document.querySelector("#refreshButton");
const esc=v=>String(v??"nicht verfügbar").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const row=(a,b)=>`<div class="row"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;
function professionRows(list=[]){return list.length?list.map(p=>row(p.name+(p.unverified?" · älterer Stand":""),`${p.current ?? "–"}/${p.max ?? "–"}`)).join(""):row("Berufe","nicht verfügbar")}

const validRender = u => /^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-main-raw\.png$/.test(u||"");
function renderPortrait(c){
  const image=validRender(c.imageUrl)?c.imageUrl:null;
  const avatar=/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/character\/\d{1,3}\/\d+-avatar\.jpg$/.test(c.avatarUrl||"")?c.avatarUrl:null;
  if(!image)return '<div class="portrait portrait-missing"><span>Charakterbild noch nicht verfügbar</span></div>';
  const version=encodeURIComponent((c.imageCheckedAt||c.scrapedAt||"") + "-" + Date.now());
  return '<figure class="portrait"><img class="character-render" src="'+esc(image+'?v='+version)+'" data-fallback="'+esc(avatar?avatar+'?v='+version:'')+'" alt="'+esc('Aktuelles Charakterbild von '+c.name)+'" loading="lazy" decoding="async"><figcaption>Original-Charakterbild von Blizzard · nach letztem Logout</figcaption></figure>';
}
function installPortraitFallbacks(){
  cards.querySelectorAll('img.character-render').forEach(img=>img.addEventListener('error',()=>{
    const fallback=img.dataset.fallback;
    if(fallback && img.src!==fallback){img.src=fallback;img.dataset.fallback='';return}
    const parent=img.closest('.portrait');if(parent){parent.classList.add('portrait-missing');parent.innerHTML='<span>Charakterbild vorübergehend nicht verfügbar</span>'}
  }));
}

function render(data){
 const chars=[...(data.characters||[])].sort((a,b)=>a.name.localeCompare(b.name,'de'));
const levels=chars.map(c=>Number(c.level)).filter(Number.isFinite);const min=Math.min(...levels),max=Math.max(...levels),avg=levels.length?(levels.reduce((a,b)=>a+b,0)/levels.length).toFixed(1):"–";
 summary.innerHTML=[["Gruppenlevel",levels.length?`${min}–${max}`:"–"],["Durchschnitt",avg],["Abstand",levels.length?`${max-min} Level`:"–"],["Charaktere",chars.length]].map(([a,b])=>`<div class="stat"><small>${a}</small><strong>${b}</strong></div>`).join("");
 status.textContent=`Letzter Datenabruf: ${new Date(data.generatedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"})} · automatische Blizzard-Prüfung alle 30 Minuten · Neuladen aktualisiert Bilder und zeigt den neuesten gespeicherten Profilstand.`;
 cards.innerHTML=chars.map(c=>`<article class="card">
  <div class="cardhead"><div><h2 class="name">${esc(c.name)}</h2><p class="player">${esc(c.player)}</p></div><div class="level">Lv. ${esc(c.level)}</div></div>
  ${renderPortrait(c)}
  <div class="meta"><span class="pill">${esc(c.class)}</span><span class="pill">${esc(c.race||"Himmelsgeborene")}</span><span class="pill">EU · PvP · Allianz</span></div>
  <p class="status">${c.scrapeOk===false?"⚠ Automatischer Abruf fehlgeschlagen – letzter bekannter Stand":c.scrapedAt?"Blizzard-Profil abgerufen: "+esc(new Date(c.scrapedAt).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})):c.sourceUpdatedLabel?"ForeverSpec geprüft: "+esc(c.sourceUpdatedLabel):"Gespeicherte Profildaten"}</p>
  <div class="section"><h3>Talente${c.talentsVerified?"":" · letzter bekannter Stand"}</h3><div class="rows">${row("Verteilung",c.talents||"nicht verfügbar")}</div></div>
  <div class="section"><h3>Berufe</h3><div class="rows">${professionRows(c.professions)}</div></div>
  <div class="section"><h3>Wichtige Werte${c.statsVerified?"":" · letzter bekannter Stand"}</h3><div class="rows">${Object.entries(c.stats||{}).slice(0,6).map(([k,v])=>row(k,v)).join("")||row("Werte","nicht verfügbar")}</div></div>
  <details class="details"><summary>Ausrüstung anzeigen${c.equipmentVerified?"":" · letzter bekannter Stand"}</summary><div class="equipment">${(c.equipment||[]).map(i=>`<div class="equip">${/^https:\/\/render\.worldofwarcraft\.com\/forever-eu\/icons\/\d+\/\d+\.jpg$/.test(i.icon||"")?`<img class="equip-icon" src="${esc(i.icon)}" alt="" loading="lazy">`:""}<div><b>${esc(i.slot)}</b>${esc(i.item)}${i.level?` <small>· Gegenstandsstufe ${esc(i.level)}</small>`:""}</div></div>`).join("")||"<div class='equip'>nicht verfügbar</div>"}</div></details>
  <div class="actions"><a class="link" href="${esc(c.url)}" target="_blank" rel="noopener">ForeverSpec öffnen ↗</a></div>
 </article>`).join("");
 installPortraitFallbacks();
}
async function load(){button.disabled=true;status.textContent="Neuester Stand wird geladen …";try{const r=await fetch(`/data/characters.json?t=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);render(await r.json())}catch(e){status.innerHTML=`<span class="error">Daten konnten gerade nicht geladen werden. Bitte später erneut versuchen.</span>`}finally{button.disabled=false}}
button.textContent="↻ Stand neu laden";button.addEventListener("click",load);load();if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});