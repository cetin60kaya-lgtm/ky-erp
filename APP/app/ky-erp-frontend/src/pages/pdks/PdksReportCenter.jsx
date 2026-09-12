import { useCallback, useEffect, useMemo, useState } from "react";
import { getPdksAttendance, getPdksPayroll, getPdksPeople } from "../../services/pdksApi";
import "./PdksReportCenter.css";

const MONTHS=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const NOW=new Date();
const num=(v)=>Number.isFinite(Number(v))?Number(v):0;
const money=(v)=>num(v).toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2});
const safe=(v)=>Array.isArray(v)?v:[];
const csvCell=(v)=>{const raw=String(v??"");return /[;"\r\n]/.test(raw)?`"${raw.replace(/"/g,'""')}"`:raw};
function downloadCsv(name,rows){const body=rows.map(row=>row.map(csvCell).join(";")).join("\r\n");const blob=new Blob(["\ufeff",body],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
const trStatus=(v)=>({CALISTI:"Çalıştı",EKSIK_BASIM:"Eksik Basım",KART_YOK:"Kart Yok",YILLIK_IZIN:"Yıllık İzin",YARIM_GUN_IZIN:"Yarım Gün İzin",IZIN:"İzin",RAPOR:"Rapor",UCRETSIZ:"Ücretsiz İzin",RESMI_TATIL:"Resmî Tatil",RESMI_TATIL_CALISMA:"Resmî Tatil Çalışma",YARIM_GUN_TATIL:"Yarım Gün Tatil",YARIM_GUN_TATIL_CALISMA:"Yarım Gün Tatil Çalışma",HAFTA_TATILI:"Hafta Tatili",HAFTA_TATILI_CALISMA:"Hafta Tatili Çalışma",DONEM_DISI:"Dönem Dışı",PLANLI_CALISMA:"Planlı Çalışma",KART_YOK_KONTROL:"Kart Yok · Kontrol",EKSIK_BASIM_KONTROL:"Eksik Basım · Kontrol"})[String(v||"").toUpperCase()]||String(v||"-");

export default function PdksReportCenter({activeMainCompany,activeTab="raporlar",isAuditAccount=false}){
  const company=activeMainCompany?.slug||activeMainCompany?.id||"mecit-hakan";
  const [year,setYear]=useState(NOW.getFullYear()),[month,setMonth]=useState(NOW.getMonth()+1),[people,setPeople]=useState([]),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[filter,setFilter]=useState("TUM"),[query,setQuery]=useState("");
  const [annualRows,setAnnualRows]=useState([]),[annualSummary,setAnnualSummary]=useState([]),[annualProgress,setAnnualProgress]=useState(""),[annualBusy,setAnnualBusy]=useState(false);
  const [payrollLines,setPayrollLines]=useState([]),[selectedPayrollId,setSelectedPayrollId]=useState("");

  const load=useCallback(async()=>{
    setBusy(true);setError("");
    try{
      const [personRows,payrollData]=await Promise.all([
        getPdksPeople({mainCompanyId:company,year,month}),
        isAuditAccount?Promise.resolve({lines:[]}):getPdksPayroll({mainCompanyId:company,year,month}).catch(()=>({lines:[]})),
      ]);
      const list=safe(personRows);setPeople(list);setPayrollLines(safe(payrollData?.lines));
      const output=[];
      for(let i=0;i<list.length;i+=5){
        const batch=list.slice(i,i+5);
        const results=await Promise.all(batch.map(async person=>{try{return {person,data:await getPdksAttendance(person.id,year,month,{mainCompanyId:company})}}catch{return {person,data:null}}}));
        results.forEach(({person,data})=>{const summary=data?.summary||{},schedule=data?.schedule||{};output.push({id:person.id,personnelCode:person.personnelCode||person.code||"",fullName:person.fullName,department:person.department||"",cardNo:person.cardNo||"",schedule:schedule.groupName||"",personnelGroup:schedule.personnelGroup?.name||"",profileName:schedule.profileName||"",profileConfigured:Boolean(summary.profileConfigured),normalCreditMode:summary.normalCreditMode||schedule.normalCreditMode||"UNCONFIGURED",normalTargetMinutes:num(summary.normalTargetMinutes),payableNormalMinutes:num(summary.payableNormalMinutes),normalDeductionMinutes:num(summary.normalDeductionMinutes),dailyReferenceMinutes:num(summary.dailyReferenceMinutes),blockedDays:num(summary.blockedDays),workedDays:num(summary.workedDays),workedMinutes:num(summary.workedMinutes),annualLeaveDays:num(summary.annualLeaveDays),missingPunchDays:num(summary.missingPunchDays),noPunchDays:num(summary.noPunchDays),lateDays:num(summary.lateDays),lateMinutes:num(summary.lateMinutes),earlyMinutes:num(summary.earlyMinutes),overtimeMinutes:num(summary.overtimeMinutes),duplicatePunches:num(summary.duplicatePunches),days:safe(data?.days)})});
      }
      setRows(output);setSelectedPayrollId(current=>safe(payrollData?.lines).some(row=>row.employeeId===current)?current:(safe(payrollData?.lines)[0]?.employeeId||""));
    }catch(cause){setError(cause?.message||"Puantaj raporu hazırlanamadı.")}finally{setBusy(false)}
  },[company,isAuditAccount,month,year]);
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

  const exportSummary=()=>downloadCsv(`PDKS_PUANTAJ_${year}_${String(month).padStart(2,"0")}.csv`,[["Kod","Personel","Bölüm","Kart","Personel Grubu","Vardiya","NÇ Hedef Saat","NÇ Ödenecek Saat","NÇ Kesinti Saat","Fiilî Kart Saat","Yıllık İzin","Eksik Basım","Kart Yok","Geç Dk","Erken Dk","Fazla Mesai Dk","Düzeltme Bekleyen"],...filtered.map(r=>[r.personnelCode,r.fullName,r.department,r.cardNo,r.personnelGroup,r.schedule,(r.normalTargetMinutes/60).toFixed(2),(r.payableNormalMinutes/60).toFixed(2),(r.normalDeductionMinutes/60).toFixed(2),(r.workedMinutes/60).toFixed(2),r.annualLeaveDays,r.missingPunchDays,r.noPunchDays,r.lateMinutes,r.earlyMinutes,r.overtimeMinutes,r.blockedDays])]);
  const exportDetail=()=>downloadCsv(`PDKS_ISTISNA_${year}_${String(month).padStart(2,"0")}.csv`,[["Tarih","Kod","Personel","Bölüm","Durum","Giriş","Çıkış","Geç Dk","Erken Dk","Mesai Dk","Basım","Tekrar","Not"],...exceptions.map(r=>[r.date,r.personnelCode,r.fullName,r.department,trStatus(r.status),r.entry,r.exit,r.lateMinutes,r.earlyMinutes,r.overtimeMinutes,r.eventCount,r.duplicatePunches,r.note])]);

  const payrollRows=useMemo(()=>payrollLines.map(line=>{const att=rows.find(row=>row.id===line.employeeId)||{};const bankPaid=Math.max(0,num(line.bankAmount)),cashPaid=Math.max(0,num(line.cashAmount)),paid=bankPaid+cashPaid;return {...line,personnelGroup:att.personnelGroup||"",profileName:att.profileName||"",profileConfigured:Boolean(att.profileConfigured),normalTargetMinutes:num(att.normalTargetMinutes),payableNormalMinutes:num(att.payableNormalMinutes),normalDeductionMinutes:num(att.normalDeductionMinutes),dailyReferenceMinutes:num(att.dailyReferenceMinutes),blockedDays:num(att.blockedDays),workedDays:num(att.workedDays),actualWorkedMinutes:num(att.workedMinutes),annualLeaveDays:num(att.annualLeaveDays),missingDays:num(att.missingPunchDays)+num(att.noPunchDays),lateMinutes:num(att.lateMinutes),earlyMinutes:num(att.earlyMinutes),overtimeMinutes:num(att.overtimeMinutes),bankPaid,cashPaid,paidAmount:paid,remainingAmount:Math.max(0,num(line.totalAmount)-paid)}}),[payrollLines,rows]);
  const selectedPayroll=payrollRows.find(row=>row.employeeId===selectedPayrollId)||payrollRows[0]||null;
  const payrollTotals=useMemo(()=>payrollRows.reduce((a,r)=>{a.salary+=num(r.salary);a.overtime+=num(r.overtimeAmount);a.advance+=num(r.advanceAmount);a.deduction+=num(r.deductionAmount);a.bank+=num(r.bankAmount);a.cash+=num(r.cashAmount);a.net+=num(r.totalAmount);a.remaining+=num(r.remainingAmount);return a},{salary:0,overtime:0,advance:0,deduction:0,bank:0,cash:0,net:0,remaining:0}),[payrollRows]);
  const targetProfiles=useMemo(()=>{const values=[...new Set(payrollRows.filter(r=>r.profileConfigured&&r.normalTargetMinutes>0).map(r=>r.normalTargetMinutes))];return {values,label:values.length===1?`${(values[0]/60).toLocaleString("tr-TR",{maximumFractionDigits:2})} saat`:values.length>1?"Grup / personele göre":"Profil bekliyor"}},[payrollRows]);
  const dailyProfiles=useMemo(()=>{const values=[...new Set(payrollRows.filter(r=>r.dailyReferenceMinutes>0).map(r=>r.dailyReferenceMinutes))];return values.length===1?`${(values[0]/60).toLocaleString("tr-TR",{maximumFractionDigits:2})} saat`:values.length>1?"Gruba göre":"—"},[payrollRows]);

  const exportPayroll=()=>downloadCsv(`PDKS_BORDRO_ODEME_${year}_${String(month).padStart(2,"0")}.csv`,[["Kod","Personel","Personel Grubu","Maaş","NÇ Hedef Saat","NÇ Ödenecek Saat","NÇ Kesinti Saat","Fiilî Kart Saat","Mesai","Avans","Kesinti","Net","Banka Ödenen","Elden Ödenen","Kalan"],...payrollRows.map(r=>[r.personnelCode,r.fullName,r.personnelGroup,r.salary,(r.normalTargetMinutes/60).toFixed(2),(r.payableNormalMinutes/60).toFixed(2),(r.normalDeductionMinutes/60).toFixed(2),(r.actualWorkedMinutes/60).toFixed(2),r.overtimeAmount,r.advanceAmount,r.deductionAmount,r.totalAmount,r.bankPaid,r.cashPaid,r.remainingAmount])]);

  if(activeTab==="bordro-odeme"){
    if(isAuditAccount)return <div className="prp-page"><div className="prp-error">Denetim hesabında maaş, banka ve elden ödeme bilgileri gösterilmez.</div></div>;
    return <div className="prp-page payroll-view">
      <header className="prp-head"><div><small>PDKS / BORDRO BAĞLANTISI</small><h1>Bordro / Ödeme Özeti</h1><p>İK ana kaynağındaki maaş, banka ve elden ödeme ile PDKS devam sonucu birlikte gösterilir. PDKS bu finans verisini değiştirmez.</p></div><div className="prp-period"><select value={month} onChange={e=>setMonth(Number(e.target.value))}>{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select><input type="number" value={year} min="2020" max="2100" onChange={e=>setYear(Number(e.target.value)||NOW.getFullYear())}/><button onClick={load} disabled={busy}>Yenile</button><button onClick={exportPayroll}>Excel/CSV</button><button onClick={()=>window.print()}>Yazdır / PDF</button></div></header>
      {error?<div className="prp-error">{error}</div>:null}
      <section className="prp-stats"><div><span>Net Ödenecek</span><b>{money(payrollTotals.net)} ₺</b><small>İK / bordro</small></div><div><span>Banka Ödenen</span><b>{money(payrollTotals.bank)} ₺</b><small>ödeme · kesinti değil</small></div><div><span>Elden Ödenen</span><b>{money(payrollTotals.cash)} ₺</b><small>ödeme</small></div><div><span>Kalan</span><b>{money(payrollTotals.remaining)} ₺</b><small>net − banka − elden</small></div><div><span>NÇ Aylık Hedef</span><b>{targetProfiles.label}</b><small>firma / grup profili</small></div><div><span>Günlük NÇ Referansı</span><b>{dailyProfiles}</b><small>seçili profile göre</small></div></section>
      <section className="prp-card"><div className="prp-card-title"><div><small>GENEL MAAŞ / ÖDEME</small><h2>{MONTHS[month-1]} {year}</h2></div><b>{payrollRows.length} personel</b></div><div className="prp-payroll-table"><div className="head"><span>Kod</span><span>Personel</span><span>Maaş</span><span>NÇ Hedef</span><span>Fiilî</span><span>Mesai</span><span>Kesinti</span><span>Avans</span><span>Net</span><span>Banka</span><span>Elden</span><span>Kalan</span></div>{payrollRows.map(row=><button type="button" key={row.employeeId} className={selectedPayroll?.employeeId===row.employeeId?"active":""} onClick={()=>setSelectedPayrollId(row.employeeId)}><code>{row.personnelCode}</code><strong>{row.fullName}<small>{row.workedDays} gün · eksik {row.missingDays}</small></strong><span>{money(row.salary)}</span><b>{row.profileConfigured?(row.normalTargetMinutes/60).toLocaleString("tr-TR",{maximumFractionDigits:2}):"—"}</b><span>{(row.actualWorkedMinutes/60).toLocaleString("tr-TR",{maximumFractionDigits:1})}</span><span>{money(row.overtimeAmount)}</span><span>{money(row.deductionAmount)}</span><span>{money(row.advanceAmount)}</span><b>{money(row.totalAmount)}</b><span>{money(row.bankAmount)}</span><span>{money(row.cashAmount)}</span><em>{money(row.remainingAmount)}</em></button>)}</div></section>
      {selectedPayroll?<section className="prp-card prp-person-pay"><div className="prp-card-title"><div><small>KİŞİSEL BORDRO ÖZETİ</small><h2>{selectedPayroll.fullName}</h2></div><button onClick={()=>window.print()}>Kişisel Yazdır / PDF</button></div><div className="prp-pay-grid"><div><span>Maaş</span><b>{money(selectedPayroll.salary)} ₺</b></div><div><span>Normal Çalışma Hedefi</span><b>{selectedPayroll.profileConfigured?`${(selectedPayroll.normalTargetMinutes/60).toLocaleString("tr-TR",{maximumFractionDigits:2})} saat`:"Firma profili bekliyor"}</b><small>{selectedPayroll.personnelGroup||selectedPayroll.profileName||"Firma PDKS profili"}</small></div><div><span>Ödenecek NÇ</span><b>{(selectedPayroll.payableNormalMinutes/60).toLocaleString("tr-TR",{maximumFractionDigits:2})} saat</b></div><div><span>NÇ Kesinti</span><b>{(selectedPayroll.normalDeductionMinutes/60).toLocaleString("tr-TR",{maximumFractionDigits:2})} saat</b></div><div><span>Fiilî Kart Süresi</span><b>{(selectedPayroll.actualWorkedMinutes/60).toLocaleString("tr-TR",{maximumFractionDigits:1})} saat</b></div><div><span>Fazla Mesai</span><b>{money(selectedPayroll.overtimeAmount)} ₺</b></div><div><span>Kesinti</span><b>{money(selectedPayroll.deductionAmount)} ₺</b></div><div><span>Avans</span><b>{money(selectedPayroll.advanceAmount)} ₺</b></div><div><span>Net Ödenecek</span><b>{money(selectedPayroll.totalAmount)} ₺</b></div><div><span>Banka Ödenen</span><b>{money(selectedPayroll.bankPaid)} ₺</b></div><div><span>Elden Ödenen</span><b>{money(selectedPayroll.cashPaid)} ₺</b></div><div><span>Kalan</span><b>{money(selectedPayroll.remainingAmount)} ₺</b></div></div></section>:null}
    </div>;
  }

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
