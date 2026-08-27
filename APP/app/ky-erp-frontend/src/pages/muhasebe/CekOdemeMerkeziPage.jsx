import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  FileImage,
  Plus,
  RefreshCw,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import {
  createOdemeCek,
  createOdemeFirma,
  createOdemeKart,
  getOdemeCekOzeti,
  getOdemeFirmaAcikBorclar,
  getOdemeFirmaHareketler,
  getOdemeFirmaKartlar,
  getOdemeFirmaNakitHavale,
  getOdemeFirmaOzet,
  getOdemeFirmalar,
  odemeCekDosyaUrl,
  saveOdemeIslem,
  uploadOdemeCekDosyalari,
} from "../../services/cekOdemeApi";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
import "./CekOdemeMerkeziPage.css";

const today = new Date().toISOString().slice(0, 10);

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
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.liste)) return value.liste;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "").replace(/[₺\s]/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
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

function daysUntil(value) {
  if (!value) return null;
  const due = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.ceil((due.getTime() - todayLocal.getTime()) / 86400000);
}

function firmName(row) {
  return row?.firmaAdi || row?.name || row?.firma || "Firma";
}

function emptyCheckForm(firmId = "") {
  return {
    firmId,
    issueDate: today,
    dueDate: today,
    bankName: "",
    accountNo: "",
    checkNo: "",
    amount: "",
    checkOwnership: "CUSTOMER_CHECK",
    checkDirection: "RECEIVED",
    workType: "OFFICIAL",
    note: "",
    front: null,
    back: null,
    receipt: null,
  };
}

function emptyFirmForm() {
  return {
    name: "",
    firmType: "CUSTOMER",
    workType: "OFFICIAL",
    taxNo: "",
    phone: "",
    email: "",
    note: "",
  };
}

function emptyTransactionForm() {
  return {
    firmId: "",
    transactionDirection: "PAYMENT_OUT",
    paymentMethod: "TRANSFER",
    paymentDate: today,
    amount: "",
    description: "",
    bankName: "",
  };
}

function emptyCardForm() {
  return {
    firmId: "",
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

function Modal({ title, size = "", children, onClose, actions }) {
  return (
    <div className="check-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`check-modal ${size}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="check-modal-head">
          <h2>{title}</h2>
          <button className="check-btn" type="button" onClick={onClose} aria-label="Kapat">
            <X size={17} />
          </button>
        </header>
        <div className="check-modal-body">{children}</div>
        <footer className="check-modal-actions">{actions}</footer>
      </section>
    </div>
  );
}

export default function CekOdemeMerkeziPage({ activeMainCompany, refreshKey, reloadAll }) {
  const baseParams = useMemo(() => companyParams(activeMainCompany), [activeMainCompany]);
  const [firms, setFirms] = useState([]);
  const [overview, setOverview] = useState({ summary: {}, months: [], rows: [] });
  const [selectedFirmId, setSelectedFirmId] = useState("");
  const [firmSummary, setFirmSummary] = useState(null);
  const [detailRows, setDetailRows] = useState({ debts: [], cards: [], cash: [], movements: [] });
  const [detailTab, setDetailTab] = useState("debts");
  const [search, setSearch] = useState("");
  const [firmSearch, setFirmSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [monthFilter, setMonthFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadBase = useCallback(async () => {
    const tenant = baseParams.mainCompanySlug || baseParams.mainCompanyId || "main";
    const result = await loadModuleData({
      scope: `muhasebe:${tenant}:cek-odeme`,
      sources: {
        overview: { critical: true, load: () => getOdemeCekOzeti({ ...baseParams, _ts: Date.now() }) },
        firms: { fallback: [], load: () => getOdemeFirmalar({ ...baseParams, active: "all", limit: 500, _ts: Date.now() }) },
      },
    });
    if (result.states.firms.status !== "error") {
      const firmRows = asArray(result.data.firms);
      setFirms(firmRows);
      setSelectedFirmId((current) => current && firmRows.some((row) => String(row.id || row.firmaId) === String(current)) ? current : "");
    }
    if (result.states.overview.status !== "error") {
      const overviewResult = result.data.overview;
      setOverview({ summary: overviewResult?.summary || {}, months: asArray(overviewResult?.months), rows: asArray(overviewResult?.rows) });
    }
    const warning = moduleLoadMessage(result, "Çek ve ödeme ana özeti alınamadı; son başarılı özet korunuyor.", "Firma yardımcı listesi yenilenemedi; çek özeti kullanılabilir.");
    if (warning) setNotice({ tone: result.hasCriticalError ? "error" : "warning", text: warning });
  }, [baseParams]);

  const loadFirm = useCallback(
    async (firmId) => {
      if (!firmId) {
        setFirmSummary(null);
        setDetailRows({ debts: [], cards: [], cash: [], movements: [] });
        return;
      }
      const tenant = baseParams.mainCompanySlug || baseParams.mainCompanyId || "main";
      const result = await loadModuleData({
        scope: `muhasebe:${tenant}:cek-odeme:firma:${firmId}`,
        sources: {
          summary: { critical: true, load: () => getOdemeFirmaOzet(firmId, baseParams) },
          debts: { fallback: [], load: () => getOdemeFirmaAcikBorclar(firmId, baseParams) },
          cards: { fallback: [], load: () => getOdemeFirmaKartlar(firmId, baseParams) },
          cash: { fallback: [], load: () => getOdemeFirmaNakitHavale(firmId, baseParams) },
          movements: { fallback: [], load: () => getOdemeFirmaHareketler(firmId, baseParams) },
        },
      });
      if (result.states.summary.status !== "error") setFirmSummary(result.data.summary || null);
      setDetailRows((current) => ({
        debts: result.states.debts.status === "error" ? current.debts : asArray(result.data.debts),
        cards: result.states.cards.status === "error" ? current.cards : asArray(result.data.cards),
        cash: result.states.cash.status === "error" ? current.cash : asArray(result.data.cash),
        movements: result.states.movements.status === "error" ? current.movements : asArray(result.data.movements),
      }));
      const warning = moduleLoadMessage(result, "Firma ödeme özeti alınamadı; son başarılı detay korunuyor.", "Bazı ödeme detayları yenilenemedi; diğer firma bilgileri kullanılabilir.");
      if (warning) setNotice({ tone: result.hasCriticalError ? "error" : "warning", text: warning });
    },
    [baseParams],
  );

  useEffect(() => {
    loadBase().catch((error) =>
      setNotice({ tone: "error", text: error?.message || "Çek merkezi yüklenemedi." }),
    );
  }, [loadBase, refreshKey]);

  useEffect(() => {
    loadFirm(selectedFirmId).catch((error) =>
      setNotice({ tone: "error", text: error?.message || "Cari detayı yüklenemedi." }),
    );
  }, [selectedFirmId, loadFirm, refreshKey]);

  useEffect(() => {
    const quick = new URLSearchParams(window.location.search).get("quick");
    if (quick === "cek") setModal({ type: "check", form: emptyCheckForm() });
    if (quick === "cari") setModal({ type: "firm", form: emptyFirmForm() });
  }, []);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return overview.rows.filter((row) => {
      const haystack = [row.firmaAdi, row.checkNo, row.bankName, row.accountNo, row.note]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      const open = row.open !== false && !["PAID", "CANCELLED"].includes(String(row.status || "").toUpperCase());
      if (term && !haystack.includes(term)) return false;
      if (statusFilter === "OPEN" && !open) return false;
      if (statusFilter === "OVERDUE" && Number(row.daysRemaining) >= 0) return false;
      if (statusFilter === "PAID" && open) return false;
      if (monthFilter && String(row.monthKey || "") !== monthFilter) return false;
      return true;
    });
  }, [overview.rows, search, statusFilter, monthFilter]);

  const visibleFirms = useMemo(() => {
    const term = firmSearch.trim().toLocaleLowerCase("tr-TR");
    return firms.filter((row) =>
      [firmName(row), row.taxNo, row.vergiNo, row.shortName]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(term),
    );
  }, [firms, firmSearch]);

  const refreshAll = async () => {
    await loadBase();
    await loadFirm(selectedFirmId);
    reloadAll?.();
  };

  const saveFirm = async () => {
    const returnToCheck = modal?.returnToCheck === true;
    const previousCheckForm = modal?.checkForm || null;
    setBusy(true);
    setNotice(null);
    try {
      const created = await createOdemeFirma({ ...baseParams, ...modal.form });
      const firmId = created?.id || created?.firmaId || "";
      setNotice({ tone: "ok", text: "Firma/cari kaydedildi." });
      await loadBase();
      if (firmId) setSelectedFirmId(firmId);
      if (returnToCheck && previousCheckForm && firmId) {
        setModal({
          type: "check",
          form: { ...previousCheckForm, firmId },
        });
      } else {
        setModal(null);
      }
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Firma kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  };

  const saveCheck = async () => {
    const form = modal.form;
    if (!form.firmId) return setNotice({ tone: "error", text: "Çek için firma seçimi zorunludur." });
    if (!form.checkNo || !form.bankName || numberValue(form.amount) <= 0) {
      return setNotice({ tone: "error", text: "Banka, çek no ve tutar zorunludur." });
    }
    setBusy(true);
    setNotice(null);
    try {
      const created = await createOdemeCek({
        ...baseParams,
        ...form,
        amount: numberValue(form.amount),
        checkType:
          form.checkDirection === "RECEIVED"
            ? form.checkOwnership === "OWN_CHECK"
              ? "KENDI_CEKIMIZ_ALINAN"
              : "MUSTERI_CEKI_ALINAN"
            : form.checkOwnership === "OWN_CHECK"
              ? "KENDI_CEKIMIZ_VERILEN"
              : "MUSTERI_CEKI_VERILEN",
      });
      const checkId = created?.id;
      if (checkId && (form.front || form.back || form.receipt)) {
        await uploadOdemeCekDosyalari(checkId, activeMainCompany, {
          front: form.front,
          back: form.back,
          receipt: form.receipt,
        });
      }
      setModal(null);
      setNotice({ tone: "ok", text: "Çek kaydı ve ekleri kaydedildi." });
      await refreshAll();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Çek kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  };

  const saveTransaction = async () => {
    const form = modal.form;
    if (!form.firmId || numberValue(form.amount) <= 0) {
      return setNotice({ tone: "error", text: "Firma ve tutar zorunludur." });
    }
    setBusy(true);
    try {
      await saveOdemeIslem({ ...baseParams, ...form, amount: numberValue(form.amount) });
      setModal(null);
      setNotice({ tone: "ok", text: "Ödeme/tahsilat kaydedildi." });
      await refreshAll();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşlem kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  };

  const saveCard = async () => {
    const form = modal.form;
    if (!form.firmId || !form.cardName || !form.lastFourDigits) {
      return setNotice({ tone: "error", text: "Firma, kart adı ve son 4 hane zorunludur." });
    }
    setBusy(true);
    try {
      await createOdemeKart({
        ...baseParams,
        ...form,
        totalDebt: numberValue(form.totalDebt),
        limit: numberValue(form.limit),
        availableLimit: numberValue(form.availableLimit),
      });
      setModal(null);
      setNotice({ tone: "ok", text: "Kredi kartı kaydedildi." });
      await refreshAll();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Kart kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  };

  const summary = overview.summary || {};
  const activeDetailRows = detailRows[detailTab] || [];

  return (
    <div className="check-hub">
      <section className="check-hero">
        <div>
          <span className="check-kicker">ÇEK • ÖDEME • TAHSİLAT DENETİMİ</span>
          <h1>Çek Takip ve Ödeme Merkezi</h1>
          <p>
            Bu ayın vadesi, aylık toplamlar, geciken çekler, müşteri/kendi çeki ayrımı ve belge görselleri tek ekranda izlenir.
          </p>
        </div>
        <div className="check-actions">
          <button className="check-btn ghost" type="button" onClick={refreshAll}>
            <RefreshCw size={16} /> Yenile
          </button>
          <button className="check-btn ghost" type="button" onClick={() => setModal({ type: "firm", form: emptyFirmForm() })}>
            <Building2 size={16} /> Hızlı Cari Aç
          </button>
          <button className="check-btn orange" type="button" onClick={() => setModal({ type: "transaction", form: emptyTransactionForm() })}>
            <WalletCards size={16} /> Ödeme / Tahsilat
          </button>
          <button className="check-btn primary" type="button" onClick={() => setModal({ type: "check", form: emptyCheckForm(selectedFirmId) })}>
            <Plus size={16} /> Hızlı Çek Girişi
          </button>
        </div>
      </section>

      {notice ? <div className={`check-notice ${notice.tone === "error" ? "error" : ""}`}>{notice.text}</div> : null}

      <section className="check-summary-grid">
        <div className="check-summary-card warn"><span>Bu Ay Vadesi Gelen</span><strong>{money(summary.thisMonthTotal)}</strong><small>{summary.thisMonthCount || 0} çek</small></div>
        <div className="check-summary-card"><span>Gelecek Ay</span><strong>{money(summary.nextMonthTotal)}</strong><small>{summary.nextMonthCount || 0} çek</small></div>
        <div className="check-summary-card bad"><span>Vadesi Geçen</span><strong>{money(summary.overdueTotal)}</strong><small>{summary.overdueCount || 0} çek</small></div>
        <div className="check-summary-card good"><span>Açık Çek Toplamı</span><strong>{money(summary.openTotal)}</strong><small>{summary.openCount || 0} açık kayıt</small></div>
        <div className="check-summary-card"><span>Yıllık Toplam</span><strong>{money(summary.yearTotal)}</strong><small>{summary.yearCount || 0} çek</small></div>
      </section>

      <section className="check-month-strip" aria-label="Aylık çek toplamları">
        <button className={`check-month-card ${!monthFilter ? "active" : ""}`} type="button" onClick={() => setMonthFilter("")}>
          <span>TÜM AYLAR</span><b>{money(summary.openTotal)}</b><small>{summary.openCount || 0} açık çek</small>
        </button>
        {overview.months.map((month) => (
          <button key={month.monthKey} className={`check-month-card ${monthFilter === month.monthKey ? "active" : ""}`} type="button" onClick={() => setMonthFilter(month.monthKey)}>
            <span>{month.label}</span><b>{money(month.total)}</b><small>{month.count} çek</small>
          </button>
        ))}
      </section>

      <section className="check-panel">
        <header className="check-panel-head">
          <div><h2>Çek Vade Takvimi</h2><p>Varsayılan görünüm yalnız açık çekleri gösterir.</p></div>
          <div className="check-toolbar">
            <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: 11, color: "#8190a3" }} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Firma, çek no, banka veya hesap ara" style={{ paddingLeft: 32 }} /></div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="OPEN">Açık Çekler</option>
              <option value="OVERDUE">Vadesi Geçenler</option>
              <option value="PAID">Kapananlar</option>
              <option value="ALL">Tümü</option>
            </select>
          </div>
        </header>
        <div className="check-table-wrap">
          <table className="check-table">
            <thead><tr><th>Vade</th><th>Kalan Gün</th><th>Firma</th><th>Tür</th><th>Banka / Hesap</th><th>Çek No</th><th>Tutar</th><th>Durum</th><th>Not</th><th>Belgeler</th></tr></thead>
            <tbody>
              {visibleRows.map((row) => {
                const remaining = row.daysRemaining ?? daysUntil(row.dueDate || row.vade);
                const dayClass = remaining < 0 ? "overdue" : remaining <= 10 ? "close" : "";
                return (
                  <tr key={row.id}>
                    <td><strong>{shortDate(row.dueDate || row.vade)}</strong><br /><small>Kayıt: {shortDate(row.issueDate || row.createdAt)}</small></td>
                    <td><span className={`check-days ${dayClass}`}>{remaining < 0 ? `${Math.abs(remaining)} gün geçti` : `${remaining} gün`}</span></td>
                    <td><strong>{row.firmaAdi || "-"}</strong><br /><small>{row.workType === "UNOFFICIAL" ? "Gayri resmi" : "Resmi"}</small></td>
                    <td><span className="check-badge blue">{row.checkOwnership === "OWN_CHECK" ? "Kendi Çekimiz" : "Müşteri Çeki"}</span><br /><span className="check-badge">{row.checkDirection === "GIVEN" ? "Verilen" : "Alınan"}</span></td>
                    <td><strong>{row.bankName || "-"}</strong><br /><small>{row.accountNo || "Hesap no yok"}</small></td>
                    <td>{row.checkNo || "-"}</td>
                    <td className="check-money">{money(row.amount || row.tutar)}</td>
                    <td><span className={`check-badge ${row.open ? "warn" : "good"}`}>{row.open ? "Açık" : "Kapandı"}</span></td>
                    <td title={row.note || ""}>{row.note || "-"}</td>
                    <td><div className="check-file-actions">
                      {row.frontImagePath ? <button className="check-link" type="button" onClick={() => window.open(odemeCekDosyaUrl(row.id, "front", activeMainCompany), "_blank")}>Ön</button> : null}
                      {row.backImagePath ? <button className="check-link" type="button" onClick={() => window.open(odemeCekDosyaUrl(row.id, "back", activeMainCompany), "_blank")}>Arka</button> : null}
                      {row.receiptPath ? <button className="check-link" type="button" onClick={() => window.open(odemeCekDosyaUrl(row.id, "receipt", activeMainCompany), "_blank")}>Makbuz</button> : null}
                      {!row.frontImagePath && !row.backImagePath && !row.receiptPath ? <span className="check-badge">Belge yok</span> : null}
                    </div></td>
                  </tr>
                );
              })}
              {!visibleRows.length ? <tr><td colSpan="10"><div className="check-empty">Bu filtrede çek kaydı yok.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="check-panel">
        <header className="check-panel-head">
          <div><h2>Firma / Cari ve Diğer Ödemeler</h2><p>Firma yoksa hızlı cari aç; açık borç, kart ve hareketleri aynı yerden izle.</p></div>
          <button className="check-btn" type="button" onClick={() => setModal({ type: "card", form: emptyCardForm() })}><CreditCard size={16} /> Kart Kaydı</button>
        </header>
        <div className="check-detail-grid">
          <aside className="check-firm-list">
            <div className="check-firm-search"><input value={firmSearch} onChange={(event) => setFirmSearch(event.target.value)} placeholder="Firma / vergi no ara" /></div>
            {visibleFirms.slice(0, 250).map((firm) => {
              const id = firm.id || firm.firmaId;
              return <button className={`check-firm-row ${String(id) === String(selectedFirmId) ? "active" : ""}`} type="button" key={id} onClick={() => setSelectedFirmId(id)}><strong>{firmName(firm)}</strong><span>{money(firm.bakiye || firm.currentBalance)} • {firm.openCheckCount || 0} açık çek</span></button>;
            })}
          </aside>
          <div className="check-firm-detail">
            {!selectedFirmId ? <div className="check-empty">Firma seçerek cari, ödeme, kart ve açık borç detaylarını görüntüleyin.</div> : (
              <>
                <div className="check-mini-summary">
                  <div><span>Güncel Bakiye</span><b>{money(firmSummary?.guncelBakiye || firmSummary?.bakiye)}</b></div>
                  <div><span>Açık Borç</span><b>{money(firmSummary?.openDebtTotal)}</b></div>
                  <div><span>Açık Çek</span><b>{firmSummary?.openCheckCount || 0}</b></div>
                  <div><span>Kredi Kartı</span><b>{firmSummary?.openCardCount || 0}</b></div>
                </div>
                <div className="check-detail-tabs">
                  {[['debts','Açık Borçlar'],['cards','Kredi Kartları'],['cash','Nakit / Havale'],['movements','Cari Hareketler']].map(([key,label]) => <button key={key} className={detailTab === key ? "active" : ""} type="button" onClick={() => setDetailTab(key)}>{label}</button>)}
                </div>
                <div className="check-table-wrap" style={{ maxHeight: 300 }}>
                  <table className="check-table" style={{ minWidth: 720 }}><thead><tr><th>Tarih</th><th>Belge / Kaynak</th><th>Açıklama</th><th>Tutar</th><th>Durum</th></tr></thead><tbody>
                    {activeDetailRows.map((row) => <tr key={row.id || `${row.belgeNo}-${row.tarih}`}><td>{shortDate(row.tarih || row.vade || row.sonIslem)}</td><td>{row.belgeNo || row.cekNo || row.kartAdi || row.islemTuru || "-"}</td><td>{row.aciklama || row.description || row.banka || "-"}</td><td className="check-money">{money(row.kalanTutar ?? row.acikTutar ?? row.tutar ?? row.amount)}</td><td>{row.durum || row.status || "-"}</td></tr>)}
                    {!activeDetailRows.length ? <tr><td colSpan="5"><div className="check-empty">Kayıt bulunamadı.</div></td></tr> : null}
                  </tbody></table>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {modal?.type === "check" ? (
        <Modal title="Hızlı Çek Girişi" onClose={() => setModal(null)} actions={<><button className="check-btn" type="button" onClick={() => setModal(null)}>Vazgeç</button><button className="check-btn primary" type="button" disabled={busy} onClick={saveCheck}><CheckCircle2 size={16} /> Kaydet</button></>}>
          <div className="check-form-grid">
            <label className="check-field two"><span>Firma / Cari</span><select value={modal.form.firmId} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, firmId: e.target.value } }))}><option value="">Firma seçin</option>{firms.map((firm) => <option key={firm.id || firm.firmaId} value={firm.id || firm.firmaId}>{firmName(firm)}</option>)}</select></label>
            <div className="check-field"><span>Firma yoksa</span><button className="check-btn" type="button" onClick={() => setModal({ type: "firm", form: emptyFirmForm(), returnToCheck: true, checkForm: modal.form })}><Building2 size={15} /> Hızlı Cari Aç</button></div>
            <label className="check-field"><span>Verilen Tarih</span><input type="date" value={modal.form.issueDate} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, issueDate: e.target.value } }))} /></label>
            <label className="check-field"><span>Çek Vade Tarihi</span><input type="date" value={modal.form.dueDate} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, dueDate: e.target.value } }))} /></label>
            <label className="check-field"><span>Miktar</span><input value={modal.form.amount} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, amount: e.target.value } }))} placeholder="0,00" /></label>
            <label className="check-field"><span>Banka</span><input value={modal.form.bankName} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, bankName: e.target.value } }))} /></label>
            <label className="check-field"><span>Hesap No</span><input value={modal.form.accountNo} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, accountNo: e.target.value } }))} /></label>
            <label className="check-field"><span>Çek No</span><input value={modal.form.checkNo} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, checkNo: e.target.value } }))} /></label>
            <label className="check-field"><span>Çek Sahibi</span><select value={modal.form.checkOwnership} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, checkOwnership: e.target.value } }))}><option value="CUSTOMER_CHECK">Müşteri Çeki</option><option value="OWN_CHECK">Kendi Çekimiz</option></select></label>
            <label className="check-field"><span>İşlem Yönü</span><select value={modal.form.checkDirection} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, checkDirection: e.target.value } }))}><option value="RECEIVED">Alınan Çek</option><option value="GIVEN">Verilen Çek</option></select></label>
            <label className="check-field"><span>Resmi / Gayri</span><select value={modal.form.workType} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, workType: e.target.value } }))}><option value="OFFICIAL">Resmi</option><option value="UNOFFICIAL">Gayri Resmi</option></select></label>
            <label className="check-field wide"><span>Çek Notu</span><textarea value={modal.form.note} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, note: e.target.value } }))} placeholder="Karşılığı, açıklama veya özel not" /></label>
            <div className="check-file-grid">
              {[['front','Çek Ön Görseli'],['back','Çek Arka Görseli'],['receipt','Tahsilat Makbuzu']].map(([key,label]) => <label className="check-file-box" key={key}><b><FileImage size={15} /> {label}</b><input type="file" accept="image/*,.pdf" onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, [key]: e.target.files?.[0] || null } }))} /></label>)}
            </div>
          </div>
        </Modal>
      ) : null}

      {modal?.type === "firm" ? (
        <Modal title="Hızlı Firma / Cari Aç" size="small" onClose={() => setModal(null)} actions={<><button className="check-btn" type="button" onClick={() => setModal(null)}>Vazgeç</button><button className="check-btn primary" type="button" disabled={busy} onClick={saveFirm}>Cariyi Kaydet</button></>}>
          <div className="check-form-grid">
            <label className="check-field wide"><span>Firma Adı</span><input value={modal.form.name} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, name: e.target.value } }))} /></label>
            <label className="check-field"><span>Firma Tipi</span><select value={modal.form.firmType} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, firmType: e.target.value } }))}><option value="CUSTOMER">Müşteri</option><option value="SUPPLIER">Tedarikçi</option><option value="BOTH">Müşteri + Tedarikçi</option></select></label>
            <label className="check-field"><span>Resmi / Gayri</span><select value={modal.form.workType} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, workType: e.target.value } }))}><option value="OFFICIAL">Resmi</option><option value="UNOFFICIAL">Gayri Resmi</option><option value="BOTH">İkisi</option></select></label>
            <label className="check-field"><span>Vergi No</span><input value={modal.form.taxNo} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, taxNo: e.target.value } }))} /></label>
            <label className="check-field"><span>Telefon</span><input value={modal.form.phone} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, phone: e.target.value } }))} /></label>
            <label className="check-field two"><span>E-posta</span><input value={modal.form.email} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, email: e.target.value } }))} /></label>
            <label className="check-field wide"><span>Not</span><textarea value={modal.form.note} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, note: e.target.value } }))} /></label>
          </div>
        </Modal>
      ) : null}

      {modal?.type === "transaction" ? (
        <Modal title="Hızlı Ödeme / Tahsilat" size="small" onClose={() => setModal(null)} actions={<><button className="check-btn" type="button" onClick={() => setModal(null)}>Vazgeç</button><button className="check-btn primary" type="button" disabled={busy} onClick={saveTransaction}>İşlemi Kaydet</button></>}>
          <div className="check-form-grid">
            <label className="check-field wide"><span>Firma</span><select value={modal.form.firmId} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, firmId: e.target.value } }))}><option value="">Firma seçin</option>{firms.map((firm) => <option key={firm.id || firm.firmaId} value={firm.id || firm.firmaId}>{firmName(firm)}</option>)}</select></label>
            <label className="check-field"><span>Yön</span><select value={modal.form.transactionDirection} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, transactionDirection: e.target.value } }))}><option value="PAYMENT_OUT">Ödeme Yaptım</option><option value="COLLECTION_IN">Tahsilat Aldım</option></select></label>
            <label className="check-field"><span>Şekil</span><select value={modal.form.paymentMethod} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, paymentMethod: e.target.value } }))}><option value="TRANSFER">Havale / EFT</option><option value="CASH">Nakit</option><option value="CARD">Kredi Kartı</option><option value="CHECK">Çek</option></select></label>
            <label className="check-field"><span>Tarih</span><input type="date" value={modal.form.paymentDate} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, paymentDate: e.target.value } }))} /></label>
            <label className="check-field"><span>Tutar</span><input value={modal.form.amount} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, amount: e.target.value } }))} /></label>
            <label className="check-field two"><span>Banka</span><input value={modal.form.bankName} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, bankName: e.target.value } }))} /></label>
            <label className="check-field wide"><span>Açıklama</span><textarea value={modal.form.description} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, description: e.target.value } }))} /></label>
          </div>
        </Modal>
      ) : null}

      {modal?.type === "card" ? (
        <Modal title="Kredi Kartı Kaydı" size="small" onClose={() => setModal(null)} actions={<><button className="check-btn" type="button" onClick={() => setModal(null)}>Vazgeç</button><button className="check-btn primary" type="button" disabled={busy} onClick={saveCard}>Kartı Kaydet</button></>}>
          <div className="check-form-grid">
            <label className="check-field wide"><span>Firma</span><select value={modal.form.firmId} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, firmId: e.target.value } }))}><option value="">Firma seçin</option>{firms.map((firm) => <option key={firm.id || firm.firmaId} value={firm.id || firm.firmaId}>{firmName(firm)}</option>)}</select></label>
            <label className="check-field"><span>Kart Adı</span><input value={modal.form.cardName} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, cardName: e.target.value } }))} /></label>
            <label className="check-field"><span>Banka</span><input value={modal.form.bankName} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, bankName: e.target.value } }))} /></label>
            <label className="check-field"><span>Son 4 Hane</span><input maxLength="4" value={modal.form.lastFourDigits} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, lastFourDigits: e.target.value.replace(/\D/g, "").slice(0, 4) } }))} /></label>
            <label className="check-field"><span>Toplam Borç</span><input value={modal.form.totalDebt} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, totalDebt: e.target.value } }))} /></label>
            <label className="check-field"><span>Limit</span><input value={modal.form.limit} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, limit: e.target.value } }))} /></label>
            <label className="check-field"><span>Kullanılabilir</span><input value={modal.form.availableLimit} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, availableLimit: e.target.value } }))} /></label>
            <label className="check-field"><span>Son Ödeme</span><input type="date" value={modal.form.dueDate} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, dueDate: e.target.value } }))} /></label>
            <label className="check-field wide"><span>Not</span><textarea value={modal.form.note} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, note: e.target.value } }))} /></label>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
