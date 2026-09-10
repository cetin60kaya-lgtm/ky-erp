const APP_URL="/security/?open=1";
const CACHE_NAME="kyerp-security-shell-v10";
const ICON="/security/kyerp-security-icon.svg";
const TAG="kyerp-security-approval";

async function broadcast(type){
  const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
  await Promise.all(windows.map((client)=>client.postMessage({type})));
}
async function closeApprovalNotifications(){
  try{
    const list=await self.registration.getNotifications({tag:TAG});
    for(const item of list)item.close();
  }catch{}
}
async function showWakeNotification(){
  await self.registration.showNotification("KY ERP · Güvenlik Onayı",{
    body:"Yeni bir KY ERP güvenlik isteği var. KY ERP Güvenlik uygulamasını açıp kontrol edin.",
    tag:TAG,
    renotify:false,
    requireInteraction:true,
    badge:ICON,
    icon:ICON,
    timestamp:Date.now(),
    vibrate:[180,80,180],
    data:{openApproval:true}
  });
  await broadcast("KYERP_SECURITY_PUSH_WAKE");
}
async function focusOrOpen(){
  const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
  const existing=windows.find((client)=>{try{return new URL(client.url).pathname.startsWith("/security/")}catch{return false}});
  if(existing){
    await existing.focus();
    try{await existing.navigate(APP_URL)}catch{}
    return;
  }
  await clients.openWindow(APP_URL);
}

self.addEventListener("install",(event)=>event.waitUntil((async()=>{
  await self.skipWaiting();
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll([
    "/security/",
    "/security/app.js",
    "/security/security-actions.js",
    "/security/ios-safari.js",
    "/security/app.css",
    "/security/manifest.webmanifest",
    "/security/kyerp-security-apple-touch.png",
    "/security/kyerp-security-192.png",
    "/security/kyerp-security-512.png",
    ICON
  ]);
})()));

self.addEventListener("activate",(event)=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter((key)=>key.startsWith("kyerp-security-shell-")&&key!==CACHE_NAME).map((key)=>caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener("push",(event)=>event.waitUntil(showWakeNotification()));
self.addEventListener("notificationclick",(event)=>{
  event.notification?.close();
  event.waitUntil(focusOrOpen());
});
self.addEventListener("message",(event)=>{
  if(event.data?.type==="KYERP_SECURITY_CLEAR_NOTIFICATION")event.waitUntil(closeApprovalNotifications());
});
self.addEventListener("fetch",(event)=>{
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin&&url.pathname.startsWith("/security/")){
    event.respondWith(fetch(event.request,{cache:"no-store"}).catch(()=>caches.match(event.request).then((r)=>r||caches.match("/security/"))));
  }
});
