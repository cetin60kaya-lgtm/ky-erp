import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  createIsnetInvoiceFromDispatch,
  finalApproveIsnetInvoiceDraft,
  getIsnetInvoiceDraftStatus,
  retryIsnetInvoiceClosure,
  submitIsnetOfficialInvoice,
} from "../../../services/isnetApi";
import "../IsnetPage.css";

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
  }[value] || value || "Hazırlanıyor";
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
    departments: Array.isArray(seed.departments) ? seed.departments : [],
    contacts: Array.isArray(seed.contacts) ? seed.contacts : [],
    lines: (Array.isArray(seed.lines) ? seed.lines : []).map((line, index) => ({
      ...line,
      lineNo: line.lineNo || index + 1,
      productName: line.productName || line.description || seed.modelName || "Baskı hizmeti",
      description: line.description || line.productName || seed.modelName || "",
      quantity: numberValue(line.quantity) || 1,
      unitPrice: numberValue(line.unitPrice) || "",
      vatRate: line.vatRate === 0 ? 0 : numberValue(line.vatRate) || 20,
      measureUnitId: line.measureUnitId || 67,
    })),
  };
}

export default function IsnetPreparedInvoicePage({
  moduleActionContext,
  openModule,
}) {
  const seed = moduleActionContext?.invoiceDraft || null;
  const sourceId = String(moduleActionContext?.sourceId || seed?.sourceId || "");
  const [form, setForm] = useState(() => normalizeSeed({ ...seed, sourceId }));
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [draftResult, setDraftResult] = useState(null);
  const [officialStatus, setOfficialStatus] = useState(null);

  useEffect(() => {
    if (!seed || !sourceId) return;
    setForm(normalizeSeed({ ...seed, sourceId }));
    setDraftResult(null);
    setOfficialStatus(null);
    setNotice(null);
  }, [moduleActionContext?.nonce, seed, sourceId]);

  const totals = useMemo(() => {
    const subtotal = form.lines.reduce(
      (sum, line) => sum + numberValue(line.quantity) * numberValue(line.unitPrice),
      0,
    );
    const vat = form.lines.reduce(
      (sum, line) =>
        sum +
        numberValue(line.quantity) *
          numberValue(line.unitPrice) *
          (numberValue(line.vatRate) / 100),
      0,
    );
    return { subtotal, vat, total: subtotal + vat };
  }, [form.lines]);

  function patch(values) {
    setNotice(null);
    setForm((current) => ({
      ...current,
      ...values,
      previewApproved:
        Object.prototype.hasOwnProperty.call(values, "previewApproved")
          ? values.previewApproved
          : false,
    }));
  }

  function patchLine(index, field, value) {
    setNotice(null);
    setForm((current) => ({
      ...current,
      previewApproved: false,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  }

  async function createDraft() {
    if (!sourceId) {
      setNotice({ tone: "error", text: "Faturaya çevrilecek İşNet irsaliye kimliği bulunamadı." });
      return;
    }
    if (!form.recipientId) {
      setNotice({ tone: "warning", text: "İşNet fatura alıcısı doğrulanamadı." });
      return;
    }
    if (!form.departmentNo.trim()) {
      setNotice({ tone: "warning", text: "Fatura maili için departman/bölüm seçilmelidir." });
      return;
    }
    if (!form.lines.length) {
      setNotice({ tone: "warning", text: "Fatura satırı bulunamadı." });
      return;
    }
    if (form.lines.some((line) => numberValue(line.quantity) <= 0 || numberValue(line.unitPrice) <= 0)) {
      setNotice({ tone: "warning", text: "Her satırda adet ve birim fiyat sıfırdan büyük olmalıdır." });
      return;
    }
    if (!form.previewApproved) {
      setNotice({ tone: "warning", text: "Önizleme kontrolünü onaylamadan İşNet taslağı oluşturulamaz." });
      return;
    }
    if (!window.confirm(`${form.dispatchNo} irsaliyesine bağlı fatura taslağı İşNet'te oluşturulsun mu?`)) return;

    setBusy("draft");
    setNotice(null);
    try {
      const result = await createIsnetInvoiceFromDispatch(sourceId, {
        ...form,
        sourceId,
        previewApproved: true,
      });
      setDraftResult(result);
      if (!result?.requestId) {
        throw new Error("İşNet taslak işlem kimliği dönmedi.");
      }
      const status = await getIsnetInvoiceDraftStatus(result.requestId);
      setOfficialStatus(status);
      const verified = result.verified === true && !result.verification?.differences?.length;
      setNotice({
        tone: verified ? "success" : "error",
        text: verified
          ? `${result.draftNo || "Fatura taslağı"} İşNet'te oluşturuldu ve geri okunarak doğrulandı.`
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
      setNotice({
        tone: status.status === "COMPLETED" ? "success" : "warning",
        text:
          status.status === "COMPLETED"
            ? `Resmî fatura gönderildi, PDF/XML arşivlendi ve muhasebe-cari-KDV kapanışı tamamlandı: ${status.officialInvoiceNumber || ""}`
            : `Resmî gönderim ${statusText(status.status)} aşamasında. Aynı fatura ikinci kez gönderilmeyecek.`,
      });
    } catch (error) {
      try {
        const status = await getIsnetInvoiceDraftStatus(requestId);
        setOfficialStatus(status);
      } catch {
        // İlk hata kullanıcıya gösterilir; durum sorgusu ikincil kontroldür.
      }
      setNotice({ tone: "error", text: error?.message || "Resmî fatura gönderimi tamamlanamadı." });
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
      setNotice({
        tone: status.status === "COMPLETED" ? "success" : "warning",
        text:
          status.status === "COMPLETED"
            ? "PDF/XML arşivi, muhasebe, cari ve KDV kapanışı tamamlandı."
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
            <strong>Faturaya çevrilecek irsaliye seçilmedi</strong>
            <p>Belge Kaynağı ekranından tamamlanmış giden irsaliyeyi seçin.</p>
            <button
              type="button"
              className="isnet-btn isnet-btn--primary"
              onClick={() => openModule?.("isnet", { tabKey: "belge-kaynagi" })}
            >
              Belge Kaynağına Git
            </button>
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
    <main className="isnet-page">
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><FileCheck2 size={14} /> İRSALİYEDEN FATURAYA</span>
          <h1>{form.dispatchNo || moduleActionContext?.documentNo}</h1>
          <p>İrsaliye satırlarını koruyun, fiyatları tamamlayın ve resmî gönderimi doğrulayın.</p>
        </div>
        <div className="isnet-hero__actions">
          <span className="isnet-badge isnet-badge--blue">{statusText(status)}</span>
          {draftResult?.requestId && (
            <button type="button" className="isnet-btn isnet-btn--secondary" onClick={refreshStatus} disabled={busy === "status"}>
              <RefreshCw size={15} /> Durumu Yenile
            </button>
          )}
        </div>
      </header>

      {notice && <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>{notice.text}</div>}

      <section className="isnet-card">
        <div className="isnet-section-head">
          <div>
            <small>FATURA BİLGİLERİ</small>
            <h2>{form.recipientName || "İşNet alıcısı"}</h2>
            <p>İrsaliye: {form.dispatchNo} · Model: {form.modelName || "-"}</p>
          </div>
        </div>

        <div className="isnet-form-grid">
          <label>
            Fatura tarihi
            <input type="date" value={form.invoiceDate} onChange={(event) => patch({ invoiceDate: event.target.value })} disabled={Boolean(draftResult)} />
          </label>
          <label>
            Vade tarihi
            <input type="date" value={form.dueDate} onChange={(event) => patch({ dueDate: event.target.value })} disabled={Boolean(draftResult)} />
          </label>
          <label>
            Departman / bölüm
            <select value={form.departmentNo} onChange={(event) => patch({ departmentNo: event.target.value })} disabled={Boolean(draftResult)}>
              <option value="">Seçin</option>
              {form.departments.map((department) => (
                <option key={department.code} value={department.code}>{department.code} · {department.name}</option>
              ))}
            </select>
          </label>
          <label>
            Para birimi
            <input value={form.currency || "TRY"} disabled />
          </label>
        </div>
      </section>

      <section className="isnet-card">
        <div className="isnet-section-head">
          <div>
            <small>İRSALİYE SATIRLARI</small>
            <h2>Fatura kalemleri</h2>
            <p>Adetler irsaliye kalanını aşamaz; yalnız fiyat ve KDV tamamlanır.</p>
          </div>
        </div>
        <div className="isnet-table-wrap">
          <table className="isnet-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ürün / model</th>
                <th>Açıklama</th>
                <th>Adet</th>
                <th>Birim fiyat</th>
                <th>KDV %</th>
                <th>Tutar</th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((line, index) => (
                <tr key={line.id || line.lineNo || index}>
                  <td>{index + 1}</td>
                  <td><input value={line.productName} onChange={(event) => patchLine(index, "productName", event.target.value)} disabled={Boolean(draftResult)} /></td>
                  <td><input value={line.description} onChange={(event) => patchLine(index, "description", event.target.value)} disabled={Boolean(draftResult)} /></td>
                  <td><input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => patchLine(index, "quantity", event.target.value)} disabled={Boolean(draftResult)} /></td>
                  <td><input type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(event) => patchLine(index, "unitPrice", event.target.value)} disabled={Boolean(draftResult)} /></td>
                  <td><input type="number" min="0" max="100" step="1" value={line.vatRate} onChange={(event) => patchLine(index, "vatRate", event.target.value)} disabled={Boolean(draftResult)} /></td>
                  <td><strong>{money(numberValue(line.quantity) * numberValue(line.unitPrice) * (1 + numberValue(line.vatRate) / 100))}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="isnet-summary-grid">
          <article><small>Ara toplam</small><strong>{money(totals.subtotal)}</strong></article>
          <article><small>KDV</small><strong>{money(totals.vat)}</strong></article>
          <article><small>Genel toplam</small><strong>{money(totals.total)}</strong></article>
        </div>

        {!draftResult && (
          <>
            <label className="isnet-check-row">
              <input
                type="checkbox"
                checked={form.previewApproved}
                onChange={(event) => patch({ previewApproved: event.target.checked })}
              />
              Fatura alıcısını, irsaliye numarasını, satır adetlerini, fiyatları, KDV’yi ve toplamı kontrol ettim.
            </label>
            <div className="isnet-action-row">
              <button type="button" className="isnet-btn isnet-btn--primary" onClick={createDraft} disabled={busy === "draft"}>
                {busy === "draft" ? <LoaderCircle size={15} className="spin" /> : <FileCheck2 size={15} />}
                İşNet Taslağını Oluştur ve Doğrula
              </button>
            </div>
          </>
        )}
      </section>

      {draftResult && (
        <section className="isnet-card">
          <div className="isnet-section-head">
            <div>
              <small>SON ONAY</small>
              <h2>{draftResult.draftNo || "İşNet fatura taslağı"}</h2>
              <p>Resmî gönderimden önce taslak İşNet listesinden geri okunmuş olmalıdır.</p>
            </div>
            <span className={`isnet-badge isnet-badge--${verified ? "green" : "warning"}`}>
              {verified ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {verified ? "Portal doğrulandı" : "Kontrol gerekli"}
            </span>
          </div>

          {(draftResult.verification?.differences || []).length > 0 && (
            <div className="isnet-notice isnet-notice--error">
              {draftResult.verification.differences.length} doğrulama farkı bulundu. Resmî gönderim kapalıdır.
            </div>
          )}

          {verified && !["SUBMITTING", "SENT", "FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING", "COMPLETED"].includes(status) && (
            <div className="isnet-form-grid">
              <label>
                Son onay metni
                <input
                  value={form.confirmationText}
                  onChange={(event) => setForm((current) => ({ ...current, confirmationText: event.target.value }))}
                  placeholder="FATURAYI GÖNDER"
                />
              </label>
              <div className="isnet-action-row">
                <button type="button" className="isnet-btn isnet-btn--danger" onClick={submitOfficial} disabled={busy === "submit"}>
                  {busy === "submit" ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
                  Resmî Faturayı Gönder
                </button>
              </div>
            </div>
          )}

          {closurePending && (
            <div className="isnet-action-row">
              <button type="button" className="isnet-btn isnet-btn--primary" onClick={retryClosure} disabled={busy === "closure"}>
                <RefreshCw size={15} /> PDF/XML ve Muhasebe Kapanışını Tamamla
              </button>
            </div>
          )}

          {status === "COMPLETED" && (
            <div className="isnet-notice isnet-notice--success">
              Fatura {officialStatus?.officialInvoiceNumber || draftResult.draftNo} numarasıyla tamamlandı; arşiv, muhasebe, cari ve KDV kayıtları doğrulandı.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
