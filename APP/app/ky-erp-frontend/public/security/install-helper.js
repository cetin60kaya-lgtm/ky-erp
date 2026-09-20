(()=>{
  const ua=String(navigator.userAgent||"");
  if(!/Android/i.test(ua))return;

  let deferredPrompt=null;
  let waitTimer=null;
  let waitStartedAt=Date.now();
  const reloadKey="kyerp-security-install-reload-v4";
  const qs=(selector)=>document.querySelector(selector);
  const isStandalone=()=>Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true);
  const chromiumAndroid=()=>/Chrome\//i.test(ua)||/EdgA\//i.test(ua);

  function requestState(){
    try{
      const params=new URL(location.href).searchParams;
      return {
        requested:params.get("install")==="1",
        browser:params.get("browser")==="1"
      };
    }catch{return{requested:false,browser:false}}
  }

  function notify(message){
    try{
      if(window.KYSecurityRuntime?.toast){window.KYSecurityRuntime.toast(message);return;}
    }catch{}
    const state=qs("#installStateText");
    if(state)state.textContent=message;
  }

  function showInstallPanel(){
    qs("#installPanel")?.classList.remove("hidden");
    qs("#androidInstallNote")?.classList.remove("hidden");
  }

  function startWaitClock(){
    if(waitTimer)return;
    waitStartedAt=Date.now();
    waitTimer=setInterval(()=>{
      if(deferredPrompt){stopWaitClock();return;}
      const elapsed=Math.max(0,Math.floor((Date.now()-waitStartedAt)/1000));
      const state=qs("#installStateText");
      if(!state)return;
      if(elapsed<15)state.textContent=`Android uygulama kurulumu hazırlanıyor · ${15-elapsed} sn`;
      else state.textContent="Android uygulama kurulum penceresi bekleniyor";
    },1000);
  }

  function stopWaitClock(){
    if(waitTimer){clearInterval(waitTimer);waitTimer=null;}
  }

  function setWaitingState(){
    showInstallPanel();
    const button=qs("#installButton");
    const state=qs("#installStateText");
    const note=qs("#androidInstallNote");
    if(button){
      button.disabled=true;
      button.classList.remove("hidden");
      button.textContent="Android kurulumu hazırlanıyor…";
    }
    if(state)state.textContent="Gerçek KY Güvenlik uygulaması hazırlanıyor";
    if(note){
      const text=note.querySelector("span");
      if(text)text.textContent="KY Güvenlik ayrı Android uygulaması olarak kurulacak. Kısayol oluşturulmaz; sistem Yükle penceresi hazır olduğunda düğme açılır.";
    }
    startWaitClock();
  }

  function setPromptReady(){
    stopWaitClock();
    showInstallPanel();
    const button=qs("#installButton");
    const state=qs("#installStateText");
    const note=qs("#androidInstallNote");
    if(button){
      button.disabled=false;
      button.classList.remove("hidden");
      button.textContent="KY Güvenlik'i Yükle";
    }
    if(state)state.textContent="Android uygulama kurulumu hazır";
    if(note){
      const text=note.querySelector("span");
      if(text)text.textContent="Dokunduğunda Android'in gerçek Yükle penceresi açılır. KY ERP ve KY Güvenlik telefonda iki ayrı uygulama olarak kalır.";
    }
  }

  function markInstalled(){
    deferredPrompt=null;
    stopWaitClock();
    sessionStorage.removeItem(reloadKey);
    const panel=qs("#installPanel");
    const button=qs("#installButton");
    const state=qs("#installStateText");
    const title=qs("#installTitle");
    const copy=qs("#installCopy");
    panel?.classList.remove("hidden");
    if(title)title.textContent="KY ERP Güvenlik yüklendi";
    if(copy)copy.textContent="Kurulum tamamlandı. KY ERP Güvenlik artık telefonda ayrı uygulamadır.";
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
        new Promise((_,reject)=>setTimeout(()=>reject(new Error("timeout")),3500))
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
    if(isStandalone()){
      markInstalled();
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
          notify("KY Güvenlik uygulaması Android'e kuruluyor.");
          return;
        }
        notify("Kurulum iptal edildi. İstersen tekrar Yükle'ye dokunabilirsin.");
      }catch{
        notify("Android Yükle penceresi açılamadı. Kurulum yeniden hazırlanıyor.");
      }
      setWaitingState();
      return;
    }

    if(!chromiumAndroid()){
      openInChrome();
      return;
    }

    if(await retryWithSecurityWorker())return;
    setWaitingState();
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
    if(isStandalone()&&!request.requested){
      markInstalled();
      return;
    }
    if(isStandalone()&&request.requested){
      openInChrome();
      return;
    }
    if(deferredPrompt){setPromptReady();return;}
    await ensureSecurityWorker();
    if(deferredPrompt){setPromptReady();return;}
    setWaitingState();
  }

  function attach(){
    const button=qs("#installButton");
    if(!button)return;

    button.addEventListener("click",(event)=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      if(button.disabled&&!deferredPrompt){
        notify("Android uygulama kurulumu hazırlanıyor.");
        return;
      }
      void installFromButton();
    },true);

    void stabilize();
    setTimeout(()=>void stabilize(),1200);
    setTimeout(()=>void stabilize(),4000);
    setTimeout(()=>void stabilize(),10000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach,{once:true});
  else attach();
})();
