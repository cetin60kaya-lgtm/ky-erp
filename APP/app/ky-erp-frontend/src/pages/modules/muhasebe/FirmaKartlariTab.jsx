import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  filterCompaniesByQuery,
  findCompanyByName,
  findBestCompanyMatch,
  getSelectableCompanies,
  normalizeCompanyText,
} from "../../../lib/companyHelpers";
import {
  AccountingPageShell,
  KpiCard,
  SectionCard,
  StatusBadge,
  EmptyState,
  IconButton,
} from "../../../components/erp/AccountingUi";
import { ErpIcon } from "../../../components/erp/IconMap";
import {
  API_BASE,
  apiDelete as clientApiDelete,
  apiGet as clientApiGet,
  apiPatch as clientApiPatch,
  apiPost as clientApiPost,
  apiUpload as clientApiUpload,
} from "../../../utils/api";
import {
  tr,
  DEFAULT_BIZIM_DOCUMENT_PATHS,
  DOCUMENT_SECTION_CONFIG,
  PDF_DOCUMENT_CLASS_OPTIONS,
  CARI_KASA_TYPE_OPTIONS,
  uid,
  parseMoney,
  normalizeDateForInput,
  formatMoney,
  MetricBox,
  extractModelNameFromDocumentFileName,
  normalizeFlowType,
  flowTypeMeta,
  normalizeMainCompany,
  requireMainCompany,
  unwrapApiPayload,
  SectionHeader,
  MuhasebePageHeader,
  ActionBar,
  Input,
  Textarea,
  Select,
  MoneyInput,
  CompanyQuickPicker,
  PaymentTypeManager,
  getCariKasaTypeConfig,
  getCariKasaTypeFromRow,
  getCariKasaTypeLabel,
  createCariKasaForm,
  emptyDraft,
  normalizeLineItem,
  deriveDraftTotals,
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
} from "./_muhasebeShared";

