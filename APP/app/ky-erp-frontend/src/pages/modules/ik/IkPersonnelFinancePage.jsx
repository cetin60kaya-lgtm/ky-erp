import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BadgeCheck,
  CircleAlert,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  createIkControlPerson,
  getIkControlPeople,
  getIkControlPerson,
  getIkControlProfile,
  removeIkControlPerson,
  saveIkControlChanges,
} from "../../../services/ikPersonnelControlApi";
import "./ik-personnel-finance.css";

const TODAY = new Date().toISOString().slice(0, 10);
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const upper = (value) => String(value || "").trim().toLocaleUpperCase("tr-TR");
const money = (value) => num(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dateOnly(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{10}$/.test(raw)) return new Date(Number(raw) * 1000).toISOString().slice(0, 10);
  if (/^\d{13}$/.test(raw)) return new Date(Number(raw)).toISOString().slice(0, 10);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw;
}

function isPassive(person) {
  return upper(person?.status).includes("PAS") || upper(person?.activePassive).includes("PAS");
}

function blankPerson() {
  return {
    fullName: "",
    identityNo: "",
    phone: "",
    department: "",
    title: "",
    workType: "Aylık",
    sgkStatus: "VAR",
    status: "Aktif",
    startDate: TODAY,
    exitDate: "",
    salary: 0,
    roadAllowance: 0,
    paymentChannel: "Banka + Elden",
    bankAmount: 0,
    cashAmount: 0,
    overtimeBaseHours: 225,
    annualLeaveEntitlement: 14,
    annualLeaveCarryover: 0,
    note: "",
  };
}

const EDIT_KEYS = [
  "fullName",
  "identityNo",
  "phone",
  "department",
  "title",
  "workType",
  "sgkStatus",
  "status",
  "startDate",
  "exitDate",
  "salary",
  "roadAllowance",
  "paymentChannel",
  "bankAmount",
  "cashAmount",
  "overtimeBaseHours",
  "annualLeaveEntitlement",
  "annualLeaveCarryover",
  "note",
];

function Field({ label, children, wide = false }) {
  return <label className={wide ? "ikpf-field wide" : "ikpf-field"}><span>{label}</span>{children}</label>;
}

function Stat({ label, value, sub }) {
  return <div className="ikpf-stat"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}

