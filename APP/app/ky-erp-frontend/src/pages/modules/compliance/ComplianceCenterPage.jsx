import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, apiUpload } from "../../../utils/api";
import "./compliance-center.css";

const EMPTY_DASH = { summary:{}, profiles:[], missingRequirements:[], documents:[], expiring:[], findings:[], audits:[] };
const STATUS_LABELS = { ACTIVE:"Geçerli", EXPIRING:"Yaklaşıyor", CRITICAL:"Kritik", EXPIRED:"Süresi Geçti", ARCHIVED:"Arşiv" };
const SEVERITY_LABELS = { CRITICAL:"Kritik", HIGH:"Yüksek", MEDIUM:"Orta", LOW:"Düşük" };
const TABS = {
  "denetim-genel":"OVERVIEW", "denetim-evraklar":"DOCUMENTS", "denetim-standartlar":"STANDARDS",
  "denetim-capa":"CAPA", "denetim-takvim":"CALENDAR", "denetim-ayarlar":"SETTINGS",
};

function dateText(value){ if(!value)return"-"; const d=new Date(`${String(value).slice(0,10)}T00:00:00`); return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("tr-TR"); }
function cls(value){ return String(value||"").toLowerCase().replace(/_/g,"-"); }
function payloadData(value, fallback){ return value?.data ?? fallback; }
function today(){ return new Date().toISOString().slice(0,10); }

