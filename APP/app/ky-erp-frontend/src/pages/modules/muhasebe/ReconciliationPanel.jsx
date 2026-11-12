import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, RefreshCcw, X } from "lucide-react";
import { apiGet, apiPost, apiUpload } from "../../../utils/api";
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
  const [weekCompanyId,setWeekCompanyId] = useState("");
  const [weekCurrent,setWeekCurrent] = useState(null);
  const [weekPrevious,setWeekPrevious] = useState(null);
  const [weeklyReport,setWeeklyReport] = useState(null);
  const [weekBusy,setWeekBusy] = useState(false);
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

  const previewWeekly = async () => {
    if (!weekCompanyId || !weekCurrent || weekBusy) { setError("Cari ve bu haftanın XLSX/CSV dosyasını seçin.");return; }
    const data = new FormData();
    data.append("mainCompanySlug", String(params.mainCompanySlug || ""));
    data.append("companyId", weekCompanyId);
    data.append("currentFile", weekCurrent);
    if (weekPrevious) data.append("previousFile", weekPrevious);
    setWeekBusy(true);setWeeklyReport(null);setError("");
    try{
      const response = await apiUpload("/muhasebe/weekly-cari-preview",data);
      const parsed = response?.data?.data || response?.data || response;
      if (!parsed?.summary || !Array.isArray(parsed.rows)) throw new Error("Cari rapor önizlemesi doğrulanamadı.");
      setWeeklyReport(parsed);
    }catch(e){setError(e?.message || "Ekstre önizlemesi oluşturulamadı. Hiçbir cari/ödeme kaydı değiştirilmedi.");}
    finally{setWeekBusy(false);}
  };
  const weeklyLabel = (status) => ({
    NEW_ON_STATEMENT:"Yeni ekstre kaydı",MISSING_ON_CURRENT_REVIEW:"Yeni ekstrede yok — teyit",AMOUNT_CHANGED_REVIEW:"Tutar değişti — teyit",
    DUPLICATE_REVIEW:"Mükerrer satır — teyit",GROUP_CONFLICT_REVIEW:"Grup uyuşmazlığı",PRESENT_BOTH_REVIEW:"İki ekstrede mevcut"
  }[status] || "İncele");

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
      <details className="weekly-cari-preview">
        <summary>Haftalık müşteri XLSX cari karşılaştırması</summary>
        <p>Yalnız okuma/önizleme. Ekstrede görünmeyen fatura otomatik ödenmiş veya iptal edilmiş sayılmaz. Ödeme ve bakiye ayrı onaylanır.</p>
        <div className="weekly-cari-fields">
          <label>Cari / müşteri<select value={weekCompanyId} disabled={weekBusy} onChange={(e)=>{setWeekCompanyId(e.target.value);setWeeklyReport(null);}}><option value="">Cari seçin</option>{rows.map(r=><option key={r.company_id} value={r.company_id}>{r.company_name}</option>)}</select></label>
          <label>Bu haftanın ekstresi<input type="file" accept=".xlsx,.xls,.csv" disabled={weekBusy} onChange={e=>{setWeekCurrent(e.target.files?.[0]||null);setWeeklyReport(null);}} /></label>
          <label>Geçen haftanın ekstresi (isteğe bağlı)<input type="file" accept=".xlsx,.xls,.csv" disabled={weekBusy} onChange={e=>{setWeekPrevious(e.target.files?.[0]||null);setWeeklyReport(null);}} /></label>
          <button type="button" onClick={previewWeekly} disabled={weekBusy||!weekCompanyId||!weekCurrent}>{weekBusy?"Dosyalar kontrol ediliyor...":"HKN ve Cari Farklarını İncele"}</button>
        </div>
        {weeklyReport ? <section className="weekly-cari-results">
          <strong>{weeklyReport.companyName} · Salt okunur karşılaştırma</strong>
          <p>{weeklyReport.summary.inCurrent} güncel HKN · {weeklyReport.summary.notInErp} ERP'de kesin eşleşmeyen · {weeklyReport.summary.disappeared} bu hafta görünmeyen · {weeklyReport.summary.changed} tutarı değişen. Belirsiz satırlar: {weeklyReport.source.currentAmbiguousRows}.</p>
          <div className="weekly-cari-groups">{weeklyReport.groups.map(g=><span key={g.groupCode}>{g.groupCode}: {g.current} HKN · {g.needsReview} inceleme</span>)}</div>
          <div className="reconciliation-table-wrap"><table><thead><tr><th>HKN Fatura</th><th>Grup</th><th>Ekstre farkı</th><th>ERP kaydı</th><th>Karşı bakiye</th></tr></thead><tbody>
            {weeklyReport.rows.slice(0,200).map(item=><tr key={item.invoiceNo}><td>{item.invoiceNo}</td><td>{item.groupCode||"Belirsiz"}</td><td>{weeklyLabel(item.state)}</td><td>{item.erpPresent?"Var":"Kesin eşleşme yok"}</td><td>{item.balance==null?"Doğrulanmadı":money(item.balance)}</td></tr>)}
          </tbody></table></div>
          {weeklyReport.rows.length>200?<p>İlk 200 HKN gösteriliyor. Toplam {weeklyReport.rows.length} kayıt; özet toplam üzerinden hesaplandı.</p>:null}
          <p>Önizleme hiçbir borç, tahsilat, ödeme veya gönderim kaydı oluşturmadı.</p>
        </section>:null}
      </details>
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
