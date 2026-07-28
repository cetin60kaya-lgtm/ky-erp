import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  Send,
  Sparkles,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { getFirmaKartlari } from "../../../services/muhasebeApi";
import { getDesenSimpleModels } from "../../../services/desenApi";
import {
  getIsnetLocalDocuments,
  getIsnetModelSuggestions,
  startDailySync,
} from "../../../services/isnetApi";
import {
  assignIsnetAutoFlowModel,
  createIsnetAutoFlowOutgoingDraft,
  getIsnetAutoFlows,
  prepareIsnetIncomingAutoFlow,
  refreshIsnetAutoFlow,
  setIsnetAutoFlowOutgoingNo,
} from "../../../services/isnetAutoFlowApi";
import {
  createIsnetManualPdfSourceIntake,
  createIsnetNoDispatchSourceIntake,
  createOutgoingDispatchFromSourceIntake,
  getIsnetSourceIntakes,
  prepareInvoiceFromSourceIntake,
} from "../../../services/isnetSourceIntakeApi";
import { resolveIsnetBusinessContext } from "../../../services/isnetBusinessSettingsApi";
import "../IsnetPage.css";
import "./IsnetAutomationWorkflowPage.css";

const todayText = () => new Date().toISOString().slice(0, 10);
const nowTimeText = () =>
  new Date().toLocaleTimeString("tr-TR", { hour12: false });
const recentStartText = () => {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
};

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.documents)) return value.documents;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function quantityText(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(
    numberValue(value),
  );
}

function statusLabel(value) {
  return {
    MODEL_REQUIRED: "Model onayı gerekiyor",
    OUTGOING_DRAFT_READY: "İrsaliye hazırlama bekliyor",
    OUTGOING_SEND_REQUIRED: "Taslağı İşNet'te gönderin",
    PRICE_REQUIRED: "Yalnız fiyat girilecek",
    INVOICE_DRAFT_READY: "Fatura taslağı hazır",
    COMPLETED: "Tamamlandı",
    ERROR: "Kontrol gerekiyor",
    READY_FOR_INVOICE: "Faturaya hazır",
    PARTIAL: "Kısmi işlem",
  }[value] || value || "Hazır";
}

function companyName(row) {
  return row?.name || row?.companyName || row?.firmaAdi || row?.firma || "Firma";
}

function modelName(row) {
  return row?.modelName || row?.name || row?.modelAdi || row?.desenAdi || "Model";
}

function cloneLines(lines = []) {
  return lines.map((line) => ({ ...line, quantity: numberValue(line.quantity) }));
}

function rebalanceMainLines(lines, remainingQuantity) {
  const next = cloneLines(lines);
  const mainIndexes = next
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.category === "MAIN")
    .map(({ index }) => index);
  if (!mainIndexes.length) return next;
  const specialTotal = next
    .filter((line) => line.category !== "MAIN")
    .reduce((sum, line) => sum + numberValue(line.quantity), 0);
  const targetMain = Math.max(
    0,
    Number((remainingQuantity - specialTotal).toFixed(4)),
  );
  const sourceTotal = mainIndexes.reduce(
    (sum, index) =>
      sum + numberValue(next[index].sourceQuantity || next[index].quantity),
    0,
  );
  let allocated = 0;
  mainIndexes.forEach((index, position) => {
    const isLast = position === mainIndexes.length - 1;
    const source = numberValue(
      next[index].sourceQuantity || next[index].quantity,
    );
    const nextQuantity = isLast
      ? Number((targetMain - allocated).toFixed(4))
      : Number(((targetMain * source) / Math.max(sourceTotal, 1)).toFixed(4));
    next[index].quantity = Math.max(0, nextQuantity);
    allocated += next[index].quantity;
  });
  return next;
}

function specialLines() {
  return [
    ["TEST_NUMUNESI", "TEST NUMUNESİ"],
    ["BASKI_SAKATI", "BASKI SAKATI"],
    ["KUMAS_SAKATI", "KUMAŞ SAKATI"],
  ].map(([category, productName]) => ({
    sourceLineId: category,
    category,
    productName,
    description: productName,
    quantity: 0,
    measureUnitId: "67",
    unitPrice: 0,
  }));
}

function portalModal(flow, preparation) {
  const value = preparation || flow?.preview || {};
  const remainingQuantity = numberValue(
    value.remainingQuantity ?? flow?.remainingQuantity ?? flow?.sourceQuantity,
  );
  return {
    mode: "auto",
    flow,
    preparation: value,
    fullClose: true,
    issueDate: value.defaultIssueDate || todayText(),
    issueTime: value.defaultIssueTime || nowTimeText(),
    showDateTime: false,
    showCarrier: false,
    note: "",
    remainingQuantity,
    lines: rebalanceMainLines(
      cloneLines(value.preparationLines || flow?.preview?.preparationLines || []),
      remainingQuantity,
    ),
    carrier: { ...(value.businessContext?.carrier || {}) },
  };
}