export default function ComplianceCenterPage({ activeTab="denetim-genel" }){
  const section=TABS[activeTab]||"OVERVIEW";
  const [dash,setDash]=useState(EMPTY_DASH),[profiles,setProfiles]=useState([]),[tasks,setTasks]=useState([]),[calendar,setCalendar]=useState([]);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [q,setQ]=useState(""),[stateFilter,setStateFilter]=useState("ALL"),[showDocForm,setShowDocForm]=useState(false);
  const [docForm,setDocForm]=useState({title:"",category:"Genel",issuer:"",documentNo:"",issueDate:today(),expiresAt:"",reminderDays:10,ownerDepartment:"",requirementId:""});
  const [docFile,setDocFile]=useState(null),[showFindingForm,setShowFindingForm]=useState(false);
  const [findingForm,setFindingForm]=useState({title:"",severity:"MEDIUM",description:"",correctiveAction:"",dueDate:""});
  const [profileForm,setProfileForm]=useState({name:"",code:"",version:"CUSTOM",description:""});
  const [selectedProfile,setSelectedProfile]=useState("");
  const [requirementForm,setRequirementForm]=useState({title:"",code:"",category:"Genel",ownerDepartment:"",warningDays:10,criticalDays:3,mandatory:true});
  const loadAll=useCallback(async()=>{
    setLoading(true); setMessage("");
    try{
      const [d,p,t,c]=await Promise.all([
        apiGet("/compliance/dashboard",{}, {timeoutMs:30000}), apiGet("/compliance/profiles"),
        apiGet("/compliance/tasks"), apiGet("/compliance/calendar"),
      ]);
      setDash(payloadData(d,EMPTY_DASH)); setProfiles(payloadData(p,[])); setTasks(payloadData(t,[])); setCalendar(payloadData(c,[]));
      if(!selectedProfile && payloadData(p,[])[0]?.id) setSelectedProfile(payloadData(p,[])[0].id);
    }catch(error){ setMessage(`Hata: ${error?.message||"Denetim verileri alınamadı."}`); }
    finally{ setLoading(false); }
  },[selectedProfile]);

  useEffect(()=>{ loadAll(); },[loadAll]);
  const docs=useMemo(()=>dash.documents||[],[dash.documents]);
  const filteredDocs=useMemo(()=>docs.filter(row=>{
    const hay=`${row.title||""} ${row.category||""} ${row.document_no||""} ${row.issuer||""}`.toLocaleLowerCase("tr-TR");
    return (!q||hay.includes(q.toLocaleLowerCase("tr-TR")))&&(stateFilter==="ALL"||row.state===stateFilter);
  }),[docs,q,stateFilter]);
  const profile=useMemo(()=>profiles.find(row=>String(row.id)===String(selectedProfile))||profiles[0]||null,[profiles,selectedProfile]);

  async function createDocument(event){
    event.preventDefault(); if(!docForm.title.trim())return setMessage("Hata: Evrak adı zorunlu."); setBusy(true);
    try{
      const created=await apiPost("/compliance/documents",docForm); const id=created?.data?.id;
      if(id&&docFile){ const form=new FormData(); form.append("file",docFile); await apiUpload(`/compliance/documents/${id}/upload`,form); await apiPost(`/compliance/documents/${id}/auto-link`,{}); }
      setDocForm({title:"",category:"Genel",issuer:"",documentNo:"",issueDate:today(),expiresAt:"",reminderDays:10,ownerDepartment:"",requirementId:""}); setDocFile(null); setShowDocForm(false);
      setMessage("Evrak kaydedildi ve takip sistemine alındı."); await loadAll();
    }catch(error){setMessage(`Hata: ${error?.message||"Evrak kaydedilemedi."}`)} finally{setBusy(false)}
  }

  async function runAi(){ setBusy(true); try{const result=await apiPost("/compliance/ai-scan",{});setMessage(result?.data?.summary||"Akıllı kontrol tamamlandı.");await loadAll();}catch(error){setMessage(`Hata: ${error?.message||"AI kontrolü yapılamadı."}`)}finally{setBusy(false)} }
  async function createFinding(event){event.preventDefault();setBusy(true);try{await apiPost("/compliance/findings",findingForm);setFindingForm({title:"",severity:"MEDIUM",description:"",correctiveAction:"",dueDate:""});setShowFindingForm(false);setMessage("Düzeltici faaliyet açıldı.");await loadAll();}catch(error){setMessage(`Hata: ${error?.message||"CAPA oluşturulamadı."}`)}finally{setBusy(false)}}
  async function closeFinding(id){setBusy(true);try{await apiPatch(`/compliance/findings/${id}`,{status:"CLOSED"});setMessage("CAPA kapatıldı.");await loadAll();}catch(error){setMessage(`Hata: ${error?.message||"CAPA kapatılamadı."}`)}finally{setBusy(false)}}
  async function createProfile(event){event.preventDefault();setBusy(true);try{await apiPost("/compliance/profiles",profileForm);setProfileForm({name:"",code:"",version:"CUSTOM",description:""});setMessage("Yeni denetim standardı oluşturuldu.");await loadAll();}catch(error){setMessage(`Hata: ${error?.message||"Standart oluşturulamadı."}`)}finally{setBusy(false)}}
  async function createRequirement(event){event.preventDefault();if(!profile?.id)return;setBusy(true);try{await apiPost(`/compliance/profiles/${profile.id}/requirements`,requirementForm);setRequirementForm({title:"",code:"",category:"Genel",ownerDepartment:"",warningDays:10,criticalDays:3,mandatory:true});setMessage("Yeni gereklilik eklendi.");await loadAll();}catch(error){setMessage(`Hata: ${error?.message||"Gereklilik eklenemedi."}`)}finally{setBusy(false)}}
  async function markTaskDone(id){setBusy(true);try{await apiPatch(`/compliance/tasks/${id}`,{status:"DONE"});await loadAll();}catch(error){setMessage(`Hata: ${error?.message||"Görev tamamlanamadı."}`)}finally{setBusy(false)}}

  const s=dash.summary||{};
  if(loading)return <div className="content-card compliance-loading"><h3>Denetim Merkezi hazırlanıyor</h3><p>Evraklar, süreler ve standartlar kontrol ediliyor...</p></div>;

  return <div className="compliance-page">
    <header className="compliance-hero">
      <div><small>DENETİM & UYGUNLUK / AKILLI EVRAK TAKİP</small><h1>Denetim Merkezi</h1><p>Disney, Sedex, WRAP, SLCP, amfori BSCI ve firma özel denetimleri tek sistemde.</p></div>
      <div className="compliance-actions"><button onClick={loadAll} disabled={busy}>Yenile</button><button className="primary" onClick={()=>setShowDocForm(true)} disabled={busy}>+ Yeni Evrak</button><button className="ai" onClick={runAi} disabled={busy}>✦ AI Akıllı Kontrol</button></div>
    </header>
    {message&&<div className={`compliance-banner ${message.startsWith("Hata:")?"bad":"good"}`}>{message}</div>}

    {showDocForm&&<form className="compliance-form-card" onSubmit={createDocument}><div className="form-title"><div><h3>Yeni Evrak</h3><p>Dosyayı yükle; süre ve sorumluyu belirle. Sistem uygun standartlarla otomatik eşleştirebilir.</p></div><button type="button" onClick={()=>setShowDocForm(false)}>Kapat</button></div>
      <div className="compliance-form-grid"><label>Evrak Adı<input value={docForm.title} onChange={e=>setDocForm(v=>({...v,title:e.target.value}))} required/></label><label>Kategori<input value={docForm.category} onChange={e=>setDocForm(v=>({...v,category:e.target.value}))}/></label><label>Veren Kurum<input value={docForm.issuer} onChange={e=>setDocForm(v=>({...v,issuer:e.target.value}))}/></label><label>Belge No<input value={docForm.documentNo} onChange={e=>setDocForm(v=>({...v,documentNo:e.target.value}))}/></label><label>Belge Tarihi<input type="date" value={docForm.issueDate} onChange={e=>setDocForm(v=>({...v,issueDate:e.target.value}))}/></label><label>Son Geçerlilik<input type="date" value={docForm.expiresAt} onChange={e=>setDocForm(v=>({...v,expiresAt:e.target.value}))}/></label><label>Uyarı (gün)<input type="number" min="1" value={docForm.reminderDays} onChange={e=>setDocForm(v=>({...v,reminderDays:Number(e.target.value)}))}/></label><label>Sorumlu Bölüm<input value={docForm.ownerDepartment} onChange={e=>setDocForm(v=>({...v,ownerDepartment:e.target.value}))}/></label><label className="wide">Dosya<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.xml,.zip" onChange={e=>setDocFile(e.target.files?.[0]||null)}/></label></div>
      <div className="form-footer"><span>Varsayılan uyarı: son tarihten 10 gün önce.</span><button className="primary" type="submit" disabled={busy}>Kaydet ve Takibe Al</button></div>
    </form>}
    {section==="OVERVIEW"&&<>
      <div className="compliance-metrics">
        <div className="score"><span>Hazırlık Skoru</span><b>%{s.readinessScore??0}</b><small>Genel denetim hazırlığı</small></div>
        <div><span>Eksik Evrak</span><b>{s.missingRequirements??0}</b><small>Zorunlu gereklilik</small></div>
        <div><span>10 Gün İçinde</span><b>{s.expiring10Days??0}</b><small>Yenileme gerekiyor</small></div>
        <div className="danger"><span>Süresi Geçmiş</span><b>{s.expiredDocuments??0}</b><small>Hemen aksiyon</small></div>
        <div><span>Açık CAPA</span><b>{s.openFindings??0}</b><small>{s.overdueFindings??0} gecikmiş</small></div>
      </div>
      <div className="compliance-grid two">
        <section className="compliance-card"><div className="card-head"><div><h3>Denetim Hazırlığı</h3><p>Standart bazında mevcut kanıt oranı</p></div></div><div className="profile-score-list">{(dash.profiles||[]).map(row=><div className="profile-score" key={row.id}><div><b>{row.name}</b><small>{row.missing} eksik / {row.total} gereklilik</small></div><div className="score-track"><i style={{width:`${row.score||0}%`}}/></div><strong>%{row.score||0}</strong></div>)}</div></section>
        <section className="compliance-card"><div className="card-head"><div><h3>Bugün Ne Yapılmalı?</h3><p>Eksik, yaklaşan ve geciken işler</p></div><button className="link" onClick={runAi}>AI Tara</button></div><div className="action-list">{(dash.missingRequirements||[]).slice(0,5).map(row=><div key={row.id} className="action-row warning"><span>Eksik</span><div><b>{row.title}</b><small>{row.category} · {row.owner_department||"Sorumlu atanmadı"}</small></div></div>)}{(dash.expiring||[]).slice(0,5).map(row=><div key={row.id} className={`action-row ${cls(row.state)}`}><span>{STATUS_LABELS[row.state]||row.state}</span><div><b>{row.title}</b><small>{dateText(row.expires_at)} · {row.owner_department||"Sorumlu atanmadı"}</small></div></div>)}{!(dash.missingRequirements||[]).length&&!(dash.expiring||[]).length?<div className="empty">Kritik aksiyon görünmüyor.</div>:null}</div></section>
      </div>
      <div className="compliance-grid two">
        <section className="compliance-card"><div className="card-head"><h3>Yaklaşan Evraklar</h3><small>{(dash.expiring||[]).length} kayıt</small></div><div className="mini-table">{(dash.expiring||[]).slice(0,8).map(row=><div key={row.id}><span className={`state ${cls(row.state)}`}>{STATUS_LABELS[row.state]||row.state}</span><b>{row.title}</b><span>{dateText(row.expires_at)}</span></div>)}{!(dash.expiring||[]).length?<div className="empty">Yaklaşan evrak yok.</div>:null}</div></section>
        <section className="compliance-card"><div className="card-head"><h3>Açık Görevler</h3><small>{tasks.filter(x=>x.status==="OPEN").length} kayıt</small></div><div className="task-list">{tasks.filter(x=>x.status==="OPEN").slice(0,8).map(row=><div key={row.id}><div><b>{row.title}</b><small>{row.due_date?dateText(row.due_date):"Tarih yok"} · {row.priority}</small></div><button onClick={()=>markTaskDone(row.id)} disabled={busy}>Tamamla</button></div>)}{!tasks.filter(x=>x.status==="OPEN").length?<div className="empty">Açık görev yok.</div>:null}</div></section>
      </div>
    </>}
    {section==="DOCUMENTS"&&<section className="compliance-card documents-card"><div className="card-head"><div><h3>Evrak Takip Merkezi</h3><p>Tüm belge, süre, kurum ve dosyalar tek listede.</p></div><button className="primary" onClick={()=>setShowDocForm(true)}>+ Yeni Evrak</button></div><div className="document-toolbar"><input type="search" placeholder="Evrak, kurum, kategori veya belge no ara" value={q} onChange={e=>setQ(e.target.value)}/><select value={stateFilter} onChange={e=>setStateFilter(e.target.value)}><option value="ALL">Tüm Durumlar</option><option value="ACTIVE">Geçerli</option><option value="EXPIRING">Yaklaşıyor</option><option value="CRITICAL">Kritik</option><option value="EXPIRED">Süresi Geçti</option></select><span>{filteredDocs.length} kayıt</span></div><div className="document-table"><div className="document-row head"><span>Durum</span><span>Evrak</span><span>Kategori</span><span>Belge No</span><span>Son Tarih</span><span>Sorumlu</span><span>Dosya</span></div>{filteredDocs.map(row=><div className="document-row" key={row.id}><span><i className={`state ${cls(row.state)}`}>{STATUS_LABELS[row.state]||row.state}</i></span><span><b>{row.title}</b><small>{row.issuer||"Kurum yok"}</small></span><span>{row.category||"-"}</span><span>{row.document_no||"-"}</span><span>{dateText(row.expires_at)}</span><span>{row.owner_department||"-"}</span><span>{row.file_name?<b className="file-ok">✓ {row.file_name}</b>:<em>Dosya yok</em>}</span></div>)}{!filteredDocs.length?<div className="empty">Filtreye uygun evrak bulunamadı.</div>:null}</div></section>}

    {section==="STANDARDS"&&<div className="compliance-grid standards-layout"><section className="compliance-card standard-list"><div className="card-head"><div><h3>Denetim Standartları</h3><p>Hazır şablonlar ve firma özel profilleri</p></div></div>{profiles.map(row=><button key={row.id} className={String(row.id)===String(profile?.id)?"active":""} onClick={()=>setSelectedProfile(row.id)}><b>{row.name}</b><small>{row.code} · {row.version||"-"}</small><span>{row.requirements?.length||0} madde</span></button>)}<form className="mini-form" onSubmit={createProfile}><h4>+ Yeni Standart</h4><input placeholder="Standart adı" value={profileForm.name} onChange={e=>setProfileForm(v=>({...v,name:e.target.value}))} required/><input placeholder="Kod (örn. LCW_2027)" value={profileForm.code} onChange={e=>setProfileForm(v=>({...v,code:e.target.value}))}/><input placeholder="Sürüm" value={profileForm.version} onChange={e=>setProfileForm(v=>({...v,version:e.target.value}))}/><textarea placeholder="Açıklama" value={profileForm.description} onChange={e=>setProfileForm(v=>({...v,description:e.target.value}))}/><button className="primary" disabled={busy}>Standardı Oluştur</button></form></section>
      <section className="compliance-card requirement-list"><div className="card-head"><div><h3>{profile?.name||"Standart seçin"}</h3><p>{profile?.description||"Sol listeden bir standart seçin."}</p></div><span>{profile?.requirements?.length||0} madde</span></div><div className="requirement-scroll">{(profile?.requirements||[]).map(row=><div className="requirement-row" key={row.id}><span>{row.code}</span><div><b>{row.title}</b><small>{row.category} · {row.owner_department||"Sorumlu yok"}</small></div><i>{row.mandatory?"Zorunlu":"Opsiyonel"}</i></div>)}</div>{profile&&<form className="requirement-form" onSubmit={createRequirement}><h4>Yeni Gereklilik Ekle</h4><div><input placeholder="Madde adı" value={requirementForm.title} onChange={e=>setRequirementForm(v=>({...v,title:e.target.value}))} required/><input placeholder="Kod" value={requirementForm.code} onChange={e=>setRequirementForm(v=>({...v,code:e.target.value}))}/><input placeholder="Kategori" value={requirementForm.category} onChange={e=>setRequirementForm(v=>({...v,category:e.target.value}))}/><input placeholder="Sorumlu bölüm" value={requirementForm.ownerDepartment} onChange={e=>setRequirementForm(v=>({...v,ownerDepartment:e.target.value}))}/><input type="number" min="1" placeholder="Uyarı günü" value={requirementForm.warningDays} onChange={e=>setRequirementForm(v=>({...v,warningDays:Number(e.target.value)}))}/><label><input type="checkbox" checked={requirementForm.mandatory} onChange={e=>setRequirementForm(v=>({...v,mandatory:e.target.checked}))}/> Zorunlu</label></div><button className="primary" disabled={busy}>Maddeyi Ekle</button></form>}</section>
    </div>}
    {section==="CAPA"&&<section className="compliance-card"><div className="card-head"><div><h3>Düzeltici Faaliyet / CAPA</h3><p>Uygunsuzluk, sorumlu, termin ve kapanış kanıtı takibi.</p></div><button className="primary" onClick={()=>setShowFindingForm(v=>!v)}>+ CAPA Aç</button></div>{showFindingForm&&<form className="capa-form" onSubmit={createFinding}><input placeholder="Bulgu / uygunsuzluk" value={findingForm.title} onChange={e=>setFindingForm(v=>({...v,title:e.target.value}))} required/><select value={findingForm.severity} onChange={e=>setFindingForm(v=>({...v,severity:e.target.value}))}><option value="CRITICAL">Kritik</option><option value="HIGH">Yüksek</option><option value="MEDIUM">Orta</option><option value="LOW">Düşük</option></select><input type="date" value={findingForm.dueDate} onChange={e=>setFindingForm(v=>({...v,dueDate:e.target.value}))}/><textarea placeholder="Açıklama" value={findingForm.description} onChange={e=>setFindingForm(v=>({...v,description:e.target.value}))}/><textarea placeholder="Düzeltici faaliyet" value={findingForm.correctiveAction} onChange={e=>setFindingForm(v=>({...v,correctiveAction:e.target.value}))}/><button className="primary" disabled={busy}>Kaydet</button></form>}<div className="capa-list">{(dash.findings||[]).map(row=><div className="capa-row" key={row.id}><span className={`severity ${cls(row.severity)}`}>{SEVERITY_LABELS[row.severity]||row.severity}</span><div><b>{row.title}</b><small>{row.description||"Açıklama yok"}</small><em>{row.corrective_action||"Düzeltici faaliyet girilmemiş"}</em></div><span>{dateText(row.due_date)}</span><button onClick={()=>closeFinding(row.id)} disabled={busy}>Kapat</button></div>)}{!(dash.findings||[]).length?<div className="empty">Açık CAPA yok.</div>:null}</div></section>}

    {section==="CALENDAR"&&<section className="compliance-card"><div className="card-head"><div><h3>Denetim Takvimi</h3><p>Evrak son tarihleri, denetimler, CAPA terminleri ve görevler.</p></div><span>{calendar.length} kayıt</span></div><div className="calendar-list">{calendar.map(row=><div key={`${row.kind}-${row.id}`}><time>{dateText(row.due_date)}</time><span className={`kind ${cls(row.kind)}`}>{row.kind}</span><div><b>{row.title}</b><small>{row.status||""}</small></div></div>)}{!calendar.length?<div className="empty">Takvim kaydı yok.</div>:null}</div></section>}

    {section==="SETTINGS"&&<section className="compliance-card"><div className="card-head"><div><h3>Sistem Mantığı</h3><p>Yeni standart veya evrak türü için kod değişikliği gerektirmeyen yapı.</p></div></div><div className="settings-grid"><div><b>Standart Şablonları</b><p>Disney, SMETA, WRAP, SLCP, amfori BSCI ve özel müşteri profilleri.</p></div><div><b>Özelleştirilebilir Maddeler</b><p>Firma yöneticisi yeni gereklilik, kategori, uyarı süresi ve sorumlu bölüm ekleyebilir.</p></div><div><b>Versiyonlu Evrak</b><p>Yeni dosya eski kanıtı silmez; revizyon geçmişi korunur.</p></div><div><b>Akıllı Kontrol</b><p>Eksik, süresi yaklaşan, süresi geçmiş ve geciken CAPA kayıtlarını otomatik önceliklendirir.</p></div></div></section>}
  </div>;
}
