// KY ERP PRO: one origin, one trusted-device record, one signed-approval client.
// This module never stores an ERP password or creates a session from device possession.
const API="https://api.kyerp.net/api";
const DATABASE="kyerp-security-fresh-v3";
const PROTOCOL="security-v4.0";
const toB64Url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const fromB64Url=value=>{const raw=String(value||"").replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(raw+"=".repeat((4-raw.length%4)%4)),x=>x.charCodeAt(0))};

export async function getTrustedDevice(){
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("device"))request.result.createObjectStore("device")};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction("device","readonly");
    const request=tx.objectStore("device").get("active");
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>reject(request.error);
  })}finally{db.close()}
}
async function saveTrustedDevice(record){
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction("device","readwrite");
    tx.objectStore("device").put(record,"active");
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  })}finally{db.close()}
}
export async function getSignedSecurityResponse(path,{method="GET",body}={}){
  if(!/^\/auth\/push\/device\/[a-z0-9/%-]+(?:\?[a-z0-9&=%._-]+)?$/.test(path))throw new Error("Güvenlik API yolu geçersiz.");
  const device=await getTrustedDevice();
  if(!device?.deviceId||!device?.deviceToken||!device?.signingPrivateKey)throw new Error("Bu telefonda güvenilir KY Güvenlik cihaz kaydı bulunamadı.");
  const verb=method.toUpperCase(),now=String(Date.now());
  const signature=toB64Url(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},device.signingPrivateKey,
    new TextEncoder().encode(`KYERP-DEVICE-AUTH-V1|${device.deviceId}|${verb}|/api${path}|${now}`)));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),16000);
  try{
    const response=await fetch(API+path,{method:verb,mode:"cors",cache:"no-store",signal:controller.signal,
      headers:{Accept:"application/json",...(body===undefined?{}:{"Content-Type":"text/plain;charset=UTF-8"}),
        "X-KYERP-Push-Device":device.deviceId,"X-KYERP-Push-Token":device.deviceToken,
        "X-KYERP-Security-App-Version":PROTOCOL,"X-KYERP-Security-Timestamp":now,"X-KYERP-Security-Signature":signature},
      body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json().catch(()=>null);
    if(!response.ok||result?.ok===false)throw new Error(result?.error?.message||"Güvenlik sunucusu yanıt vermedi.");
    return result?.data||{};
  }finally{clearTimeout(timer)}
}
export async function unlockTrustedDevice(){
  let device=await getTrustedDevice();
  if(!device?.signingPrivateKey)throw new Error("Güvenilir telefon bağlantısı eksik.");
  if(!navigator.credentials?.get)throw new Error("Telefonunuzun parmak izi / PIN sistemi desteklenmiyor.");
  if(!device.localUnlockCredentialId){
    const supported=await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.();
    if(!supported||!navigator.credentials?.create)throw new Error("Önce cihazda ekran kilidi ve parmak izi / PIN özelliğini açın.");
    const credential=await navigator.credentials.create({publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:"KY ERP PRO",id:location.hostname},
      user:{id:crypto.getRandomValues(new Uint8Array(32)),name:"kyerp-security-device",displayName:"KY ERP PRO Güvenilir Cihaz"},
      pubKeyCredParams:[{type:"public-key",alg:-7}],timeout:60000,
      authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"preferred",userVerification:"required"},attestation:"none"}});
    if(!credential?.rawId)throw new Error("Telefon kilidi kaydedilemedi.");
    const fresh=await getTrustedDevice();
    if(fresh?.deviceId!==device.deviceId)throw new Error("Cihaz kaydı değişti. Yeniden deneyin.");
    device={...fresh,localUnlockCredentialId:toB64Url(credential.rawId),localUnlockEnabledAt:new Date().toISOString()};
    await saveTrustedDevice(device);
  }
  const assertion=await navigator.credentials.get({publicKey:{
    challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:location.hostname,
    allowCredentials:[{type:"public-key",id:fromB64Url(device.localUnlockCredentialId)}],
    userVerification:"required",timeout:60000}});
  if(!assertion)throw new Error("Telefon kilidi doğrulanamadı.");
  return device;
}
export async function decideTrustedApproval(item,decision,matchNumber=""){
  const choice=String(decision||"").toUpperCase();
  if(!["APPROVE","DENY"].includes(choice))throw new Error("Geçersiz onay kararı.");
  const kind=String(item?.kind||""),id=String(item?.id||"");
  if(!kind||!id)throw new Error("Onay isteği eksik.");
  const device=choice==="APPROVE"?await unlockTrustedDevice():await getTrustedDevice();
  if(!device?.signingPrivateKey)throw new Error("Güvenilir cihaz imza anahtarı yok.");
  const match=String(matchNumber||"").trim();
  if(kind==="SELF_LOGIN"&&choice==="APPROVE"&&/^\d{2}$/.test(String(item.matchNumber||""))&&match!==String(item.matchNumber))
    throw new Error("Eşleştirme numarası farklı. İsteği onaylamadım.");
  const version=kind==="SELF_LOGIN"&&choice==="APPROVE"&&match?"KYERP-DECISION-V2":"KYERP-DECISION-V1";
  const payload=match?`${version}|${device.deviceId}|${kind}|${id}|${choice}|${match}`:
    `${version}|${device.deviceId}|${kind}|${id}|${choice}`;
  const signature=toB64Url(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},
    device.signingPrivateKey,new TextEncoder().encode(payload)));
  return getSignedSecurityResponse("/auth/push/device/decision",{method:"POST",body:{kind,id,decision:choice,matchNumber:match,signature}});
}

export async function closeTrustedSession(session){
  if(!session?.id||session.canClose!==true)throw new Error("Bu oturum için kapatma yetkiniz yok.");
  const device=await unlockTrustedDevice();
  const timestamp=Date.now();
  const message=new TextEncoder().encode(`KYERP-MOBILE-CONTROL-V1|${device.deviceId}|SESSION_CLOSE|${session.id}|${timestamp}`);
  const signature=toB64Url(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},device.signingPrivateKey,message));
  return getSignedSecurityResponse("/auth/push/device/control-center/session/close",
    {method:"POST",body:{sessionId:session.id,timestamp,signature}});
}
