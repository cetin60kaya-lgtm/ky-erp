import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  CircleAlert,
  FileClock,
  Save,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useActiveCompany } from "../../../context/ActiveCompanyContext";
import {
  getAylikPersonel,
  getAylikSozlesmeler,
  saveAylikSozlesme,
  updateAylikPersonel,
} from "../../../services/ikApi";
import "./monthly-salary-contract-workspace.css";

const ROUTES = new Set([
  "/ik/maas-sozlesme",
  "/ik/ay-maas-sozlesme",
  "/ik/monthly-contract",
]);

function toNumber(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function normalizePerson(row = {}) {
  return {
    ...row,
    id: row.id || "",
    fullName: row.fullName || row.adSoyad || "",
    personnelCode: row.personnelCode || row.code || "",
    department: row.department || "",
    title: row.title || "",
    sgkStatus: row.sgkStatus === "YOK" ? "YOK" : "VAR",
    status: row.status || "Aktif",
    startDate: dateOnly(row.startDate || row.hireDate),
    salary: toNumber(row.salary),
    roadAllowance: toNumber(row.roadAllowance),
    paymentChannel: row.paymentChannel || row.bankPaymentType || "Banka + Elden",
    bankAmount: toNumber(row.bankAmount),
    cashAmount: toNumber(row.cashAmount),
    overtimeBaseHours: toNumber(row.overtimeBaseHours || row.overtimeHourlyBase || 225),
    note: row.note || "",
  };
}

function initials(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR");
}

function calculateDistribution(form) {
  const total = Math.max(0, toNumber(form.salary) + toNumber(form.roadAllowance));
  if (form.sgkStatus === "YOK" || form.paymentChannel === "Elden") {
    return { total, bank: 0, cash: total };
  }
  if (form.paymentChannel === "Banka") {
    return { total, bank: total, cash: 0 };
  }
  const requestedBank = Math.max(0, toNumber(form.bankAmount));
  const bank = Math.min(total, requestedBank || Math.min(total, 28075.5));
  return { total, bank, cash: Math.max(0, total - bank) };
}

function personPayload(form, activeCompany, distribution) {
  return {
    mainCompanyId: activeCompany?.slug || activeCompany?.id || "mecit-hakan",
    personnelCode: form.personnelCode,
    code: form.personnelCode,
    fullName: form.fullName,
    department: form.department,
    title: form.title,
    workType: form.workType || "Aylık",
    sgkStatus: form.sgkStatus,
    status: form.status,
    startDate: form.startDate || null,
    hireDate: form.startDate || null,
    salary: toNumber(form.salary),
    roadAllowance: toNumber(form.roadAllowance),
    paymentChannel: form.sgkStatus === "YOK" ? "Elden" : form.paymentChannel,
    bankPaymentType: form.sgkStatus === "YOK" ? "Elden" : form.paymentChannel,
    bankAmount: distribution.bank,
    cashAmount: distribution.cash,
    annualLeaveEntitlement: toNumber(form.annualLeaveEntitlement || 14),
    annualLeaveCarryover: toNumber(form.annualLeaveCarryover),
    overtimeBaseHours: toNumber(form.overtimeBaseHours || 225),
    overtimeHourlyBase: toNumber(form.overtimeBaseHours || 225),
    note: form.note || "",
  };
}

export default function MonthlySalaryContractWorkspace() {
  const { activeCompany } = useActiveCompany();
  const [host, setHost] = useState(null);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(null);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [contract, setContract] = useState({
    startDate: "",
    endDate: "",
    contractType: "Belirsiz süreli",
    effectiveDate: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const active = ROUTES.has(pathname);

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    const resolve = () => setHost(document.querySelector(".main-content"));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("ik-monthly-salary-active", active);
    return () => document.body.classList.remove("ik-monthly-salary-active");
  }, [active]);

  const loadPeople = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError("");
    try {
      const data = await getAylikPersonel({
        mainCompanyId: activeCompany?.slug || activeCompany?.id,
      });
      const normalized = (Array.isArray(data) ? data : []).map(normalizePerson);
      setPeople(normalized);
      setSelectedId((current) =>
        normalized.some((person) => person.id === current)
          ? current
          : normalized[0]?.id || "",
      );
    } catch (loadError) {
      setError(loadError?.message || "Aylık personel listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [active, activeCompany?.id, activeCompany?.slug]);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const selected = people.find((person) => person.id === selectedId) || null;

  useEffect(() => {
    if (!selected) {
      setForm(null);
      setHistory([]);
      return;
    }
    setForm(selected);
    setContract((current) => ({
      ...current,
      startDate: current.startDate || selected.startDate || "",
    }));
    let cancelled = false;
    getAylikSozlesmeler(selected.id)
      .then((rows) => {
        if (!cancelled) setHistory(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const visiblePeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return people;
    return people.filter((person) =>
      `${person.fullName} ${person.personnelCode} ${person.department} ${person.title}`
        .toLocaleLowerCase("tr-TR")
        .includes(needle),
    );
  }, [people, query]);

  const distribution = useMemo(
    () => calculateDistribution(form || {}),
    [form],
  );

  const save = async () => {
    if (!form?.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateAylikPersonel(
        form.id,
        personPayload(form, activeCompany, distribution),
      );
      const normalized = normalizePerson(updated || {
        ...form,
        bankAmount: distribution.bank,
        cashAmount: distribution.cash,
      });
      setPeople((current) =>
        current.map((person) => (person.id === normalized.id ? normalized : person)),
      );
      setForm(normalized);
      setNotice("Maaş ve ödeme bilgileri güncellendi.");
    } catch (saveError) {
      setError(saveError?.message || "Maaş bilgileri kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const addHistory = async () => {
    if (!form?.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveAylikSozlesme(form.id, {
        startDate: contract.startDate || null,
        endDate: contract.endDate || null,
        contractType: contract.contractType,
        effectiveDate: contract.effectiveDate || null,
        salary: toNumber(form.salary),
        roadAllowance: toNumber(form.roadAllowance),
        bankAmount: distribution.bank,
        cashAmount: distribution.cash,
        paymentChannel: form.sgkStatus === "YOK" ? "Elden" : form.paymentChannel,
        note: contract.note || "Maaş ve sözleşme güncellemesi",
      });
      setHistory((current) => [saved, ...current.filter((row) => row?.id !== saved?.id)]);
      setNotice("Maaş ve sözleşme geçmişine yeni kayıt eklendi.");
    } catch (saveError) {
      setError(saveError?.message || "Sözleşme geçmişi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  if (!active || !host) return null;

  return createPortal(
    <section className="iksc-workspace">
      <header className="iksc-header">
        <div>
          <span>AYLIK İK</span>
          <h1>Maaş ve Sözleşme</h1>
          <p>Personel maaşı, yol ödemesi, banka/elden dağılımı ve sözleşme geçmişi.</p>
        </div>
        <button type="button" className="iksc-primary" onClick={save} disabled={busy || !form}>
          <Save size={17} /> {busy ? "Kaydediliyor..." : "Maaşı Kaydet"}
        </button>
      </header>

      {notice ? <div className="iksc-notice"><BadgeCheck size={17} />{notice}</div> : null}
      {error ? <div className="iksc-error"><CircleAlert size={17} />{error}</div> : null}

      <div className="iksc-layout">
        <aside className="iksc-people">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Personel ara" /></label>
          <small>{visiblePeople.length} / {people.length} personel</small>
          <div>
            {loading ? <p>Yükleniyor...</p> : null}
            {visiblePeople.map((person) => (
              <button key={person.id} type="button" className={person.id === selectedId ? "active" : ""} onClick={() => { setSelectedId(person.id); setNotice(""); setError(""); }}>
                <b>{initials(person.fullName)}</b>
                <span><strong>{person.fullName}</strong><small>{person.personnelCode} · {person.department || "Departman yok"}</small></span>
                <em>{person.sgkStatus}</em>
              </button>
            ))}
          </div>
        </aside>

        <main className="iksc-main">
          {!form ? <div className="iksc-empty">İşlem yapılacak personeli seçin.</div> : (
            <>
              <div className="iksc-summary">
                <article><UserRound size={20} /><span>Personel<strong>{form.fullName}</strong><small>{form.title || "Görev belirtilmemiş"}</small></span></article>
                <article><WalletCards size={20} /><span>Toplam hakediş<strong>{money(distribution.total)}</strong><small>Maaş + yol</small></span></article>
                <article><Banknote size={20} /><span>Banka<strong>{money(distribution.bank)}</strong><small>{form.sgkStatus === "YOK" ? "SGK yok, banka kapalı" : form.paymentChannel}</small></span></article>
                <article><BriefcaseBusiness size={20} /><span>Elden<strong>{money(distribution.cash)}</strong><small>Kalan ödeme</small></span></article>
              </div>

              <section className="iksc-card">
                <div className="iksc-card-head"><h2><Banknote size={18} /> Maaş ve Ödeme Bilgileri</h2></div>
                <div className="iksc-form-grid">
                  <label><span>Maaş</span><input type="number" value={form.salary} onChange={(event) => setForm({ ...form, salary: toNumber(event.target.value) })} /></label>
                  <label><span>Yol</span><input type="number" value={form.roadAllowance} onChange={(event) => setForm({ ...form, roadAllowance: toNumber(event.target.value) })} /></label>
                  <label><span>SGK</span><select value={form.sgkStatus} onChange={(event) => setForm({ ...form, sgkStatus: event.target.value, paymentChannel: event.target.value === "YOK" ? "Elden" : form.paymentChannel })}><option>VAR</option><option>YOK</option></select></label>
                  <label><span>Ödeme kanalı</span><select value={form.sgkStatus === "YOK" ? "Elden" : form.paymentChannel} disabled={form.sgkStatus === "YOK"} onChange={(event) => setForm({ ...form, paymentChannel: event.target.value })}><option>Elden</option><option>Banka</option><option>Banka + Elden</option></select></label>
                  <label><span>Banka tutarı</span><input type="number" value={distribution.bank} disabled={form.paymentChannel !== "Banka + Elden" || form.sgkStatus === "YOK"} onChange={(event) => setForm({ ...form, bankAmount: toNumber(event.target.value) })} /></label>
                  <label><span>Elden kalan</span><input value={money(distribution.cash)} readOnly /></label>
                  <label><span>Mesai saat tabanı</span><input type="number" value={form.overtimeBaseHours} onChange={(event) => setForm({ ...form, overtimeBaseHours: toNumber(event.target.value) })} /></label>
                  <label><span>İşe giriş tarihi</span><input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
                </div>
              </section>

              <section className="iksc-card">
                <div className="iksc-card-head"><h2><CalendarDays size={18} /> Sözleşme Kaydı</h2><button type="button" onClick={addHistory} disabled={busy}><FileClock size={16} /> Geçmişe Ekle</button></div>
                <div className="iksc-form-grid">
                  <label><span>Başlangıç</span><input type="date" value={contract.startDate} onChange={(event) => setContract({ ...contract, startDate: event.target.value })} /></label>
                  <label><span>Bitiş</span><input type="date" value={contract.endDate} onChange={(event) => setContract({ ...contract, endDate: event.target.value })} /></label>
                  <label><span>Sözleşme türü</span><select value={contract.contractType} onChange={(event) => setContract({ ...contract, contractType: event.target.value })}><option>Belirsiz süreli</option><option>Belirli süreli</option><option>Deneme süreli</option><option>Kısmi süreli</option></select></label>
                  <label><span>Geçerlilik tarihi</span><input type="date" value={contract.effectiveDate} onChange={(event) => setContract({ ...contract, effectiveDate: event.target.value })} /></label>
                  <label className="wide"><span>Açıklama</span><textarea value={contract.note} onChange={(event) => setContract({ ...contract, note: event.target.value })} placeholder="Maaş artışı, sözleşme yenileme veya ödeme notu" /></label>
                </div>
              </section>

              <section className="iksc-card">
                <div className="iksc-card-head"><h2><FileClock size={18} /> Maaş ve Sözleşme Geçmişi</h2></div>
                <div className="iksc-table-wrap">
                  <table>
                    <thead><tr><th>Geçerlilik</th><th>Sözleşme</th><th>Maaş</th><th>Yol</th><th>Banka</th><th>Elden</th><th>Açıklama</th></tr></thead>
                    <tbody>
                      {history.length ? history.map((row, index) => (
                        <tr key={row?.id || `${row?.effectiveDate}-${index}`}>
                          <td>{dateOnly(row?.effectiveDate || row?.createdAt) || "-"}</td>
                          <td>{row?.contractType || "-"}</td>
                          <td>{money(row?.salary)}</td>
                          <td>{money(row?.roadAllowance)}</td>
                          <td>{money(row?.bankAmount)}</td>
                          <td>{money(row?.cashAmount)}</td>
                          <td>{row?.note || "-"}</td>
                        </tr>
                      )) : <tr><td colSpan="7">Henüz maaş veya sözleşme geçmişi yok.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </section>,
    host,
  );
}
