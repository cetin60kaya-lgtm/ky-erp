import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileCode2, FileText, FolderOpen, LockKeyhole, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { getIsnetSettings, syncIsnetPortalBatch } from "../../../services/isnetApi";
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
    getIsnetSettings()
      .then((data) => { if (alive) setSettings(data); })
      .catch(() => { if (alive) { setPhase("error"); setMessage("Firma İşNet ayarları alınamadı. Bağlantı sekmesinden kontrol edin."); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; stopRef.current = true; };
  }, [tenant]);

  const ready = Boolean(settings?.username && settings?.companyId && settings?.companyName);
  const canRun = enabled && tenant && ready && !loading && !running;
  const preset = (days) => { setFrom(daysAgo(days)); setTo(daysAgo(0)); setPhase("idle"); setMessage(""); };
  const run = useCallback(async () => {
    if (busyRef.current || !enabled || !tenant) return;
    if (!validPeriod(from, to)) { setPhase("error"); setMessage("Tarih aralığı 0–31 gün olmalı."); return; }
    if (!ready) { setPhase("error"); setMessage("Önce İşNet bağlantısından firma seçimini kaydedin."); return; }
    if (!password.trim()) { setPhase("error"); setMessage("İşNet portal şifresini girin. Şifre kaydedilmez."); return; }

    stopRef.current = false; busyRef.current = true; setRunning(true);
    setPhase("running"); setMessage("İşNet belgeleri sorgulanıyor...");
    setSummary(null); setProgress({ current: 0, total: 0 });
    let offset = 0, finished = false, totalDownloaded = 0, totalAdded = 0, totalDuplicates = 0, count = 0;
    let last = null;
    try {
      for (let part = 0; part < 100; part += 1) {
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
        setProgress({ current: offset + Number(response.batchCount || 0), total: count });
        setSummary({ ...response, downloaded: totalDownloaded, totalAdded, totalDuplicates });
        if (response.status === "FAILED" || response.requiresReview) {
          setPhase("review");
          setMessage("Bazı belgeler kontrol gerektiriyor. Başarıyla alınan belgeler korunuyor. Eksik belgeler için İşlem Sonuçlarını kontrol edin.");
          break;
        }
        if (response.hasMore !== true) {
          finished = true; setPhase("success");
          setMessage("Belge aktarımı tamamlandı. Yeni belgeler havuzda kontrol bekliyor.");
          break;
        }
        const nextOffset = Number(response.nextOffset);
        if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) throw new Error("Belge sayfalama bilgisi doğrulanamadı.");
        offset = nextOffset;
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
  }, [enabled, tenant, password, from, to, ready, onSynced]);

  return <section className="eis" aria-label="İşNet belge alma">
    <header className="eis-head">
      <div><span className="eis-kicker"><ShieldCheck size={15}/> İŞNET BELGE AKTARIMI</span>
        <h3>Belgeleri KY ERP'ye Al</h3>
        <p>Gelen ve giden faturalar ile irsaliyeler. Orijinal XML + PDF, tek işlem.</p></div>
      <button className="eis-secondary" type="button" onClick={() => openModule?.("e-belge", { tabKey: "belge-havuzu" })}><FolderOpen size={16}/> Belge Havuzu</button>
    </header>
    <div className="eis-status">
      <div className="eis-company"><span>Seçili İşNet firması</span><strong>{loading ? "Kontrol ediliyor..." : settings?.companyName || "Firma bağlantısı eksik"}</strong></div>
      <span className={"eis-chip " + (!enabled ? "eis-chip-warn" : ready ? "eis-chip-ok" : "eis-chip-warn")}>
        {!enabled ? "Entegrasyon pasif" : loading ? "Kontrol ediliyor" : ready ? "Firma tanımlı" : "Bağlantı kurulmalı"}
      </span>
    </div>
    <div className="eis-types" aria-label="Alınacak belge türleri">
      {directions.map(({key,title,icon:Icon}) => <div className="eis-type" key={key}>
        <Icon size={17}/><span>{title}</span><strong>{summary ? number(summary.counts?.[key]) : "XML + PDF"}</strong>
      </div>)}
    </div>
    <div className="eis-work">
      <div className="eis-work-title"><strong>1. Tarih ve bağlantı</strong><small>Bir sorguda en fazla 31 gün</small></div>
      <div className="eis-presets">
        <button type="button" disabled={running} onClick={() => preset(0)}>Bugün</button>
        <button type="button" disabled={running} onClick={() => preset(7)}>Son 7 gün</button>
        <button type="button" disabled={running} onClick={() => preset(30)}>Son 30 gün</button>
      </div>
      <div className="eis-fields">
        <label>Başlangıç<input type="date" value={from} disabled={running} onChange={(event) => setFrom(event.target.value)}/></label>
        <label>Bitiş<input type="date" value={to} disabled={running} onChange={(event) => setTo(event.target.value)}/></label>
        <label>İşNet portal şifresi<input type="password" value={password} disabled={running || !enabled} autoComplete="off" placeholder="Yalnız bu işlem için" onChange={(event) => setPassword(event.target.value)}/></label>
      </div>
      <div className="eis-actions">
        <button className="eis-primary" type="button" disabled={!canRun} onClick={() => void run()}><RefreshCw size={17} className={running ? "eis-spinning" : ""}/> {running ? "Belgeler aktarılıyor..." : "Belgeleri Al · XML + PDF"}</button>
        {running && <button className="eis-secondary" type="button" onClick={() => { stopRef.current = true; setMessage("Mevcut aktarım bitince durdurulacak."); }}>Durdur</button>}
      </div>
    </div>
    {(phase !== "idle" || summary) && <div className={"eis-result eis-result-" + phase} role="status">
      <div className="eis-result-head">{phase === "success" ? <CheckCircle2 size={18}/> : phase === "error" || phase === "review" ? <AlertCircle size={18}/> : <RefreshCw size={18}/>}
        <strong>{phase === "success" ? "Tamamlandı" : phase === "error" ? "Bağlantı / işlem hatası" : phase === "review" ? "Kontrol gerekiyor" : "İşlem durumu"}</strong></div>
      {message && <p>{message}</p>}
      {summary && <div className="eis-result-stats">
        <span>Listelenen <b>{number(summary.portalCount)}</b></span>
        <span>İndirilen <b>{number(summary.downloaded)}</b></span>
        <span>Yeni havuz kaydı <b>{number(summary.totalAdded)}</b></span>
        <span>Mükerrer <b>{number(summary.totalDuplicates)}</b></span>
        <span>Dosya hatası <b>{number(summary.failed)}</b></span>
      </div>}
      {running && progress.total > 0 && <progress max={progress.total} value={Math.min(progress.current,progress.total)} aria-label="Belge aktarım ilerlemesi"/>}
    </div>}
    <footer className="eis-foot"><LockKeyhole size={15}/> İşNet şifresi kalıcı kaydedilmez. Belgeler kullanıcı onayı olmadan muhasebeleştirilmez; resmî fatura gönderimi yapılmaz.</footer>
  </section>;
}
