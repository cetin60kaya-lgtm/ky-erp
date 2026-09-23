import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, RefreshCcw } from "lucide-react";
import { apiGet, apiPost } from "../../../utils/api";

const currentPeriod = () => new Date().toISOString().slice(0, 7);
const money = (value) => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });

export default function ReconciliationPanel({ activeMainCompany, refreshKey = 0 }) {
  const [period, setPeriod] = useState(currentPeriod);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const params = useMemo(() => ({ mainCompanySlug: activeMainCompany?.slug, mainCompanyId: activeMainCompany?.id }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async () => {
    try {
      const result = await apiGet("/muhasebe/workspace/reconciliations", { ...params, period, _ts: Date.now() });
      const data = result?.data || result || {};
      const list = Array.isArray(data.rows) ? data.rows : [];
      setRows(list);
      setDrafts(Object.fromEntries(list.map((row) => [row.company_id, {
        status: row.status || "WAITING",
        counterpartyBalance: row.counterparty_balance ?? "",
        note: row.note || "",
      }])));
      setError("");
    } catch (requestError) { setError(requestError?.message || "Mutabakat listesi alınamadı."); }
  }, [params, period]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const updateDraft = (id, key, value) => setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), [key]: value } }));

  const save = async (row) => {
    const draft = drafts[row.company_id] || {};
    setError(""); setMessage("");
    try {
      await apiPost("/muhasebe/workspace/reconciliations", {
        ...params,
        period,
        companyId: row.company_id,
        status: draft.status || "WAITING",
        counterpartyBalance: draft.counterpartyBalance,
        note: draft.note,
      });
      setMessage(`${row.company_name} mutabakat durumu kaydedildi.`);
      await load();
    } catch (requestError) { setError(requestError?.message || "Mutabakat kaydedilemedi."); }
  };

  return (
    <section className="reconciliation-panel">
      <header className="reconciliation-head">
        <div><BadgeCheck size={20}/><span><strong>Cari Mutabakat</strong><small>Ekstre sonrası yalnız durum ve farkı kaydedin; ayrı bir modül kalabalığı oluşturmaz.</small></span></div>
        <div><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /><button type="button" onClick={load}><RefreshCcw size={14}/> Yenile</button></div>
      </header>
      {message ? <div className="accounting-workspace-message">{message}</div> : null}
      {error ? <div className="accounting-workspace-error">{error}</div> : null}
      <div className="reconciliation-table-wrap"><table><thead><tr><th>Firma</th><th>ERP Bakiye</th><th>Karşı Bakiye</th><th>Durum</th><th>Not</th><th></th></tr></thead><tbody>
        {rows.length ? rows.map((row) => { const draft = drafts[row.company_id] || {}; return <tr key={row.company_id}>
          <td><strong>{row.company_name}</strong></td>
          <td>{money(row.erp_balance)}</td>
          <td><input type="number" step="0.01" value={draft.counterpartyBalance ?? ""} onChange={(e) => updateDraft(row.company_id, "counterpartyBalance", e.target.value)} /></td>
          <td><select value={draft.status || "WAITING"} onChange={(e) => updateDraft(row.company_id, "status", e.target.value)}><option value="WAITING">Bekliyor</option><option value="MATCHED">Mutabık</option><option value="DIFFERENCE">Fark Var</option></select></td>
          <td><input value={draft.note || ""} onChange={(e) => updateDraft(row.company_id, "note", e.target.value)} placeholder={row.difference ? `Fark ${money(row.difference)}` : ""} /></td>
          <td><button type="button" onClick={() => save(row)}>Kaydet</button></td>
        </tr>; }) : <tr><td colSpan="6" className="accounting-workspace-empty">Firma bulunamadı.</td></tr>}
      </tbody></table></div>
    </section>
  );
}
