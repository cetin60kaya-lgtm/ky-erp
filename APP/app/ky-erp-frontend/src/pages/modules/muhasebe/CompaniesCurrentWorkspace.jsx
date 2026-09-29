import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CircleAlert,
  CirclePlus,
  Landmark,
  Pencil,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../../utils/api";
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
import CompanyFibeSection from "./CompanyFibeSection";
import "./companiesCurrentWorkspace.css";

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const listOf = (payload) => {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
};
const objectOf = (payload) => {
  const value = unwrap(payload);
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};
const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  });
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toLocaleDateString("tr-TR");
};
const normalize = (value) => String(value || "").trim().toLocaleUpperCase("tr-TR");
const validEmail = (value) => !String(value || "").trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

function roleLabel(row) {
  const value = normalize(`${row.type || ""} ${row.companyType || ""}`);
  if (/BOTH|CUSTOMER.*SUPPLIER|SUPPLIER.*CUSTOMER|HER IKISI/.test(value)) return "Müşteri ve tedarikçi";
  if (/SUPPLIER|TEDARIK|SATICI|VENDOR/.test(value)) return "Tedarikçi";
  return "Müşteri";
}

function cariLabel(row) {
  if (row.supplierDebtTracking && row.customerReceivableTracking) return "Borç + alacak takipli";
  if (row.supplierDebtTracking) return "Tedarikçi borcu takipli";
  if (row.customerReceivableTracking) return "Müşteri alacağı takipli";
  return "Peşin / cari takip yok";
}

function recordLabel(row) {
  return normalize(row.defaultRecordType).includes("GAYRI") ? "Gayri resmî" : "Resmî";
}

function movementTypeLabel(value) {
  const key = normalize(value);
  if (/TAHSIL/.test(key)) return "Tahsilat";
  if (/ODEME/.test(key)) return "Ödeme";
  if (/FATURA/.test(key)) return "Fatura";
  if (/BORC/.test(key)) return "Borç";
  if (/ALACAK/.test(key)) return "Alacak";
  return value || "Cari işlem";
}

function emptyTransaction() {
  return {
    requestId: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    transactionType: "DEBIT",
    amount: "",
    recordType: "RESMI",
    description: "",
  };
}

function emptyCompany() {
  return {
    companyName: "",
    companyType: "SUPPLIER",
    defaultRecordType: "RESMI",
    paymentMode: "CASH",
    supplierDebtTracking: false,
    customerReceivableTracking: false,
    vatTrackingEnabled: true,
    expenseCategory: "",
    taxNo: "",
    taxOffice: "",
    phone: "",
    email: "",
    address: "",
    note: "",
  };
}

function profileDraftOf(firm = {}) {
  const companyType = normalize(firm.companyType || firm.type) === "BOTH"
    ? "BOTH"
    : /CUSTOMER|MUSTERI|MÜŞTERİ/.test(normalize(firm.companyType || firm.type))
      ? "CUSTOMER"
      : "SUPPLIER";
  const defaultRecordType = normalize(firm.defaultRecordType).includes("GAYRI") ? "GAYRI_RESMI" : "RESMI";
  return {
    companyType,
    paymentMode: normalize(firm.paymentMode) === "CREDIT" ? "CREDIT" : "CASH",
    supplierDebtTracking: Boolean(firm.supplierDebtTracking),
    customerReceivableTracking: Boolean(firm.customerReceivableTracking),
    vatTrackingEnabled: defaultRecordType === "RESMI" && firm.vatTrackingEnabled !== false,
    expenseCategory: firm.expenseCategory || "",
    defaultRecordType,
    phone: firm.phone || "",
    email: firm.email || "",
    address: firm.address || "",
    note: firm.note || "",
  };
}

