import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  LoaderCircle,
  Mail,
  RefreshCw,
  Send,
  Settings2,
} from "lucide-react";
import {
  createIsnetInvoiceFromDispatch,
  finalApproveIsnetInvoiceDraft,
  getIsnetInvoiceDraftStatus,
  retryIsnetInvoiceClosure,
  submitIsnetOfficialInvoice,
} from "../../../services/isnetApi";
import { resolveIsnetBusinessContext } from "../../../services/isnetBusinessSettingsApi";
import { updateIsnetAutoFlowInvoiceState } from "../../../services/isnetAutoFlowApi";
import "../IsnetPage.css";
import "./IsnetPreparedInvoicePage.css";

const todayText = () => new Date().toISOString().slice(0, 10);

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return numberValue(value).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });
}

function quantity(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(
    numberValue(value),
  );
}

function normalize(value) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryOf(line = {}) {
  const explicit = String(line.category || "").toUpperCase();
  if (["MAIN", "TEST_NUMUNESI", "BASKI_SAKATI", "KUMAS_SAKATI"].includes(explicit)) {
    return explicit;
  }
  const text = normalize(line.productName || line.description);
  if (text.includes("TEST NUMUNESI")) return "TEST_NUMUNESI";
  if (text.includes("BASKI SAKATI")) return "BASKI_SAKATI";
  if (text.includes("KUMAS SAKATI")) return "KUMAS_SAKATI";
  return "MAIN";
}

function statusText(value) {
  return {
    CREATING: "Taslak oluşturuluyor",
    VERIFY_PENDING: "Portal doğrulaması bekliyor",
    VERIFY_FAILED: "Doğrulama farkı var",
    VERIFIED: "Taslak doğrulandı",
    APPROVED: "Son kullanıcı onayı verildi",
    SUBMITTING: "Resmî gönderim sürüyor",
    SENT: "Fatura İşNet'e gönderildi",
    FILE_DOWNLOAD_PENDING: "PDF/XML indiriliyor",
    ACCOUNTING_PENDING: "Muhasebe kapanışı bekliyor",
    COMPLETED: "Tamamlandı",
  }[value] || value || "Fiyat bekliyor";
}

function normalizeSeed(seed = {}) {
  return {
    ...seed,
    sourceId: String(seed.sourceId || ""),
    recipientId: seed.recipientId || seed.recipient?.id || "",
    recipientName: seed.recipientName || seed.recipient?.name || "",
    localCompanyId: seed.localCompanyId || seed.recipient?.localCompanyId || "",
    invoiceDate: seed.invoiceDate || todayText(),
    dueDate: seed.dueDate || seed.invoiceDate || todayText(),
    departmentNo: seed.departmentNo || "",
    previewApproved: false,
    confirmationText: "",
    notes: Array.isArray(seed.notes) ? seed.notes : [],
    lines: (Array.isArray(seed.lines) ? seed.lines : []).map((line, index) => ({
      ...line,
      sourceLineId: String(line.sourceLineId || line.id || line.lineNo || index + 1),
      lineNo: line.lineNo || index + 1,
      category: categoryOf(line),
      productName: line.productName || line.description || seed.modelName || "Baskı hizmeti",
      description: line.description || line.productName || seed.modelName || "",
      quantity: numberValue(line.quantity),
      unitPrice: numberValue(line.unitPrice),
      vatRate: line.vatRate === 0 ? 0 : numberValue(line.vatRate) || 20,
      measureUnitId: line.measureUnitId || 67,
      invoiceAction: "PENDING",
    })),
  };
}