export default function IkPersonnelFinancePage({ activeMainCompany, focus = "personel" }) {
  const company = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const [profile, setProfile] = useState(null);
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState(null);
  const [newDraft, setNewDraft] = useState(blankPerson());
  const [editing, setEditing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusView, setStatusView] = useState("ACTIVE");
  const [effectiveDate, setEffectiveDate] = useState(TODAY);
  const [changeNote, setChangeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const audit = Boolean(profile?.audit);
  const role = upper(profile?.role).replace(/İ/g, "I");
  const canHardDelete = ["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(role);

  const loadPeople = useCallback(async () => {
    const rows = await getIkControlPeople({ mainCompanyId: company });
    const list = Array.isArray(rows) ? rows : [];
    setPeople(list);
    setSelectedId((current) => list.some((row) => row.id === current) ? current : (list[0]?.id || ""));
    return list;
  }, [company]);

  const loadDetail = useCallback(async (employeeId = selectedId) => {
    if (!employeeId) { setDetail(null); return null; }
    const result = await getIkControlPerson(employeeId);
    setDetail(result || null);
    return result;
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    Promise.all([getIkControlProfile(), loadPeople()])
      .then(([nextProfile]) => { if (!cancelled) setProfile(nextProfile || null); })
      .catch((cause) => { if (!cancelled) setError(cause?.message || "İK personel verisi alınamadı."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [loadPeople]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setBusy(true);
    getIkControlPerson(selectedId)
      .then((result) => { if (!cancelled) setDetail(result || null); })
      .catch((cause) => { if (!cancelled) setError(cause?.message || "Personel detayı alınamadı."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const selected = detail?.person || people.find((row) => row.id === selectedId) || null;

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleUpperCase("tr-TR");
    return people.filter((person) => {
      if (statusView === "ACTIVE" && isPassive(person)) return false;
      if (statusView === "PASSIVE" && !isPassive(person)) return false;
      if (!needle) return true;
      return upper(`${person.personnelCode || person.code || ""} ${person.fullName || ""} ${person.department || ""} ${person.title || ""}`).includes(needle);
    });
  }, [people, query, statusView]);

  useEffect(() => {
    if (!visible.length) return;
    if (!visible.some((row) => row.id === selectedId)) setSelectedId(visible[0].id);
  }, [selectedId, visible]);

  const startEdit = () => {
    if (!selected || audit) return;
    setDraft({ ...blankPerson(), ...selected, startDate: dateOnly(selected.startDate), exitDate: dateOnly(selected.exitDate) });
    setEffectiveDate(TODAY);
    setChangeNote("");
    setEditing(true);
    setNotice("");
    setError("");
  };

  const saveEdit = async () => {
    if (!selected || !draft || audit) return;
    const changes = {};
    for (const key of EDIT_KEYS) {
      const nextValue = key === "startDate" || key === "exitDate" ? dateOnly(draft[key]) : draft[key];
      const oldValue = key === "startDate" || key === "exitDate" ? dateOnly(selected[key]) : selected[key];
      if (String(nextValue ?? "") !== String(oldValue ?? "")) changes[key] = nextValue;
    }
    if (!Object.keys(changes).length) { setEditing(false); setNotice("Değişiklik yok."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await saveIkControlChanges(selected.id, {
        mainCompanyId: company,
        effectiveDate,
        note: changeNote || "İK personel / ücret kartı güncellendi",
        changes,
      });
      await Promise.all([loadPeople(), loadDetail(selected.id)]);
      setEditing(false);
      setNotice("Personel ve ücret bilgileri tarihçeli olarak kaydedildi.");
    } catch (cause) {
      setError(cause?.message || "Personel değişikliği kaydedilemedi.");
    } finally { setBusy(false); }
  };

  const createPerson = async () => {
    if (audit || !newDraft.fullName.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const created = await createIkControlPerson({ ...newDraft, mainCompanyId: company });
      const list = await loadPeople();
      const nextId = created?.id || list.find((row) => row.fullName === newDraft.fullName)?.id;
      if (nextId) setSelectedId(nextId);
      setNewDraft(blankPerson());
      setNewOpen(false);
      setNotice("Yeni personel İK ana kaynağına oluşturuldu. PDKS kart/vardiya işlemleri PDKS bölümünden yapılır.");
    } catch (cause) {
      setError(cause?.message || "Yeni personel oluşturulamadı.");
    } finally { setBusy(false); }
  };

  const removePerson = async (mode) => {
    if (!selected || audit) return;
    const hard = mode === "HARD";
    const message = hard
      ? `${selected.fullName} kaydı kalıcı silinecek. Yalnız yanlış/mükerrer kayıt için kullanın. Devam edilsin mi?`
      : `${selected.fullName} pasife alınacak. Geçmiş kayıtları korunacak. Devam edilsin mi?`;
    if (!window.confirm(message)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await removeIkControlPerson(selected.id, {
        mode,
        confirmName: selected.fullName,
        reason: hard ? "Yanlış veya mükerrer İK personel kaydı" : "İK üzerinden pasife alındı",
        mainCompanyId: company,
      });
      setEditing(false);
      setDetail(null);
      setSelectedId("");
      await loadPeople();
      setNotice(hard ? "Yanlış/mükerrer personel kaydı kalıcı silindi." : "Personel pasife alındı.");
    } catch (cause) {
      setError(cause?.message || "Personel durumu değiştirilemedi.");
    } finally { setBusy(false); }
  };

  const person = editing ? draft : selected;
  const salaryHistory = Array.isArray(detail?.salaryHistory) ? detail.salaryHistory : [];
  const changeHistory = Array.isArray(detail?.changeHistory) ? detail.changeHistory : [];
  const leaveRows = Array.isArray(detail?.leaves) ? detail.leaves : [];
  const grossPlan = num(person?.salary) + num(person?.roadAllowance);
  const paymentPlan = num(person?.bankAmount) + num(person?.cashAmount);
  const paymentDifference = grossPlan - paymentPlan;

  return <div className="ikpf-page">
    <header className="ikpf-header">
      <div>
        <small>İK / PERSONEL & ÜCRET YÖNETİMİ</small>
        <h1>{focus === "ucret" ? "Maaş ve Ödeme Planı" : "Personel Kartları"}</h1>
        <p>İK yalnız personel, ücret, yan hak, ödeme planı ve özlük verisini yönetir. Giriş/çıkış, puantaj, terminal ve vardiya işlemleri PDKS bölümündedir.</p>
      </div>
      {!audit ? <button type="button" className="ikpf-primary" onClick={() => setNewOpen((value) => !value)}><Plus size={16}/>{newOpen ? "Yeni Kartı Kapat" : "Yeni Personel"}</button> : null}
    </header>

    {notice ? <div className="ikpf-notice"><BadgeCheck size={17}/>{notice}</div> : null}
    {error ? <div className="ikpf-error"><CircleAlert size={17}/>{error}</div> : null}

    {newOpen && !audit ? <section className="ikpf-new">
      <div className="ikpf-section-title"><div><Plus size={18}/><strong>Yeni Personel</strong></div><button onClick={() => setNewOpen(false)}><X size={16}/></button></div>
      <div className="ikpf-form-grid">
        <Field label="Ad Soyad"><input value={newDraft.fullName} onChange={(e)=>setNewDraft({...newDraft,fullName:e.target.value})}/></Field>
        <Field label="T.C. / Kimlik No"><input value={newDraft.identityNo} onChange={(e)=>setNewDraft({...newDraft,identityNo:e.target.value})}/></Field>
        <Field label="Telefon"><input value={newDraft.phone} onChange={(e)=>setNewDraft({...newDraft,phone:e.target.value})}/></Field>
        <Field label="Departman"><input value={newDraft.department} onChange={(e)=>setNewDraft({...newDraft,department:e.target.value})}/></Field>
        <Field label="Görev"><input value={newDraft.title} onChange={(e)=>setNewDraft({...newDraft,title:e.target.value})}/></Field>
        <Field label="İşe Giriş"><input type="date" value={newDraft.startDate} onChange={(e)=>setNewDraft({...newDraft,startDate:e.target.value})}/></Field>
        <Field label="SGK"><select value={newDraft.sgkStatus} onChange={(e)=>setNewDraft({...newDraft,sgkStatus:e.target.value})}><option value="VAR">VAR</option><option value="YOK">YOK</option></select></Field>
        <Field label="Çalışma Tipi"><select value={newDraft.workType} onChange={(e)=>setNewDraft({...newDraft,workType:e.target.value})}><option>Aylık</option><option>Günlük</option><option>Saatlik</option></select></Field>
        <Field label="Maaş"><input type="number" value={newDraft.salary} onChange={(e)=>setNewDraft({...newDraft,salary:Number(e.target.value||0)})}/></Field>
        <Field label="Yol"><input type="number" value={newDraft.roadAllowance} onChange={(e)=>setNewDraft({...newDraft,roadAllowance:Number(e.target.value||0)})}/></Field>
        <Field label="Ödeme Kanalı"><select value={newDraft.paymentChannel} onChange={(e)=>setNewDraft({...newDraft,paymentChannel:e.target.value})}><option>Banka + Elden</option><option>Banka</option><option>Elden</option></select></Field>
        <Field label="Bankaya"><input type="number" value={newDraft.bankAmount} onChange={(e)=>setNewDraft({...newDraft,bankAmount:Number(e.target.value||0)})}/></Field>
        <Field label="Elden"><input type="number" value={newDraft.cashAmount} onChange={(e)=>setNewDraft({...newDraft,cashAmount:Number(e.target.value||0)})}/></Field>
        <Field label="Mesai Saat Tabanı"><input type="number" value={newDraft.overtimeBaseHours} onChange={(e)=>setNewDraft({...newDraft,overtimeBaseHours:Number(e.target.value||0)})}/></Field>
      </div>
      <button type="button" className="ikpf-primary" disabled={busy || !newDraft.fullName.trim()} onClick={createPerson}><Save size={16}/>Personeli Kaydet</button>
    </section> : null}

    <div className="ikpf-layout">
      <aside className="ikpf-people">
        <div className="ikpf-search"><Search size={16}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="HKN, ad, bölüm, görev ara"/></div>
        <div className="ikpf-filter"><button className={statusView==="ACTIVE"?"active":""} onClick={()=>setStatusView("ACTIVE")}>Aktif</button><button className={statusView==="ALL"?"active":""} onClick={()=>setStatusView("ALL")}>Tümü</button><button className={statusView==="PASSIVE"?"active":""} onClick={()=>setStatusView("PASSIVE")}>Pasif</button></div>
        <div className="ikpf-list">
          {visible.map((row)=><button type="button" key={row.id} className={selectedId===row.id?"active":""} onClick={()=>setSelectedId(row.id)}>
            <b>{String(row.fullName||"?").split(/\s+/).slice(0,2).map((v)=>v[0]).join("")}</b>
            <span><strong>{row.fullName}</strong><small>{row.personnelCode||row.code||"HKN bekliyor"} · {row.department||"Departman yok"}</small></span>
            <em>{row.sgkStatus||"VAR"}</em>
          </button>)}
          {!visible.length ? <div className="ikpf-empty"><Users size={28}/>Personel bulunamadı.</div> : null}
        </div>
      </aside>

      <main className="ikpf-main">
        {!selected ? <div className="ikpf-empty large"><UserRound size={42}/><h2>Personel seçin</h2></div> : <>
          <section className="ikpf-person-head">
            <div><b>{String(selected.fullName||"?").split(/\s+/).slice(0,2).map((v)=>v[0]).join("")}</b><span><small>{selected.personnelCode||selected.code||"HKN"}</small><h2>{selected.fullName}</h2><p>{selected.department||"Departman yok"} · {selected.title||"Görev yok"}</p></span></div>
            {!audit ? <div className="ikpf-actions">
              {editing ? <><button onClick={()=>{setEditing(false);setDraft(null)}}><X size={15}/>Vazgeç</button><button className="primary" disabled={busy} onClick={saveEdit}><Save size={15}/>Kaydet</button></> : <>
                <button onClick={startEdit}><Pencil size={15}/>Düzenle</button>
                <button className="warn" disabled={isPassive(selected)} onClick={()=>removePerson("PASSIVE")}>Pasife Al</button>
                {canHardDelete ? <button className="danger" onClick={()=>removePerson("HARD")}><Trash2 size={15}/>Kalıcı Sil</button> : null}
              </>}
            </div> : null}
          </section>

          <section className="ikpf-stats">
            <Stat label="Maaş" value={money(person?.salary)} sub="Mevcut ücret"/>
            <Stat label="Yol" value={money(person?.roadAllowance)} sub="Yan hak"/>
            <Stat label="Bankaya" value={money(person?.bankAmount)} sub={person?.paymentChannel||"Ödeme planı"}/>
            <Stat label="Elden" value={money(person?.cashAmount)} sub="Ödeme planı"/>
            <Stat label="Toplam Plan" value={money(paymentPlan)} sub={Math.abs(paymentDifference) < 0.01 ? "Maaş + yol ile dengeli" : `Fark: ${money(paymentDifference)}`}/>
          </section>

          <section className="ikpf-card">
            <div className="ikpf-section-title"><div><UserRound size={18}/><strong>Personel ve Özlük Bilgileri</strong></div><span>PDKS işlemi yok</span></div>
            <div className="ikpf-form-grid">
              <Field label="Ad Soyad"><input disabled={!editing} value={person?.fullName||""} onChange={(e)=>setDraft({...draft,fullName:e.target.value})}/></Field>
              <Field label="Personel Kodu"><input disabled value={selected.personnelCode||selected.code||""}/></Field>
              <Field label="T.C. / Kimlik No"><input disabled={!editing} value={person?.identityNo||""} onChange={(e)=>setDraft({...draft,identityNo:e.target.value})}/></Field>
              <Field label="Telefon"><input disabled={!editing} value={person?.phone||""} onChange={(e)=>setDraft({...draft,phone:e.target.value})}/></Field>
              <Field label="Departman"><input disabled={!editing} value={person?.department||""} onChange={(e)=>setDraft({...draft,department:e.target.value})}/></Field>
              <Field label="Görev"><input disabled={!editing} value={person?.title||""} onChange={(e)=>setDraft({...draft,title:e.target.value})}/></Field>
              <Field label="Çalışma Tipi"><select disabled={!editing} value={person?.workType||"Aylık"} onChange={(e)=>setDraft({...draft,workType:e.target.value})}><option>Aylık</option><option>Günlük</option><option>Saatlik</option></select></Field>
              <Field label="SGK"><select disabled={!editing} value={person?.sgkStatus||"VAR"} onChange={(e)=>setDraft({...draft,sgkStatus:e.target.value})}><option value="VAR">VAR</option><option value="YOK">YOK</option></select></Field>
              <Field label="İşe Giriş"><input disabled={!editing} type="date" value={dateOnly(person?.startDate)} onChange={(e)=>setDraft({...draft,startDate:e.target.value})}/></Field>
              <Field label="İşten Çıkış"><input disabled={!editing} type="date" value={dateOnly(person?.exitDate)} onChange={(e)=>setDraft({...draft,exitDate:e.target.value})}/></Field>
              <Field label="Durum"><select disabled={!editing} value={person?.status||"Aktif"} onChange={(e)=>setDraft({...draft,status:e.target.value})}><option>Aktif</option><option>Pasif</option><option>İzinli</option></select></Field>
              <Field label="PDKS Kart No"><input disabled value={selected.cardNo||"Atanmadı"}/></Field>
            </div>
          </section>

          {!audit ? <section className="ikpf-card emphasis">
            <div className="ikpf-section-title"><div><Banknote size={18}/><strong>Maaş, Yol ve Ödeme Planı</strong></div><span>İK ana kaynak</span></div>
            <div className="ikpf-form-grid">
              <Field label="Maaş"><input disabled={!editing} type="number" value={num(person?.salary)} onChange={(e)=>setDraft({...draft,salary:Number(e.target.value||0)})}/></Field>
              <Field label="Yol"><input disabled={!editing} type="number" value={num(person?.roadAllowance)} onChange={(e)=>setDraft({...draft,roadAllowance:Number(e.target.value||0)})}/></Field>
              <Field label="Ödeme Kanalı"><select disabled={!editing} value={person?.paymentChannel||"Banka + Elden"} onChange={(e)=>setDraft({...draft,paymentChannel:e.target.value})}><option>Banka + Elden</option><option>Banka</option><option>Elden</option></select></Field>
              <Field label="Bankaya Ödenecek"><input disabled={!editing} type="number" value={num(person?.bankAmount)} onChange={(e)=>setDraft({...draft,bankAmount:Number(e.target.value||0)})}/></Field>
              <Field label="Elden Ödenecek"><input disabled={!editing} type="number" value={num(person?.cashAmount)} onChange={(e)=>setDraft({...draft,cashAmount:Number(e.target.value||0)})}/></Field>
              <Field label="Mesai Saat Tabanı"><input disabled={!editing} type="number" value={num(person?.overtimeBaseHours)||225} onChange={(e)=>setDraft({...draft,overtimeBaseHours:Number(e.target.value||0)})}/></Field>
              <Field label="Yıllık İzin Hakkı"><input disabled={!editing} type="number" value={num(person?.annualLeaveEntitlement)} onChange={(e)=>setDraft({...draft,annualLeaveEntitlement:Number(e.target.value||0)})}/></Field>
              <Field label="Devreden İzin"><input disabled={!editing} type="number" value={num(person?.annualLeaveCarryover)} onChange={(e)=>setDraft({...draft,annualLeaveCarryover:Number(e.target.value||0)})}/></Field>
              <Field label="Not" wide><textarea disabled={!editing} value={person?.note||""} onChange={(e)=>setDraft({...draft,note:e.target.value})}/></Field>
            </div>
            {editing ? <div className="ikpf-change">
              <Field label="Geçerlilik Tarihi"><input type="date" value={effectiveDate} onChange={(e)=>setEffectiveDate(e.target.value)}/></Field>
              <Field label="Değişiklik Açıklaması" wide><input value={changeNote} onChange={(e)=>setChangeNote(e.target.value)} placeholder="Örn. Eylül 2026 maaş revizyonu"/></Field>
            </div> : null}
          </section> : null}

          <div className="ikpf-two">
            <section className="ikpf-card">
              <div className="ikpf-section-title"><div><WalletCards size={18}/><strong>Ücret Geçmişi</strong></div><span>{salaryHistory.length}</span></div>
              <div className="ikpf-table">
                <div className="head"><span>Tarih</span><span>Maaş</span><span>Yol</span><span>Banka</span><span>Elden</span></div>
                {salaryHistory.slice(0,20).map((row)=><div key={row.id}><span>{dateOnly(row.effective_date||row.effectiveDate)||"-"}</span><b>{money(row.salary)}</b><span>{money(row.road_allowance||row.roadAllowance)}</span><span>{money(row.bank_amount||row.bankAmount)}</span><span>{money(row.cash_amount||row.cashAmount)}</span></div>)}
                {!salaryHistory.length ? <p>Kayıtlı ücret geçmişi yok.</p> : null}
              </div>
            </section>
            <section className="ikpf-card">
              <div className="ikpf-section-title"><div><BadgeCheck size={18}/><strong>Özlük / Değişiklik Geçmişi</strong></div><span>{changeHistory.length}</span></div>
              <div className="ikpf-history">
                {changeHistory.slice(0,20).map((row)=><article key={row.id}><strong>{row.field_name||row.fieldName||row.change_type||"Değişiklik"}</strong><span>{row.old_value||"-"} → {row.new_value||"-"}</span><small>{dateOnly(row.effective_date||row.effectiveDate)} · {row.note||""}</small></article>)}
                {!changeHistory.length ? <p>Değişiklik geçmişi yok.</p> : null}
              </div>
            </section>
          </div>

          {leaveRows.length ? <section className="ikpf-card subtle">
            <div className="ikpf-section-title"><div><BadgeCheck size={18}/><strong>İzin Geçmişi</strong></div><span>Özlük kaydı</span></div>
            <div className="ikpf-table leave">
              <div className="head"><span>Tür</span><span>Başlangıç</span><span>Bitiş</span><span>Gün</span><span>Not</span></div>
              {leaveRows.slice(0,30).map((row)=><div key={row.id}><b>{row.record_type||"İzin"}</b><span>{dateOnly(row.start_date)}</span><span>{dateOnly(row.end_date)}</span><span>{num(row.day_count)}</span><span>{row.note||"-"}</span></div>)}
            </div>
          </section> : null}
        </>}
      </main>
    </div>
    {busy ? <div className="ikpf-busy">İşlem yapılıyor…</div> : null}
  </div>;
}
