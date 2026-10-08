import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addPdksTimeEvent,
  getPdksAttendance,
  getPdksLeaveCenter,
  getPdksLeaveEntitlement,
  getPdksModernConfig,
  getPdksPeople,
  previewPdksLeaveV2,
  savePdksCorrection,
  savePdksLeaveV2,
} from "../../services/pdksApi";
import { selectedPdksPerson, visiblePdksPeople } from "../../services/pdksPresentation";
import "./PdksPersonnelDesk.css";

const MONTHS=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const NOW=new Date();
const upper=(v)=>String(v||"").trim().toLocaleUpperCase("tr-TR");
const num=(v)=>Number.isFinite(Number(v))?Number(v):0;
const iso=()=>new Date().toISOString().slice(0,10);
const dateTr=(date)=>{const d=new Date(`${date}T12:00:00`);return Number.isNaN(d.getTime())?date:d.toLocaleDateString("tr-TR")};
const dayName=(date)=>{const d=new Date(`${date}T12:00:00`);return Number.isNaN(d.getTime())?"":d.toLocaleDateString("tr-TR",{weekday:"short"})};
const statusLabel=(value)=>({AUTO:"Otomatik",CALISTI:"Çalıştı",EKSIK_BASIM:"Eksik Basım",KART_YOK:"Kart Yok",YILLIK_IZIN:"Yıllık İzin",YARIM_GUN_IZIN:"Yarım Gün İzin",IZIN:"İzin",EVLILIK:"Evlilik İzni",EVLAT_EDINME:"Evlat Edinme",OLUM:"Ölüm İzni",BABALIK:"Babalık İzni",DOGUM:"Doğum İzni",RAPOR:"Rapor / İstirahat",UCRETSIZ:"Ücretsiz İzin",SUT:"Süt İzni",DOGUM_SONRASI_YARIM:"Doğum Sonrası Yarım",ENGELLI_COCUK_TEDAVI:"Çocuk Tedavi İzni",YOL_IZNI:"Yol İzni",MAZERET:"Mazeret İzni",IDARI:"İdari İzin",RESMI_TATIL:"Resmî Tatil",RESMI_TATIL_CALISMA:"Resmî Tatil Çalışması",YARIM_GUN_TATIL:"Yarım Gün Tatil",YARIM_GUN_TATIL_CALISMA:"Yarım Gün Tatil Çalışması",HAFTA_TATILI:"Hafta Tatili",HAFTA_TATILI_CALISMA:"Hafta Tatili Çalışması",DONEM_DISI:"Dönem Dışı",PLANLI_CALISMA:"Planlı Çalışma",KART_YOK_KONTROL:"Kart Yok · Kontrol",EKSIK_BASIM_KONTROL:"Eksik Basım · Kontrol"})[upper(value)]||String(value||"-");
const statusTone=(value)=>{const key=upper(value);if(["CALISTI","PLANLI_CALISMA","YILLIK_IZIN","IZIN","EVLILIK","EVLAT_EDINME","OLUM","BABALIK","DOGUM","RAPOR","UCRETSIZ","SUT","DOGUM_SONRASI_YARIM","ENGELLI_COCUK_TEDAVI","YOL_IZNI","MAZERET","IDARI","RESMI_TATIL","HAFTA_TATILI","YARIM_GUN_TATIL"].includes(key))return"ok";if(["EKSIK_BASIM","EKSIK_BASIM_KONTROL","KART_YOK_KONTROL","YARIM_GUN_IZIN","YARIM_GUN_TATIL_CALISMA"].includes(key))return"warn";if(key==="KART_YOK")return"bad";if(["RESMI_TATIL_CALISMA","HAFTA_TATILI_CALISMA"].includes(key))return"accent";return"muted"};

