const SOURCE_ORIGIN="https://kyerp.net";
const SOURCE_PREFIX="/guvenlik";
const PRIMARY_PREFIX="/ky-guvenlik";
const PRIMARY_URL=`${PRIMARY_PREFIX}/`;
const COMPAT_PREFIXES=[PRIMARY_PREFIX,SOURCE_PREFIX];
const LEGACY_PREFIXES=["/security","/ky-guvenlik-recover"];
const REDIRECT_QUERY_KEYS=["enrollmentId","enrollmentToken","mode","install","platform","browser","chrome"];

const RETIRE_SW=`const TARGET="/ky-guvenlik/";self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil((async()=>{try{for(const k of await caches.keys())await caches.delete(k)}catch{}try{for(const n of await self.registration.getNotifications())n.close()}catch{}try{await self.registration.unregister()}catch{}try{for(const c of await self.clients.matchAll({type:"window",includeUncontrolled:true}))await c.navigate(TARGET)}catch{}})()));self.addEventListener("fetch",e=>{if(e.request.mode==="navigate")e.respondWith(Response.redirect(new URL(TARGET,self.location.origin),308))});`;

const INSTALL_HELPER_HOTFIX=`(()=>{
  const ANDROID=/Android/i.test(String(navigator.userAgent||""));
  const ORIGIN="https://security.kyerp.net";
  const PATH="/guvenlik/";
  const PENDING_KEY="kyerp-security-fresh-enrollment-v3";
  const REVISION="fresh-v3-20260923-install-handoff";
  const qs=(s)=>document.querySelector(s);
  const standalone=()=>Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true);
  let deferredPrompt=null;
  let installing=false;

  function setUi(text,buttonText,disabled=false){
    document.documentElement.classList.add("ky-install-only");
    qs("#setupPanel")?.classList.add("hidden");
    qs("#appPanel")?.classList.add("hidden");
    qs("#installPanel")?.classList.remove("hidden");
    qs("#androidInstallNote")?.classList.remove("hidden");
    const state=qs("#installStateText");
    const button=qs("#installButton");
    if(state)state.textContent=text;
    if(button){button.classList.remove("hidden");button.textContent=buttonText;button.disabled=disabled;}
  }

  function capturePendingEnrollment(){
    try{
      const u=new URL(location.href);
      const id=String(u.searchParams.get("enrollmentId")||"").trim();
      const token=String(u.searchParams.get("enrollmentToken")||"").trim();
      const mode=String(u.searchParams.get("mode")||"").trim();
      if(id&&token){localStorage.setItem(PENDING_KEY,JSON.stringify({id,token,mode,savedAt:Date.now()}));}
    }catch{}
  }

  function canonicalInstallUrl(){
    const u=new URL(PATH,ORIGIN);
    u.searchParams.set("install","1");
    u.searchParams.set("platform","android");
    u.searchParams.set("chrome","1");
    return u;
  }

  function openFullChrome(){
    const u=canonicalInstallUrl();
    const fallback=encodeURIComponent(u.href);
    const intent="intent://"+u.host+u.pathname+u.search+"#Intent;scheme=https;package=com.android.chrome;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url="+fallback+";end";
    location.href=intent;
  }

  async function prepare(){
    if(!("serviceWorker" in navigator))return null;
    try{
      const regs=await navigator.serviceWorker.getRegistrations();
      for(const reg of regs){
        let p="";try{p=new URL(reg.scope).pathname}catch{}
        if(["/","/security/","/ky-guvenlik/","/ky-guvenlik-recover/"].includes(p)){try{await reg.unregister()}catch{}}
      }
      const reg=await navigator.serviceWorker.register("/guvenlik/sw.js",{scope:"/guvenlik/",updateViaCache:"none"});
      try{await reg.update()}catch{}
      return reg;
    }catch(error){console.warn("KY Security prepare:",error);return null;}
  }

  async function requestInstall(){
    if(installing||standalone())return;
    installing=true;
    try{
      await prepare();
      if(!deferredPrompt){
        await new Promise((resolve)=>setTimeout(resolve,1000));
      }
      if(!deferredPrompt){
        setUi("Android kurulum penceresi otomatik açılmadı. Chrome sağ üst ⋮ menüsünden ‘Uygulamayı yükle’ veya ‘Ana ekrana ekle’yi seç.","Tekrar Dene");
        return;
      }
      const prompt=deferredPrompt;deferredPrompt=null;
      await prompt.prompt();
      const choice=await prompt.userChoice.catch(()=>null);
      if(choice?.outcome==="accepted")setUi("Kurulum onaylandı. Android tamamladığında ana ekrandaki KY Güvenlik ikonunu aç.","Kurulum Tamamlanıyor",true);
      else setUi("Kurulum tamamlanmadı. Yeniden denemek için düğmeye dokun.","Tekrar Dene");
    }finally{installing=false;}
  }

  window.KYSecurityInstaller={revision:REVISION,isBrowserInstall:()=>ANDROID&&!standalone(),requestInstall,prepareInstall:prepare,openFullChrome};
  capturePendingEnrollment();
  if(standalone()||!ANDROID)return;

  window.addEventListener("beforeinstallprompt",(event)=>{
    event.preventDefault();deferredPrompt=event;
    const chromeRequested=new URL(location.href).searchParams.get("chrome")==="1";
    if(chromeRequested)setUi("Hazır. Android'in kendi kurulum penceresini açmak için düğmeye dokun.","KY Güvenlik'i Yükle");
  });
  window.addEventListener("appinstalled",()=>setUi("Kurulum tamamlandı. Ana ekrandaki KY Güvenlik ikonundan aç.","Kurulum Tamamlandı",true));

  function attach(){
    const button=qs("#installButton");
    if(!button)return;
    const chromeRequested=new URL(location.href).searchParams.get("chrome")==="1";
    if(!chromeRequested){
      setUi("Önce KY Güvenlik'i tam Google Chrome'da aç.","Chrome'da Aç");
      button.onclick=(event)=>{event.preventDefault();event.stopPropagation();openFullChrome();};
      return;
    }
    setUi("Chrome kurulum için hazır. Aşağıdaki düğmeye dokun.","KY Güvenlik'i Yükle");
    button.onclick=(event)=>{event.preventDefault();event.stopPropagation();void requestInstall();};
    void prepare();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach,{once:true});else attach();
})();`;

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
  if(url.pathname===`${prefix}/install-helper.js`){
    return new Response(method==="HEAD"?null:INSTALL_HELPER_HOTFIX,{status:200,headers:headers(new Headers({"Content-Type":"application/javascript; charset=UTF-8"}))});
  }
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
