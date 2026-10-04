const APP_URL="/guvenlik/";
const ICON="/guvenlik/kyerp-security-icon.svg";
const TAG="kyerp-security-approval";
const LEGACY_CACHE_NAMES=["kyerp-security-static","kyerp-security-static-v2","kyerp-security-static-v3"];
async function clearLegacyCaches(){const keys=await caches.keys();await Promise.all(keys.filter((key)=>LEGACY_CACHE_NAMES.includes(key)||key.startsWith("kyerp-security-shell-")||key.startsWith("kyerp-ky-guvenlik-shell-")).map((key)=>caches.delete(key)))}
async function broadcast(type){const windows=await clients.matchAll({type:"window",includeUncontrolled:true});await Promise.all(windows.map((client)=>client.postMessage({type})))}
async function closeApprovalNotifications(){try{const list=await self.registration.getNotifications();for(const item of list){if(item?.tag===TAG||item?.data?.openApproval===true||String(item?.title||"").includes("KY ERP"))item.close()}}catch{}}
function pushCopy(event){try{const data=event.data?.json?.()||{};return{title:String(data.title||"KY ERP · Güvenlik Onayı"),body:String(data.body||"Yeni bir KY ERP güvenlik isteği var. Uygulamayı açıp kontrol edin."),matchNumber:String(data.matchNumber||"")}}catch{return{title:"KY ERP · Yeni Bildirim",body:"Yeni mesaj, hatırlatma veya güvenlik isteği var. KY Güvenlik uygulamasını açıp kontrol edin.",matchNumber:""}}}
async function showWakeNotification(event){const copy=pushCopy(event);await closeApprovalNotifications();await self.registration.showNotification(copy.title,{body:copy.body,tag:TAG,renotify:false,requireInteraction:true,badge:ICON,icon:ICON,timestamp:Date.now(),vibrate:[180,80,180],data:{openApproval:true,matchNumber:copy.matchNumber}});await broadcast("KYERP_SECURITY_PUSH_WAKE")}
async function finishDecision(){await closeApprovalNotifications();await broadcast("KYERP_SECURITY_PENDING_WAKE")}
async function focusOrOpen(){const windows=await clients.matchAll({type:"window",includeUncontrolled:true});const existing=windows.find((client)=>{try{return new URL(client.url).pathname.startsWith("/guvenlik/")}catch{return false}});if(existing){await existing.focus();try{await existing.navigate(APP_URL)}catch{};return}await clients.openWindow(APP_URL)}
self.addEventListener("install",(event)=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",(event)=>event.waitUntil((async()=>{await clearLegacyCaches().catch(()=>{});await self.clients.claim()})()));
self.addEventListener("push",(event)=>event.waitUntil(showWakeNotification(event)));
self.addEventListener("notificationclick",(event)=>{event.notification?.close();event.waitUntil(focusOrOpen())});
self.addEventListener("message",(event)=>{if(event.data?.type==="KYERP_SECURITY_CLEAR_NOTIFICATION")event.waitUntil(closeApprovalNotifications());if(event.data?.type==="KYERP_SECURITY_DECISION_DONE")event.waitUntil(finishDecision())});
