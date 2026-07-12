import { useEffect, useMemo, useRef, useState } from "react";
import { ErpIcon } from "../../components/erp/IconMap";
import {
  createModelFromOutgoingDocument,
  createProductAlias,
  fetchIncomingDeliveryPool,
  fetchMuhasebeModels,
  fetchOutgoingDocumentsPool,
  fetchProducts,
  linkIncomingDeliveryToModel,
  linkOutgoingDocumentToModel,
  matchSupplierInvoiceLines,
  saveIncomingDelivery,
  saveOutgoingDocument,
  saveProduct,
  suggestModelsForOutgoingDocument,
} from "../../services/muhasebeService";
import {
  approveBelgeHavuzu,
  enqueueBelgeHavuzuApprovals,
  fetchBelgeHavuzuApprovalQueue,
  fetchBelgeHavuzu,
  fetchDocumentUploadHistory,
  fetchDocumentUploadSummary,
  updateBelgeHavuzu,
  uploadMuhasebeDocuments,
} from "../../services/muhasebeDocumentService";

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateTr(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : text;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function displayText(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) => displayText(item, ""))
      .filter(Boolean)
      .join(" ")
      .trim();
    return text || fallback;
  }
  if (typeof value === "object") {
    const preferred = [
      value.text,
      value.value,
      value.label,
      value.name,
      value.title,
      value.description,
      value.rawDescription,
      value.aciklama,
      value[0],
    ];
    for (const candidate of preferred) {
      const text = displayText(candidate, "").trim();
      if (text) return text;
    }
    const joined = Object.values(value)
      .map((item) => displayText(item, ""))
      .filter(Boolean)
      .join(" ")
      .trim();
    return joined || fallback;
  }
  return fallback;
}

