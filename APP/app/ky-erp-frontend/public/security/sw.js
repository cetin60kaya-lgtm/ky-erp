const DB_NAME="kyerp-security-app-v1";
const STORE="device";
const KEY="active";
const API_BASE="https://api.kyerp.net/api";
const APP_URL="/security/?open=1";
const CACHE_NAME="kyerp-security-shell-v4";

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function readDevice(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readonly");const req=tx.objectStore(STORE).get(KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
function base64Url(bytes){let binary="";for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
async function signDeviceAuth(device,method,path){if(!device?.signingPrivateKey)return{};const timestamp=String(Date.now());const pathname=`/api${path}`;const message=new TextEncoder().encode(`KYERP-DEVICE-AUTH-V1|${device.deviceId}|${String(method||"GET").toUpperCase()}|${pathname}|${timestamp}`);const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},device.signingPrivateKey,message);return{"X-KYERP-Security-Timestamp":timestamp,"X-KYERP-Security-Signature":base64Url(signature)}}
async function deviceFetch(path){const device=await readDevice();if(!device?.deviceId||!device?.deviceToken)throw new Error("DEVICE_NOT_READY");const signedHeaders=await signDeviceAuth(device,"GET",path);const response=await fetch(`${API_BASE}${path}`,{method:"GET",headers:{Accept:"application/json","X-KYERP-Push-Device":device.deviceId,"X-KYERP-Push-Token":device.deviceToken,...signedHeaders},cache:"no-store",mode:"cors"});const payload=await response.json().catch(()=>null);if(!response.ok||payload?.ok===false)throw new Error(payload?.error?.message||"Telefon onayı alınamadı.");return payload}
async function broadcast(type){const windows=await clients.matchAll({type:"window",includeUncontrolled:true});await Promise.all(windows.map((client)=>client.postMessage({type})))}
async function closeApprovalNotifications(){try{const list=await self.registration.getNotifications({tag:"kyerp-security-approval"});for(const item of list)item.close()}catch{}}
async function showPending(){
  let items=[];let fetchFailed=false;
  try{const payload=await deviceFetch("/auth/push/device/pending");items=Array.isArray(payload?.data?.items)?payload.data.items:[]}catch{fetchFailed=true}
  if(fetchFailed){
    await self.registration.showNotification("KY ERP · Bağlantı Kontrolü",{body:"Giriş isteği geldi. KY ERP Güvenlik uygulamasını açıp bağlantıyı yenileyin.",tag:"kyerp-security-approval",renotify:false,requireInteraction:true,badge:"/kyerp-icon.svg",icon:"/kyerp-icon.svg",timestamp:Date.now(),vibrate:[180,80,180],data:{openApproval:true,connectionRepair:true}});
    await broadcast("KYERP_SECURITY_CONNECTION_WAKE");return;
  }
  if(!items.length){await closeApprovalNotifications();await broadcast("KYERP_SECURITY_PENDING_WAKE");return}
  const first=items[0];const many=items.length>1;
  await self.registration.showNotification(many?"KY ERP · Güvenlik Onayları":(first.title||"KY ERP · Giriş Onayı"),{
    body:many?(String(items.length)+" giriş isteği onay bekliyor. Uygulamayı açıp kontrol edin."):(first.body||"Yeni giriş isteği onay bekliyor."),
    tag:"kyerp-security-approval",renotify:false,requireInteraction:true,badge:"/kyerp-icon.svg",icon:"/kyerp-icon.svg",
    timestamp:first.requestedAt?Date.parse(first.requestedAt)||Date.now():Date.now(),vibrate:[180,80,180],data:{openApproval:true}
  });
  await broadcast("KYERP_SECURITY_PENDING_WAKE");
}
async function focusOrOpen(){const windows=await clients.matchAll({type:"window",includeUncontrolled:true});const existing=windows.find((client)=>{try{return new URL(client.url).pathname.startsWith("/security/")}catch{return false}});if(existing){await existing.focus();try{await existing.navigate(APP_URL)}catch{};return}await clients.openWindow(APP_URL)}
self.addEventListener("install",(event)=>event.waitUntil((async()=>{await self.skipWaiting();const cache=await caches.open(CACHE_NAME);await cache.addAll(["/security/","/security/app.js","/security/app.css","/security/manifest.webmanifest","/kyerp-icon.svg"])} )()));
self.addEventListener("activate",(event)=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter((key)=>key.startsWith("kyerp-security-shell-")&&key!==CACHE_NAME).map((key)=>caches.delete(key)));await self.clients.claim()})()));
self.addEventListener("push",(event)=>event.waitUntil(showPending()));
self.addEventListener("notificationclick",(event)=>{event.notification?.close();event.waitUntil(focusOrOpen())});
self.addEventListener("message",(event)=>{if(event.data?.type==="KYERP_SECURITY_REFRESH")event.waitUntil(showPending())});
self.addEventListener("fetch",(event)=>{const url=new URL(event.request.url);if(url.origin===self.location.origin&&url.pathname.startsWith("/security/")){event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then((r)=>r||caches.match("/security/"))))}});
