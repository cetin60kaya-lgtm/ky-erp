import { getPdksModernConfig, savePdksModernConfig, savePdksWorkGroupRules } from "../../services/pdksApi";
import "./PdksRulesCenter.css";

const DAYS=[[1,"Pzt"],[2,"Sal"],[3,"Çar"],[4,"Per"],[5,"Cum"],[6,"Cmt"],[0,"Paz"]];
const safe=(v)=>Array.isArray(v)?v:[];
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const bool=(v)=>v===true||v===1||String(v).toLowerCase()==="true";
const hours=(minutes)=>minutes===null||minutes===undefined||minutes===""?"":Number((Number(minutes)/60).toFixed(2));
const minutes=(value)=>value===""||value===null||value===undefined?null:Math.round(Number(value)*60);
const parseDays=(value,fallback=[])=>{if(Array.isArray(value))return value.map(Number);try{const rows=JSON.parse(String(value||"[]"));return Array.isArray(rows)?rows.map(Number):fallback}catch{return fallback}};

function DayPicker({value,onChange,label}){
  const list=safe(value);
  const toggle=(day)=>onChange(list.includes(day)?list.filter(v=>v!==day):[...list,day]);
  return <div className="prc-dayfield"><span>{label}</span><div>{DAYS.map(([key,name])=><button type="button" key={key} className={list.includes(key)?"active":""} onClick={()=>toggle(key)}>{name}</button>)}</div></div>;
}

function NumberField({label,value,onChange,suffix,min=0,max=9999,step=1,placeholder=""}){
  return <label className="prc-field"><span>{label}</span><div><input type="number" min={min} max={max} step={step} value={value??""} placeholder={placeholder} onChange={e=>onChange(e.target.value===""?"":Number(e.target.value))}/>{suffix?<em>{suffix}</em>:null}</div></label>;
}

