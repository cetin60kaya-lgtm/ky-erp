(()=>{
  const MARK="kyerp-android-notification-preflight-v1";
  let replaying=false;
  let busy=false;

  function isAndroid(){return /Android/i.test(String(navigator.userAgent||""))}
  function isStandalone(){return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true)}
  function toast(message){
    try{
      const runtime=window.KYSecurityRuntime;
      if(runtime?.toast){runtime.toast(message);return}
      const el=document.querySelector("#toast");
      if(!el)return;
      el.textContent=message;
      el.classList.remove("hidden");
      clearTimeout(toast.timer);
      toast.timer=setTimeout(()=>el.classList.add("hidden"),5200);
    }catch{}
  }

  async function requestAndReplay(button){
    if(busy)return;
    busy=true;
    const previousText=button.textContent;
    button.disabled=true;
    button.textContent="Bildirim izni kontrol ediliyor...";
    try{
      const permission=await Notification.requestPermission();
      if(permission!=="granted"){
        toast(permission==="denied"
          ?"KY Güvenlik site bildirim izni kapalı görünüyor. Android bildirim anahtarı açık olsa bile Chrome/KY Güvenlik site iznini de İzin ver yapın."
          :"Bildirim izni henüz verilmedi. Bağlantıyı tamamlamak için bildirim iznine izin verin.");
        return;
      }
      toast("Bildirim izni hazır. KY Güvenlik bağlantısı tamamlanıyor...");
      replaying=true;
      button.disabled=false;
      button.textContent=previousText;
      button.click();
    }catch(error){
      toast(error?.message||"Bildirim izni kontrol edilemedi.");
    }finally{
      busy=false;
      if(button.disabled)button.disabled=false;
      if(button.textContent==="Bildirim izni kontrol ediliyor...")button.textContent=previousText;
    }
  }

  function preflight(event){
    const button=event.target?.closest?.("#connectButton,#repairButton");
    if(!button||!isAndroid()||!isStandalone())return;
    if(replaying){replaying=false;return}
    if(!("Notification" in window)||!("serviceWorker" in navigator)){
      event.preventDefault();
      event.stopImmediatePropagation();
      toast("Bu Android tarayıcısı KY Güvenlik bildirimlerini desteklemiyor.");
      return;
    }
    if(Notification.permission==="granted")return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(Notification.permission==="denied"){
      toast("Android bildirimleri açık olsa bile KY Güvenlik site izni kapalı görünüyor. Ayarlar'da KY Güvenlik/Chrome site bildirim iznini İzin ver yapın.");
      return;
    }
    void requestAndReplay(button);
  }

  async function repairMissingSubscription(){
    if(!isAndroid()||!isStandalone()||Notification.permission!=="granted")return;
    try{
      const runtime=window.KYSecurityRuntime;
      if(!runtime?.readDevice)return;
      const device=await runtime.readDevice();
      if(!device?.deviceId)return;
      const reg=await navigator.serviceWorker?.ready;
      const subscription=await reg?.pushManager?.getSubscription?.();
      if(subscription)return;
      const button=document.querySelector("#repairButton");
      if(button&&!button.disabled)button.click();
    }catch{}
  }

  document.documentElement.dataset.kyerpAndroidNotificationPreflight=MARK;
  document.addEventListener("click",preflight,true);
  window.addEventListener("kysecurity:runtime-ready",()=>setTimeout(repairMissingSubscription,500));
  window.addEventListener("focus",()=>setTimeout(repairMissingSubscription,700));
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")setTimeout(repairMissingSubscription,700)});
})();