function CompanyFormFields({ value, onChange }) {
  const change = (key, next) => onChange((current) => ({ ...current, [key]: next }));
  return (
    <>
      <div className="ccw-form-grid">
        <label>Firma adı<input value={value.companyName} onChange={(event) => change("companyName", event.target.value)} placeholder="Firma adı" /></label>
        <label>Firma türü
          <select value={value.companyType} onChange={(event) => onChange((current) => ({
            ...current,
            companyType: event.target.value,
            paymentMode: event.target.value === "CUSTOMER" ? "CASH" : current.paymentMode,
            supplierDebtTracking: event.target.value === "CUSTOMER" ? false : current.supplierDebtTracking,
            customerReceivableTracking: event.target.value === "SUPPLIER" ? false : current.customerReceivableTracking,
          }))}>
            <option value="CUSTOMER">Müşteri</option>
            <option value="SUPPLIER">Tedarikçi</option>
            <option value="BOTH">Müşteri ve tedarikçi</option>
          </select>
        </label>
        <label>Varsayılan kayıt
          <select value={value.defaultRecordType} onChange={(event) => onChange((current) => ({ ...current, defaultRecordType: event.target.value, vatTrackingEnabled: event.target.value === "RESMI" ? current.vatTrackingEnabled : false }))}>
            <option value="RESMI">Resmî</option>
            <option value="GAYRI_RESMI">Gayri resmî</option>
          </select>
        </label>
        <label>Alış / ödeme düzeni
          <select value={value.paymentMode} disabled={value.companyType === "CUSTOMER"} onChange={(event) => onChange((current) => ({ ...current, paymentMode: event.target.value, supplierDebtTracking: event.target.value === "CREDIT" ? current.supplierDebtTracking : false }))}>
            <option value="CASH">Peşin — cari borç yok</option>
            <option value="CREDIT">Vadeli / cari</option>
          </select>
        </label>
        <label>Vergi no<input value={value.taxNo} onChange={(event) => change("taxNo", event.target.value)} /></label>
        <label>Vergi dairesi<input value={value.taxOffice} onChange={(event) => change("taxOffice", event.target.value)} /></label>
        <label>Telefon<input value={value.phone} onChange={(event) => change("phone", event.target.value)} /></label>
        <label>E-posta<input type="email" value={value.email} onChange={(event) => change("email", event.target.value)} /></label>
        <label>Gider kategorisi<input value={value.expenseCategory} onChange={(event) => change("expenseCategory", event.target.value)} placeholder="Kimyasal, enerji, gıda..." /></label>
        <label>Adres<input value={value.address} onChange={(event) => change("address", event.target.value)} /></label>
        <label className="wide">Not<input value={value.note} onChange={(event) => change("note", event.target.value)} /></label>
      </div>
      <div className="ccw-check-row">
        {value.companyType !== "CUSTOMER" ? (
          <label><input type="checkbox" checked={value.supplierDebtTracking && value.paymentMode === "CREDIT"} disabled={value.paymentMode !== "CREDIT"} onChange={(event) => change("supplierDebtTracking", event.target.checked)} /> Tedarikçi borcunu caride takip et</label>
        ) : null}
        {value.companyType !== "SUPPLIER" ? (
          <label><input type="checkbox" checked={value.customerReceivableTracking} onChange={(event) => change("customerReceivableTracking", event.target.checked)} /> Müşteri alacağını caride takip et</label>
        ) : null}
        <label><input type="checkbox" checked={value.vatTrackingEnabled && value.defaultRecordType === "RESMI"} disabled={value.defaultRecordType !== "RESMI"} onChange={(event) => change("vatTrackingEnabled", event.target.checked)} /> Resmî belgede KDV takibi</label>
      </div>
    </>
  );
}

