const SOURCE_ORIGIN="https://kyerp.net";
const SOURCE_PREFIX="/guvenlik";
const PRIMARY_PREFIX="/ky-guvenlik";
const PRIMARY_URL=`${PRIMARY_PREFIX}/`;
const COMPAT_PREFIXES=[PRIMARY_PREFIX,SOURCE_PREFIX];
const LEGACY_PREFIXES=["/security","/ky-guvenlik-recover"];
const REDIRECT_QUERY_KEYS=["enrollmentId","enrollmentToken","mode","install","platform","browser","chrome"];

const RETIRE_SW=`const TARGET="/ky-guvenlik/";self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil((async()=>{try{for(const k of await caches.keys())await caches.delete(k)}catch{}try{for(const n of await self.registration.getNotifications())n.close()}catch{}try{await self.registration.unregister()}catch{}try{for(const c of await self.clients.matchAll({type:"window",includeUncontrolled:true}))await c.navigate(TARGET)}catch{}})()));self.addEventListener("fetch",e=>{if(e.request.mode==="navigate")e.respondWith(Response.redirect(new URL(TARGET,self.location.origin),308))});`;

function headers(base=new Headers()){
  const h=new Headers(base);
  h.set("Cache-Control","no-store, max-age=0, must-revalidate");
  h.set("CDN-Cache-Control","no-store");
  h.set("Pragma","no-cache");
  h.set("X-KYERP-Security-App","fresh-v3-compat");
  return h;
}
function isNav(req){return req.mode==="navigate"||String(req.headers.get("accept")||"").includes("text/html")}
function scopedPrefix(pathname){for(const prefix of COMPAT_PREFIXES){if(pathname===prefix||pathname.startsWith(`${prefix}/`))return prefix}return""}
function redirect(url,prefix=PRIMARY_PREFIX){
  const target=new URL(url);
  target.pathname=`${prefix}/`;
  const preserved=new URLSearchParams();
  for(const key of REDIRECT_QUERY_KEYS){const value=url.searchParams.get(key);if(value!==null)preserved.set(key,value)}
  target.search=preserved.toString();target.hash="";
  return new Response(null,{status:308,headers:headers(new Headers({Location:target.toString()}))});
}
function sourcePath(pathname,prefix){const suffix=pathname.slice(prefix.length);return `${SOURCE_PREFIX}${suffix||"/"}`}
function shouldRewrite(pathname,contentType){
  const type=String(contentType||"").toLowerCase();
  return type.includes("text/")||type.includes("javascript")||type.includes("json")||pathname.endsWith(".webmanifest");
}
async function proxyScoped(req,url,prefix){
  const method=String(req.method||"GET").toUpperCase();
  const upstream=new URL(sourcePath(url.pathname,prefix),SOURCE_ORIGIN);upstream.search=url.search;
  const requestHeaders=new Headers(req.headers);requestHeaders.delete("host");
  const init={method,headers:requestHeaders,redirect:"manual"};
  if(method!=="GET"&&method!=="HEAD")init.body=req.body;
  const res=await fetch(new Request(upstream,init),{cache:"no-store"});
  const out=headers(res.headers);
  if(url.pathname===`${prefix}/sw.js`)out.set("Service-Worker-Allowed",`${prefix}/`);
  if(method==="HEAD")return new Response(null,{status:res.status,statusText:res.statusText,headers:out});
  if(!shouldRewrite(url.pathname,res.headers.get("content-type")))return new Response(res.body,{status:res.status,statusText:res.statusText,headers:out});
  let body=await res.text();
  if(prefix!==SOURCE_PREFIX)body=body.replaceAll(`${SOURCE_PREFIX}/`,`${prefix}/`);
  out.delete("content-length");out.delete("content-encoding");out.delete("etag");out.delete("last-modified");
  return new Response(body,{status:res.status,statusText:res.statusText,headers:out});
}

export default{
  async fetch(request){
    const url=new URL(request.url);
    const method=String(request.method||"GET").toUpperCase();
    const readable=method==="GET"||method==="HEAD";
    const navigation=readable&&isNav(request);

    if(readable&&["/sw.js","/security/sw.js","/ky-guvenlik-recover/sw.js"].includes(url.pathname)){
      return new Response(method==="HEAD"?null:RETIRE_SW,{status:200,headers:headers(new Headers({"Content-Type":"application/javascript; charset=UTF-8","Service-Worker-Allowed":"/"}))});
    }

    const prefix=scopedPrefix(url.pathname);
    if(prefix){
      if(url.pathname===prefix&&navigation)return redirect(url,prefix);
      return proxyScoped(request,url,prefix);
    }

    const legacy=LEGACY_PREFIXES.some((p)=>url.pathname===p||url.pathname.startsWith(`${p}/`));
    if(legacy&&navigation)return redirect(url,PRIMARY_PREFIX);
    if(legacy)return new Response("Gone",{status:410,headers:headers()});
    if(navigation)return redirect(url,PRIMARY_PREFIX);
    return new Response("Not Found",{status:404,headers:headers()});
  }
};