function sourceModal(intake, selectedCompany, selectedModel, context, quantity) {
  const mainLine = {
    sourceLineId: "MAIN",
    category: "MAIN",
    productName: modelName(selectedModel),
    description: modelName(selectedModel),
    quantity,
    sourceQuantity: quantity,
    measureUnitId: "67",
    unitPrice: 0,
  };
  return {
    mode: "source",
    sourceIntakeId: intake.id,
    flow: {
      id: intake.id,
      companyName: companyName(selectedCompany),
      modelName: modelName(selectedModel),
      incomingDocumentNo:
        intake.customerDispatchNo || intake.documentNo || "MANUEL KAYNAK",
      sourceQuantity: quantity,
      remainingQuantity: quantity,
    },
    preparation: { businessContext: context },
    fullClose: true,
    issueDate: intake.issueDate || todayText(),
    issueTime: nowTimeText(),
    showDateTime: false,
    showCarrier: false,
    note: intake.note || "",
    remainingQuantity: quantity,
    lines: [mainLine, ...specialLines()],
    carrier: { ...(context?.carrier || {}) },
  };
}

export default function IsnetWorkflowFinalPage({
  activeMainCompany,
  openModule,
  moduleActionContext,
}) {
  const companySlug = activeMainCompany?.slug || activeMainCompany?.id || "";
  const [sourceMode, setSourceMode] = useState("portal");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [range, setRange] = useState({
    startDate: recentStartText(),
    endDate: todayText(),
  });
  const [portalDocuments, setPortalDocuments] = useState([]);
  const [flows, setFlows] = useState([]);
  const [manualRows, setManualRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [models, setModels] = useState([]);
  const [modelDecision, setModelDecision] = useState(null);
  const [dispatchCandidates, setDispatchCandidates] = useState({});
  const [preparationModal, setPreparationModal] = useState(null);
  const [manualForm, setManualForm] = useState({
    companyId: "",
    modelId: "",
    issueDate: todayText(),
    quantity: "",
    orderNo: "",
    customerDispatchNo: "",
    note: "",
    pdfFile: null,
  });

  const load = useCallback(async () => {
    if (!companySlug) return;
    setLoading(true);
    try {
      const [documents, activeFlows, intakes, companyRows, modelRows] =
        await Promise.all([
          getIsnetLocalDocuments({ ...range, page: 1, pageSize: 100 }),
          getIsnetAutoFlows(),
          getIsnetSourceIntakes({ ...range, page: 1, pageSize: 100 }),
          getFirmaKartlari(activeMainCompany),
          getDesenSimpleModels(activeMainCompany, { limit: 3000 }),
        ]);
      setPortalDocuments(rowsOf(documents));
      setFlows(rowsOf(activeFlows));
      setManualRows(rowsOf(intakes));
      setCompanies(rowsOf(companyRows));
      setModels(rowsOf(modelRows));
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İşNet iş akışı yüklenemedi.",
      });
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany, companySlug, range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!moduleActionContext?.nonce) return;
    setSourceMode("portal");
    if (moduleActionContext.modelDecision) {
      setModelDecision(moduleActionContext.modelDecision);
    }
    if (moduleActionContext.notice) {
      setNotice({
        tone: moduleActionContext.noticeTone || "success",
        text: moduleActionContext.notice,
      });
    }
  }, [
    moduleActionContext?.modelDecision,
    moduleActionContext?.nonce,
    moduleActionContext?.notice,
    moduleActionContext?.noticeTone,
  ]);

  const incomingDispatches = useMemo(
    () =>
      portalDocuments.filter((row) => {
        const companyType = String(row.companyType || "").toUpperCase();
        return (
          row.direction === "incoming" &&
          row.kind === "dispatch" &&
          (row.modelApplicable === true ||
            ["CUSTOMER", "BOTH"].includes(companyType))
        );
      }),
    [portalDocuments],
  );

  const customerCompanies = useMemo(
    () =>
      companies.filter((row) => {
        const type = String(
          row.companyType || row.firmaTuru || row.type || "",
        ).toUpperCase();
        return (
          !type ||
          ["CUSTOMER", "MUSTERI", "MÜŞTERİ", "BOTH", "GENEL"].includes(
            type,
          )
        );
      }),
    [companies],
  );
  const selectedCompany =
    customerCompanies.find(
      (row) => String(row.id) === String(manualForm.companyId),
    ) || null;
  const selectedModel =
    models.find((row) => String(row.id) === String(manualForm.modelId)) ||
    null;

  const modalTotal = preparationModal
    ? Number(
        preparationModal.lines
          .reduce((sum, line) => sum + numberValue(line.quantity), 0)
          .toFixed(4),
      )
    : 0;
  const modalDifference = preparationModal
    ? Number((preparationModal.remainingQuantity - modalTotal).toFixed(4))
    : 0;
  const modalValid = Boolean(
    preparationModal &&
      modalTotal > 0 &&
      modalTotal <= preparationModal.remainingQuantity + 0.0001 &&
      (!preparationModal.fullClose || Math.abs(modalDifference) <= 0.0001),
  );

  function openInvoiceFlow(flow, values = {}) {
    const invoiceDraft = values.invoiceDraft || flow.invoiceSeed;
    const sourceId = values.sourceId || flow.outgoingSourceId;
    if (!invoiceDraft || !sourceId) {
      setNotice({
        tone: "warning",
        text: "Faturaya çevrilecek gönderilmiş irsaliye henüz doğrulanmadı.",
      });
      return;
    }
    openModule?.("isnet", {
      tabKey: "irsaliyeden-faturaya",
      actionContext: {
        sourceId,
        documentNo: values.documentNo || flow.outgoingDraftNo,
        invoiceDraft,
        autoFlowId: flow.id,
        existingRequestId: flow.invoiceRequestId || "",
        existingDraftNo: flow.invoiceDraftNo || "",
        existingDraftVersion: flow.invoiceDraftVersion || "",
      },
    });
  }

  async function synchronize() {
    setBusy("sync");
    setNotice(null);
    try {
      const result = await startDailySync(range);
      const accounting = result?.supplierAccounting || {};
      const routing = result?.supplierRouting || {};
      setNotice({
        tone: accounting.failed > 0 ? "warning" : "success",
        text: `${numberValue(result?.automation?.downloaded)} belge tamamlandı. ${numberValue(accounting.imported)} tedarikçi faturası cari/KDV'ye işlendi. ${numberValue(routing.stockMovementsCreated)} stok girişi, ${numberValue(routing.lotsCreated)} yeni Boyahane lotu oluştu.`,
      });
      await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İşNet senkronizasyonu tamamlanamadı.",
      });
    } finally {
      setBusy("");
    }
  }

  async function preparePortal(row) {
    setBusy(`prepare-${row.id}`);
    setNotice(null);
    try {
      const result = await prepareIsnetIncomingAutoFlow(row.sourceId, range);
      if (result.needsModel) {
        setModelDecision({
          flow: result.flow,
          suggestions: result.suggestions || [],
        });
        setNotice({ tone: "warning", text: result.message });
      } else if (result.requiresPreparation) {
        setPreparationModal(portalModal(result.flow, result.preparation));
        setNotice({ tone: "success", text: result.message });
      } else {
        setNotice({
          tone: result.duplicatePrevented ? "warning" : "success",
          text: result.message,
        });
      }
      await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İrsaliye hazırlama ekranı açılamadı.",
      });
    } finally {
      setBusy("");
    }
  }

  async function openModelSuggestions(flow) {
    setBusy(`model-list-${flow.id}`);
    try {
      const result = await getIsnetModelSuggestions(
        flow.incomingIntakeId,
        flow.modelName || "",
      );
      setModelDecision({ flow, suggestions: result?.suggestions || [] });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Model önerileri alınamadı.",
      });
    } finally {
      setBusy("");
    }
  }

  async function approveModel(candidate) {
    if (!modelDecision?.flow?.id) return;
    setBusy(`model-${candidate.id}`);
    try {
      const result = await assignIsnetAutoFlowModel(modelDecision.flow.id, {
        source: candidate.source,
        candidateId: candidate.id,
        confidence: candidate.score,
      });
      setModelDecision(null);
      if (result.requiresPreparation) {
        setPreparationModal(portalModal(result.flow, result.preparation));
      }
      setNotice({ tone: "success", text: result.message });
      await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Model onayı tamamlanamadı.",
      });
    } finally {
      setBusy("");
    }
  }

  function patchManual(values) {
    setManualForm((current) => ({ ...current, ...values }));
    setNotice(null);
  }

  async function createManualSource() {
    if (!selectedCompany || !selectedModel) {
      setNotice({ tone: "warning", text: "Firma ve model zorunludur." });
      return;
    }
    const requestedQuantity = numberValue(manualForm.quantity);
    if (!(requestedQuantity > 0)) {
      setNotice({ tone: "warning", text: "Adet sıfırdan büyük olmalıdır." });
      return;
    }
    if (sourceMode === "pdf" && !manualForm.pdfFile) {
      setNotice({ tone: "warning", text: "İrsaliye PDF dosyasını seçin." });
      return;
    }
    setBusy("manual-create");
    setNotice(null);
    try {
      const payload = {
        ...manualForm,
        mainCompanySlug: companySlug,
        companyName: companyName(selectedCompany),
        companyRole: "CUSTOMER",
        modelName: modelName(selectedModel),
        unit: "ADET",
      };
      const intake =
        sourceMode === "pdf"
          ? await createIsnetManualPdfSourceIntake(payload)
          : await createIsnetNoDispatchSourceIntake(payload);
      const context = await resolveIsnetBusinessContext(activeMainCompany, {
        companyId: selectedCompany.id,
        companyName: companyName(selectedCompany),
        modelId: selectedModel.id,
        modelName: modelName(selectedModel),
      });
      setPreparationModal(
        sourceModal(
          intake,
          selectedCompany,
          selectedModel,
          context,
          requestedQuantity,
        ),
      );
      setNotice({
        tone: "success",
        text: "Kaynak kaydı oluşturuldu. İşNet taslağından önce kalem, adet, tarih ve taşıyıcıyı kontrol edin.",
      });
      await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Kaynak kaydı oluşturulamadı.",
      });
    } finally {
      setBusy("");
    }
  }

  function patchModalLine(index, value) {
    setPreparationModal((current) => {
      if (!current) return current;
      const lines = cloneLines(current.lines);
      lines[index].quantity = Math.max(0, numberValue(value));
      return {
        ...current,
        lines:
          current.fullClose && lines[index].category !== "MAIN"
            ? rebalanceMainLines(lines, current.remainingQuantity)
            : lines,
      };
    });
  }

  function toggleFullClose(fullClose) {
    setPreparationModal((current) =>
      current
        ? {
            ...current,
            fullClose,
            lines: fullClose
              ? rebalanceMainLines(current.lines, current.remainingQuantity)
              : current.lines,
          }
        : current,
    );
  }

  async function createPreparedDraft() {
    if (!preparationModal || !modalValid) return;
    setBusy(`draft-${preparationModal.flow.id}`);
    setNotice(null);
    try {
      const payload = {
        lines: preparationModal.lines,
        quantity: modalTotal,
        fullClose: preparationModal.fullClose,
        issueDate: preparationModal.issueDate,
        issueTime: preparationModal.issueTime,
        carrier: preparationModal.carrier,
        note: preparationModal.note,
        previewApproved: true,
      };
      const result =
        preparationModal.mode === "source"
          ? await createOutgoingDispatchFromSourceIntake(
              preparationModal.sourceIntakeId,
              payload,
            )
          : await createIsnetAutoFlowOutgoingDraft(
              preparationModal.flow.id,
              payload,
            );
      setPreparationModal(null);
      setNotice({ tone: "success", text: result.message });
      setManualForm({
        companyId: "",
        modelId: "",
        issueDate: todayText(),
        quantity: "",
        orderNo: "",
        customerDispatchNo: "",
        note: "",
        pdfFile: null,
      });
      await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "İşNet irsaliye taslağı oluşturulamadı.",
      });
    } finally {
      setBusy("");
    }
  }

  async function findSentDispatch(flow) {
    setBusy(`refresh-${flow.id}`);
    setNotice(null);
    try {
      const result = await refreshIsnetAutoFlow(flow.id, range);
      if (result.needsDispatchSelection) {
        setDispatchCandidates((current) => ({
          ...current,
          [flow.id]: result.candidates || [],
        }));
      } else {
        setDispatchCandidates((current) => {
          const next = { ...current };
          delete next[flow.id];
          return next;
        });
      }
      setNotice({
        tone: result.ready ? "success" : "warning",
        text: result.message,
      });
      if (result.ready) openInvoiceFlow(flow, result);
      await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Gönderilmiş irsaliye bulunamadı.",
      });
    } finally {
      setBusy("");
    }
  }

  async function selectSentDispatch(flow, candidate) {
    setBusy(`candidate-${flow.id}-${candidate.sourceId}`);
    try {
      await setIsnetAutoFlowOutgoingNo(flow.id, candidate.documentNo);
      const result = await refreshIsnetAutoFlow(flow.id, range);
      setDispatchCandidates((current) => {
        const next = { ...current };
        delete next[flow.id];
        return next;
      });
      setNotice({
        tone: result.ready ? "success" : "warning",
        text: result.message,
      });
      if (result.ready) {
        openInvoiceFlow(
          { ...flow, outgoingDraftNo: candidate.documentNo },
          result,
        );
      }
      await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Gönderilmiş irsaliye seçilemedi.",
      });
    } finally {
      setBusy("");
    }
  }

  async function prepareManualInvoice(row) {
    setBusy(`manual-invoice-${row.id}`);
    try {
      const result = await prepareInvoiceFromSourceIntake(row.id, range);
      setNotice({
        tone: result.ready ? "success" : "warning",
        text: result.message,
      });
      if (result.ready) {
        openModule?.("isnet", {
          tabKey: "irsaliyeden-faturaya",
          actionContext: {
            sourceId: result.sourceId,
            documentNo: result.documentNo,
            invoiceDraft: result.invoiceDraft,
            sourceIntakeId: row.id,
          },
        });
      }
      await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error?.message || "Fatura hazırlığı tamamlanamadı.",
      });
    } finally {
      setBusy("");
    }
  }

  function flowAction(flow) {
    if (flow.status === "MODEL_REQUIRED") {
      return (
        <button
          type="button"
          className="isnet-btn isnet-btn--primary"
          onClick={() => openModelSuggestions(flow)}
        >
          <Sparkles size={14} /> Model Seç
        </button>
      );
    }
    if (flow.status === "OUTGOING_DRAFT_READY") {
      return (
        <button
          type="button"
          className="isnet-btn isnet-btn--primary"
          onClick={() =>
            flow.preview
              ? setPreparationModal(portalModal(flow, flow.preview))
              : void preparePortal({
                  id: flow.id,
                  sourceId: flow.incomingSourceId,
                })
          }
        >
          <ReceiptText size={14} /> İrsaliye Hazırla
        </button>
      );
    }
    if (
      ["PRICE_REQUIRED", "INVOICE_DRAFT_READY"].includes(flow.status) &&
      flow.invoiceSeed
    ) {
      return (
        <button
          type="button"
          className="isnet-btn isnet-btn--primary"
          onClick={() => openInvoiceFlow(flow)}
        >
          <ReceiptText size={14} />
          {flow.status === "PRICE_REQUIRED"
            ? "Fiyat Gir ve Faturala"
            : "Mevcut Fatura Taslağını Aç"}
        </button>
      );
    }
    if (flow.status === "COMPLETED") {
      return (
        <span className="isnet-complete-label">
          <CheckCircle2 size={15} />
          {flow.officialInvoiceNo || "Tamamlandı"}
        </span>
      );
    }
    return (
      <button
        type="button"
        className="isnet-btn isnet-btn--secondary"
        onClick={() => findSentDispatch(flow)}
      >
        <RefreshCw size={14} /> Gönderilmiş İrsaliyeyi Bul
      </button>
    );
  }

  return (
    <main className="isnet-page isnet-auto-page" aria-busy={loading}>
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker">
            <Sparkles size={14} /> KONTROLLÜ OTOMASYON
          </span>
          <h1>İrsaliye ve Fatura İş Akışı</h1>
          <p>
            İşNet, mail/PDF ve manuel kaynakların tamamı aynı kalem/adet
            kontrolünden geçer. Resmî gönderim daima kullanıcıdadır.
          </p>
        </div>
        <div className="isnet-hero__actions">
          <label>
            <small>Başlangıç</small>
            <input
              type="date"
              value={range.startDate}
              onChange={(event) =>
                setRange((current) => ({
                  ...current,
                  startDate: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <small>Bitiş</small>
            <input
              type="date"
              value={range.endDate}
              onChange={(event) =>
                setRange((current) => ({
                  ...current,
                  endDate: event.target.value,
                }))
              }
            />
          </label>
          <button
            className="isnet-btn isnet-btn--primary"
            type="button"
            onClick={synchronize}
            disabled={busy === "sync"}
          >
            {busy === "sync" ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            İşNet'i Senkronize Et
          </button>
        </div>
      </header>

      {notice ? (
        <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>
          {notice.text}
        </div>
      ) : null}

      <section className="isnet-card isnet-auto-guide">
        <div className="isnet-auto-steps">
          {["Kaynağı seç", "Kalem/adet modalı", "İrsaliye taslağı", "Siz gönderin", "Yalnız fiyat", "Fatura taslağı ve siz gönderin"].map((label, index) => (
            <div key={label}>
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="isnet-card">
        <div className="isnet-source-switch">
          <button
            type="button"
            className={sourceMode === "portal" ? "active" : ""}
            onClick={() => setSourceMode("portal")}
          >
            <FileText size={16} /> İşNet Gelen İrsaliyesi
          </button>
          <button
            type="button"
            className={sourceMode === "pdf" ? "active" : ""}
            onClick={() => setSourceMode("pdf")}
          >
            <Upload size={16} /> Mail / PDF
          </button>
          <button
            type="button"
            className={sourceMode === "manual" ? "active" : ""}
            onClick={() => setSourceMode("manual")}
          >
            <ReceiptText size={16} /> İrsaliye Yok
          </button>
        </div>

        {sourceMode === "portal" ? (
          <div>
            <div className="isnet-section-head">
              <div>
                <small>GELEN MÜŞTERİ İRSALİYELERİ</small>
                <h2>Kaynağı seçin</h2>
                <p>Bu düğme portal taslağı oluşturmaz; yalnız hızlı hazırlama modalını açar.</p>
              </div>
              <button type="button" className="isnet-btn isnet-btn--secondary" onClick={load}>
                <RefreshCw size={15} /> Yenile
              </button>
            </div>
            {loading ? (
              <div className="isnet-empty">
                <LoaderCircle className="spin" />
                <strong>Belgeler yükleniyor</strong>
              </div>
            ) : incomingDispatches.length ? (
              <div className="isnet-table-wrap">
                <table className="isnet-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>İrsaliye</th>
                      <th>Müşteri</th>
                      <th>Model</th>
                      <th>Dosya</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomingDispatches.map((row) => (
                      <tr key={row.id}>
                        <td>{row.dateText}</td>
                        <td><strong>{row.documentNo}</strong></td>
                        <td>{row.partnerName}</td>
                        <td>{row.modelName || row.modelGuess || "Otomatik kontrol"}</td>
                        <td>
                          <span className={`isnet-badge isnet-badge--${row.pdfSaved && row.xmlSaved ? "green" : "warning"}`}>
                            {row.pdfSaved && row.xmlSaved ? "PDF + XML" : "Eksik dosya"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="isnet-btn isnet-btn--primary"
                            disabled={busy === `prepare-${row.id}`}
                            onClick={() => preparePortal(row)}
                          >
                            <ReceiptText size={14} /> İrsaliye Hazırla
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="isnet-empty">
                <CheckCircle2 />
                <strong>İşlem bekleyen müşteri irsaliyesi yok</strong>
              </div>
            )}
          </div>
        ) : (
          <div className="isnet-manual-grid">
            <div className="isnet-form-field">
              <label>Müşteri</label>
              <select
                value={manualForm.companyId}
                onChange={(event) => patchManual({ companyId: event.target.value })}
              >
                <option value="">Müşteri seçin</option>
                {customerCompanies.map((row) => (
                  <option key={row.id} value={row.id}>{companyName(row)}</option>
                ))}
              </select>
            </div>
            <div className="isnet-form-field">
              <label>Model</label>
              <select
                value={manualForm.modelId}
                onChange={(event) => patchManual({ modelId: event.target.value })}
              >
                <option value="">Model seçin</option>
                {models.map((row) => (
                  <option key={row.id} value={row.id}>{modelName(row)}</option>
                ))}
              </select>
            </div>
            <div className="isnet-form-field">
              <label>Kaynak tarihi</label>
              <input
                type="date"
                value={manualForm.issueDate}
                onChange={(event) => patchManual({ issueDate: event.target.value })}
              />
            </div>
            <div className="isnet-form-field">
              <label>Toplam adet</label>
              <input
                type="number"
                min="1"
                value={manualForm.quantity}
                onChange={(event) => patchManual({ quantity: event.target.value })}
              />
            </div>
            <div className="isnet-form-field">
              <label>Sipariş / Piyon</label>
              <input
                value={manualForm.orderNo}
                onChange={(event) => patchManual({ orderNo: event.target.value })}
              />
            </div>
            {sourceMode === "pdf" ? (
              <div className="isnet-form-field">
                <label>İrsaliye PDF</label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) =>
                    patchManual({ pdfFile: event.target.files?.[0] || null })
                  }
                />
              </div>
            ) : null}
            <div className="isnet-form-field isnet-form-field--wide">
              <label>Not</label>
              <input
                value={manualForm.note}
                onChange={(event) => patchManual({ note: event.target.value })}
              />
            </div>
            <div className="isnet-manual-action">
              <button
                type="button"
                className="isnet-btn isnet-btn--primary"
                disabled={busy === "manual-create"}
                onClick={createManualSource}
              >
                <Sparkles size={15} /> Kaynağı Oluştur ve Modalı Aç
              </button>
            </div>
          </div>
        )}
      </section>

      {modelDecision ? (
        <section className="isnet-card isnet-exception-card">
          <div className="isnet-section-head">
            <div>
              <small>YALNIZ İSTİSNA</small>
              <h2>Doğru modeli onaylayın</h2>
            </div>
            <AlertTriangle />
          </div>
          <div className="isnet-model-choice-grid">
            {modelDecision.suggestions.map((candidate) => (
              <button
                key={`${candidate.source}-${candidate.id}`}
                type="button"
                onClick={() => approveModel(candidate)}
              >
                <strong>{candidate.name}</strong>
                <small>{candidate.code || "Kod yok"} · %{candidate.score}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="isnet-card">
        <div className="isnet-section-head">
          <div>
            <small>AKTİF İŞLER</small>
            <h2>İrsaliye ve fatura devam adımları</h2>
          </div>
        </div>
        <div className="isnet-table-wrap">
          <table className="isnet-table">
            <thead>
              <tr>
                <th>Kaynak</th>
                <th>Müşteri / Model</th>
                <th>Kaynak / Kalan</th>
                <th>Giden İrsaliye</th>
                <th>Durum</th>
                <th>Devam</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => (
                <tr key={flow.id}>
                  <td><strong>{flow.incomingDocumentNo || flow.incomingSourceId}</strong><small>{flow.issueDate}</small></td>
                  <td>{flow.companyName}<small>{flow.modelName || "Model bekliyor"}</small></td>
                  <td>{quantityText(flow.sourceQuantity || flow.quantity)}<small>Kalan: {quantityText(flow.remainingQuantity ?? flow.quantity)}</small></td>
                  <td>{flow.outgoingDraftNo || "Henüz taslak yok"}</td>
                  <td><span className={`isnet-badge isnet-badge--${flow.status === "COMPLETED" ? "green" : "blue"}`}>{statusLabel(flow.status)}</span></td>
                  <td>
                    {flowAction(flow)}
                    {dispatchCandidates[flow.id]?.length ? (
                      <div className="isnet-dispatch-candidates">
                        <small>Doğru gönderilmiş irsaliyeyi seçin:</small>
                        {dispatchCandidates[flow.id].map((candidate) => (
                          <button
                            key={candidate.sourceId}
                            type="button"
                            onClick={() => selectSentDispatch(flow, candidate)}
                          >
                            <strong>{candidate.documentNo}</strong>
                            <span>{candidate.partnerName} · {candidate.quantity} adet · {candidate.date}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!flows.length ? (
                <tr><td colSpan="6" className="isnet-empty">Aktif otomatik iş yok.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {manualRows.length ? (
        <section className="isnet-card">
          <div className="isnet-section-head">
            <div><small>PDF / MANUEL KAYNAKLAR</small><h2>Yerel kaynak kayıtları</h2></div>
          </div>
          <div className="isnet-table-wrap">
            <table className="isnet-table">
              <thead><tr><th>Tarih</th><th>Müşteri</th><th>Model</th><th>Adet</th><th>Durum</th><th>İşlem</th></tr></thead>
              <tbody>
                {manualRows.map((row) => {
                  const completed = (row.outgoingDispatchDrafts || []).some(
                    (item) => item.status === "COMPLETED",
                  );
                  return (
                    <tr key={row.id}>
                      <td>{row.issueDate}</td>
                      <td>{row.companyName}</td>
                      <td>{row.modelName}</td>
                      <td>{row.quantity}</td>
                      <td>{statusLabel(row.workflowStatus)}</td>
                      <td>
                        <button
                          type="button"
                          className="isnet-btn isnet-btn--secondary"
                          disabled={!completed || busy === `manual-invoice-${row.id}`}
                          onClick={() => prepareManualInvoice(row)}
                        >
                          <Send size={14} /> Gönderilmiş İrsaliyeyi Bul ve Faturala
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {preparationModal ? (
        <div className="isnet-prep-backdrop">
          <section className="isnet-prep-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <small>İŞNET TASLAĞINDAN ÖNCE</small>
                <h2>Giden İrsaliye Hazırla</h2>
                <p>{preparationModal.flow.companyName} · {preparationModal.flow.modelName}</p>
              </div>
              <button type="button" onClick={() => setPreparationModal(null)}><X size={18} /></button>
            </header>
            <div className="isnet-prep-summary">
              <div><span>Kaynak toplam</span><b>{quantityText(preparationModal.flow.sourceQuantity)}</b></div>
              <div><span>Bu çevrim kalan</span><b>{quantityText(preparationModal.remainingQuantity)}</b></div>
              <div><span>Taslak toplamı</span><b>{quantityText(modalTotal)}</b></div>
              <div className={Math.abs(modalDifference) <= 0.0001 ? "ok" : "warning"}><span>Dağıtılmayan</span><b>{quantityText(Math.abs(modalDifference))}</b></div>
            </div>
            <div className="isnet-prep-mode">
              <button type="button" className={preparationModal.fullClose ? "active" : ""} onClick={() => toggleFullClose(true)}>Tamamını Kes</button>
              <button type="button" className={!preparationModal.fullClose ? "active" : ""} onClick={() => toggleFullClose(false)}>Kısmi Kesim</button>
            </div>
            <div className="isnet-prep-table-wrap">
              <table>
                <thead><tr><th>Kalem</th><th>Tür</th><th>Adet</th><th>Birim</th></tr></thead>
                <tbody>
                  {preparationModal.lines.map((line, index) => (
                    <tr key={`${line.sourceLineId}-${line.category}`}>
                      <td><b>{line.productName}</b><small>{line.description}</small></td>
                      <td><span className={`isnet-prep-category ${line.category.toLowerCase()}`}>{line.category === "MAIN" ? "Ana ürün" : line.category.replaceAll("_", " ")}</span></td>
                      <td><input type="number" min="0" step="1" value={line.quantity} onChange={(event) => patchModalLine(index, event.target.value)} /></td>
                      <td>ADET</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="isnet-prep-context">
              <article><Truck size={18} /><div><b>{preparationModal.carrier.carrierName || "Taşıyıcı eksik"}</b><span>{preparationModal.carrier.vehiclePlate || "Plaka yok"}</span></div><button type="button" onClick={() => setPreparationModal((current) => ({ ...current, showCarrier: !current.showCarrier }))}>Değiştir</button></article>
              <article><CheckCircle2 size={18} /><div><b>{preparationModal.preparation.businessContext?.responsible?.fullName || "Sorumlu eksik"}</b><span>Departman {preparationModal.preparation.businessContext?.department?.departmentCode || "tanımsız"}</span></div></article>
              <article><ReceiptText size={18} /><div><b>{preparationModal.issueDate} · {preparationModal.issueTime}</b><span>Varsayılan işlem anı</span></div><button type="button" onClick={() => setPreparationModal((current) => ({ ...current, showDateTime: !current.showDateTime }))}>Değiştir</button></article>
            </div>
            {preparationModal.showDateTime ? (
              <div className="isnet-prep-extra">
                <label>Tarih<input type="date" value={preparationModal.issueDate} onChange={(event) => setPreparationModal((current) => ({ ...current, issueDate: event.target.value }))} /></label>
                <label>Saat<input type="time" step="1" value={preparationModal.issueTime} onChange={(event) => setPreparationModal((current) => ({ ...current, issueTime: event.target.value }))} /></label>
              </div>
            ) : null}
            {preparationModal.showCarrier ? (
              <div className="isnet-prep-extra">
                <label>Taşıyıcı<input value={preparationModal.carrier.carrierName || ""} onChange={(event) => setPreparationModal((current) => ({ ...current, carrier: { ...current.carrier, carrierName: event.target.value } }))} /></label>
                <label>VKN/TCKN<input value={preparationModal.carrier.taxNo || ""} onChange={(event) => setPreparationModal((current) => ({ ...current, carrier: { ...current.carrier, taxNo: event.target.value } }))} /></label>
                <label>Araç plakası<input value={preparationModal.carrier.vehiclePlate || ""} onChange={(event) => setPreparationModal((current) => ({ ...current, carrier: { ...current.carrier, vehiclePlate: event.target.value } }))} /></label>
                <label>Dorse plakası<input value={preparationModal.carrier.trailerPlate || ""} onChange={(event) => setPreparationModal((current) => ({ ...current, carrier: { ...current.carrier, trailerPlate: event.target.value } }))} /></label>
              </div>
            ) : null}
            <label className="isnet-prep-note">İrsaliye notu<input value={preparationModal.note} onChange={(event) => setPreparationModal((current) => ({ ...current, note: event.target.value }))} /></label>
            {!modalValid ? (
              <div className="isnet-notice isnet-notice--warning">
                {preparationModal.fullClose
                  ? `Tam kesimde toplam ${quantityText(preparationModal.remainingQuantity)} olmalıdır.`
                  : `Toplam ${quantityText(preparationModal.remainingQuantity)} adedi aşmamalıdır.`}
              </div>
            ) : null}
            <footer>
              <button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => setPreparationModal(null)}>Vazgeç</button>
              <button type="button" className="isnet-btn isnet-btn--primary" disabled={!modalValid || busy === `draft-${preparationModal.flow.id}`} onClick={createPreparedDraft}>
                {busy === `draft-${preparationModal.flow.id}` ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}
                İşNet Taslağını Oluştur
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
