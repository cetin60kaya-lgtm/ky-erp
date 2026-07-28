import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  Truck,
} from "lucide-react";
import { getFirmaKartlari } from "../../../services/muhasebeApi";
import { getDesenSimpleModels } from "../../../services/desenApi";
import { getIsnetLocalDocuments, startDailySync } from "../../../services/isnetApi";
import {
  completeOutgoingDispatchFromSourceIntake,
  createIsnetManualPdfSourceIntake,
  createIsnetNoDispatchSourceIntake,
  createIsnetPortalSourceIntake,
  createOutgoingDispatchFromSourceIntake,
  getIsnetSourceIntakes,
  prepareInvoiceFromSourceIntake,
} from "../../../services/isnetSourceIntakeApi";
import IsnetSourceIntakePanel from "./IsnetSourceIntakePanel";
import "../IsnetPage.css";

const todayText = () => new Date().toISOString().slice(0, 10);
const recentStartText = () => {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
};

function rowsOf(value) {
  const candidates = [
    value,
    value?.rows,
    value?.items,
    value?.documents,
    value?.models,
    value?.data,
    value?.data?.rows,
    value?.data?.items,
    value?.data?.documents,
    value?.data?.models,
  ];
  return candidates.find(Array.isArray) || [];
}

function statusLabel(value) {
  return {
    MODEL_PENDING: "Model bekliyor",
    READY_FOR_PRODUCTION: "İrsaliye hazırlanabilir",
    READY_FOR_INVOICE: "Faturaya hazır",
    PARTIAL: "Kısmi işlem",
    COMPLETED: "Tamamlandı",
    NON_BILLABLE_SUPPLIER: "Tedarikçi kaydı",
  }[value] || value || "Açık";
}

