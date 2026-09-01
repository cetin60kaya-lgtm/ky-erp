import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, CalendarDays, CheckCircle2, Plus, WalletCards } from "lucide-react";
import { apiGet, apiPost } from "../../../utils/api";
import "./paymentPlannerPanel.css";

const money = (value, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ counterpartyName: "", amount: "", plannedDate: today(), dueDate: "", priority: "NORMAL", paymentMethod: "BANKA", description: "", reminderEnabled: true, reminderAt: "" });

export default function PaymentPlannerPanel({ activeMainCompany }) {
  const [mode, setMode] = useState("week");
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const params = useMemo(() => ({ mainCompanySlug: activeMainCompany?.slug, mainCompanyId: activeMainCompany?.id }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    setLoading(true); setError("");
    try {
      const path = mode === "weekend" ? "/muhasebe/odeme-plani/hafta-sonu" : "/muhasebe/odeme-plani/hafta";
      const result = await apiGet(path, params);
      setRange({ from: result?.data?.from, to: result?.data?.to });
      setRows(Array.isArray(result?.data?.rows) ? result.data.rows : []);
    } catch (e) { setError(e?.message || "Ödeme planı alınamadı."); }
    finally { setLoading(false); }
  }, [activeMainCompany?.slug, mode, params]);

  useEffect(() => { void load(); }, [load]);

  const save = async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    if (!form.counterpartyName.trim() || Number(form.amount || 0) <= 0) { setError("Ödeme yapılacak kişi/firma ve tutar zorunludur."); return; }
    try {
      await apiPost("/muhasebe/odeme-plani", { ...params, ...form, amount: Number(form.amount), reminderAt: form.reminderAt || null });
      setMessage("Ödeme planı kaydedildi."); setForm(emptyForm()); setShowForm(false); await load();
    } catch (e) { setError(e?.message || "Ödeme planı kaydedilemedi."); }
  };

  const markPaid = async (row) => {
    setError(""); setMessage("");
    try {
      await apiPost(`/muhasebe/odeme-plani/${row.id}/paid`, { ...params, paidAmount: Number(row.amount || 0), paymentDate: today(), paymentMethod: row.payment_method });
      setMessage(`${row.counterparty_name} ödemesi işlendi ve deftere yazıldı.`); await load();
    } catch (e) { setError(e?.message || "Ödeme işlenemedi."); }
  };

  return (
    <section className="payment-planner-card">
      <header>
        <div><WalletCards size={20} /><span><strong>Ödeme Planı</strong><small>Kime, ne zaman ve ne kadar ödeme yapılacağını haftalık yönetin.</small></span></div>
        <button type="button" onClick={() => setShowForm((v) => !v)}><Plus size={15} /> Yeni ödeme</button>
      </header>
      <div className="payment-planner-tabs">
        <button type="button" className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}><CalendarDays size={14} /> Bu Hafta</button>
        <button type="button" className={mode === "weekend" ? "active" : ""} onClick={() => setMode("weekend")}><BellRing size={14} /> Hafta Sonu</button>
        <span>{range.from && range.to ? `${range.from} → ${range.to}` : ""}</span>
      </div>
      {showForm ? <form className="payment-planner-form" onSubmit={save}>
        <label>Kişi / Firma<input value={form.counterpartyName} onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })} /></label>
        <label>Tutar<input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
        <label>Planlanan Tarih<input type="date" value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} /></label>
        <label>Vade<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
        <label>Öncelik<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="NORMAL">Normal</option><option value="HIGH">Yüksek</option><option value="URGENT">Acil</option></select></label>
        <label>Ödeme Şekli<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option value="BANKA">Banka</option><option value="KASA">Kasa</option><option value="CEK">Çek</option><option value="DIGER">Diğer</option></select></label>
        <label className="wide">Açıklama<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>Hatırlatma<input type="datetime-local" value={form.reminderAt} onChange={(e) => setForm({ ...form, reminderAt: e.target.value })} /></label>
        <button type="submit">Kaydet</button>
      </form> : null}
      {message ? <div className="payment-message ok">{message}</div> : null}{error ? <div className="payment-message error">{error}</div> : null}
      <div className="payment-table-wrap"><table><thead><tr><th>Tarih</th><th>Kişi / Firma</th><th>Tutar</th><th>Öncelik</th><th>Ödeme Şekli</th><th>Durum</th><th></th></tr></thead><tbody>
        {loading ? <tr><td colSpan="7">Yükleniyor…</td></tr> : rows.length ? rows.map((row) => <tr key={row.id}><td>{row.planned_date || row.due_date || "-"}</td><td><strong>{row.counterparty_name}</strong><small>{row.description || ""}</small></td><td>{money(row.amount, row.currency)}</td><td>{row.priority}</td><td>{row.payment_method || "-"}</td><td>{row.status}</td><td><button type="button" className="paid-btn" onClick={() => markPaid(row)}><CheckCircle2 size={14} /> Ödendi</button></td></tr>) : <tr><td colSpan="7">Bu dönem için planlanmış ödeme yok.</td></tr>}
      </tbody></table></div>
    </section>
  );
}
