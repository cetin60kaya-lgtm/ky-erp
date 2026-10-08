import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getPdksAttendance, getPdksPeople } from "../../services/pdksApi";
import "./PdksReportCenter.css";

const MONTHS=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const NOW=new Date();
const num=(v)=>Number.isFinite(Number(v))?Number(v):0;
const safe=(v)=>Array.isArray(v)?v:[];
const csvCell=(v)=>{const raw=String(v??"");return /[;"\r\n]/.test(raw)?`"${raw.replace(/"/g,'""')}"`:raw};
function downloadCsv(name,rows){const body=rows.map(row=>row.map(csvCell).join(";")).join("\r\n");const blob=new Blob(["\ufeff",body],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
const trStatus=(v)=>({CALISTI:"Çalıştı",EKSIK_BASIM:"Eksik Basım",KART_YOK:"Kart Yok",YILLIK_IZIN:"Yıllık İzin",YARIM_GUN_IZIN:"Yarım Gün İzin",IZIN:"İzin",RAPOR:"Rapor",UCRETSIZ:"Ücretsiz İzin",RESMI_TATIL:"Resmî Tatil",RESMI_TATIL_CALISMA:"Resmî Tatil Çalışma",YARIM_GUN_TATIL:"Yarım Gün Tatil",YARIM_GUN_TATIL_CALISMA:"Yarım Gün Tatil Çalışma",HAFTA_TATILI:"Hafta Tatili",HAFTA_TATILI_CALISMA:"Hafta Tatili Çalışma",DONEM_DISI:"Dönem Dışı"})[String(v||"").toUpperCase()]||String(v||"-");

export default function PdksReportCenter(){
  const [year,setYear]=useState(NOW.getFullYear()),[month,setMonth]=useState(NOW.getMonth()+1),[people,setPeople]=useState([]),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[filter,setFilter]=useState("TUM"),[query,setQuery]=useState(""),[expanded,setExpanded]=useState("");

  const load=useCallback(async()=>{setBusy(true);setError("");try{const personRows=await getPdksPeople({year,month});const list=safe(personRows);setPeople(list);const output=[];for(let i=0;i<list.length;i+=5){const batch=list.slice(i,i+5);const results=await Promise.all(batch.map(async person=>{try{return {person,data:await getPdksAttendance(person.id,year,month)}}catch{return {person,data:null}}}));results.forEach(({person,data})=>{const summary=data?.summary||{};output.push({id:person.id,personnelCode:person.personnelCode||person.code||"",fullName:person.fullName,department:person.department||"",cardNo:person.cardNo||"",schedule:data?.schedule?.groupName||"",workedDays:num(summary.workedDays),workedMinutes:num(summary.workedMinutes),annualLeaveDays:num(summary.annualLeaveDays),missingPunchDays:num(summary.missingPunchDays),noPunchDays:num(summary.noPunchDays),lateDays:num(summary.lateDays),lateMinutes:num(summary.lateMinutes),earlyMinutes:num(summary.earlyMinutes),overtimeMinutes:num(summary.overtimeMinutes),duplicatePunches:num(summary.duplicatePunches),days:safe(data?.days)})})}setRows(output)}catch(cause){setError(cause?.message||"Puantaj raporu hazırlanamadı.")}finally{setBusy(false)}},[month,year]);
  useEffect(()=>{load()},[load]);

  const totals=useMemo(()=>rows.reduce((a,r)=>{a.worked+=r.workedDays;a.leave+=r.annualLeaveDays;a.missing+=r.missingPunchDays+r.noPunchDays;a.late+=r.lateMinutes;a.early+=r.earlyMinutes;a.overtime+=r.overtimeMinutes;a.duplicates+=r.duplicatePunches;return a},{worked:0,leave:0,missing:0,late:0,early:0,overtime:0,duplicates:0}),[rows]);
  const filtered=useMemo(()=>{const q=query.trim().toLocaleUpperCase("tr-TR");return rows.filter(row=>{if(q&&!`${row.personnelCode} ${row.fullName} ${row.department} ${row.cardNo}`.toLocaleUpperCase("tr-TR").includes(q))return false;if(filter==="EKSIK")return row.missingPunchDays+row.noPunchDays>0;if(filter==="GEC")return row.lateMinutes>0;if(filter==="MESAI")return row.overtimeMinutes>0;if(filter==="IZIN")return row.annualLeaveDays>0;if(filter==="TEKRAR")return row.duplicatePunches>0;return true})},[filter,query,rows]);

  const exceptions=useMemo(()=>rows.flatMap(row=>row.days.filter(day=>day.lateMinutes>0||day.earlyMinutes>0||day.missingPunch||day.duplicatePunches>0||["KART_YOK","RESMI_TATIL_CALISMA","HAFTA_TATILI_CALISMA","YARIM_GUN_TATIL_CALISMA"].includes(day.status)).map(day=>({...day,employeeId:row.id,fullName:row.fullName,personnelCode:row.personnelCode,department:row.department}))).sort((a,b)=>b.date.localeCompare(a.date)),[rows]);

  const exportSummary=()=>downloadCsv(`PDKS_PUANTAJ_${year}_${String(month).padStart(2,"0")}.csv`,[["Kod","Personel","Bölüm","Kart","Vardiya","Çalışılan Gün","Çalışma Saat","Yıllık İzin","Eksik Basım","Kart Yok","Geç Dk","Erken Dk","Fazla Mesai Dk","Tekrar Basım"],...filtered.map(r=>[r.personnelCode,r.fullName,r.department,r.cardNo,r.schedule,r.workedDays,(r.workedMinutes/60).toFixed(2),r.annualLeaveDays,r.missingPunchDays,r.noPunchDays,r.lateMinutes,r.earlyMinutes,r.overtimeMinutes,r.duplicatePunches])]);
  const exportDetail=()=>downloadCsv(`PDKS_ISTISNA_${year}_${String(month).padStart(2,"0")}.csv`,[["Tarih","Kod","Personel","Bölüm","Durum","Giriş","Çıkış","Geç Dk","Erken Dk","Mesai Dk","Basım","Tekrar","Not"],...exceptions.map(r=>[r.date,r.personnelCode,r.fullName,r.department,trStatus(r.status),r.entry,r.exit,r.lateMinutes,r.earlyMinutes,r.overtimeMinutes,r.eventCount,r.duplicatePunches,r.note])]);

  return <div className="prp-page">
    <header className="prp-head"><div><small>PDKS / RAPOR & ANALİZ</small><h1>Puantaj Analiz Merkezi</h1><p>Çalışma, geç/erken, eksik basım, fazla mesai, izin ve tatil çalışmaları modern PDKS motorundan hesaplanır.</p></div><div className="prp-period"><select value={month} onChange={e=>setMonth(Number(e.target.value))}>{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select><input type="number" value={year} min="2020" max="2100" onChange={e=>setYear(Number(e.target.value)||NOW.getFullYear())}/><button onClick={load} disabled={busy}>{busy?"Hesaplanıyor":"Yenile"}</button></div></header>
    {error?<div className="prp-error">{error}</div>:null}
    <section className="prp-stats"><div><span>Personel</span><b>{people.length}</b><small>İK ana kaynak</small></div><div><span>Çalışılan Gün</span><b>{totals.worked}</b><small>Aylık toplam</small></div><div><span>Kontrol Gereken</span><b>{totals.missing}</b><small>Eksik + kart yok</small></div><div><span>Geç Kalma</span><b>{totals.late}</b><small>dakika</small></div><div><span>Fazla Mesai</span><b>{(totals.overtime/60).toLocaleString("tr-TR",{maximumFractionDigits:1})}</b><small>saat</small></div><div><span>Yıllık İzin</span><b>{totals.leave}</b><small>gün</small></div></section>

    <section className="prp-card">
      <div className="prp-toolbar">
        <div className="prp-filters" role="group" aria-label="Rapor filtresi">{[["TUM","Tümü"],["EKSIK","Eksik Kart"],["GEC","Geç Giriş"],["MESAI","Mesai"],["IZIN","İzin"],["TEKRAR","Mükerrer"]].map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} className={filter===key?"active":""} onClick={()=>setFilter(key)}>{label}</button>)}</div>
        <div className="prp-search-actions"><input type="search" aria-label="Personel ara" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Kart no veya ad soyad..."/><button type="button" onClick={exportSummary}>Excel / CSV</button></div>
      </div>
      <div className="prp-table-scroll">
        <table className="prp-report-table">
          <thead><tr><th>Kart</th><th>Personel</th><th>Çalışılan</th><th>İzin</th><th>Eksik Kart</th><th>Mesai</th><th>İşlem</th></tr></thead>
          <tbody>{filtered.map(row=><React.Fragment key={row.id}>
            <tr>
              <td className="prp-mono">{row.cardNo||row.personnelCode||"—"}</td>
              <td><strong>{row.fullName}</strong><small>{row.department||"Bölüm yok"}</small></td>
              <td>{row.workedDays} gün</td>
              <td>{row.annualLeaveDays} gün</td>
              <td><span className={row.missingPunchDays+row.noPunchDays?"prp-pill alert":"prp-pill"}>{row.missingPunchDays+row.noPunchDays}</span></td>
              <td>{(row.overtimeMinutes/60).toLocaleString("tr-TR",{maximumFractionDigits:1})} sa</td>
              <td><button type="button" aria-expanded={expanded===row.id} className="prp-detail-toggle" onClick={()=>setExpanded(expanded===row.id?"":row.id)}>{expanded===row.id?"Kapat":"Detay"}</button></td>
            </tr>
            {expanded===row.id?<tr className="prp-expanded"><td colSpan={7}><div className="prp-detail-grid">
              <div><span>Çalışma Grubu</span><strong>{row.schedule||"—"}</strong></div>
              <div><span>Geç Giriş</span><strong>{row.lateMinutes} dk</strong></div>
              <div><span>Erken Çıkış</span><strong>{row.earlyMinutes} dk</strong></div>
              <div><span>Kart Tekrarı</span><strong>{row.duplicatePunches}</strong></div>
              <div><span>Eksik Giriş / Çıkış</span><strong>{row.missingPunchDays}</strong></div>
              <div><span>Kart Yok</span><strong>{row.noPunchDays}</strong></div>
            </div></td></tr>:null}
          </React.Fragment>)}</tbody>
        </table>
        {!filtered.length?<div className="prp-empty">Seçilen filtrede kayıt bulunamadı.</div>:null}
      </div>
    </section>

    <section className="prp-card">
      <div className="prp-card-title"><div><small>GÜN GÜN KONTROL</small><h2>İstisna ve uyarılar</h2></div><button type="button" onClick={exportDetail}>İstisnaları CSV Aktar</button></div>
      <div className="prp-table-scroll">
        <table className="prp-report-table prp-exception-table">
          <thead><tr><th>Tarih</th><th>Personel</th><th>Giriş</th><th>Çıkış</th><th>Durum</th><th>Süre / Uyarı</th><th>Not</th></tr></thead>
          <tbody>{exceptions.slice(0,300).map((row,index)=><tr key={row.employeeId+"-"+row.date+"-"+index}>
            <td className="prp-mono">{row.date}</td>
            <td><strong>{row.fullName}</strong><small>{row.department||"—"}</small></td>
            <td className="prp-mono">{row.entry||"—"}</td>
            <td className="prp-mono">{row.exit||"—"}</td>
            <td><span className="prp-pill alert">{trStatus(row.status)}</span></td>
            <td>{row.lateMinutes?row.lateMinutes+" dk geç":row.earlyMinutes?row.earlyMinutes+" dk erken":row.duplicatePunches?row.duplicatePunches+" tekrar":"Kontrol"}</td>
            <td className="prp-detail-note">{row.note||row.warning||"—"}</td>
          </tr>)}</tbody>
        </table>
        {!exceptions.length?<div className="prp-empty">Bu dönem için kontrol gerektiren kayıt yok.</div>:null}
      </div>
    </section>
  </div>;
}
