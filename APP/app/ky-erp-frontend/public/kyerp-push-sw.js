const DB_NAME = "kyerp-push-security-v1";
const STORE = "device";
const RECORD_KEY = "active";
const API_BASE = "https://api.kyerp.net/api";

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

async function clearDevice() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(RECORD_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function markPendingWake() {
  try {
    const current = await readDevice();
    if (!current) return;
    await writeDevice({ ...current, pendingWakeAt: new Date().toISOString() });
  } catch {}
}

async function deviceFetch(path, options = {}) {
  const device = await readDevice();
  if (!device?.deviceId || !device?.deviceToken) throw new Error("PUSH_DEVICE_NOT_CONFIGURED");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-KYERP-Push-Device": device.deviceId,
    "X-KYERP-Push-Token": device.deviceToken,
    ...(options.headers || {}),
  };
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
    mode: "cors",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || "KY ERP telefon onayı başarısız.");
  return payload;
}

async function broadcastPendingWake() {
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
  await Promise.all(windows.map((client) => client.postMessage({ type: "KYERP_PUSH_PENDING_WAKE" })));
}

function stableNotificationTag(item) {
  if (String(item?.kind || "") === "SELF_LOGIN") return "kyerp-self-login";
  const key = String(item?.dedupeKey || item?.mainCompanySlug || item?.id || "approval")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 120);
  return `kyerp-manager-${key}`;
}

async function closeStaleApprovalNotifications(activeTags = new Set()) {
  try {
    const visible = await self.registration.getNotifications();
    for (const notification of visible) {
      const tag = String(notification.tag || "");
      if (
        (tag === "kyerp-self-login" || tag.startsWith("kyerp-manager-") || tag === "kyerp-generic-security-wake") &&
        !activeTags.has(tag)
      ) notification.close();
    }
  } catch {}
}

async function showPending() {
  let payload = null;
  let fetchFailed = false;
  try {
    payload = await deviceFetch("/auth/push/device/pending", { method: "GET" });
  } catch {
    fetchFailed = true;
  }

  const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
  if (!items.length) {
    await closeStaleApprovalNotifications(new Set());
    if (fetchFailed) {
      // iOS userVisibleOnly: pending listesi alınamazsa push tamamen sessiz bırakılamaz.
      await self.registration.showNotification("KY ERP · Giriş Onayı", {
        body: "KY ERP güvenlik isteğini kontrol etmek için uygulamayı açın.",
        tag: "kyerp-generic-security-wake",
        renotify: false,
        requireInteraction: true,
        badge: "/kyerp-icon.svg",
        icon: "/kyerp-icon.svg",
        timestamp: Date.now(),
        vibrate: [180, 80, 180],
        data: { openApproval: true },
      });
    }
    await broadcastPendingWake();
    return;
  }

  const activeTags = new Set(items.slice(0, 8).map(stableNotificationTag));
  await closeStaleApprovalNotifications(activeTags);

  await Promise.all(items.slice(0, 8).map((item) => self.registration.showNotification(
    item.title || "KY ERP güvenlik onayı",
    {
      body: item.body || "Yeni bir güvenlik isteği onay bekliyor.",
      tag: stableNotificationTag(item),
      renotify: false,
      requireInteraction: true,
      badge: "/kyerp-icon.svg",
      icon: "/kyerp-icon.svg",
      timestamp: item.requestedAt ? Date.parse(item.requestedAt) || Date.now() : Date.now(),
      vibrate: [180, 80, 180],
      data: {
        kind: item.kind,
        id: item.id,
        mainCompanySlug: item.mainCompanySlug || "",
        openApproval: true,
      },
      // Chromium doğrudan aksiyonları kullanır. iPhone bu aksiyonları göstermese bile
      // bildirime dokunulduğunda KY ERP foreground köprüsü aynı isteği güvenli ekranda açar.
      actions: [
        { action: "approve", title: "Onayla" },
        { action: "deny", title: "Reddet" },
      ],
    },
  )));
  await broadcastPendingWake();
}

async function decide(kind, id, decision) {
  return deviceFetch("/auth/push/device/decision", {
    method: "POST",
    body: JSON.stringify({ kind, id, decision }),
  });
}

async function focusOrOpen(path = "/?kyerpPhoneApproval=1") {
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((client) => {
    try { return new URL(client.url).origin === self.location.origin; }
    catch { return false; }
  });
  if (existing) {
    await existing.focus();
    try { await existing.navigate(path); } catch {}
    return;
  }
  await clients.openWindow(path);
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "KYERP_PUSH_CREDENTIALS" && data.deviceId && data.deviceToken) {
    event.waitUntil(writeDevice({
      deviceId: String(data.deviceId),
      deviceToken: String(data.deviceToken),
      localUnlockRequired: Boolean(data.localUnlockRequired),
      localUnlockCredentialId: String(data.localUnlockCredentialId || ""),
      savedAt: new Date().toISOString(),
    }));
  } else if (data.type === "KYERP_PUSH_CLEAR") {
    event.waitUntil(clearDevice());
  } else if (data.type === "KYERP_PUSH_TEST_PENDING") {
    event.waitUntil(showPending());
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    await markPendingWake();
    await showPending();
  })());
});

self.addEventListener("notificationclick", (event) => {
  const action = String(event.action || "");
  const data = event.notification?.data || {};
  event.notification?.close();

  if (!data.id || !data.kind || !["approve", "deny"].includes(action)) {
    // iOS'ta notification action butonları görünmeyebilir veya notificationclick
    // kimi sürümlerde JS handler'ına ulaşmayabilir. Sistem yine uygulamayı foreground'a
    // getirir; sayfadaki PhoneApprovalInboxBridge görünür olur olmaz pending isteği çeker.
    event.waitUntil(focusOrOpen("/?kyerpPhoneApproval=1"));
    return;
  }

  event.waitUntil((async () => {
    try {
      const device = await readDevice();
      if (action === "approve" && device?.localUnlockRequired && device?.localUnlockCredentialId) {
        // Platform biyometrisi/PIN yalnız foreground pencerede çağrılabilir.
        await focusOrOpen(`/?kyerpPhoneApproval=1&approvalKind=${encodeURIComponent(data.kind)}&approvalId=${encodeURIComponent(data.id)}`);
        return;
      }

      await decide(data.kind, data.id, action === "approve" ? "APPROVE" : "DENY");
      await broadcastPendingWake();
      // Tek bildirim -> tek karar -> tamam. İkinci "onaylandı" bildirimi üretilmez.
    } catch {
      await focusOrOpen("/?kyerpPhoneApproval=1");
    }
  })());
});
