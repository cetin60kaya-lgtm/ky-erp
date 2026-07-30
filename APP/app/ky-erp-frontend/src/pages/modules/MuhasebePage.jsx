import { useEffect, useMemo, useState } from "react";
import { useCallback, useRef } from "react";
import {
  apiDelete,
  
  apiGet,
  apiPatch,
  apiPost,
  apiUpload,
  buildApiUrl,
} from "../../utils/api";
import MailSablonlariPage from "../muhasebe/MailSablonlariPage";
import BelgeIslemMerkezi, {
  ModelMerkezliMusteriTakip,
} from "../muhasebe/BelgeIslemMerkezi";
import CekOdemeMerkeziPage from "../muhasebe/CekOdemeMerkeziPage";
import CompanyAliasPanel from "../muhasebe/CompanyAliasPanel";
import { fetchBelgeImport } from "../../services/muhasebeDocumentService";
import KesilenFaturalarTab from "./muhasebe/KesilenFaturalarTab";
import MuhasebeReportsWorkspace from "./muhasebe/MuhasebeReportsWorkspace";
import ProfitLossWorkspace from "./muhasebe/ProfitLossWorkspace";
import ExpenseCategoriesWorkspace from "./muhasebe/ExpenseCategoriesWorkspace";
import MusteriIrsaliyeleriTab from "./muhasebe/MusteriIrsaliyeleriTab";
import IrsaliyeFaturaKontrolTab from "./muhasebe/IrsaliyeFaturaKontrolTab";

const TAB_CONFIG = [
  { key: "yonetim-ozeti", short: "Yönetim Özeti", title: "Muhasebe Yönetim Özeti" },
  { key: "firma-kartlari", short: "Firmalar ve Cari", title: "Firmalar, Cari ve Yetkililer" },
  { key: "tedarikci-faturalar", short: "Tedarikçi Faturaları", title: "Tedarikçi Faturaları" },
  { key: "kar-zarar", short: "Gelir / Gider", title: "Gelir, Gider ve Kâr Zarar" },
  { key: "kdv-kontrol", short: "KDV", title: "KDV Kontrol" },
  { key: "cek-odeme", short: "Çek / Ödeme", title: "Çek, Kart ve Ödeme Merkezi" },
  { key: "mail-ekstre", short: "Ekstre / Mail", title: "Ekstre ve Mail Takibi" },
  { key: "muhasebe-raporlari", short: "Raporlar", title: "Muhasebe Raporları" },
];

const TAB_ALIASES = {
  "genel-bakis": "yonetim-ozeti",
  "yonetim-ozeti": "yonetim-ozeti",
  "firma-kartlari": "firma-kartlari",
  firmalar: "firma-kartlari",
  cari: "firma-kartlari",
  "cari-hareketler": "firma-kartlari",
  "firma-yetkilileri": "firma-kartlari",
  "eposta-kisileri": "firma-kartlari",
  "gider-kategorileri": "firma-kartlari",
  "tedarikci-faturalar": "tedarikci-faturalar",
  "tedarikci-fatura": "tedarikci-faturalar",
  "tedarik-fatura": "tedarikci-faturalar",
  "belge-kontrol": "tedarikci-faturalar",
  "belge-is-akisi": "tedarikci-faturalar",
  "belge-yukle": "tedarikci-faturalar",
  "belge-merkezi": "tedarikci-faturalar",
  "model-muhasebe": "tedarikci-faturalar",
  "model-muhasebe-ekrani": "tedarikci-faturalar",
  "kesilen-faturalar": "yonetim-ozeti",
  "fatura-kesim-yardimcisi": "yonetim-ozeti",
  "fatura-kesim": "yonetim-ozeti",
  "fatura-yardimci": "yonetim-ozeti",
  "musteri-belgeleri": "yonetim-ozeti",
  "musteri-irsaliyeleri": "yonetim-ozeti",
  "musteri-irsaliye": "yonetim-ozeti",
  "irsaliye-fatura-kontrol": "yonetim-ozeti",
  "irsaliye-fatura": "yonetim-ozeti",
  "model-takip": "yonetim-ozeti",
  "kar-zarar": "kar-zarar",
  kar: "kar-zarar",
  zarar: "kar-zarar",
  "gelir-gider": "kar-zarar",
  "is-hacmi": "kar-zarar",
  "envanter-urunleri": "envanter-urunleri",
  "urun-eslestirme": "envanter-urunleri",
  "urun-eslesmeleri": "envanter-urunleri",
  alias: "envanter-urunleri",
  aliases: "envanter-urunleri",
  kdv: "kdv-kontrol",
  "kdv-kontrol": "kdv-kontrol",
  "cek-kart": "cek-odeme",
  "cek-odeme": "cek-odeme",
  "odeme-nakit-akisi": "cek-odeme",
  odemeler: "cek-odeme",
  "odeme-tahsilat": "cek-odeme",
  "eposta-ekstre": "mail-ekstre",
  "mail-ekstre": "mail-ekstre",
  "mail-sablonlari": "mail-ekstre",
  raporlar: "muhasebe-raporlari",
  "muhasebe-raporlari": "muhasebe-raporlari",
};

const REPORTS = [
  ["yonetici-ozet", "Yönetici Kâr / Zarar"],
  ["satis-musteri", "Satış / Müşteri"],
  ["tedarikci-satin-alma", "Tedarikçi / Satın Alma"],
  ["pesin-giderler", "Peşin ve Takip Dışı Gider"],
  ["personel-giderleri", "Personel Giderleri"],
  ["kdv-ozet", "KDV Özeti"],
  ["nakit-cek-ozet", "Nakit / Çek Özeti"],
  ["haftalik-yonetim-ozeti", "Haftalık Yönetim Özeti"],
  ["aylik-yonetim-ozeti", "Aylık Yönetim Özeti"],
  ["cari-ekstre", "Cari Ekstre"],
  ["kdv-raporu", "KDV Raporu"],
  ["cek-listesi", "Çek Listesi"],
  ["tedarikci-fatura-kontrol-arsiv", "Tedarikci Fatura Kontrol / Arsiv"],
  ["mail-departman-yetki-eksik-raporu", "Mail / Departman Yetki Eksik Raporu"],
  ["ekstreye-girmeyen-faturalar", "Ekstreye Girmeyen Faturalar"],
  ["cek-vade-raporu", "Çek Vade Raporu"],
  ["mail-takip-raporu", "Mail Takip Raporu"],
];

const SUPPLIER_ARCHIVE_REPORT_KEY = "tedarikci-fatura-kontrol-arsiv";
const SUPPLIER_REPORT_PROCESSED_STATUSES = new Set([
  "APPROVED",
  "PROCESSED",
  "AUTO_PROCESSED",
  "POSTED",
  "ISLENEN",
]);

function supplierReportMissingFields(row) {
  return Array.isArray(row?.missingFields) ? row?.missingFields : [];
}

function supplierReportHasAny(row, fields) {
  const missing = supplierReportMissingFields(row);
  return fields.some((field) => missing.includes(field));
}

function isSupplierReportProcessed(row) {
  return SUPPLIER_REPORT_PROCESSED_STATUSES.has(
    String(row?.status || "").toUpperCase(),
  );
}

function supplierReportUser(row) {
  return (
    row?.approvedBy ||
    row?.updatedBy ||
    row?.createdBy ||
    row?.userName ||
    row?.operator ||
    "-"
  );
}

function supplierReportReason(row) {
  const summary = row?.controlSummary || {};
  return (
    summary.quarantineCode ||
    summary.explanation ||
    supplierReportMissingFields(row).join(", ") ||
    row?.archiveReason ||
    "-"
  );
}

function supplierReportStatusLabel(row) {
  if (isSupplierReportProcessed(row)) return "Islenen";
  if (supplierReportHasAny(row, ["DUPLICATE_DOCUMENT"]))
    return "Mukerrer belge";
  if (
    supplierReportHasAny(row, [
      "VAT_REVIEW",
      "VAT_TOTAL_MISMATCH",
      "TAX_MISMATCH",
    ])
  )
    return "KDV inceleme";
  if (supplierReportHasAny(row, ["LINE_PRICE_MISSING", "LINE_PRICE_ZERO"]))
    return "Fiyat eksik";
  if (String(row.status || "").toUpperCase() === "MISSING_INFO")
    return "Karantina";
  return row?.status || "Kontrol";
}

function supplierReportTone(row) {
  const label = supplierReportStatusLabel(row).toLocaleLowerCase("tr-TR");
  if (isSupplierReportProcessed(row)) return "ok";
  if (label.includes("mukerrer") || label.includes("karantina")) return "bad";
  if (label.includes("kdv") || label.includes("fiyat")) return "warn";
  return toneFromStatus(label);
}

function supplierReportMatchesStatus(row, statusFilter) {
  if (!statusFilter || statusFilter === "ALL") return true;
  if (statusFilter === "PROCESSED") return isSupplierReportProcessed(row);
  if (statusFilter === "QUARANTINE")
    return String(row.status || "").toUpperCase() === "MISSING_INFO";
  if (statusFilter === "VAT_REVIEW")
    return supplierReportHasAny(row, [
      "VAT_REVIEW",
      "VAT_TOTAL_MISMATCH",
      "TAX_MISMATCH",
    ]);
  if (statusFilter === "PRICE_MISSING")
    return supplierReportHasAny(row, ["LINE_PRICE_MISSING", "LINE_PRICE_ZERO"]);
  if (statusFilter === "DUPLICATE_DOCUMENT")
    return supplierReportHasAny(row, ["DUPLICATE_DOCUMENT"]);
  return String(row.status || "").toUpperCase() === statusFilter;
}

function unwrap(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  )
    return payload?.data;
  if (Array.isArray(payload?.data)) return payload?.data;
  return payload;
}

function asArray(value) {
  const data = unwrap(value);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.liste)) return data?.liste;
  if (Array.isArray(data?.rows)) return data?.rows;
  return [];
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function parseMoneyInput(value) {
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
    normalized = `${normalized.slice(0, decimalIndex).replace(/[,.]/g, "")}.${normalized
      .slice(decimalIndex + 1)
      .replace(/[,.]/g, "")}`;
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
  const parsed = Number(`${negative ? "-" : ""}${normalized}`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function date(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toLocaleDateString("tr-TR");
}

function isoDate(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate(new Date());
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { dateFrom: isoDate(start), dateTo: isoDate(end) };
}

function decimalInputValue(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number === 0) return "";
  return number.toFixed(2);
}

function parseDecimalInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  if (raw.includes(",")) {
    return Number(raw.replace(/\./g, "").replace(",", "."));
  }
  const dotCount = (raw.match(/\./g) || []).length;
  if (dotCount > 1) return Number(raw.replace(/\./g, ""));
  return Number(raw);
}

function toneFromStatus(value) {
  const text = String(value || "").toLocaleLowerCase("tr-TR");
  if (
    text.includes("eksik") ||
    text.includes("gecmis") ||
    text.includes("geçmiş")
  )
    return "bad";
  if (text.includes("bek") || text.includes("yak") || text.includes("kontrol"))
    return "warn";
  if (
    text.includes("iş") ||
    text.includes("islen") ||
    text.includes("ödendi") ||
    text.includes("odendi")
  )
    return "ok";
  return "blue";
}

function normalizeDocumentStatus(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

function isProcessedDocumentStatus(value) {
  const status = normalizeDocumentStatus(value);
  return [
    "işlendi",
    "islendi",
    "işlenen",
    "islenen",
    "onaylandı",
    "onaylandi",
    "processed",
    "done",
    "final",
    "completed",
  ].includes(status);
}

function useEndpoint(path, activeMainCompany, refreshKey, params = {}) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const companyKey = activeMainCompany?.slug || activeMainCompany?.id || "";
  const paramsKey = JSON.stringify(params || {});
  const requestRef = useRef({ activeMainCompany, params });
  requestRef.current = { activeMainCompany, params };

  useEffect(() => {
    let alive = true;
    if (!path) {
      setState({ loading: false, error: "", data: [] });
      return () => {
        alive = false;
      };
    }
    setState({ loading: true, error: "", data: null });
    const request = requestRef.current;
    apiGet(path, companyParams(request.activeMainCompany, request.params))
      .then((payload) => {
        if (alive)
          setState({ loading: false, error: "", data: unwrap(payload) });
      })
      .catch((error) => {
        if (alive)
          setState({
            loading: false,
            error: error?.message || "Veri alınamadı.",
            data: null,
          });
      });
    return () => {
      alive = false;
    };
  }, [path, companyKey, refreshKey, paramsKey]);

  return state;
}

function companyParams(activeMainCompany, extra = {}) {
  const slug =
    activeMainCompany?.mainCompanySlug || activeMainCompany?.slug || "";
  const id = activeMainCompany?.mainCompanyId || activeMainCompany?.id || "";
  return {
    ...(activeMainCompany || {}),
    ...(slug ? { mainCompanySlug: slug } : {}),
    ...(id ? { mainCompanyId: id } : {}),
    ...(extra || {}),
  };
}

function firmTypeValue(value) {
  const raw = String(value || "").toLocaleUpperCase("tr-TR");
  if (raw.includes("MUSTERI") || raw.includes("MÜŞTERİ") || raw === "CUSTOMER")
    return "MUSTERI";
  if (raw.includes("SATICI") || raw === "SUPPLIER" || raw.includes("TEDARIK"))
    return "SATICI";
  if (raw === "BOTH" || raw.includes("IKISI") || raw.includes("İKİSİ"))
    return "BOTH";
  return raw || "SATICI";
}

function officialTypeValue(value) {
  const raw = String(value || "").toLocaleUpperCase("tr-TR");
  if (raw === "UNOFFICIAL" || raw.includes("GAYRI") || raw.includes("GAYRİ"))
    return "GAYRI";
  if (raw === "BOTH" || raw.includes("IKISI") || raw.includes("İKİSİ"))
    return "BOTH";
  return "RESMI";
}

function balanceDirectionValue(value) {
  const amount = Number(value || 0);
  if (amount > 0) return "BORÇLU";
  if (amount < 0) return "ALACAKLI";
  return "SIFIR";
}

function balanceDirectionLabel(value) {
  if (value === "CARI_TAKIP_DISI" || value === "CARİ TAKİP DIŞI") {
    return "Cari takip dışı";
  }
  return value || "Bakiye";
}

function Badge({ children, tone = "gray" }) {
  return <span className={`mh-badge ${tone}`}>{children || "-"}</span>;
}

function Card({ title, subtitle, children, action }) {
  return (
    <section className="mh-card">
      <div className="mh-card-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        {action}
      </div>
      <div className="mh-card-body">{children}</div>
    </section>
  );
}
function Field({ label, children }) {
  return (
    <label className="mh-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SearchableFirmField({
  label,
  selectedCompanyId,
  companies,
  onSelect,
  placeholder = "Firma adı / kısa ad / vergi no ara",
}) {
  const selectedCompany = useMemo(
    () => companies.find((row) => row.id === selectedCompanyId) || null,
    [companies, selectedCompanyId],
  );
  const [query, setQuery] = useState(selectedCompany?.firmaAdi || "");

  useEffect(() => {
    setQuery(selectedCompany?.firmaAdi || "");
  }, [selectedCompany?.id, selectedCompany?.firmaAdi]);

  const filteredCompanies = useMemo(() => {
    const source = Array.isArray(companies) ? companies : [];
    const term = String(query || "")
      .trim()
      .toLocaleLowerCase("tr-TR");
    const rows = term
      ? source.filter((row) =>
          [row?.firmaAdi, row?.kisaAd, row?.vergiNo, row?.telefon]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("tr-TR")
            .includes(term),
        )
      : source;
    return rows.slice(0, 8);
  }, [companies, query]);

  return (
    <Field label={label}>
      <div className="mh-search-field">
        <input
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            const nextValue = event?.target.value;
            setQuery(nextValue);
            const exactMatch = companies.find(
              (row) =>
                String(row?.firmaAdi || "").localeCompare(nextValue, "tr", {
                  sensitivity: "base",
                }) === 0,
            );
            onSelect(exactMatch.id || "");
          }}
        />
        {selectedCompany ? (
          <small className="mh-inline-note">
            Seçili firma: {selectedCompany?.firmaAdi}
          </small>
        ) : null}
        <div className="mh-search-option-list">
          {filteredCompanies.map((row) => (
            <button
              key={row?.id}
              className={`mh-search-option ${row.id === selectedCompanyId ? "active" : ""}`}
              type="button"
              onClick={() => {
                setQuery(row?.firmaAdi || "");
                onSelect(row?.id);
              }}
            >
              <strong>{row?.firmaAdi}</strong>
              <span>
                {row?.kisaAd || row?.vergiNo || row?.firmaTipi || "Firma"}
              </span>
            </button>
          ))}
          {query && !filteredCompanies.length ? (
            <div className="mh-search-empty">Firma bulunamadı.</div>
          ) : null}
        </div>
      </div>
    </Field>
  );
}

function firmTypeLabel(value) {
  if (value === "MUSTERI") return "Müşteri";
  if (value === "SATICI") return "Satıcı";
  if (value === "BOTH") return "Müşteri + Satıcı";
  return value || "Firma";
}

function officialTypeLabel(value) {
  if (value === "RESMI") return "Resmi";
  if (value === "GAYRI") return "Gayri";
  if (value === "BOTH") return "Resmi + Gayri";
  return value || "Durum yok";
}

function balanceTone(value) {
  if (value === "CARI_TAKIP_DISI" || value === "CARİ TAKİP DIŞI") return "gray";
  if (value === "BORCLU") return "warn";
  if (value === "ALACAKLI") return "green";
  return "gray";
}

function FirmListButton({
  row,
  active,
  onClick,
  showBalance = true,
  showOfficial = true,
}) {
  return (
    <button
      className={`mh-doc-item firm-card ${active ? "active" : ""}`}
      type="button"
      onClick={onClick}
    >
      <div className="mh-firm-card-title-row">
        <strong title={row?.firmaAdi}>{row?.firmaAdi}</strong>
        {row?.kisaAd && row?.kisaAd !== row?.firmaAdi ? (
          <small title={row?.kisaAd}>{row?.kisaAd}</small>
        ) : null}
      </div>
      <div className="mh-firm-card-badges">
        <Badge tone="blue">{firmTypeLabel(row?.firmaTipi)}</Badge>
        {showOfficial ? (
          <Badge tone={row.resmiGayri === "GAYRI" ? "warn" : "gray"}>
            {officialTypeLabel(row?.resmiGayri)}
          </Badge>
        ) : null}
        {row?.vatOnlyExpense || row?.expenseCalculationMode === "VAT_ONLY" ? (
          <Badge tone="warn">Sadece KDV</Badge>
        ) : null}
      </div>
      <div className="mh-firm-card-meta">
        <span>{row?.vergiNo ? `VN ${row?.vergiNo}` : "Vergi no yok"}</span>
        {showBalance ? (
          <Badge tone={balanceTone(row?.bakiyeYonu)}>
            {balanceDirectionLabel(row?.bakiyeYonu)}
          </Badge>
        ) : null}
      </div>
      {showBalance ? (
        <div className="mh-firm-card-balance">
          <strong>{money(row?.mevcutBakiye)}</strong>
        </div>
      ) : null}
    </button>
  );
}

function StatusBlock({ state, emptyText = "Kayıt bulunamadı." }) {
  if (state.loading) return <div className="mh-state">Yükleniyor...</div>;
  if (state.error) return <div className="mh-state error">{state.error}</div>;
  if (Array.isArray(state.data) && state.data.length === 0)
    return <div className="mh-state">{emptyText}</div>;
  return null;
}

function DataTable({
  columns,
  rows,
  renderRow,
  emptyText = "Kayıt bulunamadı.",
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return (
    <div className="mh-table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.length ? (
            safeRows.map(renderRow)
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FirmCardExtras({ activeMainCompany, refreshKey, reloadAll, goTab }) {
  const [openPanel, setOpenPanel] = useState("");
  return (
    <section
      style={{
        marginTop: 12,
        border: "1px solid #dfe7f2",
        borderRadius: 14,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 14px",
          background: "#f8fbff",
          borderBottom: openPanel ? "1px solid #e7edf5" : 0,
        }}
      >
        <div>
          <strong style={{ color: "#17365f" }}>Firma Kartı Ek Ayarları</strong>
          <p style={{ margin: "3px 0 0", color: "#748297", fontSize: 12 }}>
            Gider kuralı ve mail/yetkili bilgileri yalnız gerektiğinde açılır.
          </p>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button
            className={openPanel === "expense" ? "mh-btn primary" : "mh-btn"}
            type="button"
            onClick={() => setOpenPanel((value) => (value === "expense" ? "" : "expense"))}
          >
            Firma / Gider Kuralları
          </button>
          <button
            className={openPanel === "contacts" ? "mh-btn primary" : "mh-btn"}
            type="button"
            onClick={() => setOpenPanel((value) => (value === "contacts" ? "" : "contacts"))}
          >
            Yetkililer ve E-posta
          </button>
        </div>
      </header>
      {openPanel === "expense" ? (
        <div style={{ padding: 12 }}>
          <ExpenseCategories
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
          />
        </div>
      ) : null}
      {openPanel === "contacts" ? (
        <div style={{ padding: 12 }}>
          <FirmContacts
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
            reloadAll={reloadAll}
            goTab={goTab}
          />
        </div>
      ) : null}
    </section>
  );
}

export default function MuhasebePage({
  activeTab,
  activeMainCompany,
  openModule,
}) {
  const normalizedTab = TAB_ALIASES[activeTab] || activeTab || "yonetim-ozeti";
  const currentTab = TAB_CONFIG.some((tab) => tab.key === normalizedTab)
    ? normalizedTab
    : "yonetim-ozeti";
  const [refreshKey, setRefreshKey] = useState(0);
  const reloadAll = () => setRefreshKey((value) => value + 1);

  const goTab = (tabKey, query = "") => {
    if (openModule) openModule("muhasebe", { tabKey });
    if (query) {
      window.setTimeout(() => {
        window.history.pushState({}, "", `/muhasebe/${tabKey}${query}`);
      }, 0);
    }
  };

  const currentTabInfo = TAB_CONFIG.find((tab) => tab.key === currentTab) || TAB_CONFIG[0];
  const goPath = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="muhasebe-workbench">
      <style>{styles}</style>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "10px 12px",
          marginBottom: 10,
          border: "1px solid #dfe7f2",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18, color: "#17365f" }}>{currentTabInfo.title}</h1>
          <p style={{ margin: "3px 0 0", color: "#7b8798", fontSize: 12 }}>
            İşNet belgeyi yönetir; Muhasebe cari, KDV, ödeme ve finansal sonucu izler.
          </p>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="mh-btn" type="button" onClick={() => goTab("firma-kartlari", "?quick=cari")}>Hızlı Cari</button>
          <button className="mh-btn primary" type="button" onClick={() => goTab("cek-odeme", "?quick=cek")}>Hızlı Çek</button>
          <button className="mh-btn" type="button" onClick={() => goPath("/isnet/belge-akisi")}>İşNet Belge Merkezi</button>
        </div>
      </header>

      {currentTab === "yonetim-ozeti" ? (
        <ManagementSummary
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          goTab={goTab}
        />
      ) : null}
      {currentTab === "firma-kartlari" ? (
        <>
          <CompanyCards
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
            reloadAll={reloadAll}
          />
          <CompanyAliasPanel
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
          />
          <FirmCardExtras
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
            reloadAll={reloadAll}
            goTab={goTab}
          />
        </>
      ) : null}
      {currentTab === "gider-kategorileri" ? (
        <ExpenseCategories
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
        />
      ) : null}
      {currentTab === "firma-yetkilileri" ? (
        <FirmContacts
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          reloadAll={reloadAll}
          goTab={goTab}
        />
      ) : null}
      {currentTab === "envanter-urunleri" ? (
        <ProductMatchingQueue
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          reloadAll={reloadAll}
        />
      ) : null}
      {currentTab === "tedarikci-faturalar" ? (
        <BelgeIslemMerkezi activeMainCompany={activeMainCompany} />
      ) : null}
      {currentTab === "kesilen-faturalar" ? (
        <KesilenFaturalarTab activeMainCompany={activeMainCompany} />
      ) : null}
      {currentTab === "musteri-irsaliyeleri" ? (
        <MusteriIrsaliyeleriTab activeMainCompany={activeMainCompany} />
      ) : null}
      {currentTab === "irsaliye-fatura-kontrol" ? (
        <IrsaliyeFaturaKontrolTab activeMainCompany={activeMainCompany} />
      ) : null}
      {currentTab === "kar-zarar" ? (
        <ProfitLossCenter
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          goTab={goTab}
        />
      ) : null}
      {currentTab === "model-takip" ? (
        <ModelMerkezliMusteriTakip activeMainCompany={activeMainCompany} />
      ) : null}

      {currentTab === "cari-hareketler" ? (
        <CariMovements
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          reloadAll={reloadAll}
          goTab={goTab}
        />
      ) : null}
      {currentTab === "kdv-kontrol" ? (
        <KdvControl
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
        />
      ) : null}
      {currentTab === "cek-odeme" ? (
        <CheckPayment
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          reloadAll={reloadAll}
        />
      ) : null}
      {currentTab === "mail-ekstre" ? (
        <MailExtract
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          goTab={goTab}
        />
      ) : null}
      {currentTab === "mail-sablonlari" ? (
        <MailSablonlariPage activeMainCompany={activeMainCompany} />
      ) : null}
      {currentTab === "muhasebe-raporlari" ? (
        <Reports
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          goTab={goTab}
        />
      ) : null}
    </div>
  );
}

