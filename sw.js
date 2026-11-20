const CACHE="daltons-western-scenes-v3";
const ASSETS=["/","/styles.css","/app.js","/icon.svg","/dalton-crest.svg","/skyborne-horizon.svg","/scene-cole.svg","/scene-dolly.svg","/scene-chucky.svg","/scene-viola.svg"];
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