function applyRules(lines, context, price, vatRate) {
  const rules = context?.nonBillableRules || {};
  return lines.map((line) => {
    const category = categoryOf(line);
    if (category === "BASKI_SAKATI" || category === "KUMAS_SAKATI") {
      return {
        ...line,
        category,
        unitPrice: 0,
        vatRate: 0,
        invoiceAction: "EXCLUDED",
        invoiceReason: "Sakat kalemi irsaliyede kalır, faturaya alınmaz.",
      };
    }
    if (category === "TEST_NUMUNESI") {
      const rule = rules.TEST_NUMUNESI || {};
      const behavior = String(rule.invoiceBehavior || "ZERO_PRICE_EXEMPT").toUpperCase();
      if (behavior === "DO_NOT_INVOICE") {
        return {
          ...line,
          category,
          unitPrice: 0,
          vatRate: 0,
          invoiceAction: "EXCLUDED",
          invoiceReason: "Ayar kuralına göre faturaya alınmaz.",
        };
      }
      if (behavior === "ZERO_PRICE_EXEMPT") {
        return {
          ...line,
          category,
          unitPrice: 0,
          vatRate: 0,
          invoiceAction: "EXEMPT",
          exemptionCode: rule.exemptionCode || "",
          exemptionReason: rule.exemptionReason || "",
          invoiceReason: rule.exemptionCode && rule.exemptionReason
            ? `${rule.exemptionCode} · ${rule.exemptionReason}`
            : "Muafiyet kodu ve açıklaması eksik.",
        };
      }
      return {
        ...line,
        category,
        unitPrice: numberValue(price),
        vatRate: numberValue(vatRate),
        invoiceAction: "BILLABLE",
        invoiceReason: "Ayar kuralına göre normal fiyatla faturalanır.",
      };
    }
    return {
      ...line,
      category: "MAIN",
      unitPrice: numberValue(price),
      vatRate: numberValue(vatRate),
      invoiceAction: "BILLABLE",
      invoiceReason: "Ana ürün / baskı hizmeti",
    };
  });
}