function PageHeader({ title, subtitle }) {
  return (
    <header className="muh-doc-header">
      <div className="muh-doc-crumb">
        <span>KY ERP</span>
        <span>/</span>
        <span>Muhasebe</span>
        <span>/</span>
        <strong>{title}</strong>
      </div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function SectionCard({ title, children, actions, className = "" }) {
  return (
    <section className={`muh-doc-card ${className}`}>
      <div className="muh-doc-card-head">
        <h3>{title}</h3>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ value }) {
  const text = String(value || "Taslak");
  const key = text.toLocaleLowerCase("tr-TR");
  const tone =
    key.includes("hata") || key.includes("reddedildi")
       ? "red"
      : key.includes("eşleşmedi") ||
          key.includes("eksik") ||
          key.includes("bekliyor") ||
          key.includes("gerekli")
         ? "yellow"
        : key.includes("kayded") ||
            key.includes("eşleşti") ||
            key.includes("eslesti") ||
            key.includes("bağlı") ||
            key.includes("islendi") ||
            key.includes("havuz")
           ? "green"
          : "blue";
  return <span className={`muh-doc-badge tone-${tone}`}>{text}</span>;
}

function EmptyState({ text = "Kayıt bulunamadı." }) {
  return (
    <div className="muh-doc-empty">
      <ErpIcon name="bilgi" size={24} />
      <span>{text}</span>
    </div>
  );
}

function SearchToolbar({ value, onChange, placeholder, children }) {
  return (
    <div className="muh-doc-toolbar">
      <label className="muh-doc-search">
        <ErpIcon name="ara" size={16} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </label>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  options,
  className = "",
}) {
  return (
    <label className={`muh-doc-field ${className}`}>
      <span>{label}</span>
      {options ? (
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
          {options.map((item) => (
            <option key={item?.value || item} value={item?.value || item}>
              {item?.label || item}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="muh-doc-field span-2">
      <span>{label}</span>
      <textarea
        rows={3}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function PoolListCard({
  title,
  query,
  setQuery,
  rows,
  columns,
  selectedId,
  onSelect,
  actions,
  emptyText,
  tabs,
}) {
  const filtered = useMemo(() => {
    const q = String(query || "").toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((row) =>
      JSON.stringify(row).toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [rows, query]);
  return (
    <SectionCard title={title} actions={actions}>
      <SearchToolbar
        value={query}
        onChange={setQuery}
        placeholder="Belge no, firma, tarih ara..."
      />
      {tabs ? <StatusTabs {...tabs} /> : null}
      <div className="muh-doc-pool">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row?.id}
                className={selectedId === row?.id ? "selected" : ""}
                onClick={() => onSelect(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`muh-doc-cell-${col.key}`}
                    title={typeof row[col.key] === "string" ? row[col.key] : ""}
                  >
                    {col.render ? col.render(row) : row[col.key] || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length ? <EmptyState text={emptyText} /> : null}
      </div>
    </SectionCard>
  );
}

function ModelListCard({ models, onSelect, selectedId }) {
  const [query, setQuery] = useState("");
  const visible = models.filter((row) =>
    `${row?.modelAdi} ${row?.musteriFirma} ${row?.zemin}`
      .toLocaleLowerCase("tr-TR")
      .includes(query.toLocaleLowerCase("tr-TR")),
  );
  return (
    <SectionCard
      title="Model Listesi"
      actions={
        <button className="muh-doc-soft" type="button">
          Yenile
        </button>
      }
    >
      <SearchToolbar
        value={query}
        onChange={setQuery}
        placeholder="Model adı, müşteri, zemin ara..."
      />
      <div className="muh-doc-model-list">
        {visible.map((model) => (
          <button
            type="button"
            key={model?.id}
            className={selectedId === model?.id ? "selected" : ""}
            onClick={() => onSelect(model)}
          >
            <strong>{model?.modelAdi}</strong>
            <span>{model?.musteriFirma}</span>
            <StatusBadge value={model?.aktif ? "Açık" : "Kapalı"} />
          </button>
        ))}
        {!visible.length ? <EmptyState text="Model bulunamadı." /> : null}
      </div>
    </SectionCard>
  );
}

function useModels(activeMainCompany) {
  const [models, setModels] = useState([]);
  useEffect(() => {
    fetchMuhasebeModels(activeMainCompany)
      .then(setModels)
      .catch(() => setModels([]));
  }, [activeMainCompany?.id]);
  return models;
}

function useProducts(activeMainCompany, refreshKey = 0) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    if (!activeMainCompany?.slug) {
      setProducts([]);
      return;
    }
    fetchProducts(activeMainCompany)
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [activeMainCompany?.id, refreshKey]);
  return products;
}

function productId(product) {
  return String(product.id || product.productId || product.kod || "");
}

function productLabel(product) {
  return String(
    product.urunAdi ||
      product.ticariAdi ||
      product.productName ||
      product.name ||
      product.kod ||
      "",
  ).trim();
}

function ActionBar({ title, meta = [], status, children }) {
  return (
    <SectionCard
      className="muh-doc-action-card"
      title={title || "Seçili Kayıt"}
    >
      <div className="muh-doc-actionbar">
        <div className="muh-doc-actionbar-info">
          {meta.map((item) => (
            <div key={item?.label}>
              <span>{item?.label}</span>
              <strong>{item?.value || "-"}</strong>
            </div>
          ))}
          {status ? <StatusBadge value={status} /> : null}
        </div>
        <div className="muh-doc-actionbar-buttons">{children}</div>
      </div>
    </SectionCard>
  );
}

function lineMatchBadge(line, lotRequired = true) {
  const status = String(line?.matchStatus || "").toLocaleLowerCase("tr-TR");
  const source = String(line?.matchSource || "").toLocaleLowerCase("tr-TR");
  if (source === "yeni_urun") return "Yeni Ürün Açıldı";
  if (source === "mevcut_urun") return "Mevcut Ürün";
  if (
    line?.matchedProductId ||
    status.includes("eşleş") ||
    status.includes("eslest")
  )
    return "Eşleşti";
  if (status.includes("yeni")) return "Yeni Ürün Gerekli";
  if (lotRequired && !line?.lotNo) return "Lot Eksik";
  if (!line?.packaging) return "Ambalaj Eksik";
  return "Bekliyor";
}

function lineMatchMiniText(line) {
  const source = String(line?.matchSource || "").toLocaleLowerCase("tr-TR");
  if (source === "yeni_urun") return "Yeni";
  if (source === "mevcut_urun") return "Eşleşti";
  if (line?.matchedProductId) return "Eşleşti";
  return "";
}

const LOT_REQUIRED_SUPPLIER_KEYWORDS = [
  "URAS",
  "TURAN",
  "KIMYA",
  "KİMYA",
  "BOYA",
  "KIMYEVI",
  "KİMYEVİ",
];

const LOT_REQUIRED_PRODUCT_KEYWORDS = [
  "KIMYA",
  "KİMYA",
  "BOYA",
  "PIGMENT",
  "BASE",
  "FIKSATOR",
  "FİKSATÖR",
  "TUTKAL",
];

function normalizeLotRuleText(value) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/İ/g, "I");
}

function isLotRequiredForSupplierInvoice(form, line) {
  const supplierText = normalizeLotRuleText(
    `${form.firma || ""} ${form.supplierName || ""} ${form.saticiUnvan || ""}`,
  );
  if (
    LOT_REQUIRED_SUPPLIER_KEYWORDS.some((keyword) =>
      supplierText.includes(normalizeLotRuleText(keyword)),
    )
  ) {
    return true;
  }
  const productText = normalizeLotRuleText(
    `${line?.category || ""} ${line?.productCategory || ""} ${line?.productName || ""} ${line?.rawDescription || ""}`,
  );
  return LOT_REQUIRED_PRODUCT_KEYWORDS.some((keyword) =>
    productText.includes(normalizeLotRuleText(keyword)),
  );
}

const WAITING_STATUSES = [
  "taslak",
  "kontrol_bekliyor",
  "eksik_bilgi",
  "onay_bekliyor",
  "onaylandi",
  "bekleyen",
];
const PROCESSED_STATUSES = [
  "islendi",
  "processed",
  "islenen",
  "işlenen",
  "done",
  "completed",
  "reddedildi",
  "rejected",
];

function statusKey(value) {
  const key = String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR");
  if (["processed", "islenen", "işlenen", "done", "completed"].includes(key))
    return "islendi";
  if (["rejected", "red"].includes(key)) return "reddedildi";
  if (["error", "failed", "hatalı"].includes(key)) return "hatali";
  if (["processing", "işlemde"].includes(key)) return "islemde";
  if (["pending", "waiting"].includes(key)) return "bekleyen";
  if (key === "draft") return "taslak";
  if (key === "control_pending") return "kontrol_bekliyor";
  return key;
}

function documentTypeKey(value) {
  const key = String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR");
  if (
    [
      "tedarikci_gelen_fatura",
      "supplier_invoice",
      "supplier-invoice",
      "gelen_fatura",
      "gelen-fatura",
      "alis_faturasi",
      "alış_faturası",
      "tedarikci_fatura",
      "incoming_invoice",
      "purchase_invoice",
      "gelen_fatura_tedarikci",
    ].includes(key)
  ) {
    return "tedarikci_gelen_fatura";
  }
  if (
    [
      "bizim_kestigimiz_fatura",
      "bizim_kestiğimiz_fatura",
      "bizim_fatura",
      "giden_fatura",
      "giden-fatura",
      "sales_invoice",
      "outgoing_invoice",
    ].includes(key)
  ) {
    return "bizim_kestigimiz_fatura";
  }
  if (
    [
      "bizim_kestigimiz_irsaliye",
      "bizim_kestiğimiz_irsaliye",
      "bizim_irsaliye",
      "giden_irsaliye",
      "giden-irsaliye",
      "outgoing_dispatch",
    ].includes(key)
  ) {
    return "bizim_kestigimiz_irsaliye";
  }
  if (
    [
      "musteriden_gelen_irsaliye",
      "müşteriden_gelen_irsaliye",
      "musteri_irsaliye",
      "müşteri_irsaliye",
      "gelen_irsaliye",
      "gelen-irsaliye",
      "incoming_delivery",
      "incoming_dispatch",
      "customer_dispatch",
      "customer-dispatch",
    ].includes(key)
  ) {
    return "musteriden_gelen_irsaliye";
  }
  return key;
}

function countByStatusTab(rows, tab, group) {
  return filterRowsByStatusTab(rows, tab, group).length;
}

function filterRowsByStatusTab(rows, tab, group) {
  const list = Array.isArray(rows) ? rows : [];
  if (tab === "tumu") return list;
  return list.filter((row) => {
    const status = statusKey(row?.durum || row?.status);
    const hasModel = Boolean(row?.modelId || row?.modelAdi);
    const isUnknown = statusKey(row?.belgeTipi) === "bilinmeyen";

    if (group === "supplier") {
      if (tab === "bekleyen") return WAITING_STATUSES.includes(status);
      if (tab === "islemde") return status === "islemde";
      if (tab === "islenen") return status === "islendi";
      if (tab === "hatali")
        return status === "reddedildi" || status.includes("hata");
    }

    if (group === "incoming") {
      if (tab === "bekleyen")
        return [
          "taslak",
          "kontrol_bekliyor",
          "eksik_bilgi",
          "onay_bekliyor",
          "",
        ].includes(status);
      if (tab === "model") return status.includes("model") || !hasModel;
      if (tab === "baglandi")
        return hasModel || status.includes("bağlı") || status.includes("bagli");
      if (tab === "islendi") return status === "islendi";
    }

    if (group === "outgoing") {
      if (tab === "taslak")
        return [
          "taslak",
          "havuz",
          "kontrol_bekliyor",
          "onay_bekliyor",
          "",
        ].includes(status);
      if (tab === "model") return status.includes("model") || !hasModel;
      if (tab === "hazir")
        return (
          hasModel ||
          status.includes("hazır") ||
          status.includes("hazir") ||
          status.includes("bağlı") ||
          status.includes("bagli")
        );
      if (tab === "islendi") return status === "islendi";
    }

    if (group === "upload") {
      if (tab === "bekleyen")
        return ["taslak", "onay_bekliyor"].includes(status);
      if (tab === "kontrol")
        return ["kontrol_bekliyor", "eksik_bilgi"].includes(status);
      if (tab === "islendi") return status === "islendi";
      if (tab === "tasnif") return isUnknown || status.includes("tasnif");
    }

    return true;
  });
}

function StatusTabs({ items, active, onChange }) {
  return (
    <div className="muh-doc-tabs">
      {items.map((item) => (
        <button
          key={item?.value}
          type="button"
          className={`muh-doc-tab ${active === item?.value ? "active" : ""}`}
          onClick={() => onChange(item?.value)}
        >
          <span>{item?.label}</span>
          <strong>{item?.count}</strong>
        </button>
      ))}
    </div>
  );
}

function documentDetailPath(row) {
  const type = row?.belgeTipi;
  if (type === "tedarikci_gelen_fatura") return "/muhasebe/tedarikci-fatura";
  if (type === "musteriden_gelen_irsaliye") return "/muhasebe/musteri-irsaliye";
  if (
    type === "bizim_kestigimiz_fatura" ||
    type === "bizim_kestigimiz_irsaliye"
  )
    return "/muhasebe/bizim-belgeler";
  return "";
}

function openDocumentDetail(row) {
  const path = documentDetailPath(row);
  if (path) window.location.href = path;
}

function syncUploadHistoryWithPool(history, poolRows) {
  const poolByFile = new Map();
  for (const row of Array.isArray(poolRows) ? poolRows : []) {
    for (const file of Array.isArray(row?.dosyalar) ? row?.dosyalar : []) {
      [file?.originalName, file?.savedName, file?.fileName]
        .map((name) => String(name || "").toLocaleLowerCase("tr-TR"))
        .filter(Boolean)
        .forEach((name) => poolByFile.set(name, row));
    }
  }
  return (Array.isArray(history) ? history : []).map((item) => {
    const fileKey = String(
      item?.fileName || item?.originalName || "",
    ).toLocaleLowerCase("tr-TR");
    const pool = poolByFile.get(fileKey);
    if (!pool) return item;
    return {
      ...item,
      status: pool.durum || item?.status,
      routedPool: item?.routedPool || "Belge Havuzu",
      poolStatus: pool.durum,
      processedResult: pool.processedResult || item?.processedResult,
    };
  });
}

function normalizeSupplierLine(line, index) {
  const safe = line && typeof line === "object" ? line : {};
  const quantity = Number(
    String(
      safe.quantity ?? safe.miktar ?? safe.qty ?? safe.amount ?? 0,
    ).replace(",", "."),
  );
  const unitPrice = Number(
    String(
      safe.unitPrice ?? safe.birimFiyat ?? safe.price ?? safe.fiyat ?? 0,
    ).replace(",", "."),
  );
  const kdvRate = Number(
    String(
      safe.kdvRate ?? safe.kdvOrani ?? safe.vatRate ?? safe.taxRate ?? 0,
    ).replace(",", "."),
  );
  const lineTotalRaw = Number(
    String(safe.lineTotal ?? safe.satirToplami ?? safe.total ?? 0).replace(
      ",",
      ".",
    ),
  );
  const lineTotal =
    Number.isFinite(lineTotalRaw) && lineTotalRaw > 0
       ? lineTotalRaw
      : Number((quantity * unitPrice).toFixed(2));
  const kdvAmountRaw = Number(
    String(safe.kdvAmount ?? safe.kdvTutari ?? safe.taxAmount ?? 0).replace(
      ",",
      ".",
    ),
  );
  const kdvAmount =
    Number.isFinite(kdvAmountRaw) && kdvAmountRaw > 0
       ? kdvAmountRaw
      : Number(((lineTotal * kdvRate) / 100).toFixed(2));

  const rawDescription = displayText(
    safe.rawDescription 
      safe.description 
      safe.aciklama 
      safe.itemName 
      safe.kalem 
      safe.productName 
      safe.urunAdi 
      safe.name,
    "",
  );
  const productName = displayText(
    safe.productName ?? safe.urunAdi ?? safe.matchedProductName,
    "",
  );

  return {
    ...safe,
    id: safe.id || `line-${index}-${uid("supplier")}`,
    rawDescription,
    productName,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: displayText(safe.unit ? safe.birim ?? "ADET", "ADET"),
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    kdvRate: Number.isFinite(kdvRate) ? kdvRate : 0,
    lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0,
    kdvAmount: Number.isFinite(kdvAmount) ? kdvAmount : 0,
    packaging: displayText(safe.packaging ? safe.ambalaj, ""),
    lotNo: displayText(safe.lotNo ? safe.lot, ""),
  };
}

function normalizeUploadResults(response) {
  const source = Array.isArray(response.results)
     ? response.results
    : Array.isArray(response.data.results)
       ? response.data.results
      : response.data.record || response.record || response
         ? [response.data.record || response.record || response]
        : [];
  return source
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .filter(Boolean);
}

export function BelgeYuklemePage({ activeMainCompany }) {
  const [files, setFiles] = useState([]);
  const [documentType, setDocumentType] = useState("");
  const [history, setHistory] = useState([]);
  const [poolRows, setPoolRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [busy, setBusy] = useState(false);
  const [poolTab, setPoolTab] = useState("bekleyen");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const fallbackFolders = [
    "HKN FATURA",
    "HKN İRSALİYE",
    "HKN XML",
    "HKN GELEN İRSALİYE",
    "HKN GELEN FATURA",
  ];
  const folderItems = (Array.isArray(summary.folders) ? summary.folders : [])
    .map((folder) => displayText(folder, "").trim())
    .filter(Boolean);
  const recentResults = (
    Array.isArray(summary.recentResults) ? summary.recentResults : []
  ).map((row, index) => {
    const safeRow = row && typeof row === "object" ? row : {};
    return {
      ...safeRow,
      id: safeRow.id || safeRow.fileName || `recent-${index}`,
      status: displayText(safeRow.status, "Bekliyor"),
      fileName: displayText(
        safeRow.fileName || safeRow.originalName || safeRow.savedName,
        "-",
      ),
    };
  });

  async function refresh(preserveDrafts = true) {
    if (!activeMainCompany?.slug) {
      setUploadMessage("Ana firma seçmeden belge yüklenemez.");
      setHistory([]);
      setPoolRows([]);
      setSummary({});
      return;
    }
    const [nextHistory, nextSummary, nextPool] = await Promise.all([
      fetchDocumentUploadHistory(activeMainCompany).catch(() => []),
      fetchDocumentUploadSummary(activeMainCompany).catch(() => ({})),
      fetchBelgeHavuzu(activeMainCompany).catch(() => []),
    ]);
    setHistory(nextHistory);
    setSummary(nextSummary);
    setPoolRows(nextPool);
  }

  useEffect(() => {
    refresh();
  }, [activeMainCompany?.id]);

  async function startUpload() {
    if (!files.length) return;
    if (!activeMainCompany?.slug) {
      setUploadMessage("Ana firma seçmeden belge yüklenemez.");
      return;
    }
    setBusy(true);
    setUploadMessage("");
    setUploadProgress({ done: 0, total: files.length });
    try {
      const response = await uploadMuhasebeDocuments(activeMainCompany, files, {
        documentType,
      });
      const uploadResults = normalizeUploadResults(response);
      setUploadProgress({ done: files.length, total: files.length, response });
      const failedNames = new Set(
        uploadResults
          .filter((row) =>
            String(row?.status || "")
              .toLocaleLowerCase("tr-TR")
              .includes("hata"),
          )
          .map((row) => row?.fileName),
      );
      setFiles((prev) => prev?.filter((file) => failedNames.has(file?.name)));
      await refresh();
      const failedCount = failedNames.size;
      setUploadMessage(
        failedCount
           ? `${uploadResults.length - failedCount} dosya kaydedildi, ${failedCount} dosya hata verdi. Hatalılar listede bırakıldı.`
          : `${files.length} dosya kaydedildi ve belge havuzuna düştü.`,
      );
    } catch (error) {
      setUploadMessage(error?.message || "Yükleme tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  const tempRows = files.map((file) => ({
    name: file?.name,
    type: file?.name.toLowerCase().endsWith(".xml")
       ? "XML"
      : file?.type.startsWith("image/")
         ? "Görsel"
        : "PDF",
    size: `${Math.max(1, Math.round(file?.size / 1024))} KB`,
  }));
  const visiblePoolRows = useMemo(
    () => filterRowsByStatusTab(poolRows, poolTab, "upload"),
    [poolRows, poolTab],
  );
  const syncedHistory = useMemo(
    () => syncUploadHistoryWithPool(history, poolRows),
    [history, poolRows],
  );
  const uploadTabs = [
    {
      value: "bekleyen",
      label: "Bekleyen",
      count: countByStatusTab(poolRows, "bekleyen", "upload"),
    },
    {
      value: "kontrol",
      label: "Kontrol Bekliyor",
      count: countByStatusTab(poolRows, "kontrol", "upload"),
    },
    {
      value: "islendi",
      label: "İşlendi",
      count: countByStatusTab(poolRows, "islendi", "upload"),
    },
    {
      value: "tasnif",
      label: "Tasnif Bekleyen",
      count: countByStatusTab(poolRows, "tasnif", "upload"),
    },
    { value: "tumu", label: "Tümü", count: poolRows.length },
  ];

  return (
    <div className="muh-doc-page">
      <PageHeader
        title="Belge Yükleme"
        subtitle="XML ana veri, PDF/JPEG/PNG arşiv ve görüntü dosyasıdır. Yüklenen belgeler önce belge havuzuna düşer."
      />
      <div className="muh-doc-upload-grid">
        <SectionCard title="Toplu Belge Kabul" className="muh-doc-upload-main">
          <label className="field" style={{ marginBottom: 12 }}>
            <span>Belge Tipi</span>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              <option value="">Otomatik Tespit</option>
              <option value="tedarikci_gelen_fatura">
                Tedarikçi Gelen Fatura
              </option>
              <option value="musteriden_gelen_irsaliye">
                Müşteriden Gelen İrsaliye
              </option>
              <option value="bizim_kestigimiz_fatura">
                Bizim Kestiğimiz Fatura
              </option>
              <option value="bizim_kestigimiz_irsaliye">
                Bizim Kestiğimiz İrsaliye
              </option>
            </select>
          </label>
          <label
            className="muh-doc-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setFiles((prev) => [
                ...prev,
                ...Array.from(e.dataTransfer.files || []),
              ]);
            }}
          >
            <input
              type="file"
              multiple
              accept=".xml,.pdf,.jpg,.jpeg,.png,application/xml,text/xml,application/pdf,image/jpeg,image/png"
              onChange={(e) =>
                setFiles((prev) => [
                  ...prev,
                  ...Array.from(e.target.files || []),
                ])
              }
            />
            <ErpIcon name="yukle" size={44} />
            <strong>Dosyaları buraya sürükleyip bırakın</strong>
            <span>Desteklenen formatlar: XML, PDF, JPEG, PNG</span>
          </label>
          <div className="muh-doc-table-wrap muh-doc-upload-list">
            <table>
              <thead>
                <tr>
                  <th>Dosya Adı</th>
                  <th>Tip</th>
                  <th>Belge Türü</th>
                  <th>Ana Firma</th>
                  <th>Durum</th>
                  <th>Boyut</th>
                  <th>Sil</th>
                </tr>
              </thead>
              <tbody>
                {tempRows.map((row, index) => (
                  <tr key={`${row?.name}-${index}`}>
                    <td>{row?.name}</td>
                    <td>
                      <StatusBadge value={row?.type} />
                    </td>
                    <td>{documentType || "Otomatik Algılanacak"}</td>
                    <td>{activeMainCompany?.name || "-"}</td>
                    <td>
                      <StatusBadge value="Hazır" />
                    </td>
                    <td>{row?.size}</td>
                    <td>
                      <button
                        className="muh-doc-icon"
                        type="button"
                        onClick={() =>
                          setFiles((prev) => prev?.filter((_, i) => i !== index))
                        }
                      >
                        <ErpIcon name="sil" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tempRows.length ? (
              <EmptyState text="Yüklenecek dosya seçilmedi." />
            ) : null}
          </div>
          <div className="muh-doc-actions">
            <span>
              {busy
                 ? `${uploadProgress.done || 0} / ${uploadProgress.total || files.length} dosya işlendi`
                : `${files.length} dosya seçildi`}
            </span>
            <button
              className="muh-doc-primary"
              type="button"
              onClick={startUpload}
              disabled={busy || !files.length}
            >
              <ErpIcon name="yukle" size={16} /> Yüklemeyi Başlat
            </button>
            <button
              className="muh-doc-soft"
              type="button"
              onClick={() => setFiles([])}
            >
              Temizle
            </button>
          </div>
          {uploadMessage ? (
            <div className="muh-doc-upload-message">{uploadMessage}</div>
          ) : null}
          <div className="muh-doc-info">
            XML dosyaları ana veri kaynağıdır. PDF dosyaları arşiv ve doğrulama
            amacıyla saklanır.
          </div>
        </SectionCard>
        <aside className="muh-doc-side-stack">
          <SectionCard title="Otomatik Yönlendirme Özeti">
            <div className="muh-doc-summary-grid">
              <SummaryBox
                value={summary.supplierInvoices || 0}
                label="Tedarikçi Fatura Havuzu"
              />
              <SummaryBox
                value={summary.incomingDeliveries || 0}
                label="Müşteriden Gelen İrsaliye"
              />
              <SummaryBox
                value={summary.outgoingDocuments || 0}
                label="Bizim Belgeler Havuzu"
              />
              <SummaryBox
                value={summary.pending || 0}
                label="Tasnif Bekleyen"
                tone="yellow"
              />
            </div>
          </SectionCard>
          <SectionCard title="Klasörleme">
            <div className="muh-doc-folder-list">
              {(folderItems.length ? folderItems : fallbackFolders).map(
                (folder) => (
                  <span key={folder}>{folder}</span>
                ),
              )}
            </div>
          </SectionCard>
          <SectionCard title="Son İşlem Sonuçları">
            <div className="muh-doc-result-list">
              {recentResults.map((row) => (
                <div key={row?.id}>
                  <StatusBadge value={row?.status} />
                  <span>{row?.fileName}</span>
                </div>
              ))}
              {!recentResults.length ? (
                <EmptyState text="Son işlem yok." />
              ) : null}
            </div>
          </SectionCard>
        </aside>
      </div>
      <SectionCard title="Yüklenen Belgeler" className="muh-doc-upload-history">
        <RecordTable
          rows={syncedHistory}
          columns={[
            ["uploadedAt", "Yükleme Zamanı"],
            ["fileName", "Dosya Adı"],
            ["fileType", "Tip"],
            ["detectedDocumentType", "Belge Türü"],
            ["mainCompanyName", "Ana Firma"],
            ["routedPool", "Yönlendirilen Havuz"],
            ["savedFolder", "Kaydedilen Klasör"],
            ["status", "Durum"],
          ]}
        />
      </SectionCard>
      <SectionCard title="Belge Havuzu" className="muh-doc-pool-section">
        <StatusTabs items={uploadTabs} active={poolTab} onChange={setPoolTab} />
        <RecordTable
          rows={visiblePoolRows}
          columns={[
            ["createdAt", "Tarih"],
            ["belgeNo", "Belge No"],
            ["belgeTipi", "Belge Tipi"],
            ["firma", "Firma"],
            ["genelToplam", "Toplam"],
            ["fileCount", "Dosya Sayısı"],
            ["durum", "Durum"],
            ["processedResult", "İşlem Sonucu"],
            ["uyari", "Uyarı"],
          ]}
          actions={(row) => (
            <button
              className="muh-doc-soft small"
              type="button"
              disabled={!documentDetailPath(row)}
              onClick={() => openDocumentDetail(row)}
            >
              {row.belgeTipi === "tedarikci_gelen_fatura"
                 ? "Tedarikçi Faturaya Git"
                : "Detaya Git"}
            </button>
          )}
        />
      </SectionCard>
    </div>
  );
}

function SummaryBox({ value, label, tone = "blue" }) {
  return (
    <div className={`muh-doc-summary tone-${tone}`}>
      <strong>{displayText(value, "0")}</strong>
      <span>{label}</span>
    </div>
  );
}

function RecordTable({ rows, columns, actions }) {
  const cellValue = (row, key) => {
    if (key === "belgeNo") return row?.taslakAlanlar.belgeNo || "";
    if (key === "firma")
      return (
        row?.taslakAlanlar.saticiUnvan || row?.taslakAlanlar.aliciUnvan || ""
      );
    if (key === "genelToplam") return row?.taslakAlanlar.genelToplam || "";
    if (key === "fileCount")
      return Array.isArray(row?.dosyalar) ? row?.dosyalar.length : "";
    if (key === "uyari")
      return Array.isArray(row?.uyarilar) ? row?.uyarilar[0] || "" : "";
    if (key === "processedResult") {
      const result = row?.processedResult || {};
      if (!result || !Object.keys(result).length) return "";
      return [
        result?.supplierInvoiceId ? "Fatura" : "",
        result?.cariMovementId ? "Cari" : "",
        Array.isArray(result?.kdvRecordIds) && result?.kdvRecordIds.length
           ? `KDV ${result?.kdvRecordIds.length}`
          : "",
        Array.isArray(result?.rawMaterialLotIds) &&
        result?.rawMaterialLotIds.length
           ? `Lot ${result?.rawMaterialLotIds.length}`
          : "",
      ]
        .filter(Boolean)
        .join(" / ");
    }
    return row?.[key] || "";
  };
  return (
    <div className="muh-doc-table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key}>{label}</th>
            ))}
            {actions ? <th>İşlem</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row?.id || row?.documentId || row?.invoiceId}>
              {columns.map(([key]) => {
                const value = displayText(cellValue(row, key), "");
                return (
                  <td key={key} className={`muh-doc-cell-${key}`} title={value}>
                    {key === "status" || key === "durum"  (
                      <StatusBadge value={value} />
                    ) : (
                      value || "-"
                    )}
                  </td>
                );
              })}
              {actions ? <td>{actions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <EmptyState /> : null}
    </div>
  );
}

export function MusteriIrsaliyePage({ activeMainCompany }) {
  const [pool, setPool] = useState([]);
  const [query, setQuery] = useState("");
  const [poolTab, setPoolTab] = useState("bekleyen");
  const [form, setForm] = useState({});
  const [selectedModel, setSelectedModel] = useState(null);
  const models = useModels(activeMainCompany);
  const refresh = () => {
    if (!activeMainCompany?.slug) {
      setPool([]);
      return;
    }
    // Belge havuzundan gelen irsaliyeleri çek, "musteriden_gelen_irsaliye" tipinde olanları göster
    fetchBelgeHavuzu(activeMainCompany)
      .then((rows) => {
        const gelenIrsaliyeler = Array.isArray(rows)
           rows.filter(
              (r) =>
                r.documentType === "musteriden_gelen_irsaliye" ||
                !r.documentType,
            ? )
          : [];
        setPool(gelenIrsaliyeler);
      })
      .catch(() => setPool([]));
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id]);
  async function save() {
    const saved = await saveIncomingDelivery(activeMainCompany, form);
    if (selectedModel?.id)
      await linkIncomingDeliveryToModel(
        activeMainCompany,
        saved?.id,
        selectedModel?.id,
      );
    setForm(saved);
    refresh();
  }
  const visiblePool = useMemo(
    () => filterRowsByStatusTab(pool, poolTab, "incoming"),
    [pool, poolTab],
  );
  const poolTabs = [
    {
      value: "bekleyen",
      label: "Bekleyen",
      count: countByStatusTab(pool, "bekleyen", "incoming"),
    },
    {
      value: "model",
      label: "Model Bekliyor",
      count: countByStatusTab(pool, "model", "incoming"),
    },
    {
      value: "baglandi",
      label: "Bağlandı",
      count: countByStatusTab(pool, "baglandi", "incoming"),
    },
    {
      value: "islendi",
      label: "İşlendi",
      count: countByStatusTab(pool, "islendi", "incoming"),
    },
    { value: "tumu", label: "Tümü", count: pool.length },
  ];
  return (
    <DocumentModelPage
      className="compact"
      title="Müşteriden Gelen İrsaliye"
      subtitle="Müşteriden gelen irsaliyeleri havuzdan seçip eksik alanları tamamlayın ve modele bağlayın."
      leftTop={
        <PoolListCard
          title="İrsaliye Havuzu"
          query={query}
          setQuery={setQuery}
          rows={visiblePool}
          selectedId={form.id}
          onSelect={setForm}
          tabs={{ items: poolTabs, active: poolTab, onChange: setPoolTab }}
          actions={
            <>
              <button
                className="muh-doc-primary small"
                onClick={() =>
                  setForm({
                    tarih: new Date().toISOString().slice(0, 10),
                    lines: [],
                  })
                }
              >
                Yeni Kayıt
              </button>
              <button className="muh-doc-soft small" onClick={refresh}>
                Yenile
              </button>
            </>
          }
          columns={[
            { key: "irsaliyeNo", label: "Belge No" },
            { key: "firma", label: "Firma" },
            { key: "tarih", label: "Tarih" },
            { key: "gelenAdet", label: "Adet" },
            {
              key: "durum",
              label: "Durum",
              render: (r) => <StatusBadge value={r.durum} />,
            },
          ]}
        />
      }
      leftBottom={
        <ModelListCard
          models={models}
          selectedId={selectedModel?.id}
          onSelect={setSelectedModel}
        />
      }
      right={
        <>
          <ActionBar
            title="Seçili İrsaliye"
            status={form.durum}
            meta={[
              { label: "Belge No", value: form.irsaliyeNo },
              { label: "Firma", value: form.firma },
              { label: "Tarih", value: form.tarih },
              { label: "Adet", value: form.gelenAdet },
            ]}
          >
            <button className="muh-doc-soft" onClick={refresh}>
              Yenile
            </button>
            <button className="muh-doc-soft" onClick={() => setForm({})}>
              Temizle
            </button>
            <button className="muh-doc-primary" onClick={save}>
              <ErpIcon name="kaydet" size={16} /> Kaydet
            </button>
            <button
              className="muh-doc-primary"
              disabled={!selectedModel?.id}
              onClick={() =>
                selectedModel &&
                setForm({
                  ...form,
                  modelId: selectedModel?.id,
                  modelAdi: selectedModel?.modelAdi,
                })
              }
            >
              Modele Bağla
            </button>
          </ActionBar>
          <SectionCard title="Belge Bilgisi">
            <div className="muh-doc-form-grid">
              <Field
                label="Ana Firma"
                value={activeMainCompany?.name || ""}
                onChange={() => {}}
              />
              <Field
                label="Firma"
                value={form.firma}
                onChange={(v) => setForm({ ...form, firma: v })}
              />
              <Field
                label="Tarih"
                type="date"
                value={form.tarih}
                onChange={(v) => setForm({ ...form, tarih: v })}
              />
              <Field
                label="İrsaliye No"
                value={form.irsaliyeNo}
                onChange={(v) => setForm({ ...form, irsaliyeNo: v })}
              />
              <Field
                label="Zemin"
                value={form.zemin}
                onChange={(v) => setForm({ ...form, zemin: v })}
              />
              <Field
                label="Kesimhane Adı"
                value={form.kesimhaneAdi}
                onChange={(v) => setForm({ ...form, kesimhaneAdi: v })}
              />
              <Field
                label="Gelen Adet"
                value={form.gelenAdet}
                onChange={(v) => setForm({ ...form, gelenAdet: v })}
              />
              <Field
                label="Piyon No"
                value={form.piyonNo}
                onChange={(v) => setForm({ ...form, piyonNo: v })}
              />
              <TextArea
                label="Açıklama"
                value={form.aciklama}
                onChange={(v) => setForm({ ...form, aciklama: v })}
              />
            </div>
          </SectionCard>
          <ModelConnect
            selectedModel={selectedModel}
            models={models}
            onSelect={setSelectedModel}
            onLink={() =>
              selectedModel &&
              setForm({
                ...form,
                modelId: selectedModel?.id,
                modelAdi: selectedModel?.modelAdi,
              })
            }
          />
          <SectionCard title="İrsaliye Satırları">
            <EditableSimpleLines
              rows={form.lines || []}
              onChange={(lines) => setForm({ ...form, lines })}
            />
          </SectionCard>
          <div className="muh-doc-total-row three">
            <SummaryBox label="Gelen Adet" value={form.gelenAdet || 0} />
            <SummaryBox
              label="Satır Sayısı"
              value={(form.lines || []).length}
            />
            <SummaryBox
              label="Model Durumu"
              value={form.modelId ? "Bağlı" : "Bekliyor"}
            />
          </div>
        </>
      }
    />
  );
}

function DocumentModelPage({
  title,
  subtitle,
  leftTop,
  leftBottom,
  right,
  className = "",
}) {
  return (
    <div className={`muh-doc-page ${className}`}>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="muh-doc-workspace">
        <aside className="muh-doc-left">
          {leftTop}
          {leftBottom}
        </aside>
        <main className="muh-doc-right">{right}</main>
      </div>
    </div>
  );
}

function ModelConnect({ selectedModel, models, onSelect, onLink }) {
  return (
    <SectionCard title="Model Bağlantısı">
      <div className="muh-doc-model-connect">
        <select
          value={selectedModel?.id || ""}
          onChange={(e) =>
            onSelect(models.find((m) => m.id === e.target.value) || null)
          }
        >
          <option value="">Model ara veya seç...</option>
          {models.slice(0, 50).map((model) => (
            <option key={model?.id} value={model?.id}>
              {model?.modelAdi} - {model?.musteriFirma}
            </option>
          ))}
        </select>
        <div className="muh-doc-chip-row">
          {models.slice(0, 6).map((model) => (
            <button
              key={model?.id}
              type="button"
              onClick={() => onSelect(model)}
            >
              {model?.modelAdi}
            </button>
          ))}
        </div>
        <button className="muh-doc-primary" type="button" onClick={onLink}>
          Modele Bağla
        </button>
      </div>
    </SectionCard>
  );
}

function EditableSimpleLines({ rows, onChange }) {
  const nextRows = rows.length
     ? rows
    : [
        {
          id: uid("line"),
          rawDescription: "",
          quantity: "",
          unit: "ADET",
          notes: "",
        },
      ];
  function patch(index, key, value) {
    onChange(
      nextRows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }
  return (
    <div className="muh-doc-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Açıklama</th>
            <th>Adet</th>
            <th>Birim</th>
            <th>Not</th>
            <th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {nextRows.map((row, index) => (
            <tr key={row?.id || index}>
              <td>
                <input
                  value={row?.rawDescription || row?.description || ""}
                  onChange={(e) =>
                    patch(index, "rawDescription", e.target.value)
                  }
                />
              </td>
              <td>
                <input
                  value={row?.quantity || row?.adet || ""}
                  onChange={(e) => patch(index, "quantity", e.target.value)}
                />
              </td>
              <td>
                <input
                  value={row?.unit || row?.birim || ""}
                  onChange={(e) => patch(index, "unit", e.target.value)}
                />
              </td>
              <td>
                <input
                  value={row?.notes || row?.not || ""}
                  onChange={(e) => patch(index, "notes", e.target.value)}
                />
              </td>
              <td>
                <button
                  className="muh-doc-icon"
                  onClick={() =>
                    onChange(nextRows.filter((_, i) => i !== index))
                  }
                >
                  <ErpIcon name="sil" size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="muh-doc-soft small"
        type="button"
        onClick={() =>
          onChange([
            ...nextRows,
            { id: uid("line"), rawDescription: "", quantity: "", unit: "ADET" },
          ])
        }
      >
        Kalem Ekle
      </button>
    </div>
  );
}

function BottomActions({ onClear, onSave }) {
  return (
    <div className="muh-doc-bottom-actions">
      <button className="muh-doc-soft" onClick={onClear}>
        Temizle
      </button>
      <button className="muh-doc-primary" onClick={onSave}>
        <ErpIcon name="kaydet" size={16} /> Kaydet
      </button>
    </div>
  );
}

export function BizimBelgelerPage({ activeMainCompany }) {
  const [pool, setPool] = useState([]);
  const [query, setQuery] = useState("");
  const [poolTab, setPoolTab] = useState("taslak");
  const [form, setForm] = useState({});
  const [selectedModel, setSelectedModel] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const models = useModels(activeMainCompany);
  const refresh = () => {
    if (!activeMainCompany?.slug) {
      setPool([]);
      return;
    }
    fetchOutgoingDocumentsPool(activeMainCompany)
      .then(setPool)
      .catch(() => setPool([]));
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id]);
  useEffect(() => {
    if (form.firma || form.aciklama)
      suggestModelsForOutgoingDocument(activeMainCompany, form)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
  }, [form.id, form.firma, form.aciklama]);
  async function save() {
    const saved = await saveOutgoingDocument(activeMainCompany, form);
    if (selectedModel?.id)
      await linkOutgoingDocumentToModel(
        activeMainCompany,
        saved?.id,
        selectedModel?.id,
      );
    setForm(saved);
    refresh();
  }
  const visiblePool = useMemo(
    () => filterRowsByStatusTab(pool, poolTab, "outgoing"),
    [pool, poolTab],
  );
  const poolTabs = [
    {
      value: "taslak",
      label: "Taslak",
      count: countByStatusTab(pool, "taslak", "outgoing"),
    },
    {
      value: "model",
      label: "Model Bekliyor",
      count: countByStatusTab(pool, "model", "outgoing"),
    },
    {
      value: "hazir",
      label: "Hazır",
      count: countByStatusTab(pool, "hazir", "outgoing"),
    },
    {
      value: "islendi",
      label: "İşlendi",
      count: countByStatusTab(pool, "islendi", "outgoing"),
    },
    { value: "tumu", label: "Tümü", count: pool.length },
  ];
  return (
    <DocumentModelPage
      className="compact"
      title="Bizim Belgeler"
      subtitle="Kestiğiniz fatura ve irsaliyeleri havuzdan seçin, modele bağlayın ve kaydedin."
      leftTop={
        <PoolListCard
          title="Belge Havuzu"
          query={query}
          setQuery={setQuery}
          rows={visiblePool}
          selectedId={form.id}
          onSelect={setForm}
          tabs={{ items: poolTabs, active: poolTab, onChange: setPoolTab }}
          actions={
            <>
              <button
                className="muh-doc-primary small"
                onClick={() =>
                  setForm({
                    belgeTuru: "Fatura",
                    tarih: new Date().toISOString().slice(0, 10),
                    lines: [],
                  })
                }
              >
                Yeni Kayıt
              </button>
              <button className="muh-doc-soft small" onClick={refresh}>
                Yenile
              </button>
            </>
          }
          columns={[
            {
              key: "faturaNo",
              label: "Belge No",
              render: (r) => r.faturaNo || r.irsaliyeNo,
            },
            { key: "firma", label: "Firma" },
            { key: "tarih", label: "Tarih" },
            { key: "belgeTuru", label: "Tür" },
            {
              key: "toplamTutar",
              label: "Tutar",
              render: (r) => money(r.toplamTutar),
            },
            {
              key: "durum",
              label: "Durum",
              render: (r) => <StatusBadge value={r.durum} />,
            },
          ]}
        />
      }
      leftBottom={
        <ModelListCard
          models={models}
          selectedId={selectedModel?.id}
          onSelect={setSelectedModel}
        />
      }
      right={
        <>
          <ActionBar
            title="Seçili Belge"
            status={form.durum}
            meta={[
              { label: "Belge No", value: form.faturaNo || form.irsaliyeNo },
              { label: "Firma", value: form.firma },
              { label: "Tarih", value: form.tarih },
              {
                label: "Tutar",
                value: form.toplamTutar ? money(form.toplamTutar) : "",
              },
            ]}
          >
            <button className="muh-doc-soft" onClick={refresh}>
              Yenile
            </button>
            <button className="muh-doc-soft" onClick={() => setForm({})}>
              Temizle
            </button>
            <button className="muh-doc-soft" onClick={save}>
              <ErpIcon name="kaydet" size={16} /> Kaydet
            </button>
            <button
              className="muh-doc-primary"
              disabled={!selectedModel?.id}
              onClick={() =>
                selectedModel &&
                setForm({
                  ...form,
                  modelId: selectedModel?.id,
                  modelAdi: selectedModel?.modelAdi,
                })
              }
            >
              Modele Bağla
            </button>
            <button
              className="muh-doc-primary"
              disabled={!form.id}
              onClick={() =>
                form.id &&
                createModelFromOutgoingDocument(activeMainCompany, form.id, {
                  modelAdi: form.modelAdi || form.aciklama,
                })
              }
            >
              Yeni Model Aç
            </button>
          </ActionBar>
          <SectionCard title="Belge">
            <div className="muh-doc-form-grid">
              <Field
                label="Firma"
                value={form.firma}
                onChange={(v) => setForm({ ...form, firma: v })}
              />
              <Field
                label="Tarih"
                type="date"
                value={form.tarih}
                onChange={(v) => setForm({ ...form, tarih: v })}
              />
              <Field
                label="Belge Türü"
                value={form.belgeTuru || "Fatura"}
                onChange={(v) => setForm({ ...form, belgeTuru: v })}
                options={["Fatura", "İrsaliye"]}
              />
              <Field
                label="Fatura No"
                value={form.faturaNo}
                onChange={(v) => setForm({ ...form, faturaNo: v })}
              />
              <Field
                label="İrsaliye No"
                value={form.irsaliyeNo}
                onChange={(v) => setForm({ ...form, irsaliyeNo: v })}
              />
              <Field
                label="KDV"
                value={form.kdv}
                onChange={(v) => setForm({ ...form, kdv: v })}
              />
              <Field
                label="Ara Toplam"
                value={form.araToplam}
                onChange={(v) => setForm({ ...form, araToplam: v })}
              />
              <Field
                label="Toplam Tutar"
                value={form.toplamTutar}
                onChange={(v) => setForm({ ...form, toplamTutar: v })}
              />
              <TextArea
                label="Açıklama"
                value={form.aciklama}
                onChange={(v) => setForm({ ...form, aciklama: v })}
              />
            </div>
          </SectionCard>
          <SectionCard title="Model Bağlantısı">
            <div className="muh-doc-suggestion-row">
              {suggestions.map((model) => (
                <button
                  key={model?.id}
                  className={selectedModel.id === model?.id ? "selected" : ""}
                  onClick={() => setSelectedModel(model)}
                >
                  <strong>{model?.modelAdi}</strong>
                  <span>{model?.musteriFirma}</span>
                </button>
              ))}
            </div>
            <ModelConnect
              selectedModel={selectedModel}
              models={models}
              onSelect={setSelectedModel}
              onLink={() =>
                selectedModel &&
                setForm({
                  ...form,
                  modelId: selectedModel?.id,
                  modelAdi: selectedModel?.modelAdi,
                })
              }
            />
          </SectionCard>
          <SectionCard title="Model Satırları">
            <EditableSimpleLines
              rows={form.lines || []}
              onChange={(lines) => setForm({ ...form, lines })}
            />
          </SectionCard>
        </>
      }
    />
  );
}

export function TedarikciFaturaPage({ activeMainCompany }) {
  const [pool, setPool] = useState([]);
  const [query, setQuery] = useState("");
  const [poolTab, setPoolTab] = useState("bekleyen");
  const [form, setForm] = useState({});
  const [message, setMessage] = useState("");
  const [approveBusy, setApproveBusy] = useState(false);
  const [bulkApproveBusy, setBulkApproveBusy] = useState(false);
  const [backgroundProcessingIds, setBackgroundProcessingIds] = useState([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [draftByPoolId, setDraftByPoolId] = useState({});
  const [selectedLineIndex, setSelectedLineIndex] = useState(0);
  const [rememberAlias, setRememberAlias] = useState(false);
  const [productRefreshKey, setProductRefreshKey] = useState(0);
  const [quickProduct, setQuickProduct] = useState(null);
  const autoProcessedPoolIdsRef = useRef(new Set());
  const autoProcessBusyRef = useRef(false);
  const products = useProducts(activeMainCompany, productRefreshKey);
  const recordId = (row) => row?.poolId || row?.id || "";
  function recalcTotalsForLines(nextLines) {
    const safeLines = Array.isArray(nextLines) ? nextLines : [];
    const subtotal = safeLines.reduce(
      (sum, line) => sum + Number(line?.lineTotal || 0),
      0,
    );
    const kdv = safeLines.reduce(
      (sum, line) => sum + Number(line?.kdvAmount || 0),
      0,
    );
    return {
      araToplam: Number(subtotal.toFixed(2)),
      kdv: Number(kdv.toFixed(2)),
      kdvToplam: Number(kdv.toFixed(2)),
      genelToplam: Number((subtotal + kdv).toFixed(2)),
    };
  }
  function commitFormDraft(nextForm) {
    const next = {
      ...nextForm,
      ...(Array.isArray(nextForm.lines)
         ? recalcTotalsForLines(nextForm.lines)
        : {}),
      hasLocalDraft: true,
    };
    setForm(next);
    const id = recordId(next);
    if (id) {
      setDraftByPoolId((prev) => ({ ...prev, [id]: next }));
      setPool((prev) =>
        prev.map((row) => (recordId(row) === id ? { ...row, ...next } : row)),
      );
    }
    return next;
  }
  function selectSupplierRow(row) {
    const currentId = recordId(form);
    if (currentId && form.id && form.hasLocalDraft) {
      setDraftByPoolId((prev) => ({
        ...prev,
        [currentId]: { ...form, hasLocalDraft: true },
      }));
      setPool((prev) =>
        prev.map((item) =>
          recordId(item) === currentId
             ? { ...item, ...form, hasLocalDraft: true }
            : item,
        ),
      );
    }
    const id = recordId(row);
    setForm(draftByPoolId[id] || row);
    setSelectedLineIndex(0);
  }
  function mapSupplierPoolRow(row) {
    const draft = row?.taslakAlanlar || {};
    const linesSource =
      [
        row?.invoiceItems,
        row?.kalemler,
        row?.lines,
        row?.items,
        row?.raw.kalemler,
        row?.raw.parsedItems,
        row?.raw.xmlItems,
        row?.raw.items,
      ].find((candidate) => Array.isArray(candidate)) || [];
    const lines = linesSource.map((line, index) =>
      normalizeSupplierLine(line, index),
    );
    const durum = statusKey(row?.normalizedStatus || row?.durum || row?.status);
    return {
      ...row,
      id: row?.id,
      poolId: row?.id,
      source: "belge-havuzu",
      belgeTipi: documentTypeKey(
        row?.normalizedType || row?.belgeTipi || row?.documentType || row?.type,
      ),
      faturaNo: draft.belgeNo || draft.faturaNo || "",
      invoiceNo: draft.belgeNo || draft.faturaNo || "",
      irsaliyeNo: draft.irsaliyeNo || "",
      firma: draft.supplierName || draft.saticiUnvan || row?.supplierName || "",
      rawSupplierName: draft.rawSupplierName || row?.rawSupplierName || "",
      supplierAliasNote: draft.supplierAliasNote || "",
      aliasMatched: Boolean(draft.aliasMatched || row?.aliasMatched),
      supplierVkn: draft.saticiVkn || "",
      tarih: draft.tarih || "",
      araToplam: draft.araToplam || 0,
      kdv: draft.kdvToplam || 0,
      kdvToplam: draft.kdvToplam || 0,
      genelToplam: draft.genelToplam || 0,
      aciklama: draft.aciklama || "",
      durum,
      status: durum,
      lines,
      processedResult: row?.processedResult,
    };
  }
  async function refresh(preserveDrafts = true) {
    if (!activeMainCompany?.slug) {
      setPool([]);
      setMessage("Ana firma seçmeden tedarikçi faturaları görüntülenemez.");
      return;
    }
    try {
      const rows = await fetchBelgeHavuzu(activeMainCompany, {
        belgeTipi: "tedarikci_gelen_fatura",
        limit: 1000,
      });
      const mappedRows = (Array.isArray(rows) ? rows : []).map(
        mapSupplierPoolRow,
      );
      const effectiveDrafts = preserveDrafts ? draftByPoolId : {};
      const mergedRows = mappedRows.map((row) => ({
        ...row,
        ...(effectiveDrafts[recordId(row)] || {}),
      }));
      setPool(mergedRows);
      const currentId = recordId(form);
      if (currentId) {
        const currentRow = mergedRows.find(
          (row) => recordId(row) === currentId,
        );
        if (currentRow) setForm(currentRow);
      }
      setMessage("");
    } catch (error) {
      setPool([]);
      setMessage(
        error?.message ||
          "Tedarikçi fatura havuzu yüklenemedi. API bağlantısını kontrol edin.",
      );
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id]);

  useEffect(() => {
    const currentId = recordId(form);
    if (!currentId) return;
    if (!activeMainCompany?.slug) return;
    if (!products.length) return;
    if (autoProcessBusyRef.current) return;
    if (autoProcessedPoolIdsRef.current.has(currentId)) return;

    const pendingIndexes = (form.lines || [])
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => {
        const hasMatch = Boolean(
          line?.matchedProductId ||
          String(line?.matchedProductName || "").trim(),
        );
        const hasSeedText = Boolean(
          String(
            line?.rawDescription ||
              line?.productName ||
              line?.matchedProductName ||
              "",
          ).trim(),
        );
        return !hasMatch && hasSeedText;
      })
      .map(({ index }) => index);

    if (!pendingIndexes.length) {
      autoProcessedPoolIdsRef.current.add(currentId);
      return;
    }

    autoProcessBusyRef.current = true;

    try {
      let existingCount = 0;
      const workingLines = [...(form.lines || [])];

      for (const index of pendingIndexes) {
        const line = workingLines[index] || {};
        const rawName = String(
          line?.matchedProductName ||
            line?.productName ||
            line?.rawDescription ||
            "",
        ).trim();
        if (!rawName) continue;

        const rawKey = normalizeProductSearch(rawName);
        const existing =
          products.find(
            (product) =>
              normalizeProductSearch(productLabel(product)) === rawKey,
          ) ||
          products.find((product) => {
            const key = normalizeProductSearch(productLabel(product));
            return (
              key && rawKey && (key.includes(rawKey) || rawKey.includes(key))
            );
          });

        if (!existing) continue;

        workingLines[index] = {
          ...line,
          matchedProductId: productId(existing),
          matchedProductName: productLabel(existing),
          productName: productLabel(existing),
          matchStatus: "eslesti",
          matchSource: "mevcut_urun",
        };
        existingCount += 1;
      }

      if (existingCount > 0) {
        const totalsPatch = recalcTotalsForLines(workingLines);
        const nextForm = {
          ...form,
          lines: workingLines,
          ...totalsPatch,
        };
        setForm(nextForm);
        setPool((prev) =>
          prev.map((row) =>
            recordId(row) === currentId
               {
                  ...row,
                  lines: workingLines,
                  ...totalsPatch,
                ? }
              : row,
          ),
        );
        setMessage(
          `Kalemlerden otomatik işlendi: ${existingCount} mevcut ürün eşleşti.`,
        );
      }

      autoProcessedPoolIdsRef.current.add(currentId);
    } finally {
      autoProcessBusyRef.current = false;
    }
  }, [form, activeMainCompany?.slug, products.length]);

  const lines = form.lines || [];
  const selectedLine = lines[selectedLineIndex] || null;
  const productSuggestions = useMemo(() => {
    const source = String(
      selectedLine.rawDescription || selectedLine.productName || "",
    ).toLocaleLowerCase("tr-TR");
    return products
      .map((product) => {
        const label = productLabel(product);
        const score = label
          .toLocaleLowerCase("tr-TR")
          .split(/\s+/)
          .filter((token) => token && source.includes(token)).length;
        return { product, label, score };
      })
      .filter((item) => item?.label && (item?.score > 0 || !source))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "tr"))
      .slice(0, 8);
  }, [products, selectedLine]);
  const totals = useMemo(
    () => ({
      subtotal: lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0),
      kdv: lines.reduce((s, l) => s + Number(l.kdvAmount || 0), 0),
      count: lines.length,
    }),
    [lines],
  );
  function normalizeProductSearch(value) {
    return String(value || "")
      .toLocaleLowerCase("tr-TR")
      .replace(/\s+/g, " ")
      .trim();
  }
  function defaultPackagingForLine(line) {
    const unit = String(line?.unit || "KG").toLocaleUpperCase("tr-TR");
    const quantity = Number(String(line?.quantity || 0).replace(",", "."));
    return line?.packaging || (quantity ? `${quantity} ${unit}` : unit);
  }
  function shouldShowNewProductButton(line) {
    const status = String(line?.matchStatus || "").toLocaleLowerCase("tr-TR");
    return (
      !line?.matchedProductId ||
      status.includes("bekliyor") ||
      status.includes("yeni") ||
      status.includes("eşleşmedi") ||
      status.includes("esles")
    );
  }
  function openQuickProduct(index = selectedLineIndex) {
    const line = lines[index];
    if (!line) return;
    const name = String(line?.productName || line?.rawDescription || "").trim();
    const unit = String(line?.unit || "KG").toLocaleUpperCase("tr-TR");
    setSelectedLineIndex(index);
    setQuickProduct({
      lineIndex: index,
      alias: rememberAlias,
      busy: false,
      form: {
        name,
        commercialName: name,
        category: "Kimyasal",
        unit: unit || "KG",
        defaultPackaging: defaultPackagingForLine(line),
        active: true,
        note: `Tedarikçi faturadan oluşturuldu. Kaynak belge: ${form.faturaNo || form.invoiceNo || "-"}`,
      },
    });
  }
  function patchQuickProduct(key, value) {
    setQuickProduct((prev) =>
      prev
         {
            ...prev,
            form: { ...prev?.form, [key]: value },
          ? }
        : prev,
    );
  }
  function applyProductToLine(index, product) {
    const id = productId(product);
    const label = productLabel(product);
    if (!id && !label) return;
    const next = lines.map((line, i) =>
      i === index
         {
            ...line,
            matchedProductId: id,
            matchedProductName: label,
            productName: label,
            matchStatus: "eslesti",
            matchSource: "mevcut_urun",
          ? }
        : line,
    );
    commitFormDraft({ ...form, lines: next });
  }
  function resolveProductForLine(line) {
    const candidates = [
      line?.matchedProductName,
      line?.productName,
      line?.rawDescription,
    ]
      .map((value) => normalizeProductSearch(value))
      .filter(Boolean);
    return (
      products.find((product) => {
        const label = normalizeProductSearch(productLabel(product));
        return label && candidates.some((candidate) => label === candidate);
      }) || null
    );
  }
  function productMatchPayloadForLines(sourceLines) {
    return (Array.isArray(sourceLines) ? sourceLines : []).map(
      (line, index) => {
        const resolvedProduct = line?.matchedProductId
           ? null
          : resolveProductForLine(line);
        const resolvedId = line?.matchedProductId || productId(resolvedProduct);
        const resolvedName =
          line?.matchedProductName || productLabel(resolvedProduct);
        return {
          lineId: line?.id,
          lineNo: line?.lineNo || index + 1,
          matchedProductId: resolvedId,
          matchedProductName: resolvedName,
          productName: resolvedName || line?.productName || line?.rawDescription,
        };
      },
    );
  }
  async function resolveOrCreateProductsForLines(sourceLines, options = {}) {
    const createMissing = options.createMissing !== false;
    const invoiceNo = String(
      options.invoiceNo || form.faturaNo || form.invoiceNo || "-",
    );
    const createConcurrency = Math.max(
      1,
      Number(options.createConcurrency || 4),
    );
    const list = Array.isArray(sourceLines) ? sourceLines : [];
    if (!list.length || !activeMainCompany?.slug) {
      return {
        lines: list,
        existingCount: 0,
        createdCount: 0,
        errorCount: 0,
        changed: false,
      };
    }

    let existingCount = 0;
    let createdCount = 0;
    let errorCount = 0;
    const workingLines = list.map((line) => ({ ...line }));
    const workingProducts = [...products];
    const pendingByKey = new Map();

    function findExistingProduct(rawKey) {
      if (!rawKey) return null;
      return (
        workingProducts.find(
          (product) => normalizeProductSearch(productLabel(product)) === rawKey,
        ) ||
        workingProducts.find((product) => {
          const key = normalizeProductSearch(productLabel(product));
          return (
            key && rawKey && (key.includes(rawKey) || rawKey.includes(key))
          );
        }) ||
        null
      );
    }

    for (let index = 0; index < workingLines.length; index += 1) {
      const line = workingLines[index] || {};
      const hasDirectMatch = Boolean(
        line?.matchedProductId || String(line?.matchedProductName || "").trim(),
      );
      if (hasDirectMatch) continue;

      const rawName = String(
        line?.matchedProductName ||
          line?.productName ||
          line?.rawDescription ||
          "",
      ).trim();
      if (!rawName) continue;

      const rawKey = normalizeProductSearch(rawName);
      const existing = findExistingProduct(rawKey);

      if (existing) {
        const label = productLabel(existing);
        workingLines[index] = {
          ...line,
          matchedProductId: productId(existing),
          matchedProductName: label,
          productName: label,
          matchStatus: "eslesti",
          matchSource: "mevcut_urun",
        };
        existingCount += 1;
        continue;
      }

      if (!createMissing) continue;

      const packaging = defaultPackagingForLine(line);
      if (!pendingByKey.has(rawKey)) {
        pendingByKey.set(rawKey, {
          rawName,
          unit: String(line?.unit || "KG").toLocaleUpperCase("tr-TR"),
          packaging,
          lineIndexes: [index],
        });
      } else {
        pendingByKey.get(rawKey).lineIndexes.push(index);
      }
    }

    const pendingItems = Array.from(pendingByKey.values());
    if (pendingItems.length) {
      let cursor = 0;
      const workers = Array.from(
        { length: Math.min(createConcurrency, pendingItems.length) },
        () =>
          (async () => {
            while (cursor < pendingItems.length) {
              const item = pendingItems[cursor];
              cursor += 1;
              try {
                const savedProduct = await saveProduct(activeMainCompany, {
                  urunAdi: item?.rawName,
                  ticariAdi: item?.rawName,
                  kategori: "Kimyasal",
                  birim: item?.unit,
                  varsayilanAmbalaj: item?.packaging,
                  not: `Tedarikçi faturadan oluşturuldu. Kaynak belge: ${invoiceNo}`,
                  aktif: true,
                  name: item?.rawName,
                  commercialName: item?.rawName,
                  category: "Kimyasal",
                  unit: item?.unit,
                  defaultPackaging: item?.packaging,
                  note: `Tedarikçi faturadan oluşturuldu. Kaynak belge: ${invoiceNo}`,
                  active: true,
                });
                workingProducts.push(savedProduct);
                const savedLabel = productLabel(savedProduct) || item?.rawName;
                const savedId = productId(savedProduct);
                item.lineIndexes.forEach((lineIndex) => {
                  const line = workingLines[lineIndex] || {};
                  workingLines[lineIndex] = {
                    ...line,
                    matchedProductId: savedId,
                    matchedProductName: savedLabel,
                    productName: savedLabel,
                    matchStatus: "eslesti",
                    matchSource: "yeni_urun",
                  };
                });
                createdCount += 1;
              } catch {
                errorCount += item?.lineIndexes.length;
              }
            }
          })(),
      );
      await Promise.all(workers);
    }

    return {
      lines: workingLines,
      existingCount,
      createdCount,
      errorCount,
      changed: existingCount > 0 || createdCount > 0,
    };
  }
  async function applySuggestedProduct(index, product) {
    const line = lines[index];
    const id = productId(product);
    const label = productLabel(product);
    applyProductToLine(index, product);
    if (rememberAlias && line?.rawDescription && id) {
      try {
        await createProductAlias(activeMainCompany, {
          rawName: line?.rawDescription,
          matchedProductId: id,
          matchedProductName: label,
          packaging: line?.packaging,
          sourceType: "supplier_invoice_line",
          note: `Kaynak belge: ${form.faturaNo || form.invoiceNo || ""}`,
        });
        setMessage("Ürün eşleşmesi alias olarak kaydedildi.");
      } catch (error) {
        setMessage(error?.message || "Alias kaydedilemedi.");
      }
    }
  }
  async function createProductAndBindLine() {
    if (!quickProduct || !activeMainCompany?.slug) return;
    const line = lines[quickProduct.lineIndex];
    if (!line) return;
    const draft = quickProduct.form || {};
    const productName = String(draft.name || "").trim();
    if (!productName) {
      setMessage("Ürün adı zorunludur.");
      return;
    }
    const targetKey = normalizeProductSearch(productName);
    const similar = products.find((product) => {
      const key = normalizeProductSearch(productLabel(product));
      return (
        key &&
        targetKey &&
        (key === targetKey ||
          key.includes(targetKey) ||
          targetKey.includes(key))
      );
    });
    if (
      similar &&
      !window.confirm("Benzer ürün bulundu, yine de yeni ürün açılsın mı")
    )
      return;
    setQuickProduct((prev) => (prev ? { ...prev, busy: true } : prev));
    try {
      const savedProduct = await saveProduct(activeMainCompany, {
        urunAdi: productName,
        ticariAdi: draft.commercialName || productName,
        kategori: draft.category || "Kimyasal",
        birim: draft.unit || "KG",
        varsayilanAmbalaj:
          draft.defaultPackaging || defaultPackagingForLine(line),
        not: draft.note || "",
        aktif: draft.active !== false,
        name: productName,
        commercialName: draft.commercialName || productName,
        category: draft.category || "Kimyasal",
        unit: draft.unit || "KG",
        defaultPackaging:
          draft.defaultPackaging || defaultPackagingForLine(line),
        note: draft.note || "",
        active: draft.active !== false,
      });
      const savedId = productId(savedProduct);
      const savedLabel = productLabel(savedProduct) || productName;
      const nextLines = lines.map((row, i) =>
        i === quickProduct.lineIndex
           {
              ...row,
              matchedProductId: savedId,
              matchedProductName: savedLabel,
              productName: savedLabel,
              matchStatus: "eslesti",
              matchSource: "yeni_urun",
            ? }
          : row,
      );
      commitFormDraft({ ...form, lines: nextLines });
      if (quickProduct.alias && line?.rawDescription) {
        await createProductAlias(activeMainCompany, {
          rawName: line?.rawDescription,
          matchedProductId: savedId,
          matchedProductName: savedLabel,
          packaging: line?.packaging || draft.defaultPackaging,
          sourceType: "supplier_invoice_line",
          note: `Kaynak belge: ${form.faturaNo || form.invoiceNo || ""}`,
        });
      }
      setProductRefreshKey((value) => value + 1);
      setQuickProduct(null);
      setMessage(`${savedLabel} ürünü açıldı ve kaleme bağlandı.`);
    } catch (error) {
      setMessage(error?.message || "Ürün oluşturulamadı.");
      setQuickProduct((prev) => (prev ? { ...prev, busy: false } : prev));
    }
  }
  async function autoCreateOrBindProduct(
    index = selectedLineIndex,
    options = {},
  ) {
    const silent = Boolean(options.silent);
    if (!activeMainCompany?.slug) {
      if (!silent) setMessage("Ana firma seçmeden ürün açılamaz.");
      return;
    }
    const line = lines[index];
    if (!line) return;
    const rawName = String(
      line?.matchedProductName || line?.productName || line?.rawDescription || "",
    ).trim();
    if (!rawName) {
      if (!silent) setMessage("Ürün açmak için kalem açıklaması boş olamaz.");
      return;
    }
    const rawKey = normalizeProductSearch(rawName);
    const existing =
      products.find(
        (product) => normalizeProductSearch(productLabel(product)) === rawKey,
      ) ||
      products.find((product) => {
        const key = normalizeProductSearch(productLabel(product));
        return key && rawKey && (key.includes(rawKey) || rawKey.includes(key));
      });
    if (existing) {
      const id = productId(existing);
      const label = productLabel(existing);
      const nextLines = lines.map((row, i) =>
        i === index
           {
              ...row,
              matchedProductId: id,
              matchedProductName: label,
              productName: label,
              matchStatus: "eslesti",
              matchSource: "mevcut_urun",
            ? }
          : row,
      );
      commitFormDraft({ ...form, lines: nextLines });
      if (rememberAlias && line?.rawDescription && id) {
        await createProductAlias(activeMainCompany, {
          rawName: line?.rawDescription,
          matchedProductId: id,
          matchedProductName: label,
          packaging: line?.packaging,
          sourceType: "supplier_invoice_line",
          note: `Kaynak belge: ${form.faturaNo || form.invoiceNo || ""}`,
        });
      }
      if (!silent) {
        setMessage(
          `Mevcut ürün eşleşti: ${label}. Yanlışsa listeden düzeltebilirsiniz.`,
        );
      }
      return { type: "existing", label };
    }
    try {
      const packaging = defaultPackagingForLine(line);
      const savedProduct = await saveProduct(activeMainCompany, {
        urunAdi: rawName,
        ticariAdi: rawName,
        kategori: "Kimyasal",
        birim: String(line?.unit || "KG").toLocaleUpperCase("tr-TR"),
        varsayilanAmbalaj: packaging,
        not: `Tedarikçi faturadan oluşturuldu. Kaynak belge: ${form.faturaNo || form.invoiceNo || "-"}`,
        aktif: true,
        name: rawName,
        commercialName: rawName,
        category: "Kimyasal",
        unit: String(line?.unit || "KG").toLocaleUpperCase("tr-TR"),
        defaultPackaging: packaging,
        note: `Tedarikçi faturadan oluşturuldu. Kaynak belge: ${form.faturaNo || form.invoiceNo || "-"}`,
        active: true,
      });
      const savedId = productId(savedProduct);
      const savedLabel = productLabel(savedProduct) || rawName;
      const nextLines = lines.map((row, i) =>
        i === index
           {
              ...row,
              matchedProductId: savedId,
              matchedProductName: savedLabel,
              productName: savedLabel,
              matchStatus: "eslesti",
              matchSource: "yeni_urun",
            ? }
          : row,
      );
      commitFormDraft({ ...form, lines: nextLines });
      if (rememberAlias && line?.rawDescription && savedId) {
        await createProductAlias(activeMainCompany, {
          rawName: line?.rawDescription,
          matchedProductId: savedId,
          matchedProductName: savedLabel,
          packaging,
          sourceType: "supplier_invoice_line",
          note: `Kaynak belge: ${form.faturaNo || form.invoiceNo || ""}`,
        });
      }
      setProductRefreshKey((value) => value + 1);
      if (!silent) {
        setMessage(
          `Yeni ürün açıldı ve kaleme bağlandı: ${savedLabel}. Yanlışsa listeden düzeltebilirsiniz.`,
        );
      }
      return { type: "created", label: savedLabel };
    } catch (error) {
      if (!silent) setMessage(error?.message || "Ürün otomatik açılamadı.");
      return { type: "error" };
    }
  }
  async function applyTypedProduct(index, options = {}) {
    const silent = Boolean(options.silent);
    const line = lines[index];
    const typed = String(
      line?.matchedProductName ||
        line?.productName ||
        line?.rawDescription ||
        "",
    ).trim();
    const exact = products.find(
      (product) =>
        productLabel(product).toLocaleLowerCase("tr-TR") ===
        typed.toLocaleLowerCase("tr-TR"),
    );
    const fallback = products.find((product) =>
      productLabel(product)
        .toLocaleLowerCase("tr-TR")
        .includes(typed.toLocaleLowerCase("tr-TR")),
    );
    if (exact || fallback) {
      const matched = exact || fallback;
      applyProductToLine(index, matched);
      if (!silent) setMessage(`Mevcut ürün eşleşti: ${productLabel(matched)}.`);
      return { type: "existing", label: productLabel(matched) };
    }

    if (!typed) {
      patchLine(index, "matchStatus", "bekliyor");
      return { type: "skipped" };
    }

    return autoCreateOrBindProduct(index, options);
  }
  async function rememberProductAlias(index) {
    const line = lines[index];
    if (!line?.matchedProductId || !line?.rawDescription) return;
    try {
      await createProductAlias(activeMainCompany, {
        rawName: line?.rawDescription,
        matchedProductId: line?.matchedProductId,
        matchedProductName: line?.matchedProductName,
        packaging: line?.packaging,
        sourceType: "supplier_invoice_line",
        note: `Kaynak belge: ${form.faturaNo || form.invoiceNo || ""}`,
      });
      setMessage("Ürün eşleşmesi alias olarak kaydedildi.");
    } catch (error) {
      setMessage(error?.message || "Alias kaydedilemedi.");
    }
  }
  function clearProductMatch(index) {
    const next = lines.map((line, i) =>
      i === index
         {
            ...line,
            matchedProductId: "",
            matchedProductName: "",
            matchStatus: "bekliyor",
            matchSource: "",
          ? }
        : line,
    );
    commitFormDraft({ ...form, lines: next });
  }
  function toggleInvoiceSelection(row, checked) {
    const id = row?.poolId || row?.id;
    if (!id || ["islendi", "reddedildi"].includes(String(row?.durum || "")))
      return;
    setSelectedInvoiceIds((prev) =>
      checked
         ? Array.from(new Set([...prev, id]))
        : prev.filter((item) => item !== id),
    );
  }
  function selectVisiblePendingInvoices() {
    const ids = visiblePool
      .filter(
        (row) => !["islendi", "reddedildi"].includes(String(row?.durum || "")),
      )
      .map((row) => row?.poolId || row?.id)
      .filter(Boolean);
    setSelectedInvoiceIds(ids);
  }

  function selectAllVisibleInvoices() {
    const ids = visiblePool
      .filter(
        (row) => !["islendi", "reddedildi"].includes(String(row?.durum || "")),
      )
      .map((row) => row?.poolId || row?.id)
      .filter(Boolean);
    setSelectedInvoiceIds(ids);
  }
  function approvalPayloadForRow(row) {
    const sourceLines =
      row.id === form.id ? lines : Array.isArray(row?.lines) ? row?.lines : [];
    return {
      confirm: true,
      lineOverrides: sourceLines,
      productMatches: productMatchPayloadForLines(sourceLines),
    };
  }
  function patchLine(index, key, value) {
    const next = lines.map((line, i) => {
      if (i !== index) return line;
      const row = { ...line, [key]: value };
      const quantity = Number(String(row?.quantity || 0).replace(",", "."));
      const unitPrice = Number(String(row?.unitPrice || 0).replace(",", "."));
      const kdvRate = Number(String(row?.kdvRate || 0).replace(",", "."));
      row.lineTotal = Number((quantity * unitPrice).toFixed(2));
      row.kdvAmount = Number(((row?.lineTotal * kdvRate) / 100).toFixed(2));
      return row;
    });
    commitFormDraft({ ...form, lines: next });
  }
  async function rematch() {
    if (!form.id || form.source === "belge-havuzu") {
      setMessage(
        "Merkezi belge havuzu kaydında ürün eşleştirme onay payload akışına bağlanacak.",
      );
      return;
    }
    const matched = await matchSupplierInvoiceLines(
      activeMainCompany,
      form.id,
      lines,
    );
    setForm(matched);
  }
  async function savePoolDraft() {
    const poolId = form.poolId || form.id;
    if (!poolId) {
      setMessage("Kaydedilecek fatura seçilmedi.");
      return;
    }
    setApproveBusy(true);
    try {
      // Kaydet = taslak; yeni ürün açma sadece Onayla adımında
      const resolved = await resolveOrCreateProductsForLines(lines, {
        createMissing: false,
        invoiceNo: form.faturaNo || form.invoiceNo,
      });
      const linesToSave = resolved.lines;
      if (resolved.changed) {
        commitFormDraft({ ...form, lines: linesToSave });
      }
      const saved = await updateBelgeHavuzu(activeMainCompany, poolId, {
        taslakAlanlar: {
          belgeNo: form.faturaNo,
          faturaNo: form.faturaNo,
          irsaliyeNo: form.irsaliyeNo,
          saticiUnvan: form.firma,
          saticiVkn: form.supplierVkn,
          tarih: form.tarih,
          araToplam: form.araToplam,
          kdvToplam: form.kdv || form.kdvToplam,
          genelToplam: form.genelToplam,
          aciklama: form.aciklama,
        },
        kalemler: linesToSave,
      });
      const mapped = mapSupplierPoolRow(saved);
      setForm(mapped);
      const savedId = recordId(mapped);
      if (savedId) {
        setDraftByPoolId((prev) => {
          const next = { ...prev };
          delete next[savedId];
          return next;
        });
        setPool((prev) =>
          prev.map((row) => (recordId(row) === savedId ? mapped : row)),
        );
      }
      const autoNote =
        resolved.existingCount || resolved.createdCount
           ? ` (${resolved.existingCount} eşleşti, ${resolved.createdCount} yeni açıldı)`
          : "";
      setMessage(`Fatura havuzu taslağı kaydedildi${autoNote}.`);
    } catch (error) {
      setMessage(error?.message || "Fatura taslağı kaydedilemedi.");
    } finally {
      setApproveBusy(false);
    }
  }
  async function saveAllLocalDrafts() {
    const currentId = recordId(form);
    const draftRows = {
      ...draftByPoolId,
      ...(currentId ? { [currentId]: { ...form, hasLocalDraft: true } } : {}),
    };
    const rowsToSave = Object.values(draftRows).filter(
      (row) => row?.id || row?.poolId,
    );
    if (!rowsToSave.length) {
      setMessage("Kaydedilecek taslak değişiklik yok.");
      return;
    }
    setApproveBusy(true);
    let savedCount = 0;
    const failures = [];
    try {
      for (const row of rowsToSave) {
        try {
          const rowLines = Array.isArray(row?.lines) ? row?.lines : [];
          // Toplu kaydet = taslak; yeni ürün açma sadece Onayla adımında
          const resolved = await resolveOrCreateProductsForLines(rowLines, {
            createMissing: false,
            invoiceNo: row?.faturaNo || row?.invoiceNo,
          });
          await updateBelgeHavuzu(activeMainCompany, row?.poolId || row?.id, {
            taslakAlanlar: {
              belgeNo: row?.faturaNo,
              faturaNo: row?.faturaNo,
              irsaliyeNo: row?.irsaliyeNo,
              saticiUnvan: row?.firma,
              saticiVkn: row?.supplierVkn,
              tarih: row?.tarih,
              araToplam: row?.araToplam,
              kdvToplam: row?.kdv || row?.kdvToplam,
              genelToplam: row?.genelToplam,
              aciklama: row?.aciklama,
            },
            kalemler: resolved.lines,
          });
          savedCount += 1;
        } catch (error) {
          failures.push(
            `${row?.faturaNo || row?.invoiceNo || row?.id}: ${error?.message || "kaydedilemedi"}`,
          );
        }
      }
      setDraftByPoolId({});
      await refresh(false);
      setMessage(
        failures.length
           ? `${savedCount} taslak kaydedildi, ${failures.length} hata var.`
          : `${savedCount} taslak kaydedildi.`,
      );
    } finally {
      setApproveBusy(false);
    }
  }
  async function saveSelectedOrCurrentDrafts() {
    const selectedRows = pool
      .filter(
        (row) =>
          selectedInvoiceIds.includes(row?.poolId || row?.id) &&
          !PROCESSED_STATUSES.includes(statusKey(row?.durum || row?.status)),
      )
      .map((row) => {
        const id = row?.poolId || row?.id;
        if (draftByPoolId[id]) return draftByPoolId[id];
        if (recordId(form) === id) return form;
        return mapSupplierPoolRow(row);
      });

    if (!selectedRows.length) {
      await savePoolDraft();
      return;
    }

    setApproveBusy(true);
    setMessage(`${selectedRows.length} belge taslağı hazırlanıyor...`);
    let savedCount = 0;
    const failures = [];
    const savedIds = [];
    try {
      for (const row of selectedRows) {
        try {
          const rowId = row?.poolId || row?.id;
          const rowLines = Array.isArray(row?.lines) ? row?.lines : [];
          const resolved = await resolveOrCreateProductsForLines(rowLines, {
            createMissing: false,
            invoiceNo: row?.faturaNo || row?.invoiceNo,
          });
          await updateBelgeHavuzu(activeMainCompany, rowId, {
            taslakAlanlar: {
              belgeNo: row?.faturaNo || row?.invoiceNo || row?.belgeNo || rowId,
              faturaNo: row?.faturaNo || row?.invoiceNo || row?.belgeNo || rowId,
              irsaliyeNo: row?.irsaliyeNo || "",
              saticiUnvan: row?.firma || row?.supplierName || "",
              saticiVkn: row?.supplierVkn || "",
              tarih: row?.tarih || "",
              araToplam: row?.araToplam || 0,
              kdvToplam: row?.kdv || row?.kdvToplam || 0,
              genelToplam: row?.genelToplam || 0,
              aciklama: row?.aciklama || "",
            },
            kalemler: resolved.lines,
          });
          savedCount += 1;
          savedIds.push(rowId);
        } catch (error) {
          failures.push(
            `${row?.faturaNo || row?.invoiceNo || row?.id}: ${error?.message || "kaydedilemedi"}`,
          );
        }
      }
      setDraftByPoolId((prev) => {
        const next = { ...prev };
        savedIds.forEach((id) => delete next[id]);
        return next;
      });
      await refresh(false);
      setMessage(
        failures.length
           ? `${savedCount} belge hazırlandı, ${failures.length} hata var.`
          : `${savedCount} belge havuzda hazırlandı.`,
      );
    } finally {
      setApproveBusy(false);
    }
  }
  async function approveSelected() {
    if (!activeMainCompany?.slug) {
      setMessage("Ana firma seçmeden belge onaylanamaz.");
      return;
    }
    const poolId = form.poolId || form.id;
    if (!poolId) {
      setMessage("Onaylanacak fatura seçilmedi.");
      return;
    }
    if (form.durum === "islendi") {
      setMessage("Bu belge daha önce işlenmiş.");
      return;
    }
    setApproveBusy(true);
    setMessage("Kalemler kontrol ediliyor...");
    try {
      const resolved = await resolveOrCreateProductsForLines(lines, {
        createMissing: true,
        invoiceNo: form.faturaNo || form.invoiceNo,
      });
      const linesToApprove = resolved.lines;
      if (resolved.changed) {
        commitFormDraft({ ...form, lines: linesToApprove });
      }
      const processed = await approveBelgeHavuzu(activeMainCompany, poolId, {
        confirm: true,
        lineOverrides: linesToApprove,
        productMatches: productMatchPayloadForLines(linesToApprove),
      });
      setDraftByPoolId((prev) => {
        const next = { ...prev };
        delete next[poolId];
        return next;
      });
      setSelectedInvoiceIds((prev) => prev?.filter((id) => id !== poolId));
      await refresh(false);
      setPoolTab("islenen");
      setForm(mapSupplierPoolRow(processed));
      const result = processed.processedResult || {};
      const autoNote =
        resolved.existingCount || resolved.createdCount
           ? ` Ürün: ${resolved.existingCount} eşleşti, ${resolved.createdCount} yeni.`
          : "";
      setMessage(
        `Belge işlendi. Fatura: ${result?.supplierInvoiceId || "-"}, Cari: ${result?.cariMovementId || "-"}, KDV: ${result?.kdvRecordIds.length || 0}, Lot: ${result?.rawMaterialLotIds.length || 0}.${autoNote}`,
      );
    } catch (error) {
      setMessage(error?.message || "Belge onaylanamadı.");
    } finally {
      setApproveBusy(false);
    }
  }
  async function approveCurrentOrSelected() {
    if (selectedInvoiceIds.length > 1) {
      await approveSelectedInvoices();
      return;
    }
    await approveSelected();
  }

  function selectedRowsForApproval() {
    const rows = pool
      .filter(
        (row) =>
          selectedInvoiceIds.includes(row?.poolId || row?.id) &&
          !PROCESSED_STATUSES.includes(statusKey(row?.durum || row?.status)),
      )
      .map((row) => {
        const id = row?.poolId || row?.id;
        if (draftByPoolId[id]) return draftByPoolId[id];
        if (recordId(form) === id) return form;
        return mapSupplierPoolRow(row);
      });
    if (rows.length) return rows;
    return form.id &&
      !PROCESSED_STATUSES.includes(statusKey(form.durum || form.status))
       ? [form]
      : [];
  }

  function startBackgroundApprove() {
    if (!activeMainCompany?.slug) {
      setMessage("Ana firma seçmeden belge onaylanamaz.");
      return;
    }
    const rowsToProcess = selectedRowsForApproval();
    if (!rowsToProcess.length) {
      setMessage("İşleme alınacak bekleyen fatura seçilmedi.");
      return;
    }
    const ok = window.confirm(
      `${rowsToProcess.length} tedarikçi faturası işlem kuyruğuna alınacak. Devam edilsin mi`,
    );
    if (!ok) return;

    const ids = rowsToProcess
      .map((row) => row?.poolId || row?.id)
      .filter(Boolean);
    setBackgroundProcessingIds((prev) => [...new Set([...prev, ...ids])]);
    setPool((prev) =>
      prev.map((row) =>
        ids.includes(row?.poolId || row?.id)
           ? { ...row, durum: "islemde", status: "islemde" }
          : row,
      ),
    );
    if (ids.includes(recordId(form))) {
      setForm((prev) => ({ ...prev, durum: "islemde", status: "islemde" }));
    }
    setSelectedInvoiceIds((prev) => prev?.filter((id) => !ids.includes(id)));
    setPoolTab("islemde");
    setMessage(
      `${rowsToProcess.length} belge işlemde sekmesine alındı. İşlem arka planda devam ediyor.`,
    );

    window.setTimeout(() => {
      processApprovalQueue(rowsToProcess);
    }, 0);
  }

  async function processApprovalQueue(rowsToProcess) {
    const preparedItems = [];
    const failures = [];
    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      const rowId = row?.poolId || row?.id;
      try {
        setMessage(
          `${i + 1} / ${rowsToProcess.length} belge kuyruk için hazırlanıyor...`,
        );
        const sourceLines =
          recordId(form) === rowId && Array.isArray(lines)
             ? lines
            : Array.isArray(row?.lines)
               ? row?.lines
              : [];
        const resolved = await resolveOrCreateProductsForLines(sourceLines, {
          createMissing: true,
          invoiceNo: row?.faturaNo || row?.invoiceNo,
        });
        preparedItems.push({
          id: rowId,
          belgeNo: row?.faturaNo || row?.invoiceNo || row?.belgeNo || rowId,
          payload: {
            confirm: true,
            lineOverrides: resolved.lines,
            productMatches: productMatchPayloadForLines(resolved.lines),
          },
        });
      } catch (error) {
        const messageText = String(error?.message || "hazırlanamadı");
        failures.push(
          `${row?.faturaNo || row?.invoiceNo || row?.id}: ${messageText}`,
        );
        setPool((prev) =>
          prev.map((item) =>
            recordId(item) === rowId
               ? { ...item, durum: "hata", status: "hata" }
              : item,
          ),
        );
      }
    }
    if (!preparedItems.length) {
      const ids = rowsToProcess.map((row) => recordId(row));
      setBackgroundProcessingIds((prev) =>
        prev.filter((id) => !ids.includes(id)),
      );
      setMessage(
        failures.length
           ? `Kuyruk hazırlanamadı. ${failures.slice(0, 2).join(" | ")}`
          : "Kuyruğa alınacak belge hazırlanamadı.",
      );
      return;
    }

    try {
      const job = await enqueueBelgeHavuzuApprovals(
        activeMainCompany,
        preparedItems,
      );
      const queuedIds = preparedItems.map((item) => item?.id);
      setMessage(
        `${preparedItems.length} belge backend işlem kuyruğuna bırakıldı. Diğer ekranlarda çalışmaya devam edebilirsiniz.`,
      );
      await pollApprovalQueue(job.id, queuedIds, failures);
    } catch (error) {
      const ids = preparedItems.map((item) => item?.id);
      setBackgroundProcessingIds((prev) =>
        prev.filter((id) => !ids.includes(id)),
      );
      setMessage(error?.message || "Belgeler işlem kuyruğuna alınamadı.");
    }
  }

  async function pollApprovalQueue(jobId, queuedIds, initialFailures = []) {
    let lastJob = null;
    for (let attempt = 0; attempt < 720; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      lastJob = await fetchBelgeHavuzuApprovalQueue(activeMainCompany, jobId);
      setMessage(
        `${lastJob.completed} / ${lastJob.total} belge işlendi. İşlemde: ${lastJob.processing}, bekleyen: ${lastJob.queued}, hata: ${lastJob.failed}.`,
      );
      if (["completed", "completed_with_errors"].includes(lastJob.status))
        break;
    }
    const completedIds = Array.isArray(lastJob.items)
       lastJob.items
          .filter((item) => item.status === "completed")
          ? .map((item) => item?.id)
      : queuedIds;
    setBackgroundProcessingIds((prev) =>
      prev.filter((id) => !queuedIds.includes(id)),
    );
    setDraftByPoolId((prev) => {
      const next = { ...prev };
      completedIds.forEach((id) => delete next[id]);
      return next;
    });
    await refresh(false);
    const failedMessages = [
      ...initialFailures,
      ...(Array.isArray(lastJob.items)
         lastJob.items
            .filter((item) => item.status === "error")
            .map(
              (item) => `${item?.belgeNo || item?.id}: ${item?.error || "hata"}`,
            ? )
        : []),
    ];
    setMessage(
      failedMessages.length
         ? `${completedIds.length} belge işlendi, ${failedMessages.length} hata var. ${failedMessages.slice(0, 2).join(" | ")}`
        : `${completedIds.length} belge arka planda onaylandı ve işlendi.`,
    );
  }
  async function approveSelectedInvoices() {
    if (!activeMainCompany?.slug) {
      setMessage("Ana firma seçmeden belge onaylanamaz.");
      return;
    }
    const selectedRows = pool.filter(
      (row) =>
        selectedInvoiceIds.includes(row?.poolId || row?.id) &&
        !PROCESSED_STATUSES.includes(statusKey(row?.durum || row?.status)),
    );
    if (!selectedRows.length) {
      setMessage("Toplu onay için bekleyen kayıt seçilmedi.");
      return;
    }
    const ok = window.confirm(
      `${selectedRows.length} seçili tedarikçi faturası onaylanıp işlenecek. Devam edilsin mi`,
    );
    if (!ok) return;
    setBulkApproveBusy(true);
    setMessage(`${selectedRows.length} belge işleme başlatılıyor...`);
    let success = 0;
    const failures = [];
    const clearedIds = [];
    try {
      for (let i = 0; i < selectedRows.length; i++) {
        const row = selectedRows[i];
        const rowId = row?.poolId || row?.id;
        const draftRow = draftByPoolId[rowId];
        setMessage(
          `${i + 1} / ${selectedRows.length} işleniyor: ${row?.faturaNo || row?.invoiceNo || rowId}...`,
        );
        try {
          const sourceLines = Array.isArray(draftRow.lines)
             ? draftRow.lines
            : row.id === form.id
               ? lines
              : Array.isArray(row?.lines)
                 ? row?.lines
                : [];
          const resolved = await resolveOrCreateProductsForLines(sourceLines, {
            createMissing: true,
            invoiceNo: row?.faturaNo || row?.invoiceNo,
          });
          await approveBelgeHavuzu(activeMainCompany, rowId, {
            confirm: true,
            lineOverrides: resolved.lines,
            productMatches: productMatchPayloadForLines(resolved.lines),
          });
          success += 1;
          clearedIds.push(rowId);
        } catch (error) {
          const messageText = String(error?.message || "");
          if (messageText.includes("daha önce işlenmiş")) {
            clearedIds.push(rowId);
            success += 1;
          } else {
            failures.push(
              `${row?.faturaNo || row?.invoiceNo || row?.id}: ${messageText || "onaylanamadı"}`,
            );
          }
        }
      }
      setDraftByPoolId((prev) => {
        const next = { ...prev };
        clearedIds.forEach((id) => delete next[id]);
        return next;
      });
      setSelectedInvoiceIds((prev) =>
        prev.filter((id) => !clearedIds.includes(id)),
      );
      await refresh(false);
      if (success) setPoolTab("bekleyen");
      setMessage(
        failures.length
           ? `${success} belge işlendi, ${failures.length} belge hata verdi. ${failures.slice(0, 3).join(" | ")}`
          : `${success} belge onaylandı ve işlendi.`,
      );
    } catch (error) {
      setMessage(`Toplu işlem sırasında beklenmeyen hata: ${error?.message}`);
    } finally {
      setBulkApproveBusy(false);
    }
  }
  const displaySubtotal = Number(form.araToplam || 0) || totals.subtotal;
  const displayKdv = Number(form.kdv || form.kdvToplam || 0) || totals.kdv;
  const displayGrandTotal =
    Number(form.genelToplam || 0) || displaySubtotal + displayKdv;
  const pendingMatches = lines.filter(
    (line) => !line?.matchedProductId && !resolveProductForLine(line),
  ).length;
  const missingLots = lines.filter(
    (line) => isLotRequiredForSupplierInvoice(form, line) && !line?.lotNo,
  ).length;
  const isPdfDraft =
    String(form.kaynak || "").toLocaleLowerCase("tr-TR") === "pdf" ||
    Boolean(form.pdfVerisi.taslak);
  const visiblePool = useMemo(
    () => filterRowsByStatusTab(pool, poolTab, "supplier"),
    [pool, poolTab],
  );
  const poolTabs = [
    {
      value: "bekleyen",
      label: "Bekleyen",
      count: countByStatusTab(pool, "bekleyen", "supplier"),
    },
    {
      value: "islenen",
      label: "İşlenen",
      count: countByStatusTab(pool, "islenen", "supplier"),
    },
    {
      value: "islemde",
      label: "İşlemde",
      count: Math.max(
        countByStatusTab(pool, "islemde", "supplier"),
        backgroundProcessingIds.length,
      ),
    },
    {
      value: "hatali",
      label: "Hatalı / Reddedilen",
      count: countByStatusTab(pool, "hatali", "supplier"),
    },
    { value: "tumu", label: "Tümü", count: pool.length },
  ];
  return (
    <DocumentModelPage
      className="compact"
      title="Tedarikçiden Gelen Fatura"
      subtitle="Tedarikçi faturalarını havuzdan seçin, kalemleri eşleştirin, lot bilgilerini taslakta koruyun."
      leftTop={
        <PoolListCard
          title="Fatura Havuzu"
          query={query}
          setQuery={setQuery}
          rows={visiblePool}
          selectedId={form.id}
          onSelect={selectSupplierRow}
          tabs={{ items: poolTabs, active: poolTab, onChange: setPoolTab }}
          actions={
            <div className="muh-doc-row-actions">
              <button
                className="muh-doc-soft small"
                onClick={selectVisiblePendingInvoices}
              >
                Bekleyenleri Seç
              </button>
              <button
                className="muh-doc-soft small"
                onClick={selectAllVisibleInvoices}
              >
                Tümünü Seç
              </button>
              <button
                className="muh-doc-soft small"
                onClick={refresh}
                disabled={bulkApproveBusy || approveBusy}
              >
                Yenile
              </button>
            </div>
          }
          columns={[
            {
              key: "sec",
              label: "",
              render: (r) => (
                <input
                  type="checkbox"
                  checked={selectedInvoiceIds.includes(r.poolId || r.id)}
                  disabled={["islendi", "reddedildi"].includes(
                    String(r.durum || ""),
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => toggleInvoiceSelection(r, e.target.checked)}
                />
              ),
            },
            { key: "faturaNo", label: "Belge No" },
            { key: "firma", label: "Tedarikçi" },
            { key: "tarih", label: "Tarih", render: (r) => dateTr(r.tarih) },
            {
              key: "genelToplam",
              label: "Toplam",
              render: (r) => money(r.genelToplam),
            },
            {
              key: "durum",
              label: "Durum",
              render: (r) => <StatusBadge value={r.durum} />,
            },
          ]}
        />
      }
      leftBottom={
        <SectionCard title="Ürün / Eşleşme" className="muh-doc-match-card">
          {selectedLine ? (
            <div className="muh-doc-match-panel">
              <div>
                <span>Seçili kalem</span>
                <strong>
                  {selectedLine.rawDescription || selectedLine.productName}
                </strong>
              </div>
              <div className="muh-doc-match-meta">
                <StatusBadge
                  value={lineMatchBadge(
                    selectedLine,
                    isLotRequiredForSupplierInvoice(form, selectedLine),
                  )}
                />
                <span>Ambalaj: {selectedLine.packaging || "-"}</span>
                <span>
                  Lot:{" "}
                  {isLotRequiredForSupplierInvoice(form, selectedLine)
                     ? selectedLine.lotNo || "-"
                    : "Bu faturada zorunlu değil"}
                </span>
              </div>
              <div className="muh-doc-product-list compact-list">
                {productSuggestions.map(({ product, label }) => (
                  <button
                    key={productId(product) || label}
                    type="button"
                    onClick={() =>
                      applyProductToLine(selectedLineIndex, product)
                    }
                  >
                    <strong>{label}</strong>
                    <span>
                      {product.kod || product.stockCode || product.birim || ""}
                    </span>
                  </button>
                ))}
              </div>
              <button
                className="muh-doc-soft"
                type="button"
                onClick={async () => {
                  await autoCreateOrBindProduct(selectedLineIndex);
                  openQuickProduct(selectedLineIndex);
                }}
              >
                Düzenle / Eşle
              </button>
              <label className="muh-doc-check">
                <input
                  type="checkbox"
                  checked={rememberAlias}
                  onChange={(e) => setRememberAlias(e.target.checked)}
                />{" "}
                Alias olarak hatırla
              </label>
              <button
                className="muh-doc-primary"
                type="button"
                disabled={!productSuggestions[0]}
                onClick={async () => {
                  await applySuggestedProduct(
                    selectedLineIndex,
                    productSuggestions[0].product,
                  );
                }}
              >
                Bu eşleşmeyi uygula
              </button>
            </div>
          ) : (
            <EmptyState text="Eşleştirme için bir kalem seçin." />
          )}
        </SectionCard>
      }
      right={
        <>
          <ActionBar
            title="Seçili Fatura"
            status={form.durum}
            meta={[
              { label: "Belge No", value: form.faturaNo },
              { label: "Tedarikçi", value: form.firma },
              { label: "Tarih", value: form.tarih },
              {
                label: "Toplam",
                value: displayGrandTotal ? money(displayGrandTotal) : "",
              },
            ]}
          >
            {form.durum === "islendi" ? <StatusBadge value="İşlendi" /> : null}
            <button className="muh-doc-soft" onClick={refresh}>
              Yenile
            </button>
            <button className="muh-doc-soft" onClick={() => setForm({})}>
              Temizle
            </button>
            <button
              className="muh-doc-soft"
              onClick={() => {
                window.location.href = `/muhasebe/cari-kasafirma=${encodeURIComponent(form.firma || "")}`;
              }}
              disabled={!form.firma}
            >
              Cariye Git
            </button>
            <button
              className="muh-doc-primary"
              onClick={approveCurrentOrSelected}
              disabled={
                approveBusy ||
                bulkApproveBusy ||
                Boolean(backgroundProcessingIds.length) ||
                (!form.id && !selectedInvoiceIds.length) ||
                (!selectedInvoiceIds.length &&
                  ["islendi", "reddedildi"].includes(String(form.durum || "")))
              }
            >
              <ErpIcon name="kaydet" size={16} />{" "}
              {approveBusy || bulkApproveBusy || backgroundProcessingIds.length
                 ? "İşleniyor"
                : selectedInvoiceIds.length
                   ? `İşleme Al (${selectedInvoiceIds.length})`
                  : form.durum === "islendi"
                     ? "İşlendi"
                    : "İşleme Al"}
            </button>
          </ActionBar>
          {isPdfDraft ? (
            <div className="muh-doc-result-panel">
              PDF’den okunan taslak bilgidir. XML yüklerseniz daha temiz kayıt
              alınır.
            </div>
          ) : null}
          {form.aliasMatched && form.rawSupplierName ? (
            <div className="muh-doc-result-panel">
              {form.supplierAliasNote ||
                `${form.rawSupplierName}, ${form.firma} ile eşleşti.`}
            </div>
          ) : null}
          <SectionCard title="Belge">
            <div className="muh-doc-form-grid four">
              <Field
                label="Ana Firma"
                value={activeMainCompany?.name || ""}
                onChange={() => {}}
              />
              <Field
                label="Firma / Tedarikçi"
                value={form.firma}
                onChange={(v) => commitFormDraft({ ...form, firma: v })}
              />
              <Field
                label="Tarih"
                type="date"
                value={form.tarih}
                onChange={(v) => commitFormDraft({ ...form, tarih: v })}
              />
              <Field
                label="Durum"
                value={form.durum || form.status}
                onChange={(v) =>
                  commitFormDraft({ ...form, durum: v, status: v })
                }
              />
              <Field
                label="Fatura No"
                value={form.faturaNo}
                onChange={(v) => commitFormDraft({ ...form, faturaNo: v })}
              />
              <Field
                label="İrsaliye No"
                value={form.irsaliyeNo}
                onChange={(v) => commitFormDraft({ ...form, irsaliyeNo: v })}
              />
              <Field
                label="Ara Toplam"
                value={form.araToplam || displaySubtotal}
                onChange={(v) => commitFormDraft({ ...form, araToplam: v })}
              />
              <Field
                label="KDV"
                value={form.kdv || displayKdv}
                onChange={(v) => commitFormDraft({ ...form, kdv: v })}
              />
              <Field
                label="Genel Toplam"
                value={form.genelToplam || displayGrandTotal}
                onChange={(v) => commitFormDraft({ ...form, genelToplam: v })}
              />
              <TextArea
                label="Açıklama"
                value={form.aciklama}
                onChange={(v) => commitFormDraft({ ...form, aciklama: v })}
              />
            </div>
          </SectionCard>
          <SectionCard
            title="Belge Kalemleri"
            className="muh-doc-lines-card"
            actions={
              <button className="muh-doc-soft small" onClick={rematch}>
                Ürün eşleştir
              </button>
            }
          >
            <div className="muh-doc-table-wrap wide">
              <table>
                <thead>
                  <tr>
                    {[
                      "Kalem / Açıklama",
                      "Ürün / Eşleşme",
                      "Ambalaj",
                      "Lot No",
                      "Miktar",
                      "Birim",
                      "Birim Fiyat",
                      "KDV Oranı",
                      "KDV Tutarı",
                      "Satır Toplamı",
                      "Eşleşme Durumu",
                      "İşlem",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line?.id || index}>
                      <td>
                        <input
                          value={line?.rawDescription || ""}
                          onFocus={() => setSelectedLineIndex(index)}
                          onChange={(e) =>
                            patchLine(index, "rawDescription", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <div>
                          <input
                            list="muh-doc-products"
                            value={
                              line?.matchedProductName ||
                              line?.productName ||
                              line?.rawDescription ||
                              ""
                            }
                            onFocus={() => setSelectedLineIndex(index)}
                            onChange={(e) =>
                              patchLine(
                                index,
                                "matchedProductName",
                                e.target.value,
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") applyTypedProduct(index);
                            }}
                            placeholder="Ürün ara..."
                          />
                          {lineMatchMiniText(line) ? (
                            <small className="muh-doc-line-mini-status">
                              {lineMatchMiniText(line)}
                            </small>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <input
                          value={line?.packaging || ""}
                          onChange={(e) =>
                            patchLine(index, "packaging", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          className={
                            isLotRequiredForSupplierInvoice(form, line) &&
                            !line?.lotNo
                               ? "warn"
                              : ""
                          }
                          value={line?.lotNo || ""}
                          onChange={(e) =>
                            patchLine(index, "lotNo", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={line?.quantity || ""}
                          onChange={(e) =>
                            patchLine(index, "quantity", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={line?.unit || ""}
                          onChange={(e) =>
                            patchLine(index, "unit", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={line?.unitPrice || ""}
                          onChange={(e) =>
                            patchLine(index, "unitPrice", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={line?.kdvRate || ""}
                          onChange={(e) =>
                            patchLine(index, "kdvRate", e.target.value)
                          }
                        />
                      </td>
                      <td>{money(line?.kdvAmount)}</td>
                      <td>{money(line?.lineTotal)}</td>
                      <td>
                        <StatusBadge
                          value={lineMatchBadge(
                            line,
                            isLotRequiredForSupplierInvoice(form, line),
                          )}
                        />
                      </td>
                      <td>
                        <div className="muh-doc-row-actions">
                          <button
                            className="muh-doc-soft small"
                            onClick={() => applyTypedProduct(index)}
                          >
                            Uygula
                          </button>
                          <button
                            className="muh-doc-soft small"
                            onClick={() => clearProductMatch(index)}
                          >
                            Temizle
                          </button>
                          <button
                            className="muh-doc-soft small"
                            onClick={async () => {
                              await autoCreateOrBindProduct(index);
                              openQuickProduct(index);
                            }}
                            title="Ürün düzenle veya eşle"
                          >
                            Eşle
                          </button>
                          <button
                            className="muh-doc-icon"
                            onClick={() =>
                              commitFormDraft({
                                ...form,
                                lines: lines.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <ErpIcon name="sil" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="muh-doc-products">
                {products.map((product) => (
                  <option
                    key={productId(product) || productLabel(product)}
                    value={productLabel(product)}
                  />
                ))}
              </datalist>
              {!lines.length ? (
                <EmptyState
                  text={
                    isPdfDraft
                       ? "PDF’den kalemler net okunamadı, XML ile doğrulama önerilir."
                      : "Bu faturada kalem okunamadı veya XML kalemleri boş."
                  }
                />
              ) : null}
              <button
                className="muh-doc-soft small"
                onClick={() =>
                  commitFormDraft({
                    ...form,
                    lines: [
                      ...lines,
                      {
                        id: uid("line"),
                        unit: "KG",
                        kdvRate: 18,
                        matchStatus: "Eşleşmedi",
                      },
                    ],
                  })
                }
              >
                Kalem Ekle
              </button>
            </div>
          </SectionCard>
          <div className="muh-doc-total-row">
            <SummaryBox label="Ara Toplam" value={money(displaySubtotal)} />
            <SummaryBox label="KDV" value={money(displayKdv)} />
            <SummaryBox label="Genel Toplam" value={money(displayGrandTotal)} />
            <SummaryBox label="Kalem" value={totals.count} />
          </div>
          <div className="muh-doc-result-panel">
            {form.processedResult ? (
              <div>
                İşlem sonucu: Fatura{" "}
                {form.processedResult.supplierInvoiceId || "-"} / Cari{" "}
                {form.processedResult.cariMovementId || "-"} / KDV{" "}
                {form.processedResult.kdvRecordIds.length || 0} / Lot{" "}
                {form.processedResult.rawMaterialLotIds.length || 0}
              </div>
            ) : null}
            {pendingMatches ? (
              <div>{pendingMatches} kalemde ürün eşleşmesi bekliyor.</div>
            ) : null}
            {missingLots ? <div>{missingLots} kalemde lot eksik.</div> : null}
            {Array.isArray(form.uyarilar) &&
              form.uyarilar.map((warning, index) => (
                <div key={`${warning}-${index}`}>{warning}</div>
              ))}
            {message ? <div>{message}</div> : null}
          </div>
          {quickProduct ? (
            <div
              className="mgi-modal-overlay"
              onClick={() => !quickProduct.busy && setQuickProduct(null)}
            >
              <div
                className="mgi-modal-card muh-doc-quick-product"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="muh-doc-card-head">
                  <h3>Yeni Ürün Aç</h3>
                  <button
                    className="muh-doc-soft small"
                    type="button"
                    disabled={quickProduct.busy}
                    onClick={() => setQuickProduct(null)}
                  >
                    Vazgeç
                  </button>
                </div>
                <div className="muh-doc-form-grid">
                  <Field
                    label="Ürün Adı"
                    value={quickProduct.form.name}
                    onChange={(v) => patchQuickProduct("name", v)}
                  />
                  <Field
                    label="Ticari Ad"
                    value={quickProduct.form.commercialName}
                    onChange={(v) => patchQuickProduct("commercialName", v)}
                  />
                  <Field
                    label="Kategori"
                    value={quickProduct.form.category}
                    onChange={(v) => patchQuickProduct("category", v)}
                  />
                  <Field
                    label="Birim"
                    value={quickProduct.form.unit}
                    onChange={(v) => patchQuickProduct("unit", v)}
                  />
                  <Field
                    label="Varsayılan Ambalaj"
                    value={quickProduct.form.defaultPackaging}
                    onChange={(v) => patchQuickProduct("defaultPackaging", v)}
                  />
                  <label className="muh-doc-check">
                    <input
                      type="checkbox"
                      checked={quickProduct.form.active !== false}
                      onChange={(e) =>
                        patchQuickProduct("active", e.target.checked)
                      }
                    />
                    Aktif
                  </label>
                  <label className="muh-doc-check">
                    <input
                      type="checkbox"
                      checked={quickProduct.alias}
                      onChange={(e) =>
                        setQuickProduct((prev) =>
                          prev ? { ...prev, alias: e.target.checked } : prev,
                        )
                      }
                    />
                    Alias olarak bağla
                  </label>
                  <TextArea
                    label="Not"
                    value={quickProduct.form.note}
                    onChange={(v) => patchQuickProduct("note", v)}
                  />
                </div>
                <div className="muh-doc-actions">
                  <button
                    className="muh-doc-soft"
                    type="button"
                    disabled={quickProduct.busy}
                    onClick={() => setQuickProduct(null)}
                  >
                    Vazgeç
                  </button>
                  <button
                    className="muh-doc-primary"
                    type="button"
                    disabled={quickProduct.busy || !quickProduct.form.name}
                    onClick={createProductAndBindLine}
                  >
                    {quickProduct.busy
                       ? "Açılıyor..."
                      : "Ürünü Aç ve Kaleme Bağla"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      }
    />
  );
}