export default function CompaniesCurrentWorkspace({ activeMainCompany, refreshKey = 0, reloadAll, goTab }) {
  const [firms, setFirms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [balanceFilter, setBalanceFilter] = useState("ALL");
  const [recordFilter, setRecordFilter] = useState("ALL");
  const [balanceSort, setBalanceSort] = useState("NAME");
  const [selected, setSelected] = useState(null);
  const [movementFilter, setMovementFilter] = useState("ALL");
  const [movements, setMovements] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [transaction, setTransaction] = useState(emptyTransaction);
  const [editOpen, setEditOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState(profileDraftOf());
  const [aliases, setAliases] = useState([]);
  const [aliasInput, setAliasInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [companyFormOpen, setCompanyFormOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState(emptyCompany);
  const [companySaving, setCompanySaving] = useState(false);
  const detailRequest = useRef(0);
  const listRequest = useRef(0);
  const transactionPending = useRef(false);

  useEffect(() => () => {
    detailRequest.current += 1;
    listRequest.current += 1;
  }, []);

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug],
  );

  const loadFirms = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setError("");
    try {
      const result = await loadModuleData({
        scope: `muhasebe:${params.mainCompanySlug || params.mainCompanyId || "main"}:firmalar:${query}`,
        sources: {
          firms: {
            critical: true,
            load: () => apiGet("/muhasebe/firmalar", { ...params, search: query, limit: 10000, _ts: Date.now() }),
          },
          profiles: {
            fallback: [],
            load: () => apiGet("/muhasebe/firma-profilleri", { ...params, _ts: Date.now() }),
          },
        },
      });
      if (request !== listRequest.current) return [];
      const profiles = new Map(listOf(result.data.profiles).map((item) => [String(item.id), item]));
      const rows = result.states.firms.status === "error"
        ? []
        : listOf(result.data.firms).map((firm) => ({ ...firm, ...(profiles.get(String(firm.id)) || {}) }));
      setFirms(rows);
      setError(moduleLoadMessage(
        result,
        "Firma ve cari ana listesi alınamadı; ekrandaki son başarılı veri korunuyor.",
        "Firma profilleri geçici olarak yenilenemedi; firma ve cari listesi kullanılabilir.",
      ));
      return rows;
    } catch (requestError) {
      if (request !== listRequest.current) return [];
      setFirms([]);
      setError(requestError?.message || "Firma ve cari listesi alınamadı.");
      return [];
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [params, query]);

  useEffect(() => {
    const timer = window.setTimeout(loadFirms, 160);
    return () => window.clearTimeout(timer);
  }, [loadFirms, refreshKey]);

  const visibleFirms = useMemo(() => {
    const rows = firms.filter((firm) => {
      const firmRole = roleLabel(firm);
      const balance = Number(firm.currentBalance || 0);
      const record = normalize(firm.defaultRecordType);
      if (role === "CUSTOMER" && !/Müşteri/.test(firmRole)) return false;
      if (role === "SUPPLIER" && !/tedarikçi/i.test(firmRole)) return false;
      if (role === "CHEMICAL" && !firm.isChemicalSupplier) return false;
      if (balanceFilter === "RECEIVABLE" && balance <= 0) return false;
      if (balanceFilter === "PAYABLE" && balance >= 0) return false;
      if (balanceFilter === "NONZERO" && balance === 0) return false;
      if (balanceFilter === "ZERO" && balance !== 0) return false;
      if (recordFilter === "OFFICIAL" && record.includes("GAYRI")) return false;
      if (recordFilter === "UNOFFICIAL" && !record.includes("GAYRI")) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const av = Number(a.currentBalance || 0);
      const bv = Number(b.currentBalance || 0);
      if (balanceSort === "BALANCE_DESC") return bv - av;
      if (balanceSort === "BALANCE_ASC") return av - bv;
      if (balanceSort === "LAST_MOVEMENT_DESC") {
        const at = Date.parse(a.lastMovementAt || "") || 0;
        const bt = Date.parse(b.lastMovementAt || "") || 0;
        if (at !== bt) return bt - at;
      }
      return String(a.firmaAdi || a.companyName || a.name || "").localeCompare(String(b.firmaAdi || b.companyName || b.name || ""), "tr");
    });
  }, [balanceFilter, balanceSort, firms, recordFilter, role]);

  const totals = useMemo(() => {
    const receivable = visibleFirms.filter((firm) => Number(firm.currentBalance || 0) > 0).reduce((sum, firm) => sum + Number(firm.currentBalance || 0), 0);
    const payable = visibleFirms.filter((firm) => Number(firm.currentBalance || 0) < 0).reduce((sum, firm) => sum + Math.abs(Number(firm.currentBalance || 0)), 0);
    return { receivable, payable, balance: receivable - payable };
  }, [visibleFirms]);

  const loadMovements = useCallback(async (firm) => {
    if (!firm?.id) return;
    const request = ++detailRequest.current;
    setSelected(firm);
    setMovementFilter("ALL");
    setDetailLoading(true);
    setMovements([]);
    setAliases([]);
    setNotice("");
    setTransactionOpen(false);
    try {
      const result = await loadModuleData({
        scope: `muhasebe:${params.mainCompanySlug || params.mainCompanyId || "main"}:firma:${firm.id}`,
        sources: {
          movements: {
            critical: true,
            load: () => apiGet("/muhasebe/cari-hareketler", { ...params, companyId: firm.id, limit: 500, _ts: Date.now() }),
          },
          profile: {
            fallback: {},
            load: () => apiGet(`/muhasebe/firma-profilleri/${firm.id}`, { ...params, _ts: Date.now() }),
          },
        },
      });
      if (request !== detailRequest.current) return;
      const profile = objectOf(result.data.profile);
      const merged = { ...firm, ...profile };
      setSelected(merged);
      setProfileDraft(profileDraftOf(merged));
      setAliases(Array.isArray(profile.aliases) ? profile.aliases : []);
      if (result.states.movements.status !== "error") setMovements(listOf(result.data.movements));
      setNotice(moduleLoadMessage(
        result,
        "Cari hareketler alınamadı; varsa son başarılı detay korunuyor.",
        "Firma profilinin bazı yardımcı bilgileri yenilenemedi; cari hareketler kullanılabilir.",
      ));
    } catch (requestError) {
      if (request !== detailRequest.current) return;
      setProfileDraft(profileDraftOf(firm));
      setNotice(requestError?.message || "Firma detayları alınamadı.");
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }, [params]);

  useEffect(() => {
    if (!visibleFirms.length || detailLoading) return;
    const stillVisible = selected && visibleFirms.some((firm) => String(firm.id) === String(selected.id));
    if (!stillVisible) loadMovements(visibleFirms[0]);
  }, [detailLoading, loadMovements, selected, visibleFirms]);

  const createCompany = async () => {
    if (!companyForm.companyName.trim()) return setError("Firma adı zorunludur.");
    if (!validEmail(companyForm.email)) return setError("Geçerli bir firma e-posta adresi girin.");
    setCompanySaving(true);
    setError("");
    try {
      const createdPayload = await apiPost("/muhasebe/firmalar", {
        ...params,
        ...companyForm,
        supplierDebtTracking: companyForm.companyType !== "CUSTOMER" && companyForm.paymentMode === "CREDIT" && companyForm.supplierDebtTracking,
        customerReceivableTracking: companyForm.companyType !== "SUPPLIER" && companyForm.customerReceivableTracking,
        vatTrackingEnabled: companyForm.defaultRecordType === "RESMI" && companyForm.vatTrackingEnabled,
      });
      const created = objectOf(createdPayload);
      setCompanyForm(emptyCompany());
      setCompanyFormOpen(false);
      const rows = await loadFirms();
      const next = rows.find((row) => String(row.id) === String(created?.id));
      if (next) await loadMovements(next);
      reloadAll?.();
    } catch (requestError) {
      setError(requestError?.message || "Firma kartı oluşturulamadı.");
    } finally {
      setCompanySaving(false);
    }
  };

  const saveProfile = async () => {
    if (!selected?.id) return;
    if (!validEmail(profileDraft.email)) return setNotice("Geçerli bir firma e-posta adresi girin.");
    setProfileSaving(true);
    setNotice("");
    try {
      const payload = await apiPatch(`/muhasebe/firma-profilleri/${selected.id}`, {
        ...params,
        ...profileDraft,
        supplierDebtTracking: profileDraft.companyType !== "CUSTOMER" && profileDraft.paymentMode === "CREDIT" && profileDraft.supplierDebtTracking,
        customerReceivableTracking: profileDraft.companyType !== "SUPPLIER" && profileDraft.customerReceivableTracking,
        vatTrackingEnabled: profileDraft.defaultRecordType === "RESMI" && profileDraft.vatTrackingEnabled,
      });
      const profile = objectOf(payload);
      setSelected((current) => ({ ...current, ...profile }));
      setProfileDraft(profileDraftOf(profile));
      setNotice("Firma kartı, iletişim ve muhasebe tanımı kaydedildi.");
      await loadFirms();
      reloadAll?.();
    } catch (requestError) {
      setNotice(requestError?.message || "Firma tanımı kaydedilemedi.");
    } finally {
      setProfileSaving(false);
    }
  };

  const addAlias = async () => {
    const rawName = aliasInput.trim();
    if (!selected?.id || !rawName) return;
    setProfileSaving(true);
    setNotice("");
    try {
      const payload = await apiPost(`/muhasebe/firma-profilleri/${selected.id}/aliases`, { ...params, rawName });
      const data = objectOf(payload);
      setAliases(Array.isArray(data.aliases) ? data.aliases : []);
      setAliasInput("");
      setNotice(data.matchedDocuments ? `${data.matchedDocuments} bekleyen belge bu alias ile firmaya eşleştirildi.` : "Firma aliası kaydedildi.");
      await loadFirms();
    } catch (requestError) {
      setNotice(requestError?.message || "Firma aliası kaydedilemedi.");
    } finally {
      setProfileSaving(false);
    }
  };

  const removeAlias = async (aliasId) => {
    if (!selected?.id || !aliasId) return;
    setProfileSaving(true);
    try {
      const payload = await apiDelete(`/muhasebe/firma-profilleri/${selected.id}/aliases/${aliasId}`, params);
      setAliases(listOf(payload));
      setNotice("Alias kaldırıldı.");
      await loadFirms();
    } catch (requestError) {
      setNotice(requestError?.message || "Alias kaldırılamadı.");
    } finally {
      setProfileSaving(false);
    }
  };

  const saveTransaction = async () => {
    if (transactionPending.current) return;
    if (!selected?.id || Number(transaction.amount || 0) <= 0) return setNotice("Sıfırdan büyük işlem tutarı zorunludur.");
    if (!selected.supplierDebtTracking && !selected.customerReceivableTracking) return setNotice("Bu firma peşin/cari takipsiz tanımlı. Cari hareket oluşturulmaz.");
    transactionPending.current = true;
    setSaving(true);
    setNotice("");
    try {
      await apiPost("/muhasebe/cari-hareketler", {
        ...params,
        companyId: selected.id,
        requestId: transaction.requestId,
        date: transaction.date,
        transactionType: transaction.transactionType,
        amount: Number(transaction.amount || 0),
        recordType: transaction.recordType,
        description: transaction.description,
      });
      setTransaction(emptyTransaction());
      setTransactionOpen(false);
      setNotice("Cari işlem kaydedildi ve firma bakiyesi güncellendi.");
      await Promise.all([loadFirms(), loadMovements(selected)]);
      reloadAll?.();
    } catch (requestError) {
      setNotice(requestError?.message || "Cari işlem kaydedilemedi.");
    } finally {
      transactionPending.current = false;
      setSaving(false);
    }
  };

  const openFinance = (companyId = "") => {
    const queryString = new URLSearchParams({ financeView: "daily", ...(companyId ? { companyId } : {}) }).toString();
    goTab?.("finans-islemleri", queryString);
  };

  const canUseCari = Boolean(selected?.supplierDebtTracking || selected?.customerReceivableTracking);
  const filteredMovements = useMemo(() => {
    if (movementFilter === "ALL") return movements;
    return movements.filter((movement) => normalize(movement.movement_type || movement.type) === movementFilter);
  }, [movementFilter, movements]);

  return (
    <section className="ccw-root">
      <header className="ccw-toolbar">
        <label className="ccw-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma adı veya vergi no ara" /></label>
        <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Firma türü"><option value="ALL">Tüm firmalar</option><option value="CUSTOMER">Müşteriler</option><option value="SUPPLIER">Tedarikçiler</option><option value="CHEMICAL">Boya / kimyasal</option></select>
        <select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value)} aria-label="Bakiye"><option value="ALL">Tüm bakiyeler</option><option value="RECEIVABLE">Alacak bakiyesi</option><option value="PAYABLE">Borç bakiyesi</option><option value="NONZERO">Bakiyesi olanlar</option><option value="ZERO">Sıfır bakiye</option></select>
        <select value={recordFilter} onChange={(event) => setRecordFilter(event.target.value)} aria-label="Kayıt türü"><option value="ALL">Resmî + Gayri resmî</option><option value="OFFICIAL">Yalnız resmî</option><option value="UNOFFICIAL">Yalnız gayri resmî</option></select>
        <select value={balanceSort} onChange={(event) => setBalanceSort(event.target.value)} aria-label="Sıralama"><option value="NAME">Ada göre</option><option value="BALANCE_DESC">Bakiye: yüksekten düşüğe</option><option value="BALANCE_ASC">Bakiye: düşükten yükseğe</option><option value="LAST_MOVEMENT_DESC">Son işleme göre</option></select>
        <button type="button" className="primary" onClick={() => setCompanyFormOpen(true)}><CirclePlus size={16} /> Yeni Firma</button>
        <button type="button" onClick={() => openFinance()}><Landmark size={16} /> Finans</button>
        <button type="button" onClick={loadFirms}><RefreshCcw size={16} /> Yenile</button>
      </header>

      <section className="ccw-summary" aria-label="Cari özet">
        <div><span>Firma</span><strong>{visibleFirms.length}</strong></div>
        <div><span>Toplam alacak</span><strong>{money(totals.receivable)}</strong></div>
        <div><span>Toplam borç</span><strong>{money(totals.payable)}</strong></div>
        <div className={totals.balance >= 0 ? "success" : "negative"}><span>Net bakiye</span><strong>{money(totals.balance)}</strong></div>
      </section>

      {error ? <div className="ccw-error"><CircleAlert size={18} /> {error}</div> : null}

      <div className="ccw-master-detail">
        <section className="ccw-table-card" aria-label="Firma listesi">
          <div className="ccw-card-title"><Building2 size={17} /><strong>Firma / Cari</strong><span>{visibleFirms.length} kayıt</span></div>
          {loading ? <div className="ccw-empty">Firmalar yükleniyor…</div> : visibleFirms.length ? (
            <div className="ccw-table-wrap">
              <table>
                <thead><tr><th>Firma</th><th>Bakiye</th><th>Son işlem</th></tr></thead>
                <tbody>{visibleFirms.map((firm) => (
                  <tr key={firm.id} className={String(selected?.id) === String(firm.id) ? "selected" : ""} onClick={() => { if (!saving) loadMovements(firm); }} onKeyDown={(event) => { if (!saving && ["Enter", " "].includes(event.key)) { event.preventDefault(); loadMovements(firm); } }} tabIndex={0} aria-selected={String(selected?.id) === String(firm.id)}>
                    <td><strong>{firm.firmaAdi || firm.companyName || firm.name || "-"}</strong><small>{roleLabel(firm)} · {recordLabel(firm)}{firm.isChemicalSupplier ? " · Boya/kimyasal" : ""}</small></td>
                    <td><strong className={Number(firm.currentBalance || 0) >= 0 ? "positive" : "negative"}>{money(firm.currentBalance)}</strong></td>
                    <td>{firm.lastMovementAt ? dateText(firm.lastMovementAt) : "-"}<small>{Number(firm.movementCount || 0) ? `${Number(firm.movementCount)} hareket` : ""}</small></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="ccw-empty"><strong>Henüz firma kartı yok.</strong><span>Yeni Firma ile müşteri veya tedarikçi kartını oluşturun.</span></div>}
        </section>

        <section className="ccw-detail-panel" aria-label="Seçili firma cari hesabı">
          {!selected ? <div className="ccw-empty"><Building2 size={28} /><strong>Firma seçin</strong><span>Cari özet ve hareketler burada açılır.</span></div> : (
            <>
              <header>
                <div><h2>{selected.firmaAdi || selected.companyName || selected.name}</h2><p>{roleLabel(selected)} · {recordLabel(selected)} · {cariLabel(selected)} · {selected.taxNo || "Vergi no yok"}</p></div>
                <div className="ccw-actions">
                  {canUseCari ? <button type="button" className="primary" onClick={() => setTransactionOpen((value) => !value)}><CirclePlus size={16} /> Cari Hareket</button> : null}
                  <button type="button" onClick={() => openFinance(selected.id)}><Landmark size={16} /> Finans</button>
                  <button type="button" onClick={() => setEditOpen(true)}><Pencil size={16} /> Düzenle</button>
                </div>
              </header>
              <div className="ccw-detail-body">
                {notice ? <div className="ccw-notice" role="status">{notice}</div> : null}
                <div className="ccw-detail-summary">
                  <div><span>Güncel bakiye</span><strong>{money(selected.currentBalance)}</strong><small>{Number(selected.currentBalance || 0) < 0 ? "Firmaya borcumuz" : Number(selected.currentBalance || 0) > 0 ? "Firmadan alacağımız" : "Hesap dengede"}</small></div>
                  <div><span>Takip düzeni</span><strong>{cariLabel(selected)}</strong><small>{recordLabel(selected)}</small></div>
                  <div><span>Son hareket</span><strong>{dateText(selected.lastMovementAt)}</strong><small>{movements.length} hareket</small></div>
                </div>

                {transactionOpen && canUseCari ? (
                  <section className="ccw-transaction">
                    <header><div><h3>Yeni cari hareket</h3><p>Tek kayıt oluşturulur; aynı işlem tekrar gönderilirse requestId ile çoğalmaz.</p></div><button type="button" className="icon" onClick={() => setTransactionOpen(false)} aria-label="Kapat"><X size={16} /></button></header>
                    <div className="ccw-form-grid transaction">
                      <label>Tarih<input type="date" value={transaction.date} onChange={(event) => setTransaction((current) => ({ ...current, date: event.target.value }))} /></label>
                      <label>İşlem<select value={transaction.transactionType} onChange={(event) => setTransaction((current) => ({ ...current, transactionType: event.target.value }))}><option value="DEBIT">Borç ekle</option><option value="CREDIT">Alacak ekle</option><option value="PAYMENT">Ödeme</option><option value="COLLECTION">Tahsilat</option></select></label>
                      <label>Tutar<input type="number" min="0" step="0.01" value={transaction.amount} onChange={(event) => setTransaction((current) => ({ ...current, amount: event.target.value }))} /></label>
                      <label>Kayıt türü<select value={transaction.recordType} onChange={(event) => setTransaction((current) => ({ ...current, recordType: event.target.value }))}><option value="RESMI">Resmî</option><option value="GAYRI_RESMI">Gayri resmî</option></select></label>
                      <label className="wide">Açıklama<input value={transaction.description} onChange={(event) => setTransaction((current) => ({ ...current, description: event.target.value }))} /></label>
                    </div>
                    <footer><button type="button" className="primary" disabled={saving} onClick={saveTransaction}>{saving ? "Kaydediliyor…" : "Hareketi Kaydet"}</button></footer>
                  </section>
                ) : null}

                <section className="ccw-section">
                  <header><div><h3>Cari hareketler</h3><span>{filteredMovements.length} / {movements.length} kayıt</span></div><select className="ccw-movement-filter" value={movementFilter} onChange={(event) => setMovementFilter(event.target.value)}><option value="ALL">Tüm hareketler</option><option value="ODEME">Ödemeler</option><option value="TAHSILAT">Tahsilatlar</option><option value="BORC">Borç</option><option value="ALACAK">Alacak</option></select></header>
                  {!canUseCari ? <div className="ccw-mini-empty">Bu firma peşin/cari takipsiz. Gider ve KDV kayıtları raporlardan izlenir; cari borç oluşmaz.</div> : detailLoading ? <div className="ccw-empty">Hareketler yükleniyor…</div> : filteredMovements.length ? (
                    <div className="ccw-table-wrap compact"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge No</th><th>Açıklama</th><th>Borç</th><th>Alacak</th><th>Bakiye</th><th>Kayıt</th></tr></thead><tbody>{filteredMovements.map((movement) => <tr key={movement.id}><td>{dateText(movement.movement_date || movement.date)}</td><td>{movementTypeLabel(movement.movement_type || movement.type)}</td><td>{movement.document_no || "-"}</td><td>{movement.description || "-"}</td><td>{money(movement.debit)}</td><td>{money(movement.credit)}</td><td><strong>{money(movement.balance_after)}</strong></td><td>{normalize(movement.record_type).includes("GAYRI") ? "Gayri resmî" : "Resmî"}</td></tr>)}</tbody></table></div>
                  ) : <div className="ccw-mini-empty">Bu firma için cari hareket bulunamadı.</div>}
                </section>
              </div>
            </>
          )}
        </section>
      </div>

      {companyFormOpen ? (
        <div className="ccw-modal-layer" role="presentation" onMouseDown={() => setCompanyFormOpen(false)}>
          <section className="ccw-modal" role="dialog" aria-modal="true" aria-label="Yeni firma" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><h2>Yeni Firma / Cari</h2><p>Firma kartı belge sağlayıcısından bağımsızdır; VKN veya alias ile e‑Belgeye bağlanır.</p></div><button type="button" className="icon" onClick={() => setCompanyFormOpen(false)} aria-label="Kapat"><X size={18} /></button></header>
            <div className="ccw-modal-body"><CompanyFormFields value={companyForm} onChange={setCompanyForm} /><div className="ccw-rule-note">Peşin tedarikçide cari borç oluşmaz. Resmî belgede KDV takibi açıksa KDV kaydı belge onayıyla oluşur.</div></div>
            <footer><button type="button" onClick={() => setCompanyFormOpen(false)}>Vazgeç</button><button type="button" className="primary" disabled={companySaving} onClick={createCompany}>{companySaving ? "Kaydediliyor…" : "Firma Kartını Oluştur"}</button></footer>
          </section>
        </div>
      ) : null}

      {editOpen && selected ? (
        <div className="ccw-side-layer" role="presentation" onMouseDown={() => setEditOpen(false)}>
          <aside className="ccw-side-panel" role="dialog" aria-modal="true" aria-label="Firma düzenle" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><h2>Firma Düzenle</h2><p>{selected.firmaAdi || selected.companyName || selected.name}</p></div><button type="button" className="icon" onClick={() => setEditOpen(false)} aria-label="Kapat"><X size={19} /></button></header>
            <div className="ccw-side-body">
              <section className="ccw-section">
                <header><div><h3>Firma Kartı ve Muhasebe Tanımı</h3><span>İletişim · cari · KDV · gider</span></div><button type="button" className="primary" disabled={profileSaving} onClick={saveProfile}>Kaydet</button></header>
                <div className="ccw-form-grid">
                  <label>Firma türü<select value={profileDraft.companyType} onChange={(event) => setProfileDraft((current) => ({ ...current, companyType: event.target.value }))}><option value="CUSTOMER">Müşteri</option><option value="SUPPLIER">Tedarikçi</option><option value="BOTH">Müşteri ve tedarikçi</option></select></label>
                  <label>Alış / ödeme düzeni<select value={profileDraft.paymentMode} disabled={profileDraft.companyType === "CUSTOMER"} onChange={(event) => setProfileDraft((current) => ({ ...current, paymentMode: event.target.value, supplierDebtTracking: event.target.value === "CREDIT" ? current.supplierDebtTracking : false }))}><option value="CASH">Peşin — cari borç yok</option><option value="CREDIT">Vadeli / cari</option></select></label>
                  <label>Varsayılan kayıt<select value={profileDraft.defaultRecordType} onChange={(event) => setProfileDraft((current) => ({ ...current, defaultRecordType: event.target.value, vatTrackingEnabled: event.target.value === "RESMI" ? current.vatTrackingEnabled : false }))}><option value="RESMI">Resmî</option><option value="GAYRI_RESMI">Gayri resmî</option></select></label>
                  <label>Gider kategorisi<input value={profileDraft.expenseCategory} onChange={(event) => setProfileDraft((current) => ({ ...current, expenseCategory: event.target.value }))} /></label>
                  <label>Telefon<input value={profileDraft.phone} onChange={(event) => setProfileDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                  <label>E-posta<input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label>Adres<input value={profileDraft.address} onChange={(event) => setProfileDraft((current) => ({ ...current, address: event.target.value }))} /></label>
                  <label>Not<input value={profileDraft.note} onChange={(event) => setProfileDraft((current) => ({ ...current, note: event.target.value }))} /></label>
                </div>
                <div className="ccw-check-row">
                  {profileDraft.companyType !== "CUSTOMER" ? <label><input type="checkbox" checked={profileDraft.supplierDebtTracking && profileDraft.paymentMode === "CREDIT"} disabled={profileDraft.paymentMode !== "CREDIT"} onChange={(event) => setProfileDraft((current) => ({ ...current, supplierDebtTracking: event.target.checked }))} /> Tedarikçi borcunu caride takip et</label> : null}
                  {profileDraft.companyType !== "SUPPLIER" ? <label><input type="checkbox" checked={profileDraft.customerReceivableTracking} onChange={(event) => setProfileDraft((current) => ({ ...current, customerReceivableTracking: event.target.checked }))} /> Müşteri alacağını caride takip et</label> : null}
                  <label><input type="checkbox" checked={profileDraft.vatTrackingEnabled && profileDraft.defaultRecordType === "RESMI"} disabled={profileDraft.defaultRecordType !== "RESMI"} onChange={(event) => setProfileDraft((current) => ({ ...current, vatTrackingEnabled: event.target.checked }))} /> Resmî belgede KDV takibi</label>
                </div>
                <div className="ccw-rule-note">{profileDraft.companyType !== "CUSTOMER" && profileDraft.paymentMode === "CASH" ? "Peşin alış: gider/KDV izlenir, firmaya cari borç yazılmaz." : profileDraft.companyType !== "CUSTOMER" ? "Cari tedarikçi: onaylanan fatura firma borcuna eklenir." : "Müşteri alacağı yalnız kesilen fatura ve tahsilat zincirinden izlenir."}</div>
              </section>

              <CompanyFibeSection activeMainCompany={activeMainCompany} company={selected} onChanged={async () => { await loadFirms(); await loadMovements(selected); }} />

              <section className="ccw-section">
                <header><div><h3>Firma Alias / Eşleşme</h3><span>{aliases.length} kayıt</span></div></header>
                <div className="ccw-alias-entry"><input value={aliasInput} onChange={(event) => setAliasInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAlias(); } }} placeholder="Belgede geçen alternatif firma adı" /><button type="button" className="primary" disabled={profileSaving || !aliasInput.trim()} onClick={addAlias}>Alias Ekle</button></div>
                {aliases.length ? <div className="ccw-alias-list">{aliases.map((alias) => <span key={alias.id}>{alias.raw_name || alias.rawName}<button type="button" onClick={() => removeAlias(alias.id)} aria-label="Alias kaldır">×</button></span>)}</div> : <div className="ccw-mini-empty">Henüz alias yok.</div>}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
