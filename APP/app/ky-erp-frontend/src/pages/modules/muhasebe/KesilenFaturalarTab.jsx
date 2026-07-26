import { useEffect, useMemo, useRef, useState } from "react";
import { useCallback } from "react";
import {
  CircleAlert,
  CircleCheck,
  Eye,
  FileText,
  History,
  Link2,
  PackageCheck,
  Printer,
  ReceiptText,
  Search,
  Unlink,
  UploadCloud,
  X,
} from "lucide-react";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiUpload,
  buildApiUrl,
} from "../../../utils/api";
import InvoiceUploadReviewModal, {
  buildInvoiceUploadPreview,
} from "../../../components/muhasebe/InvoiceUploadReviewModal";
import "./KesilenFaturalarTab.css";

const money = (value) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(Number(value || 0));

const number = (value) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(
    Number(value || 0),
  );

const date = (value) =>
  value ? new Date(value).toLocaleDateString("tr-TR") : "-";

const cariLabel = {
  CARI_PENDING: "Cari işlenmedi",
  CARI_PROCESSED: "Otomatik cari işlendi",
  CARI_ERROR: "Cari hata",
  CARI_MANUAL_REVIEW: "Cari kontrolü",
};

const modelLabel = {
  MODEL_NOT_REQUIRED: "Model gerekmiyor",
  MODEL_PENDING: "Model bekliyor",
  MODEL_PARTIAL: "Kısmi eşleşti",
  MODEL_COMPLETE: "Tamamlandı",
  MODEL_REVIEW_REQUIRED: "Kontrol gereken",
};

function rows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizePool(value) {
  const items = rows(value);
  return {
    ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}),
    items,
    total: Number(value?.total ?? items.length),
    summary: value?.summary || {},
  };
}




function Badge({ tone = "blue", children }) {
  return <span className={`sales-badge ${tone}`}>{children}</span>;
}

function statusTone(value) {
  if (String(value).includes("PROCESSED") || String(value).includes("COMPLETE"))
    return "green";
  if (String(value).includes("ERROR") || String(value).includes("REVIEW"))
    return "red";
  if (String(value).includes("PENDING") || String(value).includes("PARTIAL"))
    return "orange";
  return "blue";
}

