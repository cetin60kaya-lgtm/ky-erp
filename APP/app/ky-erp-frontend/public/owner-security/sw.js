const CACHE="ky-owner-security-v1-20260911";
const SHELL=[
  "/owner-security/",
  "/owner-security/index.html",
  "/owner-security/app.css?v=20260911-1",
  "/owner-security/app.js?v=20260911-1",
  "/owner-security/manifest.webmanifest",
  "/security/kyerp-security-icon.svg",
  "/security/kyerp-security-192.png",
  "/security/kyerp-security-512.png",
  "/security/kyerp-security-apple-touch.png"
];

self.addEventListener("install",(event)=>{
  event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",(event)=>{
  event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key.startsWith("ky-owner-security-")&&key!==CACHE).map((key)=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener("fetch",(event)=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request).then((response)=>{const clone=response.clone();caches.open(CACHE).then((cache)=>cache.put("/owner-security/",clone));return response}).catch(()=>caches.match("/owner-security/")));
    return;
  }
  if(url.pathname.startsWith("/owner-security/")||url.pathname.startsWith("/security/kyerp-security-")){
    event.respondWith(caches.match(request).then((cached)=>cached||fetch(request).then((response)=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then((cache)=>cache.put(request,clone))}return response})));
  }
});
