import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import "./phone-approval-setup.css";

const LOCAL_DEVICE_ID = "kyerp_push_device_id_v1";

function rowsOf(value) {
  const data = value?.data ?? value;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.devices)) return data.devices;
  return [];
}

function applicationServerKey(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function isIosDevice() {
  const ua = String(navigator.userAgent || "");
  return /iPhone|iPad|iPod/i.test(ua) ||
    (String(navigator.platform || "") === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1);
}

function isStandaloneWebApp() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true);
}

function defaultDeviceLabel() {
  const ua = String(navigator.userAgent || "");
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  const platform = String(navigator.userAgentData?.platform || navigator.platform || "").trim();
  return `${mobile ? "Telefon" : "Tarayıcı"}${platform ? ` · ${platform}` : ""}`;
}

async function activeServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Bu tarayıcı Service Worker desteklemiyor.");
  await navigator.serviceWorker.register("/kyerp-push-sw.js", { scope: "/" });
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error("KY ERP bildirim servisi zamanında hazırlanamadı.")), 8000)),
  ]);
  if (!registration?.active) throw new Error("KY ERP bildirim servisi henüz hazır değil. Uygulamayı kapatıp Ana Ekrandaki KY ERP ikonundan yeniden açın.");
  return registration;
}

function sendWorkerCredentials(registration, data) {
  registration?.active?.postMessage({ type: "KYERP_PUSH_CREDENTIALS", ...data });
}

