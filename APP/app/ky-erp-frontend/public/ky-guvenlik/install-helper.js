(()=>{
  const ANDROID=/Android/i.test(String(navigator.userAgent||""));
  const ORIGIN="https://security.kyerp.net";
  const PATH="/ky-guvenlik/";
  const PENDING_KEY="kyerp-security-pending-enrollment-v2";
  const INSTALL_TIMEOUT_MS=8000;
  let deferredPrompt=null;
  const qs=(selector)=>document.querySelector(selector);
  const standalone=()=>Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true);
  const withTimeout=(promise,ms,message)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),ms))]);

  function capturePendingEnrollment(){
    try{
      const url=new URL(location.href);
      const id=String(url.searchParams.get("enrollmentId")||"").trim();
      const token=String(url.searchParams.get("enrollmentToken")||"").trim();
      const mode=String(url.searchParams.get("mode")||"").trim();
      if(id&&token){
        localStorage.setItem(PENDING_KEY,JSON.stringify({id,token,mode,savedAt:Date.now()}));
        url.searchParams.delete("enrollmentId");
        url.searchParams.delete("enrollmentToken");
        url.searchParams.delete("mode");
        history.replaceState({},"",url.pathname+url.search+url.hash);
      }
    }catch{}
  }

  function canonicalInstallUrl(){
    const url=new URL(PATH,ORIGIN);
    url.searchParams.set("install","1");
    url.searchParams.set("platform","android");
    url.searchParams.set("chrome","1");
    return url;
  }

  function installOnly(){
    document.documentElement.classList.add("ky-install-only");
    qs("#setupPanel")?.classList.add("hidden");
    qs("#appPanel")?.classList.add("hidden");
    qs("#installPanel")?.classList.remove("hidden");
    qs("#androidInstallNote")?.classList.remove("hidden");
  }

  function setUi(text,buttonText="",disabled=false){
    installOnly();
    const state=qs("#installStateText");
    const button=qs("#installButton");
    if(state)state.textContent=text;
    if(button){button.classList.toggle("hidden",!buttonText);if(buttonText)button.textContent=buttonText;button.disabled=disabled;}
  }

  function openFullChrome(){
    const url=canonicalInstallUrl();
    const fallback=encodeURIComponent(url.href);
    location.href=`intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${fallback};end`;
  }

  async function migrateLegacyWorkers(){
    if(!("serviceWorker" in navigator))return;
    const registrations=await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async(registration)=>{
      if(new URL(registration.scope).pathname!=="/security/")return;
      try{(await registration.getNotifications()).forEach((notification)=>notification.close())}catch{}
      try{await registration.unregister()}catch{}
    }));
    const keys=await caches.keys().catch(()=>[]);
    await Promise.all(keys.filter((key)=>key.startsWith("kyerp-security-shell-")||key.startsWith("kyerp-ky-guvenlik-shell-")).map((key)=>caches.delete(key)));
  }

  async function prepareInstall(){
    setUi("Android uygulama kurulumu hazırlanıyor…","Hazırlanıyor…",true);
    try{
      await withTimeout(migrateLegacyWorkers(),INSTALL_TIMEOUT_MS,"Eski güvenlik sürümü temizlenemedi.");
      if(!("serviceWorker" in navigator))throw new Error("Bu Chrome sürümü uygulama kurulumunu desteklemiyor.");
      const registration=await withTimeout(navigator.serviceWorker.register("/ky-guvenlik/sw.js",{scope:PATH,updateViaCache:"none"}),INSTALL_TIMEOUT_MS,"Güvenlik servisi zamanında hazırlanamadı.");
      try{await withTimeout(registration.update(),INSTALL_TIMEOUT_MS,"Güncelleme zaman aşımına uğradı.")}catch{}
      if(deferredPrompt)setUi("KY ERP Güvenlik kuruluma hazır.","KY Güvenlik'i Yükle");
      else setUi("Chrome kurulum seçeneğini hazırlıyor. Düğme açılmazsa Chrome menüsünden ‘Uygulamayı yükle’yi seçin.","Kurulumu Tekrar Kontrol Et");
    }catch(error){setUi(error?.message||"Kurulum hazırlanamadı. İnternet bağlantısını kontrol edip tekrar deneyin.","Tekrar Dene");}
  }

  async function requestInstall(){
    if(standalone())return;
    if(!deferredPrompt){await prepareInstall();return;}
    const prompt=deferredPrompt;deferredPrompt=null;
    try{
      await prompt.prompt();
      const choice=await withTimeout(prompt.userChoice,INSTALL_TIMEOUT_MS,"Kurulum yanıtı alınamadı.").catch(()=>null);
      if(choice?.outcome==="accepted")setUi("Kurulum onaylandı. Android tamamladığında ana ekrandaki KY Güvenlik ikonunu açın.","Kurulum Tamamlanıyor",true);
      else setUi("Kurulum tamamlanmadı. Hazır olduğunuzda yeniden deneyebilirsiniz.","Tekrar Dene");
    }catch(error){setUi(error?.message||"Android kurulum ekranı açılamadı.","Tekrar Dene");}
  }

  window.KYSecurityInstaller={isBrowserInstall:()=>ANDROID&&!standalone(),requestInstall,prepareInstall,openFullChrome};
  capturePendingEnrollment();
  if(!ANDROID)return;

  window.addEventListener("beforeinstallprompt",(event)=>{event.preventDefault();deferredPrompt=event;if(!standalone())setUi("KY ERP Güvenlik kuruluma hazır.","KY Güvenlik'i Yükle");});
  window.addEventListener("appinstalled",()=>{deferredPrompt=null;setUi("Kurulum tamamlandı. Ana ekrandaki KY Güvenlik ikonundan açın.","Kurulum Tamamlandı",true);});

  function attach(){
    if(standalone())return;
    installOnly();
    const button=qs("#installButton");
    if(button)button.addEventListener("click",(event)=>{event.preventDefault();event.stopImmediatePropagation();void requestInstall()},{capture:true});
    const chromeRequested=new URL(location.href).searchParams.get("chrome")==="1";
    if(location.origin!==ORIGIN||!chromeRequested){setUi("Kurulum normal Chrome'da açılacak.","Chrome'da Devam Et");openFullChrome();return;}
    void prepareInstall();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach,{once:true});
  else attach();
})();
