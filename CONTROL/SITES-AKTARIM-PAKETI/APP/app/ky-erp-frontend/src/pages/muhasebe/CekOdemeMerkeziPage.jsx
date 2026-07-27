import { useEffect, useMemo, useState } from "react";
import {
  createOdemeCek,
  createOdemeFirma,
  createOdemeKart,
  getOdemeFirmaAcikBorclar,
  getOdemeFirmaCekler,
  getOdemeFirmaHareketler,
  getOdemeFirmaKartlar,
  getOdemeFirmaNakitHavale,
  getOdemeFirmaOzet,
  getOdemeFirmalar,
  saveOdemeIslem,
} from "../../services/cekOdemeApi";

const today = new Date().toISOString().slice(0, 10);

const METHOD_OPTIONS = [
  { key: "CHECK", label: "Çek" },
  { key: "CASH", label: "Nakit" },
  { key: "CARD", label: "Kredi Kartı" },
  { key: "TRANSFER", label: "Havale / EFT" },
  { key: "TRANSFER", label: "Mahsup", subType: "OFFSET" },
  { key: "CASH", label: "Gayri Resmi Ödeme", subType: "UNOFFICIAL" },
];

const DIRECTION_OPTIONS = [
  { key: "PAYMENT_OUT", label: "Ödeme Yaptım" },
  { key: "COLLECTION_IN", label: "Tahsilat Aldım" },
];

const TAB_OPTIONS = [
  { key: "all", label: "Tümü" },
  { key: "debts", label: "Açık Borçlar" },
  { key: "checks", label: "Çekler" },
  { key: "cards", label: "Kredi Kartları" },
  { key: "cash", label: "Nakit / Havale" },
  { key: "completed", label: "Tamamlananlar" },
];

function companyParams(activeMainCompany, extra = {}) {
  const slug = activeMainCompany?.mainCompanySlug || activeMainCompany?.slug || "";
  const id = activeMainCompany?.mainCompanyId || activeMainCompany?.id || "";
  return {
    ...(slug ? { mainCompanySlug: slug } : {}),
    ...(id ? { mainCompanyId: id } : {}),
    ...extra,
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.liste)) return value.liste;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.data)) return value.data;
  return [];
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function num(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/[₺\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
     ? String(value).slice(0, 10)
    : parsed.toLocaleDateString("tr-TR");
}

function firmName(firm) {
  return firm.firmaAdi || firm.name || firm.shortName || "Firma";
}

function firmTypeLabel(value) {
  const raw = String(value || "").toLocaleUpperCase("tr-TR");
  if (raw === "SUPPLIER" || raw.includes("SATICI") || raw.includes("TEDAR")) return "Tedarikçi";
  if (raw === "CUSTOMER" || raw.includes("MUST") || raw.includes("MÜŞ")) return "Müşteri";
  if (raw === "BOTH") return "Tedarikçi / Müşteri";
  return "Gayri Resmi";
}

function officialLabel(value) {
  const raw = String(value || "").toLocaleUpperCase("tr-TR");
  return raw.includes("UNOFF") || raw.includes("GAYRI") || raw.includes("GAYRİ") ? "Gayri Resmi" : "Resmi";
}

function statusTone(value) {
  const raw = String(value || "").toLocaleUpperCase("tr-TR");
  if (raw.includes("PAID") || raw.includes("ÖDEN") || raw.includes("TAMAM")) return "green";
  if (raw.includes("WAIT") || raw.includes("KISMI") || raw.includes("PLAN")) return "orange";
  if (raw.includes("PROBLEM") || raw.includes("İPTAL") || raw.includes("CANCEL")) return "red";
  return "gray";
}

function emptyQuickForm() {
  return {
    paymentDate: today,
    transactionDirection: "",
    paymentMethod: "",
    amount: "",
    description: "",
    bankName: "",
    checkNo: "",
    branchName: "",
    dueDate: today,
    checkType: "TEDARIKCIYE_VERILEN",
    creditCardId: "",
    cardOwner: "",
    lastFourDigits: "",
    receiptNo: "",
    offsetAccount: "",
    unofficialPerson: "",
  };
}

function emptyFirmForm() {
  return {
    name: "",
    firmType: "SUPPLIER",
    workType: "OFFICIAL",
    taxNo: "",
    phone: "",
    email: "",
    openingBalance: "",
    openingBalanceDirection: "BORC",
    note: "",
    isActive: true,
  };
}

function emptyCheckForm(firmId = "") {
  return {
    firmId,
    checkNo: "",
    bankName: "",
    branchName: "",
    dueDate: today,
    amount: "",
    status: "PLANNED",
    checkType: "TEDARIKCIYE_VERILEN",
    description: "",
  };
}

function normalizeFirmKey(firm) {
  return String(
    firm.id ||
      firm.firmaId ||
      firm.companyId ||
      firm.taxNo ||
      firm.vergiNo ||
      firmName(firm),
  )
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeAndSortFirms(rows = []) {
  const map = new Map();
  for (const firm of rows) {
    const key = normalizeFirmKey(firm);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...firm,
        duplicateCount: 1,
        openCheckCount: Number(firm.openCheckCount || 0),
        creditCardMovementCount: Number(firm.creditCardMovementCount || 0),
        openDebtCount: Number(firm.openDebtCount || 0),
        openDebtTotal: Number(firm.openDebtTotal || 0),
      });
      continue;
    }
    const nextDate =
      String(firm.sonHareketTarihi || firm.lastMovementDate || "") >
      String(existing.sonHareketTarihi || existing.lastMovementDate || "")
         ? firm.sonHareketTarihi || firm.lastMovementDate
        : existing.sonHareketTarihi || existing.lastMovementDate;
    map.set(key, {
      ...existing,
      duplicateCount: Number(existing.duplicateCount || 1) + 1,
      bakiye: Number(existing.bakiye || existing.currentBalance || 0) + Number(firm.bakiye || firm.currentBalance || 0),
      currentBalance: Number(existing.currentBalance || existing.bakiye || 0) + Number(firm.currentBalance || firm.bakiye || 0),
      openCheckCount: Number(existing.openCheckCount || 0) + Number(firm.openCheckCount || 0),
      creditCardMovementCount: Number(existing.creditCardMovementCount || 0) + Number(firm.creditCardMovementCount || 0),
      openDebtCount: Number(existing.openDebtCount || 0) + Number(firm.openDebtCount || 0),
      openDebtTotal: Number(existing.openDebtTotal || 0) + Number(firm.openDebtTotal || 0),
      sonHareketTarihi: nextDate,
      lastMovementDate: nextDate,
    });
  }
  const score = (firm) => {
    const balance = Math.abs(Number(firm.bakiye || firm.currentBalance || 0));
    const assetCount =
      Number(firm.openCheckCount || 0) +
      Number(firm.creditCardMovementCount || 0) +
      Number(firm.openDebtCount || 0);
    const hasRecent = firm.sonHareketTarihi || firm.lastMovementDate ? 1 : 0;
    return (balance > 0 ? 1000 : 0) + (assetCount > 0 ? 500 : 0) + hasRecent * 100;
  };
  return [...map.values()].sort(
    (a, b) => score(b) - score(a) || firmName(a).localeCompare(firmName(b), "tr"),
  );
}

