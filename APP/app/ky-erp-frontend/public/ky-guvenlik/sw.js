const APP_URL="/ky-guvenlik/";
const CACHE_NAME="kyerp-security-static";
const ICON="/ky-guvenlik/kyerp-security-icon.svg";
const TAG="kyerp-security-approval";
const STARTUP_NETWORK_TIMEOUT_MS=1500;
const SHELL_URLS=[
  APP_URL,
  "/ky-guvenlik/app.css",
  "/ky-guvenlik/app.js",
  "/ky-guvenlik/install-helper.js",
  "/ky-guvenlik/security-actions.js",
  "/ky-guvenlik/security-control-center.js",
  "/ky-guvenlik/security-foreground-sync.js",
  "/ky-guvenlik/manifest.webmanifest",
  "/ky-guvenlik/kyerp-security-apple-touch.png",
  "/ky-guvenlik/kyerp-security-192.png",
  "/ky-guvenlik/kyerp-security-512.png",
  ICON,
];

async function broadcast(type){const windows=await clients.matchAll({type:"window",includeUncontrolled:true});await Promise.all(windows.map((client)=>client.postMessage({type})))}
async function closeApprovalNotifications(){try{const list=await self.registration.getNotifications();for(const item of list){if(item?.tag===TAG||item?.data?.openApproval===true||String(item?.title||"").includes("KY ERP"))item.close()}}catch{}}
async function showWakeNotification(){await self.registration.showNotification("KY ERP · Güvenlik Onayı",{body:"Yeni bir KY ERP güvenlik isteği var. KY ERP Güvenlik uygulamasını açıp kontrol edin.",tag:TAG,renotify:false,requireInteraction:true,badge:ICON,icon:ICON,timestamp:Date.now(),vibrate:[180,80,180],data:{openApproval:true}});await broadcast("KYERP_SECURITY_PUSH_WAKE")}
async function showDecisionResult(decision){await closeApprovalNotifications();const approved=String(decision||"").toUpperCase()==="APPROVE";await self.registration.showNotification(approved?"KY ERP · Onaylandı":"KY ERP · Reddedildi",{body:approved?"Giriş / güvenlik isteği onaylandı.":"Giriş / güvenlik isteği reddedildi.",tag:TAG,renotify:false,requireInteraction:false,silent:true,badge:ICON,icon:ICON,timestamp:Date.now(),data:{decisionResult:true}});await new Promise((resolve)=>setTimeout(resolve,1600));const list=await self.registration.getNotifications({tag:TAG});for(const item of list)item.close()}
async function focusOrOpen(){const windows=await clients.matchAll({type:"window",includeUncontrolled:true});const existing=windows.find((client)=>{try{return new URL(client.url).pathname.startsWith("/ky-guvenlik/")}catch{return false}});if(existing){await existing.focus();try{await existing.navigate(APP_URL)}catch{};return}await clients.openWindow(APP_URL)}

async function fetchWithStartupTimeout(request){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),STARTUP_NETWORK_TIMEOUT_MS);try{return await fetch(request,{cache:"no-store",signal:controller.signal})}finally{clearTimeout(timer)}}
async function cacheShellAsset(cache,url){try{const response=await fetch(url,{cache:"no-store"});if(response.ok)await cache.put(url,response)}catch{}}
async function networkFirstWithShellFallback(request,fallbackUrl=""){const cache=await caches.open(CACHE_NAME);try{const response=await fetchWithStartupTimeout(request);if(!response.ok)throw new Error(`HTTP ${response.status}`);const cacheKey=fallbackUrl||request;void cache.put(cacheKey,response.clone()).catch(()=>{});return response}catch{const cached=await cache.match(fallbackUrl||request,{ignoreSearch:Boolean(fallbackUrl)});return cached||Response.error()}}

self.addEventListener("install",(event)=>event.waitUntil((async()=>{await self.skipWaiting();const cache=await caches.open(CACHE_NAME);await Promise.allSettled(SHELL_URLS.map((url)=>cacheShellAsset(cache,url)))})()));
self.addEventListener("activate",(event)=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter((key)=>(key.startsWith("kyerp-security-shell-")||key.startsWith("kyerp-ky-guvenlik-shell-"))&&key!==CACHE_NAME).map((key)=>caches.delete(key)));await self.clients.claim()})()));
self.addEventListener("push",(event)=>event.waitUntil(showWakeNotification()));
self.addEventListener("notificationclick",(event)=>{event.notification?.close();event.waitUntil(focusOrOpen())});
self.addEventListener("message",(event)=>{if(event.data?.type==="KYERP_SECURITY_CLEAR_NOTIFICATION")event.waitUntil(closeApprovalNotifications());if(event.data?.type==="KYERP_SECURITY_DECISION_DONE")event.waitUntil(showDecisionResult(event.data?.decision))});
self.addEventListener("fetch",(event)=>{if(event.request.method!=="GET")return;const url=new URL(event.request.url);if(url.origin!==self.location.origin||!url.pathname.startsWith("/ky-guvenlik/"))return;const isNavigation=event.request.mode==="navigate";const isShellAsset=SHELL_URLS.includes(url.pathname);if(!isNavigation&&!isShellAsset)return;event.respondWith(networkFirstWithShellFallback(event.request,isNavigation?APP_URL:url.pathname))});
