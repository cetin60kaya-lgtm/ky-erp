import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Factory,
  Link2,
  PackageCheck,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { getDesignCompanies } from "../../services/desenWorkflowApi";
import {
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
  if (["DENGELİ", "SAKATLI TAMAM"].includes(status)) return "green";
  if (["EKSİK", "EKSİK BÖLGE", "İRSALİYE YOK", "BEKLİYOR"].includes(status)) return "yellow";
  if (status === "FAZLA") return "red";
  return "gray";
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

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
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
    if (!activeMainCompany?.slug) return;
    getDesignCompanies(activeMainCompany)
      .then((rows) => setCompanies(Array.isArray(rows) ? rows : []))
      .catch(() => setCompanies([]));
  }, [activeMainCompany]);

  const metrics = useMemo(() => [
    ["Gelen irsaliye", data.summary.totalDispatchQty || 0, PackageCheck, ""],
    ["Tamamlanan brüt", data.summary.completedGrossQty || 0, Factory, ""],
    ["Net sağlam", data.summary.netGoodQty || 0, CircleCheck, "green"],
    ["Baskı sakatı", data.summary.printDefectQty || 0, TriangleAlert, "red"],
    ["Kumaş sakatı", data.summary.fabricDefectQty || 0, CircleAlert, "yellow"],
    ["Kalan", data.summary.remainingQty || 0, ShieldCheck, "yellow"],
    ["Fazla", data.summary.overQty || 0, CircleAlert, "red"],
    ["Kontrol gereken", data.summary.controlRequired || 0, Link2, "red"],
  ], [data.summary]);

  async function createModel() {
    const modelName = createForm.modelName.trim();
    if (!modelName) {
      setMessage("Model adı zorunludur.");
      return;
    }
    const company = companies.find((row) => row.id === createForm.companyId);
    setCreating(true);
    try {
      const result = await quickCreateCanonicalModel(activeMainCompany, {
        ...createForm,
        modelName,
        firmaId: createForm.companyId,
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

  return (
    <div className="production-center-page">
      <section className="iw-card production-center-head">
        <div>
          <span className="production-eyebrow">TEK MERKEZ MODEL DENKLEMİ</span>
          <h1>İrsaliye · Üretim · Sakat · Net Adet</h1>
          <p>Her satır Desen merkezindeki tek model kimliğiyle İşNet irsaliyesi ve imalat kayıtlarını karşılaştırır. Çok bölgeli baskılarda tamamlanan model adedi operasyonların en düşük ortak adedidir.</p>
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
          <label><span>Durum</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Tümü</option><option>DENGELİ</option><option>SAKATLI TAMAM</option><option>EKSİK</option><option>EKSİK BÖLGE</option><option>FAZLA</option><option>İRSALİYE YOK</option></select></label>
          <button className="iw-btn primary" type="button" onClick={load} disabled={loading}><Search size={16} /> Uygula</button>
        </div>
      </section>

      {message ? <div className="iw-notice production-notice"><CircleAlert size={16} /> {message}</div> : null}

      <section className="iw-card production-reconciliation-card">
        <div className="iw-card-head"><div><h2><ShieldCheck size={18} /> Üretim Denge Listesi</h2><small>İrsaliye adedi; baskı bölgeleri, brüt üretim, sakatlar ve net sağlam adetle birlikte izlenir.</small></div><span className="iw-badge b-blue">{data.rows.length} iş</span></div>
        <div className="iw-table-wrap production-table-wrap">
          <table>
            <thead><tr><th>Model / Firma</th><th>İrsaliye</th><th>Gelen</th><th>Operasyon Dengesi</th><th>Tamamlanan Brüt</th><th>Baskı Sakatı</th><th>Kumaş Sakatı</th><th>Net Sağlam</th><th>Eksik</th><th>Fazla</th><th>Durum</th></tr></thead>
            <tbody>
              {data.rows.length ? data.rows.map((row) => (
                <tr key={row.key}>
                  <td><strong>{row.modelName || "Model bağlanmadı"}</strong><small>{row.companyName || "Firma yok"}</small></td>
                  <td><strong>{row.dispatchNo || "-"}</strong><small>{row.issueDate ? new Date(row.issueDate).toLocaleDateString("tr-TR") : ""}</small></td>
                  <td className="production-number">{qty(row.expectedQty)}</td>
                  <td><div className="production-operation-list">{(row.operationRows || []).map((operation) => <span className={operation.missingQty > 0 ? "missing" : "complete"} key={operation.region}><b>{operation.region}</b><em>{qty(operation.producedQty)} / {qty(row.expectedQty)}</em></span>)}</div></td>
                  <td className="production-number">{qty(row.completedGrossQty)}</td>
                  <td className={Number(row.printDefectQty || 0) ? "production-number danger" : "production-number"}>{qty(row.printDefectQty)}</td>
                  <td className={Number(row.fabricDefectQty || 0) ? "production-number warning" : "production-number"}>{qty(row.fabricDefectQty)}</td>
                  <td className="production-number strong">{qty(row.netGoodQty)}</td>
                  <td className={Number(row.remainingQty || 0) ? "production-number warning" : "production-number"}>{qty(row.remainingQty)}</td>
                  <td className={Number(row.overQty || 0) ? "production-number danger" : "production-number"}>{qty(row.overQty)}</td>
                  <td><span className={`production-status ${tone(row.status)}`}>{row.status}</span>{row.missingRegions?.length ? <small>Eksik: {row.missingRegions.join(", ")}</small> : null}</td>
                </tr>
              )) : <tr><td colSpan={11}>{loading ? "Üretim denklemi hazırlanıyor..." : "Filtreye uygun üretim işi bulunamadı."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen ? <div className="iw-modal-backdrop"><section className="iw-modal-box production-create-modal"><div className="iw-card-head"><div><h2><Plus size={18} /> Tek Merkezli Model Aç</h2><small>Kayıt Desen merkezinde oluşur; İşNet, Boyahane, İmalat ve Muhasebe aynı model kimliğini kullanır.</small></div><button className="iw-btn" type="button" onClick={() => setCreateOpen(false)}>Kapat</button></div><div className="iw-card-body production-create-grid"><label><span>Model adı *</span><input autoFocus value={createForm.modelName} onChange={(event) => setCreateForm((current) => ({ ...current, modelName: event.target.value }))} /></label><label><span>Firma</span><select value={createForm.companyId} onChange={(event) => setCreateForm((current) => ({ ...current, companyId: event.target.value }))}><option value="">Firma seçin</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label><span>Model kodu</span><input value={createForm.modelCode} onChange={(event) => setCreateForm((current) => ({ ...current, modelCode: event.target.value }))} /></label><label><span>Zemin renk</span><input value={createForm.groundColor} onChange={(event) => setCreateForm((current) => ({ ...current, groundColor: event.target.value }))} /></label></div><footer className="production-modal-footer"><button className="iw-btn" type="button" onClick={() => setCreateOpen(false)}>Vazgeç</button><button className="iw-btn primary" type="button" onClick={createModel} disabled={creating}>{creating ? "Açılıyor..." : "Modeli Aç"}</button></footer></section></div> : null}
    </div>
  );
}
