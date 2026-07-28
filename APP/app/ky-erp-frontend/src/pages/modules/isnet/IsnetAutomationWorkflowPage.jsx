import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  RefreshCw,
  ReceiptText,
  Send,
  Sparkles,
  Upload,
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
import "../IsnetPage.css";
import "./IsnetAutomationWorkflowPage.css";

const todayText = () => new Date().toISOString().slice(0, 10);
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

function statusLabel(value) {
  return {
    MODEL_REQUIRED: "Model onayı gerekiyor",
    OUTGOING_DRAFT_READY: "İrsaliye taslağı hazırlanıyor",
    OUTGOING_SEND_REQUIRED: "Taslağı İşNet'te gönderin",
    PRICE_REQUIRED: "Yalnız fiyat girilecek",
    INVOICE_DRAFT_READY: "Fatura taslağı hazır",
    COMPLETED: "Tamamlandı",
    ERROR: "Kontrol gerekiyor",
    MODEL_PENDING: "Model bekliyor",
    READY_FOR_PRODUCTION: "İrsaliye hazırlanabilir",
    READY_FOR_INVOICE: "Faturaya hazır",
    PARTIAL: "Kısmi işlem",
    NON_BILLABLE_SUPPLIER: "Tedarikçi kaydı",
  }[value] || value || "Hazır";
}