function ManagementSummary({ activeMainCompany, refreshKey, goTab }) {
  const state = useEndpoint(
    "/muhasebe/yonetim-ozeti",
    activeMainCompany,
    refreshKey,
  );
  const summary = state.data || {};
  const workItems = Array.isArray(summary.gunlukIsListesi)
    ? summary.gunlukIsListesi
    : [];
  const payments = Array.isArray(summary.yaklasanOdemeler)
    ? summary.yaklasanOdemeler
    : [];
  const checkSummary = summary.cekOzet || {};
  const monthlyChecks = Array.isArray(checkSummary.aylikDagilim)
    ? checkSummary.aylikDagilim
    : [];
  const mailControl = summary.mailDepartmanYetkiKontrol || {};

  if (state.loading || state.error) return <StatusBlock state={state} />;

  return (
    <>
      <div className="mh-summary-grid">
        {[
          ["Onay Bekleyen Belge", summary.onayBekleyenBelge, "blue"],
          ["Mail Bekleyen Fatura", summary.mailBekleyenFatura, "green"],
          [
            "Departman Yetkilisi Eksik",
            summary.departmanYetkilisiEksik,
            "yellow",
          ],
          ["Ekstreye Girmeyen", summary.ekstreyeGirmeyen, "red"],
          ["Net KDV", money(summary.netKdv), "dark"],
        ].map(([label, value, tone]) => (
          <div className={`mh-summary ${tone}`} key={label}>
            <span>{label}</span>
            <b>{value ?? 0}</b>
          </div>
        ))}
      </div>

      <div className="mh-layout-2">
        <div>
          <Card
            title="Günlük Muhasebe İş Listesi"
            subtitle="Belge, mail, ekstre, departman yetkisi ve ödeme kontrolü."
          >
            <DataTable
              columns={[
                "Öncelik",
                "İş",
                "Firma",
                "Model",
                "Belge",
                "Tutar",
                "Durum",
                "İşlem",
              ]}
              rows={workItems}
              renderRow={(row, index) => (
                <tr key={`${row?.belge || "kayit"}-${row?.is || "is"}-${row?.hedef || "hedef"}-${index}`}>
                  <td>
                    <Badge tone={row.oncelik === "Yüksek" ? "bad" : "warn"}>
                      {row?.oncelik}
                    </Badge>
                  </td>
                  <td>{row?.is}</td>
                  <td>{row?.firma}</td>
                  <td>{row?.model || "-"}</td>
                  <td>{row?.belge || "-"}</td>
                  <td>{money(row?.tutar)}</td>
                  <td>
                    <Badge tone={toneFromStatus(row?.durum)}>
                      {row?.durum}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="mh-btn"
                      type="button"
                      onClick={() =>
                        goTab(
                          TAB_ALIASES[row?.hedef] ||
                            row?.hedef ||
                            "tedarikci-faturalar",
                        )
                      }
                    >
                      Aç
                    </button>
                  </td>
                </tr>
              )}
            />
          </Card>

          <Card
            title="Yaklaşan Çekler"
            subtitle="Açık çeklerin yaklaşan vade ve ay bazlı toplam özeti."
          >
            <div className="mh-summary-grid four compact-cards">
              <CariSummaryMetric
                label="Açık Çek"
                value={String(checkSummary.acikCekSayisi ?? 0)}
              />
              <CariSummaryMetric
                label="Toplam Tutar"
                value={money(checkSummary.toplamAcikCekTutari)}
                tone="yellow"
              />
              <CariSummaryMetric
                label="Yaklaşan"
                value={`${String(checkSummary.yaklasanCekSayisi ?? 0)} / ${money(checkSummary.yaklasanCekTutari)}`}
                tone="green"
              />
              <CariSummaryMetric
                label="Vadesi Geçmiş"
                value={`${String(checkSummary.vadesiGecmisCekSayisi ?? 0)} / ${money(checkSummary.vadesiGecmisCekTutari)}`}
                tone="red"
              />
            </div>
            <DataTable
              columns={["Ay", "Çek Sayısı", "Toplam Tutar"]}
              rows={monthlyChecks}
              emptyText="Aylık çek dağılımı yok."
              renderRow={(row) => (
                <tr key={row?.monthKey || row?.ay}>
                  <td>{row?.ay || "-"}</td>
                  <td>{row?.count ?? 0}</td>
                  <td>{money(row?.total)}</td>
                </tr>
              )}
            />
            <DataTable
              columns={[
                "Vade",
                "Firma",
                "Belge",
                "Ödeme Tipi",
                "Tutar",
                "Çek Görsel",
                "Durum",
              ]}
              rows={payments}
              renderRow={(row) => (
                <tr key={`${row?.source || "odeme"}-${row?.id}`}>
                  <td>{date(row?.vadeTarihi)}</td>
                  <td>{row?.firma}</td>
                  <td>{row?.bagliBelge || row?.cekNo || "-"}</td>
                  <td>{row?.odemeTipi}</td>
                  <td>{money(row?.tutar)}</td>
                  <td>{row?.onGorsel || row?.arkaGorsel ? "Var" : "-"}</td>
                  <td>
                    <Badge tone={toneFromStatus(row?.vadeGrubu || row?.durum)}>
                      {row?.vadeGrubu || row?.durum}
                    </Badge>
                  </td>
                </tr>
              )}
            />
          </Card>
        </div>

        <div>
          <Card title="Yönetim Özeti">
            {[
              ["Bu ay satış", money(summary.buAySatis)],
              ["Bu ay alış / gider", money(summary.buAyAlisGider)],
              ["Gelen KDV", money(summary.gelenKdv)],
              ["Giden KDV", money(summary.gidenKdv)],
              ["Devreden KDV", money(summary.devredenKdv)],
              ["Tahsilat bekleyen", money(summary.tahsilatBekleyen)],
              ["Ödeme bekleyen", money(summary.odemeBekleyen)],
            ].map(([label, value]) => (
              <SideLine key={label} label={label} value={value} />
            ))}
            <div className="mh-action-stack">
              <button
                className="mh-btn primary"
                type="button"
                onClick={() =>
                  goTab("muhasebe-raporlari", "tip=haftalik-yonetim-ozeti")
                }
              >
                Haftalık Özet Yazdır
              </button>
              <button
                className="mh-btn"
                type="button"
                onClick={() =>
                  goTab("muhasebe-raporlari", "tip=aylik-yonetim-ozeti")
                }
              >
                Aylık Rapor Aç
              </button>
              <button
                className="mh-btn"
                type="button"
                onClick={() => goTab("mail-ekstre", "durum=bekleyen")}
              >
                Mail Bekleyenleri Aç
              </button>
              <button
                className="mh-btn"
                type="button"
                onClick={() => goTab("mail-ekstre", "tab=ekstre-fark")}
              >
                Ekstre Farklarını Aç
              </button>
            </div>
          </Card>

          <Card title="Mail / Departman Yetki Kontrol">
            {[
              ["Gönderilecek", mailControl.gonderilecek],
              ["Gönderildi", mailControl.gonderildi],
              ["Alıcı eksik", mailControl.aliciEksik],
              ["Ekstrede var", mailControl.ekstedeVar],
            ].map(([label, value]) => (
              <SideLine key={label} label={label} value={value ?? 0} />
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}

function DocumentControl({ activeMainCompany, refreshKey, reloadAll, goTab }) {
  const state = useEndpoint(
    "/muhasebe/belge-havuzu",
    activeMainCompany,
    refreshKey,
  );
  const documents = asArray(state.data);
  const queryDocumentId = new URLSearchParams(window.location.search).get(
    "documentId",
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [bulkApproveBusy, setBulkApproveBusy] = useState(false);
  const [listTab, setListTab] = useState("pending");
  const [detailState, setDetailState] = useState({
    loading: false,
    error: "",
    data: null,
  });
  const [uploadState, setUploadState] = useState("");
  const pendingDocuments = documents?.filter(
    (document) => !isProcessedDocumentStatus(document.durum),
  );
  const processedDocuments = documents?.filter((document) =>
    isProcessedDocumentStatus(document.durum),
  );
  const visibleDocuments =
    listTab === "processed"
      ? processedDocuments
      : listTab === "all"
        ? documents
        : pendingDocuments;
  const selectedId = visibleDocuments.some(
    (document) => document.id === selectedDocumentId,
  )
    ? selectedDocumentId
    : visibleDocuments[0].id || "";

  useEffect(() => {
    if (selectedId || selectedDocumentId === "") return;
    setSelectedDocumentId("");
  }, [selectedId, selectedDocumentId]);

  useEffect(() => {
    setSelectedDocumentIds([]);
  }, [listTab]);

  useEffect(() => {
    if (!queryDocumentId) return;
    if (documents.some((document) => document.id === queryDocumentId)) {
      setSelectedDocumentId(queryDocumentId);
    }
  }, [documents, queryDocumentId]);

  useEffect(() => {
    if (!selectedId) {
      setDetailState({ loading: false, error: "", data: null });
      return;
    }
    let alive = true;
    setDetailState({ loading: true, error: "", data: null });
    apiGet(
      `/muhasebe/belge-havuzu/${encodeURIComponent(selectedId)}`,
      activeMainCompany,
    )
      .then((payload) => {
        if (alive)
          setDetailState({ loading: false, error: "", data: unwrap(payload) });
      })
      .catch((error) => {
        if (alive)
          setDetailState({
            loading: false,
            error: error?.message || "Belge detayı alınamadı.",
            data: null,
          });
      });
    return () => {
      alive = false;
    };
  }, [selectedId, activeMainCompany?.slug, refreshKey, activeMainCompany]);

  const detail =
    detailState.data ||
    visibleDocuments.find((document) => document.id === selectedId) ||
    {};
  const lines = Array.isArray(detail?.kalemler) ? detail?.kalemler : [];

  const uploadFiles = async (event) => {
    const files = Array.from(event?.target.files || []);
    if (!files.length) return;
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    if (activeMainCompany?.slug)
      form.set("mainCompanySlug", activeMainCompany?.slug);
    setUploadState("Yükleniyor...");
    try {
      await apiUpload("/muhasebe/document-upload", form);
      setUploadState("Yüklendi.");
      reloadAll();
    } catch (error) {
      setUploadState(error?.message || "Yükleme başarısız.");
    } finally {
      event.target.value = "";
    }
  };

  const approve = async () => {
    if (!selectedId) return;
    await apiPost(
      `/muhasebe/belge-havuzu/${encodeURIComponent(selectedId)}/onayla`,
      { ...activeMainCompany },
    );
    reloadAll();
  };

  const toggleDocumentSelection = (documentId, checked) => {
    const targetDocument = documents?.find(
      (document) => document.id === documentId,
    );
    if (isProcessedDocumentStatus(targetDocument.durum)) {
      return;
    }
    setSelectedDocumentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(documentId);
      else next.delete(documentId);
      return [...next];
    });
  };

  const bulkApprove = async () => {
    if (!selectedDocumentIds.length || bulkApproveBusy) return;
    if (
      !window.confirm(
        `${selectedDocumentIds.length} belge sırayla onaylanacak. Devam edilsin mi`,
      )
    ) {
      return;
    }
    setBulkApproveBusy(true);
    let approvedCount = 0;
    let skippedCount = 0;
    try {
      for (const documentId of selectedDocumentIds) {
        try {
          await apiPost(
            `/muhasebe/belge-havuzu/${encodeURIComponent(documentId)}/onayla`,
            { ...activeMainCompany },
          );
          approvedCount += 1;
        } catch {
          skippedCount += 1;
        }
      }
      setUploadState(
        `${approvedCount} belge onaylandı${skippedCount ? `, ${skippedCount} belge atlandı` : ""}.`,
      );
      setSelectedDocumentIds([]);
      reloadAll();
    } finally {
      setBulkApproveBusy(false);
    }
  };

  return (
    <div className="mh-layout-3 document">
      <Card
        title="Belge Havuzu"
        subtitle="PDF / XML / ZIP toplu belge yükleme."
        action={
          <label className="mh-doc-filter-select">
            <span>Liste</span>
            <select
              value={listTab}
              onChange={(event) => setListTab(event?.target.value)}
            >
              <option value="pending">
                Bekleyen ({pendingDocuments.length})
              </option>
              <option value="processed">
                İşlendi ({processedDocuments.length})
              </option>
              <option value="all">Tümü ({documents?.length})</option>
            </select>
          </label>
        }
      >
        <div className="mh-doc-pool-top">
          <div className="mh-upload-box mh-upload-box-inline">
            <div>
              <strong>PDF / XML / ZIP toplu yükleme</strong>
              <small>Toplu dosya okunur, her belge ayrı satıra düşer.</small>
            </div>
            <input
              type="file"
              multiple
              accept=".pdf,.xml,.zip"
              onChange={uploadFiles}
            />
          </div>
        </div>
        {uploadState ? <div className="mh-state">{uploadState}</div> : null}
        <StatusBlock state={state} emptyText="Belge havuzunda kayıt yok." />
        <div className="mh-doc-list">
          {visibleDocuments.map((document) => (
            <div className="mh-doc-select-item" key={document.id}>
              {(() => {
                const isProcessed = isProcessedDocumentStatus(document.durum);
                return (
                  <label
                    className="mh-doc-check"
                    aria-label={`${document.belgeNo || document.id} seç`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocumentIds.includes(document.id)}
                      disabled={isProcessed}
                      onChange={(event) =>
                        toggleDocumentSelection(
                          document.id,
                          event?.target.checked,
                        )
                      }
                    />
                  </label>
                );
              })()}
              <button
                className={`mh-doc-item ${selectedId === document.id ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedDocumentId(document.id)}
              >
                <strong>{document.belgeNo || document.id}</strong>
                <span>
                  {document.firma}
                  {document.modelName ? ` / ${document.modelName}` : ""}
                </span>
                <span>{document.belgeTuru}</span>
                <span>{money(document.tutar)}</span>
                <Badge tone={toneFromStatus(document.durum)}>
                  {document.durum}
                </Badge>
              </button>
            </div>
          ))}
          {!visibleDocuments.length ? (
            <div className="mh-state">
              {listTab === "processed"
                ? "İşlenen belge yok."
                : listTab === "all"
                  ? "Belge havuzunda kayıt yok."
                  : "Bekleyen belge yok."}
            </div>
          ) : null}
        </div>
      </Card>

      <section className="mh-invoice-paper">
        {selectedId ? (
          <>
            <StatusBlock state={detailState} />
            <div className="mh-invoice-title">
              <div>
                <h2>
                  {String(detail?.belgeTuru || "Belge").toLocaleUpperCase(
                    "tr-TR",
                  )}
                </h2>
                <p>{detail?.firma || "-"}</p>
              </div>
              <div className="mh-doc-no">
                <b>Belge No:</b> {detail?.belgeNo || "-"}
                <br />
                <b>Tarih:</b> {date(detail?.tarih)}
                <br />
                <b>Durum:</b> {detail?.durum || "-"}
                <br />
                <b>Resmi/Gayri:</b> {detail?.resmiGayri || "-"}
              </div>
            </div>

            <div className="mh-party-grid">
              <div className="mh-party-box">
                <h3>Kesen Firma</h3>
                <p>
                  <b>{detail?.kesenFirma || detail?.firma || "-"}</b>
                </p>
              </div>
              <div className="mh-party-box">
                <h3>Alıcı Firma</h3>
                <p>
                  <b>{detail?.aliciFirma || activeMainCompany?.name || "-"}</b>
                </p>
              </div>
            </div>

            <div className="mh-invoice-meta">
              {[
                ["Belge Türü", detail?.belgeTuru],
                ["Model", detail?.modelName || "-"],
                ["Mail", detail?.mailDurumu],
                ["Ekstre", detail?.ekstreDurumu],
                ["Toplam", money(detail?.tutar)],
              ].map(([label, value]) => (
                <div className="mh-meta-cell" key={label}>
                  <span>{label}</span>
                  <b>{value || "-"}</b>
                </div>
              ))}
            </div>

            <ProductMatchTable
              activeMainCompany={activeMainCompany}
              documentId={selectedId}
              previewLines={lines}
              title="Belge kalemleri"
            />

            <div className="mh-invoice-bottom">
              <div className="mh-note-box">
                <b>Eksik Bilgiler</b>
                {(detail?.eksikBilgiler || []).length ? (
                  detail.eksikBilgiler.map((item) => <p key={item}>{item}</p>)
                ) : (
                  <p>Eksik bilgi yok.</p>
                )}
              </div>
              <div className="mh-totals">
                {[
                  ["Mal Hizmet Toplamı", money(detail?.kdvOzeti.matrah)],
                  ["KDV", money(detail?.kdvOzeti.kdv)],
                  [
                    "Ödenecek Tutar",
                    money(detail?.kdvOzeti.toplam || detail?.tutar),
                  ],
                ].map(([label, value]) => (
                  <div className="mh-total-row" key={label}>
                    <span>{label}</span>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="mh-empty-panel">
            <h3>Gösterilecek belge yok</h3>
            <p>
              {listTab === "pending"
                ? "Bekleyen filtresinde kayıt kalmadı. İşlenen sekmesine geçebilir veya yeni belge yükleyebilirsiniz."
                : listTab === "processed"
                  ? "İşlenen sekmesinde kayıt yok."
                  : "Bu görünümde belge bulunamadı."}
            </p>
          </div>
        )}
      </section>

      <Card
        title="Onay Sonucu"
        subtitle="Belge işlendiğinde oluşacak muhasebe etkisi."
      >
        <Impact title="Cari">
          <p>Firma: {detail?.firma || "-"}</p>
          <p>
            <b>Toplam:</b> {money(detail?.tutar)}
          </p>
        </Impact>
        <Impact title="KDV">
          <p>
            <b>KDV:</b> {money(detail?.kdvOzeti.kdv)}
          </p>
        </Impact>
        <Impact title="Hammadde / Lot">
          {(detail?.hammaddeLotBilgileri || []).length ? (
            detail.hammaddeLotBilgileri.map((item, index) => (
              <p key={`${item}-${index}`}>{String(item)}</p>
            ))
          ) : (
            <p>Kayıt yok.</p>
          )}
        </Impact>
        <Impact title="Mail / Ekstre">
          <p>Mail: {detail?.mailDurumu || "-"}</p>
          <p>Ekstre: {detail?.ekstreDurumu || "-"}</p>
        </Impact>
        <div className="mh-action-stack">
          <button
            className="mh-btn"
            type="button"
            onClick={bulkApprove}
            disabled={!selectedDocumentIds.length || bulkApproveBusy}
          >
            {bulkApproveBusy
              ? "Toplu onay çalışıyor..."
              : `Seçilenleri Toplu Onayla${selectedDocumentIds.length ? ` (${selectedDocumentIds.length})` : ""}`}
          </button>
          <button
            className="mh-btn primary"
            type="button"
            onClick={approve}
            disabled={!selectedId}
          >
            Onayla ve İşle
          </button>
          <button
            className="mh-btn"
            type="button"
            onClick={() => goTab("firma-kartlari")}
          >
            Firma Kartını Aç
          </button>
          <button
            className="mh-btn"
            type="button"
            onClick={() => goTab("cari-hareketler")}
          >
            Cari Önizleme
          </button>
          <button
            className="mh-btn"
            type="button"
            disabled={!detail?.pdfPath}
            onClick={() =>
              window.open(
                buildApiUrl(
                  `/muhasebe/documents/${encodeURIComponent(selectedId)}/preview`,
                  activeMainCompany,
                ),
                "_blank",
              )
            }
          >
            PDF Aç
          </button>
        </div>
      </Card>
    </div>
  );
}

function emptyMovementForm(resmiGayri = "RESMI") {
  return {
    islemTipi: "TAHSILAT",
    tutar: "",
    tarih: new Date().toISOString().slice(0, 10),
    vade: "",
    belgeNo: "",
    resmiGayri,
    aciklama: "",
    checkType: "MUSTERIDEN_ALINAN",
    bankName: "",
    branchName: "",
    drawerName: "",
    accountNo: "",
    frontImageFile: null,
    backImageFile: null,
    creditCardId: "",
    installmentCount: "1",
    slipFile: null,
  };
}

function normalizeMovement(row = {}) {
  const borc = Number(row?.borc ?? row?.debit ?? 0);
  const alacak = Number(row?.alacak ?? row?.credit ?? 0);
  return {
    id: row?.id,
    firmaId: row?.firmaId || row?.companyId || "",
    firmaAdi: row?.firmaAdi || row?.firma || row?.companyName || "",
    documentId: row?.documentId || "",
    belgeNo: row?.belgeNo || row?.documentNo || "",
    belgeTipi: row?.belgeTipi || row?.documentType || row?.movementType || "-",
    resmiGayri: officialTypeValue(row?.resmiGayri || row?.officialType),
    aciklama: row?.aciklama || row?.description || "",
    borc,
    alacak,
    bakiye: Number(row?.bakiye ?? row?.balanceAfter ?? 0),
    tutar: Number(row?.tutar ?? row?.amount ?? Math.max(borc, alacak)),
    vade: row?.vade || row?.dueDate || "",
    durum: row?.durum || row?.status || "-",
    tarih: row?.tarih || row?.movementDate || row?.date || "",
    manual: row?.manual ?? !row?.documentId,
    kaynak: row?.kaynak || row?.sourceType || row?.source || "",
    movementType: row?.movementType || row?.islemTipi || row?.belgeTipi || "",
  };
}

function movementTypeLabel(value) {
  const labels = {
    GELEN_FATURA: "Gelen Fatura",
    ALIS: "Tedarikçiden Gelen Fatura",
    GIDER: "Gider Faturası",
    ODEME: "Tahsilat Yapıldı",
    KREDI_KARTI_ODEMESI: "Kredi Kartıyla Ödeme",
    KREDI_KARTI_TAHSILATI: "Kredi Kartından Tahsilat",
    SATIS: "Giden Fatura",
    FATURA: "Müşteriye Kesilen Fatura",
    BORC: "Müşteri Borçlandırma",
    ALACAK: "Tedarikçi Faturası / Alacak",
    TAHSILAT: "Tahsilat Geldi",
    CEK_GIRISI: "Çek Alındı",
    CEK_TAHSILATI: "Çek Alındı",
    CEK_ODEMESI: "Çek Verildi",
    BAKIYE: "Bakiye Düzeltme",
  };
  return labels[String(value || "").toUpperCase()] || value || "Diğer Cari İşlem";
}

function movementTypeHint(value) {
  const hints = {
    GELEN_FATURA: "Size gelen alış faturasıdır; firmaya borç ve bir kez gider oluşturur.",
    ODEME: "Sizin yaptığınız ödemedir; firmaya olan borcu kapatır, yeniden gider oluşturmaz.",
    SATIS: "Sizin kestiğiniz faturadır; müşteriden alacağınızı artırır.",
    TAHSILAT: "Size gelen ödemedir; müşteriden alacağınızı azaltır.",
    CEK_GIRISI: "Size verilen çektir; gelen tahsilat gibi cari bakiyeyi azaltır.",
    CEK_TAHSILATI: "Size verilen çektir; gelen tahsilat gibi cari bakiyeyi azaltır.",
    CEK_ODEMESI: "Sizin verdiğiniz çektir; firmaya olan borcu kapatır.",
    KREDI_KARTI_TAHSILATI: "Kredi kartından size gelen tahsilattır.",
    KREDI_KARTI_ODEMESI: "Tedarikçiye kredi kartıyla yapılan ödemedir; cari borcu azaltır.",
  };
  return hints[String(value || "").toUpperCase()] || "Seçilen işlem cari hesaba kaydedilir.";
}

function movementPreviewEffect(movementType, amount) {
  const total = Math.abs(Number(amount || 0));
  switch (String(movementType || "").toUpperCase()) {
    case "ODEME":
    case "KREDI_KARTI_ODEMESI":
      return total;
    case "TAHSILAT":
    case "ALACAK":
    case "GELEN_FATURA":
    case "CEK_GIRISI":
    case "CEK_TAHSILATI":
    case "KREDI_KARTI_TAHSILATI":
      return -total;
    case "CEK_ODEMESI":
      return total;
    case "BORC":
      return total;
    default:
      return 0;
  }
}

function normalizeCariDocumentDetail(row = {}) {
  const movement = row?.movement ? normalizeMovement(row?.movement) : null;
  const document = row?.document || null;
  return {
    movement,
    document: document
      ? {
          documentNo: document.documentNo || "",
          documentType: document.documentType || "",
          firmName: document.firmName || movement.firmaAdi || "",
          taxNo: document.taxNo || "",
          taxOffice: document.taxOffice || "",
          date: document.date || "",
          dueDate: document.dueDate || "",
          officialType: officialTypeValue(document.officialType || "RESMI"),
          status: document.status || "-",
          source: document.source || "-",
          subtotal: Number(document.subtotal || 0),
          vatTotal: Number(document.vatTotal || 0),
          grandTotal: Number(document.grandTotal || 0),
          cariDebit: Number(document.cariDebit || 0),
          cariCredit: Number(document.cariCredit || 0),
          processedAmount: Number(document.processedAmount || 0),
          pdfUrl: document.pdfUrl || "",
          xmlUrl: document.xmlUrl || "",
          belgeKaynagi: document.belgeKaynagi || document.source || "-",
          movementRef: document.movementRef || movement.id || "",
          modelName: document.modelName || "",
          lines: Array.isArray(document.lines)
            ? document.lines.map((line) => ({
                lineNo: line?.lineNo || "",
                name: line?.name || "",
                quantity: Number(line?.quantity || 0),
                unit: line?.unit || "",
                unitPrice: Number(line?.unitPrice || 0),
                vatRate: Number(line?.vatRate || 0),
                vatAmount: Number(line?.vatAmount || 0),
                lineTotal: Number(line?.lineTotal || 0),
              }))
            : [],
        }
      : null,
  };
}

function productMatchTone(value) {
  const key = String(value || "").toLocaleUpperCase("tr-TR");
  if (["MATCHED", "MANUAL_MATCHED", "ESLESTI"].includes(key)) return "ok";
  if (["SUGGESTED", "PENDING", "BEKLIYOR"].includes(key)) return "warn";
  if (["IGNORED"].includes(key)) return "gray";
  return "bad";
}

function normalizeProductMatchLine(row = {}, index = 0) {
  return {
    id: row?.id || "",
    lineNo: row?.lineNo || row?.sira || index + 1,
    documentId: row?.documentId || row?.belgeId || "",
    documentNo: row?.documentNo || row?.belgeNo || row?.invoiceNo || "",
    documentDate: row?.documentDate || row?.tarih || row?.date || "",
    documentType: row?.documentType || row?.belgeTipi || "",
    companyId: row?.companyId || row?.firmaId || row?.supplierFirmId || "",
    companyName: row?.companyName || row?.firmaAdi || row?.firma || "",
    supplierFirmId: row?.supplierFirmId || row?.companyId || row?.firmaId || "",
    rawProductName:
      row?.rawProductName ||
      row?.hamUrunAdi ||
      row?.name ||
      row?.aciklama ||
      "",
    matchedProductName:
      row?.matchedProductName ||
      row?.eslesenUrunAdi ||
      row?.productName ||
      row?.name ||
      "",
    matchStatus:
      row?.matchStatus ||
      row?.eslesmeDurumu ||
      row?.productMatchStatus ||
      "PENDING",
    suggestedProductId: row?.suggestedProductId || "",
    suggestedProductName: row?.suggestedProductName || "",
    shortCode: row?.shortCode || "",
    groupType: row?.groupType || row?.kategori || "",
    paintType: row?.paintType || "",
    quantity: Number(row?.quantity ?? row?.miktar ?? 0),
    unit: row?.unit || row?.birim || "",
    unitPrice: Number(row?.unitPrice ?? row?.birimFiyat ?? 0),
    vatRate: Number(row?.vatRate ?? row?.kdvOrani ?? 0),
    lineTotal: Number(row?.lineTotal ?? row?.toplam ?? row?.matrah ?? 0),
    lotNo: row?.lotNo || row?.lot || "",
    productId: row?.productId || "",
  };
}

function normalizeInventoryProduct(row = {}) {
  return {
    id: row?.id,
    name: row?.name || row?.urunAdi || "",
    shortCode: row?.shortCode || row?.kisaKod || "",
    groupType: row?.groupType || row?.kategori || "GENEL",
    paintType: row?.paintType || row?.boyaTipi || "",
    defaultSupplierId: row?.defaultSupplierId || "",
    unit: row?.unit || row?.birim || "ADET",
    defaultVatRate: Number(row?.defaultVatRate ?? row?.kdvOrani ?? 0),
    note: row?.note || row?.not || "",
    isActive: row?.isActive ?? row?.aktif ?? true,
    aliases: Array.isArray(row?.aliases) ? row?.aliases : [],
  };
}

function normalizeProductAlias(row = {}) {
  return {
    id: row?.id || "",
    productId: row?.productId || row?.urunId || "",
    productName: row?.productName || row?.urunAdi || "",
    rawName: row?.rawName || row?.hamAd || row?.alias || "",
    normalizedName: row?.normalizedName || "",
    packageInfo: row?.packageInfo || row?.ambalaj || "",
    supplierFirmId: row?.supplierFirmId || row?.firmaId || "",
    isActive: row?.isActive ?? row?.aktif ?? true,
  };
}

function normalizeProductUsage(row = {}) {
  return {
    productId: row?.productId || "",
    productName: row?.productName || row?.urunAdi || "",
    shortCode: row?.shortCode || "",
    groupType: row?.groupType || row?.kategori || "",
    unit: row?.unit || row?.birim || "",
    period: row?.period || row?.ay || "",
    quantity: Number(row?.quantity ?? row?.miktar ?? 0),
    amount: Number(row?.amount ?? row?.tutar ?? 0),
    vatAmount: Number(row?.vatAmount ?? row?.kdv ?? 0),
    lineCount: Number(row?.lineCount ?? row?.kalemSayisi ?? 0),
    documentCount: Number(row?.documentCount ?? row?.belgeSayisi ?? 0),
    firmCount: Number(row?.firmCount ?? row?.firmaSayisi ?? 0),
    aliasCount: Number(row?.aliasCount ?? 0),
    stockLineCount: Number(row?.stockLineCount ?? 0),
    amountOnlyLineCount: Number(row?.amountOnlyLineCount ?? 0),
    lastDocumentDate: row?.lastDocumentDate || "",
    lastDocumentNo: row?.lastDocumentNo || "",
    lastFirmName: row?.lastFirmName || "",
  };
}

function ProductMatchTable({
  activeMainCompany,
  documentId,
  previewLines = [],
  compact = false,
  title = "Kalem Eşleştirme",
}) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyLineId, setBusyLineId] = useState("");
  const [lineSelections, setLineSelections] = useState({});
  const linesState = useEndpoint(
    documentId
      ? `/muhasebe/belgeler/${encodeURIComponent(documentId)}/kalemler`
      : null,
    activeMainCompany,
    refreshTick,
  );
  const productsState = useEndpoint(
    "/muhasebe/envanter-urunleri",
    activeMainCompany,
    refreshTick,
    { limit: 200, isActive: true },
  );
  const lines = useMemo(() => {
    if (
      Array.isArray(linesState.data?.lines) &&
      linesState.data?.lines.length
    ) {
      return linesState.data.lines.map((line, index) =>
        normalizeProductMatchLine(line, index),
      );
    }
    return (previewLines || []).map((line, index) =>
      normalizeProductMatchLine(line, index),
    );
  }, [linesState.data, previewLines]);
  const products = useMemo(
    () =>
      asArray(productsState.data).map((row) => normalizeInventoryProduct(row)),
    [productsState.data],
  );

  useEffect(() => {
    setLineSelections((prev) => {
      const next = { ...prev };
      lines.forEach((line) => {
        if (!next[line?.id]) {
          next[line.id] = line?.productId || line?.suggestedProductId || "";
        }
      });
      return next;
    });
  }, [lines]);

  const reload = () => setRefreshTick((value) => value + 1);

  const autoMatch = async () => {
    if (!documentId || busy) return;
    setBusy(true);
    try {
      await apiPost(
        `/muhasebe/belgeler/${encodeURIComponent(documentId)}/kalemleri-eslestir`,
        companyParams(activeMainCompany),
      );
      reload();
    } finally {
      setBusy(false);
    }
  };

  const bindLine = async (line, ignore = false) => {
    if (!line?.id || busyLineId) return;
    const selectedProductId = lineSelections[line?.id] || "";
    if (!ignore && !selectedProductId) return;
    setBusyLineId(line?.id);
    try {
      await apiPost(
        `/muhasebe/belge-kalemleri/${encodeURIComponent(line?.id)}/urune-bagla`,
        {
          ...companyParams(activeMainCompany),
          productId: selectedProductId,
          ignore,
          rawProductName: line?.rawProductName,
          createAlias: !ignore,
        },
      );
      reload();
    } finally {
      setBusyLineId("");
    }
  };

  const createProductAndBindLine = async (line) => {
    if (!line?.id || busyLineId) return;
    setBusyLineId(line?.id);
    try {
      await apiPost(
        `/muhasebe/belge-kalemleri/${encodeURIComponent(line?.id)}/urun-olustur-ve-bagla`,
        {
          ...companyParams(activeMainCompany),
          name: line?.rawProductName,
          rawProductName: line?.rawProductName,
          unit: line?.unit,
        },
      );
      reload();
    } finally {
      setBusyLineId("");
    }
  };

  const loading = linesState.loading && !lines.length;
  const error = linesState.error || productsState.error;

  return (
    <div className={`mh-product-match ${compact ? "compact" : ""}`}>
      <div className="mh-inline-actions mh-product-match-actions">
        <button
          className="mh-btn"
          type="button"
          onClick={autoMatch}
          disabled={!documentId || busy}
        >
          {busy ? "Eşleştiriliyor..." : "Satırları Oto Eşleştir"}
        </button>
        <button className="mh-btn" type="button" onClick={reload}>
          Yenile
        </button>
      </div>
      {loading ? (
        <div className="mh-state">Satır eşleşmeleri yükleniyor...</div>
      ) : null}
      {error ? <div className="mh-state error">{error}</div> : null}
      <DataTable
        columns={[
          "Sıra",
          "Ham Ürün",
          "Durum",
          "Eşleşen Ürün",
          "Miktar",
          "Birim",
          "Toplam",
          "Bağla",
        ]}
        rows={lines}
        emptyText={`${title} kaydı bulunamadı.`}
        renderRow={(line) => (
          <tr key={line?.id || `${line?.lineNo}-${line?.rawProductName}`}>
            <td>{line?.lineNo}</td>
            <td className="mh-cell-wrap">
              <strong>{line?.rawProductName || "-"}</strong>
              {line?.lotNo ? <small>Lot: {line?.lotNo}</small> : null}
            </td>
            <td>
              <Badge tone={productMatchTone(line?.matchStatus)}>
                {line?.matchStatus}
              </Badge>
            </td>
            <td className="mh-cell-wrap">
              <strong>{line?.matchedProductName || "-"}</strong>
              {line?.suggestedProductName ? (
                <small>Öneri: {line?.suggestedProductName}</small>
              ) : null}
              {line?.shortCode || line?.groupType ? (
                <small>
                  {[line?.shortCode, line?.groupType]
                    .filter(Boolean)
                    .join(" / ")}
                </small>
              ) : null}
            </td>
            <td>{line?.quantity}</td>
            <td>{line?.unit || "-"}</td>
            <td>{money(line?.lineTotal)}</td>
            <td>
              <div className="mh-line-match-actions">
                <select
                  value={lineSelections[line?.id] || ""}
                  onChange={(event) =>
                    setLineSelections((prev) => ({
                      ...prev,
                      [line?.id]: event?.target.value,
                    }))
                  }
                  disabled={!line?.id || busyLineId === line?.id}
                >
                  <option value="">Ürün seç</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.shortCode ? `${product.shortCode} - ` : ""}
                      {product.name}
                    </option>
                  ))}
                </select>
                <div className="mh-line-match-buttons three">
                  <button
                    className="mh-btn primary"
                    type="button"
                    disabled={
                      !line?.id ||
                      busyLineId === line?.id ||
                      !lineSelections[line?.id]
                    }
                    onClick={() => bindLine(line, false)}
                  >
                    Bağla
                  </button>
                  <button
                    className="mh-btn"
                    type="button"
                    disabled={!line?.id || busyLineId === line?.id}
                    onClick={() => createProductAndBindLine(line)}
                  >
                    Ürün Aç
                  </button>
                  <button
                    className="mh-btn"
                    type="button"
                    disabled={!line?.id || busyLineId === line?.id}
                    onClick={() => bindLine(line, true)}
                  >
                    Yok Say
                  </button>
                </div>
              </div>
            </td>
          </tr>
        )}
      />
    </div>
  );
}

function ProductMatchingQueue({ activeMainCompany, refreshKey, reloadAll }) {
  const [activeView, setActiveView] = useState("products");
  const views = [
    ["products", "Ürünler"],
    ["aliases", "Aliaslar"],
    ["queue", "Bekleyen Kalem"],
    ["usage", "Aylık Kullanım"],
  ];
  return (
    <div className="mh-stack">
      <Card
        title="Ürün / Alias Yönetimi"
        subtitle="Ürün kartı, alias ve aylık kullanım tek ekrandan yönetilir."
      >
        <div className="mh-sub-tabs">
          {views.map(([key, label]) => (
            <button
              key={key}
              className={`mh-tab-btn ${activeView === key ? "active" : ""}`}
              type="button"
              onClick={() => setActiveView(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>
      {activeView === "usage" ? (
        <ProductUsageReport
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
        />
      ) : null}
      {activeView === "products" ? (
        <InventoryProducts
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          reloadAll={reloadAll}
        />
      ) : null}
      {activeView === "aliases" ? (
        <ProductAliasManager
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          reloadAll={reloadAll}
        />
      ) : null}
      {activeView === "queue" ? (
        <ProductQueuePanel
          activeMainCompany={activeMainCompany}
          refreshKey={refreshKey}
          reloadAll={reloadAll}
        />
      ) : null}
    </div>
  );
}

function ProductQueuePanel({ activeMainCompany, refreshKey, reloadAll }) {
  const [filters, setFilters] = useState({
    q: "",
    status: "OPEN",
    documentNo: "",
  });
  const [localRefresh, setLocalRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyLineId, setBusyLineId] = useState("");
  const [lineSelections, setLineSelections] = useState({});
  const [feedback, setFeedback] = useState("");
  const queueState = useEndpoint(
    "/muhasebe/urun-eslestirme-kuyrugu",
    activeMainCompany,
    `${refreshKey}-${localRefresh}`,
    { limit: 500, ...filters },
  );
  const productsState = useEndpoint(
    "/muhasebe/envanter-urunleri",
    activeMainCompany,
    `${refreshKey}-${localRefresh}`,
    { limit: 500, isActive: true },
  );
  const rows = asArray(queueState.data).map((row, index) =>
    normalizeProductMatchLine(row, index),
  );
  const products = asArray(productsState.data).map((row) =>
    normalizeInventoryProduct(row),
  );
  const summary = rows.reduce(
    (acc, row) => {
      const status = String(row?.matchStatus || "").toLocaleUpperCase("tr-TR");
      if (["MATCHED", "MANUAL_MATCHED", "ESLESTI"].includes(status))
        acc.matched += 1;
      else if (status === "SUGGESTED") acc.suggested += 1;
      else if (status === "IGNORED") acc.ignored += 1;
      else acc.open += 1;
      return acc;
    },
    { open: 0, suggested: 0, matched: 0, ignored: 0 },
  );

  useEffect(() => {
    setLineSelections((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        if (!next[row?.id])
          next[row.id] = row?.productId || row?.suggestedProductId || "";
      });
      return next;
    });
  }, [queueState.data, rows]);

  const reload = () => {
    setLocalRefresh((value) => value + 1);
    reloadAll?.();
  };

  const bindLine = async (line) => {
    const productId = lineSelections[line?.id] || "";
    if (!line?.id || !productId || busyLineId) return;
    setBusyLineId(line?.id);
    setFeedback("");
    try {
      await apiPost(
        `/muhasebe/belge-kalemleri/${encodeURIComponent(line?.id)}/urune-bagla`,
        {
          ...companyParams(activeMainCompany),
          productId,
          rawProductName: line?.rawProductName,
          createAlias: true,
        },
      );
      setFeedback("Satır ürüne bağlandı ve alias kaydedildi.");
      reload();
    } catch (error) {
      setFeedback(error?.message || "Satır bağlanamadı.");
    } finally {
      setBusyLineId("");
    }
  };

  const createProductAndBind = async (line) => {
    if (!line?.id || busyLineId) return;
    setBusyLineId(line?.id);
    setFeedback("");
    try {
      await apiPost(
        `/muhasebe/belge-kalemleri/${encodeURIComponent(line?.id)}/urun-olustur-ve-bagla`,
        {
          ...companyParams(activeMainCompany),
          name: line?.rawProductName,
          rawProductName: line?.rawProductName,
          unit: line?.unit,
          defaultVatRate: line?.vatRate,
        },
      );
      setFeedback("Ürün kartı açıldı, satır bağlandı ve alias kaydedildi.");
      reload();
    } catch (error) {
      setFeedback(error?.message || "Ürün açılamadı.");
    } finally {
      setBusyLineId("");
    }
  };

  const ignoreLine = async (line) => {
    if (!line?.id || busyLineId) return;
    setBusyLineId(line?.id);
    setFeedback("");
    try {
      await apiPost(
        `/muhasebe/belge-kalemleri/${encodeURIComponent(line?.id)}/urune-bagla`,
        {
          ...companyParams(activeMainCompany),
          ignore: true,
          rawProductName: line?.rawProductName,
        },
      );
      setFeedback("Satır yok sayıldı.");
      reload();
    } catch (error) {
      setFeedback(error?.message || "Satır yok sayılamadı.");
    } finally {
      setBusyLineId("");
    }
  };

  const processAll = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await apiPost("/muhasebe/urun-eslestirme/toplu-isle", {
        ...companyParams(activeMainCompany),
        mode: "CREATE_MISSING",
        limit: 1000,
      });
      const data = unwrap(response) || {};
      setFeedback(
        `${data?.processedCount || 0} kalem işlendi, ${data?.documentCount || 0} belge stok hareketi güncellendi.`,
      );
      reload();
    } catch (error) {
      setFeedback(error?.message || "Toplu işlem çalışmadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mh-stack">
      <Card
        title="Ürün Eşleştirme Kuyruğu"
        subtitle="Fatura kalemlerini ürün kartlarına bağlar ve alias oluşturur."
        action={
          <button
            className="mh-btn primary"
            type="button"
            onClick={processAll}
            disabled={busy}
          >
            {busy ? "İşleniyor..." : "Mevcut Verileri İşle"}
          </button>
        }
      >
        <div className="mh-summary-grid four compact-cards">
          <CariSummaryMetric
            label="Açık"
            value={String(summary.open)}
            tone="red"
          />
          <CariSummaryMetric
            label="Öneri"
            value={String(summary.suggested)}
            tone="yellow"
          />
          <CariSummaryMetric
            label="Eşleşen"
            value={String(summary.matched)}
            tone="green"
          />
          <CariSummaryMetric
            label="Yok Sayılan"
            value={String(summary.ignored)}
          />
        </div>
        {feedback ? <div className="mh-state">{feedback}</div> : null}
        <div className="mh-form-grid four">
          <Field label="Ara">
            <input
              value={filters.q}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, q: event?.target.value }))
              }
            />
          </Field>
          <Field label="Belge No">
            <input
              value={filters.documentNo}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  documentNo: event?.target.value,
                }))
              }
            />
          </Field>
          <Field label="Durum">
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event?.target.value }))
              }
            >
              <option value="OPEN">Açık</option>
              <option value="NEW_DRAFT">Yeni taslak</option>
              <option value="SUGGESTED">Önerili</option>
              <option value="MATCHED">Eşleşmiş</option>
              <option value="IGNORED">Yok sayılan</option>
              <option value="ALL">Tümü</option>
            </select>
          </Field>
          <Field label="İşlem">
            <button className="mh-btn" type="button" onClick={reload}>
              Yenile
            </button>
          </Field>
        </div>
        <StatusBlock state={queueState} emptyText="Eşleştirilecek kalem yok." />
        <DataTable
          columns={[
            "Belge",
            "Firma",
            "Ham Ürün",
            "Durum",
            "Miktar",
            "Tutar",
            "Eşleştir",
          ]}
          rows={rows}
          emptyText="Eşleştirilecek kalem yok."
          renderRow={(line) => (
            <tr key={line?.id}>
              <td className="mh-cell-wrap">
                <strong>{line?.documentNo || "-"}</strong>
                <small>{date(line?.documentDate)}</small>
              </td>
              <td className="mh-cell-wrap">{line?.companyName || "-"}</td>
              <td className="mh-cell-wrap">
                <strong>{line?.rawProductName || "-"}</strong>
                {line?.suggestedProductName ? (
                  <small>Öneri: {line?.suggestedProductName}</small>
                ) : null}
              </td>
              <td>
                <Badge tone={productMatchTone(line?.matchStatus)}>
                  {line?.matchStatus}
                </Badge>
              </td>
              <td>
                {line?.quantity} {line?.unit}
              </td>
              <td>{money(line?.lineTotal)}</td>
              <td>
                <div className="mh-line-match-actions">
                  <select
                    value={lineSelections[line?.id] || ""}
                    onChange={(event) =>
                      setLineSelections((prev) => ({
                        ...prev,
                        [line?.id]: event?.target.value,
                      }))
                    }
                    disabled={busyLineId === line?.id}
                  >
                    <option value="">Ürün seç</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.shortCode ? `${product.shortCode} - ` : ""}
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <div className="mh-line-match-buttons three">
                    <button
                      className="mh-btn primary"
                      type="button"
                      disabled={
                        !lineSelections[line.id] || busyLineId === line?.id
                      }
                      onClick={() => bindLine(line)}
                    >
                      Bağla
                    </button>
                    <button
                      className="mh-btn"
                      type="button"
                      disabled={busyLineId === line?.id}
                      onClick={() => createProductAndBind(line)}
                    >
                      Ürün Aç
                    </button>
                    <button
                      className="mh-btn"
                      type="button"
                      disabled={busyLineId === line?.id}
                      onClick={() => ignoreLine(line)}
                    >
                      Yok Say
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          )}
        />
      </Card>
    </div>
  );
}

function ProductAliasManager({ activeMainCompany, refreshKey, reloadAll }) {
  const [filters, setFilters] = useState({
    q: "",
    productId: "",
    supplierFirmId: "",
    isActive: "true",
  });
  const [form, setForm] = useState({
    productId: "",
    rawName: "",
    packageInfo: "",
    supplierFirmId: "",
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [localRefresh, setLocalRefresh] = useState(0);
  const aliasState = useEndpoint(
    "/muhasebe/urun-eslesmeleri",
    activeMainCompany,
    `${refreshKey}-${localRefresh}`,
    { limit: 500, ...filters },
  );
  const productState = useEndpoint(
    "/muhasebe/envanter-urunleri",
    activeMainCompany,
    `${refreshKey}-${localRefresh}`,
    { limit: 500, isActive: true },
  );
  const aliases = asArray(aliasState.data).map(normalizeProductAlias);
  const products = asArray(productState.data).map(normalizeInventoryProduct);

  const saveAlias = async () => {
    if (!form.productId || !form.rawName.trim() || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      await apiPost("/muhasebe/urun-eslesmeleri", {
        ...companyParams(activeMainCompany),
        ...form,
      });
      setForm({
        productId: form.productId,
        rawName: "",
        packageInfo: "",
        supplierFirmId: "",
      });
      setFeedback("Alias kaydedildi.");
      setLocalRefresh((value) => value + 1);
      reloadAll?.();
    } catch (error) {
      setFeedback(error?.message || "Alias kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mh-layout-2 mh-product-admin-layout">
      <Card
        title="Alias Listesi"
        subtitle="Ham fatura ürün adlarını merkezi ürün kartına bağlar."
      >
        <div className="mh-form-grid four">
          <Field label="Ara">
            <input
              value={filters.q}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, q: event?.target.value }))
              }
            />
          </Field>
          <Field label="Ürün">
            <select
              value={filters.productId}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  productId: event?.target.value,
                }))
              }
            >
              <option value="">Tümü</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tedarikçi ID">
            <input
              value={filters.supplierFirmId}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  supplierFirmId: event?.target.value,
                }))
              }
            />
          </Field>
          <Field label="Durum">
            <select
              value={filters.isActive}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  isActive: event?.target.value,
                }))
              }
            >
              <option value="true">Aktif</option>
              <option value="false">Pasif</option>
            </select>
          </Field>
        </div>
        <StatusBlock state={aliasState} emptyText="Alias bulunamadı." />
        <DataTable
          columns={["Ham Ad", "Ürün", "Ambalaj", "Tedarikçi", "Durum"]}
          rows={aliases}
          emptyText="Alias bulunamadı."
          renderRow={(alias) => (
            <tr key={alias.id}>
              <td className="mh-cell-wrap">
                <strong>{alias.rawName || "-"}</strong>
                <small>{alias.normalizedName}</small>
              </td>
              <td>{alias.productName || "-"}</td>
              <td>{alias.packageInfo || "-"}</td>
              <td>{alias.supplierFirmId || "-"}</td>
              <td>
                <Badge tone={alias.isActive ? "ok" : "gray"}>
                  {alias.isActive ? "AKTIF" : "PASIF"}
                </Badge>
              </td>
            </tr>
          )}
        />
      </Card>
      <Card title="Alias Ekle" subtitle="Yeni ham adı seçili ürüne bağlar.">
        {feedback ? <div className="mh-state">{feedback}</div> : null}
        <div className="mh-action-stack">
          <Field label="Ürün">
            <select
              value={form.productId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, productId: event?.target.value }))
              }
            >
              <option value="">Ürün seç</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ham Ürün Adı">
            <input
              value={form.rawName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, rawName: event?.target.value }))
              }
            />
          </Field>
          <Field label="Ambalaj">
            <input
              value={form.packageInfo}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  packageInfo: event?.target.value,
                }))
              }
            />
          </Field>
          <Field label="Tedarikçi Firma ID">
            <input
              value={form.supplierFirmId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  supplierFirmId: event?.target.value,
                }))
              }
            />
          </Field>
          <button
            className="mh-btn primary"
            type="button"
            onClick={saveAlias}
            disabled={busy || !form.productId || !form.rawName.trim()}
          >
            {busy ? "Kaydediliyor..." : "Alias Kaydet"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function ProductUsageReport({ activeMainCompany, refreshKey }) {
  const currentMonth = useMemo(() => monthRange(0), []);
  const [filters, setFilters] = useState({
    q: "",
    productId: "",
    groupType: "",
    documentNo: "",
    dateFrom: currentMonth.dateFrom,
    dateTo: currentMonth.dateTo,
  });
  const [localRefresh, setLocalRefresh] = useState(0);
  const productState = useEndpoint(
    "/muhasebe/envanter-urunleri",
    activeMainCompany,
    refreshKey,
    { limit: 500, isActive: true },
  );
  const usageState = useEndpoint(
    "/muhasebe/urun-kullanimlari",
    activeMainCompany,
    `${refreshKey}-${localRefresh}`,
    { limit: 500, ...filters },
  );
  const products = asArray(productState.data).map(normalizeInventoryProduct);
  const rows = asArray(usageState.data).map(normalizeProductUsage);
  const totals = rows.reduce(
    (acc, row) => {
      acc.quantity += row?.quantity;
      acc.amount += row?.amount;
      acc.vatAmount += row?.vatAmount;
      acc.lines += row?.lineCount;
      acc.amountOnly += row?.amountOnlyLineCount;
      return acc;
    },
    { quantity: 0, amount: 0, vatAmount: 0, lines: 0, amountOnly: 0 },
  );
  const setRange = (range) => {
    const next = monthRange(range);
    setFilters((prev) => ({ ...prev, ...next }));
  };

  return (
    <Card
      title="Ürün Aylık Kullanım"
      subtitle="Stok hareketi olmayan tutar bazlı hizmet/bedel satırları da bu rapora dahildir."
    >
      <div className="mh-summary-grid four compact-cards">
        <CariSummaryMetric label="Kalem" value={String(totals.lines)} />
        <CariSummaryMetric
          label="Miktar"
          value={totals.quantity.toLocaleString("tr-TR", {
            maximumFractionDigits: 2,
          })}
          tone="green"
        />
        <CariSummaryMetric
          label="Tutar"
          value={money(totals.amount)}
          tone="yellow"
        />
        <CariSummaryMetric
          label="Miktarsız"
          value={String(totals.amountOnly)}
          tone="red"
        />
      </div>
      <div className="mh-cari-quick-row">
        <button className="mh-btn" type="button" onClick={() => setRange(0)}>
          Bu Ay
        </button>
        <button className="mh-btn" type="button" onClick={() => setRange(-1)}>
          Geçen Ay
        </button>
        <button
          className="mh-btn"
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              dateFrom: isoDate(new Date(new Date().getFullYear(), 0, 1)),
              dateTo: isoDate(new Date()),
            }))
          }
        >
          Bu Yıl
        </button>
        <button
          className="mh-btn"
          type="button"
          onClick={() =>
            setFilters((prev) => ({ ...prev, dateFrom: "", dateTo: "" }))
          }
        >
          Tümü
        </button>
        <button
          className="mh-btn"
          type="button"
          onClick={() => setLocalRefresh((v) => v + 1)}
        >
          Yenile
        </button>
      </div>
      <div className="mh-form-grid six mh-product-filter-grid">
        <Field label="Bağlangıç">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, dateFrom: event?.target.value }))
            }
          />
        </Field>
        <Field label="Bitiş">
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, dateTo: event?.target.value }))
            }
          />
        </Field>
        <Field label="Ürün">
          <select
            value={filters.productId}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                productId: event?.target.value,
              }))
            }
          >
            <option value="">Tümü</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Grup">
          <input
            value={filters.groupType}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                groupType: event?.target.value,
              }))
            }
          />
        </Field>
        <Field label="Belge No">
          <input
            value={filters.documentNo}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                documentNo: event?.target.value,
              }))
            }
          />
        </Field>
        <Field label="Ara">
          <input
            value={filters.q}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, q: event?.target.value }))
            }
          />
        </Field>
      </div>
      <StatusBlock state={usageState} emptyText="Kullanım kaydı bulunamadı." />
      <DataTable
        columns={[
          "Ay",
          "Ürün",
          "Grup",
          "Miktar",
          "Tutar",
          "KDV",
          "Belge",
          "Alias",
          "Son Belge",
        ]}
        rows={rows}
        emptyText="Kullanım kaydı bulunamadı."
        renderRow={(row) => (
          <tr key={`${row?.productId}-${row?.period}`}>
            <td>{row?.period || "-"}</td>
            <td className="mh-cell-wrap">
              <strong>{row?.productName || "-"}</strong>
              <small>{row?.shortCode || row?.unit || "-"}</small>
            </td>
            <td>{row?.groupType || "-"}</td>
            <td>
              {row?.quantity.toLocaleString("tr-TR", {
                maximumFractionDigits: 2,
              })}{" "}
              {row?.unit}
              {row?.amountOnlyLineCount ? (
                <small className="mh-inline-note">
                  miktarsız: {row?.amountOnlyLineCount}
                </small>
              ) : null}
            </td>
            <td>{money(row?.amount)}</td>
            <td>{money(row?.vatAmount)}</td>
            <td>{row?.documentCount}</td>
            <td>{row?.aliasCount}</td>
            <td className="mh-cell-wrap">
              <strong>{row?.lastDocumentNo || "-"}</strong>
              <small>
                {[row?.lastFirmName, date(row?.lastDocumentDate)]
                  .filter(Boolean)
                  .join(" / ")}
              </small>
            </td>
          </tr>
        )}
      />
    </Card>
  );
}

function InventoryProducts({ activeMainCompany, refreshKey, reloadAll }) {
  const [filters, setFilters] = useState({
    q: "",
    groupType: "",
    paintType: "",
    isActive: "true",
  });
  const [selectedId, setSelectedId] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [aliasBusy, setAliasBusy] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [form, setForm] = useState({
    name: "",
    shortCode: "",
    groupType: "GENEL",
    paintType: "",
    unit: "KG",
    defaultVatRate: 20,
    defaultSupplierId: "",
    note: "",
  });
  const [aliasForm, setAliasForm] = useState({
    rawName: "",
    packageInfo: "",
    supplierFirmId: "",
  });
  const productState = useEndpoint(
    "/muhasebe/envanter-urunleri",
    activeMainCompany,
    `${refreshKey}-${localRefresh}`,
    { limit: 200, ...filters },
  );
  const products = useMemo(
    () =>
      asArray(productState.data).map((row) => normalizeInventoryProduct(row)),
    [productState.data],
  );
  const selectedProduct =
    products.find((item) => item.id === selectedId) || products[0] || null;

  useEffect(() => {
    if (!products.length) {
      setSelectedId("");
      return;
    }
    setSelectedId((prev) =>
      prev && products.some((item) => item.id === prev) ? prev : products[0].id,
    );
  }, [products]);

  useEffect(() => {
    if (!selectedProduct) {
      setForm({
        name: "",
        shortCode: "",
        groupType: "GENEL",
        paintType: "",
        unit: "KG",
        defaultVatRate: 20,
        defaultSupplierId: "",
        note: "",
      });
      return;
    }
    setForm({
      name: selectedProduct.name || "",
      shortCode: selectedProduct.shortCode || "",
      groupType: selectedProduct.groupType || "GENEL",
      paintType: selectedProduct.paintType || "",
      unit: selectedProduct.unit || "KG",
      defaultVatRate: selectedProduct.defaultVatRate || 20,
      defaultSupplierId: selectedProduct.defaultSupplierId || "",
      note: selectedProduct.note || "",
    });
  }, [selectedProduct]);

  const reload = () => {
    setLocalRefresh((value) => value + 1);
    reloadAll?.();
  };

  const saveProduct = async () => {
    setSaveBusy(true);
    try {
      const payload = {
        ...companyParams(activeMainCompany),
        ...form,
      };
      if (selectedProduct?.id) {
        await apiPatch(
          `/muhasebe/envanter-urunleri/${encodeURIComponent(selectedProduct?.id)}`,
          payload,
        );
      } else {
        await apiPost("/muhasebe/envanter-urunleri", payload);
      }
      reload();
    } finally {
      setSaveBusy(false);
    }
  };

  const saveAlias = async () => {
    if (!selectedProduct?.id || !aliasForm.rawName) return;
    setAliasBusy(true);
    try {
      await apiPost("/muhasebe/urun-eslesmeleri", {
        ...companyParams(activeMainCompany),
        productId: selectedProduct?.id,
        ...aliasForm,
      });
      setAliasForm({ rawName: "", packageInfo: "", supplierFirmId: "" });
      reload();
    } finally {
      setAliasBusy(false);
    }
  };

  return (
    <div className="mh-layout-2 mh-inventory-layout">
      <Card
        title="Envanter Ürünleri"
        subtitle="Merkezi ürün kartları ve alias eşleşmeleri."
        action={
          <button
            className="mh-btn"
            type="button"
            onClick={() => {
              setSelectedId("");
              setForm({
                name: "",
                shortCode: "",
                groupType: "GENEL",
                paintType: "",
                unit: "KG",
                defaultVatRate: 20,
                defaultSupplierId: "",
                note: "",
              });
            }}
          >
            Yeni Ürün
          </button>
        }
      >
        <div className="mh-form-grid four">
          <Field label="Ara">
            <input
              value={filters.q}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, q: event?.target.value }))
              }
            />
          </Field>
          <Field label="Grup">
            <input
              value={filters.groupType}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  groupType: event?.target.value,
                }))
              }
            />
          </Field>
          <Field label="Boya Tipi">
            <input
              value={filters.paintType}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  paintType: event?.target.value,
                }))
              }
            />
          </Field>
          <Field label="Durum">
            <select
              value={filters.isActive}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  isActive: event?.target.value,
                }))
              }
            >
              <option value="true">Aktif</option>
              <option value="false">Pasif</option>
            </select>
          </Field>
        </div>
        <DataTable
          columns={["Ürün", "Kod", "Grup", "Birim", "KDV", "Alias"]}
          rows={products}
          emptyText="Ürün bulunamadı."
          renderRow={(product) => (
            <tr
              key={product.id}
              className={selectedId === product.id ? "mh-row-active" : ""}
              onClick={() => setSelectedId(product.id)}
            >
              <td>{product.name}</td>
              <td>{product.shortCode || "-"}</td>
              <td>{product.groupType || "-"}</td>
              <td>{product.unit || "-"}</td>
              <td>{product.defaultVatRate}</td>
              <td>{product.aliases.length}</td>
            </tr>
          )}
        />
      </Card>

      <div>
        <Card
          title={selectedProduct?.id ? "Ürün Kartı" : "Yeni Ürün Kartı"}
          subtitle="Muhasebe, belge kontrol ve stok hareketleri için ortak ürün tanımı."
        >
          <div className="mh-form-grid four">
            <Field label="Ürün Adı">
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event?.target.value }))
                }
              />
            </Field>
            <Field label="Kısa Kod">
              <input
                value={form.shortCode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    shortCode: event?.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Grup">
              <input
                value={form.groupType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    groupType: event?.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Boya Tipi">
              <input
                value={form.paintType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    paintType: event?.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Birim">
              <input
                value={form.unit}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, unit: event?.target.value }))
                }
              />
            </Field>
            <Field label="Varsayılan KDV">
              <input
                type="number"
                value={form.defaultVatRate}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    defaultVatRate: Number(event?.target.value || 0),
                  }))
                }
              />
            </Field>
            <Field label="Varsayılan Tedarikçi ID">
              <input
                value={form.defaultSupplierId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    defaultSupplierId: event?.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Not">
              <input
                value={form.note}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, note: event?.target.value }))
                }
              />
            </Field>
          </div>
          <div className="mh-button-row">
            <button
              className="mh-btn primary"
              type="button"
              onClick={saveProduct}
              disabled={saveBusy || !form.name.trim()}
            >
              {saveBusy
                ? "Kaydediliyor..."
                : selectedProduct?.id
                  ? "Güncelle"
                  : "Yeni Kayıt"}
            </button>
          </div>
        </Card>

        <Card
          title="Ürün Aliasları"
          subtitle="Fatura satırlarındaki ham isimleri merkezi ürüne bağlar."
        >
          {selectedProduct ? (
            <>
              <div className="mh-form-grid three">
                <Field label="Ham Ürün Adı">
                  <input
                    value={aliasForm.rawName}
                    onChange={(event) =>
                      setAliasForm((prev) => ({
                        ...prev,
                        rawName: event?.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Ambalaj">
                  <input
                    value={aliasForm.packageInfo}
                    onChange={(event) =>
                      setAliasForm((prev) => ({
                        ...prev,
                        packageInfo: event?.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Tedarikçi Firma ID">
                  <input
                    value={aliasForm.supplierFirmId}
                    onChange={(event) =>
                      setAliasForm((prev) => ({
                        ...prev,
                        supplierFirmId: event?.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="mh-button-row">
                <button
                  className="mh-btn"
                  type="button"
                  onClick={saveAlias}
                  disabled={aliasBusy || !aliasForm.rawName.trim()}
                >
                  {aliasBusy ? "Kaydediliyor..." : "Alias Ekle"}
                </button>
              </div>
              <DataTable
                columns={["Ham Ad", "Ambalaj", "Tedarikçi", "Durum"]}
                rows={selectedProduct.aliases}
                emptyText="Alias yok."
                renderRow={(alias) => (
                  <tr key={alias.id}>
                    <td>{alias.rawName}</td>
                    <td>{alias.packageInfo || "-"}</td>
                    <td>{alias.supplierFirmId || "-"}</td>
                    <td>
                      <Badge tone={alias.isActive ? "ok" : "gray"}>
                        {alias.isActive ? "AKTIF" : "PASIF"}
                      </Badge>
                    </td>
                  </tr>
                )}
              />
            </>
          ) : (
            <div className="mh-state">
              Alias eklemek için soldan bir ürün seçin.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function CariSummaryMetric({ label, value, tone = "blue", hint = "" }) {
  return (
    <div className={`mh-summary ${tone} mh-cari-summary-card`}>
      <span>{label}</span>
      <b>{value}</b>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function CariMovements({ activeMainCompany, refreshKey, reloadAll }) {
  const [firmFilters, setFirmFilters] = useState({
    search: "",
    firmType: "",
    officialType: "",
    active: "active",
    balanceType: "",
    sort: "BALANCE_ABS_DESC",
    includeNonTrackable: false,
  });
  const [movementFilters, setMovementFilters] = useState({
    dateFrom: "",
    dateTo: "",
    documentNo: "",
    description: "",
    amountMin: "",
    amountMax: "",
    direction: "",
    officialType: "",
    status: "",
    overdueOnly: false,
  });
  const [selectedFirmaId, setSelectedFirmaId] = useState("");
  const [selectedMovementId, setSelectedMovementId] = useState("");
  const [editingMovementId, setEditingMovementId] = useState("");
  const [activeRightTab, setActiveRightTab] = useState("movement");
  const [feedback, setFeedback] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [form, setForm] = useState(emptyMovementForm());
  const creditCardsState = useEndpoint(
    "/muhasebe/kredi-kartlari",
    activeMainCompany,
    refreshKey,
    { limit: 200 },
  );
  const creditCards = asArray(creditCardsState.data);

  const companyState = useEndpoint(
    "/muhasebe/firmalar",
    activeMainCompany,
    refreshKey,
    {
      q: firmFilters.search || undefined,
      type: firmFilters.firmType || undefined,
      officialType: firmFilters.officialType || undefined,
      active: firmFilters.active,
      balanceType: firmFilters.balanceType || undefined,
      limit: 500,
      sort: firmFilters.sort || "BALANCE_ABS_DESC",
    },
  );
  const companies = asArray(companyState.data)
    .map(normalizeFirm)
    .filter((row) =>
      firmFilters.includeNonTrackable
        ? true
        : row?.trackReceivablePayable !== false && row?.cariTakipDisi !== true,
    );

  useEffect(() => {
    if (!companies.length) {
      setSelectedFirmaId("");
      return;
    }
    if (
      !selectedFirmaId ||
      !companies.some((row) => row.id === selectedFirmaId)
    ) {
      setSelectedFirmaId(companies[0].id);
    }
  }, [companies, selectedFirmaId]);

  const selectedCompany =
    companies.find((row) => row.id === (selectedFirmaId || companies[0].id)) ||
    companies[0] ||
    null;

  const movementsState = useEndpoint(
    selectedCompany?.id ? "/muhasebe/cari-hareketler" : null,
    activeMainCompany,
    refreshKey,
    {
      firmId: selectedCompany?.id,
      ...movementFilters,
      includeNonTrackable: firmFilters.includeNonTrackable ? "true" : undefined,
    },
  );
  const rows = asArray(movementsState.data).map(normalizeMovement);

  const summaryState = useEndpoint(
    selectedCompany?.id
      ? `/muhasebe/firmalar/${encodeURIComponent(selectedCompany?.id)}/cari-ozet`
      : null,
    activeMainCompany,
    refreshKey,
    movementFilters,
  );
  const summary = unwrap(summaryState.data) || selectedCompany || {};
  const periodFiltered = Boolean(movementFilters.dateFrom || movementFilters.dateTo);

  const movementDetailState = useEndpoint(
    selectedMovementId
      ? `/muhasebe/cari-hareketler/${encodeURIComponent(selectedMovementId)}`
      : null,
    activeMainCompany,
    refreshKey,
  );
  const selectedMovement = movementDetailState.data
    ? normalizeMovement(unwrap(movementDetailState.data))
    : rows.find((row) => row.id === selectedMovementId) || null;
  const documentDetailState = useEndpoint(
    selectedMovementId
      ? `/muhasebe/cari-hareketler/${encodeURIComponent(selectedMovementId)}/belge-detay`
      : null,
    activeMainCompany,
    refreshKey,
  );
  const documentDetail = normalizeCariDocumentDetail(
    unwrap(documentDetailState.data) || {},
  );
  const invoiceDetail = documentDetail.document || {};
  const isCreateMode = activeRightTab === "new";
  const isEditingMovement = isCreateMode && Boolean(editingMovementId) && selectedMovement?.id === editingMovementId;
  const currentBalance = Number(
    summary.guncelBakiye ??
      summary.mevcutBakiye ??
      selectedCompany?.mevcutBakiye ??
      0,
  );
  const selectedIsNonTrackable =
    selectedCompany?.cariTakipDisi ||
    selectedCompany?.trackReceivablePayable === false;
  const currentBalanceTone = selectedIsNonTrackable
    ? "gray"
    : currentBalance > 0
      ? "red"
      : currentBalance < 0
        ? "green"
        : "blue";
  const currentBalanceHint = selectedIsNonTrackable
    ? "Cari takip dışı"
    : currentBalance > 0
      ? "BORÇLU"
      : currentBalance < 0
        ? "ALACAKLI"
        : "SIFIR";
  const previewAmount = Math.round(parseDecimalInput(form.tutar) * 100) / 100;
  const previewEffect = movementPreviewEffect(form.islemTipi, previewAmount);
  const previewBalance = currentBalance + previewEffect;

  useEffect(() => {
    if (isCreateMode && !isEditingMovement) {
      return;
    }
    if (selectedMovement) {
      setForm({
        islemTipi: selectedMovement.movementType || (selectedMovement.alacak > 0 ? "ALACAK" : "BORC"),
        tutar: decimalInputValue(
          selectedMovement.tutar ||
            selectedMovement.borc ||
            selectedMovement.alacak,
        ),
        tarih:
          String(selectedMovement.tarih || "").slice(0, 10) ||
          new Date().toISOString().slice(0, 10),
        vade: String(selectedMovement.vade || "").slice(0, 10),
        belgeNo: selectedMovement.belgeNo || "",
        resmiGayri:
          selectedMovement.resmiGayri || selectedCompany?.resmiGayri || "RESMI",
        aciklama: selectedMovement.aciklama || "",
      });
      return;
    }
    setForm(emptyMovementForm(selectedCompany?.resmiGayri || "RESMI"));
  }, [isCreateMode, selectedMovementId, selectedMovement?.id, selectedCompany?.id, isEditingMovement, selectedMovement, selectedCompany?.resmiGayri]);

  const clearMovementFilters = () => {
    setMovementFilters({
      dateFrom: "",
      dateTo: "",
      documentNo: "",
      description: "",
      amountMin: "",
      amountMax: "",
      direction: "",
      officialType: "",
      status: "",
      overdueOnly: false,
    });
  };

  const setQuickMovementPeriod = (mode) => {
    if (mode === "ALL") return setMovementFilters((current) => ({ ...current, dateFrom: "", dateTo: "" }));
    const today = new Date();
    if (mode === "LAST_6_MONTHS") {
      const first = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      const iso = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
      return setMovementFilters((current) => ({ ...current, dateFrom: iso(first), dateTo: iso(today) }));
    }
    const offset = mode === "PREVIOUS_MONTH" ? -1 : 0;
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    const iso = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    setMovementFilters((current) => ({ ...current, dateFrom: iso(first), dateTo: iso(last) }));
  };

  const resetForm = (movementType = "") => {
    const recommendedType = selectedCompany?.firmaTipi === "MUSTERI" ? "SATIS" : "GELEN_FATURA";
    setSelectedMovementId("");
    setEditingMovementId("");
    setActiveRightTab("new");
    setFeedback("");
    setForm({
      ...emptyMovementForm(selectedCompany?.resmiGayri || "RESMI"),
      islemTipi: movementType || recommendedType,
    });
  };

  const submit = async (event) => {
    event?.preventDefault();
    if (!selectedCompany?.id || saveBusy) return;
    setFeedback("");
    const amount = Math.round(parseDecimalInput(form.tutar) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback("Tutar 0'dan büyük olmalı.");
      return;
    }
    setSaveBusy(true);
    const payload = {
      ...companyParams(activeMainCompany),
      ...form,
      tutar: amount,
      aciklama:
        String(form.aciklama || "").trim() ||
        `${selectedCompany?.firmaAdi} ${form.islemTipi} kaydı`,
      firmId: selectedCompany?.id,
      firmaId: selectedCompany?.id,
      companyId: selectedCompany?.id,
    };
    try {
      const shouldCreate = !isEditingMovement || !selectedMovement?.id;
      let response;
      let savedMovementId = "";
      if (["CEK_GIRISI", "CEK_TAHSILATI", "CEK_ODEMESI"].includes(form.islemTipi)) {
        response = await apiPost("/muhasebe/cekler", {
          ...payload,
          checkType: form.islemTipi === "CEK_ODEMESI" ? "TEDARIKCIYE_VERILEN" : "MUSTERIDEN_ALINAN",
          yon: form.islemTipi === "CEK_ODEMESI" ? "OUT" : "IN",
          checkNo: form.belgeNo,
          dueDate: form.vade || form.tarih,
          vadeTarihi: form.vade || form.tarih,
          kesideTarihi: form.tarih,
          banka: form.bankName,
          sube: form.branchName,
          kesideci: form.drawerName,
          hesapNo: form.accountNo,
          durum: "PORTFOYDE",
        });
        const savedCheck = unwrap(response) || {};
        savedMovementId = savedCheck.currentAccountMovementId || "";
        if (savedCheck.id && form.frontImageFile) {
          const formData = new FormData();
          formData.append("file", form.frontImageFile);
          formData.append(
            "mainCompanySlug",
            companyParams(activeMainCompany).mainCompanySlug || "",
          );
          await apiUpload(
            `/muhasebe/cheques/${encodeURIComponent(savedCheck.id)}/front-image`,
            formData,
          );
        }
        if (savedCheck.id && form.backImageFile) {
          const formData = new FormData();
          formData.append("file", form.backImageFile);
          formData.append(
            "mainCompanySlug",
            companyParams(activeMainCompany).mainCompanySlug || "",
          );
          await apiUpload(
            `/muhasebe/cheques/${encodeURIComponent(savedCheck.id)}/back-image`,
            formData,
          );
        }
      } else if (form.islemTipi === "KREDI_KARTI_ODEMESI") {
        response = await apiPost(
          "/muhasebe/kredi-kart-hareketleri/firma-odemesi",
          {
            ...payload,
            creditCardId: form.creditCardId,
            installmentCount: Number(form.installmentCount || 1),
            direction: "OUT",
          },
        );
        const savedCardPayment = unwrap(response) || {};
        savedMovementId = savedCardPayment.cariMovementId || "";
        const cardMovementId = savedCardPayment.creditCardMovement.id || "";
        if (cardMovementId && form.slipFile) {
          const formData = new FormData();
          formData.append("file", form.slipFile);
          formData.append(
            "mainCompanySlug",
            companyParams(activeMainCompany).mainCompanySlug || "",
          );
          await apiUpload(
            `/muhasebe/kredi-kart-hareketleri/${encodeURIComponent(cardMovementId)}/gorsel`,
            formData,
          );
        }
      } else {
        response = shouldCreate
          ? await apiPost("/muhasebe/cari-hareketler", payload)
          : await apiPatch(
              `/muhasebe/cari-hareketler/${encodeURIComponent(selectedMovement?.id)}`,
              payload,
            );
        const saved = normalizeMovement(unwrap(response) || {});
        savedMovementId = saved?.id || "";
      }
      setFeedback(
        shouldCreate ? "Cari hareket kaydedildi." : "Cari hareket güncellendi.",
      );
      if (savedMovementId) setSelectedMovementId(savedMovementId);
      setActiveRightTab("movement");
      setEditingMovementId("");
      setForm(emptyMovementForm(selectedCompany?.resmiGayri || "RESMI"));
      reloadAll();
    } catch (error) {
      setFeedback(error?.message || "Cari hareket kaydedilemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const passiveMovement = async () => {
    if (!selectedMovement?.id || selectedMovement?.manual === false) return;
    await apiPost(
      `/muhasebe/cari-hareketler/${encodeURIComponent(selectedMovement?.id)}/pasife-al`,
      companyParams(activeMainCompany),
    );
    setFeedback("Cari hareket pasife alındı.");
    resetForm();
    reloadAll();
  };

  const previewPdfUrl = invoiceDetail?.pdfUrl
    ? buildApiUrl(invoiceDetail?.pdfUrl)
    : "";
  const previewXmlUrl = invoiceDetail?.xmlUrl
    ? buildApiUrl(invoiceDetail?.xmlUrl)
    : "";

  return (
    <div className="mh-layout-3 compact mh-cari-layout">
      <Card title="Firma Listesi">
        <div className="mh-action-stack mh-cari-firm-list">
          <input
            placeholder="Firma adı / kısa ad / vergi no / telefon / mail"
            value={firmFilters.search}
            onChange={(event) =>
              setFirmFilters({ ...firmFilters, search: event?.target.value })
            }
          />
          <div className="mh-inline-actions mh-list-sort-actions">
            <button
              className={`mh-btn ${firmFilters.sort === "BALANCE_ABS_ASC" ? "primary" : ""}`}
              type="button"
              title="Bakiyeye göre azdan çoğa sırala"
              aria-label="Bakiyeye göre azdan çoğa sırala"
              onClick={() =>
                setFirmFilters((prev) => ({
                  ...prev,
                  sort: "BALANCE_ABS_ASC",
                }))
              }
            >
              <span className="mh-sort-icon asc" aria-hidden="true" />
            </button>
            <button
              className={`mh-btn ${firmFilters.sort === "BALANCE_ABS_DESC" ? "primary" : ""}`}
              type="button"
              title="Bakiyeye göre çoktan aza sırala"
              aria-label="Bakiyeye göre çoktan aza sırala"
              onClick={() =>
                setFirmFilters((prev) => ({
                  ...prev,
                  sort: "BALANCE_ABS_DESC",
                }))
              }
            >
              <span className="mh-sort-icon desc" aria-hidden="true" />
            </button>
          </div>
          <div className="mh-form-grid two mh-list-filter-grid">
            <select
              value={firmFilters.firmType}
              onChange={(event) =>
                setFirmFilters({
                  ...firmFilters,
                  firmType: event?.target.value,
                })
              }
            >
              <option value="">Müşteri / satıcı</option>
              <option value="MUSTERI">Müşteri</option>
              <option value="SATICI">Satıcı</option>
              <option value="BOTH">İkisi</option>
            </select>
            <select
              value={firmFilters.officialType}
              onChange={(event) =>
                setFirmFilters({
                  ...firmFilters,
                  officialType: event?.target.value,
                })
              }
            >
              <option value="">Resmi / gayri</option>
              <option value="RESMI">Resmi</option>
              <option value="GAYRI">Gayri</option>
              <option value="BOTH">İkisi</option>
            </select>
          </div>
        </div>
        <StatusBlock state={companyState} emptyText="Cari firma bulunamadı." />
        <label className="mh-chip">
          <input
            type="checkbox"
            checked={firmFilters.includeNonTrackable}
            onChange={(event) =>
              setFirmFilters({
                ...firmFilters,
                includeNonTrackable: event?.target.checked,
              })
            }
          />
          Cari takip dışı dahil
        </label>
        <div className="mh-doc-list">
          {companies.map((row) => (
            <FirmListButton
              key={row?.id}
              row={row}
              active={selectedCompany?.id === row?.id}
              onClick={() => {
                setSelectedFirmaId(row?.id);
                setSelectedMovementId("");
                setActiveRightTab("movement");
              }}
            />
          ))}
        </div>
      </Card>

      <Card title="Seçili Firma Cari Hareketleri">
        <div className="mh-cari-main">
          <div className="mh-summary-grid four compact-cards mh-cari-summary-grid">
            <CariSummaryMetric
              label="Bakiye Artıran İşlemler"
              value={money(periodFiltered ? summary.donemBorc : summary.toplamBorc)}
              tone="yellow"
              hint={periodFiltered ? "Seçili dönem" : "Tüm zamanlar"}
            />
            <CariSummaryMetric
              label="Bakiye Azaltan İşlemler"
              value={money(periodFiltered ? summary.donemAlacak : summary.toplamAlacak)}
              tone="green"
              hint={periodFiltered ? "Seçili dönem" : "Tüm zamanlar"}
            />
            <CariSummaryMetric
              label="Güncel Bakiye"
              value={money(currentBalance)}
              tone={currentBalanceTone}
              hint={currentBalanceHint}
            />
            <CariSummaryMetric
              label="Resmi Bakiye"
              value={money(summary.resmiBakiye)}
              tone="blue"
            />
            <CariSummaryMetric
              label="Gayri Resmi Bakiye"
              value={money(summary.gayriResmiBakiye)}
              tone="yellow"
            />
            {periodFiltered ? <CariSummaryMetric label="Seçili Dönem Net Etkisi" value={money(Number(summary.donemBorc || 0) - Number(summary.donemAlacak || 0))} tone="blue" hint={`${movementFilters.dateFrom || "…"} / ${movementFilters.dateTo || "…"}`} /> : null}
          </div>
          <div className="mh-action-stack mh-cari-filters">
            <div className="mh-cari-period-actions"><span>Hızlı Dönem</span><button className="mh-btn" type="button" onClick={() => setQuickMovementPeriod("CURRENT_MONTH")}>Bu Ay</button><button className="mh-btn" type="button" onClick={() => setQuickMovementPeriod("PREVIOUS_MONTH")}>Geçen Ay</button><button className="mh-btn" type="button" onClick={() => setQuickMovementPeriod("LAST_6_MONTHS")}>Son 6 Ay</button><button className="mh-btn" type="button" onClick={() => setQuickMovementPeriod("ALL")}>Tümü</button></div>
            <div className="mh-form-grid mh-cari-filter-grid mh-cari-filter-grid-top">
              <Field label="Başlangıç Tarihi">
                <input
                  type="date"
                  value={movementFilters.dateFrom}
                  onChange={(event) =>
                    setMovementFilters({
                      ...movementFilters,
                      dateFrom: event?.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Bitiş Tarihi">
                <input
                  type="date"
                  value={movementFilters.dateTo}
                  onChange={(event) =>
                    setMovementFilters({
                      ...movementFilters,
                      dateTo: event?.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Belge / Fatura No">
                <input
                  value={movementFilters.documentNo}
                  onChange={(event) =>
                    setMovementFilters({
                      ...movementFilters,
                      documentNo: event?.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Açıklama">
                <input
                  value={movementFilters.description}
                  onChange={(event) =>
                    setMovementFilters({
                      ...movementFilters,
                      description: event?.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <div className="mh-form-grid mh-cari-filter-grid mh-cari-filter-grid-bottom">
              <Field label="İşlem Yönü">
                <select
                  value={movementFilters.direction}
                  onChange={(event) =>
                    setMovementFilters({
                      ...movementFilters,
                      direction: event?.target.value,
                    })
                  }
                >
                  <option value="">Tümü</option>
                  <option value="BORC">Bakiye artıran işlemler</option>
                  <option value="ALACAK">Bakiye azaltan işlemler</option>
                </select>
              </Field>
              <Field label="Durum">
                <select
                  value={movementFilters.status}
                  onChange={(event) =>
                    setMovementFilters({
                      ...movementFilters,
                      status: event?.target.value,
                    })
                  }
                >
                  <option value="">Tümü</option>
                  <option value="BEKLIYOR">Bekliyor</option>
                  <option value="ISLENDI">İşlendi</option>
                  <option value="PASIF">Pasif</option>
                  <option value="IPTAL">İptal</option>
                </select>
              </Field>
              <label className="mh-chip mh-cari-filter-chip">
                <input
                  type="checkbox"
                  checked={movementFilters.overdueOnly}
                  onChange={(event) =>
                    setMovementFilters({
                      ...movementFilters,
                      overdueOnly: event?.target.checked,
                    })
                  }
                />
                Vadesi geçenler
              </label>
              <button
                className="mh-btn"
                type="button"
                onClick={clearMovementFilters}
              >
                Filtreyi Temizle
              </button>
            </div>
          </div>
          <StatusBlock state={movementsState} emptyText="Hareket bulunamadı." />
          <div className="mh-cari-table-area">
            <DataTable
              columns={[
                "Tarih",
                "Belge No",
                "Açıklama",
                "İşlem Türü",
                "Bakiye Artışı (+)",
                "Bakiye Azalışı (-)",
                "Bakiye",
                "Vade",
                "Durum",
                "Kaynak",
              ]}
              rows={rows}
              renderRow={(row) => (
                <tr
                  key={row?.id}
                  className={
                    selectedMovementId === row?.id ? "mh-row-active" : ""
                  }
                  onClick={() => {
                    setSelectedMovementId(row?.id);
                    setActiveRightTab("movement");
                  }}
                >
                  <td>{date(row?.tarih)}</td>
                  <td>
                    {row?.documentId ? (
                      <button
                        className="mh-link-btn"
                        type="button"
                        onClick={(event) => {
                          event?.stopPropagation();
                          setSelectedMovementId(row?.id);
                          setActiveRightTab("invoice");
                        }}
                      >
                        {row?.belgeNo || "Belge Detayı"}
                      </button>
                    ) : (
                      row?.belgeNo || "-"
                    )}
                  </td>
                  <td className="mh-cell-wrap">
                    <strong>{row?.aciklama || "-"}</strong>
                    <small>
                      {[row?.belgeTipi, row?.resmiGayri]
                        .filter(Boolean)
                        .join(" / ")}
                    </small>
                  </td>
                  <td>{movementTypeLabel(row?.movementType)}</td>
                  <td>{money(row?.borc)}</td>
                  <td>{money(row?.alacak)}</td>
                  <td>{money(row?.bakiye)}</td>
                  <td>{date(row?.vade)}</td>
                  <td>
                    <Badge tone={toneFromStatus(row?.durum)}>
                      {row?.durum}
                    </Badge>
                  </td>
                  <td>{row?.kaynak || "-"}</td>
                </tr>
              )}
            />
          </div>
        </div>
      </Card>

      <Card title="Detay Paneli">
        <div className="mh-cari-side-panel">
          {feedback ? <div className="mh-state">{feedback}</div> : null}
          <div className="mh-cari-tabs">
            <button
              className={`mh-tab-btn ${activeRightTab === "movement" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveRightTab("movement")}
            >
              Hareket Detayı
            </button>
            <button
              className={`mh-tab-btn ${activeRightTab === "invoice" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveRightTab("invoice")}
            >
              Fatura Detayı
            </button>
            <button
              className={`mh-tab-btn ${activeRightTab === "new" ? "active" : ""}`}
              type="button"
              onClick={() => resetForm()}
            >
              Yeni Cari İşlem
            </button>
          </div>
          <div className="mh-cari-side-scroll">
            {activeRightTab === "movement" ? (
              selectedMovement ? (
                <div className="mh-action-stack">
                  <Impact title="Hareket Detayı">
                    <SideLine
                      label="Firma"
                      value={
                        selectedMovement.firmaAdi ||
                        selectedCompany?.firmaAdi ||
                        "-"
                      }
                    />
                    <SideLine
                      label="Belge No"
                      value={selectedMovement.belgeNo || "-"}
                    />
                    <SideLine
                      label="Tarih"
                      value={date(selectedMovement.tarih)}
                    />
                    <SideLine
                      label="İşlem türü"
                      value={movementTypeLabel(selectedMovement.movementType || selectedMovement.belgeTipi)}
                    />
                    <SideLine
                      label="Bakiye artışı (+)"
                      value={money(selectedMovement.borc)}
                    />
                    <SideLine
                      label="Bakiye azalışı (-)"
                      value={money(selectedMovement.alacak)}
                    />
                    <SideLine
                      label="Bakiye etkisi"
                      value={money(
                        selectedMovement.borc - selectedMovement.alacak,
                      )}
                    />
                    <SideLine
                      label="Vade"
                      value={date(selectedMovement.vade)}
                    />
                    <SideLine
                      label="Durum"
                      value={selectedMovement.durum || "-"}
                    />
                    <SideLine
                      label="Resmi / Gayri"
                      value={selectedMovement.resmiGayri || "-"}
                    />
                    <SideLine
                      label="Kaynak"
                      value={selectedMovement.kaynak || "-"}
                    />
                    <SideLine
                      label="Açıklama"
                      value={selectedMovement.aciklama || "-"}
                    />
                  </Impact>
                  {selectedMovement.documentId ||
                  selectedMovement?.manual === false ? (
                    <div className="mh-state">
                      Belgeden gelen hareket düzenlenemez. Düzeltme için karşı
                      kayıt veya belge ekranı kullanılmalı.
                    </div>
                  ) : null}
                  <div className="mh-button-row mh-cari-panel-actions">
                    <button
                      className="mh-btn"
                      type="button"
                      onClick={() => resetForm()}
                    >
                      Yeni İşlem
                    </button>
                    <button
                      className="mh-btn"
                      type="button"
                      disabled={!selectedMovement.documentId}
                      onClick={() => setActiveRightTab("invoice")}
                    >
                      Fatura Detayı
                    </button>
                    <button
                      className="mh-btn"
                      type="button"
                      disabled={!selectedMovement?.id || selectedMovement?.manual === false || Boolean(selectedMovement.documentId)}
                      onClick={() => { setEditingMovementId(selectedMovement.id); setActiveRightTab("new"); }}
                    >
                      Düzenle
                    </button>
                    <button
                      className="mh-btn"
                      type="button"
                      disabled={
                        !selectedMovement?.id ||
                        selectedMovement?.manual === false
                      }
                      onClick={passiveMovement}
                    >
                      Pasife Al
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mh-state">
                  Hareket seçildişinde detay burada gösterilir.
                </div>
              )
            ) : null}

            {activeRightTab === "invoice" ? (
              selectedMovement.documentId ? (
                documentDetailState.loading ? (
                  <div className="mh-state">Fatura detayı yükleniyor...</div>
                ) : invoiceDetail ? (
                  <div className="mh-action-stack">
                    <Impact title="Fatura Genel Bilgileri">
                      <SideLine
                        label="Fatura / Belge No"
                        value={invoiceDetail.documentNo || "-"}
                      />
                      <SideLine
                        label="Belge tipi"
                        value={invoiceDetail.documentType || "-"}
                      />
                      <SideLine
                        label="Durum"
                        value={invoiceDetail.status || "-"}
                      />
                      <SideLine
                        label="Kaynak"
                        value={invoiceDetail.source || "-"}
                      />
                      <SideLine
                        label="Firma adı"
                        value={
                          invoiceDetail.firmName ||
                          selectedCompany?.firmaAdi ||
                          "-"
                        }
                      />
                      <SideLine
                        label="Tarih"
                        value={date(invoiceDetail.date)}
                      />
                      <SideLine
                        label="Vade"
                        value={date(invoiceDetail.dueDate)}
                      />
                      <SideLine
                        label="Vergi no"
                        value={invoiceDetail.taxNo || "-"}
                      />
                      <SideLine
                        label="Vergi dairesi"
                        value={invoiceDetail.taxOffice || "-"}
                      />
                      <SideLine
                        label="Resmi / Gayri"
                        value={invoiceDetail.officialType || "-"}
                      />
                      <SideLine
                        label="Belge kaynağı"
                        value={invoiceDetail.belgeKaynagi || "-"}
                      />
                      <SideLine
                        label="Bağlı cari hareket"
                        value={
                          invoiceDetail.movementRef ||
                          selectedMovement?.id ||
                          "-"
                        }
                      />
                      <SideLine
                        label="Model"
                        value={invoiceDetail.modelName || "-"}
                      />
                    </Impact>
                    <div className="mh-summary-grid four mh-cari-invoice-totals">
                      <CariSummaryMetric
                        label="Mal / Hizmet"
                        value={money(invoiceDetail.subtotal)}
                      />
                      <CariSummaryMetric
                        label="KDV Toplamı"
                        value={money(invoiceDetail.vatTotal)}
                        tone="yellow"
                      />
                      <CariSummaryMetric
                        label="Genel Toplam"
                        value={money(invoiceDetail.grandTotal)}
                        tone="blue"
                      />
                      <CariSummaryMetric
                        label="Cari Borç"
                        value={money(invoiceDetail.cariDebit)}
                        tone="red"
                      />
                      <CariSummaryMetric
                        label="Cari Alacak"
                        value={money(invoiceDetail.cariCredit)}
                        tone="green"
                      />
                      <CariSummaryMetric
                        label="İşlenen Tutar"
                        value={money(invoiceDetail.processedAmount)}
                        tone="dark"
                      />
                    </div>
                    <Impact title="Kalemler">
                      <ProductMatchTable
                        activeMainCompany={activeMainCompany}
                        documentId={selectedMovement.documentId}
                        previewLines={invoiceDetail.lines}
                        compact
                        title="Fatura kalemleri"
                      />
                    </Impact>
                    <Impact title="Belge Önizleme">
                      <div className="mh-button-row mh-cari-panel-actions">
                        <button
                          className="mh-btn"
                          type="button"
                          disabled={!previewPdfUrl}
                          onClick={() =>
                            window.open(
                              previewPdfUrl,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          PDF Aç
                        </button>
                        <button
                          className="mh-btn"
                          type="button"
                          disabled={!previewXmlUrl}
                          onClick={() =>
                            window.open(
                              previewXmlUrl,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          XML Aç
                        </button>
                      </div>
                      {invoiceDetail.xmlUrl ? (
                        <div className="mh-state">XML var.</div>
                      ) : null}
                      {previewPdfUrl ? (
                        <iframe
                          className="mh-cari-pdf-preview"
                          src={previewPdfUrl}
                          title={invoiceDetail.documentNo || "Belge Önizleme"}
                        />
                      ) : (
                        <div className="mh-state">
                          PDF önizlemesi bulunamadı.
                        </div>
                      )}
                    </Impact>
                  </div>
                ) : (
                  <div className="mh-state">
                    Bu cari hareket için bağlı fatura detayı bulunamadı.
                  </div>
                )
              ) : (
                <div className="mh-state">
                  Bu cari hareket için bağlı fatura detayı bulunamadı.
                </div>
              )
            ) : null}

            {activeRightTab === "new" ? (
              <form className="mh-action-stack" onSubmit={submit}>
                <div className="mh-cari-new-head"><div><strong>{isEditingMovement ? "Cari İşlemi Düzenle" : "Yeni Cari İşlem"}</strong><span>{selectedCompany?.firmaAdi || "Firma seçilmedi"}</span></div></div>
                <Field label="İşlem Türü">
                  <select value={form.islemTipi} onChange={(event) => setForm({ ...form, islemTipi: event.target.value })}>
                    <optgroup label="GELEN İŞLEMLER">
                      <option value="GELEN_FATURA">Gelen Fatura</option>
                      <option value="TAHSILAT">Tahsilat Geldi</option>
                      <option value="CEK_TAHSILATI">Çek Alındı</option>
                      <option value="KREDI_KARTI_TAHSILATI">Kredi Kartından Tahsilat</option>
                    </optgroup>
                    <optgroup label="GİDEN İŞLEMLER">
                      <option value="SATIS">Giden Fatura</option>
                      <option value="ODEME">Tahsilat Yapıldı</option>
                      <option value="CEK_ODEMESI">Çek Verildi</option>
                      <option value="KREDI_KARTI_ODEMESI">Kredi Kartıyla Ödeme</option>
                    </optgroup>
                  </select>
                </Field>
                <div className="mh-cari-type-hint"><strong>{movementTypeLabel(form.islemTipi)}</strong><span>{movementTypeHint(form.islemTipi)}</span></div>
                <Field label="Tutar">
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.tutar}
                    onChange={(event) =>
                      setForm({ ...form, tutar: event?.target.value })
                    }
                  />
                </Field>
                <Field label="Tarih">
                  <input
                    type="date"
                    value={form.tarih}
                    onChange={(event) =>
                      setForm({ ...form, tarih: event?.target.value })
                    }
                  />
                </Field>
                <Field label="Vade">
                  <input
                    type="date"
                    value={form.vade}
                    onChange={(event) =>
                      setForm({ ...form, vade: event?.target.value })
                    }
                  />
                </Field>
                <Field label="Belge No">
                  <input
                    value={form.belgeNo}
                    onChange={(event) =>
                      setForm({ ...form, belgeNo: event?.target.value })
                    }
                  />
                </Field>
                <Field label="Resmi / Gayri">
                  <select
                    value={form.resmiGayri}
                    onChange={(event) =>
                      setForm({ ...form, resmiGayri: event?.target.value })
                    }
                  >
                    <option value="RESMI">Resmi</option>
                    <option value="GAYRI">Gayri</option>
                  </select>
                </Field>
                <Field label="Açıklama">
                  <textarea
                    value={form.aciklama}
                    onChange={(event) =>
                      setForm({ ...form, aciklama: event?.target.value })
                    }
                  />
                </Field>
                {form.islemTipi === "ODEME" ? (
                  <div className="mh-state">
                    Tedarikçiye yapılan ödeme bakiyeyi azaltır.
                  </div>
                ) : null}
                <Field label="Hesap Önizlemesi">
                  <div className="mh-state">
                    <div>Mevcut bakiye: {money(currentBalance)}</div>
                    <div>İşlem etkisi: {money(previewEffect)}</div>
                    <div>Yeni bakiye: {money(previewBalance)}</div>
                  </div>
                </Field>
                {["CEK_GIRISI", "CEK_TAHSILATI", "CEK_ODEMESI"].includes(form.islemTipi) ? (
                  <>
                    <div className="mh-state">{form.islemTipi === "CEK_ODEMESI" ? "Çek Verildi: firmaya olan borcu azaltır." : "Çek Alındı: müşteriden olan alacağı azaltır."}</div>
                    <Field label="Banka">
                      <input
                        value={form.bankName}
                        onChange={(event) =>
                          setForm({ ...form, bankName: event?.target.value })
                        }
                      />
                    </Field>
                    <Field label="Şube">
                      <input
                        value={form.branchName}
                        onChange={(event) =>
                          setForm({ ...form, branchName: event?.target.value })
                        }
                      />
                    </Field>
                    <Field label="Keşideci">
                      <input
                        value={form.drawerName}
                        onChange={(event) =>
                          setForm({ ...form, drawerName: event?.target.value })
                        }
                      />
                    </Field>
                    <Field label="Hesap No">
                      <input
                        value={form.accountNo}
                        onChange={(event) =>
                          setForm({ ...form, accountNo: event?.target.value })
                        }
                      />
                    </Field>
                    <Field label="Ön Yüz Görseli">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(event) =>
                          setForm({
                            ...form,
                            frontImageFile: event?.target.files?.[0] || null,
                          })
                        }
                      />
                    </Field>
                    <Field label="Arka Yüz Görseli">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(event) =>
                          setForm({
                            ...form,
                            backImageFile: event?.target.files?.[0] || null,
                          })
                        }
                      />
                    </Field>
                  </>
                ) : null}
                {form.islemTipi === "KREDI_KARTI_ODEMESI" ? (
                  <>
                    <Field label="Kart Seç">
                      <select
                        value={form.creditCardId}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            creditCardId: event?.target.value,
                          })
                        }
                      >
                        <option value="">Kart seç</option>
                        {creditCards.map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.kartAdi || card.cardName || "Kart"} /{" "}
                            {card.banka || card.bankName || ""} ****
                            {card.son4Hane || card.lastFourDigits || ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Taksit Sayısı">
                      <input
                        type="number"
                        min="1"
                        value={form.installmentCount}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            installmentCount: event?.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Slip / Görsel">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(event) =>
                          setForm({
                            ...form,
                            slipFile: event?.target.files?.[0] || null,
                          })
                        }
                      />
                    </Field>
                  </>
                ) : null}
                <div className="mh-button-row mh-cari-panel-actions">
                  <button
                    className="mh-btn"
                    type="button"
                    onClick={() =>
                      setForm(
                        emptyMovementForm(
                          selectedCompany?.resmiGayri || "RESMI",
                        ),
                      )
                    }
                  >
                    Temizle
                  </button>
                  <button
                    className="mh-btn primary"
                    type="submit"
                    disabled={!selectedCompany?.id || saveBusy}
                  >
                    {saveBusy ? "Kaydediliyor..." : isEditingMovement ? "Değişiklikleri Kaydet" : "Kaydet"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

function KdvControl({ activeMainCompany, refreshKey }) {
  const now = new Date();
  const [period, setPeriod] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [selectedFirmId, setSelectedFirmId] = useState("");
  const [filters, setFilters] = useState({
    fromDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    toDate: new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10),
    query: "",
    direction: "ALL",
  });
  const [documentDecisions, setDocumentDecisions] = useState({});
  const [firmDecisions, setFirmDecisions] = useState({});
  const [manualRows, setManualRows] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [manualForm, setManualForm] = useState({
    documentNo: "",
    direction: "IN",
    quantity: "1",
    vatRate: "20",
    baseAmount: "",
    vatAmount: "",
    totalAmount: "",
  });
  const [adjustment, setAdjustment] = useState({
    adjustmentType: "ARTI",
    amount: "",
    note: "",
  });
  const [localRefresh, setLocalRefresh] = useState(0);
  const state = useEndpoint(
    "/api/vat/summary",
    activeMainCompany,
    `${refreshKey}-${localRefresh}`,
    period,
  );
  const storageKey = `kyerp-kdv-control:${activeMainCompany?.slug || activeMainCompany?.id || "none"}:${period.year}-${period.month}`;
  const data = state.data || {};
  const rows = Array.isArray(data?.liste) ? data?.liste : [];
  const selected =
    rows.find((row) => row.firmId === (selectedFirmId || rows[0].firmId)) ||
    rows[0] ||
    {};
  const detailState = useEndpoint(
    selected.firmId
      ? `/api/vat/firms/${encodeURIComponent(selected.firmId)}/detail`
      : "/api/vat/firms/_none/detail",
    activeMainCompany,
    `${refreshKey}-${localRefresh}`,
    period,
  );
  const detail = detailState.data || {};
  useEffect(() => {
    setStorageReady(false);
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
      setFirmDecisions(stored.firmDecisions || {});
      setDocumentDecisions(stored.documentDecisions || {});
      setManualRows(Array.isArray(stored.manualRows) ? stored.manualRows : []);
    } catch {
      setFirmDecisions({});
      setDocumentDecisions({});
      setManualRows([]);
    } finally {
      setStorageReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ firmDecisions, documentDecisions, manualRows }),
    );
  }, [storageKey, storageReady, firmDecisions, documentDecisions, manualRows]);

  const documents = [
    ...(Array.isArray(detail?.gelenBelgeler) ? detail.gelenBelgeler : []).map(
      (row) => ({ ...row, _direction: "IN" }),
    ),
    ...(Array.isArray(detail?.gidenBelgeler) ? detail.gidenBelgeler : []).map(
      (row) => ({ ...row, _direction: "OUT" }),
    ),
    ...manualRows.filter((row) => row.firmId === selected.firmId),
  ];
  const documentKey = (row, index = 0) =>
    String(
      row?.id ||
        row?.documentId ||
        `${row?._direction || "VAT"}-${row?.documentNo || row?.documentDate || index}`,
    );
  const decisionOf = (row, index = 0) =>
    documentDecisions[documentKey(row, index)] ||
    firmDecisions[selected.firmId] ||
    "INCLUDED";
  const filteredDocuments = documents.filter((row) => {
    const docDate = String(row?.documentDate || row?.date || "").slice(0, 10);
    if (filters.fromDate && docDate && docDate < filters.fromDate) return false;
    if (filters.toDate && docDate && docDate > filters.toDate) return false;
    if (filters.direction !== "ALL" && row._direction !== filters.direction)
      return false;
    const query = filters.query.trim().toLocaleLowerCase("tr-TR");
    if (!query) return true;
    return `${row?.documentNo || ""} ${row?.source || ""} ${row?.documentId || ""}`
      .toLocaleLowerCase("tr-TR")
      .includes(query);
  });
  const manualByFirm = manualRows.reduce((map, row) => {
    const key = row?.firmId || "";
    const current = map.get(key) || {
      gelenKdv: 0,
      gidenKdv: 0,
      gelenMatrah: 0,
      gidenMatrah: 0,
      belgeSayisi: 0,
    };
    const vat = Number(row?.vatAmount || 0);
    const base = Number(row?.baseAmount || 0);
    if (row?._direction === "OUT") {
      current.gidenKdv += vat;
      current.gidenMatrah += base;
    } else {
      current.gelenKdv += vat;
      current.gelenMatrah += base;
    }
    current.belgeSayisi += 1;
    map.set(key, current);
    return map;
  }, new Map());
  const firmRows = rows.map((row) => {
    const manual = manualByFirm.get(row?.firmId) || {};
    const gelenKdv = Number(row?.gelenKdv || 0) + Number(manual.gelenKdv || 0);
    const gidenKdv = Number(row?.gidenKdv || 0) + Number(manual.gidenKdv || 0);
    const gelenMatrah =
      Number(row?.gelenMatrah || 0) + Number(manual.gelenMatrah || 0);
    const gidenMatrah =
      Number(row?.gidenMatrah || 0) + Number(manual.gidenMatrah || 0);
    const belgeSayisi =
      Number(row?.belgeSayisi || 0) + Number(manual.belgeSayisi || 0);
    return {
      ...row,
      gelenKdv,
      gidenKdv,
      gelenMatrah,
      gidenMatrah,
      belgeSayisi,
      decision: firmDecisions[row?.firmId] || "INCLUDED",
      hasKdv: belgeSayisi > 0 || gelenKdv || gidenKdv,
    };
  });
  const includedRows = firmRows.filter((row) => row.decision === "INCLUDED");
  const hesaplananKdv = includedRows.reduce(
    (sum, row) => sum + Number(row?.gidenKdv || 0),
    0,
  );
  const indirilecekKdv = includedRows.reduce(
    (sum, row) => sum + Number(row?.gelenKdv || 0),
    0,
  );
  const devredenKdv = includedRows.reduce(
    (sum, row) => sum + Number(row?.devredenKdv || 0),
    0,
  );
  const duzeltmeKdv =
    includedRows.reduce((sum, row) => sum + Number(row?.duzeltmeKdv || 0), 0) +
    Number(adjustment.amount || 0) *
      (adjustment.adjustmentType === "EKSI" ? -1 : 1);
  const excludedKdv = firmRows
    .filter((row) => row.decision !== "INCLUDED")
    .reduce(
      (sum, row) =>
        sum + Number(row?.gelenKdv || 0) + Number(row?.gidenKdv || 0),
      0,
    );
  const netKdv = hesaplananKdv - indirilecekKdv - devredenKdv + duzeltmeKdv;
  const sonucLabel =
    netKdv > 0 ? "Ödenecek KDV" : netKdv < 0 ? "Devreden KDV" : "Net KDV";
  const sonucValue = netKdv === 0 ? 0 : Math.abs(netKdv);
  const updateMonth = (month) => {
    const nextMonth = Number(month || 1);
    const nextYear = Number(period.year || new Date().getFullYear());
    setPeriod({ ...period, month: nextMonth });
    setFilters((current) => ({
      ...current,
      fromDate: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
      toDate: new Date(nextYear, nextMonth, 0).toISOString().slice(0, 10),
    }));
  };
  const decisionText = (value) => {
    if (value === "EXCLUDED") return "KDV dışı";
    if (value === "HELD") return "Beklet";
    if (value === "CANCELLED") return "İptal adayı";
    return "Dahil";
  };
  const decisionTone = (value) => {
    if (value === "EXCLUDED") return "gray";
    if (value === "HELD") return "yellow";
    if (value === "CANCELLED") return "red";
    return "green";
  };
  const setDocumentDecision = (row, index, decision) => {
    const key = documentKey(row, index);
    setDocumentDecisions((current) => {
      const next = { ...current };
      if (decision === "INCLUDED") delete next[key];
      else next[key] = decision;
      return next;
    });
  };
  const setFirmDecision = (firmId, decision) => {
    setFirmDecisions((current) => {
      const next = { ...current };
      if (decision === "INCLUDED") delete next[firmId];
      else next[firmId] = decision;
      return next;
    });
  };
  const parseAmount = (value) =>
    Number(
      String(value || "0")
        .replace(/\./g, "")
        .replace(",", "."),
    ) || 0;
  const addManualKdvRow = () => {
    if (!selected.firmId) return;
    const baseAmount = parseAmount(manualForm.baseAmount);
    const vatRate = parseAmount(manualForm.vatRate);
    const vatAmount =
      parseAmount(manualForm.vatAmount) ||
      Number(((baseAmount * vatRate) / 100).toFixed(2));
    const totalAmount =
      parseAmount(manualForm.totalAmount) ||
      Number((baseAmount + vatAmount).toFixed(2));
    if (!baseAmount && !vatAmount && !totalAmount) return;
    setManualRows((current) => [
      {
        id: `manual-kdv-${Date.now()}`,
        firmId: selected.firmId,
        firma: selected.firma,
        documentNo:
          manualForm.documentNo.trim() || `ELLE-KDV-${current.length + 1}`,
        documentDate: new Date().toISOString().slice(0, 10),
        _direction: manualForm.direction,
        quantity: parseAmount(manualForm.quantity) || 1,
        vatRate,
        baseAmount,
        vatAmount,
        totalAmount,
        manual: true,
      },
      ...current,
    ]);
    setManualForm({
      documentNo: "",
      direction: "IN",
      quantity: "1",
      vatRate: "20",
      baseAmount: "",
      vatAmount: "",
      totalAmount: "",
    });
  };
  const saveAdjustment = async () => {
    if (!selected.firmId) return;
    if (!Number(adjustment.amount || 0)) return;
    await apiPost(
      `/api/vat/firms/${encodeURIComponent(selected.firmId)}/adjustment`,
      companyParams(activeMainCompany, {
        ...period,
        ...adjustment,
      }),
    );
    setAdjustment({ adjustmentType: "ARTI", amount: "", note: "" });
    setLocalRefresh((value) => value + 1);
  };
  if (state.loading || state.error) return <StatusBlock state={state} />;
  return (
    <div className="kdv-live-redesign">
      <div className="kdv-live-filterbar">
        <Field label="Yıl">
          <input
            value={period.year}
            onChange={(event) =>
              setPeriod({ ...period, year: event?.target.value })
            }
          />
        </Field>
        <Field label="Ay">
          <select
            value={period.month}
            onChange={(event) => updateMonth(event?.target.value)}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option value={index + 1} key={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Başlangıç">
          <input
            type="date"
            value={filters.fromDate}
            onChange={(event) =>
              setFilters({ ...filters, fromDate: event?.target.value })
            }
          />
        </Field>
        <Field label="Bitiş">
          <input
            type="date"
            value={filters.toDate}
            onChange={(event) =>
              setFilters({ ...filters, toDate: event?.target.value })
            }
          />
        </Field>
        <Field label="Liste">
          <select
            value={filters.direction}
            onChange={(event) =>
              setFilters({ ...filters, direction: event?.target.value })
            }
          >
            <option value="ALL">Gelen + Giden</option>
            <option value="IN">Gelen KDV</option>
            <option value="OUT">Giden KDV</option>
          </select>
        </Field>
        <Field label="Belge / kaynak ara">
          <input
            value={filters.query}
            onChange={(event) =>
              setFilters({ ...filters, query: event?.target.value })
            }
            placeholder="Belge no veya kaynak"
          />
        </Field>
        <button
          className="mh-btn primary"
          type="button"
          onClick={() => setLocalRefresh((value) => value + 1)}
        >
          Hemen Güncelle
        </button>
      </div>

      <div className="mh-summary-grid six compact-cards">
        {[
          ["Giden / Hesaplanan KDV", money(hesaplananKdv), "blue"],
          ["Gelen / İndirilecek KDV", money(indirilecekKdv), "green"],
          [
            "Devreden + Düzeltme",
            `${money(devredenKdv)} / ${money(duzeltmeKdv)}`,
            "yellow",
          ],
          ["KDV dışı / bekleyen", money(excludedKdv), "red"],
          [
            "KDV'ye girmeyen firma",
            rows.filter((row) => !Number(row?.belgeSayisi || 0)).length,
            "yellow",
          ],
          [sonucLabel, money(sonucValue), "dark"],
        ].map(([label, value, tone]) => (
          <div className={`mh-summary ${tone}`} key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>

      <div className="kdv-live-workspace">
        <Card title="Firma Listesi" subtitle={`${rows.length} firma`}>
          <div className="kdv-live-firm-list">
            {firmRows.map((row) => (
              <button
                key={row?.firmId || row?.firma}
                className={`kdv-live-firm ${selected.firmId === row?.firmId ? "active" : ""} ${!row.hasKdv ? "muted" : ""}`}
                type="button"
                onClick={() => setSelectedFirmId(row?.firmId)}
              >
                <div>
                  <strong>{row?.firma || "Firma eşleşmemiş"}</strong>
                  <span>
                    {row.hasKdv
                      ? `${row?.belgeSayisi || 0} belge · Giden ${money(row?.gidenKdv)} / Gelen ${money(row?.gelenKdv)}`
                      : "Bu ay KDV'ye giren belge yok"}
                  </span>
                </div>
                <Badge tone={decisionTone(row.decision)}>
                  {decisionText(row.decision)}
                </Badge>
              </button>
            ))}
          </div>
        </Card>

        <Card
          title="Fatura KDV Listesi"
          subtitle={`${filteredDocuments.length} fatura · ${date(filters.fromDate)} - ${date(filters.toDate)}`}
        >
          <div className="kdv-live-table">
            <table>
              <thead>
                <tr>
                  <th>Fatura No</th>
                  <th>Toplam Tutar</th>
                  <th>KDV Oranı</th>
                  <th>KDV Tutarı</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.length ? (
                  filteredDocuments.map((row, index) => {
                    const decision = decisionOf(row, index);
                    const vatAmount = Number(
                      row?.vatAmount ||
                        row?.incomingVat ||
                        row?.outgoingVat ||
                        0,
                    );
                    const baseAmount = Number(
                      row?.baseAmount || row?.subtotal || 0,
                    );
                    const vatRate =
                      Number(row?.vatRate || row?.kdvRate || 0) ||
                      (baseAmount
                        ? Number(((vatAmount / baseAmount) * 100).toFixed(2))
                        : 0);
                    const totalAmount = Number(
                      row?.grandTotal ||
                        row?.totalAmount ||
                        row?.payableTotal ||
                        baseAmount + vatAmount,
                    );
                    return (
                      <tr key={documentKey(row, index)}>
                        <td>
                          <b>{row?.documentNo || row?.documentId || "-"}</b>
                        </td>
                        <td>{money(totalAmount)}</td>
                        <td>
                          %
                          {vatRate.toLocaleString("tr-TR", {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td>
                          <b>{money(vatAmount)}</b>
                        </td>
                        <td>
                          <Badge tone={decisionTone(decision)}>
                            {decisionText(decision)}
                          </Badge>
                        </td>
                        <td>
                          <div className="kdv-live-actions">
                            <button
                              type="button"
                              onClick={() =>
                                setDocumentDecision(row, index, "INCLUDED")
                              }
                            >
                              Ekle
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDocumentDecision(row, index, "EXCLUDED")
                              }
                            >
                              Çıkar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDocumentDecision(row, index, "HELD")
                              }
                            >
                              Beklet
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6">
                      Seçili firmada bu tarih aralığında gelen/giden KDV belgesi
                      yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="KDV Karar / Firma Düzeltme">
          <SideLine label="Seçili firma" value={selected.firma || "-"} />
          <SideLine
            label="Matrah toplamı"
            value={money(detail?.matrahToplami)}
          />
          <SideLine
            label="Kesilen fatura KDV"
            value={money(detail?.hesaplananKdv)}
          />
          <SideLine
            label="Alış / indirilecek KDV"
            value={money(detail?.indirilecekKdv)}
          />
          <SideLine label="Devreden KDV" value={money(detail?.devredenKdv)} />
          <SideLine label="Düzeltme" value={money(detail?.duzeltmeKdv)} />
          <div className="kdv-live-actions wide">
            <button
              type="button"
              onClick={() => setFirmDecision(selected.firmId, "INCLUDED")}
              disabled={!selected.firmId}
            >
              Firmayı KDV'ye Ekle
            </button>
            <button
              type="button"
              onClick={() => setFirmDecision(selected.firmId, "EXCLUDED")}
              disabled={!selected.firmId}
            >
              Firmayı KDV'den Çıkar
            </button>
            <button
              type="button"
              onClick={() => setFirmDecision(selected.firmId, "HELD")}
              disabled={!selected.firmId}
            >
              Sonraki Aya Beklet
            </button>
          </div>

          <div className="kdv-manual-entry">
            <h4>Elle KDV Ekle</h4>
            <Field label="Fatura No">
              <input
                value={manualForm.documentNo}
                onChange={(event) =>
                  setManualForm({
                    ...manualForm,
                    documentNo: event?.target.value,
                  })
                }
                placeholder="Fatura no"
              />
            </Field>
            <Field label="KDV Tipi">
              <select
                value={manualForm.direction}
                onChange={(event) =>
                  setManualForm({
                    ...manualForm,
                    direction: event?.target.value,
                  })
                }
              >
                <option value="IN">Gelen / İndirilecek KDV</option>
                <option value="OUT">Giden / Hesaplanan KDV</option>
              </select>
            </Field>
            <div className="kdv-manual-grid">
              <Field label="Miktar">
                <input
                  value={manualForm.quantity}
                  onChange={(event) =>
                    setManualForm({
                      ...manualForm,
                      quantity: event?.target.value,
                    })
                  }
                />
              </Field>
              <Field label="KDV %">
                <input
                  value={manualForm.vatRate}
                  onChange={(event) =>
                    setManualForm({
                      ...manualForm,
                      vatRate: event?.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Matrah / Tutar">
              <input
                value={manualForm.baseAmount}
                onChange={(event) =>
                  setManualForm({
                    ...manualForm,
                    baseAmount: event?.target.value,
                  })
                }
                placeholder="1000,00"
              />
            </Field>
            <Field label="KDV Tutarı">
              <input
                value={manualForm.vatAmount}
                onChange={(event) =>
                  setManualForm({
                    ...manualForm,
                    vatAmount: event?.target.value,
                  })
                }
                placeholder="Boşsa orandan hesaplanır"
              />
            </Field>
            <Field label="Toplam Tutar">
              <input
                value={manualForm.totalAmount}
                onChange={(event) =>
                  setManualForm({
                    ...manualForm,
                    totalAmount: event?.target.value,
                  })
                }
                placeholder="Boşsa matrah + KDV"
              />
            </Field>
            <button
              className="mh-btn primary"
              type="button"
              onClick={addManualKdvRow}
              disabled={!selected.firmId}
            >
              KDV Satırı Ekle
            </button>
          </div>

          <div className="mh-action-stack">
            <Field label="Düzeltme Tipi">
              <select
                value={adjustment.adjustmentType}
                onChange={(event) =>
                  setAdjustment({
                    ...adjustment,
                    adjustmentType: event?.target.value,
                  })
                }
              >
                <option value="ARTI">Artı</option>
                <option value="EKSI">Eksi</option>
              </select>
            </Field>
            <Field label="Düzeltme Tutarı">
              <input
                value={adjustment.amount}
                onChange={(event) =>
                  setAdjustment({ ...adjustment, amount: event?.target.value })
                }
              />
            </Field>
            <Field label="Açıklama">
              <textarea
                value={adjustment.note}
                onChange={(event) =>
                  setAdjustment({ ...adjustment, note: event?.target.value })
                }
              />
            </Field>
            <button
              className="mh-btn primary"
              type="button"
              disabled={!selected.firmId}
              onClick={saveAdjustment}
            >
              Firma KDV Düzelt
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CheckPayment({ activeMainCompany, refreshKey, reloadAll }) {
  return (
    <CekOdemeMerkeziPage
      activeMainCompany={activeMainCompany}
      refreshKey={refreshKey}
      reloadAll={reloadAll}
    />
  );
}

function MailExtract({ activeMainCompany, refreshKey, goTab }) {
  const state = useEndpoint(
    "/api/mail-tracking",
    activeMainCompany,
    refreshKey,
  );
  const data = state.data || {};
  const rows = Array.isArray(data?.liste) ? data?.liste : [];
  const [selectedId, setSelectedId] = useState("");
  const selected =
    rows.find((row) => row.id === (selectedId || rows[0].id)) ||
    data?.seciliKayitDetay ||
    rows[0] ||
    {};

  const prepareMail = async () => {
    if (!selected.id) return;
    await apiPost("/api/mail-tracking/create-draft", { id: selected.id });
  };

  if (state.loading || state.error) return <StatusBlock state={state} />;
  return (
    <div className="mh-layout-3 mail">
      <Card title="Mail / Ekstre Sayaçları">
        {[
          ["Gönderilecek", data?.gonderilecek],
          ["Gönderildi", data?.gonderildi],
          ["Alıcı Eksik", data?.aliciEksik],
          ["Ekstrede Var", data?.ekstedeVar],
        ].map(([label, value]) => (
          <SideLine key={label} label={label} value={value ?? 0} />
        ))}
      </Card>

      <div>
        <Card title="Mail / Ekstre Takip Ana Alanı">
          <div className="mh-info-grid">
            {[
              ["Firma", selected.firma],
              ["Model", selected.model],
              ["Fatura", selected.faturaNo],
              ["İrsaliye", selected.irsaliyeNo],
              ["Tutar", money(selected.tutar)],
              ["Durum", selected.status],
            ].map(([label, value]) => (
              <div className="mh-meta-cell" key={label}>
                <span>{label}</span>
                <b>{value || "-"}</b>
              </div>
            ))}
          </div>
          <DataTable
            columns={[
              "Firma",
              "Model",
              "Fatura No",
              "İrsaliye No",
              "Tutar",
              "Mail Alıcı Kararı",
              "TO",
              "CC",
              "Eksik Kontrol",
              "Ekstre",
              "İşlem",
            ]}
            rows={rows}
            renderRow={(row) => (
              <tr key={row?.id} onClick={() => setSelectedId(row?.id)}>
                <td>{row?.firma}</td>
                <td>{row?.model || "-"}</td>
                <td>{row?.faturaNo || "-"}</td>
                <td>{row?.irsaliyeNo || "-"}</td>
                <td>{money(row?.tutar)}</td>
                <td>{row?.mailAliciKarari}</td>
                <td>{(row?.to || []).join(", ") || "-"}</td>
                <td>{(row?.cc || []).join(", ") || "-"}</td>
                <td>
                  <Badge tone={toneFromStatus(row?.eksikKontrol)}>
                    {row?.eksikKontrol}
                  </Badge>
                </td>
                <td>{row?.ekstreKarsilastirma}</td>
                <td>
                  <button className="mh-btn" type="button">
                    Aç
                  </button>
                </td>
              </tr>
            )}
          />
          <div className="mh-mail-preview">
            <h3>Mail Önizleme</h3>
            <p>{data?.mailOnizleme || "Mail önizlemesi yok."}</p>
          </div>
          <div className="mh-button-row">
            <button
              className="mh-btn"
              type="button"
              onClick={() => goTab("firma-kartlari")}
            >
              Departman/Kişi Yetkilerini Aç
            </button>
            <button
              className="mh-btn primary"
              type="button"
              onClick={prepareMail}
            >
              Mail Taslağı Hazırla
            </button>
          </div>
        </Card>
      </div>

      <div>
        <Card title="Alıcı Kararı">
          <Impact title="TO">
            <p>{(selected.to || []).join(", ") || "-"}</p>
          </Impact>
          <Impact title="CC">
            <p>{(selected.cc || []).join(", ") || "-"}</p>
          </Impact>
          <Impact title="Genel Muhasebe CC">
            <p>{(selected.genelMuhasebeCc || []).join(", ") || "-"}</p>
          </Impact>
        </Card>
        <Card title="Ekstre Karşılaştırma">
          <input type="file" className="mh-input" />
          <SideLine
            label="Ödemeye giren"
            value={
              (data?.ekstreKarsilastirmaSonucu?.odemeyeGirenFaturalar || [])
                .length
            }
          />
          <SideLine
            label="Ödemeye girmeyen"
            value={
              (data?.ekstreKarsilastirmaSonucu?.odemeyeGirmeyenFaturalar || [])
                .length
            }
          />
          <SideLine
            label="Tutar farkı olan"
            value={
              (data?.ekstreKarsilastirmaSonucu?.tutarFarkiOlanlar || []).length
            }
          />
        </Card>
      </div>
    </div>
  );
}

function normalizeFirm(row = {}) {
  const mevcutBakiye = Number(
    row?.mevcutBakiye ?? row?.currentBalance ?? row?.bakiye ?? 0,
  );
  return {
    id: row?.id,
    firmaAdi: row?.firmaAdi || row?.firma || row?.name || "",
    kisaAd: row?.kisaAd || row?.shortName || row?.legacyId || "",
    firmaTipi: firmTypeValue(row?.firmaTipi || row?.type || row?.firmType),
    resmiGayri: officialTypeValue(
      row?.resmiGayri ||
        row?.defaultRecordType ||
        row?.officialType ||
        row?.workType,
    ),
    vergiNo: row?.vergiNo || row?.taxNo || "",
    vergiDairesi: row?.vergiDairesi || row?.taxOffice || "",
    telefon: row?.telefon || row?.phone || "",
    email: row?.email || row?.eposta || "",
    adres: row?.adres || row?.address || "",
    varsayilanKdv: row?.varsayilanKdv ?? row?.defaultVatRate ?? 20,
    acilisBakiyesi: row?.acilisBakiyesi ?? row?.openingBalance ?? 0,
    acilisBakiyeTarihi:
      row?.acilisBakiyeTarihi || row?.openingBalanceDate || "",
    borcAlacakYonu:
      row?.borcAlacakYonu || row?.openingBalanceDirection || "BORC",
    devredenKdv: row?.devredenKdv ?? row?.openingVatAmount ?? 0,
    devredenKdvAyi: row?.devredenKdvAyi || row?.openingVatPeriod || "",
    vadeGunu: row?.vadeGunu ?? row?.dueDay ?? "",
    riskLimiti: row?.riskLimiti ?? row?.riskLimit ?? 0,
    not: row?.cariNotu || row?.not || row?.note || "",
    aktif: row?.aktif ?? row?.isActive ?? true,
    firmaTuru: row?.firmaTuru || row?.companyKind || row?.type || "TEDARIKCI",
    varsayilanRaporKategoriId:
      row?.varsayilanRaporKategoriId || row?.raporKategorisiId || "",
    raporKategorisiId:
      row?.raporKategorisiId || row?.varsayilanRaporKategoriId || "",
    companyTransactionProfile:
      row?.companyTransactionProfile || row?.calismaProfili || "SUPPLIER",
    expenseCalculationMode:
      row?.expenseCalculationMode || row?.giderHesaplamaTipi || "FULL",
    defaultVatType:
      row?.defaultVatType || row?.varsayilanKdvTipi || "INDIRILECEK_KDV",
    currentAccountPostingMode:
      row?.currentAccountPostingMode ||
      row?.cariKayitModu ||
      (row?.expenseCalculationMode === "VAT_ONLY" || row?.vatOnlyExpense
        ? "VAT_PERCENTAGE"
        : row?.trackReceivablePayable === false
          ? "NONE"
          : "FULL_DOCUMENT"),
    vatPayablePercentage: Number(
      row?.vatPayablePercentage ?? row?.kdvCariBorcYuzdesi ?? 0,
    ),
    vatOnlyExpense: Boolean(row?.vatOnlyExpense || row?.sadeceKdvKullan),
    trackReceivablePayable: row?.trackReceivablePayable !== false,
    defaultCashSettlement: Boolean(row?.defaultCashSettlement),
    cariTakipDisi: Boolean(
      row?.cariTakipDisi || row?.trackReceivablePayable === false,
    ),
    cariBakiyesiBilgiAmacli: Boolean(row?.cariBakiyesiBilgiAmacli),
    defaultReportBehavior:
      row?.defaultReportBehavior ||
      row?.varsayilanRaporDavranisi ||
      "KONTROL_BEKLIYOR",
    defaultGeneralExpense:
      row?.defaultGeneralExpense ||
      row?.genelGiderVarsayilani ||
      "KONTROL_BEKLIYOR",
    mevcutBakiye,
    bakiye: mevcutBakiye,
    gercekCariBakiye: Number(
      row?.gercekCariBakiye ?? row?.rawCariBakiye ?? mevcutBakiye,
    ),
    toplamBorc: Number(row?.toplamBorc ?? row?.borc ?? 0),
    toplamAlacak: Number(row?.toplamAlacak ?? row?.alacak ?? 0),
    sonIslemTarihi:
      row?.sonIslemTarihi || row?.sonIslem || row?.updatedAt || "",
    bakiyeYonu:
      row?.cariTakipDisi || row?.trackReceivablePayable === false
        ? "CARI_TAKIP_DISI"
        : row?.bakiyeYonu || balanceDirectionValue(mevcutBakiye),
    mailKisileri: row?.mailKisileri || row?.contacts || [],
  };
}

function normalizeCompanyMatchText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /[^a-z0-9\u011f\u00fc\u015f\u0131\u00f6\u00e7\u0130\u011e\u00dc\u015e\u00d6\u00c7]+/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCompanyMatchText(value) {
  const stopWords = new Set([
    "a",
    "s",
    "as",
    "as",
    "anonim",
    "ltd",
    "limited",
    "sti",
    "sti",
    "sirketi",
    "sirketi",
    "san",
    "sanayi",
    "tic",
    "ticaret",
    "ve",
  ]);
  return normalizeCompanyMatchText(value)
    .split(" ")
    .filter((part) => part.length > 1 && !stopWords.has(part))
    .join(" ");
}

function companySimilarityScore(left, right) {
  const a = canonicalCompanyMatchText(left);
  const b = canonicalCompanyMatchText(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 92;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const common = [...aTokens].filter((token) => bTokens.has(token)).length;
  const total = new Set([...aTokens, ...bTokens]).size || 1;
  return Math.round((common / total) * 100);
}

function emptyCompanyForm() {
  return {
    firmaAdi: "",
    kisaAd: "",
    firmaTipi: "SATICI",
    resmiGayri: "RESMI",
    vergiNo: "",
    vergiDairesi: "",
    telefon: "",
    email: "",
    adres: "",
    varsayilanKdv: 20,
    acilisBakiyesi: 0,
    acilisBakiyeTarihi: "",
    borcAlacakYonu: "BORC",
    devredenKdv: 0,
    devredenKdvAyi: "",
    vadeGunu: "",
    riskLimiti: 0,
    not: "",
    aktif: true,
    firmaTuru: "TEDARIKCI",
    varsayilanRaporKategoriId: "",
    companyTransactionProfile: "SUPPLIER",
    expenseCalculationMode: "FULL",
    defaultVatType: "INDIRILECEK_KDV",
    currentAccountPostingMode: "FULL_DOCUMENT",
    vatPayablePercentage: 0,
    trackReceivablePayable: true,
    defaultCashSettlement: false,
    defaultReportBehavior: "KONTROL_BEKLIYOR",
    defaultGeneralExpense: "KONTROL_BEKLIYOR",
  };
}

function profileForFirmType(firmaTipi) {
  if (firmaTipi === "MUSTERI") return "CUSTOMER";
  if (firmaTipi === "BOTH") return "CUSTOMER_SUPPLIER";
  return "SUPPLIER";
}

function accountingModeOf(form) {
  if (
    form.companyTransactionProfile === "VAT_ONLY_EXPENSE" ||
    form.expenseCalculationMode === "VAT_ONLY"
  ) {
    return "SADECE_KDV";
  }
  if (
    form.trackReceivablePayable !== false &&
    form.defaultVatType === "KDV_YOK"
  ) {
    return "SADECE_CARI";
  }
  if (form.companyTransactionProfile === "UNOFFICIAL_EXPENSE")
    return "GAYRI_GIDER";
  if (
    form.companyTransactionProfile === "CASH_EXPENSE" ||
    form.trackReceivablePayable === false ||
    form.defaultCashSettlement === true
  ) {
    return "PESIN_KDV";
  }
  return "CARI_TAKIP";
}

function officialAccountingModeOf(form) {
  if (accountingModeOf(form) === "SADECE_KDV") return "RESMI_SADECE_KDV";
  if (accountingModeOf(form) === "SADECE_CARI") return "RESMI_SADECE_CARI";
  if (
    form.companyTransactionProfile === "UNOFFICIAL_EXPENSE" ||
    form.resmiGayri === "GAYRI"
  ) {
    return "GAYRI_GIDER";
  }
  if (accountingModeOf(form) === "PESIN_KDV") return "RESMI_PESIN_KDV";
  return "RESMI_CARI";
}

function applyAccountingMode(current, mode) {
  if (mode === "SADECE_KDV") {
    return {
      ...current,
      companyTransactionProfile: "VAT_ONLY_EXPENSE",
      expenseCalculationMode: "VAT_ONLY",
      trackReceivablePayable: false,
      defaultCashSettlement: true,
      defaultVatType: "INDIRILECEK_KDV",
      currentAccountPostingMode: "VAT_PERCENTAGE",
      defaultReportBehavior: "DAHIL",
      defaultGeneralExpense: "GIDER_DISI",
      firmaTuru:
        current?.firmaTuru && current?.firmaTuru !== "TEDARIKCI"
          ? current?.firmaTuru
          : "HIZMET_SAGLAYICI",
    };
  }
  if (mode === "PESIN_KDV") {
    return {
      ...current,
      companyTransactionProfile: "CASH_EXPENSE",
      expenseCalculationMode: "FULL",
      trackReceivablePayable: false,
      defaultCashSettlement: true,
      defaultVatType: "INDIRILECEK_KDV",
      currentAccountPostingMode: "NONE",
      firmaTuru:
        current?.firmaTuru && current?.firmaTuru !== "TEDARIKCI"
          ? current?.firmaTuru
          : "HIZMET_SAGLAYICI",
    };
  }
  if (mode === "GAYRI_GIDER") {
    return {
      ...current,
      companyTransactionProfile: "UNOFFICIAL_EXPENSE",
      expenseCalculationMode: "FULL",
      trackReceivablePayable: true,
      defaultCashSettlement: false,
      defaultVatType: "KDV_YOK",
      currentAccountPostingMode: "FULL_DOCUMENT",
      resmiGayri: "GAYRI",
      varsayilanKdv: 0,
      devredenKdv: 0,
    };
  }
  if (mode === "SADECE_CARI") {
    return {
      ...current,
      companyTransactionProfile: profileForFirmType(current?.firmaTipi),
      expenseCalculationMode: "FULL",
      trackReceivablePayable: true,
      defaultCashSettlement: false,
      defaultVatType: "KDV_YOK",
      currentAccountPostingMode: "FULL_DOCUMENT",
      varsayilanKdv: 0,
      devredenKdv: 0,
      defaultReportBehavior: "HARIC",
      defaultGeneralExpense: "GIDER_DISI",
    };
  }
  return {
    ...current,
    companyTransactionProfile: profileForFirmType(current?.firmaTipi),
    expenseCalculationMode: "FULL",
    trackReceivablePayable: true,
    defaultCashSettlement: false,
    defaultVatType: "INDIRILECEK_KDV",
    currentAccountPostingMode: "FULL_DOCUMENT",
  };
}

function applyOfficialAccountingMode(current, mode) {
  if (mode === "RESMI_SADECE_KDV") {
    return {
      ...applyAccountingMode(current, "SADECE_KDV"),
      resmiGayri: "RESMI",
    };
  }
  if (mode === "RESMI_PESIN_KDV") {
    return {
      ...applyAccountingMode(current, "PESIN_KDV"),
      resmiGayri: "RESMI",
    };
  }
  if (mode === "RESMI_SADECE_CARI") {
    return {
      ...applyAccountingMode(current, "SADECE_CARI"),
      resmiGayri: "RESMI",
    };
  }
  if (mode === "GAYRI_GIDER") {
    return {
      ...applyAccountingMode(current, "GAYRI_GIDER"),
      resmiGayri: "GAYRI",
    };
  }
  return {
    ...applyAccountingMode(current, "CARI_TAKIP"),
    resmiGayri: "RESMI",
  };
}

function officialAccountingLabel(form) {
  const mode = officialAccountingModeOf(form);
  if (mode === "RESMI_SADECE_KDV") return "Resmi - sadece KDV / gider dışı";
  if (mode === "RESMI_PESIN_KDV") return "Resmi - peşin alış / KDV";
  if (mode === "RESMI_SADECE_CARI") return "Resmi - sadece cari / KDV yok";
  if (mode === "GAYRI_GIDER") return "Gayri resmi gider";
  return "Resmi - cari takip";
}

function CompanyCards({ activeMainCompany, refreshKey, reloadAll }) {
  const [filters, setFilters] = useState({
    search: "",
    firmType: "",
    officialType: "",
    active: "active",
    balanceType: "",
    sort: "BALANCE_ABS_DESC",
  });
  const state = useEndpoint(
    "/muhasebe/firmalar",
    activeMainCompany,
    refreshKey,
    {
      q: filters.search || undefined,
      type: filters.firmType || undefined,
      officialType: filters.officialType || undefined,
      active: filters.active,
      balanceType: filters.balanceType || undefined,
      limit: 500,
      sort: filters.sort || "BALANCE_ABS_DESC",
    },
  );
  const companies = asArray(state.data).map(normalizeFirm);
  const categoryState = useEndpoint(
    "/muhasebe/rapor-kategorileri",
    activeMainCompany,
    refreshKey,
  );
  const reportCategories = asArray(categoryState.data);
  const [selectedId, setSelectedId] = useState("");
  const [isNewFirm, setIsNewFirm] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [savingFirm, setSavingFirm] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [hiddenFirmIds, setHiddenFirmIds] = useState([]);
  const [selectedFirmIds, setSelectedFirmIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    mode: "RESMI_PESIN_KDV",
    categoryId: "",
    reportBehavior: "DAHIL",
    generalExpense: "GENEL_GIDER",
    vatPayablePercentage: 0,
  });
  const visibleCompanies = useMemo(
    () =>
      companies.filter((row) => {
        if (hiddenFirmIds.includes(row?.id)) return false;
        if (filters.active === "active" && row.aktif === false) return false;
        if (filters.active === "passive" && row?.aktif !== false) return false;
        return true;
      }),
    [companies, filters.active, hiddenFirmIds],
  );
  const selected = isNewFirm
    ? {}
    : visibleCompanies.find(
        (row) => row.id === (selectedId || visibleCompanies[0].id),
      ) ||
      visibleCompanies[0] ||
      {};
  const [form, setForm] = useState(emptyCompanyForm());
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quick") !== "cari") return;
    setIsNewFirm(true);
    setSelectedId("");
    setFeedback("Hızlı cari: firma bilgilerini girip Firma Kaydet düğmesine basın.");
    params.delete("quick");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? "?" + query : ""),
    );
  }, []);
  const filteredReportCategories = useMemo(() => {
    const needle = categorySearch.trim().toLocaleLowerCase("tr-TR");
    return reportCategories.filter((category) => {
      if (category.aktifMi === false) return false;
      if (!needle) return true;
      return String(category.ad || "")
        .toLocaleLowerCase("tr-TR")
        .includes(needle);
    });
  }, [reportCategories, categorySearch]);
  const similarCompanies = useMemo(() => {
    const name = form.firmaAdi.trim();
    const taxNo = String(form.vergiNo || "").trim();
    if (!name && !taxNo) return [];
    return visibleCompanies
      .filter((row) => row?.id !== selected.id)
      .map((row) => {
        const sameTax = taxNo && row?.vergiNo && String(row?.vergiNo) === taxNo;
        return {
          ...row,
          score: sameTax ? 100 : companySimilarityScore(name, row?.firmaAdi),
          reason: sameTax ? "Vergi no aynı" : "Firma adı benziyor",
        };
      })
      .filter((row) => row?.score >= 72)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [visibleCompanies, form.firmaAdi, form.vergiNo, selected?.id]);

  useEffect(() => {
    if (isNewFirm) return;
    if (!visibleCompanies.length) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !visibleCompanies.some((row) => row.id === selectedId)) {
      setSelectedId(visibleCompanies[0].id);
    }
  }, [visibleCompanies, isNewFirm, selectedId]);

  useEffect(() => {
    if (isNewFirm) {
      setForm(emptyCompanyForm());
      return;
    }
    setForm({
      ...emptyCompanyForm(),
      firmaAdi: selected.firmaAdi || "",
      kisaAd: selected.kisaAd || "",
      firmaTipi: selected.firmaTipi || "SATICI",
      resmiGayri: selected.resmiGayri || "RESMI",
      vergiNo: selected.vergiNo || "",
      vergiDairesi: selected.vergiDairesi || "",
      telefon: selected.telefon || "",
      email: selected.email || "",
      adres: selected.adres || "",
      varsayilanKdv: selected.varsayilanKdv ?? 20,
      acilisBakiyesi: selected.acilisBakiyesi ?? 0,
      acilisBakiyeTarihi: String(selected.acilisBakiyeTarihi || "").slice(
        0,
        10,
      ),
      borcAlacakYonu: selected.borcAlacakYonu || "BORC",
      devredenKdv: selected.devredenKdv ?? 0,
      devredenKdvAyi: selected.devredenKdvAyi || "",
      vadeGunu: selected.vadeGunu ?? "",
      riskLimiti: selected.riskLimiti ?? 0,
      mevcutBakiye: selected.mevcutBakiye ?? selected.bakiye ?? 0,
      not: selected.not || "",
      aktif: selected.aktif ?? true,
      firmaTuru: selected.firmaTuru || selected.firmaTipi || "TEDARIKCI",
      varsayilanRaporKategoriId:
        selected.varsayilanRaporKategoriId || selected.raporKategorisiId || "",
      companyTransactionProfile:
        selected.companyTransactionProfile ||
        selected.calismaProfili ||
        profileForFirmType(selected.firmaTipi),
      expenseCalculationMode:
        selected.expenseCalculationMode ||
        selected.giderHesaplamaTipi ||
        (selected.vatOnlyExpense ? "VAT_ONLY" : "FULL"),
      defaultVatType:
        selected.defaultVatType ||
        selected.varsayilanKdvTipi ||
        (selected.resmiGayri === "GAYRI" ? "KDV_YOK" : "INDIRILECEK_KDV"),
      currentAccountPostingMode:
        selected.currentAccountPostingMode ||
        selected.cariKayitModu ||
        (selected.vatOnlyExpense
          ? "VAT_PERCENTAGE"
          : selected.trackReceivablePayable === false
            ? "NONE"
            : "FULL_DOCUMENT"),
      vatPayablePercentage: Number(
        selected.vatPayablePercentage ?? selected.kdvCariBorcYuzdesi ?? 0,
      ),
      trackReceivablePayable:
        selected.trackReceivablePayable !== false &&
        selected.cariTakipDisi !== true,
      defaultCashSettlement: Boolean(
        selected.defaultCashSettlement || selected.varsayilanPesinKapama,
      ),
      defaultReportBehavior:
        selected.defaultReportBehavior ||
        selected.varsayilanRaporDavranisi ||
        "KONTROL_BEKLIYOR",
      defaultGeneralExpense:
        selected.defaultGeneralExpense ||
        selected.genelGiderVarsayilani ||
        "KONTROL_BEKLIYOR",
    });
  }, [isNewFirm, selected.acilisBakiyeTarihi, selected.acilisBakiyesi, selected.adres, selected.aktif, selected.bakiye, selected.borcAlacakYonu, selected.calismaProfili, selected.cariKayitModu, selected.cariTakipDisi, selected.companyTransactionProfile, selected.currentAccountPostingMode, selected.defaultCashSettlement, selected.defaultGeneralExpense, selected.defaultReportBehavior, selected.defaultVatType, selected.devredenKdv, selected.devredenKdvAyi, selected.email, selected.expenseCalculationMode, selected.firmaAdi, selected.firmaTipi, selected.firmaTuru, selected.genelGiderVarsayilani, selected.giderHesaplamaTipi, selected.id, selected.kdvCariBorcYuzdesi, selected.kisaAd, selected.mevcutBakiye, selected.not, selected.raporKategorisiId, selected.resmiGayri, selected.riskLimiti, selected.telefon, selected.trackReceivablePayable, selected.vadeGunu, selected.varsayilanKdv, selected.varsayilanKdvTipi, selected.varsayilanPesinKapama, selected.varsayilanRaporDavranisi, selected.varsayilanRaporKategoriId, selected.vatOnlyExpense, selected.vatPayablePercentage, selected.vergiDairesi, selected.vergiNo]);

  const payload = {
    ...companyParams(activeMainCompany),
    id: selected.id,
    firmaAdi: form.firmaAdi,
    name: form.firmaAdi,
    firma: form.firmaAdi,
    shortName: form.kisaAd,
    firmaTipi: form.firmaTipi,
    type: form.firmaTipi,
    firmType: form.firmaTipi,
    resmiGayri: form.resmiGayri,
    defaultRecordType: form.resmiGayri,
    workType: form.resmiGayri,
    officialType: form.resmiGayri,
    vergiNo: form.vergiNo,
    taxNo: form.vergiNo,
    vergiDairesi: form.vergiDairesi,
    taxOffice: form.vergiDairesi,
    telefon: form.telefon,
    phone: form.telefon,
    email: form.email,
    eposta: form.email,
    adres: form.adres,
    address: form.adres,
    varsayilanKdv: Number(form.varsayilanKdv || 0),
    defaultVatRate: Number(form.varsayilanKdv || 0),
    openingBalance: Number(form.acilisBakiyesi || 0),
    openingBalanceDate: form.acilisBakiyeTarihi || null,
    openingBalanceDirection: form.borcAlacakYonu,
    openingVatAmount: Number(form.devredenKdv || 0),
    openingVatPeriod: form.devredenKdvAyi,
    dueDay: form.vadeGunu === "" ? null : Number(form.vadeGunu),
    riskLimit: Number(form.riskLimiti || 0),
    cariNotu: form.not,
    note: form.not,
    not: form.not,
    isActive: Boolean(form.aktif),
    aktif: Boolean(form.aktif),
    firmaTuru: form.firmaTuru,
    varsayilanRaporKategoriId: form.varsayilanRaporKategoriId || null,
    raporKategoriId: form.varsayilanRaporKategoriId || null,
    defaultReportBehavior: form.defaultReportBehavior,
    varsayilanRaporDavranisi: form.defaultReportBehavior,
    defaultGeneralExpense: form.defaultGeneralExpense,
    genelGiderVarsayilani: form.defaultGeneralExpense,
    companyTransactionProfile: form.companyTransactionProfile,
    calismaProfili: form.companyTransactionProfile,
    expenseCalculationMode: form.expenseCalculationMode || "FULL",
    giderHesaplamaTipi: form.expenseCalculationMode || "FULL",
    currentAccountPostingMode: form.currentAccountPostingMode,
    cariKayitModu: form.currentAccountPostingMode,
    vatPayablePercentage: Math.min(
      100,
      Math.max(0, Number(form.vatPayablePercentage || 0)),
    ),
    kdvCariBorcYuzdesi: Math.min(
      100,
      Math.max(0, Number(form.vatPayablePercentage || 0)),
    ),
    trackReceivablePayable: Boolean(form.trackReceivablePayable),
    cariTakipEdilsin: Boolean(form.trackReceivablePayable),
    defaultCashSettlement: Boolean(form.defaultCashSettlement),
    varsayilanPesinKapama: Boolean(form.defaultCashSettlement),
    defaultSupplierPostingType: form.trackReceivablePayable
      ? "OPEN_PAYABLE"
      : form.expenseCalculationMode === "VAT_ONLY"
        ? "VAT_ONLY_EXPENSE"
        : "PAID_EXPENSE",
    varsayilanTedarikciIslemTipi: form.trackReceivablePayable
      ? "OPEN_PAYABLE"
      : form.expenseCalculationMode === "VAT_ONLY"
        ? "VAT_ONLY_EXPENSE"
        : "PAID_EXPENSE",
    defaultPaymentStatus: form.defaultCashSettlement ? "PAID" : "UNPAID",
    varsayilanOdemeDurumu: form.defaultCashSettlement ? "PAID" : "UNPAID",
    defaultVatType: form.defaultVatType,
    varsayilanKdvTipi: form.defaultVatType,
  };

  const save = async (event) => {
    event?.preventDefault();
    if (isNewFirm && similarCompanies.length) {
      setFeedback(
        "Benzer firma bulundu. Tek firma kalması için önce önerilen kayıtla eşleştirin veya mevcut firmayı açıp güncelleyin.",
      );
      return;
    }
    setSavingFirm(true);
    try {
      const response =
        !isNewFirm && selected.id
          ? await apiPatch(
              `/muhasebe/firmalar/${encodeURIComponent(selected.id)}`,
              payload,
            )
          : await apiPost("/muhasebe/firmalar", payload);
      const saved = unwrap(response);
      if (saved?.id) {
        await apiPost("/muhasebe/accounting/sync/company-rules", {
          ...companyParams(activeMainCompany),
          companyId: saved.id,
          dryRun: false,
          preserveExplicitOverrides: true,
        });
      }
      if (!isNewFirm && selected.id) {
        const currentBalance = parseMoneyInput(selected.mevcutBakiye ?? 0);
        const targetBalance = parseMoneyInput(form.mevcutBakiye);
        if (Math.abs(currentBalance - targetBalance) >= 0.005) {
          await apiPost(
            `/muhasebe/firma-kartlari/${encodeURIComponent(selected.id)}/adjust-balance`,
            {
              ...companyParams(activeMainCompany),
              targetBalance,
              description: "Firma kartindan mevcut bakiye duzeltme",
            },
          );
        }
      }
      if (saved?.id) setSelectedId(saved?.id);
      setFeedback("Firma kaydedildi.");
      setIsNewFirm(false);
      reloadAll();
    } catch (error) {
      const candidates = error?.payload.candidates || [];
      setFeedback(
        candidates.length
          ? "Backend de benzer firma yakaladı. Önerilen kayıtla eşleştirin."
          : error?.message || "Firma kaydedilemedi.",
      );
    } finally {
      setSavingFirm(false);
    }
  };

  const linkAsAlias = async (targetCompany) => {
    if (!targetCompany.id || !form.firmaAdi.trim()) return;
    setSavingFirm(true);
    try {
      const response =
        selected.id && !isNewFirm
          ? await apiPost(
              `/muhasebe/firmalar/${encodeURIComponent(selected.id)}/merge-into/${encodeURIComponent(targetCompany.id)}`,
              {
                ...companyParams(activeMainCompany),
                source: "FIRMA_KARTI_ONERI",
              },
            )
          : await apiPost(
              `/muhasebe/firmalar/${encodeURIComponent(targetCompany.id)}/alias`,
              {
                ...companyParams(activeMainCompany),
                rawName: form.firmaAdi,
                taxNo: form.vergiNo,
                source: "FIRMA_KARTI_ONERI",
              },
            );
      const saved = unwrap(response);
      if (selected.id && !isNewFirm) {
        setHiddenFirmIds((current) => [...new Set([...current, selected.id])]);
      }
      setSelectedId(saved?.id || targetCompany.id);
      setIsNewFirm(false);
      setForm((current) => ({
        ...current,
        firmaAdi: targetCompany.firmaAdi || current?.firmaAdi,
        vergiNo: targetCompany.vergiNo || current?.vergiNo,
      }));
      setFeedback(
        selected.id && !isNewFirm
          ? `"${form.firmaAdi}" kaydı "${targetCompany.firmaAdi}" firmasına birleştirildi. Hareketler tek firmaya taşındı.`
          : `"${form.firmaAdi}" adı "${targetCompany.firmaAdi}" firmasına eşleştirildi. Yeni firma açılmadı.`,
      );
      reloadAll();
    } catch (error) {
      setFeedback(error?.message || "Firma eşleştirmesi kaydedilemedi.");
    } finally {
      setSavingFirm(false);
    }
  };

  const passiveFirm = async () => {
    if (!selected.id) return;
    await apiPost(
      `/muhasebe/firmalar/${encodeURIComponent(selected.id)}/pasife-al`,
      {
        ...companyParams(activeMainCompany),
        isActive: false,
        aktif: false,
      },
    );
    setFeedback("Firma pasife alındı.");
    setSelectedId("");
    setIsNewFirm(false);
    reloadAll();
  };

  const clearForm = () => {
    setIsNewFirm(true);
    setSelectedId("");
    setFeedback("");
    setForm(emptyCompanyForm());
  };

  const applyBulk = async () => {
    if (!selectedFirmIds.length)
      return setFeedback("Seri işlem için en az bir firma seçin.");
    const modeForm = applyOfficialAccountingMode(
      emptyCompanyForm(),
      bulkForm.mode,
    );
    setBulkSaving(true);
    try {
      await apiPost("/muhasebe/firmalar/toplu-siniflandirma", {
        ...companyParams(activeMainCompany),
        ids: selectedFirmIds,
        companyTransactionProfile: modeForm.companyTransactionProfile,
        expenseCalculationMode: modeForm.expenseCalculationMode,
        trackReceivablePayable: modeForm.trackReceivablePayable,
        defaultCashSettlement: modeForm.defaultCashSettlement,
        defaultSupplierPostingType: modeForm.trackReceivablePayable
          ? "OPEN_PAYABLE"
          : modeForm.expenseCalculationMode === "VAT_ONLY"
            ? "VAT_ONLY_EXPENSE"
            : "PAID_EXPENSE",
        defaultPaymentStatus: modeForm.defaultCashSettlement
          ? "PAID"
          : "UNPAID",
        defaultVatType:
          ["GAYRI_GIDER", "RESMI_SADECE_CARI"].includes(bulkForm.mode)
            ? "KDV_YOK"
            : "INDIRILECEK_KDV",
        currentAccountPostingMode:
          bulkForm.mode === "RESMI_SADECE_KDV"
            ? "VAT_PERCENTAGE"
            : modeForm.trackReceivablePayable
              ? "FULL_DOCUMENT"
              : "NONE",
        vatPayablePercentage:
          bulkForm.mode === "RESMI_SADECE_KDV"
            ? Math.min(100, Math.max(0, Number(bulkForm.vatPayablePercentage || 0)))
            : 0,
        varsayilanRaporKategoriId: bulkForm.categoryId || undefined,
        defaultReportBehavior: bulkForm.reportBehavior,
        defaultGeneralExpense: bulkForm.generalExpense,
      });
      setFeedback(`${selectedFirmIds.length} firma seri işlemle güncellendi.`);
      setSelectedFirmIds([]);
      setBulkOpen(false);
      reloadAll();
    } catch (error) {
      setFeedback(error?.message || "Seri işlem uygulanamadı.");
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className="mh-layout-3 contact mh-company-cards-page">
      <Card title="Firma Listesi">
        <div className="mh-action-stack">
          <input
            placeholder="Firma adı / kod / vergi no ara"
            value={filters.search}
            onChange={(event) =>
              setFilters({ ...filters, search: event?.target.value })
            }
          />
          <div className="mh-inline-actions mh-list-sort-actions">
            <button
              className={`mh-btn ${filters.sort === "BALANCE_ABS_ASC" ? "primary" : ""}`}
              type="button"
              title="Bakiyeye göre azdan çoğa sırala"
              aria-label="Bakiyeye göre azdan çoğa sırala"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  sort: "BALANCE_ABS_ASC",
                }))
              }
            >
              <span className="mh-sort-icon asc" aria-hidden="true" />
            </button>
            <button
              className={`mh-btn ${filters.sort === "BALANCE_ABS_DESC" ? "primary" : ""}`}
              type="button"
              title="Bakiyeye göre çoktan aza sırala"
              aria-label="Bakiyeye göre çoktan aza sırala"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  sort: "BALANCE_ABS_DESC",
                }))
              }
            >
              <span className="mh-sort-icon desc" aria-hidden="true" />
            </button>
          </div>
          <div className="mh-form-grid two mh-list-filter-grid">
            <select
              value={filters.firmType}
              onChange={(event) =>
                setFilters({ ...filters, firmType: event?.target.value })
              }
            >
              <option value="">Müşteri / satıcı</option>
              <option value="MUSTERI">Müşteri</option>
              <option value="SATICI">Satıcı</option>
              <option value="BOTH">İkisi</option>
            </select>
            <select
              value={filters.officialType}
              onChange={(event) =>
                setFilters({ ...filters, officialType: event?.target.value })
              }
            >
              <option value="">Resmi / gayri</option>
              <option value="RESMI">Resmi</option>
              <option value="GAYRI">Gayri</option>
              <option value="BOTH">İkisi</option>
            </select>
          </div>
          <div className="mh-company-bulk-bar">
            {selectionMode ? <label>
              <input
                type="checkbox"
                checked={
                  visibleCompanies.length > 0 &&
                  selectedFirmIds.length === visibleCompanies.length
                }
                onChange={(event) =>
                  setSelectedFirmIds(
                    event.target.checked
                      ? visibleCompanies.map((row) => row.id)
                      : [],
                  )
                }
              />{" "}
              Tümünü seç
            </label> : null}
            <button
              className={`mh-btn ${selectionMode ? "" : "primary"}`}
              type="button"
              onClick={() => {
                if (!selectionMode) setSelectionMode(true);
                else if (selectedFirmIds.length) setBulkOpen(true);
                else { setSelectionMode(false); setSelectedFirmIds([]); }
              }}
            >
              {selectionMode ? selectedFirmIds.length ? `Ayarları Aç (${selectedFirmIds.length})` : "Seri İşlemi Kapat" : "Seri İşlem Modu"}
            </button>
          </div>
        </div>
        {bulkOpen ? (
          <div className="mh-company-bulk-panel">
            <div className="mh-company-bulk-title"><div><strong>Seçili Firmaları Toplu Düzenle</strong><span>{selectedFirmIds.length} firma seçildi</span></div><button type="button" onClick={() => setBulkOpen(false)} aria-label="Kapat">×</button></div>
            <label>
              İşlem davranışı
              <select
                value={bulkForm.mode}
                onChange={(event) => {
                  const mode = event.target.value;
                  setBulkForm({
                    ...bulkForm,
                    mode,
                    reportBehavior:
                      mode === "RESMI_SADECE_CARI"
                        ? "HARIC"
                        : bulkForm.reportBehavior,
                    generalExpense:
                      ["RESMI_SADECE_CARI", "RESMI_SADECE_KDV"].includes(mode)
                        ? "GIDER_DISI"
                        : bulkForm.generalExpense,
                  });
                }}
              >
                <option value="RESMI_PESIN_KDV">
                  Peşin gider + indirilecek KDV (cari borç yok)
                </option>
                <option value="RESMI_CARI">Vadeli alış / cari borç</option>
                <option value="RESMI_SADECE_KDV">
                  Sadece KDV / gider dışı
                </option>
                <option value="RESMI_SADECE_CARI">
                  Sadece cari / KDV yok
                </option>
                <option value="GAYRI_GIDER">Gayri resmi gider</option>
              </select>
            </label>
            {bulkForm.mode === "RESMI_SADECE_KDV" ? (
              <label>
                KDV'den cari borç oranı (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={bulkForm.vatPayablePercentage}
                  onChange={(event) =>
                    setBulkForm({
                      ...bulkForm,
                      vatPayablePercentage: event.target.value,
                    })
                  }
                />
              </label>
            ) : null}
            <label>
              Rapor kategorisi
              <select
                value={bulkForm.categoryId}
                onChange={(event) =>
                  setBulkForm({ ...bulkForm, categoryId: event.target.value })
                }
              >
                <option value="">Kategori değişmesin</option>
                {filteredReportCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.ad}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rapor
              <select
                value={bulkForm.reportBehavior}
                onChange={(event) =>
                  setBulkForm({
                    ...bulkForm,
                    reportBehavior: event.target.value,
                  })
                }
              >
                <option value="DAHIL">Rapora dahil</option>
                <option value="KONTROL_BEKLIYOR">Kontrol bekliyor</option>
                <option value="HARIC">Hariç</option>
              </select>
            </label>
            <label>
              Gider
              <select
                value={bulkForm.generalExpense}
                onChange={(event) =>
                  setBulkForm({
                    ...bulkForm,
                    generalExpense: event.target.value,
                  })
                }
              >
                <option value="GENEL_GIDER">Genel gider</option>
                <option value="KONTROL_BEKLIYOR">Kontrol bekliyor</option>
                <option value="GIDER_DISI">Gider dışı</option>
              </select>
            </label>
            <div className="mh-company-bulk-footer"><button className="mh-btn" type="button" onClick={() => setBulkOpen(false)}>Vazgeç</button><button className="mh-btn primary" type="button" disabled={bulkSaving || !selectedFirmIds.length} onClick={applyBulk}>{bulkSaving ? "Uygulanıyor..." : "Seçilen Firmalara Uygula"}</button></div>
          </div>
        ) : null}
        <StatusBlock state={state} emptyText="Firma kartı bulunamadı." />
        <div className="mh-doc-list">
          {visibleCompanies.map((row) => (
            <div className={`mh-company-select-row ${selectionMode ? "selecting" : ""}`} key={row?.id}>
              {selectionMode ? <input
                type="checkbox"
                checked={selectedFirmIds.includes(row.id)}
                onChange={() =>
                  setSelectedFirmIds((current) =>
                    current.includes(row.id)
                      ? current.filter((id) => id !== row.id)
                      : [...current, row.id],
                  )
                }
                aria-label={`${row.firmaAdi} seç`}
              /> : null}
              <FirmListButton
                key={row?.id}
                row={row}
                active={selected.id === row?.id}
                onClick={() => {
                  setIsNewFirm(false);
                  setSelectedId(row?.id);
                }}
              />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Firma Kartı">
        <form onSubmit={save}>
          {feedback ? <div className="mh-state">{feedback}</div> : null}
          <div className="mh-form-grid three">
            <Field label="Firma Adı">
              <input
                value={form.firmaAdi}
                onChange={(event) =>
                  setForm({ ...form, firmaAdi: event?.target.value })
                }
              />
            </Field>
            <Field label="Firma Tipi">
              <select
                value={form.firmaTipi}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    firmaTipi: event?.target.value,
                    companyTransactionProfile:
                      officialAccountingModeOf(current) === "RESMI_CARI"
                        ? profileForFirmType(event?.target.value)
                        : current?.companyTransactionProfile,
                  }))
                }
              >
                <option value="MUSTERI">Müşteri</option>
                <option value="SATICI">Satıcı</option>
                <option value="BOTH">İkisi</option>
              </select>
            </Field>
            <Field label="Resmi/Gayri">
              <select
                value={officialAccountingModeOf(form)}
                onChange={(event) =>
                  setForm((current) =>
                    applyOfficialAccountingMode(current, event?.target.value),
                  )
                }
              >
                <option value="RESMI_CARI">Resmi - cari takip</option>
                <option value="RESMI_PESIN_KDV">
                  Resmi - peşin alış / KDV
                </option>
                <option value="RESMI_SADECE_KDV">
                  Resmi - sadece KDV / gider dışı
                </option>
                <option value="RESMI_SADECE_CARI">
                  Resmi - sadece cari / KDV yok
                </option>
                <option value="GAYRI_GIDER">Gayri resmi gider</option>
              </select>
              {officialAccountingModeOf(form) === "RESMI_PESIN_KDV" ? (
                <div className="muted-small">
                  Bakiye bilgi olarak görünür; alacaklı/borçlu sayılmaz.
                </div>
              ) : null}
              {officialAccountingModeOf(form) === "RESMI_SADECE_KDV" ? (
                <div className="muted-small">
                  Matrah gider olmaz; KDV kaydı kalır. Aşağıdaki yüzde kadar
                  firma borcu otomatik oluşur.
                </div>
              ) : null}
            </Field>
            <Field label="Rapor Kategorisi">
              <input
                value={categorySearch}
                onChange={(event) => setCategorySearch(event?.target.value)}
                placeholder="Kategori ara"
              />
              <select
                value={form.varsayilanRaporKategoriId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    varsayilanRaporKategoriId: event?.target.value,
                  })
                }
              >
                <option value="">Kategori seçilmedi</option>
                {filteredReportCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.ad}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Varsayılan Rapor Davranışı">
              <select
                value={form.defaultReportBehavior}
                onChange={(event) =>
                  setForm({
                    ...form,
                    defaultReportBehavior: event.target.value,
                  })
                }
              >
                <option value="KONTROL_BEKLIYOR">Kontrol Bekliyor</option>
                <option value="DAHIL">Rapora Dahil</option>
                <option value="HARIC">Rapordan Hariç</option>
              </select>
            </Field>
            <Field label="Genel Gider Varsayılanı">
              <select
                value={form.defaultGeneralExpense}
                onChange={(event) =>
                  setForm({
                    ...form,
                    defaultGeneralExpense: event.target.value,
                  })
                }
              >
                <option value="KONTROL_BEKLIYOR">Kontrol Bekliyor</option>
                <option value="GENEL_GIDER">Genel Gider</option>
                <option value="GIDER_DISI">Gider Dışı</option>
              </select>
            </Field>
            {officialAccountingModeOf(form) === "RESMI_SADECE_KDV" ? (
              <Field label="KDV'den Cari Borç Oranı (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.vatPayablePercentage}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      vatPayablePercentage: event.target.value,
                    })
                  }
                />
                <span className="muted-small">
                  Örnek: Gelen KDV 100.000 TL, oran %30 ise firmaya 30.000 TL
                  borç yazılır.
                </span>
              </Field>
            ) : null}
            <Field label="Vergi No">
              <input
                value={form.vergiNo}
                onChange={(event) =>
                  setForm({ ...form, vergiNo: event?.target.value })
                }
              />
            </Field>
            <Field label="Varsayılan KDV">
              <input
                type="number"
                value={form.varsayilanKdv}
                disabled={form.companyTransactionProfile === "UNOFFICIAL_EXPENSE"}
                onChange={(event) =>
                  setForm({ ...form, varsayilanKdv: event?.target.value })
                }
              />
            </Field>
            <Field label="Mevcut Bakiye">
              <input
                value={form.mevcutBakiye}
                onChange={(event) =>
                  setForm({ ...form, mevcutBakiye: event?.target.value })
                }
                onBlur={() =>
                  setForm((current) => ({
                    ...current,
                    mevcutBakiye: parseMoneyInput(current?.mevcutBakiye),
                  }))
                }
              />
            </Field>
            <Field label="Devreden KDV">
              <input
                type="number"
                value={form.devredenKdv}
                disabled={form.companyTransactionProfile === "UNOFFICIAL_EXPENSE"}
                onChange={(event) =>
                  setForm({ ...form, devredenKdv: event?.target.value })
                }
              />
            </Field>
          </div>
          {similarCompanies.length ? (
            <div className="mh-duplicate-panel">
              <strong>Kayıtlı firma olabilir</strong>
              <p>
                Bu isim kayıtlı firmaya benziyor. Tek firma kalması için yeni
                kart açmak yerine eşleştirme yapın; mevcut çift kayıtta
                hareketler hedef firmaya taşınır.
              </p>
              <div className="mh-duplicate-list">
                {similarCompanies.map((company) => (
                  <div className="mh-duplicate-row" key={company?.id}>
                    <div>
                      <b>{company?.firmaAdi}</b>
                      <span>
                        {company?.reason} · %{company?.score}
                        {company?.vergiNo ? ` · VN ${company?.vergiNo}` : ""}
                      </span>
                    </div>
                    <button
                      className="mh-btn primary"
                      type="button"
                      disabled={savingFirm}
                      onClick={() => linkAsAlias(company)}
                    >
                      Bu Firmaya Eşleştir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mh-chip-row">
            <label className="mh-chip">
              <input
                type="checkbox"
                checked={Boolean(form.aktif)}
                onChange={(event) =>
                  setForm({ ...form, aktif: event?.target.checked })
                }
              />
              Aktif
            </label>
          </div>
          <div className="mh-button-row">
            <button className="mh-btn" type="button" onClick={clearForm}>
              Yeni Firma
            </button>
            <button
              className="mh-btn"
              type="button"
              disabled={!selected.id}
              onClick={passiveFirm}
            >
              Pasife Al
            </button>
            <button
              className="mh-btn primary"
              type="submit"
              disabled={
                savingFirm || (isNewFirm && similarCompanies.length > 0)
              }
            >
              {savingFirm ? "Kaydediliyor..." : "Firma Kaydet"}
            </button>
          </div>
        </form>
      </Card>
      <Card title="Firma Özeti">
        <Impact title="Firma Özeti">
          <SideLine label="Firma" value={selected.firmaAdi || "-"} />
          <SideLine label="Resmi/Gayri" value={officialAccountingLabel(form)} />
          <SideLine
            label="Mevcut bakiye"
            value={money(selected.mevcutBakiye)}
          />
          <SideLine
            label="Bakiye durumu"
            value={balanceDirectionLabel(
              selected.bakiyeYonu || selected.borcAlacakYonu,
            )}
          />
          {form.trackReceivablePayable === false ? (
            <SideLine
              label="Cari ayrımı"
              value={
                form.currentAccountPostingMode === "VAT_PERCENTAGE"
                  ? `Gelen KDV'nin %${Number(form.vatPayablePercentage || 0)} kadarı borç`
                  : "Peşin alış / KDV için bilgi"
              }
            />
          ) : null}
          <SideLine
            label="Cari takip"
            value={
              form.currentAccountPostingMode === "VAT_PERCENTAGE"
                ? "KDV yüzdesi kadar"
                : form.trackReceivablePayable === false
                  ? "Kapalı"
                  : "Açık"
            }
          />
          <SideLine label="Devreden KDV" value={money(selected.devredenKdv)} />
        </Impact>
      </Card>
    </div>
  );
}

function mapContact(row = {}) {
  return {
    id: row?.id,
    adSoyad: row?.fullName || row?.adSoyad || row?.name || "",
    departman: row?.department || row?.departman || "",
    gorev: row?.title || row?.gorev || "",
    email: row?.email || "",
    telefon: row?.phone || row?.telefon || "",
    faturaYetkilisi: row?.canReceiveInvoice ?? row?.faturaYetkilisi ?? false,
    irsaliyeYetkilisi:
      row?.canReceiveDispatch ?? row?.irsaliyeYetkilisi ?? false,
    ekstreYetkilisi: row?.canReceiveStatement ?? row?.ekstreYetkilisi ?? false,
    odemeYetkilisi:
      row?.canReceivePaymentReminder ?? row?.odemeYetkilisi ?? false,
    genelMuhasebeYetkilisi:
      row?.canReceiveGeneralAccounting ??
      row?.isGeneralAccountingCc ??
      row?.genelMuhasebeYetkilisi ??
      false,
    modelSorumlusuOlabilir:
      row?.canBeModelResponsible ?? row?.modelSorumlusuOlabilir ?? false,
    aktif: row?.isActive ?? row?.aktif ?? true,
    not: row?.note || row?.not || "",
  };
}

function FirmContacts({ activeMainCompany, refreshKey, reloadAll, goTab }) {
  const firmState = useEndpoint(
    "/muhasebe/firma-kartlari",
    activeMainCompany,
    refreshKey,
  );
  const firms = asArray(firmState.data).map(normalizeFirm);
  const [search, setSearch] = useState("");
  const visibleFirms = firms.filter((row) =>
    `${row?.firmaAdi} ${row?.kisaAd} ${row?.vergiNo}`
      .toLocaleLowerCase("tr-TR")
      .includes(search.toLocaleLowerCase("tr-TR")),
  );
  const [selectedFirmId, setSelectedFirmId] = useState("");
  const selectedFirm =
    visibleFirms.find(
      (row) => row.id === (selectedFirmId || visibleFirms[0].id),
    ) ||
    visibleFirms[0] ||
    {};
  const contacts = selectedFirm.id
    ? asArray(selectedFirm.mailKisileri).map(mapContact)
    : [];
  const contactListState = {
    loading: firmState.loading,
    error: firmState.error,
    data: contacts,
  };
  const emptyContact = useMemo(() => ({
    id: "",
    adSoyad: "",
    departman: "",
    gorev: "",
    email: "",
    telefon: "",
    faturaYetkilisi: false,
    irsaliyeYetkilisi: false,
    ekstreYetkilisi: false,
    odemeYetkilisi: false,
    genelMuhasebeYetkilisi: false,
    modelSorumlusuOlabilir: false,
    aktif: true,
    not: "",
  }), []);
  const [form, setForm] = useState(emptyContact);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm(emptyContact);
    setMessage("");
  }, [emptyContact, selectedFirm?.id]);

  const saveContact = async (event) => {
    event?.preventDefault();
    if (!selectedFirm.id) return;
    if (!form.adSoyad.trim()) {
      setMessage("Kisi adi soyadi zorunlu.");
      return;
    }
    const payload = {
      ...companyParams(activeMainCompany),
      adSoyad: form.adSoyad,
      fullName: form.adSoyad,
      departman: form.departman,
      department: form.departman,
      gorev: form.gorev,
      title: form.gorev,
      email: form.email,
      telefon: form.telefon,
      phone: form.telefon,
      faturaYetkilisi: form.faturaYetkilisi,
      canReceiveInvoice: form.faturaYetkilisi,
      irsaliyeYetkilisi: form.irsaliyeYetkilisi,
      canReceiveDispatch: form.irsaliyeYetkilisi,
      ekstreYetkilisi: form.ekstreYetkilisi,
      canReceiveStatement: form.ekstreYetkilisi,
      odemeYetkilisi: form.odemeYetkilisi,
      canReceivePaymentReminder: form.odemeYetkilisi,
      genelMuhasebeYetkilisi: form.genelMuhasebeYetkilisi,
      canReceiveGeneralAccounting: form.genelMuhasebeYetkilisi,
      modelSorumlusuOlabilir: form.modelSorumlusuOlabilir,
      canBeModelResponsible: form.modelSorumlusuOlabilir,
      aktif: form.aktif,
      isActive: form.aktif,
      not: form.not,
      note: form.not,
    };
    setBusy(true);
    setMessage("");
    try {
      if (form.id) {
        await apiPatch(
          `/muhasebe/firma-kartlari/${encodeURIComponent(selectedFirm.id)}/contacts/${encodeURIComponent(form.id)}`,
          payload,
        );
      } else {
        await apiPost(
          `/muhasebe/firma-kartlari/${encodeURIComponent(selectedFirm.id)}/contacts`,
          payload,
        );
      }
      setForm(emptyContact);
      setMessage("Yetkili kaydi guncellendi.");
      reloadAll();
    } catch (error) {
      setMessage(error?.message || "Yetkili kaydi yapilamadi.");
    } finally {
      setBusy(false);
    }
  };

  const passiveContact = async (row) => {
    if (!selectedFirm.id || !row?.id) return;
    if (!window.confirm(`${row?.adSoyad || "Secili kisi"} pasife alinsin mi`))
      return;
    setBusy(true);
    setMessage("");
    try {
      await apiDelete(
        `/muhasebe/firma-kartlari/${encodeURIComponent(selectedFirm.id)}/contacts/${encodeURIComponent(row?.id)}`,
        companyParams(activeMainCompany),
      );
      if (form.id === row?.id) setForm(emptyContact);
      setMessage("Yetkili pasife alindi.");
      reloadAll();
    } catch (error) {
      setMessage(error?.message || "Yetkili pasife alinamadi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mh-contact-layout">
      <Card title="Firma Listesi">
        <input
          placeholder="Firma adi / kod / vergi no ara"
          value={search}
          onChange={(event) => setSearch(event?.target.value)}
        />
        <StatusBlock state={firmState} emptyText="Firma bulunamadi." />
        <div className="mh-doc-list">
          {visibleFirms.map((firm) => (
            <button
              className={`mh-firm-contact-button ${selectedFirm.id === firm.id ? "active" : ""}`}
              key={firm.id}
              onClick={() => setSelectedFirmId(firm.id)}
              type="button"
            >
              <strong>{firm.firmaAdi}</strong>
              <span>{firm.kisaAd || firm.vergiNo || "Kod / vergi no yok"}</span>
              <small>
                {firm.firmaTipi || "-"} - {asArray(firm.mailKisileri).length}{" "}
                yetkili
              </small>
            </button>
          ))}
        </div>
      </Card>
      <div className="mh-contact-workspace">
        <Card title="Kisi / Yetki Kaydi">
          <div className="mh-selected-firm-strip">
            <div>
              <span>Secili firma</span>
              <strong>{selectedFirm.firmaAdi || "Firma secin"}</strong>
            </div>
            <small>{contacts.length} aktif yetkili</small>
          </div>
          {message ? <div className="mh-info-line">{message}</div> : null}
          <form className="mh-contact-form" onSubmit={saveContact}>
            <Field label="Kisi Adi Soyadi">
              <input
                value={form.adSoyad}
                onChange={(event) =>
                  setForm({ ...form, adSoyad: event?.target.value })
                }
              />
            </Field>
            <Field label="Departman">
              <input
                value={form.departman}
                onChange={(event) =>
                  setForm({ ...form, departman: event?.target.value })
                }
              />
            </Field>
            <Field label="Gorev / Unvan">
              <input
                value={form.gorev}
                onChange={(event) =>
                  setForm({ ...form, gorev: event?.target.value })
                }
              />
            </Field>
            <Field label="E-posta">
              <input
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event?.target.value })
                }
              />
            </Field>
            <Field label="Telefon">
              <input
                value={form.telefon}
                onChange={(event) =>
                  setForm({ ...form, telefon: event?.target.value })
                }
              />
            </Field>
            <Field label="Not">
              <textarea
                value={form.not}
                onChange={(event) =>
                  setForm({ ...form, not: event?.target.value })
                }
              />
            </Field>
            <div className="mh-chip-row mh-contact-permissions">
              {[
                ["faturaYetkilisi", "Fatura"],
                ["irsaliyeYetkilisi", "Irsaliye"],
                ["ekstreYetkilisi", "Ekstre"],
                ["odemeYetkilisi", "Odeme Hatirlatma"],
                ["genelMuhasebeYetkilisi", "Genel Muhasebe CC"],
                ["modelSorumlusuOlabilir", "Model Sorumlusu"],
                ["aktif", "Aktif"],
              ].map(([key, label]) => (
                <label className="mh-chip" key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(form[key])}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event?.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="mh-button-row">
              <button
                className="mh-btn"
                type="button"
                onClick={() => setForm(emptyContact)}
                disabled={busy}
              >
                Temizle
              </button>
              <button
                className="mh-btn"
                type="button"
                onClick={() => goTab("mail-ekstre")}
                disabled={busy}
              >
                Mail / Ekstreye Git
              </button>
              <button
                className="mh-btn primary"
                type="submit"
                disabled={!selectedFirm.id || busy}
              >
                {form.id ? "Kisiyi Guncelle" : "Kisi Kaydet"}
              </button>
            </div>
          </form>
        </Card>
        <Card title="Secili Firmanin Yetkilileri">
          <StatusBlock
            state={contactListState}
            emptyText="Yetkili kisi bulunamadi."
          />
          <DataTable
            columns={[
              "Kisi",
              "Departman",
              "Gorev",
              "E-posta",
              "Telefon",
              "Fatura",
              "Irsaliye",
              "Ekstre",
              "Odeme",
              "Genel CC",
              "Model",
              "Durum",
              "Islem",
            ]}
            rows={contacts}
            renderRow={(row) => (
              <tr key={row?.id}>
                <td>
                  <strong>{row?.adSoyad}</strong>
                </td>
                <td>{row?.departman || "-"}</td>
                <td>{row?.gorev || "-"}</td>
                <td>{row?.email || "-"}</td>
                <td>{row?.telefon || "-"}</td>
                <td>{row?.faturaYetkilisi ? "Var" : "-"}</td>
                <td>{row?.irsaliyeYetkilisi ? "Var" : "-"}</td>
                <td>{row?.ekstreYetkilisi ? "Var" : "-"}</td>
                <td>{row?.odemeYetkilisi ? "Var" : "-"}</td>
                <td>{row?.genelMuhasebeYetkilisi ? "Var" : "-"}</td>
                <td>{row?.modelSorumlusuOlabilir ? "Var" : "-"}</td>
                <td>{row?.aktif ? "Aktif" : "Pasif"}</td>
                <td>
                  <button
                    className="mh-btn"
                    type="button"
                    onClick={() => setForm(row)}
                    disabled={busy}
                  >
                    Duzenle
                  </button>
                  <button
                    className="mh-btn"
                    type="button"
                    onClick={() => passiveContact(row)}
                    disabled={busy}
                  >
                    Pasife Al
                  </button>
                </td>
              </tr>
            )}
          />
        </Card>
      </div>
    </div>
  );
}
function ExpenseCategories({ activeMainCompany }) {
  return <ExpenseCategoriesWorkspace activeMainCompany={activeMainCompany} />;
}

function LegacyExpenseCategories({ activeMainCompany, refreshKey }) {
  const [localRefresh, setLocalRefresh] = useState(0);
  const [form, setForm] = useState({
    ad: "",
    kategoriTipi: "GIDER",
    anaKategoriId: "",
    sira: 0,
    aciklama: "",
    aktifMi: true,
  });
  const [feedback, setFeedback] = useState("");
  const state = useEndpoint(
    "/muhasebe/rapor-kategorileri",
    activeMainCompany,
    `${refreshKey}-${localRefresh}`,
  );
  const rows = asArray(state.data);
  const save = async (event) => {
    event?.preventDefault();
    setFeedback("");
    try {
      const payload = {
        ...form,
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
      };
      if (form.id) {
        await apiPatch(
          `/muhasebe/rapor-kategorileri/${encodeURIComponent(form.id)}`,
          payload,
        );
      } else {
        await apiPost("/muhasebe/rapor-kategorileri", payload);
      }
      setFeedback("Kategori kaydedildi.");
      setForm({
        ad: "",
        kategoriTipi: "GIDER",
        anaKategoriId: "",
        sira: 0,
        aciklama: "",
        aktifMi: true,
      });
      setLocalRefresh((value) => value + 1);
    } catch (error) {
      setFeedback(error?.message || "Kategori kaydedilemedi.");
    }
  };
  const remove = async (row) => {
    await apiDelete(
      `/muhasebe/rapor-kategorileri/${encodeURIComponent(row?.id)}`,
      {
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
      },
    );
    setLocalRefresh((value) => value + 1);
  };
  return (
    <div className="mh-layout-2">
      <Card title="Kategori Formu">
        <form className="mh-stack" onSubmit={save}>
          <div className="mh-form-grid two">
            <Field label="Kategori Adı">
              <input
                value={form.ad}
                onChange={(event) =>
                  setForm({ ...form, ad: event?.target.value })
                }
              />
            </Field>
            <Field label="Kategori Tipi">
              <select
                value={form.kategoriTipi}
                onChange={(event) =>
                  setForm({ ...form, kategoriTipi: event?.target.value })
                }
              >
                <option value="GELIR">Gelir</option>
                <option value="GIDER">Gider</option>
                <option value="PERSONEL">Personel</option>
                <option value="KDV">KDV</option>
                <option value="DIGER">Diğer</option>
              </select>
            </Field>
            <Field label="Ana Kategori">
              <select
                value={form.anaKategoriId}
                onChange={(event) =>
                  setForm({ ...form, anaKategoriId: event?.target.value })
                }
              >
                <option value="">Yok</option>
                {rows.map((row) => (
                  <option key={row?.id} value={row?.id}>
                    {row?.ad}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sıra">
              <input
                type="number"
                value={form.sira}
                onChange={(event) =>
                  setForm({ ...form, sira: event?.target.value })
                }
              />
            </Field>
            <Field label="Açıklama">
              <input
                value={form.aciklama}
                onChange={(event) =>
                  setForm({ ...form, aciklama: event?.target.value })
                }
              />
            </Field>
            <label className="mh-chip">
              <input
                type="checkbox"
                checked={form.aktifMi}
                onChange={(event) =>
                  setForm({ ...form, aktifMi: event?.target.checked })
                }
              />
              Aktif
            </label>
          </div>
          <div className="mh-actions">
            <button className="mh-btn primary" type="submit">
              Kaydet
            </button>
            <button
              className="mh-btn"
              type="button"
              onClick={() =>
                setForm({
                  ad: "",
                  kategoriTipi: "GIDER",
                  anaKategoriId: "",
                  sira: 0,
                  aciklama: "",
                  aktifMi: true,
                })
              }
            >
              Yeni
            </button>
          </div>
          {feedback ? <div className="mh-state">{feedback}</div> : null}
        </form>
      </Card>
      <Card title="Kategori Listesi">
        <StatusBlock state={state} />
        <DataTable
          columns={[
            "Kategori",
            "Tip",
            "Aktif",
            "Sıra",
            "Firma",
            "Belge",
            "İşlem",
          ]}
          rows={rows}
          renderRow={(row) => (
            <tr key={row?.id}>
              <td>{row?.ad}</td>
              <td>{row?.kategoriTipi}</td>
              <td>{row?.aktifMi ? "Aktif" : "Pasif"}</td>
              <td>{row?.sira}</td>
              <td>{row?.firmaSayisi || 0}</td>
              <td>{row?.belgeSayisi || 0}</td>
              <td>
                <button
                  className="mh-btn"
                  type="button"
                  onClick={() => setForm(row)}
                >
                  Düzenle
                </button>
                <button
                  className="mh-btn"
                  type="button"
                  onClick={() => remove(row)}
                >
                  Sil / Pasife Al
                </button>
              </td>
            </tr>
          )}
        />
      </Card>
    </div>
  );
}

function ProfitLossCenter({ activeMainCompany, goTab }) {
  return (
    <ProfitLossWorkspace activeMainCompany={activeMainCompany} goTab={goTab} />
  );
}

function LegacyProfitLossCenter({ activeMainCompany, refreshKey, goTab }) {
  const companyKey =
    activeMainCompany?.slug || activeMainCompany?.id || "default";
  const fallbackRange = useMemo(() => {
    const today = new Date();
    return today.getDate() <= 3 ? monthRange(-1) : monthRange(0);
  }, []);
  const rangeStorageKey = `kyerp-gelir-gider-tarih:${companyKey}`;
  const storedRange = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(rangeStorageKey) || "{}");
      if (saved?.dateFrom && saved?.dateTo) return saved;
    } catch {
      // ignore invalid local storage payload
    }
    return fallbackRange;
  }, [fallbackRange, rangeStorageKey]);
  const [dateFrom, setDateFrom] = useState(storedRange.dateFrom);
  const [dateTo, setDateTo] = useState(storedRange.dateTo);
  const [search, setSearch] = useState("");
  const [activeLedgerTab, setActiveLedgerTab] = useState("income");
  const [excludedExpenseFirms, setExcludedExpenseFirms] = useState({});
  const [categoryAssignments, setCategoryAssignments] = useState({});
  const [activeBreakdownKey, setActiveBreakdownKey] = useState("");
  const [breakdownCategoryName, setBreakdownCategoryName] = useState("");
  const [categoryFirmToAddKey, setCategoryFirmToAddKey] = useState("");
  const [showBreakdownDetail, setShowBreakdownDetail] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [manualForm, setManualForm] = useState({
    id: "",
    name: "Kira Gideri",
    categoryId: "",
    newCategoryName: "",
    date: storedRange.dateFrom,
    repeatMonthly: false,
    endDate: "",
    amount: "",
    vat: "",
    description: "",
  });
  const reportPeriodKey = `${dateFrom.slice(0, 7)}:${dateTo.slice(0, 7)}`;
  const reportSettingsKey = `gelir_gider_kategorileri:${reportPeriodKey}`;
  const reportSettingsStorageKey = `kyerp-gelir-gider-ayar:${companyKey}:${reportPeriodKey}`;

  const categoryState = useEndpoint(
    "/muhasebe/rapor-kategorileri",
    activeMainCompany,
    `${refreshKey || 0}-${reportRefreshKey}`,
  );
  const categories = asArray(categoryState.data).filter(
    (category) => category?.aktifMi !== false,
  );
  const expenseCategoryOptions = categories.filter((category) =>
    ["GIDER", "DIGER", "PERSONEL"].includes(
      String(category?.kategoriTipi || "").toUpperCase(),
    ),
  );
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(rangeStorageKey) || "{}");
      const next = saved?.dateFrom && saved?.dateTo ? saved : fallbackRange;
      setDateFrom(next.dateFrom);
      setDateTo(next.dateTo);
      setManualForm((form) => ({ ...form, date: form.date || next.dateFrom }));
    } catch {
      setDateFrom(fallbackRange.dateFrom);
      setDateTo(fallbackRange.dateTo);
    }
  }, [fallbackRange, rangeStorageKey]);

  useEffect(() => {
    localStorage.setItem(rangeStorageKey, JSON.stringify({ dateFrom, dateTo }));
  }, [dateFrom, dateTo, rangeStorageKey]);

  useEffect(() => {
    setStorageReady(false);
    const applySavedSettings = (value = {}) => {
      setExcludedExpenseFirms(
        value.excludedExpenseFirms &&
          typeof value.excludedExpenseFirms === "object"
          ? value.excludedExpenseFirms
          : {},
      );
      setCategoryAssignments(
        value.categoryAssignments &&
          typeof value.categoryAssignments === "object"
          ? value.categoryAssignments
          : {},
      );
      setActiveBreakdownKey(
        (current) => current || value.activeBreakdownKey || "",
      );
    };
    try {
      const cached = JSON.parse(
        localStorage.getItem(reportSettingsStorageKey) || "{}",
      );
      applySavedSettings(cached);
    } catch {
      applySavedSettings({});
    }
    let alive = true;
    apiGet("/muhasebe/rapor-ayarlari", companyParams(activeMainCompany))
      .then((payload) => {
        if (!alive) return;
        const rows = asArray(payload);
        const setting = rows.find((row) => row?.key === reportSettingsKey);
        const value =
          setting?.value && typeof setting.value === "object"
            ? setting.value
            : {};
        applySavedSettings(value);
      })
      .catch(() => {
        // Local cache is enough for the screen to stay usable if settings cannot be fetched.
      })
      .finally(() => {
        if (alive) setStorageReady(true);
      });
    return () => {
      alive = false;
    };
  }, [activeMainCompany?.slug, activeMainCompany?.id, reportSettingsKey, reportSettingsStorageKey, activeMainCompany]);

  useEffect(() => {
    if (!storageReady) return;
    const value = {
      excludedExpenseFirms,
      categoryAssignments,
      activeBreakdownKey,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(reportSettingsStorageKey, JSON.stringify(value));
    const timer = window.setTimeout(() => {
      apiPost("/muhasebe/rapor-ayarlari", {
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
        key: reportSettingsKey,
        value,
      }).catch(() => {});
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    excludedExpenseFirms,
    categoryAssignments,
    activeBreakdownKey,
    reportSettingsKey,
    reportSettingsStorageKey,
    storageReady,
    activeMainCompany?.slug,
    activeMainCompany?.id,
  ]);

  const state = useEndpoint(
    "/muhasebe/rapor-ozet",
    activeMainCompany,
    `${refreshKey || 0}-${reportRefreshKey}`,
    {
      dateFrom,
      dateTo,
      baslangic: dateFrom,
      bitis: dateTo,
      q: search || undefined,
    },
  );
  const reportData = unwrap(state.data) || {};
  const ana = reportData.anaOzet || {};
  const movementRows = Array.isArray(reportData.hareketler)
    ? reportData.hareketler
    : [];
  const manualItems = Array.isArray(reportData.kullaniciKalemleri)
    ? reportData.kullaniciKalemleri
    : [];

  const rowText = (row) =>
    [
      row?.tur,
      row?.turEtiketi,
      row?.kategori,
      row?.firma,
      row?.belgeNo,
      row?.aciklama,
    ]
      .join(" ")
      .toLocaleLowerCase("tr-TR");
  const hasAny = (row, words) =>
    words.some((word) => rowText(row).includes(word));
  const categoryByName = useCallback((name) => {
    const target = normalizeCompanyMatchText(name);
    return categories.find(
      (category) => normalizeCompanyMatchText(category?.ad) === target,
    );
  }, [categories]);
  const ensureExpenseCategory = async (name) => {
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("Kategori adı yazmalısınız.");
    const existing = categoryByName(cleanName);
    if (existing?.id) return existing;
    const response = await apiPost("/muhasebe/rapor-kategorileri", {
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
      ad: cleanName,
      kategoriTipi: "GIDER",
      aktifMi: true,
    });
    const saved = unwrap(response);
    setReportRefreshKey((value) => value + 1);
    return saved;
  };
  const suggestedCategoryName = (row) => {
    const text = normalizeCompanyMatchText(
      [row?.kategori, row?.turEtiketi, row?.firma, row?.aciklama].join(" "),
    );
    if (/(selvi|kimya|boya|tiner|solvent)/.test(text)) return "Boya / Kimyasal";
    if (
      /(personel|maas|maaş|ucret|ücret|sgk|haftalik|haftalık|yevmiye|yevmiyeci)/.test(
        text,
      )
    )
      return "Sabit Giderler";
    if (/(can yemek|yemek|lokanta|restoran|multinet|ticket|sodexo)/.test(text))
      return "Yemek Gideri";
    if (/(ambalaj|koli)/.test(text)) return "Ambalaj Gideri";
    if (/(kira|rent)/.test(text)) return "Kira Gideri";
    return row?.kategori || row?.turEtiketi || "Diğer Giderler";
  };
  const effectiveCategoryName = useCallback((row) =>
    categoryAssignments[firmKey(row)]?.categoryName ||
    suggestedCategoryName(row), [categoryAssignments]);
  const categoryKeyForName = useCallback((name) =>
    categoryByName(name)?.id || name || "kategori-yok", [categoryByName]);
  const dominantCategoryName = (rows = []) => {
    const totals = new Map();
    rows.forEach((row) => {
      const name = effectiveCategoryName(row);
      totals.set(name, (totals.get(name) || 0) + Number(row?.genelToplam || 0));
    });
    return (
      [...totals.entries()].sort((a, b) => b[1] - a[1])?.[0]?.[0] ||
      "Diğer Giderler"
    );
  };
  const assignSuggestedManualExpense = async (
    name,
    categoryName,
    options = {},
  ) => {
    let category = categoryByName(categoryName);
    if (!category?.id && categoryName) {
      setCategoryBusy(true);
      setFeedback("");
      try {
        category = await ensureExpenseCategory(categoryName);
        setFeedback(`${categoryName} kategorisi hazır.`);
      } catch (error) {
        setFeedback(error?.message || "Kategori hazırlanamadı.");
      } finally {
        setCategoryBusy(false);
      }
    }
    setManualForm((form) => ({
      ...form,
      name,
      categoryId: category?.id || "",
      newCategoryName: category?.id ? "" : categoryName,
      repeatMonthly: Boolean(options.repeatMonthly),
      date: form.date || dateFrom,
    }));
  };
  const isSalesRow = (row) =>
    String(row?.tur || "").toUpperCase() === "KESILEN";
  const isPersonnelRow = (row) =>
    String(row?.tur || "").toUpperCase() === "PERSONEL" ||
    hasAny(row, ["personel", "maaş", "maas", "ücret", "ucret", "sgk"]);
  const isMealRow = (row) =>
    String(row?.tur || "").toUpperCase() === "YEMEK" ||
    hasAny(row, ["yemek", "multinet", "ticket", "sodexo"]);
  const isWeeklyRow = (row) =>
    String(row?.tur || "").toUpperCase() === "HAFTALIK" ||
    hasAny(row, ["haftalık", "haftalik"]);
  const isWorkerRow = (row) =>
    String(row?.tur || "").toUpperCase() === "YEVMIYECI" ||
    hasAny(row, ["yevmiyeci", "yevmiye"]);
  const isRentRow = (row) => hasAny(row, ["kira", "rent"]);
  const isVatOnlyExpenseRow = (row) =>
    String(row?.giderHesaplamaTipi || "").toUpperCase() === "VAT_ONLY" ||
    row?.vatOnlyExpense === true ||
    row?.sadeceKdvKullan === true;
  const rowKey = (row) =>
    row?.id ||
    `${row?.tur || ""}-${row?.tarih || ""}-${row?.belgeNo || ""}-${row?.firma || ""}`;
  const firmKey = (row) => row?.firmaId || row?.firma || "firma-yok";
  const sumRows = (rows, key = "genelToplam") =>
    rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);
  const groupByFirm = useCallback((rows) => {
    const grouped = new Map();
    rows.forEach((row) => {
      const key = firmKey(row);
      const current = grouped.get(key) || {
        key,
        firmaId: row?.firmaId || "",
        firma: row?.firma || "Firma bilgisi yok",
        belgeAdedi: 0,
        tutar: 0,
        kdv: 0,
        genelToplam: 0,
        rows: [],
      };
      current.belgeAdedi += 1;
      current.tutar += Number(row?.tutar || 0);
      current.kdv += Number(row?.kdv || 0);
      current.genelToplam += Number(row?.genelToplam || 0);
      current.rows.push(row);
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.genelToplam - a.genelToplam);
  }, []);

  const salesRows = movementRows.filter(isSalesRow);
  const expenseRows = movementRows.filter((row) => !isSalesRow(row));
  const incomeFirmRows = groupByFirm(salesRows);
  const expenseFirmRows = groupByFirm(expenseRows);
  const includedExpenseRows = expenseRows.filter(
    (row) => !excludedExpenseFirms[firmKey(row)],
  );
  const excludedExpenseRows = expenseRows.filter(
    (row) => excludedExpenseFirms[firmKey(row)],
  );
  const vatExpenseRows = expenseRows.filter(
    (row) => row?.kdvHesabinaDahil !== false,
  );
  const personnelRows = includedExpenseRows.filter(isPersonnelRow);
  const mealRows = includedExpenseRows.filter(
    (row) => !isPersonnelRow(row) && isMealRow(row),
  );
  const weeklyRows = includedExpenseRows.filter(
    (row) => !isPersonnelRow(row) && !isMealRow(row) && isWeeklyRow(row),
  );
  const workerRows = includedExpenseRows.filter(
    (row) =>
      !isPersonnelRow(row) &&
      !isMealRow(row) &&
      !isWeeklyRow(row) &&
      isWorkerRow(row),
  );
  const rentRows = includedExpenseRows.filter(
    (row) =>
      !isPersonnelRow(row) &&
      !isMealRow(row) &&
      !isWeeklyRow(row) &&
      !isWorkerRow(row) &&
      isRentRow(row),
  );
  const namedExpenseIds = new Set(
    [
      ...personnelRows,
      ...mealRows,
      ...weeklyRows,
      ...workerRows,
      ...rentRows,
    ].map(rowKey),
  );
  const otherExpenseRows = includedExpenseRows.filter(
    (row) => !namedExpenseIds.has(rowKey(row)),
  );

  const salesNet =
    sumRows(salesRows, "tutar") || Number(ana?.kesilenFatura?.toplam || 0);
  const salesVat =
    sumRows(salesRows, "kdv") || Number(ana?.kesilenFatura?.kdv || 0);
  const salesGross = sumRows(salesRows, "genelToplam") || salesNet + salesVat;
  const expenseVat = sumRows(vatExpenseRows, "kdv");
  const expenseGross = sumRows(includedExpenseRows, "genelToplam");
  const excludedExpenseGross = sumRows(excludedExpenseRows, "genelToplam");
  const cariResult = salesGross - expenseGross;
  const kdvNet = salesVat - expenseVat;
  const simpleSummaryRows = [
    {
      label: "Toplam Gelir",
      value: money(salesGross),
      hint: `${salesRows.length || ana?.kesilenFatura?.belgeAdedi || 0} gelir kaydı`,
      tone: "green",
    },
    {
      label: "Toplam Gider",
      value: money(expenseGross),
      hint: `${includedExpenseRows.length} gider kaydı`,
      tone: "yellow",
    },
    {
      label: "Gelen KDV",
      value: money(expenseVat),
      hint: "İndirilecek KDV; giderden çıkarılanlarda KDV kalır",
      tone: "blue",
    },
    {
      label: "Giden KDV",
      value: money(salesVat),
      hint: "Hesaplanan KDV",
      tone: "red",
    },
    {
      label: "Net",
      value: money(cariResult),
      hint: `KDV farkı ${money(kdvNet)}`,
      tone: cariResult >= 0 ? "green" : "red",
    },
  ];

  const statementRows = [
    {
      label: "Kesilen faturalar / yapılan iş",
      amount: salesGross,
      count: salesRows.length,
      tone: "income",
    },
    {
      label: "Gelen faturalar ve diğer giderler",
      amount: -sumRows(otherExpenseRows, "genelToplam"),
      count: otherExpenseRows.length,
      tone: "expense",
    },
    {
      label: "Personel gideri",
      amount: -sumRows(personnelRows, "genelToplam"),
      count: personnelRows.length,
      tone: "expense",
    },
    {
      label: "Yemek gideri",
      amount: -sumRows(mealRows, "genelToplam"),
      count: mealRows.length,
      tone: "expense",
    },
    {
      label: "Haftalık / yevmiyeci",
      amount: -(
        sumRows(weeklyRows, "genelToplam") + sumRows(workerRows, "genelToplam")
      ),
      count: weeklyRows.length + workerRows.length,
      tone: "expense",
    },
    {
      label: "Kira gideri",
      amount: -sumRows(rentRows, "genelToplam"),
      count: rentRows.length,
      tone: "expense",
    },
    {
      label: "Giderden çıkarılan firmalar",
      amount: excludedExpenseGross,
      count: excludedExpenseRows.length,
      tone: "neutral",
    },
    {
      label: "Cari bazlı dönem sonucu",
      amount: cariResult,
      count: salesRows.length + includedExpenseRows.length,
      tone: cariResult >= 0 ? "income" : "expense",
      total: true,
    },
  ];
  const expenseCategoryRows = useMemo(() => {
    const grouped = new Map();
    includedExpenseRows.forEach((row) => {
      const categoryName = effectiveCategoryName(row);
      const category = categoryByName(categoryName);
      const key = categoryKeyForName(categoryName);
      const current = grouped.get(key) || {
        key,
        kategori: category?.ad || categoryName || "Kategori yok",
        belgeAdedi: 0,
        tutar: 0,
        kdv: 0,
        genelToplam: 0,
        firms: new Map(),
      };
      const firmName =
        row?.firma || row?.turEtiketi || row?.aciklama || "Elle girilen gider";
      current.belgeAdedi += 1;
      current.tutar += Number(row?.tutar || 0);
      current.kdv += Number(row?.kdv || 0);
      current.genelToplam += Number(row?.genelToplam || 0);
      current.firms.set(
        firmName,
        (current.firms.get(firmName) || 0) + Number(row?.genelToplam || 0),
      );
      grouped.set(key, current);
    });
    const rows = [...grouped.values()];
    expenseCategoryOptions.forEach((category) => {
      if (!category?.id || grouped.has(category.id)) return;
      rows.push({
        key: category.id,
        kategori: category.ad,
        belgeAdedi: 0,
        tutar: 0,
        kdv: 0,
        genelToplam: 0,
        firms: new Map(),
      });
    });
    return rows
      .map((row) => ({
        ...row,
        oran: expenseGross ? (row.genelToplam / expenseGross) * 100 : 0,
        firmalar: [...row.firms.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name]) => name),
      }))
      .sort(
        (a, b) =>
          b.genelToplam - a.genelToplam ||
          String(a.kategori || "").localeCompare(
            String(b.kategori || ""),
            "tr",
          ),
      );
  }, [includedExpenseRows, expenseCategoryOptions, effectiveCategoryName, categoryByName, categoryKeyForName, expenseGross]);

  const activeCategoryRow =
    expenseCategoryRows.find((row) => row.key === activeBreakdownKey) ||
    expenseCategoryRows[0] ||
    null;
  const activeCategoryKey = activeCategoryRow?.key || "";
  const activeCategoryName = activeCategoryRow?.kategori || "";
  const activeCategoryExpenseRows = useMemo(
    () =>
      activeCategoryKey
        ? includedExpenseRows.filter(
            (row) =>
              categoryKeyForName(effectiveCategoryName(row)) ===
              activeCategoryKey,
          )
        : [],
    [activeCategoryKey, includedExpenseRows, categoryKeyForName, effectiveCategoryName],
  );
  const activeCategoryFirmRows = useMemo(
    () =>
      groupByFirm(activeCategoryExpenseRows).map((firm) => ({
        ...firm,
        oran: activeCategoryRow?.genelToplam
          ? (firm.genelToplam / activeCategoryRow.genelToplam) * 100
          : 0,
      })),
    [activeCategoryExpenseRows, activeCategoryRow.genelToplam, groupByFirm],
  );
  const otherCategoryFirmRows = useMemo(
    () =>
      activeCategoryKey
        ? groupByFirm(
            includedExpenseRows.filter(
              (row) =>
                categoryKeyForName(effectiveCategoryName(row)) !==
                activeCategoryKey,
            ),
          ).slice(0, 30)
        : [],
    [activeCategoryKey, groupByFirm, includedExpenseRows, categoryKeyForName, effectiveCategoryName],
  );
  const selectedCategoryFirmToAdd =
    otherCategoryFirmRows.find((firm) => firm.key === categoryFirmToAddKey) ||
    otherCategoryFirmRows[0] ||
    null;

  useEffect(() => {
    if (!activeBreakdownKey && expenseCategoryRows[0]?.key) {
      setActiveBreakdownKey(expenseCategoryRows[0].key);
    }
  }, [activeBreakdownKey, expenseCategoryRows]);

  const setRange = (offset) => {
    const next = monthRange(offset);
    setDateFrom(next.dateFrom);
    setDateTo(next.dateTo);
    setManualForm((form) => ({ ...form, date: next.dateFrom }));
    setReportRefreshKey((value) => value + 1);
  };

  const toggleExpenseFirm = (firm) => {
    setExcludedExpenseFirms((current) => {
      const next = { ...current };
      if (next[firm.key]) delete next[firm.key];
      else
        next[firm.key] = {
          firma: firm.firma,
          updatedAt: new Date().toISOString(),
        };
      return next;
    });
  };

  const moveFirmToCategory = (firm, categoryName = activeCategoryName) => {
    if (!firm?.key || !categoryName) return;
    setExcludedExpenseFirms((current) => {
      if (!current[firm.key]) return current;
      const next = { ...current };
      delete next[firm.key];
      return next;
    });
    setCategoryAssignments((current) => ({
      ...current,
      [firm.key]: {
        firma: firm.firma,
        categoryName,
        updatedAt: new Date().toISOString(),
      },
    }));
    setActiveBreakdownKey(categoryKeyForName(categoryName));
  };

  const removeFirmFromCategory = (firm) => {
    if (!firm?.key) return;
    setCategoryAssignments((current) => ({
      ...current,
      [firm.key]: {
        firma: firm.firma,
        categoryName: "Diğer Giderler",
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const clearFirmCategoryOverride = (firm) => {
    if (!firm?.key) return;
    setCategoryAssignments((current) => {
      const next = { ...current };
      delete next[firm.key];
      return next;
    });
  };

  const createBreakdownCategory = async () => {
    const name = breakdownCategoryName.trim();
    if (!name) {
      setFeedback("Kategori adı yazmalısınız.");
      return;
    }
    setCategoryBusy(true);
    setFeedback("");
    try {
      const existing = categoryByName(name);
      if (existing?.id) {
        setActiveBreakdownKey(existing.id);
      } else {
        const saved = await ensureExpenseCategory(name);
        setActiveBreakdownKey(saved?.id || name);
      }
      setBreakdownCategoryName("");
      setFeedback("Gider kategorisi eklendi.");
    } catch (error) {
      setFeedback(error?.message || "Kategori eklenemedi.");
    } finally {
      setCategoryBusy(false);
    }
  };

  const deleteActiveBreakdownCategory = async () => {
    const category = categoryByName(activeCategoryName);
    if (!category?.id) {
      setFeedback("Bu kategori sadece dönem ayarı olarak görünüyor.");
      return;
    }
    setCategoryBusy(true);
    setFeedback("");
    try {
      await apiDelete(
        `/muhasebe/rapor-kategorileri/${encodeURIComponent(category.id)}`,
        {
          mainCompanySlug: activeMainCompany?.slug,
          mainCompanyId: activeMainCompany?.id,
        },
      );
      setCategoryAssignments((current) => {
        const next = {};
        Object.entries(current).forEach(([key, value]) => {
          if (value?.categoryName !== activeCategoryName) next[key] = value;
        });
        return next;
      });
      setActiveBreakdownKey("");
      setReportRefreshKey((value) => value + 1);
      setFeedback("Kategori pasife alındı veya kaldırıldı.");
    } catch (error) {
      setFeedback(error?.message || "Kategori kaldırılamadı.");
    } finally {
      setCategoryBusy(false);
    }
  };

  const resetManualForm = () => {
    setManualForm({
      id: "",
      name: "Kira Gideri",
      categoryId: "",
      newCategoryName: "",
      date: dateFrom,
      repeatMonthly: false,
      endDate: "",
      amount: "",
      vat: "",
      description: "",
    });
  };

  const editManualItem = (item) => {
    const monthlyFixed =
      String(item?.kartTipi || item?.cardType || "").toUpperCase() ===
      "AYLIK_SABIT";
    setManualForm({
      id: item?.id || "",
      name: item?.ad || item?.name || "Gider Kalemi",
      categoryId: item?.kategoriId || "",
      newCategoryName: "",
      date: String(item?.tarih || item?.baslangic || dateFrom).slice(0, 10),
      repeatMonthly: monthlyFixed,
      endDate:
        monthlyFixed && item?.bitis ? String(item.bitis).slice(0, 10) : "",
      amount: decimalInputValue(item?.tutar || item?.amount || 0),
      vat: decimalInputValue(item?.kdv || item?.vat || 0),
      description: item?.aciklama || item?.description || "",
    });
  };

  const saveManualExpense = async () => {
    const amount = parseMoneyInput(manualForm.amount);
    const vat = parseMoneyInput(manualForm.vat);
    if (!manualForm.name.trim() || !amount) {
      setFeedback("Kalem adı ve tutar zorunludur.");
      return;
    }
    setSaveBusy(true);
    setFeedback("");
    try {
      let categoryId = manualForm.categoryId || "";
      const newCategoryName = manualForm.newCategoryName.trim();
      if (newCategoryName) {
        const existingCategory = categoryByName(newCategoryName);
        if (existingCategory?.id) {
          categoryId = existingCategory.id;
        } else {
          const response = await apiPost("/muhasebe/rapor-kategorileri", {
            mainCompanySlug: activeMainCompany?.slug,
            mainCompanyId: activeMainCompany?.id,
            ad: newCategoryName,
            kategoriTipi: "GIDER",
            aktifMi: true,
          });
          const savedCategory = unwrap(response);
          categoryId = savedCategory?.id || "";
        }
      }
      const payload = {
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
        ad: manualForm.name,
        kategoriId: categoryId || null,
        tarih: manualForm.repeatMonthly ? null : manualForm.date || dateFrom,
        baslangic: manualForm.repeatMonthly
          ? manualForm.date || dateFrom
          : null,
        bitis:
          manualForm.repeatMonthly && manualForm.endDate
            ? manualForm.endDate
            : null,
        tutar: amount,
        kdv: vat,
        aciklama: manualForm.description,
        kartTipi: manualForm.repeatMonthly ? "AYLIK_SABIT" : "BUYUK",
      };
      if (manualForm.id) {
        await apiPatch(
          `/muhasebe/rapor-manuel-kalemler/${manualForm.id}`,
          payload,
        );
      } else {
        await apiPost("/muhasebe/rapor-manuel-kalemler", payload);
      }
      resetManualForm();
      setFeedback(
        manualForm.id
          ? "Gider kalemi güncellendi."
          : "Gider kalemi rapora eklendi.",
      );
      setReportRefreshKey((value) => value + 1);
    } catch (error) {
      setFeedback(error?.message || "Gider kalemi eklenemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const deleteManualItem = async (item) => {
    if (!item?.id) return;
    setSaveBusy(true);
    setFeedback("");
    try {
      await apiDelete(`/muhasebe/rapor-manuel-kalemler/${item.id}`, {
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
      });
      if (manualForm.id === item.id) resetManualForm();
      setFeedback("Gider kalemi çıkarıldı.");
      setReportRefreshKey((value) => value + 1);
    } catch (error) {
      setFeedback(error?.message || "Gider kalemi silinemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const ledgerRows = activeLedgerTab === "income" ? salesRows : expenseRows;
  const renderLedgerRow = (row) => {
    const excluded =
      activeLedgerTab === "expense" &&
      Boolean(excludedExpenseFirms[firmKey(row)]);
    return (
      <tr key={row?.id || `${row?.tur}-${row?.tarih}-${row?.belgeNo}`}>
        <td>{date(row?.tarih)}</td>
        <td>{row?.belgeNo || "-"}</td>
        <td>{row?.firma || "-"}</td>
        <td>
          {activeLedgerTab === "expense"
            ? effectiveCategoryName(row)
            : row?.kategori || row?.turEtiketi || "-"}
        </td>
        <td>{money(row?.tutar)}</td>
        <td>{money(row?.kdv)}</td>
        <td>{money(row?.genelToplam)}</td>
        <td>
          <Badge
            tone={
              activeLedgerTab === "income"
                ? "ok"
                : excluded || isVatOnlyExpenseRow(row)
                  ? "warn"
                  : "ok"
            }
          >
            {activeLedgerTab === "income"
              ? "Gelir"
              : isVatOnlyExpenseRow(row)
                ? "Sadece KDV"
                : excluded
                  ? "Gider Hariç / KDV Dahil"
                  : "Dahil"}
          </Badge>
          {row?.hesapNotu ? (
            <small className="muted-small">{row.hesapNotu}</small>
          ) : null}
        </td>
        <td>
          {activeLedgerTab === "expense" ? (
            <>
              <button
                className="mh-btn"
                type="button"
                onClick={() =>
                  toggleExpenseFirm({
                    key: firmKey(row),
                    firma: row?.firma || "Firma bilgisi yok",
                  })
                }
              >
                {excluded ? "Gidere Ekle" : "Giderden Çıkar"}
              </button>
              {!excluded && activeCategoryName ? (
                <button
                  className="mh-btn"
                  type="button"
                  onClick={() =>
                    moveFirmToCategory(
                      {
                        key: firmKey(row),
                        firma: row?.firma || "Firma bilgisi yok",
                      },
                      activeCategoryName,
                    )
                  }
                >
                  Bu Kategoriye Al
                </button>
              ) : null}
            </>
          ) : (
            "-"
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="mh-stack profit-loss-page">
      <Card
        title="Gelir / Gider ve İş Hacmi"
        subtitle={`${dateFrom} - ${dateTo} aralığında müşteri gelirleri, tedarikçi giderleri ve dönem sonucu`}
        action={
          <div className="mh-actions">
            <button
              className="mh-btn"
              type="button"
              onClick={() => setRange(-1)}
            >
              Geçen Ay
            </button>
            <button
              className="mh-btn"
              type="button"
              onClick={() => setRange(0)}
            >
              Bu Ay
            </button>
            <button
              className="mh-btn"
              type="button"
              onClick={() => goTab?.("muhasebe-raporlari")}
            >
              Detay Rapor
            </button>
          </div>
        }
      >
        <div className="profit-loss-filterbar">
          <Field label="Başlangıç">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </Field>
          <Field label="Bitiş">
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </Field>
          <Field label="Firma / belge / açıklama ara">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Firma, fatura no, kategori veya açıklama"
            />
          </Field>
          <button
            className="mh-btn primary"
            type="button"
            onClick={() => setReportRefreshKey((value) => value + 1)}
          >
            Raporu Güncelle
          </button>
        </div>
        <StatusBlock state={state} />
        <div className="profit-loss-simple-summary">
          {simpleSummaryRows.map((row) => (
            <CariSummaryMetric
              key={row.label}
              label={row.label}
              value={row.value}
              hint={row.hint}
              tone={row.tone}
            />
          ))}
        </div>
      </Card>

      <div className="profit-loss-firm-ledger">
        <Card
          title="Gelir / Müşteriler"
          subtitle="Kesilen faturaya göre müşteri iş hacmi"
        >
          <div className="profit-loss-firm-list">
            {incomeFirmRows.map((firm) => (
              <button
                key={firm.key}
                className="profit-loss-firm-card income"
                type="button"
                onClick={() => {
                  setActiveLedgerTab("income");
                  setSearch(firm.firma);
                }}
              >
                <span>
                  <strong>{firm.firma}</strong>
                  <small>
                    {firm.belgeAdedi} fatura / Matrah {money(firm.tutar)} / KDV{" "}
                    {money(firm.kdv)}
                  </small>
                </span>
                <b>{money(firm.genelToplam)}</b>
              </button>
            ))}
            {!incomeFirmRows.length ? (
              <div className="mh-state">
                Bu tarih aralığında müşteri geliri yok.
              </div>
            ) : null}
          </div>
        </Card>

        <Card
          title="Gider / Tedarikçiler"
          subtitle="Dahil edilen firmalar gider hesabına girer"
        >
          <div className="profit-loss-firm-list">
            {expenseFirmRows.map((firm) => {
              const excluded = Boolean(excludedExpenseFirms[firm.key]);
              return (
                <div
                  key={firm.key}
                  className={`profit-loss-firm-card expense ${excluded ? "excluded" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLedgerTab("expense");
                      setSearch(firm.firma);
                    }}
                  >
                    <span>
                      <strong>{firm.firma}</strong>
                      <small>
                        {dominantCategoryName(firm.rows)} / {firm.belgeAdedi}{" "}
                        belge / Matrah {money(firm.tutar)} / KDV{" "}
                        {money(firm.kdv)}
                        {firm.rows.some(isVatOnlyExpenseRow)
                          ? " / Sadece KDV kuralı var"
                          : ""}
                      </small>
                    </span>
                    <b>{money(firm.genelToplam)}</b>
                  </button>
                  <button
                    className={excluded ? "include" : "exclude"}
                    type="button"
                    onClick={() => toggleExpenseFirm(firm)}
                  >
                    {excluded ? "Gidere Ekle" : "Giderden Çıkar"}
                  </button>
                </div>
              );
            })}
            {!expenseFirmRows.length ? (
              <div className="mh-state">
                Bu tarih aralığında tedarikçi gideri yok.
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="profit-loss-layout">
        <Card
          title="Gelir / Gider Hesabı"
          subtitle="Giderden çıkarılan firmalar bu hesaba dahil edilmez"
        >
          <div className="profit-loss-statement">
            {statementRows.map((row) => (
              <div
                key={row.label}
                className={`profit-loss-line ${row.tone} ${row.total ? "total" : ""}`}
              >
                <span>{row.label}</span>
                <small>{row.count} kayıt</small>
                <strong>{money(row.amount)}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Gider Kırılımı"
          subtitle="Sadece dahil edilen gider firmaları"
        >
          <div className="profit-loss-breakdown">
            {expenseCategoryRows.map((row) => (
              <button
                key={row?.key || row?.firma}
                className={`profit-loss-breakdown-row ${activeCategoryKey === row?.key ? "active" : ""}`}
                type="button"
                onClick={() => {
                  setActiveBreakdownKey(row?.key || "");
                  setShowBreakdownDetail(true);
                }}
              >
                <span>
                  <b>{row?.kategori || row?.firma || "-"}</b>
                  <em>
                    {row?.firmalar?.length
                      ? row.firmalar.join(", ")
                      : "Firma eşleşmesi yok"}
                  </em>
                </span>
                <small>
                  {row?.belgeAdedi || 0} belge / %
                  {Number(row?.oran || 0).toFixed(1)} / Detay
                </small>
                <strong>{money(row?.genelToplam)}</strong>
                <i
                  style={{
                    width: `${Math.max(2, Math.min(100, Number(row?.oran || 0)))}%`,
                  }}
                />
              </button>
            ))}
            {!expenseCategoryRows.length ? (
              <div className="mh-state">
                Bu tarih aralığında dahil edilen gider yok.
              </div>
            ) : null}
          </div>
          <div className="profit-loss-category-editor">
            <input
              value={breakdownCategoryName}
              onChange={(event) => setBreakdownCategoryName(event.target.value)}
              placeholder="Yeni gider kategorisi"
            />
            <button
              type="button"
              onClick={createBreakdownCategory}
              disabled={categoryBusy}
            >
              Kategori Ekle
            </button>
            <button
              type="button"
              onClick={deleteActiveBreakdownCategory}
              disabled={categoryBusy || !activeCategoryName}
            >
              Seçileni Çıkar
            </button>
          </div>
        </Card>
      </div>

      <details
        className="profit-loss-inline-detail profit-loss-category-detail-panel"
        open={showBreakdownDetail && Boolean(activeCategoryName)}
        onToggle={(event) => setShowBreakdownDetail(event.currentTarget.open)}
      >
        <summary>
          <span>
            {activeCategoryName
              ? `${activeCategoryName} Detayı`
              : "Kategori Detayı"}
          </span>
          <small>{activeCategoryFirmRows.length} firma</small>
        </summary>
        <div className="profit-loss-category-total">
          <span>
            <strong>{activeCategoryName || "Kategori seçilmedi"}</strong>
            <small>
              {activeCategoryFirmRows.length} firma /{" "}
              {activeCategoryRow?.belgeAdedi || 0} belge / Matrah{" "}
              {money(activeCategoryRow?.tutar || 0)} / KDV{" "}
              {money(activeCategoryRow?.kdv || 0)}
            </small>
          </span>
          <b>{money(activeCategoryRow?.genelToplam || 0)}</b>
        </div>
        <div className="profit-loss-category-firms">
          {activeCategoryFirmRows.map((firm) => (
            <div key={firm.key} className="profit-loss-category-firm-row">
              <span>
                <strong>{firm.firma}</strong>
                <small>
                  {firm.belgeAdedi} belge / Matrah {money(firm.tutar)} / KDV{" "}
                  {money(firm.kdv)} / %{Number(firm.oran || 0).toFixed(1)}
                </small>
              </span>
              <b>{money(firm.genelToplam)}</b>
              <button
                type="button"
                onClick={() => removeFirmFromCategory(firm)}
              >
                Kategoriden Çıkar
              </button>
              {categoryAssignments[firm.key] ? (
                <button
                  type="button"
                  onClick={() => clearFirmCategoryOverride(firm)}
                >
                  Varsayılana Dön
                </button>
              ) : null}
            </div>
          ))}
          {!activeCategoryFirmRows.length ? (
            <div className="mh-state">Bu kategoride firma yok.</div>
          ) : null}
        </div>
        {otherCategoryFirmRows.length ? (
          <div className="profit-loss-category-add-list">
            <strong>Bu kategoriye ekle</strong>
            <div className="profit-loss-category-add-control">
              <select
                value={selectedCategoryFirmToAdd?.key || ""}
                onChange={(event) =>
                  setCategoryFirmToAddKey(event.target.value)
                }
              >
                {otherCategoryFirmRows.map((firm) => (
                  <option key={firm.key} value={firm.key}>
                    {firm.firma} - {dominantCategoryName(firm.rows)} -{" "}
                    {money(firm.genelToplam)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => moveFirmToCategory(selectedCategoryFirmToAdd)}
              >
                Ekle
              </button>
            </div>
          </div>
        ) : null}
      </details>

      <Card
        title={manualForm.id ? "Gider Kalemi Düzenle" : "Direkt Gider Ekle"}
        subtitle="Kira, yemek, personel veya aylık sabit giderleri buradan gir"
        action={
          <div className="profit-loss-category-presets">
            <button
              type="button"
              onClick={() =>
                assignSuggestedManualExpense("Kira Gideri", "Kira Gideri", {
                  repeatMonthly: true,
                })
              }
            >
              Kira
            </button>
            <button
              type="button"
              onClick={() =>
                assignSuggestedManualExpense("Yemek Gideri", "Yemek Gideri")
              }
            >
              Yemek
            </button>
            <button
              type="button"
              onClick={() =>
                assignSuggestedManualExpense(
                  "Personel Gideri",
                  "Sabit Giderler",
                  { repeatMonthly: true },
                )
              }
            >
              Personel
            </button>
          </div>
        }
      >
        <div className="profit-loss-manual-form">
          <Field label="Kalem Adı">
            <input
              value={manualForm.name}
              onChange={(event) =>
                setManualForm((form) => ({ ...form, name: event.target.value }))
              }
              placeholder="Kira Gideri, Personel Gideri..."
            />
          </Field>
          <Field label="Kategori">
            <select
              value={manualForm.categoryId}
              onChange={(event) =>
                setManualForm((form) => ({
                  ...form,
                  categoryId: event.target.value,
                  newCategoryName: event.target.value
                    ? ""
                    : form.newCategoryName,
                }))
              }
            >
              <option value="">Kategori seçilmedi</option>
              {expenseCategoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.ad}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Yeni Kategori">
            <input
              value={manualForm.newCategoryName}
              onChange={(event) =>
                setManualForm((form) => ({
                  ...form,
                  newCategoryName: event.target.value,
                  categoryId: event.target.value.trim() ? "" : form.categoryId,
                }))
              }
              placeholder="Boya / Kimyasal, Yemek Gideri..."
            />
          </Field>
          <div className="profit-loss-category-presets full">
            <button
              type="button"
              onClick={() =>
                assignSuggestedManualExpense(
                  "Selvi Boya Gideri",
                  "Boya / Kimyasal",
                )
              }
            >
              Selvi Boya
            </button>
            <button
              type="button"
              onClick={() =>
                assignSuggestedManualExpense("Can Yemek Gideri", "Yemek Gideri")
              }
            >
              Can Yemek
            </button>
            <button
              type="button"
              onClick={() =>
                assignSuggestedManualExpense("Ambalaj Gideri", "Ambalaj Gideri")
              }
            >
              Ambalaj
            </button>
            <button
              type="button"
              onClick={() =>
                assignSuggestedManualExpense("Kira Gideri", "Kira Gideri", {
                  repeatMonthly: true,
                })
              }
            >
              Aylık Kira
            </button>
            <button
              type="button"
              onClick={() =>
                assignSuggestedManualExpense(
                  "Personel Sabit Gideri",
                  "Sabit Giderler",
                  { repeatMonthly: true },
                )
              }
            >
              Sabit Personel
            </button>
          </div>
          <label className="mh-chip profit-loss-repeat-toggle">
            <input
              type="checkbox"
              checked={manualForm.repeatMonthly}
              onChange={(event) =>
                setManualForm((form) => ({
                  ...form,
                  repeatMonthly: event.target.checked,
                  date: form.date || dateFrom,
                }))
              }
            />
            Her ay sabit gider olarak işle
          </label>
          <Field label={manualForm.repeatMonthly ? "İlk Ay" : "Tarih"}>
            <input
              type="date"
              value={manualForm.date}
              onChange={(event) =>
                setManualForm((form) => ({ ...form, date: event.target.value }))
              }
            />
          </Field>
          {manualForm.repeatMonthly ? (
            <Field label="Bitiş">
              <input
                type="date"
                value={manualForm.endDate}
                onChange={(event) =>
                  setManualForm((form) => ({
                    ...form,
                    endDate: event.target.value,
                  }))
                }
              />
            </Field>
          ) : null}
          <Field label="Tutar">
            <input
              value={manualForm.amount}
              onChange={(event) =>
                setManualForm((form) => ({
                  ...form,
                  amount: event.target.value,
                }))
              }
              placeholder="10000"
            />
          </Field>
          <Field label="KDV Tutarı">
            <input
              value={manualForm.vat}
              onChange={(event) =>
                setManualForm((form) => ({ ...form, vat: event.target.value }))
              }
              placeholder="0"
            />
          </Field>
          <Field label="Açıklama">
            <textarea
              value={manualForm.description}
              onChange={(event) =>
                setManualForm((form) => ({
                  ...form,
                  description: event.target.value,
                }))
              }
              placeholder="Aylık kira, personel avansı, ek gider..."
            />
          </Field>
          <button
            className="mh-btn primary"
            type="button"
            onClick={saveManualExpense}
            disabled={saveBusy}
          >
            {saveBusy
              ? "Kaydediliyor..."
              : manualForm.id
                ? "Gider Kalemi Güncelle"
                : "Gider Kalemi Ekle"}
          </button>
          {manualForm.id ? (
            <button className="mh-btn" type="button" onClick={resetManualForm}>
              Yeni Kalem
            </button>
          ) : null}
          <button
            className="mh-btn"
            type="button"
            onClick={() => goTab?.("gider-kategorileri")}
          >
            Kategori Yönet
          </button>
          {manualItems.length ? (
            <div className="profit-loss-manual-list">
              {manualItems.slice(0, 8).map((item) => (
                <div key={item.id} className="profit-loss-manual-row">
                  <span>
                    <strong>{item.ad}</strong>
                    <small>
                      {String(item.kartTipi || "").toUpperCase() ===
                      "AYLIK_SABIT"
                        ? "Her ay"
                        : date(item.tarih || item.baslangic)}
                      {" / "}
                      {money(item.tutar)} + KDV {money(item.kdv)}
                    </small>
                  </span>
                  <button type="button" onClick={() => editManualItem(item)}>
                    Düzenle
                  </button>
                  <button type="button" onClick={() => deleteManualItem(item)}>
                    Çıkar
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {feedback ? <div className="mh-state">{feedback}</div> : null}
        </div>
      </Card>

      <Card
        title="Gelir / Gider Detayları"
        subtitle={
          activeLedgerTab === "income"
            ? "Müşteri gelirleri ve kesilen faturalar"
            : "Tedarikçi giderleri, manuel giderler ve dahil/çıkar durumu"
        }
        action={
          <div className="profit-loss-ledger-tabs">
            <button
              className={activeLedgerTab === "income" ? "active" : ""}
              type="button"
              onClick={() => setActiveLedgerTab("income")}
            >
              Gelir Listesi
            </button>
            <button
              className={activeLedgerTab === "expense" ? "active" : ""}
              type="button"
              onClick={() => setActiveLedgerTab("expense")}
            >
              Gider Listesi
            </button>
          </div>
        }
      >
        <DataTable
          columns={[
            "Tarih",
            "Belge No",
            "Firma",
            "Kategori",
            "Matrah",
            "KDV",
            "Toplam",
            "Durum",
            "İşlem",
          ]}
          rows={ledgerRows}
          emptyText={
            activeLedgerTab === "income"
              ? "Bu tarih aralığında gelir yok."
              : "Bu tarih aralığında gider yok."
          }
          renderRow={renderLedgerRow}
        />
      </Card>
    </div>
  );
}

function Reports({ activeMainCompany, goTab }) {
  return (
    <MuhasebeReportsWorkspace
      activeMainCompany={activeMainCompany}
      goTab={goTab}
    />
  );
}

function LegacyReports({ activeMainCompany, refreshKey, goTab }) {
  const defaultRange = useMemo(() => monthRange(0), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [firmId, setFirmId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const companyState = useEndpoint(
    "/muhasebe/firmalar",
    activeMainCompany,
    refreshKey,
    { limit: 500 },
  );
  const companies = asArray(companyState.data).map(normalizeFirm);
  const categoryState = useEndpoint(
    "/muhasebe/rapor-kategorileri",
    activeMainCompany,
    refreshKey,
  );
  const categories = asArray(categoryState.data).filter(
    (category) => category.aktifMi !== false,
  );
  const state = useEndpoint(
    "/muhasebe/rapor-ozet",
    activeMainCompany,
    `${refreshKey || 0}-${reportRefreshKey}`,
    {
      dateFrom,
      dateTo,
      baslangic: dateFrom,
      bitis: dateTo,
      firmaId: firmId || undefined,
      kategoriId: categoryId || undefined,
      tur: typeFilter || undefined,
      q: search || undefined,
    },
  );
  const reportData = unwrap(state.data) || {};
  const ana = reportData.anaOzet || {};
  const summaryRows = useMemo(
    () => Array.isArray(reportData.kategoriOzetleri) ? reportData.kategoriOzetleri : [],
    [reportData.kategoriOzetleri],
  );
  const categoryRows = useMemo(() => {
    const summaryById = new Map(
      summaryRows.map((row) => [row?.kategoriId, row]),
    );
    const rows = showAllCategories
      ? categories
          .filter((category) => category.aktifMi !== false)
          .map((category) => ({
            ...(summaryById.get(category.id) || {}),
            kategoriId: category.id,
            kategori: category.ad,
            belgeAdedi: summaryById.get(category.id).belgeAdedi || 0,
            tutar: summaryById.get(category.id).tutar || 0,
            kdv: summaryById.get(category.id).kdv || 0,
            genelToplam: summaryById.get(category.id).genelToplam || 0,
          }))
      : summaryRows.filter(
          (row) =>
            Number(row?.genelToplam || 0) !== 0 ||
            Number(row?.tutar || 0) !== 0 ||
            Number(row?.kdv || 0) !== 0 ||
            Number(row?.belgeAdedi || 0) > 0,
        );
    return rows;
  }, [categories, showAllCategories, summaryRows]);
  const movementRows = Array.isArray(reportData.hareketler)
    ? reportData.hareketler
    : [];
  const totals = movementRows.reduce(
    (acc, row) => {
      acc.tutar += Number(row?.tutar || 0);
      acc.kdv += Number(row?.kdv || 0);
      acc.genelToplam += Number(row?.genelToplam || 0);
      return acc;
    },
    { tutar: 0, kdv: 0, genelToplam: 0 },
  );

  const downloadExcelPackage = async () => {
    window.open(
      buildApiUrl("/muhasebe/rapor-excel", {
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
        dateFrom,
        dateTo,
        baslangic: dateFrom,
        bitis: dateTo,
        firmaId: firmId || undefined,
        kategoriId: categoryId || undefined,
        tur: typeFilter || undefined,
        q: search || undefined,
      }),
      "_blank",
    );
  };

  return (
    <div className="mh-stack">
      <Card
        title="Muhasebe Dönem Özeti"
        subtitle="Firma kartı rapor kategorilerine göre dönem özeti"
        action={
          <div className="mh-actions">
            <button
              className="mh-btn"
              type="button"
              onClick={() => goTab?.("gider-kategorileri")}
            >
              Kategori Yönet
            </button>
            <button
              className="mh-btn"
              type="button"
              onClick={downloadExcelPackage}
            >
              Excel'e Aktar
            </button>
          </div>
        }
      >
        <div className="mh-form-grid four">
          <Field label="Başlangıç">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event?.target.value)}
            />
          </Field>
          <Field label="Bitiş">
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event?.target.value)}
            />
          </Field>
          <Field label="Firma">
            <select
              value={firmId}
              onChange={(event) => setFirmId(event?.target.value)}
            >
              <option value="">Tüm firmalar</option>
              {companies.map((company) => (
                <option key={company?.id} value={company?.id}>
                  {company?.firmaAdi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kategori">
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event?.target.value)}
            >
              <option value="">Tüm kategoriler</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.ad}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tür">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event?.target.value)}
            >
              <option value="">Tümü</option>
              <option value="KESILEN">Kesilen</option>
              <option value="RESMI_GELEN">Resmi Gelen</option>
              <option value="GAYRI_RESMI">Gayri Resmi</option>
              <option value="PERSONEL">Personel</option>
              <option value="YEMEK">Yemek</option>
              <option value="HAFTALIK">Haftalık</option>
              <option value="YEVMIYECI">Yövmiyeci</option>
            </select>
          </Field>
          <Field label="Arama">
            <input
              value={search}
              onChange={(event) => setSearch(event?.target.value)}
              placeholder="Firma, kategori, belge no veya açıklama ara"
            />
          </Field>
          <div className="mh-actions">
            <button
              className="mh-btn primary"
              type="button"
              onClick={() => setReportRefreshKey((value) => value + 1)}
            >
              Raporu Getir
            </button>
          </div>
        </div>
        <StatusBlock state={state} />
        <div className="mh-summary-grid four compact-cards">
          <CariSummaryMetric
            label="Kesilen Fatura"
            value={money(ana?.kesilenFatura?.toplam)}
            hint={`${ana?.kesilenFatura?.belgeAdedi || 0} belge / KDV ${money(ana?.kesilenFatura?.kdv)}`}
          />
          <CariSummaryMetric
            label="Gelen Faturalar"
            value={money(ana?.gelenFaturalar?.toplam)}
            hint={`Resmi ${money(ana?.gelenFaturalar?.resmiToplam)} / Gayri ${money(ana?.gelenFaturalar?.gayriResmiToplam)}`}
            tone="yellow"
          />
          <CariSummaryMetric
            label="KDV Durumu"
            value={money(ana?.kdvDurumu?.sonuc)}
            hint={
              Number(ana?.kdvDurumu?.sonuc || 0) >= 0
                ? "Ödenecek KDV"
                : "Devredecek KDV"
            }
            tone={Number(ana?.kdvDurumu?.sonuc || 0) >= 0 ? "red" : "green"}
          />
          <CariSummaryMetric
            label="Personel / İşletme"
            value={money(ana?.personelIsletme?.toplam)}
            hint={`Personel ${money(ana?.personelIsletme?.personel)} / Yemek ${money(ana?.personelIsletme?.yemek)}`}
            tone="blue"
          />
        </div>
      </Card>

      <Card
        title="Kategori Kalemleri"
        action={
          <button
            className="mh-btn"
            type="button"
            onClick={() => setShowAllCategories((value) => !value)}
          >
            {showAllCategories ? "Sadece Hareketli" : "Tümünü Göster"}
          </button>
        }
      >
        <div className="mh-report-grid">
          {categoryRows.map((row) => (
            <button
              key={row?.kategoriId}
              className={`mh-report-tile ${categoryId === row?.kategoriId ? "active" : ""}`}
              type="button"
              onClick={() =>
                setCategoryId(
                  categoryId === row?.kategoriId ? "" : row?.kategoriId,
                )
              }
            >
              <strong>{row?.kategori}</strong>
              <span>{money(row?.genelToplam)}</span>
              <small>{row?.belgeAdedi} belge</small>
            </button>
          ))}
          {!categoryRows.length ? (
            <div className="mh-state">Kayıt bulunamadı.</div>
          ) : null}
        </div>
      </Card>

      <Card title="Hareket Listesi" subtitle={`${dateFrom} - ${dateTo}`}>
        <DataTable
          columns={[
            "Tarih",
            "Tür",
            "Kategori",
            "Firma",
            "Belge No",
            "Açıklama",
            "Tutar",
            "KDV",
            "Genel Toplam",
          ]}
          rows={movementRows}
          emptyText="Bu tarih aralığında kayıt yok."
          renderRow={(row) => (
            <tr key={row?.id || `${row?.tarih}-${row?.belgeNo}-${row?.tur}`}>
              <td>{date(row?.tarih)}</td>
              <td>{row?.turEtiketi || row?.tur || "-"}</td>
              <td>{row?.kategori || "-"}</td>
              <td>{row?.firma || "-"}</td>
              <td>{row?.belgeNo || "-"}</td>
              <td>{row?.aciklama || "-"}</td>
              <td>{money(row?.tutar)}</td>
              <td>{money(row?.kdv)}</td>
              <td>{money(row?.genelToplam)}</td>
            </tr>
          )}
        />
        <div className="mh-summary-grid four compact-cards">
          <CariSummaryMetric label="Toplam Tutar" value={money(totals.tutar)} />
          <CariSummaryMetric label="Toplam KDV" value={money(totals.kdv)} />
          <CariSummaryMetric
            label="Genel Toplam"
            value={money(totals.genelToplam)}
          />
          <CariSummaryMetric
            label="Satır"
            value={String(movementRows.length)}
          />
        </div>
      </Card>
    </div>
  );
}

function SupplierInvoiceArchiveReport({ activeMainCompany }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const [filters, setFilters] = useState({
    supplier: "",
    dateFrom: "",
    dateTo: "",
    status: "ALL",
    user: "",
    documentKind: "SUPPLIER_INVOICE",
  });

  const setFilter = (key, value) =>
    setFilters((previous) => ({ ...previous, [key]: value }));

  const loadRows = useCallback(async () => {
    if (!activeMainCompany?.slug) {
      setState({
        loading: false,
        error: "Ana firma secmeden rapor acilmaz.",
        rows: [],
      });
      return;
    }
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    try {
      const response = await fetchBelgeImport(activeMainCompany, {
        _ts: Date.now(),
      });
      setState({
        loading: false,
        error: "",
        rows: Array.isArray(response) ? response : [],
      });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Tedarikci fatura arsivi alinamadi.",
        rows: [],
      });
    }
  }, [activeMainCompany]);

  useEffect(() => {
    loadRows();
  }, [activeMainCompany?.slug, activeMainCompany?.id, loadRows]);

  const visibleRows = useMemo(() => {
    const supplierQuery = filters.supplier.trim().toLocaleLowerCase("tr-TR");
    const userQuery = filters.user.trim().toLocaleLowerCase("tr-TR");
    return state.rows
      .filter((row) => {
        const kind = String(row?.documentKind || row?.detectedType || "");
        if (filters.documentKind === "ALL") {
          return ["SUPPLIER_INVOICE", "EXPENSE_INVOICE"].includes(kind);
        }
        return kind === filters.documentKind;
      })
      .filter((row) => supplierReportMatchesStatus(row, filters.status))
      .filter((row) => {
        const issueDate = String(row?.issueDate || row?.createdAt || "").slice(
          0,
          10,
        );
        if (filters.dateFrom && issueDate < filters.dateFrom) return false;
        if (filters.dateTo && issueDate > filters.dateTo) return false;
        return true;
      })
      .filter((row) => {
        if (!supplierQuery) return true;
        return `${row?.issuerName || ""} ${row?.companyName || ""} ${row?.receiverName || ""} ${row?.documentNo || ""}`
          .toLocaleLowerCase("tr-TR")
          .includes(supplierQuery);
      })
      .filter((row) => {
        if (!userQuery) return true;
        return supplierReportUser(row)
          .toLocaleLowerCase("tr-TR")
          .includes(userQuery);
      });
  }, [filters, state.rows]);

  const summary = useMemo(
    () => ({
      total: visibleRows.length,
      processed: visibleRows.filter((row) => isSupplierReportProcessed(row))
        .length,
      quarantine: visibleRows.filter((row) =>
        supplierReportMatchesStatus(row, "QUARANTINE"),
      ).length,
      amount: visibleRows.reduce(
        (sum, row) => sum + Number(row?.grandTotal || 0),
        0,
      ),
    }),
    [visibleRows],
  );

  return (
    <div className="mh-stack">
      <div className="mh-summary-grid four compact-cards">
        <CariSummaryMetric label="Belge" value={String(summary.total)} />
        <CariSummaryMetric
          label="Islenen"
          value={String(summary.processed)}
          tone="green"
        />
        <CariSummaryMetric
          label="Karantina"
          value={String(summary.quarantine)}
          tone="red"
        />
        <CariSummaryMetric
          label="Toplam"
          value={money(summary.amount)}
          tone="yellow"
        />
      </div>

      <div className="mh-form-grid three">
        <Field label="Tedarikci">
          <input
            value={filters.supplier}
            onChange={(event) => setFilter("supplier", event?.target.value)}
            placeholder="Tedarikci, belge no veya unvan ara"
          />
        </Field>
        <Field label="Tarih baslangic">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilter("dateFrom", event?.target.value)}
          />
        </Field>
        <Field label="Tarih bitis">
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilter("dateTo", event?.target.value)}
          />
        </Field>
        <Field label="Durum">
          <select
            value={filters.status}
            onChange={(event) => setFilter("status", event?.target.value)}
          >
            <option value="ALL">Tumu</option>
            <option value="PROCESSED">Islenen</option>
            <option value="QUARANTINE">Karantina</option>
            <option value="VAT_REVIEW">KDV inceleme</option>
            <option value="PRICE_MISSING">Fiyat eksik</option>
            <option value="DUPLICATE_DOCUMENT">Mukerrer belge</option>
            <option value="READY">Hazir / kontrolde</option>
          </select>
        </Field>
        <Field label="Kullanici">
          <input
            value={filters.user}
            onChange={(event) => setFilter("user", event?.target.value)}
            placeholder="Kullanici ara"
          />
        </Field>
        <Field label="Belge turu">
          <select
            value={filters.documentKind}
            onChange={(event) => setFilter("documentKind", event?.target.value)}
          >
            <option value="SUPPLIER_INVOICE">Tedarikci faturasi</option>
            <option value="EXPENSE_INVOICE">Gider faturasi</option>
            <option value="ALL">Tedarikci + gider</option>
          </select>
        </Field>
      </div>

      {state.error ? <div className="mh-state error">{state.error}</div> : null}
      {state.loading ? <div className="mh-state">Yukleniyor...</div> : null}

      <DataTable
        columns={[
          "Belge No",
          "Tedarikci",
          "Tarih",
          "Matrah",
          "KDV",
          "Toplam",
          "Durum",
          "Kontrol Nedeni",
          "Kullanici",
          "Muhasebe Kaydi",
        ]}
        rows={visibleRows}
        emptyText="Bu filtrede tedarikci fatura kontrol kaydi yok."
        renderRow={(row) => {
          const effects = row?.accountingEffects || {};
          return (
            <tr key={row?.id || row?.documentNo || row?.createdAt}>
              <td>
                <b>{row?.documentNo || row?.invoiceNo || "-"}</b>
                <small>{row?.sourceType || row?.originalFileName || "-"}</small>
              </td>
              <td>
                {row?.issuerName ||
                  row?.companyName ||
                  row?.receiverName ||
                  "-"}
              </td>
              <td>{date(row?.issueDate || row?.createdAt)}</td>
              <td>{money(row?.subtotal)}</td>
              <td>{money(row?.vatTotal)}</td>
              <td>{money(row?.grandTotal)}</td>
              <td>
                <Badge tone={supplierReportTone(row)}>
                  {supplierReportStatusLabel(row)}
                </Badge>
              </td>
              <td>{supplierReportReason(row)}</td>
              <td>{supplierReportUser(row)}</td>
              <td>
                Cari:{" "}
                {effects.currentAccountMovementId ||
                  effects.cariMovementId ||
                  "-"}
                <br />
                KDV: {effects.vatRecordId || "-"}
              </td>
            </tr>
          );
        }}
      />
    </div>
  );
}

function Impact({ title, children }) {
  return (
    <div className="mh-impact">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function SideLine({ label, value }) {
  return (
    <div className="mh-side-line">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

const styles = `
.muhasebe-workbench {
  --mh-blue: #0e63d8;
  --mh-dark: #07172d;
  --mh-border: #d7e1ef;
  --mh-muted: #64748b;
  color: #0f2742;
  font-size: 13px;
  padding: 16px 18px 28px;
}
.muhasebe-workbench * { box-sizing: border-box; }
.muhasebe-workbench button,
.muhasebe-workbench input,
.muhasebe-workbench select,
.muhasebe-workbench textarea { font: inherit; }
.muhasebe-workbench input,
.muhasebe-workbench select,
.muhasebe-workbench textarea,
.mh-input {
  width: 100%;
  border: 1px solid #c8d7eb;
  border-radius: 7px;
  padding: 8px 9px;
  outline: none;
  background: white;
  color: #102a46;
}
.muhasebe-workbench textarea { min-height: 74px; resize: vertical; }
.mh-page-head,
.mh-tabs,
.mh-card,
.mh-summary,
.mh-invoice-paper {
  background: white;
  border: 1px solid var(--mh-border);
  border-radius: 10px;
  box-shadow: 0 5px 16px rgba(15, 39, 66, 0.04);
}
.mh-page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.mh-page-head h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
.mh-page-head p { margin: 4px 0 0; color: var(--mh-muted); }
.mh-tabs { display: flex; gap: 7px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: thin; padding: 8px; margin-bottom: 10px; }
.mh-tab-btn,
.mh-btn {
  border: 1px solid #c8d7eb;
  background: white;
  color: #14304f;
  border-radius: 7px;
  padding: 8px 11px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.25;
  text-align: center;
  flex: 0 0 auto;
}
.mh-tab-btn { background: #f8fbff; }
.mh-tab-btn.active,
.mh-btn.primary { background: var(--mh-blue); border-color: var(--mh-blue); color: white; }
.mh-btn:disabled { opacity: .55; cursor: not-allowed; }
.mh-card { margin-bottom: 10px; overflow: hidden; }
.mh-card-head {
  padding: 11px 12px;
  border-bottom: 1px solid #dbe5f3;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.mh-card-head h2 { margin: 0; font-size: 15px; letter-spacing: 0; }
.mh-card-head small { display: block; margin-top: 3px; color: var(--mh-muted); }
.mh-card-body { padding: 12px; }
.mh-state { border: 1px solid #d8e4f3; border-radius: 9px; padding: 10px; background: #fbfdff; color: #38516d; font-weight: 800; margin-bottom: 10px; }
.mh-state.error { border-color: #ffd0d0; background: #fff5f5; color: #b42318; }
.mh-summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 10px; }
.mh-summary-grid.four { grid-template-columns: repeat(4, 1fr); }
.mh-summary { padding: 11px; }
.mh-summary span { color: var(--mh-muted); font-size: 12px; font-weight: 800; }
.mh-summary b { display: block; margin-top: 5px; font-size: 19px; color: #0c2f58; }
.mh-summary.blue { background: #f2f7ff; }
.mh-summary.green { background: #f2fbf6; }
.mh-summary.yellow { background: #fff8e8; }
.mh-summary.red { background: #fff4f4; }
.mh-summary.dark { background: var(--mh-dark); color: white; }
.mh-summary.dark span, .mh-summary.dark b { color: white; }
.mh-layout-3 { display: grid; grid-template-columns: 280px minmax(760px, 1fr) 335px; gap: 12px; align-items: start; }
.mh-layout-3.mh-model-page { grid-template-columns: 340px minmax(820px, 1fr) 280px; }
.mh-layout-3.compact { grid-template-columns: 320px minmax(560px, 1fr) 330px; }
.mh-layout-3.compact.mh-cari-layout { grid-template-columns: 310px minmax(0, 1fr) 480px; align-items: stretch; }
.mh-layout-3.mail { grid-template-columns: 320px minmax(640px, 1fr) 350px; }
.mh-layout-3.contact { grid-template-columns: 320px minmax(580px, 1fr) 340px; }
.mh-layout-3.mh-company-cards-page { grid-template-columns: 360px minmax(620px, 1fr) 300px; align-items: stretch; }
.mh-company-cards-page > .mh-card { min-height: calc(100vh - 330px); }
.mh-company-cards-page .mh-doc-list { max-height: calc(100vh - 565px); padding: 8px 0 0; scrollbar-gutter: stable; }
.mh-company-cards-page .mh-card-body { min-height: 0; }
.mh-layout-2 { display: grid; grid-template-columns: minmax(760px, 1fr) 350px; gap: 10px; align-items: start; }
.mh-stack { display: grid; gap: 12px; align-items: start; }
.mh-sub-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.mh-sub-tabs .mh-tab-btn { min-width: 140px; justify-content: center; }
.mh-product-admin-layout { grid-template-columns: minmax(760px, 1fr) 360px; }
.mh-product-filter-grid { align-items: end; }
.mh-inline-note { display: block; margin-top: 3px; color: #b45309; font-size: 11px; font-weight: 800; }
.mh-duplicate-panel {
  border: 1px solid #f6c453;
  background: #fffbeb;
  border-radius: 10px;
  padding: 10px;
  margin: 10px 0;
  display: grid;
  gap: 8px;
}
.mh-duplicate-panel > strong {
  color: #7c4a03;
  font-size: 13px;
}
.mh-duplicate-panel p {
  margin: 0;
  color: #7c4a03;
  line-height: 1.4;
}
.mh-duplicate-list { display: grid; gap: 7px; }
.mh-duplicate-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  background: white;
  border: 1px solid #f8dda1;
  border-radius: 9px;
  padding: 8px;
}
.mh-duplicate-row b,
.mh-duplicate-row span { display: block; }
.mh-duplicate-row span {
  margin-top: 3px;
  color: #6b7280;
  font-size: 11px;
  font-weight: 800;
}
.mh-alias-log-body strong {
  display: block;
  margin-bottom: 6px;
  color: #0f2745;
}
.mh-alias-log-body p {
  margin: 0;
  color: #60728c;
  font-size: 12px;
}
.mh-log-row {
  border: 1px solid #e1eaf6;
  border-radius: 8px;
  background: white;
  padding: 8px;
  margin-bottom: 6px;
}
.mh-log-row b,
.mh-log-row span { display: block; }
.mh-log-row span {
  margin-top: 3px;
  color: #60728c;
  font-size: 11px;
  font-weight: 800;
}
.mh-upload-box {
  border: 2px dashed #9dc4ff;
  background: #f7fbff;
  border-radius: 10px;
  padding: 18px;
  text-align: center;
  font-weight: 900;
  color: #0e4fae;
  margin-bottom: 10px;
}
.mh-upload-box small { display: block; margin: 5px 0 10px; color: #60728c; }
.mh-inline-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.mh-list-sort-actions { justify-content: stretch; }
.mh-list-sort-actions .mh-btn {
  flex: 1 1 0;
  min-width: 0;
  padding: 8px;
}
.mh-sort-icon {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
}
.mh-sort-icon.asc {
  transform: rotate(-135deg);
  margin-top: 3px;
}
.mh-sort-icon.desc {
  transform: rotate(45deg);
  margin-bottom: 3px;
}
.mh-doc-filter-select {
  display: grid;
  gap: 4px;
  min-width: 128px;
}
.mh-doc-filter-select span {
  font-size: 11px;
  font-weight: 800;
  color: #5d7089;
}
.mh-doc-filter-select select {
  min-width: 128px;
}
.mh-doc-pool-top {
  padding: 0 12px 12px;
}
.mh-upload-box-inline {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #d8e4f3;
  border-radius: 10px;
  background: linear-gradient(180deg, #f8fbff 0%, #f2f7ff 100%);
}
.mh-upload-box-inline strong {
  display: block;
  color: #14304f;
  font-size: 13px;
}
.mh-upload-box-inline small {
  margin-bottom: 0;
}
.mh-upload-box-inline input {
  width: 100%;
}
.mh-doc-list { max-height: 690px; overflow: auto; padding: 10px 2px 0; }
.mh-cari-firm-list .mh-doc-list { min-height: 420px; max-height: calc(100vh - 320px); }
.mh-doc-select-item { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 8px; align-items: stretch; }
.mh-doc-check { display: grid; place-items: start center; padding-top: 14px; }
.mh-doc-check input { width: 15px; height: 15px; accent-color: var(--mh-blue); }
.mh-doc-item {
  width: 100%;
  text-align: left;
  border: 1px solid #d8e4f3;
  border-radius: 9px;
  padding: 9px;
  margin-bottom: 8px;
  cursor: pointer;
  background: white;
  color: #14304f;
}
.mh-doc-item.active { border-color: var(--mh-blue); background: #eef6ff; box-shadow: inset 3px 0 0 var(--mh-blue); }
.mh-doc-item strong,
.mh-doc-item span { display: block; }
.mh-doc-item strong { margin-bottom: 4px; }
.mh-doc-item span { font-size: 12px; color: #53667f; line-height: 1.4; }
.mh-empty-panel {
  min-height: 320px;
  display: grid;
  place-content: center;
  gap: 8px;
  padding: 28px;
  text-align: center;
  color: #5b6f89;
}
.mh-empty-panel h3 {
  margin: 0;
  color: #14304f;
  font-size: 18px;
}
.mh-empty-panel p {
  margin: 0;
  max-width: 420px;
  line-height: 1.5;
}
.mh-search-field { display: grid; gap: 7px; }
.mh-search-option-list { display: grid; gap: 6px; max-height: 210px; overflow: auto; }
.mh-search-option {
  width: 100%;
  border: 1px solid #d8e4f3;
  border-radius: 8px;
  background: #fbfdff;
  text-align: left;
  padding: 8px 10px;
  color: #14304f;
}
.mh-search-option.active { border-color: var(--mh-blue); background: #eef6ff; }
.mh-search-option strong,
.mh-search-option span { display: block; }
.mh-search-option span { margin-top: 4px; font-size: 11px; color: #60728c; }
.mh-search-empty {
  border: 1px dashed #c8d7ea;
  border-radius: 8px;
  background: #fbfdff;
  padding: 8px 10px;
  color: #60728c;
  font-size: 12px;
}
.mh-badge {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px !important;
  font-weight: 900;
  width: fit-content;
}
.mh-badge.ok { background: #e8f8ef; color: #08723e; }
.mh-badge.warn { background: #fff2d7; color: #8a5a00; }
.mh-badge.bad { background: #ffe8e8; color: #bd1d1d; }
.mh-badge.blue { background: #eaf2ff; color: #0d55c8; }
.mh-badge.gray { background: #eef2f7; color: #3c4b5f; }
.mh-invoice-paper { padding: 16px; }
.mh-invoice-title {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 2px solid #102a46;
  padding-bottom: 12px;
  margin-bottom: 12px;
}
.mh-invoice-title h2 { margin: 0; font-size: 20px; letter-spacing: 0; }
.mh-invoice-title p { margin: 5px 0 0; }
.mh-doc-no { text-align: right; line-height: 1.55; }
.mh-party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.mh-party-box,
.mh-meta-cell,
.mh-note-box,
.mh-impact,
.mh-mail-preview {
  border: 1px solid #d8e4f3;
  border-radius: 9px;
  padding: 10px;
  background: #fbfdff;
}
.mh-party-box h3,
.mh-impact h4,
.mh-mail-preview h3 { margin: 0 0 8px; font-size: 13px; color: var(--mh-blue); letter-spacing: 0; }
.mh-party-box p,
.mh-impact p { margin: 4px 0; line-height: 1.35; }
.mh-invoice-meta,
.mh-info-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
.mh-info-grid { grid-template-columns: repeat(3, 1fr); }
.mh-meta-cell span { display: block; color: #6b7b92; font-size: 11px; font-weight: 900; margin-bottom: 4px; }
.mh-table-wrap { overflow: auto; border: 1px solid #d8e4f3; border-radius: 9px; background: white; margin-bottom: 10px; }
.mh-table-wrap table { width: 100%; border-collapse: collapse; min-width: 1080px; }
.mh-model-page .mh-table-wrap table { min-width: 1380px; }
.mh-table-wrap th {
  background: #f2f6fb;
  color: #38516d;
  text-align: left;
  padding: 9px;
  font-size: 12px;
  border-bottom: 1px solid #d8e4f3;
  white-space: nowrap;
}
.mh-table-wrap td { padding: 8px 9px; border-bottom: 1px solid #edf2f8; white-space: nowrap; vertical-align: middle; }
.mh-table-wrap tr.mh-row-active td { background: #eef6ff; }
.mh-link-btn {
  border: 0;
  background: transparent;
  color: #0b5bd3;
  font: inherit;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
}
.mh-link-btn:disabled { color: #8da3bf; cursor: not-allowed; text-decoration: none; }
.mh-cari-layout .mh-card { min-height: 0; }
.mh-cari-main { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.mh-cari-summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 0; }
.mh-cari-summary-card { border: 1px solid #d8e4f3; border-radius: 10px; min-height: 78px; display: flex; flex-direction: column; justify-content: center; }
.mh-cari-summary-card small { display: block; margin-top: 4px; color: #54677f; font-size: 11px; font-weight: 800; }
.mh-summary.dark.mh-cari-summary-card small { color: rgba(255,255,255,.84); }
.mh-cari-filters { border: 1px solid #d8e4f3; border-radius: 10px; background: #fbfdff; padding: 10px; margin-top: 0; }
.mh-cari-quick-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
.mh-cari-quick-row?.two { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
.mh-cari-quick-row .mh-btn { min-height: 38px; padding: 8px 9px; }
.mh-cari-filter-grid { margin-bottom: 0; gap: 8px; align-items: end; }
.mh-cari-filter-grid-top,
.mh-cari-filter-grid-bottom { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.mh-cari-filter-grid input,
.mh-cari-filter-grid select,
.mh-cari-side-panel input,
.mh-cari-side-panel select,
.mh-cari-side-panel textarea { width: 100%; min-height: 34px; border: 1px solid #cfdceb; border-radius: 8px; padding: 7px 9px; background: white; color: #0f2742; }
.mh-cari-side-panel textarea { min-height: 94px; resize: vertical; }
.mh-cari-filter-chip { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.mh-cari-filter-actions { justify-content: flex-end; }
.mh-cari-filter-actions .mh-btn { min-height: 34px; }
.mh-cari-table-area { min-height: 0; }
.mh-cari-table-area .mh-table-wrap { max-height: calc(100vh - 430px); margin-bottom: 0; }
.mh-cari-side-panel { display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
.mh-cari-side-panel * { min-width: 0; }
.mh-cari-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.mh-cari-tabs .mh-tab-btn { width: 100%; }
.mh-cari-side-scroll { min-height: 0; max-height: calc(100vh - 260px); overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
.mh-cari-panel-actions { justify-content: stretch; }
.mh-cari-panel-actions .mh-btn { flex: 1 1 0; min-width: 0; }
.mh-cari-invoice-totals { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.mh-cari-invoice-lines { overflow: hidden; border: 1px solid #d8e4f3; border-radius: 9px; background: white; }
.mh-cari-invoice-lines table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.mh-cari-invoice-lines th,
.mh-cari-invoice-lines td { padding: 8px 9px; border-bottom: 1px solid #edf2f8; white-space: normal; word-break: break-word; overflow-wrap: anywhere; text-align: left; font-size: 11px; }
.mh-cari-invoice-lines th { padding: 8px 9px; border-bottom: 1px solid #edf2f8; white-space: normal; word-break: break-word; overflow-wrap: anywhere; text-align: left; font-size: 11px; }
.mh-cari-invoice-lines th { background: #f2f6fb; color: #38516d; font-size: 12px; }
.mh-cari-pdf-preview { width: 100%; min-height: 420px; border: 1px solid #d8e4f3; border-radius: 9px; background: white; }
.mh-product-match-actions { margin-bottom: 8px; }
.mh-product-match .mh-table-wrap { margin-bottom: 0; }
.mh-product-match.compact .mh-table-wrap table { min-width: 1260px; }
.mh-cell-wrap strong,
.mh-cell-wrap small { display: block; }
.mh-cell-wrap small { margin-top: 4px; color: #5c6f87; white-space: normal; }
.mh-line-match-actions { display: grid; gap: 6px; min-width: 220px; }
.mh-line-match-buttons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.mh-line-match-buttons.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.mh-line-match-buttons .mh-btn { width: 100%; min-width: 0; }
.mh-inventory-layout .mh-card { min-height: 0; }
.mh-model-page .mh-table-wrap th { padding: 8px 10px; font-size: 11px; }
.mh-model-page .mh-table-wrap td { padding: 8px 10px; }
.mh-model-page .mh-table-wrap input,
.mh-model-page .mh-table-wrap select {
  min-width: 76px;
  height: 34px;
  padding: 7px 8px;
}
.mh-model-page .mh-table-wrap td:nth-child(3) {
  min-width: 340px;
  max-width: 420px;
  white-space: normal;
  line-height: 1.35;
}
.mh-model-page .mh-table-wrap td:nth-child(4) select,
.mh-model-page .mh-table-wrap td:nth-child(14) select {
  min-width: 118px;
}
.mh-invoice-bottom { display: grid; grid-template-columns: 1fr 330px; gap: 12px; margin-top: 12px; }
.mh-note-box { min-height: 130px; }
.mh-totals { border: 1px solid #d8e4f3; border-radius: 9px; overflow: hidden; }
.mh-total-row { display: flex; justify-content: space-between; gap: 10px; padding: 9px 10px; border-bottom: 1px solid #edf2f8; background: white; }
.mh-total-row:last-child { border-bottom: 0; background: var(--mh-dark); color: white; font-weight: 900; font-size: 15px; }
.mh-impact { margin-bottom: 8px; }
.mh-side-line { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid #edf2f8; padding: 8px 0; }
.mh-side-line span { color: var(--mh-muted); }
.mh-side-line b { text-align: right; }
.mh-action-stack { display: grid; gap: 7px; margin-top: 10px; }
.mh-action-stack .mh-btn { width: 100%; }
.mh-action-stack .mh-cari-period-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.mh-action-stack .mh-cari-period-actions > span { margin-right: 4px; color: #64748b; font-size: 11px; font-weight: 900; white-space: nowrap; }
.mh-action-stack .mh-cari-period-actions .mh-btn { width: auto; min-width: 82px; padding: 7px 12px; flex: 0 0 auto; }
.mh-form-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }
.mh-form-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.mh-form-grid.three { grid-template-columns: repeat(3, 1fr); }
.mh-form-grid.six { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.mh-list-filter-grid { margin-bottom: 0; }
.mh-package-controls { grid-template-columns: 1fr; }
.mh-package-controls .mh-btn { width: 100%; min-height: 38px; }
.mh-model-controls { grid-template-columns: minmax(260px, 1fr) minmax(240px, .9fr) 180px; align-items: end; }
.mh-model-controls .mh-btn { width: 100%; min-height: 38px; }
.mh-package-summary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.mh-package-summary .mh-summary {
  min-height: 76px;
}
.mh-package-summary .mh-summary:first-child {
  grid-column: 1 / -1;
}
.mh-package-summary .mh-summary b {
  font-size: 22px;
  overflow-wrap: anywhere;
}
.mh-field span { display: block; margin-bottom: 5px; font-size: 12px; font-weight: 900; color: #344a64; }
.mh-button-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 10px; }
.mh-mail-preview { margin-top: 10px; line-height: 1.5; white-space: pre-line; }
.mh-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
.mh-contact-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 10px; align-items: start; }
.mh-contact-workspace { display: grid; gap: 10px; min-width: 0; }
.mh-firm-contact-button { width: 100%; border: 1px solid var(--mh-border); background: #fff; border-radius: 8px; padding: 10px; text-align: left; display: grid; gap: 4px; cursor: pointer; }
.mh-firm-contact-button + .mh-firm-contact-button { margin-top: 8px; }
.mh-firm-contact-button.active { border-color: var(--mh-blue); background: #eff6ff; }
.mh-firm-contact-button strong { font-size: 12px; color: var(--mh-text); line-height: 1.25; }
.mh-firm-contact-button span,
.mh-firm-contact-button small { font-size: 11px; color: var(--mh-muted); }
.mh-selected-firm-strip { display: flex; justify-content: space-between; gap: 10px; align-items: center; border: 1px solid var(--mh-border); border-radius: 8px; padding: 10px; background: #f8fafc; margin-bottom: 10px; }
.mh-selected-firm-strip span { display: block; font-size: 11px; color: var(--mh-muted); }
.mh-selected-firm-strip strong { display: block; font-size: 13px; color: var(--mh-text); }
.mh-info-line { border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 8px; padding: 8px 10px; font-size: 12px; margin-bottom: 10px; }
.mh-contact-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.mh-contact-form .mh-field:has(textarea),
.mh-contact-form .mh-contact-permissions,
.mh-contact-form .mh-button-row { grid-column: 1 / -1; }
.mh-chip { border: 1px solid #b7d3ff; background: #eef6ff; color: #0d55c8; border-radius: 999px; padding: 5px 8px; font-weight: 900; font-size: 11px; }
.mh-report-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.mh-report-tile { min-height: 72px; border: 1px solid #d8e4f3; border-radius: 9px; background: #fbfdff; color: #14304f; font-weight: 900; cursor: pointer; }
.mh-report-tile.active { border-color: var(--mh-blue); background: #eef6ff; }
.compact-cards .mh-summary b { font-size: 17px; }
@media (max-width: 1500px) {
  .mh-layout-3,
  .mh-layout-3.compact,
  .mh-layout-3.mail,
  .mh-layout-3.compact { grid-template-columns: 340px minmax(540px, 1fr) 320px; }
  .mh-layout-3.compact.mh-cari-layout { grid-template-columns: 340px minmax(0, 1fr) 460px; align-items: stretch; }
  .mh-layout-3.mh-model-page { grid-template-columns: 310px minmax(720px, 1fr) 270px; }
  .mh-layout-3.contact { grid-template-columns: 340px minmax(560px, 1fr) 330px; }
  .mh-cari-summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .mh-doc-list { max-height: 690px; overflow: auto; padding: 10px 2px 0; }
  .mh-package-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mh-package-summary .mh-summary:first-child { grid-column: 1 / -1; }
  .mh-invoice-meta { grid-template-columns: repeat(3, 1fr); }
}
.mh-doc-item.firm-card {
    padding: 11px 12px;
    border-radius: 12px;
    display: grid;
    gap: 7px;
}
.mh-doc-item.firm-card strong,
.mh-doc-item.firm-card span,
.mh-doc-item.firm-card small { margin: 0; }
.mh-firm-card-title-row { display:grid;gap:4px;min-width:0 }
.mh-firm-card-title-row strong { font-size:13px;font-weight:900;line-height:1.35;color:#0f2745;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden }
.mh-firm-card-title-row small { font-size:11px;line-height:1.3;color:#6b7d93;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.mh-firm-card-badges { display:flex;flex-wrap:wrap;gap:6px }
.mh-firm-card-meta { display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap }
.mh-doc-item.firm-card .mh-firm-card-meta span { font-size:11px;line-height:1.35;color:#60728c;min-width:0 }
.mh-firm-card-balance strong { font-size:14px;font-weight:900;line-height:1.2;color:#0b3768 }
@media (max-width: 1360px) {
  .mh-doc-item.firm-card {
    padding: 10px;
  }
  .mh-doc-item.firm-card strong,
  .mh-doc-item.firm-card span,
  .mh-doc-item.firm-card small { margin: 0; }
  .mh-firm-card-title-row {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .mh-firm-card-title-row strong {
    font-size: 13px;
    font-weight: 900;
    line-height: 1.35;
    color: #0f2745;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .mh-firm-card-title-row small {
    font-size: 11px;
    line-height: 1.3;
    color: #6b7d93;
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mh-firm-card-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .mh-firm-card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .mh-doc-item.firm-card .mh-firm-card-meta span {
    font-size: 11px;
    line-height: 1.35;
    color: #60728c;
    min-width: 0;
  }
  .mh-firm-card-balance strong {
    font-size: 14px;
    font-weight: 900;
    line-height: 1.2;
    color: #0b3768;
  }
  .mh-cari-filter-grid-top,
  .mh-cari-filter-grid-bottom,
  .mh-cari-summary-grid,
  .mh-cari-invoice-totals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .mh-layout-3.contact { grid-template-columns: 320px minmax(560px, 1fr) 290px; }
    .mh-layout-3.compact.mh-cari-layout { grid-template-columns: 310px minmax(0, 1fr) 410px; }
  .mh-layout-3,
  .mh-layout-3.compact,
  .mh-layout-3.mail,
  .mh-layout-3.contact,
  .mh-layout-2,
  .mh-party-grid,
  .mh-invoice-bottom { grid-template-columns: 1fr; }
  .mh-page-head { align-items: flex-start; flex-direction: column; }
  .mh-doc-no { text-align: left; }
  .mh-cari-firm-list .mh-doc-list,
  .mh-cari-side-scroll,
  .mh-cari-table-area .mh-table-wrap { max-height: none; }
  .mh-cari-tabs,
  .mh-cari-quick-row,
  .mh-cari-filter-grid-top,
  .mh-cari-filter-grid-bottom,
  .mh-cari-summary-grid,
  .mh-cari-invoice-totals { grid-template-columns: 1fr; }
}
`;
