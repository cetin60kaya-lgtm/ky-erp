import React,{useMemo,useState} from "react";
import {Download,FolderOpen,ShieldAlert,Database} from "lucide-react";
import {evaluateAttendanceEvidenceBundle} from "../../../../../pdks-unified/core/attendanceEvidenceBundle.mjs";
import {csvForTable} from "./productData.js";

const two=n=>String(n).padStart(2,"0");
const words={
  D1_EVIDENCE_PAIR_COMPLETE:"Kaynak çiftleri eşleşti · yerel inceleme",
  SOURCE_EVIDENCE_MISMATCH:"RAW / Firebird / TNF uyuşmuyor",
  MISSING_OR_CONFLICTING_EVIDENCE:"Eksik veya çelişkili hareket",
  PUNCH_DIRECTION_REVIEW:"Yön incelemesi gerekli",
  APPROVED_LEAVE:"Kaynakta onaylı izin",
  OFFICIAL_HOLIDAY:"Resmî tatil",
  HALF_DAY_OFF:"Yarım gün tatil",
  HALF_DAY_DECISION_REQUIRED:"Yarım gün çalışma kararı eksik",
  WEEKLY_REST:"Haftalık tatil",
  OUTSIDE_EMPLOYMENT:"İstihdam dönemi dışında",
  SHIFT_ASSIGNMENT_UNCERTAIN:"Çift vardiya eşleşmesi belirsiz",
  NO_APPROVED_SHIFT:"Atanmış vardiya yok",
  PUNCH_EXEMPT:"Kart okutma muafiyeti",
};
function localCsv(columns,rows,name){
  const csv=csvForTable(columns,rows);
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const element=document.createElement("a");
  element.href=url;element.download=name;element.click();
  URL.revokeObjectURL(url);
}
export default function EvidencePuantajPanel({
  company,year,month,tabId,previewOnly=false,testMode=false,audit=false,
  profileReady=false,
}){
  const [result,setResult]=useState(null);
  const [error,setError]=useState("");
  const [selectedDate,setSelectedDate]=useState("");
  const [cardFilter,setCardFilter]=useState("");
  const [loading,setLoading]=useState(false);
  const selectedPeriod=String(year)+"-"+two(month);
  const canLoad=(!previewOnly||testMode)&&!audit&&
    (testMode||Boolean(company&&profileReady));
  const load=async file=>{
    if(!file||!canLoad)return;
    setLoading(true);setError("");
    try{
      if(file.size<20||file.size>8_000_000)throw Error("KANIT_DOSYASI_BOYUT_GECERSIZ");
      const parsed=evaluateAttendanceEvidenceBundle(await file.text(),{
        companyId:company||null,period:selectedPeriod,
      });
      setResult(parsed);setSelectedDate("");setCardFilter("");
    }catch(e){setResult(null);setError(String(e?.message||"Kanıt dosyası doğrulanamadı"));}
    finally{setLoading(false);}
  };
  const monthly=tabId==="monthly"||tabId==="timesheets";
  const days=useMemo(()=>result?.days.filter(row=>
    (!selectedDate||row.date===selectedDate)&&
    (!cardFilter||row.cardNo===cardFilter))||[],[result,selectedDate,cardFilter]);
  const months=useMemo(()=>result?.monthly.filter(row=>
    !cardFilter||row.cardNo===cardFilter)||[],[result,cardFilter]);
  const columns=monthly?
    ["Kart No","Personel","Kapsanan Gün","Eksik Takvim Günü","Eşleşen Gün",
      "İnceleme Günü","İzin","Tatil","Çift Vardiya","Eşleşen Süre (dk)","Bordro"]:
    ["Tarih","Kart No","Personel","RAW","FDB","TNF","E","Süre (dk)",
      "Kanıt Eşleşmesi","Durum","Uyarılar"];
  const viewRows=monthly?months.map(row=>({
    "Kart No":row.cardNo,"Personel":row.fullName,
    "Kapsanan Gün":row.coveredDays,"Eksik Takvim Günü":row.missingCalendarDays,
    "Eşleşen Gün":row.pairedDays,"İnceleme Günü":row.reviewDays,
    "İzin":row.approvedLeaveDays,"Tatil":row.holidayDays,
    "Çift Vardiya":row.doubleShiftDays,"Eşleşen Süre (dk)":row.matchedReviewMinutes,
    "Bordro":"Onaysız",
  })):days.map(row=>({
    "Tarih":row.date,"Kart No":row.cardNo,"Personel":row.fullName,
    "RAW":row.rawCount,"FDB":row.fdbCount,"TNF":row.tnfCount,
    "E":row.eCount,"Süre (dk)":row.reviewMinutes??"—",
    "Kanıt Eşleşmesi":row.matchedSources?"Eşleşti":"İnceleme",
    "Durum":words[row.status]||row.status,
    "Uyarılar":row.warnings.join(", ")||"—",
  }));
  return <section className="pdk-u-panel" aria-label="RAW Firebird TNF kanıtlı puantaj incelemesi">
    <div className="pdk-u-record-head"><div>
      <h2><Database size={17}/> Günlük / Aylık Puantaj · Kaynak Mutabakatı</h2>
      <p>Gerçek cihaz RAW, izole Firebird GIRCIK, yıllık TNF, E onay referansları,
        vardiya, izin ve tatil kayıtlarının yerel, salt okunur karşılaştırması.</p>
    </div><span className="pdk-u-chip">Bordro onayı değildir</span></div>
    <p className="pdk-u-live-note"><ShieldAlert size={16}/>
      Yüklenen kanıt dosyasının kaynağı uygulama tarafından bağımsız doğrulanamaz.
      Uyuşan kayıt yalnız inceleme dakikasıdır; canlı terminal, FDB/TNF yazımı,
      kesin devam veya maaş tahakkuku oluşturmaz. Dosya sunucuya gönderilmez.</p>
    <div className="pdk-u-stage-import">
      <label><FolderOpen size={15}/> Puantaj kanıt paketi (.json)
        <input type="file" accept=".json,application/json" disabled={!canLoad||loading}
          aria-label="Puantaj RAW Firebird TNF kanıt dosyasını aç"
          onChange={event=>{const file=event.target.files?.[0];if(file)void load(file);
            event.target.value="";}}/>
      </label>
      <span>Dönem: {selectedPeriod} · Firma: {company||"Yerel test"} · Bellekte açılır</span>
      {result&&<button type="button" className="pdk-u-btn" onClick={()=>{
        setResult(null);setError("");setCardFilter("");setSelectedDate("");
      }}>Kanıtları kapat</button>}
    </div>
    {!canLoad&&<p role="status">Firma oturumu veya yetki doğrulanmadan kanıt dosyası açılamaz.</p>}
    {error&&<p role="alert" className="pdk-u-live-note is-alert">
      Kaynak paketi reddedildi: {error}</p>}
    {result&&<>
      <div className="pdk-u-stage-facts">
        <span><b>{result.days.length}</b> kişi × gün</span>
        <span><b>{result.days.filter(d=>d.paired).length}</b> eşleşen çift günü</span>
        <span><b>{result.days.filter(d=>!d.matchedSources).length}</b> kaynak çelişkisi</span>
        <span><b>{result.monthly.reduce((sum,r)=>sum+r.missingCalendarDays,0)}</b> kapsanmayan takvim günü</span>
      </div>
      <div className="pdk-u-stage-controls">
        <label>Kart <select aria-label="Puantaj kart filtresi" value={cardFilter}
          onChange={e=>setCardFilter(e.target.value)}>
          <option value="">Tümü</option>
          {result.monthly.map(row=><option key={row.cardNo} value={row.cardNo}>
            {row.cardNo} · {row.fullName}</option>)}
        </select></label>
        {!monthly&&<label>Gün <input type="date" aria-label="Puantaj gün filtresi"
          value={selectedDate} min={selectedPeriod+"-01"} max={selectedPeriod+"-31"}
          onChange={e=>setSelectedDate(e.target.value)}/></label>}
        <span>{viewRows.length} satır</span>
        <button type="button" className="pdk-u-btn" disabled={!viewRows.length}
          onClick={()=>localCsv(columns,viewRows,
            "KY_PDKS_KANIT_INCELEME_"+selectedPeriod+".csv")}>
          <Download size={15}/> İnceleme CSV</button>
      </div>
      <div className="pdk-u-table-scroll" role="region" tabIndex={0}
        aria-label="Gerçek kaynak inceleme puantaj tablosu">
        <table className="pdk-u-table"><thead><tr>
          {columns.map(column=><th key={column}>{column}</th>)}
        </tr></thead><tbody>
          {viewRows.slice(0,500).map((row,i)=><tr key={i}>
            {columns.map(column=><td key={column}>{row[column]}</td>)}
          </tr>)}
        </tbody></table>
      </div>
      {viewRows.length>500&&<p className="pdk-u-live-note">İlk 500 satır gösteriliyor; filtre kullanın.</p>}
      <p role="status" className="pdk-u-live-note">
        {result.sourceComparisonComplete?
          "Takvim kapsamı ve dosya içi eşleşmeler tam görünüyor; bağımsız terminal/izin/onay doğrulaması halen eksik.":
          "Eksik gün, karar veya kaynak çelişkisi var. Aylık puantaj kapatılamaz."}
        {" "}Bordro/SGK aktarımı kapalıdır.
      </p>
    </>}
  </section>;
}
