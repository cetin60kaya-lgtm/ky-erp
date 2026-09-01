import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Plus, RefreshCcw } from "lucide-react";
import { apiGet, apiPost } from "../../../utils/api";
import "./accountingLedgerPanel.css";

const today = () => new Date().toISOString().slice(0, 10);
const money = (value, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
const emptyForm = () => ({ entryDate: today(), entryType: "ODEME", recordScope: "OFFICIAL", companyName: "", description: "", debit: "", credit: "", paymentMethod: "BANKA", note: "" });

export default function AccountingLedgerPanel({ activeMainCompany }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const params = useMemo(() => ({ mainCompanySlug: activeMainCompany?.slug, mainCompanyId: activeMainCompany?.id }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    try {
      const result = await apiGet("/muhasebe/defter", { ...params, take: 80 });
      setRows(Array.isArray(result?.data) ? result.data : []);
    } catch (e) { setError(e?.message || "Defter hareketleri alınamadı."); }
  }, [activeMainCompany?.slug, params]);

  useEffect(() => { void load(); }, [load]);

  const save = async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    const debit = Number(form.debit || 0), credit = Number(form.credit || 0);
    if (debit <= 0 && credit <= 0) { setError("Borç veya alacak tutarı girin."); return; }
    try {
      await apiPost("/muhasebe/defter", { ...params, ...form, debit, credit });
      setMessage("Defter hareketi kaydedildi."); setForm(emptyForm()); setOpen(false); await load();
    } catch (e) { setError(e?.message || "Defter hareketi kaydedilemedi."); }
  };

  return <section className="ledger-panel">
    <header><div><BookOpenCheck size={20}/><span><strong>Hızlı Defter</strong><small>Resmî kayıtları ve henüz resmî belgeye bağlanmamış iç operasyon hareketlerini ayrı izleyin.</small></span></div><div className="ledger-actions"><button type="button" onClick={load}><RefreshCcw size={14}/> Yenile</button><button type="button" className="primary" onClick={() => setOpen((v) => !v)}><Plus size={14}/> Hareket</button></div></header>
    {open ? <form className="ledger-form" onSubmit={save}>
      <label>Tarih<input type="date" value={form.entryDate} onChange={(e)=>setForm({...form,entryDate:e.target.value})}/></label>
      <label>İşlem<select value={form.entryType} onChange={(e)=>setForm({...form,entryType:e.target.value})}><option value="TAHSILAT">Tahsilat</option><option value="ODEME">Ödeme</option><option value="ALACAK">Alacak</option><option value="BORC">Borç</option><option value="MASRAF">Masraf</option><option value="BANKA">Banka</option><option value="KASA">Kasa</option><option value="DUZELTME">Düzeltme</option></select></label>
      <label>Kayıt sınıfı<select value={form.recordScope} onChange={(e)=>setForm({...form,recordScope:e.target.value})}><option value="OFFICIAL">Resmî</option><option value="INTERNAL">İç / Operasyon</option></select></label>
      <label>Firma / Kişi<input value={form.companyName} onChange={(e)=>setForm({...form,companyName:e.target.value})}/></label>
      <label>Borç / Çıkış<input type="number" step="0.01" value={form.debit} onChange={(e)=>setForm({...form,debit:e.target.value})}/></label>
      <label>Alacak / Giriş<input type="number" step="0.01" value={form.credit} onChange={(e)=>setForm({...form,credit:e.target.value})}/></label>
      <label className="wide">Açıklama<input value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label>
      <button type="submit">Kaydet</button>
    </form> : null}
    {message?<div className="ledger-message ok">{message}</div>:null}{error?<div className="ledger-message error">{error}</div>:null}
    <div className="ledger-table-wrap"><table><thead><tr><th>Tarih</th><th>Firma / Kişi</th><th>İşlem</th><th>Sınıf</th><th>Açıklama</th><th>Borç</th><th>Alacak</th></tr></thead><tbody>{rows.length?rows.map((row)=><tr key={row.id}><td>{row.entry_date}</td><td>{row.company_name||"-"}</td><td>{row.entry_type}</td><td>{row.record_scope==="INTERNAL"?"İç / Operasyon":"Resmî"}</td><td>{row.description||"-"}</td><td>{row.debit?money(row.debit,row.currency):"-"}</td><td>{row.credit?money(row.credit,row.currency):"-"}</td></tr>):<tr><td colSpan="7">Defter hareketi yok.</td></tr>}</tbody></table></div>
  </section>;
}
