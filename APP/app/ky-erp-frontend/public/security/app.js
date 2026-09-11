const API_BASE="https://api.kyerp.net/api";
const DB_NAME="kyerp-security-app-v1";
const STORE="device";
const KEY="active";

const qs=(selector)=>document.querySelector(selector);
const els={
  connectionBadge:qs("#connectionBadge"),installPanel:qs("#installPanel"),installButton:qs("#installButton"),iosInstallNote:qs("#iosInstallNote"),androidInstallNote:qs("#androidInstallNote"),
  installTitle:qs("#installTitle"),installCopy:qs("#installCopy"),installState:qs("#installState"),installStateText:qs("#installStateText"),
  setupPanel:qs("#setupPanel"),appPanel:qs("#appPanel"),readyPanel:qs("#readyPanel"),pendingPanel:qs("#pendingPanel"),emptyPanel:qs("#emptyPanel"),emptyTitle:qs("#emptyTitle"),emptyCopy:qs("#emptyCopy"),emptyMark:qs("#emptyMark"),
  enrollmentCode:qs("#enrollmentCode"),password:qs("#password"),deviceLabel:qs("#deviceLabel"),connectButton:qs("#connectButton"),
  refreshButton:qs("#refreshButton"),repairButton:qs("#repairButton"),relinkButton:qs("#relinkButton"),cancelRelinkButton:qs("#cancelRelinkButton"),
  readyTitle:qs("#readyTitle"),readyMark:qs("#readyMark"),apiHealth:qs("#apiHealth"),pushHealth:qs("#pushHealth"),keyHealth:qs("#keyHealth"),unlockHealth:qs("#unlockHealth"),lastSync:qs("#lastSync"),
  setupTitle:qs("#setupTitle"),setupCopy:qs("#setupCopy"),deviceSummary:qs("#deviceSummary"),pendingCount:qs("#pendingCount"),pendingList:qs("#pendingList"),tabCount:qs("#tabCount"),
  accountPanel:qs("#accountPanel"),accountFullName:qs("#accountFullName"),accountIdentity:qs("#accountIdentity"),accountRoleBadge:qs("#accountRoleBadge"),accountEmail:qs("#accountEmail"),accountUsername:qs("#accountUsername"),accountScope:qs("#accountScope"),accountDevice:qs("#accountDevice"),accountModules:qs("#accountModules"),accountSecurityCaps:qs("#accountSecurityCaps"),accountNote:qs("#accountNote"),
  loginCodeBox:qs("#loginCodeBox"),loginCodeValue:qs("#loginCodeValue"),loginCodeCountdown:qs("#loginCodeCountdown"),generateCodeButton:qs("#generateCodeButton"),toast:qs("#toast")
};

let installPrompt=null;
let registration=null;
let enrollmentQuery={id:"",token:""};
let busy=false;
let relinkMode=false;
let loginCodeTimer=null;
let lastAutoRepairAt=0;

