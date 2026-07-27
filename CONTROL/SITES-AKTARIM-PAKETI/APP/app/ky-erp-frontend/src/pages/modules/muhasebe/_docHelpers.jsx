import { useEffect, useMemo, useRef, useState } from "react";
import ModelSelect from "../../../components/common/ModelSelect";
import { ErpIcon } from "../../../components/erp/IconMap";
import { normalizeList } from "../../../utils/normalizeList";
import {
  filterBizimBelgeler,
  filterMusteriIrsaliyeleri,
  normalizeLines,
  parseDocumentFileName,
} from "../../../utils/documentFlow";
import { getModelImageSource } from "../../../utils/modelImage";
import {
  createModelFromOutgoingDocument,
  fetchCompanies,
  createProductAlias,
  fetchIncomingDeliveryPool,
  fetchMuhasebeModels,
  fetchOutgoingDocumentsPool,
  fetchProducts,
  linkIncomingDeliveryToModel,
  linkOutgoingDocumentToModel,
  matchSupplierInvoiceLines,
  prepareMailLog,
  prepareOutgoingMailPackage,
  saveIncomingDelivery,
  saveOutgoingDocument,
  saveProduct,
  suggestModelsForOutgoingDocument,
} from "../../../services/muhasebeService";
import {
  approveBelgeHavuzu,
  cleanupOldDocumentUploads,
  enqueueBelgeHavuzuApprovals,
  fetchBelgeHavuzuApprovalQueue,
  fetchBelgeHavuzu,
  fetchDocumentReadTemplates,
  fetchDocumentUploadHistory,
  fetchDocumentUploadSummary,
  reprocessBelgeHavuzu,
  reprocessPendingBelgeHavuzu,
  saveDocumentReadTemplate,
  softDeleteBelgeYukleme,
  updateBelgeHavuzu,
  uploadMuhasebeDocuments,
} from "../../../services/muhasebeDocumentService";


export function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function dateTr(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : text;
}

