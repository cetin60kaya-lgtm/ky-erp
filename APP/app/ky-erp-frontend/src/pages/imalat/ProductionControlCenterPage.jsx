import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CirclePlus,
  FileCheck2,
  FileText,
  Filter,
  History,
  ImageIcon,
  Layers3,
  PackageCheck,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  X,
  Zap,
} from "lucide-react";
import {
  createProductionCenterEntry,
  createProductionCenterModel,
  getProductionCenter,
  getProductionCenterDictionaries,
  getProductionCenterModel,
} from "../../services/productionCenterApi";
import ProductionSmartEntryDrawer from "./ProductionSmartEntryDrawer";
import "./productionControlCenter.css";

const PAGE_SIZE = 100;
const DETAIL_TABS = [
  ["overview", "Genel Durum", PackageCheck],
  ["design", "Desen ve Model", ImageIcon],
  ["dispatches", "Gelen İrsaliyeler", FileText],
  ["production", "Üretim", Layers3],
  ["invoices", "Kesilen Faturalar", FileCheck2],
  ["timeline", "Hareket Geçmişi", History],
];

const STATUS_OPTIONS = [
  ["ALL", "Tüm durumlar"],
  ["PRODUCTION_OPEN", "Üretim bekliyor"],
  ["INVOICE_OPEN", "Fatura bekliyor"],
  ["MODEL_WAITING", "Model eşleşmesi bekliyor"],
  ["DISPATCH_WAITING", "İrsaliye bekliyor"],
  ["OVER_PRODUCTION", "Fazla üretim"],
  ["OVER_INVOICED", "Fazla fatura"],
  ["COMPLETED", "Tamamlandı"],
  ["NEW_MODEL", "Yeni model"],
];

const today = () => new Date().toISOString().slice(0, 10);
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const qty = (value) =>
  number(value).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toLocaleDateString("tr-TR");
};

function statusLabel(value) {
  const labels = {
    PRODUCTION_OPEN: "Üretim Bekliyor",
    INVOICE_OPEN: "Fatura Bekliyor",
    MODEL_WAITING: "Model Eşleşmesi Bekliyor",
    DISPATCH_WAITING: "İrsaliye Bekliyor",
    OVER_PRODUCTION: "Fazla Üretim",
    OVER_INVOICED: "Fazla Fatura",
    COMPLETED: "Tamamlandı",
    NEW_MODEL: "Yeni Model",
  };
  return labels[value] || value || "Kontrol Bekliyor";
}

function statusTone(value) {
  if (value === "COMPLETED") return "success";
  if (["OVER_PRODUCTION", "OVER_INVOICED"].includes(value)) return "danger";
  if (["MODEL_WAITING", "DISPATCH_WAITING"].includes(value)) return "warning";
  if (value === "INVOICE_OPEN") return "violet";
  return "ready";
}

function machineId(machine) {
  return String(machine?.id || machine?.machineNo || machine?.no || "");
}

function machineName(machine) {
  return (
    machine?.machineName ||
    machine?.makineAdi ||
    machine?.ad ||
    machine?.machineNo ||
    ""
  );
}

function operatorFor(machine, shift) {
  if (!machine) return "";
  return String(shift || "")
    .toLocaleLowerCase("tr-TR")
    .includes("gece")
    ? machine.nightOperator || machine.geceMakinaci || machine.operator || ""
    : machine.dayOperator || machine.gunduzMakinaci || machine.operator || "";
}

function imageSource(value) {
  const raw = String(value || "").trim();
  if (!raw || /^[a-z]:[\\/]/i.test(raw) || raw.startsWith("\\\\")) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  return raw.startsWith("/") ? raw : "";
}

