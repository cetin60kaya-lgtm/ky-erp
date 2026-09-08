import { useCallback, useEffect, useMemo, useState } from "react";
import "./phone-approval-inbox.css";

const DB_NAME = "kyerp-push-security-v1";
const STORE = "device";
const RECORD_KEY = "active";
const API_BASE = "https://api.kyerp.net/api";
const OPEN_PARAM = "kyerpPhoneApproval";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readDevice() {
  if (!("indexedDB" in window)) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(RECORD_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeDevice(value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, RECORD_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function hasRecentWake() {
  try {
    const device = await readDevice();
    const wake = Date.parse(String(device?.pendingWakeAt || ""));
    return Number.isFinite(wake) && Date.now() - wake < 15 * 60 * 1000;
  } catch {
    return false;
  }
}

async function clearWakeMarker() {
  try {
    const device = await readDevice();
    if (!device?.pendingWakeAt) return;
    const next = { ...device };
    delete next.pendingWakeAt;
    await writeDevice(next);
  } catch {}
}

async function deviceFetch(path, options = {}) {
  const device = await readDevice();
  if (!device?.deviceId || !device?.deviceToken) {
    const error = new Error("Bu telefonda güvenli Telefon Onayı anahtarı bulunamadı. Telefon Onayı ekranından cihazı yeniden kaydedin.");
    error.code = "PUSH_DEVICE_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-KYERP-Push-Device": device.deviceId,
      "X-KYERP-Push-Token": device.deviceToken,
      ...(options.headers || {}),
    },
    cache: "no-store",
    mode: "cors",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error?.message || "KY ERP telefon onayı alınamadı.");
    error.status = response.status;
    error.code = payload?.error?.code || "";
    throw error;
  }
  return payload;
}

function cleanOpenParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(OPEN_PARAM)) return;
    url.searchParams.delete(OPEN_PARAM);
    window.history.replaceState(window.history.state || {}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

export default function PhoneApprovalInboxBridge() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);

  const ordered = useMemo(() => [...items].sort((a, b) =>
    String(a.requestedAt || "").localeCompare(String(b.requestedAt || ""))), [items]);

  const syncBadge = useCallback(async (count) => {
    try {
      if (!("setAppBadge" in navigator)) return;
      if (count > 0) await navigator.setAppBadge(count);
      else if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
    } catch {}
  }, []);

  const checkPending = useCallback(async ({ forceOpen = false } = {}) => {
    try {
      const payload = await deviceFetch("/auth/push/device/pending", { method: "GET" });
      if (!payload) return;
      const next = Array.isArray(payload?.data?.items) ? payload.data.items : [];
      setNeedsSetup(false);
      setItems(next);
      await syncBadge(next.length);
      if (next.length) {
        setOpen(true);
        setMessage("");
      } else if (forceOpen) {
        setOpen(false);
        cleanOpenParam();
      }
    } catch (error) {
      const code = String(error?.code || "");
      if (["PUSH_DEVICE_NOT_CONFIGURED", "PUSH_DEVICE_UNAUTHORIZED"].includes(code)) setNeedsSetup(true);
      if (forceOpen) {
        setMessage(error?.message || "Telefon onayı isteği alınamadı.");
        setOpen(true);
      }
    } finally {
      if (forceOpen) await clearWakeMarker();
    }
  }, [syncBadge]);

  useEffect(() => {
    const queryForcesOpen = (() => {
      try { return new URL(window.location.href).searchParams.get(OPEN_PARAM) === "1"; }
      catch { return false; }
    })();
    const kickoff = window.setTimeout(async () => {
      checkPending({ forceOpen: queryForcesOpen || await hasRecentWake() });
    }, 350);

    const onVisible = async () => {
      if (document.visibilityState === "visible") checkPending({ forceOpen: await hasRecentWake() });
    };
    const onFocus = () => checkPending({ forceOpen: false });
    const onPageShow = async () => checkPending({ forceOpen: queryForcesOpen || await hasRecentWake() });
    const onWorkerMessage = (event) => {
      if (event?.data?.type === "KYERP_PUSH_PENDING_WAKE") checkPending({ forceOpen: true });
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    navigator.serviceWorker?.addEventListener?.("message", onWorkerMessage);

    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") checkPending({ forceOpen: false });
    }, 15000);

    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      navigator.serviceWorker?.removeEventListener?.("message", onWorkerMessage);
    };
  }, [checkPending]);

  async function decide(item, decision) {
    if (!item?.id || busyId) return;
    setBusyId(item.id);
    setMessage("");
    try {
      await deviceFetch("/auth/push/device/decision", {
        method: "POST",
        body: JSON.stringify({ kind: item.kind, id: item.id, decision }),
      });
      const payload = await deviceFetch("/auth/push/device/pending", { method: "GET" });
      const next = Array.isArray(payload?.data?.items) ? payload.data.items : [];
      setItems(next);
      await syncBadge(next.length);
      if (!next.length) {
        setOpen(false);
        cleanOpenParam();
      }
    } catch (error) {
      setMessage(error?.message || "Telefon onayı tamamlanamadı.");
    } finally {
      setBusyId("");
    }
  }

  if (!open) return null;

  return (
    <div className="phone-inbox-backdrop" role="presentation">
      <section className="phone-inbox-modal" role="dialog" aria-modal="true" aria-label="KY ERP telefon giriş onayları">
        <header>
          <div>
            <small>KY ERP · GÜVENLİ TELEFON ONAYI</small>
            <h2>Giriş Onayı</h2>
            <p>iPhone bildiriminde ayrı buton görünmese bile bildirime dokununca bu güvenli ekran açılır.</p>
          </div>
          <span className="phone-inbox-count">{ordered.length}</span>
        </header>

        {message ? <div className="phone-inbox-error">{message}</div> : null}

        <div className="phone-inbox-list">
          {ordered.map((item) => (
            <article className="phone-inbox-item" key={`${item.kind}:${item.id}`}>
              <div>
                <span className="phone-inbox-kind">{item.kind === "SELF_LOGIN" ? "BU HESABIN GİRİŞİ" : "FİRMA GİRİŞ ONAYI"}</span>
                <h3>{item.title || "KY ERP giriş isteği"}</h3>
                <p>{item.body || "Yeni bir giriş isteği onay bekliyor."}</p>
                <small>{item.requestedAt ? new Date(item.requestedAt).toLocaleString("tr-TR") : ""}</small>
              </div>
              <div className="phone-inbox-actions">
                <button type="button" className="approve" disabled={Boolean(busyId)} onClick={() => decide(item, "APPROVE")}>
                  {busyId === item.id ? "İşleniyor..." : "Onayla"}
                </button>
                <button type="button" className="deny" disabled={Boolean(busyId)} onClick={() => decide(item, "DENY")}>
                  Reddet
                </button>
              </div>
            </article>
          ))}
          {!ordered.length ? <div className="phone-inbox-empty">Bekleyen giriş onayı yok.</div> : null}
        </div>

        <footer>
          <span>Karar yalnız bu telefona daha önce güvenli şekilde kaydedilmiş cihaz anahtarıyla gönderilir.</span>
          <div className="phone-inbox-footer-actions">
            {needsSetup ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  cleanOpenParam();
                  window.dispatchEvent(new CustomEvent("kyerp:open-phone-approval-setup"));
                }}
              >
                Telefonu Yeniden Kaydet
              </button>
            ) : null}
            <button type="button" onClick={() => { setOpen(false); cleanOpenParam(); }}>Kapat</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
