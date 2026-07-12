import { useEffect, useMemo, useState } from "react";
import { ErpIcon } from "../../../components/erp/IconMap";
import {
  filterCompaniesByQuery,
  findCompanyByName,
  getSelectableCompanies,
  normalizeCompanyText,
} from "../../../lib/companyHelpers";
import {
  apiGet as clientApiGet,
  apiPost as clientApiPost,
  apiPatch as clientApiPatch,
  apiDelete as clientApiDelete,
  apiUpload as clientApiUpload,
} from "../../../utils/api";

export const tr = {
  genelBakis: "Genel Bakış",
  cariKasa: "Cari / Kasa",
  belgeler: "Belgeler",
  alisGider: "Genel Giderler",
  irsaliyeFatura: "İrsaliye / Fatura",
  urunler: "Ürünler",
  kdv: "KDV",
  odemeler: "Ödemeler",
  cekler: "Çekler",
  krediKartlari: "Kredi Kartları",
  firmaKartlari: "Firma Kartları",
  eposta: "E-Posta",
};

export const DEFAULT_BIZIM_DOCUMENT_PATHS = {
  documentArchiveRootPath: "",
  gidenIrsaliyeBasePath: "",
  gidenFaturaBasePath: "",
  tedarikciFaturaBasePath: "",
  belgeYuklemeFaturaFolder: "FATURA",
  belgeYuklemeIrsaliyeFolder: "IRSALIYE",
  belgeYuklemeXmlFolder: "XML",
  belgeYuklemeGelenIrsaliyeFolder: "GELEN IRSALIYE",
  belgeYuklemeGelenFaturaFolder: "GELEN FATURA",
  belgeYuklemeTasnifFolder: "TASNIF BEKLEYEN",
  faturaDosyaPrefix: "FAT",
  irsaliyeDosyaPrefix: "IRS",
};

export const DOCUMENT_SECTION_CONFIG = {
  "alis-gider-belgeleri": {
    title: "Genel Giderler",
    subtitle:
      "Hızlı manuel gider kaydı; PDF alanı ikincil ve sade akışta kalır.",
    infoText: "Öncelik manuel gider girişidir. PDF yükleme opsiyoneldir.",
    workflowOptions: [
      { value: "GELEN_FATURA", label: "Gelen Fatura" },
      { value: "GELEN_IRSALIYE", label: "Gelen İrsaliye" },
      { value: "GIDEN_FATURA", label: "Giden Fatura" },
      { value: "GIDEN_IRSALIYE", label: "Giden İrsaliye" },
    ],
    defaultWorkflow: "GELEN_FATURA",
    documentClass: "ALIS_GIDER_BELGESI",
  },
  "irsaliye-fatura": {
    title: "İrsaliye / Fatura",
    subtitle:
      "Müşteri bazlı ürün hareketi, irsaliye-fatura eşleşmesi ve kalan adet takibi.",
    infoText:
      "PDF aktif: Parse sonucu önce taslağa düşer, onay olmadan final kayıt oluşmaz.",
    workflowOptions: [
      { value: "GELEN_FATURA", label: "Gelen Fatura" },
      { value: "GELEN_IRSALIYE", label: "Gelen İrsaliye" },
      { value: "GIDEN_FATURA", label: "Giden Fatura" },
      { value: "GIDEN_IRSALIYE", label: "Giden İrsaliye" },
    ],
    defaultWorkflow: "GELEN_FATURA",
    documentClass: "IRSALIYE",
  },
  "musteri-irsaliye": {
    title: "Müşteriden Gelen İrsaliye",
    subtitle:
      "TAHA, MİND, REN gibi müşterilerin sevk irsaliyeleri. Ana bilgi: firma, irsaliye no, adet, model.",
    infoText:
      "Gelen irsaliyede kalem tablosu ikincildir. Firma, irsaliye no ve adet önce gelir.",
    workflowOptions: [{ value: "GELEN_IRSALIYE", label: "Gelen İrsaliye" }],
    defaultWorkflow: "GELEN_IRSALIYE",
    documentClass: "IRSALIYE",
  },
  "bizim-belgeler": {
    title: "Bizim Kestiğimiz Belgeler",
    subtitle:
      "Müşteriye gönderilen irsaliye ve faturalar. Model takibe bağlı sevk/fatura akışı.",
    infoText:
      "Fatura PDF'i yüklenir; fatura no, irsaliye no ve model satırları taslağa düşer.",
    workflowOptions: [{ value: "GIDEN_FATURA", label: "Giden Fatura" }],
    defaultWorkflow: "GIDEN_FATURA",
    documentClass: "FATURA",
  },
  "tedarikci-fatura": {
    title: "Tedarikçiden Gelen Fatura",
    subtitle:
      "URAS Kimya gibi tedarikçilerden gelen alış faturaları. Ürün/lot/kalem akışı.",
    infoText:
      "PDF aktif: Parse sonucu kalemlerle birlikte taslağa düşer. Ürün eşleme ve lot parse aktiftir.",
    workflowOptions: [{ value: "GELEN_FATURA", label: "Gelen Fatura" }],
    defaultWorkflow: "GELEN_FATURA",
    documentClass: "FATURA",
  },
};

