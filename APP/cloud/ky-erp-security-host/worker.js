const APP_PREFIX="/guvenlik";
const APP_URL="/guvenlik/";
const ADDITIONAL_APPS=["/ky-firma"];
const SHARED_ASSET_PREFIX="/ky-app-shell";
const PRO_PREFIX="/guvenlik/pro";
const LEGACY_PREFIXES=["/security","/ky-guvenlik","/ky-guvenlik-recover","/ky-sistem","/owner-security"];
const LEGACY_SW_PATHS=["/sw.js","/security/sw.js","/ky-guvenlik/sw.js","/ky-guvenlik-recover/sw.js","/ky-sistem/sw.js","/owner-security/sw.js"];
const RETIRE_SW=`self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil((async()=>{try{for(const k of await caches.keys())await caches.delete(k)}catch{}try{for(const n of await self.registration.getNotifications())n.close()}catch{}try{await self.registration.unregister()}catch{}try{for(const c of await self.clients.matchAll({type:"window",includeUncontrolled:true}))await c.navigate("/guvenlik/")}catch{}})()));`;

function headers(base=new Headers()){
  const h=new Headers(base);
  h.set("Cache-Control","no-store, max-age=0, must-revalidate");
  h.set("CDN-Cache-Control","no-store");
  h.set("Pragma","no-cache");
  h.set("X-KYERP-Security-App","fresh-v4");
  return h;
}
function isNav(req){return req.mode==="navigate"||String(req.headers.get("accept")||"").includes("text/html")}
function isAppPath(pathname){return pathname===APP_PREFIX||pathname.startsWith(`${APP_PREFIX}/`)||ADDITIONAL_APPS.some((p)=>pathname===p||pathname.startsWith(`${p}/`))||pathname.startsWith(`${SHARED_ASSET_PREFIX}/`)}
function isLegacyPath(pathname){return LEGACY_PREFIXES.some((prefix)=>pathname===prefix||pathname.startsWith(`${prefix}/`))}
function canonicalRedirect(url){
  const target=new URL(url);
  target.pathname=APP_URL;
  target.hash="";
  return new Response(null,{status:308,headers:headers(new Headers({Location:target.toString()}))});
}
function assetPath(pathname){
  // Serve the real, built canonical ERP inside the unchanged /guvenlik/ PWA scope.
  // Hashed Vite files are served literally; deep ERP module routes get one SPA document.
  if(pathname===PRO_PREFIX||pathname===PRO_PREFIX+"/"||
     (pathname.startsWith(PRO_PREFIX+"/")&&!pathname.startsWith(PRO_PREFIX+"/assets/")&&pathname!==PRO_PREFIX+"/index.html"))
    return PRO_PREFIX+"/index.html";
  if(pathname===APP_PREFIX||pathname===APP_URL)return "/guvenlik/index.html";
  for(const p of ADDITIONAL_APPS)if(pathname===p||pathname===`${p}/`)return `${p}/index.html`;
  return pathname;
}
async function serveAsset(request,url,env){
  if(!env?.ASSETS)return new Response("Security assets unavailable",{status:503,headers:headers()});
  const method=String(request.method||"GET").toUpperCase();
  const assetUrl=new URL(request.url);
  assetUrl.pathname=assetPath(url.pathname);
  assetUrl.search="";
  assetUrl.hash="";
  const requestHeaders=new Headers(request.headers);
  requestHeaders.delete("host");
  const assetRequest=new Request(assetUrl.toString(),{method,headers:requestHeaders,redirect:"manual"});
  const response=await env.ASSETS.fetch(assetRequest);
  const out=headers(response.headers);
  if(url.pathname.startsWith(PRO_PREFIX+"/assets/")&&/\\.[a-f0-9]{8,}\\./i.test(url.pathname))out.set("Cache-Control","public,max-age=31536000,immutable");
  for(const p of [APP_PREFIX,...ADDITIONAL_APPS])if(url.pathname===`${p}/sw.js`)out.set("Service-Worker-Allowed",`${p}/`);
  if(method==="HEAD")return new Response(null,{status:response.status,statusText:response.statusText,headers:out});
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:out});
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    const method=String(request.method||"GET").toUpperCase();
    const readable=method==="GET"||method==="HEAD";
    const navigation=readable&&isNav(request);
    if(readable&&LEGACY_SW_PATHS.includes(url.pathname)){
      return new Response(method==="HEAD"?null:RETIRE_SW,{status:200,headers:headers(new Headers({"Content-Type":"application/javascript; charset=UTF-8","Service-Worker-Allowed":"/"}))});
    }
    if(navigation&&["/ky-sistem","/ky-sistem/","/owner-security","/owner-security/"].includes(url.pathname))return canonicalRedirect(url);
    if(isLegacyPath(url.pathname))return new Response("Gone",{status:410,headers:headers()});
    if(url.pathname===APP_PREFIX&&navigation)return canonicalRedirect(url);
    if(navigation&&ADDITIONAL_APPS.includes(url.pathname)){
      const target=new URL(url);target.pathname=url.pathname+"/";target.hash="";
      return new Response(null,{status:308,headers:headers(new Headers({Location:target.toString()}))});
    }
    if(url.pathname===APP_URL)return serveAsset(request,url,env);
    if(isAppPath(url.pathname))return serveAsset(request,url,env);
    if(navigation)return canonicalRedirect(url);
    return new Response("Not Found",{status:404,headers:headers()});
  }
};
