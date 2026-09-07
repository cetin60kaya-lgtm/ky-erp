import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, RefreshCw, ShieldCheck, Upload, Wifi, WifiOff } from "lucide-react";
import { confirmIkAdvancedCard, previewIkAdvancedCard } from "../../services/ikApi";
import { getPdksLiveDashboard } from "../../services/pdksApi";
import "./PdksTransferCenter.css";

const safe=(v)=>Array.isArray(v)?v:[];
const isOnline=(value)=>Boolean(value)&&Date.now()-new Date(value).getTime()<300000;

export default function PdksTransferCenter({activeMainCompany,isAuditAccount=false}) {
  const company=activeMainCompany?.slug||activeMainCompany?.id||"mecit-hakan";
  const fileRef=useRef(null);
  const [live,setLive]=useState({devices:[],metrics:{}});
  const [file,setFile]=useState(null),[preview,setPreview]=useState(null),[result,setResult]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const desktop=typeof window!=="undefined"?window.KYERP_DESKTOP:null;
  const desktopPdks=Boolean(desktop?.isDesktop&&desktop?.product==="PDKS");

  const refresh=useCallback(async()=>{
    setError("");
    try{setLive(await getPdksLiveDashboard({mainCompanyId:company})||{devices:[],metrics:{}})}
    catch(cause){setError(cause?.message||"Terminal durumu alınamadı.")}
  },[company]);
  useEffect(()=>{refresh()},[refresh]);

  const devices=safe(live?.devices);
  const online=devices.filter(row=>Number(row.active)!==0&&isOnline(row.lastSeenAt));
  const previewRows=safe(preview?.rows||preview?.items);
  const validRows=useMemo(()=>previewRows.filter(row=>row.valid!==false&&!row.warning),[previewRows]);

  const selectFile=(next)=>{
    setFile(next||null); setPreview(null); setResult(null); setMessage(""); setError("");
  };

  const runPreview=async()=>{
    if(isAuditAccount||busy||!file)return;
    setBusy(true);setError("");setMessage("");setResult(null);
    try{
      const data=await previewIkAdvancedCard(file,{mainCompanyId:company});
      setPreview(data||null);
      setMessage("Dosya yalnız önizlendi; henüz D1'e kart hareketi yazılmadı.");
    }catch(cause){setPreview(null);setError(cause?.message||"Kart dosyası önizlenemedi.")}
    finally{setBusy(false)}
  };

  const confirm=async()=>{
    if(isAuditAccount||busy||!previewRows.length)return;
    setBusy(true);setError("");setMessage("");
    try{
      const data=await confirmIkAdvancedCard({
        mainCompanyId:company,
        importId:preview?.importId,
        fileName:preview?.fileName||file?.name,
        rows:previewRows,
      });
      setResult(data||null);
      setMessage("Kart dosyası kontrollü olarak D1'e işlendi. Ham dosya PDKS personel masterı oluşturmadı.");
      setPreview(null); setFile(null);
      if(fileRef.current)fileRef.current.value="";
      await refresh();
    }catch(cause){setError(cause?.message||"Kart dosyası D1'e işlenemedi.")}
    finally{setBusy(false)}
  };

  return <div className="ptc-page">
    <header className="ptc-head">
      <div><small>PDKS / KART & TERMİNAL AKTARIMI</small><h1>Bilgi Aktar Merkezi</h1><p>Normal kullanımda Windows Agent kartları otomatik toplar. Dosya aktarımı yalnız kontrollü manuel yedek/fallback yoludur.</p></div>
      <div className="ptc-head-actions">{desktopPdks?<button className="primary" type="button" onClick={()=>desktop?.openPdksTerminalSettings?.()}>Windows Terminal Ayarları</button>:null}<button type="button" onClick={refresh}><RefreshCw size={15}/> Yenile</button></div>
    </header>

    {error?<div className="ptc-notice bad">{error}</div>:null}{message?<div className="ptc-notice">{message}</div>:null}

    <section className="ptc-flow">
      <div className="active"><i>1</i><span><b>Terminal</b><small>Kart basımı</small></span></div><em>→</em>
      <div className="active"><i>2</i><span><b>KYERP.PDKS.Agent</b><small>Offline güvenli kuyruk</small></span></div><em>→</em>
      <div className="active"><i>3</i><span><b>HTTPS Senkron</b><small>Yetkili cihaz kimliği</small></span></div><em>→</em>
      <div className="active"><i>4</i><span><b>KY ERP D1</b><small>Tek iş verisi</small></span></div>
    </section>

    <section className="ptc-health">
      <div><span>Yetkili Cihaz</span><b>{devices.length}</b></div>
      <div className={online.length?"ok":"warn"}><span>Çevrimiçi</span><b>{online.length}</b></div>
      <div><span>Bugün Gelen</span><b>{live?.metrics?.arrivedToday||0}</b></div>
      <div><span>Kontrol Gereken</span><b>{Number(live?.metrics?.noShow||0)+Number(live?.metrics?.missingPunch||0)}</b></div>
    </section>

    <div className="ptc-layout">
      <section className="ptc-card">
        <header><div><small>OTOMATİK KANAL</small><h2>Terminal / Agent Sağlığı</h2></div><ShieldCheck size={18}/></header>
        <div className="ptc-device-list">{devices.map(row=>{const ok=Number(row.active)!==0&&isOnline(row.lastSeenAt);return <div key={row.id}><i className={ok?"online":"offline"}>{ok?<Wifi size={15}/>:<WifiOff size={15}/>}</i><span><strong>{row.deviceLabel}</strong><small>{row.machineName||"Windows Agent"} · son senkron {row.lastSyncAt||"-"}</small></span><em>{ok?"Çevrimiçi":"Kontrol Et"}</em></div>})}{!devices.length?<div className="empty">Henüz yetkilendirilmiş PDKS cihazı görünmüyor.</div>:null}</div>
        <div className="ptc-safe-note"><ShieldCheck size={15}/><span>Terminal TCP portu internete açılmaz. Agent işyeri LAN'ından okur ve KY ERP'ye dışarı doğru HTTPS ile bağlanır.</span></div>
      </section>

      <section className="ptc-card manual">
        <header><div><small>MANUEL YEDEK YOL</small><h2>TXT / CSV / DAT Önizle</h2></div><FileText size={18}/></header>
        {isAuditAccount?<div className="ptc-readonly">Denetim hesabı kart dosyası okuyup D1'e aktaramaz.</div>:<>
          <label className="ptc-drop">
            <Upload size={22}/><strong>{file?.name||"Kart hareket dosyasını seç"}</strong><span>Hedef / TNF TXT, CSV veya DAT · en fazla 10 MB</span>
            <input ref={fileRef} type="file" accept=".txt,.csv,.dat,.log,text/plain" onChange={e=>selectFile(e.target.files?.[0])}/>
          </label>
          <div className="ptc-actions"><button type="button" onClick={()=>fileRef.current?.click()}>Dosya Seç</button><button className="primary" type="button" onClick={runPreview} disabled={!file||busy}>{busy?"Kontrol Ediliyor":"Önizle"}</button></div>
        </>}
      </section>
    </div>

    {preview?<section className="ptc-card preview">
      <header><div><small>ÖNİZLEME · D1'E HENÜZ YAZILMADI</small><h2>{preview.fileName||file?.name}</h2></div><div className="ptc-preview-count"><span>Satır <b>{preview.rowCount??previewRows.length}</b></span><span className="ok">Geçerli <b>{preview.validCount??validRows.length}</b></span><span className="warn">Kontrol <b>{preview.warningCount??Math.max(0,previewRows.length-validRows.length)}</b></span></div></header>
      <div className="ptc-table"><div className="head"><span>Kart</span><span>Personel</span><span>Tarih</span><span>Saat</span><span>Yön</span><span>Durum</span></div>{previewRows.slice(0,250).map((row,index)=><div key={row.id||row.localId||index} className={row.warning?"bad":""}><code>{row.cardNo||"-"}</code><strong>{row.fullName||"Eşleşmedi"}<small>{row.personnelCode||""}</small></strong><span>{row.workDate||row.date||"-"}</span><span>{row.eventTime||row.time||"-"}</span><span>{row.direction||"AUTO"}</span><em>{row.warning||"Hazır"}</em></div>)}</div>
      <footer><span><ShieldCheck size={14}/> Eşleşmeyen satırlar onayda reddedilir; personel kimliği tahmin edilmez.</span><div><button type="button" onClick={()=>setPreview(null)}>Vazgeç</button><button className="commit" type="button" onClick={confirm} disabled={busy||!previewRows.length}>Onayla ve D1'e İşle</button></div></footer>
    </section>:null}

    {result?<section className="ptc-result"><CheckCircle2 size={18}/><div><strong>Aktarım tamamlandı</strong><span>Kabul {result.acceptedCount||0} · Red {result.rejectedCount||0}</span></div></section>:null}
  </div>;
}
