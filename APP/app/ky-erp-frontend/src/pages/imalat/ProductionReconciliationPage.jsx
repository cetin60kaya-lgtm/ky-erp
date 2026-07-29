import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Factory,
  FileClock,
  Link2,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { getDesignCompanies } from "../../services/desenWorkflowApi";
import {
  getCanonicalModelTimeline,
  getProductionReconciliation,
  quickCreateCanonicalModel,
} from "../../services/modelFlowApi";
import "../modules/cleanWorkflow.css";
import "./imalatWorkflow.css";
import "./productionCenter.css";

const emptyCreate = {
  modelName: "",
  companyId: "",
  modelCode: "",
  groundColor: "",
};

function qty(value) {
  return Number(value || 0).toLocaleString("tr-TR");
}

function tone(status) {
  if (["DENGELİ", "SAKATLI TAMAM", "COMPLETED", "MUHASEBEYE BAĞLANDI"].includes(status)) return "green";
  if (["EKSİK", "EKSİK BÖLGE", "İRSALİYE YOK", "BEKLİYOR", "ACTIVE", "FATURA BEKLİYOR", "ÜRETİM DEVAM EDİYOR"].includes(status)) return "yellow";
  if (["FAZLA", "REVISION_PENDING"].includes(status)) return "red";
  return "gray";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("tr-TR");
}

function timelineDetail(event) {
  const detail = event?.detail || {};
  if (event.type === "ISNET") return detail.dispatchNo || "İrsaliye";
  if (event.type === "URETIM_PLAN") return `${detail.printArea || "Operasyon"} · ${qty(detail.expectedQty)}`;
  if (event.type === "URETIM") return `${detail.printArea || "Üretim"} · ${qty(detail.quantity)}`;
  if (event.type === "MUHASEBE") return `${qty(detail.quantity)} adet`;
  if (event.type === "BOYAHANE") return detail.status || "Boyahane";
  return detail.status || detail.modelName || "";
}