function SelectField({label,value,onChange,children}){return <label className="prc-field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{children}</select></label>}
export default function PdksRulesCenter({activeMainCompany,isAuditAccount=false}){
  const company=activeMainCompany?.slug||activeMainCompany?.id||"mecit-hakan";
  const [config,setConfig]=useState(null),[companyRule,setCompanyRule]=useState(null);
  const [selectedGroup,setSelectedGroup]=useState(""),[groupRule,setGroupRule]=useState(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");

  const load=useCallback(async()=>{
    setBusy(true);setError("");
    try{
      const result=await getPdksModernConfig({mainCompanyId:company});
      const p=result?.profile||{};
      setConfig(result||{});
      setCompanyRule({
        configured:Boolean(p.configured),profileName:p.profileName||"",normalCreditMode:p.normalCreditMode||"UNCONFIGURED",
        payrollMonthlyHours:hours(p.payrollMonthlyMinutes),fixedDailyHours:hours(p.fixedDailyMinutes),contractWeeklyHours:hours(p.contractWeeklyMinutes),
        workDays:safe(p.workDays),restDays:safe(p.restDays),annualCountDays:safe(p.annualCountDays),
        breakMinutes:p.breakMinutes??0,overtimeMin:p.overtimeMin??0,overtimeRound:p.overtimeRound??1,duplicateWindow:p.duplicateWindow??0,
        halfDayMinutes:p.halfDayMinutes??0,maxDailyMinutes:p.maxDailyMinutes??0,maxWeeklyMinutes:p.maxWeeklyMinutes??0,
        overtimeEnabled:Boolean(p.overtimeEnabled),nightShiftEnabled:Boolean(p.nightShiftEnabled),
        defaultAttendanceMode:p.defaultAttendanceMode||"STRICT_CARD",requirePunchDefault:p.requirePunchDefault!==false,
        showDailyPunchDetail:p.showDailyPunchDetail!==false,lateEarlyEffect:p.lateEarlyEffect||"TRACK_ONLY",missingPunchPolicy:p.missingPunchPolicy||"REQUIRE_MANUAL",
      });
      setSelectedGroup(current=>(result?.groups||[]).some(g=>g.id===current)?current:(result?.groups?.[0]?.id||""));
    }catch(cause){setError(cause?.message||"Firma PDKS profili alınamadı.")}finally{setBusy(false)}
  },[company]);
  useEffect(()=>{load()},[load]);
  const group=useMemo(()=>(config?.groups||[]).find(row=>row.id===selectedGroup)||null,[config?.groups,selectedGroup]);
  useEffect(()=>{
    if(!group){setGroupRule(null);return}
    setGroupRule({
      workDays:parseDays(group.work_days_json,companyRule?.workDays||[]),restDays:parseDays(group.weekly_rest_days_json,companyRule?.restDays||[]),
      breakMinutes:num(group.break_minutes??companyRule?.breakMinutes,0),overtimeMin:num(group.overtime_min_minutes??companyRule?.overtimeMin,0),
      overtimeRound:num(group.overtime_round_minutes??companyRule?.overtimeRound,1),duplicateWindow:num(group.duplicate_punch_window_seconds??companyRule?.duplicateWindow,0),
      halfDayMinutes:num(group.half_day_minutes??companyRule?.halfDayMinutes,0),maxDailyMinutes:num(group.max_daily_minutes??companyRule?.maxDailyMinutes,0),
      maxWeeklyMinutes:num(group.max_weekly_minutes??companyRule?.maxWeeklyMinutes,0),crossMidnight:bool(group.cross_midnight),flexible:bool(group.flexible),
      flexibleStart:group.flexible_start||"",flexibleEnd:group.flexible_end||"",nightShift:bool(group.night_shift),overtimeRequiresApproval:bool(group.overtime_requires_approval),
    });
  },[companyRule,group]);

  const saveCompany=async()=>{
    if(isAuditAccount||!companyRule)return;setBusy(true);setError("");setMessage("");
    try{
      const payload={...companyRule,configured:true,payrollMonthlyMinutes:minutes(companyRule.payrollMonthlyHours),fixedDailyMinutes:minutes(companyRule.fixedDailyHours),contractWeeklyMinutes:minutes(companyRule.contractWeeklyHours)};
      delete payload.payrollMonthlyHours;delete payload.fixedDailyHours;delete payload.contractWeeklyHours;
      await savePdksModernConfig({mainCompanyId:company,...payload});setMessage("Firma PDKS profili kaydedildi. Bu değerler yalnız bu firmaya uygulanır.");await load();
    }catch(cause){setError(cause?.message||"Firma PDKS profili kaydedilemedi.")}finally{setBusy(false)}
  };
  const saveGroup=async()=>{if(isAuditAccount||!groupRule||!selectedGroup)return;setBusy(true);setError("");setMessage("");try{await savePdksWorkGroupRules(selectedGroup,{mainCompanyId:company,...groupRule});setMessage(`${group?.name||"Vardiya"} özel kuralları kaydedildi.`);await load()}catch(cause){setError(cause?.message||"Vardiya kuralları kaydedilemedi.")}finally{setBusy(false)}};

  if(!companyRule)return <div className="prc-page"><div className="prc-loading">{busy?"Profil yükleniyor...":error||"PDKS firma profili yok."}</div></div>;
  const derivedDaily=companyRule.normalCreditMode==="MONTHLY_DIV_30"&&Number(companyRule.payrollMonthlyHours)>0?Number(companyRule.payrollMonthlyHours)/30:null;
  return <div className="prc-page">
    <header className="prc-head"><div><small>PDKS / FİRMA PROFİLİ</small><h1>Firma Çalışma & Puantaj Profili</h1><p>Çalışma takvimi, aylık normal çalışma hedefi, kart zorunluluğu ve mesai davranışı firma bazında yönetilir; uygulama geneline sabitlenmez.</p></div><div><span className={"prc-engine "+(companyRule.configured?"":"warn")}>● {companyRule.configured?"PROFİL AKTİF":"KURULUM BEKLİYOR"}</span><button type="button" onClick={load} disabled={busy}>Yenile</button></div></header>
    {message?<div className="prc-message">{message}</div>:null}{error?<div className="prc-error">{error}</div>:null}
    {!companyRule.configured?<div className="prc-error">Bu firma için PDKS profili henüz tamamlanmadı. Sistem kart hareketlerini toplamaya devam eder; fakat normal çalışma/bordro kredisi profil kaydedilene kadar kesinleştirilmez.</div>:null}

    <section className="prc-card"><div className="prc-card-title"><div><span>FİRMA KARTI / PDKS</span><h2>Normal Çalışma & Bordro Kuralı</h2></div><b>{activeMainCompany?.name||company}</b></div>
      <div className="prc-numbers">
        <label className="prc-field"><span>Profil adı</span><div><input value={companyRule.profileName} onChange={e=>setCompanyRule({...companyRule,profileName:e.target.value})} placeholder="Örn. Hakan Emprime PDKS"/></div></label>
        <SelectField label="Normal çalışma yöntemi" value={companyRule.normalCreditMode} onChange={v=>setCompanyRule({...companyRule,normalCreditMode:v})}><option value="UNCONFIGURED">Seçilmedi</option><option value="MONTHLY_DIV_30">Aylık hedef / 30 gün</option><option value="MONTHLY_WORKDAYS">Aylık hedef / çalışma günleri</option><option value="FIXED_DAILY">Sabit günlük kredi</option><option value="ACTUAL">Fiilî kart süresi</option></SelectField>
        {companyRule.normalCreditMode.startsWith("MONTHLY_")?<NumberField label="Aylık normal çalışma hedefi" value={companyRule.payrollMonthlyHours} suffix="saat" min={1} max={500} step={0.25} onChange={v=>setCompanyRule({...companyRule,payrollMonthlyHours:v})}/>:null}
        {companyRule.normalCreditMode==="FIXED_DAILY"?<NumberField label="Sabit günlük normal çalışma" value={companyRule.fixedDailyHours} suffix="saat" min={0.25} max={24} step={0.25} onChange={v=>setCompanyRule({...companyRule,fixedDailyHours:v})}/>:null}
        <NumberField label="Haftalık sözleşme" value={companyRule.contractWeeklyHours} suffix="saat" min={1} max={100} step={0.25} onChange={v=>setCompanyRule({...companyRule,contractWeeklyHours:v})}/>
      </div>
      {derivedDaily!==null?<div className="prc-hint">Bu firma profilinde aylık {companyRule.payrollMonthlyHours} saat / 30 gün = günlük {derivedDaily.toFixed(2)} saat normal çalışma kredisi üretir. Terminalde geçirilen fiilî süre bundan ayrı tutulur.</div>:null}
      <div className="prc-days"><DayPicker label="Fiilî çalışma günleri" value={companyRule.workDays} onChange={v=>setCompanyRule({...companyRule,workDays:v})}/><DayPicker label="Hafta tatili / çalışma dışı" value={companyRule.restDays} onChange={v=>setCompanyRule({...companyRule,restDays:v})}/><DayPicker label="Yıllık izinden sayılan hafta günleri" value={companyRule.annualCountDays} onChange={v=>setCompanyRule({...companyRule,annualCountDays:v})}/></div>
    </section>
    <section className="prc-card"><div className="prc-card-title"><div><span>FİRMA DAVRANIŞI</span><h2>Kart, Geç/Erken & Mesai Politikası</h2></div><b>Gruplar bunu miras alır</b></div>
      <div className="prc-numbers">
        <SelectField label="Varsayılan kart davranışı" value={companyRule.defaultAttendanceMode} onChange={v=>setCompanyRule({...companyRule,defaultAttendanceMode:v})}><option value="STRICT_CARD">Kart zorunlu</option><option value="CARD_CONTROL_ONLY">Kart sadece kontrol</option><option value="SUMMARY_ONLY">Sadece aylık özet</option><option value="NO_CARD_REQUIRED">Kart gerekmiyor</option></SelectField>
        <SelectField label="Geç / erken etkisi" value={companyRule.lateEarlyEffect} onChange={v=>setCompanyRule({...companyRule,lateEarlyEffect:v})}><option value="IGNORE">Yok say</option><option value="TRACK_ONLY">Sadece takip et</option><option value="DEDUCT_CREDIT">Normal çalışmadan düş</option></SelectField>
        <SelectField label="Eksik kart politikası" value={companyRule.missingPunchPolicy} onChange={v=>setCompanyRule({...companyRule,missingPunchPolicy:v})}><option value="FLAG_ONLY">Sadece uyar</option><option value="REQUIRE_MANUAL">Manuel düzeltme zorunlu</option><option value="ZERO_CREDIT">Normal çalışma verme</option><option value="ASSUME_SCHEDULE">Vardiyayı kabul et</option></SelectField>
      </div>
      <div className="prc-switches">
        <label><input type="checkbox" checked={companyRule.requirePunchDefault} onChange={e=>setCompanyRule({...companyRule,requirePunchDefault:e.target.checked})}/><span><b>Kart zorunlu</b><small>Eksik basım kontrolü aktif.</small></span></label>
        <label><input type="checkbox" checked={companyRule.showDailyPunchDetail} onChange={e=>setCompanyRule({...companyRule,showDailyPunchDetail:e.target.checked})}/><span><b>Günlük kart detayı</b><small>Bordro/puantajda giriş-çıkış göster.</small></span></label>
        <label><input type="checkbox" checked={companyRule.overtimeEnabled} onChange={e=>setCompanyRule({...companyRule,overtimeEnabled:e.target.checked})}/><span><b>Fazla mesai</b><small>Firma genelinde mesai motoru kullanılabilir.</small></span></label>
        <label><input type="checkbox" checked={companyRule.nightShiftEnabled} onChange={e=>setCompanyRule({...companyRule,nightShiftEnabled:e.target.checked})}/><span><b>Gece vardiyası</b><small>Geceye sarkan vardiyalar kullanılabilir.</small></span></label>
      </div>
      <div className="prc-numbers"><NumberField label="Günlük mola" value={companyRule.breakMinutes} suffix="dk" onChange={v=>setCompanyRule({...companyRule,breakMinutes:v})}/><NumberField label="Mesai başlama eşiği" value={companyRule.overtimeMin} suffix="dk" onChange={v=>setCompanyRule({...companyRule,overtimeMin:v})}/><NumberField label="Mesai yuvarlama" value={companyRule.overtimeRound} suffix="dk" min={1} onChange={v=>setCompanyRule({...companyRule,overtimeRound:v})}/><NumberField label="Mükerrer basım" value={companyRule.duplicateWindow} suffix="sn" onChange={v=>setCompanyRule({...companyRule,duplicateWindow:v})}/><NumberField label="Yarım gün referansı" value={companyRule.halfDayMinutes} suffix="dk" onChange={v=>setCompanyRule({...companyRule,halfDayMinutes:v})}/><NumberField label="Günlük anomali sınırı" value={companyRule.maxDailyMinutes} suffix="dk" onChange={v=>setCompanyRule({...companyRule,maxDailyMinutes:v})}/><NumberField label="Haftalık anomali sınırı" value={companyRule.maxWeeklyMinutes} suffix="dk" onChange={v=>setCompanyRule({...companyRule,maxWeeklyMinutes:v})}/></div>
      {!isAuditAccount?<div className="prc-actions"><button className="primary" type="button" onClick={saveCompany} disabled={busy}>Firma PDKS Profilini Kaydet</button></div>:null}
    </section>
    <section className="prc-card"><div className="prc-card-title"><div><span>VARDİYA ÖZELİ</span><h2>Vardiya Kuralı</h2></div><select value={selectedGroup} onChange={e=>setSelectedGroup(e.target.value)}>{(config?.groups||[]).map(row=><option key={row.id} value={row.id}>{row.name} · {row.entryTime}-{row.exitTime}</option>)}</select></div>
      {group&&groupRule?<>
        <div className="prc-shift-banner"><div><span>Vardiya</span><strong>{group.name}</strong></div><div><span>Giriş / Çıkış</span><strong>{group.entryTime} – {group.exitTime}</strong></div><div><span>Geç Toleransı</span><strong>{group.lateTolerance} dk</strong></div><div><span>Erken Toleransı</span><strong>{group.earlyTolerance} dk</strong></div></div>
        <div className="prc-days two"><DayPicker label="Bu vardiyanın çalışma günleri" value={groupRule.workDays} onChange={v=>setGroupRule({...groupRule,workDays:v})}/><DayPicker label="Bu vardiyanın hafta tatili" value={groupRule.restDays} onChange={v=>setGroupRule({...groupRule,restDays:v})}/></div>
        <div className="prc-numbers"><NumberField label="Mola" value={groupRule.breakMinutes} suffix="dk" onChange={v=>setGroupRule({...groupRule,breakMinutes:v})}/><NumberField label="Mesai eşiği" value={groupRule.overtimeMin} suffix="dk" onChange={v=>setGroupRule({...groupRule,overtimeMin:v})}/><NumberField label="Mesai yuvarlama" value={groupRule.overtimeRound} suffix="dk" min={1} onChange={v=>setGroupRule({...groupRule,overtimeRound:v})}/><NumberField label="Mükerrer basım" value={groupRule.duplicateWindow} suffix="sn" onChange={v=>setGroupRule({...groupRule,duplicateWindow:v})}/><NumberField label="Yarım gün" value={groupRule.halfDayMinutes} suffix="dk" onChange={v=>setGroupRule({...groupRule,halfDayMinutes:v})}/><NumberField label="Günlük kontrol" value={groupRule.maxDailyMinutes} suffix="dk" onChange={v=>setGroupRule({...groupRule,maxDailyMinutes:v})}/><NumberField label="Haftalık kontrol" value={groupRule.maxWeeklyMinutes} suffix="dk" onChange={v=>setGroupRule({...groupRule,maxWeeklyMinutes:v})}/></div>
        <div className="prc-switches"><label><input type="checkbox" checked={groupRule.crossMidnight} onChange={e=>setGroupRule({...groupRule,crossMidnight:e.target.checked})}/><span><b>Geceye sarkan</b><small>Çıkış ertesi gün olabilir.</small></span></label><label><input type="checkbox" checked={groupRule.nightShift} onChange={e=>setGroupRule({...groupRule,nightShift:e.target.checked})}/><span><b>Gece vardiyası</b><small>Gece raporlamasına girer.</small></span></label><label><input type="checkbox" checked={groupRule.flexible} onChange={e=>setGroupRule({...groupRule,flexible:e.target.checked})}/><span><b>Esnek vardiya</b><small>Başlangıç/bitiş penceresi uygulanır.</small></span></label><label><input type="checkbox" checked={groupRule.overtimeRequiresApproval} onChange={e=>setGroupRule({...groupRule,overtimeRequiresApproval:e.target.checked})}/><span><b>Mesai onayı</b><small>Hesaplanan mesai onaya girer.</small></span></label></div>
        {groupRule.flexible?<div className="prc-flex"><label>Esnek Başlangıç<input type="time" value={groupRule.flexibleStart} onChange={e=>setGroupRule({...groupRule,flexibleStart:e.target.value})}/></label><label>Esnek Bitiş<input type="time" value={groupRule.flexibleEnd} onChange={e=>setGroupRule({...groupRule,flexibleEnd:e.target.value})}/></label></div>:null}
        {!isAuditAccount?<div className="prc-actions"><button className="primary" type="button" onClick={saveGroup} disabled={busy}>Vardiya Özel Kurallarını Kaydet</button></div>:null}
      </>:<div className="prc-empty">Vardiya tanımı yok.</div>}
    </section>
    <section className="prc-card"><div className="prc-card-title"><div><span>İZİN MOTORU</span><h2>Tanımlı İzin Türleri</h2></div><b>{config?.leaveTypes?.length||0} tip</b></div><div className="prc-leaves">{(config?.leaveTypes||[]).map(row=><article key={row.code}><div><strong>{row.name}</strong><code>{row.code}</code></div><span>{row.unit} · {row.paid?"Ücretli":"Ücretsiz"}{row.annualBalanceEffect?" · Yıllık bakiyeden düşer":""}</span><small>{row.legalNote||"Şirket kuralı"}</small></article>)}</div></section>
  </div>;
}
