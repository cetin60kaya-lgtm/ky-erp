(()=>{
  const ua=String(navigator.userAgent||"");
  if(!/Android/i.test(ua))return;

  let deferredPrompt=null;
  let waitTimer=null;
  let waitStartedAt=Date.now();
  const reloadKey="kyerp-security-install-reload-v3";
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

  function showInstallPanel(){
    qs("#installPanel")?.classList.remove("hidden");
    qs("#androidInstallNote")?.classList.remove("hidden");
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
    if(note){
      const text=note.querySelector("span");
      if(text)text.textContent="Kısayol oluşturulmayacak. Chrome gerçek KY Güvenlik uygulama kurulumunu hazırladığında Yükle düğmesi aktif olur. İlk kurulumda bu hazırlık 30 saniye kadar sürebilir.";
    }
    if(state)state.textContent="Gerçek uygulama kurulumu hazırlanıyor";
    startWaitClock();
  }

  function startWaitClock(){
    if(waitTimer)return;
    waitStartedAt=Date.now();
    waitTimer=setInterval(()=>{
      if(deferredPrompt){stopWaitClock();return;}
      const elapsed=Math.max(0,Math.floor((Date.now()-waitStartedAt)/1000));
      const state=qs("#installStateText");
      if(!state)return;
      if(elapsed<30)state.textContent=`Chrome uygulama kurulumunu hazırlıyor · ${30-elapsed} sn`;
      else if(elapsed<45)state.textContent="Chrome kurulum uygunluğunu tamamlıyor…";
      else state.textContent="Kurulum penceresi bekleniyor · Bu sekmeyi açık tut";
    },1000);
  }

  function stopWaitClock(){
    if(waitTimer){clearInterval(waitTimer);waitTimer=null;}
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
      button.textContent="KY Güvenlik'i Uygulama Olarak Yükle";
    }
    if(state)state.textContent="Gerçek Android uygulama kurulumu hazır";
    if(note){
      const text=note.querySelector("span");
      if(text)text.textContent="Bu düğme yalnız Android'in gerçek uygulama yükleme penceresini açar. Chrome kısayolu kullanılmaz.";
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
    const request=requestState();

    if(isStandalone()&&request.requested&&!request.securityLaunch){
      notify("KY Güvenlik ayrı uygulama kurulumu için Chrome'da açılıyor.");
      openInChrome();
      return;
    }

    if(isStandalone()&&request.securityLaunch){
      markInstalled();
      notify("KY ERP Güvenlik uygulama olarak açık.");
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
          notify("KY Güvenlik gerçek uygulama kurulumu Android'e gönderildi.");
          return;
        }
        notify("Kurulum iptal edildi. Hazır olduğunda tekrar deneyebilirsin.");
      }catch{
        notify("Android uygulama kurulum penceresi açılamadı. Yeniden hazırlanıyor.");
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
    notify("Kısayol kullanılmayacak. Chrome gerçek uygulama kurulumunu hazırlıyor; bu sekmeyi açık tut.");
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
        notify("Chrome gerçek uygulama kurulumunu hazırlıyor. Kısayol oluşturma kullanılmayacak.");
        return;
      }
      void installFromButton();
    },true);

    void stabilize();
    setTimeout(()=>void stabilize(),1500);
    setTimeout(()=>void stabilize(),5000);
    setTimeout(()=>void stabilize(),15000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach,{once:true});
  else attach();
})();
