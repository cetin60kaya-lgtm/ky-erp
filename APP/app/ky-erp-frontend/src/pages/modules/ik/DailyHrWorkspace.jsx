import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, CalendarDays, Moon, Plus, Save, Search, Sun, UserRound, Users } from "lucide-react";
import { useActiveCompany } from "../../../context/ActiveCompanyContext";
import { createGunlukPersonel, getGunlukPersonel, getGunlukPuantaj, saveGunlukPuantaj, updateGunlukPersonel } from "../../../services/ikApi";
import "./daily-hr-workspace.css";

const ROUTES = new Set(["/ik/daily-entry", "/ik/daily-cards", "/ik/daily-weekly", "/ik/daily-payments", "/ik/gunluk-giris", "/ik/gunluk-personel-kartlari", "/ik/haftalik-ozet", "/ik/gunluk-odeme-fisleri"]);
const EMPTY = { id: "", name: "", personnelNo: "", role: "Makinacı", broker: "Direkt", dayRate: 0, nightRate: 0, note: "", active: true };

function number(value) { const parsed = Number(String(value ?? "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function money(value) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(number(value)); }
function dateOnly(value) { return String(value || "").slice(0, 10); }
function startOfWeek(value) { const result = new Date(`${value}T12:00:00`); const day = result.getDay() || 7; result.setDate(result.getDate() - day + 1); return result.toISOString().slice(0, 10); }
function addDays(value, amount) { const result = new Date(`${value}T12:00:00`); result.setDate(result.getDate() + amount); return result.toISOString().slice(0, 10); }
function normalizePerson(row = {}) { return { ...EMPTY, ...row, id: row.id || "", name: row.fullName || row.name || row.adSoyad || "", personnelNo: row.personnelNo || row.personelNo || "", role: row.qualification || row.role || row.title || "Makinacı", broker: row.broker || row.araci || "Direkt", dayRate: number(row.dayWage ?? row.dayRate ?? row.gunduzUcreti), nightRate: number(row.nightWage ?? row.nightRate ?? row.geceUcreti), note: row.note || "", active: row.active ?? !["PASSIVE", "PASIF", "PASİF"].includes(String(row.status || "").toLocaleUpperCase("tr-TR")) }; }
function personPayload(person, companyId) { return { mainCompanyId: companyId, fullName: person.name.trim(), personnelNo: person.personnelNo.trim(), qualification: person.role.trim(), broker: person.broker.trim() || "Direkt", dayWage: number(person.dayRate), nightWage: number(person.nightRate), note: person.note.trim(), status: person.active ? "ACTIVE" : "PASSIVE" }; }

export default function DailyHrWorkspace() {
  const { activeCompany } = useActiveCompany();
  const [host, setHost] = useState(null);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [people, setPeople] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const active = ROUTES.has(pathname);
  const companyId = activeCompany?.slug || activeCompany?.id || "mecit-hakan";

  useEffect(() => { const sync = () => setPathname(window.location.pathname); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync); }, []);
  useEffect(() => { const resolve = () => setHost(document.querySelector(".main-content")); resolve(); const observer = new MutationObserver(resolve); observer.observe(document.body, { childList: true, subtree: true }); return () => observer.disconnect(); }, []);
  useEffect(() => { document.body.classList.toggle("ik-daily-active", active); return () => document.body.classList.remove("ik-daily-active"); }, [active]);

  const load = useCallback(async () => {
    if (!active) return;
    setError("");
    try {
      const weekStart = startOfWeek(date);
      const [personRows, attendanceRows] = await Promise.all([
        getGunlukPersonel({ mainCompanyId: companyId }),
        getGunlukPuantaj({ mainCompanyId: companyId, startDate: addDays(weekStart, -35), endDate: addDays(weekStart, 6) }),
      ]);
      const normalized = (Array.isArray(personRows) ? personRows : []).map(normalizePerson);
      setPeople(normalized);
      setSelectedId((current) => normalized.some((row) => row.id === current) ? current : normalized[0]?.id || "");
      setEntries(Array.isArray(attendanceRows) ? attendanceRows : []);
    } catch (loadError) { setError(loadError?.message || "Günlük İK verileri alınamadı."); }
  }, [active, companyId, date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const current = people.find((person) => person.id === selectedId); if (current) setForm(current); }, [people, selectedId]);

  const visiblePeople = useMemo(() => { const needle = query.trim().toLocaleLowerCase("tr-TR"); return people.filter((person) => !needle || `${person.name} ${person.personnelNo} ${person.role} ${person.broker}`.toLocaleLowerCase("tr-TR").includes(needle)); }, [people, query]);
  const entryFor = (personId, workDate) => entries.find((row) => (row.employeeId || row.personId) === personId && dateOnly(row.workDate || row.date) === workDate);

  const saveCard = async () => {
    if (!form.name.trim()) { setError("Ad soyad zorunludur."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = form.id ? await updateGunlukPersonel(form.id, personPayload(form, companyId)) : await createGunlukPersonel(personPayload(form, companyId));
      const normalized = normalizePerson(saved || form);
      setPeople((current) => form.id ? current.map((row) => row.id === normalized.id ? normalized : row) : [normalized, ...current]);
      setSelectedId(normalized.id); setForm(normalized); setNotice(form.id ? "Günlük personel kartı güncellendi." : "Günlük personel kartı oluşturuldu.");
    } catch (saveError) { setError(saveError?.message || "Personel kartı kaydedilemedi."); } finally { setBusy(false); }
  };

  const toggleShift = async (person, shift) => {
    const current = entryFor(person.id, date) || {};
    const day = shift === "day" ? !Boolean(current.day ?? current.dayShift) : Boolean(current.day ?? current.dayShift);
    const night = shift === "night" ? !Boolean(current.night ?? current.nightShift) : Boolean(current.night ?? current.nightShift);
    setBusy(true); setError("");
    try {
      await saveGunlukPuantaj({ mainCompanyId: companyId, employeeId: person.id, startDate: date, endDate: date, entries: [{ workDate: date, day, night, dayWage: person.dayRate, nightWage: person.nightRate }] });
      await load(); setNotice(`${person.name} için ${date} kaydı güncellendi.`);
    } catch (saveError) { setError(saveError?.message || "Günlük giriş kaydedilemedi."); } finally { setBusy(false); }
  };

  const weekStart = startOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weeklyRows = people.map((person) => {
    const totals = weekDays.reduce((sum, workDate) => { const row = entryFor(person.id, workDate) || {}; const day = Boolean(row.day ?? row.dayShift); const night = Boolean(row.night ?? row.nightShift); return { day: sum.day + (day ? 1 : 0), night: sum.night + (night ? 1 : 0), amount: sum.amount + (day ? person.dayRate : 0) + (night ? person.nightRate : 0) }; }, { day: 0, night: 0, amount: 0 });
    return { ...person, ...totals };
  });
  const grandTotal = weeklyRows.reduce((sum, row) => sum + row.amount, 0);
  if (!active || !host) return null;

  return createPortal(<section className="ikdaily">
    <header><div><span>GÜNLÜK İK</span><h1>Günlük Personel Yönetimi</h1><p>Gündüz/gece girişleri, haftalık çalışma ve ödeme fişleri tek ekranda.</p></div><div className="ikdaily-date"><CalendarDays size={18}/><input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></div></header>
    {notice ? <div className="ikdaily-notice">{notice}</div> : null}{error ? <div className="ikdaily-error">{error}</div> : null}
    <div className="ikdaily-stats"><div><Users/><span>Toplam<strong>{people.length}</strong></span></div><div><UserRound/><span>Aktif<strong>{people.filter((row) => row.active).length}</strong></span></div><div><Sun/><span>Haftalık gündüz<strong>{weeklyRows.reduce((sum,row)=>sum+row.day,0)}</strong></span></div><div><Banknote/><span>Haftalık ödeme<strong>{money(grandTotal)}</strong></span></div></div>
    <div className="ikdaily-grid"><aside><label className="ikdaily-search"><Search size={16}/><input placeholder="Personel ara" value={query} onChange={(event)=>setQuery(event.target.value)}/></label><button className="ikdaily-new" type="button" onClick={()=>{setForm(EMPTY);setSelectedId("");}}><Plus size={16}/>Yeni günlük personel</button><div className="ikdaily-list">{visiblePeople.map((person)=><button type="button" key={person.id} className={person.id===selectedId?"active":""} onClick={()=>setSelectedId(person.id)}><span>{person.name}</span><small>{person.role} · {money(person.dayRate)} / {money(person.nightRate)}</small></button>)}</div></aside>
      <main><section className="ikdaily-card"><div className="ikdaily-card-head"><h2>Günlük Giriş</h2><strong>{date}</strong></div><div className="ikdaily-attendance">{visiblePeople.map((person)=>{const row=entryFor(person.id,date)||{};const day=Boolean(row.day??row.dayShift);const night=Boolean(row.night??row.nightShift);return <div key={person.id}><span><strong>{person.name}</strong><small>{person.role}</small></span><button type="button" className={day?"on":""} disabled={busy} onClick={()=>toggleShift(person,"day")}><Sun size={16}/>Gündüz</button><button type="button" className={night?"on":""} disabled={busy} onClick={()=>toggleShift(person,"night")}><Moon size={16}/>Gece</button><em>{money((day?person.dayRate:0)+(night?person.nightRate:0))}</em></div>})}</div></section>
      <section className="ikdaily-card"><h2>Personel Kartı</h2><div className="ikdaily-form"><label>Ad soyad<input value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})}/></label><label>Personel no<input value={form.personnelNo} onChange={(event)=>setForm({...form,personnelNo:event.target.value})}/></label><label>Vasıf<input value={form.role} onChange={(event)=>setForm({...form,role:event.target.value})}/></label><label>Aracı<input value={form.broker} onChange={(event)=>setForm({...form,broker:event.target.value})}/></label><label>Gündüz ücret<input type="number" value={form.dayRate} onChange={(event)=>setForm({...form,dayRate:number(event.target.value)})}/></label><label>Gece ücret<input type="number" value={form.nightRate} onChange={(event)=>setForm({...form,nightRate:number(event.target.value)})}/></label><label className="wide">Not<textarea value={form.note} onChange={(event)=>setForm({...form,note:event.target.value})}/></label><label className="check"><input type="checkbox" checked={form.active} onChange={(event)=>setForm({...form,active:event.target.checked})}/>Aktif personel</label></div><button type="button" className="ikdaily-save" disabled={busy} onClick={saveCard}><Save size={16}/>{busy?"Kaydediliyor...":"Personel Kartını Kaydet"}</button></section>
      <section className="ikdaily-card"><div className="ikdaily-card-head"><h2>Haftalık Özet ve Ödeme</h2><strong>{weekStart} — {weekDays[6]}</strong></div><div className="ikdaily-table"><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Gündüz</th><th>Gece</th><th>Ödeme</th></tr></thead><tbody>{weeklyRows.map((row)=><tr key={row.id}><td>{row.name}</td><td>{row.role}</td><td>{row.day}</td><td>{row.night}</td><td>{money(row.amount)}</td></tr>)}</tbody><tfoot><tr><td colSpan="4">Genel toplam</td><td>{money(grandTotal)}</td></tr></tfoot></table></div></section></main></div>
  </section>, host);
}