export default function KesilenFaturalarTab({ activeMainCompany }) {
  const fileRef = useRef(null);
  const [pool, setPool] = useState({ items: [], summary: {} });
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modelStatus, setModelStatus] = useState("");
  const [cariStatus, setCariStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [poolStage, setPoolStage] = useState("ALL");
  const [detailOpen, setDetailOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [picker, setPicker] = useState(null);
  const [models, setModels] = useState([]);
  const [modelSearch, setModelSearch] = useState("");
  const [selectedModel, setSelectedModel] = useState(null);
  const [regions, setRegions] = useState([]);
  const [regionId, setRegionId] = useState("");
  const [matchQuantity, setMatchQuantity] = useState("");
  const [lineEditor, setLineEditor] = useState(null);
  const [uploadReview, setUploadReview] = useState({
    open: false,
    rows: [],
    results: null,
    progress: "",
  });

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.slug, activeMainCompany?.id],
  );

  const loadPool = useCallback(async (keepSelection = true) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiGet("/muhasebe/kesilen-faturalar", {
        ...params,
        search: search || undefined,
        modelStatus: modelStatus || undefined,
        cariStatus: cariStatus || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: 500,
        _ts: Date.now(),
      });
      const nextPool = normalizePool(result);
      setPool(nextPool);
      const nextId =
        keepSelection && nextPool.items.some((item) => item?.id === selectedId)
           ? selectedId
          : nextPool.items?.[0]?.id || "";
      setSelectedId(nextId);
      if (!nextId) setDetail(null);
    } catch (requestError) {
      setError(requestError?.message || "Kesilen faturalar alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [cariStatus, dateFrom, dateTo, modelStatus, params, search, selectedId]);

  const loadDetail = useCallback(async (invoiceId) => {
    if (!invoiceId) return;
    try {
      const result = await apiGet(
        `/muhasebe/kesilen-faturalar/${encodeURIComponent(invoiceId)}`,
        { ...params, _ts: Date.now() },
      );
      setDetail(result);
    } catch (requestError) {
      setError(requestError?.message || "Fatura detayı alınamadı.");
    }
  }, [params]);

  useEffect(() => {
    loadPool(false);
  }, [
    activeMainCompany?.slug,
    activeMainCompany?.id,
    search,
    modelStatus,
    cariStatus,
    dateFrom,
    dateTo,
    loadPool,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem("ky-sales-invoices:dateFrom", dateFrom || "");
      localStorage.setItem("ky-sales-invoices:dateTo", dateTo || "");
    } catch {
      // localStorage olmayabilir; filtre yine ekranda çalışır.
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  useEffect(() => {
    if (!detail || models.length) return;
    apiGet("/desen/modeller", { ...params, sort: "newest", limit: 200, _ts: Date.now() })
      .then((result) => setModels(rows(result)))
      .catch(() => undefined);
  }, [detail, detail?.id, models.length, params]);

  const refresh = async (invoice) => {
    if (invoice) setDetail(invoice);
    await loadPool(true);
    if (invoice?.id) setSelectedId(invoice?.id);
  };

  const selectInvoice = (invoice) => {
    if (!invoice?.id) return;
    setSelectedId(invoice.id);
  };

  const openInvoice = (invoice) => {
    if (!invoice?.id) return;
    if (invoice.id !== selectedId) setDetail(null);
    setSelectedId(invoice.id);
    setDetailOpen(true);
  };

  const uploadFiles = async (event) => {
    const selectedFiles = Array.from(event?.target.files || []);
    event.target.value = "";
    if (!selectedFiles.length) return;
    const previewRows = await buildInvoiceUploadPreview(selectedFiles, "sales");
    setUploadReview({ open: true, rows: previewRows, results: null, progress: "" });
  };

  const confirmUploadFiles = async (selectedRows) => {
    const results = [];
    let firstInvoiceId = "";
    setBusy(true);
    setMessage("");
    setError("");
    try {
      for (let index = 0; index < selectedRows.length; index += 1) {
        const row = selectedRows[index];
        setUploadReview((current) => ({ ...current, progress: `${index + 1} / ${selectedRows.length}: ${row.fileName}` }));
        const form = new FormData();
        form.append("files", row.file);
        if (params.mainCompanySlug) form.append("mainCompanySlug", params.mainCompanySlug);
        if (params.mainCompanyId) form.append("mainCompanyId", params.mainCompanyId);
        try {
          const response = await apiUpload("/muhasebe/kesilen-faturalar/yukle", form);
          const items = Array.isArray(response?.items) ? response.items : [];
          if (!items.length) results.push({ status: "ERROR", fileName: row.fileName, invoiceNo: row.invoiceNo, message: "Sunucu dosya için kayıt sonucu döndürmedi." });
          items.forEach((item) => {
            if (item?.error) {
              results.push({ status: "ERROR", fileName: item?.fileName || row.fileName, invoiceNo: row.invoiceNo, message: item?.message || "Fatura kaydedilemedi." });
            } else if (item?.duplicate) {
              results.push({ status: "DUPLICATE", fileName: row.fileName, invoiceNo: item?.invoice?.invoiceNo || row.invoiceNo, message: item?.message || "Bu fatura daha önce kaydedilmiş." });
            } else {
              firstInvoiceId ||= item?.invoice?.id || "";
              results.push({ status: "SAVED", fileName: row.fileName, invoiceNo: item?.invoice?.invoiceNo || row.invoiceNo, message: item?.message || "Kesilen fatura havuza kaydedildi." });
            }
          });
        } catch (requestError) {
          results.push({ status: "ERROR", fileName: row.fileName, invoiceNo: row.invoiceNo, message: requestError?.message || "Fatura kaydedilemedi." });
        }
      }
      if (firstInvoiceId) setSelectedId(firstInvoiceId);
      await loadPool(false);
      const savedCount = results.filter((item) => item.status === "SAVED").length;
      const duplicateCount = results.filter((item) => item.status === "DUPLICATE").length;
      const errorCount = results.filter((item) => item.status === "ERROR").length;
      setMessage(`${savedCount} fatura kaydedildi, ${duplicateCount} mükerrer, ${errorCount} hatalı.`);
    } finally {
      setBusy(false);
      setUploadReview((current) => ({ ...current, results, progress: "" }));
    }
  };

  const processCari = async () => {
    if (!detail) return;
    const nextInvoice = displayedInvoices.find(
      (invoice) => invoice?.id !== detail?.id && invoice?.cariStatus !== "CARI_PROCESSED",
    );
    setBusy(true);
    setError("");
    try {
      const result = await apiPost(
        `/muhasebe/kesilen-faturalar/${encodeURIComponent(detail?.id)}/cari-isle`,
        params,
      );
      setMessage(result?.message);
      await refresh(result?.invoice);
      if (nextInvoice?.id) setSelectedId(nextInvoice.id);
    } catch (requestError) {
      setError(requestError?.message || "Cari işlem oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const saveLine = async () => {
    if (!detail?.id || !lineEditor?.id) return;
    setBusy(true);
    setError("");
    try {
      const payload = detail?.cariStatus === "CARI_PROCESSED"
        ? {
            ...params,
            description: lineEditor.description,
            lineType: lineEditor.lineType,
          }
        : { ...params, ...lineEditor };
      const result = await apiPatch(
        `/muhasebe/kesilen-faturalar/${encodeURIComponent(detail.id)}/kalemler/${encodeURIComponent(lineEditor.id)}`,
        payload,
      );
      setLineEditor(null);
      setMessage("Fatura kalemi güncellendi.");
      await refresh(result);
    } catch (requestError) {
      setError(requestError?.message || "Fatura kalemi güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const setDateRange = (range) => {
    const today = new Date();
    const iso = (value) => value.toISOString().slice(0, 10);
    if (range === "ALL") {
      setDateFrom("");
      setDateTo("");
      return;
    }
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    if (range === "LAST_MONTH") {
      start.setMonth(start.getMonth() - 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setDateFrom(iso(start));
      setDateTo(iso(end));
      return;
    }
    if (range === "SIX_MONTHS") start.setMonth(start.getMonth() - 5);
    setDateFrom(iso(start));
    setDateTo(iso(today));
  };

  const openPicker = async (line) => {
    setPicker(line);
    setSelectedModel(null);
    setRegions([]);
    setRegionId("");
    setMatchQuantity(String(line?.remainingQuantity || line?.quantity || ""));
    setModelSearch("");
    try {
      const result = await apiGet("/desen/modeller", {
        ...params,
        sort: "newest",
        limit: 500,
        _ts: Date.now(),
      });
      setModels(rows(result));
    } catch (requestError) {
      setError(requestError?.message || "Desen havuzu alınamadı.");
    }
  };

  const chooseModel = async (model) => {
    setSelectedModel(model);
    try {
      const result = await apiGet(
        `/desen/modeller/${encodeURIComponent(model?.id)}/baski-bolgeleri`,
        { ...params, _ts: Date.now() },
      );
      const regionRows = rows(result);
      setRegions(regionRows);
      setRegionId(regionRows[0]?.id || regionRows[0]?.regionCode || "");
    } catch {
      setRegions([]);
      setRegionId("");
    }
  };

  const saveModelLink = async () => {
    if (!detail || !picker || !selectedModel) return;
    setBusy(true);
    setError("");
    try {
      const region = regions.find(
        (item) => (item?.id || item?.regionCode) === regionId,
      );
      const result = await apiPost(
        `/muhasebe/kesilen-faturalar/${encodeURIComponent(detail?.id)}/kalemler/${encodeURIComponent(picker.id)}/model-bagla`,
        {
          ...params,
          modelId: selectedModel?.id,
          printRegionId: regionId || undefined,
          printRegionName: region?.regionName || undefined,
          matchedQuantity: Number(matchQuantity),
        },
      );
      setPicker(null);
      setMessage(result?.message);
      await refresh(result?.invoice);
    } catch (requestError) {
      setError(requestError?.message || "Model bağlantısı kurulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const markOutside = async (line) => {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiPost(
        `/muhasebe/kesilen-faturalar/${encodeURIComponent(detail?.id)}/kalemler/${encodeURIComponent(line?.id)}/model-disi`,
        params,
      );
      setMessage(result?.message);
      await refresh(result?.invoice);
    } catch (requestError) {
      setError(requestError?.message || "Kalem model dışı işaretlenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const removeLink = async (line, link) => {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiDelete(
        `/muhasebe/kesilen-faturalar/${encodeURIComponent(detail?.id)}/kalemler/${encodeURIComponent(line?.id)}/model-baglantisi/${encodeURIComponent(link?.id)}`,
        params,
      );
      setMessage(result?.message);
      await refresh(result?.invoice);
    } catch (requestError) {
      setError(requestError?.message || "Model bağlantısı kaldırılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const filteredModels = models.filter((model) =>
    `${model?.modelName || model?.modelAdi || ""} ${model?.firmaAdi || model?.firmName || ""} ${model?.baskiBolgesi || ""}`
      .toLocaleLowerCase("tr-TR")
      .includes(modelSearch.toLocaleLowerCase("tr-TR")),
  );

  const summary = pool.summary || {};
  const displayedInvoices = (pool.items || [])
    .filter((invoice) => !companyFilter || invoice?.companyId === companyFilter)
    .filter((invoice) => {
      if (poolStage === "ALL") return true;
      if (poolStage === "PROCESSED") return invoice?.cariStatus === "CARI_PROCESSED";
      if (poolStage === "ISSUE")
        return ["CARI_ERROR", "CARI_MANUAL_REVIEW"].includes(invoice?.cariStatus) ||
          invoice?.modelStatus === "MODEL_REVIEW_REQUIRED";
      return invoice?.cariStatus !== "CARI_PROCESSED";
    });
  const firmRows = Array.from(
    (pool.items || [])
      .reduce((map, invoice) => {
        const key = invoice?.companyId || invoice?.companyName || "unknown";
        const current =
          map.get(key) || {
            id: invoice?.companyId || key,
            name: invoice?.companyName || "Firma eşleşmemiş",
            count: 0,
            total: 0,
          };
        current.count += 1;
        current.total += Number(invoice?.grandTotal || 0);
        map.set(key, current);
        return map;
      }, new Map())
      .values(),
  ).sort((left, right) => right.total - left.total);
  const modelLine =
    (detail?.lines || []).find((line) => !line?.modelOutside && line?.remainingQuantity > 0) ||
    (detail?.lines || [])[0] ||
    null;
  const linkedModelId = modelLine?.links?.[0]?.modelId || "";
  const linkedModel = models.find((model) => model?.id === linkedModelId) || null;
  const linkedModelImage =
    linkedModel?.thumbnail ||
    linkedModel?.imageUrl ||
    linkedModel?.desenImageThumb ||
    "";

  return (
    <div className="sales-pool">
      <InvoiceUploadReviewModal
        open={uploadReview.open}
        title="Kesilen Faturaları Kontrol Et"
        rows={uploadReview.rows}
        results={uploadReview.results}
        busy={busy}
        progress={uploadReview.progress}
        onClose={() => setUploadReview({ open: false, rows: [], results: null, progress: "" })}
        onConfirm={confirmUploadFiles}
      />
      <section className="sales-head">
        <div>
          <div className="sales-title">
            <ReceiptText size={22} />
            <h2>Kesilen Fatura Havuzu</h2>
          </div>
          <p>
            Faturalar havuza alınır. Eşleşen XML faturaların müşteri carisi otomatik
            işlenir; model eşleştirme üretim ve adet takibi içindir.
          </p>
        </div>
        <button
          className="sales-btn orange"
          type="button"
          onClick={() => fileRef.current.click()}
          disabled={busy}
        >
          <UploadCloud size={17} /> Fatura Yükle
        </button>
        <input
          ref={fileRef}
          hidden
          multiple
          type="file"
          accept=".xml,application/xml,text/xml,.pdf,application/pdf,.zip,application/zip"
          onChange={uploadFiles}
        />
      </section>

      <section className="sales-workflow" aria-label="Kesilen fatura işlem sırası">
        <div className="active"><b>1</b><span>Havuza Al</span><small>XML, PDF veya ZIP yükle</small></div>
        <div><b>2</b><span>Kontrol Et</span><small>Müşteri ve fatura bilgileri</small></div>
        <div><b>3</b><span>Kalemleri Düzenle</span><small>Model ve miktar eşleştirme</small></div>
        <div><b>4</b><span>Cari Kaydı</span><small>XML eşleşirse otomatik işlenir</small></div>
      </section>

      {message ? <div className="sales-message success">{message}</div> : null}
      {error ? <div className="sales-message error">{error}</div> : null}

      <section className="sales-metrics">
        <div className="sales-metric">
          <span>Bu Ay Kesilen Fatura</span>
          <b>{summary.monthInvoiceCount || 0}</b>
        </div>
        <div className="sales-metric green">
          <span>Müşteri Carisi İşlendi</span>
          <b>{summary.cariProcessedCount || 0}</b>
        </div>
        <div className="sales-metric orange">
          <span>Model Bekleyen Fatura</span>
          <b>{summary.modelPendingCount || 0}</b>
        </div>
        <div className="sales-metric">
          <span>Kısmi Eşleşen</span>
          <b>{summary.partialCount || 0}</b>
        </div>
        <div className="sales-metric red">
          <span>Kontrol Gereken</span>
          <b>{summary.reviewCount || 0}</b>
        </div>
        <div className="sales-metric dark">
          <span>Kesilen Fatura Toplamı</span>
          <b>{money(summary.grandTotal)}</b>
        </div>
      </section>

      <section className="sales-grid">
        <aside className="sales-card sales-list-panel">
          <div className="sales-card-head">
            <strong>Firma Listesi</strong>
            <Badge>{pool.total || 0} kayıt</Badge>
          </div>
          <div className="sales-card-body">
            <label className="sales-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event?.target.value)}
                placeholder="Fatura no, firma veya kalem ara"
              />
            </label>
            <div className="sales-date-grid">
              <label>
                <span>Başlangıç</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event?.target.value)}
                />
              </label>
              <label>
                <span>Bitiş</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event?.target.value)}
                />
              </label>
            </div>
            <div className="sales-quick-dates">
              <button type="button" onClick={() => setDateRange("MONTH")}>Bu Ay</button>
              <button type="button" onClick={() => setDateRange("LAST_MONTH")}>Geçen Ay</button>
              <button type="button" onClick={() => setDateRange("SIX_MONTHS")}>Son 6 Ay</button>
              <button type="button" onClick={() => setDateRange("ALL")}>Tüm Tarihler</button>
            </div>
            <div className="sales-filter-grid">
              <select
                value={cariStatus}
                onChange={(event) => setCariStatus(event?.target.value)}
              >
                <option value="">Tüm cari durumları</option>
                <option value="CARI_PROCESSED">Cari işlendi</option>
                <option value="CARI_PENDING">Cari işlenmedi</option>
                <option value="CARI_MANUAL_REVIEW">Cari kontrolü</option>
                <option value="CARI_ERROR">Cari hata</option>
              </select>
              <select
                value={modelStatus}
                onChange={(event) => setModelStatus(event?.target.value)}
              >
                <option value="">Tüm model durumları</option>
                {Object.entries(modelLabel).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sales-list">
              <button
                className={`sales-list-item ${!companyFilter ? "selected" : ""}`}
                type="button"
                onClick={() => setCompanyFilter("")}
              >
                <div className="sales-row">
                  <strong>Tüm firmalar</strong>
                  <Badge>{pool.total || 0}</Badge>
                </div>
                <div className="sales-row">
                  <span>Kesilen toplam</span>
                  <strong>{money(summary.grandTotal)}</strong>
                </div>
              </button>
              {firmRows.map((firm) => (
                <button
                  key={firm.id}
                  className={`sales-list-item ${companyFilter === firm.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => setCompanyFilter(firm.id)}
                >
                  <div className="sales-row">
                    <strong>{firm.name}</strong>
                    <Badge>{firm.count}</Badge>
                  </div>
                  <div className="sales-row">
                    <span>Kesilen toplam</span>
                    <strong>{money(firm.total)}</strong>
                  </div>
                </button>
              ))}
              {loading ? <div className="sales-empty">Faturalar yükleniyor…</div> : null}
              {!loading && !pool.items.length ? (
                <div className="sales-empty">
                  Gerçek veride kesilen fatura bulunamadı.
                </div>
              ) : null}
            </div>
            <div className="sales-model-preview">
              {linkedModelImage ? (
                <img src={linkedModelImage} alt="" />
              ) : (
                <div className="sales-model-preview-empty">
                  <FileText size={26} />
                  <span>Model gÃ¶rseli yok</span>
                </div>
              )}
              <strong>
                {modelLine?.links?.[0]?.modelName ||
                  linkedModel?.modelName ||
                  linkedModel?.modelAdi ||
                  "Model baÄŸlanmadÄ±"}
              </strong>
              <small>{modelLine?.description || "Fatura satÄ±rÄ± seÃ§ili deÄŸil"}</small>
              <button
                className="sales-btn primary"
                type="button"
                disabled={!modelLine || modelLine?.modelOutside}
                onClick={() => openPicker(modelLine)}
              >
                <Link2 size={16} /> Desen Havuzundan Model BaÄŸla
              </button>
            </div>
          </div>
        </aside>

        <main className="sales-card sales-detail">
          <div className="sales-card-head">
            <strong>Kesilen Fatura İşlem Havuzu</strong>
            <Badge>{displayedInvoices.length} kayıt</Badge>
          </div>
          <div className="sales-stage-tabs">
            {[
              ["PENDING", "İşlem Bekleyen"],
              ["PROCESSED", "Otomatik İşlenen"],
              ["ISSUE", "Kontrol Gereken"],
              ["ALL", "Tümü"],
            ].map(([key, label]) => (
              <button key={key} type="button" className={poolStage === key ? "active" : ""} onClick={() => setPoolStage(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="sales-table-wrap invoice-list">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Fatura No</th>
                  <th>Müşteri</th>
                  <th>Matrah</th>
                  <th>KDV</th>
                  <th>Toplam</th>
                  <th>Cari</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                {displayedInvoices.map((invoice) => (
                  <tr
                    key={invoice?.id}
                    className={selectedId === invoice?.id ? "selected-row" : ""}
                    onClick={() => selectInvoice(invoice)}
                    onDoubleClick={() => openInvoice(invoice)}
                  >
                    <td>{date(invoice?.invoiceDate)}</td>
                    <td><strong>{invoice?.invoiceNo}</strong></td>
                    <td>{invoice?.companyName}</td>
                    <td>{money(invoice?.subtotal)}</td>
                    <td>{money(invoice?.vatTotal)}</td>
                    <td><strong>{money(invoice?.grandTotal)}</strong></td>
                    <td><Badge tone={statusTone(invoice?.cariStatus)}>{cariLabel[invoice?.cariStatus] || invoice?.cariStatus}</Badge></td>
                    <td><Badge tone={statusTone(invoice?.modelStatus)}>{modelLabel[invoice?.modelStatus] || invoice?.modelStatus}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !displayedInvoices.length ? (
              <div className="sales-empty">Seçili tarih ve firmada fatura bulunamadı.</div>
            ) : null}
          </div>
          {!detail ? (
            <div className="sales-empty large">
              <FileText size={34} />
              <strong>Detay için bir fatura seçin</strong>
            </div>
          ) : (
            <>
              <div className="sales-detail-head">
                <div>
                  <h3>{detail?.invoiceNo}</h3>
                  <p>
                    {detail?.companyName} · {detail?.documentType}
                  </p>
                </div>
                <div className="sales-actions">
                  <Badge tone={statusTone(detail?.cariStatus)}>
                    {cariLabel[detail?.cariStatus] || detail?.cariStatus}
                  </Badge>
                  <Badge tone={statusTone(detail?.modelStatus)}>
                    {modelLabel[detail?.modelStatus] || detail?.modelStatus}
                  </Badge>
                  <button
                    className="sales-btn"
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <Eye size={16} /> Fatura Görüntüle
                  </button>
                </div>
              </div>
              <div className="sales-info-grid">
                {[
                  ["Fatura Tarihi", date(detail?.invoiceDate)],
                  ["Fatura No", detail?.invoiceNo],
                  ["Müşteri", detail?.companyName],
                  ["Cari Durum", cariLabel[detail?.cariStatus]],
                  ["Matrah", money(detail?.subtotal)],
                  ["KDV", money(detail?.vatTotal)],
                  ["Genel Toplam", money(detail?.grandTotal)],
                  ["İrsaliye No", detail?.dispatchNo || "-"],
                  ["Sipariş No", detail?.orderNo || "-"],
                  ["Kaynak", detail?.sourceKind || "-"],
                ].map(([label, value]) => (
                  <div className="sales-info" key={label}>
                    <span>{label}</span>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
              <div className="sales-note">
                <CircleCheck size={17} />
                Model bağlantısı cari işlemi bloke etmez. Kısmi eşleştirmede
                kalan adet aynı veya farklı modele bağlanabilir.
              </div>
              <div className="sales-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fatura Kalemi</th>
                      <th>Miktar</th>
                      <th>Birim Fiyat</th>
                      <th>KDV</th>
                      <th>Satır Toplamı</th>
                      <th>Bağlı Model / Bölge</th>
                      <th>Eşleşen</th>
                      <th>Kalan</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.lines || []).map((line) => (
                      <tr key={line?.id}>
                        <td>
                          <strong>{line?.description}</strong>
                          <small>{line?.modelOutside ? "Model dışı kalem" : line?.lineType}</small>
                        </td>
                        <td>
                          {number(line?.quantity)} {line?.unit}
                        </td>
                        <td>{money(line?.unitPrice)}</td>
                        <td>%{number(line?.vatRate)}</td>
                        <td>{money(line?.lineTotal)}</td>
                        <td>
                          {line?.modelOutside ? (
                            <Badge tone="gray">Model gerekmiyor</Badge>
                          ) : line?.links?.length ? (
                            <div className="sales-link-list">
                              {(line?.links || []).map((link) => (
                                <span key={link?.id}>
                                  {link?.modelName || link?.modelId} · {link?.printRegionName || "Bölgesiz"}
                                  <button
                                    title="Eşleşmeyi kaldır"
                                    type="button"
                                    onClick={() => removeLink(line, link)}
                                  >
                                    <Unlink size={13} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <Badge tone="orange">Model bağlanmadı</Badge>
                          )}
                        </td>
                        <td>{number(line?.matchedQuantity)}</td>
                        <td>{number(line?.remainingQuantity)}</td>
                        <td>
                          <div className="sales-line-actions">
                            <button
                              className="sales-btn small"
                              type="button"
                              onClick={() => setLineEditor({
                                id: line.id,
                                description: line.description || "",
                                quantity: line.quantity || 0,
                                unit: line.unit || "ADET",
                                unitPrice: line.unitPrice || 0,
                                vatRate: line.vatRate || 0,
                                lineType: line.lineType || "MODEL",
                              })}
                            >
                              Düzenle
                            </button>
                            {!line?.modelOutside && line?.remainingQuantity > 0 ? (
                              <button
                                className="sales-btn small"
                                type="button"
                                onClick={() => openPicker(line)}
                              >
                                <Link2 size={14} /> Desen Havuzundan Bağla
                              </button>
                            ) : null}
                            {!line?.modelOutside && !line?.links?.length ? (
                              <button
                                className="sales-btn small"
                                type="button"
                                onClick={() => markOutside(line)}
                              >
                                <PackageCheck size={14} /> Model Dışı
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sales-footer">
                <strong>Fatura Toplamı: {money(detail?.grandTotal)}</strong>
                <div className="sales-actions">
                  {detail?.cariStatus !== "CARI_PROCESSED" ? (
                    <button
                      className="sales-btn primary"
                      type="button"
                      onClick={processCari}
                      disabled={busy}
                    >
                      <CircleCheck size={16} /> Müşteri Carisine İşle
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </main>

        <aside className="sales-card sales-side">
          <div className="sales-card-head">
            <strong>Hızlı İşlem</strong>
          </div>
          <button
            className="sales-drop"
            type="button"
            onClick={() => fileRef.current.click()}
          >
            <UploadCloud size={26} />
            <strong>Yeni Kesilen Fatura Bırak</strong>
            <span>XML, PDF veya ZIP yükle</span>
          </button>
          <div className="sales-model-preview">
            {linkedModelImage ? (
              <img src={linkedModelImage} alt="" />
            ) : (
              <div className="sales-model-preview-empty">
                <FileText size={26} />
                <span>Model görseli yok</span>
              </div>
            )}
            <strong>
              {modelLine?.links?.[0]?.modelName ||
                linkedModel?.modelName ||
                linkedModel?.modelAdi ||
                "Model bağlanmadı"}
            </strong>
            <small>{modelLine?.description || "Fatura satırı seçili değil"}</small>
            <button
              className="sales-btn primary"
              type="button"
              disabled={!modelLine || modelLine?.modelOutside}
              onClick={() => openPicker(modelLine)}
            >
              <Link2 size={16} /> Desen Havuzundan Model Bağla
            </button>
          </div>
          <div className="sales-side-actions">
            <button
              className="sales-btn primary"
              type="button"
              disabled={!detail}
              onClick={() => setPreviewOpen(true)}
            >
              <Eye size={16} /> Fatura Görüntüle
            </button>
            <button
              className="sales-btn"
              type="button"
              disabled={!detail || detail.cariStatus === "CARI_PROCESSED"}
              onClick={processCari}
            >
              <CircleCheck size={16} /> Cari Hareketi Oluştur
            </button>
          </div>
          <div className="sales-flow">
            <h4>İş Akışı</h4>
            {[
              "Faturayı yükle. XML varsa ana veri olarak okunur.",
              "Firma bulunur ve cari işlemi XML için otomatik oluşur.",
              "İlgili kalemden Desen Havuzundaki modeli seç.",
              "Eşleşen adet model ve üretim takibine yansır.",
            ].map((item, index) => (
              <p key={item}>
                <span>{index + 1}</span>
                {item}
              </p>
            ))}
          </div>
          <div className="sales-flow">
            <h4>
              <History size={15} /> Fatura Geçmişi
            </h4>
            {(detail?.history || []).slice(0, 8).map((item) => (
              <p key={item?.id}>
                <span>•</span>
                {date(item?.createdAt)} · {item?.message}
              </p>
            ))}
            {!detail?.history?.length ? <small>Geçmiş kaydı yok.</small> : null}
          </div>
        </aside>
      </section>

      {detailOpen && detail ? (
        <div className="sales-modal-backdrop" onMouseDown={() => setDetailOpen(false)}>
          <div className="sales-modal details" onMouseDown={(event) => event?.stopPropagation()}>
            <div className="sales-modal-head">
              <div>
                <strong>{detail?.invoiceNo}</strong>
                <span>{detail?.companyName} · {date(detail?.invoiceDate)}</span>
              </div>
              <div className="sales-actions">
                <button className="sales-btn" type="button" onClick={() => setPreviewOpen(true)}>
                  <Eye size={15} /> Fatura Görüntüle
                </button>
                <button className="sales-btn icon" type="button" onClick={() => setDetailOpen(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="sales-info-grid">
              {[
                ["Fatura Tarihi", date(detail?.invoiceDate)],
                ["Fatura No", detail?.invoiceNo],
                ["Müşteri", detail?.companyName],
                ["Cari Durum", cariLabel[detail?.cariStatus]],
                ["Matrah", money(detail?.subtotal)],
                ["KDV", money(detail?.vatTotal)],
                ["Genel Toplam", money(detail?.grandTotal)],
                ["Kaynak", detail?.sourceKind || "-"],
              ].map(([label, value]) => (
                <div className="sales-info" key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
            <div className="sales-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fatura Kalemi</th>
                    <th>Miktar</th>
                    <th>Birim Fiyat</th>
                    <th>KDV</th>
                    <th>Satır Toplamı</th>
                    <th>Bağlı Model / Bölge</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.lines || []).map((line) => (
                    <tr key={line?.id}>
                      <td><strong>{line?.description}</strong></td>
                      <td>{number(line?.quantity)} {line?.unit}</td>
                      <td>{money(line?.unitPrice)}</td>
                      <td>%{number(line?.vatRate)}</td>
                      <td>{money(line?.lineTotal)}</td>
                      <td>
                        {line?.modelOutside ? (
                          <Badge tone="gray">Model gerekmiyor</Badge>
                        ) : line?.links?.length ? (
                          <div className="sales-link-list">
                            {(line?.links || []).map((link) => (
                              <span key={link?.id}>{link?.modelName || link?.modelId} · {link?.printRegionName || "Bölgesiz"}</span>
                            ))}
                          </div>
                        ) : (
                          <Badge tone="orange">Model bağlanmadı</Badge>
                        )}
                      </td>
                      <td>
                        <div className="sales-line-actions">
                          <button
                            className="sales-btn small"
                            type="button"
                            onClick={() => setLineEditor({
                              id: line.id,
                              description: line.description || "",
                              quantity: line.quantity || 0,
                              unit: line.unit || "ADET",
                              unitPrice: line.unitPrice || 0,
                              vatRate: line.vatRate || 0,
                              lineType: line.lineType || "MODEL",
                            })}
                          >
                            Düzenle
                          </button>
                          {!line?.modelOutside && line?.remainingQuantity > 0 ? (
                            <button className="sales-btn small" type="button" onClick={() => openPicker(line)}>
                              <Link2 size={14} /> Desen Havuzundan Bağla
                            </button>
                          ) : null}
                          {!line?.modelOutside && !line?.links?.length ? (
                            <button className="sales-btn small" type="button" onClick={() => markOutside(line)}>
                              <PackageCheck size={14} /> Model Dışı
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {lineEditor ? (
        <div className="sales-modal-backdrop" onMouseDown={() => setLineEditor(null)}>
          <div className="sales-modal sales-line-editor" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sales-modal-head">
              <div><strong>Fatura Kalemini Düzenle</strong><span>Değişiklikler kaydedildikten sonra model durumu yeniden hesaplanır.</span></div>
              <button className="sales-btn icon" type="button" onClick={() => setLineEditor(null)}><X size={18} /></button>
            </div>
            <div className="sales-edit-grid">
              <label className="wide"><span>Kalem Açıklaması</span><input value={lineEditor.description} onChange={(event) => setLineEditor((prev) => ({ ...prev, description: event.target.value }))} /></label>
              <label><span>Miktar</span><input disabled={detail?.cariStatus === "CARI_PROCESSED"} type="number" step="0.001" value={lineEditor.quantity} onChange={(event) => setLineEditor((prev) => ({ ...prev, quantity: event.target.value }))} /></label>
              <label><span>Birim</span><input value={lineEditor.unit} onChange={(event) => setLineEditor((prev) => ({ ...prev, unit: event.target.value }))} /></label>
              <label><span>Birim Fiyat</span><input disabled={detail?.cariStatus === "CARI_PROCESSED"} type="number" step="0.01" value={lineEditor.unitPrice} onChange={(event) => setLineEditor((prev) => ({ ...prev, unitPrice: event.target.value }))} /></label>
              <label><span>KDV Oranı</span><input disabled={detail?.cariStatus === "CARI_PROCESSED"} type="number" step="0.01" value={lineEditor.vatRate} onChange={(event) => setLineEditor((prev) => ({ ...prev, vatRate: event.target.value }))} /></label>
              <label><span>Kalem Türü</span><select value={lineEditor.lineType} onChange={(event) => setLineEditor((prev) => ({ ...prev, lineType: event.target.value }))}><option value="MODEL">Model Takipli</option><option value="OTHER">Model Dışı</option></select></label>
            </div>
            {detail?.cariStatus === "CARI_PROCESSED" ? <div className="sales-message success">Cari kaydı oluştuğu için finansal alanlar korunur; açıklama ve kalem türü düzenlenebilir.</div> : null}
            <div className="sales-modal-actions"><button className="sales-btn" type="button" onClick={() => setLineEditor(null)}>Vazgeç</button><button className="sales-btn primary" type="button" disabled={busy} onClick={saveLine}>Değişiklikleri Kaydet</button></div>
          </div>
        </div>
      ) : null}

      {previewOpen && detail ? (
        <div className="sales-modal-backdrop" onMouseDown={() => setPreviewOpen(false)}>
          <div className="sales-modal invoice" onMouseDown={(event) => event?.stopPropagation()}>
            <div className="sales-modal-head">
              <div>
                <strong>Fatura Önizleme</strong>
                <span>{detail?.invoiceNo}</span>
              </div>
              <div className="sales-actions">
                <button className="sales-btn" type="button" onClick={() => window.print()}>
                  <Printer size={15} /> Yazdır
                </button>
                <button className="sales-btn icon" type="button" onClick={() => setPreviewOpen(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <article className="sales-invoice-paper">
              <header>
                <div>
                  <h2>{detail?.raw?.issuerName || activeMainCompany?.name}</h2>
                  <p>Vergi No: {detail?.raw?.issuerTaxNo || "-"}</p>
                </div>
                <div>
                  <b>{detail?.invoiceNo}</b>
                  <p>{date(detail?.invoiceDate)}</p>
                </div>
              </header>
              <section>
                <strong>Sayın {detail?.companyName}</strong>
                <p>
                  Vergi Dairesi / No: {detail?.companyTaxOffice || "-"} /{" "}
                  {detail?.companyTaxNo || "-"}
                </p>
              </section>
              <table>
                <thead>
                  <tr>
                    <th>Açıklama</th>
                    <th>Miktar</th>
                    <th>Birim Fiyat</th>
                    <th>KDV</th>
                    <th>Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.lines || []).map((line) => (
                    <tr key={line?.id}>
                      <td>{line?.description}</td>
                      <td>{number(line?.quantity)} {line?.unit}</td>
                      <td>{money(line?.unitPrice)}</td>
                      <td>%{number(line?.vatRate)}</td>
                      <td>{money(line?.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <footer>
                <span>Matrah: {money(detail?.subtotal)}</span>
                <span>KDV: {money(detail?.vatTotal)}</span>
                <b>Genel Toplam: {money(detail?.grandTotal)}</b>
              </footer>
              {detail?.files?.length ? (
                <div className="sales-file-list">
                  {(detail?.files || []).map((file) => (
                    <a
                      key={file?.id}
                      href={buildApiUrl(file?.url, params)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText size={15} /> {file?.fileName}
                    </a>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
        </div>
      ) : null}

      {picker ? (
        <div className="sales-modal-backdrop" onMouseDown={() => setPicker(null)}>
          <div className="sales-modal models" onMouseDown={(event) => event?.stopPropagation()}>
            <div className="sales-modal-head">
              <div>
                <strong>Desen Havuzundan Model Seç</strong>
                <span>{picker.description}</span>
              </div>
              <button className="sales-btn icon" type="button" onClick={() => setPicker(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="sales-picker-body">
              <label className="sales-search">
                <Search size={16} />
                <input
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event?.target.value)}
                  placeholder="Model, firma veya baskı bölgesi ara"
                />
              </label>
              <div className="sales-model-grid">
                {filteredModels.map((model) => (
                  <button
                    key={model?.id}
                    className={`sales-model ${selectedModel?.id === model?.id ? "selected" : ""}`}
                    type="button"
                    onClick={() => chooseModel(model)}
                  >
                    {model?.thumbnail || model?.imageUrl || model?.desenImageThumb ? (
                      <img
                        src={model?.thumbnail || model?.imageUrl || model?.desenImageThumb}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="sales-model-placeholder">
                        <FileText size={28} />
                      </div>
                    )}
                    <strong>{model?.modelName || model?.modelAdi}</strong>
                    <span>{model?.firmaAdi || model?.firmName || "Firma yok"}</span>
                    <small>{model?.baskiBolgesi || "Baskı bölgesi seçilecek"}</small>
                  </button>
                ))}
              </div>
              {selectedModel ? (
                <div className="sales-match-form">
                  <div>
                    <span>Seçilen Model</span>
                    <b>{selectedModel?.modelName || selectedModel?.modelAdi}</b>
                  </div>
                  <label>
                    <span>Baskı Bölgesi Seç</span>
                    <select value={regionId} onChange={(event) => setRegionId(event?.target.value)}>
                      <option value="">Bölgesiz</option>
                      {regions.map((region) => (
                        <option key={region.id || region.regionCode} value={region.id || region.regionCode}>
                          {region.regionName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Eşleşen Adet</span>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      max={picker.remainingQuantity}
                      value={matchQuantity}
                      onChange={(event) => setMatchQuantity(event?.target.value)}
                    />
                  </label>
                  <button
                    className="sales-btn primary"
                    type="button"
                    onClick={saveModelLink}
                    disabled={busy || !matchQuantity}
                  >
                    <Link2 size={16} /> Fatura Kalemini Bağla
                  </button>
                </div>
              ) : (
                <div className="sales-picker-hint">
                  <CircleAlert size={17} /> Baskı bölgesi ve adet seçimi için bir
                  model seçin.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