function emptyCardForm(firmId = "") {
  return {
    firmId,
    cardName: "",
    bankName: "",
    lastFourDigits: "",
    totalDebt: "",
    limit: "",
    availableLimit: "",
    dueDate: "",
    note: "",
  };
}

function normalizeRow(row, fallbackType = "CARI") {
  const firstAmount = Number(row?.ilkTutar ?? row?.tutar ?? row?.acikTutar ?? row?.borc ?? 0);
  const paid = Number(row?.odenen ?? row?.alacak ?? 0);
  const remaining = Number(row?.kalan ?? row?.kalanTutar ?? Math.max(0, firstAmount - paid));
  return {
    ...row,
    id: row?.id,
    sourceId: row?.sourceId || row?.id,
    sourceType: row?.type || row?.sourceType || fallbackType,
    tarih: row?.tarih || row?.vade || row?.sonIslem || row?.paymentDate,
    kaynak: row?.kaynak || row?.islemTuru || fallbackType,
    belgeNo: row?.belgeNo || row?.cekNo || row?.documentNo || row?.kartAdi || "",
    aciklama: row?.aciklama || row?.description || row?.banka || "",
    ilkTutar: firstAmount,
    odenen: paid,
    kalan: remaining,
    vade: row?.vade || row?.dueDate || row?.sonIslem || "",
    durum: row?.durum || row?.status || (remaining > 0 ? "Açık" : "Tamamlandı"),
  };
}

