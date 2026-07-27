import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, CalendarDays, CircleAlert, Clock3, MinusCircle, Plus, ReceiptText, Save, Search, Trash2, UserRound, WalletCards } from "lucide-react";
import { useActiveCompany } from "../../../context/ActiveCompanyContext";
import {
  deleteAylikIzin,
  deleteAylikMesai,
  getAylikIzinler,
  getAylikMesailer,
  getAylikPersonel,
  saveAylikIzin,
  saveAylikMesai,
  updateAylikIzin,
  updateAylikMesai,
} from "../../../services/ikApi";
import "./monthly-operations-workspace.css";

const TODAY = new Date().toISOString().slice(0, 10);
const ACTIVE_PATHS = new Set(["/ik/mesai-avans", "/ik/puantaj-izin", "/ik/bordro-odeme"]);
const ADDITION_TYPES = new Set(["Mesai", "Prim", "Ek ödeme"]);
const DEDUCTION_TYPES = new Set(["Avans", "Kesinti"]);

function num(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(num(value));
}

function personName(person) {
  return person?.fullName || person?.adSoyad || "İsimsiz personel";
}

function adjustment(row = {}) {
  return {
    id: row.id || "",
    personId: row.personId || row.employeeId || "",
    date: String(row.date || TODAY).slice(0, 10),
    type: row.type || row.adjustmentType || "Mesai",
    hours: num(row.hours ?? row.hourOrDay),
    amount: num(row.amount),
    note: row.note || "",
    status: row.status || "Onaylı",
  };
}

function leave(row = {}) {
  return {
    id: row.id || "",
    personId: row.personId || row.employeeId || "",
    type: row.type || row.recordType || "Yıllık izin",
    start: String(row.start || row.startDate || TODAY).slice(0, 10),
    end: String(row.end || row.endDate || TODAY).slice(0, 10),
    days: num(row.days ?? row.dayCount ?? 1),
    description: row.description || row.note || "",
  };
}

function adjustmentPayload(form, company) {
  return {
    mainCompanyId: company?.slug || company?.id || "mecit-hakan",
    employeeId: form.personId,
    personId: form.personId,
    date: form.date,
    adjustmentType: form.type,
    type: form.type,
    hourOrDay: num(form.hours),
    hours: num(form.hours),
    amount: num(form.amount),
    payrollEffect: ADDITION_TYPES.has(form.type) ? "ADD" : "DEDUCT",
    status: form.status || "Onaylı",
    note: form.note.trim(),
  };
}

function leavePayload(form, company) {
  return {
    mainCompanyId: company?.slug || company?.id || "mecit-hakan",
    employeeId: form.personId,
    personId: form.personId,
    recordType: form.type,
    type: form.type,
    startDate: form.start,
    endDate: form.end,
    dayCount: num(form.days),
    days: num(form.days),
    effectType: form.type === "Yıllık izin" ? "Yıllık izinden düş" : "Düşme",
    description: form.description.trim(),
    note: form.description.trim(),
  };
}

function Field({ label, children, wide = false }) {
  return <label className={wide ? "ikop-field wide" : "ikop-field"}><span>{label}</span>{children}</label>;
}