export function FirmaKartlariTab({
  activeMainCompany,
  companies,
  refreshCompanies,
  onCompanySelect,
  recentCompanies,
}) {
  const postingTypeOptions = [
    { value: "OPEN_PAYABLE", label: "Açık Cari Borç" },
    { value: "PAID_EXPENSE", label: "Peşin Ödenmiş Gider" },
    { value: "CREDIT_CARD_EXPENSE", label: "Kredi Kartı Gideri" },
    { value: "CASH_EXPENSE", label: "Nakit/Kasa Gideri" },
    { value: "BANK_PAID_EXPENSE", label: "Banka Ödemeli Gider" },
    { value: "VAT_ONLY_EXPENSE", label: "Sadece KDV / Gider Dışı" },
  ];
  const transactionProfileOptions = [
    { value: "CUSTOMER", label: "Müşteri" },
    { value: "SUPPLIER", label: "Tedarikçi" },
    { value: "CUSTOMER_SUPPLIER", label: "Müşteri + Tedarikçi" },
    { value: "CASH_EXPENSE", label: "Peşin Gider / KDV" },
    { value: "VAT_ONLY_EXPENSE", label: "Sadece KDV / Matrah Gider Dışı" },
    { value: "UNOFFICIAL_EXPENSE", label: "Gayri Resmi Gider" },
    { value: "PERSONNEL_EXPENSE", label: "Personel Gideri" },
    { value: "OTHER", label: "Diğer" },
  ];
  const emptyForm = () => ({
    firma: "",
    tip: "SATICI",
    aktif: true,
    favori: false,
    not: "",
    vergiNo: "",
    eposta: "",
    telefon: "",
    varsayilanRecordType: "RESMI",
    varsayilanVatRate: 0,
    varsayilanVatMode: "HARIC",
    vatApplicable: true,
    companyTransactionProfile: "SUPPLIER",
    trackReceivablePayable: true,
    defaultCashSettlement: false,
    defaultSupplierPostingType: "OPEN_PAYABLE",
    defaultPaymentStatus: "UNPAID",
    expenseCategory: "",
    defaultVatType: "INDIRILECEK_KDV",
    expenseCalculationMode: "FULL",
    autoProcessSupplierInvoices: false,
    allowManualApprovalWarnings: false,
    aliases: [],
  });
  const emptyAdjust = (firma = "", hedefBakiye = 0) => ({
    firma,
    hedefBakiye,
    tarih: new Date().toISOString().slice(0, 10),
    aciklama: "Bakiye Düzeltme",
  });
  const emptyOpening = (firma = "") => ({
    firma,
    tutar: 0,
    tarih: new Date().toISOString().slice(0, 10),
    aciklama: "Açılış Bakiyesi",
  });

  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("notice");
  const [busy, setBusy] = useState(false);
  const [panelMode, setPanelMode] = useState("firma");
  const [selectedId, setSelectedId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("BALANCE_DESC");
  const [bulkProfile, setBulkProfile] = useState("CASH_EXPENSE");
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [listBusy, setListBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [opening, setOpening] = useState(emptyOpening());
  const [adjust, setAdjust] = useState(emptyAdjust());
  const [mergeSuggestions, setMergeSuggestions] = useState([]);
  const [matchingStatus, setMatchingStatus] = useState({
    activeAliasSuggestionCount: 0,
    unresolvedCompanyAliasCount: 0,
    pendingCompanyMatchingRecords: 0,
  });
  const [deleteState, setDeleteState] = useState({
    open: false,
    loading: false,
    deleting: false,
    company: null,
    dependencySummary: null,
    adminPassword: "",
  });
  const [multiDeleteState, setMultiDeleteState] = useState({
    open: false,
    deleting: false,
    adminPassword: "",
  });
  const [selectedCompanyIds, setSelectedCompanyIds] = useState(new Set());
  const [movementRows, setMovementRows] = useState([]);
  const [movementPage, setMovementPage] = useState(1);
  const [movementMeta, setMovementMeta] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [movementBusy, setMovementBusy] = useState(false);
  const [movementError, setMovementError] = useState("");

  const companyOptions = rows.length ? rows : companies;

  function setNotice(text, type = "notice") {
    setMessage(text);
    setMessageType(type);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("tr-TR").format(date);
  }

  function tipLabel(value) {
    if (value === "MUSTERI") return "Müşteri";
    if (value === "GENEL") return "Genel";
    return "Satıcı";
  }

  const load = useCallback(async () => {
    setListBusy(true);
    try {
      const data = await apiGet(
        "/muhasebe/firma-kartlari",
        {
          ...activeMainCompany,
          page,
          limit: 50,
          q: debouncedSearchText,
          balanceFilter: balanceFilter === "ALL" ? "" : balanceFilter,
          sort: sortBy,
        },
        { raw: true, timeoutMs: 15000 },
      );
      const nextRows = Array.isArray(data?.data)
         ? data?.data
        : Array.isArray(data)
           ? data
          : [];
      setRows(nextRows);
      setPageMeta({
        page: Number(data?.page || page),
        limit: Number(data?.limit || 50),
        total: Number(data?.total || nextRows.length),
        totalPages: Number(data?.totalPages || 1),
      });

      Promise.allSettled([
        apiGet("/muhasebe/company-merge-suggestions", activeMainCompany),
        apiGet("/muhasebe/company-matching-status", activeMainCompany),
      ]).then(([suggestionsResult, statusResult]) => {
        if (suggestionsResult.status === "fulfilled") {
          setMergeSuggestions(
            Array.isArray(suggestionsResult.value)
               ? suggestionsResult.value
              : [],
          );
        }
        if (statusResult.status === "fulfilled") {
          const status = statusResult.value;
          setMatchingStatus({
            activeAliasSuggestionCount: Number(
              status.activeAliasSuggestionCount || 0,
            ),
            unresolvedCompanyAliasCount: Number(
              status.unresolvedCompanyAliasCount || 0,
            ),
            pendingCompanyMatchingRecords: Number(
              status.pendingCompanyMatchingRecords || 0,
            ),
          });
        }
      });

      return nextRows;
    } finally {
      setListBusy(false);
    }
  }, [activeMainCompany, page, debouncedSearchText, balanceFilter, sortBy]);

  const filteredRows = useMemo(() => {
    return rows;
  }, [rows]);

  const totals = useMemo(() => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const todayTr = new Intl.DateTimeFormat("tr-TR").format(today);
    return rows.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.aktif) acc.active += 1;
        if (item.favori) acc.favorite += 1;
        acc.balance += Number(item?.mevcutBakiye || 0);
        const updateValue = String(
          item?.sonIslem || item?.updatedAt || item?.updated_at || "",
        ).trim();
        if (updateValue.startsWith(todayIso) || updateValue === todayTr) {
          acc.updatedToday += 1;
        }
        return acc;
      },
      { total: 0, active: 0, favorite: 0, balance: 0, updatedToday: 0 },
    );
  }, [rows]);

  const selectedAdjustCompany = useMemo(
    () =>
      rows.find(
        (item) =>
          String(item.firma || "").toLocaleUpperCase("tr-TR") ===
          String(adjust.firma || "").toLocaleUpperCase("tr-TR"),
      ) || null,
    [rows, adjust.firma],
  );
  const selectedCompanyRow = useMemo(
    () =>
      rows.find(
        (item) =>
          item.id === selectedId ||
          String(item.firma || "").toLocaleUpperCase("tr-TR") ===
            String(
              form.firma || opening.firma || adjust.firma || "",
            ).toLocaleUpperCase("tr-TR"),
      ) || null,
    [rows, selectedId, form.firma, opening.firma, adjust.firma],
  );

  const loadSelectedCompanyMovements = useCallback(async () => {
    const companyId = selectedCompanyRow.id;
    if (!companyId) {
      setMovementRows([]);
      setMovementMeta({ page: 1, limit: 50, total: 0, totalPages: 0 });
      setMovementError("");
      return;
    }
    setMovementBusy(true);
    setMovementError("");
    try {
      const response = await apiGet(
        `/muhasebe/firma-kartlari/${encodeURIComponent(companyId)}/hareketler`,
        {
          ...activeMainCompany,
          page: movementPage,
          limit: 50,
        },
        { raw: true, timeoutMs: 15000 },
      );
      const nextRows = Array.isArray(response.data)
         ? response.data
        : Array.isArray(response)
           ? response
          : [];
      setMovementRows(nextRows);
      setMovementMeta({
        page: Number(response.page || movementPage),
        limit: Number(response.limit || 50),
        total: Number(response.total || nextRows.length),
        totalPages: Number(response.totalPages || 1),
      });
    } catch (error) {
      setMovementError(
        error instanceof Error
           ? error?.message
          : "Firma hareketleri yüklenemedi.",
      );
      setMovementRows([]);
      setMovementMeta({ page: 1, limit: 50, total: 0, totalPages: 0 });
    } finally {
      setMovementBusy(false);
    }
  }, [activeMainCompany, selectedCompanyRow.id, movementPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchText, balanceFilter, sortBy]);

  useEffect(() => {
    setMovementPage(1);
  }, [selectedCompanyRow.id]);

  useEffect(() => {
    load().catch((e) => setNotice(e.message, "warning"));
  }, [load]);

  useEffect(() => {
    loadSelectedCompanyMovements();
  }, [loadSelectedCompanyMovements]);

  function resetForm() {
    setSelectedId(null);
    setPanelMode("firma");
    setForm(emptyForm());
    setOpening(emptyOpening());
    setAdjust(emptyAdjust());
    setMovementPage(1);
  }

  function syncCompanySelection(firma, hedefBakiye) {
    const selectedRow = rows.find(
      (item) =>
        String(item.firma || "").toLocaleUpperCase("tr-TR") ===
        String(firma || "").toLocaleUpperCase("tr-TR"),
    );
    const nextBalance =
      typeof hedefBakiye === "number"
         ? hedefBakiye
        : Number(selectedRow.mevcutBakiye || 0);
    setOpening((prev) => ({ ...prev, firma }));
    setAdjust((prev) => ({ ...prev, firma, hedefBakiye: nextBalance }));
    if (firma) onCompanySelect(firma);
  }

  async function reloadAll() {
    const nextRows = await load();
    await refreshCompanies();
    return nextRows;
  }

  async function saveFirma() {
    if (!activeMainCompany?.id && !activeMainCompany?.slug) {
      setNotice(
        "Ana Firma seçimi zorunlu. Üst banttan ana firma seçin.",
        "warning",
      );
      return;
    }

    if (!form.firma.trim()) {
      setNotice("Firma adı zorunlu.", "warning");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        id: selectedId || undefined,
        ...form,
      };
      if (selectedId) {
        await apiPatch(
          `/muhasebe/firma-kartlari/${encodeURIComponent(selectedId)}`,
          payload,
          activeMainCompany,
        );
      } else {
        await apiPost("/muhasebe/firma-kartlari", payload, activeMainCompany);
      }
      setNotice(
        selectedId ? "Firma kartı güncellendi." : "Firma kartı oluşturuldu.",
      );
      resetForm();
      await reloadAll();
    } catch (e) {
      setNotice(e.message, "warning");
    } finally {
      setBusy(false);
    }
  }

  async function adjustTotal() {
    if (!adjust.firma.trim()) {
      setNotice("Bakiye düzeltme için firma seçin.", "warning");
      return;
    }

    setBusy(true);
    try {
      if (!selectedCompanyRow.id) {
        setNotice("Bakiye düzeltme için listeden firma seçin.", "warning");
        return;
      }
      const result = await apiPost(
        `/muhasebe/firma-kartlari/${encodeURIComponent(selectedCompanyRow.id)}/adjust-balance`,
        {
          ...adjust,
          targetBalance: parseMoney(adjust.hedefBakiye),
          sourceType: "BAKIYE_DUZELTME",
        },
        activeMainCompany,
      );
      if (result.changed === false) {
        setNotice(
          "Hedef toplam bakiye zaten mevcut bakiye ile aynı.",
          "warning",
        );
      } else {
        setNotice(
          "Toplam bakiyeyi hedef değere çeken düzeltme hareketi oluşturuldu.",
        );
      }
      await reloadAll();
    } catch (e) {
      setNotice(e.message, "warning");
    } finally {
      setBusy(false);
    }
  }

  async function addOpening() {
    if (!opening.firma.trim()) {
      setNotice("Açılış bakiyesi için firma seçin.", "warning");
      return;
    }
    setBusy(true);
    try {
      if (!selectedCompanyRow.id) {
        setNotice("Açılış bakiyesi için listeden firma seçin.", "warning");
        return;
      }
      await apiPost(
        `/muhasebe/firma-kartlari/${encodeURIComponent(selectedCompanyRow.id)}/opening-balance`,
        {
          ...opening,
          amount: parseMoney(opening.tutar),
          sourceType: "ACILIS_BAKIYESI",
        },
        activeMainCompany,
      );
      setNotice("Açılış bakiyesi hareketi oluşturuldu.");
      setOpening(emptyOpening(opening.firma));
      await reloadAll();
    } catch (e) {
      setNotice(e.message, "warning");
    } finally {
      setBusy(false);
    }
  }

  function edit(item) {
    setSelectedId(item?.id);
    setPanelMode("firma");
    setForm({
      firma: item?.firma,
      tip: item?.tip || "SATICI",
      aktif: Boolean(item?.aktif),
      favori: Boolean(item?.favori),
      not: item?.not || "",
      vergiNo: item?.vergiNo || "",
      eposta: item?.eposta || "",
      telefon: item?.telefon || "",
      varsayilanRecordType: item?.varsayilanRecordType || "RESMI",
      varsayilanVatRate: Number(item?.varsayilanVatRate ? 0),
      varsayilanVatMode: item?.varsayilanVatMode || "HARIC",
      vatApplicable: item?.vatApplicable !== false,
      companyTransactionProfile:
        item?.companyTransactionProfile || item?.calismaProfili || "SUPPLIER",
      trackReceivablePayable: item?.trackReceivablePayable !== false,
      defaultCashSettlement: Boolean(item?.defaultCashSettlement),
      defaultSupplierPostingType:
        item?.defaultSupplierPostingType ||
        item?.varsayilanTedarikciIslemTipi ||
        "OPEN_PAYABLE",
      defaultPaymentStatus: item?.defaultPaymentStatus || "UNPAID",
      expenseCategory: item?.expenseCategory || item?.giderKategorisi || "",
      defaultVatType: item?.defaultVatType || item?.varsayilanKdvTipi || "INDIRILECEK_KDV",
      expenseCalculationMode:
        item?.expenseCalculationMode || item?.giderHesaplamaTipi || "FULL",
      autoProcessSupplierInvoices: Boolean(item?.autoProcessSupplierInvoices),
      allowManualApprovalWarnings: Boolean(item?.allowManualApprovalWarnings),
      aliases: Array.isArray(item?.aliases) ? item?.aliases : [],
    });
    syncCompanySelection(item?.firma, Number(item?.mevcutBakiye || 0));
  }

  function closeDeletePanel() {
    setDeleteState({
      open: false,
      loading: false,
      deleting: false,
      company: null,
      dependencySummary: null,
      adminPassword: "",
    });
  }

  function openMultiDeletePanel() {
    if (!selectedCompanyIds.size) {
      setNotice("Silinecek firma seçin.", "warning");
      return;
    }
    setMultiDeleteState({ open: true, deleting: false, adminPassword: "" });
  }

  function closeMultiDeletePanel() {
    setMultiDeleteState({ open: false, deleting: false, adminPassword: "" });
  }

  async function deleteSelectedCompanies() {
    if (!selectedCompanyIds.size) return;
    if (!String(multiDeleteState.adminPassword || "").trim()) {
      setNotice("Çoklu silme için admin şifresi zorunludur.", "warning");
      return;
    }
    setMultiDeleteState((prev) => ({ ...prev, deleting: true }));
    try {
      const response = await apiPost(
        "/muhasebe/firma-kartlari/delete-multi",
        {
          ids: Array.from(selectedCompanyIds),
          adminPassword: multiDeleteState.adminPassword,
        },
        activeMainCompany,
      );
      setSelectedCompanyIds(new Set());
      closeMultiDeletePanel();
      const nextRows = await reloadAll();
      const selectable = getSelectableCompanies(nextRows);
      if (
        !selectable.some((item) => item.id === selectedId) &&
        selectable[0].firma
      ) {
        onCompanySelect(selectable[0].firma);
        resetForm();
      }
      setNotice(
        response.message || `${response.deletedCount || 0} firma silindi.`,
        "notice",
      );
    } catch (e) {
      setMultiDeleteState((prev) => ({ ...prev, deleting: false }));
      setNotice(e.message || "Firmalar silinemedi.", "warning");
    }
  }

  async function bulkClassifySelected() {
    if (!selectedCompanyIds.size) {
      setNotice("Sınıflandırılacak firma seçin.", "warning");
      return;
    }
    const trackReceivablePayable = [
      "CUSTOMER",
      "SUPPLIER",
      "CUSTOMER_SUPPLIER",
    ].includes(bulkProfile);
    const vatOnlyExpense = bulkProfile === "VAT_ONLY_EXPENSE";
    setBusy(true);
    try {
      await apiPost(
        "/muhasebe/firmalar/toplu-siniflandirma",
        {
          ids: Array.from(selectedCompanyIds),
          companyTransactionProfile: bulkProfile,
          trackReceivablePayable,
          defaultCashSettlement: !trackReceivablePayable,
          defaultSupplierPostingType: trackReceivablePayable
             ? "OPEN_PAYABLE"
            : vatOnlyExpense
              ? "VAT_ONLY_EXPENSE"
              : "PAID_EXPENSE",
          defaultPaymentStatus: trackReceivablePayable ? "UNPAID" : "PAID",
          defaultVatType: vatOnlyExpense ? "INDIRILECEK_KDV" : undefined,
          expenseCalculationMode: vatOnlyExpense ? "VAT_ONLY" : "FULL",
        },
        activeMainCompany,
      );
      setNotice(`${selectedCompanyIds.size} firma sınıflandırıldı.`);
      setSelectedCompanyIds(new Set());
      await reloadAll();
    } catch (e) {
      setNotice(e.message, "warning");
    } finally {
      setBusy(false);
    }
  }

  async function openDeletePanel(item) {
    setDeleteState({
      open: true,
      loading: true,
      deleting: false,
      company: item,
      dependencySummary: null,
      adminPassword: "",
    });
    try {
      const summary = await apiGet(
        `/muhasebe/firma-kartlari/${encodeURIComponent(item?.id)}/delete-check`,
        activeMainCompany,
      );
      setDeleteState((prev) => ({
        ...prev,
        loading: false,
        dependencySummary: summary,
      }));
    } catch (e) {
      setDeleteState((prev) => ({ ...prev, loading: false }));
      setNotice(e.message || "Silme kontrolü alınamadı.", "warning");
    }
  }

  async function deleteCompany() {
    const company = deleteState.company;
    if (!company?.id) {
      setNotice("Silinecek firma bulunamadı.", "warning");
      return;
    }
    if (!String(deleteState.adminPassword || "").trim()) {
      setNotice("Firma silmek için admin şifresi zorunludur.", "warning");
      return;
    }
    setDeleteState((prev) => ({ ...prev, deleting: true }));
    try {
      const response = await apiPost(
        `/muhasebe/firma-kartlari/${encodeURIComponent(company?.id)}/delete`,
        {
          adminPassword: deleteState.adminPassword,
        },
        activeMainCompany,
      );
      const nextRows = await reloadAll();
      const selectable = getSelectableCompanies(nextRows);
      const stillExists = selectable.some(
        (item) =>
          normalizeCompanyText(item.firma) ===
          normalizeCompanyText(company?.firma),
      );
      if (!stillExists && selectable[0].firma) {
        onCompanySelect(selectable[0].firma);
      }
      if (selectedId === company?.id) resetForm();
      setNotice(response.message || "Firma silindi.", "notice");
      closeDeletePanel();
    } catch (e) {
      setDeleteState((prev) => ({ ...prev, deleting: false }));
      setNotice(e.message || "Firma silinemedi.", "warning");
    }
  }

  const deleteBreakdown = deleteState.dependencySummary.breakdown || {};
  const deleteBreakdownRows = [
    { key: "companyCards", label: "Firma kartı" },
    { key: "documents", label: "Belgeler" },
    { key: "incomingDispatchDocs", label: "Müşteriden gelen irsaliye" },
    { key: "outgoingDocs", label: "Bizim belgeler" },
    { key: "supplierDocs", label: "Tedarikçi faturaları" },
    { key: "cariMovements", label: "Cari hareketler" },
    { key: "balanceAdjustments", label: "Bakiye düzeltmeleri" },
    { key: "openingBalances", label: "Açılış bakiyeleri" },
    { key: "vatRecords", label: "KDV kayıtları" },
    { key: "payments", label: "Ödemeler" },
    { key: "checks", label: "Çekler" },
    { key: "creditCards", label: "Kredi kartları" },
    { key: "products", label: "Ürünler" },
    { key: "modelRecords", label: "Model kayıtları" },
    { key: "productionRecords", label: "Üretim kayıtları" },
    { key: "lots", label: "Lotlar" },
  ].filter((item) => Number(deleteBreakdown[item?.key] || 0) > 0);
  const unresolvedSuggestions = mergeSuggestions.filter(
    (item) => item?.alreadyAliased !== true,
  ).length;
  const showCompanyMatchingWarning =
    Number(matchingStatus.activeAliasSuggestionCount || 0) > 0 ||
    Number(matchingStatus.unresolvedCompanyAliasCount || 0) > 0 ||
    Number(matchingStatus.pendingCompanyMatchingRecords || 0) > 0 ||
    unresolvedSuggestions > 0;

  return (
    <div className="content-grid muhasebe-page">
      <MuhasebePageHeader
        title={tr.firmaKartlari}
        subtitle="Firma kartlarını yönetin, açılış bakiyesi ekleyin ve hedef bakiye düzeltmesini ayrı işlemlerle yönetin."
      />
      <div className="content-card muhasebe-page-body">
        {message ? (
          <div
            className={messageType === "warning" ? "warning-box" : "notice-box"}
          >
            {message}
          </div>
        ) : null}

        {showCompanyMatchingWarning ? (
          <div className="warning-box mt-16">
            <div className="status-text">
              Bu ana firmada firma eşleme önerileri var. Admin {" > "} Firma
              Eşleme&apos;den kontrol edin.
            </div>
          </div>
        ) : null}

        {deleteState.open ? (
          <div className="warning-box mt-16">
            <SectionHeader
              title="Firma Sil"
              subtitle="Admin şifresi doğrulanır, önce yedek alınır, sonra bağlı kayıtlar kalıcı silinir."
            />
            <div className="info-grid info-grid-3">
              <div className="info-box">
                <span>Firma</span>
                <strong>{deleteState.company.firma || "-"}</strong>
              </div>
              <div className="info-box">
                <span>Ana Firma</span>
                <strong>{activeMainCompany?.name || "-"}</strong>
              </div>
              <div className="info-box">
                <span>Bağlı Kayıt</span>
                <strong>
                  {deleteState.loading
                     ? "Kontrol ediliyor..."
                    : Number(
                        deleteState.dependencySummary.totalLinkedRecords || 0,
                      )}
                </strong>
              </div>
            </div>

            {deleteBreakdownRows.length ? (
              <div className="firma-kartlari-warning-list mt-16">
                {deleteBreakdownRows.map((item) => (
                  <div key={item?.key}>
                    {item?.label}: {Number(deleteBreakdown[item?.key] || 0)}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="status-text mt-12">
              {deleteState.dependencySummary.message ||
                "Bu işlem önce yedek alır, sonra firma ve bağlı kayıtları kalıcı siler."}
            </div>

            <Input
              label="Admin Şifresi"
              type="password"
              value={deleteState.adminPassword}
              onChange={(e) =>
                setDeleteState((prev) => ({
                  ...prev,
                  adminPassword: e.target.value,
                }))
              }
            />

            <ActionBar>
              <button
                className="soft-btn"
                type="button"
                onClick={closeDeletePanel}
                disabled={deleteState.deleting}
              >
                Vazgeç
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={deleteCompany}
                disabled={deleteState.deleting || deleteState.loading}
              >
                Yedek al ve sil
              </button>
            </ActionBar>
          </div>
        ) : null}

        {multiDeleteState.open ? (
          <div className="warning-box mt-16">
            <SectionHeader
              title="Çoklu Firma Sil"
              subtitle="Seçilen firmalar için yedek alınır, ardından bağlı kayıtlarla birlikte kalıcı silinir."
            />
            <div className="firma-kartlari-warning-list mt-8">
              {filteredRows
                .filter((r) => selectedCompanyIds.has(r.id))
                .map((r) => (
                  <div key={r.id}>
                    <strong>{r.firma}</strong>{" "}
                    <span className="neutral-chip" style={{ marginLeft: 6 }}>
                      ID: {r.id}
                    </span>
                  </div>
                ))}
            </div>
            <div className="status-text mt-12">
              {selectedCompanyIds.size} firma ve bağlı tüm kayıtlar kalıcı
              silinecek. Bu işlem geri alınamaz.
            </div>
            <Input
              label="Admin Şifresi"
              type="password"
              value={multiDeleteState.adminPassword}
              onChange={(e) =>
                setMultiDeleteState((prev) => ({
                  ...prev,
                  adminPassword: e.target.value,
                }))
              }
            />
            <ActionBar>
              <button
                className="soft-btn"
                type="button"
                onClick={closeMultiDeletePanel}
                disabled={multiDeleteState.deleting}
              >
                Vazgeç
              </button>
              <button
                className="danger-btn"
                type="button"
                onClick={deleteSelectedCompanies}
                disabled={multiDeleteState.deleting}
              >
                {multiDeleteState.deleting
                   ? "Siliniyor..."
                  : `${selectedCompanyIds.size} firmayı yedekle ve sil`}
              </button>
            </ActionBar>
          </div>
        ) : null}

        <div className="firma-kartlari-layout mt-16">
          <div className="panel-block firma-kartlari-list-block">
            <div className="action-bar">
              <input
                className="search-input firma-kartlari-search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Firma adı, vergi no, telefon veya e-posta ile ara"
              />
              <select
                className="soft-select"
                value={balanceFilter}
                onChange={(e) => setBalanceFilter(e.target.value)}
              >
                <option value="ALL">Tüm bakiyeler</option>
                <option value="POSITIVE">Pozitif bakiye</option>
                <option value="NEGATIVE">Negatif bakiye</option>
                <option value="ZERO">Sıfır bakiye</option>
              </select>
              <select
                className="soft-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="BALANCE_DESC">Bakiye: Çoktan aza</option>
                <option value="BALANCE_ASC">Bakiye: Azdan çoğa</option>
                <option value="UPDATED_DESC">Son işlem: Yeni ilk</option>
                <option value="UPDATED_ASC">Son işlem: Eski ilk</option>
                <option value="NAME_ASC">Firma adı: A-Z</option>
                <option value="NAME_DESC">Firma adı: Z-A</option>
              </select>
            </div>

            <div className="info-grid info-grid-4 mt-16">
              <MetricBox
                icon="firma-kartlari"
                label="Toplam Firma"
                value={totals.total}
                subText="Kayıtlı firma sayısı"
                tone="blue"
              />
              <MetricBox
                icon="users"
                label="Aktif / Pasif"
                value={`${totals.active} / ${Math.max(totals.total - totals.active, 0)}`}
                subText="Aktif ve pasif firma"
                tone="green"
              />
              <MetricBox
                icon="cari-kasa"
                label="Toplam Bakiye"
                value={formatMoney(totals.balance)}
                subText="Tüm firmaların bakiyesi"
                tone="purple"
              />
              <MetricBox
                icon="takvim"
                label="Bugün Güncellenen"
                value={totals.updatedToday}
                subText="Bugün işlem yapılan firma"
                tone="orange"
              />
            </div>

            <SectionHeader
              title="Firma Listesi"
              subtitle={`${filteredRows.length} kayıt gösteriliyor.`}
              right={
                selectedCompanyIds.size > 0 ? (
                  <div className="action-bar">
                    <select
                      className="soft-select"
                      value={bulkProfile}
                      onChange={(e) => setBulkProfile(e.target.value)}
                    >
                      {transactionProfileOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="soft-btn tiny-btn"
                      type="button"
                      disabled={busy}
                      onClick={bulkClassifySelected}
                    >
                      <ErpIcon name="kaydet" size={15} />
                      {selectedCompanyIds.size} firmayı sınıflandır
                    </button>
                    <button
                      className="danger-btn tiny-btn"
                      type="button"
                      onClick={openMultiDeletePanel}
                    >
                      <ErpIcon name="sil" size={15} />
                      {selectedCompanyIds.size} firmayı sil
                    </button>
                  </div>
                ) : null
              }
            />

            <div className="action-bar mt-8">
              <button
                className="soft-btn tiny-btn"
                type="button"
                disabled={listBusy || pageMeta.page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Önceki
              </button>
              <span className="neutral-chip">
                Sayfa {pageMeta.page} / {Math.max(pageMeta.totalPages, 1)}
              </span>
              <button
                className="soft-btn tiny-btn"
                type="button"
                disabled={
                  listBusy || pageMeta.page >= Math.max(pageMeta.totalPages, 1)
                }
                onClick={() =>
                  setPage((prev) =>
                    Math.min(Math.max(pageMeta.totalPages, 1), prev + 1),
                  )
                }
              >
                Sonraki
              </button>
              {listBusy ? (
                <span className="status-text">Liste yükleniyor...</span>
              ) : null}
            </div>

            <div className="table-wrap mt-16 firma-kartlari-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        title="Tümünü seç / kaldır"
                        checked={
                          filteredRows.length > 0 &&
                          filteredRows.every((r) =>
                            selectedCompanyIds.has(r.id),
                          )
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCompanyIds((prev) => {
                              const next = new Set(prev);
                              filteredRows.forEach((r) => next.add(r.id));
                              return next;
                            });
                          } else {
                            setSelectedCompanyIds((prev) => {
                              const next = new Set(prev);
                              filteredRows.forEach((r) => next.delete(r.id));
                              return next;
                            });
                          }
                        }}
                      />
                    </th>
                    <th>Firma Adı</th>
                    <th>Tip</th>
                    <th>Sınıf</th>
                    <th>Vergi No</th>
                    <th>Telefon</th>
                    <th>E-Posta</th>
                    <th>Mevcut Bakiye</th>
                    <th>Son İşlem Tarihi</th>
                    <th>Aktif/Pasif</th>
                    <th>Favori</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item) => (
                    <tr
                      key={item?.id}
                      className={
                        selectedId === item?.id ? "firma-row-selected" : ""
                      }
                    >
                      <td style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={selectedCompanyIds.has(item?.id)}
                          onChange={(e) => {
                            setSelectedCompanyIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(item?.id);
                              else next.delete(item?.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td>
                        <strong>{item?.firma}</strong>
                        {item?.cariTakipDisi ? (
                          <div className="muted-small">Cari takip dışı</div>
                        ) : null}
                      </td>
                      <td>{tipLabel(item?.tip)}</td>
                      <td>
                        <span
                          className={
                            item.trackReceivablePayable === false
                               ? "warn-chip"
                              : "ok-chip"
                          }
                        >
                          {transactionProfileOptions.find(
                            (option) =>
                              option.value === item?.companyTransactionProfile,
                          ).label ||
                            item?.companyTransactionProfile ||
                            "-"}
                        </span>
                      </td>
                      <td>{item?.vergiNo || ""}</td>
                      <td>{item?.telefon || ""}</td>
                      <td>{item?.eposta || ""}</td>
                      <td
                        className={
                          Number(item?.mevcutBakiye || 0) < 0
                             ? "negative"
                            : "positive"
                        }
                      >
                        {item.trackReceivablePayable === false
                           ? "Cari takip dışı"
                          : formatMoney(item?.mevcutBakiye)}
                      </td>
                      <td>{formatDate(item?.sonIslem)}</td>
                      <td>
                        <span className={item?.aktif ? "ok-chip" : "warn-chip"}>
                          {item?.aktif ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={item?.favori ? "ok-chip" : "neutral-chip"}
                        >
                          {item?.favori ? "Favori" : "-"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="soft-btn tiny-btn"
                          onClick={() => edit(item)}
                        >
                          <ErpIcon name="duzenle" size={15} />
                          Düzenle
                        </button>
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          onClick={() => openDeletePanel(item)}
                        >
                          <ErpIcon name="sil" size={15} />
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredRows.length ? (
                    <tr>
                      <td colSpan={12}>Firma kaydı bulunamadı.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="firma-kartlari-side">
            <div className="panel-block">
              <div className="action-bar">
                <button
                  className={panelMode === "firma" ? "primary-btn" : "soft-btn"}
                  onClick={() => setPanelMode("firma")}
                  type="button"
                >
                  <ErpIcon name="firma-kartlari" size={16} />
                  Yeni Firma
                </button>
                <button
                  className={
                    panelMode === "opening" ? "primary-btn" : "soft-btn"
                  }
                  onClick={() => setPanelMode("opening")}
                  type="button"
                >
                  <ErpIcon name="kaydet" size={16} />
                  Açılış Bakiyesi
                </button>
                <button
                  className={
                    panelMode === "adjust" ? "primary-btn" : "soft-btn"
                  }
                  onClick={() => setPanelMode("adjust")}
                  type="button"
                >
                  <ErpIcon name="cari-kasa" size={16} />
                  Bakiye Düzelt
                </button>
              </div>

              {panelMode === "firma"  (
                <>
                  <SectionHeader
                    title={selectedId ? "Firma Düzenle" : "Yeni Firma"}
                    subtitle="Firma adı, tip, iletişim ve varsayılan KDV bilgilerini yönetin."
                    right={
                      selectedId ? (
                        <button
                          className="soft-btn tiny-btn"
                          onClick={resetForm}
                        >
                          <ErpIcon name="yenile" size={15} />
                          Yeni Kayıt
                        </button>
                      ) : null
                    }
                  />

                  <div className="form-grid form-grid-compact">
                    <label className="field">
                      <span>Ana Firma</span>
                      <input
                        value={activeMainCompany?.name || "Seçim yok"}
                        readOnly
                      />
                    </label>
                    <Input
                      label="Firma Adı"
                      value={form.firma}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, firma: e.target.value }))
                      }
                    />
                    <Select
                      label="Tip"
                      value={form.tip}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, tip: e.target.value }))
                      }
                      options={[
                        { value: "SATICI", label: "Satıcı" },
                        { value: "MUSTERI", label: "Müşteri" },
                        { value: "GENEL", label: "Genel" },
                      ]}
                    />
                    <Input
                      label="Vergi No"
                      value={form.vergiNo}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, vergiNo: e.target.value }))
                      }
                    />
                    <Input
                      label="Telefon"
                      value={form.telefon}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, telefon: e.target.value }))
                      }
                    />
                    <Input
                      label="E-Posta"
                      value={form.eposta}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, eposta: e.target.value }))
                      }
                    />
                    <Select
                      label="Varsayılan Kayıt Tipi"
                      value={form.varsayilanRecordType}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          varsayilanRecordType: e.target.value,
                        }))
                      }
                      options={[
                        { value: "RESMI", label: "Resmi" },
                        { value: "GAYRI_RESMI", label: "Gayri Resmi" },
                      ]}
                    />
                    <Input
                      label="Varsayılan KDV Oranı (%)"
                      type="number"
                      value={form.varsayilanVatRate}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          varsayilanVatRate: Number(e.target.value || 0),
                        }))
                      }
                      placeholder="20"
                    />
                    <Select
                      label="KDV Dahil / Hariç"
                      value={form.varsayilanVatMode}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          varsayilanVatMode: e.target.value,
                        }))
                      }
                      options={[
                        { value: "HARIC", label: "KDV Hariç" },
                        { value: "DAHIL", label: "KDV Dahil" },
                      ]}
                    />
                    <Select
                      label="Firma Sınıflandırma"
                      value={form.companyTransactionProfile}
                      onChange={(e) => {
                        const profile = e.target.value;
                        const trackReceivablePayable = [
                          "CUSTOMER",
                          "SUPPLIER",
                          "CUSTOMER_SUPPLIER",
                        ].includes(profile);
                        const vatOnlyExpense = profile === "VAT_ONLY_EXPENSE";
                        setForm((p) => ({
                          ...p,
                          companyTransactionProfile: profile,
                          trackReceivablePayable,
                          defaultCashSettlement: !trackReceivablePayable,
                          defaultSupplierPostingType: trackReceivablePayable
                             ? "OPEN_PAYABLE"
                            : vatOnlyExpense
                              ? "VAT_ONLY_EXPENSE"
                              : "PAID_EXPENSE",
                          defaultPaymentStatus: trackReceivablePayable
                             ? "UNPAID"
                            : "PAID",
                          expenseCalculationMode: vatOnlyExpense
                            ? "VAT_ONLY"
                            : "FULL",
                          expenseCategory: vatOnlyExpense
                            ? "KDV Matrah Dışı"
                            : p.expenseCategory,
                          defaultVatType:
                            profile === "UNOFFICIAL_EXPENSE"
                               ? "KDV_YOK"
                              : vatOnlyExpense
                                ? "INDIRILECEK_KDV"
                              : p.defaultVatType,
                        }));
                      }}
                      options={transactionProfileOptions}
                    />
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={form.trackReceivablePayable}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            trackReceivablePayable: e.target.checked,
                          }))
                        }
                      />{" "}
                      Cari alacak/borç takip edilsin
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={form.defaultCashSettlement}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            defaultCashSettlement: e.target.checked,
                            defaultPaymentStatus: e.target.checked
                               ? "PAID"
                              : p.defaultPaymentStatus,
                          }))
                        }
                      />{" "}
                      Varsayılan peşin kapansın
                    </label>
                    <Select
                      label="Tedarikçi İşlem Tipi"
                      value={form.defaultSupplierPostingType}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          defaultSupplierPostingType: e.target.value,
                          expenseCalculationMode:
                            e.target.value === "VAT_ONLY_EXPENSE"
                              ? "VAT_ONLY"
                              : p.expenseCalculationMode === "VAT_ONLY"
                                ? "FULL"
                                : p.expenseCalculationMode,
                          defaultPaymentStatus:
                            e.target.value === "OPEN_PAYABLE" ? "UNPAID" : "PAID",
                        }))
                      }
                      options={postingTypeOptions}
                    />
                    <Select
                      label="Gider Hesabı"
                      value={form.expenseCalculationMode}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          expenseCalculationMode: e.target.value,
                          companyTransactionProfile:
                            e.target.value === "VAT_ONLY"
                              ? "VAT_ONLY_EXPENSE"
                              : p.companyTransactionProfile === "VAT_ONLY_EXPENSE"
                                ? "CASH_EXPENSE"
                                : p.companyTransactionProfile,
                          trackReceivablePayable:
                            e.target.value === "VAT_ONLY"
                              ? false
                              : p.trackReceivablePayable,
                          defaultCashSettlement:
                            e.target.value === "VAT_ONLY"
                              ? true
                              : p.defaultCashSettlement,
                          defaultSupplierPostingType:
                            e.target.value === "VAT_ONLY"
                              ? "VAT_ONLY_EXPENSE"
                              : p.defaultSupplierPostingType === "VAT_ONLY_EXPENSE"
                                ? "PAID_EXPENSE"
                                : p.defaultSupplierPostingType,
                          defaultPaymentStatus:
                            e.target.value === "VAT_ONLY"
                              ? "PAID"
                              : p.defaultPaymentStatus,
                          defaultVatType:
                            e.target.value === "VAT_ONLY"
                              ? "INDIRILECEK_KDV"
                              : p.defaultVatType,
                          expenseCategory:
                            e.target.value === "VAT_ONLY"
                              ? "KDV Matrah Dışı"
                              : p.expenseCategory,
                        }))
                      }
                      options={[
                        { value: "FULL", label: "Matrah + KDV gider hesabına girer" },
                        { value: "VAT_ONLY", label: "Sadece KDV kullanılır, matrah gider dışı" },
                      ]}
                    />
                    <Input
                      label="Gider Kategorisi"
                      value={form.expenseCategory}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          expenseCategory: e.target.value,
                        }))
                      }
                      placeholder="Market, akaryakıt, yemek..."
                    />
                    <Select
                      label="Varsayılan KDV Tipi"
                      value={form.defaultVatType}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          defaultVatType: e.target.value,
                        }))
                      }
                      options={[
                        { value: "INDIRILECEK_KDV", label: "İndirilecek KDV" },
                        { value: "KDV_YOK", label: "KDV Yok" },
                      ]}
                    />
                  </div>

                  <Textarea
                    label="Not"
                    value={form.not}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, not: e.target.value }))
                    }
                  />

                  {Array.isArray(form.aliases) && form.aliases.length ? (
                    <div className="alias-history-box">
                      <strong>Alias / Geçmiş Adlar</strong>
                      <ul>
                        {form.aliases.map((alias) => (
                          <li key={alias.id || alias.rawName}>
                            {alias.rawName}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <ActionBar>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={form.aktif}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, aktif: e.target.checked }))
                        }
                      />{" "}
                      Aktif
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={form.favori}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, favori: e.target.checked }))
                        }
                      />{" "}
                      Favori
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={form.vatApplicable}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            vatApplicable: e.target.checked,
                          }))
                        }
                      />{" "}
                      KDV Uygulanır
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={form.autoProcessSupplierInvoices}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            autoProcessSupplierInvoices: e.target.checked,
                          }))
                        }
                      />{" "}
                      Bu firmadan gelen belgeleri otomatik gider işle
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={form.allowManualApprovalWarnings}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            allowManualApprovalWarnings: e.target.checked,
                          }))
                        }
                      />{" "}
                      Küçük uyarılarda manuel onaya izin ver
                    </label>
                    <button
                      className="primary-btn"
                      onClick={saveFirma}
                      disabled={busy}
                    >
                      <ErpIcon name="kaydet" size={16} />
                      {selectedId ? "Değişikliği Kaydet" : "Firma Kaydet"}
                    </button>
                  </ActionBar>
                </>
              ) : null}

              {panelMode === "opening"  (
                <>
                  <SectionHeader
                    title="Açılış Bakiyesi Ekle"
                    subtitle="Bu işlem firmanın ilk hareketi olarak ayrı bir açılış kaydı oluşturur; hedef bakiye düzeltmesi değildir."
                  />

                  <div className="firma-kartlari-single-action">
                    <CompanyQuickPicker
                      label="Firma Seç"
                      companies={companyOptions}
                      value={opening.firma}
                      recentCompanies={recentCompanies}
                      helperText="Açılış bakiyesi yalnızca seçilen firma kartının ilk hareketi olarak yazılır."
                      onChange={(name) => syncCompanySelection(name)}
                    />

                    <div className="form-grid form-grid-compact">
                      <MoneyInput
                        label="Açılış Bakiyesi"
                        value={opening.tutar}
                        onValueChange={(value) =>
                          setOpening((p) => ({ ...p, tutar: value }))
                        }
                      />
                      <Input
                        label="Tarih"
                        type="date"
                        value={opening.tarih}
                        onChange={(e) =>
                          setOpening((p) => ({ ...p, tarih: e.target.value }))
                        }
                      />
                    </div>

                    <Textarea
                      label="Açıklama"
                      value={opening.aciklama}
                      onChange={(e) =>
                        setOpening((p) => ({ ...p, aciklama: e.target.value }))
                      }
                    />

                    <ActionBar>
                      <button
                        className="primary-btn"
                        onClick={addOpening}
                        disabled={busy}
                      >
                        Açılış Bakiyesi Kaydet
                      </button>
                    </ActionBar>
                  </div>
                </>
              ) : null}

              {panelMode === "adjust"  (
                <>
                  <SectionHeader
                    title="Bakiye Düzelt"
                    subtitle="Bu işlem seçilen firmayı hedef toplam bakiyeye çeker; sistem yalnızca fark kadar düzeltme hareketi yazar."
                  />

                  <div className="firma-kartlari-single-action">
                    <CompanyQuickPicker
                      label="Firma Seç"
                      companies={companyOptions}
                      value={adjust.firma}
                      recentCompanies={recentCompanies}
                      helperText={
                        selectedAdjustCompany
                           ? `${selectedAdjustCompany.firma} | Mevcut Bakiye: ${formatMoney(selectedAdjustCompany.mevcutBakiye)}`
                          : "Firma seçin, sistem hedef bakiye ile mevcut bakiye arasındaki farkı yazar."
                      }
                      onChange={(name) => syncCompanySelection(name)}
                    />

                    <div className="form-grid form-grid-compact">
                      <MoneyInput
                        label="Hedef Toplam Bakiye"
                        value={adjust.hedefBakiye}
                        onValueChange={(value) =>
                          setAdjust((p) => ({ ...p, hedefBakiye: value }))
                        }
                      />
                      <Input
                        label="Tarih"
                        type="date"
                        value={adjust.tarih}
                        onChange={(e) =>
                          setAdjust((p) => ({ ...p, tarih: e.target.value }))
                        }
                      />
                    </div>

                    <Textarea
                      label="Açıklama"
                      value={adjust.aciklama}
                      onChange={(e) =>
                        setAdjust((p) => ({ ...p, aciklama: e.target.value }))
                      }
                    />

                    <ActionBar>
                      <button
                        className="primary-btn"
                        onClick={adjustTotal}
                        disabled={busy}
                      >
                        Bakiye Düzeltmeyi Kaydet
                      </button>
                    </ActionBar>
                  </div>
                </>
              ) : null}

              {selectedCompanyRow ||
              form.firma ||
              opening.firma ||
              adjust.firma ? (
                <div className="info-grid info-grid-3 mt-16">
                  <div className="info-box">
                    <span>Ana Firma</span>
                    <strong>{activeMainCompany?.name || "Seçim yok"}</strong>
                  </div>
                  <div className="info-box">
                    <span>Mevcut Bakiye</span>
                    <strong>
                      {formatMoney(
                        Number(selectedCompanyRow.mevcutBakiye || 0),
                      )}
                    </strong>
                  </div>
                  <div className="info-box">
                    <span>Ödenen</span>
                    <strong>
                      {formatMoney(
                        Number(selectedCompanyRow.odenenToplam || 0),
                      )}
                    </strong>
                  </div>
                </div>
              ) : null}

              <div className="mt-16">
                <SectionHeader
                  title="Firma Hareketleri"
                  subtitle={
                    selectedCompanyRow.firma
                       ? `${selectedCompanyRow.firma} için DB hareketleri (sayfalı)`
                      : "Önce listeden bir firma seçin."
                  }
                />

                {!selectedCompanyRow.id ? (
                  <div className="status-text">
                    Firma seçilmeden hareket çağrısı yapılmaz.
                  </div>
                ) : null}

                {movementError ? (
                  <div className="warning-box mt-8">{movementError}</div>
                ) : null}

                {selectedCompanyRow.id ? (
                  <>
                    <div className="action-bar mt-8">
                      <button
                        className="soft-btn tiny-btn"
                        type="button"
                        disabled={movementBusy || movementMeta.page <= 1}
                        onClick={() =>
                          setMovementPage((prev) => Math.max(1, prev - 1))
                        }
                      >
                        Önceki
                      </button>
                      <span className="neutral-chip">
                        Sayfa {movementMeta.page} /{" "}
                        {Math.max(movementMeta.totalPages, 1)}
                      </span>
                      <button
                        className="soft-btn tiny-btn"
                        type="button"
                        disabled={
                          movementBusy ||
                          movementMeta.page >=
                            Math.max(movementMeta.totalPages, 1)
                        }
                        onClick={() =>
                          setMovementPage((prev) =>
                            Math.min(
                              Math.max(movementMeta.totalPages, 1),
                              prev + 1,
                            ),
                          )
                        }
                      >
                        Sonraki
                      </button>
                      {movementBusy ? (
                        <span className="status-text">
                          Hareketler yükleniyor...
                        </span>
                      ) : null}
                    </div>

                    <div className="table-wrap mt-8">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Tarih</th>
                            <th>İşlem</th>
                            <th>Kaynak</th>
                            <th>Açıklama</th>
                            <th>Tutar</th>
                            <th>Bakiye</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movementRows.map((row) => (
                            <tr key={row?.id}>
                              <td>
                                {formatDate(row?.tarih || row?.movementDate)}
                              </td>
                              <td>
                                {row?.islemTipi || row?.movementType || "-"}
                              </td>
                              <td>{row?.sourceType || "-"}</td>
                              <td>{row?.aciklama || row?.description || "-"}</td>
                              <td>
                                {formatMoney(
                                  Number(row?.etkisi ?? row?.effect ?? 0),
                                )}
                              </td>
                              <td>
                                {formatMoney(
                                  Number(row?.bakiye ?? row?.balanceAfter ?? 0),
                                )}
                              </td>
                            </tr>
                          ))}
                          {!movementRows.length ? (
                            <tr>
                              <td colSpan={6}>Hareket kaydı bulunamadı.</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
