const cards=document.querySelector("#cards");const summary=document.querySelector("#summary");const status=document.querySelector("#status");const freshness=document.querySelector("#dataFreshness");const button=document.querySelector("#refreshButton");
const esc=v=>String(v??"nicht verf√ºgbar").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const classColors={'Magier':'mage','J√§ger':'hunter','Druide':'druid'};
const portraitScenes={
  'cole-dalton':{className:'scene-cole',firstName:'Cole',epithet:'Der Runenreiter',icon:'rune'},
  'dolly-dalton':{className:'scene-dolly',firstName:'Dolly',epithet:'Das Adlerauge',icon:'crosshair'},
  'chucky-dalton':{className:'scene-chucky',firstName:'Chucky',epithet:'Die Windsurferin',icon:'leaf'},
  'viola-dalton':{className:'scene-viola',firstName:'Viola',epithet:'Die Sonnenwandlerin',icon:'sun'}
};
const badgeIcons={
  rune:'<svg class="portrait-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1.8 15.1 8.9 22.2 12l-7.1 3.1L12 22.2l-3.1-7.1L1.8 12l7.1-3.1L12 1.8Z"/><path d="M12 7v10M7 12h10"/></svg>',
  crosshair:'<svg class="portrait-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="2.4"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></svg>',
  leaf:'<∂ªßq´^