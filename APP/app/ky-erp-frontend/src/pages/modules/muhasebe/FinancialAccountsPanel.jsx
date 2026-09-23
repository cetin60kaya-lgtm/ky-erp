import { useCallback, useEffect, useMemo, useState } from "react";
import { Landmark, Plus, RefreshCcw, WalletCards } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../../../utils/api";

const money = (value, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
const emptyForm = () => ({ accountType: "BANK", name: "", bankName: "", iban: "", currency: "TRY", openingBalance: "", note: "" });
const rowsOf = (payload) => Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];

export default function FinancialAccountsPanel({ activeMainCompany, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const params = useMemo(() => ({ mainCompanySlug: activeMainCompany?.slug, mainCompanyId: activeMainCompany?.id }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async () => {
    try {
      const result = await apiGet("/muhasebe/workspace/financial-accounts", { ...params, _ts: Date.now() });
      setRows(rowsOf(result));
      setError("");
    } catch (requestError) {
      setError(requestError?.message || "Banka/kasa hesapları alınamadı.");
    }
  }, [params]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const edit = (row) => {
    setEditingId(row.id);
    setForm({
      accountType: row.account_type || "BANK",
      name: row.name || "",
      bankName: row.bank_name || "",
      iban: row.iban || "",
      currency: row.currency || "TRY",
      openingBalance: row.opening_balance ?? "",
      note: row.note || "",
    });
    setOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Hesap adı zorunludur.");
    setError(""); setMessage("");
    try {
      const body = { ...params, ...form, openingBalance: Number(form.openingBalance || 0) };
      if (editingId) await apiPatch(`/muhasebe/workspace/financial-accounts/${editingId}`, body);
      else await apiPost("/muhasebe/workspace/financial-accounts", body);
      setMessage(editingId ? "Hesap güncellendi." : "Hesap oluşturuldu.");
      setEditingId(""); setForm(emptyForm()); setOpen(false); await load();
    } catch (requestError) { setError(requestError?.message || "Hesap kaydedilemedi."); }
  };

  return (
    <section className="financial-accounts-panel">
      <header className="financial-accounts-head">
        <div><WalletCards size={20}/><span><strong>Banka / Kasa Hesapları</strong><small>Defter hareketleri bu hesaplara bağlanır; bakiye tek kaynaktan hesaplanır.</small></span></div>
        <div><button type="button" onClick={load}><RefreshCcw size={14}/> Yenile</button><button type="button" className="accounting-primary" onClick={() => { setEditingId(""); setForm(emptyForm()); setOpen((value) => !value); }}><Plus size={14}/> Hesap</button></div>
      </header>
      {open ? <form className="financial-account-form" onSubmit={save}>
        <label>Tür<select value={form.accountType} onChange={(e)=>setForm({...form,accountType:e.target.value})}><option value="BANK">Banka</option><option value="CASH">Kasa</option></select></label>
        <label>Hesap adı<input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="Örn. Garanti TL / Ana Kasa" /></label>
        <label>Banka<input value={form.bankName} onChange={(e)=>setForm({...form,bankName:e.target.value})} disabled={form.accountType === "CASH"} /></label>
        <label>IBAN<input value={form.iban} onChange={(e)=>setForm({...form,iban:e.target.value.toUpperCase()})} disabled={form.accountType === "CASH"} /></label>
        <label>Para birimi<input value={form.currency} onChange={(e)=>setForm({...form,currency:e.target.value.toUpperCase()})} /></label>
        <label>Açılış bakiyesi<input type="number" step="0.01" value={form.openingBalance} onChange={(e)=>setForm({...form,openingBalance:e.target.value})} /></label>
        <label className="wide">Not<input value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})} /></label>
        <div className="wide financial-account-actions"><button type="button" onClick={() => setOpen(false)}>Vazgeç</button><button type="submit" className="accounting-primary">{editingId ? "Güncelle" : "Kaydet"}</button></div>
      </form> : null}
      {message ? <div className="accounting-workspace-message">{message}</div> : null}
      {error ? <div className="accounting-workspace-error">{error}</div> : null}
      <div className="financial-account-grid">
        {rows.length ? rows.map((row) => (
          <button type="button" className={`financial-account-card ${row.is_active ? "" : "passive"}`} key={row.id} onClick={() => edit(row)}>
            <span className="financial-account-icon">{row.account_type === "CASH" ? <WalletCards size={18}/> : <Landmark size={18}/>}</span>
            <span><strong>{row.name}</strong><small>{row.account_type === "CASH" ? "Kasa" : (row.bank_name || "Banka")}{row.iban ? ` · ${String(row.iban).slice(-6)}` : ""}</small></span>
            <b>{money(row.current_balance, row.currency)}</b>
          </button>
        )) : <div className="accounting-workspace-empty">Henüz banka/kasa hesabı yok. İlk hesabı açıp defter hareketlerinde seçebilirsiniz.</div>}
      </div>
    </section>
  );
}
