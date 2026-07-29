import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileWarning,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  ReceiptText,
  Settings2,
  Truck,
  X,
} from "lucide-react";
import { getDesignCompanies } from "../../../services/desenWorkflowApi";
import {
  getIsnetFullSyncStatus,
  getIsnetLocalDocuments,
  getIsnetSettings,
  startDailySync,
} from "../../../services/isnetApi";
import { getIsnetAutoFlows } from "../../../services/isnetAutoFlowApi";
import { quickCreateCanonicalModel } from "../../../services/modelFlowApi";
import "../IsnetPage.css";
import "./IsnetManagementCenterPage.css";

const todayText = () => new Date().toISOString().slice(0, 10);
const recentStartText = () => {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
};

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.documents)) return value.documents;
  return [];
}

function dateTime(value) {
  if (!value) return "Henüz yok";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

function flowStatus(value) {
  return {
    MODEL_REQUIRED: "Model onayı gerekiyor",
    OUTGOING_DRAFT_READY: "İrsaliye taslağı hazırlanıyor",
    OUTGOING_SEND_REQUIRED: "Taslak gönderilecek",
    PRICE_REQUIRED: "Fiyat bekliyor",
    INVOICE_DRAFT_READY: "Fatura taslağı hazır",
    COMPLETED: "Tamamlandı",
    ERROR: "Kontrol gerekiyor",
  }[value] || value || "Hazır";
}

export default function IsnetManagementCenterPage({ openModule, activeMainCompany }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [settings, setSettings] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [flows, setFlows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [quickModelOpen, setQuickModelOpen] = useState(false);
  const [quickModelBusy, setQuickModelBusy] = useState(false);
  const [quickModel, setQuickModel] = useState({ modelName: "", companyId: "" });
  const range = useMemo(() => ({ startDate: recentStartText(), endDate: todayText() }), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingResult, statusResult, documentResult, flowResult] = await Promise.all([
        getIsnetSettings(),
        getIsnetFullSyncStatus().catch(() => null),
        getIsnetLocalDocuments({ ...range, page: 1, pageSize: 100 }),
        getIsnetAutoFlows(),
      ]);
      setSettings(settingResult);
      setSyncStatus(statusResult);
      setDocuments(rowsOf(documentResult));
      setDocumentTotal(Number(documentResult?.totalLocal || documentResult?.total || rowsOf(documentResult).length));
      setFlows(rowsOf(flowResult));
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet yönetim bilgileri alınamadı." });
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    getDesignCompanies(activeMainCompany)
      .then((rows) => setCompanies(Array.isArray(rows) ? rows : []))
      .catch(() => setCompanies([]));
  }, [activeMainCompany]);

  const metrics = useMemo(() => {
    const missingFiles = documents.filter((row) => !row.pdfSaved || !row.xmlSaved).length;
    const supplierAccounting = documents.filter(
      (row) => row.direction === "incoming" && row.kind === "invoice" && !row.accountingImported,
    ).length;
    const modelPending = documents.filter(
      (row) => row.direction === "incoming" && row.kind === "dispatch" && row.modelApplicable && !row.modelId,
    ).length;
    const dispatchPending = flows.filter((row) => row.status === "OUTGOING_SEND_REQUIRED").length;
    const pricePending = flows.filter((row) => row.status === "PRICE_REQUIRED").length;
    const errors = documents.filter((row) => row.error || /hata/i.test(row.statusText || "")).length;
    return { missingFiles, supplierAccounting, modelPending, dispatchPending, pricePending, errors };
  }, [documents, flows]);

  const connectionReady = Boolean(
    settings?.companyId && settings?.hasPassword && settings?.username,
  );
  const connectionLabel = connectionReady
    ? settings?.connectionMode === "portal"
      ? "İşNet portal bağlantısı kayıtlı"
      : "İşNet API bağlantısı kayıtlı"
    : "Yerel mod – bağlantı bilgileri eksik";
  const lastSyncAt = syncStatus?.completedAt || syncStatus?.lastRunAt;

  async function synchronize() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await startDailySync(range);
      const accounting = result?.supplierAccounting || {};
      setNotice({
        tone: accounting.failed > 0 ? "warning" : "success",
        text: `Senkronizasyon tamamlandı: ${Number(result?.automation?.downloaded || 0)} yeni/eksik dosya, ${Number(accounting.imported || 0)} yeni tedarikçi faturası işlendi${accounting.failed ? `, ${accounting.failed} kayıt kontrol bekliyor.` : "."}`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet senkronizasyonu tamamlanamadı." });
    } finally {
      setBusy(false);
    }
  }

  async function createQuickModel() {
    const modelName = quickModel.modelName.trim();
    if (!modelName) {
      setNotice({ tone: "warning", text: "Hızlı model açmak için model adı zorunludur." });
      return;
    }
    if (!quickModel.companyId) {
      setNotice({ tone: "warning", text: "Model için kayıtlı müşteri firma seçilmelidir." });
      return;
    }
    const company = companies.find((row) => row.id === quickModel.companyId);
    setQuickModelBusy(true);
    try {
      const result = await quickCreateCanonicalModel(activeMainCompany, {
        modelName,
        companyId: quickModel.companyId,
        firmaId: quickModel.companyId,
        firmaAdi: company?.name || "",
        companyName: company?.name || "",
        sourceModule: "ISNET",
      });
      setQuickModelOpen(false);
      setQuickModel({ modelName: "", companyId: "" });
      setNotice({
        tone: "success",
        text: `${result?.model?.modelName || modelName} Desen merkezinde tek model olarak açıldı. İşNet, Boyahane, İmalat ve Muhasebe aynı model kimliğini kullanacak.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Model açılamadı." });
    } finally {
      setQuickModelBusy(false);
    }
  }

  const workItems = [
    ["Eksik PDF/XML", metrics.missingFiles, "belge-merkezi", FileWarning],
    ["Muhasebe bekleyen tedarikçi faturası", metrics.supplierAccounting, "belge-merkezi", ReceiptText],
    ["Model bekleyen müşteri irsaliyesi", metrics.modelPending, "is-akisi", Truck],
    ["Gönderilecek irsaliye taslağı", metrics.dispatchPending, "is-akisi", Clock3],
    ["Fiyat bekleyen fatura", metrics.pricePending, "is-akisi", ReceiptText],
    ["Hatalı / kontrol gereken", metrics.errors, "belge-merkezi", AlertTriangle],
  ];

  return (
    <main className="isnet-page isnet-management-page" aria-busy={loading}>
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><Link2 size={14} /> GERÇEK DURUM MERKEZİ</span>
          <h1>İşNet Yönetim Merkezi</h1>
          <p>Canlı bağlantıyı, son senkronizasyonu ve yalnız müdahale gereken işleri görün.</p>
        </div>
        <div className="isnet-hero__actions">
          <button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => setQuickModelOpen(true)}><Plus size={15} /> Hızlı Model Aç</button>
          <button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => openModule?.("isnet", { tabKey: "ayarlar" })}><Settings2 size={15} /> Bağlantı Ayarları</button>
          <button type="button" className="isnet-btn isnet-btn--primary" onClick={synchronize} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} İşNet'i Senkronize Et</button>
        </div>
      </header>

      {notice && <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>{notice.text}</div>}

      <section className={`isnet-connection-strip ${connectionReady ? "ready" : "offline"}`}>
        <div>{connectionReady ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}<strong>{connectionLabel}</strong><span>{settings?.companyName || "İşNet firması seçilmedi"}</span></div>
        <div><small>Son başarılı senkronizasyon</small><strong>{dateTime(lastSyncAt)}</strong></div>
        <div><small>Son bağlantı testi / yerel belge</small><strong>{dateTime(settings?.testedAt)} · {documentTotal} kayıt</strong></div>
      </section>

      {loading ? <section className="isnet-card"><div className="isnet-empty"><LoaderCircle className="spin" /><strong>Gerçek durum hesaplanıyor</strong></div></section> : <section className="isnet-management-grid">{workItems.map(([label, value, tabKey, Icon]) => <button key={label} type="button" className={Number(value) > 0 ? "attention" : "clear"} onClick={() => openModule?.("isnet", { tabKey })}><span><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong><p>{Number(value) > 0 ? "İncelemek için aç" : "Bekleyen işlem yok"}</p></div></button>)}</section>}

      <section className="isnet-card">
        <div className="isnet-section-head"><div><small>SON OTOMATİK İŞLER</small><h2>İrsaliye ve fatura akışı</h2><p>Yalnız açık veya kontrol bekleyen işlemler gösterilir.</p></div><button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => openModule?.("isnet", { tabKey: "is-akisi" })}>İş Akışını Aç</button></div>
        {flows.filter((row) => row.status !== "COMPLETED").length === 0 ? <div className="isnet-empty"><CheckCircle2 /><strong>Açık otomatik iş yok</strong></div> : <div className="isnet-table-wrap"><table className="isnet-table"><thead><tr><th>Kaynak</th><th>Müşteri</th><th>Model</th><th>Adet</th><th>Durum</th></tr></thead><tbody>{flows.filter((row) => row.status !== "COMPLETED").slice(0, 12).map((row) => <tr key={row.id}><td><strong>{row.incomingDocumentNo || row.incomingSourceId}</strong></td><td>{row.companyName}</td><td>{row.modelName || "Model bekliyor"}</td><td>{row.quantity}</td><td><span className="isnet-badge isnet-badge--blue">{flowStatus(row.status)}</span></td></tr>)}</tbody></table></div>}
      </section>

      {quickModelOpen ? <div className="isnet-modal-backdrop"><section className="isnet-modal"><button type="button" className="isnet-modal-close" onClick={() => setQuickModelOpen(false)}><X size={18} /></button><h2>Tek Merkezli Hızlı Model Aç</h2><p>Model ana kaydı Desen merkezinde oluşur. Firma serbest yazılmaz; gerçek müşteri kartı seçilir.</p><label>Model adı *<input autoFocus value={quickModel.modelName} onChange={(event) => setQuickModel((current) => ({ ...current, modelName: event.target.value }))} /></label><label>Müşteri firma *<select value={quickModel.companyId} onChange={(event) => setQuickModel((current) => ({ ...current, companyId: event.target.value }))}><option value="">Firma seçin</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><div className="isnet-actions"><button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => setQuickModelOpen(false)}>Vazgeç</button><button type="button" className="isnet-btn isnet-btn--primary" onClick={createQuickModel} disabled={quickModelBusy}>{quickModelBusy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} Modeli Aç</button></div></section></div> : null}
    </main>
  );
}
