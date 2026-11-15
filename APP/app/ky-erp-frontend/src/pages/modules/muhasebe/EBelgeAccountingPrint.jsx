import {useEffect,useState} from "react";
import {CheckCircle2,Printer,RotateCcw,AlertTriangle} from "lucide-react";
import {getEBelgeAccountingPrintStatuses,setEBelgeAccountingPrintStatus} from "../../../services/eBelgeApi";
import "./eBelgeAccountingPrint.css";

export const isIncomingAccountingInvoice=(d)=>
 String(d?.direction||"").toUpperCase()==="INCOMING"&&
 /FATURA|ARSIV|INVOICE|IADE/i.test(String(d?.document_type||""));

export default function EBelgeAccountingPrint({detail,mainCompanySlug,onPdf,onChanged}){
 const [state,setState]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [confirm,setConfirm]=useState(false),[resetOpen,setResetOpen]=useState(false),[resetReason,setResetReason]=useState("");
 const valid=isIncomingAccountingInvoice(detail)&&Boolean(mainCompanySlug);
 useEffect(()=>{
  let active=true;setState(null);setError("");setConfirm(false);setResetOpen(false);
  if(!valid)return()=>{active=false};
  getEBelgeAccountingPrintStatuses([detail.id],mainCompanySlug).then(data=>{
   if(active)setState(data?.statuses?.[detail.id]||{status:"PENDING"});
  }).catch(e=>{if(active)setError(e?.message||"Muhasebe çıktı durumu okunamadı.")});
  return()=>{active=false};
 },[detail?.id,mainCompanySlug,valid]);
 if(!valid)return null;
 const printed=state?.status==="PRINTED";
 const setStatus=async(action)=>{
  if(busy)return;
  setBusy(true);setError("");
  try{
   const next=await setEBelgeAccountingPrintStatus(detail.id,mainCompanySlug,action,
     action==="RESET_PENDING"?resetReason:"");
   setState(next);setConfirm(false);setResetOpen(false);setResetReason("");
   await onChanged?.();
  }catch(e){setError(e?.message||"Muhasebe çıktısı işareti kaydedilemedi.")}
  finally{setBusy(false)}
 };
 return <section className="eb-accounting-print" aria-label="Gelen fatura muhasebe tek çıktı takibi">
   <div className="eb-accounting-print-head">
    <div><strong><Printer size={17}/> Muhasebe İçin Tek Çıktı</strong>
      <small>Bu işaret yalnız gelen faturaya aittir. Aynı faturanın irsaliyesini ikinci muhasebe çıktısı olarak istemez.</small></div>
    <span className={state===null?"unknown":printed?"printed":"pending"}>
      {state===null?"Durum okunuyor":printed?"Çıktı Alındı":"Çıktı Bekliyor"}</span>
   </div>
   <div className="eb-accounting-print-actions">
    <button type="button" disabled={busy} onClick={onPdf}><Printer size={16}/> Faturanın PDF'ini Aç / Yazdır</button>
    {state!==null&&!printed&&<button type="button" disabled={busy} onClick={()=>{setConfirm(v=>!v);setResetOpen(false)}}>
      <CheckCircle2 size={16}/> Çıktı Alındı
    </button>}
    {printed&&<button type="button" disabled={busy} onClick={()=>{setResetOpen(v=>!v);setConfirm(false)}}>
      <RotateCcw size={15}/> İşareti Düzelt
    </button>}
   </div>
   {printed&&<small className="eb-accounting-print-audit">
     Kullanıcı onayı: {state.printedAt?new Date(state.printedAt).toLocaleString("tr-TR"):"-"} · İşaretleyen: {state.printedBy||"-"}
   </small>}
   {confirm&&<div className="eb-accounting-print-confirm">
     <p>Kağıt çıktıyı yazıcıdan gerçekten aldım; belgeyi kontrol ettim. Yazdır ekranını açmak tek başına çıktı alındı olarak işaretlemez.</p>
     <button type="button" disabled={busy} onClick={()=>void setStatus("MARK_PRINTED")}>
       {busy?"Kaydediliyor…":"Evet, Gerçek Çıktıyı Aldım"}
     </button>
     <button type="button" disabled={busy} onClick={()=>setConfirm(false)}>Vazgeç</button>
   </div>}
   {resetOpen&&<div className="eb-accounting-print-confirm">
      <label>İşareti düzeltme gerekçesi
       <input value={resetReason} onChange={e=>setResetReason(e.target.value)}
        maxLength={300} placeholder="Örn. Kağıt yazıcıdan çıkmadı" />
      </label>
      <button type="button" disabled={busy||resetReason.trim().length<6}
       onClick={()=>void setStatus("RESET_PENDING")}>Gerekçeyle Bekliyor Durumuna Al</button>
      <button type="button" disabled={busy} onClick={()=>setResetOpen(false)}>Vazgeç</button>
    </div>}
   {error&&<p role="alert"><AlertTriangle size={15}/> {error}</p>}
 </section>;
}
