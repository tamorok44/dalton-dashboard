const CACHE="daltons-frontier-unified-v8";
const ASSETS=["/","/styles.css?v=frontier-unified-20261120a","/app.js?v=frontier-unified-20261120a","/icon.svg","/dalton-crest.svg","/skyborne-horizon.svg","/scene-cole.svg?v=frontier-unified-20261120a","/scene-dolly.svg?v=frontier-unified-20261120a","/scene-chucky.svg?v=frontier-unified-20261120a","/scene-viola.svg?v=frontier-unified-20261120a"];
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
