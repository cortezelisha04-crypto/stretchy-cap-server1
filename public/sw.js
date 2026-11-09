// Keeps the game on the headset for fast starts. The page itself is always fetched fresh first (so updates show up),
// falling back to the saved copy only when offline. Multiplayer needs the internet either way.
const CACHE='stretchy-cap-v2';
self.addEventListener('install',e=>{ self.skipWaiting(); });
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET' || new URL(r.url).pathname.startsWith('/ws')) return;
  const fresh = fetch(r).then(res=>{ if(res.ok){ const c=res.clone(); caches.open(CACHE).then(ca=>ca.put(r,c)); } return res; });
  e.respondWith(r.mode==='navigate' || r.destination==='document' ? fresh.catch(()=>caches.match(r)) : caches.match(r).then(hit=>hit||fresh));
});
