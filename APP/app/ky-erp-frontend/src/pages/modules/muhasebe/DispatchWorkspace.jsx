import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Factory,
  FileCheck2,
  FileText,
  FileSearch,
  Filter,
  History,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  PackageOpen,
  RefreshCw,
  Search,
  Truck,
  Unlink,
  Upload,
  X,
  CircleDollarSign,
  ClipboardCheck,
  FileWarning,
  Mail,
} from "lucide-react";
import { apiGet, apiUrl } from "../../../utils/api";
import { getIsnetPortalDocumentFile } from "../../../services/isnetApi";
import {
  addCustomerDispatchProduction,
  addDispatchNonBillable,
  approveDispatchInvoiceMatch,
  approveDispatchPartial,
  approveDispatchPartials,
  resolveDispatchReview,
  resolveDispatchReviews,
  getCustomerDispatchDetail,
  getCustomerDispatches,
  getCustomerDispatchSummary,
  getInvoiceCandidates,
  createCustomerDispatchModel,
  linkCustomerDispatchModel,
  matchDispatchInvoice,
  recalculateDispatchInvoices,
  rejectDispatchInvoiceMatch,
  removeDispatchInvoiceMatch,
  removeDispatchNonBillable,
  unlinkCustomerDispatchModel,
  updateCustomerDispatchLine,
  uploadCustomerDispatches,
} from "../../../services/dispatchReconciliationApi";
import "./dispatchWorkspace.css";

const STATUS_LABELS = {
  INVOICE_PENDING: "Fatura Kesilmedi",
  PARTIAL: "Kısmi Faturalandırıldı",
  INVOICED: "Tam Faturalandırıldı",
  CLOSED_WITH_NON_BILLABLE: "Tamamlandı",
  OVER_INVOICED: "Fazla Faturalandırıldı",
  REVIEW_REQUIRED: "Kontrol Gerekiyor",
  DUPLICATE_REVIEW: "Mükerrer Kontrolü",
  MODEL_PENDING: "Model Bekliyor",
  MODEL_LINKED: "Model Bağlı",
  PRODUCTION_PENDING: "İmalat Bekliyor",
  PRODUCTION_PARTIAL: "İmalat Kısmi",
  PRODUCTION_COMPLETE: "İmalat Tamam",
  PRODUCTION_OVER: "İmalat Fazla",
  COMPLETED: "Tamamlandı",
  OPEN: "Açık",
};

const FILTER_DEFAULTS = {
  q: "",
  dateFrom: "",
  dateTo: "",
  invoiceStatus: "",
  modelStatus: "",
  productionStatus: "",
  openOnly: false,
};

function modelAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || /^[a-z]:[\\/]/i.test(raw) || raw.startsWith("\\\\")) return "";
  if (/^(blob:|data:|https:\/\/)/i.test(raw)) return raw;
  if (/^(uploads|model-previews|model-files)\//i.test(raw))
    return apiUrl(`/storage/${raw}`);
  if (/^storage\//i.test(raw)) return apiUrl(`/${raw}`);
  return apiUrl(raw.startsWith("/") ? raw : `/${raw}`);
}

async function openIsnetPdf(document) {
  if (!document?.sourceId || !document?.direction || !document?.kind) {
    throw new Error("Bu belge için İşNet PDF kaydı bulunamadı.");
  }
  const preview = window.open("", "_blank");
  try {
    const blob = await getIsnetPortalDocumentFile(document, "pdf");
    const url = URL.createObjectURL(blob);
    if (preview) preview.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    preview?.close();
    throw error;
  }
}

function n(value) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(
    Number.isFinite(numeric) ? numeric : 0,
  );
}

function date(value) {
  if (!value) return "-";
  const raw =
    typeof value === "object"
      ? value.date ||
        value.value ||
        value.iso ||
        value.dateText ||
        value.$date ||
        ""
      : value;
  if (!raw) return "-";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? String(raw)
    : parsed.toLocaleDateString("tr-TR");
}

function candidateReason(candidate) {
  const fields = candidate?.score?.matchedFields || [];
  const labels = [];
  if (fields.includes("productCode")) labels.push("ürün kodu aynı");
  else if (fields.includes("description"))
    labels.push("ürün açıklaması benzer");
  if (fields.includes("quantity")) labels.push("adet uyumlu");
  if (fields.includes("dispatchNo")) labels.push("irsaliye referansı var");
  if (fields.includes("orderNo")) labels.push("sipariş referansı var");
  if (fields.includes("date")) labels.push("tarih aralığı uygun");
  return labels.join(" · ") || "Firma ve belge bilgileri yakın";
}

function tone(status) {
  if (["INVOICED", "CLOSED_WITH_NON_BILLABLE", "COMPLETED", "PRODUCTION_COMPLETE"].includes(status))
    return "green";
  if (["PARTIAL", "PRODUCTION_PARTIAL"].includes(status)) return "orange";
  if (["OVER_INVOICED", "DUPLICATE_REVIEW"].includes(status)) return "burgundy";
  if (["REVIEW_REQUIRED", "PRODUCTION_OVER"].includes(status)) return "yellow";
  if (["MODEL_PENDING"].includes(status)) return "purple";
  return "red";
}

function controlReason(row) {
  const pending = (row?.matches || []).filter((match) =>
    ["REVIEW_REQUIRED", "DUPLICATE_REVIEW"].includes(String(match?.status || "").toUpperCase()),
  );
  if (Number(row?.overCoveredQty || 0) > 0) return `Toplam kapanan adet ${n(row.overCoveredQty)} fazla.`;
  if (Number(row?.overInvoicedQty || 0) > 0) return `Faturalanan adet ${n(row.overInvoicedQty)} fazla.`;
  if (pending.length) {
    const invoices = [...new Set(pending.map((match) => match?.invoice?.documentNo).filter(Boolean))];
    return `${n(pending.length)} fatura eşleştirme önerisi bekliyor${invoices.length ? `: ${invoices.join(", ")}` : "."}`;
  }
  return "Adet veya eşleştirme kontrolü gerekiyor.";
}

function Status({ value }) {
  return (
    <span className={`dw-status ${tone(value)}`}>
      {STATUS_LABELS[value] || value || "-"}
    </span>
  );
}

function unwrapRows(payload) {
  const candidate = payload?.data ?? payload?.rows ?? payload?.items ?? payload;
  return Array.isArray(candidate)
    ? candidate
    : Array.isArray(candidate?.rows)
      ? candidate.rows
      : [];
}

function groupRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.dispatchId || row.id;
    const group = map.get(key) || {
      id: key,
      dispatchNo: row.dispatchNo,
      dispatchDate: row.dispatchDate,
      companyName: row.companyName,
      orderNo: row.orderNo,
      lines: [],
    };
    group.lines.push(row);
    map.set(key, group);
  });
  return Array.from(map.values());
}

