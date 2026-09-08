import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import "./phone-approval-setup.css";

const LOCAL_DEVICE_ID = "kyerp_push_device_id_v1";
const DEVICE_DB_NAME = "kyerp-push-security-v1";
const DEVICE_STORE = "device";
const DEVICE_RECORD_KEY = "active";

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

function bytesToBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function enrollLocalDeviceUnlock(user, deviceId) {
  if (!window.PublicKeyCredential || !navigator.credentials?.create) return "";
  const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
  if (!available) return "";

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const rawUserId = new TextEncoder().encode(String(user?.id || deviceId || "kyerp-user"));
  const userId = rawUserId.length <= 64
    ? rawUserId
    : new Uint8Array(await crypto.subtle.digest("SHA-256", rawUserId));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "KY ERP", id: window.location.hostname },
      user: {
        id: userId,
        name: String(user?.email || user?.username || user?.id || "kyerp-user"),
        displayName: String(user?.fullName || user?.username || "KY ERP Kullanıcısı"),
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 60000,
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      attestation: "none",
    },
  });
  return credential?.rawId ? bytesToBase64Url(credential.rawId) : "";
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
  const width = Math.min(
    Number(window.screen?.width || window.innerWidth || 0),
    Number(window.screen?.height || window.innerHeight || 0),
  );
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) || width <= 600 ? "Android Telefon" : "Android Tablet";
  if (/iPad/i.test(ua) || (String(navigator.platform || "") === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1)) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Windows Bilgisayar";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  return "KY ERP Cihazı";
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

async function persistDeviceCredentials(data) {
  if (!("indexedDB" in window)) throw new Error("Bu tarayıcı güvenli cihaz anahtarını saklayamıyor.");
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DEVICE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DEVICE_STORE)) request.result.createObjectStore(DEVICE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_STORE, "readwrite");
    tx.objectStore(DEVICE_STORE).put(data, DEVICE_RECORD_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
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

      let localUnlockCredentialId = "";
      try {
        localUnlockCredentialId = await enrollLocalDeviceUnlock(user, device.deviceId);
      } catch {
        // Kullanıcı biyometri/PIN kurulumunu kapatırsa telefon onayı yine mevcut
        // güvenli cihaz anahtarıyla çalışır; ek yerel kilit sadece opsiyoneldir.
      }

      const deviceCredentials = {
        deviceId: device.deviceId,
        deviceToken: device.deviceToken,
        localUnlockRequired: Boolean(localUnlockCredentialId),
        localUnlockCredentialId,
        savedAt: new Date().toISOString(),
      };
      await persistDeviceCredentials(deviceCredentials);
      sendWorkerCredentials(registration, deviceCredentials);
      try { window.localStorage.setItem(LOCAL_DEVICE_ID, String(device.deviceId)); } catch {}
      setPassword("");
      setMessage(localUnlockCredentialId
        ? "Bu cihaz kaydedildi. Bundan sonraki girişlerde tek bildirim gelir; Onayla sonrası Face ID / parmak izi / cihaz PIN'i ile ek doğrulama istenir."
        : "Bu cihaz kaydedildi. Bundan sonraki girişlerde tek bildirim gelir; Onayla işlemi bir kez gönderilir.");
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
            <small className="phone-approval-help">Cihaz ekleme için mevcut KY ERP şifresi zorunludur. Telefon destekliyorsa kayıt sırasında ek cihaz kilidi de kurulur: iPhone/iPad’de Face ID / Touch ID / cihaz kodu, Android’de parmak izi / ekran kilidi / PIN. Bu ek kilit kurulamazsa telefon onayı mevcut güvenli cihaz anahtarıyla çalışmaya devam eder.</small>
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