export default function CekOdemeMerkeziPage({ activeMainCompany, refreshKey, reloadAll }) {
  const baseParams = useMemo(() => companyParams(activeMainCompany), [activeMainCompany]);
  const [firms, setFirms] = useState([]);
  const [selectedFirmId, setSelectedFirmId] = useState("");
  const [summary, setSummary] = useState(null);
  const [checks, setChecks] = useState([]);
  const [cards, setCards] = useState([]);
  const [cashRows, setCashRows] = useState([]);
  const [movements, setMovements] = useState([]);
  const [openDebts, setOpenDebts] = useState([]);
  const [activeTab, setActiveTab] = useState("debts");
  const [selectedItem, setSelectedItem] = useState(null);
  const [quickForm, setQuickForm] = useState(emptyQuickForm);
  const [rightForm, setRightForm] = useState(emptyQuickForm);
  const [transactionMode, setTransactionMode] = useState("linked");
  const [filters, setFilters] = useState({ search: "", status: "active", type: "", balance: "", asset: "" });
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);

  const selectedFirm = firms.find((firm) => String(firm.id || firm.firmaId) === String(selectedFirmId)) || null;

  const loadFirms = async () => {
    setLoadError(null);
    const rows = asArray(await getOdemeFirmalar({ ...baseParams, active: "all", limit: 500, _ts: Date.now() }));
    const normalizedRows = dedupeAndSortFirms(rows);
    setFirms(normalizedRows);
    setSelectedFirmId((current) => {
      const exists = normalizedRows.some((row) => String(row?.id || row?.firmaId) === String(current));
      return exists ? current : normalizedRows[0].id || normalizedRows[0].firmaId || "";
    });
  };

  const loadFirmDetail = async (firmId = selectedFirmId) => {
    if (!firmId) {
      setSummary(null);
      setChecks([]);
      setCards([]);
      setCashRows([]);
      setMovements([]);
      setOpenDebts([]);
      return;
    }
    const [nextSummary, nextChecks, nextCards, nextCashRows, nextMovements, nextOpenDebts] = await Promise.all([
      getOdemeFirmaOzet(firmId, baseParams),
      getOdemeFirmaCekler(firmId, baseParams),
      getOdemeFirmaKartlar(firmId, baseParams),
      getOdemeFirmaNakitHavale(firmId, baseParams),
      getOdemeFirmaHareketler(firmId, baseParams),
      getOdemeFirmaAcikBorclar(firmId, baseParams),
    ]);
    setSummary(nextSummary || null);
    setChecks(asArray(nextChecks).map((row) => normalizeRow(row, "CHECK")));
    setCards(asArray(nextCards).map((row) => normalizeRow(row, "CARD")));
    setCashRows(asArray(nextCashRows).map((row) => normalizeRow(row, "CASH")));
    setMovements(asArray(nextMovements).map((row) => normalizeRow(row, "CARI")));
    setOpenDebts(asArray(nextOpenDebts).map((row) => normalizeRow(row, "CARI")));
  };

  useEffect(() => {
    loadFirms().catch((err) => {
      setLoadError({
        endpoint: "GET /api/muhasebe/odeme/firmalar",
        message: err.message || "Bilinmeyen hata",
      });
    });
  }, [baseParams.mainCompanySlug, baseParams.mainCompanyId, refreshKey]);

  useEffect(() => {
    setSelectedItem(null);
    setRightForm(emptyQuickForm());
    setQuickForm((current) => ({ ...current, amount: "", paymentMethod: "" }));
    loadFirmDetail().catch((err) => setError(err.message || "Firma ödeme detayları yüklenemedi."));
  }, [selectedFirmId, refreshKey]);

  const visibleFirms = useMemo(() => {
    const term = filters.search.trim().toLocaleLowerCase("tr-TR");
    return firms.filter((firm) => {
      const haystack = [
        firmName(firm),
        firm.shortName,
        firm.kisaAd,
        firm.firmaKodu,
        firm.cariKodu,
        firm.taxNo,
        firm.vergiNo,
        firm.phone,
        firm.telefon,
        ...(Array.isArray(firm.cekNolari) ? firm.cekNolari : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      const balance = Number(firm.bakiye || firm.currentBalance || 0);
      const type = firmTypeLabel(firm.firmaTipi || firm.firmType || firm.cariTipi);
      const official = officialLabel(firm.resmiGayri || firm.officialType || firm.workType);
      const isActive = firm.isActive !== false && firm.aktif !== false && String(firm.status || "ACTIVE").toUpperCase() !== "PASSIVE";
      if (term && !haystack.includes(term)) return false;
      if (filters.status === "active" && !isActive) return false;
      if (filters.status === "passive" && isActive) return false;
      if (filters.type === "supplier" && !type.includes("Tedarikçi")) return false;
      if (filters.type === "customer" && !type.includes("Müşteri")) return false;
      if (filters.type === "unofficial" && official !== "Gayri Resmi") return false;
      if (filters.balance === "debit" && balance <= 0) return false;
      if (filters.balance === "credit" && balance >= 0) return false;
      const last = firm.sonHareketTarihi || firm.lastMovementDate;
      const lastDate = last ? new Date(last) : null;
      const recent30 =
        lastDate && !Number.isNaN(lastDate.getTime())
           ? Date.now() - lastDate.getTime() <= 30 * 24 * 60 * 60 * 1000
          : false;
      if (filters.asset === "checks" && Number(firm.openCheckCount || 0) <= 0) return false;
      if (filters.asset === "cards" && Number(firm.creditCardMovementCount || 0) <= 0) return false;
      if (filters.asset === "debts" && Number(firm.openDebtCount || 0) <= 0 && Number(firm.openDebtTotal || 0) <= 0) return false;
      if (filters.asset === "recent" && !recent30) return false;
      if (
        filters.asset === "empty" &&
        (Number(firm.openCheckCount || 0) ||
          Number(firm.creditCardMovementCount || 0) ||
          Number(firm.openDebtCount || 0) ||
          Math.abs(balance) ||
          recent30)
      )
        return false;
      return true;
    });
  }, [firms, filters]);

  const allRows = useMemo(() => {
    const source = [
      ...openDebts,
      ...checks,
      ...cards,
      ...cashRows,
      ...movements,
    ];
    const seen = new Set();
    return source.filter((row) => {
      const key = `${row?.sourceType}-${row?.sourceId}-${row?.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [openDebts, checks, cards, cashRows, movements]);

  const tabRows = useMemo(() => {
    if (activeTab === "all") return allRows;
    if (activeTab === "debts") return openDebts.filter((row) => Number(row?.kalan) > 0);
    if (activeTab === "checks") return checks;
    if (activeTab === "cards") return cards;
    if (activeTab === "cash") return cashRows;
    return allRows.filter((row) => Number(row?.kalan) <= 0 || String(row?.durum || "").toUpperCase().includes("PAID"));
  }, [activeTab, allRows, openDebts, checks, cards, cashRows]);

  const selectedTotal = Number(selectedItem?.kalan ?? selectedItem?.openAmount ?? 0);
  const rightAmount = num(rightForm.amount);
  const quickAmount = num(quickForm.amount);
  const remainingAfterRight = selectedItem ? Math.max(0, selectedTotal - rightAmount) : 0;
  const remainingAfterQuick = selectedItem ? Math.max(0, selectedTotal - quickAmount) : 0;

  const chooseItem = (row) => {
    const item = normalizeRow(row, row?.sourceType || row?.type || "CARI");
    const amount = Number(item?.kalan || item?.ilkTutar || 0);
    const next = { ...item, openAmount: amount };
    setSelectedItem(next);
    setRightForm((current) => ({ ...current, amount: amount ? String(amount) : "", paymentMethod: "" }));
    setQuickForm((current) => ({ ...current, amount: amount ? String(amount) : current?.amount }));
    setMessage("Bu kaleme ödeme yapılıyor.");
  };

  const refreshAll = async () => {
    await loadFirms();
    await loadFirmDetail(selectedFirmId);
    if (reloadAll) reloadAll();
  };

  const saveFirm = async () => {
    setBusy(true);
    setError("");
    try {
      await createOdemeFirma({ ...baseParams, ...modal.form });
      setModal(null);
      setMessage("Firma / cari kaydedildi.");
      await refreshAll();
    } catch (err) {
      setError(err.message || "Firma kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveCheck = async () => {
    setBusy(true);
    setError("");
    try {
      await createOdemeCek({ ...baseParams, ...modal.form, firmId: modal.form.firmId || selectedFirmId });
      setModal(null);
      setMessage("Çek kaydı eklendi.");
      await refreshAll();
    } catch (err) {
      setError(err.message || "Çek kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveCard = async () => {
    setBusy(true);
    setError("");
    try {
      await createOdemeKart({ ...baseParams, ...modal.form, firmId: modal.form.firmId || selectedFirmId });
      setModal(null);
      setMessage("Kredi kartı kaydı eklendi.");
      await refreshAll();
    } catch (err) {
      setError(err.message || "Kart kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveTransaction = async ({ form, requireSelectedItem }) => {
    setError("");
    setMessage("");
    if (!selectedFirmId) return setError("Firma seçimi zorunludur.");
    if (requireSelectedItem && !selectedItem) return setError("Ödeme kalemi seçimi zorunludur.");
    if (!form.transactionDirection) return setError("Önce Ödeme Yaptım veya Tahsilat Aldım seçin.");
    if (!form.paymentMethod) return setError("Ödeme şekli seçimi zorunludur.");
    const amount = num(form.amount);
    if (amount <= 0) return setError("Tutar 0'dan büyük olmalıdır.");
    if (selectedItem && amount > selectedTotal) {
      const confirmed = window.confirm("Ödeme tutarı açık bakiyeden büyük. Fazla ödeme/avans olarak kaydedilsin mi");
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      await saveOdemeIslem({
        ...baseParams,
        firmId: selectedFirmId,
        sourceType: selectedItem?.sourceType || "MANUAL",
        sourceId: selectedItem?.sourceId || "",
        openAmount: selectedItem ? selectedTotal : amount,
        transactionDirection: form.transactionDirection,
        paymentMethod: form.paymentMethod,
        methodSubType: form.methodSubType,
        paymentDate: form.paymentDate,
        amount,
        description: form.description,
        bankName: form.bankName,
        checkNo: form.checkNo,
        branchName: form.branchName,
        dueDate: form.dueDate,
        checkType: form.checkType,
        creditCardId: form.creditCardId,
        cardOwner: form.cardOwner,
        lastFourDigits: form.lastFourDigits,
        receiptNo: form.receiptNo,
        offsetAccount: form.offsetAccount,
        unofficialPerson: form.unofficialPerson,
        allowOverpay: Boolean(selectedItem && amount > selectedTotal),
      });
      setMessage(selectedItem && amount < selectedTotal ? "Kısmi ödeme kaydedildi; kalan tutar güncellendi." : "Ödeme kaydedildi; cari hareket oluşturuldu.");
      setQuickForm(emptyQuickForm());
      setRightForm(emptyQuickForm());
      setSelectedItem(null);
      await refreshAll();
    } catch (err) {
      setError(err.message || "Ödeme kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="co-page">
      <style>{styles}</style>

      {message ? <div className="co-alert ok">{message}</div> : null}
      {error ? <div className="co-alert err">{error}</div> : null}
      {loadError ? (
        <div className="co-alert err">
          <strong>Firma ödeme havuzu yüklenemedi.</strong>
          <span>Neden: {loadError.message}</span>
          <button type="button" onClick={loadFirms}>Retry</button>
          {import.meta.env.DEV ? <small>{loadError.endpoint}</small> : null}
        </div>
      ) : null}

      <div className="co-layout">
        <aside className="co-card co-left">
          <div className="co-title-row">
            <h3>Firma / Cari Havuzu</h3>
            <button type="button" onClick={() => setModal({ type: "firm", form: emptyFirmForm() })}>Yeni Firma / Cari Aç</button>
          </div>

          <input
            placeholder="Firma adı, çek no, telefon veya vergi no ara"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event?.target.value })}
          />

          <div className="co-filter-grid">
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event?.target.value })}>
              <option value="active">Tüm Aktif Firmalar</option>
              <option value="passive">Pasif Firmalar</option>
              <option value="all">Aktif + Pasif</option>
            </select>
            <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event?.target.value })}>
              <option value="">Tüm cari tipleri</option>
              <option value="supplier">Tedarikçi</option>
              <option value="customer">Müşteri</option>
              <option value="unofficial">Gayri Resmi</option>
            </select>
            <select value={filters.balance} onChange={(event) => setFilters({ ...filters, balance: event?.target.value })}>
              <option value="">Tüm bakiyeler</option>
              <option value="debit">Borçlu</option>
              <option value="credit">Alacaklı</option>
            </select>
            <select value={filters.asset} onChange={(event) => setFilters({ ...filters, asset: event?.target.value })}>
              <option value="">Tüm hareketler</option>
              <option value="checks">Açık çek olanlar</option>
              <option value="cards">Açık kart olanlar</option>
              <option value="debts">Açık borcu olanlar</option>
              <option value="recent">Son 30 Gün Hareketli</option>
              <option value="empty">Hareketi Olmayanlar</option>
            </select>
            <button type="button" onClick={() => setFilters({ search: "", status: "active", type: "", balance: "", asset: "" })}>Temizle</button>
          </div>

          <div className="co-firms">
            {visibleFirms.map((firm) => {
              const id = firm.id || firm.firmaId;
              const balance = Number(firm.bakiye || firm.currentBalance || 0);
              return (
                <button
                  key={id}
                  type="button"
                  className={`co-firm ${String(id) === String(selectedFirmId) ? "selected" : ""}`}
                  onClick={() => setSelectedFirmId(id)}
                >
                  <strong>{firmName(firm)}</strong>
                  <span>{firmTypeLabel(firm.firmaTipi || firm.firmType || firm.cariTipi)} · {officialLabel(firm.resmiGayri || firm.officialType || firm.workType)}</span>
                  <b>{balance >= 0 ? "Borç" : "Alacak"}: {money(Math.abs(balance))}</b>
                  <small>Çek: {firm.openCheckCount || 0} | Kart: {firm.creditCardMovementCount || 0} | Açık Borç: {firm.openDebtCount || 0}</small>
                  {Number(firm.duplicateCount || 1) > 1 ? <small>Mükerrer kart birleştirildi: {firm.duplicateCount}</small> : null}
                  <small>Son hareket: {shortDate(firm.sonHareketTarihi || firm.lastMovementDate)}</small>
                </button>
              );
            })}
            {!visibleFirms.length ? <div className="co-empty compact">Filtreye uygun firma bulunamadı.</div> : null}
          </div>

          <div className="co-mini-summary">
            <span>Cari bakiye</span><b>{money(summary?.guncelBakiye || selectedFirm?.bakiye || 0)}</b>
            <span>Açık çek</span><b>{summary?.openCheckCount || 0}</b>
            <span>Açık kart</span><b>{summary?.openCardCount || 0}</b>
            <span>Son hareket</span><b>{shortDate(summary?.lastMovementDate || summary?.sonIslemTarihi)}</b>
          </div>
        </aside>

        <main className="co-main">
          <section className="co-stats">
            <div><span>Seçili Firma Borcu</span><b>{money(summary?.guncelBakiye || 0)}</b></div>
            <div><span>Açık Çek Toplamı</span><b>{money(summary?.openCheckTotal || 0)}</b></div>
            <div><span>Seçilen Ödeme</span><b>{money(selectedItem ? selectedTotal : quickAmount)}</b></div>
            <div><span>Kalan Borç</span><b>{money(selectedItem ? remainingAfterQuick : Math.max(0, Number(summary?.guncelBakiye || 0) - quickAmount))}</b></div>
          </section>

          <section className="co-card co-quick">
            <div className="co-title-row">
              <div>
                <h3>Hızlı Ödeme / Tahsilat Girişi</h3>
                <small>{selectedFirm ? firmName(selectedFirm) : "Firma seçilmeden form pasiftir."}</small>
              </div>
              <button type="button" disabled={!selectedFirmId} onClick={() => setModal({ type: "check", form: emptyCheckForm(selectedFirmId) })}>Yeni Çek Ekle</button>
            </div>

            <div className="co-mode-tabs">
              <button type="button" className={transactionMode === "linked" ? "active" : ""} onClick={() => setTransactionMode("linked")}>
                Açık Borca / Açık Alacağa Bağlı İşlem
              </button>
              <button type="button" className={transactionMode === "independent" ? "active" : ""} onClick={() => { setTransactionMode("independent"); setSelectedItem(null); }}>
                Bağımsız Ödeme / Tahsilat
              </button>
            </div>
            {transactionMode === "linked" && !selectedItem ? (
              <div className="co-hint">Bağlı işlem için alttaki Açık Borçlar, Çekler veya Kredi Kartları sekmesinden satır seçin.</div>
            ) : null}

            <PaymentFormFields
              disabled={!selectedFirmId}
              form={quickForm}
              setForm={setQuickForm}
              cards={cards}
              selectedFirm={selectedFirm}
              selectedItem={selectedItem}
              compact={false}
            />
            <div className="co-actions">
              {selectedItem ? <strong>Bu kaleme ödeme yapılıyor: {selectedItem.belgeNo || selectedItem.kaynak} · {money(selectedTotal)}</strong> : <strong>Bağımsız ödeme/tahsilat girişi</strong>}
              <button
                type="button"
                className="primary"
                disabled={!selectedFirmId || !quickForm.transactionDirection || !quickForm.paymentMethod || num(quickForm.amount) <= 0 || busy || (transactionMode === "linked" && !selectedItem)}
                onClick={() => saveTransaction({ form: quickForm, requireSelectedItem: transactionMode === "linked" })}
              >
                {busy ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </section>

          <section className="co-card co-table-card">
            <div className="co-title-row">
              <div>
                <h3>Seçili Firmanın Tüm Hareketleri</h3>
                <small>{selectedFirm ? `${firmTypeLabel(selectedFirm.firmaTipi || selectedFirm.firmType)} · ${officialLabel(selectedFirm.resmiGayri || selectedFirm.officialType)}` : "Soldan firma seçin."}</small>
              </div>
              <button type="button" disabled={!selectedFirmId} onClick={() => setModal({ type: "card", form: emptyCardForm(selectedFirmId) })}>Yeni Kart Ekle</button>
            </div>

            <div className="co-tabs">
              {TAB_OPTIONS.map((tab) => (
                <button key={tab.key} type="button" className={activeTab === tab.key ? "active" : ""} onClick={() => setActiveTab(tab.key)}>
                  {tab.label}
                </button>
              ))}
            </div>

            <PaymentTable rows={tabRows} selectedItem={selectedItem} onSelect={chooseItem} />
          </section>
        </main>

        <aside className="co-card co-right">
          <h3>Ödeme İşlemi</h3>
          {!selectedFirmId ? (
            <div className="co-empty small">Soldan firma/cari seçin.</div>
          ) : !selectedItem ? (
            <div className="co-empty small">Ortadan açık borç, çek veya hareket seçin. İsterseniz üstteki hızlı formdan bağımsız ödeme girin.</div>
          ) : (
            <div className="co-side-flow">
              <Line label="Firma" value={firmName(selectedFirm)} />
              <Line label="Cari tipi" value={firmTypeLabel(selectedFirm?.firmaTipi || selectedFirm?.firmType)} />
              <Line label="Seçili belge/çek no" value={selectedItem.belgeNo || "-"} />
              <Line label="İlk tutar" value={money(selectedItem.ilkTutar)} />
              <Line label="Ödenen tutar" value={money(selectedItem.odenen)} />
              <Line label="Kalan tutar" value={money(selectedTotal)} />
              <Line label="Vade" value={shortDate(selectedItem.vade)} />
              <Line label="Cari bakiye" value={money(summary?.guncelBakiye || 0)} />
              <Line label="Durum" value={selectedItem.durum} />

              <PaymentFormFields
                disabled={false}
                form={rightForm}
                setForm={setRightForm}
                cards={cards}
                selectedFirm={selectedFirm}
                selectedItem={selectedItem}
                compact
              />

              <div className="co-calc">
                <span>Kalan: <b>{money(remainingAfterRight)}</b></span>
                {rightAmount > 0 && rightAmount < selectedTotal ? <strong>Kısmi Ödeme</strong> : null}
                {rightAmount > selectedTotal ? <strong>Fazla ödeme/avans</strong> : null}
              </div>

              <button
                type="button"
                className="co-save"
                disabled={busy || !rightForm.transactionDirection || !rightForm.paymentMethod || rightAmount <= 0}
                onClick={() => saveTransaction({ form: rightForm, requireSelectedItem: true })}
              >
                {busy ? "Kaydediliyor..." : "Ödemeyi Kaydet"}
              </button>
            </div>
          )}
        </aside>
      </div>

      {modal ? (
        <EditModal
          modal={modal}
          setModal={setModal}
          firms={firms}
          busy={busy}
          onSave={modal.type === "firm" ? saveFirm : modal.type === "check" ? saveCheck : saveCard}
        />
      ) : null}
    </div>
  );
}

function PaymentFormFields({ disabled, form, setForm, cards, selectedFirm, selectedItem, compact }) {
  const patch = (next) => setForm((current) => ({ ...current, ...next }));
  return (
    <div className={`co-form ${compact ? "compact" : ""} ${disabled ? "disabled" : ""}`}>
      {!compact ? (
        <>
          <label>
            Firma
            <input value={selectedFirm ? firmName(selectedFirm) : ""} disabled placeholder="Soldan firma seçin" />
          </label>
          <label>
            İşlem tarihi
            <input type="date" disabled={disabled} value={form.paymentDate} onChange={(event) => patch({ paymentDate: event?.target.value })} />
          </label>
          <div className="co-direction-picks">
            {DIRECTION_OPTIONS.map((item) => (
              <button
                key={item?.key}
                type="button"
                disabled={disabled}
                className={form.transactionDirection === item?.key ? "active" : ""}
                onClick={() => patch({ transactionDirection: item?.key, paymentMethod: "" })}
              >
                {item?.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <label>
          İşlem tarihi
          <input type="date" value={form.paymentDate} onChange={(event) => patch({ paymentDate: event?.target.value })} />
        </label>
      )}

      {compact ? (
        <div className="co-direction-picks">
          {DIRECTION_OPTIONS.map((item) => (
            <button
              key={item?.key}
              type="button"
              className={form.transactionDirection === item?.key ? "active" : ""}
              onClick={() => patch({ transactionDirection: item?.key, paymentMethod: "" })}
            >
              {item?.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="co-method-grid">
        {METHOD_OPTIONS.map((item) => (
          <button
            key={`${item?.key}-${item?.label}`}
            type="button"
            disabled={disabled || !form.transactionDirection}
            className={form.paymentMethod === item?.key && form.methodSubType === item?.subType ? "active" : ""}
            onClick={() => patch({ paymentMethod: item?.key, methodSubType: item?.subType || "" })}
          >
            {item?.label}
          </button>
        ))}
      </div>

      <label>
        Tutar
        <input disabled={disabled} value={form.amount} onChange={(event) => patch({ amount: event?.target.value })} placeholder="0,00" />
      </label>
      <label className="wide">
        Açıklama
        <textarea disabled={disabled} value={form.description} onChange={(event) => patch({ description: event?.target.value })} placeholder={selectedItem ? "Bu kaleme ödeme yapılıyor" : "Açıklama"} />
      </label>

      {form.paymentMethod === "CHECK" ? (
        <>
          <label>Çek No<input disabled={disabled} value={form.checkNo} onChange={(event) => patch({ checkNo: event?.target.value })} /></label>
          <label>Banka<input disabled={disabled} value={form.bankName} onChange={(event) => patch({ bankName: event?.target.value })} /></label>
          <label>Şube<input disabled={disabled} value={form.branchName} onChange={(event) => patch({ branchName: event?.target.value })} /></label>
          <label>Vade<input disabled={disabled} type="date" value={form.dueDate} onChange={(event) => patch({ dueDate: event?.target.value })} /></label>
        </>
      ) : null}

      {form.paymentMethod === "CARD" ? (
        <>
          <label>
            Kayıtlı kart
            <select disabled={disabled} value={form.creditCardId} onChange={(event) => patch({ creditCardId: event?.target.value })}>
              <option value="">Kart seç</option>
              {cards.map((card) => <option key={card.id} value={card.id}>{card.kartAdi || "Kart"} {card.son4Hane ? `****${card.son4Hane}` : ""}</option>)}
            </select>
          </label>
          <label>Kart sahibi firma<input disabled value={selectedFirm ? firmName(selectedFirm) : ""} /></label>
          <label>Banka<input disabled={disabled} value={form.bankName} onChange={(event) => patch({ bankName: event?.target.value })} /></label>
          <label>Son 4 hane<input disabled={disabled} maxLength="4" value={form.lastFourDigits} onChange={(event) => patch({ lastFourDigits: event?.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
        </>
      ) : null}

      {form.paymentMethod === "TRANSFER" ? (
        <>
          <label>Banka hesabı<input disabled={disabled} value={form.bankName} onChange={(event) => patch({ bankName: event?.target.value })} /></label>
          <label>Dekont no<input disabled={disabled} value={form.receiptNo} onChange={(event) => patch({ receiptNo: event?.target.value })} /></label>
          {form.methodSubType === "OFFSET" ? <label className="wide">Mahsup yapılacak cari veya hesap<input disabled={disabled} value={form.offsetAccount} onChange={(event) => patch({ offsetAccount: event?.target.value })} /></label> : null}
        </>
      ) : null}

      {form.paymentMethod === "CASH" && form.methodSubType === "UNOFFICIAL" ? (
        <>
          <label>Ödeyen/alan kişi<input disabled={disabled} value={form.unofficialPerson} onChange={(event) => patch({ unofficialPerson: event?.target.value })} /></label>
          <label>İşlem tipi<input disabled value="Gayri Resmi" /></label>
        </>
      ) : null}
    </div>
  );
}

function PaymentTable({ rows, selectedItem, onSelect }) {
  if (!rows.length) return <div className="co-empty small">Bu sekmede kayıt yok.</div>;
  return (
    <div className="co-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tarih</th>
            <th>İşlem Türü</th>
            <th>Yön</th>
            <th>Belge / Çek No</th>
            <th>Açıklama</th>
            <th>Borç</th>
            <th>Alacak</th>
            <th>Kalan</th>
            <th>Durum</th>
            <th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = selectedItem?.sourceId === row?.sourceId && selectedItem?.sourceType === row?.sourceType;
            const debt = row.sourceType === "CASH" ? 0 : Number(row?.ilkTutar || row?.borc || 0);
            const credit = Number(row?.odenen || row?.alacak || 0);
            return (
              <tr key={`${row?.sourceType}-${row?.sourceId}-${row?.id}`} className={selected ? "selected" : ""} onClick={() => onSelect(row)}>
                <td>{shortDate(row?.tarih)}</td>
                <td>{row?.kaynak}</td>
                <td>{row.sourceType === "CHECK" ? "Çek" : row.sourceType === "CARD" ? "Kart" : "Cari"}</td>
                <td>{row?.belgeNo || "-"}</td>
                <td>{row?.aciklama || "-"}</td>
                <td>{money(debt)}</td>
                <td>{money(credit)}</td>
                <td>{money(row?.kalan)}</td>
                <td><Badge tone={statusTone(row?.durum)}>{row?.durum}</Badge></td>
                <td>
                  <button type="button" onClick={(event) => { event?.stopPropagation(); onSelect(row); }}>Öde</button>
                  <button type="button" onClick={(event) => event?.stopPropagation()}>Yazdır</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ children, tone = "gray" }) {
  return <span className={`co-badge ${tone}`}>{children || "-"}</span>;
}

function Line({ label, value }) {
  return <div className="co-line"><span>{label}</span><b>{value || "-"}</b></div>;
}

function EditModal({ modal, setModal, firms, busy, onSave }) {
  const form = modal.form;
  const update = (patch) => setModal({ ...modal, form: { ...form, ...patch } });
  return (
    <div className="co-modal-back">
      <div className="co-modal">
        <h3>{modal.type === "firm" ? "Yeni Firma / Cari Aç" : modal.type === "check" ? "Yeni Çek Ekle" : "Yeni Kart Ekle"}</h3>
        {modal.type === "firm" ? (
          <div className="co-form modal-form">
            <label>Firma / Cari Adı<input value={form.name} onChange={(event) => update({ name: event?.target.value })} /></label>
            <label>Cari Tipi<select value={form.firmType} onChange={(event) => update({ firmType: event?.target.value })}><option value="SUPPLIER">Tedarikçi</option><option value="CUSTOMER">Müşteri</option><option value="BOTH">Gayri Resmi</option></select></label>
            <label>Resmiyet<select value={form.workType} onChange={(event) => update({ workType: event?.target.value })}><option value="OFFICIAL">Resmi</option><option value="UNOFFICIAL">Gayri Resmi</option></select></label>
            <label>Vergi No / TCKN<input value={form.taxNo} onChange={(event) => update({ taxNo: event?.target.value })} /></label>
            <label>Telefon<input value={form.phone} onChange={(event) => update({ phone: event?.target.value })} /></label>
            <label>E-posta<input value={form.email} onChange={(event) => update({ email: event?.target.value })} /></label>
            <label>Açılış bakiyesi<input value={form.openingBalance} onChange={(event) => update({ openingBalance: event?.target.value })} /></label>
            <label>Açılış yönü<select value={form.openingBalanceDirection} onChange={(event) => update({ openingBalanceDirection: event?.target.value })}><option value="BORC">Borç</option><option value="ALACAK">Alacak</option></select></label>
            <label className="wide">Açıklama / Not<textarea value={form.note} onChange={(event) => update({ note: event?.target.value })} /></label>
          </div>
        ) : (
          <div className="co-form modal-form">
            <label>
              Firma
              <select value={form.firmId} onChange={(event) => update({ firmId: event?.target.value })}>
                {firms.map((firm) => <option key={firm.id || firm.firmaId} value={firm.id || firm.firmaId}>{firmName(firm)}</option>)}
              </select>
            </label>
            {modal.type === "check" ? (
              <>
                <label>Çek Türü<select value={form.checkType} onChange={(event) => update({ checkType: event?.target.value })}><option value="MUSTERIDEN_ALINAN">Müşteriden Alınan</option><option value="TEDARIKCIYE_VERILEN">Tedarikçiye Verilen</option></select></label>
                <label>Çek No<input value={form.checkNo} onChange={(event) => update({ checkNo: event?.target.value })} /></label>
                <label>Banka<input value={form.bankName} onChange={(event) => update({ bankName: event?.target.value })} /></label>
                <label>Şube<input value={form.branchName} onChange={(event) => update({ branchName: event?.target.value })} /></label>
                <label>Vade<input type="date" value={form.dueDate} onChange={(event) => update({ dueDate: event?.target.value })} /></label>
                <label>Tutar<input value={form.amount} onChange={(event) => update({ amount: event?.target.value })} /></label>
              </>
            ) : (
              <>
                <label>Kart Adı<input value={form.cardName} onChange={(event) => update({ cardName: event?.target.value })} /></label>
                <label>Banka<input value={form.bankName} onChange={(event) => update({ bankName: event?.target.value })} /></label>
                <label>Son 4 Hane<input maxLength="4" value={form.lastFourDigits} onChange={(event) => update({ lastFourDigits: event?.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
                <label>Açık Tutar<input value={form.totalDebt} onChange={(event) => update({ totalDebt: event?.target.value })} /></label>
              </>
            )}
            <label className="wide">Açıklama<textarea value={form.description || form.note || ""} onChange={(event) => update(modal.type === "check" ? { description: event?.target.value } : { note: event?.target.value })} /></label>
          </div>
        )}
        <div className="co-modal-actions">
          <button onClick={() => setModal(null)} type="button">Kapat</button>
          <button onClick={onSave} disabled={busy} type="button">{busy ? "Kaydediliyor..." : "Kaydet"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = `
.co-page{display:grid;gap:10px;color:#132238}.co-layout{display:grid;grid-template-columns:290px minmax(650px,1fr) 330px;gap:10px;align-items:start}.co-main{display:grid;gap:10px;min-width:0}.co-card{background:#fff;border:1px solid #d9e5f3;border-radius:8px;padding:10px;min-width:0}.co-title-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.co-title-row h3,.co-right h3{margin:0;font-size:14px}.co-title-row small{display:block;margin-top:3px;color:#6a7b91;font-weight:800}.co-title-row button,.co-filter-grid button,.co-actions button,.co-table-wrap button,.co-method-grid button,.co-direction-picks button,.co-mode-tabs button,.co-modal-actions button{border:1px solid #bdd5fb;background:#fff;color:#1768e8;border-radius:7px;padding:7px 9px;font-weight:900;cursor:pointer}.co-title-row button:disabled,.co-actions button:disabled,.co-method-grid button:disabled,.co-direction-picks button:disabled{opacity:.55;cursor:not-allowed}.co-title-row button,.co-table-wrap button{font-size:11px}.co-left input,.co-left select,.co-form input,.co-form select,.co-form textarea{width:100%;border:1px solid #cad9ea;border-radius:7px;padding:8px;background:#fff;color:#17263a;min-width:0}.co-filter-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}.co-filter-grid select:nth-child(3){grid-column:1/-1}.co-firms{max-height:590px;overflow:auto;display:grid;gap:7px;padding-right:2px}.co-firm{text-align:left;border:1px solid #dce7f3;background:#fff;border-radius:8px;padding:9px;display:grid;gap:4px;cursor:pointer;color:#132238}.co-firm:hover{border-color:#8bb7fb;background:#f8fbff}.co-firm.selected{border:2px solid #1768e8;background:#eef5ff}.co-firm span,.co-firm small{color:#6a7b91;line-height:1.35}.co-firm b{color:#132238}.co-mini-summary{display:grid;grid-template-columns:1fr auto;gap:5px;margin-top:8px;border:1px dashed #a9c6ef;background:#f6faff;border-radius:8px;padding:8px}.co-mini-summary span{color:#6a7b91}.co-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.co-stats div{border:1px solid #d9e5f3;background:#f9fbfe;border-radius:8px;padding:9px}.co-stats span{display:block;color:#6a7b91;font-size:11px;font-weight:900}.co-stats b{display:block;margin-top:4px;font-size:16px;color:#0a4eaa}.co-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.co-form.compact{grid-template-columns:1fr}.co-form.disabled{opacity:.76}.co-form label{display:grid;gap:4px;font-size:11px;font-weight:900;color:#52667d}.co-form label.wide,.co-method-grid,.co-direction-picks{grid-column:1/-1}.co-form textarea{min-height:64px;resize:vertical}.co-mode-tabs,.co-direction-picks{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}.co-mode-tabs button.active,.co-direction-picks button.active{background:#1768e8;border-color:#1768e8;color:#fff}.co-hint{border:1px dashed #9bbff6;background:#f5f9ff;color:#38516d;border-radius:8px;padding:8px;margin-bottom:8px;font-weight:800}.co-method-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.co-method-grid button{min-height:38px;color:#415b78}.co-method-grid button.active{background:#1768e8;border-color:#1768e8;color:white}.co-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;padding-top:8px;border-top:1px solid #d9e5f3}.co-actions strong{font-size:12px;color:#38516d}.co-actions .primary,.co-save{background:#159957!important;border-color:#159957!important;color:#fff!important}.co-tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #d9e5f3;padding-bottom:8px;margin-bottom:8px}.co-tabs button{border:1px solid #d5e2f1;background:#fff;border-radius:7px;padding:7px 10px;font-weight:900;color:#52718f;cursor:pointer}.co-tabs button.active{background:#e9f2ff;color:#1768e8;border-color:#92baf3}.co-table-wrap{overflow:auto;border:1px solid #e1eaf6;border-radius:8px}.co-table-wrap table{width:100%;border-collapse:collapse;min-width:980px}.co-table-wrap th{background:#eff5fc;color:#52667d;font-size:11px;text-align:left;padding:8px 7px;white-space:nowrap}.co-table-wrap td{padding:8px 7px;border-bottom:1px solid #e5edf6;vertical-align:middle;white-space:nowrap}.co-table-wrap tbody tr{cursor:pointer}.co-table-wrap tbody tr:hover,.co-table-wrap tr.selected{background:#eef5ff}.co-table-wrap td:nth-child(5){white-space:normal;min-width:180px}.co-table-wrap td:last-child{display:flex;gap:5px}.co-badge{font-size:10px;padding:3px 7px;border-radius:999px;font-weight:900;display:inline-flex}.co-badge.green{background:#dcf7e7;color:#12713f}.co-badge.orange{background:#ffedd8;color:#a95600}.co-badge.red{background:#ffe0e2;color:#b92932}.co-badge.gray{background:#edf1f5;color:#59697c}.co-line{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #e5edf6;padding:7px 0}.co-line span{color:#6a7b91}.co-line b{text-align:right}.co-side-flow{display:grid;gap:8px}.co-calc{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #d9e5f3;background:#f9fbfe;border-radius:8px;padding:8px;color:#52667d}.co-calc strong{color:#a95600}.co-save{border:1px solid #159957;border-radius:8px;padding:10px 12px;font-weight:900;cursor:pointer}.co-save:disabled{opacity:.55;cursor:not-allowed}.co-empty{display:grid;place-items:center;min-height:220px;color:#6a7b91;border:1px dashed #cad9ea;border-radius:8px;background:#f8fbff;text-align:center;padding:18px;font-weight:800;line-height:1.4}.co-empty.small{min-height:90px}.co-empty.compact{min-height:70px}.co-alert{border-radius:8px;padding:9px 11px;font-weight:900;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.co-alert span,.co-alert small{font-weight:800}.co-alert button{border:1px solid currentColor;background:white;border-radius:7px;padding:5px 8px;font-weight:900}.co-alert.ok{border:1px solid #bce9cf;background:#e9f9f0;color:#12713f}.co-alert.err{border:1px solid #f1c5c8;background:#fff0f1;color:#b92932}.co-modal-back{position:fixed;inset:0;background:rgba(7,26,51,.42);display:grid;place-items:center;z-index:1000;padding:20px}.co-modal{width:min(760px,100%);background:#fff;border-radius:8px;border:1px solid #d9e5f3;padding:14px;box-shadow:0 24px 70px rgba(7,26,51,.28)}.co-modal h3{margin:0 0 12px}.co-form.modal-form{grid-template-columns:repeat(2,minmax(0,1fr))}.co-modal textarea{min-height:70px}.co-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.co-modal-actions button:last-child{background:#1768e8;color:#fff;border-color:#1768e8}@media(max-width:1380px){.co-layout{grid-template-columns:1fr}.co-firms{max-height:300px}.co-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.co-method-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.co-stats,.co-form,.co-form.modal-form,.co-method-grid,.co-mode-tabs,.co-direction-picks{grid-template-columns:1fr}.co-actions{align-items:stretch;flex-direction:column}.co-filter-grid{grid-template-columns:1fr}}
`;
