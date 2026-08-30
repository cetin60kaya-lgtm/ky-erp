import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../utils/api";
import "./AdminManagement.css";

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}
function slugify(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function mapCompany(row = {}) {
  return { id:String(row.id || ""), name:String(row.name || row.ad || ""), slug:String(row.slug || row.kod || ""), note:String(row.note || ""), isActive:row.isActive !== false, updatedAt:row.updatedAt || row.lastUpdatedAt || "" };
}
function emptyForm(){ return { id:"", name:"", slug:"", note:"", isActive:true }; }

export default function AdminCompanySettings({ activeMainCompany }) {
  const [companies,setCompanies]=useState([]);
  const [form,setForm]=useState(emptyForm());
  const [selectedId,setSelectedId]=useState("");
  const [delivery,setDelivery]=useState(null);
  const [recovery,setRecovery]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("Firma ve sistem ayarları yükleniyor...");
  const [danger,setDanger]=useState({ mode:"", item:null, password:"", targetId:"" });

  const load=useCallback(async()=>{
    setBusy(true);
    const [companyJob,deliveryJob,recoveryJob]=await Promise.allSettled([
      apiGet("/admin/main-companies",{_ts:Date.now()}),
      apiGet("/admin/security/delivery-capabilities",{_ts:Date.now()}),
      apiGet("/admin/security/owner-recovery",{_ts:Date.now()}),
    ]);
    if(companyJob.status==="fulfilled"){
      const list=rowsOf(companyJob.value).map(mapCompany);
      setCompanies(list);
      setSelectedId((current)=>list.some((row)=>row.id===current)?current:(activeMainCompany?.id || list[0]?.id || ""));
    }
    if(deliveryJob.status==="fulfilled") setDelivery(deliveryJob.value?.data || deliveryJob.value);
    if(recoveryJob.status==="fulfilled") setRecovery(recoveryJob.value?.data || recoveryJob.value);
    const failed=[companyJob,deliveryJob,recoveryJob].filter((job)=>job.status==="rejected").length;
    setMessage(failed?`${failed} sistem bilgisi alınamadı; erişilebilen ayarlar gösteriliyor.`:"Firma ve entegrasyon ayarları güncel.");
    setBusy(false);
  },[activeMainCompany?.id]);
  useEffect(()=>{load();},[load]);

  const selected=useMemo(()=>companies.find((row)=>row.id===selectedId)||null,[companies,selectedId]);
  const deliveryData=delivery||{};
  const recoveryData=recovery||{};

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

  return <div className="admpro-page">
    <header className="admpro-head"><div><span className="admpro-kicker">YÖNETİM / FİRMA & SİSTEM</span><h2>Firma & Sistem Ayarları</h2><p>Ana firmalar, güvenlik entegrasyonları ve sistem hazırlık durumu tek merkezde.</p></div><div className="admpro-actions"><button type="button" onClick={beginNew}>+ Yeni Ana Firma</button><button type="button" className="primary" onClick={load} disabled={busy}>Yenile</button></div></header>
    <div className={`admpro-notice ${message.startsWith("Hata") ? "error" : message.includes("alınamadı") ? "warn" : "success"}`}>{message}</div>

    <section className="admpro-grid-2">
      <div className="admpro-card"><div className="admpro-card-head"><div><h3>Ana Firmalar</h3><p>Tenant/firma sınırlarının temel yönetimi.</p></div><span className="admpro-badge">{companies.length} kayıt</span></div>
        <div className="admpro-company-list">{companies.map((row)=><div key={row.id} className={`admpro-company-row ${row.id===selectedId?"active":""}`}><div onClick={()=>setSelectedId(row.id)} role="button" tabIndex={0}><strong>{row.name}</strong><small>{row.slug} · {row.isActive?"Aktif":"Pasif"}{row.id===activeMainCompany?.id?" · Şu an seçili":""}</small></div><div className="admpro-row-actions"><button type="button" onClick={()=>beginEdit(row)}>Düzenle</button><button type="button" onClick={()=>toggle(row)}>{row.isActive?"Pasife Al":"Aktifleştir"}</button></div></div>)}{!companies.length?<div className="admpro-empty">Ana firma kaydı alınamadı.</div>:null}</div>
      </div>

      <div className="admpro-card"><div className="admpro-card-head"><div><h3>{form.id?"Ana Firma Düzenle":"Yeni Ana Firma"}</h3><p>İsim, kısa kod ve aktiflik ayarları.</p></div>{form.id?<button type="button" onClick={()=>setForm(emptyForm())}>Formu Temizle</button>:null}</div>
        <form onSubmit={save}><div className="admpro-form-grid"><label>Firma Adı<input value={form.name} onChange={(e)=>setForm((old)=>({...old,name:e.target.value,slug:old.slug||slugify(e.target.value)}))}/></label><label>Kısa Kod / Slug<input value={form.slug} onChange={(e)=>setForm((old)=>({...old,slug:e.target.value}))}/></label><label className="wide">Açıklama<textarea value={form.note} onChange={(e)=>setForm((old)=>({...old,note:e.target.value}))}/></label><label className="admpro-check wide"><input type="checkbox" checked={form.isActive} onChange={(e)=>setForm((old)=>({...old,isActive:e.target.checked}))}/> Aktif ana firma</label></div><div className="admpro-actions" style={{justifyContent:"flex-start",marginTop:12}}><button className="primary" type="submit" disabled={busy}>{form.id?"Değişiklikleri Kaydet":"Ana Firma Oluştur"}</button></div></form>
      </div>
    </section>

    {selected?<section className="admpro-card"><div className="admpro-card-head"><div><h3>Kritik Firma İşlemleri · {selected.name}</h3><p>Silme ve veri aktarma geri dönüşü zor işlemlerdir; yönetici şifresiyle ayrıca doğrulanır.</p></div></div><div className="admpro-actions" style={{justifyContent:"flex-start"}}><button type="button" onClick={()=>setDanger({mode:"TRANSFER",item:selected,password:"",targetId:""})}>Verileri Başka Firmaya Aktar</button><button type="button" className="danger" onClick={()=>setDanger({mode:"DELETE",item:selected,password:"",targetId:""})}>Firmayı Sil</button></div></section>:null}

    {danger.item?<section className="admpro-card"><div className="admpro-card-head"><div><h3>{danger.mode==="DELETE"?"Firma Silme Doğrulaması":"Firma Veri Aktarma"}</h3><p>{danger.item.name} için kritik işlem onayı.</p></div><button type="button" onClick={()=>setDanger({mode:"",item:null,password:"",targetId:""})}>İptal</button></div><div className="admpro-form-grid">{danger.mode==="TRANSFER"?<label>Hedef Firma<select value={danger.targetId} onChange={(e)=>setDanger((old)=>({...old,targetId:e.target.value}))}><option value="">Hedef seçin</option>{companies.filter((row)=>row.id!==danger.item.id&&row.isActive).map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>:null}<label>Yönetici Şifresi<input type="password" value={danger.password} onChange={(e)=>setDanger((old)=>({...old,password:e.target.value}))}/></label></div><div className="admpro-actions" style={{justifyContent:"flex-start",marginTop:12}}><button type="button" className="danger" onClick={runDanger} disabled={busy}>{danger.mode==="DELETE"?"Silme İşlemini Onayla":"Aktarımı Onayla"}</button></div></section>:null}

    <section className="admpro-card"><div className="admpro-card-head"><div><h3>Entegrasyon & Kurtarma Hazırlığı</h3><p>Gizli anahtarlar ekranda gösterilmez; yalnız güvenli hazır/eksik durumu raporlanır.</p></div></div><div className="admpro-integration"><div><span>E-posta Doğrulama Servisi</span><strong>{deliveryData.email?"Bağlı":"Bağlı değil"}</strong><small className="admpro-muted">{deliveryData.email?`${deliveryData.emailProvider||"Gönderim servisi"} ile kod gönderilebilir.`:"Resend API anahtarı + gönderen adresi veya güvenli webhook Worker secret olarak tanımlanmalı."}</small></div><div><span>SMS Doğrulama Servisi</span><strong>{deliveryData.sms?"Bağlı":"Bağlı değil"}</strong><small className="admpro-muted">{deliveryData.sms?`${deliveryData.smsProvider||"SMS servisi"} hazır.`:"SMS isteğe bağlıdır; tanımlanmamış olması normal kullanıcı girişini engellemez."}</small></div><div><span>Sahip Kurtarma</span><strong>{recoveryData.recoveryEnabled?"Hazır":"Kurulum eksik"}</strong><small className="admpro-muted">İletişim doğrulaması + 3 güvenlik sorusu tamamlandığında aktif olur.</small></div><div><span>Aktif Ana Firma</span><strong>{activeMainCompany?.name||activeMainCompany?.slug||"Seçilmedi"}</strong><small className="admpro-muted">Tüm tenant kapsamlı yönetim işlemleri bu seçimle sınırlandırılır.</small></div></div></section>
  </div>;
}
