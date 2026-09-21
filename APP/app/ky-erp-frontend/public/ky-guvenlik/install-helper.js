(()=>{
  const ua=String(navigator.userAgent||"");
  if(!/Android/i.test(ua))return;

  const ORIGIN="https://security.kyerp.net";
  const PATH="/ky-guvenlik/";
  const RELOAD_KEY="kyerp-security-install-once-v8";
  let installPrompt=null;
  const qs=(s)=>document.querySelector(s);
  const standalone=()=>Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true);
  const state=()=>{try{const p=new URL(location.href).searchParams;return{chrome:p.get("chrome")==="1"}}catch{return{chrome:false}}};

  function installUrl(){
    const u=new URL(location.href);
    u.protocol="https:";u.host="security.kyerp.net";u.pathname=PATH;
    u.searchParams.set("install","1");
    u.searchParams.set("platform","android");
    u.searchParams.set("chrome","1");
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
      const r=await navigator.serviceWorker.register("/ky-guvenlik/sw.js",{scope:"/ky-guvenlik/",updateViaCache:"none"});
      try{await r.update()}catch{}
      return r;
    }catch{return null}
  }

  async function prepareFullChrome(){
    setUi("Android uygulama kurulumu hazırlanıyor…","Kurulumu Hazırla",false);
    const r=await ensureWorker();
    if(installPrompt)return;
    if(!r){setUi("Chrome güvenlik servisini hazırlayamadı.","Tekrar Dene",false);return;}
    if(!navigator.serviceWorker.controller&&sessionStorage.getItem(RELOAD_KEY)!=="1"){
      sessionStorage.setItem(RELOAD_KEY,"1");
      location.reload();
      return;
    }
    setUi("Chrome'un gerçek Yükle penceresi bekleniyor.","Kurulumu Kontrol Et",false);
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
    sessionStorage.removeItem(RELOAD_KEY);
    setUi("Android uygulama kurulumu hazır","KY Güvenlik'i Yükle",false);
  });

  window.addEventListener("appinstalled",()=>{
    installPrompt=null;
    sessionStorage.removeItem(RELOAD_KEY);
    setUi("Kurulum tamamlandı. KY Güvenlik'i ana ekrandan aç.","Kurulum Tamamlandı",true);
  });

  function attach(){
    if(standalone())return;
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

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach,{once:true});
  else attach();
})();