function MetricCard({ label, value, sub, toneName, active, onClick, icon }) {
  return (
    <button
      type="button"
      className={`dw-metric ${toneName} ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span>
        {createElement(icon || Boxes, { size: 17 })}
        {label}
      </span>
      <strong>{n(value)}</strong>
      <small>{sub || "Kayıt"}</small>
    </button>
  );
}

function exportExcel(rows, fileName) {
  const columns = [
    ["Firma", "companyName"],
    ["İrsaliye Tarihi", "dispatchDate"],
    ["İrsaliye No", "dispatchNo"],
    ["Piyon / Sipariş No", "orderNo"],
    ["Ürün Açıklaması", "description"],
    ["Bağlı Model", "modelName"],
    ["İrsaliye Adedi", "dispatchQty"],
    ["İmalat Adedi", "productionQty"],
    ["İmalat Kalan", "productionRemainingQty"],
    ["Faturalanan Adet", "invoicedQty"],
    ["Ücretsiz / Bedelsiz Adet", "nonBillableQty"],
    ["Toplam Kapanan Adet", "coveredQty"],
    ["Fatura Kalan", "invoiceRemainingQty"],
    ["Fazla İmalat", "overProductionQty"],
    ["Fazla Fatura", "overInvoicedQty"],
    ["Model Durumu", "modelStatus"],
    ["İmalat Durumu", "productionStatus"],
    ["Fatura Durumu", "invoiceStatus"],
    ["Genel Durum", "overallStatus"],
  ];
  const escape = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map(([, key]) => `<td>${escape(key.endsWith("Date") ? date(row[key]) : STATUS_LABELS[row[key]] || row[key])}</td>`).join("")}</tr>`,
    )
    .join("");
  const totals = `<tr><th colspan="6">TOPLAMLAR</th><th>${n(rows.reduce((t, r) => t + Number(r.dispatchQty || 0), 0))}</th><th>${n(rows.reduce((t, r) => t + Number(r.productionQty || 0), 0))}</th><th>${n(rows.reduce((t, r) => t + Number(r.productionRemainingQty || 0), 0))}</th><th>${n(rows.reduce((t, r) => t + Number(r.invoicedQty || 0), 0))}</th><th>${n(rows.reduce((t, r) => t + Number(r.invoiceRemainingQty || 0), 0))}</th><th colspan="6"></th></tr>`;
  const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${columns.map(([label]) => `<th>${escape(label)}</th>`).join("")}</tr></thead><tbody>${body}${totals}</tbody></table></body></html>`;
  const url = URL.createObjectURL(
    new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalized(value) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function UploadPanel({ mode, onClose, onComplete }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const choose = (list) =>
    setFiles(
      mode === "single"
        ? Array.from(list || []).slice(0, 1)
        : Array.from(list || []),
    );
  const submit = async () => {
    if (!files.length) return;
    setBusy(true);
    setMessage("");
    try {
      await uploadCustomerDispatches(files);
      const result = await recalculateDispatchInvoices();
      setMessage(
        `${files.length} dosya işlendi. ${Number(result.processed || 0)} eşleşme değerlendirildi.`,
      );
      await onComplete();
      setFiles([]);
    } catch (error) {
      setMessage(error?.message || "Dosyalar yüklenemedi.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="dw-upload-panel">
      <div className="dw-upload-copy">
        <div className="dw-upload-icon">
          <Upload size={24} />
        </div>
        <div>
          <h3>{mode === "single" ? "İrsaliye Yükle" : "Toplu Dosya Yükle"}</h3>
          <p>
            XML, PDF, ZIP, XLSX, CSV, JPG ve PNG dosyaları gerçek belge havuzuna
            kaydedilir.
          </p>
        </div>
      </div>
      <button className="dw-close" type="button" onClick={onClose}>
        <X size={18} />
      </button>
      <button
        className="dw-drop"
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        <PackageOpen size={24} />
        <b>
          {files.length
            ? `${files.length} dosya seçildi`
            : "Dosya seçin veya buraya bırakın"}
        </b>
        <span>Dosya başına 50 MB</span>
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        multiple={mode !== "single"}
        accept=".xml,.pdf,.zip,.xlsx,.csv,.jpg,.jpeg,.png"
        onChange={(event) => choose(event.target.files)}
      />
      <div className="dw-file-list">
        {files.map((file) => (
          <span key={`${file.name}-${file.size}`}>
            {file.name}
            <small>{n(file.size / 1024)} KB</small>
          </span>
        ))}
      </div>
      {message ? (
        <div
          className={
            message.includes("yüklenemedi") ? "dw-message error" : "dw-message"
          }
        >
          {message}
        </div>
      ) : null}
      <div className="dw-upload-actions">
        <button
          type="button"
          className="dw-btn"
          onClick={() => inputRef.current?.click()}
        >
          Dosya Seç
        </button>
        <button
          type="button"
          className="dw-btn primary"
          disabled={!files.length || busy}
          onClick={submit}
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Upload size={16} />
          )}
          {busy ? "İşleniyor" : "Yükle ve Eşleştir"}
        </button>
      </div>
    </section>
  );
}

function DetailDrawer({ row, onClose, onChanged }) {
  const [detail, setDetail] = useState(row);
  const [models, setModels] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [modelId, setModelId] = useState(row?.modelId || "");
  const [modelSearch, setModelSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [showNewModel, setShowNewModel] = useState(false);
  const [production, setProduction] = useState({
    quantity: "",
    productionDate: new Date().toISOString().slice(0, 10),
    shift: "",
    machineName: "",
    machinist: "",
    printArea: "",
  });
  const [match, setMatch] = useState({
    invoiceLineId: "",
    matchedQty: "",
    note: "",
  });
  const [nonBillable, setNonBillable] = useState({
    category: "TEST_SAMPLE",
    quantity: "",
    deliveryMethod: "ELDEN_TESLIM",
    note: "",
  });
  const load = useCallback(async () => {
    if (!row?.dispatchLineId) return;
    const [next, candidateRows] = await Promise.all([
      getCustomerDispatchDetail(row.dispatchLineId),
      getInvoiceCandidates(row.dispatchLineId),
    ]);
    setDetail(next || row);
    setCandidates(Array.isArray(candidateRows) ? candidateRows : []);
  }, [row]);
  useEffect(() => {
    getCustomerDispatchDetail(row.dispatchLineId)
      .then((next) => setDetail(next || row))
      .catch((error) => setNotice(error.message));
  }, [row]);
  useEffect(() => {
    Promise.all([
      apiGet("/models", { page: 1, pageSize: 5000 }),
      getInvoiceCandidates(row.dispatchLineId),
    ])
      .then(([modelPayload, candidateRows]) => {
        setModels(unwrapRows(modelPayload));
        setCandidates(Array.isArray(candidateRows) ? candidateRows : []);
      })
      .catch(() => {});
  }, [row.dispatchLineId]);
  const act = async (fn, success) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      setNotice(success);
      await load();
      await onChanged();
    } catch (error) {
      setNotice(error?.message || "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };
  const showPdf = async (document) => {
    setNotice("");
    try {
      await openIsnetPdf(document);
    } catch (error) {
      setNotice(error?.message || "Belge PDF'i açılamadı.");
    }
  };
  const visibleModels = useMemo(() => {
    const query = modelSearch.trim().toLocaleLowerCase("tr-TR");
    const rows = query
      ? models.filter((model) =>
          [model.modelName, model.name, model.modelAdi, model.modelCode, model.code]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("tr-TR")
            .includes(query),
        )
      : models;
    return rows.slice(0, 24);
  }, [modelSearch, models]);
  const candidateSearch = invoiceSearch.trim().toLocaleLowerCase("tr-TR");
  const visibleCandidates = candidates.filter((item) =>
    !candidateSearch ||
    String(item?.invoice?.documentNo || "")
      .toLocaleLowerCase("tr-TR")
      .includes(candidateSearch),
  );
  const suggestedCandidates = visibleCandidates.filter(
    (item) => !item?.score?.manualOnly,
  );
  const manualCandidates = visibleCandidates.filter((item) => item?.score?.manualOnly);
  const matchQuantityFor = (item) => {
    const remaining = Number(detail?.invoiceRemainingQty || 0);
    const invoiceQuantity = Number(item?.quantity || 0);
    if (invoiceQuantity <= 0) return remaining > 0 ? remaining : "";
    return remaining > 0 ? Math.min(invoiceQuantity, remaining) : invoiceQuantity;
  };
  return (
    <div
      className="dw-drawer-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="dw-drawer" data-modal-size-key="irsaliye-detay">
        <header>
          <div>
            <span>İRSALİYE KALEMİ</span>
            <h2>{detail?.dispatchNo || "İrsaliye Detayı"}</h2>
            <p>
              {detail?.companyName} · {detail?.description}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="dw-reconcile-strip">
          <div>
            <span>İrsaliye</span>
            <b>{n(detail?.dispatchQty)}</b>
          </div>
          <div>
            <span>İmalat</span>
            <b>{n(detail?.productionQty)}</b>
          </div>
          <div>
            <span>Faturalanan</span>
            <b>{n(detail?.invoicedQty)}</b>
          </div>
          <div>
            <span>Ücretsiz / Test</span>
            <b>{n(detail?.nonBillableQty)}</b>
          </div>
          <Status value={detail?.overallStatus} />
        </div>
        {notice ? <div className="dw-message">{notice}</div> : null}
        <div className="dw-drawer-scroll">
          <details open>
            <summary>
              <Truck size={17} /> İrsaliye Bilgileri <ChevronDown size={16} />
            </summary>
            <div className="dw-detail-grid">
              <label>
                Firma<b>{detail?.companyName || "-"}</b>
              </label>
              <label>
                Vergi No<b>{detail?.taxNo || "-"}</b>
              </label>
              <label>
                İrsaliye Tarihi<b>{date(detail?.dispatchDate)}</b>
              </label>
              <label>
                İrsaliye No<b>{detail?.dispatchNo || "-"}</b>
              </label>
              <label>
                Piyon / Sipariş<b>{detail?.orderNo || "-"}</b>
              </label>
              <label>
                Ürün Açıklaması<b>{detail?.description || "-"}</b>
              </label>
              <label>
                Yüklenme Tarihi<b>{date(detail?.createdAt)}</b>
              </label>
              <label>
                Kaynak Dosya
                <b>
                  {detail?.sourceFiles
                    ?.map((file) => file.fileName)
                    .join(", ") || "-"}
                </b>
              </label>
            </div>
            <div className="dw-inline-form">
              <button type="button" disabled={!detail?.isnetDocument?.hasPdf} onClick={() => showPdf(detail?.isnetDocument)}>
                <FileText size={15} /> İrsaliye PDF Aç
              </button>
              <input
                type="number"
                min="0"
                defaultValue={detail?.dispatchQty}
                id="dw-dispatch-qty"
              />
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  act(
                    () =>
                      updateCustomerDispatchLine(detail.dispatchLineId, {
                        dispatchQty:
                          document.getElementById("dw-dispatch-qty")?.value,
                      }),
                    "İrsaliye adedi güncellendi.",
                  )
                }
              >
                Adedi Güncelle
              </button>
            </div>
          </details>
          <details open>
            <summary>
              <Link2 size={17} /> Model / Desen Bağlantısı{" "}
              <ChevronDown size={16} />
            </summary>
            <div className="dw-model-current">
              <div className="dw-model-placeholder">
                {modelAssetUrl(detail?.modelImageUrl) ? (
                  <img
                    src={modelAssetUrl(detail.modelImageUrl)}
                    alt={detail?.modelName || "Model görseli"}
                  />
                ) : (
                  <Boxes size={25} />
                )}
              </div>
              <div>
                <span>Bağlı model</span>
                <b>{detail?.modelName || "Henüz model bağlanmadı"}</b>
                <small>{STATUS_LABELS[detail?.modelStatus]}</small>
              </div>
            </div>
            <div className="dw-model-workspace">
              <div className="dw-model-search">
                <Search size={16} />
                <input
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder="Model adı veya kodu ile ara"
                />
                <button type="button" onClick={() => setShowNewModel((value) => !value)}>
                  Yeni model oluştur
                </button>
              </div>
              {showNewModel ? (
                <div className="dw-model-create">
                  <div>
                    <b>Yeni model</b>
                    <span>İrsaliye açıklamasını başlangıç adı olarak kullanabilirsiniz.</span>
                  </div>
                  <input
                    value={newModelName}
                    onChange={(event) => setNewModelName(event.target.value)}
                    placeholder={detail?.description || "Model adı"}
                  />
                  <button
                    type="button"
                    disabled={busy || !newModelName.trim()}
                    onClick={() =>
                      act(
                        () => createCustomerDispatchModel(detail.dispatchLineId, {
                          modelName: newModelName.trim(),
                          confirmed: true,
                        }),
                        "Yeni model oluşturuldu ve irsaliye kalemine bağlandı.",
                      )
                    }
                  >
                    Oluştur ve bağla
                  </button>
                </div>
              ) : null}
              <div className="dw-model-results">
                {visibleModels.map((model) => {
                  const id = model.id || model.modelId;
                  const name = model.modelName || model.name || model.modelAdi;
                  const selected = String(modelId) === String(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`dw-model-option${selected ? " selected" : ""}`}
                      onClick={() => setModelId(id)}
                    >
                      <span className="dw-model-thumb">
                        {modelAssetUrl(model.imageUrl || model.modelImageUrl) ? (
                          <img src={modelAssetUrl(model.imageUrl || model.modelImageUrl)} alt="" />
                        ) : (
                          <Boxes size={20} />
                        )}
                      </span>
                      <span>
                        <b>{name || "Adsız model"}</b>
                        <small>{model.modelCode || model.code || "Kod yok"}</small>
                      </span>
                      {selected ? <CheckCircle2 size={18} /> : null}
                    </button>
                  );
                })}
                {!visibleModels.length ? (
                  <p>Aramaya uygun model bulunamadı. Yeni model oluşturabilirsiniz.</p>
                ) : null}
              </div>
              <div className="dw-model-actions">
                <button
                  className="dw-btn primary"
                  disabled={busy || !modelId}
                  type="button"
                  onClick={() =>
                    act(
                      () => linkCustomerDispatchModel(detail.dispatchLineId, { modelId }),
                      "Model bağlantısı kaydedildi.",
                    )
                  }
                >
                  Seçili modeli bağla
                </button>
                {detail?.modelId ? (
                  <button
                    className="dw-btn"
                    disabled={busy}
                    type="button"
                    onClick={() =>
                      act(
                        () => unlinkCustomerDispatchModel(detail.dispatchLineId),
                        "Model bağlantısı kaldırıldı.",
                      )
                    }
                  >
                    <Unlink size={15} /> Bağlantıyı kaldır
                  </button>
                ) : null}
              </div>
            </div>
          </details>
          <details>
            <summary>
              <Factory size={17} /> İmalat Kayıtları{" "}
              <span>{n(detail?.productionQty)} adet</span>
              <ChevronDown size={16} />
            </summary>
            <div className="dw-record-list">
              {detail?.productions?.length ? (
                detail.productions.map((item) => (
                  <article key={item.id}>
                    <b>
                      {date(item.productionDate)} · {n(item.totalQuantity)} adet
                    </b>
                    <span>
                      {[
                        item.shift,
                        item.machineName,
                        item.printArea,
                        item.machinist,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Detay girilmedi"}
                    </span>
                  </article>
                ))
              ) : (
                <p>Bu kaleme bağlı imalat kaydı yok.</p>
              )}
            </div>
            <div className="dw-form-grid">
              <input
                type="number"
                min="1"
                placeholder="Adet *"
                value={production.quantity}
                onChange={(e) =>
                  setProduction({ ...production, quantity: e.target.value })
                }
              />
              <input
                type="date"
                value={production.productionDate}
                onChange={(e) =>
                  setProduction({
                    ...production,
                    productionDate: e.target.value,
                  })
                }
              />
              <input
                placeholder="Vardiya"
                value={production.shift}
                onChange={(e) =>
                  setProduction({ ...production, shift: e.target.value })
                }
              />
              <input
                placeholder="Makine"
                value={production.machineName}
                onChange={(e) =>
                  setProduction({ ...production, machineName: e.target.value })
                }
              />
              <input
                placeholder="Bölge"
                value={production.printArea}
                onChange={(e) =>
                  setProduction({ ...production, printArea: e.target.value })
                }
              />
              <input
                placeholder="Makinacı"
                value={production.machinist}
                onChange={(e) =>
                  setProduction({ ...production, machinist: e.target.value })
                }
              />
              <button
                type="button"
                disabled={busy || !production.quantity}
                onClick={() =>
                  act(
                    () =>
                      addCustomerDispatchProduction(
                        detail.dispatchLineId,
                        production,
                      ),
                    "İmalat kaydı eklendi.",
                  )
                }
              >
                Yeni İmalat Gir
              </button>
            </div>
          </details>
          <details open>
            <summary>
              <FileCheck2 size={17} /> Fatura Eşleşmeleri{" "}
              <span>{detail?.matches?.length || 0} kayıt</span>
              <ChevronDown size={16} />
            </summary>
            <div className="dw-record-list">
              {detail?.matches?.length ? (
                detail.matches.map((item) => (
                  <article key={item.id} className="invoice" onDoubleClick={() => showPdf(item.invoice?.isnetDocument)} title="Faturayı açmak için çift tıklayın">
                    <div>
                      <b>
                        {item.invoice?.documentNo || "Fatura"} ·{" "}
                        {n(item.matchedQty)} adet
                      </b>
                      <span>
                        {item.matchType} · %{item.confidence} ·{" "}
                        {date(item.invoice?.date)}
                      </span>
                      {Math.abs(
                        Number(detail?.dispatchQty || 0) -
                          Number(item.invoiceLine?.quantity || item.matchedQty || 0),
                      ) > 0.0001 ? (
                        <span className="dw-quantity-difference">
                          Adet farkı: {n(
                            Number(detail?.dispatchQty || 0) -
                              Number(item.invoiceLine?.quantity || item.matchedQty || 0),
                          )}
                        </span>
                      ) : null}
                    </div>
                    <Status
                      value={
                        item.status === "ACTIVE" || item.status === "APPROVED"
                          ? detail.invoiceStatus
                          : item.status
                      }
                    />
                    <div className="dw-mini-actions">
                      <button type="button" disabled={!item.invoice?.isnetDocument?.hasPdf} onClick={() => showPdf(item.invoice?.isnetDocument)}>
                        PDF Aç
                      </button>
                      {["REVIEW_REQUIRED", "DUPLICATE_REVIEW"].includes(
                        item.status,
                      ) ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              act(
                                () =>
                                  approveDispatchInvoiceMatch(item.id, {
                                    matchedQty: item.invoiceLine?.quantity,
                                    note:
                                      "Adet farkı kullanıcı bilgisi dahilinde onaylandı.",
                                  }),
                                "Adet farkı bilginiz dahilinde onaylandı.",
                              )
                            }
                          >
                            Fark bilgim dahilinde onayla
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              act(
                                () => rejectDispatchInvoiceMatch(item.id),
                                "Eşleşme reddedildi.",
                              )
                            }
                          >
                            Reddet
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          act(
                            () => removeDispatchInvoiceMatch(item.id),
                            "Eşleşme kaldırıldı.",
                          )
                        }
                      >
                        Kaldır
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p>Bağlı fatura kalemi yok.</p>
              )}
            </div>
            <div className="dw-form-grid match">
              <input
                value={invoiceSearch}
                onChange={(event) => setInvoiceSearch(event.target.value)}
                placeholder="Fatura no ile ara"
              />
            </div>
            {detail?.invoiceRemainingQty > 0 && suggestedCandidates.length ? (
              <div className="dw-candidate-list">
                <div className="dw-candidate-head">
                  <b>Yakın fatura eşleşmeleri</b>
                  <span>
                    Sistem kesin bağlayamadığı adayları güven puanıyla sıraladı.
                  </span>
                </div>
                {suggestedCandidates.slice(0, 5).map((item) => (
                  <article key={item.id}>
                    <div>
                      <b>
                        {item.invoice?.documentNo || "Fatura"} ·{" "}
                        {n(item.quantity)} adet
                      </b>
                      <span>
                        {item.description || item.productName || "Açıklama yok"}
                      </span>
                      <small>
                        %{item.score?.confidence || 0} güven ·{" "}
                        {candidateReason(item)} · {date(item.invoice?.date)}
                      </small>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () =>
                            matchDispatchInvoice(detail.dispatchLineId, {
                              invoiceLineId: item.id,
                              matchedQty: matchQuantityFor(item),
                              note: `Yakın eşleşme kullanıcı tarafından onaylandı (%${item.score?.confidence || 0})`,
                            }),
                          "Yakın fatura eşleşmesi bağlandı.",
                        )
                      }
                    >
                      Yakın Eşleştir
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
            {detail?.invoiceRemainingQty > 0 && manualCandidates.length ? (
              <div className="dw-candidate-list manual">
                <div className="dw-candidate-head">
                  <b>Sistemin bulamadığı kesilmiş faturalar</b>
                  <span>
                    Aynı firmaya ait, henüz başka irsaliyeye bağlanmamış faturayı
                    seçip bu irsaliyeye manuel olarak bağlayın.
                  </span>
                </div>
                {manualCandidates.map((item) => (
                  <article key={item.id}>
                    <div>
                      <b>
                        {item.invoice?.documentNo || "Fatura"} · {n(item.quantity)} adet
                      </b>
                      <span>{item.description || item.productName || "Açıklama yok"}</span>
                      <small>{date(item.invoice?.date)} · Manuel seçim gerekir</small>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setMatch({
                          ...match,
                          invoiceLineId: item.id,
                          matchedQty: matchQuantityFor(item),
                          note: "Kesilmiş fatura kullanıcı tarafından bu irsaliyeye manuel bağlandı.",
                        })
                      }
                    >
                      Faturayı Seç
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="dw-form-grid match">
              <select
                value={match.invoiceLineId}
                onChange={(e) => {
                  const candidate = candidates.find(
                    (item) => item.id === e.target.value,
                  );
                  setMatch({
                    ...match,
                    invoiceLineId: e.target.value,
                    matchedQty: candidate ? matchQuantityFor(candidate) : "",
                  });
                }}
              >
                <option value="">Diğer fatura kalemlerinden seçin</option>
                {candidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.invoice?.documentNo} ·{" "}
                    {item.description || item.productName} · {n(item.quantity)}{" "}
                    adet · {item.score?.manualOnly ? "manuel seçim" : `%${item.score?.confidence}`}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0.01"
                placeholder="Eşleşen adet"
                value={match.matchedQty}
                onChange={(e) =>
                  setMatch({ ...match, matchedQty: e.target.value })
                }
              />
              <input
                placeholder="Kontrol açıklaması"
                value={match.note}
                onChange={(e) => setMatch({ ...match, note: e.target.value })}
              />
              <button
                type="button"
                disabled={busy || !match.invoiceLineId || !match.matchedQty}
                onClick={() =>
                  act(
                    () => matchDispatchInvoice(detail.dispatchLineId, match),
                    "Fatura kalemi bağlandı.",
                  )
                }
              >
                Seçili Faturayı Eşleştir
              </button>
            </div>
          </details>
          <details open>
            <summary>
              <PackageOpen size={17} /> Ücretsiz / Bedelsiz Adetler{" "}
              <span>{detail?.nonBillableAllocations?.length || 0} kayıt</span>
              <ChevronDown size={16} />
            </summary>
            <div className="dw-gap-summary">
              <span>İrsaliye <b>{n(detail?.dispatchQty)}</b></span>
              <span>Fatura satırları toplamı <b>{n(detail?.invoicedQty)}</b></span>
              <span className={Number(detail?.invoiceRemainingQty || 0) > 0 ? "has-gap" : "closed"}>Aradaki fark <b>{n(detail?.invoiceRemainingQty)}</b></span>
            </div>
            {detail?.invoiceNonBillableSuggestions?.length ? (
              <div className="dw-invoice-detections">
                <strong>Faturadan otomatik tespit edildi</strong>
                {detail.invoiceNonBillableSuggestions.map((item) => (
                  <span key={item.invoiceLineId}>
                    <b>{item.description}</b>
                    <i>{n(item.quantity)} adet · 0 TL · {item.invoiceNo}</i>
                  </span>
                ))}
                <small>
                  {detail.invoiceAutoClosable
                    ? "Bu satırların toplamı açık adetle aynı; sistem doğrudan sınıflandırıp kapatabilir."
                    : "Toplam açıkla eşleşmediği için otomatik kapatma yapılmayacak."}
                </small>
              </div>
            ) : null}
            <div className="dw-record-list">
              {detail?.nonBillableAllocations?.length ? detail.nonBillableAllocations.map((item) => (
                <article key={item.id}>
                  <div>
                    <b>{({ TEST_SAMPLE: "Test / Numune", FABRIC_DEFECT: "Kumaş Sakatı", PRINT_DEFECT: "Baskı Sakatı", OTHER_NON_BILLABLE: "Diğer Ücretsiz" })[item.category] || item.category} · {n(item.quantity)} adet</b>
                    <span>Elden teslim · TL uygulanmaz{item.note ? ` · ${item.note}` : ""}</span>
                  </div>
                  <div className="dw-mini-actions">
                    <button type="button" disabled={busy} onClick={() => act(() => removeDispatchNonBillable(detail.dispatchLineId, item.id), "Ücretsiz adet kaydı kaldırıldı.")}>Kaldır</button>
                  </div>
                </article>
              )) : <p>Henüz ücretsiz / bedelsiz adet kaydı yok.</p>}
            </div>
            <div className="dw-form-grid non-billable">
              <select value={nonBillable.category} onChange={(e) => setNonBillable({ ...nonBillable, category: e.target.value })}>
                <option value="TEST_SAMPLE">Test / Numune</option>
                <option value="FABRIC_DEFECT">Kumaş Sakatı</option>
                <option value="PRINT_DEFECT">Baskı Sakatı</option>
                <option value="OTHER_NON_BILLABLE">Diğer Ücretsiz</option>
              </select>
              <input type="number" min="0.01" max={detail?.invoiceRemainingQty || undefined} placeholder="Adet" value={nonBillable.quantity} onChange={(e) => setNonBillable({ ...nonBillable, quantity: e.target.value })} />
              <input placeholder="Açıklama (isteğe bağlı)" value={nonBillable.note} onChange={(e) => setNonBillable({ ...nonBillable, note: e.target.value })} />
              <button type="button" disabled={busy || !nonBillable.quantity} onClick={() => act(async () => { await addDispatchNonBillable(detail.dispatchLineId, nonBillable); setNonBillable({ ...nonBillable, quantity: "", note: "" }); }, "Ücretsiz adet kapanışa eklendi; TL uygulanmayacak.")}>Ücretsiz Adedi Kaydet</button>
              <button type="button" className="dw-approve-gap" disabled={busy || Number(detail?.invoiceRemainingQty || 0) <= 0} onClick={() => act(() => addDispatchNonBillable(detail.dispatchLineId, { ...nonBillable, quantity: detail.invoiceRemainingQty, note: nonBillable.note || `${n(detail.invoiceRemainingQty)} adet fark bilgim dahilinde onaylandı.` }), "Fark bilgim dahilinde onaylandı ve irsaliye toplamı kapatıldı.")}>
                {n(detail?.invoiceRemainingQty)} Adet Farkı Bilgim Dahilinde Onayla
              </button>
            </div>
          </details>
          <details open>
            <summary>
              <FileSearch size={17} /> Dörtlü Adet Mutabakatı{" "}
              <ChevronDown size={16} />
            </summary>
            <div className="dw-balance-grid">
              <label>
                İrsaliye<b>{n(detail?.dispatchQty)}</b>
              </label>
              <label>
                İmalat<b>{n(detail?.productionQty)}</b>
              </label>
              <label>
                Faturalanan<b>{n(detail?.invoicedQty)}</b>
              </label>
              <label>
                Ücretsiz / Test<b>{n(detail?.nonBillableQty)}</b>
              </label>
              <label>
                Toplam Kapanan<b>{n(detail?.coveredQty)}</b>
              </label>
              <label>
                İmalat Kalan<b>{n(detail?.productionRemainingQty)}</b>
              </label>
              <label>
                Fatura Kalan<b>{n(detail?.invoiceRemainingQty)}</b>
              </label>
              <label>
                İmalat Fazlası<b>{n(detail?.overProductionQty)}</b>
              </label>
              <label>
                Fatura Fazlası<b>{n(detail?.overInvoicedQty)}</b>
              </label>
              <label>
                İmalat – Fatura Farkı
                <b>{n(detail?.productionInvoiceDifference)}</b>
              </label>
            </div>
          </details>
          <details>
            <summary>
              <History size={17} /> İşlem Geçmişi{" "}
              <span>{detail?.history?.length || 0}</span>
              <ChevronDown size={16} />
            </summary>
            <div className="dw-timeline">
              {detail?.history?.length ? (
                detail.history.map((item) => (
                  <article key={item.id}>
                    <i></i>
                    <div>
                      <b>{item.description || item.action}</b>
                      <span>
                        {date(item.createdAt)} ·{" "}
                        {item.userId ||
                          (item.isAutomatic ? "Sistem" : "Kullanıcı")}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <p>Henüz işlem geçmişi yok.</p>
              )}
            </div>
          </details>
        </div>
      </aside>
    </div>
  );
}

export default function DispatchWorkspace({
  mode = "dispatches",
  portalDocuments = [],
  onOpenDispatch,
  onOpenInvoice,
  onOpenNewInvoice,
}) {
  const controlMode = mode === "control";
  const analysisMode = mode === "analysis";
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [filters, setFilters] = useState(() => ({
    ...FILTER_DEFAULTS,
    modelId: new URLSearchParams(window.location.search).get("modelId") || "",
  }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [uploadMode, setUploadMode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [recalculating, setRecalculating] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [selectedPartialIds, setSelectedPartialIds] = useState(new Set());
  const [selectedReviewIds, setSelectedReviewIds] = useState(new Set());
  const query = useMemo(
    () => ({ ...filters, page, limit: 50, operationMode: controlMode }),
    [filters, page, controlMode],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, metrics] = await Promise.all([
        getCustomerDispatches(query),
        getCustomerDispatchSummary({ ...filters, operationMode: controlMode }),
      ]);
      const receivedRows = Array.isArray(list?.rows) ? list.rows : [];
      const nextRows = receivedRows.filter((row) => {
        const allowed = row?.companyType === "CUSTOMER" || row?.companyType === "BOTH";
        if (!allowed && import.meta.env.DEV) {
          console.warn("Fatura Kesme Yardımcısı supplier/kimliği belirsiz kaydı reddetti", {
            id: row?.id,
            companyName: row?.companyName,
            companyType: row?.companyType,
          });
        }
        return allowed;
      });
      setRows(nextRows);
      setSelectedPartialIds((current) => new Set([...current].filter((id) => nextRows.some((row) => row.dispatchLineId === id && row.invoiceStatus === "PARTIAL"))));
      setSelectedReviewIds((current) => new Set([...current].filter((id) => nextRows.some((row) => row.dispatchLineId === id && row.invoiceStatus === "REVIEW_REQUIRED"))));
      setTotal(nextRows.length === receivedRows.length ? Number(list?.total || 0) : nextRows.length);
      setSummary(nextRows.length === receivedRows.length ? (metrics || {}) : {
        total: nextRows.length,
        totalDispatches: new Set(nextRows.map((row) => row.dispatchId).filter(Boolean)).size,
        modelPending: nextRows.filter((row) => row.modelStatus === "MODEL_PENDING").length,
        productionPending: nextRows.filter((row) => row.productionStatus !== "PRODUCTION_COMPLETE").length,
        invoicePending: nextRows.filter((row) => row.invoiceStatus === "INVOICE_PENDING").length,
        partial: nextRows.filter((row) => row.invoiceStatus === "PARTIAL").length,
        invoiced: nextRows.filter((row) => row.invoiceStatus === "INVOICED").length,
        closedWithNonBillable: nextRows.filter((row) => row.invoiceStatus === "CLOSED_WITH_NON_BILLABLE").length,
        reviewRequired: nextRows.filter((row) => row.invoiceStatus === "REVIEW_REQUIRED").length,
        duplicateReview: nextRows.filter((row) => row.invoiceStatus === "DUPLICATE_REVIEW").length,
        uninvoicedQty: nextRows.reduce((sum, row) => sum + Number(row.invoiceRemainingQty || 0), 0),
      });
    } catch (err) {
      setError(err?.message || "İrsaliyeler alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [query, filters, controlMode]);
  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  const groups = useMemo(() => groupRows(rows), [rows]);
  const outgoingDocuments = useMemo(
    () =>
      portalDocuments.filter(
        (row) => row.kind === "dispatch" && row.direction === "outgoing",
      ),
    [portalDocuments],
  );
  const incomingDocuments = useMemo(
    () =>
      portalDocuments.filter(
        (row) => row.kind === "dispatch" && row.direction === "incoming",
      ),
    [portalDocuments],
  );
  const documentFor = useCallback((documents, row) => {
    const dispatchNo = normalized(row?.dispatchNo);
    const model = normalized(row?.modelName || row?.description);
    const company = normalized(row?.companyName);
    return (
      documents.find((document) => {
        const documentNo = normalized(document.documentNo || document.number);
        if (dispatchNo && documentNo && dispatchNo === documentNo) return true;
        const documentModel = normalized(
          document.modelName || document.modelGuess || document.description,
        );
        const documentCompany = normalized(document.partnerName);
        if (!model || !documentModel) return false;
        const modelMatches =
          documentModel.includes(model) || model.includes(documentModel);
        const companyMatches =
          !company ||
          !documentCompany ||
          documentCompany.includes(company) ||
          company.includes(documentCompany);
        return modelMatches && companyMatches;
      }) || null
    );
  }, []);
  const incomingFor = useCallback(
    (row) => documentFor(incomingDocuments, row),
    [documentFor, incomingDocuments],
  );
  const approvePartial = useCallback(async (row) => {
    if (!row?.dispatchLineId || row.invoiceStatus !== "PARTIAL") return;
    setRecalculating(true);
    setError("");
    try {
      await approveDispatchPartial(row.dispatchLineId, {
        note: `${n(row.invoiceRemainingQty)} adet kısmi fark kullanıcı bilgisi dahilinde satır menüsünden onaylandı.`,
      });
      setAnalysisMessage(`${n(row.invoiceRemainingQty)} adet fark onaylandı; kayıt Tamamlanan sekmesine taşındı.`);
      setSelected(null);
      await load();
    } catch (approvalError) {
      setError(approvalError?.message || "Kısmi kayıt onaylanamadı.");
    } finally {
      setRecalculating(false);
    }
  }, [load]);
  const partialIds = useMemo(
    () => rows.filter((row) => row.invoiceStatus === "PARTIAL" && row.dispatchLineId).map((row) => row.dispatchLineId),
    [rows],
  );
  const reviewIds = useMemo(
    () => rows.filter((row) => row.invoiceStatus === "REVIEW_REQUIRED" && row.dispatchLineId).map((row) => row.dispatchLineId),
    [rows],
  );
  const resolveReview = useCallback(async (row) => {
    if (!row?.dispatchLineId || row.invoiceStatus !== "REVIEW_REQUIRED") return;
    setRecalculating(true);
    setError("");
    try {
      const result = await resolveDispatchReview(row.dispatchLineId, {
        note: "Kontrol ekranından kullanıcı tarafından onaylandı; kesinleşmiş adetler korundu.",
      });
      setAnalysisMessage(`${n(result?.resolvedCount)} bekleyen öneri kapatıldı. Kayıt gerçek adet durumuna göre ilgili sekmeye taşındı.`);
      setSelectedReviewIds((current) => {
        const next = new Set(current);
        next.delete(row.dispatchLineId);
        return next;
      });
      await load();
    } catch (approvalError) {
      setError(approvalError?.message || "Kontrol kaydı onaylanamadı.");
    } finally {
      setRecalculating(false);
    }
  }, [load]);
  const resolveSelectedReviews = useCallback(async () => {
    const ids = [...selectedReviewIds];
    if (!ids.length) return;
    setRecalculating(true);
    setError("");
    try {
      const result = await resolveDispatchReviews(ids);
      setAnalysisMessage(`${n(result.approvedCount)} kontrol kaydı onaylandı; ${n(result.resolvedSuggestionCount)} bekleyen öneri kapatıldı.`);
      setSelectedReviewIds(new Set());
      await load();
    } catch (approvalError) {
      setError(approvalError?.message || "Seçilen kontrol kayıtları onaylanamadı.");
    } finally {
      setRecalculating(false);
    }
  }, [load, selectedReviewIds]);
  const approveSelectedPartials = useCallback(async () => {
    const ids = [...selectedPartialIds];
    if (!ids.length) return;
    setRecalculating(true);
    setError("");
    try {
      const result = await approveDispatchPartials(ids);
      setAnalysisMessage(`${n(result.approvedCount)} kayıt, toplam ${n(result.approvedQty)} adet fark ile onaylandı ve Tamamlanan sekmesine taşındı.`);
      setSelectedPartialIds(new Set());
      await load();
    } catch (approvalError) {
      setError(approvalError?.message || "Seçilen kısmi kayıtlar onaylanamadı.");
    } finally {
      setRecalculating(false);
    }
  }, [load, selectedPartialIds]);
  const outgoingFor = useCallback(
    (row) => documentFor(outgoingDocuments, row),
    [documentFor, outgoingDocuments],
  );
  const readiness = useMemo(
    () => ({
      ready: rows.filter(
        (row) =>
          row.invoiceRemainingQty > 0 &&
          row.modelId &&
          row.productionQty > 0 &&
          outgoingFor(row),
      ).length,
      noModel: rows.filter((row) => !row.modelId).length,
      noProduction: rows.filter((row) => Number(row.productionQty || 0) <= 0)
        .length,
      noOutgoing: rows.filter(
        (row) => row.invoiceRemainingQty > 0 && !outgoingFor(row),
      ).length,
      productionWithoutDispatch: rows.filter(
        (row) => row.operationSource === "PRODUCTION",
      ).length,
      waitingOutgoing: rows.filter(
        (row) =>
          row.operationSource !== "PRODUCTION" &&
          row.invoiceRemainingQty > 0 &&
          !outgoingFor(row),
      ).length,
      completed: rows.filter(
        (row) => Number(row.invoiceRemainingQty || 0) <= 0,
      ).length,
      blocked: rows.filter(
        (row) =>
          row.invoiceRemainingQty > 0 &&
          (!row.modelId || Number(row.productionQty || 0) <= 0),
      ).length,
    }),
    [rows, outgoingFor],
  );
  const setStatus = (invoiceStatus) => {
    setFilters((prev) => ({ ...prev, invoiceStatus }));
    setPage(1);
  };
  const analyzeAndMatch = async () => {
    setRecalculating(true);
    setAnalysisMessage("");
    setError("");
    try {
      const result = await recalculateDispatchInvoices();
      setAnalysisMessage(
        `${n(result.autoLinked)} fatura kalemi otomatik bağlandı${result.autoClosedCount ? `; faturadaki 0 TL satırlardan ${n(result.autoClosedQty)} adet açık otomatik kapandı` : ""}${result.needsApproval ? `; ${n(result.needsApproval)} yakın eşleşme onay bekliyor` : ""}.`,
      );
      await load();
    } catch (err) {
      setError(err?.message || "Faturalar analiz edilemedi.");
    } finally {
      setRecalculating(false);
    }
  };
  const cards = controlMode
    ? [
        [
          "Toplam İrsaliye Kalemi",
          summary.total,
          "Tüm kayıtlar",
          "navy",
          "",
          Boxes,
        ],
        [
          "Fatura Kesilmeyen",
          summary.invoicePending,
          `${n(summary.uninvoicedQty)} kalan adet`,
          "red",
          "INVOICE_PENDING",
          AlertTriangle,
        ],
        [
          "Kısmi Kesilen",
          summary.partial,
          "Kısmi kapanan",
          "orange",
          "PARTIAL",
          FileSearch,
        ],
        [
          "Tamamlanan",
          Number(summary.invoiced || 0) + Number(summary.closedWithNonBillable || 0),
          "Fatura ve adet kapanan",
          "green",
          "COMPLETED",
          CheckCircle2,
        ],
        [
          "Fazla Kesilen",
          summary.overInvoiced,
          "Fazla adet",
          "burgundy",
          "OVER_INVOICED",
          AlertTriangle,
        ],
        [
          "Kontrol Gereken",
          summary.reviewRequired,
          "Şüpheli eşleşme",
          "yellow",
          "REVIEW_REQUIRED",
          FileSearch,
        ],
        [
          "Mükerrer Eşleşme",
          summary.duplicateReview,
          "Çakışan kalem",
          "burgundy",
          "DUPLICATE_REVIEW",
          FilesIcon,
        ],
      ]
    : [
        [
          "Toplam İrsaliye",
          summary.totalDispatches,
          `${n(summary.total)} kalem`,
          "navy",
          "",
          Truck,
        ],
        [
          "Yeni Eklenen",
          summary.newCount,
          "Son 7 gün",
          "blue",
          "",
          PackageOpen,
        ],
        [
          "Model Bekleyen",
          summary.modelPending,
          "Bağlantı gerekli",
          "purple",
          "",
          Link2,
        ],
        [
          "İmalat Bekleyen",
          summary.productionPending,
          "Açık imalat",
          "orange",
          "",
          Factory,
        ],
        [
          "Fatura Kesilmeyen",
          summary.invoicePending,
          `${n(summary.uninvoicedQty)} adet`,
          "red",
          "INVOICE_PENDING",
          AlertTriangle,
        ],
        [
          "Kısmi Faturalı",
          summary.partial,
          "Kalanı var",
          "orange",
          "PARTIAL",
          FileSearch,
        ],
        [
          "Tamamlanan",
          Number(summary.invoiced || 0) + Number(summary.closedWithNonBillable || 0),
          "Fatura ve adet kapandı",
          "green",
          "COMPLETED",
          FileCheck2,
        ],
        [
          "Kontrol Gereken",
          summary.reviewRequired,
          "İnceleme",
          "yellow",
          "REVIEW_REQUIRED",
          AlertTriangle,
        ],
      ];
  return (
    <section className="dw-shell">
      <header className={`dw-head ${controlMode ? "dw-head--invoice" : ""}`}>
        <div>
          <span className="dw-eyebrow">
            {controlMode
              ? "İŞNET · FATURA OPERASYON MASASI"
              : analysisMode
                ? "İŞNET · ANALİZ VE EŞLEŞTİRME"
                : "MUHASEBE · OPERASYON KONTROLÜ"}
          </span>
          <h1>
            {controlMode
              ? "Fatura Kesme Yardımcısı"
              : analysisMode
                ? "Üretim – İrsaliye – Fatura Analizi"
                : "Müşteri İrsaliyeleri"}
          </h1>
          <p>
            {controlMode
              ? "Gelen müşteri irsaliyesinden giden irsaliye oluşturun; kontrol edip gönderin, ardından ticari satış faturasına çevirip önizleme ve son onayı tek iş dosyasından tamamlayın."
              : analysisMode
                ? "Her model için üretim, gelen irsaliye, giden irsaliye, kesilen fatura ve kalan adet zincirini eşleştirin; eksik halkaları atlamadan bulun."
                : "Gelen irsaliyeleri, model bağlantısını, imalatı ve fatura durumunu ürün kalemi bazında takip edin."}
          </p>
        </div>
        <div className="dw-head-actions">
          {!controlMode ? (
            <>
              <button
                className="dw-btn primary"
                type="button"
                onClick={() => setUploadMode("single")}
              >
                <Upload size={16} /> İrsaliye Yükle
              </button>
              <button
                className="dw-btn"
                type="button"
                onClick={() => setUploadMode("bulk")}
              >
                <Boxes size={16} /> Toplu Dosya Yükle
              </button>
            </>
          ) : (
            <>
              <button
                className="dw-btn primary"
                type="button"
                onClick={() => onOpenNewInvoice?.()}
              >
                <CircleDollarSign size={16} /> Yeni Fatura
              </button>
              <button
                className="dw-btn"
                type="button"
                onClick={() => setUploadMode("single")}
              >
                <Upload size={16} /> Mailden Gelen PDF/XML
              </button>
              <button
                className="dw-btn primary"
                type="button"
                disabled={recalculating}
                onClick={analyzeAndMatch}
              >
                {recalculating ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <ClipboardCheck size={16} />
                )}{" "}
                {recalculating ? "Kontrol Ediliyor" : "Kayıtları Güncelle"}
              </button>
            </>
          )}
          <button
            className="dw-btn icon"
            type="button"
            title="Yenile"
            onClick={load}
          >
            <RefreshCw size={17} />
          </button>
          <button
            className="dw-btn"
            type="button"
            onClick={() =>
              exportExcel(
                rows,
                controlMode
                  ? "isnet-fatura-operasyonu.xls"
                  : "musteri-irsaliyeleri.xls",
              )
            }
          >
            <Download size={16} /> Excel
          </button>
        </div>
      </header>
      {uploadMode ? (
        <UploadPanel
          mode={uploadMode}
          onClose={() => setUploadMode("")}
          onComplete={load}
        />
      ) : null}
      {analysisMessage ? (
        <div className="dw-message">{analysisMessage}</div>
      ) : null}
      {controlMode ? (
        <section className="dw-operation-board">
          <article>
            <FileText size={21} />
            <div>
              <span>1 · İRSALİYE HAZIRLA</span>
              <b>{n(readiness.waitingOutgoing)}</b>
              <small>Gelen müşteriden giden irsaliye oluşturulacak</small>
            </div>
          </article>
          <article>
            <ClipboardCheck size={21} />
            <div>
              <span>2 · KONTROL VE GÖNDER</span>
              <b>{n(readiness.waitingOutgoing)}</b>
              <small>Taslak irsaliye alanları, ürün ve notlar kontrol edilecek</small>
            </div>
          </article>
          <article className="ready">
            <CircleDollarSign size={21} />
            <div>
              <span>3 · FATURAYA ÇEVİR</span>
              <b>{n(readiness.ready)}</b>
              <small>Gönderilmiş irsaliye · ticari satış · KDV %20</small>
            </div>
          </article>
          <article>
            <FileSearch size={21} />
            <div>
              <span>4 · ÖNİZLE VE GÖNDER</span>
              <b>{n(readiness.blocked)}</b>
              <small>Model, adet veya üretim eksiği olan işlem açılamaz</small>
            </div>
          </article>
          <article>
            <CheckCircle2 size={21} />
            <div>
              <span>TAMAMLANAN</span>
              <b>{n(readiness.completed)}</b>
              <small>İrsaliye ve fatura zinciri kapandı</small>
            </div>
          </article>
        </section>
      ) : null}
      <div className={`dw-metrics ${controlMode ? "control" : ""}`}>
        {cards.map(([label, value, sub, color, status, Icon]) => (
          <MetricCard
            key={label}
            label={label}
            value={value}
            sub={sub}
            toneName={color}
            icon={Icon}
            active={filters.invoiceStatus === status && Boolean(status)}
            onClick={() => setStatus(status)}
          />
        ))}
      </div>
      <section className="dw-toolbar">
        <div className="dw-quick">
          {[
            ["Tümü", ""],
            ["Kesilmeyen", "INVOICE_PENDING"],
            ["Kısmi · Onayla", "PARTIAL"],
            ["Tamamlanan", "COMPLETED"],
            ["Fazla", "OVER_INVOICED"],
            ["Kontrol", "REVIEW_REQUIRED"],
            ["Mükerrer", "DUPLICATE_REVIEW"],
          ].map(([label, value]) => (
            <button
              key={label}
              type="button"
              className={filters.invoiceStatus === value ? "active" : ""}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="dw-search">
          <Search size={16} />
          <input
            placeholder="Firma, irsaliye, piyon, ürün veya model ara..."
            value={filters.q}
            onChange={(e) => {
              setFilters({ ...filters, q: e.target.value });
              setPage(1);
            }}
          />
        </div>
        <button
          className={`dw-filter-toggle ${filterOpen ? "active" : ""}`}
          type="button"
          onClick={() => setFilterOpen(!filterOpen)}
        >
          <Filter size={16} /> Filtreleri {filterOpen ? "Kapat" : "Aç"}
        </button>
      </section>
      {controlMode && filters.invoiceStatus === "REVIEW_REQUIRED" ? (
        <section className="dw-control-guide">
          <div>
            <strong>Kontrol bekleyen kayıtlar</strong>
            <span>Neden bilgisi satırda gösterilir. Kontrolü Onayla, kesinleşmiş adetleri değiştirmeden bekleyen öneriyi kapatır.</span>
          </div>
          <b>{n(reviewIds.length)} kayıt</b>
        </section>
      ) : null}
      {controlMode && reviewIds.length ? (
        <section className="dw-bulk-approve review">
          <label>
            <input
              type="checkbox"
              checked={reviewIds.every((id) => selectedReviewIds.has(id))}
              onChange={(event) => setSelectedReviewIds(event.target.checked ? new Set(reviewIds) : new Set())}
            />
            Kontrollerin Tümünü Seç ({n(reviewIds.length)})
          </label>
          <span>{n(selectedReviewIds.size)} kayıt seçildi</span>
          <button type="button" disabled={!selectedReviewIds.size || recalculating} onClick={resolveSelectedReviews}>
            {recalculating ? "Onaylanıyor..." : "Seçilen Kontrolleri Onayla"}
          </button>
        </section>
      ) : controlMode && partialIds.length ? (
        <section className="dw-bulk-approve">
          <label>
            <input
              type="checkbox"
              checked={partialIds.length > 0 && partialIds.every((id) => selectedPartialIds.has(id))}
              onChange={(event) => setSelectedPartialIds(event.target.checked ? new Set(partialIds) : new Set())}
            />
            Tümünü Seç ({n(partialIds.length)})
          </label>
          <span>{n(selectedPartialIds.size)} kayıt seçildi</span>
          <button type="button" disabled={!selectedPartialIds.size || recalculating} onClick={approveSelectedPartials}>
            {recalculating ? "Onaylanıyor..." : "Seçilenleri Direkt Onayla ve Kapat"}
          </button>
        </section>
      ) : null}
      {filterOpen ? (
        <section className="dw-filters">
          <label>
            Başlangıç tarihi
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters({ ...filters, dateFrom: e.target.value })
              }
            />
          </label>
          <label>
            Bitiş tarihi
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters({ ...filters, dateTo: e.target.value })
              }
            />
          </label>
          <label>
            Model durumu
            <select
              value={filters.modelStatus}
              onChange={(e) =>
                setFilters({ ...filters, modelStatus: e.target.value })
              }
            >
              <option value="">Tümü</option>
              <option value="MODEL_PENDING">Model Bekleyen</option>
              <option value="MODEL_LINKED">Model Bağlı</option>
            </select>
          </label>
          <label>
            İmalat durumu
            <select
              value={filters.productionStatus}
              onChange={(e) =>
                setFilters({ ...filters, productionStatus: e.target.value })
              }
            >
              <option value="">Tümü</option>
              <option value="PRODUCTION_PENDING">Bekleyen</option>
              <option value="PRODUCTION_PARTIAL">Kısmi</option>
              <option value="PRODUCTION_COMPLETE">Tamamlanan</option>
              <option value="PRODUCTION_OVER">Fazla</option>
            </select>
          </label>
          <label className="dw-check">
            <input
              type="checkbox"
              checked={filters.openOnly}
              onChange={(e) =>
                setFilters({ ...filters, openOnly: e.target.checked })
              }
            />{" "}
            Sadece açık kayıtlar
          </label>
          <button type="button" onClick={() => setFilters(FILTER_DEFAULTS)}>
            Filtreyi Temizle
          </button>
        </section>
      ) : null}
      {error ? (
        <div className="dw-error">
          <AlertTriangle size={18} />
          {error}
          <button type="button" onClick={load}>
            Tekrar dene
          </button>
        </div>
      ) : null}
      <div className="dw-table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                {controlMode && (reviewIds.length || partialIds.length) ? (
                  <input
                    type="checkbox"
                    aria-label={reviewIds.length ? "Tüm kontrol kayıtlarını seç" : "Tüm kısmi kayıtları seç"}
                    checked={reviewIds.length ? reviewIds.every((id) => selectedReviewIds.has(id)) : partialIds.every((id) => selectedPartialIds.has(id))}
                    onChange={(event) => reviewIds.length
                      ? setSelectedReviewIds(event.target.checked ? new Set(reviewIds) : new Set())
                      : setSelectedPartialIds(event.target.checked ? new Set(partialIds) : new Set())}
                  />
                ) : null}
              </th>
              <th>{controlMode ? "Kaynak Tarihi" : "İrsaliye Tarihi"}</th>
              <th>{controlMode ? "Belge / İş / Firma" : "İrsaliye No / Firma"}</th>
              <th>Piyon / Sipariş</th>
              <th>Ürün / Model Açıklaması</th>
              <th>İrsaliye Adedi</th>
              {controlMode ? (
                <>
                  <th>İmalat</th>
                  <th>Hazırlık</th>
                </>
              ) : (
                <>
                  <th>Bağlı Model</th>
                  <th>İmalat</th>
                  <th>İmalat Kalan</th>
                </>
              )}
              <th>Faturalanan</th>
              <th>Ücretsiz / Test</th>
              <th>Toplam Kapanan</th>
              <th className="remaining">Kesilmeyen Kalan</th>
              {!controlMode ? <th>Model Durumu</th> : null}
              <th>Fatura Durumu</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <tr className="skeleton" key={index}>
                  <td colSpan={controlMode ? 14 : 16}>
                    <i></i>
                  </td>
                </tr>
              ))
            ) : groups.length ? (
              groups.flatMap((group) => {
                const open = expanded.has(group.id);
                const first = group.lines[0];
                const incoming = incomingFor(first);
                const outgoing = outgoingFor(first);
                const ready = Boolean(
                  first.modelId &&
                  first.productionQty > 0 &&
                  outgoing &&
                  first.invoiceRemainingQty > 0,
                );
                const parent = (
                  <tr
                    key={group.id}
                    className={`dw-parent status-${tone(first.invoiceStatus)}`}
                    onDoubleClick={() => openIsnetPdf(first.isnetDocument).catch((error) => setError(error?.message || "İrsaliye PDF'i açılamadı."))}
                    title="İrsaliyeyi açmak için çift tıklayın"
                  >
                    <td>
                      {["PARTIAL", "REVIEW_REQUIRED"].includes(first.invoiceStatus) ? (
                        <input
                          className="dw-row-check"
                          type="checkbox"
                          aria-label={`${first.dispatchNo} kaydını seç`}
                          checked={group.lines.filter((line) => line.invoiceStatus === first.invoiceStatus).every((line) => (first.invoiceStatus === "REVIEW_REQUIRED" ? selectedReviewIds : selectedPartialIds).has(line.dispatchLineId))}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => (first.invoiceStatus === "REVIEW_REQUIRED" ? setSelectedReviewIds : setSelectedPartialIds)((current) => {
                            const next = new Set(current);
                            group.lines.filter((line) => line.invoiceStatus === first.invoiceStatus).forEach((line) => event.target.checked ? next.add(line.dispatchLineId) : next.delete(line.dispatchLineId));
                            return next;
                          })}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="dw-expand"
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            next.has(group.id)
                              ? next.delete(group.id)
                              : next.add(group.id);
                            return next;
                          })
                        }
                      >
                        {open ? (
                          <ChevronDown size={17} />
                        ) : (
                          <ChevronRight size={17} />
                        )}
                      </button>
                    </td>
                    <td>{date(group.dispatchDate)}</td>
                    <td>
                      <b>
                        {group.dispatchNo ||
                          (first.operationSource === "PRODUCTION"
                            ? "ÜRETİM KAYDI"
                            : "-")}
                      </b>
                      <span>{group.companyName || "Firma bulunamadı"}</span>
                    </td>
                    <td>{group.orderNo || "-"}</td>
                    <td>
                      <b>
                        {group.lines.length > 1
                          ? `${group.lines.length} ürün kalemi`
                          : first.description || "-"}
                      </b>
                      <span>
                        {group.lines.length > 1
                          ? group.lines
                              .map((line) => line.description)
                              .filter(Boolean)
                              .slice(0, 2)
                              .join(" · ")
                          : first.modelName || "Model bekliyor"}
                      </span>
                    </td>
                    <td>
                      <b>
                        {n(
                          group.lines.reduce(
                            (t, line) => t + Number(line.dispatchQty || 0),
                            0,
                          ),
                        )}
                      </b>
                    </td>
                    {controlMode ? (
                      <>
                        <td>
                          <b>
                            {n(
                              group.lines.reduce(
                                (t, line) =>
                                  t + Number(line.productionQty || 0),
                                0,
                              ),
                            )}
                          </b>
                        </td>
                        <td>
                          <div className="dw-readiness">
                            {first.operationSource === "PRODUCTION" ? (
                              <i className="source">Üretimden</i>
                            ) : null}
                            <i className={first.modelId ? "ok" : "missing"}>
                              Model
                            </i>
                            <i
                              className={
                                first.productionQty > 0 ? "ok" : "missing"
                              }
                            >
                              İmalat
                            </i>
                            <i className={outgoing ? "ok" : "missing"}>
                              Giden irs.
                            </i>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          {group.lines.length > 1
                            ? `${group.lines.filter((line) => line.modelId).length}/${group.lines.length} bağlı`
                            : first.modelName || "-"}
                        </td>
                        <td>
                          {n(
                            group.lines.reduce(
                              (t, line) => t + Number(line.productionQty || 0),
                              0,
                            ),
                          )}
                        </td>
                        <td>
                          {n(
                            group.lines.reduce(
                              (t, line) =>
                                t + Number(line.productionRemainingQty || 0),
                              0,
                            ),
                          )}
                        </td>
                      </>
                    )}
                    <td>
                      {n(
                        group.lines.reduce(
                          (t, line) => t + Number(line.invoicedQty || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td>
                      {n(group.lines.reduce((t, line) => t + Number(line.nonBillableQty || 0), 0))}
                    </td>
                    <td>
                      {n(group.lines.reduce((t, line) => t + Number(line.coveredQty || 0), 0))}
                    </td>
                    <td className="remaining">
                      <b>
                        {n(
                          group.lines.reduce(
                            (t, line) =>
                              t + Number(line.invoiceRemainingQty || 0),
                            0,
                          ),
                        )}
                      </b>
                    </td>
                    {!controlMode ? (
                      <td>
                        <Status value={first.modelStatus} />
                      </td>
                    ) : null}
                    <td>
                      <Status value={first.invoiceStatus} />
                      {first.invoiceStatus === "REVIEW_REQUIRED" ? (
                        <small className="dw-control-reason">{controlReason(first)}</small>
                      ) : null}
                    </td>
                    <td>
                      {controlMode ? (
                        <div className="dw-row-actions">
                          {!outgoing && incoming ? (
                            <button
                              className="dw-invoice"
                              type="button"
                              onClick={() => onOpenDispatch?.(incoming)}
                              disabled={!onOpenDispatch}
                            >
                              <FileText size={14} /> Giden irsaliye hazırla
                            </button>
                          ) : null}
                          {outgoing && Number(first.invoiceRemainingQty || 0) > 0 ? (
                            <button
                              className="dw-invoice"
                              type="button"
                              disabled={!ready || !onOpenInvoice}
                              title={
                                !first.productionQty
                                  ? "Üretim kaydı eksik"
                                  : !first.modelId
                                    ? "Model bağlantısı eksik"
                                    : ""
                              }
                              onClick={() => onOpenInvoice(outgoing)}
                            >
                              <CircleDollarSign size={14} /> Faturaya çevir
                            </button>
                          ) : null}
                          {!incoming && !outgoing && first.productionQty > 0 ? (
                            <button
                              className="dw-invoice secondary"
                              type="button"
                              onClick={() => setSelected(first)}
                            >
                              <FileText size={14} /> İrsaliye bekleniyor
                            </button>
                          ) : null}
                          {Number(first.invoiceRemainingQty || 0) <= 0 ? (
                            <span className="dw-complete-label">Tamamlandı</span>
                          ) : null}
                          {first.invoiceStatus === "PARTIAL" ? (
                            <button className="dw-approve-partial" type="button" disabled={recalculating} onClick={() => approvePartial(first)}>
                              Kısmi Onayla ve Kapat
                            </button>
                          ) : null}
                          {first.invoiceStatus === "REVIEW_REQUIRED" ? (
                            <button className="dw-resolve-review" type="button" disabled={recalculating} onClick={() => resolveReview(first)}>
                              Kontrolü Onayla
                            </button>
                          ) : null}
                          <button className="dw-open" type="button" disabled={!first.isnetDocument?.hasPdf} onClick={() => openIsnetPdf(first.isnetDocument).catch((error) => setError(error?.message || "İrsaliye PDF'i açılamadı."))}>
                            İrsaliye PDF
                          </button>
                          <button
                            className="dw-open"
                            type="button"
                            onClick={() => setSelected(first)}
                          >
                            İşlem dosyası
                          </button>
                        </div>
                      ) : (
                        <div className="dw-row-actions">
                          <button className="dw-open" type="button" disabled={!first.isnetDocument?.hasPdf} onClick={() => openIsnetPdf(first.isnetDocument).catch((error) => setError(error?.message || "İrsaliye PDF'i açılamadı."))}>İrsaliye PDF</button>
                          <button className="dw-open" type="button" onClick={() => setSelected(first)}>Detayı Aç</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
                const children = open
                  ? group.lines.map((line) => (
                      <tr
                        key={line.id}
                        className={`dw-child status-${tone(line.invoiceStatus)}`}
                        onDoubleClick={() => openIsnetPdf(line.isnetDocument).catch((error) => setError(error?.message || "İrsaliye PDF'i açılamadı."))}
                        title="İrsaliyeyi açmak için çift tıklayın"
                      >
                        <td>
                          {["PARTIAL", "REVIEW_REQUIRED"].includes(line.invoiceStatus) ? (
                            <input
                              className="dw-row-check"
                              type="checkbox"
                              aria-label={`${line.dispatchNo} ürün kalemini seç`}
                              checked={(line.invoiceStatus === "REVIEW_REQUIRED" ? selectedReviewIds : selectedPartialIds).has(line.dispatchLineId)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => (line.invoiceStatus === "REVIEW_REQUIRED" ? setSelectedReviewIds : setSelectedPartialIds)((current) => {
                                const next = new Set(current);
                                event.target.checked ? next.add(line.dispatchLineId) : next.delete(line.dispatchLineId);
                                return next;
                              })}
                            />
                          ) : null}
                        </td>
                        <td></td>
                        <td>
                          <small>ÜRÜN KALEMİ</small>
                        </td>
                        <td>{line.orderNo || "-"}</td>
                        <td>
                          <b>{line.description || "-"}</b>
                          <span>{line.modelName || "Model bekliyor"}</span>
                        </td>
                        <td>{n(line.dispatchQty)}</td>
                        {controlMode ? (
                          <>
                            <td>{n(line.productionQty)}</td>
                            <td>
                              <div className="dw-readiness">
                                <i className={line.modelId ? "ok" : "missing"}>
                                  Model
                                </i>
                                <i
                                  className={
                                    line.productionQty > 0 ? "ok" : "missing"
                                  }
                                >
                                  İmalat
                                </i>
                                <i
                                  className={
                                    outgoingFor(line) ? "ok" : "missing"
                                  }
                                >
                                  Giden irs.
                                </i>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{line.modelName || "-"}</td>
                            <td>{n(line.productionQty)}</td>
                            <td>{n(line.productionRemainingQty)}</td>
                          </>
                        )}
                        <td>{n(line.invoicedQty)}</td>
                        <td>{n(line.nonBillableQty)}</td>
                        <td>{n(line.coveredQty)}</td>
                        <td className="remaining">
                          <b>{n(line.invoiceRemainingQty)}</b>
                        </td>
                        {!controlMode ? (
                          <td>
                            <Status value={line.modelStatus} />
                          </td>
                        ) : null}
                        <td>
                          <Status value={line.invoiceStatus} />
                          {line.invoiceStatus === "REVIEW_REQUIRED" ? (
                            <small className="dw-control-reason">{controlReason(line)}</small>
                          ) : null}
                        </td>
                        <td>
                          <details className="dw-menu">
                            <summary>
                              <MoreHorizontal size={17} />
                            </summary>
                            <div>
                              {line.invoiceStatus === "PARTIAL" ? (
                                <button className="dw-approve-partial" type="button" disabled={recalculating} onClick={() => approvePartial(line)}>
                                  Kısmi Onayla ve Kapat
                                </button>
                              ) : null}
                              {line.invoiceStatus === "REVIEW_REQUIRED" ? (
                                <button className="dw-resolve-review" type="button" disabled={recalculating} onClick={() => resolveReview(line)}>
                                  Kontrolü Onayla
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => openIsnetPdf(line.isnetDocument).catch((error) => setError(error?.message || "İrsaliye PDF'i açılamadı."))}
                                disabled={!line.isnetDocument?.hasPdf}
                              >
                                İrsaliye PDF Aç
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelected(line)}
                              >
                                Detayı Aç
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelected(line)}
                              >
                                Model Bağla / Değiştir
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelected(line)}
                              >
                                İmalat Gir
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelected(line)}
                              >
                                Fatura Eşleşmeleri
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelected(line)}
                              >
                                İşlem Geçmişi
                              </button>
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))
                  : [];
                return [parent, ...children];
              })
            ) : (
              <tr>
                <td colSpan={controlMode ? 14 : 16}>
                  <div className="dw-empty">
                    <PackageOpen size={32} />
                    <b>Bu filtrelerde irsaliye kalemi bulunamadı</b>
                    <span>
                      Yeni dosya yükleyebilir veya filtreleri
                      temizleyebilirsiniz.
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="dw-pagination">
        <span>
          {n(total)} kayıttan {n((page - 1) * 50 + (rows.length ? 1 : 0))}–
          {n(Math.min(page * 50, total))}
        </span>
        <div>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Önceki
          </button>
          <b>{page}</b>
          <button
            type="button"
            disabled={page * 50 >= total}
            onClick={() => setPage(page + 1)}
          >
            Sonraki
          </button>
        </div>
      </footer>
      {selected ? (
        <DetailDrawer
          row={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      ) : null}
    </section>
  );
}

function FilesIcon(props) {
  return <FileCheck2 {...props} />;
}
