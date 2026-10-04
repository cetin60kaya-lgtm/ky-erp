const APP_PREFIX="/guvenlik";
const APP_URL="/guvenlik/";
const LEGACY_PREFIXES=["/security","/ky-guvenlik","/ky-guvenlik-recover"];
const LEGACY_SW_PATHS=["/sw.js","/security/sw.js","/ky-guvenlik/sw.js","/ky-guvenlik-recover/sw.js"];
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
function isAppPath(pathname){return pathname===APP_PREFIX||pathname.startsWith(`${APP_PREFIX}/`)}
function isLegacyPath(pathname){return LEGACY_PREFIXES.some((prefix)=>pathname===prefix||pathname.startsWith(`${prefix}/`))}
function canonicalRedirect(url){
  const target=new URL(url);
  target.pathname=APP_URL;
  target.hash="";
  return new Response(null,{status:308,headers:headers(new Headers({Location:target.toString()}))});
}
function assetPath(pathname){const suffix=pathname.slice(APP_PREFIX.length);return suffix&&suffix!=="/"?suffix:"/"}
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
  if(url.pathname===`${APP_PREFIX}/sw.js`)out.set("Service-Worker-Allowed",APP_URL);
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
    if(isLegacyPath(url.pathname))return new Response("Gone",{status:410,headers:headers()});
    if(url.pathname===APP_PREFIX&&navigation)return canonicalRedirect(url);
    if(url.pathname===APP_URL)return serveAsset(request,url,env);
    if(isAppPath(url.pathname))return serveAsset(request,url,env);
    if(navigation)return canonicalRedirect(url);
    return new Response("Not Found",{status:404,headers:headers()});
  }
};
