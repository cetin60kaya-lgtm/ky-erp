import React,{useEffect,useMemo,useState} from "react";
import {CalendarDays,Download,RefreshCw,Search,ShieldAlert} from "lucide-react";
import {csvForTable} from "./productData.js";

const trToday=()=>new Intl.DateTimeFormat("en-CA",{
  timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",
}).format(new Date());
const earlier=(day,n)=>{
  const d=new Date(day+"T12:00:00Z");
  d.setUTCDate(d.getUTCDate()-n);
  return d.toISOString().slice(0,10);
};
const validDay=(v)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  !Number.isNaN(Date.parse(v+"T12:00:00Z"))&&
  new Date(v+"T12:00:00Z").toISOString().slice(0,10)===v;
const rangeValid=(from,to)=>validDay(from)&&validDay(to)&&
  (Date.parse(to+"T12:00:00Z")-Date.parse(from+"T12:00:00Z"))/86400000>=0&&
  (Date.parse(to+"T12:00:00Z")-Date.parse(from+"T12:00:00Z"))/86400000<=30;
const direct=(v)=>{
  const text=String(v||"").toLocaleUpperCase("tr-TR");
  return ["IN","G","GIRIS","GİRİŞ"].includes(text)?"Giriş":
    ["OUT","C","CIKIS","ÇIKIŞ"].includes(text)?"Çıkış":"Belirsiz";
};
const FIELDS=["Tarih","Kart No","Personel","Saat","Yön","Kaynak","Bölüm","Kanıt ID"];
const rowForExport=(x)=>({
  "Tarih":x.workDate,"Kart No":x.cardNo,"Personel":x.fullName,
  "Saat":x.eventTime,"Yön":direct(x.direction),"Kaynak":x.source,
  "Bölüm":x.department,"Kanıt ID":x.id,
});

