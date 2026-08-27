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
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
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
    sourceQuantity: 0,
    lockedDescription: true,
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
    lockedDescription: true,
  };
  return {
    mode: "source",
    intake,
    selectedCompany,
    selectedModel,
    context,
    fullClose: true,
    issueDate: intake?.issueDate || todayText(),
    issueTime: nowTimeText(),
    showDateTime: false,
    showCarrier: false,
    note: intake?.note || "",
    remainingQuantity: quantity,
    lines: [mainLine, ...specialLines()],
    carrier: { ...(context?.carrier || {}) },
  };
}

function lineQuantityTotal(lines = []) {
  return Number(
    lines.reduce((sum, line) => sum + numberValue(line.quantity), 0).toFixed(4),
  );
}

function lineLabel(line) {
  if (line.category === "TEST_NUMUNESI") return "Test numunesi";
  if (line.category === "BASKI_SAKATI") return "Baskı sakatı";
  if (line.category === "KUMAS_SAKATI") return "Kumaş sakatı";
  return line.productName || line.description || "Ana ürün";
}

function canEditDescription(line) {
  return line.lockedDescription !== true && line.category !== "MAIN";
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
  const [range, setRange] = useState({ startDate: recentStartText(), endDate: todayText() });
  const [portalDocuments, setPortalDocuments] = useState([]);
  const [flows, setFlows] = useState([]);
  const [manualRows, setManualRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [modelDecision, setModelDecision] = useState(null);
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
      const result = await loadModuleData({
        scope: `isnet:${companySlug}:otomasyon:${range.startDate}:${range.endDate}`,
        sources: {
          documents: { critical: true, load: () => getIsnetLocalDocuments({ ...range, page: 1, pageSize: 100 }) },
          flows: { critical: true, load: () => getIsnetAutoFlows() },
          intakes: { critical: true, load: () => getIsnetSourceIntakes({ mainCompanySlug: companySlug }) },
          companies: { fallback: [], load: () => getFirmaKartlari({ mainCompanyId: companySlug }) },
          models: { fallback: [], load: () => getDesenSimpleModels({ mainCompanySlug: companySlug }) },
        },
      });
      if (result.states.documents.status !== "error") setPortalDocuments(rowsOf(result.data.documents));
      if (result.states.flows.status !== "error") setFlows(rowsOf(result.data.flows));
      if (result.states.intakes.status !== "error") setManualRows(rowsOf(result.data.intakes));
      if (result.states.companies.status !== "error") setCompanies(rowsOf(result.data.companies));
      if (result.states.models.status !== "error") setModels(rowsOf(result.data.models));
      const warning = moduleLoadMessage(result, "İşNet ana akış kaynaklarından biri alınamadı; diğer başarılı kayıtlar korunuyor.", "Firma veya model yardımcı listesi yenilenemedi; belge akışı kullanılabilir.");
      setNotice(warning ? { tone: result.hasCriticalError ? "error" : "warning", text: warning } : null);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet akış kayıtları yüklenemedi." });
    } finally {
      setLoading(false);
    }
  }, [companySlug, range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!moduleActionContext?.sourceId) return;
    const matching = manualRows.find((row) => String(row.id) === String(moduleActionContext.sourceId));
    if (matching) setSourceMode("manual");
  }, [manualRows, moduleActionContext?.sourceId]);

  const selectedDocument = useMemo(
    () => portalDocuments.find((row) => String(row.id) === String(selectedDocumentId)),
    [portalDocuments, selectedDocumentId],
  );

  const activeFlows = useMemo(
    () => flows.filter((row) => row.status !== "COMPLETED"),
    [flows],
  );

  const selectedCompany = useMemo(
    () => companies.find((row) => String(row.id) === String(manualForm.companyId)),
    [companies, manualForm.companyId],
  );
  const selectedModel = useMemo(
    () => models.find((row) => String(row.id) === String(manualForm.modelId)),
    [models, manualForm.modelId],
  );

  async function syncNow() {
    setBusy("sync");
    try {
      await startDailySync({ mainCompanySlug: companySlug, ...range });
      await load();
      setNotice({ tone: "success", text: "İşNet senkronizasyonu tamamlandı." });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Senkronizasyon tamamlanamadı." });
    } finally {
      setBusy("");
    }
  }

  async function preparePortalDocument() {
    if (!selectedDocumentId) return;
    setBusy("prepare-portal");
    try {
      const prepared = await prepareIsnetIncomingAutoFlow(selectedDocumentId, {
        mainCompanySlug: companySlug,
      });
      if (prepared?.requiresModel) {
        const suggestions = await getIsnetModelSuggestions({
          mainCompanySlug: companySlug,
          query: prepared?.modelQuery || selectedDocument?.modelName || selectedDocument?.documentNo || "",
        });
        setModelDecision({
          flow: prepared,
          suggestions: rowsOf(suggestions),
          selectedModelId: "",
        });
      } else if (prepared?.flow?.id || prepared?.id) {
        const flow = prepared.flow || prepared;
        const preparation = prepared.preview || flow.preview || prepared;
        setPreparationModal(portalModal(flow, preparation));
      }
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İrsaliye hazırlama başlatılamadı." });
    } finally {
      setBusy("");
    }
  }

  async function assignModelAndContinue() {
    if (!modelDecision?.flow?.id || !modelDecision.selectedModelId) return;
    setBusy("model");
    try {
      const assigned = await assignIsnetAutoFlowModel(
        modelDecision.flow.id,
        modelDecision.selectedModelId,
      );
      const refreshed = await refreshIsnetAutoFlow(modelDecision.flow.id);
      setModelDecision(null);
      setPreparationModal(portalModal(refreshed?.flow || assigned?.flow || assigned, refreshed?.preview));
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Model eşleştirilemedi." });
    } finally {
      setBusy("");
    }
  }

  async function openFlowPreparation(flow) {
    setBusy(`flow-${flow.id}`);
    try {
      const refreshed = await refreshIsnetAutoFlow(flow.id);
      setPreparationModal(portalModal(refreshed?.flow || flow, refreshed?.preview));
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Hazırlama bilgileri açılamadı." });
    } finally {
      setBusy("");
    }
  }

  async function createManualSource(noDispatch = false) {
    if (!manualForm.companyId || !manualForm.modelId || numberValue(manualForm.quantity) <= 0) {
      setNotice({ tone: "warning", text: "Firma, model ve adet zorunludur." });
      return;
    }
    setBusy(noDispatch ? "no-dispatch" : "manual-pdf");
    try {
      const payload = {
        mainCompanySlug: companySlug,
        companyId: manualForm.companyId,
        companyName: companyName(selectedCompany),
        modelId: manualForm.modelId,
        modelName: modelName(selectedModel),
        issueDate: manualForm.issueDate,
        quantity: numberValue(manualForm.quantity),
        orderNo: manualForm.orderNo,
        customerDispatchNo: manualForm.customerDispatchNo,
        note: manualForm.note,
      };
      const intake = noDispatch
        ? await createIsnetNoDispatchSourceIntake(payload)
        : await createIsnetManualPdfSourceIntake({ ...payload, file: manualForm.pdfFile });
      const context = await resolveIsnetBusinessContext({
        mainCompanySlug: companySlug,
        companyId: manualForm.companyId,
        modelId: manualForm.modelId,
      });
      setPreparationModal(
        sourceModal(intake, selectedCompany, selectedModel, context, payload.quantity),
      );
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Manuel kaynak oluşturulamadı." });
    } finally {
      setBusy("");
    }
  }

  async function submitPreparation() {
    if (!preparationModal) return;
    const total = lineQuantityTotal(preparationModal.lines);
    if (preparationModal.fullClose && total !== numberValue(preparationModal.remainingQuantity)) {
      setNotice({
        tone: "error",
        text: `Tam kesimde toplam ${quantityText(total)}; kalan ${quantityText(preparationModal.remainingQuantity)} olmalıdır.`,
      });
      return;
    }
    if (!preparationModal.fullClose && total > numberValue(preparationModal.remainingQuantity)) {
      setNotice({ tone: "error", text: "Kısmi kesim kalan miktarı aşamaz." });
      return;
    }
    setBusy("submit-preparation");
    try {
      const payload = {
        mainCompanySlug: companySlug,
        previewApproved: true,
        fullClose: preparationModal.fullClose,
        issueDate: preparationModal.issueDate,
        issueTime: preparationModal.issueTime,
        showDateTime: preparationModal.showDateTime,
        showCarrier: preparationModal.showCarrier,
        note: preparationModal.note,
        carrier: preparationModal.carrier,
        lines: preparationModal.lines,
      };
      if (preparationModal.mode === "auto") {
        await createIsnetAutoFlowOutgoingDraft(preparationModal.flow.id, payload);
      } else {
        await createOutgoingDispatchFromSourceIntake(preparationModal.intake.id, payload);
      }
      setPreparationModal(null);
      setNotice({ tone: "success", text: "İşNet irsaliye taslağı kontrollü olarak oluşturuldu." });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İrsaliye taslağı oluşturulamadı." });
    } finally {
      setBusy("");
    }
  }

  async function registerOutgoingNo(flow) {
    const value = window.prompt("Gönderilmiş İşNet irsaliye numarasını girin:", flow.outgoingDocumentNo || "");
    if (!value) return;
    setBusy(`no-${flow.id}`);
    try {
      await setIsnetAutoFlowOutgoingNo(flow.id, value.trim());
      await load();
      setNotice({ tone: "success", text: "Gönderilmiş irsaliye numarası kaydedildi." });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İrsaliye numarası kaydedilemedi." });
    } finally {
      setBusy("");
    }
  }

  async function prepareInvoice(intake) {
    setBusy(`invoice-${intake.id}`);
    try {
      const result = await prepareInvoiceFromSourceIntake(intake.id, {
        mainCompanySlug: companySlug,
      });
      openModule?.("isnet", {
        tabKey: "irsaliyeden-faturaya",
        title: "Fatura Önizleme",
        actionContext: {
          sourceId: intake.id,
          invoiceDraft: result,
        },
      });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Fatura önizlemesi hazırlanamadı." });
    } finally {
      setBusy("");
    }
  }

  function updatePreparationLine(index, patch) {
    setPreparationModal((current) => {
      if (!current) return current;
      const lines = current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      );
      return { ...current, lines };
    });
  }

  if (loading) {
    return (
      <main className="isnet-page">
        <div className="isnet-empty"><LoaderCircle className="spin" /><strong>İşNet iş akışı yükleniyor</strong></div>
      </main>
    );
  }

  return (
    <main className="isnet-page">
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><Sparkles size={14} /> KONTROLLÜ İŞNET AKIŞI</span>
          <h1>İrsaliye ve Fatura İş Akışı</h1>
          <p>Portal, PDF/mail ve irsaliyesiz kaynaklar aynı hazırlama mantığıyla ilerler.</p>
        </div>
        <div className="isnet-hero__actions">
          <button type="button" className="isnet-btn isnet-btn--secondary" onClick={load}><RefreshCw size={15} /> Yenile</button>
          <button type="button" className="isnet-btn isnet-btn--primary" onClick={syncNow} disabled={busy === "sync"}><RefreshCw size={15} /> Tek Senkronizasyon</button>
        </div>
      </header>

      {notice ? <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>{notice.text}</div> : null}

      <section className="isnet-card">
        <div className="isnet-tabs">
          <button type="button" className={sourceMode === "portal" ? "active" : ""} onClick={() => setSourceMode("portal")}>İşNet Gelen İrsaliye</button>
          <button type="button" className={sourceMode === "manual" ? "active" : ""} onClick={() => setSourceMode("manual")}>PDF / Mail / İrsaliyesiz</button>
        </div>

        {sourceMode === "portal" ? (
          <>
            <div className="isnet-form-grid">
              <label>Başlangıç<input type="date" value={range.startDate} onChange={(event) => setRange({ ...range, startDate: event.target.value })} /></label>
              <label>Bitiş<input type="date" value={range.endDate} onChange={(event) => setRange({ ...range, endDate: event.target.value })} /></label>
              <label className="span-2">Gelen irsaliye
                <select value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)}>
                  <option value="">Belge seçin</option>
                  {portalDocuments.map((row) => <option key={row.id} value={row.id}>{row.documentNo || row.id} · {row.partnerName || row.companyName || "Firma"}</option>)}
                </select>
              </label>
            </div>
            <div className="isnet-actions"><button type="button" className="isnet-btn isnet-btn--primary" onClick={preparePortalDocument} disabled={!selectedDocumentId || busy === "prepare-portal"}><Truck size={15} /> Giden İrsaliye Hazırla</button></div>
          </>
        ) : (
          <>
            <div className="isnet-form-grid">
              <label>Firma<select value={manualForm.companyId} onChange={(event) => setManualForm({ ...manualForm, companyId: event.target.value })}><option value="">Firma seçin</option>{companies.map((row) => <option key={row.id} value={row.id}>{companyName(row)}</option>)}</select></label>
              <label>Model<select value={manualForm.modelId} onChange={(event) => setManualForm({ ...manualForm, modelId: event.target.value })}><option value="">Model seçin</option>{models.map((row) => <option key={row.id} value={row.id}>{modelName(row)}</option>)}</select></label>
              <label>Tarih<input type="date" value={manualForm.issueDate} onChange={(event) => setManualForm({ ...manualForm, issueDate: event.target.value })} /></label>
              <label>Adet<input type="number" min="0" step="0.001" value={manualForm.quantity} onChange={(event) => setManualForm({ ...manualForm, quantity: event.target.value })} /></label>
              <label>Sipariş no<input value={manualForm.orderNo} onChange={(event) => setManualForm({ ...manualForm, orderNo: event.target.value })} /></label>
              <label>Müşteri irsaliye no<input value={manualForm.customerDispatchNo} onChange={(event) => setManualForm({ ...manualForm, customerDispatchNo: event.target.value })} /></label>
              <label className="span-2">PDF<input type="file" accept="application/pdf" onChange={(event) => setManualForm({ ...manualForm, pdfFile: event.target.files?.[0] || null })} /></label>
              <label className="span-2">Not<textarea value={manualForm.note} onChange={(event) => setManualForm({ ...manualForm, note: event.target.value })} /></label>
            </div>
            <div className="isnet-actions"><button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => createManualSource(false)}><Upload size={15} /> PDF / Mail Kaynağı</button><button type="button" className="isnet-btn isnet-btn--primary" onClick={() => createManualSource(true)}><FileText size={15} /> İrsaliyesiz Hazırla</button></div>
          </>
        )}
      </section>

      <section className="isnet-card">
        <div className="isnet-section-head"><div><small>AKTİF İŞLER</small><h2>Kontrollü işlem kayıtları</h2></div></div>
        <div className="isnet-table-wrap">
          <table className="isnet-table"><thead><tr><th>Kaynak</th><th>Firma / Model</th><th>Kalan</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>
            {activeFlows.map((flow) => (
              <tr key={`flow-${flow.id}`}><td>{flow.sourceDocumentNo || flow.incomingDocumentNo || flow.id}</td><td><strong>{flow.partnerName || flow.companyName || "Firma"}</strong><br /><small>{flow.modelName || "Model bekliyor"}</small></td><td>{quantityText(flow.remainingQuantity ?? flow.sourceQuantity)}</td><td>{statusLabel(flow.status)}</td><td><button type="button" onClick={() => openFlowPreparation(flow)}>Hazırla / Kontrol</button>{flow.status === "OUTGOING_SEND_REQUIRED" ? <button type="button" onClick={() => registerOutgoingNo(flow)}>İrsaliye No Gir</button> : null}</td></tr>
            ))}
            {manualRows.map((intake) => (
              <tr key={`source-${intake.id}`}><td>{intake.customerDispatchNo || intake.id}</td><td><strong>{intake.companyName || "Firma"}</strong><br /><small>{intake.modelName || "Model"}</small></td><td>{quantityText(intake.capacity?.outgoingRemaining ?? intake.quantity)}</td><td>{statusLabel(intake.status)}</td><td><button type="button" onClick={() => prepareInvoice(intake)} disabled={!intake.outgoingDocumentNo}>Fatura Önizle</button></td></tr>
            ))}
          </tbody></table>
        </div>
      </section>

      {modelDecision ? (
        <div className="isnet-modal-backdrop"><div className="isnet-modal"><button type="button" className="isnet-modal-close" onClick={() => setModelDecision(null)}><X /></button><h2>Model Onayı</h2><select value={modelDecision.selectedModelId} onChange={(event) => setModelDecision({ ...modelDecision, selectedModelId: event.target.value })}><option value="">Model seçin</option>{modelDecision.suggestions.map((row) => <option key={row.id} value={row.id}>{modelName(row)}</option>)}</select><button type="button" className="isnet-btn isnet-btn--primary" onClick={assignModelAndContinue}>Modeli Bağla ve Devam Et</button></div></div>
      ) : null}

      {preparationModal ? (
        <div className="isnet-modal-backdrop"><div className="isnet-modal isnet-modal--wide"><button type="button" className="isnet-modal-close" onClick={() => setPreparationModal(null)}><X /></button><h2>Giden İrsaliye Hazırla</h2><div className="isnet-notice isnet-notice--info"><AlertTriangle size={16} /> Önizleme onayı verilmeden İşNet taslağı oluşturulmaz.</div><div className="isnet-form-grid"><label>Kesim türü<select value={preparationModal.fullClose ? "FULL" : "PARTIAL"} onChange={(event) => setPreparationModal({ ...preparationModal, fullClose: event.target.value === "FULL" })}><option value="FULL">Tam kesim</option><option value="PARTIAL">Kısmi kesim</option></select></label><label>Kalan adet<input value={preparationModal.remainingQuantity} disabled /></label><label>Tarih<input type="date" value={preparationModal.issueDate} onChange={(event) => setPreparationModal({ ...preparationModal, issueDate: event.target.value })} /></label><label>Saat<input type="time" step="1" value={preparationModal.issueTime} onChange={(event) => setPreparationModal({ ...preparationModal, issueTime: event.target.value })} /></label></div><div className="isnet-table-wrap"><table className="isnet-table"><thead><tr><th>Kalem</th><th>Açıklama</th><th>Adet</th></tr></thead><tbody>{preparationModal.lines.map((line, index) => <tr key={`${line.sourceLineId}-${index}`}><td>{lineLabel(line)}</td><td><input value={line.description || ""} disabled={!canEditDescription(line)} onChange={(event) => updatePreparationLine(index, { description: event.target.value })} /></td><td><input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => updatePreparationLine(index, { quantity: numberValue(event.target.value) })} /></td></tr>)}</tbody></table></div><div className="isnet-actions"><button type="button" className="isnet-btn isnet-btn--primary" onClick={submitPreparation} disabled={busy === "submit-preparation"}><CheckCircle2 size={15} /> Önizlemeyi Onayla ve Taslak Oluştur</button></div></div></div>
      ) : null}
    </main>
  );
}