export default function ProductionReconciliationPage({ activeMainCompany }) {
  const [data, setData] = useState({ rows: [], summary: {} });
  const [companies, setCompanies] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    setLoading(true);
    try {
      const result = await getProductionReconciliation(activeMainCompany, filters);
      setData({
        rows: Array.isArray(result?.rows) ? result.rows : [],
        summary: result?.summary || {},
      });
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "Üretim denge verileri okunamadı.");
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    getDesignCompanies(activeMainCompany)
      .then((rows) => setCompanies(Array.isArray(rows) ? rows : []))
      .catch(() => setCompanies([]));
  }, [activeMainCompany]);

  const metrics = useMemo(() => [
    ["Gelen irsaliye", data.summary.totalDispatchQty || 0, PackageCheck, ""],
    ["Net sağlam", data.summary.netGoodQty || 0, CircleCheck, "green"],
    ["Faturalanan", data.summary.invoicedQty || 0, ReceiptText, "green"],
    ["Fatura bekleyen", data.summary.uninvoicedQty || 0, FileClock, "yellow"],
    ["Baskı sakatı", data.summary.printDefectQty || 0, TriangleAlert, "red"],
    ["Kumaş sakatı", data.summary.fabricDefectQty || 0, CircleAlert, "yellow"],
    ["Eksik kalan", data.summary.remainingQty || 0, ShieldCheck, "yellow"],
    ["Kontrol gereken", data.summary.controlRequired || 0, Link2, "red"],
  ], [data.summary]);

  async function createModel() {
    const modelName = createForm.modelName.trim();
    if (!modelName) {
      setMessage("Model adı zorunludur.");
      return;
    }
    if (!createForm.companyId) {
      setMessage("Tek merkez model için müşteri firma seçimi zorunludur.");
      return;
    }
    const company = companies.find((row) => row.id === createForm.companyId);
    setCreating(true);
    try {
      const result = await quickCreateCanonicalModel(activeMainCompany, {
        ...createForm,
        modelName,
        firmaId: createForm.companyId,
        companyId: createForm.companyId,
        firmaAdi: company?.name || "",
        companyName: company?.name || "",
        sourceModule: "IMALAT",
      });
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      setMessage(`${result?.model?.modelName || modelName} tek merkezli model olarak Desen Havuzu'na açıldı.`);
      await load();
    } catch (error) {
      setMessage(error?.message || "Model açılamadı.");
    } finally {
      setCreating(false);
    }
  }

  async function openTimeline(row) {
    setTimelineLoading(true);
    try {
      const result = await getCanonicalModelTimeline(activeMainCompany, {
        modelId: row.canonicalModelId || row.modelId,
        dispatchNo: row.dispatchNo,
      });
      setTimeline(result || { model: { modelName: row.modelName }, events: [] });
    } catch (error) {
      setMessage(error?.message || "Model zaman çizelgesi açılamadı.");
    } finally {
      setTimelineLoading(false);
    }
  }

  return (
    <div className="production-center-page">
      <section className="iw-card production-center-head">
        <div>
          <span className="production-eyebrow">TEK MERKEZ MODEL DENKLEMİ</span>
          <h1>İrsaliye · Boyahane · Üretim · Fatura</h1>
          <p>Her satır Desen merkezindeki tek model kimliğiyle İşNet irsaliyesini, Boyahane işini, üretim operasyonlarını, sakatları ve faturalanan adedi birlikte izler. Çok bölgeli baskılarda tamamlanan model adedi operasyonların en düşük ortak adedidir.</p>
        </div>
        <div className="production-head-actions">
          <button className="iw-btn" type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>
          <button className="iw-btn primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={16} /> Hızlı Model Aç</button>
        </div>
      </section>

      <section className="production-metric-grid">
        {metrics.map(([label, value, Icon, metricTone]) => (
          <article className={`production-metric ${metricTone}`} key={label}>
            <span><Icon size={17} /> {label}</span>
            <strong>{qty(value)}</strong>
          </article>
        ))}
      </section>

      <section className="iw-card production-filter-card">
        <div className="production-filter-row">
          <label><span>Ara</span><div className="production-search"><Search size={16} /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Model, firma veya irsaliye no" /></div></label>
          <label><span>Üretim durumu</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Tümü</option><option>DENGELİ</option><option>SAKATLI TAMAM</option><option>EKSİK</option><option>EKSİK BÖLGE</option><option>FAZLA</option><option>İRSALİYE YOK</option></select></label>
          <button className="iw-btn primary" type="button" onClick={load} disabled={loading}><Search size={16} /> Uygula</button>
        </div>
      </section>

      {message ? <div className="iw-notice production-notice"><CircleAlert size={16} /> {message}</div> : null}

      <section className="iw-card production-reconciliation-card">
        <div className="iw-card-head"><div><h2><ShieldCheck size={18} /> Uçtan Uca İş Dengesi</h2><small>İrsaliye, Desen, Boyahane, operasyon, sakat, net sağlam ve fatura durumu aynı satırda izlenir.</small></div><span className="iw-badge b-blue">{data.rows.length} iş</span></div>
        <div className="iw-table-wrap production-table-wrap">
          <table className="production-flow-table">
            <thead><tr><th>Model / Firma</th><th>İrsaliye</th><th>Gelen</th><th>Operasyon Dengesi</th><th>Net Sağlam</th><th>Sakat</th><th>Eksik / Fazla</th><th>Boyahane</th><th>Faturalanan</th><th>Fatura Bekleyen</th><th>İş Akışı</th><th>Geçmiş</th></tr></thead>
            <tbody>
              {data.rows.length ? data.rows.map((row) => (
                <tr key={row.key}>
                  <td><strong>{row.modelName || "Model bağlanmadı"}</strong><small>{row.companyName || "Firma yok"}</small><small>{row.designStatus ? `Desen: ${row.designStatus}` : ""}</small></td>
                  <td><strong>{row.dispatchNo || "-"}</strong><small>{row.issueDate ? new Date(row.issueDate).toLocaleDateString("tr-TR") : ""}</small></td>
                  <td className="production-number">{qty(row.expectedQty)}</td>
                  <td><div className="production-operation-list">{(row.operationRows || []).map((operation) => <span className={operation.missingQty > 0 ? "missing" : "complete"} key={operation.region}><b>{operation.region}</b><em>{qty(operation.producedQty)} / {qty(row.expectedQty)}</em></span>)}</div></td>
                  <td className="production-number strong">{qty(row.netGoodQty)}</td>
                  <td><small>Baskı: <b>{qty(row.printDefectQty)}</b></small><small>Kumaş: <b>{qty(row.fabricDefectQty)}</b></small></td>
                  <td><small>Eksik: <b className={Number(row.remainingQty || 0) ? "production-inline-warning" : ""}>{qty(row.remainingQty)}</b></small><small>Fazla: <b className={Number(row.overQty || 0) ? "production-inline-danger" : ""}>{qty(row.overQty)}</b></small></td>
                  <td><span className={`production-status ${tone(row.dyehouseStatus)}`}>{row.dyehouseStatus === "NOT_CREATED" ? "İş açılmadı" : row.dyehouseStatus || "-"}</span><small>{row.dyehouseJobCount || 0} operasyon</small></td>
                  <td className="production-number strong">{qty(row.invoicedQty)}</td>
                  <td className={Number(row.uninvoicedQty || 0) ? "production-number warning" : "production-number"}>{qty(row.uninvoicedQty)}</td>
                  <td><span className={`production-status ${tone(row.workflowState)}`}>{row.workflowState || row.status}</span>{row.missingRegions?.length ? <small>Eksik: {row.missingRegions.join(", ")}</small> : null}</td>
                  <td><button className="iw-btn production-timeline-button" type="button" onClick={() => openTimeline(row)} disabled={timelineLoading}><FileClock size={15} /> Aç</button></td>
                </tr>
              )) : <tr><td colSpan={12}>{loading ? "Üretim denklemi hazırlanıyor..." : "Filtreye uygun üretim işi bulunamadı."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen ? <div className="iw-modal-backdrop"><section className="iw-modal-box production-create-modal"><div className="iw-card-head"><div><h2><Plus size={18} /> Tek Merkezli Model Aç</h2><small>Kayıt Desen merkezinde oluşur; İşNet, Boyahane, İmalat ve Muhasebe aynı model kimliğini kullanır.</small></div><button className="iw-btn" type="button" onClick={() => setCreateOpen(false)}>Kapat</button></div><div className="iw-card-body production-create-grid"><label><span>Model adı *</span><input autoFocus value={createForm.modelName} onChange={(event) => setCreateForm((current) => ({ ...current, modelName: event.target.value }))} /></label><label><span>Müşteri firma *</span><select value={createForm.companyId} onChange={(event) => setCreateForm((current) => ({ ...current, companyId: event.target.value }))}><option value="">Firma seçin</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label><span>Model kodu</span><input value={createForm.modelCode} onChange={(event) => setCreateForm((current) => ({ ...current, modelCode: event.target.value }))} /></label><label><span>Zemin renk</span><input value={createForm.groundColor} onChange={(event) => setCreateForm((current) => ({ ...current, groundColor: event.target.value }))} /></label></div><footer className="production-modal-footer"><button className="iw-btn" type="button" onClick={() => setCreateOpen(false)}>Vazgeç</button><button className="iw-btn primary" type="button" onClick={createModel} disabled={creating}>{creating ? "Açılıyor..." : "Modeli Aç"}</button></footer></section></div> : null}

      {timeline ? <div className="iw-modal-backdrop"><section className="iw-modal-box production-timeline-modal"><div className="iw-card-head"><div><h2><FileClock size={18} /> {timeline.model?.modelName || "Model"} Zaman Çizelgesi</h2><small>{timeline.dispatchNo || "Tüm irsaliye ve işlemler"}</small></div><button className="iw-btn" type="button" onClick={() => setTimeline(null)}><X size={16} /> Kapat</button></div><div className="production-timeline-summary"><span>İrsaliye <b>{timeline.summary?.dispatchCount || 0}</b></span><span>Boyahane <b>{timeline.summary?.dyehouseJobCount || 0}</b></span><span>Üretim kaydı <b>{timeline.summary?.productionRecordCount || 0}</b></span><span>Faturalanan <b>{qty(timeline.summary?.invoicedQty)}</b></span></div><div className="production-timeline-list">{(timeline.events || []).length ? timeline.events.map((event, index) => <article key={`${event.type}-${event.date}-${index}`}><i className={`production-timeline-dot ${String(event.type || "").toLocaleLowerCase("tr-TR")}`} /><div><small>{formatDate(event.date)} · {event.type}</small><strong>{event.title}</strong><span>{timelineDetail(event)}</span></div></article>) : <div className="iw-empty">Bu model için işlem geçmişi bulunamadı.</div>}</div></section></div> : null}
    </div>
  );
}
