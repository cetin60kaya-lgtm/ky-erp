import { useCallback, useEffect, useMemo, useState } from "react";
import { getPdksAttendance, getPdksPeople } from "../../services/pdksApi";
import "./PdksReportCenter.css";

const MONTHS=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const NOW=new Date();
const num=(v)=>Number.isFinite(Number(v))?Number(v):0;
const safe=(v)=>Array.isArray(v)?v:[];
const csvCell=(v)=>{const raw=String(v??"");return /[;"\r\n]/.test(raw)?`"${raw.replace(/"/g,'""')}"`:raw};
function downloadCsv(name,rows){const body=rows.map(row=>row.map(csvCell).join(";")).join("\r\n");const blob=new Blob(["\ufeff",body],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
const trStatus=(v)=>({CALISTI:"Çalıştı",EKSIK_BASIM:"Eksik Basım",KART_YOK:"Kart Yok",YILLIK_IZIN:"Yıllık İzin",YARIM_GUN_IZIN:"Yarım Gün İzin",IZIN:"İzin",RAPOR:"Rapor",UCRETSIZ:"Ücretsiz İzin",RESMI_TATIL:"Resmî Tatil",RESMI_TATIL_CALISMA:"Resmî Tatil Çalışma",YARIM_GUN_TATIL:"Yarım Gün Tatil",YARIM_GUN_TATIL_CALISMA:"Yarım Gün Tatil Çalışma",HAFTA_TATILI:"Hafta Tatili",HAFTA_TATILI_CALISMA:"Hafta Tatili Çalışma",DONEM_DISI:"Dönem Dışı"})[String(v||"").toUpperCase()]||String(v||"-");

export default function PdksReportCenter({activeMainCompany,activeTab="raporlar"}){
  const company=activeMainCompany?.slug||activeMainCompany?.id||"mecit-hakan";
  const [year,setYear]=useState(NOW.getFullYear()),[month,setMonth]=useState(NOW.getMonth()+1),[people,setPeople]=useState([]),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[filter,setFilter]=useState("TUM"),[query,setQuery]=useState("");
  const [annualRows,setAnnualRows]=useState([]),[annualSummary,setAnnualSummary]=useState([]),[annualProgress,setAnnualProgress]=useState(""),[annualBusy,setAnnualBusy]=useState(false);

  const load=useCallback(async()=>{setBusy(true);setError("");try{const personRows=await getPdksPeople({mainCompanyId:company,year,month});const list=safe(personRows);setPeople(list);const output=[];for(let i=0;i<list.length;i+=5){const batch=list.slice(i,i+5);const results=await Promise.all(batch.map(async person=>{try{return {person,data:await getPdksAttendance(person.id,year,month,{mainCompanyId:company})}}catch{return {person,data:null}}}));results.forEach(({person,data})=>{const summary=data?.summary||{};output.push({id:person.id,personnelCode:person.personnelCode||person.code||"",fullName:person.fullName,department:person.department||"",cardNo:person.cardNo||"",schedule:data?.schedule?.groupName||"",workedDays:num(summary.workedDays),workedMinutes:num(summary.workedMinutes),annualLeaveDays:num(summary.annualLeaveDays),missingPunchDays:num(summary.missingPunchDays),noPunchDays:num(summary.noPunchDays),lateDays:num(summary.lateDays),lateMinutes:num(summary.lateMinutes),earlyMinutes:num(summary.earlyMinutes),overtimeMinutes:num(summary.overtimeMinutes),duplicatePunches:num(summary.duplicatePunches),days:safe(data?.days)})})}setRows(output)}catch(cause){setError(cause?.message||"Puantaj raporu hazırlanamadı.")}finally{setBusy(false)}},[company,month,year]);
  useEffect(()=>{load()},[load]);

  const totals=useMemo(()=>rows.reduce((a,r)=>{a.worked+=r.workedDays;a.leave+=r.annualLeaveDays;a.missing+=r.missingPunchDays+r.noPunchDays;a.late+=r.lateMinutes;a.early+=r.earlyMinutes;a.overtime+=r.overtimeMinutes;a.duplicates+=r.duplicatePunches;return a},{worked:0,leave:0,missing:0,late:0,early:0,overtime:0,duplicates:0}),[rows]);
  const filtered=useMemo(()=>{const q=query.trim().toLocaleUpperCase("tr-TR");return rows.filter(row=>{if(q&&!`${row.personnelCode} ${row.fullName} ${row.department} ${row.cardNo}`.toLocaleUpperCase("tr-TR").includes(q))return false;if(filter==="EKSIK")return row.missingPunchDays+row.noPunchDays>0;if(filter==="GEC")return row.lateMinutes>0;if(filter==="MESAI")return row.overtimeMinutes>0;if(filter==="IZIN")return row.annualLeaveDays>0;if(filter==="TEKRAR")return row.duplicatePunches>0;return true})},[filter,query,rows]);

  const exceptions=useMemo(()=>rows.flatMap(row=>row.days.filter(day=>day.lateMinutes>0||day.earlyMinutes>0||day.missingPunch||day.duplicatePunches>0||["KART_YOK","RESMI_TATIL_CALISMA","HAFTA_TATILI_CALISMA","YARIM_GUN_TATIL_CALISMA"].includes(day.status)).map(day=>({...day,employeeId:row.id,fullName:row.fullName,personnelCode:row.personnelCode,department:row.department}))).sort((a,b)=>b.date.localeCompare(a.date)),[rows]);

  const buildAnnualAudit=async()=>{
    if(annualBusy)return;
    setAnnualBusy(true);setError("");setAnnualProgress("Yıllık denetim hazırlanıyor...");setAnnualRows([]);setAnnualSummary([]);
    try{
      const detail=[];
      const personTotals=new Map();
      for(let m=1;m<=12;m+=1){
        setAnnualProgress(MONTHS[m-1]+" "+year+" hesaplanıyor · "+m+"/12");
        const monthPeople=safe(await getPdksPeople({mainCompanyId:company,year,month:m}));
        for(let i=0;i<monthPeople.length;i+=4){
          const batch=monthPeople.slice(i,i+4);
          const results=await Promise.all(batch.map(async person=>{
            try{return {person,data:await getPdksAttendance(person.id,year,m,{mainCompanyId:company})}}
            catch{return {person,data:null}}
          }));
          results.forEach(({person,data})=>{
            const code=person.personnelCode||person.code||"";
            const key=person.id||code||person.fullName;
            const current=personTotals.get(key)||{id:key,personnelCode:code,fullName:person.fullName,department:person.department||"",cardNo:person.cardNo||"",workedDays:0,annualLeaveDays:0,missingDays:0,lateMinutes:0,earlyMinutes:0,overtimeMinutes:0,eventCount:0};
            const summary=data?.summary||{};
            current.workedDays+=num(summary.workedDays);
            current.annualLeaveDays+=num(summary.annualLeaveDays);
            current.missingDays+=num(summary.missingPunchDays)+num(summary.noPunchDays);
            current.lateMinutes+=num(summary.lateMinutes);
            current.earlyMinutes+=num(summary.earlyMinutes);
            current.overtimeMinutes+=num(summary.overtimeMinutes);
            safe(data?.days).forEach(day=>{
              current.eventCount+=num(day.eventCount);
              detail.push({
                employeeId:key,personnelCode:code,fullName:person.fullName,department:person.department||"",cardNo:person.cardNo||"",
                month:m,date:day.date,status:day.status,entry:day.entry||"",exit:day.exit||"",lateMinutes:num(day.lateMinutes),
                earlyMinutes:num(day.earlyMinutes),overtimeMinutes:num(day.overtimeMinutes),eventCount:num(day.eventCount),
                duplicatePunches:num(day.duplicatePunches),note:day.note||"",
              });
            });
            personTotals.set(key,current);
          });
        }
      }
      setAnnualRows(detail);
      setAnnualSummary([...personTotals.values()].sort((a,b)=>String(a.fullName||"").localeCompare(String(b.fullName||""),"tr")));
      setAnnualProgress(year+" yıllık denetim hazır · "+personTotals.size+" personel · "+detail.length+" günlük satır");
    }catch(cause){
      setError(cause?.message||"Yıllık TEMP hazırlanamadı.");
      setAnnualProgress("");
    }finally{setAnnualBusy(false)}
  };

  const exportAnnual=()=>downloadCsv(`PDKS_DENETIM_TEMP_${year}.csv`,[
    ["Personel Kodu","Ad Soyad","Kart No","Bölüm","Tarih","Durum","Giriş","Çıkış","Geç Dk","Erken Dk","Fazla Mesai Dk","Basım","Tekrar","Not"],
    ...annualRows.map(r=>[r.personnelCode,r.fullName,r.cardNo,r.department,r.date,trStatus(r.status),r.entry,r.exit,r.lateMinutes,r.earlyMinutes,r.overtimeMinutes,r.eventCount,r.duplicatePunches,r.note])
  ]);

  const exportSummary=()=>downloadCsv(`PDKS_PUANTAJ_${year}_${String(month).padStart(2,"0")}.csv`,[["Kod","Personel","Bölüm","Kart","Vardiya","Çalışılan Gün","Çalışma Saat","Yıllık İzin","Eksik Basım","Kart Yok","Geç Dk","Erken Dk","Fazla Mesai Dk","Tekrar Basım"],...filtered.map(r=>[r.personnelCode,r.fullName,r.department,r.cardNo,r.schedule,r.workedDays,(r.workedMinutes/60).toFixed(2),r.annualLeaveDays,r.missingPunchDays,r.noPunchDays,r.lateMinutes,r.earlyMinutes,r.overtimeMinutes,r.duplicatePunches])]);
  const exportDetail=()=>downloadCsv(`PDKS_ISTISNA_${year}_${String(month).padStart(2,"0")}.csv`,[["Tarih","Kod","Personel","Bölüm","Durum","Giriş","Çıkış","Geç Dk","Erken Dk","Mesai Dk","Basım","Tekrar","Not"],...exceptions.map(r=>[r.date,r.personnelCode,r.fullName,r.department,trStatus(r.status),r.entry,r.exit,r.lateMinutes,r.earlyMinutes,r.overtimeMinutes,r.eventCount,r.duplicatePunches,r.note])]);

  if(activeTab==="denetim-yillik-temp") return <div className="prp-page">
    <header className="prp-head"><div><small>PDKS / RAPOR & DENETİM</small><h1>Yıllık TEMP / Denetim Merkezi</h1><p>Finans alanı içermez. Her ayın görünür kartlı personeli ve gerçek D1 puantaj günleri yıllık denetim çıktısında birleştirilir.</p></div><div className="prp-period"><input type="number" value={year} min="2020" max="2100" onChange={e=>{setYear(Number(e.target.value)||NOW.getFullYear());setAnnualRows([]);setAnnualSummary([]);setAnnualProgress("")}}/><button onClick={buildAnnualAudit} disabled={annualBusy}>{annualBusy?"Hazırlanıyor":"Yıllık TEMP Hazırla"}</button></div></header>
    {error?<div className="prp-error">{error}</div>:null}
    <section className="prp-audit-banner"><div><strong>{year} · Denetim Paketi</strong><span>{annualProgress||"Yıllık veri yalnız istenince hesaplanır; gereksiz D1 okuması yapılmaz."}</span></div><button onClick={exportAnnual} disabled={!annualRows.length||annualBusy}>TEMP / CSV İndir</button></section>
    <section className="prp-stats"><div><span>Personel</span><b>{annualSummary.length}</b><small>Yıl içinde görünen</small></div><div><span>Günlük Satır</span><b>{annualRows.length}</b><small>D1 puantaj günü</small></div><div><span>Çalışılan Gün</span><b>{annualSummary.reduce((s,r)=>s+r.workedDays,0)}</b><small>Yıllık toplam</small></div><div><span>Yıllık İzin</span><b>{annualSummary.reduce((s,r)=>s+r.annualLeaveDays,0)}</b><small>gün</small></div><div><span>Eksik / Kart Yok</span><b>{annualSummary.reduce((s,r)=>s+r.missingDays,0)}</b><small>kontrol</small></div><div><span>Fazla Mesai</span><b>{(annualSummary.reduce((s,r)=>s+r.overtimeMinutes,0)/60).toLocaleString("tr-TR",{maximumFractionDigits:1})}</b><small>saat</small></div></section>
    <section className="prp-card"><div className="prp-card-title"><div><small>YILLIK PERSONEL ÖZETİ</small><h2>Denetim Kontrol Tablosu</h2></div></div><div className="prp-annual-table"><div className="head"><span>Kod</span><span>Personel</span><span>Bölüm</span><span>Çalıştı</span><span>İzin</span><span>Eksik</span><span>Geç</span><span>Erken</span><span>Mesai</span><span>Basım</span></div>{annualSummary.map(r=><div key={r.id}><code>{r.personnelCode}</code><strong>{r.fullName}<small>{r.cardNo||"Kart yok"}</small></strong><span>{r.department||"-"}</span><b>{r.workedDays}</b><b>{r.annualLeaveDays}</b><em className={r.missingDays?"bad":""}>{r.missingDays}</em><span>{r.lateMinutes}</span><span>{r.earlyMinutes}</span><span>{(r.overtimeMinutes/60).toLocaleString("tr-TR",{maximumFractionDigits:1})} sa</span><span>{r.eventCount}</span></div>)}{!annualSummary.length?<div className="prp-empty">Yılı seçip “Yıllık TEMP Hazırla” düğmesine basın.</div>:null}</div></section>
  </div>;

  return <div className="prp-page">
    <header className="prp-head"><div><small>PDKS / RAPOR & ANALİZ</small><h1>Puantaj Analiz Merkezi</h1><p>Çalışma, geç/erken, eksik basım, fazla mesai, izin ve tatil çalışmaları modern PDKS motorundan hesaplanır.</p></div><div className="prp-period"><select value={month} onChange={e=>setMonth(Number(e.target.value))}>{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select><input type="number" value={year} min="2020" max="2100" onChange={e=>setYear(Number(e.target.value)||NOW.getFullYear())}/><button onClick={load} disabled={busy}>{busy?"Hesaplanıyor":"Yenile"}</button></div></header>
    {error?<div className="prp-error">{error}</div>:null}
    <section className="prp-stats"><div><span>Personel</span><b>{people.length}</b><small>İK ana kaynak</small></div><div><span>Çalışılan Gün</span><b>{totals.worked}</b><small>Aylık toplam</small></div><div><span>Kontrol Gereken</span><b>{totals.missing}</b><small>Eksik + kart yok</small></div><div><span>Geç Kalma</span><b>{totals.late}</b><small>dakika</small></div><div><span>Fazla Mesai</span><b>{(totals.overtime/60).toLocaleString("tr-TR",{maximumFractionDigits:1})}</b><small>saat</small></div><div><span>Yıllık İzin</span><b>{totals.leave}</b><small>gün</small></div></section>

    <section className="prp-card"><div className="prp-toolbar"><div className="prp-filters">{[["TUM","Tümü"],["EKSIK","Eksik/Kart Yok"],["GEC","Geç Kalan"],["MESAI","Fazla Mesai"],["IZIN","Yıllık İzin"],["TEKRAR","Tekrar Basım"]].map(([key,label])=><button key={key} className={filter===key?"active":""} onClick={()=>setFilter(key)}>{label}</button>)}</div><div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Personel / bölüm / kart ara"/><button onClick={exportSummary}>Excel/CSV Özet</button></div></div>
      <div className="prp-table"><div className="head"><span>Kod</span><span>Personel</span><span>Bölüm</span><span>Vardiya</span><span>Çalıştı</span><span>İzin</span><span>Eksik</span><span>Geç</span><span>Erken</span><span>Fazla Mesai</span></div>{filtered.map(row=><div key={row.id}><code>{row.personnelCode}</code><strong>{row.fullName}<small>{row.cardNo||"Kart yok"}</small></strong><span>{row.department||"-"}</span><span>{row.schedule||"-"}</span><b>{row.workedDays}</b><b>{row.annualLeaveDays}</b><em className={row.missingPunchDays+row.noPunchDays?"bad":""}>{row.missingPunchDays+row.noPunchDays}</em><em className={row.lateMinutes?"warn":""}>{row.lateMinutes} dk</em><span>{row.earlyMinutes} dk</span><span>{(row.overtimeMinutes/60).toLocaleString("tr-TR",{maximumFractionDigits:1})} sa</span></div>)}{!filtered.length?<div className="prp-empty">Filtreye uygun personel yok.</div>:null}</div>
    </section>

    <section className="prp-card"><div className="prp-card-title"><div><small>İSTİSNA TAKİBİ</small><h2>Kontrol Gerektiren Günler</h2></div><button onClick={exportDetail}>İstisna CSV</button></div><div className="prp-exceptions"><div className="head"><span>Tarih</span><span>Personel</span><span>Durum</span><span>Giriş</span><span>Çıkış</span><span>Geç</span><span>Erken</span><span>Mesai</span><span>Basım</span><span>Not</span></div>{exceptions.slice(0,300).map((row,index)=><div key={`${row.employeeId}-${row.date}-${index}`}><span>{row.date}</span><strong>{row.fullName}<small>{row.department}</small></strong><em>{trStatus(row.status)}</em><b>{row.entry||"-"}</b><b>{row.exit||"-"}</b><span>{row.lateMinutes||0}</span><span>{row.earlyMinutes||0}</span><span>{row.overtimeMinutes||0}</span><span>{row.eventCount||0}{row.duplicatePunches?` / ${row.duplicatePunches} tekrar`:""}</span><span>{row.note||row.warning||"-"}</span></div>)}{!exceptions.length?<div className="prp-empty">Bu dönem için kontrol gerektiren kayıt yok.</div>:null}</div></section>
  </div>;
}
