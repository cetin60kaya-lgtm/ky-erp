import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../utils/api";
import {
  createBackup,
  downloadBackupSql,
  generateBackupSql,
  listBackups,
  listUsers,
  restoreBackup,
} from "../../services/adminApi";
import "./AdminManagement.css";

function rowsOf(value) {
  const data = value?.data ?? value;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}
function slugify(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function mapCompany(row = {}) {
  return { id:String(row.id || ""), name:String(row.name || row.ad || ""), slug:String(row.slug || row.kod || ""), note:String(row.note || ""), isActive:row.isActive !== false, updatedAt:row.updatedAt || row.lastUpdatedAt || "" };
}
function emptyForm(){ return { id:"", name:"", slug:"", note:"", isActive:true }; }
function dateText(value){if(!value)return"-";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString("tr-TR")}
function sqlName(row,slug){const safe=String(row?.mainCompanySlug||slug||"firma").replace(/[^a-zA-Z0-9._-]+/g,"-");const date=String(row?.createdAt||row?.completedAt||new Date().toISOString()).slice(0,10);return `KYERP-${safe}-${date}.sql`}
const ROLE_LABELS={COMPANY_ADMIN:"Firma Sahibi / İşveren",MUHASEBE:"Muhasebe",DESEN:"Desen",IMALAT:"İmalat",BOYAHANE:"Boyahane",IK:"İK",DENETIM:"Denetim",VIEWER:"Özel Yetkili",SUPER_ADMIN:"Süper Yönetici",ADMIN:"Süper Yönetici"};
const ROLE_ORDER={COMPANY_ADMIN:0,MUHASEBE:1,IK:2,DESEN:3,BOYAHANE:4,IMALAT:5,DENETIM:6,VIEWER:7,SUPER_ADMIN:8,ADMIN:8};
function roleOf(value){return String(value||"VIEWER").toUpperCase().replace(/İ/g,"I")}
function userCompanySlug(row){return String(row?.mainCompanySlug||row?.main_company_slug||"").trim()}

export default function AdminCompanySettings({ activeMainCompany }) {
  const [companies,setCompanies]=useState([]);
  const [users,setUsers]=useState([]);
  const [form,setForm]=useState(emptyForm());
  const [selectedId,setSelectedId]=useState("");
  const [delivery,setDelivery]=useState(null);
  const [recovery,setRecovery]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("Firma ve sistem ayarları yükleniyor...");
  const [danger,setDanger]=useState({ mode:"", item:null, password:"", targetId:"" });
  const [companyBackups,setCompanyBackups]=useState([]);
  const [backupBusy,setBackupBusy]=useState(false);
  const [restore,setRestore]=useState({backup:null,password:"",confirmText:""});

  const load=useCallback(async()=>{
    setBusy(true);
    const [companyJob,deliveryJob,recoveryJob,usersJob]=await Promise.allSettled([
      apiGet("/admin/main-companies",{_ts:Date.now()}),
      apiGet("/admin/security/delivery-capabilities",{_ts:Date.now()}),
      apiGet("/admin/security/owner-recovery",{_ts:Date.now()}),
      listUsers(),
    ]);
    if(companyJob.status==="fulfilled"){
      const list=rowsOf(companyJob.value).map(mapCompany);
      setCompanies(list);
      setSelectedId((current)=>list.some((row)=>row.id===current)?current:(activeMainCompany?.id || list[0]?.id || ""));
    }
    if(deliveryJob.status==="fulfilled") setDelivery(deliveryJob.value?.data || deliveryJob.value);
    if(recoveryJob.status==="fulfilled") setRecovery(recoveryJob.value?.data || recoveryJob.value);
    if(usersJob.status==="fulfilled") setUsers(rowsOf(usersJob.value));
    const failed=[companyJob,deliveryJob,recoveryJob,usersJob].filter((job)=>job.status==="rejected").length;
    setMessage(failed?`${failed} sistem bilgisi alınamadı; erişilebilen ayarlar gösteriliyor.`:"Firma ve entegrasyon ayarları güncel.");
    setBusy(false);
  },[activeMainCompany?.id]);
  useEffect(()=>{load();},[load]);

  const selected=useMemo(()=>companies.find((row)=>row.id===selectedId)||null,[companies,selectedId]);
  const selectedPeople=useMemo(()=>users
    .filter((row)=>selected?.slug && userCompanySlug(row)===selected.slug)
    .sort((a,b)=>(ROLE_ORDER[roleOf(a.role)]??99)-(ROLE_ORDER[roleOf(b.role)]??99)||String(a.fullName||a.username||"").localeCompare(String(b.fullName||b.username||""),"tr")),[selected?.slug,users]);
  const companyPeopleCount=useMemo(()=>{const map=new Map();users.forEach((row)=>{const slug=userCompanySlug(row);if(slug)map.set(slug,(map.get(slug)||0)+1)});return map},[users]);
  const owners=selectedPeople.filter((row)=>roleOf(row.role)==="COMPANY_ADMIN");
  const accountingPeople=selectedPeople.filter((row)=>roleOf(row.role)==="MUHASEBE");
  const activePeople=selectedPeople.filter((row)=>row.isActive!==false);
  const deliveryData=delivery||{};
  const recoveryData=recovery||{};

  const loadSelectedBackups=useCallback(async()=>{
    if(!selected?.slug){setCompanyBackups([]);return;}
    try{
      const rows=await listBackups({mainCompanySlug:selected.slug,_ts:Date.now()});
      setCompanyBackups(rowsOf(rows));
    }catch(error){
      setCompanyBackups([]);
      setMessage(`Hata: ${error?.message||"Firma yedek geçmişi alınamadı."}`);
    }
  },[selected?.slug]);
  useEffect(()=>{loadSelectedBackups();},[loadSelectedBackups]);

  function beginEdit(row){ setSelectedId(row.id); setForm({...row}); setMessage(`${row.name} düzenlemeye açıldı.`); }
  function beginNew(){ setForm(emptyForm()); setMessage("Yeni ana firma kaydı hazırlanıyor."); }

  async function save(event){
    event?.preventDefault();
    if(!form.name.trim()) return setMessage("Firma adı zorunludur.");
    const slug=slugify(form.slug || form.name);
    if(!slug) return setMessage("Geçerli firma kısa kodu üretilemedi.");
    setBusy(true);
    try{
      const payload={name:form.name.trim(),slug,note:form.note.trim(),isActive:Boolean(form.isActive)};
      let result;
      if(form.id) result=await apiPatch(`/admin/main-companies/${encodeURIComponent(form.id)}`,{id:form.id,...payload});
      else result=await apiPost("/admin/main-companies",payload);
      const created=result?.data || result;
      setMessage(form.id?"Ana firma güncellendi.":"Ana firma oluşturuldu.");
      setForm(emptyForm());
      await load();
      if(created?.id) setSelectedId(String(created.id));
    }catch(error){setMessage(`Hata: ${error?.message || "Firma kaydedilemedi."}`);}finally{setBusy(false);}
  }

  async function toggle(row){
    setBusy(true);
    try{await apiPatch(`/admin/main-companies/${encodeURIComponent(row.id)}`,{id:row.id,name:row.name,slug:row.slug,note:row.note,isActive:!row.isActive});setMessage("Firma aktiflik durumu güncellendi.");await load();}
    catch(error){setMessage(`Hata: ${error?.message || "Durum güncellenemedi."}`);}finally{setBusy(false);}
  }

  async function runDanger(){
    if(!danger.item || !danger.password.trim()) return setMessage("Bu kritik işlem için yönetici şifresi zorunludur.");
    if(danger.mode==="TRANSFER" && !danger.targetId) return setMessage("Verilerin aktarılacağı hedef firmayı seçin.");
    setBusy(true);
    try{
      if(danger.mode==="DELETE") await apiPost(`/admin/main-companies/${encodeURIComponent(danger.item.id)}/delete`,{adminPassword:danger.password});
      else await apiPost(`/admin/main-companies/${encodeURIComponent(danger.item.id)}/transfer`,{targetId:danger.targetId,adminPassword:danger.password});
      setMessage(danger.mode==="DELETE"?"Firma güvenli şekilde silindi.":"Firma verileri hedef firmaya aktarıldı.");
      setDanger({mode:"",item:null,password:"",targetId:""});
      await load();
    }catch(error){setMessage(`Hata: ${error?.message || "Kritik işlem tamamlanamadı."}`);}finally{setBusy(false);}
  }

  async function backupSelected(){
    if(!selected?.slug||backupBusy)return;
    setBackupBusy(true);
    try{
      const backup=await createBackup({mainCompanySlug:selected.slug,mainCompanyId:selected.id,reason:"MAIN_COMPANY_CARD_BACKUP",requestedAt:new Date().toISOString()});
      let sql=backup;
      try{sql=await generateBackupSql(backup.id,{mainCompanySlug:selected.slug});}
      catch(sqlError){setMessage(`Firma yedeği alındı fakat SQL dosyası hazırlanamadı: ${sqlError?.message||"SQL yedek hatası"}. SQL işlemini yedek listesinden tekrar deneyebilirsiniz.`);await loadSelectedBackups();return;}
      setMessage(`${selected.name} için tam yedek hazır: ${Number(sql?.totalRows||backup?.totalRows||0)} satır · SQL + R2.`);
      await loadSelectedBackups();
    }catch(error){setMessage(`Hata: ${error?.message||"Firma yedeği alınamadı."}`);}finally{setBackupBusy(false);}
  }

  async function downloadSql(row){
    if(!row?.id||backupBusy)return;
    setBackupBusy(true);
    try{
      if(!row.sqlKey) await generateBackupSql(row.id,{mainCompanySlug:selected?.slug});
      await downloadBackupSql(row.id,sqlName(row,selected?.slug));
      setMessage("Firma SQL yedeği indirilmeye hazırlandı.");
      await loadSelectedBackups();
    }catch(error){setMessage(`Hata: ${error?.message||"SQL yedeği indirilemedi."}`);}finally{setBackupBusy(false);}
  }

  async function restoreSelected(){
    if(!restore.backup||!selected?.slug||backupBusy)return;
    if(!restore.password.trim())return setMessage("Geri dönüş için yönetici şifresi zorunludur.");
    if(restore.confirmText.trim().toLocaleUpperCase("tr-TR").replace(/İ/g,"I")!=="GERI YUKLE")return setMessage("Onay alanına GERI YUKLE yazın.");
    setBackupBusy(true);
    try{
      const result=await restoreBackup(restore.backup.id,{mainCompanySlug:selected.slug,mainCompanyId:selected.id,adminPassword:restore.password,confirmText:restore.confirmText});
      setMessage(`${selected.name} geri yüklendi. İşlem öncesi güvenlik yedeği: ${result?.safetyBackupId||"oluşturuldu"}.`);
      setRestore({backup:null,password:"",confirmText:""});
      await loadSelectedBackups();
    }catch(error){setMessage(`Hata: ${error?.message||"Firma geri yüklenemedi."}`);}finally{setBackupBusy(false);}
  }

  return <div className="admpro-page">
    <header className="admpro-head"><div><span className="admpro-kicker">YÖNETİM / FİRMA & SİSTEM</span><h2>Firma & Sistem Ayarları</h2><p>Ana firmalar, güvenlik entegrasyonları, firma yedeği ve sistem hazırlık durumu tek merkezde.</p></div><div className="admpro-actions"><button type="button" onClick={beginNew}>+ Yeni Ana Firma</button><button type="button" className="primary" onClick={load} disabled={busy}>Yenile</button></div></header>
    <div className={`admpro-notice ${message.startsWith("Hata") ? "error" : message.includes("alınamadı")||message.includes("hazırlanamadı") ? "warn" : "success"}`}>{message}</div>

    <section className="admpro-grid-2">
      <div className="admpro-card"><div className="admpro-card-head"><div><h3>Ana Firmalar</h3><p>Tenant/firma sınırlarının temel yönetimi.</p></div><span className="admpro-badge">{companies.length} kayıt</span></div>
        <div className="admpro-company-list">{companies.map((row)=><div key={row.id} className={`admpro-company-row ${row.id===selectedId?"active":""}`}><div onClick={()=>setSelectedId(row.id)} role="button" tabIndex={0}><strong>{row.name}</strong><small>{row.slug} · {row.isActive?"Aktif":"Pasif"} · {companyPeopleCount.get(row.slug)||0} kişi{row.id===activeMainCompany?.id?" · Şu an seçili":""}</small></div><div className="admpro-row-actions"><button type="button" onClick={()=>beginEdit(row)}>Düzenle</button><button type="button" onClick={()=>toggle(row)}>{row.isActive?"Pasife Al":"Aktifleştir"}</button></div></div>)}{!companies.length?<div className="admpro-empty">Ana firma kaydı alınamadı.</div>:null}</div>
      </div>

      <div className="admpro-card"><div className="admpro-card-head"><div><h3>{form.id?"Ana Firma Düzenle":"Yeni Ana Firma"}</h3><p>İsim, kısa kod ve aktiflik ayarları.</p></div>{form.id?<button type="button" onClick={()=>setForm(emptyForm())}>Formu Temizle</button>:null}</div>
        <form onSubmit={save}><div className="admpro-form-grid"><label>Firma Adı<input value={form.name} onChange={(e)=>setForm((old)=>({...old,name:e.target.value,slug:old.slug||slugify(e.target.value)}))}/></label><label>Kısa Kod / Slug<input value={form.slug} onChange={(e)=>setForm((old)=>({...old,slug:e.target.value}))}/></label><label className="wide">Açıklama<textarea value={form.note} onChange={(e)=>setForm((old)=>({...old,note:e.target.value}))}/></label><label className="admpro-check wide"><input type="checkbox" checked={form.isActive} onChange={(e)=>setForm((old)=>({...old,isActive:e.target.checked}))}/> Aktif ana firma</label></div><div className="admpro-actions" style={{justifyContent:"flex-start",marginTop:12}}><button className="primary" type="submit" disabled={busy}>{form.id?"Değişiklikleri Kaydet":"Ana Firma Oluştur"}</button></div></form>
      </div>
    </section>

    {selected?<section className="admpro-card admpro-company-profile">
      <div className="admpro-card-head">
        <div><h3>Firma Kartı · {selected.name}</h3><p>İşveren, muhasebe ve diğer bölüm kullanıcıları bu firmaya bağlı tek listede görünür. Mail ve Drive/File Hub karar yetkisi Firma Sahibi / İşveren rolündedir.</p></div>
        <span className="admpro-badge ok">{activePeople.length} aktif / {selectedPeople.length} toplam</span>
      </div>
      <div className="admpro-company-profile-stats">
        <div><span>Firma Sahibi / İşveren</span><strong>{owners.length}</strong><small>{owners.map((row)=>row.fullName||row.username).join(", ")||"Atanmadı"}</small></div>
        <div><span>Muhasebe</span><strong>{accountingPeople.length}</strong><small>{accountingPeople.map((row)=>row.fullName||row.username).join(", ")||"Atanmadı"}</small></div>
        <div><span>Aktif Kullanıcı</span><strong>{activePeople.length}</strong><small>Bu firmada oturum açabilen</small></div>
        <div><span>Toplam Kişi</span><strong>{selectedPeople.length}</strong><small>Firma kullanıcı kartları</small></div>
      </div>
      {!owners.length?<div className="admpro-notice warn" style={{marginTop:10}}>Bu firmaya Firma Sahibi / İşveren (COMPANY_ADMIN) atanmadı. Mail hesabı ve Drive/File Hub bağlantı onayları için önce firma sahibi atanmalıdır.</div>:null}
      <div className="admpro-company-people">
        {selectedPeople.map((row)=><div className={`admpro-person-card ${roleOf(row.role)==="COMPANY_ADMIN"?"is-owner":roleOf(row.role)==="MUHASEBE"?"is-accounting":""}`} key={row.id}>
          <div className="admpro-person-avatar">{String(row.fullName||row.username||"K").split(" ").filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toUpperCase()}</div>
          <div><strong>{row.fullName||row.username}</strong><span>{ROLE_LABELS[roleOf(row.role)]||roleOf(row.role)}</span><small>@{row.username}{row.email?` · ${row.email}`:""}</small></div>
          <span className={`admpro-badge ${row.isActive===false?"bad":"ok"}`}>{row.isActive===false?"Pasif":"Aktif"}</span>
        </div>)}
        {!selectedPeople.length?<div className="admpro-empty">Bu firmaya bağlı kullanıcı bulunamadı.</div>:null}
      </div>
    </section>:null}

    {selected?<section className="admpro-card"><div className="admpro-card-head"><div><h3>Firma Yedek & Geri Dönüş · {selected.name}</h3><p>Bu firmanın tenant verileri, R2 dosyaları ve SQL arşivi tek işlemde korunur.</p></div><div className="admpro-actions"><button className="primary" type="button" onClick={backupSelected} disabled={backupBusy}>{backupBusy?"İşleniyor...":"Tam Yedek Al"}</button></div></div><div className="admpro-notice success">Yedek firma bazlıdır. Geri dönüş başlamadan önce ayrıca PRE_RESTORE güvenlik yedeği alınır; auth/session/MFA kayıtları firma geri dönüşüyle geriye sarılmaz.</div><div className="admpro-table" style={{marginTop:12}}><table><thead><tr><th>Tarih</th><th>Veri</th><th>Dosya</th><th>SQL</th><th>İşlem</th></tr></thead><tbody>{companyBackups.slice(0,5).map((row)=><tr key={row.id}><td>{dateText(row.createdAt||row.completedAt)}</td><td>{Number(row.totalRows||0).toLocaleString("tr-TR")} satır</td><td>{Number(row.totalFiles||0).toLocaleString("tr-TR")}</td><td><button type="button" onClick={()=>downloadSql(row)} disabled={backupBusy}>{row.sqlKey?"SQL İndir":"SQL Hazırla & İndir"}</button></td><td><button type="button" className="danger" onClick={()=>setRestore({backup:row,password:"",confirmText:""})}>Bu Yedeğe Dön</button></td></tr>)}{!companyBackups.length?<tr><td colSpan="5">Bu firma için henüz yedek yok.</td></tr>:null}</tbody></table></div></section>:null}

    {restore.backup&&selected?<section className="admpro-card"><div className="admpro-card-head"><div><h3>Firma Geri Dönüş Doğrulaması · {selected.name}</h3><p>{dateText(restore.backup.createdAt||restore.backup.completedAt)} yedeğine dönülecek.</p></div><button type="button" onClick={()=>setRestore({backup:null,password:"",confirmText:""})}>İptal</button></div><div className="admpro-notice warn">Mevcut firma verisi değişeceği için yönetici şifresi ve açık onay zorunludur. Güvenlik yedeği alınamazsa işlem başlamaz.</div><div className="admpro-form-grid" style={{marginTop:12}}><label>Yönetici Şifresi<input type="password" value={restore.password} onChange={(e)=>setRestore((old)=>({...old,password:e.target.value}))}/></label><label>Onay Metni<input value={restore.confirmText} onChange={(e)=>setRestore((old)=>({...old,confirmText:e.target.value}))} placeholder="GERI YUKLE"/></label></div><div className="admpro-actions" style={{justifyContent:"flex-start",marginTop:12}}><button type="button" className="danger" onClick={restoreSelected} disabled={backupBusy}>Güvenlik Yedeği Al ve Geri Dön</button></div></section>:null}

    {selected?<section className="admpro-card"><div className="admpro-card-head"><div><h3>Kritik Firma İşlemleri · {selected.name}</h3><p>Silme ve veri aktarma geri dönüşü zor işlemlerdir; yönetici şifresiyle ayrıca doğrulanır.</p></div></div><div className="admpro-actions" style={{justifyContent:"flex-start"}}><button type="button" onClick={()=>setDanger({mode:"TRANSFER",item:selected,password:"",targetId:""})}>Verileri Başka Firmaya Aktar</button><button type="button" className="danger" onClick={()=>setDanger({mode:"DELETE",item:selected,password:"",targetId:""})}>Firmayı Sil</button></div></section>:null}

    {danger.item?<section className="admpro-card"><div className="admpro-card-head"><div><h3>{danger.mode==="DELETE"?"Firma Silme Doğrulaması":"Firma Veri Aktarma"}</h3><p>{danger.item.name} için kritik işlem onayı.</p></div><button type="button" onClick={()=>setDanger({mode:"",item:null,password:"",targetId:""})}>İptal</button></div><div className="admpro-form-grid">{danger.mode==="TRANSFER"?<label>Hedef Firma<select value={danger.targetId} onChange={(e)=>setDanger((old)=>({...old,targetId:e.target.value}))}><option value="">Hedef seçin</option>{companies.filter((row)=>row.id!==danger.item.id&&row.isActive).map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>:null}<label>Yönetici Şifresi<input type="password" value={danger.password} onChange={(e)=>setDanger((old)=>({...old,password:e.target.value}))}/></label></div><div className="admpro-actions" style={{justifyContent:"flex-start",marginTop:12}}><button type="button" className="danger" onClick={runDanger} disabled={busy}>{danger.mode==="DELETE"?"Silme İşlemini Onayla":"Aktarımı Onayla"}</button></div></section>:null}

    <section className="admpro-card"><div className="admpro-card-head"><div><h3>Entegrasyon & Kurtarma Hazırlığı</h3><p>Gizli anahtarlar ekranda gösterilmez; yalnız güvenli hazır/eksik durumu raporlanır.</p></div></div><div className="admpro-integration"><div><span>E-posta Doğrulama Servisi</span><strong>{deliveryData.email?"Bağlı":"Bağlı değil"}</strong><small className="admpro-muted">{deliveryData.email?`${deliveryData.emailProvider||"Gönderim servisi"} ile kod gönderilebilir.`:"Resend API anahtarı + gönderen adresi veya güvenli webhook Worker secret olarak tanımlanmalı."}</small></div><div><span>SMS Doğrulama Servisi</span><strong>{deliveryData.sms?"Bağlı":"Bağlı değil"}</strong><small className="admpro-muted">{deliveryData.sms?`${deliveryData.smsProvider||"SMS servisi"} hazır.`:"SMS isteğe bağlıdır; tanımlanmamış olması normal kullanıcı girişini engellemez."}</small></div><div><span>Sahip Kurtarma</span><strong>{recoveryData.recoveryEnabled?"Hazır":"Kurulum eksik"}</strong><small className="admpro-muted">İletişim doğrulaması + 3 güvenlik sorusu tamamlandığında aktif olur.</small></div><div><span>Aktif Ana Firma</span><strong>{activeMainCompany?.name||activeMainCompany?.slug||"Seçilmedi"}</strong><small className="admpro-muted">Tüm tenant kapsamlı yönetim işlemleri bu seçimle sınırlandırılır.</small></div></div></section>
  </div>;
}