export default function IsnetPreparedInvoicePage({
  moduleActionContext,
  openModule,
  activeMainCompany,
}) {
  const seed = moduleActionContext?.invoiceDraft || null;
  const sourceId = String(moduleActionContext?.sourceId || seed?.sourceId || "");
  const autoFlowId = String(moduleActionContext?.autoFlowId || "");
  const existingRequestId = String(moduleActionContext?.existingRequestId || "");
  const [form, setForm] = useState(() => normalizeSeed({ ...seed, sourceId }));
  const [unitPrice, setUnitPrice] = useState(() => numberValue(seed?.lines?.find((line) => categoryOf(line) === "MAIN")?.unitPrice) || "");
  const [vatRate, setVatRate] = useState(() => seed?.lines?.find((line) => categoryOf(line) === "MAIN")?.vatRate ?? 20);
  const [businessContext, setBusinessContext] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [draftResult, setDraftResult] = useState(null);
  const [officialStatus, setOfficialStatus] = useState(null);

  useEffect(() => {
    if (!seed || !sourceId) return;
    const next = normalizeSeed({ ...seed, sourceId });
    const initialPrice = numberValue(next.lines.find((line) => categoryOf(line) === "MAIN")?.unitPrice) || "";
    const initialVat = next.lines.find((line) => categoryOf(line) === "MAIN")?.vatRate ?? 20;
    setForm(next);
    setUnitPrice(initialPrice);
    setVatRate(initialVat);
    setBusinessContext(null);
    setOfficialStatus(null);
    setNotice(null);

    void resolveIsnetBusinessContext(activeMainCompany, {
      companyId: next.localCompanyId,
      companyName: next.recipientName,
      modelId: next.modelId || "",
      modelName: next.modelName || "",
    })
      .then((context) => {
        setBusinessContext(context);
        setForm((current) => ({
          ...current,
          departmentNo: context?.department?.departmentCode || current.departmentNo || "",
          lines: applyRules(current.lines, context, initialPrice, initialVat),
        }));
      })
      .catch((error) => {
        setNotice({ tone: "warning", text: error?.message || "Departman ve fatura kuralı alınamadı." });
      });

    if (!existingRequestId) {
      setDraftResult(null);
      return;
    }
    const existingDraft = {
      requestId: existingRequestId,
      draftNo: moduleActionContext?.existingDraftNo || "",
      draftVersion: moduleActionContext?.existingDraftVersion || "",
      verified: true,
      status: "INVOICE_DRAFT_READY",
      verification: { differences: [] },
    };
    setDraftResult(existingDraft);
    void getIsnetInvoiceDraftStatus(existingRequestId)
      .then(async (status) => {
        setOfficialStatus(status);
        if (status?.status === "COMPLETED" && autoFlowId) {
          await updateIsnetAutoFlowInvoiceState(autoFlowId, {
            status: "COMPLETED",
            requestId: existingRequestId,
            draftNo: status.draftNo || existingDraft.draftNo,
            draftVersion: status.draftVersion || existingDraft.draftVersion,
            officialInvoiceNo: status.officialInvoiceNumber || "",
          });
        }
      })
      .catch((error) => {
        setNotice({ tone: "warning", text: error?.message || "Mevcut fatura taslağı durumu alınamadı." });
      });
  }, [
    activeMainCompany,
    autoFlowId,
    existingRequestId,
    moduleActionContext?.existingDraftNo,
    moduleActionContext?.existingDraftVersion,
    moduleActionContext?.nonce,
    seed,
    sourceId,
  ]);

  const invoiceLines = useMemo(
    () => form.lines.filter((line) => line.invoiceAction !== "EXCLUDED"),
    [form.lines],
  );
  const excludedLines = useMemo(
    () => form.lines.filter((line) => line.invoiceAction === "EXCLUDED"),
    [form.lines],
  );
  const totals = useMemo(() => {
    const subtotal = invoiceLines.reduce(
      (sum, line) => sum + numberValue(line.quantity) * numberValue(line.unitPrice),
      0,
    );
    const vat = invoiceLines.reduce(
      (sum, line) => sum + numberValue(line.quantity) * numberValue(line.unitPrice) * (numberValue(line.vatRate) / 100),
      0,
    );
    return { subtotal, vat, total: subtotal + vat };
  }, [invoiceLines]);
  const sourceQuantity = useMemo(
    () => form.lines.reduce((sum, line) => sum + numberValue(line.quantity), 0),
    [form.lines],
  );
  const invoiceQuantity = useMemo(
    () => invoiceLines.reduce((sum, line) => sum + numberValue(line.quantity), 0),
    [invoiceLines],
  );
  const exemptionMissing = form.lines.some(
    (line) => line.invoiceAction === "EXEMPT" && (!line.exemptionCode || !line.exemptionReason),
  );
  const priceMissing = form.lines.some(
    (line) => line.invoiceAction === "BILLABLE" && numberValue(line.unitPrice) <= 0,
  );

  function patch(values) {
    setNotice(null);
    setForm((current) => ({
      ...current,
      ...values,
      previewApproved: Object.prototype.hasOwnProperty.call(values, "previewApproved")
        ? values.previewApproved
        : false,
    }));
  }

  function applyPrice(value) {
    setUnitPrice(value);
    setNotice(null);
    setForm((current) => ({
      ...current,
      previewApproved: false,
      lines: applyRules(current.lines, businessContext, value, vatRate),
    }));
  }

  function applyVat(value) {
    setVatRate(value);
    setNotice(null);
    setForm((current) => ({
      ...current,
      previewApproved: false,
      lines: applyRules(current.lines, businessContext, unitPrice, value),
    }));
  }

  async function updateFlowState(payload) {
    if (!autoFlowId) return null;
    return updateIsnetAutoFlowInvoiceState(autoFlowId, payload);
  }

  async function createDraft() {
    if (!sourceId || !form.recipientId) {
      setNotice({ tone: "error", text: "Gönderilmiş irsaliye veya İşNet alıcısı doğrulanamadı." });
      return;
    }
    if (!invoiceLines.length) {
      setNotice({ tone: "warning", text: "Faturaya aktarılacak ürün satırı bulunamadı." });
      return;
    }
    if (priceMissing) {
      setNotice({ tone: "warning", text: "Ana ürün için birim fiyat sıfırdan büyük olmalıdır." });
      return;
    }
    if (exemptionMissing) {
      setNotice({ tone: "warning", text: "Test numunesi muafiyet kodu ve açıklaması Ayarlar ekranında tamamlanmalıdır." });
      return;
    }
    if (!form.previewApproved) {
      setNotice({ tone: "warning", text: "Fatura önizlemesini onaylamadan İşNet taslağı oluşturulamaz." });
      return;
    }
    if (!window.confirm(`${form.dispatchNo} irsaliyesi ${money(totals.total)} toplamla fatura taslağına çevrilsin mi?`)) return;

    setBusy("draft");
    setNotice(null);
    try {
      const result = await createIsnetInvoiceFromDispatch(sourceId, {
        ...form,
        lines: form.lines,
        sourceId,
        modelId: form.modelId || seed?.modelId || "",
        modelName: form.modelName || seed?.modelName || "",
        unitPrice: numberValue(unitPrice),
        vatRate: numberValue(vatRate),
        previewApproved: true,
      });
      setDraftResult(result);
      if (!result?.requestId) throw new Error("İşNet taslak işlem kimliği dönmedi.");
      const status = await getIsnetInvoiceDraftStatus(result.requestId);
      setOfficialStatus(status);
      const verified = result.verified === true && !result.verification?.differences?.length;
      let flowWarning = "";
      if (autoFlowId) {
        try {
          await updateFlowState({
            status: "INVOICE_DRAFT_READY",
            requestId: result.requestId,
            draftNo: result.draftNo || "",
            draftVersion: result.draftVersion || status?.draftVersion || "",
          });
        } catch (error) {
          flowWarning = ` KY ERP iş akışı güncellenemedi: ${error?.message || "bilinmeyen hata"}.`;
        }
      }
      setNotice({
        tone: verified && !flowWarning ? "success" : flowWarning ? "warning" : "error",
        text: verified
          ? `${result.draftNo || "Fatura taslağı"} İşNet'te oluşturuldu ve satırlar geri okunarak doğrulandı. ${result.mailRecipientCount || 0} Outlook alıcısı hazırlandı.${flowWarning}`
          : result.message || "Taslak oluşturuldu ancak portal doğrulaması tamamlanamadı.",
      });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Fatura taslağı oluşturulamadı." });
    } finally {
      setBusy("");
    }
  }

  async function refreshStatus() {
    if (!draftResult?.requestId) return;
    setBusy("status");
    try {
      const status = await getIsnetInvoiceDraftStatus(draftResult.requestId);
      setOfficialStatus(status);
      if (status.status === "COMPLETED") {
        await updateFlowState({
          status: "COMPLETED",
          requestId: draftResult.requestId,
          draftNo: status.draftNo || draftResult.draftNo || "",
          draftVersion: status.draftVersion || draftResult.draftVersion || "",
          officialInvoiceNo: status.officialInvoiceNumber || "",
        });
      }
      setNotice({ tone: status.status === "COMPLETED" ? "success" : "info", text: `Fatura durumu: ${statusText(status.status)}.` });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Fatura durumu alınamadı." });
    } finally {
      setBusy("");
    }
  }

  async function submitOfficial() {
    const requestId = draftResult?.requestId;
    const draftVersion = draftResult?.draftVersion || officialStatus?.draftVersion;
    if (!requestId || !draftVersion) {
      setNotice({ tone: "error", text: "Doğrulanmış İşNet taslağı bulunamadı." });
      return;
    }
    if (form.confirmationText !== "FATURAYI GÖNDER") {
      setNotice({ tone: "warning", text: "Son onay alanına FATURAYI GÖNDER yazılmalıdır." });
      return;
    }
    if (!window.confirm("Bu işlem resmî faturayı İşNet üzerinden gönderecek. Devam edilsin mi?")) return;

    setBusy("submit");
    setNotice(null);
    try {
      await finalApproveIsnetInvoiceDraft(requestId, {
        approved: true,
        confirmationText: form.confirmationText,
        expectedVersion: draftVersion,
      });
      await submitIsnetOfficialInvoice(requestId);
      const status = await getIsnetInvoiceDraftStatus(requestId);
      setOfficialStatus(status);
      if (status.status === "COMPLETED") {
        await updateFlowState({
          status: "COMPLETED",
          requestId,
          draftNo: status.draftNo || draftResult.draftNo || "",
          draftVersion: status.draftVersion || draftVersion,
          officialInvoiceNo: status.officialInvoiceNumber || "",
        });
      }
      setNotice({
        tone: status.status === "COMPLETED" ? "success" : "warning",
        text: status.status === "COMPLETED"
          ? `Resmî fatura gönderildi; PDF/XML, muhasebe, cari, KDV ve Outlook paketi tamamlandı: ${status.officialInvoiceNumber || ""}`
          : `Resmî gönderim ${statusText(status.status)} aşamasında. Aynı fatura ikinci kez gönderilmeyecek.`,
      });
    } catch (error) {
      let recoveredStatus = null;
      try {
        recoveredStatus = await getIsnetInvoiceDraftStatus(requestId);
        setOfficialStatus(recoveredStatus);
      } catch {
        // Asıl gönderim hatası korunur.
      }
      if (recoveredStatus && ["SENT", "FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING", "COMPLETED"].includes(recoveredStatus.status)) {
        setNotice({
          tone: recoveredStatus.status === "COMPLETED" ? "success" : "warning",
          text: `İşNet resmî gönderim kaydı oluştu. Yerel kapanış durumu: ${statusText(recoveredStatus.status)}. İkinci gönderim yapılmayacak.`,
        });
      } else {
        setNotice({ tone: "error", text: error?.message || "Resmî fatura gönderimi tamamlanamadı." });
      }
    } finally {
      setBusy("");
    }
  }

  async function retryClosure() {
    if (!draftResult?.requestId) return;
    setBusy("closure");
    setNotice(null);
    try {
      const status = await retryIsnetInvoiceClosure(draftResult.requestId);
      setOfficialStatus(status);
      if (status.status === "COMPLETED") {
        await updateFlowState({
          status: "COMPLETED",
          requestId: draftResult.requestId,
          draftNo: status.draftNo || draftResult.draftNo || "",
          draftVersion: status.draftVersion || draftResult.draftVersion || "",
          officialInvoiceNo: status.officialInvoiceNumber || "",
        });
      }
      setNotice({
        tone: status.status === "COMPLETED" ? "success" : "warning",
        text: status.status === "COMPLETED"
          ? "PDF/XML arşivi, muhasebe, cari, KDV ve Outlook paketi tamamlandı."
          : `Kapanış ${statusText(status.status)} aşamasında.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Fatura kapanışı yeniden denenemedi." });
    } finally {
      setBusy("");
    }
  }

  if (!seed || !sourceId) {
    return (
      <main className="isnet-page">
        <section className="isnet-card">
          <div className="isnet-empty">
            <AlertTriangle size={24} />
            <strong>Faturaya çevrilecek gönderilmiş irsaliye seçilmedi</strong>
            <p>İrsaliye ve Fatura İş Akışı ekranından gönderilmiş irsaliyeyi bulun.</p>
            <button type="button" className="isnet-btn isnet-btn--primary" onClick={() => openModule?.("isnet", { tabKey: "is-akisi" })}>İş Akışına Git</button>
          </div>
        </section>
      </main>
    );
  }

  const verified = Boolean(
    draftResult?.requestId &&
      draftResult?.verified === true &&
      !(draftResult?.verification?.differences || []).length,
  );
  const status = officialStatus?.status || draftResult?.status || (verified ? "VERIFIED" : "");
  const closurePending = ["SENT", "FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING"].includes(status);

  return (
    <main className="isnet-page isnet-invoice-prep-page">
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><FileCheck2 size={14} /> SON İKİ ADIM</span>
          <h1>{form.dispatchNo || moduleActionContext?.documentNo}</h1>
          <p>İrsaliye satırları ve adetler kilitli. Ana ürün için yalnız fiyatı girin; test/sakat kuralları otomatik uygulansın.</p>
        </div>
        <div className="isnet-hero__actions">
          <span className="isnet-badge isnet-badge--blue">{statusText(status)}</span>
          {draftResult?.requestId ? <button type="button" className="isnet-btn isnet-btn--secondary" onClick={refreshStatus} disabled={busy === "status"}><RefreshCw size={15} /> Durumu Yenile</button> : null}
        </div>
      </header>

      {notice ? <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>{notice.text}</div> : null}

      <section className="isnet-invoice-summary-grid">
        <article><span>Kaynak irsaliye adedi</span><b>{quantity(sourceQuantity)}</b></article>
        <article><span>Faturaya giren adet</span><b>{quantity(invoiceQuantity)}</b></article>
        <article><span>Faturaya alınmayan</span><b>{quantity(sourceQuantity - invoiceQuantity)}</b></article>
        <article><span>Genel toplam</span><b>{money(totals.total)}</b></article>
      </section>

      <section className="isnet-card">
        <div className="isnet-section-head">
          <div><small>OTOMATİK GELEN BİLGİLER</small><h2>{form.recipientName || "İşNet alıcısı"}</h2><p>Model: {form.modelName || "-"} · Departman: {businessContext?.department?.departmentCode || form.departmentNo || "tanımsız"} · Sorumlu: {businessContext?.responsible?.fullName || "tanımsız"}</p></div>
          <div className="isnet-recipient-summary"><Mail size={16} /><b>{businessContext?.combinedRecipients?.length || 0}</b><span>Outlook alıcısı</span></div>
        </div>
        <div className="isnet-form-grid">
          <label>Ana ürün birim fiyatı<input type="number" min="0.01" step="0.01" value={unitPrice} onChange={(event) => applyPrice(event.target.value)} disabled={Boolean(draftResult)} autoFocus /></label>
          <label>KDV %<input type="number" min="0" max="100" step="1" value={vatRate} onChange={(event) => applyVat(event.target.value)} disabled={Boolean(draftResult)} /></label>
          <label>Fatura tarihi<input type="date" value={form.invoiceDate} onChange={(event) => patch({ invoiceDate: event.target.value })} disabled={Boolean(draftResult)} /></label>
          <label>Son ödeme tarihi<input type="date" value={form.dueDate} onChange={(event) => patch({ dueDate: event.target.value })} disabled={Boolean(draftResult)} /></label>
        </div>
        {(!businessContext?.department || !businessContext?.responsible || !(businessContext?.combinedRecipients || []).length) ? (
          <div className="isnet-inline-warning"><AlertTriangle size={17} /><span>Departman, sorumlu veya mail alıcısı eksik. Fatura taslağı oluşturulabilir fakat Outlook gönderimi için kayıt merkezi tamamlanmalıdır.</span><button type="button" onClick={() => openModule?.("isnet", { tabKey: "ayarlar" })}><Settings2 size={15} /> Ayarlara Git</button></div>
        ) : null}
      </section>

      <section className="isnet-card">
        <div className="isnet-section-head"><div><small>KİLİTLİ İRSALİYE SATIRLARI</small><h2>Fatura önizlemesi</h2><p>Ürün ve adetler değiştirilemez; sakat ve muafiyet kuralları görünür biçimde uygulanır.</p></div></div>
        <div className="isnet-table-wrap"><table className="isnet-table"><thead><tr><th>#</th><th>Kalem</th><th>İrsaliye adedi</th><th>Fatura davranışı</th><th>Birim fiyat</th><th>KDV</th><th>Toplam</th></tr></thead><tbody>{form.lines.map((line, index) => {
          const lineSubtotal = numberValue(line.quantity) * numberValue(line.unitPrice);
          const lineVat = lineSubtotal * (numberValue(line.vatRate) / 100);
          return <tr key={`${line.sourceLineId}-${index}`} className={line.invoiceAction === "EXCLUDED" ? "isnet-line-excluded" : ""}><td>{index + 1}</td><td><strong>{line.productName}</strong><small>{line.description}</small></td><td>{quantity(line.quantity)} ADET</td><td><span className={`isnet-action-badge ${String(line.invoiceAction || "pending").toLowerCase()}`}>{line.invoiceAction === "BILLABLE" ? "Faturalanacak" : line.invoiceAction === "EXEMPT" ? "0 TL muafiyetli" : line.invoiceAction === "EXCLUDED" ? "Faturaya alınmaz" : "Kural yükleniyor"}</span><small>{line.invoiceReason}</small></td><td>{money(line.unitPrice)}</td><td>%{numberValue(line.vatRate)}<small>{line.exemptionCode ? `${line.exemptionCode} · ${line.exemptionReason}` : ""}</small></td><td>{money(lineSubtotal + lineVat)}</td></tr>;
        })}</tbody></table></div>
        {exemptionMissing ? <div className="isnet-inline-warning"><AlertTriangle size={17} /><span>Test numunesi için resmî muafiyet kodu ve açıklaması eksik. Sistem değer uydurmadığı için taslak engellendi.</span><button type="button" onClick={() => openModule?.("isnet", { tabKey: "ayarlar" })}><Settings2 size={15} /> Muafiyeti Kaydet</button></div> : null}
        {excludedLines.length ? <div className="isnet-excluded-summary"><strong>Faturaya alınmayacak irsaliye kalemleri</strong><span>{excludedLines.map((line) => `${line.productName}: ${quantity(line.quantity)} adet`).join(" · ")}</span></div> : null}
        <div className="isnet-invoice-totals"><span>Matrah <b>{money(totals.subtotal)}</b></span><span>KDV <b>{money(totals.vat)}</b></span><span>Genel Toplam <b>{money(totals.total)}</b></span></div>
      </section>

      {!draftResult ? <section className="isnet-card isnet-approval-card"><label className="isnet-preview-check"><input type="checkbox" checked={form.previewApproved} onChange={(event) => patch({ previewApproved: event.target.checked })} /><span>İrsaliye kalemlerini, adetleri, fiyatı, test/sakat davranışını ve toplamı kontrol ettim.</span></label><button type="button" className="isnet-btn isnet-btn--primary" onClick={createDraft} disabled={busy === "draft" || priceMissing || exemptionMissing || !form.previewApproved}>{busy === "draft" ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />} Fatura Taslağını Oluştur ve Doğrula</button></section> : null}

      {draftResult ? <section className="isnet-card"><div className="isnet-section-head"><div><small>İŞNET GERİ OKUMA</small><h2>{draftResult.draftNo || officialStatus?.draftNo || "Fatura taslağı"}</h2><p>{verified ? "Taslak satırları, adetler, fiyatlar ve toplamlar portal üzerinden doğrulandı." : "Doğrulama farkı olduğu için resmî gönderim kapalıdır."}</p></div><span className={`isnet-badge isnet-badge--${verified ? "green" : "warning"}`}>{verified ? "DOĞRULANDI" : "KONTROL GEREKİYOR"}</span></div>{(draftResult.verification?.differences || []).length ? <div className="isnet-diff-list">{draftResult.verification.differences.map((item, index) => <div key={`${item.field}-${index}`}><strong>{item.field}</strong><span>Beklenen: {String(item.expected ?? "-")}</span><span>Portal: {String(item.actual ?? "-")}</span></div>)}</div> : null}{verified && !["COMPLETED"].includes(status) ? <div className="isnet-official-submit"><label>Son onay metni<input value={form.confirmationText} onChange={(event) => patch({ confirmationText: event.target.value.toLocaleUpperCase("tr-TR") })} placeholder="FATURAYI GÖNDER" /></label><button type="button" className="isnet-btn isnet-btn--danger" disabled={busy === "submit" || form.confirmationText !== "FATURAYI GÖNDER"} onClick={submitOfficial}>{busy === "submit" ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Resmî Faturayı Gönder</button></div> : null}{closurePending ? <button type="button" className="isnet-btn isnet-btn--secondary" onClick={retryClosure} disabled={busy === "closure"}><RefreshCw size={15} /> PDF/XML ve Muhasebe Kapanışını Tamamla</button> : null}{status === "COMPLETED" ? <div className="isnet-complete-box"><CheckCircle2 size={22} /><div><strong>İşlem tamamlandı</strong><p>{officialStatus?.officialInvoiceNumber || draftResult.draftNo} · PDF/XML arşivi · muhasebe · cari · KDV · Outlook paketi</p></div></div> : null}</section> : null}
    </main>
  );
}