export default function IsnetSourceWorkflowPage({ activeMainCompany, openModule }) {
  const companySlug = activeMainCompany?.slug || activeMainCompany?.id || "";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [models, setModels] = useState([]);
  const [portalDocuments, setPortalDocuments] = useState([]);
  const [intakes, setIntakes] = useState([]);
  const [range, setRange] = useState({ startDate: recentStartText(), endDate: todayText() });
  const [preparedInvoice, setPreparedInvoice] = useState(null);

  const load = useCallback(async () => {
    if (!companySlug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [companyResult, modelResult, portalResult, intakeResult] = await Promise.all([
        getFirmaKartlari(activeMainCompany),
        getDesenSimpleModels(activeMainCompany, { limit: 2000 }),
        getIsnetLocalDocuments({ ...range, page: 1, pageSize: 100 }),
        getIsnetSourceIntakes({ page: 1, pageSize: 100 }),
      ]);
      setCompanies(rowsOf(companyResult));
      setModels(rowsOf(modelResult));
      setPortalDocuments(rowsOf(portalResult));
      setIntakes(rowsOf(intakeResult));
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet kaynak ekranı yüklenemedi." });
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany, companySlug, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const customerCompanies = useMemo(
    () => companies.filter((row) => {
      const role = String(row.companyType || row.firmaTuru || row.type || "").toUpperCase();
      return !role || ["CUSTOMER", "MUSTERI", "MÜŞTERİ", "BOTH", "GENEL"].includes(role);
    }),
    [companies],
  );

  async function submitSource(form) {
    setBusy("create-source");
    setNotice(null);
    try {
      const company = companies.find((row) =>
        String(row.name || row.companyName || "").toLocaleLowerCase("tr-TR") ===
        String(form.companyName || "").toLocaleLowerCase("tr-TR"),
      );
      const payload = {
        ...form,
        mainCompanySlug: companySlug,
        companyId: form.companyId || company?.id || "",
      };
      let result;
      if (form.sourceType === "manual-pdf") {
        result = await createIsnetManualPdfSourceIntake(payload);
      } else if (form.sourceType === "no-dispatch") {
        result = await createIsnetNoDispatchSourceIntake(payload);
      } else {
        result = await createIsnetPortalSourceIntake(payload);
      }
      setNotice({
        tone: "success",
        text: `${result.internalReference || "Kaynak kaydı"} oluşturuldu.`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Kaynak kaydı oluşturulamadı." });
    } finally {
      setBusy("");
    }
  }

  async function synchronize() {
    setBusy("sync");
    setNotice(null);
    try {
      const result = await startDailySync(range);
      const accounting = result?.supplierAccounting || {};
      const syncErrors = Number(result?.automation?.errors?.length || 0);
      setNotice({
        tone: accounting.failed > 0 || syncErrors > 0 ? "warning" : "success",
        text: `${Number(result?.automation?.downloaded || 0)} yeni belge indirildi. ${Number(accounting.imported || 0)} tedarikçi faturası muhasebe ve cariye işlendi${accounting.failed || syncErrors ? `; ${Number(accounting.failed || 0) + syncErrors} kayıt kontrol bekliyor.` : "."}`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Tam senkronizasyon tamamlanamadı." });
    } finally {
      setBusy("");
    }
  }

  async function createDispatch(row) {
    const quantity = Number(row.capacity?.outgoingRemaining || 0);
    if (!(quantity > 0)) {
      setNotice({ tone: "warning", text: "Bu kaynak için irsaliye kesilecek kalan adet yok." });
      return;
    }
    if (!window.confirm(`${row.companyName} için ${quantity} adet giden irsaliye taslağı oluşturulsun mu?`)) return;
    setBusy(`dispatch-${row.id}`);
    setNotice(null);
    try {
      const result = await createOutgoingDispatchFromSourceIntake(row.id, { quantity });
      setNotice({ tone: "success", text: result.message });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Giden irsaliye oluşturulamadı." });
      await load();
    } finally {
      setBusy("");
    }
  }

  async function verifyPortalDraft(row, draft) {
    const documentNo = window.prompt(
      "İşNet giden irsaliye taslaklarında görünen gerçek taslak numarasını yazın",
      draft.documentNo || "",
    );
    if (!documentNo?.trim()) return;
    if (!window.confirm(`${documentNo.trim()} numarası bu kaynak kaydına bağlansın mı?`)) return;
    setBusy(`verify-${draft.id}`);
    setNotice(null);
    try {
      await completeOutgoingDispatchFromSourceIntake(row.id, draft.id, {
        documentNo: documentNo.trim(),
      });
      setNotice({
        tone: "success",
        text: `${documentNo.trim()} portal taslak numarası doğrulandı ve kaynak kaydına bağlandı.`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Portal taslak numarası doğrulanamadı." });
    } finally {
      setBusy("");
    }
  }

  async function prepareInvoice(row) {
    setBusy(`invoice-${row.id}`);
    setNotice(null);
    setPreparedInvoice(null);
    try {
      const result = await prepareInvoiceFromSourceIntake(row.id, range);
      setPreparedInvoice(result);
      setNotice({ tone: result.ready ? "success" : "warning", text: result.message });
      if (result.ready) {
        openModule?.("isnet", {
          tabKey: "irsaliyeden-faturaya",
          actionContext: {
            sourceId: result.sourceId,
            documentNo: result.documentNo,
            invoiceDraft: result.invoiceDraft,
          },
        });
      }
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Fatura hazırlığı tamamlanamadı." });
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="isnet-page" aria-busy={loading}>
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><CheckCircle2 size={14} /> TEK İŞLEM ZİNCİRİ</span>
          <h1>Belge Kaynağı ve İrsaliye Zinciri</h1>
          <p>İşNet, mail PDF ve manuel talimatı giden irsaliye ile fatura akışına bağlayın.</p>
        </div>
        <div className="isnet-hero__actions">
          <label>
            <small>Başlangıç</small>
            <input type="date" value={range.startDate} onChange={(event) => setRange((current) => ({ ...current, startDate: event.target.value }))} />
          </label>
          <label>
            <small>Bitiş</small>
            <input type="date" value={range.endDate} onChange={(event) => setRange((current) => ({ ...current, endDate: event.target.value }))} />
          </label>
          <button className="isnet-btn isnet-btn--primary" type="button" onClick={synchronize} disabled={busy === "sync"}>
            {busy === "sync" ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
            Tek Senkronizasyon
          </button>
        </div>
      </header>

      {notice && (
        <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>
          {notice.text}
        </div>
      )}

      <IsnetSourceIntakePanel
        companies={customerCompanies}
        models={models}
        portalDocuments={portalDocuments}
        onSubmit={submitSource}
        busy={busy === "create-source"}
      />

      <section className="isnet-card">
        <div className="isnet-section-head">
          <div>
            <small>KAYNAK KAYITLARI</small>
            <h2>İrsaliye ve fatura işlem sırası</h2>
            <p>Portal numarası doğrulanmadan kayıt tamamlanmış sayılmaz.</p>
          </div>
          <button type="button" className="isnet-btn isnet-btn--secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> Yenile
          </button>
        </div>

        {loading ? (
          <div className="isnet-empty"><LoaderCircle size={22} className="spin" /><strong>Kayıtlar yükleniyor</strong></div>
        ) : intakes.length === 0 ? (
          <div className="isnet-empty"><FileText size={22} /><strong>Henüz kaynak kaydı yok</strong><p>Üst bölümden İşNet, PDF veya manuel kaynak ekleyin.</p></div>
        ) : (
          <div className="isnet-table-wrap">
            <table className="isnet-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Firma / Kaynak</th>
                  <th>Model</th>
                  <th>Adet</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {intakes.map((row) => {
                  const completedDraft = (row.outgoingDispatchDrafts || []).some((item) => item.status === "COMPLETED");
                  const unresolvedDraft = (row.outgoingDispatchDrafts || []).find((item) => item.status === "DRAFT");
                  return (
                    <tr key={row.id}>
                      <td>{row.issueDate}</td>
                      <td><strong>{row.companyName}</strong><small>{row.customerDispatchNo || row.internalReference}</small></td>
                      <td>{row.modelName || "Model bekliyor"}</td>
                      <td>{row.quantity} {row.unit || "ADET"}<small>Kalan: {row.capacity?.outgoingRemaining ?? 0}</small></td>
                      <td>
                        <span className={`isnet-badge isnet-badge--${unresolvedDraft ? "warning" : "blue"}`}>
                          {unresolvedDraft ? "Portal kontrolü gerekli" : statusLabel(row.workflowStatus)}
                        </span>
                      </td>
                      <td>
                        <div className="isnet-action-row">
                          {unresolvedDraft ? (
                            <button
                              type="button"
                              className="isnet-btn isnet-btn--secondary"
                              disabled={busy === `verify-${unresolvedDraft.id}`}
                              onClick={() => verifyPortalDraft(row, unresolvedDraft)}
                            >
                              <CheckCircle2 size={14} /> Portal Taslak No Doğrula
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="isnet-btn isnet-btn--secondary"
                              disabled={!row.modelId || Number(row.capacity?.outgoingRemaining || 0) <= 0 || busy === `dispatch-${row.id}`}
                              onClick={() => createDispatch(row)}
                            >
                              <Truck size={14} /> Giden İrsaliye Oluştur
                            </button>
                          )}
                          <button
                            type="button"
                            className="isnet-btn isnet-btn--primary"
                            disabled={!completedDraft || busy === `invoice-${row.id}`}
                            onClick={() => prepareInvoice(row)}
                          >
                            <ReceiptText size={14} /> Faturaya Hazırla
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {preparedInvoice?.ready && (
        <section className="isnet-card">
          <div className="isnet-section-head">
            <div>
              <small>FATURA HAZIRLIĞI</small>
              <h2>{preparedInvoice.documentNo}</h2>
              <p>İrsaliye İşNet’ten geri okundu ve fatura yardımcısına gönderildi.</p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
