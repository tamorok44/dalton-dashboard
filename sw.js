const CACHE="daltons-blizzard-api-v20";
const ASSETS=["/","/styles.css?v=typography-western-20261120b","/app.js?v=blizzard-api-20261120a","/icon.svg","/dalton-crest.svg","/level-sheriff.svg?v=level-sheriff-20261120b","/skyborne-horizon.svg?v=mainstreet-20261120c","/skyborne-mainstreet-mobile.svg?v=mainstreet-20261120c","/scene-cole.svg?v=frontier-unified-20261120a","/scene-dolly.svg?v=frontier-unified-20261120a","/scene-chucky.svg?v=frontier-unified-20261120a","/scene-viola.svg?v=frontier-unified-20261120a"];
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
