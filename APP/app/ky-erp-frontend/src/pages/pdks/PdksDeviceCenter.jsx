import { useCallback, useEffect, useMemo, useState } from "react";
import { enrollPdksDevice, listPdksDevices, listPdksDeviceSyncLogs, setPdksDeviceActive } from "../../services/pdksDeviceApi";
import "./PdksDeviceCenter.css";

const dateText=(value)=>{if(!value)return"-";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString("tr-TR")};
const agoText=(value)=>{if(!value)return"Henüz bağlantı yok";const ms=Date.now()-new Date(value).getTime();if(!Number.isFinite(ms))return dateText(value);const min=Math.max(0,Math.floor(ms/60000));if(min<1)return"Az önce";if(min<60)return`${min} dk önce`;const hour=Math.floor(min/60);if(hour<24)return`${hour} sa önce`;return`${Math.floor(hour/24)} gün önce`};
const online=(value)=>Boolean(value)&&Date.now()-new Date(value).getTime()<5*60*1000;

export default function PdksDeviceCenter({ activeTab="cihaz-baglantilari", activeMainCompany, isAuditAccount=false }){
  const company=activeMainCompany?.slug||activeMainCompany?.id||"mecit-hakan";
  const [devices,setDevices]=useState([]),[logs,setLogs]=useState([]),[selected,setSelected]=useState("");
  const [form,setForm]=useState({deviceLabel:"",machineName:""});
  const [credential,setCredential]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("Terminal bilgileri yükleniyor...");

  const load=useCallback(async()=>{
    setBusy(true);
    try{
      const [deviceRows,logRows]=await Promise.all([listPdksDevices({mainCompanyId:company}),listPdksDeviceSyncLogs({mainCompanyId:company,limit:150})]);
      const list=Array.isArray(deviceRows)?deviceRows:[];setDevices(list);setLogs(Array.isArray(logRows)?logRows:[]);
      setSelected((current)=>list.some((row)=>row.id===current)?current:(list[0]?.id||""));
      setMessage(isAuditAccount?"Denetim profili: cihaz ve senkron bilgileri salt okunur.":"Cihaz ve senkronizasyon bilgileri güncel.");
    }catch(error){setDevices([]);setLogs([]);setMessage(`Hata: ${error?.message||"PDKS cihaz bilgileri alınamadı."}`);}finally{setBusy(false);}
  },[company,isAuditAccount]);
  useEffect(()=>{load();},[load]);

  const selectedDevice=useMemo(()=>devices.find((row)=>row.id===selected)||null,[devices,selected]);
  const selectedLogs=useMemo(()=>selected?logs.filter((row)=>row.deviceId===selected):logs,[logs,selected]);
  const onlineCount=devices.filter((row)=>online(row.lastSeenAt)&&row.active!==0).length;
  const failedCount=logs.filter((row)=>String(row.status||"").toUpperCase()!=="OK"||Number(row.rejectedCount||0)>0).length;

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

  return <div className="pdc-page">
    <header className="pdc-head"><div><small>PDKS / TERMİNAL & SİSTEM</small><h1>{activeTab==="senkron"?"Senkronizasyon":activeTab==="saat-terminal"?"Terminal & Sistem":"Cihaz Bağlantıları"}</h1><p>Windows Agent, terminal kimliği, bağlantı sağlığı ve D1 senkron geçmişi tek merkezden izlenir.</p></div><button type="button" onClick={load} disabled={busy}>Yenile</button></header>
    <div className={`pdc-notice ${message.startsWith("Hata:")?"bad":""}`}>{message}</div>
    <section className="pdc-metrics"><div><span>Tanımlı Cihaz</span><b>{devices.length}</b></div><div><span>Çevrimiçi</span><b>{onlineCount}</b></div><div><span>Son Senkron Kayıtları</span><b>{logs.length}</b></div><div><span>Hata / Red</span><b>{failedCount}</b></div></section>

    {activeTab!=="senkron"&&!isAuditAccount?<section className="pdc-card"><div className="pdc-cardhead"><div><h2>Yeni Agent / Terminal Yetkilendir</h2><p>Her bilgisayar için ayrı kimlik ve gizli anahtar üretin. Aynı etiket yeniden yetkilendirilirse eski anahtar geçersiz olur.</p></div></div><form className="pdc-enroll" onSubmit={enroll}><label>Cihaz Etiketi<input value={form.deviceLabel} onChange={(e)=>setForm((v)=>({...v,deviceLabel:e.target.value}))} placeholder="Örn: Ana Ofis PDKS"/></label><label>Bilgisayar Adı<input value={form.machineName} onChange={(e)=>setForm((v)=>({...v,machineName:e.target.value}))} placeholder="Örn: DESKTOP-KYERP"/></label><button className="primary" type="submit" disabled={busy||!form.deviceLabel.trim()}>Cihaz Anahtarı Üret</button></form>{credential?<div className="pdc-secret"><b>Bu bilgi yalnız şimdi gösterilir.</b><span>Cihaz ID: <code>{credential.deviceId}</code></span><span>Gizli Anahtar: <code>{credential.secret}</code></span><button type="button" onClick={()=>copy(credential.secret)}>Anahtarı Kopyala</button></div>:null}</section>:null}

    <section className="pdc-card"><div className="pdc-cardhead"><div><h2>Terminaller</h2><p>Heartbeat beş dakikadan yeniyse cihaz çevrimiçi kabul edilir.</p></div></div><div className="pdc-table devices"><div className="row head"><span>Cihaz</span><span>Durum</span><span>Son Heartbeat</span><span>Son Senkron</span><span>Kayıt</span><span>İşlem</span></div>{devices.map((row)=><div className={`row ${row.id===selected?"selected":""}`} key={row.id} onClick={()=>setSelected(row.id)}><span><b>{row.deviceLabel}</b><small>{row.machineName||"Makine adı yok"}</small></span><span><i className={row.active===0?"passive":online(row.lastSeenAt)?"online":"offline"}>{row.active===0?"Pasif":online(row.lastSeenAt)?"Çevrimiçi":"Çevrimdışı"}</i></span><span>{agoText(row.lastSeenAt)}<small>{dateText(row.lastSeenAt)}</small></span><span>{agoText(row.lastSyncAt)}<small>{dateText(row.lastSyncAt)}</small></span><span>{Number(row.lastSyncCount||0).toLocaleString("tr-TR")}</span><span>{!isAuditAccount?<button type="button" className={row.active===0?"":"danger"} onClick={(e)=>{e.stopPropagation();toggle(row)}} disabled={busy}>{row.active===0?"Aktif Et":"Pasife Al"}</button>:"Salt okunur"}</span></div>)}{!devices.length?<div className="empty">Henüz PDKS terminali tanımlı değil.</div>:null}</div></section>

    <section className="pdc-card"><div className="pdc-cardhead"><div><h2>Senkronizasyon Geçmişi{selectedDevice?` · ${selectedDevice.deviceLabel}`:""}</h2><p>Agent tarafından alınan, kabul edilen ve reddedilen hareketler.</p></div>{selected?<button type="button" onClick={()=>setSelected("")}>Tüm Cihazlar</button>:null}</div><div className="pdc-table logs"><div className="row head"><span>Tarih</span><span>Cihaz</span><span>Alınan</span><span>Kabul</span><span>Red</span><span>Durum / Mesaj</span></div>{selectedLogs.map((row)=><div className="row" key={row.id}><span>{dateText(row.createdAt)}</span><span>{row.deviceLabel||devices.find((device)=>device.id===row.deviceId)?.deviceLabel||row.deviceId}</span><span>{row.receivedCount||0}</span><span>{row.acceptedCount||0}</span><span>{row.rejectedCount||0}</span><span><b>{row.status}</b><small>{row.message||"-"}</small></span></div>)}{!selectedLogs.length?<div className="empty">Henüz senkronizasyon olayı yok.</div>:null}</div></section>
  </div>;
}
