const CACHE="daltons-portrait-badges-v6";
const ASSETS=["/","/styles.css?v=portrait-badges-20261120d","/app.js?v=portrait-badges-20261120d","/icon.svg","/dalton-crest.svg","/skyborne-horizon.svg","/scene-cole.svg","/scene-dolly.svg?v=20261120b","/scene-chucky.svg?v=20261120b","/scene-viola.svg"];
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
