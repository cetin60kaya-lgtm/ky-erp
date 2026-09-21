self.addEventListener("install",(event)=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",(event)=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter((key)=>key.startsWith("kyerp-security-shell-")).map((key)=>caches.delete(key)));
  await self.registration.unregister();
  const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
  await Promise.all(windows.map((client)=>client.navigate("/ky-guvenlik/")));
})()));
self.addEventListener("fetch",(event)=>{
  if(event.request.mode==="navigate")event.respondWith(Response.redirect(new URL("/ky-guvenlik/",self.location.origin),308));
});
