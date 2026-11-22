import {useCallback,useEffect,useState} from "react";
import {ShieldCheck,RefreshCw,LockKeyhole,KeyRound,MonitorSmartphone,Activity,History,NotebookPen,MessageCircle} from "lucide-react";
import {decideTrustedApproval,decideTrustedSecurityAction,getSignedSecurityResponse,getTrustedDevice,unlockTrustedDevice,closeTrustedSession} from "./securityDevice";
import {useAuth} from "../context/AuthContext";
import {listOwnPasskeyCredentials,revokeOwnPasskeyCredential} from "../services/securityCenterApi";

// Same mounted React tree as ERP. The section never redirects to /guvenlik/ or reloads AuthProvider.
export default function SecurityCenter(){
 const {isAuthenticated}=useAuth();
 const [passkeys,setPasskeys]=useState([]);
 const [section,setSection]=useState("approvals");
 const [pending,setPending]=useState([]),[critical,setCritical]=useState([]),[criticalError,setCriticalError]=useState(""),[control,setControl]=useState(null),[device,setDevice]=useState(null);
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const [matchById,setMatchById]=useState({}),[code,setCode]=useState(null);
 const [notes,setNotes]=useState([]),[noteText,setNoteText]=useState("");
 const [peers,setPeers]=useState([]),[selectedPeer,setSelectedPeer]=useState(null);
 const [messages,setMessages]=useState([]),[messageText,setMessageText]=useState("");
 const refreshPasskeys=useCallback(async()=>{
   if(!isAuthenticated){setPasskeys([]);return;}
   try{
     const result=await listOwnPasskeyCredentials();
     setPasskeys(Array.isArray(result?.credentials)?result.credentials:[]);
   }catch(error){setStatus(error?.message||"Hızlı giriş anahtarları okunamadı.");}
 },[isAuthenticated]);
 useEffect(()=>{if(section==="keys")refreshPasskeys()},[section,refreshPasskeys]);
 const revokePasskey=async row=>{
   if(!isAuthenticated||!row?.credentialId||busy)return;
   if(!window.confirm("Bu KY PRO / parmak izi hızlı giriş anahtarı kaldırılsın mı? Diğer cihazlarınız korunur."))return;
   setBusy(true);
   try{
     await revokeOwnPasskeyCredential(row.credentialId);
     await refreshPasskeys();
     setStatus("Seçili hızlı giriş anahtarı kaldırıldı. Bu cihazda yeniden kurulum için normal güvenli giriş gerekir.");
   }catch(error){setStatus(error?.message||"Hızlı giriş anahtarı kaldırılamadı.");}
   finally{setBusy(false);}
 };
 const refresh=useCallback(async()=>{
   try{
     const stored=await getTrustedDevice();
     setDevice(stored);
     if(!stored?.deviceId||!stored?.signingPrivateKey){setPending([]);setCritical([]);setStatus("Bu telefon henüz güvenilir cihaz olarak kayıtlı değil.");return}
     const [loginResult,criticalResult]=await Promise.allSettled([
       getSignedSecurityResponse("/auth/push/device/pending"),
       getSignedSecurityResponse("/auth/security-actions/device/pending")
     ]);
     if(loginResult.status==="rejected")throw loginResult.reason;
     setPending(Array.isArray(loginResult.value.items)?loginResult.value.items:[]);
     setCritical(criticalResult.status==="fulfilled"&&Array.isArray(criticalResult.value.items)?criticalResult.value.items:[]);
     setCriticalError(criticalResult.status==="rejected"?(criticalResult.reason?.message||"Kritik işlem kuyruğu kontrol edilemedi."):"");
     try{setControl(await getSignedSecurityResponse("/auth/push/device/control-center"))}catch{setControl(null)}
     try{const data=await getSignedSecurityResponse("/auth/push/device/workspace/notes");setNotes(Array.isArray(data.items)?data.items:[])}catch{setNotes([])}
     try{const data=await getSignedSecurityResponse("/auth/push/device/workspace/chat/users");setPeers(Array.isArray(data.items)?data.items:[])}catch{setPeers([])}
     setStatus("");
   }catch(error){setStatus(error?.message||"Güvenlik bilgisi alınamadı.")}
 },[]);
 useEffect(()=>{
   refresh();
   const timer=setInterval(()=>{if(document.visibilityState==="visible"&&!busy)refresh()},20000);
   const onFocus=()=>refresh();
   const onPush=event=>{if(event.data?.type==="KYERP_SECURITY_PUSH_WAKE")refresh()};
   window.addEventListener("focus",onFocus);
   navigator.serviceWorker?.addEventListener?.("message",onPush);
   return()=>{clearInterval(timer);window.removeEventListener("focus",onFocus);navigator.serviceWorker?.removeEventListener?.("message",onPush)};
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
 const criticalDecision=async(item,choice)=>{
   if(busy)return;
   setBusy(true);setStatus("Kritik işlem için PIN / parmak izi doğrulanıyor...");
   try{
     await decideTrustedSecurityAction(item,choice);
     await refresh();
     setStatus(choice==="APPROVED"?"Kritik güvenlik işlemi onaylandı. Sonucu ERP ekranında kontrol edin.":"Kritik güvenlik işlemi reddedildi.");
   }catch(error){setStatus(error?.message||"Kritik güvenlik kararı gönderilemedi.")}
   finally{setBusy(false)}
 };
 const newCode=async()=>{
   setBusy(true);setStatus("");
   try{await unlockTrustedDevice();const data=await getSignedSecurityResponse("/auth/push/device/login-code",{method:"POST",body:{}});setCode(data)}
   catch(error){setStatus(error?.message||"Giriş kodu üretilemedi.")}
   finally{setBusy(false)}
 };
 const closeSession=async row=>{
   setBusy(true);setStatus("Güvenli oturum kapatma doğrulanıyor...");
   try{await closeTrustedSession(row);await refresh();setStatus("Oturum kapatıldı.")}
   catch(e){setStatus(e?.message||"Oturum kapatılamadı.")}
   finally{setBusy(false)}
 };
 const saveNote=async event=>{
   event.preventDefault();if(!noteText.trim())return;
   setBusy(true);
   try{await getSignedSecurityResponse("/auth/push/device/workspace/notes",{method:"POST",body:{title:noteText.trim(),body:"",remindAt:""}});setNoteText("");await refresh()}
   catch(e){setStatus(e?.message||"Not kaydedilemedi.")}
   finally{setBusy(false)}
 };
 const removeNote=async id=>{
   if(!window.confirm("Bu not silinsin mi?"))return;
   setBusy(true);try{await getSignedSecurityResponse("/auth/push/device/workspace/notes/"+encodeURIComponent(id),{method:"DELETE"});await refresh()}
   catch(e){setStatus(e?.message||"Not silinemedi.")}finally{setBusy(false)}
 };
 const openMessages=async user=>{
   setSelectedPeer(user);
   try{const data=await getSignedSecurityResponse("/auth/push/device/workspace/chat/messages?with="+encodeURIComponent(user.id)+"&limit=100");setMessages(Array.isArray(data.items)?data.items:[])}
   catch(e){setStatus(e?.message||"Mesajlar alınamadı.")}
 };
 const sendMessage=async event=>{
   event.preventDefault();if(!selectedPeer||!messageText.trim())return;
   setBusy(true);try{await getSignedSecurityResponse("/auth/push/device/workspace/chat/messages",{method:"POST",body:{toUserId:selectedPeer.id,message:messageText.trim()}});setMessageText("");await openMessages(selectedPeer)}
   catch(e){setStatus(e?.message||"Mesaj gönderilemedi.")}finally{setBusy(false)}
 };
 const sections=[["approvals","Onaylar",ShieldCheck],["code","Giriş Kodu",KeyRound],["sessions","Oturumlar",MonitorSmartphone],["devices","Cihazlar",MonitorSmartphone],["keys","Hızlı Giriş",KeyRound],["activity","Hareketler",Activity],["logs","Loglar",History],["notes","Notlar",NotebookPen],["chat","Mesajlar",MessageCircle]];
 const rows=section==="sessions"?control?.sessions:section==="devices"?control?.devices:section==="activity"?control?.activity:control?.audit;
 return <main className="ky-pro-security" aria-label="Tek uygulama güvenlik kontrol merkezi">
  <header className="ky-pro-security-hero"><span>KY ERP PRO · GÜVENLİK MERKEZİ</span><h1>Güvenlik & Onaylar</h1>
   <p>ERP'yi kapatmadan girişleri, cihazları ve oturumları kontrol edin.</p>
   <button type="button" onClick={refresh} disabled={busy}><RefreshCw size={16}/>Yenile</button></header>
  <div className="ky-pro-security-tabs" role="group" aria-label="Güvenlik bölümleri">
   {sections.map(([key,label,Icon])=><button key={key} type="button" className={section===key?"active":""} onClick={()=>setSection(key)}><Icon size={17}/>{label}{key==="approvals"&&(pending.length+critical.length)?<b>{pending.length+critical.length}</b>:null}</button>)}
  </div>
  {status?<p className="ky-pro-security-message" role="status">{status}</p>:null}
  {!device?.deviceId?<section className="ky-pro-security-card"><h2>Cihaz bağlantısı gerekli</h2>
   <p>Eski cihaz kaydınız silinmedi. Bu telefonda bağlantı görünmüyorsa mevcut KY ERP güvenilir cihaz kurulumu kontrol edilmelidir.</p></section>:null}
  {section==="approvals"?<div className="ky-pro-security-list">
    {criticalError?<p className="ky-pro-security-message" role="alert">Kritik işlem kontrolü: {criticalError}. Normal giriş onayları kullanılabilir.</p>:null}
    {critical.map(item=><article className="ky-pro-security-card" key={"critical-"+item.id}>
      <span className="ky-pro-critical-label">KRİTİK GÜVENLİK ONAYI</span>
      <h2>{item.actionType==="OWNER_RECOVERY_QUESTIONS_UPDATE"?"Hesap kurtarma sorularını kaydet":(item.title||"Kritik güvenlik işlemi")}</h2>
      <p>Bu isteği ERP ekranında siz başlattıysanız PIN / parmak iziyle onaylayın. Aksi halde reddedin.</p>
      <div className="ky-pro-security-actions"><button type="button" disabled={busy} onClick={()=>criticalDecision(item,"APPROVED")}><LockKeyhole size={17}/>PIN ile Onayla</button>
      <button type="button" disabled={busy} onClick={()=>criticalDecision(item,"DENIED")}>Reddet</button></div>
    </article>)}
    {!pending.length&&!critical.length?<div className="ky-pro-security-card"><ShieldCheck size={28}/><h2>Bekleyen giriş onayı yok</h2><p>Yeni istekler otomatik denetleniyor. KY PRO'ya kendi girişiniz için üstteki Parmak İziyle Aç düğmesini kullanın; bu onay bölümü başka cihazlar içindir.</p></div>:null}
    {pending.map(item=><article className="ky-pro-security-card" key={item.id}>
      <h2>{item.title||"Giriş Onayı"}</h2><p>{item.body||"Güvenilir telefon onayı bekleniyor."}</p>
      {/^\d{2}$/.test(String(item.matchNumber||""))?<label>Ekrandaki iki haneli numara
       <input inputMode="numeric" autoComplete="off" maxLength={2} value={matchById[item.id]||""}
        onChange={e=>setMatchById(v=>({...v,[item.id]:e.target.value.replace(/\D/g,"").slice(0,2)}))}/>
      </label>:null}
      <div className="ky-pro-security-actions"><button type="button" disabled={busy} onClick={()=>decision(item,"APPROVE")}><LockKeyhole size={17}/>PIN ile Onayla</button>
       <button type="button" disabled={busy} onClick={()=>decision(item,"DENY")}>Reddet</button></div></article>)}
  </div>:null}
  {section==="keys"?<section className="ky-pro-security-card">
    <h2>KY PRO · Parmak İzi / Windows Hello</h2>
    {!isAuthenticated?<p>Giriş anahtarlarınızı görmek veya kaldırmak için önce kendi ERP oturumunuzu açın.</p>:<>
      <p>Bu hesaba tanımlanan hızlı giriş anahtarları. Telefonun parmak izi verisi KY ERP sunucusuna gönderilmez.</p>
      {passkeys.length?passkeys.map(row=><div className="ky-pro-security-row" key={row.credentialId}>
        <strong>{row.label||"Hızlı giriş anahtarı"}</strong>
        <small>Kaydedildi: {row.createdAt?new Date(row.createdAt).toLocaleString("tr-TR"):"-"} · Son kullanım: {row.lastUsedAt?new Date(row.lastUsedAt).toLocaleString("tr-TR"):"-"}</small>
        <button type="button" disabled={busy} onClick={()=>revokePasskey(row)}>Bu Anahtarı Kaldır</button>
      </div>):<p>Bu hesap için henüz hızlı giriş anahtarı kayıtlı değil. Normal girişten sonra cihazda kurulum önerilir.</p>}
    </>}
   </section>:null}
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
       <small>{row.deviceLabel||row.status||row.mainCompanySlug||row.description||"-"}</small>
       {section==="sessions"&&row.canClose===true?<button type="button" disabled={busy} onClick={()=>closeSession(row)}>Oturumu Kapat</button>:null}
     </div>):<p>Bu kapsamda görüntülenebilen kayıt bulunmuyor.</p>}
   </section>:null}
  {section==="notes"?<section className="ky-pro-security-card">
    <h2>Kişisel Notlar</h2>
    <form onSubmit={saveNote} className="ky-pro-security-note-form"><input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Yeni not..." aria-label="Yeni not"/><button type="submit" disabled={busy}>Not Ekle</button></form>
    {notes.length?notes.map(note=><div className="ky-pro-security-row" key={note.id}><strong>{note.title||"Not"}</strong><small>{note.body||""}</small><button type="button" onClick={()=>removeNote(note.id)} disabled={busy}>Sil</button></div>):<p>Henüz kişisel not bulunmuyor.</p>}
   </section>:null}
   {section==="chat"?<section className="ky-pro-security-card">
    <h2>KY ERP Mesajlar</h2>
    <div className="ky-pro-security-peers">{peers.map(user=><button type="button" key={user.id} className={selectedPeer?.id===user.id?"active":""} onClick={()=>openMessages(user)}>{user.fullName||user.username}</button>)}</div>
    {selectedPeer?<><h3>{selectedPeer.fullName||selectedPeer.username}</h3><div className="ky-pro-security-messages">{messages.map((msg,index)=><div className="ky-pro-security-row" key={msg.id||index}><span>{msg.message}</span><small>{new Date(msg.createdAt).toLocaleString("tr-TR")}</small></div>)}</div>
       <form className="ky-pro-security-note-form" onSubmit={sendMessage}><input value={messageText} onChange={e=>setMessageText(e.target.value)} placeholder="Mesaj yaz..." aria-label="Mesaj yaz"/><button type="submit" disabled={busy}>Gönder</button></form></>:<p>Mesajlaşmak için bir kullanıcı seçin.</p>}
   </section>:null}
 </main>;
}
