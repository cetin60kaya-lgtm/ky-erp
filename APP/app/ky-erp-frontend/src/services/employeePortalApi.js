// KY ERP personel oz servis: firma-personel-cihaz anahtari IndexedDB'de tutulur.
// Ozel anahtar disariya aktarilmaz; personel portal istegi sunucuda imza ve nonce ile dogrulanir.
import { API_BASE } from "../utils/api";

const API = String(API_BASE).replace(/\/+$/, "");
function token() { return localStorage.getItem("kyerp_auth_token") || ""; }
function bytes64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function keyOf(account) { return String(account.companySlug)+":"+String(account.userId); }
function openKeyDb() {
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open("kyerp-personnel-trusted-devices",1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("keys"))req.result.createObjectStore("keys");};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function storeKey(id, value) {
  const db=await openKeyDb();
  try {
    await new Promise((resolve,reject)=>{
      const tx=db.transaction("keys","readwrite");
      tx.objectStore("keys").put(value,id);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }finally{db.close();}
}
export async function trustedPersonnelDevice(account) {
  const db=await openKeyDb();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction("keys","readonly");
      const req=tx.objectStore("keys").get(keyOf(account));
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });
  }finally{db.close();}
}
async function sha256Hex(value) {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
}
export async function personnelRequest(path,{method="GET",body,device}={}) {
  const clean=path.replace(/^\/+/, "");
  const url=API+"/"+clean,pathname="/api/"+clean;
  const raw=body===undefined?"":JSON.stringify(body);
  const headers={"Authorization":"Bearer "+token(),"Content-Type":"application/json"};
  if(device) {
    const timestamp=String(Date.now()),nonce=bytes64url(crypto.getRandomValues(new Uint8Array(24)));
    const bodyHash=await sha256Hex(raw);
    const user=JSON.parse(localStorage.getItem("kyerp_auth_user")||"{}");
    const signed=["KYERP-EMP-DEVICE-V1",device.deviceId,method.toUpperCase(),pathname,timestamp,nonce,user.id,bodyHash].join("|");
    const signature=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},device.privateKey,new TextEncoder().encode(signed)));
    Object.assign(headers,{"X-KYERP-Employee-Device":device.deviceId,"X-KYERP-Employee-Timestamp":timestamp,"X-KYERP-Employee-Nonce":nonce,"X-KYERP-Employee-Signature":bytes64url(signature)});
  }
  const response=await fetch(url,{method,headers,cache:"no-store",...(body!==undefined?{body:raw}:{})});
  const payload=await response.json().catch(()=>({ok:false,error:{message:"Yanıt okunamadi."}}));
  if(!response.ok||payload.ok===false)throw new Error(payload?.error?.message||"Islem basarisiz.");
  return payload.data;
}
export async function registerPersonnelDevice(account,kind,label) {
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const publicKeyJwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
  const registered=await personnelRequest("employee-portal/devices/register",{method:"POST",body:{kind,label,publicKeyJwk}});
  await storeKey(keyOf(account),{deviceId:registered.id,privateKey:pair.privateKey,kind,label});
  return registered;
}
export async function managerPersonnelRequest(path,{method="GET",body,companySlug=""}={}) {
  const q=method==="GET"?"?companySlug="+encodeURIComponent(companySlug):"";
  return personnelRequest("employee-portal/admin/"+path+q,{method,body:body===undefined&&method!=="GET"?{companySlug}:body});
}
