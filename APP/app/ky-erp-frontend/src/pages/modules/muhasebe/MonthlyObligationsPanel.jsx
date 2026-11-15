import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../../utils/api";
import { weeklyReminderDate } from "./weeklyReminderDate";

const unwrap = r => r?.data?.data ?? r?.data ?? r ?? {};
const money = v => Number(v || 0).toLocaleString("tr-TR",{style:"currency",currency:"TRY"});
const todayMonth = () => new Date().toISOString().slice(0,7);
export default function MonthlyObligationsPanel({ activeMainCompany, refreshKey = 0, selectedCompanyId = "", selectedCompanyName = "" }) {
  const [month,setMonth] = useState(todayMonth);
  const [data,setData] = useState({});
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [loading,setLoading] = useState(false);
  const [reference,setReference] = useState({});
  const [rule,setRule] = useState({weekday:5,advanceDays:2});
  const [firmId,setFirmId] = useState(selectedCompanyId);
  const [firmName,setFirmName] = useState(selectedCompanyName);
  const [busy,setBusy] = useState(false);
  const slug = activeMainCompany?.slug || "";
  const qs = useMemo(()=>({mainCompanySlug:slug,month}),[slug,month]);
  useEffect(()=>{setFirmId(selectedCompanyId);setFirmName(selectedCompanyName);},[selectedCompanyId,selectedCompanyName]);
  const load = useCallback(async()=>{
    if(!slug) return;
    setLoading(true);setError("");
    try{const response=await apiGet("/muhasebe/obligations/overview",qs);setData(unwrap(response));}
    catch(e){setError(e?.message||"Aylık yükümlülükler getirilemedi.");setData({});}
    finally{setLoading(false);}
  },[qs,slug]);
  useEffect(()=>{void load();},[load,refreshKey]);
  const reportPayment = async (row,state)=>{
    if(busy) return;
    const paymentReference=String(reference[row.key]||"").trim();
    if(state==="PAYMENT_REPORTED"&&!paymentReference){setError("Ödeme referansı zorunlu.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      await apiPost("/muhasebe/obligations/period-status?mainCompanySlug="+encodeURIComponent(slug),{
        templateId:row.id,month:row.month,state,paymentReference
      });
      setNotice("Ödeme bildirimi güncellendi. Banka/defter hareketi ayrıca doğrulanmalı.");
      await load();
    }catch(e){setError(e?.message||"Durum kaydedilemedi.");}
    finally{setBusy(false);}
  };
  const saveRule=async()=>{
    if(busy)return;
    if(!firmId || !firmName.trim()){setError("Firma kartından açın veya kayıtlı firma kimliğini ve adını girin.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      await apiPost("/muhasebe/obligations/reminder-rules?mainCompanySlug="+encodeURIComponent(slug),{
        firmId,companyName:firmName,weekday:Number(rule.weekday),advanceDays:Number(rule.advanceDays),active:true
      });
      setNotice("Haftalık uygulama içi hatırlatma kuralı kaydedildi.");await load();
    }catch(e){setError(e?.message||"Hatırlatma kaydedilemedi.");}
    finally{setBusy(false);}
  };
  const planned=Array.isArray(data.planned)?data.planned:[];
  const alerts=Array.isArray(data.alerts)?data.alerts:[];
  const hint=weeklyReminderDate(Number(rule.weekday),Number(rule.advanceDays));
  return <section className="payment-planner-card" aria-label="Aylık yükümlülükler ve hatırlatmalar">
    <header><div><strong>Aylık Ödemelerim & Hatırlatmalar</strong><small>Sabit gider takvimi · ödeme bildirimi · firma hatırlatması</small></div><button type="button" onClick={load}>Yenile</button></header>
    <div className="payment-planner-form">
      <label>Dönem (ay)<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
      <div><strong>Plan: {money(data.summary?.plannedAmount)}</strong> · Bildirilen ödeme: {money(data.summary?.declaredPaidAmount)} · Açık plan: {money(data.summary?.remainingPlannedAmount)}</div>
    </div>
    <p>Planlanan tutar kesin gider/cari borç değildir. Ödeme bildirimi banka, kasa veya SGK/KDV tahakkuku oluşturmaz.</p>
    {loading?<p>Yükleniyor…</p>:null}
    {error?<div className="payment-message error" role="alert">{error}</div>:null}
    {notice?<div className="payment-message ok" role="status">{notice}</div>:null}
    <div className="payment-table-wrap"><table><thead><tr><th>Dönem</th><th>Firma / Gider</th><th>Tutar</th><th>Tür</th><th>Durum</th><th>Ödeme referansı</th><th>İşlem</th></tr></thead>
      <tbody>{planned.length?planned.map(r=><tr key={r.key}>
        <td>{r.month}</td><td><strong>{r.title}</strong><small>{r.companyName||r.category}</small></td>
        <td>{money(r.amount)}</td><td>{r.recordType==="GAYRI_RESMI"?"Gayriresmî":"Resmî"}</td>
        <td>{r.state==="PAYMENT_REPORTED"?"Ödeme bildirildi":"Planlandı"}</td>
        <td><input aria-label={r.title+" ödeme referansı"} value={reference[r.key]??r.paymentReference??""} onChange={e=>setReference(v=>({...v,[r.key]:e.target.value}))} placeholder="Dekont / defter no"/></td>
        <td><button type="button" disabled={busy} onClick={()=>reportPayment(r,r.state==="PAYMENT_REPORTED"?"PLANNED":"PAYMENT_REPORTED")}>{r.state==="PAYMENT_REPORTED"?"Bildirim geri al":"Ödeme bildir"}</button></td>
      </tr>):<tr><td colSpan="7">Bu ay için aylık gider planı yok. Kâr/Zarar içinden ay bazlı sabit gider tanımlayın.</td></tr>}</tbody></table></div>
    <hr/>
    <h3>Firma ödeme hatırlatması</h3>
    <div className="payment-planner-form">
      <label>Firma kimliği<input value={firmId} onChange={e=>setFirmId(e.target.value)} placeholder="Firma kartından açın"/></label>
      <label>Firma adı<input value={firmName} onChange={e=>setFirmName(e.target.value)} placeholder="Firma adı"/></label>
      <label>Ödeme günü<select value={rule.weekday} onChange={e=>setRule(v=>({...v,weekday:Number(e.target.value)}))}>
        <option value={1}>Pazartesi</option><option value={2}>Salı</option><option value={3}>Çarşamba</option><option value={4}>Perşembe</option><option value={5}>Cuma</option><option value={6}>Cumartesi</option><option value={0}>Pazar</option>
      </select></label>
      <label>Kaç gün önce?<select value={rule.advanceDays} onChange={e=>setRule(v=>({...v,advanceDays:Number(e.target.value)}))}>{[0,1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} gün</option>)}</select></label>
      <div>Örnek gelecek uyarı: {hint?.remindOn||"-"} · Ödeme: {hint?.dueDate||"-"}</div>
      <button type="button" disabled={busy} onClick={saveRule}>Hatırlatmayı kaydet</button>
    </div>
    <div className="payment-table-wrap"><table><thead><tr><th>Firma</th><th>Ödeme günü</th><th>Hatırlatma</th><th>Kanaldaki durum</th></tr></thead>
      <tbody>{alerts.length?alerts.map(r=><tr key={r.id||r.fileName}><td>{r.companyName}</td><td>{r.dueDate||"-"}</td><td>{r.remindOn||"-"}</td><td>Uygulama içi · {r.active===false?"Kapalı":"Aktif"}</td></tr>):<tr><td colSpan="4">Henüz kayıtlı hatırlatma yok.</td></tr>}</tbody></table></div>
  </section>;
}
