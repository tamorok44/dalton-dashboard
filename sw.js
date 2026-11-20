const CACHE="daltons-level-sheriff-v9";
const ASSETS=["/","/styles.css?v=frontier-unified-20261120b","/app.js?v=frontier-unified-20261120b","/icon.svg","/dalton-crest.svg","/level-sheriff.svg?v=level-sheriff-20261120b","/skyborne-horizon.svg","/scene-cole.svg?v=frontier-unified-20261120b","/scene-dolly.svg?v=frontier-unified-20261120b","/scene-chucky.svg?v=frontier-unified-20261120b","/scene-viola.svg?v=frontier-unified-20261120b"];
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
  if(event.request.method!=="GET"||event.request.url.includes("/data/characters.json")||event.request.url.includes("/api/refresh"))return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