export default function PhoneApprovalSetup({ onClose }) {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [password, setPassword] = useState("");
  const [deviceLabel, setDeviceLabel] = useState(defaultDeviceLabel);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Telefon onayı durumu kontrol ediliyor...");

  const manager = ["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(String(user?.role || "").toUpperCase());
  const ios = isIosDevice();
  const standalone = isStandaloneWebApp();
  const devices = useMemo(() => rowsOf(config), [config]);
  const localDeviceId = (() => {
    try { return String(window.localStorage.getItem(LOCAL_DEVICE_ID) || ""); }
    catch { return ""; }
  })();

  const browserSupported = typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator;
  const iosReady = !ios || standalone;
  const supported = browserSupported && iosReady;

  const load = useCallback(async () => {
    try {
      const result = await apiGet("/auth/push/config", { _ts: Date.now() });
      setConfig(result?.data || result);
      setMessage("Telefon onayı hazır. Kayıtlı cihazlar aşağıda.");
    } catch (error) {
      setConfig(null);
      setMessage(`Hata: ${error?.message || "Telefon onayı ayarları alınamadı."}`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function registerDevice() {
    if (ios && !standalone) return setMessage("Hata: iPhone bildirimleri için KY ERP önce Ana Ekrana eklenip uygulama olarak açılmalıdır.");
    if (!browserSupported) return setMessage("Hata: Bu tarayıcı güvenli web bildirimlerini desteklemiyor.");
    if (!password) return setMessage("Hata: Güvenilir telefon kaydı için mevcut şifrenizi girin.");
    if (!config?.applicationServerKey) return setMessage("Hata: KY ERP bildirim anahtarı hazırlanmadı.");

    setBusy(true);
    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Bildirim izni verilmedi. Tarayıcı ayarlarından KY ERP bildirimlerine izin verin.");

      const registration = await activeServiceWorker();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.applicationServerKey),
        });
      }

      const response = await apiPost("/auth/push/devices/register", {
        password,
        deviceLabel: deviceLabel.trim() || defaultDeviceLabel(),
        subscription: subscription.toJSON(),
        selfLoginEnabled: true,
        managerApprovalEnabled: manager,
      });
      const device = response?.data || response;
      if (!device?.deviceId || !device?.deviceToken) throw new Error("Güvenilir cihaz anahtarı alınamadı.");

      sendWorkerCredentials(registration, {
        deviceId: device.deviceId,
        deviceToken: device.deviceToken,
      });
      try { window.localStorage.setItem(LOCAL_DEVICE_ID, String(device.deviceId)); } catch {}
      setPassword("");
      setMessage("Bu cihaz güvenilir telefon onayı cihazı olarak kaydedildi. Bundan sonraki girişlerde bildirimden Onayla diyebilirsiniz.");
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Telefon onayı cihazı kaydedilemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function disableDevice(row) {
    if (!row?.id || busy) return;
    setBusy(true);
    try {
      await apiDelete(`/auth/push/devices/${encodeURIComponent(row.id)}`);
      if (String(row.id) === localDeviceId) {
        try {
          const registration = await activeServiceWorker();
          registration.active?.postMessage({ type: "KYERP_PUSH_CLEAR" });
        } catch {}
        try { window.localStorage.removeItem(LOCAL_DEVICE_ID); } catch {}
      }
      setMessage("Seçilen telefon onayı cihazı devre dışı bırakıldı.");
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Cihaz devre dışı bırakılamadı."}`);
    } finally {
      setBusy(false);
    }
  }

  async function localTest() {
    try {
      if (Notification.permission !== "granted") throw new Error("Önce bildirim izni verin.");
      const registration = await activeServiceWorker();
      await registration.showNotification("KY ERP · Telefon Onayı Hazır", {
        body: "Bu cihaz KY ERP güvenlik bildirimlerini gösterebiliyor.",
        icon: "/kyerp-icon.svg",
        badge: "/kyerp-icon.svg",
        tag: "kyerp-push-local-test",
      });
      setMessage("Deneme bildirimi bu cihazda gösterildi.");
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Deneme bildirimi gösterilemedi."}`);
    }
  }

  return (
    <div className="phone-approval-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="phone-approval-modal" role="dialog" aria-modal="true" aria-label="Telefon onayı ayarları">
        <header>
          <div className="phone-approval-title">
            <span><Smartphone size={22} /></span>
            <div><small>KY ERP GÜVENLİ GİRİŞ</small><h2>Telefonla Onay</h2><p>6 haneli kod yerine telefon bildiriminden Onayla / Reddet.</p></div>
          </div>
          <button type="button" className="phone-approval-close" onClick={onClose} aria-label="Kapat"><X size={18}/></button>
        </header>

        <div className={`phone-approval-notice ${message.startsWith("Hata:") ? "bad" : ""}`}>{message}</div>

        {ios && !standalone ? (
          <div className="phone-approval-warning">
            <strong>iPhone kurulumu gerekli</strong>
            <span>Safari’de app.kyerp.net’i açın → Paylaş → Ana Ekrana Ekle. iOS 26 ve üzerindeyse “Web Uygulaması Olarak Aç” seçeneği açık kalsın. Sonra Ana Ekrandaki KY ERP ikonundan açıp bu ekrandan bildirim izni verin.</span>
          </div>
        ) : !browserSupported ? (
          <div className="phone-approval-warning">
            <strong>Bu tarayıcı push bildirimini desteklemiyor.</strong>
            <span>Android Chrome/Edge veya iPhone/iPad’de Ana Ekrana eklenmiş KY ERP web uygulamasını kullanın.</span>
          </div>
        ) : null}

        <div className="phone-approval-grid">
          <section className="phone-approval-card">
            <div className="phone-approval-card-head">
              <div><h3>Bu cihazı kaydet</h3><p>Bu işlemi mümkünse telefonunuzdan yapın.</p></div>
              <ShieldCheck size={22}/>
            </div>
            <label>Cihaz adı
              <input value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} maxLength={180}/>
            </label>
            <label>Mevcut şifreniz
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Güvenlik doğrulaması"/>
            </label>
            <button type="button" className="phone-approval-primary" onClick={registerDevice} disabled={busy || !supported}>
              <BellRing size={17}/>{busy ? "Kaydediliyor..." : "Bildirimleri Aç ve Bu Cihazı Kaydet"}
            </button>
            <button type="button" onClick={localTest} disabled={busy || !supported}>Bu cihazda deneme bildirimi</button>
            <small className="phone-approval-help">Cihaz ekleme, açık oturumla tek başına yapılamaz; mevcut şifreyle yeniden doğrulama zorunludur. iPhone’da bildirimde ayrı Onayla/Reddet butonları görünmese bile bildirime dokununca KY ERP güvenli onay ekranı açılır.</small>
          </section>

          <section className="phone-approval-card">
            <div className="phone-approval-card-head">
              <div><h3>Güvenilir cihazlar</h3><p>{devices.filter((row) => row.isActive).length} aktif cihaz</p></div>
              <Smartphone size={22}/>
            </div>
            <div className="phone-approval-device-list">
              {devices.map((row) => (
                <div className={`phone-approval-device ${row.isActive ? "" : "disabled"}`} key={row.id}>
                  <div>
                    <strong>{row.deviceLabel || "KY ERP cihazı"}{String(row.id) === localDeviceId ? " · Bu cihaz" : ""}</strong>
                    <span>{row.isActive ? "Aktif" : "Pasif"} · Giriş bildirimi {row.selfLoginEnabled ? "açık" : "kapalı"}{manager ? ` · Yönetici onayı ${row.managerApprovalEnabled ? "açık" : "kapalı"}` : ""}</span>
                    <small>Son kullanım: {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("tr-TR") : "Henüz yok"}</small>
                    {row.lastError ? <small className="phone-approval-device-error">{row.lastError}</small> : null}
                  </div>
                  {row.isActive ? <button type="button" className="danger" onClick={() => disableDevice(row)} disabled={busy} title="Cihazı kaldır"><Trash2 size={16}/></button> : null}
                </div>
              ))}
              {!devices.length ? <div className="phone-approval-empty">Henüz güvenilir telefon kaydı yok.</div> : null}
            </div>
          </section>
        </div>

        <footer>
          <span>Google/Microsoft Authenticator 6 haneli kodu yedek yöntem olarak korunur.</span>
          <button type="button" onClick={onClose}>Kapat</button>
        </footer>
      </section>
    </div>
  );
}
