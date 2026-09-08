import { useCallback, useEffect, useMemo, useState } from "react";
import {
  assignPdksService, assignPdksWorkGroup, closePdksPeriod, getPdksAdvancedMonth,
  getPdksHolidays, getPdksMasters, getPdksPeople, savePdksHoliday, savePdksService, savePdksWorkGroup,
} from "../../services/pdksApi";
import "./PdksDefinitionsCenter.css";

const MONTHS=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const NOW=new Date();
const safe=(v)=>Array.isArray(v)?v:[];

function Notice({message,error}) {
  if(error) return <div className="pdcfg-notice bad">{error}</div>;
  return message ? <div className="pdcfg-notice">{message}</div> : null;
}

export default function PdksDefinitionsCenter({activeTab="gruplar-vardiyalar",activeMainCompany,isAuditAccount=false}) {
  const company=activeMainCompany?.slug||activeMainCompany?.id||"mecit-hakan";
  const [masters,setMasters]=useState({groups:[],services:[],groupAssignments:[],serviceAssignments:[]});
  const [people,setPeople]=useState([]),[holidays,setHolidays]=useState([]);
  const [year,setYear]=useState(NOW.getFullYear()),[month,setMonth]=useState(NOW.getMonth()+1);
  const [period,setPeriod]=useState({isLocked:false,lockedAt:null});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [groupForm,setGroupForm]=useState({code:"",name:"",entryTime:"08:30",exitTime:"19:00",lateTolerance:5,earlyTolerance:10,active:true});
  const [serviceForm,setServiceForm]=useState({code:"",name:"",routeNote:"",active:true});
  const [holidayForm,setHolidayForm]=useState({date:"",name:"",halfDay:false});
  const [personId,setPersonId]=useState(""),[groupId,setGroupId]=useState(""),[serviceId,setServiceId]=useState("");
  const [closeReason,setCloseReason]=useState("PDKS kontrollü dönem kapanışı");

  const load=useCallback(async()=>{
    setBusy(true); setError("");
    try{
      const [m,p,h,overview]=await Promise.all([
        getPdksMasters({mainCompanyId:company,year,month}),
        getPdksPeople({mainCompanyId:company,year,month}),
        getPdksHolidays({mainCompanyId:company,year}),
        getPdksAdvancedMonth({mainCompanyId:company,year,month}),
      ]);
      const nextMasters=m||{groups:[],services:[],groupAssignments:[],serviceAssignments:[]};
      const nextPeople=safe(p);
      setMasters(nextMasters); setPeople(nextPeople); setHolidays(safe(h));
      setPeriod({isLocked:Boolean(overview?.close?.isLocked),lockedAt:overview?.close?.lockedAt||null});
      setPersonId(current=>nextPeople.some(row=>row.id===current)?current:(nextPeople[0]?.id||""));
      setGroupId(current=>safe(nextMasters.groups).some(row=>row.id===current)?current:(nextMasters.groups?.[0]?.id||""));
      setServiceId(current=>safe(nextMasters.services).some(row=>row.id===current)?current:(nextMasters.services?.[0]?.id||""));
    }catch(cause){setError(cause?.message||"PDKS tanımları yüklenemedi.")}
    finally{setBusy(false)}
  },[company,month,year]);

  useEffect(()=>{load()},[load]);

  const groups=safe(masters?.groups),services=safe(masters?.services);
  const activeGroups=useMemo(()=>groups.filter(row=>row.active!==false&&Number(row.active??1)!==0),[groups]);
  const activeServices=useMemo(()=>services.filter(row=>row.active!==false&&Number(row.active??1)!==0),[services]);
  const selectedPerson=people.find(row=>row.id===personId)||null;
  const selectedGroup=groups.find(row=>row.id===groupId)||null;
  const selectedService=services.find(row=>row.id===serviceId)||null;

  const run=async(action,ok)=>{
    if(busy)return;
    setBusy(true); setError(""); setMessage("");
    try{await action();setMessage(ok);await load()}catch(cause){setError(cause?.message||"İşlem tamamlanamadı.")}
    finally{setBusy(false)}
  };

  const saveGroup=()=>run(async()=>{
    if(isAuditAccount)throw new Error("Denetim hesabı vardiya değiştiremez.");
    if(!groupForm.name.trim())throw new Error("Vardiya adı zorunludur.");
    await savePdksWorkGroup({mainCompanyId:company,...groupForm});
    setGroupForm({code:"",name:"",entryTime:"08:30",exitTime:"19:00",lateTolerance:5,earlyTolerance:10,active:true});
  },"Vardiya kaydedildi; web ve Windows aynı D1 tanımını kullanacak.");

  const assignGroup=()=>run(async()=>{
    if(isAuditAccount||!selectedPerson||!selectedGroup)throw new Error("Personel ve vardiya seçin.");
    await assignPdksWorkGroup(selectedPerson.id,selectedGroup.id,{mainCompanyId:company});
  },(selectedPerson?.fullName||"Personel")+" → "+(selectedGroup?.name||"Vardiya")+" atandı.");

  const saveService=()=>run(async()=>{
    if(isAuditAccount)throw new Error("Denetim hesabı servis değiştiremez.");
    if(!serviceForm.name.trim())throw new Error("Servis adı zorunludur.");
    await savePdksService({mainCompanyId:company,...serviceForm});
    setServiceForm({code:"",name:"",routeNote:"",active:true});
  },"Servis tanımı kaydedildi.");

  const assignService=()=>run(async()=>{
    if(isAuditAccount||!selectedPerson||!selectedService)throw new Error("Personel ve servis seçin.");
    await assignPdksService(selectedPerson.id,selectedService.id,{mainCompanyId:company});
  },(selectedPerson?.fullName||"Personel")+" → "+(selectedService?.name||"Servis")+" atandı.");

  const saveHoliday=()=>run(async()=>{
    if(isAuditAccount)throw new Error("Denetim hesabı tatil değiştiremez.");
    if(!holidayForm.date||!holidayForm.name.trim())throw new Error("Tarih ve tatil adı zorunludur.");
    await savePdksHoliday({mainCompanyId:company,...holidayForm});
    setHolidayForm({date:"",name:"",halfDay:false});
  },"Resmî tatil takvimi güncellendi.");

  const changePeriod=(lock)=>run(async()=>{
    if(isAuditAccount)throw new Error("Denetim hesabı dönem durumunu değiştiremez.");
    const result=await closePdksPeriod({mainCompanyId:company,year,month,lock,reason:closeReason.trim()||"PDKS dönem işlemi"});
    if(Number(result?.blockingCount||0)>0)throw new Error("Dönem değişmedi: "+result.blockingCount+" kontrol kaydı açık.");
  },lock?MONTHS[month-1]+" "+year+" dönemi kontrollü olarak kapatıldı.":MONTHS[month-1]+" "+year+" dönemi yeniden açıldı.");

  const title=activeTab==="servisler"?"Servis Yönetimi":activeTab==="donemler"?"Dönem / Kapanış":activeTab==="tatiller"?"Resmî Tatil Takvimi":"Gruplar / Vardiyalar";
  const subtitle=activeTab==="servisler"?"Personel servis hatlarını tek D1 tanımından yönet.":activeTab==="donemler"?"Ay kapanışını kontrollü kilitle; açık kontroller varsa işlem durur.":activeTab==="tatiller"?"Puantaj ve izin motorunun kullandığı resmî çalışma dışı günleri yönet.":"Vardiya saatlerini, toleransları ve personel atamalarını tek merkezde yönet.";

  return <div className="pdcfg-page">
    <header className="pdcfg-head"><div><small>PDKS / TANIMLAR</small><h1>{title}</h1><p>{subtitle}</p></div><div className="pdcfg-period"><select value={month} onChange={e=>setMonth(Number(e.target.value))}>{MONTHS.map((name,i)=><option key={name} value={i+1}>{name}</option>)}</select><input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value)||NOW.getFullYear())}/><button type="button" onClick={load} disabled={busy}>{busy?"Yükleniyor":"Yenile"}</button></div></header>
    <Notice message={message} error={error}/>

    {activeTab==="gruplar-vardiyalar"?<>
      <section className="pdcfg-stats"><div><span>Vardiya</span><b>{groups.length}</b></div><div><span>Aktif Vardiya</span><b>{activeGroups.length}</b></div><div><span>Personel</span><b>{people.length}</b></div><div><span>Atama</span><b>{safe(masters?.groupAssignments).length}</b></div></section>
      <div className="pdcfg-grid">
        <section className="pdcfg-card"><header><div><small>TANIMLI VARDİYALAR</small><h2>Çalışma Grupları</h2></div></header><div className="pdcfg-table shifts"><div className="head"><span>Kod</span><span>Vardiya</span><span>Giriş</span><span>Çıkış</span><span>Geç</span><span>Erken</span><span>Durum</span></div>{groups.map(row=><button type="button" className={groupId===row.id?"selected":""} key={row.id} onClick={()=>setGroupId(row.id)}><code>{row.code||"-"}</code><strong>{row.name}</strong><span>{row.entryTime||row.entry_time||"-"}</span><span>{row.exitTime||row.exit_time||"-"}</span><span>{row.lateTolerance??row.late_tolerance??0} dk</span><span>{row.earlyTolerance??row.early_tolerance??0} dk</span><em>{row.active===false||Number(row.active)===0?"Pasif":"Aktif"}</em></button>)}</div></section>
        {!isAuditAccount?<aside className="pdcfg-card form"><header><div><small>YENİ TANIM</small><h2>Vardiya Ekle</h2></div></header><div className="pdcfg-form"><label>Kod<input value={groupForm.code} onChange={e=>setGroupForm({...groupForm,code:e.target.value})} placeholder="NORMAL"/></label><label>Ad<input value={groupForm.name} onChange={e=>setGroupForm({...groupForm,name:e.target.value})} placeholder="Normal Mesai"/></label><label>Giriş<input type="time" value={groupForm.entryTime} onChange={e=>setGroupForm({...groupForm,entryTime:e.target.value})}/></label><label>Çıkış<input type="time" value={groupForm.exitTime} onChange={e=>setGroupForm({...groupForm,exitTime:e.target.value})}/></label><label>Geç tolerans<input type="number" min="0" value={groupForm.lateTolerance} onChange={e=>setGroupForm({...groupForm,lateTolerance:Number(e.target.value)})}/></label><label>Erken tolerans<input type="number" min="0" value={groupForm.earlyTolerance} onChange={e=>setGroupForm({...groupForm,earlyTolerance:Number(e.target.value)})}/></label></div><button className="primary" type="button" onClick={saveGroup} disabled={busy}>Vardiyayı Kaydet</button></aside>:null}
      </div>
      {!isAuditAccount?<section className="pdcfg-card assign"><header><div><small>PERSONEL ATAMASI</small><h2>Vardiyaya Personel Bağla</h2></div></header><div><select value={personId} onChange={e=>setPersonId(e.target.value)}>{people.map(row=><option key={row.id} value={row.id}>{row.personnelCode||row.code} · {row.fullName}</option>)}</select><select value={groupId} onChange={e=>setGroupId(e.target.value)}>{activeGroups.map(row=><option key={row.id} value={row.id}>{row.name} · {row.entryTime||row.entry_time}-{row.exitTime||row.exit_time}</option>)}</select><button className="primary" onClick={assignGroup} disabled={busy||!selectedPerson||!selectedGroup}>Atamayı Kaydet</button></div></section>:null}
    </>:null}

    {activeTab==="servisler"?<>
      <section className="pdcfg-stats"><div><span>Servis</span><b>{services.length}</b></div><div><span>Aktif Servis</span><b>{activeServices.length}</b></div><div><span>Personel</span><b>{people.length}</b></div><div><span>Atama</span><b>{safe(masters?.serviceAssignments).length}</b></div></section>
      <div className="pdcfg-grid">
        <section className="pdcfg-card"><header><div><small>SERVİS LİSTESİ</small><h2>Güzergâhlar</h2></div></header><div className="pdcfg-table services"><div className="head"><span>Kod</span><span>Servis</span><span>Güzergâh / Not</span><span>Durum</span></div>{services.map(row=><button type="button" className={serviceId===row.id?"selected":""} key={row.id} onClick={()=>setServiceId(row.id)}><code>{row.code||"-"}</code><strong>{row.name}</strong><span>{row.routeNote||row.route_note||"-"}</span><em>{row.active===false||Number(row.active)===0?"Pasif":"Aktif"}</em></button>)}</div></section>
        {!isAuditAccount?<aside className="pdcfg-card form"><header><div><small>YENİ TANIM</small><h2>Servis Ekle</h2></div></header><div className="pdcfg-form one"><label>Kod<input value={serviceForm.code} onChange={e=>setServiceForm({...serviceForm,code:e.target.value})} placeholder="SRV-01"/></label><label>Ad<input value={serviceForm.name} onChange={e=>setServiceForm({...serviceForm,name:e.target.value})} placeholder="Merkez Servisi"/></label><label>Güzergâh / Not<textarea value={serviceForm.routeNote} onChange={e=>setServiceForm({...serviceForm,routeNote:e.target.value})}/></label></div><button className="primary" type="button" onClick={saveService} disabled={busy}>Servisi Kaydet</button></aside>:null}
      </div>
      {!isAuditAccount?<section className="pdcfg-card assign"><header><div><small>PERSONEL ATAMASI</small><h2>Servise Personel Bağla</h2></div></header><div><select value={personId} onChange={e=>setPersonId(e.target.value)}>{people.map(row=><option key={row.id} value={row.id}>{row.personnelCode||row.code} · {row.fullName}</option>)}</select><select value={serviceId} onChange={e=>setServiceId(e.target.value)}>{activeServices.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select><button className="primary" onClick={assignService} disabled={busy||!selectedPerson||!selectedService}>Atamayı Kaydet</button></div></section>:null}
    </>:null}

    {activeTab==="donemler"?<div className="pdcfg-period-center">
      <section className={"pdcfg-period-card "+(period.isLocked?"locked":"open")}><small>SEÇİLİ DÖNEM</small><h2>{MONTHS[month-1]} {year}</h2><strong>{period.isLocked?"KAPALI / KİLİTLİ":"AÇIK"}</strong><p>{period.isLocked?"Kapanış: "+(period.lockedAt||"-"):"Kart, puantaj ve izin düzeltmeleri kontrollü olarak devam edebilir."}</p></section>
      <section className="pdcfg-card period-action"><header><div><small>KONTROLLÜ DÖNEM İŞLEMİ</small><h2>{period.isLocked?"Dönemi Yeniden Aç":"Dönemi Kapat"}</h2></div></header><p>Dönem kapatılırken açık eksik kayıt kontrolleri backend tarafından doğrulanır. Engelleyici kayıt varsa kapanış yapılmaz.</p><label>İşlem nedeni<textarea value={closeReason} onChange={e=>setCloseReason(e.target.value)}/></label>{!isAuditAccount?<button className={period.isLocked?"warning":"danger"} onClick={()=>changePeriod(!period.isLocked)} disabled={busy}>{period.isLocked?"Dönemi Aç":"Kontrol Et ve Dönemi Kapat"}</button>:<div className="pdcfg-readonly">Denetim hesabı dönem durumunu yalnız okuyabilir.</div>}</section>
    </div>:null}

    {activeTab==="tatiller"?<div className="pdcfg-grid holiday">
      <section className="pdcfg-card"><header><div><small>{year} TAKVİMİ</small><h2>Resmî Tatiller</h2></div><b>{holidays.length} kayıt</b></header><div className="pdcfg-table holidays"><div className="head"><span>Tarih</span><span>Tatil</span><span>Tür</span><span>Kaynak</span></div>{holidays.map((row,index)=><div key={row.id||(row.date+"-"+index)}><strong>{row.date}</strong><span>{row.name||row.title||"Resmî Tatil"}</span><em>{row.halfDay||Number(row.nonWorkFraction)===0.5?"Yarım Gün":"Tam Gün"}</em><small>{row.source||"D1"}</small></div>)}</div></section>
      {!isAuditAccount?<aside className="pdcfg-card form"><header><div><small>TAKVİME EKLE</small><h2>Özel / Resmî Tatil</h2></div></header><div className="pdcfg-form one"><label>Tarih<input type="date" value={holidayForm.date} onChange={e=>setHolidayForm({...holidayForm,date:e.target.value})}/></label><label>Ad<input value={holidayForm.name} onChange={e=>setHolidayForm({...holidayForm,name:e.target.value})} placeholder="Tatil adı"/></label><label className="check"><input type="checkbox" checked={holidayForm.halfDay} onChange={e=>setHolidayForm({...holidayForm,halfDay:e.target.checked})}/> Yarım gün</label></div><button className="primary" onClick={saveHoliday} disabled={busy}>Takvime Kaydet</button></aside>:null}
    </div>:null}
  </div>;
}
