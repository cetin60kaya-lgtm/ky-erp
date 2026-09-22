const SOURCE_ORIGIN="https://kyerp.net";
const APP_PREFIX="/guvenlik";
const APP_URL="/guvenlik/";
const LEGACY_PREFIXES=["/security","/ky-guvenlik","/ky-guvenlik-recover"];
const REDIRECT_QUERY_KEYS=["enrollmentId","enrollmentToken","mode","install","platform","browser","chrome"];

const RETIRE_SW=`self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil((async()=>{try{for(const k of await caches.keys())await caches.delete(k)}catch{}try{for(const n of await self.registration.getNotifications())n.close()}catch{}try{await self.registration.unregister()}catch{}try{for(const c of await self.clients.matchAll({type:"window",includeUncontrolled:true}))await c.navigate("/guvenlik/")}catch{}})()));`;

function headers(base=new Headers()){
  const h=new Headers(base);
  h.set("Cache-Control","no-store, max-age=0, must-revalidate");
  h.set("CDN-Cache-Control","no-store");
  h.set("Pragma","no-cache");
  h.set("X-KYERP-Security-App","fresh-v3");
  return h;
}

function isNav(req){
  return req.mode==="navigate"||String(req.headers.get("accept")||"").includes("text/html");
}

function redirect(url){
  const target=new URL(url);
  target.pathname=APP_URL;
  const preserved=new URLSearchParams();
  for(const key of REDIRECT_QUERY_KEYS){
    const value=url.searchParams.get(key);
    if(value!==null)preserved.set(key,value);
  }
  target.search=preserved.toString();
  target.hash="";
  return new Response(null,{status:308,headers:headers(new Headers({Location:target.toString()}))});
}
async function proxy(req,url){
  const method=String(req.method||"GET").toUpperCase();
  const upstream=new URL(url.pathname,SOURCE_ORIGIN);
  upstream.search=url.search;
  const h=new Headers(req.headers);h.delete("host");
  const init={method,headers:h,redirect:"manual"};
  if(method!=="GET"&&method!=="HEAD")init.body=req.body;
  const res=await fetch(new Request(upstream,init),{cache:"no-store"});
  const out=headers(res.headers);
  if(url.pathname===`${APP_PREFIX}/sw.js`)out.set("Service-Worker-Allowed",APP_URL);
  return new Response(method==="HEAD"?null:res.body,{status:res.status,statusText:res.statusText,headers:out});
}

export default{
  async fetch(request){
    const url=new URL(request.url);
    const method=String(request.method||"GET").toUpperCase();
    const readable=method==="GET"||method==="HEAD";
    const legacy=LEGACY_PREFIXES.some((p)=>url.pathname===p||url.pathname.startsWith(`${p}/`));

    if(readable&&["/sw.js","/security/sw.js","/ky-guvenlik/sw.js"].includes(url.pathname)){
      return new Response(method==="HEAD"?null:RETIRE_SW,{status:200,headers:headers(new Headers({"Content-Type":"application/javascript; charset=UTF-8","Service-Worker-Allowed":"/"}))});
    }
    if(legacy&&isNav(request))return redirect(url);
    if(legacy)return new Response("Gone",{status:410,headers:headers()});
    if(url.pathname===APP_PREFIX&&isNav(request))return redirect(url);
    if(url.pathname===APP_URL||url.pathname.startsWith(`${APP_PREFIX}/`))return proxy(request,url);
    if(isNav(request))return redirect(url);
    return new Response("Not Found",{status:404,headers:headers()});
  }
};
