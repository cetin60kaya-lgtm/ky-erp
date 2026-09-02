import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { addCompanyBillingMovement, getCompanyBilling, listBillingCompanies, saveCompanyBillingAccount } from "../../services/adminBillingApi";
import "./AdminCompanyBilling.css";

const ownerRole = (role) => ["SUPER_ADMIN", "ADMIN"].includes(String(role || "").toUpperCase().replace(/İ/g, "I"));
const n = (value) => Number(value || 0);
const fmt = (value) => n(value).toLocaleString("tr-TR");
const money = (minor, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(n(minor) / 100);
const dateText = (value) => { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR"); };
const emptyAccount = () => ({ planCode:"STANDARD",status:"ACTIVE",currency:"TRY",includedCredits:0,monthlySpendLimitMinor:0,overagePriceMinorPer1k:0,customPriceJson:"{}",periodStart:"",periodEnd:"",nextRenewalAt:"" });

export default function AdminCompanyBilling({ activeMainCompany }) {
  const { user } = useAuth();
  const isOwner = ownerRole(user?.role);
  const [companies,setCompanies] = useState([]);
  const [selected,setSelected] = useState("");
  const [billing,setBilling] = useState(null);
  const [form,setForm] = useState(emptyAccount());
  const [movement,setMovement] = useState({movementType:"GRANT",creditDelta:"",amountMinor:"",note:""});
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("Paket ve kullanım bilgileri yükleniyor...");

  const loadCompanies = useCallback(async()=>{
    try {
      const rows = await listBillingCompanies();
      const list = Array.isArray(rows) ? rows : [];
      setCompanies(list);
      const preferred = activeMainCompany?.slug || user?.mainCompanySlug || "";
      setSelected((current)=>list.some((row)=>row.slug===current)?current:(list.some((row)=>row.slug===preferred)?preferred:(list[0]?.slug||"")));
    } catch(error) { setMessage(`Hata: ${error?.message || "Firma listesi alınamadı."}`); }
  },[activeMainCompany?.slug,user?.mainCompanySlug]);

  const loadBilling = useCallback(async()=>{
    if(!selected){setBilling(null);return;}
    setBusy(true);
    try{
      const data = await getCompanyBilling(selected);
      setBilling(data);
      const account = data?.account || {};
      setForm({
        planCode:account.planCode||"STANDARD",status:account.status||"ACTIVE",currency:account.currency||"TRY",
        includedCredits:n(account.includedCredits),monthlySpendLimitMinor:n(account.monthlySpendLimitMinor),
        overagePriceMinorPer1k:n(account.overagePriceMinorPer1k),customPriceJson:account.customPriceJson||"{}",
        periodStart:account.periodStart||"",periodEnd:account.periodEnd||"",nextRenewalAt:account.nextRenewalAt||"",
      });
      setMessage("Firma paket, token ve ücretlendirme bilgileri güncel.");
    }catch(error){setBilling(null);setMessage(`Hata: ${error?.message||"Ücretlendirme bilgisi alınamadı."}`);}
    finally{setBusy(false);}
  },[selected]);

  useEffect(()=>{loadCompanies();},[loadCompanies]);
  useEffect(()=>{loadBilling();},[loadBilling]);

  const selectedCompany = useMemo(()=>companies.find((row)=>row.slug===selected)||null,[companies,selected]);
  const currency = form.currency || billing?.account?.currency || "TRY";
  const usage = billing?.usage || {};

  async function saveAccount(event){
    event.preventDefault(); if(!isOwner||!selected)return;
    setBusy(true);
    try{
      const data=await saveCompanyBillingAccount(selected,{...form,includedCredits:n(form.includedCredits),monthlySpendLimitMinor:n(form.monthlySpendLimitMinor),overagePriceMinorPer1k:n(form.overagePriceMinorPer1k)});
      setBilling((old)=>({...old,...data,company:old?.company}));setMessage("Firma paket ve fiyat ayarları kaydedildi.");await loadBilling();
    }catch(error){setMessage(`Hata: ${error?.message||"Paket ayarları kaydedilemedi."}`);}finally{setBusy(false);}
  }

  async function addMovement(event){
    event.preventDefault(); if(!isOwner||!selected)return;
    const creditDelta=Number(movement.creditDelta||0),amountMinor=Number(movement.amountMinor||0);
    if(!creditDelta&&!amountMinor){setMessage("Hata: Kredi veya tutar hareketi girin.");return;}
    setBusy(true);
    try{
      await addCompanyBillingMovement(selected,{movementType:movement.movementType,creditDelta,amountMinor,currency,note:movement.note});
      setMovement({movementType:"GRANT",creditDelta:"",amountMinor:"",note:""});setMessage("Firma kredi/ücret hareketi kaydedildi.");await loadBilling();
    }catch(error){setMessage(`Hata: ${error?.message||"Hareket kaydedilemedi."}`);}finally{setBusy(false);}
  }

  return <div className="acb-page">
    <header className="acb-head"><div><small>YÖNETİM / FİRMA / PAKET & KULLANIM</small><h1>Firma Paket, Token ve Ücretlendirme Merkezi</h1><p>Gerçek model tokenları teknik kullanım defterinde; müşteriye verilen haklar kredi ve fiyat katmanında ayrı tutulur.</p></div><button type="button" onClick={()=>{loadCompanies();loadBilling();}} disabled={busy}>Yenile</button></header>
    <div className={`acb-notice ${message.startsWith("Hata:")?"bad":""}`}>{message}</div>
    <section className="acb-companybar"><label>Firma<select value={selected} onChange={(e)=>setSelected(e.target.value)}>{companies.map((row)=><option key={row.slug} value={row.slug}>{row.name||row.slug}</option>)}</select></label><div><b>{selectedCompany?.name||selected||"Firma seçilmedi"}</b><span>{isOwner?"Uygulama sahibi — düzenleme açık":"Firma görünümü — fiyat değişikliği kapalı"}</span></div></section>

    <section className="acb-metrics">
      <div><span>Girdi Token</span><b>{fmt(usage.inputTokens)}</b></div><div><span>Çıktı Token</span><b>{fmt(usage.outputTokens)}</b></div><div><span>Toplam Token</span><b>{fmt(usage.totalTokens)}</b></div><div><span>Kullanılabilir Kredi</span><b>{fmt(billing?.availableCredits)}</b></div><div><span>Kullanım Tutarı</span><b>{money(usage.amountMinor,currency)}</b></div><div><span>Hareket Toplamı</span><b>{money(billing?.billing?.amountMinor,currency)}</b></div>
    </section>

    <div className="acb-grid">
      <form className="acb-card" onSubmit={saveAccount}><div className="acb-cardhead"><div><h2>Paket & Fiyat Ayarları</h2><p>Firma bazlı plan, dönem, dahil kredi, limit ve aşım fiyatı.</p></div></div>
        <div className="acb-formgrid"><label>Paket Kodu<input value={form.planCode} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,planCode:e.target.value}))}/></label><label>Durum<select value={form.status} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,status:e.target.value}))}><option>ACTIVE</option><option>TRIAL</option><option>PAUSED</option><option>CANCELLED</option></select></label><label>Para Birimi<input maxLength={3} value={form.currency} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,currency:e.target.value.toUpperCase()}))}/></label><label>Dahil Kredi<input type="number" min="0" value={form.includedCredits} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,includedCredits:e.target.value}))}/></label><label>Aylık Harcama Limiti (kuruş)<input type="number" min="0" value={form.monthlySpendLimitMinor} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,monthlySpendLimitMinor:e.target.value}))}/></label><label>1.000 Kredi Aşım Fiyatı (kuruş)<input type="number" min="0" value={form.overagePriceMinorPer1k} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,overagePriceMinorPer1k:e.target.value}))}/></label><label>Dönem Başlangıcı<input type="date" value={form.periodStart?.slice(0,10)||""} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,periodStart:e.target.value}))}/></label><label>Dönem Bitişi<input type="date" value={form.periodEnd?.slice(0,10)||""} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,periodEnd:e.target.value}))}/></label><label>Sonraki Yenileme<input type="date" value={form.nextRenewalAt?.slice(0,10)||""} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,nextRenewalAt:e.target.value}))}/></label><label className="wide">Firma Özel Fiyat JSON<textarea value={form.customPriceJson} disabled={!isOwner} onChange={(e)=>setForm((v)=>({...v,customPriceJson:e.target.value}))}/></label></div>
        {isOwner&&<button className="primary" type="submit" disabled={busy||!selected}>Paket ve Fiyatı Kaydet</button>}
      </form>

      <form className="acb-card" onSubmit={addMovement}><div className="acb-cardhead"><div><h2>Kredi / Ücret Hareketi</h2><p>Ek paket, düzeltme, iade veya ücret hareketi değişmez kayıt olarak eklenir.</p></div></div>
        <div className="acb-formgrid"><label>Hareket<select value={movement.movementType} disabled={!isOwner} onChange={(e)=>setMovement((v)=>({...v,movementType:e.target.value}))}><option>GRANT</option><option>ADJUSTMENT</option><option>REFUND</option><option>CHARGE</option></select></label><label>Kredi Değişimi<input type="number" value={movement.creditDelta} disabled={!isOwner} onChange={(e)=>setMovement((v)=>({...v,creditDelta:e.target.value}))} placeholder="+50000 veya -5000"/></label><label>Tutar (kuruş)<input type="number" value={movement.amountMinor} disabled={!isOwner} onChange={(e)=>setMovement((v)=>({...v,amountMinor:e.target.value}))}/></label><label className="wide">Açıklama<textarea value={movement.note} disabled={!isOwner} onChange={(e)=>setMovement((v)=>({...v,note:e.target.value}))}/></label></div>
        {isOwner&&<button className="primary" type="submit" disabled={busy||!selected}>Hareket Ekle</button>}
        <div className="acb-note">Kalan hak doğrudan elle yazılmaz: dahil kredi + kullanım hareketleri + kredi hareketleri üzerinden hesaplanır.</div>
      </form>
    </div>

    <section className="acb-card"><div className="acb-cardhead"><div><h2>AI Kullanım Defteri</h2><p>Provider/model bazında gerçek input-output token hareketleri. Bu tablo AI çağrıları tarafından beslenir; ekrandan sahte kullanım üretilemez.</p></div></div><div className="acb-table"><div className="row head"><span>Tarih</span><span>Sağlayıcı / Model</span><span>Girdi</span><span>Çıktı</span><span>Toplam</span><span>Tutar</span></div>{(billing?.usageLedger||[]).map((row)=><div className="row" key={row.id}><span>{dateText(row.occurredAt)}</span><span>{row.provider||"-"} / {row.model||"-"}</span><span>{fmt(row.inputTokens)}</span><span>{fmt(row.outputTokens)}</span><span>{fmt(row.totalTokens)}</span><span>{money(row.amountMinor,currency)}</span></div>)}{!(billing?.usageLedger||[]).length&&<div className="empty">Henüz AI kullanım hareketi yok.</div>}</div></section>
    <section className="acb-card"><div className="acb-cardhead"><div><h2>Ücretlendirme Hareket Defteri</h2><p>Paket/kredi hareketleri silinmeden geçmiş olarak korunur.</p></div></div><div className="acb-table"><div className="row head billing"><span>Tarih</span><span>Tür</span><span>Kredi</span><span>Tutar</span><span>Açıklama</span></div>{(billing?.billingLedger||[]).map((row)=><div className="row billing" key={row.id}><span>{dateText(row.createdAt)}</span><span>{row.movementType}</span><span>{fmt(row.creditDelta)}</span><span>{money(row.amountMinor,row.currency||currency)}</span><span>{row.note||"-"}</span></div>)}{!(billing?.billingLedger||[]).length&&<div className="empty">Henüz ücretlendirme hareketi yok.</div>}</div></section>
  </div>;
}