export default function CardEventsPanel({company,profileReady,previewOnly=false,
  history=false,search=""}){
  const initial=useMemo(()=>trToday(),[]);
  const [from,setFrom]=useState(()=>history?earlier(initial,6):initial);
  const [to,setTo]=useState(initial);
  const [request,setRequest]=useState(null);
  const [reload,setReload]=useState(0);
  const [rows,setRows]=useState([]);
  const [nextCursor,setNextCursor]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [direction,setDirection]=useState("ALL");
  const allowed=!previewOnly&&Boolean(company)&&profileReady;

  useEffect(()=>{
    if(!allowed){setRows([]);setNextCursor(null);setError("");return undefined;}
    const start=history?earlier(trToday(),6):trToday();
    const end=trToday();
    setFrom(start);setTo(end);
    setRequest({from:start,to:end,cursor:null});
    setRows([]);setNextCursor(null);
  },[allowed,company,history]);
  useEffect(()=>{
    if(!allowed||!request)return undefined;
    let cancelled=false;
    setLoading(true);setError("");
    import("./readService.js").then(service=>
      service.readCardEvents({mainCompanyId:company,from:request.from,to:request.to,
        limit:150,...request.cursor})
    ).then(data=>{
      if(cancelled)return;
      if(!Array.isArray(data?.rows)||typeof data?.hasMore!=="boolean")
        throw new Error("Günlük kart hareketi yanıt biçimi doğrulanamadı.");
      setRows(previous=>request.cursor?[...previous,...data.rows]:data.rows);
      setNextCursor(data.hasMore?data.nextCursor:null);
    }).catch(reason=>{
      if(cancelled)return;
      setError(String(reason?.message||"Kart hareketleri okunamadı."));
      if(!request.cursor){setRows([]);setNextCursor(null);}
    }).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[allowed,company,request,reload]);

  const filtered=useMemo(()=>{
    const q=String(search).trim().toLocaleLowerCase("tr-TR");
    return rows.filter(x=>(direction==="ALL"||
      (direction==="UNKNOWN"?direct(x.direction)==="Belirsiz":
        direct(x.direction)===(direction==="IN"?"Giriş":"Çıkış")))&&
      (!q||[x.fullName,x.cardNo,x.department,x.source,x.eventTime,x.workDate]
        .some(value=>String(value||"").toLocaleLowerCase("tr-TR").includes(q))));
  },[rows,direction,search]);
  const canQuery=allowed&&rangeValid(from,to)&&!loading;
  const load=()=>{
    if(!canQuery)return;
    setRequest({from,to,cursor:null});
    setRows([]);setNextCursor(null);setError("");
    setReload(x=>x+1);
  };
  const refresh=()=>{if(!request||loading)return;setRequest({...request,cursor:null});setReload(x=>x+1);};
  const exportCsv=()=>{
    if(!filtered.length||previewOnly)return;
    const csv=csvForTable(FIELDS,filtered.map(rowForExport));
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="KY_PDKS_KART_HAREKETLERI_"+request.from+"_"+request.to+".csv";
    a.click();URL.revokeObjectURL(url);
  };
  return <section className="pdk-u-card-events" aria-label="Gerçek kaynaktan kart hareketi geçmişi">
    <div className="pdk-u-live-head">
      <div><strong>{history?"Kart Devam Geçmişi":"Günlük Kart Hareketleri"}</strong>
        <p>Cloud D1 ham kayıt listesi. Terminal RAW, Firebird ve TNF kanıtı ayrıca doğrulanmalıdır.</p>
      </div>
      <button type="button" className="pdk-u-btn" disabled={!allowed||loading}
        onClick={refresh}><RefreshCw size={15}/> Yenile</button>
    </div>
    <div className="pdk-u-event-filters">
      <label><CalendarDays size={15}/> Başlangıç
        <input aria-label="Kart başlangıç tarihi" type="date" value={from} onChange={e=>setFrom(e.target.value)}
          disabled={!allowed||loading}/></label>
      <label>Bitiş
        <input aria-label="Kart bitiş tarihi" type="date" value={to} onChange={e=>setTo(e.target.value)}
          disabled={!allowed||loading}/></label>
      <button className="pdk-u-btn" type="button" disabled={!canQuery} onClick={load}>
        <Search size={14}/> Listele</button>
      <label>Yön <select aria-label="Kart hareket yönü" value={direction}
        onChange={e=>setDirection(e.target.value)}>
        <option value="ALL">Hepsi</option><option value="IN">Giriş</option>
        <option value="OUT">Çıkış</option><option value="UNKNOWN">Yön belirsiz</option>
      </select></label>
      <span className="pdk-u-spacer"/>
      <button className="pdk-u-btn" type="button" disabled={previewOnly||!filtered.length}
        onClick={exportCsv}><Download size={15}/> CSV</button>
    </div>
    {!rangeValid(from,to)&&<p className="pdk-u-live-note is-alert">
      En fazla 31 günlük geçerli bir tarih aralığı seçin.</p>}
    {error&&<p role="alert" className="pdk-u-live-note is-alert"><ShieldAlert size={16}/>{error}</p>}
    {!allowed?<p className="pdk-u-live-empty">
      {previewOnly?"Tasarım önizlemesinde gerçek kart hareketleri gösterilmez.":
        "Yetkili firma ve PDKS oturumu doğrulanmayı bekliyor."}
    </p>:<>
      <p className="pdk-u-live-note">{loading?"Kart kayıtları okunuyor…":
        String(filtered.length)+" hareket görüntüleniyor"+(nextCursor?" · Sonraki sayfa mevcut":"")+". "}
      </p>
      <div className="pdk-u-table-scroll" tabIndex={0} role="region" aria-label="Kart hareketleri zaman çizelgesi">
        <table className="pdk-u-table"><thead><tr>{FIELDS.map(x=><th key={x}>{x}</th>)}</tr></thead>
          <tbody>{filtered.map(row=><tr key={row.id}>
            {Object.values(rowForExport(row)).map((value,i)=><td key={FIELDS[i]}>{value||"—"}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {!loading&&nextCursor&&<div className="pdk-u-event-more">
        <button className="pdk-u-btn" type="button" onClick={()=>setRequest({
          from:request.from,to:request.to,cursor:nextCursor,
        })}>Sonraki 150 kaydı getir</button></div>}
      <p className="pdk-u-live-note"><ShieldAlert size={15}/>
        Kart yönü AUTO/belirsiz olan kayıt tek başına giriş veya çıkış kabul edilmez.
        Tarihsel kart hareketleri düzeltme yapılmadan, kaynakta olduğu gibi gösterilir.
      </p>
    </>}
  </section>;
}