function Drawer({ open, title, subtitle, width = "wide", onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="pcc-drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className={`pcc-drawer pcc-drawer-${width}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="pcc-drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </header>
        <div className="pcc-drawer-body">{children}</div>
        {footer ? <footer className="pcc-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}

function EmptyState({ icon: Icon = Boxes, title, description }) {
  return (
    <div className="pcc-empty">
      <Icon size={30} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function Metric({ label, value, helper, tone = "" }) {
  return (
    <div className={tone ? `pcc-metric ${tone}` : "pcc-metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
}

function ProgressLine({ label, value, total, tone = "primary" }) {
  const percent = total > 0 ? Math.min(100, (number(value) / number(total)) * 100) : 0;
  return (
    <div className="pcc-progress-line">
      <div>
        <span>{label}</span>
        <strong>
          {qty(value)} / {qty(total)}
        </strong>
      </div>
      <div className="pcc-progress-track">
        <i className={tone} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function defaultEntry(model = null, dictionaries = {}) {
  const firstMachine = dictionaries?.machines?.[0];
  const firstRegion =
    model?.printRegions?.[0]?.regionName || model?.operationRows?.[0]?.region || "";
  return {
    modelId: model?.id || "",
    date: today(),
    dispatchNo:
      model?.defaultDispatchNo || model?.dispatches?.[0]?.documentNo || "",
    orderNo: model?.orderNo || "",
    printRegion: firstRegion,
    quantity: "",
    printDefectQty: "",
    fabricDefectQty: "",
    testQty: "",
    shift: "Gündüz",
    machineId: firstMachine ? machineId(firstMachine) : "",
    machineName: firstMachine ? machineName(firstMachine) : "",
    operatorName: firstMachine ? operatorFor(firstMachine, "Gündüz") : "",
    batchNo:
      model?.defaultDispatchNo || model?.dispatches?.[0]?.documentNo || "GENEL",
    note: "",
  };
}

function defaultModel() {
  return {
    modelName: "",
    modelCode: "",
    companyId: "",
    orderNo: "",
    dispatchNo: "",
    expectedQty: "",
    printRegions: "Ön",
  };
}

export default function ProductionControlCenterPage({ activeMainCompany }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    rows: [],
    summary: {},
    pagination: { page: 1, pageSize: PAGE_SIZE, total: 0 },
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [companyId, setCompanyId] = useState("");
  const [page, setPage] = useState(1);
  const [dictionaries, setDictionaries] = useState({
    models: [],
    machines: [],
    operators: [],
    companies: [],
  });
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("overview");
  const [smartOpen, setSmartOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entry, setEntry] = useState(defaultEntry());
  const [modelOpen, setModelOpen] = useState(false);
  const [modelDraft, setModelDraft] = useState(defaultModel());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadDictionaries = useCallback(async () => {
    try {
      const result = await getProductionCenterDictionaries(activeMainCompany);
      setDictionaries({
        models: Array.isArray(result?.models) ? result.models : [],
        machines: Array.isArray(result?.machines) ? result.machines : [],
        operators: Array.isArray(result?.operators) ? result.operators : [],
        companies: Array.isArray(result?.companies) ? result.companies : [],
      });
      return result;
    } catch {
      return null;
    }
  }, [activeMainCompany]);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await getProductionCenter(activeMainCompany, {
        search,
        status,
        companyId,
        page,
        pageSize: PAGE_SIZE,
        _ts: Date.now(),
      });
      setState({
        loading: false,
        error: "",
        rows: Array.isArray(result?.rows) ? result.rows : [],
        summary: result?.summary || {},
        pagination: result?.pagination || {
          page,
          pageSize: PAGE_SIZE,
          total: 0,
        },
      });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Model ve üretim merkezi yüklenemedi.",
        rows: [],
        summary: {},
        pagination: { page, pageSize: PAGE_SIZE, total: 0 },
      });
    }
  }, [activeMainCompany, companyId, page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    loadDictionaries();
  }, [loadDictionaries]);

  useEffect(() => {
    setPage(1);
  }, [companyId, search, status]);

  const summary = state.summary || {};
  const pageCount = Math.max(
    1,
    Math.ceil(number(state.pagination?.total) / PAGE_SIZE),
  );

  const currentModelForEntry = useMemo(
    () =>
      dictionaries.models.find(
        (model) => String(model.id || model.modelId) === String(entry.modelId),
      ),
    [dictionaries.models, entry.modelId],
  );

  const selectedMachine = useMemo(
    () =>
      dictionaries.machines.find(
        (machine) => machineId(machine) === String(entry.machineId),
      ),
    [dictionaries.machines, entry.machineId],
  );

  const entryDefectTotal =
    number(entry.printDefectQty) +
    number(entry.fabricDefectQty) +
    number(entry.testQty);
  const entryNet = Math.max(0, number(entry.quantity) - entryDefectTotal);

  async function openDetail(row) {
    setSelected(row);
    setDetailTab("overview");
    setDetailLoading(true);
    setMessage("");
    try {
      const result = await getProductionCenterModel(activeMainCompany, row.id);
      setSelected(result);
    } catch (error) {
      setMessage(error?.message || "Model detayı alınamadı.");
    } finally {
      setDetailLoading(false);
    }
  }

  function openSingleEntry(model = selected) {
    if (!model || model.isVirtual) {
      setMessage("Üretim girişi için önce gerçek model kaydı eşleştirilmelidir.");
      return;
    }
    setEntry(defaultEntry(model, dictionaries));
    setEntryOpen(true);
  }

  function changeEntryModel(modelId) {
    const model = dictionaries.models.find(
      (item) => String(item.id || item.modelId) === String(modelId),
    );
    setEntry(defaultEntry(model, dictionaries));
  }

  function changeEntryMachine(nextId) {
    const machine = dictionaries.machines.find(
      (item) => machineId(item) === String(nextId),
    );
    setEntry((current) => ({
      ...current,
      machineId: nextId,
      machineName: machineName(machine),
      operatorName: operatorFor(machine, current.shift),
    }));
  }

  function changeEntryShift(nextShift) {
    setEntry((current) => ({
      ...current,
      shift: nextShift,
      operatorName:
        operatorFor(selectedMachine, nextShift) || current.operatorName,
    }));
  }

  async function saveEntry() {
    if (!entry.modelId || number(entry.quantity) <= 0) {
      setMessage("Model ve sıfırdan büyük brüt üretim adedi zorunludur.");
      return;
    }
    if (!entry.printRegion || !entry.machineId || !entry.operatorName) {
      setMessage("Baskı bölgesi, makine ve makinacı zorunludur.");
      return;
    }
    if (entryDefectTotal > number(entry.quantity)) {
      setMessage("Sakat ve test toplamı brüt üretim adedini aşamaz.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await createProductionCenterEntry(activeMainCompany, {
        ...entry,
        requestId: crypto.randomUUID(),
        modelName:
          currentModelForEntry?.modelName ||
          currentModelForEntry?.modelAdi ||
          "",
      });
      setEntryOpen(false);
      setMessage(
        `${currentModelForEntry?.modelName || "Model"}: ${qty(
          entry.quantity,
        )} brüt, ${qty(entryNet)} net üretim kaydedildi.`,
      );
      await Promise.all([load(), loadDictionaries()]);
      if (selected?.id === entry.modelId) {
        await openDetail({ id: entry.modelId });
      }
    } catch (error) {
      setMessage(error?.message || "Üretim kaydı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function saveModel() {
    if (!modelDraft.modelName.trim()) {
      setMessage("Model adı zorunludur.");
      return;
    }
    if (!modelDraft.companyId || number(modelDraft.expectedQty) <= 0) {
      setMessage("Kayıtlı firma ve sıfırdan büyük beklenen adet zorunludur.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const company = dictionaries.companies.find(
        (item) => item.id === modelDraft.companyId,
      );
      const result = await createProductionCenterModel(activeMainCompany, {
        ...modelDraft,
        companyName: company?.name || "",
        sourceModule: "PRODUCTION_CENTER",
      });
      setModelOpen(false);
      setModelDraft(defaultModel());
      setMessage(
        result?.duplicate
          ? "Aynı model kaydı zaten bulunuyor; mevcut kayıt kullanıldı."
          : "İrsaliyesiz model işi tek merkezde açıldı.",
      );
      await Promise.all([load(), loadDictionaries()]);
    } catch (error) {
      setMessage(error?.message || "Model işi açılamadı.");
    } finally {
      setSaving(false);
    }
  }

  function renderDetail() {
    if (detailLoading) {
      return <div className="pcc-loading">Model detayı yükleniyor…</div>;
    }
    if (!selected) return null;

    if (detailTab === "overview") {
      return (
        <div className="pcc-detail-stack">
          <section className="pcc-detail-metrics">
            <Metric label="Gelen irsaliye" value={qty(selected.incomingQty)} helper={`${selected.dispatchCount || 0} belge`} />
            <Metric label="Tamamlanan üretim" value={qty(selected.completedGrossQty)} helper={`Operasyon toplamı ${qty(selected.grossOperationQty)}`} />
            <Metric label="Sakat / Test" value={qty(selected.defectQty)} helper={`Baskı ${qty(selected.printDefectQty)} · Kumaş ${qty(selected.fabricDefectQty)} · Test ${qty(selected.testQty)}`} tone={selected.defectQty ? "warning" : ""} />
            <Metric label="Faturalanabilir net" value={qty(selected.invoiceableQty)} helper="Tamamlanan net sağlam adet" tone="success" />
            <Metric label="Faturalanan" value={qty(selected.invoicedQty)} helper={`${selected.invoices?.length || 0} fatura satırı`} />
            <Metric label="Fatura bekleyen" value={qty(selected.invoiceRemainingQty)} helper="Faturalanabilir eksi faturalanan" tone={selected.invoiceRemainingQty ? "violet" : "success"} />
          </section>

          <section className="pcc-panel">
            <header className="pcc-section-header">
              <div>
                <h3>Adet dengesi</h3>
                <p>Çoklu baskı bölgesinde model adedi, bölgelerin ortak tamamlanan en düşük adedidir.</p>
              </div>
            </header>
            <div className="pcc-progress-list">
              <ProgressLine label="Üretim tamamlanma" value={selected.completedGrossQty} total={selected.incomingQty} />
              <ProgressLine label="Net sağlam / faturalanabilir" value={selected.invoiceableQty} total={selected.incomingQty} tone="success" />
              <ProgressLine label="Faturalandırma" value={selected.invoicedQty} total={selected.invoiceableQty} tone="violet" />
            </div>
          </section>

          <section className="pcc-panel">
            <header className="pcc-section-header">
              <div>
                <h3>Baskı bölgesi durumu</h3>
                <p>Ön, arka, kol ve diğer bölgeler ayrı operasyon; model tamamlanması ortak adet üzerinden hesaplanır.</p>
              </div>
            </header>
            <div className="pcc-operation-grid">
              {(selected.operationRows || []).map((operation) => (
                <article key={operation.region}>
                  <div>
                    <strong>{operation.region}</strong>
                    <span className={`pcc-status ${statusTone(operation.status)}`}>{statusLabel(operation.status)}</span>
                  </div>
                  <b>{qty(operation.producedQty)} / {qty(selected.incomingQty)}</b>
                  <small>Net {qty(operation.netQty)} · Kalan {qty(operation.remainingQty)}</small>
                </article>
              ))}
            </div>
          </section>
        </div>
      );
    }

    if (detailTab === "design") {
      const source = imageSource(selected.imageUrl);
      return (
        <div className="pcc-detail-stack">
          <section className="pcc-design-card">
            <div className="pcc-design-image">
              {source ? <img src={source} alt={selected.modelName} /> : <ImageIcon size={42} />}
            </div>
            <div className="pcc-design-info">
              <span>Tek merkez model</span>
              <h3>{selected.modelName}</h3>
              <dl>
                <div><dt>Firma</dt><dd>{selected.companyName || "-"}</dd></div>
                <div><dt>Model kodu</dt><dd>{selected.modelCode || "-"}</dd></div>
                <div><dt>Sipariş no</dt><dd>{selected.orderNo || "-"}</dd></div>
                <div><dt>Ana irsaliye</dt><dd>{selected.defaultDispatchNo || "-"}</dd></div>
                <div><dt>Zemin</dt><dd>{selected.groundColor || "-"}</dd></div>
                <div><dt>Model kaydı</dt><dd>{selected.isVirtual ? "Eşleşme bekliyor" : "Bağlı"}</dd></div>
              </dl>
            </div>
          </section>
          <section className="pcc-panel">
            <header className="pcc-section-header"><div><h3>Tanımlı baskı bölgeleri</h3><p>Üretim tamamlanma hesabı bu bölgelerin ortak adedine göre yapılır.</p></div></header>
            <div className="pcc-region-list">
              {(selected.printRegions || []).length
                ? selected.printRegions.map((region, index) => <span key={region.id || `${region.regionName}-${index}`}>{region.regionName}</span>)
                : <em>Baskı bölgesi tanımı bulunmuyor. Üretim kayıtlarındaki bölgeler kullanılıyor.</em>}
            </div>
          </section>
        </div>
      );
    }

    if (detailTab === "dispatches") {
      return (
        <section className="pcc-table-card detail">
          {(selected.dispatches || []).length ? (
            <div className="pcc-table-wrap">
              <table>
                <thead><tr><th>Tarih</th><th>İrsaliye No</th><th>Firma</th><th>Sipariş</th><th>Ürün / Model</th><th>Adet</th><th>Kaynak</th><th>Durum</th></tr></thead>
                <tbody>{selected.dispatches.map((row) => <tr key={`${row.documentId}-${row.lineId}`}><td>{dateText(row.date)}</td><td><strong>{row.documentNo || "-"}</strong></td><td>{row.companyName || selected.companyName || "-"}</td><td>{row.orderNo || selected.orderNo || "-"}</td><td>{row.rawName || selected.modelName}</td><td><strong>{qty(row.quantity)} {row.unit || ""}</strong></td><td>{/ISNET/i.test(row.sourceType || "") ? "İşNet" : row.sourceType || "Belge"}</td><td>{row.status || "-"}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={FileText} title="Gelen irsaliye bulunamadı" description="Bu model henüz İşNet gelen irsaliyesiyle eşleşmemiştir." />}
        </section>
      );
    }

    if (detailTab === "production") {
      return (
        <div className="pcc-detail-stack">
          <section className="pcc-panel">
            <header className="pcc-section-header"><div><h3>Operasyon dengesi</h3><p>Her baskı bölgesi ayrı; tamamlanan model adedi ortak en düşük adettir.</p></div><button type="button" className="primary" onClick={() => openSingleEntry(selected)} disabled={selected.isVirtual}><CirclePlus size={15} /> Üretim Gir</button></header>
            <div className="pcc-operation-grid">
              {(selected.operationRows || []).map((operation) => <article key={operation.region}><div><strong>{operation.region}</strong><span className={`pcc-status ${statusTone(operation.status)}`}>{statusLabel(operation.status)}</span></div><b>{qty(operation.producedQty)} brüt</b><small>{qty(operation.netQty)} net · {qty(operation.remainingQty)} kalan</small></article>)}
            </div>
          </section>
          <section className="pcc-table-card detail">
            {(selected.productionEntries || []).length ? <div className="pcc-table-wrap"><table><thead><tr><th>Tarih</th><th>Bölge</th><th>Brüt</th><th>Baskı Sakatı</th><th>Kumaş Sakatı</th><th>Test</th><th>Net</th><th>Makine</th><th>Vardiya</th><th>Makinacı</th></tr></thead><tbody>{selected.productionEntries.map((row) => <tr key={row.id}><td>{dateText(row.date)}</td><td><strong>{row.printArea || "-"}</strong></td><td>{qty(row.grossQty)}</td><td>{qty(row.printDefectQty)}</td><td>{qty(row.fabricDefectQty)}</td><td>{qty(row.testQty)}</td><td><strong>{qty(row.netQty)}</strong></td><td>{row.machineName || row.machineId || "-"}</td><td>{row.shift || "-"}</td><td>{row.operatorName || "-"}</td></tr>)}</tbody></table></div> : <EmptyState title="Üretim kaydı bulunamadı" description="Akıllı seri giriş veya tekli üretim formuyla kayıt ekleyin." />}
          </section>
        </div>
      );
    }

    if (detailTab === "invoices") {
      return (
        <section className="pcc-table-card detail">
          {(selected.invoices || []).length ? <div className="pcc-table-wrap"><table><thead><tr><th>Tarih</th><th>Fatura No</th><th>Firma</th><th>Sipariş</th><th>Ürün / Model</th><th>Adet</th><th>Kaynak</th><th>Durum</th></tr></thead><tbody>{selected.invoices.map((row) => <tr key={`${row.documentId}-${row.lineId}`}><td>{dateText(row.date)}</td><td><strong>{row.documentNo || "-"}</strong></td><td>{row.companyName || selected.companyName || "-"}</td><td>{row.orderNo || selected.orderNo || "-"}</td><td>{row.rawName || selected.modelName}</td><td><strong>{qty(row.quantity)} {row.unit || ""}</strong></td><td>{/ISNET/i.test(row.sourceType || "") ? "İşNet" : row.sourceType || "Belge"}</td><td>{row.status || "-"}</td></tr>)}</tbody></table></div> : <EmptyState icon={FileCheck2} title="Kesilen fatura bulunamadı" description="İşNet’ten alınan kesilen fatura bu modele bağlandığında burada görünür." />}
        </section>
      );
    }

    return (
      <section className="pcc-timeline">
        {(selected.timeline || []).length ? selected.timeline.map((row) => <article key={row.id}><i className={String(row.type || "").toLowerCase()} /><div><time>{dateText(row.date)}</time><strong>{row.title}</strong><span>{row.description}</span></div></article>) : <EmptyState icon={History} title="Hareket bulunamadı" description="Modelin belge ve üretim hareketleri burada kronolojik olarak görünür." />}
      </section>
    );
  }

  return (
    <main className="pcc-root">
      <header className="pcc-page-header">
        <div>
          <span>İmalat · Tek Merkez</span>
          <h1>Model ve Üretim Kontrol Merkezi</h1>
          <p>Desen modeli, gelen irsaliye, baskı bölgeleri, üretim-sakat adetleri ve kesilen faturayı aynı model kartında izleyin.</p>
        </div>
        <div className="pcc-header-actions">
          <button type="button" onClick={() => setModelOpen(true)}><CirclePlus size={16} /> İrsaliyesiz İş Aç</button>
          <button type="button" onClick={() => openSingleEntry()}><Settings2 size={16} /> Tekli Üretim</button>
          <button type="button" className="primary" onClick={() => setSmartOpen(true)}><Zap size={16} /> Akıllı Seri Giriş</button>
        </div>
      </header>

      <section className="pcc-summary-grid">
        <Metric label="Model" value={qty(summary.modelCount)} helper={`${qty(summary.openModelCount)} açık iş`} />
        <Metric label="Gelen adet" value={qty(summary.totalIncomingQty)} helper="İşNet gelen irsaliyeleri" />
        <Metric label="Net tamamlanan" value={qty(summary.totalCompletedNetQty)} helper="Sakat ve test düşülmüş" tone="success" />
        <Metric label="Faturalanan" value={qty(summary.totalInvoicedQty)} helper="Kesilen fatura adedi" />
        <Metric label="Fatura bekleyen" value={qty(summary.totalInvoiceRemainingQty)} helper={`${qty(summary.invoiceOpenCount)} model`} tone={summary.totalInvoiceRemainingQty ? "violet" : "success"} />
        <Metric label="Kontrol gerekli" value={qty(summary.controlCount)} helper={`Model ${qty(summary.modelWaitingCount)} · İrsaliye ${qty(summary.dispatchWaitingCount)}`} tone={summary.controlCount ? "warning" : "success"} />
      </section>

      <section className="pcc-toolbar">
        <label className="pcc-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Model, firma, sipariş veya irsaliye ara" /></label>
        <label className="pcc-select"><Filter size={15} /><select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Tüm firmalar</option>{dictionaries.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
        <span>{qty(state.pagination?.total)} kayıt</span>
        <button type="button" onClick={load}><RefreshCcw size={16} /> Yenile</button>
      </section>

      {message ? <div className="pcc-notice" role="status"><CircleAlert size={17} /> {message}</div> : null}
      {state.error ? <div className="pcc-error" role="alert"><CircleAlert size={18} /> {state.error}</div> : null}

      <section className="pcc-table-card main">
        {state.loading ? <div className="pcc-loading">Model ve üretim kartları hazırlanıyor…</div> : state.rows.length ? (
          <div className="pcc-table-wrap"><table><thead><tr><th>Görsel</th><th>Model / Firma</th><th>Sipariş / İrsaliye</th><th>Gelen</th><th>Tamamlanan</th><th>Sakat / Test</th><th>Net Sağlam</th><th>Faturalanan</th><th>Fatura Bekleyen</th><th>Durum</th><th aria-label="Detay" /></tr></thead><tbody>{state.rows.map((row) => { const source = imageSource(row.imageUrl); return <tr key={row.id} onClick={() => openDetail(row)} tabIndex={0}><td>{source ? <img className="pcc-thumb" src={source} alt={row.modelName} /> : <div className="pcc-thumb empty"><ImageIcon size={18} /></div>}</td><td><strong>{row.modelName || "Model bekliyor"}</strong><small>{row.companyName || "Firma eşleşmesi bekliyor"}</small></td><td><strong>{row.orderNo || "-"}</strong><small>{row.defaultDispatchNo || row.dispatchPreview?.[0]?.documentNo || "İrsaliye yok"}</small></td><td>{qty(row.incomingQty)}</td><td><strong>{qty(row.completedGrossQty)}</strong><small>Operasyon {qty(row.grossOperationQty)}</small></td><td>{qty(row.defectQty)}</td><td><strong>{qty(row.completedNetQty)}</strong></td><td>{qty(row.invoicedQty)}</td><td><strong className={row.invoiceRemainingQty ? "violet-text" : "success-text"}>{qty(row.invoiceRemainingQty)}</strong></td><td><span className={`pcc-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></td><td><ChevronRight size={17} /></td></tr>; })}</tbody></table></div>
        ) : <EmptyState icon={CheckCircle2} title="Filtreye uygun model bulunamadı" description="İşNet irsaliyeleri ve Desen model kayıtları eşleştiğinde tek merkez listesi burada oluşur." />}
      </section>

      {pageCount > 1 ? <footer className="pcc-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Önceki</button><span>{page} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Sonraki <ChevronRight size={16} /></button></footer> : null}

      <Drawer open={Boolean(selected)} title={selected?.modelName || "Model Detayı"} subtitle={`${selected?.companyName || "Firma eşleşmesi bekliyor"} · ${selected?.defaultDispatchNo || selected?.orderNo || "İrsaliye yok"}`} onClose={() => setSelected(null)} footer={<><span><span className={`pcc-status ${statusTone(selected?.status)}`}>{statusLabel(selected?.status)}</span></span><div><button type="button" onClick={() => setSelected(null)}>Kapat</button><button type="button" className="primary" disabled={selected?.isVirtual} onClick={() => openSingleEntry(selected)}><CirclePlus size={16} /> Üretim Gir</button></div></>}>
        <nav className="pcc-detail-tabs">{DETAIL_TABS.map(([key, label, Icon]) => <button type="button" key={key} className={detailTab === key ? "active" : ""} onClick={() => setDetailTab(key)}><Icon size={15} /> {label}</button>)}</nav>
        {renderDetail()}
      </Drawer>

      <Drawer open={entryOpen} width="medium" title="Tekli Üretim Girişi" subtitle="Model, irsaliye ve baskı bölgesine bağlı kontrollü kayıt" onClose={() => setEntryOpen(false)} footer={<><span>Net sağlam: <strong>{qty(entryNet)}</strong></span><div><button type="button" onClick={() => setEntryOpen(false)}>Vazgeç</button><button type="button" className="primary" disabled={saving} onClick={saveEntry}><Save size={16} /> {saving ? "Kaydediliyor..." : "Üretimi Kaydet"}</button></div></>}>
        <div className="pcc-form-grid two">
          <label className="wide">Model *<select value={entry.modelId} onChange={(event) => changeEntryModel(event.target.value)}><option value="">Model seçin</option>{dictionaries.models.filter((model) => !model.isVirtual).map((model) => <option key={model.id || model.modelId} value={model.id || model.modelId}>{model.modelName || model.modelAdi} · {model.companyName || "Firma yok"}</option>)}</select></label>
          <label>Tarih *<input type="date" value={entry.date} onChange={(event) => setEntry({ ...entry, date: event.target.value })} /></label>
          <label>Vardiya *<select value={entry.shift} onChange={(event) => changeEntryShift(event.target.value)}><option>Gündüz</option><option>Gece</option></select></label>
          <label>İrsaliye No<input value={entry.dispatchNo} onChange={(event) => setEntry({ ...entry, dispatchNo: event.target.value, batchNo: event.target.value || entry.batchNo })} /></label>
          <label>Sipariş No<input value={entry.orderNo} onChange={(event) => setEntry({ ...entry, orderNo: event.target.value })} /></label>
          <label>Baskı Bölgesi *<select value={entry.printRegion} onChange={(event) => setEntry({ ...entry, printRegion: event.target.value })}><option value="">Bölge seçin</option>{(currentModelForEntry?.printRegions || []).map((region) => <option key={region.regionName} value={region.regionName}>{region.regionName}</option>)}{!(currentModelForEntry?.printRegions || []).length ? <><option>Ön</option><option>Arka</option><option>Sol Kol</option><option>Sağ Kol</option><option>Ense</option><option>Paça</option></> : null}</select></label>
          <label>Makine *<select value={entry.machineId} onChange={(event) => changeEntryMachine(event.target.value)}><option value="">Makine seçin</option>{dictionaries.machines.map((machine) => <option key={machineId(machine)} value={machineId(machine)}>{machine.machineNo || machine.no} - {machineName(machine)}</option>)}</select></label>
          <label>Makinacı *<input value={entry.operatorName} onChange={(event) => setEntry({ ...entry, operatorName: event.target.value })} /></label>
          <label>Brüt Üretim *<input type="number" min="0" step="1" value={entry.quantity} onChange={(event) => setEntry({ ...entry, quantity: event.target.value })} /></label>
          <label>Baskı Sakatı<input type="number" min="0" step="1" value={entry.printDefectQty} onChange={(event) => setEntry({ ...entry, printDefectQty: event.target.value })} /></label>
          <label>Kumaş Sakatı<input type="number" min="0" step="1" value={entry.fabricDefectQty} onChange={(event) => setEntry({ ...entry, fabricDefectQty: event.target.value })} /></label>
          <label>Test / Numune<input type="number" min="0" step="1" value={entry.testQty} onChange={(event) => setEntry({ ...entry, testQty: event.target.value })} /></label>
          <label>Parti / Seri<input value={entry.batchNo} onChange={(event) => setEntry({ ...entry, batchNo: event.target.value })} /></label>
          <label>Net Sağlam<input value={qty(entryNet)} disabled /></label>
          <label className="wide">Not<textarea rows="4" value={entry.note} onChange={(event) => setEntry({ ...entry, note: event.target.value })} /></label>
        </div>
      </Drawer>

      <Drawer open={modelOpen} width="medium" title="İrsaliyesiz Üretim İşi Aç" subtitle="Model tek merkezde oluşturulur; irsaliye geldiğinde aynı karta bağlanır" onClose={() => setModelOpen(false)} footer={<><span>Gerçek irsaliye gelince model ve firma üzerinden eşleşir.</span><div><button type="button" onClick={() => setModelOpen(false)}>Vazgeç</button><button type="button" className="primary" disabled={saving} onClick={saveModel}><Save size={16} /> {saving ? "Kaydediliyor..." : "İşi Aç"}</button></div></>}>
        <div className="pcc-form-grid two">
          <label className="wide">Model Adı *<input value={modelDraft.modelName} onChange={(event) => setModelDraft({ ...modelDraft, modelName: event.target.value })} placeholder="Örn. WINDY" /></label>
          <label>Model Kodu<input value={modelDraft.modelCode} onChange={(event) => setModelDraft({ ...modelDraft, modelCode: event.target.value })} /></label>
          <label>Firma *<select value={modelDraft.companyId} onChange={(event) => setModelDraft({ ...modelDraft, companyId: event.target.value })}><option value="">Firma seçin</option>{dictionaries.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label>Sipariş No<input value={modelDraft.orderNo} onChange={(event) => setModelDraft({ ...modelDraft, orderNo: event.target.value })} /></label>
          <label>Geçici / Gelen İrsaliye No<input value={modelDraft.dispatchNo} onChange={(event) => setModelDraft({ ...modelDraft, dispatchNo: event.target.value })} /></label>
          <label>Beklenen Adet *<input type="number" min="0" value={modelDraft.expectedQty} onChange={(event) => setModelDraft({ ...modelDraft, expectedQty: event.target.value })} /></label>
          <label>Baskı Bölgeleri<input value={modelDraft.printRegions} onChange={(event) => setModelDraft({ ...modelDraft, printRegions: event.target.value })} placeholder="Ön, Arka, Sol Kol" /></label>
        </div>
      </Drawer>

      <ProductionSmartEntryDrawer open={smartOpen} activeMainCompany={activeMainCompany} onClose={() => setSmartOpen(false)} onSaved={async () => { await Promise.all([load(), loadDictionaries()]); }} />
    </main>
  );
}
