import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, FolderOpen, HardDrive, Link2, LockKeyhole, Monitor, RefreshCw, ShieldCheck } from "lucide-react";
import "./eBelgeIsnetPortalSync.css";

const LOCAL_ARCHIVE_URL = "http://127.0.0.1:8791/";
const LOCAL_HEALTH_URL = "http://127.0.0.1:8791/health";
const DIRECTIONS = ["Gelen e-Fatura", "Giden e-Fatura", "Gelen e-İrsaliye", "Giden e-İrsaliye"];

export default function EBelgeIsnetPortalSync({ activeMainCompany, openModule, enabled = true }) {
  const [health, setHealth] = useState({ phase: "checking", detail: null });
  const [frameVersion, setFrameVersion] = useState(0);
  const probe = useCallback(async () => {
    if (!enabled) {
      setHealth({ phase: "disabled", detail: null });
      return;
    }
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(LOCAL_HEALTH_URL, {
        method: "GET", mode: "cors", credentials: "omit", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error("HTTP_" + response.status);
      const detail = await response.json();
      if (detail?.ok !== true || detail?.adapter !== "KY_ISNET_DRIVE_ARCHIVE_V1") {
        throw new Error("BEKLENMEYEN_YEREL_SERVIS");
      }
      setHealth({ phase: "ready", detail });
    } catch {
      // Transitional 1.5.10 local agent has no /health route. A no-cors
      // probe may establish transport reachability, but NOT service identity.
      // The legacy panel is visibly labelled unverified until Setup 1.5.11.
      try {
        const legacy = await fetch(LOCAL_ARCHIVE_URL, {
          method: "GET", mode: "no-cors", credentials: "omit", cache: "no-store",
          signal: controller.signal,
        });
        setHealth({ phase: legacy.type === "opaque" ? "legacy" : "unreachable", detail: null });
      } catch {
        setHealth({ phase: "unreachable", detail: null });
      }
    } finally {
      clearTimeout(deadline);
    }
  }, [enabled]);

  useEffect(() => {
    void probe();
    const interval = window.setInterval(() => { if (!document.hidden) void probe(); }, 30000);
    return () => window.clearInterval(interval);
  }, [probe]);

  const connected = health.phase === "ready";
  const legacyReachable = health.phase === "legacy";
  const canShowFrame = connected || legacyReachable;
  const portalReady = connected && health.detail?.connected === true;
  const syncRunning = connected && health.detail?.running === true;
  const statusText = !enabled ? "Firma entegrasyonu pasif"
    : legacyReachable ? "Eski 8791 sürümü yanıt verdi · kimlik doğrulaması eksik"
    : !connected ? health.phase === "checking" ? "Yerel servis kontrol ediliyor" : "Yerel bağlantı kontrolü gerekli"
    : !portalReady ? "Yerel servis hazır · İşNet oturumu bekleniyor"
    : syncRunning ? "Belgeler aktarılıyor" : "İşNet oturumu hazır";

  return <section className="eis-local eis-single" aria-label="İşNet tek ekran senkronizasyon merkezi">
    <header className="eis-local-head">
      <div>
        <span className="eis-local-kicker"><ShieldCheck size={15}/> İŞNET · TEK EKRAN</span>
        <h3>İşNet Belge Aktarımı</h3>
        <p>Tek yerel servisle dört yöndeki XML/PDF arşivi. Portal şifresi yalnız yetkili Windows oturumunda kalır.</p>
      </div>
      <span className="eis-local-tag"><HardDrive size={15}/> Tek Drive / yerel arşiv</span>
    </header>

    <div className="eis-status" role="status" aria-live="polite">
      {connected ? <CheckCircle2 size={19}/> : <AlertTriangle size={19}/>}
      <div><strong>{statusText}</strong>
        <small>{connected ? (syncRunning ? "İşlem yerel serviste sürüyor; ekran kapansa da job tamamlanabilir." : "8791 doğrulandı; firma oturumu ve arşiv kontrolü aşağıdadır.")
          : legacyReachable ? "Eski servis HTTP yanıtı veriyor; servis kimliği ve oturumu 1.5.11 sağlık protokolüyle doğrulanmalı."
          : "Servis kapalı, arşiv yolu henüz yetkilendirilmemiş veya Chrome yerel ağ izni verilmemiş olabilir."}</small>
      </div>
      <button type="button" className="eis-retry" onClick={() => { void probe(); if (canShowFrame) setFrameVersion(x => x + 1); }} disabled={!enabled}>
        <RefreshCw size={15}/> Kontrol Et
      </button>
    </div>

    {!canShowFrame && enabled && <div className="eis-connection-guide" role="alert">
      <strong>8791 yerel servisi yanıt vermiyor veya Chrome erişimine izin vermiyor.</strong>
      <p>KY ERP Masaüstü Setup ile bir kez verilen arşiv ve Windows başlangıç izinlerini koruyun. Bu bilgisayarda yerel 8791 servisi çalışmalı; Chrome site ayarlarında yalnız <b>kyerp.net</b> için cihaz/yerel ağ erişimine izin verilmeli. Güvenlik korumalarını kapatmayın.</p>
      <small>İşNet şifresi hatası değildir. Fatura ve dosyalar silinmez; bağlantı dönünce kaldığınız yerden devam edebilirsiniz.</small>
    </div>}

    <div className="eis-local-directions" aria-label="Dört belge yönü">
      {DIRECTIONS.map(title => <div key={title}><FileText size={16}/><span><strong>{title}</strong><small>Orijinal XML + PDF</small></span></div>)}
    </div>

    {canShowFrame && <div className="eis-local-embedded eis-single-frame">
      <header>
        <strong><Monitor size={16}/> İşNet arşiv kontrol paneli</strong>
        <small>Firma seçimi · Tarih aralığı · Dört yönü al · Arşiv durumu</small>
      </header>
      <iframe key={frameVersion} title="İşNet Yerel Senkronizasyon"
        src={LOCAL_ARCHIVE_URL}
        allow="local-network-access; local-network; loopback-network"
        sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"
        referrerPolicy="no-referrer"/>
    </div>}

    <div className="eis-local-actions">
      <button type="button" onClick={() => openModule?.("e-belge", { tabKey: "belge-havuzu" })}><FolderOpen size={16}/> Belge Havuzunu Aç</button>
      <button type="button" onClick={() => openModule?.("e-belge", { tabKey: "eslestirmeler" })}><Link2 size={16}/> Belge Eşleştirme</button>
    </div>
    <div className="eis-local-warning"><LockKeyhole size={17}/><span>Yerel arşiv kaydı, Google Drive bulut eşitlemesi ve KY ERP D1 belge kabulü ayrı doğrulanır. Dosyanın indirilmesi otomatik kesin mali kayıt veya resmî gönderim değildir.</span></div>
    {activeMainCompany?.name && <small className="eis-local-footer">Seçili ana firma: {activeMainCompany.name}</small>}
  </section>;
}
