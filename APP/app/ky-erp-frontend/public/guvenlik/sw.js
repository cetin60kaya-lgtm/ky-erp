const APP_URL="/guvenlik/";
const ICON="/guvenlik/kyerp-security-icon.svg";
const TAG="kyerp-security-approval";
const API_BASE="https://api.kyerp.net/api";
const DB_NAME="kyerp-security-fresh-v3";
const STORE="device";
const KEY="active";
const CLIENT_VERSION="security-v3.0";
const LEGACY_CACHE_NAMES=["kyerp-security-static","kyerp-security-static-v2","kyerp-security-static-v3"];
async function clearLegacyCaches(){const keys=await caches.keys();await Promise.all(keys.filter((key)=>LEGACY_CACHE_NAMES.includes(key)||key.startsWith("kyerp-security-shell-")||key.startsWith("kyerp-ky-guvenlik-shell-")).map((key)=>caches.delete(key)))}
async function broadcast(type){const windows=await clients.matchAll({type:"window",includeUncontrolled:true});await Promise.all(windows.map((client)=>client.postMessage({type})))}
async function closeApprovalNotifications(){try{const list=await self.registration.getNotifications();for(const item of list){if(item?.tag===TAG||item?.data?.openApproval===true||String(item?.title||"").includes("KY ERP"))item.close()}}catch{}}
function base64Url(bytes){let binary="";for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function readDevice(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readonly");const req=tx.objectStore(STORE).get(KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
async function signDeviceAuth(device,method,path){if(!device?.signingPrivateKey)return{};const timestamp=String(Date.now());const pathname=`/api${path}`;const message=new TextEncoder().encode(`KYERP-DEVICE-AUTH-V1|${device.deviceId}|${String(method||"GET").toUpperCase()}|${pathname}|${timestamp}`);const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},device.signingPrivateKey,message);return{"X-KYERP-Security-Timestamp":timestamp,"X-KYERP-Security-Signature":base64Url(signature)}}
async function deviceFetch(path){const device=await readDevice();if(!device?.deviceId||!device?.deviceToken)throw new Error("device missing");const signed=await signDeviceAuth(device,"GET",path);const response=await fetch(`${API_BASE}${path}`,{method:"GET",headers:{Accept:"application/json","X-KYERP-Push-Device":device.deviceId,"X-KYERP-Push-Token":device.deviceToken,"X-KYERP-Security-App-Version":CLIENT_VERSION,...signed},cache:"no-store"});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json()}
async function notificationCopy(){try{const payload=await deviceFetch("/auth/push/device/pending");const items=Array.isArray(payload?.data?.items)?payload.data.items:[];const item=items.find((row)=>String(row?.kind||"").toUpperCase()==="SELF_LOGIN")||items[0];if(!item)return{title:"KY ERP · Güvenlik Onayı",body:"Yeni bir KY ERP güvenlik isteği var. Uygulamayı açıp kontrol edin.",matchNumber:""};const match=String(item.matchNumber||"").trim();if(String(item.kind||"").toUpperCase()==="SELF_LOGIN"&&/^\d{2}$/.test(match))return{title:"KY ERP · Giriş Onayı",body:`Eşleştirme No: ${match} · Uygulamayı aç, numarayı seç ve Onayla.`,matchNumber:match};return{title:String(item.title||"KY ERP · Güvenlik Onayı"),body:String(item.body||"Yeni bir KY ERP güvenlik isteği var."),matchNumber:match}}catch{return{title:"KY ERP · Güvenlik Onayı",body:"Yeni bir KY ERP güvenlik isteği var. Uygulamayı açıp kontrol edin.",matchNumber:""}}}
async function showWakeNotification(){const copy=await notificationCopy();await closeApprovalNotifications();await self.registration.showNotification(copy.title,{body:copy.body,tag:TAG,renotify:true,requireInteraction:true,badge:ICON,icon:ICON,timestamp:Date.now(),vibrate:[180,80,180],data:{openApproval:true,matchNumber:copy.matchNumber}});await broadcast("KYERP_SECURITY_PUSH_WAKE")}
async function finishDecision(){await closeApprovalNotifications();await broadcast("KYERP_SECURITY_PENDING_WAKE")}
async function focusOrOpen(){const windows=await clients.matchAll({type:"window",includeUncontrolled:true});const existing=windows.find((client)=>{try{return new URL(client.url).pathname.startsWith("/guvenlik/")}catch{return false}});if(existing){await existing.focus();try{await existing.navigate(APP_URL)}catch{};return}await clients.openWindow(APP_URL)}
self.addEventListener("install",(event)=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",(event)=>event.waitUntil((async()=>{await clearLegacyCaches().catch(()=>{});await self.clients.claim()})()));
// Network-only fetch handler: installable PWA without stale shell caching.
self.addEventListener("fetch",(event)=>{if(event.request.method==="GET")event.respondWith(fetch(event.request))});
self.addEventListener("push",(event)=>event.waitUntil(showWakeNotification()));
self.addEventListener("notificationclick",(event)=>{event.notification?.close();event.waitUntil(focusOrOpen())});
self.addEventListener("message",(event)=>{if(event.data?.type==="KYERP_SECURITY_CLEAR_NOTIFICATION")event.waitUntil(closeApprovalNotifications());if(event.data?.type==="KYERP_SECURITY_DECISION_DONE")event.waitUntil(finishDecision())});
