import React,{useMemo,useState} from "react";
import {AlertTriangle,Archive,Download,FileCheck2,FileWarning,LockKeyhole,
  RefreshCw,ShieldCheck,UploadCloud} from "lucide-react";
import {parseTerminalDiagnosticReport} from "./terminalReportView.mjs";
import {csvForTable} from "./productData.js";

const views={
  transfers:{title:"Günlük Aktarımlar",description:"Her gün için yerel QR/USB okuma ve TNF referans karşılaştırması"},
  transfer:{title:"Aktarım Merkezi",description:"Bekleyen transferleri ve aktarımın önündeki kanıt engellerini inceleyin"},
  tnf:{title:"TNF Arşivi",description:"Salt okunur TNF karşılaştırma sonucu; yıllık arşive yazılmaz"},
  reconciliation:{title:"Veri Mutabakatı",description:"Yerel günlük ile TNF eşleştirmesi; Firebird ve Cloud henüz doğrulanmadı"},
  incidents:{title:"Hata Merkezi",description:"İmza hataları, çakışmalar ve TNF'de bulunamayan kaynak kayıtları"},
};
const hdr=["Tarih","Okunan","TNF Eşleşen","TNF'de Yok","Çakışma",
  "Reddedilen","İmzalı QR","USB Belirsiz","Durum"];
const formatRow=b=>({
  "Tarih":b.date==="BILINMIYOR"?"Tarih doğrulanmadı":b.date,
  "Okunan":b.inspected,
  "TNF Eşleşen":b.matched,
  "TNF'de Yok":b.unmatched,
  "Çakışma":b.ambiguous,
  "Reddedilen":b.rejected,
  "İmzalı QR":b.signedQr,
  "USB Belirsiz":b.unsignedUsb,
  "Durum":"İnceleme gerekli",
});
const metric=(label,value,critical=false)=>
  <div key={label} className={"pdk-u-transfer-metric"+(critical?" is-warning":"")}>
    <span>{label}</span><strong>{value??"—"}</strong>
  </div>;
