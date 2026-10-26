import {useCallback,useEffect,useState} from "react";
import {ShieldCheck,RefreshCw,LockKeyhole,KeyRound,MonitorSmartphone,Activity,History} from "lucide-react";
import {decideTrustedApproval,getSignedSecurityResponse,getTrustedDevice,unlockTrustedDevice} from "./securityDevice";

// Same mounted React tree as ERP. The section never redirects to /guvenlik/ or reloads AuthProvider.
export default function SecurityCenter(){
 const [section,setSection]=useState("approvals");
 const [pending,setPending]=useState([]),[control,setControl]=useState(null),[device,setDevice]=useState(null);
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const [matchById,setMatchById]=useState({}),[code,setCode]=useState(null);
 const refresh=useCallback(async()=>{
   try{
     const stored=await getTrustedDevice();
     setDevice(stored);
     if(!stored?.deviceId||!stored?.signingPrivateKey){setStatus("Bu telefon henüz güvenilir cihaz olarak kayıtlı değil.");return}
     const items=await getSignedSecurityResponse("/auth/push/device/pending");
     setPending(Array.isArray(items.items)?items.items:[]);
     try{setControl(await getSignedSecurityResponse("/auth/push/device/control-center"))}catch{setControl(null)}
     setStatus("");
   }catch(error){setStatus(error?.message||"Güvenlik bilgisi alınamadı.")}
 },[]);
 useEffect(()=>{
   refresh();
   const timer=setInterval(()=>{if(document.visibilityState==="visible"&&!busy)refresh()},10000);
   const onFocus=()=>refresh();
   window.addEventListener("focus",onFocus);
   return()=>{clearInterval(timer);window.removeEventListener("focus",onFocus)};
 },[busy,refresh]);
 useEffect(()=>{if(!code)return;const wait=setTimeout(()=>{if(Date.parse(code.expiresAt)<=Date.now())setCode(null)},Math.max(0,Date.parse(code.expiresAt)-Date.now()));return()=>clearTimeout(wait)},[code]);
 const decision=async(item,value)=>{
   if(busy)return;
   const match=String(matchById[item.id]||"");
   if(value==="APPROVE"&&/^\d{2}$/.test(String(item.matchNumber||""))&&match!==String(item.matchNumber)){setStatus("Eşleştirme numarası hatalı.");return}
   setBusy(true);setStatus("İmzalı karar gönderiliyor...");
   try{
     await decideTrustedApproval(item,value,value==="APPROVE"?match:"");
     setStatus(value==="APPROVE"?"Onay verildi.":"İstek reddedildi.");
     await refresh();
   }catch(error){setStatus(error?.message||"Onay işlemi başarısız.")}
   finally{setBusy(false)}
 };
 const newCode=async()=>{
   setBusy(true);setStatus("");
   try{await unlockTrustedDevice();const data=await getSignedSecurityResponse("/auth/push/device/login-code",{method:"POST",body:{}});setCode(data)}
   catch(error){setStatus(error?.message||"Giriş kodu üretilemedi.")}
   finally{setBusy(false)}
 };
 const sections=[["approvals","Onaylar",ShieldCheck],["code","Giriş Kodu",KeyRound],["sessions","Oturumlar",MonitorSmartphone],["devices","Cihazlar",MonitorSmartphone],["activity","Hareketler",Activity],["logs","Loglar",History]];
 const rows=section==="sessions"?control?.sessions:section==="devices"?control?.devices:section==="activity"?control?.activity:control?.logs;
 return <main className="ky-pro-security" aria-label="Tek uygulama güvenlik kontrol merkezi">
  <header className="ky-pro-security-hero"><span>KY ERP PRO · GÜVENLİK MERKEZİ</span><h1>Güvenlik & Onaylar</h1>
   <p>ERP'yi kapatmadan girişleri, cihazları ve oturumları kontrol edin.</p>
   <button type="button" onClick={refresh} disabled={busy}><RefreshCw size={16}/>Yenile</button></header>
  <div className="ky-pro-security-tabs" role="group" aria-label="Güvenlik bölümleri">
   {sections.map(([key,label,Icon])=><button key={key} type="button" className={section===key?"active":""} onClick={()=>setSection(key)}><Icon size={17}/>{label}{key==="approvals"&&pending.length?<b>{pending.length}</b>:null}</button>)}
  </div>
  {status?<p className="ky-pro-security-message" role="status">{status}</p>:null}
  {!device?.deviceId?<section className="ky-pro-security-card"><h2>Cihaz bağlantısı gerekli</h2>
   <p>Eski cihaz kaydınız silinmedi. Bu telefonda bağlantı görünmüyorsa mevcut KY ERP güvenilir cihaz kurulumu kontrol edilmelidir.</p></section>:null}
  {section==="approvals"?<div className="ky-pro-security-list">
    {!pending.length?<div className="ky-pro-security-card"><ShieldCheck size={28}/><h2>Bekleyen giriş onayı yok</h2><p>Yeni istekler otomatik denetleniyor.</p></div>:null}
    {pending.map(item=><article className="ky-pro-security-card" key={item.id}>
      <h2>{item.title||"Giriş Onayı"}</h2><p>{item.body||"Güvenilir telefon onayı bekleniyor."}</p>
      {/^\d{2}$/.test(String(item.matchNumber||""))?<label>Ekrandaki iki haneli numara
       <input inputMode="numeric" autoComplete="off" maxLength={2} value={matchById[item.id]||""}
        onChange={e=>setMatchById(v=>({...v,[item.id]:e.target.value.replace(/\D/g,"").slice(0,2)}))}/>
      </label>:null}
      <div className="ky-pro-security-actions"><button type="button" disabled={busy} onClick={()=>decision(item,"APPROVE")}><LockKeyhole size={17}/>PIN ile Onayla</button>
       <button type="button" disabled={busy} onClick={()=>decision(item,"DENY")}>Reddet</button></div></article>)}
  </div>:null}
  {section==="code"?<section className="ky-pro-security-card"><h2>Tek kullanımlık giriş kodu</h2>
    <p>Parmak izi / PIN ile doğrulanmış 60 saniyelik kod.</p>
    <div className="ky-pro-generated-code">{code&&Date.parse(code.expiresAt)>Date.now()?String(code.code||"").replace(/(\d{3})(\d{3})/,"$1 $2"):"— — — — — —"}</div>
    <button type="button" disabled={busy||!device?.deviceId} onClick={newCode}><KeyRound size={17}/>Yeni Kod Üret</button></section>:null}
  {["sessions","devices","activity","logs"].includes(section)?<section className="ky-pro-security-card">
     <h2>{sections.find(row=>row[0]===section)?.[1]}</h2>
     {control?.summary?<div className="ky-pro-security-counters">
       <span><b>{control.summary.activeSessions??0}</b>Aktif oturum</span>
       <span><b>{control.summary.trustedDevices??0}</b>Güvenilir cihaz</span>
       <span><b>{control.summary.recentEvents??0}</b>Son olaylar</span></div>:null}
     {Array.isArray(rows)&&rows.length?rows.map((row,i)=><div className="ky-pro-security-row" key={row.id||i}>
       <strong>{row.fullName||row.username||row.title||row.action||row.type||"Güvenlik İşlemi"}</strong>
       <small>{row.deviceLabel||row.status||row.companySlug||row.description||"-"}</small>
     </div>):<p>Bu kapsamda görüntülenebilen kayıt bulunmuyor.</p>}
   </section>:null}
 </main>;
}