export default function IsnetAutomationWorkflowPage({
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
  const [dispatchCandidates, setDispatchCandidates] = useState({});
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
      const [documentResult, flowResult, intakeResult, companyResult, modelResult] =
        await Promise.all([
          getIsnetLocalDocuments({ ...range, page: 1, pageSize: 100 }),
          getIsnetAutoFlows(),
          getIsnetSourceIntakes({ ...range, page: 1, pageSize: 100 }),
          getFirmaKartlari(activeMainCompany),
          getDesenSimpleModels(activeMainCompany, { limit: 2000 }),
        ]);
      setPortalDocuments(rowsOf(documentResult));
      setFlows(rowsOf(flowResult));
      setManualRows(rowsOf(intakeResult));
      setCompanies(rowsOf(companyResult));
      setModels(rowsOf(modelResult));
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet iş akışı yüklenemedi." });
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
  }, [moduleActionContext?.nonce, moduleActionContext?.modelDecision, moduleActionContext?.notice, moduleActionContext?.noticeTone]);

  const incomingCustomerDispatches = useMemo(
    () => portalDocuments.filter((row) => {
      const companyType = String(row.companyType || "").toUpperCase();
      return (
        row.direction === "incoming" &&
        row.kind === "dispatch" &&
        (row.modelApplicable === true || ["CUSTOMER", "BOTH"].includes(companyType))
      );
    }),
    [portalDocuments],
  );

  const customerCompanies = useMemo(
    () => companies.filter((row) => {
      const type = String(row.companyType || row.firmaTuru || row.type || "").toUpperCase();
      return !type || ["CUSTOMER", "MUSTERI", "MÜŞTERİ", "BOTH", "GENEL"].includes(type);
    }),
    [companies],
  );

  const selectedCompany = customerCompanies.find((row) => row.id === manualForm.companyId) || null;
  const selectedModel = models.find((row) => row.id === manualForm.modelId) || null;

  function openInvoiceFlow(flow, values = {}) {
    const invoiceDraft = values.invoiceDraft || flow.invoiceSeed;
    const sourceId = values.sourceId || flow.outgoingSourceId;
    if (!invoiceDraft || !sourceId) {
      setNotice({ tone: "warning", text: "Faturaya çevrilecek gönderilmiş irsaliye henüz doğrulanmadı." });
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
      setNotice({
        tone: accounting.failed > 0 ? "warning" : "success",
        text: `${Number(result?.automation?.downloaded || 0)} yeni/eksik belge tamamlandı. ${Number(accounting.imported || 0)} tedarikçi faturası belge, cari ve KDV kayıtlarına işlendi${accounting.failed ? `; ${accounting.failed} kayıt kontrol bekliyor.` : "."}`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet senkronizasyonu tamamlanamadı." });
    } finally {
      setBusy("");
    }
  }

  async function preparePortalDocument(document) {
    setSelectedDocumentId(document.id);
    setModelDecision(null);
    setBusy(`prepare-${document.id}`);
    setNotice(null);
    try {
      const result = await prepareIsnetIncomingAutoFlow(document.sourceId, range);
      if (result.needsModel) {
        setModelDecision({ flow: result.flow, suggestions: result.suggestions || [] });
        setNotice({ tone: "warning", text: result.message });
      } else {
        setNotice({ tone: "success", text: result.message });
      }
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Otomatik irsaliye taslağı hazırlanamadı." });
    } finally {
      setBusy("");
    }
  }

  async function openPersistedModelDecision(flow) {
    if (!flow.incomingIntakeId) {
      setNotice({ tone: "error", text: "Model önerisi için kaynak işleme kaydı bulunamadı." });
      return;
    }
    setBusy(`suggestions-${flow.id}`);
    setNotice(null);
    try {
      const result = await getIsnetModelSuggestions(flow.incomingIntakeId, flow.modelName || "");
      setModelDecision({ flow, suggestions: result?.suggestions || [] });
      setNotice({ tone: "warning", text: "Firma ve adet hazır. Yalnız doğru modeli onaylayın." });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Model önerileri alınamadı." });
    } finally {
      setBusy("");
    }
  }

  async function approveModel(candidate) {
    if (!modelDecision?.flow?.id) return;
    setBusy(`model-${candidate.id}`);
    setNotice(null);
    try {
      const result = await assignIsnetAutoFlowModel(modelDecision.flow.id, {
        source: candidate.source,
        candidateId: candidate.id,
        confidence: candidate.score,
      });
      setModelDecision(null);
      setNotice({ tone: "success", text: result.message });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Model onayı tamamlanamadı." });
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
      setNotice({ tone: result.ready ? "success" : "warning", text: result.message });
      if (result.ready) {
        openInvoiceFlow(flow, result);
      }
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Gönderilmiş irsaliye bulunamadı." });
    } finally {
      setBusy("");
    }
  }

  async function selectSentDispatch(flow, candidate) {
    setBusy(`candidate-${flow.id}-${candidate.sourceId}`);
    setNotice(null);
    try {
      await setIsnetAutoFlowOutgoingNo(flow.id, candidate.documentNo);
      const result = await refreshIsnetAutoFlow(flow.id, range);
      setDispatchCandidates((current) => {
        const next = { ...current };
        delete next[flow.id];
        return next;
      });
      setNotice({ tone: result.ready ? "success" : "warning", text: result.message });
      if (result.ready) {
        openInvoiceFlow(
          { ...flow, outgoingDraftNo: candidate.documentNo },
          result,
        );
      }
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Gönderilmiş irsaliye seçilemedi." });
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
      setNotice({ tone: "warning", text: "Firma ve model seçimi zorunludur." });
      return;
    }
    const quantity = Number(manualForm.quantity || 0);
    if (!(quantity > 0)) {
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
        companyName: selectedCompany.name || selectedCompany.companyName,
        companyRole: "CUSTOMER",
        modelName: selectedModel.modelName || selectedModel.name,
        unit: "ADET",
      };
      const intake = sourceMode === "pdf"
        ? await createIsnetManualPdfSourceIntake(payload)
        : await createIsnetNoDispatchSourceIntake(payload);
      const draft = await createOutgoingDispatchFromSourceIntake(intake.id, { quantity });
      setNotice({ tone: "success", text: draft.message });
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
      setNotice({ tone: "error", text: error?.message || "İş akışı oluşturulamadı." });
    } finally {
      setBusy("");
    }
  }

  async function prepareManualInvoice(row) {
    setBusy(`manual-invoice-${row.id}`);
    setNotice(null);
    try {
      const result = await prepareInvoiceFromSourceIntake(row.id, range);
      setNotice({ tone: result.ready ? "success" : "warning", text: result.message });
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
      setNotice({ tone: "error", text: error?.message || "Fatura hazırlığı tamamlanamadı." });
    } finally {
      setBusy("");
    }
  }

  function renderFlowAction(flow) {
    if (flow.status === "MODEL_REQUIRED") {
      return <button type="button" className="isnet-btn isnet-btn--primary" disabled={busy === `suggestions-${flow.id}`} onClick={() => openPersistedModelDecision(flow)}>{busy === `suggestions-${flow.id}` ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />} Model Seç</button>;
    }
    if (flow.status === "PRICE_REQUIRED" && flow.invoiceSeed) {
      return <button type="button" className="isnet-btn isnet-btn--primary" onClick={() => openInvoiceFlow(flow)}><ReceiptText size={14} /> Fiyat Gir ve Faturala</button>;
    }
    if (flow.status === "INVOICE_DRAFT_READY" && flow.invoiceSeed && flow.invoiceRequestId) {
      return <button type="button" className="isnet-btn isnet-btn--primary" onClick={() => openInvoiceFlow(flow)}><ReceiptText size={14} /> Mevcut Fatura Taslağını Aç</button>;
    }
    if (flow.status === "COMPLETED") {
      return <span className="isnet-complete-label"><CheckCircle2 size={15} /> {flow.officialInvoiceNo || "İşlem tamamlandı"}</span>;
    }
    return <button type="button" className="isnet-btn isnet-btn--secondary" disabled={busy === `refresh-${flow.id}`} onClick={() => findSentDispatch(flow)}>{busy === `refresh-${flow.id}` ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} Gönderilmiş İrsaliyeyi Otomatik Bul</button>;
  }

  return (
    <main className="isnet-page isnet-auto-page" aria-busy={loading}>
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><Sparkles size={14} /> OTOMATİK İŞLEM ZİNCİRİ</span>
          <h1>İrsaliye ve Fatura İş Akışı</h1>
          <p>Kaynağı seçin. Adet ve satırlar otomatik taşınsın; son kontroller sizde kalsın.</p>
        </div>
        <div className="isnet-hero__actions">
          <label><small>Başlangıç</small><input type="date" value={range.startDate} onChange={(event) => setRange((current) => ({ ...current, startDate: event.target.value }))} /></label>
          <label><small>Bitiş</small><input type="date" value={range.endDate} onChange={(event) => setRange((current) => ({ ...current, endDate: event.target.value }))} /></label>
          <button className="isnet-btn isnet-btn--primary" type="button" onClick={synchronize} disabled={busy === "sync"}>{busy === "sync" ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} İşNet'i Senkronize Et</button>
        </div>
      </header>

      {notice && <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>{notice.text}</div>}

      <section className="isnet-card isnet-auto-guide"><div className="isnet-auto-steps">{["Kaynağı seç", "İrsaliye taslağı", "Siz kontrol edip gönderin", "Sistem gönderileni bulsun", "Fiyat girin", "Fatura taslağı ve son gönderim"].map((label, index) => <div key={label}><span>{index + 1}</span><strong>{label}</strong></div>)}</div></section>

      <section className="isnet-card">
        <div className="isnet-source-switch">
          <button type="button" className={sourceMode === "portal" ? "active" : ""} onClick={() => setSourceMode("portal")}><FileText size={16} /> İşNet Gelen İrsaliyesi</button>
          <button type="button" className={sourceMode === "pdf" ? "active" : ""} onClick={() => setSourceMode("pdf")}><Upload size={16} /> Mail / PDF</button>
          <button type="button" className={sourceMode === "manual" ? "active" : ""} onClick={() => setSourceMode("manual")}><ReceiptText size={16} /> İrsaliye Yok</button>
        </div>

        {sourceMode === "portal" ? <div className="isnet-auto-source"><div className="isnet-section-head"><div><small>NORMAL HIZLI AKIŞ</small><h2>Gelen müşteri irsaliyesini seçin</h2><p>Firma, satır ve adet İşNet belgesinden otomatik alınır.</p></div><button type="button" className="isnet-btn isnet-btn--secondary" onClick={load}><RefreshCw size={15} /> Yenile</button></div>
          {loading ? <div className="isnet-empty"><LoaderCircle className="spin" /><strong>Belgeler yükleniyor</strong></div> : incomingCustomerDispatches.length === 0 ? <div className="isnet-empty"><CheckCircle2 /><strong>İşlem bekleyen müşteri irsaliyesi yok</strong><p>Önce İşNet'i Senkronize Et düğmesini çalıştırın.</p></div> : <div className="isnet-table-wrap"><table className="isnet-table"><thead><tr><th>Tarih</th><th>İrsaliye</th><th>Müşteri</th><th>Model</th><th>Dosya</th><th>İşlem</th></tr></thead><tbody>{incomingCustomerDispatches.map((row) => <tr key={row.id} className={selectedDocumentId === row.id ? "isnet-row-selected" : ""}><td>{row.dateText}</td><td><strong>{row.documentNo}</strong></td><td>{row.partnerName}</td><td>{row.modelName || row.modelGuess || "Otomatik kontrol"}</td><td><span className={`isnet-badge isnet-badge--${row.pdfSaved && row.xmlSaved ? "green" : "warning"}`}>{row.pdfSaved && row.xmlSaved ? "PDF + XML hazır" : "Eksik dosya tamamlanacak"}</span></td><td><button type="button" className="isnet-btn isnet-btn--primary" disabled={busy === `prepare-${row.id}`} onClick={() => preparePortalDocument(row)}>{busy === `prepare-${row.id}` ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />} Otomatik Taslak Hazırla</button></td></tr>)}</tbody></table></div>}
        </div> : <div className="isnet-manual-grid"><div className="isnet-form-field"><label>Müşteri</label><select value={manualForm.companyId} onChange={(event) => patchManual({ companyId: event.target.value })}><option value="">Müşteri seçin</option>{customerCompanies.map((row) => <option key={row.id} value={row.id}>{row.name || row.companyName}</option>)}</select></div><div className="isnet-form-field"><label>Model</label><select value={manualForm.modelId} onChange={(event) => patchManual({ modelId: event.target.value })}><option value="">Model seçin</option>{models.map((row) => <option key={row.id} value={row.id}>{row.modelName || row.name}</option>)}</select></div><div className="isnet-form-field"><label>Tarih</label><input type="date" value={manualForm.issueDate} onChange={(event) => patchManual({ issueDate: event.target.value })} /></div><div className="isnet-form-field"><label>Adet</label><input type="number" min="1" value={manualForm.quantity} onChange={(event) => patchManual({ quantity: event.target.value })} /></div><div className="isnet-form-field"><label>Sipariş / Piyon</label><input value={manualForm.orderNo} onChange={(event) => patchManual({ orderNo: event.target.value })} /></div>{sourceMode === "pdf" && <div className="isnet-form-field"><label>İrsaliye PDF</label><input type="file" accept="application/pdf,.pdf" onChange={(event) => patchManual({ pdfFile: event.target.files?.[0] || null })} /></div>}<div className="isnet-form-field isnet-form-field--wide"><label>Not</label><input value={manualForm.note} onChange={(event) => patchManual({ note: event.target.value })} placeholder="Varsa açıklama" /></div><div className="isnet-manual-action"><button type="button" className="isnet-btn isnet-btn--primary" onClick={createManualSource} disabled={busy === "manual-create"}>{busy === "manual-create" ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />} İş Akışını ve Taslağı Oluştur</button></div></div>}
      </section>

      {modelDecision && <section className="isnet-card isnet-exception-card"><div className="isnet-section-head"><div><small>YALNIZ İSTİSNA</small><h2>Model eşleşmesini onaylayın</h2><p>Firma ve adet hazırdır; yalnız güvenli olmayan model eşleşmesi soruluyor.</p></div><AlertTriangle /></div><div className="isnet-model-choice-grid">{modelDecision.suggestions.length ? modelDecision.suggestions.map((candidate) => <button key={`${candidate.source}-${candidate.id}`} type="button" onClick={() => approveModel(candidate)} disabled={busy === `model-${candidate.id}`}><strong>{candidate.name}</strong><small>{candidate.code || "Kod yok"} · %{candidate.score} eşleşme</small></button>) : <div className="isnet-empty"><AlertTriangle /><strong>Otomatik model bulunamadı</strong><p>Desen Havuzu'nda model açıldıktan sonra tekrar deneyin.</p></div>}</div></section>}

      <section className="isnet-card"><div className="isnet-section-head"><div><small>AKTİF İŞLER</small><h2>Kontrol ve devam işlemleri</h2><p>Aynı kaynak için ikinci irsaliye veya fatura taslağı oluşturulmaz; işlem kaldığı adımdan devam eder.</p></div></div>
        {flows.length === 0 ? <div className="isnet-empty"><CheckCircle2 /><strong>Aktif otomatik iş akışı yok</strong></div> : <div className="isnet-table-wrap"><table className="isnet-table"><thead><tr><th>Kaynak</th><th>Müşteri / Model</th><th>Adet</th><th>Giden İrsaliye</th><th>Durum</th><th>Devam</th></tr></thead><tbody>{flows.map((flow) => <tr key={flow.id}><td><strong>{flow.incomingDocumentNo || flow.incomingSourceId}</strong><small>{flow.issueDate}</small></td><td>{flow.companyName}<small>{flow.modelName || "Model bekliyor"}</small></td><td>{flow.quantity}</td><td>{flow.outgoingDraftNo || "Gönderimden sonra otomatik bulunacak"}</td><td><span className={`isnet-badge isnet-badge--${flow.status === "COMPLETED" ? "green" : "blue"}`}>{statusLabel(flow.status)}</span></td><td>{renderFlowAction(flow)}{dispatchCandidates[flow.id]?.length > 0 && <div className="isnet-dispatch-candidates"><small>Doğru gönderilmiş irsaliyeyi seçin:</small>{dispatchCandidates[flow.id].map((candidate) => <button key={candidate.sourceId} type="button" disabled={busy === `candidate-${flow.id}-${candidate.sourceId}`} onClick={() => selectSentDispatch(flow, candidate)}><strong>{candidate.documentNo}</strong><span>{candidate.partnerName} · {candidate.modelName || "Model"} · {candidate.quantity} adet · {candidate.date}</span></button>)}</div>}</td></tr>)}</tbody></table></div>}
      </section>

      {manualRows.length > 0 && <section className="isnet-card"><div className="isnet-section-head"><div><small>PDF / MANUEL KAYNAKLAR</small><h2>İrsaliyesiz veya yüklenen işler</h2></div></div><div className="isnet-table-wrap"><table className="isnet-table"><thead><tr><th>Tarih</th><th>Müşteri</th><th>Model</th><th>Adet</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{manualRows.map((row) => { const completedDraft = (row.outgoingDispatchDrafts || []).some((item) => item.status === "COMPLETED"); return <tr key={row.id}><td>{row.issueDate}</td><td>{row.companyName}</td><td>{row.modelName}</td><td>{row.quantity}</td><td>{statusLabel(row.workflowStatus)}</td><td><button type="button" className="isnet-btn isnet-btn--secondary" disabled={!completedDraft || busy === `manual-invoice-${row.id}`} onClick={() => prepareManualInvoice(row)}><Send size={14} /> Gönderilmiş İrsaliyeyi Bul ve Faturala</button></td></tr>; })}</tbody></table></div></section>}
    </main>
  );
}
