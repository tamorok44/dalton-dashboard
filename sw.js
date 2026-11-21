const CACHE="daltons-petui-v37";
const ASSETS=["/","/styles.css?v=petui-20261121c","/app.js?v=petui-20261121c","/hunter-pets.js","/reputation-data.js","/icon.svg","/dalton-crest.svg","/level-sheriff.svg?v=level-sheriff-20261120b","/skyborne-horizon.svg?v=mainstreet-20261120c","/skyborne-mainstreet-mobile.svg?v=mainstreet-20261120c","/scene-cole.svg?v=wow-colors-20261121a","/scene-dolly.svg?v=wow-colors-20261121a","/scene-chucky.svg?v=wow-colors-20261121a","/scene-viola.svg?v=wow-colors-20261121a"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  // Only own static assets need a service worker. Remote Blizzard portraits,
  // live API replies and changing character snapshots must bypass it.
  if(event.request.method!=="GET"||url.origin!==self.location.origin||
    url.pathname.startsWith("/data/")||url.pathname.startsWith("/api/"))return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
