// Offline cache for fast starts. The game page is always fetched fresh first (so every deploy shows up),
// with the saved copy used only when offline. Bump CACHE to clear old saved files on every player's device.
const CACHE='stretchy-cap-v6';
self.addEventListener('install',e=>{ self.skipWaiting(); });
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request, u=new URL(r.url);
  if(r.method!=='GET' || u.pathname.startsWith('/ws') || u.pathname==='/version' || u.pathname==='/servers' || u.pathname==='/health') return;
  const fresh = fetch(r, {cache:'no-store'}).then(res=>{ if(res.ok){ const c=res.clone(); caches.open(CACHE).then(ca=>ca.put(r,c)); } return res; });
  const isPage = r.mode==='navigate' || r.destination==='document' || u.pathname.endsWith('.html') || u.pathname.endsWith('/');
  e.respondWith(isPage ? fresh.catch(()=>caches.match(r)) : caches.match(r).then(hit=>hit||fresh));
});