export default function MonthlyOperationsWorkspace() {
  const { activeCompany } = useActiveCompany();
  const [host, setHost] = useState(null);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [people, setPeople] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editingAdjustmentId, setEditingAdjustmentId] = useState("");
  const [editingLeaveId, setEditingLeaveId] = useState("");
  const [adjustmentForm, setAdjustmentForm] = useState({ personId: "", date: TODAY, type: "Mesai", hours: 0, amount: 0, note: "", status: "Onaylı" });
  const [leaveForm, setLeaveForm] = useState({ personId: "", type: "Yıllık izin", start: TODAY, end: TODAY, days: 1, description: "" });

  const active = ACTIVE_PATHS.has(pathname);
  const companyId = activeCompany?.slug || activeCompany?.id;

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 250);
    return () => { window.removeEventListener("popstate", sync); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const resolve = () => setHost(document.querySelector(".main-content"));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("ik-monthly-operations-active", active);
    return () => document.body.classList.remove("ik-monthly-operations-active");
  }, [active]);

  const load = useCallback(async () => {
    if (!active) return;
    setError("");
    try {
      const [personRows, adjustmentRows, leaveRows] = await Promise.all([
        getAylikPersonel({ mainCompanyId: companyId }),
        getAylikMesailer({ mainCompanyId: companyId }),
        getAylikIzinler({ mainCompanyId: companyId }),
      ]);
      const nextPeople = Array.isArray(personRows) ? personRows : [];
      setPeople(nextPeople);
      setAdjustments((Array.isArray(adjustmentRows) ? adjustmentRows : []).map(adjustment));
      setLeaves((Array.isArray(leaveRows) ? leaveRows : []).map(leave));
      setSelectedId((current) => nextPeople.some((row) => row.id === current) ? current : nextPeople[0]?.id || "");
    } catch (loadError) {
      setError(loadError?.message || "Aylık İK kayıtları yüklenemedi.");
    }
  }, [active, companyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    setAdjustmentForm((current) => ({ ...current, personId: selectedId }));
    setLeaveForm((current) => ({ ...current, personId: selectedId }));
  }, [selectedId]);

  const selected = people.find((row) => row.id === selectedId) || null;
  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return people.filter((person) => `${personName(person)} ${person.personnelCode || ""} ${person.department || ""}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [people, query]);

  const selectedAdjustments = adjustments.filter((row) => row.personId === selectedId);
  const selectedLeaves = leaves.filter((row) => row.personId === selectedId);
  const additions = selectedAdjustments.filter((row) => ADDITION_TYPES.has(row.type)).reduce((sum, row) => sum + num(row.amount), 0);
  const deductions = selectedAdjustments.filter((row) => DEDUCTION_TYPES.has(row.type)).reduce((sum, row) => sum + num(row.amount), 0);
  const base = num(selected?.salary) + num(selected?.roadAllowance);
  const net = base + additions - deductions;
  const bank = selected?.sgkStatus === "YOK" || String(selected?.paymentChannel || "").toLocaleLowerCase("tr-TR") === "elden" ? 0 : Math.min(net, num(selected?.bankAmount) || net);
  const cash = Math.max(net - bank, 0);

  const resetAdjustment = () => {
    setEditingAdjustmentId("");
    setAdjustmentForm({ personId: selectedId, date: TODAY, type: "Mesai", hours: 0, amount: 0, note: "", status: "Onaylı" });
  };

  const saveAdjustment = async () => {
    if (!adjustmentForm.personId || num(adjustmentForm.amount) <= 0) { setError("Personel ve tutar zorunludur."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = editingAdjustmentId
        ? await updateAylikMesai(editingAdjustmentId, adjustmentPayload(adjustmentForm, activeCompany))
        : await saveAylikMesai(adjustmentPayload(adjustmentForm, activeCompany));
      const normalized = adjustment(saved || { ...adjustmentForm, id: editingAdjustmentId || crypto.randomUUID() });
      setAdjustments((current) => editingAdjustmentId ? current.map((row) => row.id === editingAdjustmentId ? normalized : row) : [normalized, ...current]);
      resetAdjustment(); setNotice("Aylık işlem kaydedildi.");
    } catch (saveError) { setError(saveError?.message || "İşlem kaydedilemedi."); }
    finally { setBusy(false); }
  };

  const removeAdjustment = async (id) => {
    setBusy(true); setError("");
    try { await deleteAylikMesai(id); setAdjustments((current) => current.filter((row) => row.id !== id)); setNotice("İşlem silindi."); }
    catch (deleteError) { setError(deleteError?.message || "İşlem silinemedi."); }
    finally { setBusy(false); }
  };

  const resetLeave = () => {
    setEditingLeaveId("");
    setLeaveForm({ personId: selectedId, type: "Yıllık izin", start: TODAY, end: TODAY, days: 1, description: "" });
  };

  const saveLeave = async () => {
    if (!leaveForm.personId || num(leaveForm.days) <= 0) { setError("Personel ve izin günü zorunludur."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = editingLeaveId
        ? await updateAylikIzin(editingLeaveId, leavePayload(leaveForm, activeCompany))
        : await saveAylikIzin(leavePayload(leaveForm, activeCompany));
      const normalized = leave(saved || { ...leaveForm, id: editingLeaveId || crypto.randomUUID() });
      setLeaves((current) => editingLeaveId ? current.map((row) => row.id === editingLeaveId ? normalized : row) : [normalized, ...current]);
      resetLeave(); setNotice("İzin kaydı kaydedildi.");
    } catch (saveError) { setError(saveError?.message || "İzin kaydı kaydedilemedi."); }
    finally { setBusy(false); }
  };

  const removeLeave = async (id) => {
    setBusy(true); setError("");
    try { await deleteAylikIzin(id); setLeaves((current) => current.filter((row) => row.id !== id)); setNotice("İzin kaydı silindi."); }
    catch (deleteError) { setError(deleteError?.message || "İzin kaydı silinemedi."); }
    finally { setBusy(false); }
  };

  if (!active || !host) return null;
  const screen = pathname.includes("puantaj-izin") ? "leave" : pathname.includes("bordro-odeme") ? "payroll" : "adjustment";

  return createPortal(
    <section className="ikop-workspace">
      <header className="ikop-header"><div><span>AYLIK İK</span><h1>{screen === "adjustment" ? "Mesai · Avans · Kesinti" : screen === "leave" ? "Yıllık İzin / Günlük Durum" : "Bordro & Ödeme"}</h1><p>Personel bazlı aylık işlemler ve net ödeme kontrolü.</p></div></header>
      {notice ? <div className="ikop-notice"><Save size={16}/>{notice}</div> : null}
      {error ? <div className="ikop-error"><CircleAlert size={16}/>{error}</div> : null}
      <div className="ikop-layout">
        <aside className="ikop-people"><label><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Personel ara"/></label><div>{filteredPeople.map((person) => <button key={person.id} className={person.id === selectedId ? "active" : ""} onClick={() => setSelectedId(person.id)}><UserRound size={17}/><span><strong>{personName(person)}</strong><small>{person.personnelCode || "Kodsuz"} · {person.department || "Departman yok"}</small></span></button>)}</div></aside>
        <main className="ikop-main">
          {!selected ? <div className="ikop-empty">Aylık personel kaydı bulunamadı.</div> : <>
            <div className="ikop-person-head"><div><strong>{personName(selected)}</strong><span>{selected.department || "-"} · {selected.title || "-"}</span></div><em>{selected.sgkStatus === "YOK" ? "SGK YOK" : "SGK VAR"}</em></div>
            <div className="ikop-stats"><div><WalletCards/><span>Maaş + yol<strong>{money(base)}</strong></span></div><div><Plus/><span>Ek ödemeler<strong>{money(additions)}</strong></span></div><div><MinusCircle/><span>Avans / kesinti<strong>{money(deductions)}</strong></span></div><div><Banknote/><span>Net hakediş<strong>{money(net)}</strong></span></div></div>

            {screen === "adjustment" ? <>
              <section className="ikop-card"><h2><Clock3 size={19}/>Yeni aylık işlem</h2><div className="ikop-form">
                <Field label="Tarih"><input type="date" value={adjustmentForm.date} onChange={(e) => setAdjustmentForm({...adjustmentForm, date:e.target.value})}/></Field>
                <Field label="İşlem türü"><select value={adjustmentForm.type} onChange={(e) => setAdjustmentForm({...adjustmentForm, type:e.target.value})}><option>Mesai</option><option>Prim</option><option>Ek ödeme</option><option>Avans</option><option>Kesinti</option></select></Field>
                <Field label="Saat / gün"><input type="number" value={adjustmentForm.hours} onChange={(e) => setAdjustmentForm({...adjustmentForm, hours:e.target.value})}/></Field>
                <Field label="Tutar"><input type="number" value={adjustmentForm.amount} onChange={(e) => setAdjustmentForm({...adjustmentForm, amount:e.target.value})}/></Field>
                <Field label="Açıklama" wide><textarea value={adjustmentForm.note} onChange={(e) => setAdjustmentForm({...adjustmentForm, note:e.target.value})}/></Field>
              </div><div className="ikop-actions"><button className="primary" onClick={saveAdjustment} disabled={busy}><Save size={16}/>{editingAdjustmentId ? "Güncelle" : "Kaydet"}</button>{editingAdjustmentId ? <button onClick={resetAdjustment}>İptal</button> : null}</div></section>
              <section className="ikop-card"><h2><ReceiptText size={19}/>İşlem geçmişi</h2><div className="ikop-table"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Saat/Gün</th><th>Tutar</th><th>Açıklama</th><th></th></tr></thead><tbody>{selectedAdjustments.map((row) => <tr key={row.id}><td>{row.date}</td><td>{row.type}</td><td>{row.hours || "-"}</td><td>{money(row.amount)}</td><td>{row.note || "-"}</td><td><button onClick={() => {setEditingAdjustmentId(row.id);setAdjustmentForm(row);}}>Düzenle</button><button className="danger" onClick={() => removeAdjustment(row.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></section>
            </> : null}

            {screen === "leave" ? <>
              <section className="ikop-card"><h2><CalendarDays size={19}/>İzin kaydı</h2><div className="ikop-form">
                <Field label="İzin türü"><select value={leaveForm.type} onChange={(e) => setLeaveForm({...leaveForm,type:e.target.value})}><option>Yıllık izin</option><option>Rapor</option><option>Ücretsiz izin</option><option>Mazeret izni</option><option>Doğum izni</option><option>Ölüm izni</option></select></Field>
                <Field label="Başlangıç"><input type="date" value={leaveForm.start} onChange={(e) => setLeaveForm({...leaveForm,start:e.target.value})}/></Field>
                <Field label="Bitiş"><input type="date" value={leaveForm.end} onChange={(e) => setLeaveForm({...leaveForm,end:e.target.value})}/></Field>
                <Field label="Gün"><input type="number" value={leaveForm.days} onChange={(e) => setLeaveForm({...leaveForm,days:e.target.value})}/></Field>
                <Field label="Açıklama" wide><textarea value={leaveForm.description} onChange={(e) => setLeaveForm({...leaveForm,description:e.target.value})}/></Field>
              </div><div className="ikop-actions"><button className="primary" onClick={saveLeave} disabled={busy}><Save size={16}/>{editingLeaveId ? "Güncelle" : "Kaydet"}</button>{editingLeaveId ? <button onClick={resetLeave}>İptal</button> : null}</div></section>
              <section className="ikop-card"><h2><CalendarDays size={19}/>İzin geçmişi</h2><div className="ikop-table"><table><thead><tr><th>Tür</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Açıklama</th><th></th></tr></thead><tbody>{selectedLeaves.map((row) => <tr key={row.id}><td>{row.type}</td><td>{row.start}</td><td>{row.end}</td><td>{row.days}</td><td>{row.description || "-"}</td><td><button onClick={() => {setEditingLeaveId(row.id);setLeaveForm(row);}}>Düzenle</button><button className="danger" onClick={() => removeLeave(row.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></section>
            </> : null}

            {screen === "payroll" ? <section className="ikop-card payroll"><h2><ReceiptText size={19}/>Aylık bordro özeti</h2><div className="ikop-payroll-grid"><div><span>Maaş</span><strong>{money(selected.salary)}</strong></div><div><span>Yol</span><strong>{money(selected.roadAllowance)}</strong></div><div><span>Mesai / prim</span><strong>{money(additions)}</strong></div><div><span>Avans / kesinti</span><strong>-{money(deductions)}</strong></div><div className="net"><span>Net ödeme</span><strong>{money(net)}</strong></div><div><span>Banka</span><strong>{money(bank)}</strong></div><div><span>Elden</span><strong>{money(cash)}</strong></div></div><div className="ikop-payroll-note">Hakediş = Maaş + Yol + Mesai/Prim − Avans/Kesinti. SGK’sız personelde banka tutarı sıfır kabul edilir.</div></section> : null}
          </>}
        </main>
      </div>
    </section>, host);
}
