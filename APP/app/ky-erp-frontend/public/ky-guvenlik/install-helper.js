(()=>{
  const ua=String(navigator.userAgent||"");
  if(!/Android/i.test(ua))return;

  const ORIGIN="https://security.kyerp.net";
  const PATH="/ky-guvenlik/";
  const PENDING_KEY="kyerp-security-pending-enrollment-v2";
  let installPrompt=null;
  const qs=(s)=>document.querySelector(s);
  const standalone=()=>Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true);
  const state=()=>{try{const p=new URL(location.href).searchParams;return{chrome:p.get("chrome")==="1"}}catch{return{chrome:false}}};

  function captureEnrollment(){
    try{
      const u=new URL(location.href);
      const id=String(u.searchParams.get("enrollmentId")||"").trim();
      const token=String(u.searchParams.get("enrollmentToken")||"").trim();
      const mode=String(u.searchParams.get("mode")||"").trim();
      if(id&&token)localStorage.setItem(PENDING_KEY,JSON.stringify({id,token,mode,savedAt:Date.now()}));
    }catch{}
  }

  function installUrl(){
    const u=new URL(location.href);
    u.protocol="https:";u.host="security.kyerp.net";u.pathname=PATH;
    u.searchParams.set("install","1");
    u.searchParams.set("platform","android");
    u.searchParams.set("chrome","1");
    u.searchParams.set("release","2.9");
    u.searchParams.set("boot","9");
    return u;
  }

  function installOnly(){
    document.documentElement.classList.add("ky-install-only");
    if(!document.querySelector("#kyInstallOnlyStyle")){
      const style=document.createElement("style");
      style.id="kyInstallOnlyStyle";
      style.textContent="html.ky-install-only #setupPanel,html.ky-install-only #appPanel{display:none!important}html.ky-install-only #installPanel{display:grid!important}";
      document.head.appendChild(style);
    }
    qs("#setupPanel")?.classList.add("hidden");
    qs("#appPanel")?.classList.add("hidden");
    qs("#installPanel")?.classList.remove("hidden");
    qs("#androidInstallNote")?.classList.remove("hidden");
  }

  function setUi(text,buttonText,disabled=false){
    installOnly();
    const t=qs("#installStateText"),b=qs("#installButton");
    if(t)t.textContent=text;
    if(b){b.classList.remove("hidden");b.textContent=buttonText;b.disabled=disabled;}
  }

  function openChrome(){
    const u=installUrl();
    const fallback=encodeURIComponent(u.href);
    location.href=`intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  }

  async function ensureWorker(){
    if(!("serviceWorker" in navigator))return null;
    try{
      const r=await navigator.serviceWorker.register("/ky-guvenlik/sw.js?boot=9",{scope:"/ky-guvenlik/",updateViaCache:"none"});
      try{await r.update()}catch{}
      return r;
    }catch{return null}
  }

  async function prepareFullChrome(){
    setUi("Android uygulama kurulumu hazırlanıyor…","Kurulumu Kontrol Et",false);
    const r=await ensureWorker();
    if(installPrompt)return;
    if(!r){setUi("Chrome güvenlik servisini hazırlayamadı.","Tekrar Dene",false);return;}
    setUi("Android yükleme penceresi bekleniyor.","Kurulumu Kontrol Et",false);
  }

  async function clickInstall(){
    if(standalone())return;
    if(!state().chrome){openChrome();return;}
    if(installPrompt){
      const p=installPrompt;installPrompt=null;
      try{
        await p.prompt();
        const choice=await p.userChoice.catch(()=>null);
        if(choice?.outcome==="accepted")setUi("Kurulum onaylandı. Android tamamlıyor…","Kurulum Tamamlanıyor",true);
        else setUi("Kurulum iptal edildi.","KY Güvenlik'i Yükle",false);
      }catch{setUi("Yükleme penceresi açılamadı.","Tekrar Dene",false)}
      return;
    }
    await prepareFullChrome();
  }

  window.addEventListener("beforeinstallprompt",(e)=>{
    e.preventDefault();
    installPrompt=e;
    setUi("Android uygulama kurulumu hazır","KY Güvenlik'i Yükle",false);
  });

  window.addEventListener("appinstalled",()=>{
    installPrompt=null;
    setUi("Kurulum tamamlandı. Ana ekrandaki KY Güvenlik uygulamasını aç.","Kurulum Tamamlandı",true);
  });

  function attach(){
    captureEnrollment();
    if(standalone())return;

    // Android tarayıcıda bağlama ekranı hiçbir koşulda gösterilmez.
    // Önce gerçek PWA kurulumu tamamlanır; bağlama yalnız standalone uygulamada yapılır.
    installOnly();
    const b=qs("#installButton");
    if(b)b.addEventListener("click",(e)=>{e.preventDefault();e.stopImmediatePropagation();void clickInstall();},true);

    if(location.origin!==ORIGIN){location.replace(installUrl().href);return;}
    if(!state().chrome){
      setUi("KY Güvenlik normal Chrome'da kurulacak.","Chrome'da Kuruluma Devam Et",false);
      openChrome();
      return;
    }
    void prepareFullChrome();
  }

  captureEnrollment();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach,{once:true});
  else attach();
})();