function isIos(){const ua=String(navigator.userAgent||"");return /iPhone|iPad|iPod/i.test(ua)||(String(navigator.platform||"")==="MacIntel"&&Number(navigator.maxTouchPoints||0)>1)}
function isStandalone(){return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true)}
function defaultDeviceLabel(){const ua=String(navigator.userAgent||"");const width=Math.min(Number(screen?.width||innerWidth||0),Number(screen?.height||innerHeight||0));if(/Android/i.test(ua))return /Mobile/i.test(ua)||width<=600?"Android Telefon · KY Güvenlik":"Android Tablet · KY Güvenlik";if(/iPhone|iPod/i.test(ua))return "iPhone · KY Güvenlik";if(/iPad/i.test(ua)||(String(navigator.platform||"")==="MacIntel"&&Number(navigator.maxTouchPoints||0)>1))return "iPad · KY Güvenlik";return "KY ERP Güvenlik Cihazı"}
function toast(message){els.toast.textContent=message;els.toast.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>els.toast.classList.add("hidden"),3600)}
function setBadge(text,kind=""){els.connectionBadge.textContent=text;els.connectionBadge.className=`security-badge ${kind}`.trim()}
function base64Url(bytes){let binary="";for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function base64UrlToBytes(value){const normalized=String(value||"").replace(/-/g,"+").replace(/_/g,"/");const padded=normalized+"=".repeat((4-normalized.length%4)%4);const raw=atob(padded);return Uint8Array.from(raw,(c)=>c.charCodeAt(0))}
function applicationServerKey(value){return base64UrlToBytes(value)}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function readDevice(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readonly");const req=tx.objectStore(STORE).get(KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
async function writeDevice(value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(value,KEY);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})}
async function clearDevice(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(KEY);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})}
async function jsonFetch(path,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Number(options.timeoutMs||15000));
  let response;
  try{
    response=await fetch(`${API_BASE}${path}`,{
      method:options.method||"GET",
      headers:{Accept:"application/json",...(options.body!==undefined?{"Content-Type":"text/plain;charset=UTF-8"}:{}),...(options.headers||{})},
      body:options.body===undefined?undefined:JSON.stringify(options.body),
      cache:"no-store",
      mode:"cors",
      signal:controller.signal
    });
  }catch(error){
    const wrapped=new Error(error?.name==="AbortError"
      ?"KY ERP Güvenlik sunucusu zamanında yanıt vermedi."
      :navigator.onLine
        ?"KY ERP Güvenlik sunucusuna bağlanılamadı. Bağlantı otomatik olarak tekrar denenecek."
        :"Telefon çevrimdışı. İnternet bağlantısı geldiğinde otomatik tekrar denenecek.");
    wrapped.code=error?.name==="AbortError"?"REQUEST_TIMEOUT":"NETWORK_ERROR";
    wrapped.cause=error;
    throw wrapped;
  }finally{
    clearTimeout(timer);
  }
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.ok===false){
    const error=new Error(payload?.error?.message||`İşlem tamamlanamadı (HTTP ${response.status}).`);
    error.code=payload?.error?.code||"";
    error.status=response.status;
    throw error;
  }
  return payload;
}
async function signDeviceAuth(device,method,path){if(!device?.signingPrivateKey)return{};const timestamp=String(Date.now());const pathname=`/api${path}`;const message=new TextEncoder().encode(`KYERP-DEVICE-AUTH-V1|${device.deviceId}|${String(method||"GET").toUpperCase()}|${pathname}|${timestamp}`);const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},device.signingPrivateKey,message);return{"X-KYERP-Security-Timestamp":timestamp,"X-KYERP-Security-Signature":base64Url(signature)}}
async function deviceFetch(path,options={}){const device=await readDevice();if(!device?.deviceId||!device?.deviceToken)throw new Error("Bu cihaz henüz KY ERP Güvenlik cihazı olarak kayıtlı değil.");const method=String(options.method||"GET").toUpperCase();const signedHeaders=await signDeviceAuth(device,method,path);return jsonFetch(path,{...options,headers:{"X-KYERP-Push-Device":device.deviceId,"X-KYERP-Push-Token":device.deviceToken,...signedHeaders,...(options.headers||{})}})}
async function retireLegacyApprovalWorker(){
  if(!("serviceWorker" in navigator))return;
  try{
    const registrations=await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async(item)=>{
      const worker=item.active||item.waiting||item.installing;
      const script=String(worker?.scriptURL||"");
      if(!script.endsWith("/kyerp-push-sw.js"))return;
      try{const notes=await item.getNotifications();notes.forEach((note)=>note.close())}catch{}
      try{await item.unregister()}catch{}
    }));
  }catch{}
}
async function ensureWorker(){
  if(!("serviceWorker" in navigator))throw new Error("Bu tarayıcı güvenlik bildirimlerini desteklemiyor.");
  await retireLegacyApprovalWorker();
  registration=await navigator.serviceWorker.register("/security/sw.js",{scope:"/security/"});
  try{await registration.update()}catch{}
  await navigator.serviceWorker.ready;
  return registration;
}
async function ensurePushSubscription(forceNew=false){
  const worker=await ensureWorker();
  const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
  if(permission!=="granted")throw new Error("Bildirim izni kapalı. Telefon ayarlarından KY ERP Güvenlik bildirimlerine izin verin.");
  const config=(await jsonFetch("/auth/push/security-config")).data;
  let subscription=await worker.pushManager.getSubscription();
  if(forceNew&&subscription){try{await subscription.unsubscribe()}catch{}subscription=null}
  if(!subscription)subscription=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationServerKey(config.applicationServerKey)});
  return{worker,subscription};
}
function setHealth(el,text,kind=""){if(!el)return;el.textContent=text;el.className=kind}
function setEmptyState(title,copy,mark="✓"){if(els.emptyTitle)els.emptyTitle.textContent=title;if(els.emptyCopy)els.emptyCopy.textContent=copy;if(els.emptyMark)els.emptyMark.textContent=mark}
const ROLE_LABELS={SUPER_ADMIN:"Süper Yönetici",ADMIN:"Süper Yönetici",COMPANY_ADMIN:"Firma Sahibi",MANAGER:"Yönetici",ACCOUNTING:"Muhasebe",MUHASEBE:"Muhasebe",USER:"Kullanıcı",VIEWER:"Kullanıcı"};
const MODULE_LABELS={ALL:"Tüm ERP",DASHBOARD:"Ana Panel",MUHASEBE:"Muhasebe",FIRMA_CARI:"Firma / Cari",BELGE_ISLEM:"Belge İşlem",KDV:"KDV",CEK_ODEME:"Çek / Ödeme",DESEN:"Desen",IMALAT:"İmalat",BOYAHANE:"Boyahane",IK:"İK",GUNLUK_OPERASYON:"Günlük Operasyon",ISNET:"e-Belge / İşNet",MAIL:"Mail",STORAGE_ADMIN:"Dosya / Depolama",ASISTAN:"AI Asistan",ADMIN:"Yönetim",RAPORLAR:"Raporlar"};
const SECURITY_CAP_LABELS={LOGIN_APPROVE:"Giriş Onayı",SESSION_APPROVE:"Oturum Onayı",SESSION_VIEW:"Oturumları Gör",SESSION_CLOSE:"Oturum Kapat",AUDIT_VIEW:"Güvenlik Geçmişi"};
function accountRoleLabel(account){const role=String(account?.role||"").toUpperCase();if(["SUPER_ADMIN","ADMIN"].includes(role))return"Süper Yönetici";if(role==="COMPANY_ADMIN")return"Firma Sahibi";if((account?.moduleKeys||[]).includes("MUHASEBE"))return"Muhasebe";return ROLE_LABELS[role]||role.replaceAll("_"," ")||"Kullanıcı"}
function setChipList(container,values,labelMap,emptyLabel){if(!container)return;container.innerHTML="";const list=Array.isArray(values)?values.filter(Boolean):[];if(!list.length){const chip=document.createElement("span");chip.className="account-chip muted-chip";chip.textContent=emptyLabel;container.appendChild(chip);return}for(const value of list){const chip=document.createElement("span");chip.className="account-chip";chip.textContent=labelMap[value]||String(value).replaceAll("_"," ");container.appendChild(chip)}}
function renderAccount(account,device){if(!els.accountPanel)return;const data=account&&typeof account==="object"?account:null;const label=data?accountRoleLabel(data):"Kontrol";els.accountFullName.textContent=data?.fullName||"Hesap doğrulanıyor";els.accountIdentity.textContent=data?`${label} · ERP rolü: ${String(data.role||"-").replaceAll("_"," ")}`:"Hesap bilgisi güvenli bağlantıdan alınacak.";els.accountRoleBadge.textContent=label;els.accountRoleBadge.classList.toggle("owner",String(data?.role||"").toUpperCase()==="SUPER_ADMIN");els.accountEmail.textContent=data?.email||"Tanımlı değil";els.accountUsername.textContent=data?.username||"-";els.accountScope.textContent=data?.scopeType==="SYSTEM"?"Tüm Sistem":(data?.companyName||data?.companySlug||"Kendi hesabı");els.accountDevice.textContent=device?.deviceLabel||"KY Güvenlik cihazı";setChipList(els.accountModules,data?.moduleKeys||[],MODULE_LABELS,data?.scopeType==="SYSTEM"?"Tüm ERP":"Standart erişim");setChipList(els.accountSecurityCaps,data?.securityCapabilities||[],SECURITY_CAP_LABELS,"Kendi giriş güvenliği");els.accountNote.textContent=data?.username?`Bu cihaz yalnız ${data.username} hesabına bağlıdır. Onaylar bu hesabın yetkileriyle verilir.`:"Onaylar yalnız doğrulanmış bağlı hesabın yetkileriyle verilir."}
function showRelink(){relinkMode=true;els.setupPanel.classList.remove("hidden");els.setupTitle.textContent="Erişimi yeniden bağla";els.setupCopy.textContent="Ana KY ERP → Profil → Telefon Onayı → Erişim Yenileme Kodu Oluştur. Kodu ve mevcut KY ERP şifreni gir.";els.cancelRelinkButton.classList.remove("hidden")}
function hideRelink(){relinkMode=false;els.setupPanel.classList.add("hidden");els.cancelRelinkButton.classList.add("hidden")}
async function createSigningKey(){const generated=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);const publicJwk=await crypto.subtle.exportKey("jwk",generated.publicKey);const privateJwk=await crypto.subtle.exportKey("jwk",generated.privateKey);const privateKey=await crypto.subtle.importKey("jwk",privateJwk,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);return{publicJwk,privateKey}}
async function createLocalUnlock(){if(!window.PublicKeyCredential||!navigator.credentials?.create)return"";const available=await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();if(!available)return"";const rawUserId=crypto.getRandomValues(new Uint8Array(32));const credential=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:"KY ERP Güvenlik",id:location.hostname},user:{id:rawUserId,name:"kyerp-security-device",displayName:"KY ERP Güvenlik Cihazı"},pubKeyCredParams:[{type:"public-key",alg:-7}],timeout:60000,authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"preferred",userVerification:"required"},attestation:"none"}});return credential?.rawId?base64Url(credential.rawId):""}
async function confirmLocalUnlock(device){if(!device?.localUnlockCredentialId)return true;if(!navigator.credentials?.get)throw new Error("Cihaz kilidi doğrulaması kullanılamıyor.");const result=await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:location.hostname,allowCredentials:[{type:"public-key",id:base64UrlToBytes(device.localUnlockCredentialId)}],userVerification:"required",timeout:60000}});if(!result)throw new Error("Cihaz kilidi doğrulanamadı.");return true}
async function signDecision(device,kind,id,decision){if(!device?.signingPrivateKey)throw new Error("Güvenlik cihazı imza anahtarı bulunamadı. Cihazı yeniden kurun.");const message=new TextEncoder().encode(`KYERP-DECISION-V1|${device.deviceId}|${kind}|${id}|${decision}`);const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},device.signingPrivateKey,message);return base64Url(signature)}
function cleanEnrollmentQuery(){try{const url=new URL(location.href);url.searchParams.delete("enrollmentId");url.searchParams.delete("enrollmentToken");history.replaceState({},"",url.pathname+url.search+url.hash)}catch{}}
function requestedInstall(){
  try{
    const params=new URL(location.href).searchParams;
    return {requested:params.get("install")==="1",platform:String(params.get("platform")||"").toLowerCase()};
  }catch{return{requested:false,platform:""}}
}
function renderInstall(){
  const request=requestedInstall();
  const ios=isIos()||request.platform==="ios";
  const android=/Android/i.test(String(navigator.userAgent||""))||request.platform==="android";
  const standalone=isStandalone();

  els.androidInstallNote.classList.add("hidden");
  els.iosInstallNote.classList.add("hidden");
  els.installButton.classList.add("hidden");
  els.installButton.disabled=false;

  if(standalone){
    if(request.requested){
      els.installPanel.classList.remove("hidden");
      els.installTitle.textContent="KY ERP Güvenlik zaten yüklü";
      els.installCopy.textContent="Bu cihaz uygulama modunda çalışıyor. Kurulumu tekrar yapmana gerek yok.";
      els.installStateText.textContent="Yüklü · Uygulama modu aktif";
      els.installState.classList.add("installed");
    }else{
      els.installPanel.classList.add("hidden");
    }
    return;
  }

  if(ios){
    els.installPanel.classList.remove("hidden");
    els.installTitle.textContent="iPhone / iPad'e KY Güvenlik'i Kur";
    els.installCopy.textContent="iOS kurulumunu Safari'nin Ana Ekrana Ekle sistemi tamamlar.";
    els.installStateText.textContent="iOS kurulumu için Safari adımı gerekli";
    els.iosInstallNote.classList.remove("hidden");
    return;
  }

  if(android||request.requested||installPrompt){
    els.installPanel.classList.remove("hidden");
    els.installTitle.textContent="Android'e KY Güvenlik'i İndir / Kur";
    els.installCopy.textContent="Aşağıdaki düğme desteklenen Android tarayıcısında sistem uygulama kurulum penceresini açar.";
    els.androidInstallNote.classList.remove("hidden");
    if(installPrompt){
      els.installStateText.textContent="Kuruluma hazır";
      els.installButton.textContent="Android'e KY Güvenlik'i Yükle";
      els.installButton.classList.remove("hidden");
    }else{
      els.installStateText.textContent="Kurulum desteği hazırlanıyor veya bu tarayıcı yüklemeyi desteklemiyor";
      els.installButton.textContent="Android Yükleme Hazırlanıyor";
      els.installButton.classList.remove("hidden");
      els.installButton.disabled=true;
    }
    return;
  }

  els.installPanel.classList.add("hidden");
}
function showTab(name){
  document.querySelectorAll(".security-tabs button").forEach((button)=>button.classList.toggle("active",button.dataset.tab===name));
  ["approvals","code","device"].forEach((tab)=>document.querySelector("#"+tab+"Tab")?.classList.toggle("hidden",tab!==name));
}
async function connectDevice(){
  if(busy)return;
  const previousDevice=await readDevice().catch(()=>null);
  const code=String(els.enrollmentCode.value||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const password=String(els.password.value||"");
  if(!password)return toast("Mevcut KY ERP şifreni gir.");
  if(!code&&!enrollmentQuery.id)return toast("Kurulum / erişim yenileme kodunu gir.");
  if(isIos()&&!isStandalone())return toast("iPhone/iPad’de önce Ana Ekrana Ekle, sonra KY ERP Güvenlik ikonundan aç.");
  busy=true;els.connectButton.disabled=true;els.connectButton.textContent="Güvenlik bağlantısı kuruluyor...";
  try{
    const bundle=await ensurePushSubscription(false);
    const worker=bundle.worker,subscription=bundle.subscription;
    const keys=await createSigningKey();
    let localUnlockCredentialId="";try{localUnlockCredentialId=await createLocalUnlock()}catch{}
    await writeDevice({pendingEnrollment:true,signingPrivateKey:keys.privateKey,localUnlockCredentialId,savedAt:new Date().toISOString()});
    let response;
    try{
      response=await jsonFetch("/auth/push/security-enrollment/complete",{method:"POST",body:{
        enrollmentId:enrollmentQuery.id,enrollmentToken:enrollmentQuery.token,enrollmentCode:code,password,
        replaceDeviceId:previousDevice?.deviceId||"",
        deviceLabel:String(els.deviceLabel.value||previousDevice?.deviceLabel||defaultDeviceLabel()).trim(),
        subscription:subscription.toJSON(),decisionPublicKeyJwk:keys.publicJwk
      }});
    }catch(error){
      await clearDevice().catch(()=>{});
      if(previousDevice)await writeDevice(previousDevice).catch(()=>{});
      throw error;
    }
    const data=response.data;
    const record={deviceId:data.deviceId,deviceToken:data.deviceToken,deviceLabel:data.deviceLabel,signingPrivateKey:keys.privateKey,localUnlockCredentialId,securityAppVersion:data.securityAppVersion||"security-v2.1",savedAt:new Date().toISOString()};
    await writeDevice(record);
    cleanEnrollmentQuery();enrollmentQuery={id:"",token:""};els.password.value="";els.enrollmentCode.value="";relinkMode=false;
    toast(localUnlockCredentialId?"Erişim hazır. Face ID / parmak izi / PIN ile güvenli onay aktif.":"Erişim hazır. Güvenli cihaz imzası aktif.");
    worker.active?.postMessage({type:"KYERP_SECURITY_REFRESH"});
    await refreshState();
  }catch(error){
    toast(error?.message||"Güvenlik uygulaması bağlanamadı.");setBadge("Kurulum hatası","bad");
  }finally{busy=false;els.connectButton.disabled=false;els.connectButton.textContent="Bildirim + Cihaz Güvenliğini Kur / Yenile"}
}
function approvalCard(item){const article=document.createElement("article");article.className="approval-item";const when=item.requestedAt?new Date(item.requestedAt).toLocaleString("tr-TR"):"";article.innerHTML=`<div><h3>${escapeHtml(item.title||"KY ERP giriş isteği")}</h3><p>${escapeHtml(item.body||"Yeni giriş isteği.")}</p><small>${escapeHtml(when)}</small></div><div class="approval-actions"><button class="approve" type="button">Onayla</button><button class="deny" type="button">Reddet</button></div>`;article.querySelector(".approve").addEventListener("click",()=>decide(item,"APPROVE"));article.querySelector(".deny").addEventListener("click",()=>decide(item,"DENY"));return article}
function escapeHtml(value){return String(value||"").replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]))}
async function decide(item,decision){if(busy)return;busy=true;try{const device=await readDevice();if(decision==="APPROVE"){toast("Telefon kilidi doğrulanıyor...");await confirmLocalUnlock(device)}const signature=await signDecision(device,item.kind,item.id,decision);await deviceFetch("/auth/push/device/decision",{method:"POST",body:{kind:item.kind,id:item.id,decision,signature}});toast(decision==="APPROVE"?"Giriş onaylandı. Bilgisayarda KY ERP açılıyor.":"Giriş isteği reddedildi.");await refreshPending()}catch(error){toast(error?.message||"Karar gönderilemedi.")}finally{busy=false}}
async function refreshPending(){
  const payload=await deviceFetch("/auth/push/device/pending");
  const items=Array.isArray(payload?.data?.items)?payload.data.items:[];
  els.pendingList.innerHTML="";els.pendingCount.textContent=String(items.length);if(els.tabCount)els.tabCount.textContent=String(items.length);
  if(items.length){
    els.pendingPanel.classList.remove("hidden");els.emptyPanel.classList.add("hidden");
    for(const item of items)els.pendingList.appendChild(approvalCard(item));
    if("setAppBadge" in navigator)navigator.setAppBadge(items.length).catch(()=>{});
  }else{
    els.pendingPanel.classList.add("hidden");els.emptyPanel.classList.remove("hidden");
    setEmptyState("Bekleyen giriş yok","Bağlantı hazır. Yeni KY ERP giriş isteği geldiğinde burada görünür ve tek bildirim alırsın.","✓");
    if("clearAppBadge" in navigator)navigator.clearAppBadge().catch(()=>{});
  }
  registration?.active?.postMessage({type:"KYERP_SECURITY_CLEAR_NOTIFICATION"});
  return items;
}
function startLoginCodeCountdown(expiresAt){
  clearInterval(loginCodeTimer);
  const tick=()=>{
    const seconds=Math.max(0,Math.ceil((Date.parse(expiresAt)-Date.now())/1000));
    els.loginCodeCountdown.textContent=seconds ? seconds+" sn geçerli" : "Süresi doldu";
    els.loginCodeBox.classList.toggle("expired",!seconds);
    if(!seconds) clearInterval(loginCodeTimer);
  };
  tick();
  loginCodeTimer=setInterval(tick,1000);
}
async function generateLoginCode(){
  if(busy)return;
  busy=true;els.generateCodeButton.disabled=true;
  try{
    const device=await readDevice();
    await confirmLocalUnlock(device);
    const response=await deviceFetch("/auth/push/device/login-code",{method:"POST",body:{}});
    const data=response?.data||{};
    els.loginCodeValue.textContent=String(data.code||"").replace(/(\d{3})(\d{3})/,"$1 $2");
    els.loginCodeBox.className="login-code-box active";
    startLoginCodeCountdown(data.expiresAt);
    toast("60 saniyelik KY Güvenlik giriş kodu üretildi.");
  }catch(error){
    els.loginCodeValue.textContent="— — — — — —";
    els.loginCodeCountdown.textContent="Kod üretilemedi";
    toast(error?.message||"Giriş kodu üretilemedi.");
  }finally{busy=false;els.generateCodeButton.disabled=false}
}
async function repairConnection(options={}){
  const automatic=Boolean(options?.automatic);
  if(busy)return false;
  const device=await readDevice().catch(()=>null);
  if(!device?.deviceId||!device?.signingPrivateKey){
    showRelink();
    if(!automatic)toast("Cihaz erişim kaydı eksik. Erişim Yenileme Kodu ile yeniden bağlayın.");
    return false;
  }
  busy=true;
  if(els.repairButton){els.repairButton.disabled=true;els.repairButton.textContent=automatic?"Otomatik onarılıyor...":"Bağlantı yenileniyor...";}
  try{
    const bundle=await ensurePushSubscription(true);
    const response=await deviceFetch("/auth/push/device/refresh",{method:"POST",body:{deviceLabel:device.deviceLabel||defaultDeviceLabel(),subscription:bundle.subscription.toJSON()}});
    const data=response?.data||{};
    await writeDevice({...device,deviceId:data.deviceId||device.deviceId,deviceToken:data.deviceToken||device.deviceToken,deviceLabel:data.deviceLabel||device.deviceLabel,securityAppVersion:data.securityAppVersion||device.securityAppVersion||"security-v2.1",refreshedAt:data.refreshedAt||new Date().toISOString()});
    bundle.worker.active?.postMessage({type:"KYERP_SECURITY_CLEAR_NOTIFICATION"});
    if(!automatic)toast("Bağlantı yenilendi. Bildirim ve giriş onayı yeniden hazır.");
    return true;
  }catch(error){
    setBadge("Yenileme gerekli","bad");
    if(els.readyTitle)els.readyTitle.textContent="Bağlantı yenileme gerekli";
    if(["PUSH_DEVICE_RECOVERY_UNAUTHORIZED","PUSH_DEVICE_UNAUTHORIZED"].includes(String(error?.code||"")))showRelink();
    if(!automatic)toast(error?.message||"Bağlantı yenilenemedi.");
    return false;
  }finally{
    busy=false;
    if(els.repairButton){els.repairButton.disabled=false;els.repairButton.textContent="Bağlantıyı Yenile";}
  }
}

