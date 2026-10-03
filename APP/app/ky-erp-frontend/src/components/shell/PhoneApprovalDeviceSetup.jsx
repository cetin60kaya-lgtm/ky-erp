import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, RefreshCw, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../../utils/api";
import "./phone-approval-setup.css";

function rowsOf(value) {
  const data = value?.data ?? value;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.devices)) return data.devices;
  return [];
}

export default function PhoneApprovalSetup({ onClose }) {
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Güvenlik uygulaması durumu kontrol ediliyor...");
  const [enrollment, setEnrollment] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [ownerEmailChallenge, setOwnerEmailChallenge] = useState(null);
  const [ownerStepUpCode, setOwnerStepUpCode] = useState("");

  const devices = useMemo(() => rowsOf(config), [config]);
  const inactiveDevices = useMemo(() => devices.filter((row) => !row.isActive), [devices]);
  const visibleDevices = useMemo(() => showInactive ? devices : devices.filter((row) => row.isActive), [devices, showInactive]);
  const securityDevices = useMemo(
    () => devices.filter((row) => row.isActive && row.securityApp),
    [devices],
  );
  const securityHasError = useMemo(
    () => securityDevices.some((row) => Boolean(row.lastError)),
    [securityDevices],
  );
  const ownerStepUpRequired = Boolean(config?.ownerEnrollmentStepUpRequired);
  const ownerEmailReady = Boolean(config?.ownerEmailReady);
  const ownerAuthenticatorProviders = Array.isArray(config?.ownerAuthenticatorProviders) ? config.ownerAuthenticatorProviders : [];
  const ownerAuthorizedDevice = securityDevices.find((row) => row.ownerControlAuthorized) || null;
  const clientPlatform = useMemo(() => {
    try {
      const ua = String(window.navigator?.userAgent || "");
      const ios = /iPhone|iPad|iPod/i.test(ua) || (String(window.navigator?.platform || "") === "MacIntel" && Number(window.navigator?.maxTouchPoints || 0) > 1);
      if (ios) return "ios";
      if (/Android/i.test(ua)) return "android";
    } catch { /* noop */ }
    return "desktop";
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await apiGet("/auth/push/config", { _ts: Date.now() });
      const data = result?.data || result;
      setConfig(data);
      const active = rowsOf(data).filter((row) => row.isActive && row.securityApp);
      const hasError = active.some((row) => Boolean(row.lastError));
      setMessage(active.length
        ? (hasError ? "KY ERP Güvenlik kayıtlı; bağlantı uyarısı var. Yeni 8 karakter bağlantı kodu üretip telefonda kod + ADMIN/KY ERP şifresi ile bağlantıyı yenileyin." : "KY ERP Güvenlik kayıtlı ve sunucuda aktif.")
        : "Henüz aktif KY ERP Güvenlik cihazı yok. Telefon veya tablet bağlantısını kurun.");
    } catch (error) {
      setConfig(null);
      setMessage(`Hata: ${error?.message || "Güvenlik cihazları alınamadı."}`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function issueEnrollment({ exposeCode = true } = {}) {
    if (busy) return null;
    setBusy(true);
    setCopied(false);
    try {
      const cleanStepUpCode = String(ownerStepUpCode || "").replace(/\D/g, "");
      if (ownerStepUpRequired && !/^\d{6}$/.test(cleanStepUpCode)) {
        setMessage("Hata: Süper Yönetici telefon kurulumu için e-postadaki veya Google/Microsoft Authenticator uygulamasındaki 6 haneli ek doğrulama kodunu girin.");
        return null;
      }
      const targetDeviceId = ownerAuthorizedDevice?.id || securityDevices[0]?.id || "";
      const payload = { targetDeviceId };
      if (ownerStepUpRequired && ownerEmailChallenge) payload.ownerEmailProof = { challengeId: ownerEmailChallenge.challengeId, challengeToken: ownerEmailChallenge.challengeToken, code: cleanStepUpCode };
      else if (ownerStepUpRequired) payload.ownerAuthenticatorCode = cleanStepUpCode;
      const response = await apiPost("/auth/push/security-enrollment/start", payload);
      const data = response?.data || response;
      if (ownerStepUpRequired) { setOwnerStepUpCode(""); setOwnerEmailChallenge(null); }
      if (exposeCode) setEnrollment(data);
      return data;
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Güvenlik bağlantısı hazırlanamadı."}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendOwnerEnrollmentEmailCode() {
    if (!ownerEmailReady || busy) return;
    setBusy(true);
    try {
      const response = await apiPost("/auth/push/security-enrollment/owner-email/start", {});
      const data = response?.data || response;
      setOwnerEmailChallenge(data);
      setOwnerStepUpCode("");
      setMessage(`E-posta sağlayıcısı ${data?.maskedEmail || config?.ownerEmailMasked || "doğrulanmış adres"} için 6 haneli telefon yetkilendirme kodu isteğini kabul etti. Teslimat birkaç saniye sürebilir; gelen kutusunu kontrol edin.`);
    } catch (error) {
      setOwnerEmailChallenge(null);
      setMessage(`Hata: ${error?.message || "Süper Yönetici telefon doğrulama e-postası gönderilemedi."}`);
    } finally {
      setBusy(false);
    }
  }
  async function authorizeExistingOwnerDevice() {
    if (busy || !securityDevices.length || ownerAuthorizedDevice) return;
    const cleanStepUpCode = String(ownerStepUpCode || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(cleanStepUpCode)) {
      setMessage("Hata: Mevcut telefonu Sistem Telefonu yapmak için e-posta veya Google/Microsoft Authenticator uygulamasındaki 6 haneli ek doğrulama kodunu girin.");
      return;
    }
    setBusy(true);
    try {
      const targetDevice = securityDevices[0];
      const payload = { deviceId: targetDevice.id };
      if (ownerEmailChallenge) {
        payload.ownerEmailProof = {
          challengeId: ownerEmailChallenge.challengeId,
          challengeToken: ownerEmailChallenge.challengeToken,
          code: cleanStepUpCode,
        };
      } else {
        payload.ownerAuthenticatorCode = cleanStepUpCode;
      }
      const response = await apiPost("/auth/push/security-owner-device/authorize", payload);
      const data = response?.data || response;
      setOwnerStepUpCode("");
      setOwnerEmailChallenge(null);
      setMessage(`Sistem Telefonu yetkisi aktif: ${data?.deviceLabel || targetDevice.deviceLabel || "KY Güvenlik"}. Bu telefondan üretilen Sistem Kodu artık tüm kullanıcı hesaplarında kullanılabilir.`);
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Mevcut telefon Sistem Telefonu olarak yetkilendirilemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function createEnrollment() {
    const data = await issueEnrollment({ exposeCode: true });
    if (!data) return;
    setMessage(ownerStepUpRequired ? "Ek Süper Yönetici doğrulaması tamamlandı. 8 karakter bağlantı kodu hazır; telefonda bu kodu ve mevcut KY ERP şifresini birlikte girin." : "8 karakter bağlantı kodu hazır. Telefonda bu kodu ve mevcut KY ERP şifresini birlikte girin.");
  }

  async function copyEnrollment() {
    if (!enrollment) return;
    const text = [
      "KY ERP Güvenlik",
      `Bağlantı kodu: ${enrollment.enrollmentCode || ""}`,
      "Telefon uygulamasında bu kod + mevcut KY ERP şifresi birlikte doğrulanır.",
      "Uygulama: https://security.kyerp.net/guvenlik/",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setMessage("Bağlantı kodu panoya kopyalandı. Telefonda kod + mevcut KY ERP şifresi ile tamamlayın.");
    } catch {
      setMessage("Kopyalama yapılamadı. 8 karakter bağlantı kodunu telefona elle girin.");
    }
  }

  function securityAppUrl(extra = {}, sourceEnrollment = enrollment) {
    const raw = sourceEnrollment?.appUrl || "https://security.kyerp.net/guvenlik/";
    const url = new URL(raw, window.location.origin);
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  async function openSecurityApp() {
    const target = securityAppUrl({}, null);
    if (clientPlatform === "android") {
      const url = new URL(target);
      window.location.href = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(target)};end`;
    } else {
      window.open(target, "_blank", "noopener,noreferrer");
    }
    setMessage("KY Güvenlik açılıyor. Bağlantı yenilenecekse önce 8 karakter bağlantı kodu üretin; telefonda kod + ADMIN / KY ERP şifresini girin.");
  }

  async function openSecurityInstaller(platform) {
    const data = await issueEnrollment({ exposeCode: true });
    if (!data) return;
    const target = securityAppUrl({ install: 1, platform, chrome: platform === "android" ? 1 : undefined }, data);
    if (platform === "android" && clientPlatform === "android") {
      const url = new URL(target);
      window.location.href = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`;
      setMessage(`Chrome açılıyor. Bağlantı kodu: ${data.enrollmentCode}. Kurulumdan sonra telefonda bu kod + ADMIN / KY ERP şifresini girin.`);
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
    setMessage(platform === "ios"
      ? `Safari kurulum ekranı açıldı. Ana Ekrana Ekle sonrası bağlantı kodu ${data.enrollmentCode} + ADMIN / KY ERP şifresi ile tamamlanır.`
      : `KY Güvenlik kurulum ekranı açıldı. Bağlantı kodu ${data.enrollmentCode} + ADMIN / KY ERP şifresi zorunludur.`);
  }

  async function refreshSecurityConnection() {
    if (busy || !securityDevices.length) return;
    setBusy(true);
    try {
      const response = await apiPost("/auth/push/security-refresh", {});
      const data = response?.data || response;
      setMessage(data?.connected
        ? `Telefon bağlantısı doğrulandı. ${Number(data?.delivered || 0)} güvenilir cihaza erişildi.`
        : "Güvenilir cihaz kayıtlı; bildirim erişimi doğrulanamadı. Yeni 8 karakter bağlantı kodu üretip telefonda kod + ADMIN / KY ERP şifresi ile bağlantıyı yenileyin.");
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Telefon bağlantısı yenilenemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function disableDevice(row) {
    if (!row?.id || busy) return;
    setBusy(true);
    try {
      await apiDelete(`/auth/push/devices/${encodeURIComponent(row.id)}`);
      setMessage("Seçilen güvenlik cihazı devre dışı bırakıldı.");
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Cihaz devre dışı bırakılamadı."}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone-approval-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="phone-approval-modal" role="dialog" aria-modal="true" aria-label="KY ERP Güvenlik uygulaması">
        <header>
          <div className="phone-approval-title">
            <span><ShieldCheck size={22} /></span>
            <div>
              <small>KY ERP GÜVENLİ GİRİŞ</small>
              <h2>KY ERP Güvenlik</h2>
              <p>Microsoft Authenticator mantığında ayrı telefon/tablet onay uygulaması. Güvenilir cihaz bağlantısı 8 karakter kod + ADMIN / KY ERP şifresiyle kurulur.</p>
            </div>
          </div>
          <button type="button" className="phone-approval-close" onClick={onClose} aria-label="Kapat"><X size={18}/></button>
        </header>

        <div className={`phone-approval-notice ${message.startsWith("Hata:") ? "bad" : ""}`}>{message}</div>

        <div className="phone-approval-grid phone-approval-grid-clean">
          <section className="phone-approval-card phone-approval-app-hero">
            <div className="phone-approval-card-head">
              <div><span className="phone-approval-install-kicker">KY GÜVENLİK</span><h3>{securityDevices.length ? "Telefon onayı hazır" : "Güvenlik uygulamasını kur"}</h3><p>{securityDevices.length ? "Sunucu cihaz kaydı mevcut. Normal kullanıcı yalnız kendi giriş kodunu kullanır; Süper Yönetici telefonu ek doğrulamayla sistem yönetimine açılır." : "KY ERP ve KY Güvenlik telefonda iki ayrı uygulama olarak çalışır."}</p></div>
              {securityDevices.length && !securityHasError ? <CheckCircle2 size={26}/> : <Smartphone size={26}/>}
            </div>
            {securityDevices.length ? <>
              <div className="phone-approval-status-card ok"><div><b>Bağlantı kayıtlı</b><span>{securityDevices[0]?.deviceLabel || "KY ERP Güvenlik"}</span></div><small>Son bağlantı: {securityDevices[0]?.lastSeenAt ? new Date(securityDevices[0].lastSeenAt).toLocaleString("tr-TR") : "Henüz yok"}</small><small>Son bildirim: {securityDevices[0]?.lastPushAt ? new Date(securityDevices[0].lastPushAt).toLocaleString("tr-TR") : "Henüz yok"}</small></div>
              <div className="phone-approval-main-actions"><button type="button" className="phone-approval-primary" onClick={openSecurityApp} disabled={busy}><ExternalLink size={17}/>{busy ? "Hazırlanıyor..." : "KY Güvenlik Aç"}</button><button type="button" onClick={refreshSecurityConnection} disabled={busy}><RefreshCw size={16}/> Bağlantıyı Kontrol Et</button></div>
              <small className="phone-approval-help">Bağlantı yenilenecekse aşağıdan yeni 8 karakter kod üretin. Süper Yönetici telefonunda önce ek e-posta veya Authenticator doğrulaması tamamlanır.</small>
            </> : <>
              <div className="phone-approval-install-box compact"><strong>Telefonuna KY ERP Güvenlik uygulamasını kur</strong><small>Kurulum bağlantısı hazırlanırken 8 karakter güvenli bağlantı kodu da üretilir.</small><div className="phone-approval-install-actions"><button type="button" className="phone-approval-install-primary" onClick={() => openSecurityInstaller(clientPlatform === "ios" ? "ios" : "android")} disabled={busy}><Download size={18}/>{busy ? "Hazırlanıyor..." : clientPlatform === "ios" ? "iPhone / iPad’e Kur" : "Android’e Kur"}</button></div></div>
              <small className="phone-approval-help">Kurulum tamamlandıktan sonra uygulamada 8 karakter bağlantı kodu ve mevcut KY ERP şifresi birlikte girilir.</small>
            </>}
            {ownerStepUpRequired ? <div className="phone-approval-owner-stepup">
              <div><strong>Süper Yönetici Telefon Yetkilendirmesi</strong><small>Bu yetki yalnız ekstra doğrulanmış tek telefonda açılır. Telefon değişirse veya yeniden kurulursa bu adım tekrar istenir.</small></div>
              <label>6 haneli ek doğrulama kodu<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={ownerStepUpCode} onChange={(event) => setOwnerStepUpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000"/></label>
              <div className="phone-approval-main-actions">
                {ownerEmailReady ? <button type="button" onClick={sendOwnerEnrollmentEmailCode} disabled={busy}>{ownerEmailChallenge ? "E-posta Kodunu Yeniden Gönder" : "E-postaya Kod Gönder"}</button> : null}
                {securityDevices.length && !ownerAuthorizedDevice ? <button type="button" className="phone-approval-primary" onClick={authorizeExistingOwnerDevice} disabled={busy}>{busy ? "Yetkilendiriliyor..." : "Bu Telefonu Sistem Telefonu Yap"}</button> : null}
              </div>
              <small>{ownerEmailChallenge ? `${ownerEmailChallenge.maskedEmail || config?.ownerEmailMasked || "E-posta"} adresine gönderilen kodu girin.` : ownerAuthenticatorProviders.length ? `${ownerAuthenticatorProviders.join(" / ")} Authenticator kodunu doğrudan girebilirsiniz${ownerEmailReady ? " veya e-postaya kod gönderebilirsiniz" : ""}.` : ownerEmailReady ? "E-postaya kod gönderip gelen 6 haneli kodu girin." : "Önce Süper Yönetici Güvenlik Merkezi’nde doğrulanmış e-posta veya Google/Microsoft Authenticator kurun."}</small>
              {ownerAuthorizedDevice ? <small className="phone-approval-help">Yetkili Sistem Telefonu: {ownerAuthorizedDevice.deviceLabel || "KY Güvenlik"} · Bu telefondan üretilen Sistem Kodu tüm kullanıcı hesaplarında geçerlidir. Yeni telefon yetkilendirilince eski telefonun sistem yönetimi kapanır.</small> : securityDevices.length ? <small className="phone-approval-help">Bu mevcut telefonu yeniden kurmadan Sistem Telefonu yapabilirsiniz. Ek doğrulama tamamlandığında telefonun tam sistem yetkisi anında açılır.</small> : null}
            </div> : null}
            {enrollment ? <div className="phone-approval-enrollment compact-code"><span>8 KARAKTER BAĞLANTI KODU · ZORUNLU</span><strong>{enrollment.enrollmentCode}</strong><div className="phone-approval-app-actions"><button type="button" onClick={copyEnrollment}>{copied ? <CheckCircle2 size={16}/> : <Copy size={16}/>} {copied ? "Kopyalandı" : "Kopyala"}</button></div></div> : <button type="button" className="phone-approval-link-button" onClick={createEnrollment} disabled={busy}>Sorun olursa yedek bağlantı kodu oluştur</button>}
          </section>
          <section className="phone-approval-card">
            <div className="phone-approval-card-head"><div><h3>Güvenilir cihazlar</h3><p>{securityDevices.length} KY Güvenlik cihazı aktif</p></div><ShieldCheck size={22}/></div>
            <div className="phone-approval-healthbar"><span className={securityDevices.length && !securityHasError ? "ok" : securityDevices.length ? "warn" : "off"}>{securityDevices.length && !securityHasError ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>} {securityDevices.length && !securityHasError ? "Hazır" : securityDevices.length ? "Kontrol gerekli" : "Bağlı cihaz yok"}</span><div><button type="button" onClick={load} disabled={busy}><RefreshCw size={15}/> Yenile</button>{inactiveDevices.length ? <button type="button" onClick={() => setShowInactive((value) => !value)}>{showInactive ? "Pasifleri Gizle" : "Pasifler (" + inactiveDevices.length + ")"}</button> : null}</div></div>
            <div className="phone-approval-device-list">{visibleDevices.map((row) => <div className={"phone-approval-device " + (row.isActive ? "" : "disabled")} key={row.id}><div><strong>{row.deviceLabel || "KY ERP cihazı"}</strong><span>{row.securityApp ? "KY ERP Güvenlik" : "Eski web onayı"} · {row.isActive ? "Aktif" : "Pasif"}{row.securityAppVersion ? " · " + row.securityAppVersion : ""}</span><small>Son bağlantı: {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("tr-TR") : "Henüz yok"}</small>{row.lastError ? <small className="phone-approval-device-error">{row.lastError}</small> : null}</div>{row.isActive ? <button type="button" className="danger" onClick={() => disableDevice(row)} disabled={busy} title="Cihazı kaldır"><Trash2 size={16}/></button> : null}</div>)}{!devices.length ? <div className="phone-approval-empty">Henüz güvenilir telefon/tablet kaydı yok.</div> : null}</div>
          </section>
        </div>

        <footer>
          <span>Normal kullanıcı yalnız kendi giriş kodunu kullanır. Mevcut Süper Yönetici telefonu ek e-posta/Authenticator doğrulamasıyla yerinde Sistem Telefonuna yükseltilebilir; yeni telefon kurulumu ise ek doğrulama + 8 karakter bağlantı kodu + KY ERP şifresi ister.</span>
          <button type="button" onClick={onClose}>Kapat</button>
        </footer>
      </section>
    </div>
  );
}
