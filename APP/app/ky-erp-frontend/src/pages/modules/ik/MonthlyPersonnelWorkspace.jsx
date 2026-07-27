import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  CircleAlert,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useActiveCompany } from "../../../context/ActiveCompanyContext";
import {
  createAylikPersonel,
  getAylikPersonel,
  updateAylikPersonel,
} from "../../../services/ikApi";
import "./monthly-personnel-workspace.css";

const DEFAULT_FORM = {
  id: "",
  personnelCode: "",
  fullName: "",
  department: "",
  title: "",
  workType: "Aylık",
  sgkStatus: "VAR",
  status: "Aktif",
  startDate: "",
  salary: 0,
  roadAllowance: 0,
  paymentChannel: "Banka + Elden",
  annualLeaveEntitlement: 14,
  annualLeaveCarryover: 0,
  overtimeBaseHours: 225,
  note: "",
};

function number(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(number(value));
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function normalize(row = {}) {
  return {
    ...DEFAULT_FORM,
    ...row,
    id: row.id || "",
    personnelCode: row.personnelCode || row.code || "",
    fullName: row.fullName || row.adSoyad || "",
    startDate: dateOnly(row.startDate || row.hireDate),
    salary: number(row.salary),
    roadAllowance: number(row.roadAllowance),
    annualLeaveEntitlement: number(row.annualLeaveEntitlement ?? 14),
    annualLeaveCarryover: number(row.annualLeaveCarryover),
    overtimeBaseHours: number(row.overtimeBaseHours || row.overtimeHourlyBase || 225),
    paymentChannel: row.paymentChannel || row.bankPaymentType || "Banka + Elden",
    sgkStatus: row.sgkStatus === "YOK" ? "YOK" : "VAR",
    status: row.status || "Aktif",
  };
}

function payload(form, company) {
  const sgkCovered = form.sgkStatus !== "YOK";
  const paymentChannel = sgkCovered ? form.paymentChannel : "Elden";
  return {
    mainCompanyId: company?.slug || company?.id || "mecit-hakan",
    personnelCode: form.personnelCode,
    code: form.personnelCode,
    fullName: form.fullName.trim(),
    department: form.department.trim(),
    title: form.title.trim(),
    workType: form.workType,
    sgkStatus: form.sgkStatus,
    status: form.status,
    startDate: form.startDate || null,
    hireDate: form.startDate || null,
    salary: number(form.salary),
    roadAllowance: number(form.roadAllowance),
    paymentChannel,
    bankPaymentType: paymentChannel,
    annualLeaveEntitlement: number(form.annualLeaveEntitlement),
    annualLeaveCarryover: number(form.annualLeaveCarryover),
    overtimeBaseHours: number(form.overtimeBaseHours),
    overtimeHourlyBase: number(form.overtimeBaseHours),
    note: form.note.trim(),
  };
}

function initials(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0])
    .join("")
    .toLocaleUpperCase("tr-TR");
}

