import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyInitialPdksCardMappings,
  enrollPdksDevice,
  listPdksCardMappings,
  listPdksDevices,
  listPdksDeviceSyncLogs,
  savePdksCardMapping,
  setPdksDeviceActive,
} from "../../services/pdksDeviceApi";
import "./PdksDeviceCenter.css";

const dateText=(value)=>{if(!value)return"-";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString("tr-TR")};
const agoText=(value)=>{if(!value)return"Henüz bağlantı yok";const ms=Date.now()-new Date(value).getTime();if(!Number.isFinite(ms))return dateText(value);const min=Math.max(0,Math.floor(ms/60000));if(min<1)return"Az önce";if(min<60)return`${min} dk önce`;const hour=Math.floor(min/60);if(hour<24)return`${hour} sa önce`;return`${Math.floor(hour/24)} gün önce`};
const online=(value)=>Boolean(value)&&Date.now()-new Date(value).getTime()<5*60*1000;
const normalizeCard=(value)=>{const digits=String(value||"").replace(/\D+/g,"").slice(0,12);return digits.length&&digits.length<=5?digits.padStart(5,"0"):digits};
const upper=(value)=>String(value||"").trim().toLocaleUpperCase("tr-TR");

export default function PdksDeviceCenter({ activeTab="cihaz-baglantilari", activeMainCompany, isAuditAccount=false }){
  const desktop=typeof window!=="undefined"?window.KYERP_DESKTOP:null;
  const desktopPdks=Boolean(desktop?.isDesktop&&desktop?.product==="PDKS");
  const company=activeMainCompany?.slug||activeMainCompany?.id||"mecit-hakan";
  const [devices,setDevices]=useState([]),[logs,setLogs]=useState([]),[selected,setSelected]=useState("");
  const [mapping,setMapping]=useState({rows:[],initialApplied:false}),[cardDrafts,setCardDrafts]=useState({}),[cardSearch,setCardSearch]=useState("");
  const [form,setForm]=useState({deviceLabel:"",machineName:""});
  const [credential,setCredential]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("Terminal bilgileri yükleniyor...");

  const load=useCallback(async()=>{
    setBusy(true);
    try{
      const [deviceRows,logRows,mapResult]=await Promise.all([
        listPdksDevices({mainCompanyId:company}),
        listPdksDeviceSyncLogs({mainCompanyId:company,limit:150}),
        listPdksCardMappings({mainCompanyId:company}),
      ]);
      let mapData=mapResult&&typeof mapResult==="object"?mapResult:{rows:[]};
      if(!isAuditAccount&&!mapData.initialApplied){
        const seeded=await applyInitialPdksCardMappings({mainCompanyId:company});
        mapData=await listPdksCardMappings({mainCompanyId:company});
        const missing=Number(seeded?.missingCount||0);
        setMessage(missing?`Kart eşleştirmesi uygulandı; ${missing} personel adı bulunamadı, listeden kontrol edin.`:`Verilen terminal kart eşleştirmeleri uygulandı (${seeded?.appliedCount||16} kayıt).`);
      }else setMessage(isAuditAccount?"Denetim profili: cihaz ve kart eşleştirmeleri salt okunur.":"Cihaz, kart eşleştirme ve senkronizasyon bilgileri güncel.");
      const list=Array.isArray(deviceRows)?deviceRows:[];setDevices(list);setLogs(Array.isArray(logRows)?logRows:[]);setMapping(mapData);
      setCardDrafts(Object.fromEntries((mapData?.rows||[]).map((row)=>[row.id,normalizeCard(row.cardNo)])));
      setSelected((current)=>list.some((row)=>row.id===current)?current:(list[0]?.id||""));
    }catch(error){setDevices([]);setLogs([]);setMessage(`Hata: ${error?.message||"PDKS cihaz bilgileri alınamadı."}`);}finally{setBusy(false);}
  },[company,isAuditAccount]);
  useEffect(()=>{load();},[load]);

  const selectedDevice=useMemo(()=>devices.find((row)=>row.id===selected)||null,[devices,selected]);
  const selectedLogs=useMemo(()=>selected?logs.filter((row)=>row.deviceId===selected):logs,[logs,selected]);
  const filteredMappings=useMemo(()=>{const q=upper(cardSearch);const rows=Array.isArray(mapping?.rows)?mapping.rows:[];return rows.filter((row)=>!q||upper(`${row.personnelCode||""} ${row.fullName||""} ${row.cardNo||""} ${row.department||""}`).includes(q));},[cardSearch,mapping]);
  const onlineCount=devices.filter((row)=>online(row.lastSeenAt)&&row.active!==0).length;
  const failedCount=logs.filter((row)=>String(row.status||"").toUpperCase()!=="OK"||Number(row.rejectedCount||0)>0).length;
  const mappedCount=(mapping?.rows||[]).filter((row)=>normalizeCard(row.cardNo)).length;

  async function enroll(event){
    event.preventDefault();if(isAuditAccount||!form.deviceLabel.trim())return;
    setBusy(true);setCredential(null);
    try{
      const result=await enrollPdksDevice({mainCompanyId:company,deviceLabel:form.deviceLabel.trim(),machineName:form.machineName.trim()});
      setCredential(result);setForm({deviceLabel:"",machineName:""});setMessage("Cihaz yetkilendirildi. Gizli anahtar yalnız bu anda gösterilir; Agent ayarına kaydedin.");await load();
    }catch(error){setMessage(`Hata: ${error?.message||"Cihaz yetkilendirilemedi."}`);}finally{setBusy(false);}
  }
  async function toggle(row){if(isAuditAccount)return;setBusy(true);try{await setPdksDeviceActive(row.id,row.active===0);setMessage(row.active===0?"Cihaz aktifleştirildi.":"Cihaz pasife alındı.");await load();}catch(error){setMessage(`Hata: ${error?.message||"Cihaz durumu değiştirilemedi."}`);}finally{setBusy(false);}}
  async function copy(value){try{await navigator.clipboard.writeText(String(value||""));setMessage("Cihaz anahtarı panoya kopyalandı.");}catch{setMessage("Anahtar kopyalanamadı; ekrandaki değeri elle alın.");}}
  async function saveCard(row){
    if(isAuditAccount)return;const cardNo=normalizeCard(cardDrafts[row.id]);if(!cardNo){setMessage("Hata: Terminal kart numarası yalnız rakam olmalı.");return;}
    setBusy(true);try{await savePdksCardMapping(row.id,cardNo,{mainCompanyId:company});setMessage(`${row.fullName} · terminal kartı ${cardNo} olarak eşleştirildi. HKN personel kodu değişmedi.`);await load();}catch(error){setMessage(`Hata: ${error?.message||"Kart eşleştirmesi kaydedilemedi."}`);}finally{setBusy(false);}
  }

  return <div className="pdc-page">
    <header className="pdc-head"><div><small>PDKS / TERMİNAL & SİSTEM</small><h1>{activeTab==="senkron"?"Senkronizasyon":activeTab==="saat-terminal"?"Terminal & Sistem":"Cihaz Bağlantıları"}</h1><p>Windows Agent, terminal kimliği, bağlantı sağlığı, kart eşleştirmesi ve D1 senkron geçmişi tek merkezden izlenir.</p></div><div className="pdc-head-actions">{desktopPdks?<button type="button" className="primary" onClick={()=>desktop?.openPdksTerminalSettings?.()}>Windows Terminal Ayarları</button>:null}<button type="button" onClick={load} disabled={busy}>Yenile</button></div></header>
    {desktopPdks&&desktop?.firstRun&&!isAuditAccount?<section className="pdc-local-setup"><div><b>İlk kurulum tamamlanmayı bekliyor</b><span>Doğrudan FP_CLOCK terminali IP/port, yön ve Agent ayarıyla tanımlayın. Hedef500/TXT doğrudan modda kullanılmaz.</span></div><button type="button" onClick={()=>desktop?.openPdksTerminalSettings?.()}>Kurulum Sihirbazını Aç</button></section>:null}
    {desktopPdks?<section className="pdc-local-strip"><div><span>Windows Ürünü</span><b>{desktop?.product==="PDKS"?"KY PDKS Pro":"KY ERP Desktop"}</b></div><div><span>Sürüm</span><b>{desktop?.version||"-"}</b></div><div><span>Yerel Terminal Köprüsü</span><b>FP_CLOCK Direct</b></div><div><span>Agent</span><b>Windows Agent</b></div></section>:null}
    <div className={`pdc-notice ${message.startsWith("Hata:")?"bad":""}`}>{message}</div>
    <section className="pdc-metrics"><div><span>Tanımlı Cihaz</span><b>{devices.length}</b></div><div><span>Çevrimiçi</span><b>{onlineCount}</b></div><div><span>Kart Eşleşmiş Personel</span><b>{mappedCount}</b></div><div><span>Hata / Red</span><b>{failedCount}</b></div></section>

    {activeTab!=="senkron"?<section className="pdc-card"><div className="pdc-cardhead"><div><h2>Terminal Kart No ↔ Personel Eşleştirme</h2><p>HKN/personel kodu firma içi numaradır ve değişmez. PDKS giriş-çıkış eşleştirmesi terminalin bastığı 00001, 00002… kart numarası üzerinden yapılır.</p></div><input className="pdc-map-search" value={cardSearch} onChange={(e)=>setCardSearch(e.target.value)} placeholder="Ad, HKN no veya kart ara..."/></div><div className="pdc-table mappings"><div className="row head"><span>HKN / Personel No</span><span>Ad Soyad</span><span>Bölüm</span><span>Terminal Kart No</span><span>Durum</span><span>İşlem</span></div>{filteredMappings.map((row)=>{const current=normalizeCard(row.cardNo),draft=cardDrafts[row.id]??current,changed=normalizeCard(draft)!==current;return <div className="row" key={row.id}><span><b>{row.personnelCode||"-"}</b><small>Firma personel kodu</small></span><span><b>{row.fullName}</b><small>{row.title||"-"}</small></span><span>{row.department||"-"}</span><span><input value={draft} maxLength={12} inputMode="numeric" onChange={(e)=>setCardDrafts((v)=>({...v,[row.id]:e.target.value.replace(/\D+/g,"")}))} disabled={isAuditAccount||busy}/></span><span><i className={current?"online":"offline"}>{current?`Kart ${current}`:"Eşleşmedi"}</i></span><span>{isAuditAccount?"Salt okunur":<button type="button" className={changed?"primary":""} disabled={busy||!changed||!normalizeCard(draft)} onClick={()=>saveCard(row)}>Kaydet</button>}</span></div>})}{!filteredMappings.length?<div className="empty">Personel bulunamadı.</div>:null}</div></section>:null}

    {activeTab!=="senkron"&&!isAuditAccount?<section className="pdc-card"><div className="pdc-cardhead"><div><h2>Yeni Agent / Terminal Yetkilendir</h2><p>Her bilgisayar için ayrı kimlik ve gizli anahtar üretin. Aynı etiket yeniden yetkilendirilirse eski anahtar geçersiz olur.</p></div></div><form className="pdc-enroll" onSubmit={enroll}><label>Cihaz Etiketi<input value={form.deviceLabel} onChange={(e)=>setForm((v)=>({...v,deviceLabel:e.target.value}))} placeholder="Örn: Ana Ofis PDKS"/></label><label>Bilgisayar Adı<input value={form.machineName} onChange={(e)=>setForm((v)=>({...v,machineName:e.target.value}))} placeholder="Örn: DESKTOP-KYERP"/></label><button className="primary" type="submit" disabled={busy||!form.deviceLabel.trim()}>Cihaz Anahtarı Üret</button></form>{credential?<div className="pdc-secret"><b>Bu bilgi yalnız şimdi gösterilir.</b><span>Cihaz ID: <code>{credential.deviceId}</code></span><span>Gizli Anahtar: <code>{credential.secret}</code></span><button type="button" onClick={()=>copy(credential.secret)}>Anahtarı Kopyala</button></div>:null}</section>:null}

    <section className="pdc-card"><div className="pdc-cardhead"><div><h2>Terminaller</h2><p>Heartbeat beş dakikadan yeniyse cihaz çevrimiçi kabul edilir. “Kayıt” değeri D1'e başarıyla senkronlanan son paket adedidir.</p></div></div><div className="pdc-table devices"><div className="row head"><span>Cihaz</span><span>Durum</span><span>Son Heartbeat</span><span>Son Senkron</span><span>Kayıt</span><span>İşlem</span></div>{devices.map((row)=><div className={`row ${row.id===selected?"selected":""}`} key={row.id} onClick={()=>setSelected(row.id)}><span><b>{row.deviceLabel}</b><small>{row.machineName||"Makine adı yok"}</small></span><span><i className={row.active===0?"passive":online(row.lastSeenAt)?"online":"offline"}>{row.active===0?"Pasif":online(row.lastSeenAt)?"Çevrimiçi":"Çevrimdışı"}</i></span><span>{agoText(row.lastSeenAt)}<small>{dateText(row.lastSeenAt)}</small></span><span>{agoText(row.lastSyncAt)}<small>{dateText(row.lastSyncAt)}</small></span><span>{Number(row.lastSyncCount||0).toLocaleString("tr-TR")}</span><span>{!isAuditAccount?<button type="button" className={row.active===0?"":"danger"} onClick={(e)=>{e.stopPropagation();toggle(row)}} disabled={busy}>{row.active===0?"Aktif Et":"Pasife Al"}</button>:"Salt okunur"}</span></div>)}{!devices.length?<div className="empty">Henüz PDKS terminali tanımlı değil.</div>:null}</div></section>

    <section className="pdc-card"><div className="pdc-cardhead"><div><h2>Senkronizasyon Geçmişi{selectedDevice?` · ${selectedDevice.deviceLabel}`:""}</h2><p>Agent tarafından alınan, kabul edilen ve reddedilen hareketler. Kart eşleştirmesi yoksa red nedeni burada görünür.</p></div>{selected?<button type="button" onClick={()=>setSelected("")}>Tüm Cihazlar</button>:null}</div><div className="pdc-table logs"><div className="row head"><span>Tarih</span><span>Cihaz</span><span>Alınan</span><span>Kabul</span><span>Red</span><span>Durum / Mesaj</span></div>{selectedLogs.map((row)=><div className="row" key={row.id}><span>{dateText(row.createdAt)}</span><span>{row.deviceLabel||devices.find((device)=>device.id===row.deviceId)?.deviceLabel||row.deviceId}</span><span>{row.receivedCount||0}</span><span>{row.acceptedCount||0}</span><span>{row.rejectedCount||0}</span><span><b>{row.status}</b><small>{row.message||"-"}</small></span></div>)}{!selectedLogs.length?<div className="empty">Henüz senkronizasyon olayı yok.</div>:null}</div></section>
  </div>;
}
