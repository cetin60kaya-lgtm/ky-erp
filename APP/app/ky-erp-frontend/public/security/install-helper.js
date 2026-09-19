(()=>{
  const ua=String(navigator.userAgent||"");
  if(!/Android/i.test(ua))return;

  let deferredPrompt=null;
  let manualMode=false;
  const reloadKey="kyerp-security-install-reload-v1";
  const qs=(selector)=>document.querySelector(selector);
  const standalone=()=>Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true);
  const chromiumAndroid=()=>/Chrome\//i.test(ua)||/EdgA\//i.test(ua);

  function notify(message){
    try{
      if(window.KYSecurityRuntime?.toast){window.KYSecurityRuntime.toast(message);return;}
    }catch{}
    const state=qs("#installStateText");
    if(state)state.textContent=message;
  }

  function setManualHelp(){
    manualMode=true;
    const button=qs("#installButton");
    const state=qs("#installStateText");
    const note=qs("#androidInstallNote");
    if(button){button.disabled=false;button.classList.remove("hidden");button.textContent="KY Güvenlik'i Yükle";}
    if(state)state.textContent="Kurulum düğmesi hazır";
    if(note){
      note.classList.remove("hidden");
      const text=note.querySelector("span");
      if(text)text.textContent="Düğmeye dokun. Android kurulum penceresi açılırsa Yükle'yi seç. Pencere açılmazsa Chrome sağ üst ⋮ → Ana ekrana ekle / Uygulamayı yükle → Yükle yolunu kullan.";
    }
  }

  function setPromptReady(){
    manualMode=false;
    const button=qs("#installButton");
    const state=qs("#installStateText");
    if(button){button.disabled=false;button.classList.remove("hidden");button.textContent="KY Güvenlik'i Yükle";}
    if(state)state.textContent="Kuruluma hazır · Dokun ve Yükle";
  }

  function markInstalled(){
    deferredPrompt=null;
    manualMode=false;
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

  async function retryWithControlledPage(){
    if(!("serviceWorker" in navigator))return false;
    try{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error("timeout")),1800))]);}catch{return false;}
    if(navigator.serviceWorker.controller)return false;
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
    if(standalone()){markInstalled();notify("KY ERP Güvenlik zaten uygulama olarak açık.");return;}

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
        notify("Android kurulum penceresi açılamadı. Tekrar deneniyor.");
      }
      setManualHelp();
      return;
    }

    if(!chromiumAndroid()){
      openInChrome();
      return;
    }

    if(await retryWithControlledPage())return;

    setManualHelp();
    notify("Chrome kurulum penceresini otomatik vermedi. Sağ üst ⋮ → Ana ekrana ekle / Uygulamayı yükle → Yükle seçeneğini kullan.");
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

  function stabilize(){
    if(standalone()){sessionStorage.removeItem(reloadKey);return;}
    if(deferredPrompt){setPromptReady();return;}
    setManualHelp();
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
      if(manualMode&&!standalone()&&!deferredPrompt){
        const state=qs("#installStateText");
        if(button.disabled)button.disabled=false;
        if(button.classList.contains("hidden"))button.classList.remove("hidden");
        if(button.textContent!=="KY Güvenlik'i Yükle")button.textContent="KY Güvenlik'i Yükle";
        if(state&&state.textContent!=="Kurulum düğmesi hazır")state.textContent="Kurulum düğmesi hazır";
      }
    });
    observer.observe(button,{attributes:true,childList:true,characterData:true,subtree:true});
    setTimeout(stabilize,250);
    setTimeout(stabilize,1000);
    setTimeout(stabilize,2400);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach,{once:true});
  else attach();
})();
