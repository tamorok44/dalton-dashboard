const cards=document.querySelector("#cards");const summary=document.querySelector("#summary");const status=document.querySelector("#status");const button=document.querySelector("#refreshButton");
const esc=v=>String(v??"nicht verfügbar").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const row=(a,b)=>`<div class="row"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;
function professionRows(list=[]){return list.length?list.map(p=>row(p.name+(p.unverified?" · älterer Stand":""),`${p.current ?? "–"}/${p.max ?? "–"}`)).join(""):row("Berufe","nicht verfügbar")}
function render(data){
 const chars=[...(data.characters||[])].sort((a,b)=>a.name.localeCompare(b.name,'de'));
const levels=chars.map(c=>Number(c.level)).filter(Number.isFinite);const min=Math.min(...levels),max=Math.max(...levels),avg=levels.length?(levels.reduce((a,b)=>a+b,0)/levels.length).toFixed(1):"–";
 summary.innerHTML=[["Gruppenlevel",levels.length?`${min}–${max}`:"–"],["Durchschnitt",avg],["Abstand",levels.length?`${max-min} Level`:"–"],["Charaktere",chars.length]].map(([a,b])=>`<div class="stat"><small>${a}</small><strong>${b}</strong></div>`).join("");
 status.textContent=`Datei zuletzt aktualisiert: ${new Date(data.generatedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"})} · Profilabruf alle 30 Minuten geplant. Der Button lädt nur den gespeicherten Stand.`;
 cards.innerHTML=chars.map(c=>`<article class="card">
  <div class="cardhead"><div><h2 class="name">${esc(c.name)}</h2><p class="player">${esc(c.player)}</p></div><div class="level">Lv. ${esc(c.level)}</div></div>
  <div class="meta"><span class="pill">${esc(c.class)}</span><span class="pill">${esc(c.race||"Himmelsgeborene")}</span><span class="pill">EU · PvP · Allianz</span></div>
  <p class="status">${c.scrapeOk===false?"⚠ Automatischer Abruf fehlgeschlagen – letzter bekannter Stand":c.scrapedAt?"Level und Berufe geprüft: "+esc(new Date(c.scrapedAt).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})):c.sourceUpdatedLabel?"ForeverSpec geprüft: "+esc(c.sourceUpdatedLabel):"Gespeicherte Profildaten"}</p>
  <div class="section"><h3>Talente</h3><div class="rows">${row("Verteilung",c.talents||"nicht verfügbar")}</div></div>
  <div class="section"><h3>Berufe</h3><div class="rows">${professionRows(c.professions)}</div></div>
  <div class="section"><h3>Wichtige Werte · gespeicherter Stand</h3><div class="rows">${Object.entries(c.stats||{}).slice(0,6).map(([k,v])=>row(k,v)).join("")||row("Werte","nicht verfügbar")}</div></div>
  <details class="details"><summary>Ausrüstung anzeigen · gespeicherter Stand</summary><div class="equipment">${(c.equipment||[]).map(i=>`<div class="equip"><b>${esc(i.slot)}</b>${esc(i.item)}</div>`).join("")||"<div class='equip'>nicht verfügbar</div>"}</div></details>
  <div class="actions"><a class="link" href="${esc(c.url)}" target="_blank" rel="noopener">ForeverSpec öffnen ↗</a></div>
 </article>`).join("");
}
async function load(){button.disabled=true;status.textContent="Neuester Stand wird geladen …";try{const r=await fetch(`/data/characters.json?t=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);render(await r.json())}catch(e){status.innerHTML=`<span class="error">Daten konnten gerade nicht geladen werden. Bitte später erneut versuchen.</span>`}finally{button.disabled=false}}
button.textContent="↻ Stand neu laden";button.addEventListener("click",load);load();if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});