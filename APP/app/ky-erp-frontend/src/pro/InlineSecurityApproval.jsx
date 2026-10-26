import {useCallback,useEffect,useState} from "react";
import {CheckCircle2,ShieldCheck,Smartphone,RefreshCw,LockKeyhole} from "lucide-react";
import {decideTrustedApproval,getSignedSecurityResponse,getTrustedDevice} from "./securityDevice";

// The login request stays mounted while the same registered phone signs its own approval.
// No navigation away from LoginPage, no duplicate password entry, no authorization shortcut.
export default function InlineSecurityApproval({challengeId,matchNumber,onApproved}){
 const [deviceReady,setDeviceReady]=useState(null),[item,setItem]=useState(null);
 const [enteredMatch,setEnteredMatch]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
   try{
     const device=await getTrustedDevice();
     if(!device?.deviceId||!device?.signingPrivateKey){setDeviceReady(false);return}
     setDeviceReady(true);
     const data=await getSignedSecurityResponse("/auth/push/device/pending");
     const match=(data.items||[]).find(row=>row.kind==="SELF_LOGIN"&&String(row.id)===String(challengeId));
     setItem(match||null);
   }catch(error){setStatus(error?.message||"Bağlı telefon kontrol edilemedi.") }
 },[challengeId]);
 useEffect(()=>{
   let active=true;
   (async()=>{if(active)await refresh()})();
   const timer=setInterval(()=>{if(active&&!busy)refresh()},2500);
   return()=>{active=false;clearInterval(timer)};
 },[refresh,busy]);
 const approve=async()=>{
   if(busy||!item)return;
   const match=String(item.matchNumber||matchNumber||"").trim();
   if(/^\d{2}$/.test(match)&&enteredMatch!==match){setStatus("Giriş ekranındaki iki haneli numarayı doğru girin.");return}
   setBusy(true);setStatus("Telefon kilidi / parmak izi doğrulanıyor...");
   try{
     await decideTrustedApproval(item,"APPROVE",/^\d{2}$/.test(match)?enteredMatch:"");
     setStatus("Onay alındı. ERP oturumu aynı ekranda açılıyor...");
     onApproved?.();
   }catch(error){setStatus(error?.message||"Telefon onayı tamamlanamadı.")}
   finally{setBusy(false)}
 };
 if(deviceReady===false)return <div className="ky-inline-approval ky-inline-unavailable" role="status">
   <Smartphone size={23}/><strong>Bu telefonda güvenilir cihaz bağlantısı bulunamadı.</strong>
   <small>Mevcut KY ERP PRO bağlantısını koruyun; Authenticator alternatifiyle giriş yapabilirsiniz.</small>
 </div>;
 return <section className="ky-inline-approval" aria-label="Aynı ekranda telefon giriş onayı">
   <div className="ky-inline-head"><ShieldCheck size={23}/><div><strong>Bu telefonda onayla</strong><small>Uygulamadan çıkmadan giriş yapın</small></div></div>
   <div className="ky-inline-step">
     <CheckCircle2 size={20}/><div><strong>{item?"Giriş isteği bulundu":"Giriş isteği aranıyor"}</strong><small>Güvenilir cihazda kayıtlı istek doğrulanıyor.</small></div>
     <button type="button" onClick={refresh} disabled={busy} aria-label="Giriş isteğini yenile"><RefreshCw size={19}/></button>
   </div>
   {item&&/^\d{2}$/.test(String(item.matchNumber||matchNumber||""))?
     <label className="ky-inline-match">Ekrandaki iki haneli numara
       <input inputMode="numeric" autoComplete="off" maxLength={2} value={enteredMatch} onChange={e=>setEnteredMatch(e.target.value.replace(/\D/g,"").slice(0,2))}
         placeholder="00" aria-label="Giriş eşleştirme numarası"/>
     </label>:null}
   <button type="button" className="ky-inline-approve" onClick={approve} disabled={!item||busy||(/^\d{2}$/.test(String(item?.matchNumber||matchNumber||""))&&enteredMatch.length!==2)}>
     <LockKeyhole size={20}/>{busy?"Güvenli onay alınıyor...":"Parmak İzi / PIN ile Onayla"}
   </button>
   {status?<p role="status" aria-live="polite">{status}</p>:null}
   <small className="ky-inline-hint">Onaydan sonra yeni şifre istemeden aynı KY ERP PRO ekranında devam eder. Güvenlik doğrulaması atlanmaz.</small>
 </section>;
}
