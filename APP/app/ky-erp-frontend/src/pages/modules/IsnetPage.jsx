import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Building2,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Mail,
  LockKeyhole,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import {
  completeInvoiceArchive,
  backfillIsnetPortalDocument,
  assignIsnetIntakeModel,
  createIsnetInvoiceFromDispatch,
  createIsnetManualInvoiceDraft,
  createIsnetIntakeModel,
  createIsnetManualDispatchDraft,
  createOutlookDraft,
  getIncomingDispatches,
  getIsnetDashboard,
  getIsnetConfiguration,
  getIsnetIntakeDetail,
  getIsnetIncomingDispatchDraft,
  getIsnetDispatchInvoiceDraft,
  getIsnetInvoiceDraftStatus,
  getIsnetModelSuggestions,
  getIsnetInvoiceAssistantTemplate,
  getIsnetRecipientContext,
  getIsnetPrintPdf,
  getIsnetBulkPrintPdf,
  getIsnetPrintQueue,
  getIsnetPortalDocumentFile,
  getIsnetLocalDocuments,
  getIsnetSettings,
  getIssuedDocumentFile,
  getIssuedDocuments,
  getMailQueue,
  importIsnetIncomingDispatch,
  markIsnetDocumentRead,
  markIsnetDocumentsRead,
  markIsnetPrinted,
  markIsnetBulkPrinted,
  markMailSent,
  prepareInvoiceDraft,
  finalApproveIsnetInvoiceDraft,
  submitIsnetOfficialInvoice,
  retryIsnetInvoiceClosure,
  saveIsnetSettings,
  saveIsnetInvoiceAssistantTemplate,
  searchIsnetRecipients,
  startDailySync,
  testIsnetSettings,
  validateInvoiceDraft,
} from "../../services/isnetApi";
import "./IsnetPage.css";
import DispatchWorkspace from "./muhasebe/DispatchWorkspace";

const TAB_COPY = {
  "yonetim-merkezi": [
    "İşNet Yönetim Merkezi",
    "Belge, fatura ve mail akışının tek kontrol noktası.",
  ],
  "gelen-irsaliyeler": [
    "Gelen İrsaliyeler",
    "İşNet portalındaki gelen e-irsaliyeleri tarih aralığıyla görüntüleyin.",
  ],
  "giden-irsaliyeler": [
    "Giden İrsaliyeler",
    "İşNet portalından gönderilen e-irsaliyeleri ve durumlarını görüntüleyin.",
  ],
  "gelen-faturalar": [
    "Gelen Faturalar",
    "İşNet portalındaki gelen e-faturaları tarih aralığıyla görüntüleyin.",
  ],
  "giden-faturalar": [
    "Giden Faturalar",
    "İşNet portalından gönderilen e-faturaları ve durumlarını görüntüleyin.",
  ],
  "belge-akisi": [
    "Gelen / Giden İşNet Belgeleri",
    "İşNet'ten alınan fatura ve irsaliyeleri yönü, dosya durumu ve muhasebe aktarımıyla birlikte izleyin.",
  ],
  "irsaliyeden-faturaya": [
    "İşNet Fatura Kesme",
    "Yeni fatura, üretim kaydı veya irsaliye üzerinden taslak hazırlayın ve zorunlu alanları tamamlayın.",
  ],
  "yeni-irsaliye": [
    "Yeni İrsaliye Oluştur",
    "Firma, model ve ürün satırlarını seçerek İşNet taslağını KY ERP içinde hazırlayın.",
  ],
  "kesilen-belgeler": [
    "Kesilen Belgeler",
    "Fatura, irsaliye ve arşiv dosyalarının durumunu takip edin.",
  ],
  "cikti-kuyrugu": [
    "İşNet Çıktı Kuyruğu",
    "Gelen ve giden belgeleri atlamadan sırayla yazdırın ve çıktı durumunu izleyin.",
  ],
  "mail-merkezi": [
    "Mail Merkezi",
    "İki PDF eki ve alıcıları tamamlanmış gönderimleri yönetin.",
  ],
  ayarlar: [
    "İşNet Ayarları",
    "Bağlantı, yetenek ve dosya arşivi durumunu kontrol edin.",
  ],
};

const PORTAL_TABS = {
  "gelen-irsaliyeler": { kind: "dispatch", direction: "incoming" },
  "giden-irsaliyeler": { kind: "dispatch", direction: "outgoing" },
  "gelen-faturalar": { kind: "invoice", direction: "incoming" },
  "giden-faturalar": { kind: "invoice", direction: "outgoing" },
};

const todayText = () => new Date().toISOString().slice(0, 10);
const recentStartText = () => {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
};

const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });

function Badge({ tone = "neutral", children }) {
  return <span className={`isnet-badge isnet-badge--${tone}`}>{children}</span>;
}

function Metric({ icon: Icon, label, value, note, tone = "blue" }) {
  return (
    <article className="isnet-card isnet-metric">
      <span className={`isnet-metric__icon isnet-metric__icon--${tone}`}>
        <Icon size={18} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </article>
  );
}

