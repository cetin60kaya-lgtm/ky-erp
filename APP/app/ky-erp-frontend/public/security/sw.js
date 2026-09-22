const CANONICAL_URL="/ky-guvenlik/";
const LEGACY_CACHE_NAMES=["kyerp-security-static","kyerp-security-static-v2","kyerp-security-static-v3"];

async function retireLegacySecurity(){
  const keys=await caches.keys().catch(()=>[]);
  await Promise.all(keys.filter((key)=>LEGACY_CACHE_NAMES.includes(key)||key.startsWith("kyerp-security-shell-")||key.startsWith("kyerp-ky-guvenlik-shell-")).map((key)=>caches.delete(key)));
  try{(await self.registration.getNotifications()).forEach((notification)=>notification.close())}catch{}
  try{await self.registration.unregister()}catch{}
  const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
  await Promise.all(windows.map(async(client)=>{try{await client.navigate(CANONICAL_URL)}catch{}}));
}

self.addEventListener("install",(event)=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",(event)=>event.waitUntil(retireLegacySecurity()));
self.addEventListener("push",(event)=>event.waitUntil(retireLegacySecurity()));
self.addEventListener("notificationclick",(event)=>{event.notification?.close();event.waitUntil(retireLegacySecurity())});
self.addEventListener("fetch",(event)=>{
  if(event.request.mode==="navigate")event.respondWith(Response.redirect(new URL(CANONICAL_URL,self.location.origin),308));
});
