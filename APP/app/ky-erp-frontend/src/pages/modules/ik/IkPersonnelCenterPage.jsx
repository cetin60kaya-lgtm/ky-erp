import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileClock,
  FileText,
  History,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  addIkTimeEvent,
  buildIkCardExport,
  createIkControlPerson,
  getIkAttendanceMonth,
  getIkControlPeople,
  getIkControlPerson,
  getIkControlProfile,
  saveIkControlChanges,
  removeIkControlPerson,
  saveIkDayOverride,
} from "../../../services/ikPersonnelControlApi";
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
import "./ik-personnel-center.css";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const TODAY = new Date().toISOString().slice(0, 10);

function money(value) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function initials(value) {
  return String(value || "").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
}

function formatDate(value) {
  const raw = String(value || "").slice(0, 10);
  const [y, m, d] = raw.split("-");
  return y && m && d ? `${d}.${m}.${y}` : "-";
}

function isPassivePerson(person = {}) {
  const status = String(person.status || person.activePassive || "").trim().toLocaleUpperCase("tr-TR");
  return status === "PASIF" || status === "PASİF" || status === "PASSIVE";
}

function nextPersonnelCode(rows = []) {
  const max = rows.reduce((current, person) => {
    const match = String(person.personnelCode || person.code || "").toLocaleUpperCase("tr-TR").match(/^HKN-?(\d+)$/);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `HKN-${String(max + 1).padStart(2, "0")}`;
}

function statusLabel(value) {
  const map = {
    CALISTI: "Çalıştı",
    YILLIK_IZIN: "Yıllık İzin",
    IZIN: "İzinli",
    RESMI_TATIL: "Resmî Tatil",
    HAFTA_SONU: "Hafta Sonu",
    KART_YOK: "Kart Yok",
    EKSIK_BASIM: "Eksik Basım",
    DEVAMSIZ: "Devamsız",
    DONEM_DISI: "Dönem Dışı",
  };
  return map[value] || value || "-";
}

function tone(value) {
  if (value === "CALISTI") return "ok";
  if (["YILLIK_IZIN", "IZIN", "RESMI_TATIL", "HAFTA_SONU"].includes(value)) return "info";
  if (value === "EKSIK_BASIM") return "warn";
  if (value === "KART_YOK" || value === "DEVAMSIZ") return "bad";
  return "muted";
}

function Accordion({ title, icon: Icon, open = false, children, actions }) {
  return (
    <details className="ikpc-accordion" open={open}>
      <summary>
        <span>{Icon ? <Icon size={17} /> : null}<strong>{title}</strong></span>
        <span className="ikpc-summary-actions">{actions}<ChevronDown size={17} /></span>
      </summary>
      <div className="ikpc-accordion-body">{children}</div>
    </details>
  );
}

function Field({ label, children, wide = false }) {
  return <label className={wide ? "ikpc-field wide" : "ikpc-field"}><span>{label}</span>{children}</label>;
}

function Stat({ label, value, sub, icon: Icon }) {
  return <article className="ikpc-stat">{Icon ? <Icon size={20} /> : null}<span><small>{label}</small><strong>{value}</strong><em>{sub}</em></span></article>;
}

function PersonList({ rows, selectedId, onSelect, query, setQuery, statusView, setStatusView }) {
  return (
    <aside className="ikpc-list">
      <label className="ikpc-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Personel, HKN kodu, kart no, görev ara" /></label>
      <select className="ikpc-status-filter" value={statusView} onChange={(e) => setStatusView(e.target.value)}>
        <option value="ACTIVE">Aktif personel</option>
        <option value="PASSIVE">Pasif personel</option>
        <option value="ALL">Tüm personel</option>
      </select>
      <div className="ikpc-list-count">{rows.length} personel</div>
      <div className="ikpc-list-scroll">
        {rows.map((person) => (
          <button key={person.id} type="button" className={person.id === selectedId ? "active" : ""} onClick={() => onSelect(person.id)}>
            <b>{initials(person.fullName)}</b>
            <span><strong>{person.fullName}</strong><small>{person.personnelCode || "Kod yok"} · {person.cardNo || "Kart yok"} · {person.department || "Departman yok"}</small></span>
            <em>{person.sgkStatus}</em>
          </button>
        ))}
      </div>
    </aside>
  );
}

export default function IkPersonnelCenterPage({ activeTab = "personel-kartlari", activeMainCompany }) {
  const now = new Date();
  const [profile, setProfile] = useState({ audit: false, scope: "FULL" });
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [query, setQuery] = useState("");
  const [statusView, setStatusView] = useState("ACTIVE");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [effectiveDate, setEffectiveDate] = useState(TODAY);
  const [changeNote, setChangeNote] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newPerson, setNewPerson] = useState({ fullName: "", personnelCode: "", cardNo: "", department: "", title: "", sgkStatus: "VAR", startDate: TODAY, salary: 0, roadAllowance: 0, annualLeaveEntitlement: 14 });
  const [eventForm, setEventForm] = useState({ workDate: TODAY, eventTime: "08:30", direction: "AUTO", note: "" });
  const [dayEdit, setDayEdit] = useState(null);
  const [exportRange, setExportRange] = useState({ startDate: TODAY.slice(0, 8) + "01", endDate: TODAY });
  const [exportPreview, setExportPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const auditMode = Boolean(profile.audit);
  const canHardDelete = ["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(String(profile.role || "").trim().toUpperCase());
  const companyKey = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";

  const loadPeople = useCallback(async () => {
    const result = await loadModuleData({
      scope: `ik:${companyKey}:personel-merkezi`,
      sources: {
        people: { critical: true, load: () => getIkControlPeople({ mainCompanyId: companyKey }) },
        profile: { fallback: { audit: false, scope: "FULL" }, load: () => getIkControlProfile() },
      },
    });
    if (result.states.profile.status !== "error") setProfile(result.data.profile || { audit: false, scope: "FULL" });
    if (result.states.people.status !== "error") {
      const list = Array.isArray(result.data.people) ? result.data.people : [];
      setPeople(list);
      setSelectedId((current) => {
        const currentRow = list.find((row) => row.id === current);
        if (currentRow && !isPassivePerson(currentRow)) return current;
        return list.find((row) => !isPassivePerson(row))?.id || list[0]?.id || "";
      });
    }
    setError(moduleLoadMessage(result, "Personel ana listesi alınamadı; son başarılı liste korunuyor.", "Yetki profili yenilenemedi; personel listesi kullanılabilir."));
  }, [companyKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPeople().catch((cause) => { if (!cancelled) setError(cause?.message || "Personel listesi alınamadı."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadPeople]);

  const loadSelected = useCallback(async () => {
    if (!selectedId) { setDetail(null); setAttendance(null); return; }
    setError("");
    const result = await loadModuleData({
      scope: `ik:${companyKey}:personel:${selectedId}:${year}:${month}`,
      sources: {
        detail: { critical: true, load: () => getIkControlPerson(selectedId) },
        attendance: { fallback: null, load: () => getIkAttendanceMonth(selectedId, { year, month, mainCompanyId: companyKey }) },
      },
    });
    if (result.states.detail.status !== "error") {
      const personDetail = result.data.detail;
      setDetail(personDetail || null);
      setDraft(personDetail?.person ? { ...personDetail.person } : null);
      setEditing(false);
    }
    if (result.states.attendance.status !== "error") setAttendance(result.data.attendance || null);
    setError(moduleLoadMessage(result, "Personel kartı alınamadı; son başarılı detay korunuyor.", "Aylık puantaj yenilenemedi; personel kartı kullanılabilir."));
  }, [companyKey, month, selectedId, year]);

  useEffect(() => {
    let cancelled = false;
    loadSelected().catch((cause) => { if (!cancelled) setError(cause?.message || "Personel detayı alınamadı."); });
    return () => { cancelled = true; };
  }, [loadSelected]);

  const visiblePeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return people.filter((person) => {
      const passive = isPassivePerson(person);
      if (statusView === "ACTIVE" && passive) return false;
      if (statusView === "PASSIVE" && !passive) return false;
      if (!needle) return true;
      return `${person.fullName} ${person.cardNo} ${person.personnelCode} ${person.department} ${person.title}`
        .toLocaleLowerCase("tr-TR").includes(needle);
    });
  }, [people, query, statusView]);

  useEffect(() => {
    if (visiblePeople.some((person) => person.id === selectedId)) return;
    setSelectedId(visiblePeople[0]?.id || "");
  }, [selectedId, visiblePeople]);

  const selected = detail?.person || null;
  const summary = attendance?.summary || {};

  const startEdit = () => {
    if (!selected || auditMode) return;
    setDraft({ ...selected });
    setEffectiveDate(TODAY);
    setChangeNote("");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selected || !draft || auditMode) return;
    const keys = ["fullName", "department", "title", "workType", "sgkStatus", "status", "startDate", "exitDate", "cardNo", "phone", "salary", "roadAllowance", "paymentChannel", "bankAmount", "cashAmount", "overtimeBaseHours", "annualLeaveEntitlement", "annualLeaveCarryover", "note"];
    const changes = {};
    keys.forEach((key) => {
      if (String(draft[key] ?? "") !== String(selected[key] ?? "")) changes[key] = draft[key];
    });
    if (!Object.keys(changes).length) { setEditing(false); setNotice("Değişiklik yok."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await saveIkControlChanges(selected.id, { effectiveDate, note: changeNote, changes });
      const refreshes = await Promise.allSettled([loadPeople(), loadSelected()]);
      setEditing(false);
      setNotice(refreshes.some((result) => result.status === "rejected")
        ? "Personel değişikliği kaydedildi; ekran bilgilerinin bir bölümü yenilenemedi."
        : "Personel değişikliği tarihli geçmiş kaydıyla kaydedildi.");
    } catch (cause) { setError(cause?.message || "Değişiklik kaydedilemedi."); }
    finally { setBusy(false); }
  };

  const openNewPerson = () => {
    setNewPerson({
      fullName: "",
      personnelCode: nextPersonnelCode(people),
      cardNo: "",
      department: "",
      title: "",
      sgkStatus: "VAR",
      startDate: TODAY,
      salary: 0,
      roadAllowance: 0,
      annualLeaveEntitlement: 14,
    });
    setNewOpen(true);
    setError("");
    setNotice("");
  };

  const removePerson = async (mode) => {
    if (!selected || auditMode) return;
    const hard = mode === "HARD";
    const targetId = selected.id;
    const targetName = selected.fullName;
    const targetCode = selected.personnelCode || "Kod yok";
    const approved = typeof window !== "undefined" && window.confirm(
      hard
        ? `${targetName} (${targetCode}) personel kaydı KALICI olarak silinecek. Yanlış/mükerrer kayıt ise onaylayın. Silinsin mi?`
        : `${targetName} (${targetCode}) pasife alınacak. Geçmiş kayıtları korunacak ve aktif listede görünmeyecek. Pasife alınsın mı?`,
    );
    if (!approved) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await removeIkControlPerson(targetId, {
        mode,
        confirmName: targetName,
        reason: hard ? "Yanlış veya mükerrer açılan personel kaydı" : "Personel kullanıcı onayıyla pasife alındı",
        mainCompanyId: companyKey,
      });
      if (hard && result?.deleted !== true) {
        throw new Error("Sunucu kalıcı silme işlemini doğrulamadı.");
      }

      setEditing(false);
      setDetail(null);
      setAttendance(null);
      setStatusView("ACTIVE");
      setSelectedId("");
      setPeople((current) => hard
        ? current.filter((person) => person.id !== targetId)
        : current.map((person) => person.id === targetId ? { ...person, status: "Pasif", activePassive: "Pasif" } : person));

      await loadPeople();
      setNotice(hard
        ? `${targetName} (${targetCode}) kalıcı olarak silindi. Aynı isimde başka kayıt varsa listede ayrıca görünür.`
        : `${targetName} (${targetCode}) pasife alındı ve aktif listeden çıkarıldı.`);
    } catch (cause) {
      setError(cause?.message || (hard ? "Personel kalıcı silinemedi." : "Personel pasife alınamadı."));
    } finally { setBusy(false); }
  };

  const createPerson = async () => {
    if (auditMode || !newPerson.fullName.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const created = await createIkControlPerson({ ...newPerson, mainCompanyId: companyKey });
      await loadPeople();
      if (created?.id) setSelectedId(created.id);
      setNewOpen(false);
      setNewPerson({ fullName: "", personnelCode: "", cardNo: "", department: "", title: "", sgkStatus: "VAR", startDate: TODAY, salary: 0, roadAllowance: 0, annualLeaveEntitlement: 14 });
      setNotice("Yeni personel kartı oluşturuldu.");
    } catch (cause) { setError(cause?.message || "Yeni personel oluşturulamadı."); }
    finally { setBusy(false); }
  };

  const addTime = async () => {
    if (!selected || auditMode) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await addIkTimeEvent(selected.id, eventForm);
      await loadSelected();
      setNotice("Kart giriş/çıkış saati kaydedildi.");
    } catch (cause) { setError(cause?.message || "Kart saati kaydedilemedi."); }
    finally { setBusy(false); }
  };

  const saveDay = async () => {
    if (!selected || !dayEdit || auditMode) return;
    setBusy(true); setError("");
    try {
      await saveIkDayOverride(selected.id, dayEdit);
      await loadSelected();
      setDayEdit(null);
      setNotice("Günlük puantaj istisnası kaydedildi.");
    } catch (cause) { setError(cause?.message || "Günlük durum kaydedilemedi."); }
    finally { setBusy(false); }
  };

  const previewExport = async (commit = false) => {
    if (auditMode) return;
    setBusy(true); setError("");
    try {
      const result = await buildIkCardExport({ ...exportRange, commit });
      setExportPreview(result);
      setNotice(commit ? "Kart uygulaması aktarım paketi kayıt altına alındı." : "Kart uygulaması aktarımı önizlendi.");
    } catch (cause) { setError(cause?.message || "Kart aktarımı hazırlanamadı."); }
    finally { setBusy(false); }
  };

  const reportRows = useMemo(() => (attendance?.days || []).filter((day) => day.lateMinutes > 0 || day.earlyMinutes > 0 || day.missingPunch || ["KART_YOK", "YILLIK_IZIN", "IZIN"].includes(day.status)), [attendance]);

  if (loading) return <div className="ikpc-loading">Personel uygulaması yükleniyor...</div>;

  return (
    <div className="ikpc-page">
      <header className="ikpc-header">
        <div><span>{auditMode ? "DENETİM GÖRÜNÜMÜ" : "İK PERSONEL MERKEZİ"}</span><h1>{auditMode ? "Personel Denetim ve Puantaj" : "Personel Kartı ve Çalışma Geçmişi"}</h1><p>{auditMode ? "Yalnız SGK'lı ve kart numarası bulunan personel gösterilir. Günlük/haftalık personel bu görünümde yoktur." : "Personel bilgileri, maaş geçmişi, kart numarası, giriş-çıkış saatleri ve puantaj tek kişide birleşir."}</p></div>
        {!auditMode ? <button type="button" className="ikpc-primary" onClick={() => newOpen ? setNewOpen(false) : openNewPerson()}><Plus size={17} /> {newOpen ? "Yeni Kaydı Kapat" : "Yeni Personel"}</button> : <span className="ikpc-audit-badge"><ShieldCheck size={17} /> Salt okunur</span>}
      </header>

      {notice ? <div className="ikpc-notice"><BadgeCheck size={17} />{notice}</div> : null}
      {error ? <div className="ikpc-error"><CircleAlert size={17} />{error}</div> : null}

      {!auditMode && newOpen ? (
        <section className="ikpc-new-card">
          <div className="ikpc-section-head"><h2><Plus size={18} /> Yeni Personel</h2><button type="button" onClick={() => setNewOpen(false)}><X size={16} /> Kapat</button></div>
          <div className="ikpc-form-grid four">
            <Field label="Ad soyad"><input value={newPerson.fullName} onChange={(e) => setNewPerson({ ...newPerson, fullName: e.target.value })} /></Field>
            <Field label="Personel kodu"><input value={newPerson.personnelCode} readOnly placeholder="HKN-01" /></Field>
            <Field label="Kart no"><input value={newPerson.cardNo} onChange={(e) => setNewPerson({ ...newPerson, cardNo: e.target.value })} placeholder="00057" /></Field>
            <Field label="İşe giriş"><input type="date" value={newPerson.startDate} onChange={(e) => setNewPerson({ ...newPerson, startDate: e.target.value })} /></Field>
            <Field label="Departman"><input value={newPerson.department} onChange={(e) => setNewPerson({ ...newPerson, department: e.target.value })} /></Field>
            <Field label="Görev"><input value={newPerson.title} onChange={(e) => setNewPerson({ ...newPerson, title: e.target.value })} /></Field>
            <Field label="SGK"><select value={newPerson.sgkStatus} onChange={(e) => setNewPerson({ ...newPerson, sgkStatus: e.target.value })}><option value="VAR">VAR</option><option value="YOK">YOK</option></select></Field>
            <Field label="Yıllık izin hakkı"><input type="number" value={newPerson.annualLeaveEntitlement} onChange={(e) => setNewPerson({ ...newPerson, annualLeaveEntitlement: Number(e.target.value || 0) })} /></Field>
            <Field label="Mevcut maaş"><input type="number" value={newPerson.salary} onChange={(e) => setNewPerson({ ...newPerson, salary: Number(e.target.value || 0) })} /></Field>
            <Field label="Yol"><input type="number" value={newPerson.roadAllowance} onChange={(e) => setNewPerson({ ...newPerson, roadAllowance: Number(e.target.value || 0) })} /></Field>
          </div>
          <button type="button" className="ikpc-primary" disabled={busy} onClick={createPerson}><Save size={16} /> Personeli Kaydet</button>
        </section>
      ) : null}

      <div className="ikpc-layout">
        <PersonList rows={visiblePeople} selectedId={selectedId} onSelect={setSelectedId} query={query} setQuery={setQuery} statusView={statusView} setStatusView={setStatusView} />
        <main className="ikpc-main">
          {!selected ? <div className="ikpc-empty"><Users size={42} /><h2>Personel seçin</h2></div> : (
            <>
              <section className="ikpc-profile-head">
                <div className="ikpc-profile"><b>{initials(selected.fullName)}</b><span><small>{selected.personnelCode || "Personel"}</small><h2>{selected.fullName}</h2><p>{selected.department || "Departman yok"} · {selected.title || "Görev yok"}</p></span></div>
                {!auditMode ? <div className="ikpc-actions">{editing ? <><button type="button" onClick={() => { setEditing(false); setDraft({ ...selected }); }}><X size={16} /> Vazgeç</button><button type="button" className="ikpc-primary" disabled={busy} onClick={saveEdit}><Save size={16} /> Kaydet</button></> : <><button type="button" onClick={startEdit}><Pencil size={16} /> Düzenle</button><button type="button" className="ikpc-passive-btn" disabled={busy || isPassivePerson(selected)} onClick={() => removePerson("PASSIVE")}>Pasife Al</button>{canHardDelete ? <button type="button" className="ikpc-danger-btn" disabled={busy} onClick={() => removePerson("HARD")}><Trash2 size={16} /> Kalıcı Sil</button> : null}</>}</div> : null}
              </section>

              <div className="ikpc-stats">
                <Stat icon={Clock3} label="Bu ay çalışma" value={`${summary.workedDays || 0} gün`} sub={`${summary.lateMinutes || 0} dk geç`} />
                <Stat icon={CalendarDays} label="Yıllık izin" value={`${summary.annualLeaveDays || 0} gün`} sub={`${summary.missingPunchDays || 0} eksik basım`} />
                <Stat icon={FileClock} label="Kart" value={selected.cardNo || "Yok"} sub={`${attendance?.expectedIn || "08:30"} / ${attendance?.expectedOut || "19:00"}`} />
                {!auditMode ? <Stat icon={Banknote} label="Mevcut maaş" value={money(selected.salary)} sub={`Yol ${money(selected.roadAllowance)}`} /> : <Stat icon={ShieldCheck} label="SGK" value={selected.sgkStatus} sub={selected.status} />}
              </div>

              <Accordion title="Personel Bilgileri" icon={UserRound} open>
                <div className="ikpc-form-grid four">
                  <Field label="Ad soyad"><input disabled={!editing} value={(draft || selected).fullName || ""} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} /></Field>
                  <Field label="Personel kodu"><input disabled value={selected.personnelCode || ""} /></Field>
                  <Field label="Kart no"><input disabled={!editing} value={(draft || selected).cardNo || ""} onChange={(e) => setDraft({ ...draft, cardNo: e.target.value })} /></Field>
                  <Field label="SGK"><select disabled={!editing} value={(draft || selected).sgkStatus || "VAR"} onChange={(e) => setDraft({ ...draft, sgkStatus: e.target.value })}><option>VAR</option><option>YOK</option></select></Field>
                  <Field label="Departman"><input disabled={!editing} value={(draft || selected).department || ""} onChange={(e) => setDraft({ ...draft, department: e.target.value })} /></Field>
                  <Field label="Görev"><input disabled={!editing} value={(draft || selected).title || ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
                  <Field label="İşe giriş"><input disabled={!editing} type="date" value={(draft || selected).startDate || ""} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></Field>
                  <Field label="İşten çıkış"><input disabled={!editing} type="date" value={(draft || selected).exitDate || ""} onChange={(e) => setDraft({ ...draft, exitDate: e.target.value })} /></Field>
                  <Field label="Durum"><select disabled={!editing} value={(draft || selected).status || "Aktif"} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option>Aktif</option><option>Pasif</option><option>İzinli</option></select></Field>
                  <Field label="Telefon"><input disabled={!editing} value={(draft || selected).phone || ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
                </div>
                {editing ? <div className="ikpc-change-meta"><Field label="Değişiklik geçerlilik tarihi"><input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></Field><Field label="Değişiklik açıklaması" wide><input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="Örn. 01.09.2026 yeni ücret / görev değişikliği" /></Field></div> : null}
              </Accordion>

              {!auditMode ? (
                <Accordion title="Maaş, Ödeme ve Tarihli Ücret Geçmişi" icon={Banknote} open={activeTab === "personel-kartlari"}>
                  <div className="ikpc-form-grid four">
                    <Field label="Mevcut maaş"><input disabled={!editing} type="number" value={(draft || selected).salary || 0} onChange={(e) => setDraft({ ...draft, salary: Number(e.target.value || 0) })} /></Field>
                    <Field label="Yol"><input disabled={!editing} type="number" value={(draft || selected).roadAllowance || 0} onChange={(e) => setDraft({ ...draft, roadAllowance: Number(e.target.value || 0) })} /></Field>
                    <Field label="Ödeme kanalı"><select disabled={!editing} value={(draft || selected).paymentChannel || "Banka + Elden"} onChange={(e) => setDraft({ ...draft, paymentChannel: e.target.value })}><option>Elden</option><option>Banka</option><option>Banka + Elden</option></select></Field>
                    <Field label="Mesai saat tabanı"><input disabled={!editing} type="number" value={(draft || selected).overtimeBaseHours || 225} onChange={(e) => setDraft({ ...draft, overtimeBaseHours: Number(e.target.value || 0) })} /></Field>
                  </div>
                  <div className="ikpc-history-table">
                    <table><thead><tr><th>Geçerlilik</th><th>Maaş</th><th>Yol</th><th>Ödeme</th><th>Açıklama</th></tr></thead><tbody>{(detail?.salaryHistory || []).map((row) => <tr key={row.id}><td>{formatDate(row.effective_date || row.effectiveDate)}</td><td>{money(row.salary)}</td><td>{money(row.road_allowance || row.roadAllowance)}</td><td>{row.bank_payment_type || row.paymentChannel || "-"}</td><td>{row.note || row.contract_type || "-"}</td></tr>)}{!(detail?.salaryHistory || []).length ? <tr><td colSpan="5">Henüz tarihli maaş geçmişi yok.</td></tr> : null}</tbody></table>
                  </div>
                </Accordion>
              ) : null}

              <Accordion title="İzin ve Personel Geçmişi" icon={CalendarDays} open={activeTab === "puantaj-izin"}>
                <div className="ikpc-two-columns">
                  <div><h3>İzinler</h3><div className="ikpc-history-list">{(detail?.leaves || []).map((row) => <article key={row.id}><strong>{row.record_type || "İzin"}</strong><span>{formatDate(row.start_date)} → {formatDate(row.end_date)}</span><small>{row.day_count || 0} gün · {row.note || ""}</small></article>)}{!(detail?.leaves || []).length ? <p>Kayıtlı izin yok.</p> : null}</div></div>
                  {!auditMode ? <div><h3>Değişiklik Geçmişi</h3><div className="ikpc-history-list">{(detail?.changeHistory || []).map((row) => <article key={row.id}><strong>{row.field_name}</strong><span>{row.old_value || "-"} → {row.new_value || "-"}</span><small>{formatDate(row.effective_date)} · {row.note || ""}</small></article>)}{!(detail?.changeHistory || []).length ? <p>Henüz değişiklik geçmişi yok.</p> : null}</div></div> : null}
                </div>
              </Accordion>

              <Accordion title="Kart Puantajı — Gün Gün Giriş / Çıkış" icon={Clock3} open={activeTab !== "personel-kartlari"}>
                <div className="ikpc-period-tools"><select value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || now.getFullYear()))} /></div>
                {!auditMode ? <div className="ikpc-entry-box"><Field label="Tarih"><input type="date" value={eventForm.workDate} onChange={(e) => setEventForm({ ...eventForm, workDate: e.target.value })} /></Field><Field label="Saat"><input type="time" value={eventForm.eventTime} onChange={(e) => setEventForm({ ...eventForm, eventTime: e.target.value })} /></Field><Field label="Yön"><select value={eventForm.direction} onChange={(e) => setEventForm({ ...eventForm, direction: e.target.value })}><option value="AUTO">Otomatik</option><option value="IN">Giriş</option><option value="OUT">Çıkış</option></select></Field><button type="button" className="ikpc-primary" disabled={busy} onClick={addTime}><Plus size={16} /> Saat Ekle</button></div> : null}
                <div className="ikpc-attendance-table"><table><thead><tr><th>Tarih</th><th>Durum</th><th>Giriş</th><th>Çıkış</th><th>Geç</th><th>Erken</th><th>Mesai</th><th>Not</th>{!auditMode ? <th></th> : null}</tr></thead><tbody>{(attendance?.days || []).map((day) => <tr key={day.date}><td>{formatDate(day.date)}</td><td><span className={`ikpc-status ${tone(day.status)}`}>{statusLabel(day.status)}</span></td><td>{day.entry || "-"}</td><td>{day.exit || "-"}</td><td>{day.lateMinutes ? `${day.lateMinutes} dk` : "-"}</td><td>{day.earlyMinutes ? `${day.earlyMinutes} dk` : "-"}</td><td>{day.overtimeMinutes ? `${day.overtimeMinutes} dk` : "-"}</td><td>{day.note || (day.missingPunch ? "Eksik basım" : "")}</td>{!auditMode ? <td><button type="button" onClick={() => setDayEdit({ workDate: day.date, status: day.status, entry: day.entry, exit: day.exit, lateMinutes: day.lateMinutes, earlyMinutes: day.earlyMinutes, overtimeMinutes: day.overtimeMinutes, missingPunch: day.missingPunch, note: day.note || "" })}><Pencil size={14} /></button></td> : null}</tr>)}</tbody></table></div>
              </Accordion>

              {activeTab === "denetim-raporu" ? (
                <Accordion title="Denetim İstisna Raporu" icon={FileText} open>
                  <div className="ikpc-attendance-table"><table><thead><tr><th>Tarih</th><th>Durum</th><th>Giriş</th><th>Çıkış</th><th>Geç</th><th>Erken</th><th>Eksik</th></tr></thead><tbody>{reportRows.map((day) => <tr key={day.date}><td>{formatDate(day.date)}</td><td>{statusLabel(day.status)}</td><td>{day.entry || "-"}</td><td>{day.exit || "-"}</td><td>{day.lateMinutes || 0} dk</td><td>{day.earlyMinutes || 0} dk</td><td>{day.missingPunch ? "Evet" : "-"}</td></tr>)}{!reportRows.length ? <tr><td colSpan="7">Bu ay için istisna bulunamadı.</td></tr> : null}</tbody></table></div>
                </Accordion>
              ) : null}

              {!auditMode ? (
                <Accordion title="Kart Uygulamasına Aktarım" icon={FileText}>
                  <p className="ikpc-muted">KY ERP → kart uygulaması. Çıktı kesin olarak KartNo,Saat,GGAAYY,1,001 formatındadır; hafta sonu, resmî tatil, yıllık izin ve mükerrer satırlar pakete alınmaz.</p>
                  <div className="ikpc-export-tools"><Field label="Başlangıç"><input type="date" value={exportRange.startDate} onChange={(e) => setExportRange({ ...exportRange, startDate: e.target.value })} /></Field><Field label="Bitiş"><input type="date" value={exportRange.endDate} onChange={(e) => setExportRange({ ...exportRange, endDate: e.target.value })} /></Field><button type="button" onClick={() => previewExport(false)}>Önizle</button><button type="button" className="ikpc-primary" onClick={() => previewExport(true)}>Paketi Kaydet</button></div>
                  {exportPreview ? <div className="ikpc-export-preview"><strong>{exportPreview.rowCount} satır · {exportPreview.duplicate ? "Daha önce hazırlanmış paket" : "Yeni paket"}</strong><textarea readOnly value={exportPreview.content || ""} /></div> : null}
                </Accordion>
              ) : null}
            </>
          )}
        </main>
      </div>

      {dayEdit && !auditMode ? <div className="ikpc-modal-backdrop"><div className="ikpc-modal"><div className="ikpc-section-head"><h2>{formatDate(dayEdit.workDate)} günlük durum</h2><button type="button" onClick={() => setDayEdit(null)}><X size={16} /></button></div><div className="ikpc-form-grid two"><Field label="Durum"><select value={dayEdit.status} onChange={(e) => setDayEdit({ ...dayEdit, status: e.target.value })}><option value="AUTO">Otomatik</option><option value="CALISTI">Çalıştı</option><option value="YILLIK_IZIN">Yıllık İzin</option><option value="IZIN">İzinli</option><option value="DEVAMSIZ">Devamsız</option><option value="EKSIK_BASIM">Eksik Basım</option><option value="KART_YOK">Kart Yok</option></select></Field><Field label="Giriş"><input type="time" value={dayEdit.entry || ""} onChange={(e) => setDayEdit({ ...dayEdit, entry: e.target.value })} /></Field><Field label="Çıkış"><input type="time" value={dayEdit.exit || ""} onChange={(e) => setDayEdit({ ...dayEdit, exit: e.target.value })} /></Field><Field label="Not"><input value={dayEdit.note || ""} onChange={(e) => setDayEdit({ ...dayEdit, note: e.target.value })} /></Field></div><div className="ikpc-actions"><button type="button" onClick={() => setDayEdit(null)}>Vazgeç</button><button type="button" className="ikpc-primary" disabled={busy} onClick={saveDay}><Save size={16} /> Kaydet</button></div></div></div> : null}
    </div>
  );
}