async function refreshState(options={}){
  const device=await readDevice().catch(()=>null);
  if(!device?.deviceId||!device?.deviceToken||!device?.signingPrivateKey){
    els.setupPanel.classList.remove("hidden");els.appPanel.classList.add("hidden");els.pendingPanel.classList.add("hidden");els.emptyPanel.classList.add("hidden");setBadge("Kurulum gerekli");return;
  }
  els.appPanel.classList.remove("hidden");els.readyPanel.classList.remove("hidden");if(!relinkMode)els.setupPanel.classList.add("hidden");
  renderAccount(null,device);
  els.deviceSummary.textContent=(device.deviceLabel||"KY ERP Güvenlik cihazı")+" · Güvenli cihaz imzası aktif"+(device.localUnlockCredentialId?" · Cihaz kilidi aktif":"");
  setHealth(els.keyHealth,"Hazır","ok");setHealth(els.unlockHealth,device.localUnlockCredentialId?"Aktif":"Opsiyonel",device.localUnlockCredentialId?"ok":"");
  els.readyTitle.textContent="Bağlantı doğrulanıyor";els.readyMark.textContent="↻";setBadge("Kontrol","");
  try{
    await ensureWorker();
    const health=(await deviceFetch("/auth/push/device/health"))?.data||{};
    renderAccount(health.account,health.device||device);
    els.readyTitle.textContent="Telefon onayı hazır";els.readyMark.textContent="✓";setBadge("Bağlı","ok");
    setHealth(els.apiHealth,"Bağlı","ok");
    setHealth(els.pushHealth,health?.device?.lastError?"Otomatik yenilenecek":"Hazır",health?.device?.lastError?"warn":"ok");
    els.lastSync.textContent="Son kontrol: "+new Date(health.checkedAt||Date.now()).toLocaleString("tr-TR");
    await refreshPending();
  }catch(error){
    const code=String(error?.code||"");
    const canAutoRepair=!options?.skipAutoRepair&&["PUSH_DEVICE_UNAUTHORIZED","DEVICE_NOT_READY"].includes(code)&&Date.now()-lastAutoRepairAt>120000;
    if(canAutoRepair){
      lastAutoRepairAt=Date.now();
      const repaired=await repairConnection({automatic:true});
      if(repaired)return refreshState({skipAutoRepair:true});
    }

    const offline=!navigator.onLine;
    els.readyTitle.textContent=offline?"Telefon çevrimdışı":"Bağlantı kontrolü gerekli";
    els.readyMark.textContent="!";
    setBadge(offline?"Çevrimdışı":"Yenile","bad");
    setHealth(els.apiHealth,offline?"Çevrimdışı":"Bağlantı yok","bad");
    setHealth(els.pushHealth,Notification.permission==="granted"?"Kontrol gerekli":"İzin kapalı","warn");
    els.lastSync.textContent="Son kontrol başarısız: "+new Date().toLocaleString("tr-TR");
    els.pendingPanel.classList.add("hidden");
    els.emptyPanel.classList.remove("hidden");
    setEmptyState(
      offline?"İnternet bağlantısı bekleniyor":"KY ERP Güvenlik bağlantısı yenileniyor",
      offline
        ?"İnternet geldiğinde uygulama otomatik olarak tekrar bağlanacak."
        :(error?.message||"Güvenli telefon bağlantısı doğrulanamadı. Cihaz sekmesinden Bağlantıyı Yenile kullanılabilir."),
      "!"
    );
    if(["PUSH_DEVICE_RECOVERY_UNAUTHORIZED"].includes(code))showRelink();
    if(code!=="NETWORK_ERROR"&&code!=="REQUEST_TIMEOUT")toast(error?.message||"Telefon bağlantısı doğrulanamadı.");
  }
}
window.addEventListener("beforeinstallprompt",(event)=>{event.preventDefault();installPrompt=event;renderInstall()});
window.addEventListener("appinstalled",()=>{
  installPrompt=null;
  els.installPanel.classList.remove("hidden");
  els.installTitle.textContent="KY ERP Güvenlik yüklendi";
  els.installCopy.textContent="Kurulum tamamlandı. Ana ekrandaki KY Güvenlik ikonundan açabilirsin.";
  els.installStateText.textContent="Yüklendi · Hazır";
  els.installState.classList.add("installed");
  els.installButton.classList.add("hidden");
  els.androidInstallNote.classList.add("hidden");
  toast("KY ERP Güvenlik uygulaması yüklendi.");
});
els.installButton.addEventListener("click",async()=>{
  if(!installPrompt){
    renderInstall();
    return;
  }
  const prompt=installPrompt;
  installPrompt=null;
  await prompt.prompt();
  const choice=await prompt.userChoice.catch(()=>null);
  if(choice?.outcome==="accepted"){
    els.installStateText.textContent="Kurulum onaylandı; Android tamamlıyor.";
  }else{
    els.installStateText.textContent="Kurulum iptal edildi. İstersen tekrar deneyebilirsin.";
  }
  renderInstall();
});
els.connectButton.addEventListener("click",connectDevice);
els.generateCodeButton.addEventListener("click",generateLoginCode);
document.querySelectorAll(".security-tabs button").forEach((button)=>button.addEventListener("click",()=>showTab(button.dataset.tab)));
els.refreshButton.addEventListener("click",refreshState);
els.repairButton.addEventListener("click",repairConnection);
els.relinkButton.addEventListener("click",showRelink);
els.cancelRelinkButton.addEventListener("click",()=>{hideRelink();refreshState()});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refreshState()});
window.addEventListener("focus",refreshState);
window.addEventListener("online",()=>{toast("İnternet bağlantısı geri geldi. Bağlantı kontrol ediliyor.");refreshState()});
window.addEventListener("offline",()=>{setBadge("Çevrimdışı","bad");if(els.readyTitle)els.readyTitle.textContent="Telefon çevrimdışı"});
navigator.serviceWorker?.addEventListener?.("message",(event)=>{if(["KYERP_SECURITY_PUSH_WAKE","KYERP_SECURITY_PENDING_WAKE","KYERP_SECURITY_CONNECTION_WAKE"].includes(event.data?.type))refreshState()});
(async function boot(){
  document.title="KY ERP Güvenlik";els.deviceLabel.value=defaultDeviceLabel();
  const url=new URL(location.href);enrollmentQuery={id:String(url.searchParams.get("enrollmentId")||""),token:String(url.searchParams.get("enrollmentToken")||"")};
  if(enrollmentQuery.id&&enrollmentQuery.token){showRelink();toast("Erişim bağlantısı alındı. Mevcut KY ERP şifreni gir.")}
  renderInstall();showTab("approvals");try{await ensureWorker()}catch{}renderInstall();await refreshState();
  setInterval(()=>{if(document.visibilityState==="visible"&&navigator.onLine)refreshState()},15000);
})();
