import {useMemo,useState} from "react";
import {AlertTriangle,CheckCircle2,Plus,Trash2} from "lucide-react";
import {uploadEBelge} from "../../../services/eBelgeApi";
const blankLine=()=>({description:"",quantity:"1",unitCode:"ADET",unitPrice:"0",taxRate:"20"});
const formatMoney=value=>new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
export default function EBelgeManualFallback({file,onSaved,onCancel}){
  const [form,setForm]=useState({documentKind:"FATURA",direction:"INCOMING",documentNo:"",issueDate:"",
    partyName:"",partyTaxNo:"",currency:"TRY"});
  const [lines,setLines]=useState([blankLine()]);
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const totals=useMemo(()=>{
    const subtotal=lines.reduce((sum,row)=>sum+(Number(row.quantity)||0)*(Number(row.unitPrice)||0),0);
    const tax=lines.reduce((sum,row)=>sum+(Number(row.quantity)||0)*(Number(row.unitPrice)||0)*(Number(row.taxRate)||0)/100,0);
    return {subtotal,tax,payable:subtotal+tax};
  },[lines]);
  const field=(key,value)=>setForm(old=>({...old,[key]:value}));
  const lineField=(index,key,value)=>setLines(old=>old.map((row,i)=>index===i?{...row,[key]:value}:row));
  const save=async(event)=>{
    event.preventDefault();
    if(busy||!confirmed)return;
    setBusy(true);setError("");
    try{
      const result=await uploadEBelge([file],{manualOnly:true,manualData:{...form,lines}});
      if(result?.errors?.length||!result?.items?.length)
        throw Error(result?.errors?.[0]?.message||"Manuel kayıt sonucu doğrulanamadı.");
      await onSaved?.(result,file);
    }catch(e){setError((e?.message||"Manuel kayıt yapılamadı.")+
      " Sonuç belirsizse tekrar göndermeden önce Belge Havuzu'nu kontrol edin.");}
    finally{setBusy(false)}
  };
  return <form className="eb-manual-fallback" onSubmit={save} aria-label="OCR yerine manuel belge ve kalem girişi">
    <header><div><strong>Manuel Belge Girişi — İnceleme Kaydı</strong>
      <small>Kaynak: {file.name}. Kaynağı doğrulamadan mali kayıt oluşmaz.</small></div>
      <button type="button" disabled={busy} onClick={onCancel}>Kapat</button></header>
    <div className="eb-manual-grid">
      <label>Belge türü<select value={form.documentKind} onChange={e=>field("documentKind",e.target.value)}>
        <option value="FATURA">Fatura</option><option value="IRSALIYE">İrsaliye</option></select></label>
      <label>Yön<select value={form.direction} onChange={e=>field("direction",e.target.value)}>
        <option value="INCOMING">Gelen</option><option value="OUTGOING">Giden</option></select></label>
      <label>Belge No<input required maxLength={80} value={form.documentNo} onChange={e=>field("documentNo",e.target.value)}/></label>
      <label>Belge Tarihi<input type="date" required value={form.issueDate} onChange={e=>field("issueDate",e.target.value)}/></label>
      <label>Karşı Firma<input required maxLength={200} value={form.partyName} onChange={e=>field("partyName",e.target.value)}/></label>
      <label>VKN / TCKN<input inputMode="numeric" maxLength={11} value={form.partyTaxNo} onChange={e=>field("partyTaxNo",e.target.value)}/></label>
      <label>Para Birimi<input required maxLength={3} value={form.currency} onChange={e=>field("currency",e.target.value.toUpperCase())}/></label>
    </div>
    <div className="eb-manual-lines-head"><strong>Kalemler ({lines.length})</strong>
      <button type="button" disabled={busy||lines.length>=100} onClick={()=>setLines(old=>[...old,blankLine()])}><Plus size={16}/> Kalem Ekle</button></div>
    <div className="eb-manual-lines">{lines.map((row,index)=><div className="eb-manual-line" key={index}>
      <label className="description">Kalem {index+1} açıklaması<input required maxLength={240} value={row.description} onChange={e=>lineField(index,"description",e.target.value)}/></label>
      <label>Miktar<input required type="number" min="0.000001" step="any" value={row.quantity} onChange={e=>lineField(index,"quantity",e.target.value)}/></label>
      <label>Birim<input required maxLength={20} value={row.unitCode} onChange={e=>lineField(index,"unitCode",e.target.value)}/></label>
      <label>Birim Fiyat<input required type="number" min="0" step="any" value={row.unitPrice} onChange={e=>lineField(index,"unitPrice",e.target.value)}/></label>
      <label>KDV %<input required type="number" min="0" max="100" step="any" value={row.taxRate} onChange={e=>lineField(index,"taxRate",e.target.value)}/></label>
      <button type="button" aria-label={`Kalem ${index+1} sil`} disabled={busy||lines.length===1} onClick={()=>setLines(old=>old.filter((_,i)=>i!==index))}><Trash2 size={16}/></button>
    </div>)}</div>
    <p className="eb-manual-totals">Ara Toplam: <strong>{formatMoney(totals.subtotal)}</strong> · KDV: <strong>{formatMoney(totals.tax)}</strong> · Genel Toplam: <strong>{formatMoney(totals.payable)} {form.currency}</strong></p>
    <label className="eb-manual-ack"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
      Kaynak dosyadan girdim. Yalnız kontrol bekleyen taslak açılsın; kesin cari/KDV/stok kaydı yapılmasın.</label>
    {error&&<p role="alert" className="eb-inline-message warning"><AlertTriangle size={15}/>{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onCancel}>Vazgeç</button>
      <button type="submit" className="eb-primary" disabled={busy||!confirmed}><CheckCircle2 size={16}/>{busy?"Kaydediliyor...":"Kontrol Bekleyen Kaydı Oluştur"}</button></footer>
  </form>;
}
