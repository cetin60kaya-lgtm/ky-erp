import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, RefreshCw, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
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

  const devices = useMemo(() => rowsOf(config), [config]);
  const securityDevices = useMemo(
    () => devices.filter((row) => row.isActive && row.securityApp),
    [devices],
  );
  const securityHasError = useMemo(
    () => securityDevices.some((row) => Boolean(row.lastError)),
    [securityDevices],
  );

  const load = useCallback(async () => {
    try {
      const result = await apiGet("/auth/push/config", { _ts: Date.now() });
      const data = result?.data || result;
      setConfig(data);
      const active = rowsOf(data).filter((row) => row.isActive && row.securityApp);
      const hasError = active.some((row) => Boolean(row.lastError));
      setMessage(active.length
        ? (hasError ? "KY ERP Güvenlik kayıtlı; bağlantı uyarısı var. Telefonda Bağlantıyı Yenile işlemini kullanın." : "KY ERP Güvenlik kayıtlı ve sunucuda aktif.")
        : "Henüz aktif KY ERP Güvenlik cihazı yok. Telefon veya tablet bağlantısını kurun.");
    } catch (error) {
      setConfig(null);
      setMessage(`Hata: ${error?.message || "Güvenlik cihazları alınamadı."}`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createEnrollment() {
    if (busy) return;
    setBusy(true);
    setCopied(false);
    try {
      const response = await apiPost("/auth/push/security-enrollment/start", {});
      const data = response?.data || response;
      setEnrollment(data);
      setMessage(securityDevices.length
        ? "10 dakika geçerli Erişim Yenileme Kodu oluşturuldu. Telefonda KY ERP Güvenlik → Erişimi Yeniden Bağla bölümüne girin."
        : "10 dakika geçerli kurulum kodu oluşturuldu. Telefon veya tablette KY ERP Güvenlik uygulamasını açıp bu kodu girin.");
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Kurulum kodu oluşturulamadı."}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyEnrollment() {
    if (!enrollment) return;
    const text = [
      "KY ERP Güvenlik",
      `Kurulum kodu: ${enrollment.enrollmentCode || ""}`,
      "Uygulama: https://app.kyerp.net/security/",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setMessage("Kurulum bilgileri panoya kopyalandı.");
    } catch {
      setMessage("Kopyalama yapılamadı. Kurulum kodunu elle kullanabilirsiniz.");
    }
  }

  function openSecurityApp() {
    const url = enrollment?.appUrl || "https://app.kyerp.net/security/";
    window.open(url, "_blank", "noopener,noreferrer");
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
              <p>Microsoft Authenticator mantığında ayrı telefon/tablet onay uygulaması.</p>
            </div>
          </div>
          <button type="button" className="phone-approval-close" onClick={onClose} aria-label="Kapat"><X size={18}/></button>
        </header>

        <div className={`phone-approval-notice ${message.startsWith("Hata:") ? "bad" : ""}`}>{message}</div>

        <div className="phone-approval-grid">
          <section className="phone-approval-card phone-approval-app-hero">
            <div className="phone-approval-card-head">
              <div>
                <h3>{securityDevices.length ? "Güvenlik uygulaması erişimi" : "Güvenlik uygulamasını kur"}</h3>
                <p>{securityDevices.length ? "Bağlantı koparsa erişim yenileme koduyla aynı telefonu güvenli şekilde yeniden bağlayabilirsiniz." : "Telefon onayı artık ana ERP ekranından değil bu ayrı uygulamadan verilir."}</p>
              </div>
              <Smartphone size={24}/>
            </div>

            <div className="phone-approval-flow">
              <div><b>1</b><span>Kurulum kodu oluştur.</span></div>
              <div><b>2</b><span>Telefon/tablette <strong>app.kyerp.net/security</strong> aç.</span></div>
              <div><b>3</b><span>Kodu ve mevcut KY ERP şifreni gir; bildirim + cihaz güvenliği kurulsun.</span></div>
              <div><b>4</b><span>Sonraki girişlerde tek bildirim → uygulamayı aç → Onayla → Face ID/parmak izi/PIN.</span></div>
            </div>

            {!enrollment ? (
              <button type="button" className="phone-approval-primary" onClick={createEnrollment} disabled={busy}>
                <ShieldCheck size={17}/>{busy ? "Hazırlanıyor..." : securityDevices.length ? "Erişim Yenileme Kodu Oluştur" : "Yeni Kurulum Kodu Oluştur"}
              </button>
            ) : (
              <div className="phone-approval-enrollment">
                <span>10 DAKİKALIK KURULUM KODU</span>
                <strong>{enrollment.enrollmentCode}</strong>
                <small>{enrollment.expiresAt ? `Geçerlilik: ${new Date(enrollment.expiresAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : ""}</small>
                <div className="phone-approval-app-actions">
                  <button type="button" className="phone-approval-primary" onClick={openSecurityApp}>
                    <ExternalLink size={17}/> Güvenlik Uygulamasını Aç
                  </button>
                  <button type="button" onClick={copyEnrollment}>
                    {copied ? <CheckCircle2 size={17}/> : <Copy size={17}/>} {copied ? "Kopyalandı" : "Kodu Kopyala"}
                  </button>
                  <button type="button" onClick={createEnrollment} disabled={busy}>Yeni Kod</button>
                </div>
              </div>
            )}

            <small className="phone-approval-help">
              Android: Chrome/Edge üzerinden uygulamayı yükleyebilirsiniz. iPhone/iPad: Safari → Paylaş → Ana Ekrana Ekle.
              iOS bildirimleri Ana Ekrana eklenmiş web uygulamasında çalışır.
            </small>
          </section>

          <section className="phone-approval-card">
            <div className="phone-approval-healthbar">
              <span className={securityDevices.length && !securityHasError ? "ok" : securityDevices.length ? "warn" : "off"}>
                {securityDevices.length && !securityHasError ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}
                {securityDevices.length && !securityHasError ? "Bağlantı kayıtlı" : securityDevices.length ? "Bağlantı kontrolü gerekli" : "Cihaz bağlı değil"}
              </span>
              <div>
                <button type="button" onClick={load} disabled={busy}><RefreshCw size={15}/> Durumu Yenile</button>
                <button type="button" onClick={openSecurityApp}><ExternalLink size={15}/> KY Güvenlik Aç</button>
              </div>
            </div>
            <div className="phone-approval-card-head">
              <div>
                <h3>Güvenilir telefon ve tabletler</h3>
                <p>{securityDevices.length} yeni güvenlik uygulaması aktif · {devices.filter((row) => row.isActive).length} toplam aktif kayıt</p>
              </div>
              <ShieldCheck size={22}/>
            </div>

            <div className="phone-approval-device-list">
              {devices.map((row) => (
                <div className={`phone-approval-device ${row.isActive ? "" : "disabled"}`} key={row.id}>
                  <div>
                    <strong>{row.deviceLabel || "KY ERP cihazı"}</strong>
                    <span>
                      {row.securityApp ? "KY ERP Güvenlik" : "Eski web onayı"} · {row.isActive ? "Aktif" : "Pasif"}
                      {row.securityAppVersion ? ` · ${row.securityAppVersion}` : ""}
                    </span>
                    <small>Son bağlantı: {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("tr-TR") : "Henüz yok"}</small>
                    <small>Son bildirim: {row.lastPushAt ? new Date(row.lastPushAt).toLocaleString("tr-TR") : "Henüz yok"}</small>
                    {row.lastRefreshAt ? <small>Son erişim yenileme: {new Date(row.lastRefreshAt).toLocaleString("tr-TR")}</small> : null}
                    {row.retiredReason ? <small>{row.retiredReason}</small> : null}
                    {row.lastError ? <small className="phone-approval-device-error">{row.lastError}</small> : null}
                  </div>
                  {row.isActive ? (
                    <button type="button" className="danger" onClick={() => disableDevice(row)} disabled={busy} title="Cihazı kaldır">
                      <Trash2 size={16}/>
                    </button>
                  ) : null}
                </div>
              ))}
              {!devices.length ? <div className="phone-approval-empty">Henüz güvenilir telefon/tablet kaydı yok.</div> : null}
            </div>
          </section>
        </div>

        <footer>
          <span>Eski web-onay cihazları yeni KY ERP Güvenlik uygulaması kaydedildiğinde otomatik emekliye ayrılır; çift bildirim üretilmez.</span>
          <button type="button" onClick={onClose}>Kapat</button>
        </footer>
      </section>
    </div>
  );
}
