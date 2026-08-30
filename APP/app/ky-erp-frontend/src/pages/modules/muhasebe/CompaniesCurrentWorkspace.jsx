import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  CirclePlus,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../../utils/api";
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
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

export default function CompaniesCurrentWorkspace({ activeMainCompany, refreshKey = 0 }) {
  const [firms, setFirms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [balanceFilter, setBalanceFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [movements, setMovements] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [transaction, setTransaction] = useState(emptyTransaction);
  const [profileDraft, setProfileDraft] = useState(profileDraftOf());
  const [aliases, setAliases] = useState([]);
  const [aliasInput, setAliasInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [companyDeleting, setCompanyDeleting] = useState(false);
  const [companyStatusSaving, setCompanyStatusSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [companyFormOpen, setCompanyFormOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState(emptyCompany);
  const [companySaving, setCompanySaving] = useState(false);

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug],
  );

  const loadFirms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadModuleData({
        scope: `muhasebe:${params.mainCompanySlug || params.mainCompanyId || "main"}:firmalar:${query}`,
        sources: {
          firms: {
            critical: true,
            load: () => apiGet("/muhasebe/firmalar", {
              ...params,
              search: query,
              limit: 10000,
              _ts: Date.now(),
            }),
          },
          profiles: {
            fallback: [],
            load: () => apiGet("/muhasebe/firma-profilleri", {
              ...params,
              _ts: Date.now(),
            }),
          },
        },
      });
      const firmsPayload = result.data.firms;
      const profilesPayload = result.data.profiles;
      const profiles = new Map(listOf(profilesPayload).map((item) => [String(item.id), item]));
      if (result.states.firms.status !== "error") {
        setFirms(
          listOf(firmsPayload).map((firm) => ({
            ...firm,
            ...(profiles.get(String(firm.id)) || {}),
          })),
        );
      }
      setError(moduleLoadMessage(
        result,
        "Firma ve cari ana listesi alınamadı; ekrandaki son başarılı veri korunuyor.",
        "Firma profilleri geçici olarak yenilenemedi; firma ve cari listesi kullanılabilir.",
      ));
    } catch (requestError) {
      setFirms([]);
      setError(requestError?.message || "Firma ve cari listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [params, query]);

  useEffect(() => {
    const timer = window.setTimeout(loadFirms, 160);
    return () => window.clearTimeout(timer);
  }, [loadFirms, refreshKey]);

  const visibleFirms = useMemo(
    () =>
      firms.filter((firm) => {
        const firmRole = roleLabel(firm);
        const balance = Number(firm.currentBalance || 0);
        if (role === "CUSTOMER" && !/Müşteri/.test(firmRole)) return false;
        if (role === "SUPPLIER" && !/tedarikçi/i.test(firmRole)) return false;
        if (role === "CHEMICAL" && !firm.isChemicalSupplier) return false;
        if (balanceFilter === "RECEIVABLE" && balance <= 0) return false;
        if (balanceFilter === "PAYABLE" && balance >= 0) return false;
        if (balanceFilter === "ZERO" && balance !== 0) return false;
        return true;
      }),
    [balanceFilter, firms, role],
  );

  const totals = useMemo(() => {
    const receivable = visibleFirms
      .filter((firm) => Number(firm.currentBalance || 0) > 0)
      .reduce((sum, firm) => sum + Number(firm.currentBalance || 0), 0);
    const payable = visibleFirms
      .filter((firm) => Number(firm.currentBalance || 0) < 0)
      .reduce((sum, firm) => sum + Math.abs(Number(firm.currentBalance || 0)), 0);
    return { receivable, payable, balance: receivable - payable };
  }, [visibleFirms]);

  const loadMovements = useCallback(
    async (firm) => {
      setSelected(firm);
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
              load: () => apiGet("/muhasebe/cari-hareketler", {
                ...params,
                companyId: firm.id,
                limit: 500,
                _ts: Date.now(),
              }),
            },
            profile: {
              fallback: {},
              load: () => apiGet(`/muhasebe/firma-profilleri/${firm.id}`, {
                ...params,
                _ts: Date.now(),
              }),
            },
          },
        });
        const movementPayload = result.data.movements;
        const profilePayload = result.data.profile;
        const profile = objectOf(profilePayload);
        const merged = { ...firm, ...profile };
        setSelected(merged);
        setProfileDraft(profileDraftOf(merged));
        setAliases(Array.isArray(profile.aliases) ? profile.aliases : []);
        if (result.states.movements.status !== "error") setMovements(listOf(movementPayload));
        setNotice(moduleLoadMessage(
          result,
          "Cari hareketler alınamadı; varsa son başarılı detay korunuyor.",
          "Firma profilinin bazı yardımcı bilgileri yenilenemedi; cari hareketler kullanılabilir.",
        ));
      } catch (requestError) {
        setProfileDraft(profileDraftOf(firm));
        setNotice(requestError?.message || "Firma detayları alınamadı.");
      } finally {
        setDetailLoading(false);
      }
    },
    [params],
  );

  const createCompany = async () => {
    if (!companyForm.companyName.trim()) {
      setError("Firma adı zorunludur.");
      return;
    }
    if (!validEmail(companyForm.email)) {
      setError("Geçerli bir firma e-posta adresi girin.");
      return;
    }
    setCompanySaving(true);
    setError("");
    try {
      const createdPayload = await apiPost("/muhasebe/firmalar", {
        ...params,
        ...companyForm,
        supplierDebtTracking:
          companyForm.companyType !== "CUSTOMER" &&
          companyForm.paymentMode === "CREDIT" &&
          companyForm.supplierDebtTracking,
        customerReceivableTracking:
          companyForm.companyType !== "SUPPLIER" && companyForm.customerReceivableTracking,
        vatTrackingEnabled:
          companyForm.defaultRecordType === "RESMI" && companyForm.vatTrackingEnabled,
      });
      const created = objectOf(createdPayload);
      setCompanyForm(emptyCompany());
      setCompanyFormOpen(false);
      await loadFirms();
      if (created?.id) await loadMovements(created);
    } catch (requestError) {
      setError(requestError?.message || "Firma kartı oluşturulamadı.");
    } finally {
      setCompanySaving(false);
    }
  };

  const saveProfile = async () => {
    if (!selected?.id) return;
    if (!validEmail(profileDraft.email)) {
      setNotice("Geçerli bir firma e-posta adresi girin.");
      return;
    }
    setProfileSaving(true);
    setNotice("");
    try {
      const payload = await apiPatch(`/muhasebe/firma-profilleri/${selected.id}`, {
        ...params,
        ...profileDraft,
        supplierDebtTracking:
          profileDraft.companyType !== "CUSTOMER" &&
          profileDraft.paymentMode === "CREDIT" &&
          profileDraft.supplierDebtTracking,
        customerReceivableTracking:
          profileDraft.companyType !== "SUPPLIER" && profileDraft.customerReceivableTracking,
        vatTrackingEnabled:
          profileDraft.defaultRecordType === "RESMI" && profileDraft.vatTrackingEnabled,
      });
      const profile = objectOf(payload);
      setSelected((current) => ({ ...current, ...profile }));
      setProfileDraft(profileDraftOf(profile));
      setNotice("Firma kartı, iletişim ve muhasebe tanımı kaydedildi.");
      await loadFirms();
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
      const payload = await apiPost(`/muhasebe/firma-profilleri/${selected.id}/aliases`, {
        ...params,
        rawName,
      });
      const data = objectOf(payload);
      setAliases(Array.isArray(data.aliases) ? data.aliases : []);
      setAliasInput("");
      setNotice(
        data.matchedDocuments
          ? `${data.matchedDocuments} bekleyen belge bu alias ile firmaya eşleştirildi.`
          : "Firma aliası kaydedildi.",
      );
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
      const payload = await apiDelete(
        `/muhasebe/firma-profilleri/${selected.id}/aliases/${aliasId}`,
        params,
      );
      setAliases(listOf(payload));
      setNotice("Alias kaldırıldı.");
      await loadFirms();
    } catch (requestError) {
      setNotice(requestError?.message || "Alias kaldırılamadı.");
    } finally {
      setProfileSaving(false);
    }
  };

  const toggleCompanyStatus = async () => {
    if (!selected?.id || companyStatusSaving) return;
    const nextIsActive = selected.isActive === false;
    setCompanyStatusSaving(true);
    setNotice("");
    try {
      const payload = await apiPatch(`/muhasebe/firmalar/${selected.id}/status`, {
        ...params,
        isActive: nextIsActive,
      });
      const data = objectOf(payload);
      setSelected((current) => ({ ...current, isActive: data.isActive !== false }));
      setFirms((current) => current.map((firm) => (
        String(firm.id) === String(selected.id)
          ? { ...firm, isActive: data.isActive !== false }
          : firm
      )));
      setNotice(data.isActive === false ? "Firma pasife alındı." : "Firma tekrar aktif edildi.");
    } catch (requestError) {
      setNotice(requestError?.message || "Firma durumu değiştirilemedi.");
    } finally {
      setCompanyStatusSaving(false);
    }
  };

  const deleteCompany = async () => {
    if (!selected?.id || companyDeleting) return;
    const companyName = selected.firmaAdi || selected.companyName || selected.name || "Firma";
    const confirmed = window.confirm(
      `${companyName} firma kartı KALICI olarak silinecek.\n\nBu işlem geri alınamaz. Geçmiş belge veya cari bağlantısı olsa da firma kartı silinecek.\n\nDevam edilsin mi?`,
    );
    if (!confirmed) return;
    setCompanyDeleting(true);
    setNotice("");
    try {
      await apiDelete(`/muhasebe/firmalar/${selected.id}`, params);
      setSelected(null);
      setMovements([]);
      setAliases([]);
      setTransactionOpen(false);
      await loadFirms();
    } catch (requestError) {
      setNotice(requestError?.message || "Firma kartı kalıcı olarak silinemedi.");
    } finally {
      setCompanyDeleting(false);
    }
  };

  const saveTransaction = async () => {
    if (!selected?.id || Number(transaction.amount || 0) <= 0) {
      setNotice("Sıfırdan büyük işlem tutarı zorunludur.");
      return;
    }
    if (!selected.supplierDebtTracking && !selected.customerReceivableTracking) {
      setNotice("Bu firma peşin/cari takipsiz tanımlı. Cari hareket oluşturulmaz.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      await apiPost("/muhasebe/cari-hareketler", {
        ...params,
        companyId: selected.id,
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
    } catch (requestError) {
      setNotice(requestError?.message || "Cari işlem kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const canUseCari = Boolean(selected?.supplierDebtTracking || selected?.customerReceivableTracking);

  return (
    <section className="ccw-root">
      <header className="ccw-toolbar">
        <label className="ccw-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma adı veya vergi no ara" />
        </label>
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="ALL">Tüm firma türleri</option>
          <option value="CUSTOMER">Müşteriler</option>
          <option value="SUPPLIER">Tedarikçiler</option>
          <option value="CHEMICAL">Boya / kimyasal tedarikçileri</option>
        </select>
        <select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value)}>
          <option value="ALL">Tüm bakiyeler</option>
          <option value="RECEIVABLE">Alacak bakiyesi</option>
          <option value="PAYABLE">Borç bakiyesi</option>
          <option value="ZERO">Sıfır bakiye</option>
        </select>
        <button type="button" onClick={() => setCompanyFormOpen((value) => !value)}><CirclePlus size={16} /> Yeni Firma</button>
        <button type="button" onClick={loadFirms}><RefreshCcw size={16} /> Yenile</button>
      </header>

      {companyFormOpen ? (
        <section className="ccw-profile-card">
          <header>
            <div><h3>Yeni Firma Kartı</h3><p>Firma kartı İşNet'ten bağımsız kalıcıdır. Belge geldiğinde VKN veya alias ile bu karta bağlanır.</p></div>
            <button type="button" className="icon" onClick={() => setCompanyFormOpen(false)} aria-label="Kapat"><X size={18} /></button>
          </header>
          <div className="ccw-profile-grid">
            <label>Firma adı<input value={companyForm.companyName} onChange={(event) => setCompanyForm((current) => ({ ...current, companyName: event.target.value }))} placeholder="Firma adı" /></label>
            <label>Firma türü<select value={companyForm.companyType} onChange={(event) => setCompanyForm((current) => ({ ...current, companyType: event.target.value, paymentMode: event.target.value === "CUSTOMER" ? "CASH" : current.paymentMode, supplierDebtTracking: event.target.value === "CUSTOMER" ? false : current.supplierDebtTracking, customerReceivableTracking: event.target.value === "SUPPLIER" ? false : current.customerReceivableTracking }))}><option value="CUSTOMER">Müşteri</option><option value="SUPPLIER">Tedarikçi</option><option value="BOTH">Müşteri ve tedarikçi</option></select></label>
            <label>Varsayılan kayıt<select value={companyForm.defaultRecordType} onChange={(event) => setCompanyForm((current) => ({ ...current, defaultRecordType: event.target.value, vatTrackingEnabled: event.target.value === "RESMI" ? current.vatTrackingEnabled : false }))}><option value="RESMI">Resmî</option><option value="GAYRI_RESMI">Gayri resmî</option></select></label>
            <label>Alış / ödeme düzeni<select value={companyForm.paymentMode} disabled={companyForm.companyType === "CUSTOMER"} onChange={(event) => setCompanyForm((current) => ({ ...current, paymentMode: event.target.value, supplierDebtTracking: event.target.value === "CREDIT" ? current.supplierDebtTracking : false }))}><option value="CASH">Peşin — cari borç yok</option><option value="CREDIT">Vadeli / cari</option></select></label>
            <label>Vergi no<input value={companyForm.taxNo} onChange={(event) => setCompanyForm((current) => ({ ...current, taxNo: event.target.value }))} /></label>
            <label>Vergi dairesi<input value={companyForm.taxOffice} onChange={(event) => setCompanyForm((current) => ({ ...current, taxOffice: event.target.value }))} /></label>
            <label>Telefon<input value={companyForm.phone} onChange={(event) => setCompanyForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label>E-posta<input type="email" value={companyForm.email} onChange={(event) => setCompanyForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label>Gider kategorisi<input value={companyForm.expenseCategory} onChange={(event) => setCompanyForm((current) => ({ ...current, expenseCategory: event.target.value }))} placeholder="Gıda / Market, Kimyasal, Enerji..." /></label>
            <label>Adres<input value={companyForm.address} onChange={(event) => setCompanyForm((current) => ({ ...current, address: event.target.value }))} /></label>
            <label>Not<input value={companyForm.note} onChange={(event) => setCompanyForm((current) => ({ ...current, note: event.target.value }))} placeholder="Firma kartı notu" /></label>
          </div>
          <div className="ccw-check-row">
            {companyForm.companyType !== "CUSTOMER" ? <label><input type="checkbox" checked={companyForm.supplierDebtTracking && companyForm.paymentMode === "CREDIT"} disabled={companyForm.paymentMode !== "CREDIT"} onChange={(event) => setCompanyForm((current) => ({ ...current, supplierDebtTracking: event.target.checked }))} /> Tedarikçi borcunu caride takip et</label> : null}
            {companyForm.companyType !== "SUPPLIER" ? <label><input type="checkbox" checked={companyForm.customerReceivableTracking} onChange={(event) => setCompanyForm((current) => ({ ...current, customerReceivableTracking: event.target.checked }))} /> Müşteri alacağını caride takip et</label> : null}
            <label><input type="checkbox" checked={companyForm.vatTrackingEnabled && companyForm.defaultRecordType === "RESMI"} disabled={companyForm.defaultRecordType !== "RESMI"} onChange={(event) => setCompanyForm((current) => ({ ...current, vatTrackingEnabled: event.target.checked }))} /> Resmî belgede KDV takibi</label>
          </div>
          <div className="ccw-rule-note">Peşin tedarikçide borç oluşmaz. Resmî belgede gider/KDV, gayri resmî kayıtta yalnız iç gider takibi yapılır. Firma adı otomatik ilk alias olur.</div>
          <div className="ccw-drawer-actions"><button type="button" className="primary" disabled={companySaving} onClick={createCompany}>{companySaving ? "Kaydediliyor…" : "Firma Kartını Oluştur"}</button></div>
        </section>
      ) : null}

      <section className="ccw-summary">
        <div><span>Firma</span><strong>{visibleFirms.length}</strong></div>
        <div><span>Toplam alacak</span><strong>{money(totals.receivable)}</strong></div>
        <div><span>Toplam borç</span><strong>{money(totals.payable)}</strong></div>
        <div className={totals.balance >= 0 ? "success" : "danger"}><span>Net bakiye</span><strong>{money(totals.balance)}</strong></div>
      </section>

      {error ? <div className="ccw-error"><CircleAlert size={18} /> {error}</div> : null}

      <section className="ccw-table-card">
        {loading ? (
          <div className="ccw-empty">Firmalar yükleniyor…</div>
        ) : visibleFirms.length ? (
          <div className="ccw-table-wrap">
            <table>
              <thead><tr><th>Firma</th><th>Tür</th><th>Kayıt</th><th>Cari tipi</th><th>KDV</th><th>Gider kategorisi</th><th>Vergi No</th><th>Bakiye</th><th>Alias</th><th>Durum</th></tr></thead>
              <tbody>
                {visibleFirms.map((firm) => (
                  <tr key={firm.id} onClick={() => loadMovements(firm)} tabIndex={0}>
                    <td><strong>{firm.firmaAdi || firm.companyName || firm.name || "-"}</strong>{firm.isChemicalSupplier ? <small>Boya / kimyasal</small> : null}</td>
                    <td>{roleLabel(firm)}</td>
                    <td>{recordLabel(firm)}</td>
                    <td><span className={firm.supplierDebtTracking || firm.customerReceivableTracking ? "ccw-badge active" : "ccw-badge cash"}>{cariLabel(firm)}</span></td>
                    <td>{firm.vatTrackingEnabled === false ? "Kapalı" : "Takip"}</td>
                    <td>{firm.expenseCategory || "-"}</td>
                    <td>{firm.taxNo || "-"}</td>
                    <td><strong className={Number(firm.currentBalance || 0) >= 0 ? "positive" : "negative"}>{money(firm.currentBalance)}</strong></td>
                    <td>{Number(firm.aliasCount || 0)}</td>
                    <td><strong>{firm.isActive === false ? "Pasif" : "Aktif"}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ccw-empty">
            <strong>Henüz firma kartı yok.</strong>
            <span>Yeni Firma ile müşteri veya tedarikçi kartını İşNet beklemeden oluşturabilirsin.</span>
          </div>
        )}
      </section>

      {selected ? (
        <div className="ccw-drawer-layer" role="presentation" onMouseDown={() => setSelected(null)}>
          <aside className="ccw-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{selected.firmaAdi || selected.companyName || selected.name}</h2>
                <p>{roleLabel(selected)} · {recordLabel(selected)} · {cariLabel(selected)} · {selected.isActive === false ? "Pasif" : "Aktif"} · {selected.taxNo || "Vergi no yok"}</p>
              </div>
              <div className="ccw-drawer-actions">
                {canUseCari ? (
                  <button type="button" className="primary" onClick={() => setTransactionOpen((value) => !value)}><CirclePlus size={16} /> Cari İşlem</button>
                ) : null}
                <button
                  type="button"
                  disabled={companyStatusSaving}
                  onClick={toggleCompanyStatus}
                  style={selected.isActive === false
                    ? { color: "#067647", borderColor: "#75e0a7", background: "#ecfdf3" }
                    : { color: "#b54708", borderColor: "#fec84b", background: "#fffaeb" }}
                >
                  {companyStatusSaving ? "Kaydediliyor…" : selected.isActive === false ? "Aktif Et" : "Pasife Al"}
                </button>
                <button
                  type="button"
                  disabled={companyDeleting}
                  onClick={deleteCompany}
                  title="Firma kartını uyarı sonrası kalıcı olarak sil"
                  style={{ color: "#b42318", borderColor: "#fda29b", background: "#fff5f5" }}
                >
                  <Trash2 size={16} /> {companyDeleting ? "Siliniyor…" : "Kalıcı Sil"}
                </button>
                <button type="button" className="icon" onClick={() => setSelected(null)} aria-label="Kapat"><X size={20} /></button>
              </div>
            </header>
            <div className="ccw-drawer-body">
              {notice ? <div className="ccw-notice" role="status">{notice}</div> : null}

              <section className="ccw-profile-card">
                <header>
                  <div><h3>Firma Kartı ve Muhasebe Tanımı</h3><p>İletişim bilgileri mail/ekstre akışında; borç, KDV ve gider ayarları muhasebe akışında kullanılır.</p></div>
                  <button type="button" className="ccw-save-profile" disabled={profileSaving} onClick={saveProfile}>Firma Kartını Kaydet</button>
                </header>
                <div className="ccw-profile-grid">
                  <label>Firma türü
                    <select value={profileDraft.companyType} onChange={(event) => setProfileDraft((current) => ({ ...current, companyType: event.target.value }))}>
                      <option value="CUSTOMER">Müşteri</option>
                      <option value="SUPPLIER">Tedarikçi</option>
                      <option value="BOTH">Müşteri ve tedarikçi</option>
                    </select>
                  </label>
                  <label>Alış / ödeme düzeni
                    <select value={profileDraft.paymentMode} disabled={profileDraft.companyType === "CUSTOMER"} onChange={(event) => setProfileDraft((current) => ({ ...current, paymentMode: event.target.value, supplierDebtTracking: event.target.value === "CREDIT" ? current.supplierDebtTracking : false }))}>
                      <option value="CASH">Peşin — cari borç oluşturma</option>
                      <option value="CREDIT">Vadeli / cari — tedarikçi borcu oluştur</option>
                    </select>
                  </label>
                  <label>Varsayılan kayıt
                    <select value={profileDraft.defaultRecordType} onChange={(event) => setProfileDraft((current) => ({ ...current, defaultRecordType: event.target.value, vatTrackingEnabled: event.target.value === "RESMI" ? current.vatTrackingEnabled : false }))}>
                      <option value="RESMI">Resmî</option>
                      <option value="GAYRI_RESMI">Gayri resmî</option>
                    </select>
                  </label>
                  <label>Gider kategorisi
                    <input value={profileDraft.expenseCategory} onChange={(event) => setProfileDraft((current) => ({ ...current, expenseCategory: event.target.value }))} placeholder="Gıda / Market, Elektrik, Kimyasal..." />
                  </label>
                  <label>Telefon
                    <input value={profileDraft.phone} onChange={(event) => setProfileDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="05xx xxx xx xx" />
                  </label>
                  <label>E-posta
                    <input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} placeholder="firma@ornek.com" />
                  </label>
                  <label>Adres
                    <input value={profileDraft.address} onChange={(event) => setProfileDraft((current) => ({ ...current, address: event.target.value }))} placeholder="Firma adresi" />
                  </label>
                  <label>Not
                    <input value={profileDraft.note} onChange={(event) => setProfileDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Firma kartı notu" />
                  </label>
                </div>
                <div className="ccw-check-row">
                  {profileDraft.companyType !== "CUSTOMER" ? (
                    <label><input type="checkbox" checked={profileDraft.supplierDebtTracking && profileDraft.paymentMode === "CREDIT"} disabled={profileDraft.paymentMode !== "CREDIT"} onChange={(event) => setProfileDraft((current) => ({ ...current, supplierDebtTracking: event.target.checked }))} /> Tedarikçi borcunu caride takip et</label>
                  ) : null}
                  {profileDraft.companyType !== "SUPPLIER" ? (
                    <label><input type="checkbox" checked={profileDraft.customerReceivableTracking} onChange={(event) => setProfileDraft((current) => ({ ...current, customerReceivableTracking: event.target.checked }))} /> Müşteri alacağını caride takip et</label>
                  ) : null}
                  <label><input type="checkbox" checked={profileDraft.vatTrackingEnabled && profileDraft.defaultRecordType === "RESMI"} disabled={profileDraft.defaultRecordType !== "RESMI"} onChange={(event) => setProfileDraft((current) => ({ ...current, vatTrackingEnabled: event.target.checked }))} /> Resmî belgede KDV takibi</label>
                </div>
                <div className="ccw-rule-note">
                  {profileDraft.email
                    ? `Mail ve ekstre gönderimlerinde varsayılan alıcı: ${profileDraft.email}`
                    : "Firma e-postası boşsa mail/ekstre ekranında alıcı eksik olarak işaretlenir."}
                </div>
                <div className="ccw-rule-note">
                  {selected.isActive === false
                    ? "Firma pasif. İstersen tekrar Aktif Et ile kullanıma açabilirsin."
                    : profileDraft.companyType !== "CUSTOMER" && profileDraft.paymentMode === "CASH"
                      ? "Peşin alış: gider ve resmîyse KDV kaydı oluşur; firmaya cari borç yazılmaz."
                      : profileDraft.companyType !== "CUSTOMER"
                        ? "Cari tedarikçi: onaylanan tedarikçi faturası firma borcuna eklenir."
                        : "Müşteri: gelen irsaliye borç oluşturmaz; müşteri alacağı yalnız kesilen fatura/tahsilat akışından izlenir."}
                </div>
              </section>

              <section className="ccw-section">
                <header><h3>Firma Alias / Eşleşme</h3><span>{aliases.length} kayıt</span></header>
                <div className="ccw-alias-entry">
                  <input value={aliasInput} onChange={(event) => setAliasInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAlias(); } }} placeholder="Örn. BİM BİRLEŞİK MAĞAZALAR AŞ" />
                  <button type="button" disabled={profileSaving || !aliasInput.trim()} onClick={addAlias}>Alias Ekle</button>
                </div>
                {aliases.length ? (
                  <div className="ccw-alias-list">
                    {aliases.map((alias) => (
                      <span key={alias.id}>{alias.raw_name || alias.rawName}<button type="button" onClick={() => removeAlias(alias.id)} aria-label="Alias kaldır">×</button></span>
                    ))}
                  </div>
                ) : <div className="ccw-mini-empty">Henüz alias yok. İşNet, fiş veya manuel kayıtta farklı yazılan firma adlarını buraya ekleyebilirsin.</div>}
              </section>

              <section className="ccw-detail-summary">
                <div><span>Bakiye</span><strong>{money(selected.currentBalance)}</strong></div>
                <div><span>Durum</span><strong>{selected.isActive === false ? "Pasif" : "Aktif"}</strong></div>
                <div><span>Kayıt türü</span><strong>{recordLabel(selected)}</strong></div>
                <div><span>Cari durumu</span><strong>{cariLabel(selected)}</strong></div>
                <div><span>KDV takibi</span><strong>{selected.vatTrackingEnabled === false ? "Kapalı" : "Aktif"}</strong></div>
                <div><span>Telefon</span><strong>{selected.phone || "-"}</strong></div>
                <div><span>Mail</span><strong>{selected.email || "-"}</strong></div>
                <div><span>Adres</span><strong>{selected.address || "-"}</strong></div>
              </section>

              {transactionOpen && canUseCari ? (
                <section className="ccw-transaction">
                  <header><h3>Yeni cari işlem</h3><button type="button" onClick={() => setTransactionOpen(false)}><X size={16} /></button></header>
                  <div>
                    <label>Tarih<input type="date" value={transaction.date} onChange={(event) => setTransaction((current) => ({ ...current, date: event.target.value }))} /></label>
                    <label>İşlem<select value={transaction.transactionType} onChange={(event) => setTransaction((current) => ({ ...current, transactionType: event.target.value }))}><option value="DEBIT">Borç ekle</option><option value="CREDIT">Alacak ekle</option><option value="PAYMENT">Ödeme</option><option value="COLLECTION">Tahsilat</option></select></label>
                    <label>Tutar<input type="number" min="0" step="0.01" value={transaction.amount} onChange={(event) => setTransaction((current) => ({ ...current, amount: event.target.value }))} /></label>
                    <label>Kayıt türü<select value={transaction.recordType} onChange={(event) => setTransaction((current) => ({ ...current, recordType: event.target.value }))}><option value="RESMI">Resmî</option><option value="GAYRI_RESMI">Gayri resmî</option></select></label>
                    <label className="wide">Açıklama<input value={transaction.description} onChange={(event) => setTransaction((current) => ({ ...current, description: event.target.value }))} /></label>
                  </div>
                  <footer><button type="button" disabled={saving} onClick={saveTransaction}>Kaydet</button></footer>
                </section>
              ) : null}

              <section className="ccw-section">
                <header><h3>Cari hareketler</h3><span>{movements.length} kayıt</span></header>
                {!canUseCari ? (
                  <div className="ccw-mini-empty">Bu firma peşin/cari takipsiz. Gider ve KDV kayıtları muhasebe raporlarından takip edilir; borç bakiyesi oluşmaz.</div>
                ) : detailLoading ? <div className="ccw-empty">Hareketler yükleniyor…</div> : movements.length ? (
                  <div className="ccw-table-wrap compact"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge No</th><th>Açıklama</th><th>Borç</th><th>Alacak</th><th>Bakiye</th><th>Kayıt</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{dateText(movement.movement_date || movement.date)}</td><td>{movementTypeLabel(movement.movement_type || movement.type)}</td><td>{movement.document_no || "-"}</td><td>{movement.description || "-"}</td><td>{money(movement.debit)}</td><td>{money(movement.credit)}</td><td><strong>{money(movement.balance_after)}</strong></td><td>{normalize(movement.record_type).includes("GAYRI") ? "Gayri resmî" : "Resmî"}</td></tr>)}</tbody></table></div>
                ) : <div className="ccw-mini-empty">Bu firma için cari hareket bulunamadı.</div>}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
