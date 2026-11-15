import {useEffect,useMemo,useState} from "react";
import {apiGet} from "../../../utils/api";
import {createMailDraft,listMailAccounts} from "../../../services/mailApi";
const unwrap=value=>value?.data?.data??value?.data??value??[];
const toList=value=>Array.isArray(value)?value:[];
const mails=value=>Array.isArray(value)?value:typeof value==="string"?value.split(/[;,]/).map(v=>v.trim()).filter(Boolean):[];
const activeOutlook=row=>String(row.provider_type||row.providerType||"").toUpperCase()==="MICROSOFT_365"&&
  String(row.status||"").toUpperCase()==="ACTIVE"&&Number(row.provider_connected??row.providerConnected??0)===1;
export default function InvoiceDifferenceMailDraft({activeMainCompany,customerName,missing=[],extras=[],snapshot,onOpenDrafts}){
 const tenant=activeMainCompany?.slug||"";
 const [accounts,setAccounts]=useState([]),[routes,setRoutes]=useState([]);
 const [accountId,setAccountId]=useState(""),[routeId,setRouteId]=useState("");
 const [subject,setSubject]=useState(""),[body,setBody]=useState("");
 const [ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState("");
 useEffect(()=>{
  let disposed=false;
  Promise.all([listMailAccounts(),apiGet("/muhasebe/invoice-mail-routes",{mainCompanySlug:tenant})])
   .then(([a,r])=>{if(disposed)return;setAccounts(toList(unwrap(a)).filter(activeOutlook));setRoutes(toList(unwrap(r)));})
   .catch(e=>{if(!disposed)setError(e.message||"Outlook hesap ve alıcıları okunamadı.");});
  return()=>{disposed=true;};
 },[tenant]);
 const route=useMemo(()=>routes.find(row=>String(row.id)===routeId),[routeId,routes]);
 useEffect(()=>{
  setRouteId("");setAck(false);setSaved("");
 },[customerName,snapshot?.id]);
 useEffect(()=>{
  const missingNumbers=missing.map(row=>row.documentNo),extraNumbers=extras.map(row=>row.documentNo);
  setSubject("Haftalık fatura listesi kontrolü — "+(customerName||"Müşteri")+" — "+(snapshot?.weekDate||""));
  setBody(
   "Merhaba,\n\n"+(snapshot?.weekDate||"")+
   " tarihli haftalık listenizi faturalarımızla karşılaştırdık. Aşağıdaki belge numaralarını kontrol edip bilgi verebilir misiniz?\n\n"+
   "Listede bulunmayan HKN faturalarımız ("+missingNumbers.length+"):\n"+
    (missingNumbers.length?missingNumbers.join("\n"):"Yok")+"\n\n"+
   "Listenizde olup seçili cari fatura kayıtlarımızda bulunmayan HKN numaraları ("+extraNumbers.length+"):\n"+
    (extraNumbers.length?extraNumbers.join("\n"):"Yok")+
   "\n\nBunların ödeme planına alınıp alınmadığını ve varsa tutar farklılıklarını bildirmenizi rica ederiz.\n\nTeşekkürler.");
  setAck(false);setSaved("");
 },[customerName,snapshot?.id,snapshot?.weekDate,missing,extras]);
 const save=async()=>{
  if(!route||!accountId||!ack||busy||saved)return;
  setBusy(true);setError("");
  try{
   const to=mails(route.to),cc=mails(route.cc);
   if(!to.length)throw Error("Alıcı profilinde TO adresi eksik.");
   if(!subject.trim()||!body.trim())throw Error("Konu ve mail içeriği eksik.");
   const result=unwrap(await createMailDraft({accountId,subject:subject.trim(),bodyText:body.trim(),
    recipients:{to,cc,bcc:[]},attachmentRefs:[],mainCompanySlug:tenant}));
   if(!result?.id)throw Error("Posta taslağı doğrulanamadı.");
   setSaved(String(result.id));setAck(false);
  }catch(e){setError((e.message||"Taslak oluşturulamadı.")+" Sonuç belirsizse tekrar denemeden önce Taslaklar'ı kontrol edin.");}
  finally{setBusy(false);}
 };
 return <section className="imrc-panel">
  <strong>Eksik / Fazla HKN için Müşteriye Kontrol Maili</strong>
  <p>Bu bölüm yalnız taslak oluşturur. Gönderim için Mail & Dosyalar / Taslaklar alanında ayrıca kontrol ve açık gönderim gerekir. Gelen Excel'e otomatik yanıt veya ödeme kaydı oluşturulmaz.</p>
  <div className="imrc-toolbar">
   <label>Gönderici Outlook
    <select value={accountId} onChange={e=>{setAccountId(e.target.value);setAck(false);}}>
     <option value="">Aktif hesap seçin</option>{accounts.map(row=><option key={row.id} value={row.id}>{row.email_address||row.display_name}</option>)}
    </select>
   </label>
   <label>Alıcı / müşteri grubu
    <select value={routeId} onChange={e=>{setRouteId(e.target.value);setAck(false);}}>
     <option value="">Doğru müşteri ve grubu seçin</option>
     {routes.map(row=><option key={row.id} value={row.id}>{[row.customerName,row.groupCode,row.department].filter(Boolean).join(" / ")}</option>)}
    </select>
   </label>
  </div>
  <div className="imrc-mail-form">
   <label>Konu<input value={subject} maxLength={250} onChange={e=>{setSubject(e.target.value);setAck(false);}}/></label>
   <label>Mesaj<textarea value={body} rows={12} maxLength={16000} onChange={e=>{setBody(e.target.value);setAck(false);}}/></label>
   <p>Alıcı: {route?mails(route.to).join("; "):"Henüz seçilmedi"} {route&&mails(route.cc).length?" · CC: "+mails(route.cc).join("; "):""}</p>
   <label className="imrc-ack"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
    Alıcı firmayı, grup listesini, eksik/fazla HKN'leri ve mesajı kontrol ettim.</label>
   {error&&<p className="imrc-error" role="alert">{error}</p>}
   {saved?<div className="imrc-notice">Taslak kaydedildi; gönderilmedi. <button type="button" onClick={onOpenDrafts}>Mail Taslaklarını Aç</button></div>:
    <button type="button" className="imrc-draft-button" onClick={save} disabled={!routeId||!accountId||!ack||busy}>
     {busy?"Kaydediliyor...":"Kontrol Maili Taslağı Oluştur (Göndermez)"}
    </button>}
  </div>
 </section>;
}
