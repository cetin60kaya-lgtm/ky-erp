import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, RefreshCcw, X } from "lucide-react";
import { apiGet, apiPost } from "../../../utils/api";
import "./reconciliationPanel.css";
import { reviewDraft } from "./reconciliationReview";

const currentPeriod = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const money = (value) => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });

export default function ReconciliationPanel({ activeMainCompany, refreshKey = 0 }) {
  const [period, setPeriod] = useState(currentPeriod);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saveLock = useRef(false);
  const loadSeq = useRef(0);
  const params = useMemo(() => ({ mainCompanySlug: activeMainCompany?.slug, mainCompanyId: activeMainCompany?.id }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async () => {
    const requestId = ++loadSeq.current;
    setLoading(true);
    try {
      const result = await apiGet("/muhasebe/workspace/reconciliations", { ...params, period, _ts: Date.now() });
      if (requestId !== loadSeq.current) return;
      const data = result?.data?.data || result?.data || result || {};
      const list = Array.isArray(data.rows) ? data.rows : [];
      setRows(list);
      setDrafts(Object.fromEntries(list.map((row) => [row.company_id, {
        status: row.status || "WAITING",
        counterpartyBalance: row.counterparty_balance ?? "",
        note: row.note || "",
      }])));
      setError("");
    } catch (requestError) {
      if (requestId === loadSeq.current) setError(requestError?.message || "Mutabakat listesi alınamadı.");
    } finally {
      if (requestId === loadSeq.current) setLoading(false);
    }
  }, [params, period]);

  useEffect(() => {
    void load();
    return () => { loadSeq.current += 1; };
  }, [load, refreshKey]);
  useEffect(() => { setPending(null); setMessage(""); }, [period, params]);

  const updateDraft = (id, key, value) => setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), [key]: value } }));

  const requestSave = (row) => {
    if (saving || loading || saveLock.current) return;
    const review = reviewDraft(row, drafts[row.company_id] || {}, period);
    setMessage("");
    if (review.error) { setError(review.error); return; }
    setError("");
    setPending(review);
  };

  const confirmSave = async () => {
    if (!pending || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    const snapshot = pending;
    try {
      await apiPost("/muhasebe/workspace/reconciliations", {
        ...params,
        period: snapshot.period,
        companyId: snapshot.companyId,
        status: snapshot.status,
        counterpartyBalance: snapshot.counterpartyBalance,
        note: snapshot.note,
      });
      setPending(null);
      setMessage(`${snapshot.companyName} mutabakat durumu kaydedildi.`);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Mutabakat sonucu kesinleştirilemedi; yeniden denemeden önce kayıt durumunu kontrol edin.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="reconciliation-panel">
      <header className="reconciliation-head">
        <div><BadgeCheck size={20}/><span><strong>Cari Mutabakat</strong><small>ERP ve karşı bakiye farkı kontrol edilir; kayıt yalnız açık onayla yapılır.</small></span></div>
        <div><input type="month" aria-label="Mutabakat dönemi" disabled={saving} value={period} onChange={(e) => setPeriod(e.target.value)} /><button type="button" disabled={saving || loading} onClick={load}><RefreshCcw size={14}/> Yenile</button></div>
      </header>
      {message ? <div className="accounting-workspace-message" role="status">{message}</div> : null}
      {error ? <div className="accounting-workspace-error" role="alert">{error}</div> : null}
      <div className="reconciliation-table-wrap"><table><thead><tr><th>Firma</th><th>ERP Bakiye</th><th>Karşı Bakiye</th><th>Fark</th><th>Durum</th><th>Not</th><th>İşlem</th></tr></thead><tbody>
        {loading ? <tr><td colSpan="7" className="accounting-workspace-empty">Mutabakatlar yükleniyor...</td></tr> : rows.length ? rows.map((row) => {
          const draft = drafts[row.company_id] || {};
          const raw = String(draft.counterpartyBalance ?? "").trim();
          const difference = raw && Number.isFinite(Number(raw)) ? Number(raw) - Number(row.erp_balance || 0) : null;
          return <tr key={row.company_id}>
            <td><strong>{row.company_name}</strong></td>
            <td>{money(row.erp_balance)}</td>
            <td><input type="number" step="0.01" disabled={saving} aria-label={`${row.company_name} karşı bakiye`} value={draft.counterpartyBalance ?? ""} onChange={(e) => updateDraft(row.company_id, "counterpartyBalance", e.target.value)} /></td>
            <td>{difference === null ? "—" : money(difference)}</td>
            <td><select disabled={saving} aria-label={`${row.company_name} mutabakat durumu`} value={draft.status || "WAITING"} onChange={(e) => updateDraft(row.company_id, "status", e.target.value)}><option value="WAITING">Bekliyor</option><option value="MATCHED">Mutabık</option><option value="DIFFERENCE">Fark Var</option></select></td>
            <td><input disabled={saving} value={draft.note || ""} onChange={(e) => updateDraft(row.company_id, "note", e.target.value)} placeholder={row.difference ? `Fark ${money(row.difference)}` : ""} /></td>
            <td><button type="button" disabled={saving} onClick={() => requestSave(row)}>Kontrol Et</button></td>
          </tr>;
        }) : <tr><td colSpan="7" className="accounting-workspace-empty">Firma bulunamadı.</td></tr>}
      </tbody></table></div>
      {pending ? <div className="reconciliation-confirm-layer" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setPending(null); }}>
        <section className="reconciliation-confirm" role="dialog" aria-modal="true" aria-labelledby="reconciliation-confirm-title">
          <header><h3 id="reconciliation-confirm-title">Mutabakatı Onayla</h3><button type="button" aria-label="Kapat" disabled={saving} onClick={() => setPending(null)}><X size={18}/></button></header>
          <p><strong>{pending.companyName}</strong> için <strong>{pending.period}</strong> dönemi mutabakat kaydını kontrol edin.</p>
          <dl><div><dt>ERP bakiyesi</dt><dd>{money(pending.erpBalance)}</dd></div><div><dt>Karşı bakiye</dt><dd>{pending.counterpartyBalance === "" ? "Bildirilmedi" : money(pending.counterpartyBalance)}</dd></div><div><dt>Fark</dt><dd>{pending.difference === null ? "—" : money(pending.difference)}</dd></div><div><dt>Karar</dt><dd>{pending.status === "MATCHED" ? "Mutabık" : pending.status === "DIFFERENCE" ? "Fark Var" : "Bekliyor"}</dd></div></dl>
          <p>Bu işlem mutabakat durumunu kaydeder; banka ödemesi veya fatura gönderimi yapmaz.</p>
          <footer><button type="button" disabled={saving} onClick={() => setPending(null)}>Vazgeç</button><button type="button" className="accounting-primary" disabled={saving} onClick={confirmSave}>{saving ? "Kaydediliyor..." : "Onayla ve Kaydet"}</button></footer>
        </section>
      </div> : null}
    </section>
  );
}