function EmptyState({ icon: Icon = FileText, title, text }) {
  return (
    <div className="isnet-empty">
      <span>
        <Icon size={22} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function SectionHead({ eyebrow, title, description, action }) {
  return (
    <div className="isnet-section-head">
      <div>
        {eyebrow && <small>{eyebrow}</small>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export default function IsnetPage({
  activeTab = "yonetim-merkezi",
  activeMainCompany,
  openModule,
}) {
  const [dashboard, setDashboard] = useState(null);
  const [dispatches, setDispatches] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [archiveFilters, setArchiveFilters] = useState({
    search: "",
    type: "all",
    file: "all",
    sort: "newest",
  });
  const [mailQueue, setMailQueue] = useState([]);
  const [settings, setSettings] = useState(null);
  const [connectionForm, setConnectionForm] = useState({
    username: "",
    password: "",
    companyId: "",
    companies: [],
    connectionMode: "",
  });
  const [selectedDispatchId, setSelectedDispatchId] = useState("");
  const [invoiceDraft, setInvoiceDraft] = useState({
    invoiceSeries: "HKN2026",
    invoiceDate: new Date().toISOString().slice(0, 10),
    vatRate: 20,
    unitPrice: "",
  });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState(null);
  const [portalResult, setPortalResult] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalAttempted, setPortalAttempted] = useState(false);
  const [portalUpdateStatus, setPortalUpdateStatus] = useState("");
  const [portalSearch, setPortalSearch] = useState("");
  const [portalFlowFilters, setPortalFlowFilters] = useState({ direction: "all", kind: "all", status: "all" });
  const [portalSort, setPortalSort] = useState("document-newest");
  const [selectedDocumentKeys, setSelectedDocumentKeys] = useState([]);
  const [portalRange, setPortalRange] = useState({
    startDate: recentStartText(),
    endDate: todayText(),
  });
  const [portalPage, setPortalPage] = useState(1);
  const [portalPageSize, setPortalPageSize] = useState(50);
  const [documentPreview, setDocumentPreview] = useState(null);
  const [documentFileBusy, setDocumentFileBusy] = useState("");
  const [dispatchWorkflow, setDispatchWorkflow] = useState(null);
  const [dispatchModelSearch, setDispatchModelSearch] = useState("");
  const [outgoingDraftWorkflow, setOutgoingDraftWorkflow] = useState(null);
  const [invoiceWorkflow, setInvoiceWorkflow] = useState(null);
  const [invoiceRecipientQuery, setInvoiceRecipientQuery] = useState("");
  const [invoiceRecipientRows, setInvoiceRecipientRows] = useState([]);
  const [invoiceTemplate, setInvoiceTemplate] = useState(null);
  const [workflowBusy, setWorkflowBusy] = useState("");
  const [newModelDraft, setNewModelDraft] = useState(null);
  const [newModelImage, setNewModelImage] = useState(null);
  const [newModelPreview, setNewModelPreview] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientRows, setRecipientRows] = useState([]);
  const [printQueue, setPrintQueue] = useState({ rows: [], waiting: 0 });
  const [printPreview, setPrintPreview] = useState(null);
  const [selectedPrintKeys, setSelectedPrintKeys] = useState([]);
  const [printFilters, setPrintFilters] = useState({
    search: "",
    kind: "all",
    direction: "all",
    status: "pending",
    sort: "newest",
  });
  const [manualDispatch, setManualDispatch] = useState({
    recipientId: "",
    recipientName: "",
    issueDate: todayText(),
    issueTime: new Date().toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    modelName: "",
    note: "",
    lines: [
      { productName: "", description: "", quantity: 1, measureUnitId: 67 },
    ],
  });

  const companyKey = activeMainCompany?.slug || activeMainCompany?.id || "";
  const capabilities = dashboard?.configuration?.capabilities || {};
  const selectedDispatch =
    dispatches.find((row) => row.id === selectedDispatchId) || null;
  const portalTab = PORTAL_TABS[activeTab] || null;
  const portalFlow = activeTab === "belge-akisi";
  const visiblePortalDocuments = useMemo(() => {
    if (!portalTab && !portalFlow) return [];
    const query = portalSearch.trim().toLocaleLowerCase("tr-TR");
    const dateValue = (value) => {
      const text = String(value || "");
      const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      if (match) return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
      const parsed = Date.parse(text);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return (portalResult?.documents || []).filter((row) => {
      if (portalTab && (row.kind !== portalTab.kind || row.direction !== portalTab.direction)) return false;
      if (portalFlowFilters.direction !== "all" && row.direction !== portalFlowFilters.direction) return false;
      if (portalFlowFilters.kind !== "all" && row.kind !== portalFlowFilters.kind) return false;
      if (portalFlowFilters.status === "draft" && !/taslak/i.test(`${row.portalStatusText || ""} ${row.statusText || ""} ${row.scenarioText || ""} ${row.subtypeText || ""}`)) return false;
      if (!query) return true;
      return [
        row.documentNo,
        row.partnerName,
        row.statusText,
        row.scenarioText,
        row.subtypeText,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query);
    }).sort((left, right) => {
      if (portalSort === "number") return String(left.documentNo || "").localeCompare(String(right.documentNo || ""), "tr-TR", { numeric: true });
      const source = portalSort === "downloaded" ? "downloadedAt" : "dateText";
      const comparison = dateValue(right[source] || right.dateText || right.createdAt) - dateValue(left[source] || left.dateText || left.createdAt);
      if (comparison) return portalSort === "document-oldest" ? -comparison : comparison;
      return String(right.documentNo || right.id).localeCompare(String(left.documentNo || left.id), "tr-TR", { numeric: true });
    });
  }, [portalFlow, portalFlowFilters, portalResult, portalSearch, portalSort, portalTab]);

  const visiblePrintRows = useMemo(() => {
    const query = printFilters.search.trim().toLocaleLowerCase("tr-TR");
    const dateValue = (value) => {
      const text = String(value || "");
      const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      if (match) return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
      const parsed = Date.parse(text);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return (printQueue.rows || [])
      .filter((row) => {
        if (printFilters.kind !== "all" && row.kind !== printFilters.kind) return false;
        if (printFilters.direction !== "all" && row.direction !== printFilters.direction) return false;
        if (printFilters.status === "pending" && row.printedAt) return false;
        if (printFilters.status === "printed" && !row.printedAt) return false;
        if (!query) return true;
        return [row.documentNo, row.partnerName, row.modelName, row.dateText]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("tr-TR").includes(query));
      })
      .sort((left, right) => {
        const comparison =
          dateValue(right.dateText || right.downloadedAt) -
          dateValue(left.dateText || left.downloadedAt);
        return printFilters.sort === "oldest" ? -comparison : comparison;
      });
  }, [printFilters, printQueue.rows]);

  const selectableVisibleKeys = useMemo(
    () => visiblePortalDocuments.map((row) => row.automationKey).filter(Boolean),
    [visiblePortalDocuments],
  );

  useEffect(() => {
    const visible = new Set(selectableVisibleKeys);
    setSelectedDocumentKeys((current) => current.filter((key) => visible.has(key)));
  }, [selectableVisibleKeys]);

  useEffect(() => () => {
    if (newModelPreview) URL.revokeObjectURL(newModelPreview);
  }, [newModelPreview]);

  const visibleArchiveDocuments = useMemo(() => {
    const query = archiveFilters.search.trim().toLocaleLowerCase("tr-TR");
    const dateValue = (value) => {
      const match = String(value || "").match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      if (match) return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
      return 0;
    };
    return documents
      .filter((row) => {
        const type = String(row.documentTypeText || "").toLocaleLowerCase("tr-TR");
        if (archiveFilters.type === "invoice" && !type.includes("fatura")) return false;
        if (archiveFilters.type === "dispatch" && !type.includes("irsaliye")) return false;
        if (archiveFilters.file === "complete" && !row.filesReady) return false;
        if (archiveFilters.file === "missing" && row.filesReady) return false;
        if (!query) return true;
        return [row.documentNo, row.companyName, row.modelName, row.groupName]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("tr-TR").includes(query));
      })
      .sort((left, right) => {
        const comparison = dateValue(right.dateText) - dateValue(left.dateText);
        return archiveFilters.sort === "oldest" ? -comparison : comparison;
      });
  }, [archiveFilters, documents]);

  const closeDocumentPreview = useCallback(() => {
    setDocumentPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  useEffect(() => closeDocumentPreview, [closeDocumentPreview]);

  useEffect(
    () => () => {
      if (printPreview?.url) URL.revokeObjectURL(printPreview.url);
    },
    [printPreview?.url],
  );

  async function loadDocumentFile(document, format, download = false) {
    const busyKey = `${document.id}-${format}-${download ? "download" : "preview"}`;
    setDocumentFileBusy(busyKey);
    try {
      const blob = await getIsnetPortalDocumentFile(document, format);
      if (document.automationKey && document.localUnread) {
        await markIsnetDocumentRead(document.automationKey, true);
        setPortalResult((current) =>
          current
            ? {
                ...current,
                documents: (current.documents || []).map((row) =>
                  row.id === document.id
                    ? {
                        ...row,
                        localUnread: false,
                        isNew: false,
                        localReadAt: new Date().toISOString(),
                      }
                    : row,
                ),
              }
            : current,
        );
      }
      if (download) {
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement("a");
        link.href = url;
        link.download = `${document.documentNo || document.sourceId}.${format}`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
        return;
      }
      closeDocumentPreview();
      if (format === "pdf") {
        setDocumentPreview({
          document,
          format,
          url: URL.createObjectURL(blob),
        });
      } else {
        setDocumentPreview({ document, format, text: await blob.text() });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İşNet belge dosyası alınamadı.",
      });
    } finally {
      setDocumentFileBusy("");
    }
  }

  async function updateSelectedReadStatus(isRead) {
    if (!selectedDocumentKeys.length) return;
    setWorkflowBusy(isRead ? "bulk-read" : "bulk-unread");
    setNotice(null);
    try {
      const result = await markIsnetDocumentsRead(selectedDocumentKeys, isRead);
      if (!result?.success || !Number.isFinite(Number(result.updatedCount))) {
        throw new Error("Toplu durum güncellemesi doğrulanamadı.");
      }
      await loadPortalDocuments();
      setSelectedDocumentKeys([]);
      setNotice({
        tone: "success",
        text: `${result.updatedCount} belge ${isRead ? "okundu" : "okunmadı"} olarak kaydedildi${result.missingDocumentIds?.length ? `; ${result.missingDocumentIds.length} kayıt bulunamadı.` : "."}`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Belge durumları güncellenemedi." });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function openIssuedDocument(row, format = "pdf") {
    const busyKey = `archive-${row.id}-${format}`;
    setDocumentFileBusy(busyKey);
    try {
      const blob = await getIssuedDocumentFile(row.id, format);
      closeDocumentPreview();
      const document = {
        ...row,
        partnerName: row.companyName,
        statusText: row.status,
      };
      if (format === "pdf") {
        setDocumentPreview({ document, format, url: URL.createObjectURL(blob) });
      } else {
        setDocumentPreview({ document, format, text: await blob.text() });
      }
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Arşiv dosyası açılamadı." });
    } finally {
      setDocumentFileBusy("");
    }
  }

  async function openDispatchWorkflow(document, imported = null) {
    const intakeId = imported?.intake?.id || document.intakeId;
    if (!intakeId) return;
    setDispatchWorkflow({
      document,
      intake: imported?.intake || { id: intakeId, lines: [] },
      modelData: { suggestions: [] },
      loading: true,
      error: "",
    });
    setWorkflowBusy("open");
    try {
      const intake = imported?.intake || await getIsnetIntakeDetail(intakeId);
      const supplier = document.modelApplicable === false || document.companyType === "SUPPLIER";
      setDispatchWorkflow((current) => current?.document?.id === document.id
        ? { ...current, intake, loading: !supplier }
        : current);
      const modelData = supplier
        ? { suggestions: [], requiresModel: false, notApplicable: true }
        : await getIsnetModelSuggestions(intakeId, intake.modelGuess || "");
      setDispatchWorkflow((current) => current?.document?.id === document.id
        ? { ...current, intake, modelData, loading: false, error: "" }
        : current);
      setDispatchModelSearch("");
    } catch (error) {
      setDispatchWorkflow((current) => current?.document?.id === document.id
        ? { ...current, loading: false, error: error?.message || "Belge detayı yüklenemedi. Tekrar deneyin." }
        : current);
      setNotice({
        tone: "error",
        text: error?.message || "İrsaliye işlem kaydı açılamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function handleImportDispatch(document) {
    if (document.intakeId) {
      await openDispatchWorkflow(document);
      return;
    }
    if (
      !window.confirm(
        `${document.documentNo} numaralı irsaliyenin gerçek PDF ve XML dosyaları indirilip işleme alınsın mı?`,
      )
    )
      return;
    setWorkflowBusy(`import-${document.id}`);
    setNotice(null);
    try {
      const result = await importIsnetIncomingDispatch(document);
      setNotice({ tone: "success", text: result.message });
      await openDispatchWorkflow(document, result);
      await loadPortalDocuments();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İrsaliye işleme alınamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function handleAssignModel(candidate) {
    if (!dispatchWorkflow?.intake?.id) return;
    setWorkflowBusy(`model-${candidate.id}`);
    try {
      const result = await assignIsnetIntakeModel(dispatchWorkflow.intake.id, {
        candidateId: candidate.id,
        source: candidate.source,
      });
      setDispatchWorkflow((current) => ({
        ...current,
        intake: result.intake,
        modelData: {
          ...current.modelData,
          currentModelId: result.model.id,
          requiresModel: false,
        },
      }));
      setPortalResult((current) =>
        current
          ? {
              ...current,
              documents: current.documents.map((item) =>
                item.intakeId === dispatchWorkflow.intake.id
                  ? { ...item, modelId: result.model.id }
                  : item,
              ),
            }
          : current,
      );
      setNotice({
        tone: "success",
        text: `${result.model.modelName} modeli irsaliyeye bağlandı.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Model bağlanamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function handleCreateModel() {
    if (!dispatchWorkflow?.intake?.id) return;
    if (arguments.length === 0) {
      const firstLine = dispatchWorkflow.intake.lines?.[0] || {};
      setNewModelDraft({
        modelName: dispatchWorkflow.intake.modelGuess || firstLine.modelGuess || "",
        companyName: dispatchWorkflow.intake.issuerName || dispatchWorkflow.document.partnerName || "",
        description: firstLine.description || firstLine.rawName || "",
        orderNo: firstLine.orderNo || "",
        modelCode: firstLine.productCode || "",
        color: firstLine.color || "",
        region: firstLine.region || "",
        note: "",
        documentLineId: firstLine.id || "",
      });
      setNewModelImage(null);
      setNewModelPreview("");
      return;
    }
    const modelName = window.prompt(
      "Yeni model adı",
      dispatchWorkflow.intake.modelGuess || "",
    );
    if (!modelName?.trim()) return;
    if (!window.confirm(`“${modelName.trim()}” adıyla yeni model açılsın mı?`))
      return;
    setWorkflowBusy("create-model");
    try {
      const result = await createIsnetIntakeModel(dispatchWorkflow.intake.id, {
        modelName: modelName.trim(),
      });
      setDispatchWorkflow((current) => ({
        ...current,
        intake: result.intake,
        modelData: {
          ...current.modelData,
          currentModelId: result.model.id,
          requiresModel: false,
        },
      }));
      setDispatchModelSearch("");
      setPortalResult((current) =>
        current
          ? {
              ...current,
              documents: current.documents.map((item) =>
                item.intakeId === dispatchWorkflow.intake.id
                  ? { ...item, modelId: result.model.id }
                  : item,
              ),
            }
          : current,
      );
      setNotice({
        tone: "success",
        text: `${result.model.modelName} modeli açıldı ve irsaliyeye bağlandı.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Model açılamadı." });
    } finally {
      setWorkflowBusy("");
    }
  }

  function chooseNewModelImage(file) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setNotice({ tone: "warning", text: "Yalnız JPG, JPEG, PNG veya WEBP görsel seçebilirsiniz." });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setNotice({ tone: "warning", text: "Görsel en fazla 8 MB olabilir." });
      return;
    }
    if (newModelPreview) URL.revokeObjectURL(newModelPreview);
    setNewModelImage(file);
    setNewModelPreview(URL.createObjectURL(file));
  }

  async function saveNewModel() {
    const modelName = newModelDraft?.modelName?.trim();
    if (!modelName || !dispatchWorkflow?.intake?.id) {
      setNotice({ tone: "warning", text: "Model adı zorunludur." });
      return;
    }
    setWorkflowBusy("create-model");
    setNotice(null);
    try {
      const imageBase64 = newModelImage
        ? await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Görsel okunamadı."));
            reader.readAsDataURL(newModelImage);
          })
        : "";
      const result = await createIsnetIntakeModel(dispatchWorkflow.intake.id, {
        ...newModelDraft,
        modelName,
        imageBase64,
        imageMimeType: newModelImage?.type || "",
        imageName: newModelImage?.name || "",
      });
      if (!result?.success || !result.model?.id || result.documentLine?.modelId !== result.model.id) {
        throw new Error("Model ve belge bağlantısı doğrulanamadı.");
      }
      const [intake, modelData] = await Promise.all([
        getIsnetIntakeDetail(dispatchWorkflow.intake.id),
        getIsnetModelSuggestions(dispatchWorkflow.intake.id),
      ]);
      if (intake?.modelId !== result.model.id) throw new Error("Belge-model bağlantısı yeniden sorgulamada bulunamadı.");
      setDispatchWorkflow((current) => current ? { ...current, intake, modelData } : current);
      setNewModelDraft(null);
      setNewModelImage(null);
      setNewModelPreview("");
      await loadPortalDocuments();
      setNotice({ tone: "success", text: `${result.model.modelName || result.model.name} Desen Havuzu'na kaydedildi ve belgeye bağlandı.` });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Model kaydedilemedi; bilgileriniz korunuyor." });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function handleCreateOutgoingDraft(document) {
    const modelId = dispatchWorkflow?.intake?.modelId || document.modelId;
    if (!modelId) {
      setNotice({
        tone: "warning",
        text: "Önce irsaliyeye bir model bağlayın.",
      });
      return;
    }
    setWorkflowBusy("prepare-outgoing-draft");
    try {
      const draft = await getIsnetIncomingDispatchDraft(document);
      setOutgoingDraftWorkflow({
        ...draft,
        document,
        recipientId: draft.recipient?.id || "",
        recipientName: draft.recipient?.name || draft.recipientName || "",
        lines: (draft.lines || []).map((line) => ({
          ...line,
          productName: line.productName || line.description || draft.modelName || "",
          quantity: Number(line.quantity || 1),
          measureUnitId: line.measureUnitId || 67,
        })),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Düzenlenebilir irsaliye taslağı hazırlanamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  function updateOutgoingDraftLine(index, field, value) {
    setOutgoingDraftWorkflow((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  }

  async function saveOutgoingDraftWorkflow() {
    if (!outgoingDraftWorkflow?.recipientId) {
      setNotice({ tone: "warning", text: "İşNet alıcı firma eşleşmesi bulunamadı." });
      return;
    }
    if (!outgoingDraftWorkflow.modelName?.trim()) {
      setNotice({ tone: "warning", text: "Taslakta model adı zorunludur." });
      return;
    }
    if (!outgoingDraftWorkflow.lines?.some((line) => line.productName?.trim())) {
      setNotice({ tone: "warning", text: "En az bir ürün satırı zorunludur." });
      return;
    }
    if (!window.confirm("Kontrol edilen giden irsaliye İşNet'te taslak olarak oluşturulsun mu?")) return;
    setWorkflowBusy("save-outgoing-draft");
    try {
      const result = await createIsnetManualDispatchDraft(outgoingDraftWorkflow);
      setNotice({ tone: "success", text: result.message });
      setOutgoingDraftWorkflow(null);
      setDispatchWorkflow(null);
      await loadPortalDocuments();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İrsaliye taslağı oluşturulamadı." });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function openInvoiceWorkflow(document) {
    setWorkflowBusy(`invoice-${document.id}`);
    setNotice(null);
    try {
      const draft = await getIsnetDispatchInvoiceDraft(document.sourceId);
      setInvoiceWorkflow({
        document,
        ...draft,
        modelName:
          document.modelName || document.modelGuess || draft.modelName || "",
        departmentNo: draft.departmentNo || "",
        lines: (draft.lines || []).map((line) => ({
          ...line,
          unitPrice: Number(line.unitPrice || 0),
          vatRate: Number(line.vatRate ?? 20),
          measureUnitId: line.measureUnitId || 67,
        })),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Fatura taslağı KY ERP içinde hazırlanamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function openNewInvoiceWorkflow(seed = {}) {
    setWorkflowBusy("new-invoice");
    setNotice(null);
    try {
      const template =
        invoiceTemplate || (await getIsnetInvoiceAssistantTemplate());
      setInvoiceTemplate(template);
      const quantity = Number(
        seed.invoiceRemainingQty || seed.productionQty || seed.dispatchQty || 1,
      );
      setInvoiceWorkflow({
        mode: "manual",
        sourceId: "",
        recipient: null,
        recipientId: "",
        recipientName: seed.companyName || "",
        localCompanyId: seed.companyId || "",
        invoiceDate: todayText(),
        dueDate: todayText(),
        dispatchNo: seed.dispatchNo || "",
        dispatchDate: seed.dispatchDate || todayText(),
        orderNo: seed.orderNo || "",
        modelId: seed.modelId || "",
        modelName: seed.modelName || seed.description || "",
        modelImageUrl: seed.modelImageUrl || "",
        productionRecordId: seed.productionRecordId || "",
        departmentNo: "",
        departments: [],
        contacts: [],
        scenarioType: template.scenarioType || "2",
        invoiceType: template.invoiceType || "1",
        currency: template.currency || "TRY",
        measureUnitId: template.measureUnitId || 67,
        notes: Array.isArray(template.notes) ? template.notes : [],
        lines: [
          {
            lineNo: 1,
            productName:
              seed.modelName || seed.description || "Baskı hizmeti",
            description: seed.description || seed.modelName || "",
            quantity: quantity > 0 ? quantity : 1,
            unitPrice: 0,
            vatRate: Number(template.vatRate ?? 20),
            measureUnitId: template.measureUnitId || 67,
          },
        ],
      });
      setInvoiceRecipientQuery(seed.companyName || "");
      setInvoiceRecipientRows([]);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Yeni fatura yardımcısı açılamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function selectInvoiceRecipient(recipient) {
    setWorkflowBusy("invoice-recipient");
    try {
      const context = recipient.localCompanyId
        ? await getIsnetRecipientContext(recipient.localCompanyId)
        : { departments: [], contacts: [] };
      setInvoiceWorkflow((current) => ({
        ...current,
        recipient,
        recipientId: recipient.id,
        recipientName: recipient.name,
        localCompanyId: recipient.localCompanyId || "",
        departments: context.departments || [],
        contacts: context.contacts || [],
      }));
      setInvoiceRecipientQuery(recipient.name);
      setInvoiceRecipientRows([]);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Firma bilgileri alınamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  useEffect(() => {
    if (invoiceWorkflow?.mode !== "manual") return undefined;
    const search = invoiceRecipientQuery.trim();
    if (search.length < 2 || invoiceWorkflow.recipient?.name === search) {
      setInvoiceRecipientRows([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchIsnetRecipients("invoice", search);
        setInvoiceRecipientRows(result.rows || []);
      } catch (error) {
        setNotice({
          tone: "error",
          text: error?.message || "İşNet alıcı firmaları aranamadı.",
        });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [invoiceRecipientQuery, invoiceWorkflow?.mode, invoiceWorkflow?.recipient?.name]);

  useEffect(() => {
    if (!dispatchWorkflow?.intake?.id || dispatchWorkflow.loading || dispatchWorkflow.modelData?.notApplicable) return undefined;
    if (dispatchModelSearch.trim().length < 2) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        const modelData = await getIsnetModelSuggestions(
          dispatchWorkflow.intake.id,
          dispatchModelSearch,
        );
        setDispatchWorkflow((current) =>
          current?.intake?.id === dispatchWorkflow.intake.id
            ? { ...current, modelData }
            : current,
        );
      } catch (error) {
        setNotice({
          tone: "error",
          text: error?.message || "Desen havuzu modelleri alınamadı.",
        });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [dispatchModelSearch, dispatchWorkflow?.intake?.id, dispatchWorkflow?.loading, dispatchWorkflow?.modelData?.notApplicable]);

  function updateInvoiceLine(index, field, value) {
    setInvoiceWorkflow((current) => ({
      ...current,
      previewApproved: false,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  }

  function addInvoiceLine() {
    setInvoiceWorkflow((current) => ({
      ...current,
      previewApproved: false,
      lines: [
        ...(current.lines || []),
        {
          lineNo: (current.lines || []).length + 1,
          productName: current.modelName || "Baskı hizmeti",
          description: current.modelName || "",
          quantity: 1,
          unitPrice: 0,
          vatRate: Number(current.lines?.[0]?.vatRate ?? 20),
          measureUnitId: current.measureUnitId || 67,
        },
      ],
    }));
  }

  function removeInvoiceLine(index) {
    setInvoiceWorkflow((current) => ({
      ...current,
      previewApproved: false,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  async function saveInvoiceWorkflow() {
    if (!invoiceWorkflow) return;
    if (!invoiceWorkflow.recipientId && invoiceWorkflow.mode === "manual") {
      setNotice({ tone: "warning", text: "Önce İşNet alıcı firmasını seçin." });
      return;
    }
    if (!invoiceWorkflow.departmentNo?.trim()) {
      setNotice({
        tone: "warning",
        text: "Fatura ve mail akışı için departman/bölüm kodunu seçin.",
      });
      return;
    }
    if (
      invoiceWorkflow.lines.some((line) => Number(line.unitPrice || 0) <= 0)
    ) {
      setNotice({
        tone: "warning",
        text: "Fatura satırlarının birim fiyatlarını girin.",
      });
      return;
    }
    if (!invoiceWorkflow.previewApproved) {
      setNotice({
        tone: "warning",
        text: "Taslağı oluşturmadan önce fatura önizlemesini açıp kontrolü onaylayın.",
      });
      return;
    }
    if (
      !window.confirm(
        invoiceWorkflow.mode === "manual"
          ? `${invoiceWorkflow.recipientName} için fatura taslağı oluşturulsun mu?`
          : `${invoiceWorkflow.dispatchNo} irsaliyesine bağlı fatura taslağı oluşturulsun mu?`,
      )
    )
      return;
    setWorkflowBusy("save-invoice-draft");
    try {
      const result =
        invoiceWorkflow.mode === "manual"
          ? await createIsnetManualInvoiceDraft(invoiceWorkflow)
          : await createIsnetInvoiceFromDispatch(
              invoiceWorkflow.sourceId,
              invoiceWorkflow,
            );
      if (invoiceWorkflow.mode !== "manual" && result?.ok === true && result?.verified === false) {
        setInvoiceWorkflow((current) => ({
          ...current,
          draftCreated: true,
          draftVerified: false,
          requestId: result.requestId || "",
          draftNo: result.draftNo || "",
          draftVersion: result.draftVersion || "",
          officialStatus: result.status || "VERIFY_FAILED",
          verification: result.verification || { differences: [] },
        }));
        setNotice({ tone: "error", text: result.message || "İşNet taslağında doğrulama farkları bulundu; resmî gönderim engellendi." });
        return;
      }
      const verifiedDraft = invoiceWorkflow.mode === "manual"
        ? result?.ok === true && Boolean(result?.draftNo)
        : result?.ok === true && result?.verified === true && Boolean(result?.draftId || result?.draftNo);
      if (!verifiedDraft) {
        throw new Error("İşNet taslak kaydı doğrulanamadı; başarı mesajı gösterilmedi.");
      }
      setNotice({ tone: "success", text: result.message });
      setInvoiceWorkflow((current) => ({
        ...current,
        draftCreated: true,
        draftVerified: true,
        requestId: result.requestId || "",
        draftNo: result.draftNo || "",
        draftVersion: result.draftVersion || "",
        officialStatus: "VERIFIED",
        verification: result.verification || { differences: [] },
        confirmationText: "",
        mailPackageId: result.mailPackageId || "",
      }));
      await loadPortalDocuments();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Fatura taslağı oluşturulamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function submitOfficialInvoiceWorkflow() {
    if (!invoiceWorkflow?.requestId) return;
    if (!capabilities.submitOfficialInvoice) {
      setNotice({ tone: "error", text: "Resmî fatura gönderim adaptörü bu firma için etkin değil." });
      return;
    }
    if (invoiceWorkflow.confirmationText !== "FATURAYI GÖNDER") {
      setNotice({ tone: "warning", text: "Devam etmek için FATURAYI GÖNDER yazın." });
      return;
    }
    setWorkflowBusy("submit-official-invoice");
    try {
      await finalApproveIsnetInvoiceDraft(invoiceWorkflow.requestId, {
        approved: true,
        confirmationText: invoiceWorkflow.confirmationText,
        expectedVersion: invoiceWorkflow.draftVersion,
      });
      setInvoiceWorkflow((current) => ({ ...current, officialStatus: "SUBMITTING" }));
      const result = await submitIsnetOfficialInvoice(invoiceWorkflow.requestId);
      const status = await getIsnetInvoiceDraftStatus(invoiceWorkflow.requestId);
      setInvoiceWorkflow((current) => ({
        ...current,
        ...status,
        officialStatus: status.status,
        officialInvoiceNumber: status.officialInvoiceNumber || result.officialInvoiceNumber || "",
        officialUuid: status.officialUuid || result.officialUuid || "",
      }));
      setNotice({
        tone: status.status === "COMPLETED" ? "success" : "warning",
        text: status.status === "COMPLETED"
          ? `Resmî fatura gönderildi ve KY ERP kapanışı tamamlandı: ${status.officialInvoiceNumber}`
          : `Resmî gönderim sonucu ${status.status} aşamasında. Aynı fatura tekrar gönderilmeyecek.`,
      });
    } catch (error) {
      let status = null;
      try { status = await getIsnetInvoiceDraftStatus(invoiceWorkflow.requestId); } catch { status = null; }
      if (status) setInvoiceWorkflow((current) => ({ ...current, ...status, officialStatus: status.status }));
      setNotice({ tone: "error", text: error?.message || "Resmî fatura gönderimi tamamlanamadı." });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function retryInvoiceClosureWorkflow() {
    if (!invoiceWorkflow?.requestId) return;
    setWorkflowBusy("retry-invoice-closure");
    try {
      const status = await retryIsnetInvoiceClosure(invoiceWorkflow.requestId);
      setInvoiceWorkflow((current) => ({ ...current, ...status, officialStatus: status.status }));
      setNotice({ tone: status.status === "COMPLETED" ? "success" : "warning", text: status.status === "COMPLETED" ? "Fatura dosya, muhasebe ve cari kapanışı tamamlandı." : `Kapanış ${status.status} aşamasında.` });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Fatura kapanışı yeniden denenemedi." });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function saveInvoiceDefaults() {
    if (!invoiceWorkflow) return;
    setWorkflowBusy("save-invoice-template");
    try {
      const template = await saveIsnetInvoiceAssistantTemplate({
        scenarioType: invoiceWorkflow.scenarioType,
        invoiceType: invoiceWorkflow.invoiceType,
        currency: invoiceWorkflow.currency,
        measureUnitId: invoiceWorkflow.measureUnitId || 67,
        vatRate: Number(invoiceWorkflow.lines?.[0]?.vatRate ?? 20),
        notes: invoiceWorkflow.notes || [],
      });
      setInvoiceTemplate(template);
      setNotice({
        tone: "success",
        text: "Fatura adımlarındaki sabit seçimler firma şablonuna kaydedildi.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Fatura şablonu kaydedilemedi.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  useEffect(() => {
    if (activeTab !== "yeni-irsaliye") return undefined;
    const search = recipientQuery.trim();
    if (search.length < 2) {
      setRecipientRows([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      setWorkflowBusy("recipient-search");
      try {
        const result = await searchIsnetRecipients("dispatch", search);
        setRecipientRows(result.rows || []);
      } catch (error) {
        setNotice({
          tone: "error",
          text: error?.message || "İşNet firma listesi alınamadı.",
        });
      } finally {
        setWorkflowBusy("");
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeTab, recipientQuery]);

  function updateManualLine(index, field, value) {
    setManualDispatch((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  }

  async function saveManualDispatch() {
    if (!manualDispatch.recipientId) {
      setNotice({ tone: "warning", text: "Önce İşNet alıcı firmasını seçin." });
      return;
    }
    if (!manualDispatch.modelName.trim()) {
      setNotice({
        tone: "warning",
        text: "Her irsaliyede model adı zorunludur.",
      });
      return;
    }
    if (!manualDispatch.lines.some((line) => line.productName.trim())) {
      setNotice({ tone: "warning", text: "En az bir ürün satırı girin." });
      return;
    }
    if (
      !window.confirm(
        `${manualDispatch.recipientName} için giden irsaliye taslağı oluşturulsun mu?`,
      )
    )
      return;
    setWorkflowBusy("manual-dispatch");
    try {
      const result = await createIsnetManualDispatchDraft(manualDispatch);
      setNotice({ tone: "success", text: result.message });
      setManualDispatch((current) => ({
        ...current,
        modelName: "",
        note: "",
        lines: [
          { productName: "", description: "", quantity: 1, measureUnitId: 67 },
        ],
      }));
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İrsaliye taslağı oluşturulamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  const selectDispatch = useCallback((row) => {
    setSelectedDispatchId(row?.id || "");
    setInvoiceDraft((current) => ({
      ...current,
      unitPrice: Number(row?.lastUnitPrice || 0) || "",
      vatRate: Number(row?.vatRate ?? 20),
    }));
  }, []);

  const loadAll = useCallback(
    async ({ quiet = false } = {}) => {
      if (!companyKey) {
        setLoading(false);
        setNotice({
          tone: "warning",
          text: "İşNet kayıtlarını görmek için ana firma seçin.",
        });
        return;
      }
      if (!quiet) setLoading(true);
      const localDocumentScreen = Boolean(portalTab || portalFlow);
      let tasks = [[getIsnetConfiguration, setDashboard]];
      if (activeTab === "yonetim-merkezi") tasks = [[getIsnetDashboard, setDashboard]];
      else if (activeTab === "irsaliyeden-faturaya") tasks.push([getIncomingDispatches, setDispatches]);
      else if (activeTab === "kesilen-belgeler") tasks.push([getIssuedDocuments, setDocuments]);
      else if (activeTab === "mail-merkezi") tasks.push([getMailQueue, setMailQueue]);
      else if (activeTab === "ayarlar") tasks.push([getIsnetSettings, setSettings]);
      const results = await Promise.allSettled(tasks.map(([request]) => request()));
      const setters = tasks.map(([, setter]) => setter);
      results.forEach((result, index) => {
        if (result.status === "fulfilled")
          setters[index](result.value || (index ? [] : null));
      });
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) {
        if (localDocumentScreen) {
          setPortalUpdateStatus("Yerel kayıtlar gösteriliyor. İşNet bağlantısı kapalı.");
        } else {
        setNotice({
          tone: "error",
          text:
            failures.length === results.length
              ? failures[0].reason?.message || "İşNet verileri alınamadı."
              : "Bazı İşNet verileri alınamadı; mevcut bölümler gösteriliyor.",
        });
        }
      } else if (!quiet) {
        setNotice(null);
      }
      setLoading(false);
    },
    [activeTab, companyKey, portalFlow, portalTab],
  );

  const loadPortalDocuments = useCallback(async (overrides = {}) => {
    if (!companyKey) return null;
    setPortalAttempted(true);
    if (!portalResult) setPortalLoading(true);
    const fetchStartedAt = performance.now();
    try {
      const result = await getIsnetLocalDocuments({
        ...portalRange,
        page: overrides.page ?? portalPage,
        pageSize: overrides.pageSize ?? portalPageSize,
      });
      setPortalResult({
        ...result,
        performance: {
          ...(result.performance || {}),
          frontendFetchMs: Math.round((performance.now() - fetchStartedAt) * 100) / 100,
        },
      });
      setPortalUpdateStatus(
        result.lastSyncAt
          ? `Yerel kayıtlar gösteriliyor · Son İşNet kontrolü ${new Date(result.lastSyncAt).toLocaleString("tr-TR")}`
          : "Yerel kayıtlar gösteriliyor · İlk İşNet kontrolü bekleniyor",
      );
      setPortalUpdateStatus(
        result.lastSyncAt
          ? `Yerel kayıtlar gösteriliyor. Son İşNet kontrolü: ${new Date(result.lastSyncAt).toLocaleString("tr-TR")}. İşNet bağlantısı kapalı.`
          : "Yerel kayıtlar gösteriliyor. İşNet'e yalnız 'İşNet Verilerini Al' butonuyla bağlanılır.",
      );
      return result;
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İşNet belgeleri alınamadı.",
      });
      return null;
    } finally {
      setPortalLoading(false);
    }
  }, [companyKey, portalPage, portalPageSize, portalRange, portalResult]);

  const syncPortalDocuments = useCallback(async ({ background = false } = {}) => {
    if (!companyKey) return null;
    setPortalAttempted(true);
    setPortalLoading(true);
    setPortalUpdateStatus("Yerel kayıtlar açık · İşNet'te yeni belgeler kontrol ediliyor…");
    if (!background) setNotice(null);
    try {
      const result = await startDailySync(portalRange);
      setPortalResult(result);
      const automation = result.automation || {};
      setPortalUpdateStatus(
        automation.downloaded
          ? `${automation.downloaded} yeni belge bulundu ve yerel kayıtlara eklendi.${automation.remaining ? ` ${automation.remaining} belge sonraki güncelleme grubunda alınacak.` : ""}`
          : "Yerel kayıtlar güncel · İşNet'te yeni belge yok.",
      );
      setNotice({
        tone: automation.errors?.length ? "warning" : "success",
        text: automation.downloaded
          ? `${automation.downloaded} yeni belge PDF ve XML olarak bilgisayara indirildi ve işlendi.${automation.remaining ? ` ${automation.remaining} belge sonraki güncellemede alınacak.` : ""}${automation.errors?.length ? ` ${automation.errors.length} belge yeniden denenecek.` : ""}`
          : `İşNet güncel; yeni fatura veya irsaliye yok.${automation.errors?.length ? ` ${automation.errors.length} belge yeniden denenecek.` : ""}`,
      });
      return result;
    } catch (error) {
      setPortalUpdateStatus("Yerel kayıtlar kullanılmaya devam ediyor · İşNet kontrolü tamamlanamadı.");
      setNotice({
        tone: "error",
        text: error?.message || "İşNet otomatik indirme tamamlanamadı.",
      });
      return null;
    } finally {
      setPortalLoading(false);
    }
  }, [companyKey, portalRange]);

  const importPortalInvoice = useCallback(async (document) => {
    const key = `accounting-${document.id}`;
    setWorkflowBusy(key);
    setNotice(null);
    try {
      const result = await backfillIsnetPortalDocument(document);
      setNotice({
        tone: "success",
        text: result.alreadyImported
          ? `${document.documentNo} zaten muhasebede kayıtlı.`
          : `${document.documentNo} muhasebeye aktarıldı; fatura satırları eşleştirmeye hazır.`,
      });
      await loadPortalDocuments();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet faturası muhasebeye aktarılamadı." });
    } finally {
      setWorkflowBusy("");
    }
  }, [loadPortalDocuments]);

  const loadPrintQueue = useCallback(async () => {
    if (!companyKey) return;
    try {
      setPrintQueue((await getIsnetPrintQueue()) || { rows: [], waiting: 0 });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Çıktı kuyruğu alınamadı.",
      });
    }
  }, [companyKey]);

  async function openPrintItem(row) {
    setWorkflowBusy(`print-${row.key}`);
    try {
      const blob = await getIsnetPrintPdf(row.key);
      setPrintPreview({ row, url: URL.createObjectURL(blob) });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "PDF çıktısı açılamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function openBulkPrint(keys, newOnly = false) {
    const effectiveKeys = keys?.length
      ? keys
      : (printQueue.rows || [])
          .filter(
            (row) => !row.printedAt && (!newOnly || row.newDocument === true),
          )
          .map((row) => row.key);
    if (!effectiveKeys.length) {
      setNotice({
        tone: "warning",
        text: "Toplu çıktı için bekleyen belge yok.",
      });
      return;
    }
    setWorkflowBusy("bulk-print");
    try {
      const blob = await getIsnetBulkPrintPdf(effectiveKeys, newOnly);
      setPrintPreview({
        row: {
          documentNo: `${effectiveKeys.length} belge`,
          partnerName: "Toplu İşNet çıktısı",
          modelName: "Seçilen PDF dosyaları",
        },
        keys: effectiveKeys,
        bulk: true,
        url: URL.createObjectURL(blob),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Toplu PDF hazırlanamadı.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function completePrintItem() {
    if (!printPreview) return;
    const frame = window.document.getElementById("isnet-print-frame");
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
    if (!window.confirm("Yazıcıdan çıktı alındı mı? Onayladığınız belgeler 'Çıktı alındı' durumuna geçirilecek.")) return;
    setWorkflowBusy("confirm-print");
    try {
      const result = printPreview.bulk
        ? await markIsnetBulkPrinted(printPreview.keys)
        : await markIsnetPrinted(printPreview.row.key, true);
      const currentKey = printPreview.row.key;
      const completedCount = printPreview.bulk ? Number(result?.updated || printPreview.keys.length) : 1;
      setPrintPreview(null);
      const nextQueue = await getIsnetPrintQueue();
      setPrintQueue(nextQueue);
      setSelectedPrintKeys([]);
      setNotice({ tone: "success", text: `${completedCount} belge için çıktı alındı ve kayıt altına alındı.` });
      const next = printPreview.bulk
        ? null
        : (nextQueue.rows || []).find((row) => !row.printedAt && row.key !== currentKey);
      if (next) await openPrintItem(next);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Çıktı durumu kaydedilemedi." });
    } finally {
      setWorkflowBusy("");
    }
  }

  async function confirmVisiblePrintedItems() {
    const keys = visiblePrintRows
      .filter((row) => !row.printedAt)
      .map((row) => row.key);
    if (!keys.length) {
      setNotice({ tone: "warning", text: "Onaylanacak bekleyen çıktı yok." });
      return;
    }
    if (
      !window.confirm(
        `${keys.length} belgenin çıktısı daha önce alındı mı? Bu kayıtlar çıktı kuyruğundan kaldırılacak.`,
      )
    )
      return;
    setWorkflowBusy("confirm-visible-prints");
    try {
      const result = await markIsnetBulkPrinted(keys);
      setPrintQueue(await getIsnetPrintQueue());
      setSelectedPrintKeys([]);
      setNotice({
        tone: "success",
        text: `${Number(result?.updated || keys.length)} belge çıktı alındı olarak onaylandı.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Çıktı onayı kaydedilemedi.",
      });
    } finally {
      setWorkflowBusy("");
    }
  }

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Sayfa/sekme geçişi ve yenileme yalnızca KY ERP'deki yerel kayıtları okur.
  useEffect(() => {
    if ((portalTab || portalFlow || activeTab === "yonetim-merkezi") && !portalAttempted) {
      void loadPortalDocuments();
    }
  }, [activeTab, loadPortalDocuments, portalAttempted, portalFlow, portalTab]);

  useEffect(() => {
    if (activeTab === "cikti-kuyrugu" && settings?.companyId) loadPrintQueue();
  }, [activeTab, loadPrintQueue, settings?.companyId]);

  useEffect(() => {
    if (!selectedDispatchId && dispatches.length) selectDispatch(dispatches[0]);
    if (
      selectedDispatchId &&
      !dispatches.some((row) => row.id === selectedDispatchId)
    ) {
      selectDispatch(dispatches[0] || null);
    }
  }, [dispatches, selectDispatch, selectedDispatchId]);

  useEffect(() => {
    if (!settings) return;
    setConnectionForm((current) => ({
      username: settings.username || "",
      password: "",
      companyId: settings.companyId || "",
      companies: settings.companies?.length
        ? settings.companies
        : current.companies,
      connectionMode: settings.connectionMode || current.connectionMode,
    }));
  }, [settings]);

  const totals = useMemo(() => {
    const subtotal =
      Number(selectedDispatch?.quantity || 0) *
      Number(invoiceDraft.unitPrice || 0);
    const vat = subtotal * (Number(invoiceDraft.vatRate || 0) / 100);
    return { subtotal, vat, grandTotal: subtotal + vat };
  }, [invoiceDraft.unitPrice, invoiceDraft.vatRate, selectedDispatch]);

  async function runAction(key, action, successText) {
    setBusyAction(key);
    setNotice(null);
    try {
      const result = await action();
      setNotice({ tone: "success", text: successText });
      await loadAll({ quiet: true });
      return result;
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İşlem tamamlanamadı.",
      });
      return null;
    } finally {
      setBusyAction("");
    }
  }

  const invoicePayload = () => ({
    dispatchId: selectedDispatch?.id,
    ...invoiceDraft,
  });

  async function handleValidate() {
    const result = await runAction(
      "validate",
      () => validateInvoiceDraft(invoicePayload()),
      "Fatura kontrolleri tamamlandı.",
    );
    if (result && !result.ok)
      setNotice({
        tone: "warning",
        text: result.errors?.join(" ") || "Eksik alanlar var.",
      });
  }

  async function handleTestConnection() {
    setBusyAction("test-settings");
    setNotice(null);
    try {
      const result = await testIsnetSettings({
        username: connectionForm.username,
        password: connectionForm.password,
      });
      setConnectionForm((current) => ({
        ...current,
        companies: result.companies || [],
        connectionMode: result.connectionMode || "",
        companyId: result.companies?.some(
          (company) => company.id === current.companyId,
        )
          ? current.companyId
          : result.companies?.[0]?.id || "",
      }));
      setNotice({
        tone: "success",
        text: `İşNet ${result.connectionMode === "portal" ? "portal" : "API"} girişi başarılı. ${result.companies?.length || 0} yetkili firma bulundu.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İşNet bağlantısı kurulamadı.",
      });
    } finally {
      setBusyAction("");
    }
  }

  async function handleSaveConnection() {
    if (!connectionForm.companyId) {
      setNotice({
        tone: "warning",
        text: "Önce bağlantıyı test edin ve İşNet firmasını seçin.",
      });
      return;
    }
    setBusyAction("save-settings");
    setNotice(null);
    try {
      const saved = await saveIsnetSettings({
        username: connectionForm.username,
        password: connectionForm.password,
        companyId: connectionForm.companyId,
      });
      setSettings(saved);
      setConnectionForm((current) => ({ ...current, password: "" }));
      setNotice({
        tone: "success",
        text: `${saved.companyName} için İşNet bağlantısı güvenli biçimde kaydedildi.`,
      });
      await loadAll({ quiet: true });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İşNet ayarları kaydedilemedi.",
      });
    } finally {
      setBusyAction("");
    }
  }

  const [title, subtitle] = TAB_COPY[activeTab] || TAB_COPY["yonetim-merkezi"];
  const connectionReady = dashboard?.configuration?.apiConfigured === true;

  return (
    <main className="isnet-page" aria-busy={loading}>
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker">
            <ShieldCheck size={14} /> Güvenli belge otomasyonu
          </span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="isnet-hero__actions">
          <Badge tone={connectionReady ? "green" : "warning"}>
            {connectionReady ? (
              <CheckCircle2 size={13} />
            ) : (
              <Unplug size={13} />
            )}
            {connectionReady
              ? "API yapılandırıldı"
              : "API yapılandırması eksik"}
          </Badge>
          <button
            className="isnet-btn isnet-btn--secondary"
            type="button"
            onClick={() =>
              openModule?.("asistan", {
                tabKey: "sohbet",
                actionContext: {
                  sourceModule: "isnet",
                  sourceRoute: window.location.pathname,
                  message:
                    "İşNet bağlantısını, son senkronizasyonu, belge hatalarını, eksik model eşleşmelerini ve çıktı kuyruğunu kontrol edip çözüm önerilerini sırala.",
                },
              })
            }
          >
            <Bot size={16} /> Asistana Kontrol Ettir
          </button>
          <button
            className="isnet-btn isnet-btn--secondary"
            type="button"
            onClick={() => (portalTab || portalFlow ? syncPortalDocuments() : loadAll())}
            disabled={loading || portalLoading}
          >
            <RefreshCw
              size={16}
              className={loading || portalLoading ? "isnet-spin" : ""}
            />{" "}
            Yenile
          </button>
          <button
            className="isnet-btn isnet-btn--primary"
            type="button"
            disabled={!capabilities.sync || portalLoading}
            title={
              !capabilities.sync
                ? "İşNet senkronizasyon adaptörü etkin değil"
                : ""
            }
            onClick={syncPortalDocuments}
          >
            <Cloud size={16} />{" "}
            {portalLoading ? "Alınıyor…" : "İşNet Verilerini Al"}
          </button>
        </div>
      </header>

      {notice && (
        <div
          className={`isnet-notice isnet-notice--${notice.tone}`}
          role="status"
        >
          {notice.tone === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertTriangle size={18} />
          )}
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Bildirimi kapat"
          >
            ×
          </button>
        </div>
      )}

      {activeTab === "yonetim-merkezi" && (
        <>
          <section className="isnet-metrics">
            <Metric
              icon={RefreshCw}
              label="Son tarama"
              value={
                portalResult?.syncedAt
                  ? new Date(portalResult.syncedAt).toLocaleTimeString(
                      "tr-TR",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )
                  : "—"
              }
              note="İşNet canlı bağlantısı"
            />
            <Metric
              icon={FileText}
              label="Gelen irsaliye"
              value={portalResult?.counts?.incomingDispatches ?? "—"}
              note="Seçili tarih aralığı"
              tone="cyan"
            />
            <Metric
              icon={CircleDollarSign}
              label="Gelen fatura"
              value={portalResult?.counts?.incomingInvoices ?? "—"}
              note="İşNet portal kaydı"
              tone="violet"
            />
            <Metric
              icon={FileCheck2}
              label="Giden fatura"
              value={portalResult?.counts?.outgoingInvoices ?? "—"}
              note="İşNet portal kaydı"
              tone="amber"
            />
            <Metric
              icon={Mail}
              label="Mail bekleyen"
              value={dashboard?.mailWaitingCount ?? "—"}
              note="Gönderim kuyruğu"
              tone="rose"
            />
            <Metric
              icon={Archive}
              label="Arşivlenen"
              value={dashboard?.archivedDocumentCount ?? "—"}
              note="Dosyası erişilebilir"
              tone="green"
            />
          </section>
          <section className="isnet-dashboard-grid">
            <article className="isnet-card">
              <SectionHead
                eyebrow="OPERASYON"
                title="Yerel eşleştirme bekleyenler"
                description="KY ERP'ye daha önce alınmış ve müdahale gerektiren kayıtlar."
                action={
                  <Badge tone="neutral">
                    {dashboard?.workItems?.length || 0} kayıt
                  </Badge>
                }
              />
              <div className="isnet-table-wrap">
                <table className="isnet-table">
                  <thead>
                    <tr>
                      <th>Belge</th>
                      <th>Model</th>
                      <th>Grup</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.workItems || []).map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.documentNo || "—"}</strong>
                        </td>
                        <td>{row.modelName || "—"}</td>
                        <td>{row.groupName || "—"}</td>
                        <td>
                          <Badge tone={row.tone}>{row.statusText}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!loading && !dashboard?.workItems?.length && (
                <EmptyState
                  icon={CheckCircle2}
                  title="Kontrol listesi temiz"
                  text="Şu anda müdahale bekleyen kayıt bulunmuyor."
                />
              )}
            </article>
            <article className="isnet-card">
              <SectionHead
                eyebrow="ALTYAPI"
                title="Sistem durumu"
                description="Canlı bağlantı ve arşiv hazırlığı."
              />
              <div className="isnet-status-list">
                <div>
                  <span>
                    <Cloud size={16} /> İşNet kimlik bilgileri
                  </span>
                  <Badge
                    tone={
                      dashboard?.configuration?.authConfigured
                        ? "green"
                        : "warning"
                    }
                  >
                    {dashboard?.configuration?.authConfigured
                      ? "Hazır"
                      : "Eksik"}
                  </Badge>
                </div>
                <div>
                  <span>
                    <Settings2 size={16} /> İşNet firma kodu
                  </span>
                  <Badge
                    tone={
                      dashboard?.configuration?.companyConfigured
                        ? "green"
                        : "warning"
                    }
                  >
                    {dashboard?.configuration?.companyConfigured
                      ? "Hazır"
                      : "Eksik"}
                  </Badge>
                </div>
                <div>
                  <span>
                    <Archive size={16} /> OneDrive arşivi
                  </span>
                  <Badge tone={dashboard?.oneDriveOk ? "green" : "warning"}>
                    {dashboard?.oneDriveOk ? "Erişilebilir" : "Kontrol gerekli"}
                  </Badge>
                </div>
              </div>
              <div className="isnet-path">
                <span>Arşiv konumu</span>
                <code>
                  {dashboard?.storagePath || "Klasör kuralı tanımlanmamış"}
                </code>
              </div>
            </article>
          </section>
          <section className="isnet-reconciliation-workspace">
            <DispatchWorkspace
              mode="analysis"
              portalDocuments={portalResult?.documents || []}
              onOpenDispatch={openDispatchWorkflow}
              onOpenInvoice={openInvoiceWorkflow}
              onOpenNewInvoice={openNewInvoiceWorkflow}
            />
          </section>
        </>
      )}

      {(portalTab || portalFlow) && (
        <article className="isnet-card">
          <SectionHead
            eyebrow="İŞNET CANLI BELGE HAVUZU"
            title={portalFlow ? "Gelen / Giden İşNet Belgeleri" : `${portalTab.direction === "incoming" ? "Gelen" : "Giden"} ${portalTab.kind === "invoice" ? "faturalar" : "irsaliyeler"}`}
            description={
              portalResult
                ? `${portalResult.startDate} – ${portalResult.endDate} aralığında ${visiblePortalDocuments.length} kayıt.`
                : "Tarih aralığını seçip İşNet verilerini alın."
            }
          />
          <details className="isnet-history-filter">
            <summary>Geçmiş tarih aralığını değiştir</summary>
            <div className="isnet-portal-filters">
              <label>
                <span>Başlangıç tarihi</span>
                <input
                  type="date"
                  value={portalRange.startDate}
                  max={portalRange.endDate}
                  onChange={(event) =>
                    setPortalRange((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Bitiş tarihi</span>
                <input
                  type="date"
                  value={portalRange.endDate}
                  min={portalRange.startDate}
                  max={todayText()}
                  onChange={(event) =>
                    setPortalRange((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                className="isnet-btn isnet-btn--primary"
                type="button"
                onClick={syncPortalDocuments}
                disabled={portalLoading}
              >
                <Cloud size={16} />
                {portalLoading
                  ? "İşNet'ten alınıyor…"
                  : "Geçmişi sorgula ve eksikleri indir"}
              </button>
            </div>
          </details>
          {portalUpdateStatus && (
            <div className={`isnet-cache-status${portalLoading ? " isnet-cache-status--syncing" : ""}`}>
              <RefreshCw size={15} className={portalLoading ? "isnet-spin" : ""} />
              <strong>{portalUpdateStatus}</strong>
              {portalResult?.hasMore ? (
                <small>İlk {portalResult.documents.length} kayıt gösteriliyor; arama için tarih aralığını daraltın.</small>
              ) : null}
            </div>
          )}
          {portalResult && (
            <div className="isnet-portal-counts">
              <span>
                Gelen fatura{" "}
                <strong>{portalResult.counts?.incomingInvoices || 0}</strong>
              </span>
              <span>
                Giden fatura{" "}
                <strong>{portalResult.counts?.outgoingInvoices || 0}</strong>
              </span>
              <span>
                Gelen irsaliye{" "}
                <strong>{portalResult.counts?.incomingDispatches || 0}</strong>
              </span>
              <span>
                Giden irsaliye{" "}
                <strong>{portalResult.counts?.outgoingDispatches || 0}</strong>
              </span>
              <span>
                Taslaklar{" "}
                <strong>{portalResult.counts?.drafts || 0}</strong>
              </span>
            </div>
          )}
          <div className="isnet-toolbar isnet-toolbar--portal">
            <label>
              <Search size={16} />
              <input
                value={portalSearch}
                onChange={(event) => setPortalSearch(event.target.value)}
                placeholder="Belge no, firma, senaryo veya durum ara"
              />
            </label>
            {portalFlow ? (
              <div className="isnet-flow-selects">
                <select value={portalFlowFilters.direction} onChange={(event) => setPortalFlowFilters((current) => ({ ...current, direction: event.target.value }))}>
                  <option value="all">Gelen + Giden</option>
                  <option value="incoming">Sadece Gelen</option>
                  <option value="outgoing">Sadece Giden</option>
                </select>
                <select value={portalFlowFilters.kind} onChange={(event) => setPortalFlowFilters((current) => ({ ...current, kind: event.target.value }))}>
                  <option value="all">Fatura + İrsaliye</option>
                  <option value="invoice">Sadece Fatura</option>
                  <option value="dispatch">Sadece İrsaliye</option>
                </select>
                <select value={portalFlowFilters.status} onChange={(event) => setPortalFlowFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="all">Kayıtlar + Taslaklar</option>
                  <option value="draft">Sadece Taslaklar</option>
                </select>
              </div>
            ) : null}
            <select value={portalSort} onChange={(event) => setPortalSort(event.target.value)} aria-label="Belge sıralaması">
              <option value="document-newest">En yeni belge tarihi</option>
              <option value="document-oldest">En eski belge tarihi</option>
              <option value="downloaded">En son indirilen</option>
              <option value="number">Belge numarası</option>
            </select>
          </div>
          {!!selectedDocumentKeys.length && (
            <div className="isnet-selection-bar" role="status">
              <strong>{selectedDocumentKeys.length} belge seçildi</strong>
              <span>Yalnız ekranda görünen filtre sonucundaki kayıtlar seçilir.</span>
              <div>
                <button type="button" onClick={() => updateSelectedReadStatus(true)} disabled={workflowBusy === "bulk-read"}>Okundu işaretle</button>
                <button type="button" onClick={() => updateSelectedReadStatus(false)} disabled={workflowBusy === "bulk-unread"}>Okunmadı işaretle</button>
                <button type="button" onClick={() => setSelectedDocumentKeys([])}>Seçimi temizle</button>
              </div>
            </div>
          )}
          <div className="isnet-table-wrap">
            <table className="isnet-table">
              <thead>
                <tr>
                  <th>
                    <label className="isnet-select-all">
                      <input
                        type="checkbox"
                        aria-label="Görünen belgelerin tümünü seç"
                        checked={!!selectableVisibleKeys.length && selectableVisibleKeys.every((key) => selectedDocumentKeys.includes(key))}
                        onChange={(event) => setSelectedDocumentKeys(event.target.checked ? selectableVisibleKeys : [])}
                      />
                      Tarih
                    </label>
                  </th>
                  <th>Belge no</th>
                  {portalFlow && <th>Yön / belge</th>}
                  <th>
                    {portalFlow ? "Firma" : portalTab.direction === "incoming" ? "Gönderen" : "Alıcı"}
                  </th>
                  <th>Senaryo / tür</th>
                  {(portalFlow || portalTab.kind === "invoice") && <th>Tutar</th>}
                  <th>İşNet'e geliş/gönderim</th>
                  <th>Durum</th>
                  {portalFlow && <th>Yerel kayıt</th>}
                  <th>Dosya ve işlem</th>
                </tr>
              </thead>
              <tbody>
                {visiblePortalDocuments.map((row) => (
                  <tr
                    key={row.id}
                    className={row.isNew ? "isnet-document-row--new" : ""}
                    onDoubleClick={(event) => {
                      if (!event.target.closest("button,input,select,a")) loadDocumentFile(row, "pdf");
                    }}
                    title="Belge PDF'ini açmak için çift tıklayın"
                  >
                    <td>{row.dateText || "—"}</td>
                    <td>
                      <strong>{row.documentNo || "—"}</strong>
                      <label className="isnet-row-select">
                        <input
                          type="checkbox"
                          aria-label={`${row.documentNo || "Belge"} seç`}
                          disabled={!row.automationKey}
                          checked={!!row.automationKey && selectedDocumentKeys.includes(row.automationKey)}
                          onChange={(event) => setSelectedDocumentKeys((current) => event.target.checked ? [...new Set([...current, row.automationKey])] : current.filter((key) => key !== row.automationKey))}
                        />
                      </label>
                      {row.isNew ? (
                        <Badge tone="red">Yeni · okunmadı</Badge>
                      ) : (
                        <small>Okundu</small>
                      )}
                    </td>
                    {portalFlow && (
                      <td>
                        <Badge tone={row.direction === "incoming" ? "blue" : "green"}>{row.direction === "incoming" ? "Gelen" : "Giden"}</Badge>
                        <small>{row.kind === "invoice" ? "Fatura" : "İrsaliye"}</small>
                      </td>
                    )}
                    <td>
                      <strong>{row.partnerName || "—"}</strong>
                    </td>
                    <td>
                      <strong>{row.scenarioText || "—"}</strong>
                      <small>{row.subtypeText || "Tür belirtilmemiş"}</small>
                    </td>
                    {(portalFlow || portalTab.kind === "invoice") && (
                      <td>
                        <strong>{row.kind === "invoice" ? row.amountText || money(row.amount) : "—"}</strong>
                      </td>
                    )}
                    <td>{row.transferDateText || "—"}</td>
                    <td>
                      <Badge tone="blue">
                        {row.statusText || "İşNet kaydı"}
                      </Badge>
                      {row.modelApplicable === false && row.kind === "dispatch" && row.direction === "incoming" ? (
                        <small>Model · Uygulanmaz</small>
                      ) : row.intakeId && (
                        <small>
                          {row.modelId
                            ? "İşlendi · model bağlı"
                            : "İşlendi · model bekliyor"}
                        </small>
                      )}
                    </td>
                    {portalFlow && (
                      <td>
                        <Badge tone={row.pdfSaved && row.xmlSaved ? "green" : "warning"}>{row.pdfSaved && row.xmlSaved ? "PDF + XML alındı" : "Dosya bekleniyor"}</Badge>
                        <small>{row.kind === "invoice" ? row.accountingImported ? "Muhasebeye aktarıldı" : "Muhasebeye aktarılmadı" : row.downloaded ? "Yerel arşivde" : "İşNet'te görüldü"}</small>
                      </td>
                    )}
                    <td>
                      <div className="isnet-document-actions">
                        <button
                          type="button"
                          onClick={() => loadDocumentFile(row, "pdf")}
                          disabled={
                            documentFileBusy === `${row.id}-pdf-preview`
                          }
                        >
                          <Eye size={13} /> İncele
                        </button>
                        <button
                          type="button"
                          onClick={() => loadDocumentFile(row, "pdf", true)}
                        >
                          <Download size={13} /> PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => loadDocumentFile(row, "xml", true)}
                        >
                          <Download size={13} /> XML
                        </button>
                        <button
                          type="button"
                          onClick={() => loadDocumentFile(row, "xml")}
                        >
                          XML oku
                        </button>
                        {portalFlow && row.kind === "invoice" && row.downloaded && !row.accountingImported ? (
                          <button
                            type="button"
                            className="isnet-document-action--primary"
                            onClick={() => importPortalInvoice(row)}
                            disabled={workflowBusy === `accounting-${row.id}`}
                          >
                            <FileCheck2 size={13} /> {workflowBusy === `accounting-${row.id}` ? "Aktarılıyor…" : "Muhasebeye Aktar"}
                          </button>
                        ) : null}
                        {row.kind === "dispatch" &&
                          row.direction === "incoming" && (
                            <>
                              <button
                                type="button"
                                className="isnet-document-action--primary"
                                onClick={() => handleImportDispatch(row)}
                                disabled={
                                  workflowBusy === `import-${row.id}` ||
                                  workflowBusy === "open"
                                }
                              >
                                <FileCheck2 size={13} />
                                {row.modelApplicable === false
                                  ? "Muhasebe kaydını aç"
                                  : row.intakeId
                                  ? "İşlem kaydını aç"
                                  : "İşleme al"}
                              </button>
                              {row.modelApplicable !== false && <button
                                type="button"
                                onClick={() => handleCreateOutgoingDraft(row)}
                                disabled={
                                  !row.modelId ||
                                  workflowBusy === "create-draft"
                                }
                                title={
                                  !row.modelId ? "Önce modeli eşleştirin" : ""
                                }
                              >
                                <Send size={13} /> Giden taslak
                              </button>}
                            </>
                          )}
                        {row.kind === "dispatch" &&
                          row.direction === "outgoing" && (
                            <button
                              type="button"
                              className="isnet-document-action--primary"
                              onClick={() => openInvoiceWorkflow(row)}
                              disabled={workflowBusy === `invoice-${row.id}`}
                            >
                              <CircleDollarSign size={13} /> Faturaya çevir
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {portalResult && (
            <div className="isnet-pagination">
              <span>{portalResult.totalLocal || 0} kayıt · Sayfa {portalResult.page || portalPage}/{portalResult.totalPages || 1}</span>
              <div>
                <button
                  type="button"
                  disabled={(portalResult.page || portalPage) <= 1 || portalLoading}
                  onClick={() => {
                    const next = Math.max((portalResult.page || portalPage) - 1, 1);
                    setPortalPage(next);
                    void loadPortalDocuments({ page: next });
                  }}
                >
                  Önceki
                </button>
                <select
                  value={portalPageSize}
                  aria-label="Sayfadaki belge sayısı"
                  onChange={(event) => {
                    const nextSize = Number(event.target.value);
                    setPortalPageSize(nextSize);
                    setPortalPage(1);
                    void loadPortalDocuments({ page: 1, pageSize: nextSize });
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <button
                  type="button"
                  disabled={(portalResult.page || portalPage) >= (portalResult.totalPages || 1) || portalLoading}
                  onClick={() => {
                    const next = Math.min((portalResult.page || portalPage) + 1, portalResult.totalPages || 1);
                    setPortalPage(next);
                    void loadPortalDocuments({ page: next });
                  }}
                >
                  Sonraki
                </button>
              </div>
            </div>
          )}
          {!portalLoading && portalResult && !visiblePortalDocuments.length && (
            <EmptyState
              title="Belge bulunamadı"
              text="Seçilen tarih aralığında İşNet'te bu türde belge bulunmuyor."
            />
          )}
          {portalLoading && !portalResult?.documents?.length && (
            <EmptyState
              icon={RefreshCw}
              title="İşNet belgeleri alınıyor"
              text="Gelen ve giden fatura/irsaliye listeleri okunuyor."
            />
          )}
        </article>
      )}

      {activeTab === "yeni-irsaliye" && (
        <section className="isnet-card isnet-editor-card">
          <SectionHead
            eyebrow="YENİ E-İRSALİYE TASLAĞI"
            title="Firma ve belge bilgileri"
            description="Taslak İşNet'e sunucu üzerinden kaydedilir; tarayıcıda portal açılmaz."
          />
          <div className="isnet-form-grid">
            <label className="isnet-field isnet-field--wide">
              <span>İşNet alıcı firması</span>
              <div className="isnet-inline-controls">
                <input
                  value={recipientQuery}
                  onChange={(event) => setRecipientQuery(event.target.value)}
                  placeholder="Taha, Mind, Renfashion..."
                />
              </div>
              {!!recipientRows.length && (
                <div className="isnet-recipient-results">
                  {recipientRows.map((recipient) => (
                    <button
                      type="button"
                      key={recipient.id}
                      className={
                        manualDispatch.recipientId === recipient.id
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setManualDispatch((current) => ({
                          ...current,
                          recipientId: recipient.id,
                          recipientName: recipient.name,
                          localCompanyId: recipient.localCompanyId || "",
                        }))
                      }
                    >
                      <strong>{recipient.name}</strong>
                      <small>
                        {recipient.taxNo || "Vergi no yok"}
                        {recipient.matched
                          ? ` · KY ERP: ${recipient.localCompanyName}`
                          : " · Yerel firma eşleşmesi yok"}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </label>
            <label className="isnet-field">
              <span>İrsaliye tarihi</span>
              <input
                type="date"
                value={manualDispatch.issueDate}
                onChange={(event) =>
                  setManualDispatch((current) => ({
                    ...current,
                    issueDate: event.target.value,
                  }))
                }
              />
            </label>
            <label className="isnet-field">
              <span>İrsaliye saati</span>
              <input
                type="time"
                step="1"
                value={manualDispatch.issueTime}
                onChange={(event) =>
                  setManualDispatch((current) => ({
                    ...current,
                    issueTime: event.target.value,
                  }))
                }
              />
            </label>
            <label className="isnet-field isnet-field--wide">
              <span>Model adı (zorunlu)</span>
              <input
                value={manualDispatch.modelName}
                onChange={(event) =>
                  setManualDispatch((current) => ({
                    ...current,
                    modelName: event.target.value,
                  }))
                }
                placeholder="İrsaliye ve arşiv dosyasına eklenecek model"
              />
            </label>
            <label className="isnet-field isnet-field--wide">
              <span>Not</span>
              <textarea
                value={manualDispatch.note}
                onChange={(event) =>
                  setManualDispatch((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <SectionHead
            eyebrow="ÜRÜN SATIRLARI"
            title="İrsaliye içeriği"
            description="İrsaliyesi sisteme düşmeyen ürünleri buradan ekleyin."
          />
          <div className="isnet-table-wrap">
            <table className="isnet-table">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Açıklama</th>
                  <th>Miktar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {manualDispatch.lines.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        value={line.productName}
                        onChange={(event) =>
                          updateManualLine(
                            index,
                            "productName",
                            event.target.value,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={line.description}
                        onChange={(event) =>
                          updateManualLine(
                            index,
                            "description",
                            event.target.value,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={line.quantity}
                        onChange={(event) =>
                          updateManualLine(
                            index,
                            "quantity",
                            event.target.value,
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={manualDispatch.lines.length === 1}
                        onClick={() =>
                          setManualDispatch((current) => ({
                            ...current,
                            lines: current.lines.filter(
                              (_, lineIndex) => lineIndex !== index,
                            ),
                          }))
                        }
                      >
                        Kaldır
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="isnet-editor-actions">
            <button
              type="button"
              className="isnet-btn isnet-btn--secondary"
              onClick={() =>
                setManualDispatch((current) => ({
                  ...current,
                  lines: [
                    ...current.lines,
                    {
                      productName: "",
                      description: "",
                      quantity: 1,
                      measureUnitId: 67,
                    },
                  ],
                }))
              }
            >
              Satır ekle
            </button>
            <button
              type="button"
              className="isnet-btn isnet-btn--primary"
              onClick={saveManualDispatch}
              disabled={workflowBusy === "manual-dispatch"}
            >
              <Send size={15} /> Taslağı oluştur
            </button>
          </div>
        </section>
      )}

      {activeTab === "irsaliyeden-faturaya" && (
        <section className="isnet-reconciliation-workspace">
          <DispatchWorkspace
            mode="control"
            portalDocuments={portalResult?.documents || []}
            onOpenDispatch={openDispatchWorkflow}
            onOpenInvoice={openInvoiceWorkflow}
            onOpenNewInvoice={openNewInvoiceWorkflow}
          />
        </section>
      )}

      {activeTab === "__legacy_invoice_workspace__" && (
        <section className="isnet-invoice-grid">
          <article className="isnet-card isnet-queue-card">
            <SectionHead
              eyebrow="KUYRUK"
              title="Fatura bekleyenler"
              description="Hazır kayıtlar önce gösterilir."
            />
            <div className="isnet-dispatch-list">
              {dispatches
                .filter((row) => row.invoicePending)
                .map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    className={selectedDispatchId === row.id ? "active" : ""}
                    onClick={() => selectDispatch(row)}
                  >
                    <span>
                      <strong>{row.dispatchNo}</strong>
                      <Badge tone="blue">Hazır</Badge>
                    </span>
                    <b>{row.modelName || "Model belirtilmemiş"}</b>
                    <small>
                      {row.groupName || "Grup yok"} ·{" "}
                      {Number(row.quantity || 0).toLocaleString("tr-TR")} adet
                    </small>
                  </button>
                ))}
            </div>
            {!dispatches.some((row) => row.invoicePending) && (
              <EmptyState
                icon={FileCheck2}
                title="Bekleyen kayıt yok"
                text="Faturaya hazır irsaliye bulunmuyor."
              />
            )}
          </article>
          <article className="isnet-card isnet-draft-card">
            <SectionHead
              eyebrow="FATURA TASLAĞI"
              title="Belge bilgileri"
              description="Değerleri onaylamadan önce kontrol edin."
              action={<Badge tone="blue">Kullanıcı onaylı</Badge>}
            />
            {!selectedDispatch ? (
              <EmptyState
                icon={FileCheck2}
                title="İrsaliye seçin"
                text="Fatura bilgilerini görüntülemek için kuyruktan bir kayıt seçin."
              />
            ) : (
              <>
                <div className="isnet-form-grid">
                  <label>
                    İrsaliye no
                    <input value={selectedDispatch.dispatchNo || ""} readOnly />
                  </label>
                  <label>
                    Firma
                    <input
                      value={selectedDispatch.companyName || ""}
                      readOnly
                    />
                  </label>
                  <label>
                    Grup
                    <input value={selectedDispatch.groupName || ""} readOnly />
                  </label>
                  <label>
                    Model
                    <input value={selectedDispatch.modelName || ""} readOnly />
                  </label>
                  <label>
                    Adet
                    <input value={selectedDispatch.quantity || 0} readOnly />
                  </label>
                  <label>
                    Fatura serisi
                    <input
                      value={invoiceDraft.invoiceSeries}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          invoiceSeries: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Fatura tarihi
                    <input
                      type="date"
                      value={invoiceDraft.invoiceDate}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          invoiceDate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Birim fiyat
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={invoiceDraft.unitPrice}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          unitPrice: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    KDV oranı
                    <select
                      value={invoiceDraft.vatRate}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          vatRate: Number(event.target.value),
                        }))
                      }
                    >
                      <option value={20}>%20</option>
                      <option value={10}>%10</option>
                      <option value={1}>%1</option>
                      <option value={0}>%0</option>
                    </select>
                  </label>
                </div>
                <div className="isnet-totals">
                  <div>
                    <span>Ara toplam</span>
                    <strong>{money(totals.subtotal)}</strong>
                  </div>
                  <div>
                    <span>KDV</span>
                    <strong>{money(totals.vat)}</strong>
                  </div>
                  <div>
                    <span>Genel toplam</span>
                    <strong>{money(totals.grandTotal)}</strong>
                  </div>
                </div>
                <div className="isnet-action-row">
                  <button
                    className="isnet-btn isnet-btn--secondary"
                    type="button"
                    disabled={busyAction === "validate"}
                    onClick={handleValidate}
                  >
                    <ShieldCheck size={16} /> Kontrol Et
                  </button>
                  <button
                    className="isnet-btn isnet-btn--primary"
                    type="button"
                    disabled={
                      !capabilities.prepareInvoice || busyAction === "prepare"
                    }
                    title={
                      !capabilities.prepareInvoice
                        ? "Fatura hazırlama adaptörü etkin değil"
                        : ""
                    }
                    onClick={() =>
                      runAction(
                        "prepare",
                        () => prepareInvoiceDraft(invoicePayload()),
                        "Fatura taslağı hazırlandı.",
                      )
                    }
                  >
                    <FileCheck2 size={16} /> Faturayı Hazırla
                  </button>
                </div>
              </>
            )}
          </article>
          <article className="isnet-card isnet-control-card">
            <SectionHead
              eyebrow="SON KONTROL"
              title="İşlem güvenliği"
              description="Kritik bir eksik varsa taslak hazırlanmaz."
            />
            <div className="isnet-status-list">
              <div>
                <span>İrsaliye numarası</span>
                <Badge tone={selectedDispatch?.dispatchNo ? "green" : "danger"}>
                  {selectedDispatch?.dispatchNo ? "Var" : "Eksik"}
                </Badge>
              </div>
              <div>
                <span>Firma ve model</span>
                <Badge tone={selectedDispatch?.matched ? "green" : "danger"}>
                  {selectedDispatch?.matched ? "Eşleşti" : "Eksik"}
                </Badge>
              </div>
              <div>
                <span>PDF ve XML</span>
                <Badge
                  tone={selectedDispatch?.filesReady ? "green" : "warning"}
                >
                  {selectedDispatch?.filesReady ? "Tam" : "Eksik"}
                </Badge>
              </div>
              <div>
                <span>Mükerrer fatura</span>
                <Badge
                  tone={selectedDispatch?.alreadyInvoiced ? "danger" : "green"}
                >
                  {selectedDispatch?.alreadyInvoiced ? "Bulundu" : "Yok"}
                </Badge>
              </div>
            </div>
            <button
              className="isnet-btn isnet-btn--success isnet-btn--full"
              type="button"
              disabled={!capabilities.archiveInvoice || !selectedDispatch}
              title={
                !capabilities.archiveInvoice ? "Arşiv adaptörü etkin değil" : ""
              }
              onClick={() =>
                runAction(
                  "archive",
                  () => completeInvoiceArchive(invoicePayload()),
                  "Dosyalar arşivlendi.",
                )
              }
            >
              <Archive size={16} /> Arşivle ve Maile Aktar
            </button>
          </article>
        </section>
      )}

      {activeTab === "kesilen-belgeler" && (
        <article className="isnet-card">
          <SectionHead
            eyebrow="ARŞİV"
            title="Yerel belge arşivi"
            description={`${visibleArchiveDocuments.length} belge; model, firma, tür ve dosya durumuna göre süzülebilir.`}
          />
          <div className="isnet-print-filters">
            <label className="isnet-print-search">
              <Search size={15} />
              <input
                value={archiveFilters.search}
                placeholder="Model, belge no, firma veya grup ara"
                onChange={(event) => setArchiveFilters((current) => ({ ...current, search: event.target.value }))}
              />
            </label>
            <select
              value={archiveFilters.type}
              onChange={(event) => setArchiveFilters((current) => ({ ...current, type: event.target.value }))}
            >
              <option value="all">Tüm belge türleri</option>
              <option value="invoice">Faturalar</option>
              <option value="dispatch">İrsaliyeler</option>
            </select>
            <select
              value={archiveFilters.file}
              onChange={(event) => setArchiveFilters((current) => ({ ...current, file: event.target.value }))}
            >
              <option value="all">Tüm dosya durumları</option>
              <option value="complete">PDF + XML tam</option>
              <option value="missing">Dosyası eksik</option>
            </select>
            <select
              value={archiveFilters.sort}
              onChange={(event) => setArchiveFilters((current) => ({ ...current, sort: event.target.value }))}
            >
              <option value="newest">En yeni tarih önce</option>
              <option value="oldest">En eski tarih önce</option>
            </select>
            <span className="isnet-print-result-count">{visibleArchiveDocuments.length} kayıt</span>
          </div>
          <div className="isnet-table-wrap">
            <table className="isnet-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Tür</th>
                  <th>Belge no</th>
                  <th>Firma / model</th>
                  <th>Grup</th>
                  <th>PDF/XML</th>
                  <th>Arşiv / görüntüle</th>
                </tr>
              </thead>
              <tbody>
                {visibleArchiveDocuments.map((row) => (
                  <tr key={row.id} onDoubleClick={(event) => {
                    if (!event.target.closest("button,input,select,a") && row.fileState?.hasPdf) openIssuedDocument(row, "pdf");
                  }} title="Belge PDF'ini açmak için çift tıklayın">
                    <td>{row.dateText}</td>
                    <td>{row.documentTypeText}</td>
                    <td>
                      <strong>{row.documentNo || "—"}</strong>
                    </td>
                    <td>
                      <strong>{row.companyName || "—"}</strong>
                      <small>{row.modelName || "Model belirtilmemiş"}</small>
                    </td>
                    <td>{row.groupName || "—"}</td>
                    <td>
                      <Badge tone={row.filesReady ? "green" : "warning"}>
                        {row.filesReady ? "Tam" : "Eksik"}
                      </Badge>
                    </td>
                    <td>
                      <div className="isnet-row-actions">
                        <Badge tone={row.oneDriveSaved ? "green" : "warning"}>
                          {row.oneDriveSaved ? "Erişilebilir" : "Kontrol"}
                        </Badge>
                        {row.fileState?.hasPdf && (
                          <button
                            type="button"
                            disabled={documentFileBusy === `archive-${row.id}-pdf`}
                            onClick={() => openIssuedDocument(row, "pdf")}
                          >
                            <Eye size={13} /> PDF aç
                          </button>
                        )}
                        {row.fileState?.hasXml && (
                          <button
                            type="button"
                            disabled={documentFileBusy === `archive-${row.id}-xml`}
                            onClick={() => openIssuedDocument(row, "xml")}
                          >
                            XML oku
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !documents.length && (
            <EmptyState
              icon={Archive}
              title="Belge bulunamadı"
              text="Seçili firmada kesilmiş belge kaydı yok."
            />
          )}
        </article>
      )}

      {activeTab === "cikti-kuyrugu" && (
        <section className="isnet-card isnet-editor-card">
          <SectionHead
            eyebrow="ATLANMADAN ÇIKTI TAKİBİ"
            title="PDF çıktı kuyruğu"
            description={`Yazdırılmayı bekleyen ${printQueue.waiting || 0} belge var. Gelen faturalar, giden faturalar ve müşteri irsaliyeleri sıraya alınır.`}
            action={
              <div className="isnet-bulk-print-actions">
                <button
                  type="button"
                  className="isnet-btn isnet-btn--secondary"
                  disabled={
                    !selectedPrintKeys.length || workflowBusy === "bulk-print"
                  }
                  onClick={() => openBulkPrint(selectedPrintKeys)}
                >
                  <FileText size={15} /> Seçili {selectedPrintKeys.length || ""}{" "}
                  belge
                </button>
                <button
                  type="button"
                  className="isnet-btn isnet-btn--primary"
                  disabled={
                    !printQueue.rows?.some((row) => !row.printedAt) ||
                    workflowBusy === "bulk-print"
                  }
                  onClick={() => openBulkPrint([], false)}
                >
                  <FileText size={15} /> Basılmayanların tümü
                </button>
                <button
                  type="button"
                  className="isnet-btn isnet-btn--secondary"
                  disabled={
                    !visiblePrintRows.some((row) => !row.printedAt) ||
                    workflowBusy === "confirm-visible-prints"
                  }
                  onClick={confirmVisiblePrintedItems}
                >
                  <CheckCircle2 size={15} /> Çıktısı alınanları onayla
                </button>
              </div>
            }
          />
          <div className="isnet-print-overview">
            <article>
              <small>BEKLEYEN</small>
              <strong>{printQueue.waiting || 0}</strong>
              <span>Henüz çıktısı alınmadı</span>
            </article>
            <article>
              <small>SEÇİLEN</small>
              <strong>{selectedPrintKeys.length}</strong>
              <span>Tek PDF içinde açılacak</span>
            </article>
            <article>
              <small>TAMAMLANAN</small>
              <strong>
                {(printQueue.rows || []).filter((row) => row.printedAt).length}
              </strong>
              <span>Çıktı geçmişine işlendi</span>
            </article>
            <article className="primary">
              <small>GÜVENLİ TOPLU ÇIKTI</small>
              <strong>PDF</strong>
              <span>Bir dosya bozuksa hiçbir kayıt atlanmaz</span>
            </article>
          </div>
          <div className="isnet-print-shortcuts">
            <button
              type="button"
              onClick={() => openBulkPrint([], true)}
              disabled={
                !printQueue.rows?.some(
                  (row) => !row.printedAt && row.newDocument === true,
                )
              }
            >
              Yalnız yeni gelen ve basılmayanları toplu aç
            </button>
          </div>
          <div className="isnet-print-filters">
            <label className="isnet-print-search">
              <Search size={15} />
              <input
                value={printFilters.search}
                placeholder="Belge no, firma veya model ara"
                onChange={(event) =>
                  setPrintFilters((current) => ({ ...current, search: event.target.value }))
                }
              />
            </label>
            <select
              aria-label="Belge türü"
              value={printFilters.kind}
              onChange={(event) => setPrintFilters((current) => ({ ...current, kind: event.target.value }))}
            >
              <option value="all">Tüm belgeler</option>
              <option value="invoice">Faturalar</option>
              <option value="dispatch">İrsaliyeler</option>
            </select>
            <select
              aria-label="Belge yönü"
              value={printFilters.direction}
              onChange={(event) => setPrintFilters((current) => ({ ...current, direction: event.target.value }))}
            >
              <option value="all">Gelen + giden</option>
              <option value="incoming">Gelen</option>
              <option value="outgoing">Giden</option>
            </select>
            <select
              aria-label="Çıktı durumu"
              value={printFilters.status}
              onChange={(event) => setPrintFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="pending">Çıktısı alınmayanlar</option>
              <option value="printed">Çıktısı alınanlar</option>
              <option value="all">Tüm durumlar</option>
            </select>
            <select
              aria-label="Tarih sıralaması"
              value={printFilters.sort}
              onChange={(event) => setPrintFilters((current) => ({ ...current, sort: event.target.value }))}
            >
              <option value="newest">En yeni tarih önce</option>
              <option value="oldest">En eski tarih önce</option>
            </select>
            <span className="isnet-print-result-count">{visiblePrintRows.length} kayıt</span>
          </div>
          <div className="isnet-table-wrap">
            <table className="isnet-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Bekleyenlerin tümünü seç"
                      checked={
                        Boolean(
                          visiblePrintRows.some((row) => !row.printedAt),
                        ) &&
                        visiblePrintRows
                          .filter((row) => !row.printedAt)
                          .every((row) => selectedPrintKeys.includes(row.key))
                      }
                      onChange={(event) =>
                        setSelectedPrintKeys(
                          event.target.checked
                            ? visiblePrintRows
                                .filter((row) => !row.printedAt)
                                .map((row) => row.key)
                            : [],
                        )
                      }
                    />
                  </th>
                  <th>Belge / tarih</th>
                  <th>Firma</th>
                  <th>Tür</th>
                  <th>Model</th>
                  <th>Çıktı durumu</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visiblePrintRows.map((row) => (
                  <tr
                    key={row.key}
                    className={!row.appReadAt ? "isnet-document-row--new" : ""}
                    onDoubleClick={(event) => {
                      if (!event.target.closest("button,input,select,a")) openPrintItem(row);
                    }}
                    title="Belge PDF'ini açmak için çift tıklayın"
                  >
                    <td>
                      <input
                        type="checkbox"
                        disabled={Boolean(row.printedAt)}
                        checked={selectedPrintKeys.includes(row.key)}
                        onChange={(event) =>
                          setSelectedPrintKeys((current) =>
                            event.target.checked
                              ? [...new Set([...current, row.key])]
                              : current.filter((key) => key !== row.key),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{row.documentNo}</strong>
                      <small>{row.dateText}</small>
                    </td>
                    <td>{row.partnerName || "—"}</td>
                    <td>
                      {row.direction === "incoming" ? "Gelen" : "Giden"}{" "}
                      {row.kind === "invoice" ? "fatura" : "irsaliye"}
                    </td>
                    <td>{row.modelName || "—"}</td>
                    <td>
                      <Badge tone={row.printedAt ? "green" : "warning"}>
                        {row.printedAt ? "Çıktı alındı" : "Çıktı bekliyor"}
                      </Badge>
                      {!row.appReadAt && <small>Yeni belge</small>}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openPrintItem(row)}
                        disabled={workflowBusy === `print-${row.key}`}
                      >
                        <Eye size={13} /> PDF aç
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!printQueue.rows?.length && (
            <EmptyState
              title="Çıktı kuyruğu boş"
              text="Tarih aralığında İşNet Verilerini Al çalıştırıldığında PDF belgeler burada sıraya girer."
            />
          )}
        </section>
      )}

      {(activeTab === "mail-merkezi" || activeTab === "cikti-kuyrugu") && (
        <section className="isnet-mail-grid">
          <article className="isnet-card">
            <SectionHead
              eyebrow="GÖNDERİM KUYRUĞU"
              title="Mail paketleri"
              description={
                capabilities.outlookDraft
                  ? "Alıcı ve PDF ekleri tamamlanan paketler Outlook taslağına aktarılır; son gönderim kullanıcı onayıyla yapılır."
                  : "Alıcı ve ekler burada hazırlanır. Outlook bağlantısı etkin olmadığı için uygulama mail göndermez ve gönderilmiş gibi işaretlemez."
              }
            />
            <div className="isnet-table-wrap">
              <table className="isnet-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Fatura</th>
                    <th>İrsaliye</th>
                    <th>Alıcı</th>
                    <th>Ekler</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {mailQueue.map((mail) => (
                    <tr key={mail.id}>
                      <td>{mail.modelName || "—"}</td>
                      <td>{mail.invoiceNo || "—"}</td>
                      <td>{mail.dispatchNo || "—"}</td>
                      <td>{mail.recipientCount} kişi</td>
                      <td>
                        <Badge
                          tone={mail.attachmentsReady ? "green" : "warning"}
                        >
                          {mail.attachmentCount || 0} ek
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={mail.sent ? "green" : "blue"}>
                          {mail.statusText}
                        </Badge>
                      </td>
                      <td>
                        <div className="isnet-row-actions">
                          {!mail.sent && (
                            <button
                              type="button"
                              disabled={!capabilities.outlookDraft}
                              title={
                                !capabilities.outlookDraft
                                  ? "Outlook adaptörü etkin değil"
                                  : ""
                              }
                              onClick={() =>
                                runAction(
                                  `draft-${mail.id}`,
                                  () => createOutlookDraft(mail.id),
                                  "Outlook taslağı oluşturuldu.",
                                )
                              }
                            >
                              <Mail size={15} /> Taslak
                            </button>
                          )}
                          {!mail.sent && (
                            <button
                              type="button"
                              disabled={!capabilities.markMailSent}
                              onClick={() =>
                                window.confirm(
                                  "Bu maili gönderildi olarak işaretlemek istiyor musunuz?",
                                ) &&
                                runAction(
                                  `sent-${mail.id}`,
                                  () => markMailSent(mail.id),
                                  "Mail gönderildi olarak işaretlendi.",
                                )
                              }
                            >
                              <CheckCircle2 size={15} /> Gönderildi
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && !mailQueue.length && (
              <EmptyState
                icon={Mail}
                title="Mail kuyruğu boş"
                text="Hazırlanmış mail paketi bulunmuyor."
              />
            )}
          </article>
          <article className="isnet-card isnet-mail-preview">
            <SectionHead
              eyebrow="ŞABLON"
              title="Outlook düzeni"
              description="İmza Outlook tarafından korunur."
            />
            <div>
              <span>Konu</span>
              <strong>MODEL ADI FATURA</strong>
            </div>
            <div className="isnet-mail-body">
              <p>İyi çalışmalar,</p>
              <span>
                <FileText size={15} /> HKN… MODEL ADI.pdf
              </span>
              <span>
                <FileText size={15} /> DMM… MODEL ADI.pdf
              </span>
            </div>
            <footer>
              <Send size={15} /> Outlook imzası altta kalır
            </footer>
          </article>
        </section>
      )}

      {activeTab === "ayarlar" && (
        <section className="isnet-settings-grid">
          <article className="isnet-card isnet-connection-card">
            <SectionHead
              eyebrow="BAĞLANTI"
              title="İşNet portal girişi"
              description="Kullanıcı bilgilerini doğrulayın, ardından yetkili İşNet firmasını seçin."
              action={
                <Badge
                  tone={
                    dashboard?.configuration?.apiConfigured
                      ? "green"
                      : "warning"
                  }
                >
                  {dashboard?.configuration?.apiConfigured
                    ? "Bağlı"
                    : "Kurulum gerekli"}
                </Badge>
              }
            />
            <div className="isnet-connection-summary">
              <div>
                <Building2 size={17} />
                <span>
                  <small>ERP ana firması</small>
                  <strong>
                    {activeMainCompany?.name || companyKey || "—"}
                  </strong>
                </span>
              </div>
              <div>
                <Cloud size={17} />
                <span>
                  <small>İşNet bağlantısı</small>
                  <strong>
                    {connectionForm.connectionMode === "portal"
                      ? "NetteFatura portalı"
                      : settings?.apiBase || "—"}
                  </strong>
                </span>
              </div>
            </div>
            <div className="isnet-connection-form">
              <label>
                İşNet kullanıcı adı / TCKN
                <input
                  autoComplete="username"
                  value={connectionForm.username}
                  onChange={(event) =>
                    setConnectionForm((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  placeholder="İşNet giriş kullanıcı adınız"
                />
              </label>
              <label>
                İşNet şifresi
                <div className="isnet-password-field">
                  <LockKeyhole size={16} />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={connectionForm.password}
                    onChange={(event) =>
                      setConnectionForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder={
                      settings?.hasPassword
                        ? "Kayıtlı şifreyi kullanmak için boş bırakın"
                        : "İşNet şifreniz"
                    }
                  />
                </div>
              </label>
              <label className="isnet-company-select">
                İşNet firması
                <select
                  value={connectionForm.companyId}
                  disabled={!connectionForm.companies.length}
                  onChange={(event) =>
                    setConnectionForm((current) => ({
                      ...current,
                      companyId: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    {connectionForm.companies.length
                      ? "Firma seçin"
                      : "Önce bağlantıyı test edin"}
                  </option>
                  {connectionForm.companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name} ({company.id})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="isnet-security-note">
              <ShieldCheck size={15} /> Şifre ekrana geri gönderilmez; AES-256
              ile şifrelenerek seçili ERP ana firmasına özel saklanır.
            </p>
            <div className="isnet-action-row">
              <button
                className="isnet-btn isnet-btn--secondary"
                type="button"
                disabled={
                  !connectionForm.username || busyAction === "test-settings"
                }
                onClick={handleTestConnection}
              >
                <RefreshCw
                  size={16}
                  className={busyAction === "test-settings" ? "isnet-spin" : ""}
                />
                {busyAction === "test-settings"
                  ? "İşNet'e bağlanıyor…"
                  : "Bağlantıyı Test Et"}
              </button>
              <button
                className="isnet-btn isnet-btn--primary"
                type="button"
                disabled={
                  !connectionForm.companyId || busyAction === "save-settings"
                }
                onClick={handleSaveConnection}
              >
                <CheckCircle2 size={16} />
                {busyAction === "save-settings"
                  ? "Kaydediliyor…"
                  : "Firmayı Seç ve Kaydet"}
              </button>
            </div>
          </article>
          <article className="isnet-card">
            <SectionHead
              eyebrow="YETENEKLER"
              title="Otomasyon kapsamı"
              description="Yalnızca gerçek adaptörü olan işlemler açılır."
            />
            <div className="isnet-capability-list">
              {Object.entries({
                createInvoiceDraft: "İşNet fatura taslağı oluşturma",
                verifyInvoiceDraft: "İşNet taslağını geri okuma",
                submitOfficialInvoice: "Resmî fatura gönderimi",
                listLocalRecords: "Yerel kayıtları listeleme",
                validateInvoice: "Fatura doğrulama",
                sync: "İşNet senkronizasyonu",
                prepareInvoice: "Fatura taslağı",
                archiveInvoice: "PDF/XML arşivleme",
                outlookDraft: "Outlook taslağı",
              }).map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <Badge tone={capabilities[key] ? "green" : "neutral"}>
                    {capabilities[key] ? "Etkin" : "Kapalı"}
                  </Badge>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {printPreview && (
        <div className="isnet-document-modal-backdrop" role="presentation">
          <section
            className="isnet-document-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${printPreview.row.documentNo} çıktı`}
          >
            <header>
              <div>
                <small>İŞNET ÇIKTI KUYRUĞU</small>
                <h2>{printPreview.row.documentNo}</h2>
                <p>
                  {printPreview.row.partnerName} ·{" "}
                  {printPreview.row.modelName || "Model belirtilmemiş"}
                </p>
              </div>
              <div className="isnet-document-modal__actions">
                <button
                  type="button"
                  onClick={completePrintItem}
                  disabled={workflowBusy === "confirm-print"}
                >
                  <FileText size={14} /> Yazdır ve çıktıyı onayla
                </button>
                <button type="button" onClick={() => setPrintPreview(null)}>
                  Kapat
                </button>
              </div>
            </header>
            <div className="isnet-document-modal__body">
              <iframe
                id="isnet-print-frame"
                title={`${printPreview.row.documentNo} PDF çıktısı`}
                src={printPreview.url}
              />
            </div>
          </section>
        </div>
      )}

      {invoiceWorkflow && (
        <div
          className="isnet-document-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInvoiceWorkflow(null);
          }}
        >
          <section
            className="isnet-document-modal isnet-workflow-modal isnet-invoice-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${invoiceWorkflow.dispatchNo || "Yeni"} fatura taslağı`}
          >
            <header>
              <div>
                <small>
                  {invoiceWorkflow.mode === "manual"
                    ? "DOĞRUDAN FATURA · TİCARİ SATIŞ"
                    : "GİDEN İRSALİYEDEN · TİCARİ SATIŞ FATURASI"}
                </small>
                <h2>{invoiceWorkflow.modelName || invoiceWorkflow.dispatchNo || "Yeni Fatura"}</h2>
                <p>{invoiceWorkflow.recipientName} · fiyat, KDV, önizleme ve taslak kontrolü</p>
              </div>
              <div className="isnet-document-modal__actions">
                <button
                  type="button"
                  onClick={saveInvoiceDefaults}
                  disabled={workflowBusy === "save-invoice-template"}
                >
                  <Settings2 size={14} /> Sabitleri Kaydet
                </button>
                <button
                  type="button"
                  onClick={saveInvoiceWorkflow}
                  disabled={workflowBusy === "save-invoice-draft" || !invoiceWorkflow.previewApproved || invoiceWorkflow.draftCreated}
                >
                  <CircleDollarSign size={14} /> {invoiceWorkflow.draftCreated ? "Taslak oluşturuldu" : "Kontrollü taslak oluştur"}
                </button>
                <button type="button" onClick={() => setInvoiceWorkflow(null)}>
                  Kapat
                </button>
              </div>
            </header>
            <div className="isnet-workflow-modal__body">
              <nav className="isnet-invoice-flow" aria-label="Fatura iş akışı">
                {[
                  ["1", "Model ve imalat", invoiceWorkflow.modelName ? "Kontrol edildi" : "Kontrol bekliyor"],
                  ["2", "Adet/Fiyat/KDV", invoiceWorkflow.previewApproved ? "Önizleme onaylı" : "Kontrol bekliyor"],
                  ["3", "İşNet taslağı", invoiceWorkflow.draftCreated ? "Oluşturuldu" : "Bekliyor"],
                  ["4", "Taslak doğrulama", invoiceWorkflow.draftVerified ? "VERIFIED" : "Bekliyor"],
                  ["5", "Son onay", invoiceWorkflow.officialStatus === "APPROVED" ? "Onaylandı" : "Bekliyor"],
                  ["6", "Resmî gönderim", invoiceWorkflow.officialStatus || "Bekliyor"],
                  ["7", "PDF/XML", invoiceWorkflow.pdfPath && invoiceWorkflow.xmlPath ? "Alındı" : "Bekliyor"],
                  ["8", "Muhasebe ve cari", invoiceWorkflow.salesInvoiceId ? "İşlendi" : "Bekliyor"],
                  ["9", "Tamamlandı", invoiceWorkflow.officialStatus === "COMPLETED" ? invoiceWorkflow.officialInvoiceNumber : "Bekliyor"],
                ].map(([number, title, note], index) => (
                  <span key={title} className={index < 2 || (index === 2 && invoiceWorkflow.draftCreated) || (index === 3 && invoiceWorkflow.draftVerified) || invoiceWorkflow.officialStatus === "COMPLETED" ? "done" : ""}>
                    <b>{number}</b><i>{title}</i><small>{note}</small>
                  </span>
                ))}
              </nav>
              {invoiceWorkflow.draftCreated ? (
                <div className="isnet-notice isnet-notice--success">
                  İşNet fatura taslağı oluşturuldu{invoiceWorkflow.draftNo ? `: ${invoiceWorkflow.draftNo}` : ""}. Son onay ve gönderim, taslak kaydı İşNet kuyruğundan doğrulandıktan sonra açılır.
                </div>
              ) : null}
              {invoiceWorkflow.verification?.differences?.length ? (
                <section className="isnet-verification-differences">
                  <strong>Taslak doğrulama farkları — resmî gönderim kapalı</strong>
                  {(invoiceWorkflow.verification.differences || []).map((difference, index) => (
                    <div key={`${difference.field}-${index}`}>
                      <span>{difference.field}</span>
                      <small>Beklenen: {String(difference.expected ?? "—")}</small>
                      <small>İşNet: {String(difference.actual ?? "—")}</small>
                      <b>{String(difference.difference ?? "FARK")}</b>
                    </div>
                  ))}
                </section>
              ) : null}
              {invoiceWorkflow.draftVerified && invoiceWorkflow.requestId && invoiceWorkflow.officialStatus !== "COMPLETED" ? (
                <section className="isnet-final-approval">
                  <div>
                    <small>SON KULLANICI ONAYI</small>
                    <strong>{invoiceWorkflow.recipientName} · {invoiceWorkflow.recipient?.taxNo || invoiceWorkflow.verification?.expected?.recipientTaxNo || "VKN doğrulanıyor"}</strong>
                    <span>{invoiceWorkflow.dispatchNo} · Matrah {money(invoiceWorkflow.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0))} · KDV {money(invoiceWorkflow.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.vatRate || 0) / 100, 0))} · Toplam {money(invoiceWorkflow.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * (1 + Number(line.vatRate || 0) / 100), 0))}</span>
                    <span>İşNet doğrulaması: {invoiceWorkflow.verification?.differences?.length ? `${invoiceWorkflow.verification.differences.length} fark` : "Tüm alanlar eşleşti"}</span>
                  </div>
                  <label className="isnet-field">
                    <span>Güvenlik metni</span>
                    <input value={invoiceWorkflow.confirmationText || ""} placeholder="FATURAYI GÖNDER" onChange={(event) => setInvoiceWorkflow((current) => ({ ...current, confirmationText: event.target.value }))} />
                  </label>
                  <button type="button" onClick={submitOfficialInvoiceWorkflow} disabled={workflowBusy === "submit-official-invoice" || invoiceWorkflow.confirmationText !== "FATURAYI GÖNDER" || !capabilities.submitOfficialInvoice || Boolean(invoiceWorkflow.verification?.differences?.length)}>
                    <ShieldCheck size={16} /> Onayla ve Gönder
                  </button>
                  {["FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING"].includes(invoiceWorkflow.officialStatus) ? (
                    <button type="button" onClick={retryInvoiceClosureWorkflow} disabled={workflowBusy === "retry-invoice-closure"}><RefreshCw size={16} /> Yalnız kapanışı yeniden dene</button>
                  ) : null}
                </section>
              ) : null}
              {invoiceWorkflow.officialStatus === "COMPLETED" ? (
                <div className="isnet-notice isnet-notice--success">Resmî fatura tamamlandı: {invoiceWorkflow.officialInvoiceNumber} · UUID {invoiceWorkflow.officialUuid}</div>
              ) : null}
              {!invoiceWorkflow.recipient && (
                <div className="isnet-notice isnet-notice--warning">
                  Alıcı firma İşNet fatura kartlarında otomatik bulunamadı.
                  Firma kartını İşNet'te tanımlayıp tekrar deneyin.
                </div>
              )}
              <div className="isnet-form-grid">
                <label className="isnet-field isnet-field--wide isnet-recipient-picker">
                  <span>Alıcı</span>
                  <input
                    value={
                      invoiceWorkflow.mode === "manual"
                        ? invoiceRecipientQuery
                        : invoiceWorkflow.recipient?.name ||
                          invoiceWorkflow.recipientName ||
                          ""
                    }
                    readOnly={invoiceWorkflow.mode !== "manual"}
                    placeholder="Firma adını yazın ve İşNet kartını seçin"
                    onChange={(event) => {
                      setInvoiceRecipientQuery(event.target.value);
                      setInvoiceWorkflow((current) => ({
                        ...current,
                        recipient: null,
                        recipientId: "",
                      }));
                    }}
                  />
                  {invoiceWorkflow.mode === "manual" && invoiceRecipientRows.length ? (
                    <div className="isnet-recipient-results">
                      {invoiceRecipientRows.map((recipient) => (
                        <button
                          type="button"
                          key={recipient.id}
                          onClick={() => selectInvoiceRecipient(recipient)}
                        >
                          <strong>{recipient.name}</strong>
                          <small>
                            {recipient.taxNo || "VKN yok"} · {recipient.localCompanyName || "Firma kartı eşleşmedi"}
                          </small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </label>
                <label className="isnet-field">
                  <span>Fatura tarihi</span>
                  <input
                    type="date"
                    value={invoiceWorkflow.invoiceDate}
                    onChange={(event) =>
                      setInvoiceWorkflow((current) => ({
                        ...current,
                        invoiceDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="isnet-field">
                  <span>Model adı</span>
                  <input
                    value={invoiceWorkflow.modelName || ""}
                    onChange={(event) =>
                      setInvoiceWorkflow((current) => ({
                        ...current,
                        modelName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="isnet-field">
                  <span>Senaryo</span>
                  <input value="TİCARİFATURA" readOnly />
                </label>
                <label className="isnet-field">
                  <span>Fatura türü</span>
                  <input value="SATIŞ" readOnly />
                </label>
                <label className="isnet-field">
                  <span>Para birimi</span>
                  <select
                    value={invoiceWorkflow.currency || "TRY"}
                    onChange={(event) =>
                      setInvoiceWorkflow((current) => ({
                        ...current,
                        currency: event.target.value,
                      }))
                    }
                  >
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
                <label className="isnet-field">
                  <span>Vade tarihi</span>
                  <input
                    type="date"
                    value={invoiceWorkflow.dueDate || invoiceWorkflow.invoiceDate}
                    onChange={(event) =>
                      setInvoiceWorkflow((current) => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="isnet-field">
                  <span>Sipariş / piyon no</span>
                  <input
                    value={invoiceWorkflow.orderNo || ""}
                    onChange={(event) =>
                      setInvoiceWorkflow((current) => ({
                        ...current,
                        orderNo: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="isnet-field">
                  <span>İrsaliye no (varsa)</span>
                  <input
                    value={invoiceWorkflow.dispatchNo || ""}
                    readOnly={invoiceWorkflow.mode !== "manual"}
                    onChange={(event) =>
                      setInvoiceWorkflow((current) => ({
                        ...current,
                        dispatchNo: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="isnet-field">
                  <span>Departman / bölüm</span>
                  <input
                    list="isnet-invoice-departments"
                    value={invoiceWorkflow.departmentNo || ""}
                    placeholder="145, 165..."
                    onChange={(event) =>
                      setInvoiceWorkflow((current) => ({
                        ...current,
                        departmentNo: event.target.value,
                      }))
                    }
                  />
                  <datalist id="isnet-invoice-departments">
                    {(invoiceWorkflow.departments || []).map((department) => (
                      <option key={department.code} value={department.code}>
                        {department.name}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label className="isnet-field isnet-field--wide">
                  <span>Fatura notları</span>
                  <textarea
                    rows="2"
                    value={(invoiceWorkflow.notes || []).join("\n")}
                    placeholder="Her faturada kullanılacak notları satır satır girin"
                    onChange={(event) =>
                      setInvoiceWorkflow((current) => ({
                        ...current,
                        notes: event.target.value.split("\n"),
                      }))
                    }
                  />
                </label>
              </div>
              {invoiceWorkflow.modelImageUrl ? (
                <section className="isnet-invoice-model-preview">
                  <img src={invoiceWorkflow.modelImageUrl} alt={invoiceWorkflow.modelName || "Model"} />
                  <div>
                    <small>MODEL GÖRSELİ</small>
                    <strong>{invoiceWorkflow.modelName}</strong>
                    <span>Fatura satırını onaylamadan önce modeli görselden kontrol edin.</span>
                  </div>
                </section>
              ) : null}
              <section className="isnet-invoice-check-strip">
                <div>
                  <small>MODEL</small>
                  <strong>{invoiceWorkflow.modelName || "Eksik"}</strong>
                </div>
                <div>
                  <small>DEPARTMAN</small>
                  <strong>{invoiceWorkflow.departmentNo || "Seçilmedi"}</strong>
                </div>
                <div>
                  <small>İRSALİYE</small>
                  <strong>{invoiceWorkflow.dispatchNo}</strong>
                </div>
              </section>
              <section className="isnet-invoice-mail-recipients">
                <small>FATURA SONRASI MAİL ALICILARI</small>
                <div>
                  {(invoiceWorkflow.contacts || [])
                    .filter(
                      (contact) =>
                        !invoiceWorkflow.departmentNo ||
                        contact.departmentCode === invoiceWorkflow.departmentNo,
                    )
                    .map((contact) => (
                      <span key={contact.id}>
                        <Mail size={12} /> {contact.name} · {contact.email}
                      </span>
                    ))}
                </div>
                {!(invoiceWorkflow.contacts || []).some(
                  (contact) =>
                    contact.departmentCode === invoiceWorkflow.departmentNo,
                ) && (
                  <p>
                    Bu departman için firma kartında fatura maili alacak yetkili
                    bulunamadı.
                  </p>
                )}
              </section>
              <div className="isnet-table-wrap">
                <table className="isnet-table">
                  <thead>
                    <tr>
                      <th>Ürün / açıklama</th>
                      <th>Miktar</th>
                      <th>Birim fiyat</th>
                      <th>KDV %</th>
                      <th>Toplam</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceWorkflow.lines.map((line, index) => {
                      const amount =
                        Number(line.quantity || 0) *
                        Number(line.unitPrice || 0);
                      return (
                        <tr key={line.lineNo || index}>
                          <td>
                            <input
                              value={line.productName || ""}
                              placeholder="Ürün / hizmet adı"
                              onChange={(event) =>
                                updateInvoiceLine(
                                  index,
                                  "productName",
                                  event.target.value,
                                )
                              }
                            />
                            <input
                              value={line.description || ""}
                              placeholder="Model ve açıklama"
                              onChange={(event) =>
                                updateInvoiceLine(
                                  index,
                                  "description",
                                  event.target.value,
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={line.quantity}
                              onChange={(event) =>
                                updateInvoiceLine(
                                  index,
                                  "quantity",
                                  event.target.value,
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitPrice}
                              onChange={(event) =>
                                updateInvoiceLine(
                                  index,
                                  "unitPrice",
                                  event.target.value,
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value="20"
                              readOnly
                            />
                          </td>
                          <td>
                            <strong>
                              {money(
                                amount * (1 + Number(line.vatRate || 0) / 100),
                              )}
                            </strong>
                          </td>
                          <td>
                            <button
                              type="button"
                              disabled={invoiceWorkflow.lines.length <= 1}
                              onClick={() => removeInvoiceLine(index)}
                            >
                              Kaldır
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="isnet-action-row">
                <button
                  className="isnet-btn isnet-btn--secondary"
                  type="button"
                  onClick={addInvoiceLine}
                >
                  <FileText size={14} /> Fatura satırı ekle
                </button>
                <button
                  className="isnet-btn isnet-btn--primary"
                  type="button"
                  onClick={() => setInvoiceWorkflow((current) => ({
                    ...current,
                    scenarioType: "2",
                    invoiceType: "1",
                    previewApproved: true,
                    lines: current.lines.map((line) => ({ ...line, vatRate: 20 })),
                  }))}
                >
                  <Eye size={14} /> Fatura önizleme ve kontrol
                </button>
              </div>
              <section className={`isnet-invoice-preview ${invoiceWorkflow.previewApproved ? "open" : ""}`}>
                <div><small>ARA TOPLAM</small><strong>{money(invoiceWorkflow.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0))}</strong></div>
                <div><small>KDV %20</small><strong>{money(invoiceWorkflow.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * 0.2, 0))}</strong></div>
                <div><small>GENEL TOPLAM</small><strong>{money(invoiceWorkflow.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * 1.2, 0))}</strong></div>
                <p>{invoiceWorkflow.previewApproved ? "Alıcı, irsaliye, miktar, fiyat ve KDV kontrolü kullanıcı tarafından onaylandı." : "Taslak oluşturmadan önce önizlemeyi açın."}</p>
              </section>
              <p className="isnet-safe-note">
                <ShieldCheck size={14} /> Taslak oluşturma ile belge gönderme ayrıdır. Gerçek gönderim yalnızca son önizleme ve açık kullanıcı onayıyla yapılır.
              </p>
            </div>
          </section>
        </div>
      )}

      {dispatchWorkflow && (
        <div
          className="isnet-document-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDispatchWorkflow(null);
          }}
        >
          <section
            className={`isnet-document-modal isnet-workflow-modal${dispatchWorkflow.modelData?.notApplicable ? " isnet-workflow-modal--supplier" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={`${dispatchWorkflow.document.documentNo} işleme paneli`}
          >
            <header>
              <div>
                <small>İŞNET İRSALİYE İŞLEME PANELİ</small>
                <h2>{dispatchWorkflow.document.documentNo}</h2>
                <p>
                  {dispatchWorkflow.intake.issuerName ||
                    dispatchWorkflow.document.partnerName}
                  {" · "}
                  PDF ve XML arşivlendi
                </p>
              </div>
              <div className="isnet-document-modal__actions">
                <button
                  className="isnet-model-only-action"
                  type="button"
                  onClick={() =>
                    handleCreateOutgoingDraft(dispatchWorkflow.document)
                  }
                  disabled={
                    !dispatchWorkflow.intake.modelId ||
                    workflowBusy === "prepare-outgoing-draft"
                  }
                >
                  <Send size={14} /> Giden irsaliye taslağını düzenle
                </button>
                <button type="button" onClick={() => setDispatchWorkflow(null)}>
                  Kapat
                </button>
              </div>
            </header>
            <div className="isnet-workflow-modal__body">
              {dispatchWorkflow.loading && (
                <div className="isnet-detail-state"><RefreshCw className="isnet-spin" size={20} /><strong>Belge detayı yükleniyor</strong><span>Yalnız seçilen kaydın XML satırları getiriliyor.</span></div>
              )}
              {dispatchWorkflow.error && (
                <div className="isnet-detail-state isnet-detail-state--error"><AlertTriangle size={20} /><strong>Belge detayı yüklenemedi</strong><span>{dispatchWorkflow.error}</span><button type="button" onClick={() => openDispatchWorkflow(dispatchWorkflow.document)}>Yeniden dene</button></div>
              )}
              {dispatchWorkflow.modelData?.notApplicable && (
                <section className="isnet-supplier-summary">
                  <div><small>FİRMA TÜRÜ</small><strong>SUPPLIER · Model uygulanmaz</strong></div>
                  <div><small>MUHASEBE</small><strong>{dispatchWorkflow.document.accountingImported ? "Muhasebeye işlendi" : "Kontrol bekliyor"}</strong></div>
                  <div><small>DOSYALAR</small><strong>{dispatchWorkflow.document.pdfSaved && dispatchWorkflow.document.xmlSaved ? "PDF + XML hazır" : "Eksik dosya var"}</strong></div>
                  <div><small>ARŞİV</small><strong>{dispatchWorkflow.document.downloaded ? "Yerel arşivde" : "Arşiv bekliyor"}</strong></div>
                </section>
              )}
              <section className="isnet-workflow-summary">
                <div>
                  <small>XML'DEN OKUNAN MODEL</small>
                  <strong>
                    {dispatchWorkflow.intake.modelGuess ||
                      "Model adı okunamadı"}
                  </strong>
                </div>
                <Badge
                  tone={dispatchWorkflow.intake.modelId ? "green" : "warning"}
                >
                  {dispatchWorkflow.intake.modelId
                    ? "Model bağlı"
                    : "Model seçimi zorunlu"}
                </Badge>
              </section>

              <section className="isnet-workflow-section">
                <SectionHead
                  eyebrow="İRSALİYE SATIRLARI"
                  title="XML içeriği"
                  description={`${dispatchWorkflow.intake.lines?.length || 0} satır okundu.`}
                />
                <div className="isnet-table-wrap">
                  <table className="isnet-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Ürün / açıklama</th>
                        <th>Model adayı</th>
                        <th>Miktar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dispatchWorkflow.intake.lines || []).map((line) => (
                        <tr key={line.id || line.lineNo}>
                          <td>{line.lineNo}</td>
                          <td>
                            <strong>{line.rawName || "—"}</strong>
                            <small>{line.description || ""}</small>
                          </td>
                          <td>{line.modelGuess || "—"}</td>
                          <td>
                            {Number(line.quantity || 0).toLocaleString("tr-TR")}{" "}
                            {line.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="isnet-workflow-section">
                <SectionHead
                  eyebrow="DESEN + İMALAT MODEL HAVUZU"
                  title="Yakın model önerileri"
                  description="Kesin eşleşme yoksa en yakın kayıtlar gösterilir. Seçmeden belge hazır sayılmaz."
                  action={
                    <button
                      className="isnet-btn isnet-btn--secondary"
                      type="button"
                      onClick={() => handleCreateModel()}
                      disabled={workflowBusy === "create-model"}
                    >
                      Yeni model aç
                    </button>
                  }
                />
                <label className="isnet-field isnet-field--wide">
                  <span>Desen / model havuzunda ara</span>
                  <input
                    value={dispatchModelSearch}
                    onChange={(event) => setDispatchModelSearch(event.target.value)}
                    placeholder="Model adı veya model kodu yazın"
                  />
                </label>
                <div className="isnet-model-suggestions">
                  {(dispatchWorkflow.modelData?.suggestions || []).map(
                    (candidate) => (
                      <button
                        type="button"
                        key={`${candidate.source}-${candidate.id}`}
                        className={
                          dispatchWorkflow.intake.modelId === candidate.id
                            ? "active"
                            : ""
                        }
                        onClick={() => handleAssignModel(candidate)}
                        disabled={workflowBusy === `model-${candidate.id}`}
                      >
                        <span>
                          <strong>{candidate.name}</strong>
                          <small>
                            {candidate.code ||
                              candidate.note ||
                              candidate.source}
                          </small>
                        </span>
                        <Badge tone={candidate.score >= 90 ? "green" : "blue"}>
                          %{candidate.score}
                        </Badge>
                      </button>
                    ),
                  )}
                </div>
                {!dispatchWorkflow.modelData?.suggestions?.length && (
                  <EmptyState
                    title="Yakın model bulunamadı"
                    text="Yeni model açarak bu irsaliyeyi model zincirine bağlayın."
                  />
                )}
              </section>
            </div>
          </section>
        </div>
      )}

      {newModelDraft && (
        <div
          className="isnet-document-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && workflowBusy !== "create-model") setNewModelDraft(null);
          }}
        >
          <section className="isnet-document-modal isnet-new-model-modal" role="dialog" aria-modal="true" aria-label="Yeni model oluştur">
            <header>
              <div>
                <small>DESEN HAVUZU · YENİ MODEL</small>
                <h2>Kaydet ve belgeye bağla</h2>
                <p>Model, Desen Havuzu'nun gerçek kaydında oluşturulur ve seçili XML satırına bağlanır.</p>
              </div>
              <button type="button" onClick={() => setNewModelDraft(null)} disabled={workflowBusy === "create-model"}>Kapat</button>
            </header>
            <div className="isnet-workflow-modal__body">
              <div className="isnet-new-model-grid">
                <label className="isnet-field isnet-field--wide">
                  <span>Model adı *</span>
                  <input value={newModelDraft.modelName} onChange={(event) => setNewModelDraft((current) => ({ ...current, modelName: event.target.value }))} autoFocus />
                </label>
                <label className="isnet-field">
                  <span>Firma</span>
                  <input value={newModelDraft.companyName} readOnly />
                </label>
                <label className="isnet-field">
                  <span>Sipariş / piyon</span>
                  <input value={newModelDraft.orderNo} onChange={(event) => setNewModelDraft((current) => ({ ...current, orderNo: event.target.value }))} />
                </label>
                <label className="isnet-field">
                  <span>Ürün kodu</span>
                  <input value={newModelDraft.modelCode} onChange={(event) => setNewModelDraft((current) => ({ ...current, modelCode: event.target.value }))} />
                </label>
                <label className="isnet-field">
                  <span>Renk</span>
                  <input value={newModelDraft.color} onChange={(event) => setNewModelDraft((current) => ({ ...current, color: event.target.value }))} />
                </label>
                <label className="isnet-field">
                  <span>Bölge</span>
                  <input value={newModelDraft.region} onChange={(event) => setNewModelDraft((current) => ({ ...current, region: event.target.value }))} />
                </label>
                <label className="isnet-field isnet-field--wide">
                  <span>XML ürün açıklaması</span>
                  <textarea value={newModelDraft.description} readOnly rows={2} />
                </label>
                <label className="isnet-field isnet-field--wide">
                  <span>Not</span>
                  <textarea value={newModelDraft.note} onChange={(event) => setNewModelDraft((current) => ({ ...current, note: event.target.value }))} rows={3} />
                </label>
              </div>
              <div
                className={`isnet-image-dropzone${newModelPreview ? " has-image" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); chooseNewModelImage(event.dataTransfer.files?.[0]); }}
              >
                {newModelPreview ? <img src={newModelPreview} alt="Yeni model görsel önizlemesi" /> : <div><strong>Görseli buraya bırakın</strong><span>JPG, PNG veya WEBP · en fazla 8 MB</span></div>}
                <label>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseNewModelImage(event.target.files?.[0])} />
                  {newModelPreview ? "Görseli değiştir" : "Dosya seç"}
                </label>
                {newModelPreview && <button type="button" onClick={() => { URL.revokeObjectURL(newModelPreview); setNewModelPreview(""); setNewModelImage(null); }}>Görseli kaldır</button>}
              </div>
              <div className="isnet-new-model-actions">
                <span><ShieldCheck size={15} /> Kayıt, bağlantı ve Desen Havuzu doğrulaması tamamlanmadan başarı mesajı gösterilmez.</span>
                <button type="button" className="isnet-btn isnet-btn--primary" onClick={saveNewModel} disabled={workflowBusy === "create-model" || !newModelDraft.modelName.trim()}>
                  {workflowBusy === "create-model" ? "Kaydediliyor…" : "Kaydet ve Belgeye Bağla"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {outgoingDraftWorkflow && (
        <div
          className="isnet-document-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOutgoingDraftWorkflow(null);
          }}
        >
          <section
            className="isnet-document-modal isnet-workflow-modal isnet-outgoing-draft-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Düzenlenebilir giden irsaliye taslağı"
          >
            <header>
              <div>
                <small>GELEN İRSALİYEDEN GİDEN İRSALİYE</small>
                <h2>Taslağı kontrol et ve düzenle</h2>
                <p>
                  {outgoingDraftWorkflow.incomingDispatchNo} · İşNet'e henüz kayıt
                  gönderilmedi
                </p>
              </div>
              <div className="isnet-document-modal__actions">
                <button
                  type="button"
                  onClick={saveOutgoingDraftWorkflow}
                  disabled={workflowBusy === "save-outgoing-draft"}
                >
                  <Send size={14} /> İşNet taslağını oluştur
                </button>
                <button type="button" onClick={() => setOutgoingDraftWorkflow(null)}>
                  Kapat
                </button>
              </div>
            </header>
            <div className="isnet-workflow-modal__body">
              <div className="isnet-create-steps" aria-label="İrsaliye oluşturma adımları">
                {["Alıcı", "İrsaliye", "Taşıyıcı", "Ürün", "Hesap", "Ekler", "Notlar", "Kontrol"].map(
                  (step, index) => (
                    <span key={step} className={index < 2 ? "active" : ""}>
                      <b>{index + 1}</b>{step}
                    </span>
                  ),
                )}
              </div>

              <section className="isnet-workflow-section">
                <SectionHead
                  eyebrow="ALICI VE BELGE"
                  title="Sabit bilgileri kontrol edin"
                  description="Gelen irsaliyenin göndereni İşNet alıcı kartıyla eşleştirildi; tarih, senaryo ve model taslak oluşturulmadan değiştirilebilir."
                />
                <div className="isnet-editor-grid">
                  <label>
                    Alıcı firma
                    <input value={outgoingDraftWorkflow.recipientName || ""} readOnly />
                  </label>
                  <label>
                    Model adı
                    <input
                      value={outgoingDraftWorkflow.modelName || ""}
                      onChange={(event) =>
                        setOutgoingDraftWorkflow((current) => ({ ...current, modelName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    İrsaliye tarihi
                    <input
                      type="date"
                      value={outgoingDraftWorkflow.issueDate || ""}
                      onChange={(event) =>
                        setOutgoingDraftWorkflow((current) => ({ ...current, issueDate: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Fiili sevk saati
                    <input
                      type="time"
                      step="1"
                      value={outgoingDraftWorkflow.issueTime || ""}
                      onChange={(event) =>
                        setOutgoingDraftWorkflow((current) => ({ ...current, issueTime: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Senaryo
                    <select
                      value={outgoingDraftWorkflow.scenarioType || "1"}
                      onChange={(event) =>
                        setOutgoingDraftWorkflow((current) => ({ ...current, scenarioType: event.target.value }))
                      }
                    >
                      <option value="1">TEMELİRSALİYE</option>
                      <option value="2">HKSİRSALİYE</option>
                      <option value="3">İDİSİRSALİYE</option>
                    </select>
                  </label>
                  <label>
                    İrsaliye türü
                    <select
                      value={outgoingDraftWorkflow.dispatchType || "1"}
                      onChange={(event) =>
                        setOutgoingDraftWorkflow((current) => ({ ...current, dispatchType: event.target.value }))
                      }
                    >
                      <option value="1">SEVK</option>
                      <option value="2">MATBUDAN</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="isnet-workflow-section">
                <SectionHead
                  eyebrow="ÜRÜN BİLGİLERİ"
                  title="İrsaliye satırları"
                  description="Ürün adı, açıklama/model ve miktar İşNet taslağına bu haliyle aktarılır."
                />
                <div className="isnet-table-wrap">
                  <table className="isnet-table isnet-editor-table">
                    <thead><tr><th>Ürün</th><th>Açıklama / model</th><th>Miktar</th><th /></tr></thead>
                    <tbody>
                      {(outgoingDraftWorkflow.lines || []).map((line, index) => (
                        <tr key={`${line.lineNo || index}-${index}`}>
                          <td><input value={line.productName || ""} onChange={(e) => updateOutgoingDraftLine(index, "productName", e.target.value)} /></td>
                          <td><input value={line.description || ""} onChange={(e) => updateOutgoingDraftLine(index, "description", e.target.value)} /></td>
                          <td><input type="number" min="0.001" step="0.001" value={line.quantity || ""} onChange={(e) => updateOutgoingDraftLine(index, "quantity", e.target.value)} /></td>
                          <td>
                            <button
                              type="button"
                              className="isnet-btn isnet-btn--secondary"
                              disabled={outgoingDraftWorkflow.lines.length === 1}
                              onClick={() => setOutgoingDraftWorkflow((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }))}
                            >Kaldır</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="isnet-btn isnet-btn--secondary"
                  onClick={() => setOutgoingDraftWorkflow((current) => ({
                    ...current,
                    lines: [...current.lines, { productName: "", description: current.modelName || "", quantity: 1, measureUnitId: 67 }],
                  }))}
                >Satır ekle</button>
              </section>

              <section className="isnet-workflow-section">
                <SectionHead eyebrow="NOTLAR" title="Belge notu" />
                <textarea
                  className="isnet-editor-textarea"
                  rows={4}
                  value={outgoingDraftWorkflow.note || ""}
                  onChange={(event) =>
                    setOutgoingDraftWorkflow((current) => ({ ...current, note: event.target.value }))
                  }
                />
                <p className="isnet-secure-note">
                  <ShieldCheck size={14} /> Bu işlem yalnızca İşNet taslağı oluşturur;
                  resmi onay ve gönderim ayrı kullanıcı onayı olmadan yapılmaz.
                </p>
              </section>
            </div>
          </section>
        </div>
      )}

      {documentPreview && (
        <div
          className="isnet-document-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDocumentPreview();
          }}
        >
          <section
            className="isnet-document-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${documentPreview.document.documentNo} belge önizleme`}
          >
            <header>
              <div>
                <small>İŞNET BELGE İÇERİĞİ</small>
                <h2>{documentPreview.document.documentNo}</h2>
                <p>
                  {documentPreview.document.directionText}{" "}
                  {documentPreview.document.documentTypeText} ·{" "}
                  {documentPreview.document.partnerName}
                </p>
              </div>
              <div className="isnet-document-modal__actions">
                <button
                  type="button"
                  onClick={() =>
                    loadDocumentFile(
                      documentPreview.document,
                      documentPreview.format === "pdf" ? "xml" : "pdf",
                    )
                  }
                >
                  {documentPreview.format === "pdf" ? "XML oku" : "PDF göster"}
                </button>
                <button type="button" onClick={closeDocumentPreview}>
                  Kapat
                </button>
              </div>
            </header>
            <div className="isnet-document-modal__body">
              {documentPreview.format === "pdf" ? (
                <iframe
                  title={`${documentPreview.document.documentNo} PDF`}
                  src={documentPreview.url}
                />
              ) : (
                <pre>{documentPreview.text}</pre>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
