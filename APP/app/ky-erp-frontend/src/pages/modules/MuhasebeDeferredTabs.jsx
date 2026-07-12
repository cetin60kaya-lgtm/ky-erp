import { useEffect, useMemo, useState } from "react";

import {
  filterCompaniesByQuery,
  findCompanyByName,
  getSelectableCompanies,
  normalizeCompanyText,
} from "../../lib/companyHelpers";
import {
  AccountingPageShell,
  EmptyState,
  SectionCard,
  StatusBadge,
} from "../../components/erp/AccountingUi";
import { ErpIcon } from "../../components/erp/IconMap";
import {
  apiGet as clientApiGet,
  apiPost as clientApiPost,
  apiUpload as clientApiUpload,
} from "../../utils/api";

const DEFAULT_BIZIM_DOCUMENT_PATHS = {
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

const DEFAULT_SETTINGS_UI_PATHS = {
  documentArchiveRootPath: "",
  outgoingInvoicePath: DEFAULT_BIZIM_DOCUMENT_PATHS.gidenFaturaBasePath,
  outgoingDispatchPath: DEFAULT_BIZIM_DOCUMENT_PATHS.gidenIrsaliyeBasePath,
  supplierInvoicePath: DEFAULT_BIZIM_DOCUMENT_PATHS.tedarikciFaturaBasePath,
  customerDispatchPath: "",
  xmlPath: "",
  unclassifiedPath: "",
  faturaDosyaPrefix: DEFAULT_BIZIM_DOCUMENT_PATHS.faturaDosyaPrefix,
  irsaliyeDosyaPrefix: DEFAULT_BIZIM_DOCUMENT_PATHS.irsaliyeDosyaPrefix,
};

function isLikelyFolderPath(value) {
  const text = cleanPathInput(value);
  if (!text) return false;
  return /^[a-zA-Z]:\\/.test(text) || text.includes("\\") || text.includes("/");
}

function cleanPathInput(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function pickFolderPath(...values) {
  for (const value of values) {
    const text = cleanPathInput(value);
    if (isLikelyFolderPath(text)) return text;
  }
  return "";
}

function joinWindowsPath(basePath, leafName) {
  const base = cleanPathInput(basePath)
    .replace(/[\\/]+$/, "");
  const leaf = cleanPathInput(leafName)
    .replace(/^[\\/]+/, "");
  if (!base || !leaf) return "";
  return `${base}\\${leaf}`;
}

function pickMappedFolderPath(basePathCandidates, folderNameCandidates) {
  const direct = pickFolderPath(...basePathCandidates, ...folderNameCandidates);
  if (direct) return direct;

  const base = pickFolderPath(...basePathCandidates);
  const folderName = folderNameCandidates
    .map((value) => cleanPathInput(value))
    .find((value) => value.length > 0);
  return joinWindowsPath(base, folderName);
}

function mapSettingsToUiPaths(rawSettings) {
  const settings = { ...DEFAULT_BIZIM_DOCUMENT_PATHS, ...(rawSettings || {}) };
  const archiveRoot = cleanPathInput(settings.documentArchiveRootPath);

  return {
    documentArchiveRootPath: archiveRoot,
    outgoingInvoicePath: pickMappedFolderPath(
      [
        settings.gidenFaturaBasePath,
        settings.outgoingInvoicePath,
        settings.bizimKestigimizFaturaBasePath,
        joinWindowsPath(archiveRoot, settings.belgeYuklemeFaturaFolder),
      ],
      [settings.belgeYuklemeFaturaFolder],
    ),
    outgoingDispatchPath: pickMappedFolderPath(
      [
        settings.gidenIrsaliyeBasePath,
        settings.outgoingDispatchPath,
        settings.bizimKestigimizIrsaliyeBasePath,
        joinWindowsPath(archiveRoot, settings.belgeYuklemeIrsaliyeFolder),
      ],
      [settings.belgeYuklemeIrsaliyeFolder],
    ),
    supplierInvoicePath: pickMappedFolderPath(
      [
        settings.tedarikciFaturaBasePath,
        settings.gelenFaturaBasePath,
        settings.supplierInvoicePath,
        joinWindowsPath(archiveRoot, settings.belgeYuklemeGelenFaturaFolder),
      ],
      [settings.belgeYuklemeGelenFaturaFolder],
    ),
    customerDispatchPath: pickMappedFolderPath(
      [
        settings.musteriIrsaliyeBasePath,
        settings.gelenIrsaliyeBasePath,
        settings.customerDispatchPath,
        joinWindowsPath(archiveRoot, settings.belgeYuklemeGelenIrsaliyeFolder),
      ],
      [settings.belgeYuklemeGelenIrsaliyeFolder],
    ),
    xmlPath: pickMappedFolderPath(
      [
        settings.xmlBasePath,
        settings.xmlPath,
        joinWindowsPath(archiveRoot, settings.belgeYuklemeXmlFolder),
      ],
      [settings.belgeYuklemeXmlFolder],
    ),
    unclassifiedPath: pickMappedFolderPath(
      [
        settings.tasnifBekleyenBasePath,
        settings.unclassifiedPath,
        joinWindowsPath(archiveRoot, settings.belgeYuklemeTasnifFolder),
      ],
      [settings.belgeYuklemeTasnifFolder],
    ),
    faturaDosyaPrefix: String(
      settings.faturaDosyaPrefix ||
        DEFAULT_BIZIM_DOCUMENT_PATHS.faturaDosyaPrefix,
    )
      .trim()
      .toLocaleUpperCase("tr-TR"),
    irsaliyeDosyaPrefix: String(
      settings.irsaliyeDosyaPrefix ||
        DEFAULT_BIZIM_DOCUMENT_PATHS.irsaliyeDosyaPrefix,
    )
      .trim()
      .toLocaleUpperCase("tr-TR"),
  };
}

function mapUiPathsToPayload(uiPaths) {
  const outgoingInvoicePath = cleanPathInput(uiPaths.outgoingInvoicePath);
  const outgoingDispatchPath = cleanPathInput(uiPaths.outgoingDispatchPath);
  const supplierInvoicePath = cleanPathInput(uiPaths.supplierInvoicePath);
  const customerDispatchPath = cleanPathInput(uiPaths.customerDispatchPath);
  const xmlPath = cleanPathInput(uiPaths.xmlPath);
  const unclassifiedPath = cleanPathInput(uiPaths.unclassifiedPath);

  return {
    documentArchiveRootPath: cleanPathInput(uiPaths.documentArchiveRootPath),
    gidenFaturaBasePath: outgoingInvoicePath,
    gidenIrsaliyeBasePath: outgoingDispatchPath,
    tedarikciFaturaBasePath: supplierInvoicePath,
    musteriIrsaliyeBasePath: customerDispatchPath,
    xmlBasePath: xmlPath,
    tasnifBekleyenBasePath: unclassifiedPath,
    belgeYuklemeFaturaFolder:
      DEFAULT_BIZIM_DOCUMENT_PATHS.belgeYuklemeFaturaFolder,
    belgeYuklemeIrsaliyeFolder:
      DEFAULT_BIZIM_DOCUMENT_PATHS.belgeYuklemeIrsaliyeFolder,
    belgeYuklemeGelenFaturaFolder:
      DEFAULT_BIZIM_DOCUMENT_PATHS.belgeYuklemeGelenFaturaFolder,
    belgeYuklemeGelenIrsaliyeFolder:
      DEFAULT_BIZIM_DOCUMENT_PATHS.belgeYuklemeGelenIrsaliyeFolder,
    belgeYuklemeXmlFolder:
      xmlPath || DEFAULT_BIZIM_DOCUMENT_PATHS.belgeYuklemeXmlFolder,
    belgeYuklemeTasnifFolder:
      unclassifiedPath || DEFAULT_BIZIM_DOCUMENT_PATHS.belgeYuklemeTasnifFolder,
    faturaDosyaPrefix: String(uiPaths.faturaDosyaPrefix || "")
      .trim()
      .toLocaleUpperCase("tr-TR"),
    irsaliyeDosyaPrefix: String(uiPaths.irsaliyeDosyaPrefix || "")
      .trim()
      .toLocaleUpperCase("tr-TR"),
  };
}

function FolderPathField({ label, value, onChange, placeholder, description }) {
  return (
    <div className="settings-path-card">
      <Input
        label={label}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <p className="settings-field-help">{description}</p>
    </div>
  );
}

function normalizeMainCompany(mainCompany) {
  return {
    mainCompanyId: String(mainCompany.id || mainCompany.mainCompanyId || "").trim(),
    mainCompanySlug: String(mainCompany.slug || mainCompany.mainCompanySlug || "mecit-hakan").trim(),
    mainCompanyName: String(mainCompany.name || mainCompany.mainCompanyName || "Mecit Hakan").trim(),
  };
}

function requireMainCompany(mainCompany) {
  const normalized = normalizeMainCompany(mainCompany);
  if (!normalized.mainCompanySlug) {
    throw new Error("Ana firma zorunludur.");
  }
  return normalized;
}

async function apiGet(path, mainCompany) {
  const company = requireMainCompany(mainCompany);
  const payload = await clientApiGet(path, company);
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
     ? payload?.data
    : payload;
}

async function apiPost(path, payload, mainCompany) {
  const company = requireMainCompany(mainCompany);
  const response = await clientApiPost(path, { ...payload, ...company });
  return response &&
    typeof response === "object" &&
    response.ok === true &&
    Object.prototype.hasOwnProperty.call(response, "data")
     ? response.data
    : response;
}

async function apiUpload(path, formData, mainCompany) {
  const company = requireMainCompany(mainCompany);
  for (const [key, value] of Object.entries(company)) {
    if (!formData.has(key)) formData.append(key, value);
  }
  const response = await clientApiUpload(path, formData);
  return response &&
    typeof response === "object" &&
    response.ok === true &&
    Object.prototype.hasOwnProperty.call(response, "data")
     ? response.data
    : response;
}

function formatMoney(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function MetricBox({
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

function MuhasebePageHeader({ title, subtitle }) {
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

function ActionBar({ children, className = "" }) {
  return <div className={`action-bar ${className}`.trim()}>{children}</div>;
}

function Input({
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

function Select({ label, value, onChange, options }) {
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

function CompanyQuickPicker({
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

    if (exactMatch.firma) {
      commit(exactMatch.firma);
      return;
    }

    if (
      sorted[0].firma &&
      normalizeCompanyText(sorted[0].firma) === normalizeCompanyText(query)
    ) {
      commit(sorted[0].firma);
      return;
    }

    if (sorted.length === 1) {
      commit(sorted[0].firma);
    }
  }

  return (
    <div className={`field ${fullWidth ? "field-full" : ""}`.trim()}>
      <span>{label}</span>
      <input
        value={query}
        placeholder="Firma yazın..."
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event?.target.value);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event?.preventDefault();
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
              onMouseDown={(event) => {
                event?.preventDefault();
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

export function EpostaTab({
  activeMainCompany,
  companies,
  activeCompany,
  recentCompanies,
}) {
  const [gruplar, setGruplar] = useState([]);
  const [kisiler, setKisiler] = useState([]);
  const [mailRows, setMailRows] = useState([]);
  const [mailLogs, setMailLogs] = useState([]);
  const [statementResults, setStatementResults] = useState([]);
  const [mailPreview, setMailPreview] = useState(null);
  const [activeMailTab, setActiveMailTab] = useState("mail");
  const [search, setSearch] = useState("");
  const [anaFirma, setAnaFirma] = useState(activeCompany || "");
  const [bagliFirma, setBagliFirma] = useState(activeCompany || "");
  const [departman, setDepartman] = useState("Muhasebe");
  const [message, setMessage] = useState("");
  const [statementId, setStatementId] = useState("");
  const [statementFirm, setStatementFirm] = useState(activeCompany || "");
  const [form, setForm] = useState({
    id: "",
    anaFirma: activeCompany || "",
    gonderilenFirma: activeCompany || "",
    departman: "Muhasebe",
    departmanNo: "",
    departmanKodlari: "",
    kisiAdi: "",
    eposta: "",
    gorev: "",
    not: "",
    oncelikli: false,
    topluListe: false,
    tasnifRaporuAlirMi: false,
    faturaMailiAlirMi: true,
    irsaliyeMailiAlirMi: true,
    varsayilan: false,
    aktif: true,
  });

  async function loadGroups() {
    setGruplar(await apiGet("/muhasebe/eposta-gruplari", activeMainCompany));
  }

  async function loadMailRows() {
    const rows = await apiGet("/muhasebe/outgoing-documents/pool", activeMainCompany);
    setMailRows(
      (Array.isArray(rows) ? rows : []).filter((row) =>
        String(row?.documentType || row?.belgeTuru || "")
          .toLocaleUpperCase("tr-TR")
          .includes("FATURA"),
      ),
    );
  }

  async function loadMailLogs() {
    try {
      const rows = await apiGet("/muhasebe/mail-logs", activeMainCompany);
      setMailLogs(Array.isArray(rows) ? rows : []);
    } catch {
      setMailLogs([]);
    }
  }

  async function loadStatementResults() {
    try {
      const rows = await apiGet(
        "/muhasebe/statements/compare-results",
        activeMainCompany,
      );
      setStatementResults(Array.isArray(rows) ? rows : []);
    } catch {
      setStatementResults([]);
    }
  }

  async function loadPeople(
    nextAna = anaFirma,
    nextBagli = bagliFirma,
    nextDepartman = departman,
  ) {
    if (!nextAna || !nextBagli) {
      setKisiler([]);
      return;
    }

    const params = new URLSearchParams({
      anaFirma: nextAna,
      bagliFirma: nextBagli,
    });
    if (nextDepartman) params.set("departman", nextDepartman);
    setKisiler(
      await apiGet(
        `/muhasebe/eposta-kisileri${params.toString()}`,
        activeMainCompany,
      ),
    );
  }

  useEffect(() => {
    setAnaFirma(activeMainCompany?.name || "");
    setStatementFirm(activeCompany || activeMainCompany?.name || "");
    setForm((prev) => ({
      ...prev,
      anaFirma: activeMainCompany?.name || "",
    }));
  }, [activeCompany, activeMainCompany?.name]);

  useEffect(() => {
    loadGroups();
    loadMailRows();
    loadMailLogs();
    loadStatementResults();
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => {
    loadPeople();
  }, [
    anaFirma,
    bagliFirma,
    departman,
    activeMainCompany?.id,
    activeMainCompany?.slug,
  ]);

  const departmanlar = useMemo(() => {
    const names = new Set();
    for (const grup of gruplar) {
      if (grup.anaFirma === anaFirma && grup.bagliFirma === bagliFirma) {
        for (const item of grup.departmanlar || []) names.add(item);
      }
    }
    if (!names.size) {
      for (const row of kisiler) names.add(row?.departman);
    }
    return [...names].filter(Boolean);
  }, [gruplar, kisiler, anaFirma, bagliFirma]);

  const visiblePeople = kisiler.filter((item) =>
    `${item?.gonderilenFirma} ${item?.departman} ${item?.kisiAdi} ${item?.eposta} ${
      item?.gorev || ""
    }`
      .toLocaleLowerCase("tr-TR")
      .includes(search.toLocaleLowerCase("tr-TR")),
  );
  const priorityPeople = visiblePeople.filter((item) => item?.oncelikli);
  const bulkPeople = visiblePeople.filter((item) => item?.topluListe);

  async function savePerson() {
    try {
      await apiPost("/muhasebe/eposta-kisileri", form, activeMainCompany);
      setMessage("Kişi kaydedildi.");
      setForm((prev) => ({
        ...prev,
        id: "",
        kisiAdi: "",
        eposta: "",
        gorev: "",
        not: "",
        oncelikli: false,
        topluListe: false,
        tasnifRaporuAlirMi: false,
        faturaMailiAlirMi: true,
        irsaliyeMailiAlirMi: true,
        varsayilan: false,
      }));
      await loadGroups();
      await loadPeople(form.anaFirma, form.gonderilenFirma, form.departman);
    } catch (error) {
      setMessage(error?.message);
    }
  }

  function editPerson(row) {
    setForm({
      id: row?.id,
      anaFirma: row?.anaFirma || activeMainCompany?.name || "",
      gonderilenFirma: row?.gonderilenFirma || "",
      departman: row?.departman || "Muhasebe",
      departmanNo: row?.departmanNo || row?.departman || "",
      departmanKodlari: Array.isArray(row?.departmanKodlari)
         ? row?.departmanKodlari.join(", ")
        : row?.departmanKodlari || "",
      kisiAdi: row?.kisiAdi || "",
      eposta: row?.eposta || "",
      gorev: row?.gorev || "",
      not: row?.not || "",
      oncelikli: Boolean(row?.oncelikli),
      topluListe: Boolean(row?.topluListe),
      tasnifRaporuAlirMi: Boolean(row?.tasnifRaporuAlirMi),
      faturaMailiAlirMi: row?.faturaMailiAlirMi !== false,
      irsaliyeMailiAlirMi: row?.irsaliyeMailiAlirMi !== false,
      varsayilan: Boolean(row?.varsayilan),
      aktif: row?.aktif !== false,
    });
    setMessage("E-posta kişi düzenleme formu açıldı.");
  }

  async function markAsDefault(row) {
    try {
      await apiPost(
        "/muhasebe/eposta-kisileri/varsayilan-sec",
        {
          anaFirma: row?.anaFirma,
          bagliFirma: row?.gonderilenFirma,
          departman: row?.departman,
        },
        activeMainCompany,
      );
      setMessage("Varsayılan kişi güncellendi.");
      await loadPeople(row?.anaFirma, row?.gonderilenFirma, row?.departman);
    } catch (error) {
      setMessage(error?.message);
    }
  }

  async function selectDefaults() {
    try {
      await apiPost(
        "/muhasebe/eposta-kisileri/varsayilan-sec",
        {
          anaFirma,
          bagliFirma,
          departman,
        },
        activeMainCompany,
      );
      setMessage("Varsayılan kişiler seçildi.");
      await loadPeople();
    } catch (error) {
      setMessage(error?.message);
    }
  }

  async function preparePackage(row) {
    const invoiceNo = row?.faturaNo || row?.belgeNo || row?.documentNo || "";
    const dispatchNo = row?.bagliIrsaliyeNo || row?.irsaliyeNo || "";
    try {
      const pack = await apiPost(
        `/muhasebe/outgoing-documents/${encodeURIComponent(row?.id)}/mail-package`,
        {},
        activeMainCompany,
      );
      setMailPreview(pack);
      setMessage("Mail paketi taslağı hazırlandı.");
    } catch (error) {
      const recipients = visiblePeople
        .filter((item) => item?.faturaMailiAlirMi !== false || item?.irsaliyeMailiAlirMi !== false)
        .map((item) => item?.eposta)
        .filter(Boolean);
      const attachments = [
        {
          fileName: `${invoiceNo || "Fatura"}.pdf`,
          path: row?.faturaPdfPath || row?.pdfPath || row?.belgeDosyaYolu || "",
        },
        dispatchNo
           {
              fileName: `${dispatchNo}.pdf`,
              path: row?.irsaliyePdfPath || "",
            ? }
          : null,
      ].filter(Boolean);
      const draft = {
        subject: `${row?.firma || ""} - ${row?.modelAdi || row?.guessedModelName || "Model"} - Fatura ve İrsaliye - ${invoiceNo}`
          .replace(/\s+/g, " ")
          .trim(),
        groups: [
          {
            label: "Outlook taslağı",
            to: recipients,
            attachments,
          },
        ],
      };
      await apiPost(
        "/muhasebe/mail-logs/prepare",
        {
          firmName: row?.firma,
          invoiceNo,
          dispatchNo,
          documentId: row?.id,
          modelId: row?.modelId || row?.modelKaydiId,
          modelName: row?.modelAdi || row?.guessedModelName,
          subject: draft.subject,
          recipientEmails: recipients,
          status: "PREPARED",
          note: "Belge havuzundan Outlook taslak paketi hazırlandı.",
        },
        activeMainCompany,
      ).catch(() => null);
      setMailPreview(draft);
      setMessage("Outlook mail taslağı hazırlandı. Fatura ve varsa irsaliye eki paket içinde gösterildi.");
      await loadMailLogs();
    }
  }

  async function uploadStatement(file) {
    if (!file) return;
    try {
      const payload = new FormData();
      payload?.append("file", file);
      payload?.append("firmName", statementFirm || bagliFirma || "");
      const uploaded = await apiUpload(
        "/muhasebe/statements/upload",
        payload,
        activeMainCompany,
      );
      setStatementId(uploaded.id || uploaded.statementId || "");
      setMessage("Ekstre yüklendi. Karşılaştır ile eksik faturaları kontrol edin.");
      await loadStatementResults();
    } catch (error) {
      setMessage(error?.message || "Ekstre yüklenemedi.");
    }
  }

  async function compareStatement() {
    if (!statementId) {
      setMessage("Önce müşteri ekstresi yükleyin.");
      return;
    }
    try {
      await apiPost(
        `/muhasebe/statements/${encodeURIComponent(statementId)}/compare`,
        {
          firmName: statementFirm || bagliFirma || "",
        },
        activeMainCompany,
      );
      setMessage("Ekstre karşılaştırıldı.");
      await loadStatementResults();
    } catch (error) {
      setMessage(error?.message || "Ekstre karşılaştırılamadı.");
    }
  }

  async function createStatementReminder(row) {
    try {
      await apiPost(
        `/muhasebe/statements/compare-results/${encodeURIComponent(row?.id)}/create-reminder`,
        {},
        activeMainCompany,
      );
      setMessage("Aynı kişilere hatırlatma hazırlandı.");
      await Promise.all([loadStatementResults(), loadMailLogs()]);
    } catch (error) {
      setMessage(error?.message || "Hatırlatma hazırlanamadı.");
    }
  }

  async function markMailSent(log) {
    try {
      await apiPost(
        `/muhasebe/mail-logs/${encodeURIComponent(log.id)}/mark-sent`,
        {},
        activeMainCompany,
      );
      setMessage("Mail gönderildi olarak işaretlendi.");
      await loadMailLogs();
    } catch (error) {
      setMessage(error?.message || "Mail log güncellenemedi.");
    }
  }

  async function createLogReminder(log) {
    try {
      await apiPost(
        `/muhasebe/mail-logs/${encodeURIComponent(log.id)}/reminder`,
        {},
        activeMainCompany,
      );
      setMessage("Hatırlatma mail taslağı hazırlandı.");
      await loadMailLogs();
    } catch (error) {
      setMessage(error?.message || "Hatırlatma hazırlanamadı.");
    }
  }

  return (
    <div className="content-grid muhasebe-page">
      <MuhasebePageHeader
        title="Mail & Ekstre"
        subtitle="Fatura ve irsaliye ekleriyle mail paketi hazırlayın, kişi kartlarını yönetin, müşteri ekstresini karşılaştırın."
      />
      <div className="content-card muhasebe-page-body">
        <div className="info-grid info-grid-4">
          <MetricBox
            icon="firma-kartlari"
            label="Ana Firma"
            value={activeMainCompany?.name || "Seçim yok"}
            subText="Gönderen firma"
            tone="blue"
          />
          <MetricBox
            icon="users"
            label="Kişi Sayısı"
            value={kisiler.length}
            subText="Kayıtlı kişi"
            tone="green"
          />
          <MetricBox
            icon="filtrele"
            label="Filtre Sonucu"
            value={visiblePeople.length}
            subText="Liste sonucu"
            tone="blue"
          />
          <MetricBox
            icon="eposta"
            label="Öncelikli / Toplu"
            value={`${priorityPeople.length} / ${bulkPeople.length}`}
            subText="Gönderim listesi"
            tone="orange"
          />
        </div>

        <div className="settings-tab-strip mt-16">
          {[
            { key: "mail", label: "Mail Paketleri" },
            { key: "kisiler", label: "Kişi Kartları" },
            { key: "ekstre", label: "Ekstre Karşılaştır" },
            { key: "hatirlatma", label: "Hatırlatma Takibi" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`settings-tab-btn ${activeMailTab === tab.key ? "is-active" : ""}`.trim()}
              onClick={() => setActiveMailTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeMailTab === "kisiler"  (
        <div className="split-layout mt-16 muhasebe-top-panels">
          <div className="panel-block">
            <h4>Filtre / Seçim</h4>
            <CompanyQuickPicker
              label="Gönderen Firma"
              companies={[]}
              value={anaFirma}
              recentCompanies={[]}
              onChange={(name) => {
                setAnaFirma(activeMainCompany?.name || name);
              }}
            />
            <CompanyQuickPicker
              label="Gönderilen Firma"
              companies={companies}
              value={bagliFirma}
              recentCompanies={recentCompanies}
              onChange={(name) => setBagliFirma(name)}
            />
            <Select
              label="Bölüm / Departman"
              value={departman}
              onChange={(event) => setDepartman(event?.target.value)}
              options={
                departmanlar.length
                   ? departmanlar
                  : ["Muhasebe", "Satış", "Yönetim"]
              }
            />
            <Input
              label="Yeni / Seçili Departman"
              value={departman}
              onChange={(event) => {
                setDepartman(event?.target.value);
                setForm((prev) => ({ ...prev, departman: event?.target.value }));
              }}
              placeholder="Örn. Muhasebe, Satın Alma, Sevkiyat"
            />
            <ActionBar>
              <button className="soft-btn" onClick={selectDefaults}>
                Varsayılanları Seç
              </button>
            </ActionBar>
            <Input
              label="Kişi Ara"
              value={search}
              onChange={(event) => setSearch(event?.target.value)}
            />
          </div>

          <div className="panel-block">
            <h4>Yeni Kişi</h4>
            <div className="form-grid form-grid-compact">
              <Input
                label="Ana Firma"
                value={activeMainCompany?.name || form.anaFirma}
                onChange={() => {}}
                placeholder="Aktif ana firma"
              />
              <Input
                label="Gönderilen Firma"
                value={form.gonderilenFirma}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    gonderilenFirma: event?.target.value,
                  }))
                }
              />
              <Input
                label="Bölüm"
                value={form.departman}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    departman: event?.target.value,
                  }))
                }
              />
              <Input
                label="Departman No"
                value={form.departmanNo}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    departmanNo: event?.target.value,
                  }))
                }
              />
              <Input
                label="Departman Kodları"
                value={form.departmanKodlari}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    departmanKodlari: event?.target.value,
                  }))
                }
                placeholder="150, 165-2"
              />
              <Input
                label="Kişi Adı"
                value={form.kisiAdi}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, kisiAdi: event?.target.value }))
                }
              />
              <Input
                label="E-Posta"
                value={form.eposta}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, eposta: event?.target.value }))
                }
              />
              <Input
                label="Görev / Ünvan"
                value={form.gorev}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, gorev: event?.target.value }))
                }
              />
              <Input
                label="Not"
                value={form.not}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, not: event?.target.value }))
                }
              />
            </div>
            <ActionBar>
              <label>
                <input
                  type="checkbox"
                  checked={form.oncelikli}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      oncelikli: event?.target.checked,
                    }))
                  }
                />{" "}
                Öncelikli
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.topluListe}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      topluListe: event?.target.checked,
                    }))
                  }
                />{" "}
                Toplu Liste
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.faturaMailiAlirMi}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      faturaMailiAlirMi: event?.target.checked,
                    }))
                  }
                />{" "}
                Fatura Maili
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.irsaliyeMailiAlirMi}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      irsaliyeMailiAlirMi: event?.target.checked,
                    }))
                  }
                />{" "}
                İrsaliye Maili
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.tasnifRaporuAlirMi}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      tasnifRaporuAlirMi: event?.target.checked,
                    }))
                  }
                />{" "}
                Tasnif Raporu
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.varsayilan}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      varsayilan: event?.target.checked,
                    }))
                  }
                />{" "}
                Varsayılan
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.aktif}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      aktif: event?.target.checked,
                    }))
                  }
                />{" "}
                Aktif
              </label>
              <button className="primary-btn" onClick={savePerson}>
                <ErpIcon name="kaydet" size={16} />
                Kişi Kaydet
              </button>
            </ActionBar>
          </div>
        </div>
        ) : null}

        {message ? <div className="notice-box">{message}</div> : null}

        {activeMailTab === "kisiler"  (
        <div className="panel-block mt-16">
          <div className="belge-items-toolbar">
            <h4>Toplu Liste</h4>
            <div className="status-text">
              Öncelikli kişiler otomatik öne çıkarılır; toplu liste işaretlileri
              tek satırdan takip edilir.
            </div>
          </div>
          <div className="status-text mt-8">
            {bulkPeople.length
               bulkPeople
                  .map((item) => `${item?.kisiAdi} <${item?.eposta}>`)
                  ? .join(", ")
              : "Toplu listeye eklenmiş kişi yok."}
          </div>
        </div>
        ) : null}

        {activeMailTab === "mail"  (
        <div className="panel-block mt-16">
          <div className="belge-items-toolbar">
            <h4>Fatura / İrsaliye Mail Paketleri</h4>
            <button className="soft-btn tiny-btn" type="button" onClick={loadMailRows}>
              Yenile
            </button>
          </div>
          <div className="table-wrap mt-8">
            <table className="table">
              <thead>
                <tr>
                  {[
                    "Firma",
                    "Departman",
                    "Model",
                    "Sipariş No",
                    "Fatura No",
                    "İrsaliye No",
                    "Adet",
                    "Tutar",
                    "Fatura PDF",
                    "İrsaliye PDF",
                    "Tasnif Gerekli mi",
                    "Mail Durumu",
                    "İşlem",
                  ].map((title) => (
                    <th key={title}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mailRows.slice(0, 50).map((row) => (
                  <tr key={row?.id}>
                    <td>{row?.firma}</td>
                    <td>{row?.departmanNo || row?.bolumNo || "-"}</td>
                    <td>{row?.modelAdi || "-"}</td>
                    <td>{row?.siparisNo || "-"}</td>
                    <td>{row?.faturaNo || row?.belgeNo}</td>
                    <td>{row?.bagliIrsaliyeNo || row?.irsaliyeNo || "-"}</td>
                    <td>{Number(row?.adet || 0).toLocaleString("tr-TR")}</td>
                    <td>{formatMoney(row?.genelToplam || row?.toplamTutar)}</td>
                    <td>{row?.faturaPdfPath ? "Var" : "-"}</td>
                    <td>{row?.irsaliyePdfPath ? "Var" : "-"}</td>
                    <td>{row?.departmanNo || row?.bolumNo ? "Kontrol" : "-"}</td>
                    <td>{row.mailDurumu === "SENT" ? "Gönderildi" : "Taslak bekliyor"}</td>
                    <td>
                      <button
                        className="soft-btn tiny-btn"
                        type="button"
                        onClick={() => preparePackage(row)}
                      >
                        Outlook Taslağı Oluştur
                      </button>
                    </td>
                  </tr>
                ))}
                {!mailRows.length ? (
                  <tr>
                    <td colSpan={13}>Mail paketi hazırlanacak fatura yok.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {mailPreview ? (
            <div className="notice-box mt-12">
              <strong>{mailPreview.subject}</strong>
              <div className="status-text mt-8">
                {(mailPreview.groups || [])
                  .map(
                    (group) =>
                      `${group.label}: ${(group.to || []).join(", ") || "-"} / Ekler: ${(group.attachments || []).map((a) => a.fileName).join(", ")}`,
                  )
                  .join(" | ")}
              </div>
            </div>
          ) : null}
        </div>
        ) : null}

        {activeMailTab === "kisiler"  (
        <div className="panel-block mt-16">
          <div className="belge-items-toolbar">
            <h4>Tasnif Raporu Şablonu</h4>
          </div>
          <div className="form-grid form-grid-compact">
            <Input
              label="Aktif Excel Şablonu"
              value=""
              onChange={() => {}}
              placeholder="Tasnif Raporu.xlsx yolu"
            />
            <Input
              label="Son Güncelleme"
              value=""
              onChange={() => {}}
              placeholder="Şablon yüklenince dolar"
              readOnly
            />
          </div>
        </div>
        ) : null}

        {activeMailTab === "kisiler"  (
        <div className="table-wrap mt-16">
          <table className="table">
            <thead>
              <tr>
                <th>Ana Firma</th>
                <th>Gönderilen</th>
                <th>Bölüm</th>
                <th>Departman No</th>
                <th>Kişi</th>
                <th>E-Posta</th>
                <th>Görev</th>
                <th>Fatura</th>
                <th>İrsaliye</th>
                <th>Tasnif</th>
                <th>Bağlantı</th>
                <th>Öncelik</th>
                <th>Toplu</th>
                <th>Varsayılan</th>
                <th>Aktif</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visiblePeople.map((item) => (
                <tr key={item?.id}>
                  <td>{item?.anaFirma}</td>
                  <td>{item?.gonderilenFirma}</td>
                  <td>{item?.departman}</td>
                  <td>{item?.departmanNo || item?.departman}</td>
                  <td>{item?.kisiAdi}</td>
                  <td>{item?.eposta}</td>
                  <td>{item?.gorev || "-"}</td>
                  <td>{item.faturaMailiAlirMi === false ? "Hayır" : "Evet"}</td>
                  <td>{item.irsaliyeMailiAlirMi === false ? "Hayır" : "Evet"}</td>
                  <td>{item?.tasnifRaporuAlirMi ? "Evet" : "Hayır"}</td>
                  <td>
                    {item.ownershipStatus === "MISSING_COMPANY_LINK"  (
                      <span className="warn-chip">Eksik firma bağlantısı</span>
                    ) : (
                      <span className="ok-chip">Bağlı</span>
                    )}
                  </td>
                  <td>{item?.oncelikli ? "Evet" : "Hayır"}</td>
                  <td>{item?.topluListe ? "Evet" : "Hayır"}</td>
                  <td>{item?.varsayilan ? "Evet" : "Hayır"}</td>
                  <td>{item?.aktif ? "Evet" : "Hayır"}</td>
                  <td>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={() => editPerson(item)}
                    >
                      Düzenle
                    </button>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={() => markAsDefault(item)}
                    >
                      Varsayılan Yap
                    </button>
                  </td>
                </tr>
              ))}
              {!visiblePeople.length ? (
                <tr>
                  <td colSpan={16}>Kişi kaydı yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        ) : null}

        {activeMailTab === "ekstre"  (
          <div className="split-layout mt-16 muhasebe-top-panels">
            <div className="panel-block">
              <div className="belge-items-toolbar">
                <h4>Ekstre Yükle</h4>
                <button
                  className="soft-btn tiny-btn"
                  type="button"
                  onClick={loadStatementResults}
                >
                  Yenile
                </button>
              </div>
              <div className="form-grid form-grid-compact mt-8">
                <CompanyQuickPicker
                  label="Müşteri / Cari"
                  companies={companies}
                  value={statementFirm}
                  recentCompanies={recentCompanies}
                  onChange={setStatementFirm}
                />
                <Input
                  label="Ekstre Kayıt No"
                  value={statementId}
                  onChange={(event) => setStatementId(event?.target.value)}
                  placeholder="Yükleme sonrası otomatik dolar"
                />
              </div>
              <label className="muh-doc-dropzone mt-12">
                <ErpIcon name="belge-yukleme" size={30} />
                <strong>Müşteri ekstresini seç / sürükle bırak</strong>
                <span>Excel, PDF veya CSV</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={(event) => uploadStatement(event?.target.files?.[0])}
                />
              </label>
              <ActionBar>
                <button
                  className="primary-btn"
                  type="button"
                  onClick={compareStatement}
                  disabled={!statementId}
                >
                  Karşılaştır
                </button>
                <button
                  className="soft-btn"
                  type="button"
                  onClick={() =>
                    setMessage(
                      "Eksik fatura satırlarında aynı kişilere hatırlatma hazırlayabilirsiniz.",
                    )
                  }
                >
                  Aynı Kişilere Hatırlatma Hazırla
                </button>
              </ActionBar>
            </div>

            <div className="panel-block">
              <div className="belge-items-toolbar">
                <h4>Ekstre Karşılaştırma Sonuçları</h4>
                <span className="status-text">
                  {statementResults.length} kayıt
                </span>
              </div>
              <div className="table-wrap mt-8">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fatura No</th>
                      <th>Bizdeki Tutar</th>
                      <th>Müşteri Ekstre Durumu</th>
                      <th>Ödeme Durumu</th>
                      <th>İlk Mail Kime Gitti</th>
                      <th>Hatırlatma Durumu</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementResults.map((row) => (
                      <tr key={row?.id || row?.invoiceNo}>
                        <td>{row?.invoiceNo || row?.faturaNo || "-"}</td>
                        <td>{formatMoney(row?.ourAmount || row?.bizdekiTutar)}</td>
                        <td>{row.status === "MATCHED" ? "Ekstrede var" : "Ekstrede yok"}</td>
                        <td>{row?.paymentStatus || row?.odemeDurumu || "-"}</td>
                        <td>
                          {Array.isArray(row?.firstRecipients)
                             ? row?.firstRecipients.join(", ")
                            : row?.firstRecipients || row?.firstMailTo || "-"}
                        </td>
                        <td>{row?.reminderStatus || row?.hatirlatmaDurumu || "-"}</td>
                        <td>
                          <button
                            className="soft-btn tiny-btn"
                            type="button"
                            onClick={() =>
                              row?.id
                                 ? createStatementReminder(row)
                                : setMessage("Hatırlatma için sonuç kayıt id yok.")
                            }
                          >
                            Hatırlatma Hazırla
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!statementResults.length ? (
                      <tr>
                        <td colSpan={7}>Ekstre karşılaştırma sonucu yok.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {activeMailTab === "hatirlatma"  (
          <div className="panel-block mt-16">
            <div className="belge-items-toolbar">
              <h4>Hatırlatma Takibi</h4>
              <button
                className="soft-btn tiny-btn"
                type="button"
                onClick={loadMailLogs}
              >
                Yenile
              </button>
            </div>
            <div className="table-wrap mt-8">
              <table className="table">
                <thead>
                  <tr>
                    <th>Firma</th>
                    <th>Fatura No</th>
                    <th>Alıcılar</th>
                    <th>İlk Mail</th>
                    <th>Mail Durumu</th>
                    <th>Hatırlatma</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {mailLogs.map((log) => (
                    <tr key={log.id || `${log.invoiceNo}-${log.createdAt}`}>
                      <td>{log.firma || log.companyName || "-"}</td>
                      <td>{log.invoiceNo || log.faturaNo || "-"}</td>
                      <td>
                        {Array.isArray(log.recipientEmails)
                           ? log.recipientEmails.join(", ")
                          : log.recipientEmails || log.to || "-"}
                      </td>
                      <td>{log.sentAt || log.createdAt || "-"}</td>
                      <td>{log.status || log.mailDurumu || "-"}</td>
                      <td>{log.reminderCount || 0}</td>
                      <td>
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          onClick={() =>
                            log.id
                               ? markMailSent(log)
                              : setMessage("Gönderildi işareti için mail log id yok.")
                          }
                        >
                          Gönderildi İşaretle
                        </button>
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          onClick={() =>
                            log.id
                               ? createLogReminder(log)
                              : setMessage("Hatırlatma için mail log id yok.")
                          }
                        >
                          Hatırlatma Hazırla
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!mailLogs.length ? (
                    <tr>
                      <td colSpan={7}>Mail veya hatırlatma kaydı yok.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RaporlarTab({ activeMainCompany }) {
  const [summary, setSummary] = useState(null);
  const [kdv, setKdv] = useState(null);
  const [logs, setLogs] = useState([]);
  const [message, setMessage] = useState("");
  const currentPeriod = new Date().toISOString().slice(0, 7);

  async function loadReports() {
    try {
      const [dashboardResult, kdvResult] = await Promise.allSettled([
        apiGet("/muhasebe/dashboard-summary", activeMainCompany),
        apiGet(`/muhasebe/kdvperiod=${currentPeriod}`, activeMainCompany),
      ]);

      let nextMessage = "";
      if (dashboardResult.status === "fulfilled") {
        setSummary(dashboardResult.value || null);
        setLogs(
          Array.isArray(dashboardResult.value?.activityLogs)
             ? dashboardResult.value.activityLogs
            : [],
        );
      } else {
        setSummary(null);
        setLogs([]);
        nextMessage =
          dashboardResult.reason.message || "Rapor özeti alınamadı.";
      }

      if (kdvResult.status === "fulfilled") {
        setKdv(kdvResult.value || null);
      } else {
        setKdv(null);
        nextMessage =
          nextMessage || kdvResult.reason.message || "KDV raporu alınamadı.";
      }

      setMessage(nextMessage);
    } catch (error) {
      setMessage(error?.message || "Rapor verisi alınamadı.");
    }
  }

  useEffect(() => {
    loadReports();
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  const cariRows = (summary?.cari || [])
    .filter((item) => Number(item?.bakiye || 0) !== 0)
    .sort(
      (left, right) =>
        Math.abs(Number(right.bakiye || 0)) -
        Math.abs(Number(left.bakiye || 0)),
    )
    .slice(0, 12);
  const checkRows = (summary?.checks || []).slice(0, 12);
  const kpis = summary?.kpis || {};
  const kdvSummary = kdv?.summary || {};
  const reminderRows = Array.isArray(summary?.reminders)
     ? summary.reminders
    : [];

  return (
    <AccountingPageShell
      title="Raporlar"
      subtitle="Cari, ödeme, çek ve KDV özetlerini tek ekranda izleyin."
      breadcrumb={["KY ERP", "Muhasebe", "Raporlar"]}
    >
      <div className="content-card muhasebe-page-body">
        {message ? <div className="notice-box">{message}</div> : null}

        <div className="info-grid info-grid-6">
          <MetricBox
            icon="cari-kasa"
            label="Toplam Cari"
            value={formatMoney(kpis.totalBalance || 0)}
            subText="Aktif cari bakiyesi"
          />
          <MetricBox
            icon="odemeler"
            label="Bu Ay Ödeme"
            value={formatMoney(kpis.monthlyPayments || 0)}
            subText={currentPeriod}
            tone="green"
          />
          <MetricBox
            icon="cekler"
            label="Yaklaşan Çek"
            value={formatMoney(kpis.upcomingChecksAmount || 0)}
            subText="15 gün içinde"
            tone="yellow"
          />
          <MetricBox
            icon="kredi-kartlari"
            label="Kart Borcu"
            value={formatMoney(kpis.creditCardDebt || 0)}
            subText="Aktif kart toplamı"
            tone="purple"
          />
          <MetricBox
            icon="belgeler"
            label="Açık Belge"
            value={kpis.openDocuments || 0}
            subText="Taslak / onay bekleyen"
            tone="green"
          />
          <MetricBox
            icon="uyari"
            label="Hatırlatma"
            value={kpis.criticalReminder || 0}
            subText="Yaklaşan/geciken"
            tone="red"
          />
        </div>

        <div className="split-layout mt-16 muhasebe-top-panels">
          <SectionCard title="Cari Bakiye Raporu" icon="cari-kasa">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Firma</th>
                    <th>Bakiye</th>
                    <th>Ödenen</th>
                    <th>Son İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {cariRows.map((item) => (
                    <tr key={item?.id || item?.firma}>
                      <td>{item?.firma}</td>
                      <td>{formatMoney(item?.bakiye || 0)}</td>
                      <td>{formatMoney(item?.odenenToplam || 0)}</td>
                      <td>{item?.sonIslem || "-"}</td>
                    </tr>
                  ))}
                  {!cariRows.length ? (
                    <tr>
                      <td colSpan={4}>Cari rapor kaydı yok.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="KDV Özeti" icon="kdv">
            <div className="info-grid info-grid-3">
              <MetricBox
                icon="tedarikci-fatura"
                label="Gelen KDV"
                value={formatMoney(kdvSummary.totalPurchaseVat || 0)}
                subText="Alışlardan"
                tone="green"
              />
              <MetricBox
                icon="bizim-belgeler"
                label="Giden KDV"
                value={formatMoney(kdvSummary.totalSalesVat || 0)}
                subText="Satışlardan"
                tone="yellow"
              />
              <MetricBox
                icon="kdv"
                label="Net KDV"
                value={formatMoney(kdvSummary.netVat || 0)}
                subText={`${kdvSummary.documentCount || 0} belge`}
                tone="blue"
              />
            </div>
            <div className="table-wrap mt-12">
              <table className="table">
                <thead>
                  <tr>
                    <th>Oran</th>
                    <th>Gelen</th>
                    <th>Giden</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {(kdvSummary.rateBreakdown || []).map((item) => (
                    <tr key={item?.vatRate}>
                      <td>%{item?.vatRate}</td>
                      <td>{formatMoney(item?.purchaseVat || 0)}</td>
                      <td>{formatMoney(item?.salesVat || 0)}</td>
                      <td>{formatMoney(item?.netVat || 0)}</td>
                    </tr>
                  ))}
                  {!(kdvSummary.rateBreakdown || []).length ? (
                    <tr>
                      <td colSpan={4}>Bu dönem KDV kırılımı yok.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div className="split-layout mt-16 muhasebe-top-panels">
          <SectionCard title="Takip Özeti" icon="goruntule">
            <div className="compact-list">
              {reminderRows.map((item, index) => (
                <div
                  className="compact-row"
                  key={`${item?.type || "hatirlatma"}-${index}`}
                >
                  <strong>
                    {item?.type}: {item?.description || "-"}
                  </strong>
                  <span>{item?.status || item?.date || "-"}</span>
                </div>
              ))}
              {!reminderRows.length ? (
                <EmptyState text="Takip özeti bulunmuyor." />
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Çek Takibi" icon="cekler">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Firma</th>
                    <th>Çek No</th>
                    <th>Vade</th>
                    <th>Tutar</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {checkRows.map((item) => (
                    <tr key={item?.id}>
                      <td>{item?.firma || "-"}</td>
                      <td>{item?.cekNo || "-"}</td>
                      <td>{item?.vadeTarihi || "-"}</td>
                      <td>{formatMoney(item?.tutar || 0)}</td>
                      <td>{item?.durum || "-"}</td>
                    </tr>
                  ))}
                  {!checkRows.length ? (
                    <tr>
                      <td colSpan={5}>Çek rapor kaydı yok.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Son Hareketler" icon="raporlar">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Kaynak</th>
                    <th>İşlem</th>
                    <th>Açıklama</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((item) => (
                    <tr key={item?.id}>
                      <td>
                        {String(item?.createdAt || "").slice(0, 10) || "-"}
                      </td>
                      <td>{item?.source || "-"}</td>
                      <td>{item?.title || item?.actionType || "-"}</td>
                      <td>{item?.description || "-"}</td>
                      <td>
                        <StatusBadge tone="success">Tamamlandı</StatusBadge>
                      </td>
                    </tr>
                  ))}
                  {!logs.length ? (
                    <tr>
                      <td colSpan={5}>Hareket kaydı yok.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <ActionBar className="mt-16">
          <button className="soft-btn" onClick={loadReports}>
            <ErpIcon name="yenile" size={16} />
            Raporları Yenile
          </button>
        </ActionBar>
      </div>
    </AccountingPageShell>
  );
}

export function AyarlarTab({ activeMainCompany }) {
  const [paths, setPaths] = useState({
    ...DEFAULT_SETTINGS_UI_PATHS,
    ...mapSettingsToUiPaths(DEFAULT_BIZIM_DOCUMENT_PATHS),
  });
  const [activeSettingsTab, setActiveSettingsTab] = useState("folders");
  const [folderRows, setFolderRows] = useState([]);
  const [watchStatus, setWatchStatus] = useState({});
  const [readTemplates, setReadTemplates] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [newPaymentType, setNewPaymentType] = useState("");
  const [prefixTest, setPrefixTest] = useState("");
  const [message, setMessage] = useState("");
  const companyParams = {
    mainCompanySlug:
      activeMainCompany?.slug ||
      activeMainCompany?.mainCompanySlug ||
      "mecit-hakan",
    mainCompanyId: activeMainCompany?.id || activeMainCompany?.mainCompanyId || "",
  };

  async function loadSettings() {
    try {
      const [
        pathResult,
        typeResult,
        folderResult,
        watchResult,
        templateResult,
      ] = await Promise.allSettled([
        apiGet("/muhasebe/document-path-settings", companyParams),
        apiGet("/muhasebe/odeme-turleri", companyParams),
        apiGet("/muhasebe/settings/document-folders", companyParams),
        apiGet("/muhasebe/folder-watch/status", companyParams),
        apiGet("/muhasebe/document-read-templates", companyParams),
      ]);
      const pathRows =
        pathResult.status === "fulfilled" ? pathResult.value : null;
      const typeRows =
        typeResult.status === "fulfilled" ? typeResult.value : [];
      setPaths({
        ...DEFAULT_SETTINGS_UI_PATHS,
        ...mapSettingsToUiPaths(pathRows),
      });
      setPaymentTypes(Array.isArray(typeRows) ? typeRows : []);
      setFolderRows(
        folderResult.status === "fulfilled" && Array.isArray(folderResult.value)
           ? folderResult.value
          : [],
      );
      setWatchStatus(watchResult.status === "fulfilled" ? watchResult.value || {} : {});
      setReadTemplates(
        templateResult.status === "fulfilled" && Array.isArray(templateResult.value)
           ? templateResult.value
          : [],
      );
      setMessage(
        pathResult.status === "rejected" ||
          typeResult.status === "rejected" ||
          folderResult.status === "rejected"
           ? "Ayarların bir bölümü alınamadı; açık alanlar güvenli varsayılanla gösteriliyor."
          : "",
      );
    } catch (error) {
      setMessage(error?.message || "Ayarlar alınamadı.");
    }
  }

  useEffect(() => {
    loadSettings();
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  async function savePaths() {
    try {
      const payload = mapUiPathsToPayload(paths);
      const saved = await apiPost(
        "/muhasebe/document-path-settings",
        { ...payload, ...companyParams },
        companyParams,
      );
      setPaths((prev) => ({
        ...prev,
        ...mapSettingsToUiPaths({ ...payload, ...(saved || {}) }),
      }));
      setMessage("Belge klasör ayarları kaydedildi.");
    } catch (error) {
      setMessage(error?.message || "Belge klasör ayarları kaydedilemedi.");
    }
  }

  function patchFolderRow(id, patch) {
    setFolderRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function saveFolderRows() {
    try {
      const saved = await apiPost("/muhasebe/settings/document-folders", {
        ...companyParams,
        rows: folderRows.map((row) => ({ ...row, ...companyParams })),
      }, companyParams);
      setFolderRows(Array.isArray(saved) ? saved : []);
      setMessage("Belge klasörleri SQL'e kaydedildi.");
    } catch (error) {
      setMessage(error?.message || "Belge klasörleri kaydedilemedi.");
    }
  }

  async function runFolderAction(action, payload = {}) {
    const endpointMap = {
      start: "/muhasebe/folder-watch/start",
      stop: "/muhasebe/folder-watch/stop",
      scan: "/muhasebe/folder-watch/scan-now",
      retry: "/muhasebe/folder-watch/retry-failed",
      open: "/muhasebe/folder-watch/open-folder",
      reprocess: "/muhasebe/belge-havuzu/yeniden-isle",
      cleanup: "/muhasebe/belge-yukleme/eski-kayitlari-temizle",
    };
    try {
      const result = await apiPost(endpointMap[action], {
        ...companyParams,
        ...payload,
      }, companyParams);
      const details =
        result?.processed !== undefined
           ? `İşlenen ${result?.processed || 0}, hata ${result?.failed || 0}, duplicate ${result?.duplicate || 0}`
          : result?.message || "İşlem tamamlandı.";
      setMessage(details);
      await loadSettings();
    } catch (error) {
      setMessage(error?.message || "İşlem tamamlanamadı.");
    }
  }

  function classifyPrefix(value) {
    const text = String(value || "").toLocaleUpperCase("tr-TR").trim();
    const documentNo = text.match(/\b([A-Z]{2,4}\d{8,16})\b/)?.[1] || "";
    if (/^HKN\d+/.test(text)) return "Bizim Giden Fatura";
    if (/^DDM\d+/.test(text)) return "Bizim Giden İrsaliye";
    if (/^TIA\d+/.test(text)) return `Müşteriden Gelen İrsaliye - ${documentNo || "TIA"}; model dosya adından alınmaz`;
    if (/^(SLV|DPI|ORU|TKF|CNS)\d+/.test(text)) return "Tedarikçi Fatura";
    return "Bilinmeyen";
  }

  async function savePaymentType() {
    const ad = newPaymentType.trim();
    if (!ad) {
      setMessage("Ödeme türü adı girin.");
      return;
    }
    try {
      await apiPost(
        "/muhasebe/odeme-turleri",
        { ad, aktif: true, ...companyParams },
        companyParams,
      );
      setNewPaymentType("");
      setMessage("Ödeme türü kaydedildi.");
      await loadSettings();
    } catch (error) {
      setMessage(error?.message || "Ödeme türü kaydedilemedi.");
    }
  }

  return (
    <AccountingPageShell
      title="Ayarlar"
      subtitle="Muhasebe belge klasörleri ve ortak tanımları."
      breadcrumb={["KY ERP", "Muhasebe", "Ayarlar"]}
    >
      <div className="content-card muhasebe-page-body">
        {message ? <div className="notice-box">{message}</div> : null}

        <div className="info-grid info-grid-5">
          <MetricBox
            icon="firma-kartlari"
            label="Ana Firma"
            value={activeMainCompany?.name || "-"}
            subText={activeMainCompany?.slug || ""}
          />
          <MetricBox
            icon="belgeler"
            label="Klasör İzleme Durumu"
            value={watchStatus.active ? "Aktif" : "Pasif"}
            subText={`${watchStatus.watchedCount || 0} klasör`}
            tone="green"
          />
          <MetricBox
            icon="belgeler"
            label="Son Tarama"
            value={String(watchStatus.lastScanAt || "-").slice(0, 16)}
            subText="Klasör tarama"
            tone="yellow"
          />
          <MetricBox
            icon="belgeler"
            label="Bugün İşlenen Dosya"
            value={watchStatus.todayProcessed || 0}
            subText={`Duplicate ${watchStatus.duplicateCount || 0}`}
          />
          <MetricBox
            icon="belgeler"
            label="Tasnif Bekleyen"
            value={watchStatus.pendingCount || 0}
            subText={`Hatalı ${watchStatus.failedCount || 0}`}
            tone="red"
          />
        </div>

        <div
          className="settings-tab-strip mt-16"
          role="tablist"
          aria-label="Ayarlar sekmeleri"
        >
          <button
            type="button"
            role="tab"
            className={`settings-tab-btn ${activeSettingsTab === "folders" ? "is-active" : ""}`.trim()}
            aria-selected={activeSettingsTab === "folders"}
            onClick={() => setActiveSettingsTab("folders")}
          >
            Belge Klasörleri
          </button>
          <button
            type="button"
            role="tab"
            className={`settings-tab-btn ${activeSettingsTab === "prefix" ? "is-active" : ""}`.trim()}
            aria-selected={activeSettingsTab === "prefix"}
            onClick={() => setActiveSettingsTab("prefix")}
          >
            Prefix / Numara
          </button>
          <button
            type="button"
            role="tab"
            className={`settings-tab-btn ${activeSettingsTab === "payment" ? "is-active" : ""}`.trim()}
            aria-selected={activeSettingsTab === "payment"}
            onClick={() => setActiveSettingsTab("payment")}
          >
            Ödeme Türleri
          </button>
          <button
            type="button"
            role="tab"
            className={`settings-tab-btn ${activeSettingsTab === "templates" ? "is-active" : ""}`.trim()}
            aria-selected={activeSettingsTab === "templates"}
            onClick={() => setActiveSettingsTab("templates")}
          >
            Belge Okuma Şablonları
          </button>
        </div>

        {activeSettingsTab === "folders"  (
          <SectionCard
            title="Belge Klasörleri"
            icon="ayarlar"
            className="mt-16"
          >
            <ActionBar className="mt-16">
              <button className="soft-btn" onClick={() => runFolderAction("start")}>
                Klasör İzlemeyi Başlat
              </button>
              <button className="soft-btn" onClick={() => runFolderAction("stop")}>
                Klasör İzlemeyi Durdur
              </button>
              <button className="soft-btn" onClick={() => runFolderAction("scan")}>
                Tüm Klasörleri Şimdi Tara
              </button>
              <button className="soft-btn" onClick={() => runFolderAction("retry")}>
                Hatalıları Tekrar İşle
              </button>
              <button className="soft-btn" onClick={() => runFolderAction("reprocess")}>
                Tasnif Bekleyenleri Yeniden İşle
              </button>
              <button className="soft-btn" onClick={() => runFolderAction("cleanup")}>
                Eski/Test Kayıtları Temizle
              </button>
              <button className="primary-btn" onClick={saveFolderRows}>
                <ErpIcon name="kaydet" size={16} />
                Ayarları Kaydet
              </button>
            </ActionBar>
            <div className="table-wrap mt-16">
              <table className="table">
                <thead>
                  <tr>
                    <th>Klasör Adı</th>
                    <th>Klasör Yolu</th>
                    <th>Hedef Ekran</th>
                    <th>Hedef Belge Tipi</th>
                    <th>Aktif</th>
                    <th>Son Tarama</th>
                    <th>İşlenen</th>
                    <th>Hatalı</th>
                    <th>Duplicate</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {folderRows.map((row) => (
                    <tr key={row?.id || row?.folderKey}>
                      <td>{row?.folderName}</td>
                      <td>
                        <input
                          style={{ width: "100%", minWidth: 360, fontFamily: "monospace", fontSize: 12 }}
                          title={row?.folderPath || ""}
                          value={row?.folderPath || ""}
                          onChange={(event) =>
                            patchFolderRow(row?.id, { folderPath: event?.target.value })
                          }
                          placeholder="D:\\..."
                        />
                      </td>
                      <td>{row?.targetModule}</td>
                      <td>{row?.targetType}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(row?.active)}
                          onChange={(event) =>
                            patchFolderRow(row?.id, { active: event?.target.checked })
                          }
                        />
                      </td>
                      <td>{String(row?.lastScanAt || "-").slice(0, 16)}</td>
                      <td>{row?.processedCount || 0}</td>
                      <td>{row?.failedCount || 0}</td>
                      <td>{row?.duplicateCount || 0}</td>
                      <td>
                        <button
                          className="soft-btn small"
                          onClick={() =>
                            runFolderAction("scan", {
                              folderSettingId: row?.id,
                              folderKey: row?.folderKey,
                              folderPath: row?.folderPath,
                            })
                          }
                        >
                          Şimdi Tara
                        </button>
                        <button
                          className="soft-btn small"
                          onClick={() =>
                            runFolderAction("open", {
                              folderSettingId: row?.id,
                              folderPath: row?.folderPath,
                            })
                          }
                        >
                          Klasörü Aç
                        </button>
                        <button
                          className="soft-btn small"
                          onClick={() => patchFolderRow(row?.id, { folderPath: "", active: false })}
                        >
                          Yolu Temizle
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!folderRows.length ? (
                    <tr>
                      <td colSpan={10}>Klasör ayarı bulunamadı.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>
        ) : null}

        {activeSettingsTab === "prefix"  (
          <SectionCard
            title="Prefix / Numara"
            icon="belgeler"
            className="mt-16"
          >
            <div className="settings-prefix-grid">
              <div className="settings-path-card">
                <Input
                  label="Bizim Fatura Prefix"
                  value={paths.faturaDosyaPrefix || ""}
                  onChange={(event) =>
                    setPaths((prev) => ({
                      ...prev,
                      faturaDosyaPrefix: event?.target.value,
                    }))
                  }
                  placeholder="HKN"
                />
                <p className="settings-field-help">
                  Bizim kestiğimiz faturaları ayırt etmek için kullanılan önek.
                  Örn: HKN.
                </p>
              </div>

              <div className="settings-path-card">
                <Input
                  label="Bizim İrsaliye Prefix"
                  value={paths.irsaliyeDosyaPrefix || ""}
                  onChange={(event) =>
                    setPaths((prev) => ({
                      ...prev,
                      irsaliyeDosyaPrefix: event?.target.value,
                    }))
                  }
                  placeholder="DDM"
                />
                <p className="settings-field-help">
                  Bizim kestiğimiz irsaliyeleri ayırt etmek için kullanılan
                  önek. Örn: DDM.
                </p>
              </div>
              <div className="settings-path-card">
                <Input label="Müşteri/Kesim İrsaliye Prefix" value="TIA" readOnly />
                <p className="settings-field-help">
                  TIA dosyalarında model belge başlığından değil satırlardan bağlanır.
                </p>
              </div>
              <div className="settings-path-card">
                <Input label="Tedarikçi Prefixleri" value="SLV, DPI, ORU, TKF, CNS" readOnly />
                <p className="settings-field-help">
                  Firma ve tutar PDF/XML içinden okunur.
                </p>
              </div>
              <div className="settings-path-card">
                <Input
                  label="Prefix Test Et"
                  value={prefixTest}
                  onChange={(event) => setPrefixTest(event?.target.value)}
                  placeholder="HKN2026000000405"
                />
                <p className="settings-field-help">
                  Sonuç: {classifyPrefix(prefixTest)}
                </p>
              </div>
            </div>
            <ActionBar className="mt-16">
              <button className="primary-btn" onClick={savePaths}>
                <ErpIcon name="kaydet" size={16} />
                Prefix Ayarlarını Kaydet
              </button>
            </ActionBar>
          </SectionCard>
        ) : null}

        {activeSettingsTab === "payment"  (
          <SectionCard title="Ödeme Türleri" icon="odemeler" className="mt-16">
            <div className="mgi-form-grid mgi-form-grid-2">
              <Input
                label="Yeni Ödeme Türü"
                value={newPaymentType}
                onChange={(event) => setNewPaymentType(event?.target.value)}
              />
              <div className="field">
                <span>&nbsp;</span>
                <button className="primary-btn" onClick={savePaymentType}>
                  <ErpIcon name="kaydet" size={16} />
                  Tür Kaydet
                </button>
              </div>
            </div>
            <div className="table-wrap mt-16">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ödeme Türü</th>
                    <th>Durum</th>
                    <th>Cari Etkisi</th>
                    <th>Resmi/Gayri Resmi</th>
                    <th>Açıklama</th>
                    <th>Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentTypes.map((item) => (
                    <tr key={item?.id || item?.ad}>
                      <td>{item?.ad}</td>
                      <td>
                        <StatusBadge tone={item?.aktif ? "success" : "muted"}>
                          {item?.aktif ? "Aktif" : "Pasif"}
                        </StatusBadge>
                      </td>
                      <td>{item.cariEtkisiVar === false ? "Yok" : "Var"}</td>
                      <td>{item?.resmiUyum || item?.officialStatus || "Her ikisi"}</td>
                      <td>{item?.aciklama || item?.description || "-"}</td>
                      <td>
                        {String(item?.updatedAt || "").slice(0, 10) || "-"}
                      </td>
                    </tr>
                  ))}
                  {!paymentTypes.length ? (
                    <tr>
                      <td colSpan={6}>Ödeme türü kaydı yok.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>
        ) : null}

        {activeSettingsTab === "templates"  (
          <SectionCard
            title="Belge Okuma Şablonları"
            icon="belgeler"
            className="mt-16"
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Şablon Adı</th>
                    <th>Firma</th>
                    <th>Belge Tipi</th>
                    <th>Hedef Ekran</th>
                    <th>Öncelik</th>
                    <th>Aktif</th>
                    <th>Son Güncelleme</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {readTemplates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.templateName}</td>
                      <td>{template.companyName || "-"}</td>
                      <td>{template.documentType || "-"}</td>
                      <td>{template.targetType || "-"}</td>
                      <td>{template.priority}</td>
                      <td>{template.active ? "Aktif" : "Pasif"}</td>
                      <td>{String(template.updatedAt || "").slice(0, 10)}</td>
                      <td>
                        <button className="soft-btn small">Düzenle</button>
                      </td>
                    </tr>
                  ))}
                  {!readTemplates.length ? (
                    <tr>
                      <td colSpan={8}>Kayıtlı okuma şablonu yok.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>
        ) : null}
      </div>
    </AccountingPageShell>
  );
}