export function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function displayText(value, fallback = "") {
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

export function PageHeader({ title, subtitle }) {
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

export function SectionCard({ title, children, actions, className = "" }) {
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

export function StatusBadge({ value }) {
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

export function EmptyState({ text = "Kayıt bulunamadı." }) {
  return (
    <div className="muh-doc-empty">
      <ErpIcon name="bilgi" size={24} />
      <span>{text}</span>
    </div>
  );
}

export function SearchToolbar({ value, onChange, placeholder, children }) {
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

export function Field({
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

export function TextArea({ label, value, onChange }) {
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

export function PoolListCard({
  title,
  query,
  setQuery,
  rows,
  columns,
  selectedId,
  onSelect,
  onOpen,
  actions,
  emptyText,
  tabs,
}) {
  const rowList = useMemo(() => normalizeList(rows), [rows]);
  const filtered = useMemo(() => {
    const q = String(query || "").toLocaleLowerCase("tr-TR");
    if (!q) return rowList;
    return rowList.filter((row) =>
      JSON.stringify(row).toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [query, rowList]);
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
                onDoubleClick={() => onOpen?.(row)}
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

export function normalizeLookup(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

export function ModelListCard({ models, onSelect, selectedId, firma = "" }) {
  const [query, setQuery] = useState("");
  const modelList = useMemo(() => normalizeList(models), [models]);
  const firmaKey = normalizeLookup(firma);
  const visible = modelList.filter((row) => {
    const modelFirma = row?.musteriFirma || row?.firmaAdi || "";
    const haystack = `${row?.modelAdi} ${modelFirma} ${
      row?.zemin || row?.zeminRenk || ""
    }`.toLocaleLowerCase("tr-TR");
    const firmMatch =
      !firmaKey || normalizeLookup(modelFirma).includes(firmaKey);
    return firmMatch && haystack.includes(query.toLocaleLowerCase("tr-TR"));
  });
  return (
    <SectionCard
      title="Model Bağlantısı Bekleyenler"
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
            <span>{model?.musteriFirma || model?.firmaAdi}</span>
            <StatusBadge value={model?.aktif ? "Açık" : "Kapalı"} />
          </button>
        ))}
        {!visible.length ? <EmptyState text="Model bulunamadı." /> : null}
      </div>
    </SectionCard>
  );
}

export function useModels(activeMainCompany) {
  const [models, setModels] = useState([]);
  useEffect(() => {
    if (!activeMainCompany?.slug) {
      setModels([]);
      return;
    }
    fetchMuhasebeModels(activeMainCompany)
      .then((rows) => setModels(normalizeList(rows)))
      .catch(() => setModels([]));
  }, [activeMainCompany?.id]);
  return models;
}

export function useCompanyDefaults(activeMainCompany) {
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    if (!activeMainCompany?.slug) {
      setCompanies([]);
      return;
    }
    fetchCompanies(activeMainCompany)
      .then((rows) => setCompanies(normalizeList(rows)))
      .catch(() => setCompanies([]));
  }, [activeMainCompany?.id]);
  return companies;
}

export function findCompanyDefaults(companies, firma) {
  const key = normalizeLookup(firma);
  if (!key) return null;
  return (
    companies.find((company) => normalizeLookup(company?.firma) === key) ||
    companies.find((company) => normalizeLookup(company?.name) === key) ||
    null
  );
}

export function applyCompanyDefaults(form, company) {
  if (!company) return form;
  const recordType =
    company?.varsayilanRecordType || company?.resmiDurum || "RESMI";
  const vatRate = company?.varsayilanVatRate ?? company?.vatRate ?? "";
  const vatMode = company?.varsayilanVatMode || company?.vatMode || "HARIC";
  return {
    ...form,
    companyId: form.companyId || company?.id || "",
    firma: company?.firma || form.firma || "",
    resmiDurum: form.resmiDurum || recordType,
    recordGroup: form.recordGroup || recordType,
    kdvOrani: form.kdvOrani || vatRate,
    kdvMode: form.kdvMode || vatMode,
    varsayilanVadeGunu:
      form.varsayilanVadeGunu || company?.varsayilanVadeGunu || "",
    odemeHatirlatmaGunu:
      form.odemeHatirlatmaGunu || company?.odemeHatirlatmaGunu || "",
    emailContacts: form.emailContacts || company?.emailContacts || [],
  };
}

export function useProducts(activeMainCompany, refreshKey = 0) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    if (!activeMainCompany?.slug) {
      setProducts([]);
      return;
    }
    fetchProducts(activeMainCompany)
      .then((rows) => setProducts(normalizeList(rows)))
      .catch(() => setProducts([]));
  }, [activeMainCompany?.id, refreshKey]);
  return products;
}

export function productId(product) {
  return String(product.id || product.productId || product.kod || "");
}

export function productLabel(product) {
  return String(
    product.urunAdi ||
      product.ticariAdi ||
      product.productName ||
      product.name ||
      product.kod ||
      "",
  ).trim();
}

export function ActionBar({ title, meta = [], status, children }) {
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

export function lineMatchBadge(line, lotRequired = true) {
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

export function lineMatchMiniText(line) {
  const source = String(line?.matchSource || "").toLocaleLowerCase("tr-TR");
  if (source === "yeni_urun") return "Yeni";
  if (source === "mevcut_urun") return "Eşleşti";
  if (line?.matchedProductId) return "Eşleşti";
  return "";
}

export const LOT_REQUIRED_SUPPLIER_KEYWORDS = [
  "URAS",
  "TURAN",
  "KIMYA",
  "KİMYA",
  "BOYA",
  "KIMYEVI",
  "KİMYEVİ",
];

export const LOT_REQUIRED_PRODUCT_KEYWORDS = [
  "KIMYA",
  "KİMYA",
  "BOYA",
  "PIGMENT",
  "BASE",
  "FIKSATOR",
  "FİKSATÖR",
  "TUTKAL",
];

export function normalizeLotRuleText(value) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/İ/g, "I");
}

export function isLotRequiredForSupplierInvoice(form, line) {
  return false;
}

export const WAITING_STATUSES = [
  "taslak",
  "kontrol_bekliyor",
  "eksik_bilgi",
  "onay_bekliyor",
  "onaylandi",
  "bekleyen",
];
export const PROCESSED_STATUSES = [
  "islendi",
  "processed",
  "islenen",
  "işlenen",
  "done",
  "completed",
  "reddedildi",
  "rejected",
];

export function statusKey(value) {
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

export function documentTypeKey(value) {
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

export function countByStatusTab(rows, tab, group) {
  return filterRowsByStatusTab(rows, tab, group).length;
}

export function filterRowsByStatusTab(rows, tab, group) {
  const list = Array.isArray(rows) ? rows : [];
  if (tab === "tumu") return list;
  return list.filter((row) => {
    const status = statusKey(row?.durum || row?.status);
    const hasModel = Boolean(
      row?.modelId || row?.modelKaydiId || row?.matchedModelId,
    );
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
          "bekleyen",
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
        return [
          "taslak",
          "onay_bekliyor",
          "model_baglantisi_bekliyor",
          "bekleyen",
        ].includes(status);
      if (tab === "kontrol")
        return ["kontrol_bekliyor", "eksik_bilgi"].includes(status);
      if (tab === "islendi") return status === "islendi";
      if (tab === "tasnif") return isUnknown || status.includes("tasnif");
    }

    return true;
  });
}

export function StatusTabs({ items, active, onChange }) {
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

export function documentDetailPath(row) {
  const type = row?.targetType || row?.belgeTipi;
  const selected = row?.targetRecordId
     ? `selected=${encodeURIComponent(row?.targetRecordId)}`
    : "";
  if (type === "MUSTERIDEN_GELEN_IRSALIYE")
    return `/muhasebe/belgeler${selected}`;
  if (type === "BIZIM_GIDEN_IRSALIYE" || type === "BIZIM_GIDEN_FATURA")
    return `/muhasebe/belgeler${selected}`;
  if (type === "TEDARIKCI_GELEN_FATURA")
    return `/muhasebe/tedarikci-fatura${selected}`;
  if (type === "tedarikci_gelen_fatura") return "/muhasebe/tedarikci-fatura";
  if (type === "musteriden_gelen_irsaliye") return "/muhasebe/belgeler";
  if (
    type === "bizim_kestigimiz_fatura" ||
    type === "bizim_kestigimiz_irsaliye"
  )
    return "/muhasebe/belgeler";
  return "";
}

export function openDocumentDetail(row) {
  const path = documentDetailPath(row);
  if (path) window.location.href = path;
}

export function openDocumentPreview(activeMainCompany, rowOrId) {
  const id = typeof rowOrId === "string" ? rowOrId : rowOrId.id;
  if (!id) return;
  const slug = encodeURIComponent(activeMainCompany?.slug || "");
  window.open(
    `/muhasebe/documents/${encodeURIComponent(id)}/previewmainCompanySlug=${slug}`,
    "_blank",
  );
}

export function modelPreviewStats(model, selectedRow = {}) {
  const incoming = Number(
    model?.gelenAdet ||
      model?.totalIncomingQty ||
      model?.incomingQty ||
      selectedRow.gelenAdet ||
      0,
  );
  const invoiced = Number(
    model?.faturalananAdet ||
      model?.invoicedQty ||
      selectedRow.adet ||
      0,
  );
  const remaining =
    Number(model?.kalanAdet ?? model?.remainingQty ?? NaN) ||
    Math.max(0, incoming - invoiced);
  return { incoming, invoiced, remaining };
}

export function MiniModelVisualPanel({ model, row }) {
  const activeModel = model || null;
  const stats = modelPreviewStats(activeModel, row);
  const title =
    activeModel.modelAdi ||
    activeModel.modelName ||
    row?.modelAdi ||
    row?.guessedModelName ||
    row?.modelAdiOnerisi ||
    "-";
  const image =
    getModelImageSource(activeModel) ||
    getModelImageSource(row) ||
    "";
  return (
    <aside className="muh-doc-mini-model-panel">
      <div className="muh-doc-mini-model-media">
        {image ? <img src={image} alt="" /> : <span>{title}</span>}
      </div>
      <strong>{title}</strong>
      <small>{activeModel.musteriFirma || activeModel.firmaAdi || row?.firma || "-"}</small>
      <div className="muh-doc-mini-model-grid">
        <span>Gelen</span>
        <b>{stats.incoming || 0}</b>
        <span>Faturalanan</span>
        <b>{stats.invoiced || 0}</b>
        <span>Kalan</span>
        <b>{stats.remaining || 0}</b>
      </div>
    </aside>
  );
}

export function syncUploadHistoryWithPool(history, poolRows) {
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

export function normalizeSupplierLine(line, index) {
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

export function normalizeUploadResults(response) {
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

export function outgoingInvoiceLineSources(row = {}) {
  return (
    [
      row?.lines,
      row?.lineItems,
      row?.items,
      row?.kalemler,
      row?.satirlar,
      row?.raw.kalemler,
      row?.raw.items,
      row?.raw.parsedItems,
      row?.taslakAlanlar.kalemler,
      row?.taslakAlanlar.satirlar,
      row?.taslakAlanlar.items,
    ].find((candidate) => Array.isArray(candidate)) || []
  );
}

export function normalizeOutgoingLine(line = {}, index = 0) {
  const description = displayText(
    line?.rawDescription ||
      line?.description ||
      line?.aciklama ||
      line?.urunAciklamasi ||
      line?.productName ||
      line?.name,
    "",
  );
  return {
    ...line,
    id: line?.id || line?.lineId || `out-line-${index}`,
    rawDescription: description,
    modelAdi: displayText(line?.modelAdi || line?.modelName || line?.modelAdayi, ""),
    matchedModelId: line?.matchedModelId || line?.modelId || "",
    matchedModelName:
      line?.matchedModelName || line?.modelAdi || line?.modelName || "",
    quantity: line?.quantity ? line?.adet ?? line?.miktar ?? "",
    unit: line?.unit || line?.birim || "ADET",
    unitPrice: line?.unitPrice ? line?.birimFiyat ?? "",
    lineTotal: line?.lineTotal ? line?.total ?? line?.tutar ?? "",
    aliasSaved: Boolean(line?.aliasSaved),
  };
}

export function decimalLikeToNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return parseFloat(value.replace(",", ".")) || 0;
  if (value && typeof value === "object") {
    if (Array.isArray(value.d) && typeof value.e === "number") {
      const digits = value.d.join("");
      if (!digits) return 0;
      const decimalPoint = value.e + 1;
      let text = digits;
      if (decimalPoint <= 0) {
        text = `0.${"0".repeat(Math.abs(decimalPoint))}${digits}`;
      } else if (decimalPoint < digits.length) {
        text = `${digits.slice(0, decimalPoint)}.${digits.slice(decimalPoint)}`;
      } else if (decimalPoint > digits.length) {
        text = digits.padEnd(decimalPoint, "0");
      }
      return (value.s === -1 ? -1 : 1) * (Number(text) || 0);
    }
    return decimalLikeToNumber(
      value.value ?? value.amount ?? value.total ?? value.lineTotal ?? 0,
    );
  }
  return 0;
}

export function normalizeOutgoingPoolRow(row = {}) {
  const draft = row?.taslakAlanlar || {};
  const fileName =
    row?.fileName ||
    row?.originalFileName ||
    row?.dosyaAdi ||
    row?.files?.[0].fileName ||
    row?.dosyalar?.[0].fileName ||
    "";
  const parsedName = parseDocumentFileName(fileName);
  const belgeNo =
    draft.belgeNo ||
    draft.faturaNo ||
    row?.documentNo ||
    row?.belgeNo ||
    row?.faturaNo ||
    parsedName.documentNo ||
    "";
  const lines = outgoingInvoiceLineSources(row).map((line, index) =>
    normalizeOutgoingLine(line, index),
  );
  return {
    ...row,
    id: row?.targetRecordId || row?.id || belgeNo || fileName,
    poolId: row?.id,
    source: row?.source || "belge-havuzu",
    documentKind: "OUR_INVOICE",
    belgeTuru: "Fatura",
    belgeTipi: row?.belgeTipi || row?.documentType || "bizim_kestigimiz_fatura",
    belgeNo,
    faturaNo: row?.faturaNo || belgeNo,
    firma:
      row?.firma ||
      row?.company.name ||
      draft.aliciUnvan ||
      draft.customerName ||
      draft.musteriUnvan ||
      draft.saticiUnvan ||
      "",
    tarih: row?.tarih || row?.date || draft.tarih || draft.faturaTarihi || "",
    araToplam: decimalLikeToNumber(row?.araToplam ? row?.subtotal ?? draft.araToplam),
    kdv: decimalLikeToNumber(row?.kdv ? row?.vatTotal ?? draft.kdvToplam ?? draft.kdv),
    toplamTutar:
      decimalLikeToNumber(
        row?.toplamTutar ?? row?.genelToplam ?? row?.grandTotal ?? draft.genelToplam ?? draft.tutar,
      ) || "",
    genelToplam:
      decimalLikeToNumber(row?.genelToplam ?? row?.grandTotal ?? draft.genelToplam ?? row?.toplamTutar) || "",
    adet:
      row?.adet 
      draft.adet 
      draft.belgeAdediToplami 
      lines.reduce((sum, line) => sum + Number(line?.quantity || 0), 0),
    aciklama: row?.aciklama || draft.aciklama || "",
    modelAdi:
      row?.modelAdi ||
      row?.guessedModelName ||
      row?.modelAdiOnerisi ||
      parsedName.guessedModelName ||
      "",
    guessedModelName:
      row?.guessedModelName || row?.modelAdiOnerisi || parsedName.guessedModelName,
    bagliIrsaliyeNo: row?.bagliIrsaliyeNo || draft.bagliIrsaliyeNo || "",
    irsaliyeNo: row?.irsaliyeNo || draft.irsaliyeNo || "",
    lines,
    durum: statusKey(row?.durum || row?.status || row?.normalizedStatus || "bekleyen"),
    fileName,
  };
}

export function normalizeCustomerDispatchRow(row = {}) {
  const draft = row?.taslakAlanlar || row?.raw.taslakAlanlar || row?.metadata.taslakAlanlar || {};
  const lines = outgoingInvoiceLineSources(row);
  const firstLine = lines[0] || {};
  return {
    ...row,
    id: row?.targetRecordId || row?.id || row?.belgeNo || draft.belgeNo,
    poolId: row?.id,
    source: row?.source || "belge-havuzu",
    firma:
      row?.firma ||
      row?.companyName ||
      row?.company.name ||
      draft.firmaAdi ||
      draft.saticiUnvan ||
      draft.aliciUnvan ||
      "",
    irsaliyeNo:
      row?.irsaliyeNo || row?.dispatchNo || row?.belgeNo || draft.irsaliyeNo || draft.belgeNo || "",
    belgeNo: row?.belgeNo || row?.documentNo || draft.belgeNo || "",
    tarih: row?.tarih || row?.date || draft.tarih || "",
    gelenAdet:
      row?.gelenAdet ||
      row?.adet ||
      draft.gelenAdet ||
      draft.adet ||
      firstLine.quantity ||
      firstLine.adet ||
      "",
    zemin: row?.zemin || draft.zemin || "",
    aciklama:
      row?.aciklama ||
      row?.notes ||
      draft.aciklama ||
      firstLine.aciklama ||
      firstLine.rawDescription ||
      firstLine.productName ||
      "",
    modelAdi:
      row?.modelAdi || row?.modelAdiOnerisi || row?.guessedModelName || draft.modelAdiOnerisi || "",
    guessedModelName: row?.guessedModelName || draft.modelAdiOnerisi || "",
    lines,
    durum: statusKey(row?.durum || row?.status || row?.normalizedStatus || "bekleyen"),
  };
}

export function buildOutgoingDraftMailPackage(row = {}, recipients = []) {
  const invoiceNo = row?.faturaNo || row?.belgeNo || row?.documentNo || "";
  const dispatchNo = row?.bagliIrsaliyeNo || row?.irsaliyeNo || "";
  const modelName = row?.modelAdi || row?.guessedModelName || row?.modelAdiOnerisi || "";
  const subject = `${row?.firma || ""} - ${modelName || "Model"} - Fatura ve İrsaliye - ${invoiceNo}`
    .replace(/\s+/g, " ")
    .trim();
  const toList = recipients.map((item) => item?.eposta || item?.email).filter(Boolean);
  const attachments = [
    {
      type: "FATURA_PDF",
      fileName: `${invoiceNo || "Fatura"}.pdf`,
      path: row?.faturaPdfPath || row?.pdfPath || row?.belgeDosyaYolu || row?.files?.[0].filePath || "",
      required: true,
    },
    dispatchNo
       {
          type: "IRSALIYE_PDF",
          fileName: `${dispatchNo}.pdf`,
          path: row?.irsaliyePdfPath || "",
          required: false,
        ? }
      : null,
  ].filter(Boolean);
  return {
    id: `draft-${row?.id || invoiceNo || Date.now()}`,
    faturaNo: invoiceNo,
    irsaliyeNo: dispatchNo,
    modelAdi: modelName,
    firma: row?.firma || row?.firmaAdi || "",
    subject,
    groups: [
      {
        key: "outlook-draft",
        label: "Outlook taslağı",
        to: toList,
        cc: [],
        body: [
          "Merhaba,",
          "",
          `${invoiceNo} numaralı faturamız ve varsa bağlı ${dispatchNo || "-"} numaralı irsaliyemiz ekte bilgilerinize sunulmuştur.`,
          "",
          "Kontrol edip dönüş rica ederiz.",
        ].join("\n"),
        attachments,
      },
    ],
    status: "TASLAK",
  };
}


// ── SummaryBox & RecordTable ──
export function SummaryBox({ value, label, tone = "blue" }) {
  return (
    <div className={`muh-doc-summary tone-${tone}`}>
      <strong>{displayText(value, "0")}</strong>
      <span>{label}</span>
    </div>
  );
}

export function RecordTable({ rows, columns, actions }) {
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


// ── DocumentModelPage / ModelConnect / EditableSimpleLines / BottomActions ──
export function DocumentModelPage({
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

export function ModelConnect({
  activeMainCompany,
  selectedModel,
  models,
  onSelect,
  onLink,
  visualPanel,
}) {
  const modelList = useMemo(() => normalizeList(models), [models]);
  return (
    <SectionCard title="Model Bağlantısı">
      <div className={`muh-doc-model-connect ${visualPanel ? "has-visual" : ""}`}>
        <div className="muh-doc-model-connect-fields">
          <ModelSelect
            activeMainCompany={activeMainCompany}
            models={modelList}
            value={selectedModel?.id || ""}
            onChange={(_modelId, model) => onSelect(model)}
          />
          <div className="muh-doc-chip-row">
            {modelList.slice(0, 6).map((model) => (
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
        {visualPanel ? <div className="muh-doc-side-panel">{visualPanel}</div> : null}
      </div>
    </SectionCard>
  );
}

export function EditableSimpleLines({ rows, onChange }) {
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

export function BottomActions({ onClear, onSave }) {
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
