import { useEffect, useState } from "react";
import { apiGet } from "../../../utils/api";
import { quantityPlan } from "./isnetPartialQuantityPlan";
import "./isnetPartialWorkflow.css";

const fmt = n => Number(n).toLocaleString("tr-TR",{maximumFractionDigits:6});
const money = n => Number(n).toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function IsnetPartialWorkflow({row,slug,onClose}) {
  const [source,setSource]=useState(null),[error,setError]=useState(""),[step,setStep]=useState(1);
  const [amounts,setAmounts]=useState({}),[prices,setPrices]=useState({}),[taxes,setTaxes]=useState({});
  const [transport,setTransport]=useState({driver:"",plate:"",date:"",time:"",note:""});
  const [note,setNote]=useState("");
  useEffect(()=>{let active=true;apiGet("/muhasebe/incoming-dispatches/"+encodeURIComponent(row.id)+"/partial-preview",{mainCompanySlug:slug},{forceFresh:true}).then(raw=>{
    if(!active)return;const data=raw?.data?.data??raw?.data??raw;
    if(!Array.isArray(data.lines))throw Error("Kaynak kalemler alınamadı.");
    setSource(data);setAmounts(Object.fromEntries(data.lines.map(l=>[l.id,String(l.remaining)])));
  }).catch(e=>{if(active)setError(e?.message||"Kaynak irsaliye okunamadı.");});return()=>{active=false;};},[row.id,slug]);
  const update=(setter,id,value)=>setter(old=>({...old,[id]:value}));
  const lines=source?.lines||[];
  let plan=null,validation="";try{plan=quantityPlan(lines,amounts,prices,taxes);}catch(e){validation=e.message;}
  const selected=lines.filter(l=>Number(amounts[l.id])>0);
  const quantitiesValid=lines.length>0&&selected.length>0&&lines.every(l=>amounts[l.id]!==""&&Number.isFinite(Number(amounts[l.id]))&&Number(amounts[l.id])>=0&&Number(amounts[l.id])<=l.remaining);
  return <section className="isp-root" aria-label="Gelenden irsaliye oluştur">
    <header><div><h3>Gelenden irsaliye oluştur · Kısmi faturalandırma</h3><p>{row.companyName} · {row.dispatchNo}</p></div><button type="button" onClick={onClose}>Kapat</button></header>
    <p role="status" className="isp-warning">Hazırlık önizlemesi: İşNet mutabakatı ve resmî taslak servisi henüz kabul edilmedi. Bu ekran kayıt, sevk veya fatura göndermez; miktar ayırmaz. Bağlı belge sayımı eksik olabilir.</p>
    {error&&<p role="alert">{error}</p>}
    {!source&&!error&&<p>Kaynak irsaliye okunuyor…</p>}
    {source&&<><div className="isp-steps"><strong>{step===1?"1 · Giden irsaliye hazırlığı":step===2?"2 · Ticari fatura hazırlığı":"3 · Gönderim öncesi kontrol"}</strong><span>Adım {step}/3</span></div>
    {source.warnings?.map(w=><p key={w} className="isp-warning">{w}</p>)}
    {step===1&&<><div className="isp-scroll"><table><thead><tr><th>Kalem / Birim</th><th>Gelen</th><th>Bağlı sevk</th><th>Hesaplanan bakiye</th><th>Bu sevk</th><th>Sonraki bakiye</th></tr></thead><tbody>{lines.map(l=><tr key={l.id}><td>{l.description} / {l.unit}</td><td>{fmt(l.quantity)}</td><td>{fmt(l.linked)}</td><td>{fmt(l.remaining)}</td><td><input aria-label={l.description+" bu sevk"} type="number" min="0" max={l.remaining} step="any" value={amounts[l.id]??""} onChange={e=>update(setAmounts,l.id,e.target.value)}/></td><td>{Number.isFinite(Number(amounts[l.id]))&&Number(amounts[l.id])>=0&&Number(amounts[l.id])<=l.remaining?fmt(l.remaining-Number(amounts[l.id])):"Kontrol"}</td></tr>)}</tbody></table></div>
    <button type="button" onClick={()=>setAmounts(Object.fromEntries(lines.map(l=>[l.id,String(l.remaining)])))}>Hesaplanan kalanın tamamını al</button>
    <div className="isp-fields">{[["driver","Şoför adı soyadı","text"],["plate","Araç plakası","text"],["date","Sevk tarihi","date"],["time","Sevk saati","time"],["note","İrsaliye notu","text"]].map(([key,label,type])=><label key={key}>{label}<input type={type} value={transport[key]} onChange={e=>update(setTransport,key,e.target.value)}/></label>)}</div>
    <button type="button" disabled={!quantitiesValid||source.blocked||!transport.driver.trim()||!transport.plate.trim()||!transport.date||!transport.time} onClick={()=>setStep(2)}>İrsaliye önizlemesini faturaya çevir</button></>}
    {step===2&&<><p><strong>Senaryo: Ticari fatura · Satış</strong> (mükellef/etiket ve senaryo resmî serviste doğrulanacak). Kaynak: {row.dispatchNo}; gerçek giden irsaliye numarası henüz yok.</p><div className="isp-scroll"><table><thead><tr><th>Kalem</th><th>Adet / birim (kilitli)</th><th>Birim fiyat (TL)</th><th>KDV %</th></tr></thead><tbody>{selected.map(l=><tr key={l.id}><td>{l.description}</td><td>{fmt(amounts[l.id])} {l.unit}</td><td><input aria-label={l.description+" birim fiyat"} type="number" min="0" step="any" value={prices[l.id]??""} onChange={e=>update(setPrices,l.id,e.target.value)}/></td><td><input aria-label={l.description+" KDV"} type="number" min="0" max="100" step="any" value={taxes[l.id]??20} onChange={e=>update(setTaxes,l.id,e.target.value)}/></td></tr>)}</tbody></table></div><label>Fatura notu<textarea value={note} onChange={e=>setNote(e.target.value)}/></label>{plan?<p>Matrah {money(plan.net)} TL · KDV {money(plan.vat)} TL · <strong>Toplam {money(plan.total)} TL</strong></p>:<p>{validation}</p>}<button type="button" onClick={()=>setStep(1)}>Geri</button> <button type="button" disabled={!plan||source.blocked} onClick={()=>setStep(3)}>İleri · taslak önizleme</button></>}
    {step===3&&plan&&<><p>Sevk: {transport.date} {transport.time} · {transport.driver} · {transport.plate}</p><p>İrsaliye notu: {transport.note||"—"} · Fatura notu: {note||"—"}</p><div className="isp-scroll"><table><thead><tr><th>Kalem</th><th>Sevk / fatura</th><th>Birim fiyat</th><th>KDV</th><th>Sonraki bakiye</th><th>Toplam TL</th></tr></thead><tbody>{plan.lines.filter(l=>l.quantity>0).map(l=><tr key={l.id}><td>{l.description}</td><td>{fmt(l.quantity)} {l.unit}</td><td>{money(l.price)}</td><td>%{l.tax}</td><td>{fmt(l.after)}</td><td>{money(l.total)}</td></tr>)}</tbody></table></div><p>Matrah {money(plan.net)} TL · KDV {money(plan.vat)} TL · <strong>Genel toplam {money(plan.total)} TL</strong></p><button type="button" onClick={()=>setStep(2)}>Geri</button> <button type="button" disabled title="Atomik rezervasyon ve resmî servis kabulü gerekli">Taslak oluştur (kapalı)</button> <button type="button" disabled title="Resmî servis kabulü ve açık son onay gerekli">Gönder (kapalı)</button></>}
    </>}
  </section>;
}