function Modal({title,subtitle,children,onClose,wide=false}){return <div className="ppd-modal-layer" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose?.()}}><section className={`ppd-modal ${wide?"wide":""}`}><header><div><h3>{title}</h3>{subtitle?<p>{subtitle}</p>:null}</div><button type="button" className="ppd-close" onClick={onClose}>×</button></header><div className="ppd-modal-body">{children}</div></section></div>}
function PersonInfo({person,schedule,onOpenIk}){const rows=[["Personel Kodu",person?.personnelCode||person?.code||"-"],["Kart No",person?.cardNo||"Atanmadı"],["Bölüm",person?.department||"-"],["Görev",person?.title||"-"],["İşe Giriş",person?.startDate||"-"],["İşten Çıkış",person?.exitDate||"-"],["Durum",person?.status||"Aktif"],["Vardiya",schedule?.groupName||"Normal Mesai"],["Mesai",`${schedule?.entryTime||"08:30"} – ${schedule?.exitTime||"19:00"}`],["Mola",`${schedule?.breakMinutes??60} dk`],["Kaynak","İK Personel Kartı"]];return <div><div className="ppd-person-hero"><div className="ppd-big-avatar">{String(person?.fullName||"?").split(/\s+/).slice(0,2).map(v=>v[0]).join("")}</div><div><h2>{person?.fullName||"Personel"}</h2><span>{person?.department||"Bölüm yok"} · {person?.title||"Görev yok"}</span><div className="ppd-person-badges"><b className="ok">İK Ana Kaynak</b><b>{person?.cardNo?`Kart ${person.cardNo}`:"Kart Bekliyor"}</b></div></div></div><div className="ppd-info-grid">{rows.map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div><div className="ppd-hint">PDKS ikinci personel kartı oluşturmaz. Ad, görev, statü, maaş ve diğer ana bilgiler yalnız İK Personel Kartında yönetilir; bu ekran kart ve puantaj için salt operasyon referansıdır.</div><button type="button" className="ppd-primary" onClick={onOpenIk}>Tam Personel Kartını Aç</button></div>}

export default function PdksPersonnelDesk({activeTab="personel-bilgileri",activeMainCompany,isAuditAccount=false,openModule}){
  const company=activeMainCompany?.slug||activeMainCompany?.id||"mecit-hakan";
  const [year,setYear]=useState(NOW.getFullYear()),[month,setMonth]=useState(NOW.getMonth()+1);
  const [people,setPeople]=useState([]),[selectedId,setSelectedId]=useState(""),[attendance,setAttendance]=useState(null),[modern,setModern]=useState({leaveTypes:[]}),[leaveCenter,setLeaveCenter]=useState({plans:[]}),[entitlement,setEntitlement]=useState(null);
  const [search,setSearch]=useState(""),[filter,setFilter]=useState("AKTIF"),[centerTab,setCenterTab]=useState(activeTab==="puantaj"?"puantaj":["giris-cikislar","calisma-tarihi"].includes(activeTab)?"giris":activeTab==="izinler"?"izin":"bilgi");
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState(""),[modal,setModal]=useState("");
  const [punch,setPunch]=useState({date:iso(),time:"08:30",direction:"AUTO",note:"Manuel PDKS hareketi"});
  const [correction,setCorrection]=useState({date:iso(),status:"CALISTI",entry:"08:30",exit:"19:00",reason:"",note:""});
  const [leave,setLeave]=useState({leaveTypeCode:"YILLIK_IZIN",startDate:iso(),endDate:iso(),dayPart:"FULL",documentNo:"",note:""}),[leavePreview,setLeavePreview]=useState(null);

  const selected=useMemo(()=>selectedPdksPerson(people,filter,selectedId),[people,filter,selectedId]);
  const personLeaves=useMemo(()=>(leaveCenter?.plans||[]).filter(row=>(row.employeeId||row.employee_id)===selected?.id),[leaveCenter?.plans,selected?.id]);
  useEffect(()=>{if(activeTab==="puantaj")setCenterTab("puantaj");else if(["giris-cikislar","calisma-tarihi"].includes(activeTab))setCenterTab("giris");else if(activeTab==="izinler")setCenterTab("izin");else if(activeTab==="personel-bilgileri")setCenterTab("bilgi")},[activeTab]);

  const loadCore=useCallback(async()=>{setBusy(true);setError("");try{const [personRows,config,leaves]=await Promise.all([getPdksPeople({mainCompanyId:company,year,month}),getPdksModernConfig({mainCompanyId:company}),getPdksLeaveCenter({mainCompanyId:company,from:String(year)+"-01-01",to:String(year)+"-12-31"})]);const list=Array.isArray(personRows)?personRows:[];setPeople(list);setModern(config||{leaveTypes:[]});setLeaveCenter(leaves||{plans:[]});setSelectedId(current=>list.some(p=>p.id===current)?current:(list[0]?.id||""))}catch(cause){setError(cause?.message||"PDKS personel merkezi yüklenemedi.")}finally{setBusy(false)}},[company,month,year]);
  const loadPerson=useCallback(async()=>{if(!selected?.id){setAttendance(null);setEntitlement(null);return}setBusy(true);setError("");try{const [att,ent]=await Promise.all([getPdksAttendance(selected.id,year,month),getPdksLeaveEntitlement(selected.id,{mainCompanyId:company})]);setAttendance(att||null);setEntitlement(ent||null)}catch(cause){setError(cause?.message||"Personel puantajı yüklenemedi.")}finally{setBusy(false)}},[company,month,selected?.id,year]);
  useEffect(()=>{loadCore()},[loadCore]);useEffect(()=>{loadPerson()},[loadPerson]);

  const filtered=useMemo(()=>visiblePdksPeople(people,filter,search),[people,filter,search]);
  const attendanceRows=attendance?.days||[],summary=attendance?.summary||{},schedule=attendance?.schedule||{};
  const selectedLeaveType=(modern?.leaveTypes||[]).find(row=>row.code===leave.leaveTypeCode);
  const openIk=()=>openModule?.("ik",{tabKey:"personel-kartlari",actionContext:{source:"pdks",employeeId:selected?.id}});

  const savePunch=async()=>{if(isAuditAccount||!selected)return;setBusy(true);setError("");try{await addPdksTimeEvent(selected.id,{cardNo:selected.cardNo,workDate:punch.date,eventTime:punch.time,direction:punch.direction,source:"KYERP_WEB_PDKS",note:punch.note});setNotice("Kart hareketi D1'e kaydedildi; Agent ve web aynı kaydı görecek.");setModal("");await loadPerson()}catch(cause){setError(cause?.message||"Kart hareketi kaydedilemedi.")}finally{setBusy(false)}};
  const saveCorrection=async()=>{if(isAuditAccount||!selected)return;if(!correction.reason.trim()){setError("Puantaj düzeltme nedeni zorunludur.");return}setBusy(true);setError("");try{await savePdksCorrection(selected.id,{workDate:correction.date,status:correction.status,entry:correction.entry||null,exit:correction.exit||null,note:correction.note||correction.reason,reason:correction.reason,missingPunch:correction.status==="EKSIK_BASIM"});setNotice("Puantaj düzeltildi; eski/yeni değer ve kullanıcı denetim loguna işlendi.");setModal("");await loadPerson()}catch(cause){setError(cause?.message||"Puantaj düzeltilemedi.")}finally{setBusy(false)}};
  const previewLeave=async()=>{if(!selected)return;setBusy(true);setError("");try{setLeavePreview(await previewPdksLeaveV2({mainCompanyId:company,employeeId:selected.id,...leave}))}catch(cause){setLeavePreview(null);setError(cause?.message||"İzin önizlenemedi.")}finally{setBusy(false)}};
  const saveLeave=async()=>{if(isAuditAccount||!selected||!leavePreview)return;setBusy(true);setError("");try{await savePdksLeaveV2({mainCompanyId:company,employeeId:selected.id,...leave,status:"APPROVED"});setNotice(`${selected.fullName} için ${selectedLeaveType?.name||"izin"} İK ana kaynağına işlendi; puantaj otomatik yenilendi.`);setLeavePreview(null);setModal("");await Promise.all([loadCore(),loadPerson()])}catch(cause){setError(cause?.message||"İzin kaydedilemedi.")}finally{setBusy(false)}};
  const openCorrection=(row)=>{setCorrection({date:row.date,status:row.status||"CALISTI",entry:row.entry||"",exit:row.exit||"",reason:"",note:row.note||""});setModal("correction")};

  return <div className="ppd-page">
    <header className="ppd-topline">
      <div className="ppd-heading">
        <span className="ppd-eyebrow">KY ERP / PDKS / PERSONEL</span>
        <h1>Personel ve devam takibi</h1>
        <p>Tek listeden personeli seçin; kart, çalışma ve izin bilgilerine ulaşın.</p>
      </div>
      <div className="ppd-period" aria-label="Dönem seçimi">
        <label>Ay<select aria-label="Ay" value={month} onChange={e=>setMonth(Number(e.target.value))}>{MONTHS.map((label,i)=><option value={i+1} key={label}>{label}</option>)}</select></label>
        <label>Yıl<input aria-label="Yıl" type="number" value={year} min="2020" max="2100" onChange={e=>setYear(Math.min(2100,Math.max(2020,Number(e.target.value)||NOW.getFullYear())))}/></label>
        <button type="button" onClick={()=>Promise.all([loadCore(),loadPerson()])} disabled={busy}>{busy?"Yükleniyor...":"Yenile"}</button>
      </div>
    </header>
    {notice?<div className="ppd-notice">{notice}</div>:null}{error?<div className="ppd-error">{error}</div>:null}
    <div className="ppd-workspace">
      <aside className="ppd-people-panel" aria-label="Personel listesi">
        <div className="ppd-list-title">
          <div><h2>Personeller</h2><p>{filtered.length} kayıt gösteriliyor</p></div>
          <strong>{filtered.length}</strong>
        </div>
        <label className="ppd-person-search">
          <span>Personel ara</span>
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Kart no veya ad soyad..." />
        </label>
        <div className="ppd-filter" role="group" aria-label="Personel durumu">
          <button type="button" aria-pressed={filter==="AKTIF"} className={filter==="AKTIF"?"active":""} onClick={()=>setFilter("AKTIF")}>Aktif</button>
          <button type="button" aria-pressed={filter==="PASIF"} className={filter==="PASIF"?"active":""} onClick={()=>setFilter("PASIF")}>Pasif</button>
          <button type="button" aria-pressed={filter==="TUM"} className={filter==="TUM"?"active":""} onClick={()=>setFilter("TUM")}>Tümü</button>
        </div>
        <div className="ppd-person-headrow"><span>Kart No</span><span>Ad Soyad</span><span>Grup</span></div>
        <div className="ppd-person-list" aria-live="polite">
          {filtered.map(person=><button type="button" key={person.id} aria-pressed={selected?.id===person.id} className={selected?.id===person.id?"active":""} onClick={()=>setSelectedId(person.id)}>
            <code>{person.cardNo||person.personnelCode||"—"}</code>
            <strong>{person.fullName||"İsimsiz personel"}</strong>
            <span>{person.personnelGroupName||person.groupName||person.workGroupName||"Atanmamış"}</span>
          </button>)}
          {!filtered.length?<div className="ppd-empty">Bu filtrede personel bulunamadı.</div>:null}
        </div>
      </aside>

      <section className="ppd-center-panel" aria-label="Personel detayları">
        {selected ? <>
          <div className="ppd-selected-hero">
            <div className="ppd-big-avatar">{String(selected.fullName||"?").split(/\s+/).slice(0,2).map(v=>v[0]).join("")}</div>
            <div className="ppd-selected-person">
              <span>SEÇİLİ PERSONEL</span>
              <h2>{selected.fullName}</h2>
              <p>Kart {selected.cardNo||"Atanmamış"} · {schedule.groupName||selected.personnelGroupName||"Çalışma grubu yok"}</p>
            </div>
            <div className="ppd-person-actions">
              <button type="button" className="ppd-primary" onClick={openIk}>İK Kartını Aç</button>
              {!isAuditAccount?<button type="button" onClick={()=>{setCenterTab("izin");setLeavePreview(null);setModal("leave")}}>İzin İşlemi</button>:null}
            </div>
          </div>
          <div className="ppd-overview-stats" aria-label="Aylık personel özeti">
            <div><span>Çalışılan gün</span><strong>{num(summary.workedDays)}</strong></div>
            <div><span>Normal süre</span><strong>{(num(summary.payableNormalMinutes)/60).toLocaleString("tr-TR",{maximumFractionDigits:1})} <small>sa</small></strong></div>
            <div><span>Fazla mesai</span><strong>{(num(summary.overtimeMinutes)/60).toLocaleString("tr-TR",{maximumFractionDigits:1})} <small>sa</small></strong></div>
            <div><span>Eksik / kart yok</span><strong>{num(summary.missingPunchDays)+num(summary.noPunchDays)}</strong></div>
          </div>
          <nav className="ppd-tabs" aria-label="Personel alt sayfaları">
            <button type="button" aria-current={centerTab==="bilgi"?"page":undefined} className={centerTab==="bilgi"?"active":""} onClick={()=>setCenterTab("bilgi")}>Personel Özeti</button>
            <button type="button" aria-current={centerTab==="giris"?"page":undefined} className={centerTab==="giris"?"active":""} onClick={()=>setCenterTab("giris")}>Giriş / Çıkış</button>
            <button type="button" aria-current={centerTab==="puantaj"?"page":undefined} className={centerTab==="puantaj"?"active":""} onClick={()=>setCenterTab("puantaj")}>Puantaj</button>
            <button type="button" aria-current={centerTab==="izin"?"page":undefined} className={centerTab==="izin"?"active":""} onClick={()=>setCenterTab("izin")}>İzinler</button>
          </nav>
          <div className="ppd-center-body">
            {centerTab==="bilgi"?<PersonInfo person={selected} schedule={schedule} onOpenIk={openIk}/>:null}
            {centerTab==="giris"?<>
              <div className="ppd-sectionbar">
                <div><h3>{MONTHS[month-1]} {year} · Giriş / Çıkış</h3><p>Gerçek kart hareketleri ve onaylı düzeltmeler ayrı gösterilir.</p></div>
                <span className="ppd-record-count">{attendanceRows.length} gün</span>
              </div>
              <div className="ppd-table-scroll">
                <table className="ppd-activity-table">
                  <thead><tr><th scope="col">Tarih</th><th scope="col">Giriş</th><th scope="col">Çıkış</th><th scope="col">Kaynak</th><th scope="col">Durum</th><th scope="col">İşlem</th></tr></thead>
                  <tbody>{attendanceRows.slice().reverse().map(row=><tr key={row.date}>
                    <td><strong>{dateTr(row.date)}</strong><small>{dayName(row.date)}</small></td>
                    <td><span className="ppd-clock">{row.entry||"—"}</span>{row.manualEntry?<span className="ppd-edit-mark" title="Elle düzenleme">E</span>:null}</td>
                    <td><span className="ppd-clock">{row.exit||"—"}</span>{row.manualExit?<span className="ppd-edit-mark" title="Elle düzenleme">E</span>:null}</td>
                    <td className="ppd-source">{row.source==="MANUAL_OVERRIDE"?"Onaylı düzeltme":"Kart / Agent"}{row.duplicatePunches?<small>{row.duplicatePunches} tekrar</small>:null}</td>
                    <td><span className={"ppd-status "+statusTone(row.status)}>{statusLabel(row.status)}</span></td>
                    <td>{!isAuditAccount?<button className="ppd-row-action" type="button" onClick={()=>openCorrection(row)}>İncele / Düzelt</button>:<span className="ppd-source">Salt okunur</span>}</td>
                  </tr>)}</tbody>
                </table>
                {!attendanceRows.length?<div className="ppd-empty">Bu ay için kayıt bulunamadı. Son eşitleme ve terminal durumunu kontrol edin.</div>:null}
              </div>
              <div className="ppd-data-note">E işareti elle düzenlenmiş hareketi gösterir. Ham terminal kayıtları bu ekrandan değiştirilmez.</div>
            </>:null}
            {centerTab==="puantaj"?<>
              <div className="ppd-sectionbar">
                <div><h3>{MONTHS[month-1]} {year} · Puantaj</h3><p>Ayın çalışma, mesai ve istisnaları. Hesaplanan süreler onaylı aylık dönemden kontrol edilir.</p></div>
                <button type="button" className="ppd-row-action" onClick={()=>openModule?.("pdks",{tabKey:"puantaj-sonuclari"})}>Toplu Sonuçlar</button>
              </div>
              <div className="ppd-payroll-summary">
                <div><span>Normal hedef</span><b>{summary.profileConfigured?(num(summary.normalTargetMinutes)/60).toLocaleString("tr-TR",{maximumFractionDigits:2})+" sa":"Profil bekliyor"}</b></div>
                <div><span>Ödenecek normal</span><b>{(num(summary.payableNormalMinutes)/60).toLocaleString("tr-TR",{maximumFractionDigits:2})} sa</b></div>
                <div><span>Fiilî kart süresi</span><b>{(num(summary.actualWorkedMinutes??summary.workedMinutes)/60).toLocaleString("tr-TR",{maximumFractionDigits:2})} sa</b></div>
                <div><span>Normal kesinti</span><b>{(num(summary.normalDeductionMinutes)/60).toLocaleString("tr-TR",{maximumFractionDigits:2})} sa</b></div>
              </div>
              <div className="ppd-table-scroll">
                <table className="ppd-activity-table">
                  <thead><tr><th>Tarih</th><th>Giriş</th><th>Çıkış</th><th>Normal</th><th>Mesai</th><th>Geç</th><th>Durum</th></tr></thead>
                  <tbody>{attendanceRows.map(row=><tr key={row.date}>
                    <td><strong>{dateTr(row.date)}</strong><small>{dayName(row.date)}</small></td>
                    <td><span className="ppd-clock">{row.entry||"—"}</span>{row.manualEntry?<span className="ppd-edit-mark">E</span>:null}</td>
                    <td><span className="ppd-clock">{row.exit||"—"}</span>{row.manualExit?<span className="ppd-edit-mark">E</span>:null}</td>
                    <td>{(num(row.normalPayableMinutes)/60).toLocaleString("tr-TR",{maximumFractionDigits:1})} sa</td>
                    <td>{(num(row.overtimeMinutes)/60).toLocaleString("tr-TR",{maximumFractionDigits:1})} sa</td>
                    <td>{num(row.lateMinutes)||"—"}</td>
                    <td><span className={"ppd-status "+statusTone(row.status)}>{statusLabel(row.status)}</span></td>
                  </tr>)}</tbody>
                </table>
                {!attendanceRows.length?<div className="ppd-empty">Seçilen dönemde puantaj hareketi bulunamadı.</div>:null}
              </div>
              {num(summary.blockedDays)>0?<div className="ppd-data-note">{num(summary.blockedDays)} gün düzeltme bekliyor. Düzeltme için Giriş / Çıkış sekmesine geçin.</div>:null}
            </>:null}
            {centerTab==="izin"?<>
              <div className="ppd-sectionbar">
                <div><h3>İzin ve hakediş</h3><p>İK ana kaynağındaki izin kayıtları puantaja yansır.</p></div>
                {!isAuditAccount?<button type="button" className="ppd-primary" onClick={()=>{setLeavePreview(null);setModal("leave")}}>İzin Ekle</button>:null}
              </div>
              <div className="ppd-entitlement">
                <div><span>Hakediş</span><strong>{num(entitlement?.currentCardEntitlement)} gün</strong></div>
                <div><span>Devreden</span><strong>{num(entitlement?.carryover)} gün</strong></div>
                <div><span>Kullanılan</span><strong>{num(entitlement?.used)} gün</strong></div>
                <div className="net"><span>Kalan</span><strong>{num(entitlement?.remaining)} gün</strong></div>
              </div>
              <div className="ppd-table-scroll">
                <table className="ppd-activity-table">
                  <thead><tr><th>Başlangıç</th><th>Bitiş</th><th>İzin Türü</th><th>Gün</th><th>Durum</th></tr></thead>
                  <tbody>{personLeaves.map(row=><tr key={row.id}><td>{row.startDate||row.start_date}</td><td>{row.endDate||row.end_date}</td><td>{row.recordType||row.record_type}</td><td>{num(row.countedDays??row.counted_days??row.dayCount)}</td><td>{row.status||"—"}</td></tr>)}</tbody>
                </table>
                {!personLeaves.length?<div className="ppd-empty">Bu personel için izin kaydı yok.</div>:null}
              </div>
            </>:null}
          </div>
        </> : <div className="ppd-empty ppd-full-empty">Personel seçmek için soldaki listeyi kullanın.</div>}
      </section>
    </div>

    {modal==="punch"?<Modal title="Giriş / Çıkış Ekle" subtitle={`${selected?.fullName||"Personel"} · ham kart hareketi`} onClose={()=>setModal("")}><div className="ppd-form"><label>Tarih<input type="date" value={punch.date} onChange={e=>setPunch({...punch,date:e.target.value})}/></label><label>Saat<input type="time" value={punch.time} onChange={e=>setPunch({...punch,time:e.target.value})}/></label><label>Yön<select value={punch.direction} onChange={e=>setPunch({...punch,direction:e.target.value})}><option value="AUTO">Otomatik</option><option value="IN">Giriş</option><option value="OUT">Çıkış</option></select></label><label className="wide">Açıklama<input value={punch.note} onChange={e=>setPunch({...punch,note:e.target.value})}/></label></div><div className="ppd-modal-actions"><button onClick={()=>setModal("")}>Vazgeç</button><button className="ppd-primary" onClick={savePunch} disabled={busy}>Kaydet</button></div></Modal>:null}
    {modal==="correction"?<Modal title="Puantaj Düzeltme" subtitle="Ham kart kaydı silinmez; düzeltme ve önceki değer denetim logunda saklanır." onClose={()=>setModal("")}><div className="ppd-form"><label>Tarih<input type="date" value={correction.date} onChange={e=>setCorrection({...correction,date:e.target.value})}/></label><label>Durum<select value={correction.status} onChange={e=>setCorrection({...correction,status:e.target.value})}>{["AUTO","CALISTI","EKSIK_BASIM","KART_YOK","YILLIK_IZIN","IZIN","RAPOR","UCRETSIZ","HAFTA_TATILI","RESMI_TATIL"].map(v=><option key={v} value={v}>{statusLabel(v)}</option>)}</select></label><label>Giriş<input type="time" value={correction.entry} onChange={e=>setCorrection({...correction,entry:e.target.value})}/></label><label>Çıkış<input type="time" value={correction.exit} onChange={e=>setCorrection({...correction,exit:e.target.value})}/></label><label className="wide">Düzeltme Nedeni *<input value={correction.reason} onChange={e=>setCorrection({...correction,reason:e.target.value})} placeholder="Kart unutuldu, amir onayı, geç basım düzeltmesi..."/></label><label className="wide">Not<input value={correction.note} onChange={e=>setCorrection({...correction,note:e.target.value})}/></label></div><div className="ppd-audit-note">Kullanıcı, tarih-saat, eski değer ve yeni değer audit kaydına yazılır. Kilitli dönem değiştirilemez.</div><div className="ppd-modal-actions"><button onClick={()=>setModal("")}>Vazgeç</button><button className="ppd-primary" onClick={saveCorrection} disabled={busy||!correction.reason.trim()}>Düzeltmeyi Kaydet</button></div></Modal>:null}
    {modal==="leave"?<Modal wide title="İzin Ekle / Önizle" subtitle="Tek kayıt İK ana kaynağına gider; PDKS günleri otomatik puantaja uygular." onClose={()=>setModal("")}><div className="ppd-form leave-form"><label>İzin Türü<select value={leave.leaveTypeCode} onChange={e=>{setLeave({...leave,leaveTypeCode:e.target.value});setLeavePreview(null)}}>{(modern?.leaveTypes||[]).filter(t=>Number(t.active)!==0).map(t=><option key={t.code} value={t.code}>{t.name}</option>)}</select></label><label>Başlangıç<input type="date" value={leave.startDate} onChange={e=>{setLeave({...leave,startDate:e.target.value});setLeavePreview(null)}}/></label><label>Bitiş<input type="date" value={leave.endDate} onChange={e=>{setLeave({...leave,endDate:e.target.value});setLeavePreview(null)}}/></label><label>Gün Bölümü<select value={leave.dayPart} onChange={e=>{setLeave({...leave,dayPart:e.target.value});setLeavePreview(null)}}><option value="FULL">Tam Gün</option><option value="MORNING">Sabah / İlk Yarım</option><option value="AFTERNOON">Öğleden Sonra / İkinci Yarım</option></select></label>{selectedLeaveType?.requiresDocument?<label>Belge / Rapor No *<input value={leave.documentNo} onChange={e=>setLeave({...leave,documentNo:e.target.value})}/></label>:null}<label className="wide">Açıklama<input value={leave.note} onChange={e=>setLeave({...leave,note:e.target.value})}/></label></div>{selectedLeaveType?.legalNote?<div className="ppd-legal-note">{selectedLeaveType.legalNote}</div>:null}<div className="ppd-modal-actions left"><button className="ppd-primary" onClick={previewLeave} disabled={busy}>Gün Gün Hesapla</button>{leavePreview?<><span>İzin: <b>{leavePreview.leaveDays}</b> gün</span><span>Bakiyeden: <b>{leavePreview.countedDays}</b> gün</span>{leavePreview.leaveType?.annualBalanceEffect?<span>Kalan: <b>{leavePreview.annualAvailableAfter}</b> gün</span>:null}</>:null}</div>{leavePreview?<div className="ppd-preview-days"><div className="head"><span>Tarih</span><span>Gün</span><span>İzin</span><span>Bakiyeden</span><span>Bölüm</span><span>Açıklama</span></div>{(leavePreview.days||[]).map(row=><div key={row.date}><span>{dateTr(row.date)}</span><span>{dayName(row.date)}</span><b>{row.leaveFraction}</b><b>{row.countedFraction}</b><span>{row.dayPart}</span><span>{row.reason}</span></div>)}</div>:null}<div className="ppd-modal-actions"><button onClick={()=>setModal("")}>Vazgeç</button><button className="ppd-primary" onClick={saveLeave} disabled={busy||!leavePreview||(selectedLeaveType?.requiresDocument&&!leave.documentNo.trim())}>İzni Kaydet</button></div></Modal>:null}
  </div>;
}
