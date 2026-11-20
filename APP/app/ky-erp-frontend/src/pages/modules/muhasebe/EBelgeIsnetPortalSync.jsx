import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileCode2, FileText, FolderOpen, LockKeyhole, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { getIsnetSettings, saveIsnetSettings, testIsnetSettings, syncIsnetPortalBatch } from "../../../services/isnetApi";
import "./eBelgeIsnetPortalSync.css";

const directions = [
  { key: "incomingInvoices", title: "Gelen faturalar", icon: FileText },
  { key: "outgoingInvoices", title: "Giden faturalar", icon: FileText },
  { key: "incomingDispatches", title: "Gelen irsaliyeler", icon: Truck },
  { key: "outgoingDispatches", title: "Giden irsaliyeler", icon: Truck },
];
const number = (value) => Number(value || 0).toLocaleString("tr-TR");
const day = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
function daysAgo(days) { const date = new Date(); date.setDate(date.getDate() - days); return day(date); }
function validPeriod(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const difference = (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000;
  return Number.isFinite(difference) && difference >= 0 && difference <= 31;
}
export default function EBelgeIsnetPortalSync({ activeMainCompany, openModule, enabled = true, onSynced }) {
  const tenant = activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || activeMainCompany?.id || "";
  const [settings, setSettings] = useState(null);
  const [account,setAccount] = useState("");
  const [companies,setCompanies] = useState([]);
  const [companyId,setCompanyId] = useState("");
  const [verified,setVerified] = useState(false);
  const [setupOpen,setSetupOpen] = useState(false);
  const [connectionBusy,setConnectionBusy] = useState("");
  const [cursor,setCursor] = useState(0);
  const [hasMore,setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState(() => daysAgo(7));
  const [to, setTo] = useState(() => daysAgo(0));
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState("idle");
  const [summary, setSummary] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const stopRef = useRef(false);
  const busyRef = useRef(false);
  useEffect(() => {
    let alive = true;
    stopRef.current = true;
    setLoading(true); setSettings(null); setPassword(""); setMessage(""); setSummary(null); setPhase("idle");
    if (!tenant) { setLoading(false); return () => { alive = false; }; }
    getIsnetSettings(tenant)
      .then((data) => { if (alive) { setSettings(data);setAccount(data?.username||"");setCompanies(Array.isArray(data?.companies)?data.companies:[]);setCompanyId(data?.companyId||"");setSetupOpen(!data?.companyId); } })
      .catch(() => { if (alive) { setPhase("error"); setMessage("Firma İşNet ayarları alınamadı. Bağlantı sekmesinden kontrol edin."); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; stopRef.current = true; };
  }, [tenant]);

  const ready = Boolean(settings?.username && settings?.companyId && settings?.companyName);
  const canRun = enabled && tenant && ready && !loading && !running && !connectionBusy && !setupOpen;
  const resetPeriod=()=>{setPhase("idle");setMessage("");setCursor(0);setHasMore(false);setSummary(null);setProgress({current:0,total:0});};
  const preset = (days) => { setFrom(daysAgo(days)); setTo(daysAgo(0));resetPeriod(); };
  const verifyAccount=async()=>{
    if(connectionBusy||running||!account.trim()||!password.trim())return;
    setConnectionBusy("verify");setMessage("");setPhase("idle");
    try{
      const response=await testIsnetSettings({mainCompanySlug:tenant,username:account.trim(),password,connectionMode:"portal"});
      const available=Array.isArray(response?.companies)?response.companies:Array.isArray(response?.authorizedCompanies)?response.authorizedCompanies:[];
      if(!available.length)throw Error("İşNet firma yetki listesi alınamadı.");
      setCompanies(available);setCompanyId(id=>available.some(c=>String(c.id)===String(id))?id:available.length===1?String(available[0].id):"");
      setVerified(true);setPhase("success");setMessage("Bağlantı doğrulandı. Firma seçimini kaydedin.");
    }catch(error){setVerified(false);setPhase("error");setMessage(error?.message||"İşNet bağlantısı doğrulanamadı.");}
    finally{setConnectionBusy("");}
  };
  const saveCompany=async()=>{
    if(connectionBusy||running||!verified||!companyId)return;
    setConnectionBusy("save");setMessage("");
    try{
      await saveIsnetSettings({mainCompanySlug:tenant,username:account.trim(),companyId,connectionMode:"portal"});
      // Treat a D1 write as saved only after a fresh read confirms the tenant
      // and authorized company. A saved profile is NOT an active portal session.
      const persisted=await getIsnetSettings(tenant);
      if(String(persisted?.companyId||"")!==String(companyId) ||
         String(persisted?.username||"").trim()!==account.trim()) {
        throw Error("Firma kaydı sunucudan doğrulanamadı. Yenilemeden bağlantı başarılı sayılmaz.");
      }
      setSettings(persisted);setPassword("");
      setVerified(false);setSetupOpen(false);setPhase("success");
      setMessage("Firma kaydı doğrulandı. Portal oturumu henüz açık değil; belge indirmek için şifreyi yeniden girip 'Belgeleri Al'ı kullanın.");
    }catch(error){setPhase("error");setMessage(error?.message||"Firma seçimi kaydedilemedi.");}
    finally{setConnectionBusy("");}
  };
  const run = useCallback(async () => {
    if (busyRef.current || !enabled || !tenant) return;
    if (!validPeriod(from, to)) { setPhase("error"); setMessage("Tarih aralığı 0–31 gün olmalı."); return; }
    if (!ready) { setPhase("error"); setMessage("Önce İşNet bağlantısından firma seçimini kaydedin."); return; }
    if (!password.trim()) { setPhase("error"); setMessage("İşNet portal şifresini girin. Şifre kaydedilmez."); return; }

    stopRef.current = false; busyRef.current = true; setRunning(true);
    setPhase("running"); setMessage("İşNet belgeleri sorgulanıyor...");
    setSummary(null); setProgress({ current: 0, total: 0 });
    let offset = hasMore ? cursor : 0, finished = false, totalDownloaded = 0, totalAdded = 0, totalDuplicates = 0, count = 0;
    let totalFailed=0;
    let last = null;
    try {
      for (let part = 0; part < 150; part += 1) {
        if (stopRef.current) break;
        setMessage("Belgeler alınıyor ve havuza kaydediliyor. İşlem " + (part + 1) + "...");
        const response = await syncIsnetPortalBatch({
          mainCompanySlug: tenant, password, startDate: from, endDate: to, offset,
        });
        last = response;
        count = Math.max(count, Number(response.portalCount || 0));
        totalDownloaded += Number(response.downloaded || 0);
        totalAdded += Number(response.canonical?.created || 0);
        totalDuplicates += Number(response.canonical?.duplicates || 0);
        totalFailed += Number(response.failed || 0) + Number(response.canonical?.failed || 0);
        setProgress({ current: offset + Number(response.batchCount || 0), total: count });
        setSummary({ ...response, downloaded: totalDownloaded, totalAdded, totalDuplicates, totalFailed });
        if (response.status === "FAILED") throw Error("İşNet belge kaynağı sorgulaması tamamlanamadı.");
        if (response.hasMore !== true) {
          finished = true;setHasMore(false);setCursor(0);setPhase(totalFailed?"review":"success");
          setMessage(totalFailed?"Belgeler tarandı. "+totalFailed+" dosya/havuz hatası kontrol gerektiriyor; başarılı kayıtlar korundu.":"Belge aktarımı tamamlandı. Yeni belgeler havuzda kontrol bekliyor.");
          break;
        }
        const nextOffset = Number(response.nextOffset);
        if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) throw new Error("Belge sayfalama bilgisi doğrulanamadı.");
        offset = nextOffset;setCursor(nextOffset);setHasMore(true);
      }
      if (!finished && !stopRef.current && last && !last.requiresReview) {
        setPhase("review");
        setMessage("Güvenli işlem sınırına ulaşıldı. Alınan belgeler korunuyor; kalanların kontrolü gerekiyor.");
      }
      if (stopRef.current) {
        setPhase("review");
        setMessage("İşlem durduruldu. Önceden alınan belgeler havuzda korunuyor.");
      }
      if (typeof onSynced === "function") await onSynced();
    } catch (error) {
      setPhase("error");
      setMessage("İşNet senkronizasyonu tamamlanamadı. Daha önce alınan belgeler korunuyor. " + (error?.message || "Bağlantıyı kontrol edin."));
    } finally {
      setPassword(""); setRunning(false); busyRef.current = false;
    }
  }, [enabled, tenant, password, from, to, ready, onSynced, hasMore, cursor]);

  return <section className="eis" aria-label="İşNet belge alma">
    <header className="eis-head">
      <div><span className="eis-kicker"><ShieldCheck size={15}/> İŞNET BELGE AKTARIMI</span>
        <h3>Belgeleri KY ERP'ye Al</h3>
        <p>Gelen ve giden faturalar ile irsaliyeler. Orijinal XML + PDF, tek işlem.</p></div>
      <button className="eis-secondary" type="button" onClick={() => openModule?.("e-belge", { tabKey: "belge-havuzu" })}><FolderOpen size={16}/> Belge Havuzu</button>
    </header>
    <div className="eis-steps" aria-label="İşNet belge aktarım adımları">
      <span><b>1</b> Firma bağlantısı</span><span><b>2</b> XML + PDF'yi al</span><span><b>3</b> Havuzda kontrol et</span>
    </div>
    <div className="eis-status">
      <div className="eis-company"><span>Seçili İşNet firması</span><strong>{loading ? "Kontrol ediliyor..." : settings?.companyName || "Firma bağlantısı eksik"}</strong></div>
      <span className={"eis-chip " + (!enabled ? "eis-chip-warn" : ready ? "eis-chip-ok" : "eis-chip-warn")}>
        {!enabled ? "Entegrasyon pasif" : loading ? "Kontrol ediliyor" : ready ? "Firma tanımlı" : "Bağlantı kurulmalı"}
      </span>
    </div>
    <div className="eis-connection-action">
      <button type="button" disabled={Boolean(connectionBusy)||running} onClick={()=>setSetupOpen(x=>!x)}>
        <LockKeyhole size={15}/>{ready?"Bağlantı ve Firma Ayarları":"İşNet Bağlantısını Kur"}
      </button>
      {!ready&&<small>Bir kez kullanıcı hesabını doğrulayın ve firmayı seçin; sonrasında aynı ekrandan belgeleri alın.</small>}
    </div>
    {setupOpen&&<section className="eis-setup" aria-label="İşNet bağlantısı ve firma seçimi">
      <strong>İşNet bağlantısı</strong>
      <p>İşNet portal hesabınızı doğrulayın. Şifre sadece test ve indirme süresince kullanılır; sunucuda kalıcı tutulmaz.</p>
      <div className="eis-fields">
        <label>Kullanıcı adı / TCKN<input value={account} autoComplete="section-isnet username" disabled={Boolean(connectionBusy)} onChange={event=>{setAccount(event.target.value);setVerified(false);}}/></label>
        <label>Portal şifresi<input type="password" autoComplete="off" value={password} disabled={Boolean(connectionBusy)} onChange={event=>setPassword(event.target.value)}/></label>
        <button type="button" disabled={Boolean(connectionBusy)||!account.trim()||!password} onClick={()=>void verifyAccount()}>{connectionBusy==="verify"?"Doğrulanıyor...":"Bağlantıyı Doğrula"}</button>
        <label>Yetkili firma<select value={companyId} disabled={Boolean(connectionBusy)||!companies.length} onChange={event=>setCompanyId(event.target.value)}>
          <option value="">Firma seçin</option>{companies.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}
        </select></label>
        <button type="button" disabled={Boolean(connectionBusy)||!verified||!companyId} onClick={()=>void saveCompany()}>Firmayı Kaydet</button>
      </div>
    </section>}
    <div className="eis-archive-policy"><CheckCircle2 size={16}/><span>İşNet'in verdiği <b>orijinal XML ve PDF</b> aynı belge kartında korunur. PDF için yeni şablon oluşturmak gerekmez. Eksik dosya varsa ayrıca gösterilir.</span></div>
    <div className="eis-types" aria-label="Alınacak belge türleri">
      {directions.map(({key,title,icon:Icon}) => <div className="eis-type" key={key}>
        <Icon size={17}/><span>{title}</span><strong>{summary ? number(summary.counts?.[key]) : "XML + PDF"}</strong>
      </div>)}
    </div>
    <div className="eis-work">
      <div className="eis-work-title"><strong>2. Belgelerin tarih aralığı</strong><small>Bir sorguda en fazla 31 gün</small></div>
      <div className="eis-presets">
        <button type="button" disabled={running} onClick={() => preset(0)}>Bugün</button>
        <button type="button" disabled={running} onClick={() => preset(7)}>Son 7 gün</button>
        <button type="button" disabled={running} onClick={() => preset(30)}>Son 30 gün</button>
      </div>
      <div className="eis-fields">
        <label>Başlangıç<input type="date" value={from} disabled={running} onChange={(event) => {setFrom(event.target.value);resetPeriod();}}/></label>
        <label>Bitiş<input type="date" value={to} disabled={running} onChange={(event) => {setTo(event.target.value);resetPeriod();}}/></label>
        {!setupOpen&&<label>İşNet portal şifresi<input type="password" value={password} disabled={running || !enabled} autoComplete="off" placeholder="Yalnız bu işlem için" onChange={(event) => setPassword(event.target.value)}/></label>}
      </div>
      <div className="eis-actions">
        <button className="eis-primary" type="button" disabled={!canRun} onClick={() => void run()}><RefreshCw size={17} className={running ? "eis-spinning" : ""}/> {running ? "Belgeler aktarılıyor..." : hasMore ? "Kaldığı Yerden Devam Et" : "Belgeleri Al · XML + PDF"}</button>
        {running && <button className="eis-secondary" type="button" onClick={() => { stopRef.current = true; setMessage("Mevcut aktarım bitince durdurulacak."); }}>Durdur</button>}
      </div>
    </div>
    {(phase !== "idle" || summary) && <div className={"eis-result eis-result-" + phase} role="status">
      <div className="eis-result-head">{phase === "success" ? <CheckCircle2 size={18}/> : phase === "error" || phase === "review" ? <AlertCircle size={18}/> : <RefreshCw size={18}/>}
        <strong>{phase === "success" ? "Tamamlandı" : phase === "error" ? "Bağlantı / işlem hatası" : phase === "review" ? "Kontrol gerekiyor" : "İşlem durumu"}</strong></div>
      {message && <p>{message}</p>}
      {summary && <div className="eis-result-stats">
        <span>Listelenen <b>{number(summary.portalCount)}</b></span>
        <span>XML + PDF tam <b>{number(summary.downloaded)}</b></span>
        <span>Yeni havuz kaydı <b>{number(summary.totalAdded)}</b></span>
        <span>Mükerrer <b>{number(summary.totalDuplicates)}</b></span>
        <span>Dosya/havuz hatası <b>{number(summary.totalFailed)}</b></span>
      </div>}
      {running && progress.total > 0 && <progress max={progress.total} value={Math.min(progress.current,progress.total)} aria-label="Belge aktarım ilerlemesi"/>}
    </div>}
    <div className="eis-actions"><button type="button" onClick={()=>openModule?.("e-belge",{tabKey:"eslestirmeler"})}><FileText size={16}/> Fatura–İrsaliye Eşleşmeleri</button></div>
    <footer className="eis-foot"><LockKeyhole size={15}/> İşNet şifresi kalıcı kaydedilmez. Belgeler kullanıcı onayı olmadan muhasebeleştirilmez; resmî fatura gönderimi yapılmaz.</footer>
  </section>;
}