export const PDF_DOCUMENT_CLASS_OPTIONS = [
  { value: "FATURA", label: "FATURA" },
  { value: "IRSALIYE", label: "IRSALIYE" },
  {
    value: "IRSALIYE_YERINE_GECEN_FATURA",
    label: "IRSALIYE_YERINE_GECEN_FATURA",
  },
  { value: "ALIS_GIDER_BELGESI", label: "ALIS_GIDER_BELGESI" },
  { value: "DIGER_PDF_BELGE", label: "DIGER_PDF_BELGE" },
];

export function uid(prefix = "row") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let normalized = String(value ?? "")
    .replace(/[₺\s]/g, "")
    .replace(/[^0-9,.-]/g, "");
  const negative = normalized.startsWith("-");
  normalized = normalized.replace(/-/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  if (lastComma >= 0 && lastDot >= 0) {
    const integerPart = normalized.slice(0, decimalIndex).replace(/[,.]/g, "");
    const decimalPart = normalized.slice(decimalIndex + 1).replace(/[,.]/g, "");
    normalized = `${integerPart}.${decimalPart}`;
  } else if (lastComma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    const after = normalized.slice(lastDot + 1);
    const dotCount = (normalized.match(/\./g) || []).length;
    normalized =
      dotCount === 1 && after.length <= 2
         ? normalized
        : normalized.replace(/\./g, "");
  }
  normalized = `${negative ? "-" : ""}${normalized}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeDateForInput(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function formatMoney(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function MetricBox({
  icon,
  label,
  value,
  subText,
  tone = "blue",
  onClick,
  active = false,
}) {
  const className = `info-box metric-info-box metric-tone-${tone} ${
    onClick ? "metric-info-box-action" : ""
  } ${active ? "is-active" : ""}`.trim();

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <span className={`metric-icon tone-${tone}`}>
          <ErpIcon name={icon} size={24} />
        </span>
        <span className="metric-content">
          <span>{label}</span>
          <strong>{value}</strong>
          {subText ? <small>{subText}</small> : null}
        </span>
      </button>
    );
  }

  return (
    <div className={className}>
      <span className={`metric-icon tone-${tone}`}>
        <ErpIcon name={icon} size={24} />
      </span>
      <div className="metric-content">
        <span>{label}</span>
        <strong>{value}</strong>
        {subText ? <small>{subText}</small> : null}
      </div>
    </div>
  );
}

export function extractModelNameFromDocumentFileName(fileName, documentNo = "") {
  const base = String(fileName || "")
    .replace(/\?.[^.]+$/, "")
    .trim();
  const knownNo = String(documentNo || "").trim();
  const withoutNo = knownNo
     base.replace(
        new RegExp(`^${knownNo.replace(/[.*+^${}()|[\]\\]/g, "\\$&")}`, "i"),
        "",
      ? )
    : base.replace(/^[A-Z]{2,4}\d{8,}/i, "");
  return withoutNo
    .replace(/^[-_\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFlowType(value) {
  const raw = String(value || "").toUpperCase();
  if (raw === "GELEN_ALIS_FATURASI") return "GELEN_FATURA";
  if (raw === "BIZIM_FATURA") return "GIDEN_FATURA";
  if (raw === "BIZIM_IRSALIYE") return "GIDEN_IRSALIYE";
  if (
    [
      "GELEN_FATURA",
      "GELEN_IRSALIYE",
      "GIDEN_FATURA",
      "GIDEN_IRSALIYE",
    ].includes(raw)
  ) {
    return raw;
  }
  return "";
}

export function flowTypeMeta(flowType) {
  const normalized = normalizeFlowType(flowType);
  if (normalized === "GELEN_FATURA")
    return { belgeYonu: "gelen", belgeTipi: "fatura", label: "Gelen Fatura" };
  if (normalized === "GELEN_IRSALIYE")
    return {
      belgeYonu: "gelen",
      belgeTipi: "irsaliye",
      label: "Gelen İrsaliye",
    };
  if (normalized === "GIDEN_FATURA")
    return { belgeYonu: "giden", belgeTipi: "fatura", label: "Giden Fatura" };
  if (normalized === "GIDEN_IRSALIYE")
    return {
      belgeYonu: "giden",
      belgeTipi: "irsaliye",
      label: "Giden İrsaliye",
    };
  return { belgeYonu: "", belgeTipi: "", label: "" };
}

export function normalizeMainCompany(mainCompany) {
  return {
    mainCompanyId: String(mainCompany.id || "").trim(),
    mainCompanySlug: String(mainCompany.slug || "").trim(),
    mainCompanyName: String(mainCompany.name || "").trim(),
  };
}

export function requireMainCompany(mainCompany) {
  const normalized = normalizeMainCompany(mainCompany);
  if (!normalized.mainCompanyId || !normalized.mainCompanySlug) {
    throw new Error("Ana firma zorunludur.");
  }
  return normalized;
}

export function unwrapApiPayload(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
     ? payload?.data
    : payload;
}

export async function apiGet(path, mainCompany, options = {}) {
  const company = requireMainCompany(mainCompany);
  const { raw = false, ...requestOptions } = options || {};
  const payload = await clientApiGet(
    path,
    { ...mainCompany, ...company },
    requestOptions,
  );
  return raw ? payload : unwrapApiPayload(payload);
}

export async function apiPost(path, payload, mainCompany) {
  const company = requireMainCompany(mainCompany);
  return unwrapApiPayload(
    await clientApiPost(path, { ...payload, ...company }),
  );
}

export async function apiPatch(path, payload, mainCompany) {
  const company = requireMainCompany(mainCompany);
  return unwrapApiPayload(
    await clientApiPatch(path, { ...payload, ...company }),
  );
}

export async function apiDelete(path, mainCompany) {
  const company = requireMainCompany(mainCompany);
  return unwrapApiPayload(await clientApiDelete(path, company));
}

export async function apiUploadForm(path, formData, mainCompany) {
  const company = requireMainCompany(mainCompany);
  formData.set("mainCompanyId", company?.mainCompanyId);
  formData.set("mainCompanySlug", company?.mainCompanySlug);
  return unwrapApiPayload(await clientApiUpload(path, formData));
}

export function SectionHeader({ title, subtitle, right }) {
  return (
    <div className="section-header">
      <div>
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {right || null}
    </div>
  );
}

export function MuhasebePageHeader({ title, subtitle }) {
  return (
    <div className="mgi-page-header muhasebe-page-header">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
      <div className="mgi-breadcrumb">
        <span className="mgi-crumb-home" aria-hidden>
          &#8962;
        </span>
        <span className="mgi-crumb-item">Ana Sayfa</span>
        <span className="mgi-crumb-sep">&gt;</span>
        <span className="mgi-crumb-item">Muhasebe</span>
        <span className="mgi-crumb-sep">&gt;</span>
        <span className="mgi-crumb-item is-current">{title}</span>
      </div>
    </div>
  );
}

export function ActionBar({ children, className = "" }) {
  return <div className={`action-bar ${className}`.trim()}>{children}</div>;
}

export function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  readOnly = false,
  disabled = false,
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
      />
    </label>
  );
}

export function Textarea({ label, value, onChange, rows = 4, placeholder = "" }) {
  return (
    <label className="field field-full">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </label>
  );
}

export function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={onChange}>
        {options.map((item) => {
          const option =
            typeof item === "string"  { value: item, label: item } : item;
          return (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function MoneyInput({ label, value, onValueChange }) {
  const [raw, setRaw] = useState(String(value ?? "0"));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setRaw(formatMoney(value));
  }, [value, focused]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={focused ? raw : formatMoney(value)}
        onFocus={() => {
          setFocused(true);
          setRaw(String(value ?? 0).replace(".", ","));
        }}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          const parsed = parseMoney(raw);
          onValueChange(parsed);
          setFocused(false);
          setRaw(formatMoney(parsed));
        }}
      />
    </label>
  );
}

export function CompanyQuickPicker({
  label,
  companies,
  value,
  onChange,
  helperText = "",
  fullWidth = true,
  disabled = false,
}) {
  const [query, setQuery] = useState(value || "");
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(value || "");
  }, [value]);

  const selectableCompanies = useMemo(
    () => getSelectableCompanies(companies),
    [companies],
  );
  const sorted = useMemo(() => {
    return filterCompaniesByQuery(selectableCompanies, query).slice(0, 12);
  }, [selectableCompanies, query]);

  const exactMatch = useMemo(
    () => findCompanyByName(selectableCompanies, query),
    [selectableCompanies, query],
  );

  function commit(name) {
    const matched = findCompanyByName(selectableCompanies, name);
    const next = String(matched.firma || name || "").trim();
    setQuery(next);
    if (next) onChange(next);
  }

  function handleBlur() {
    setIsFocused(false);
    if (!query.trim()) return;

    // Exact match → commit as-is
    if (exactMatch.firma) {
      commit(exactMatch.firma);
      return;
    }

    // Normalized exact match against sorted[0]
    if (
      sorted[0].firma &&
      normalizeCompanyText(sorted[0].firma) === normalizeCompanyText(query)
    ) {
      commit(sorted[0].firma);
      return;
    }

    // Fuzzy: if there's only one match candidate → auto-select
    if (sorted.length === 1) {
      commit(sorted[0].firma);
      return;
    }

    // If there's a currently valid selected value, restore it silently
    if (findCompanyByName(selectableCompanies, value)) {
      setQuery(value || "");
      return;
    }

    // Do not erase what the user typed - keep query visible for retry
    // This prevents onChange("") from clearing a partial/unregistered entry
  }

  return (
    <div className={`field ${fullWidth ? "field-full" : ""}`.trim()}>
      <span>{label}</span>
      <input
        value={query}
        placeholder="Firma yazın..."
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (exactMatch.firma) commit(exactMatch.firma);
            else if (sorted[0].firma) commit(sorted[0].firma);
          }
        }}
      />

      {isFocused && sorted.length ? (
        <div className="picker-helper-text">
          {sorted.map((item) => (
            <button
              key={item?.id || item?.firma}
              className="soft-btn tiny-btn"
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(item?.firma);
              }}
            >
              {item?.firma}
            </button>
          ))}
        </div>
      ) : null}

      {helperText ? (
        <div className="picker-helper-text">{helperText}</div>
      ) : null}
    </div>
  );
}

export function PaymentTypeManager({ rows, onSave, busy = false }) {
  const [newName, setNewName] = useState("");

  return (
    <div className="payment-type-manager">
      <div className="payment-type-add-row">
        <input
          placeholder="Yeni ödeme türü ekle"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          className="soft-btn"
          type="button"
          disabled={busy || !newName.trim()}
          onClick={async () => {
            await onSave({ ad: newName.trim(), aktif: true });
            setNewName("");
          }}
        >
          Tür Ekle
        </button>
      </div>

      <div className="payment-type-chip-list">
        {rows.map((item) => (
          <button
            key={item?.id}
            type="button"
            className={`soft-btn tiny-btn ${item?.aktif ? "" : "is-passive"}`}
            onClick={() => onSave({ ...item, aktif: !item?.aktif })}
          >
            {item?.ad} {item?.aktif ? "(Aktif)" : "(Pasif)"}
          </button>
        ))}
      </div>
    </div>
  );
}

export const CARI_KASA_TYPE_OPTIONS = [
  { value: "ODEME", label: "Ödeme", islemTipi: "ODEME", sourceType: "ODEME" },
  {
    value: "TAHSILAT",
    label: "Tahsilat",
    islemTipi: "BAKIYE",
    sourceType: "TAHSILAT",
  },
  {
    value: "ACILIS",
    label: "Açılış",
    islemTipi: "BAKIYE",
    sourceType: "MANUAL_ACILIS",
  },
  {
    value: "BAKIYE_DUZELTME",
    label: "Bakiye Düzeltme",
    islemTipi: "BAKIYE",
    sourceType: "BAKIYE_DUZELTME",
  },
  {
    value: "MANUEL",
    label: "Manuel",
    islemTipi: "BAKIYE",
    sourceType: "MANUAL",
  },
  { value: "NOT", label: "Not", islemTipi: "BAKIYE", sourceType: "NOTE" },
];

export function getCariKasaTypeConfig(typeValue) {
  return (
    CARI_KASA_TYPE_OPTIONS.find((item) => item.value === typeValue) ||
    CARI_KASA_TYPE_OPTIONS[CARI_KASA_TYPE_OPTIONS.length - 1]
  );
}

export function getCariKasaTypeFromRow(row) {
  const sourceType = String(row?.sourceType || "").toUpperCase();
  if (sourceType === "SUPPLIER_INVOICE") return "MANUEL";
  if (sourceType === "ODEME") return "ODEME";
  if (sourceType === "TAHSILAT") return "TAHSILAT";
  if (
    ["MANUAL_ACILIS", "IMPORT_ACILIS", "ACILIS_BAKIYESI"].includes(sourceType)
  )
    return "ACILIS";
  if (["BAKIYE_DUZELTME", "IMPORT_BAKIYE_DUZELTME"].includes(sourceType))
    return "BAKIYE_DUZELTME";
  if (["NOTE", "NOT"].includes(sourceType)) return "NOT";
  if (row.islemTipi === "ODEME") return "ODEME";
  return "MANUEL";
}

export function getCariKasaTypeLabel(row) {
  if (String(row.sourceType || "").toUpperCase() === "SUPPLIER_INVOICE")
    return "Fatura";
  return getCariKasaTypeConfig(getCariKasaTypeFromRow(row)).label;
}

export function createCariKasaForm(typeValue = "MANUEL") {
  const config = getCariKasaTypeConfig(typeValue);
  return {
    id: "",
    tarih: new Date().toISOString().slice(0, 10),
    hareketTuru: config.value,
    tutar: 0,
    aciklama: "",
    belge: "",
    sourceType: config.sourceType,
    resmiDurum: "RESMI",
    odemeSozuTarihi: "",
    hatirlatmaTarihi: "",
    takipNotu: "",
  };
}

export function emptyDraft(sectionKey) {
  const config = DOCUMENT_SECTION_CONFIG[sectionKey];
  const flowMeta = flowTypeMeta(config.defaultWorkflow);
  return {
    documentId: "",
    modelKaydiId: "",
    sourceType: "MANUEL",
    status: "TASLAK",
    sourceTab: sectionKey,
    documentClass: config.documentClass,
    workflowType: config.defaultWorkflow,
    flowType: config.defaultWorkflow,
    belgeYonu: flowMeta.belgeYonu,
    belgeTipi: flowMeta.belgeTipi,
    documentNo: "",
    faturaNo: "",
    irsaliyeNo: "",
    modelAdi: "",
    musteriIrsaliyeNo: "",
    zemin: "",
    musteriFirma: "",
    kesimhaneBilgisi: "",
    tarih: new Date().toISOString().slice(0, 10),
    giderTuru: "DIGER",
    odemeTuru: "",
    resmiDurum: "RESMI",
    firma: "",
    selectedCompanyId: "",
    selectedCompanyName: "",
    selectedCompanyType: "",
    rawParsedCompanyName: "",
    rawDetectedCompanyName: "",
    matchedCompanyId: "",
    matchedCompanyName: "",
    firmaEslesmeTipi: "",
    pdfFileName: "",
    originalFileName: "",
    fileType: "",
    intakeMethod: "",
    previewUrl: "",
    parseMode: "",
    detectedProfile: "",
    subtotal: 0,
    kdv: 0,
    grandTotal: 0,
    belgeAdediToplami: 0,
    faturalananAdet: 0,
    irsaliyeAdedi: 0,
    makinaKarsilastirmaKey: "",
    aciklama: "",
    parsedItems: [],
    items: [],
    candidateRows: [],
    warnings: [],
    metrics: {},
    needsReview: false,
  };
}

export function normalizeLineItem(item) {
  const next = { ...item };
  const miktar = Number(next.miktar || 0);
  const birimFiyat = Number(next.birimFiyat || 0);
  const kdvOrani = Number(next.kdvOrani || 0);
  const manualLineTotal = Number(next.tutar || 0);
  const lineTotal =
    miktar > 0 && birimFiyat > 0 ? miktar * birimFiyat : manualLineTotal;
  const manualVatAmount = Number(next.kdvTutari || 0);
  const vatAmount =
    manualVatAmount > 0
       ? manualVatAmount
      : kdvOrani > 0 && lineTotal > 0
         ? (lineTotal * kdvOrani) / 100
        : 0;
  return {
    ...next,
    miktar: Number(miktar.toFixed(2)),
    birimFiyat: Number(birimFiyat.toFixed(2)),
    tutar: Number(lineTotal.toFixed(2)),
    kdvOrani: Number(kdvOrani.toFixed(2)),
    kdvTutari: Number(vatAmount.toFixed(2)),
  };
}

export function deriveDraftTotals(items, fallbackKdv = 0) {
  const normalized = Array.isArray(items)
     ? items.map((item) => normalizeLineItem(item))
    : [];
  const subtotal = normalized.reduce(
    (sum, item) => sum + Number(item?.tutar || 0),
    0,
  );
  const itemVatDetected = normalized.some(
    (item) => Number(item?.kdvOrani || 0) > 0 || Number(item?.kdvTutari || 0) > 0,
  );
  const itemVat = normalized.reduce(
    (sum, item) => sum + Number(item?.kdvTutari || 0),
    0,
  );
  const kdv = itemVatDetected ? itemVat : Number(fallbackKdv || 0);
  return {
    items: normalized,
    subtotal: Number(subtotal.toFixed(2)),
    kdv: Number(kdv.toFixed(2)),
    grandTotal: Number((subtotal + kdv).toFixed(2)),
    itemVatDetected,
  };
}