function nextCode(rows) {
  const highest = rows.reduce((max, row) => {
    const match = String(row.personnelCode || "").match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `HKN-${String(highest + 1).padStart(2, "0")}`;
}

function Field({ label, children, wide = false }) {
  return (
    <label className={wide ? "ikmp-field wide" : "ikmp-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function MonthlyPersonnelWorkspace() {
  const { activeCompany } = useActiveCompany();
  const [host, setHost] = useState(null);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(DEFAULT_FORM);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tümü");
  const [mode, setMode] = useState("view");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const active = pathname === "/ik/personel-kartlari" || pathname === "/ik/aylik-personel";

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
    document.body.classList.toggle("ik-monthly-personnel-active", active);
    return () => document.body.classList.remove("ik-monthly-personnel-active");
  }, [active]);

  const load = async () => {
    if (!active) return;
    setLoading(true);
    setError("");
    try {
      const data = await getAylikPersonel({
        mainCompanyId: activeCompany?.slug || activeCompany?.id,
      });
      const normalized = (Array.isArray(data) ? data : []).map(normalize);
      setRows(normalized);
      setSelectedId((current) =>
        normalized.some((row) => row.id === current) ? current : normalized[0]?.id || "",
      );
    } catch (loadError) {
      setError(loadError?.message || "Aylık personel listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [active, activeCompany?.slug]);

  const selected = rows.find((row) => row.id === selectedId) || null;

  useEffect(() => {
    if (mode === "view" && selected) setDraft(selected);
  }, [selectedId, selected, mode]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "Tümü" || row.status === statusFilter;
      const haystack = `${row.fullName} ${row.personnelCode} ${row.department} ${row.title}`
        .toLocaleLowerCase("tr-TR");
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [query, rows, statusFilter]);

  const startCreate = () => {
    setDraft({
      ...DEFAULT_FORM,
      personnelCode: nextCode(rows),
      startDate: new Date().toISOString().slice(0, 10),
    });
    setMode("create");
    setNotice("");
    setError("");
  };

  const startEdit = () => {
    if (!selected) return;
    setDraft(selected);
    setMode("edit");
    setNotice("");
    setError("");
  };

  const cancelEdit = () => {
    setDraft(selected || DEFAULT_FORM);
    setMode("view");
    setError("");
  };

  const save = async () => {
    if (!draft.fullName.trim()) {
      setError("Ad soyad zorunludur.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved =
        mode === "create"
          ? await createAylikPersonel(payload(draft, activeCompany))
          : await updateAylikPersonel(draft.id, payload(draft, activeCompany));
      const normalized = normalize(saved || draft);
      setRows((current) => {
        if (mode === "create") return [normalized, ...current];
        return current.map((row) => (row.id === normalized.id ? normalized : row));
      });
      setSelectedId(normalized.id);
      setDraft(normalized);
      setMode("view");
      setNotice(mode === "create" ? "Personel kartı oluşturuldu." : "Personel bilgileri güncellendi.");
    } catch (saveError) {
      setError(saveError?.message || "Personel kaydı kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!selected || selected.status === "Pasif") return;
    setBusy(true);
    setError("");
    try {
      const updated = await updateAylikPersonel(selected.id, {
        ...payload(selected, activeCompany),
        status: "Pasif",
      });
      const normalized = normalize(updated || { ...selected, status: "Pasif" });
      setRows((current) => current.map((row) => (row.id === selected.id ? normalized : row)));
      setDraft(normalized);
      setNotice("Personel güvenli şekilde pasife alındı.");
    } catch (deactivateError) {
      setError(deactivateError?.message || "Personel pasife alınamadı.");
    } finally {
      setBusy(false);
    }
  };

  if (!active || !host) return null;

  const totalSalary = rows.reduce((sum, row) => sum + number(row.salary), 0);
  const activeCount = rows.filter((row) => row.status === "Aktif").length;
  const sgkCount = rows.filter((row) => row.sgkStatus === "VAR").length;
  const editing = mode !== "view";

  return createPortal(
    <section className="ikmp-workspace">
      <header className="ikmp-header">
        <div>
          <span>AYLIK İK</span>
          <h1>Personel Kartları</h1>
          <p>Aylık çalışanların kimlik, görev, SGK, ücret ve izin bilgilerini tek merkezden yönetin.</p>
        </div>
        <button className="ikmp-primary" type="button" onClick={startCreate}>
          <Plus size={17} /> Yeni Personel
        </button>
      </header>

      <div className="ikmp-stats">
        <div><Users size={20} /><span>Toplam personel<strong>{rows.length}</strong></span></div>
        <div><BadgeCheck size={20} /><span>Aktif personel<strong>{activeCount}</strong></span></div>
        <div><ShieldCheck size={20} /><span>SGK kayıtlı<strong>{sgkCount}</strong></span></div>
        <div><Banknote size={20} /><span>Aylık maaş toplamı<strong>{money(totalSalary)}</strong></span></div>
      </div>

      {notice ? <div className="ikmp-notice"><BadgeCheck size={17} />{notice}</div> : null}
      {error ? <div className="ikmp-error"><CircleAlert size={17} />{error}</div> : null}

      <div className="ikmp-layout">
        <aside className="ikmp-list-panel">
          <div className="ikmp-list-tools">
            <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Personel, kod, görev ara" /></label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>Tümü</option><option>Aktif</option><option>Pasif</option><option>İzinli</option>
            </select>
          </div>
          <div className="ikmp-list-count">{visibleRows.length} / {rows.length} kayıt</div>
          <div className="ikmp-person-list">
            {loading ? <div className="ikmp-empty">Kayıtlar yükleniyor...</div> : null}
            {!loading && !visibleRows.length ? <div className="ikmp-empty">Filtreye uygun personel bulunamadı.</div> : null}
            {visibleRows.map((row) => (
              <button key={row.id} type="button" className={row.id === selectedId ? "active" : ""} onClick={() => { setSelectedId(row.id); setMode("view"); setNotice(""); setError(""); }}>
                <span className="ikmp-avatar">{initials(row.fullName)}</span>
                <span><strong>{row.fullName || "İsimsiz personel"}</strong><small>{row.personnelCode || "Kodsuz"} · {row.department || "Departman yok"}</small></span>
                <em className={row.status === "Aktif" ? "active" : "passive"}>{row.status}</em>
              </button>
            ))}
          </div>
        </aside>

        <main className="ikmp-detail-panel">
          {!selected && mode === "view" ? (
            <div className="ikmp-empty-detail"><UserRound size={42} /><h2>Personel seçin</h2><p>Soldaki listeden bir personel seçin veya yeni kart oluşturun.</p></div>
          ) : (
            <>
              <div className="ikmp-detail-head">
                <div className="ikmp-profile"><span className="ikmp-avatar large">{initials(draft.fullName)}</span><div><small>{mode === "create" ? "YENİ PERSONEL" : draft.personnelCode}</small><h2>{draft.fullName || "Yeni Personel"}</h2><p>{draft.department || "Departman belirtilmedi"} · {draft.title || "Görev belirtilmedi"}</p></div></div>
                <div className="ikmp-head-actions">
                  {!editing ? <button type="button" onClick={startEdit}><Pencil size={16} /> Düzenle</button> : <button type="button" onClick={cancelEdit}><X size={16} /> Vazgeç</button>}
                  {editing ? <button className="ikmp-primary" type="button" onClick={save} disabled={busy}><Save size={16} /> {busy ? "Kaydediliyor" : "Kaydet"}</button> : null}
                </div>
              </div>

              <div className="ikmp-section-title"><UserRound size={17} /> Temel Bilgiler</div>
              <div className="ikmp-form-grid">
                <Field label="Ad soyad"><input disabled={!editing} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} /></Field>
                <Field label="Personel kodu"><input disabled={!editing || mode !== "create"} value={draft.personnelCode} onChange={(e) => setDraft({ ...draft, personnelCode: e.target.value })} /></Field>
                <Field label="Departman"><input disabled={!editing} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} /></Field>
                <Field label="Görev"><input disabled={!editing} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
                <Field label="Çalışma tipi"><select disabled={!editing} value={draft.workType} onChange={(e) => setDraft({ ...draft, workType: e.target.value })}><option>Aylık</option><option>Sözleşmeli</option><option>Deneme</option></select></Field>
                <Field label="İşe giriş tarihi"><input disabled={!editing} type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></Field>
                <Field label="SGK durumu"><select disabled={!editing} value={draft.sgkStatus} onChange={(e) => setDraft({ ...draft, sgkStatus: e.target.value, paymentChannel: e.target.value === "YOK" ? "Elden" : draft.paymentChannel })}><option value="VAR">SGK'lı</option><option value="YOK">SGK'sız</option></select></Field>
                <Field label="Personel durumu"><select disabled={!editing} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option>Aktif</option><option>İzinli</option><option>Pasif</option></select></Field>
              </div>

              <div className="ikmp-section-title"><Banknote size={17} /> Ücret ve Ödeme</div>
              <div className="ikmp-form-grid">
                <Field label="Aylık maaş"><input disabled={!editing} type="number" value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: number(e.target.value) })} /></Field>
                <Field label="Yol ücreti"><input disabled={!editing} type="number" value={draft.roadAllowance} onChange={(e) => setDraft({ ...draft, roadAllowance: number(e.target.value) })} /></Field>
                <Field label="Ödeme kanalı"><select disabled={!editing || draft.sgkStatus === "YOK"} value={draft.sgkStatus === "YOK" ? "Elden" : draft.paymentChannel} onChange={(e) => setDraft({ ...draft, paymentChannel: e.target.value })}><option>Elden</option><option>Banka</option><option>Banka + Elden</option></select></Field>
                <Field label="Mesai saat tabanı"><input disabled={!editing} type="number" value={draft.overtimeBaseHours} onChange={(e) => setDraft({ ...draft, overtimeBaseHours: number(e.target.value) })} /></Field>
              </div>

              <div className="ikmp-section-title"><CalendarDays size={17} /> İzin ve Notlar</div>
              <div className="ikmp-form-grid">
                <Field label="Yıllık izin hakkı"><input disabled={!editing} type="number" value={draft.annualLeaveEntitlement} onChange={(e) => setDraft({ ...draft, annualLeaveEntitlement: number(e.target.value) })} /></Field>
                <Field label="Devreden izin"><input disabled={!editing} type="number" value={draft.annualLeaveCarryover} onChange={(e) => setDraft({ ...draft, annualLeaveCarryover: number(e.target.value) })} /></Field>
                <Field label="Personel notu" wide><textarea disabled={!editing} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
              </div>

              {!editing && selected ? (
                <div className="ikmp-summary-row">
                  <div><BriefcaseBusiness size={18} /><span>Aylık hakediş<strong>{money(number(selected.salary) + number(selected.roadAllowance))}</strong></span></div>
                  <div><CalendarDays size={18} /><span>Toplam izin hakkı<strong>{number(selected.annualLeaveEntitlement) + number(selected.annualLeaveCarryover)} gün</strong></span></div>
                  <button type="button" onClick={deactivate} disabled={busy || selected.status === "Pasif"}>Personeli Pasife Al</button>
                </div>
              ) : null}
            </>
          )}
        </main>
      </div>
    </section>,
    host,
  );
}
