const CACHE_NAME='mujer-emprendedora-v3';
const ASSETS=['./','./index.html','./manifest.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);
 // Nunca almacenar respuestas API ni datos asociados a una sesión.
 if(url.pathname.includes('/api/')){e.respondWith(fetch(e.request));return;}
 if(url.origin!==self.location.origin)return;
 e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(e.request,copy));}return response;}).catch(()=>caches.match('./index.html'))));
});
