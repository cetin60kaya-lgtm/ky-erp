(()=>{
  const ua=String(navigator.userAgent||"");
  if(!/Android/i.test(ua))return;

  let deferredPrompt=null;
  let manualMode=false;
  const reloadKey="kyerp-security-install-reload-v2";
  const qs=(selector)=>document.querySelector(selector);
  const isStandalone=()=>Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true);
  const chromiumAndroid=()=>/Chrome\//i.test(ua)||/EdgA\//i.test(ua);

  function requestState(){
    try{
      const params=new URL(location.href).searchParams;
      return {
        requested:params.get("install")==="1",
        browser:params.get("browser")==="1",
        securityLaunch:params.get("source")==="security-app"
      };
    }catch{return{requested:false,browser:false,securityLaunch:false}}
  }

  function notify(message){
    try{
      if(window.KYSecurityRuntime?.toast){window.KYSecurityRuntime.toast(message);return;}
    }catch{}
    const state=qs("#installStateText");
    if(state)state.textContent=message;
  }

  function setManualHelp(message="Kurulum düğmesi hazır"){
    manualMode=true;
    const button=qs("#installButton");
    const state=qs("#installStateText");
    const note=qs("#androidInstallNote");
    if(button){
      button.disabled=false;
      button.classList.remove("hidden");
      button.textContent="KY Güvenlik'i Yükle";
    }
    if(state)state.textContent=message;
    if(note){
      note.classList.remove("hidden");
      const text=note.querySelector("span");
      if(text)text.textContent="Düğmeye dokun. Android kurulum penceresi açılırsa Yükle'yi seç. Açılmazsa Chrome sağ üst ⋮ → Uygulamayı yükle / Ana ekrana ekle → Yükle yolunu kullan.";
    }
  }

  function setPromptReady(){
    manualMode=false;
    const button=qs("#installButton");
    const state=qs("#installStateText");
    if(button){
      button.disabled=false;
      button.classList.remove("hidden");
      button.textContent="KY Güvenlik'i Yükle";
    }
    if(state)state.textContent="Kuruluma hazır · Dokun ve Yükle";
  }

  function markInstalled(){
    deferredPrompt=null;
    manualMode=false;
    sessionStorage.removeItem(reloadKey);
    const panel=qs("#installPanel");
    const button=qs("#installButton");
    const state=qs("#installStateText");
    const title=qs("#installTitle");
    const copy=qs("#installCopy");
    panel?.classList.remove("hidden");
    if(title)title.textContent="KY ERP Güvenlik yüklendi";
    if(copy)copy.textContent="Kurulum tamamlandı. Ana ekrandaki KY Güvenlik ikonundan açabilirsin.";
    if(state)state.textContent="Yüklendi · Hazır";
    button?.classList.add("hidden");
  }

  function isSecurityController(){
    try{
      const script=String(navigator.serviceWorker?.controller?.scriptURL||"");
      return new URL(script,location.href).pathname.endsWith("/security/sw.js");
    }catch{return false}
  }

  async function ensureSecurityWorker(){
    if(!("serviceWorker" in navigator))return null;
    try{
      const registration=await navigator.serviceWorker.register("/security/sw.js",{scope:"/security/"});
      try{await registration.update()}catch{}
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_,reject)=>setTimeout(()=>reject(new Error("timeout")),2500))
      ]);
      return registration;
    }catch{return null}
  }

  async function retryWithSecurityWorker(){
    const registration=await ensureSecurityWorker();
    if(!registration)return false;
    if(isSecurityController())return false;
    if(sessionStorage.getItem(reloadKey)==="1")return false;
    sessionStorage.setItem(reloadKey,"1");
    const url=new URL(location.href);
    url.searchParams.set("install","1");
    url.searchParams.set("platform","android");
    url.searchParams.set("browser","1");
    location.replace(url.href);
    return true;
  }

  function openInChrome(){
    const target="https://app.kyerp.net/security/?install=1&platform=android&browser=1";
    const fallback=encodeURIComponent(target);
    location.href="intent://app.kyerp.net/security/?install=1&platform=android&browser=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url="+fallback+";end";
  }

  async function installFromButton(){
    const request=requestState();

    // Ana KY ERP uygulaması da standalone çalışır. Kurulum isteği oradan geldiyse
    // "zaten yüklü" saymak yerine gerçek Chrome sekmesine çıkıp ayrı KY Güvenlik PWA'sını kur.
    if(isStandalone()&&request.requested&&!request.securityLaunch){
      notify("KY Güvenlik ayrı uygulama olarak Chrome'da açılıyor.");
      openInChrome();
      return;
    }

    if(isStandalone()&&request.securityLaunch){
      markInstalled();
      notify("KY ERP Güvenlik zaten uygulama olarak açık.");
      return;
    }

    if(deferredPrompt){
      const prompt=deferredPrompt;
      deferredPrompt=null;
      try{
        await prompt.prompt();
        const choice=await prompt.userChoice.catch(()=>null);
        if(choice?.outcome==="accepted"){
          const state=qs("#installStateText");
          if(state)state.textContent="Kurulum onaylandı · Android tamamlıyor";
          notify("KY Güvenlik kurulumu Android'e gönderildi.");
          return;
        }
        notify("Kurulum iptal edildi. Düğmeye tekrar dokunabilirsin.");
      }catch{
        notify("Android kurulum penceresi açılamadı. Kurulum yeniden hazırlanıyor.");
      }
      setManualHelp();
      return;
    }

    if(!chromiumAndroid()){
      openInChrome();
      return;
    }

    if(await retryWithSecurityWorker())return;

    setManualHelp("Chrome kurulum seçeneği hazır");
    notify("Kurulum penceresi otomatik açılmazsa Chrome sağ üst ⋮ → Uygulamayı yükle / Ana ekrana ekle → Yükle seçeneğini kullan.");
  }

  window.addEventListener("beforeinstallprompt",(event)=>{
    event.preventDefault();
    deferredPrompt=event;
    sessionStorage.removeItem(reloadKey);
    setPromptReady();
  });

  window.addEventListener("appinstalled",()=>{
    sessionStorage.removeItem(reloadKey);
    markInstalled();
  });

  async function stabilize(){
    const request=requestState();
    if(isStandalone()&&request.securityLaunch){
      markInstalled();
      return;
    }
    if(deferredPrompt){
      setPromptReady();
      return;
    }
    await ensureSecurityWorker();
    if(deferredPrompt){
      setPromptReady();
      return;
    }
    setManualHelp(isSecurityController()?"Chrome kurulum seçeneği hazır":"Kurulum hazırlanıyor · Düğmeye dokun");
  }

  function attach(){
    const button=qs("#installButton");
    if(!button)return;

    button.addEventListener("click",(event)=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      void installFromButton();
    },true);

    const observer=new MutationObserver(()=>{
      if(manualMode&&!deferredPrompt){
        const request=requestState();
        if(isStandalone()&&request.securityLaunch)return;
        const state=qs("#installStateText");
        if(button.disabled)button.disabled=false;
        if(button.classList.contains("hidden"))button.classList.remove("hidden");
        if(button.textContent!=="KY Güvenlik'i Yükle")button.textContent="KY Güvenlik'i Yükle";
        if(state&&/hazırlanıyor|desteklemiyor/i.test(String(state.textContent||"")))state.textContent="Kurulum düğmesi hazır";
      }
    });
    observer.observe(button,{attributes:true,childList:true,characterData:true,subtree:true});

    void stabilize();
    setTimeout(()=>void stabilize(),800);
    setTimeout(()=>void stabilize(),2200);
    setTimeout(()=>void stabilize(),4500);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach,{once:true});
  else attach();
})();