export default function TransferCenterPanel({tabId="transfer",previewOnly=true,
  report=null,onReportLoaded=()=>{},search=""}){
  const [terminalId,setTerminalId]=useState("");
  const [error,setError]=useState("");
  const [issuesOnly,setIssuesOnly]=useState(false);
  const details=views[tabId]||views.transfer;
  const usable=!previewOnly&&report?.source==="UNSIGNED_LOCAL_DIAGNOSTICS";
  const batches=useMemo(()=>{
    if(!usable)return [];
    const q=String(search).trim().toLocaleLowerCase("tr-TR");
    return (Array.isArray(report.dailyBatches)?report.dailyBatches:[])
      .filter(item=>!issuesOnly||item.rejected+item.ambiguous+item.unmatched>0)
      .filter(item=>!q||item.date.toLocaleLowerCase("tr-TR").includes(q));
  },[usable,report,issuesOnly,search]);
  const importFile=async(file)=>{
    if(!file||previewOnly)return;
    setError("");
    try{
      if(file.size>65536||file.size<40)throw Error("TERMINAL_REPORT_SIZE_INVALID");
      if(!/^[A-Za-z0-9._-]{3,64}$/.test(terminalId.trim()))
        throw Error("TERMINAL_ID_REQUIRED");
      const parsed=parseTerminalDiagnosticReport(await file.text(),terminalId.trim());
      onReportLoaded(parsed);
    }catch(e){
      onReportLoaded(null);
      setError("Tanı raporu kabul edilmedi: "+String(e.message||"Geçersiz dosya"));
    }
  };
  const exportSummary=()=>{
    if(!usable||!batches.length)return;
    const csv=csvForTable(hdr,batches.map(formatRow));
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download="KY_PDKS_AKTARIM_ONIZLEME_"+report.terminalId+".csv";
    a.click();URL.revokeObjectURL(url);
  };
  const needsAttention=usable?report.invalid+report.ambiguous+report.unmatched:0;
  return <section className="pdk-u-transfer" aria-label={details.title}>
    <div className="pdk-u-live-head">
      <div><strong>{details.title} · Kaynak inceleme</strong>
        <p>{details.description}. İmzalı terminal günlüğü yalnız yerel Windows'ta doğrulanır;
          içe alınan özet dosyası tek başına sertifika değildir.</p>
      </div>
      <span className="pdk-u-label"><LockKeyhole size={14}/> Üretim aktarımı kapalı</span>
    </div>
    <div className="pdk-u-transfer-import">
      <label>Terminal kodu
        <input type="text" aria-label="Aktarım terminal kodu"
          value={terminalId} maxLength={64} disabled={previewOnly}
          placeholder="Örn. GİRİŞ-01"
          onChange={event=>{setTerminalId(event.target.value);setError("");}}/>
      </label>
      <label>Windows Tanı Raporu (JSON)
        <input aria-label="Aktarım tanı raporu" type="file" accept=".json,application/json"
          disabled={previewOnly}
          onChange={event=>{const file=event.target.files?.[0];if(file)void importFile(file);}}/>
      </label>
      <button className="pdk-u-btn" type="button"
        disabled={!usable} onClick={()=>{onReportLoaded(null);setError("");}}>
        <RefreshCw size={15}/> Önizlemeyi temizle
      </button>
    </div>
    {error&&<p role="alert" className="pdk-u-live-note is-alert"><AlertTriangle size={15}/>{error}</p>}
    {!usable?<div className="pdk-u-live-empty">
      {previewOnly?"Studio tasarım önizlemesinde gerçek terminal veya TNF raporu yüklenmez.":
        "Aktarım bekleyen kaydı göstermek için Windows'ta oluşturulan tanı raporunu seçin. Bu ekran veri yüklemez veya aktarım başlatmaz."}
    </div>:<>
      <div className="pdk-u-transfer-metrics">
        {metric("Okunan yerel kayıt",report.inspected)}
        {metric("TNF referansı eşleşen",report.matched)}
        {metric("TNF'de bulunamayan",report.unmatched,report.unmatched>0)}
        {metric("Çakışan / mükerrer",report.ambiguous,report.ambiguous>0)}
        {metric("Reddedilen kanıt",report.invalid,report.invalid>0)}
        {metric("Kimliği belirsiz USB",report.unsigned,report.unsigned>0)}
      </div>
      <div className="pdk-u-transfer-review">
        <div><ShieldCheck size={18}/><strong>Gerçek aktarım onayı verilmedi</strong>
          <span>Fiziksel terminal, Firebird, yıllık TNF ve Cloud onayları eksik.</span></div>
        <span className="pdk-u-transfer-review-status">{needsAttention>0?
          needsAttention+" inceleme konusu":"Kaynak sertifikası gerekiyor"}</span>
      </div>
      <div className="pdk-u-transfer-toolbar">
        <label><input type="checkbox" checked={issuesOnly}
          onChange={event=>setIssuesOnly(event.target.checked)}/> Sadece sorunlu günler</label>
        <span>Terminal: {report.terminalId} · {batches.length} gün</span>
        <button className="pdk-u-btn" type="button" disabled={!batches.length}
          onClick={exportSummary}><Download size={14}/> Önizlemeyi CSV al</button>
      </div>
      {batches.length>0?<div className="pdk-u-table-scroll" tabIndex={0}
        role="region" aria-label="Terminal günlük aktarım önizlemesi">
        <table className="pdk-u-table"><thead><tr>{hdr.map(h=><th key={h}>{h}</th>)}</tr></thead>
        <tbody>{batches.map(b=><tr key={b.date}>
          {hdr.map(h=><td key={h}>{formatRow(b)[h]}</td>)}
        </tr>)}</tbody></table>
      </div>:<div className="pdk-u-live-empty">
        {report.dailyBatches.length===0?
          "Bu eski raporda gün bazlı ayrıntı yok. Yeni tanı aracıyla raporu tekrar oluşturun.":
          "Seçilen filtrede gün bulunamadı."}
      </div>}
      <div className="pdk-u-transfer-state">
        {tabId==="tnf"?<Archive size={16}/>:tabId==="incidents"?
          <FileWarning size={16}/>:tabId==="reconciliation"?<FileCheck2 size={16}/>:<UploadCloud size={16}/>}
        <span>{tabId==="tnf"?
          "Bu bir TNF referans okumasıdır; TNF'ye hiçbir satır eklenmez.":
          tabId==="reconciliation"?
          "FDB mutabakatı ayrıca yapılmadı; TNF satırında giriş/çıkış yönü bulunmaz.":
          tabId==="incidents"?
          "Günlük HMAC, yön veya zaman kaynak hataları yalnız yerel operatör tarafından çözülebilir.":
          "İnceleme kuyruğu: terminal RAW → personel/kart → Firebird → TNF → Cloud onayı tamamlanmadı."}
        </span>
      </div>
    </>}
  </section>;
}
