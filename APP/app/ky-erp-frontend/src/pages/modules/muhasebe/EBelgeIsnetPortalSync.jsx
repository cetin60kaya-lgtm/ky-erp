import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ShieldCheck, FolderOpen, AlertTriangle } from "lucide-react";
import { getIsnetSettings, syncIsnetPortalBatch } from "../../../services/isnetApi";

function localDay(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function firstDay() { const d=new Date();d.setDate(d.getDate()-7);return localDay(d); }
function countSummary(value) {
  const counts=value?.counts||{};
  return ["Gelen fatura","Gelen irsaliye","Giden irsaliye","Giden fatura"]
    .map((label,i)=>label+": "+Number([counts.incomingInvoices,counts.incomingDispatches,counts.outgoingDispatches,counts.outgoingInvoices][i]||0)).join(" · ");
}

export default function EBelgeIsnetPortalSync({ activeMainCompany, openModule, enabled=true, onSynced }) {
  const tenant=activeMainCompany?.slug||activeMainCompany?.mainCompanySlug||activeMainCompany?.id||"";
  const [settings,setSettings]=useState(null);
  const [loading,setLoading]=useState(true);
  const [password,setPassword]=useState("");
  const [from,setFrom]=useState(firstDay);
  const [to,setTo]=useState(()=>localDay(new Date()));
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [result,setResult]=useState(null);
  const stopRef=useRef(false);
  const busyRef=useRef(false);
  useEffect(()=>{
    let alive=true;
    setLoading(true);setSettings(null);setPassword("");setResult(null);setStatus("");
    if(!tenant){setLoading(false);return;}
    getIsnetSettings().then(data=>{if(alive)setSettings(data);}).catch(e=>{if(alive)setStatus(e?.message||"İşNet ayarları yüklenemedi.");}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;stopRef.current=true;};
  },[tenant]);

  const run=useCallback(async()=>{
    if(busyRef.current||!enabled||!tenant)return;
    const days=(Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000;
    if(!Number.isFinite(days)||days<0||days>31){setStatus("Geçerli ve en fazla 31 günlük tarih aralığı seçin.");return;}
    if(!settings?.username||!settings?.companyId||!settings?.companyName){setStatus("İşNet bağlantısında firma seçimini kaydedin; ardından senkronizasyon yapın.");return;}
    if(!password){setStatus("İşNet şifresi yalnız bu işlem için gereklidir.");return;}
    busyRef.current=true;stopRef.current=false;setBusy(true);setResult(null);
    let offset=0,totalFiles=0,hasMore=true,finished=false;
    try{
      for(let part=0;part<100&&hasMore;part+=1){
        if(stopRef.current)break;
        setStatus("İşNet'ten belgeler alınıyor · parti "+(part+1)+" · kayıt "+offset+"...");
        const response=await syncIsnetPortalBatch({mainCompanySlug:tenant,password,startDate:from,endDate:to,offset});
        setResult(response);
        totalFiles+=Number(response.downloaded||0);
        if(response.status==="FAILED"||response.requiresReview){
          setStatus("Bir bölüm kontrol gerektiriyor. Kayıtlar korunuyor. "+Number(response.failed||0)+" dosya ve "+Number(response.canonical?.failed||0)+" havuz hatası var. Sonraki parti başlatılmadı.");
          break;
        }
        hasMore=response.hasMore===true;
        const next=Number(response.nextOffset);
        if(hasMore&&(!Number.isSafeInteger(next)||next<=offset))throw Error("İşNet parti devam işareti geçersiz.");
        offset=next;
        if(!hasMore){finished=true;setStatus("Senkronizasyon tamamlandı. "+totalFiles+" XML/PDF belge çifti kontrol edildi. "+countSummary(response));}
      }
      if(!finished&&!stopRef.current&&hasMore&&offset>=0&&result?.requiresReview!==true){
        setStatus(current=>current||"Senkronizasyon tamamlanmadı; kalan belgeler için yeniden çalıştırın.");
      }
      if(typeof onSynced==="function")await onSynced();
    }catch(error){setStatus("Senkronizasyon tamamlanamadı. "+(error?.message||"Bağlantı hatası")+". Daha önce alınan belgeler silinmedi.");}
    finally{setPassword("");setBusy(false);busyRef.current=false;}
  },[enabled,tenant,password,settings,from,to,onSynced,result]);

  return <section aria-label="İşNet XML PDF Senkronizasyonu" style={{border:"1px solid var(--border-color,#dce3ec)",borderRadius:12,padding:18,marginTop:16}}>
    <h3 style={{display:"flex",alignItems:"center",gap:8,marginTop:0}}><ShieldCheck size={19}/> İşNet · Orijinal XML + PDF'yi Belge Havuzuna Al</h3>
    <p>Gelen/giden fatura ve irsaliyeler aynı anda alınır. Orijinal XML/PDF korunur; belge eşleşmesi ve muhasebe kontrolü e-Belge Havuzu'nda yapılır. Fatura oluşturma veya gönderme işlemi yapılmaz.</p>
    {loading?<p>Firma bağlantısı yükleniyor...</p>:<p><b>Seçili firma:</b> {settings?.companyName||"Henüz tanımlı değil"} · <b>Bağlantı hesabı:</b> {settings?.username?"Tanımlı":"Eksik"}</p>}
    <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end"}}>
      <label>Başlangıç tarihi<input type="date" value={from} disabled={busy} onChange={event=>setFrom(event.target.value)}/></label>
      <label>Bitiş tarihi<input type="date" value={to} disabled={busy} onChange={event=>setTo(event.target.value)}/></label>
      <label>İşNet şifresi (yalnız işlem boyunca)<input type="password" value={password} disabled={busy} autoComplete="off" onChange={event=>setPassword(event.target.value)} placeholder="İşNet portal şifresi"/></label>
      <button type="button" disabled={!enabled||busy||loading||!tenant} onClick={()=>void run()}><RefreshCw size={15}/> {busy?"Belgeler alınıyor...":"XML + PDF Senkronize Et"}</button>
      {busy&&<button type="button" onClick={()=>{stopRef.current=true;setStatus("Mevcut parti bittikten sonra durdurulacak.");}}>Durdur</button>}
      <button type="button" onClick={()=>openModule?.("e-belge",{tabKey:"belge-havuzu"})}><FolderOpen size={15}/> Belge Havuzu</button>
    </div>
    <p style={{fontSize:12,opacity:.8}}>Güvenlik: Şifre tarayıcıda kalıcı saklanmaz. Her parti işleminde İşNet'e yeniden giriş yapılır. İşlem 31 güne kadar sorgular, kayıtları kontrollü partilere böler. Aynı ETTN ikinci muhasebe kaydı oluşturmaz.</p>
    {status&&<p role="status" style={{display:"flex",gap:8,alignItems:"start"}}>{result?.requiresReview?<AlertTriangle size={16}/>:null}{status}</p>}
    {result&&<p style={{fontSize:12}}>Toplam listelenen: {Number(result.portalCount||0)} · Bu partide: {Number(result.batchCount||0)} · Havuzda yeni: {Number(result.canonical?.created||0)} · Mükerrer: {Number(result.canonical?.duplicates||0)} · Hata: {Number(result.failed||0)+Number(result.canonical?.failed||0)}</p>}
  </section>;
}
