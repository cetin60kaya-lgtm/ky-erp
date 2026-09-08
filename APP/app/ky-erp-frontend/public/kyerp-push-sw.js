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

async function closeLegacyApprovalNotifications(includeCurrent = false) {
  try {
    const notifications = await self.registration.getNotifications();
    for (const notification of notifications) {
      const tag = String(notification.tag || "");
      const legacy = tag === "kyerp-generic-security-wake" ||
        tag.startsWith("kyerp-SELF_LOGIN-") ||
        tag.startsWith("kyerp-MANAGER_APPROVAL-") ||
        tag.startsWith("kyerp-result-") ||
        tag.startsWith("kyerp-error-");
      if (legacy || (includeCurrent && tag === "kyerp-security-pending")) notification.close();
    }
  } catch {}
}

async function showPending() {
  await closeLegacyApprovalNotifications(false);
  let payload = null;
  try {
    payload = await deviceFetch("/auth/push/device/pending", { method: "GET" });
  } catch {
    // Safari/iOS userVisibleOnly kuralı gereği push hiçbir koşulda sessiz kalmaz.
  }

  const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
  const single = items.length === 1 ? items[0] : null;
  const title = single?.title || (items.length > 1 ? "KY ERP · Onaylar Bekliyor" : "KY ERP · Giriş Onayı");
  const body = single?.body || (items.length > 1
    ? `${items.length} güvenlik/onay isteği bekliyor. KY ERP Bildirim Merkezi'ni açın.`
    : "Yeni bir giriş isteği var. KY ERP'yi açıp Onayla veya Reddet seçin.");

  const notification = {
    body,
    tag: "kyerp-security-pending",
    renotify: false,
    requireInteraction: true,
    badge: "/kyerp-icon.svg",
    icon: "/kyerp-icon.svg",
    timestamp: single?.requestedAt ? Date.parse(single.requestedAt) || Date.now() : Date.now(),
    vibrate: [180, 80, 180],
    data: {
      kind: single?.kind || "",
      id: single?.id || "",
      mainCompanySlug: single?.mainCompanySlug || "",
      openApproval: true,
    },
  };

  if (single?.id && single?.kind) {
    notification.actions = [
      { action: "approve", title: "Onayla" },
      { action: "deny", title: "Reddet" },
    ];
  }

  await self.registration.showNotification(title, notification);
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
      await decide(data.kind, data.id, action === "approve" ? "APPROVE" : "DENY");
      await closeLegacyApprovalNotifications(true);
      await broadcastPendingWake();
    } catch (error) {
      await self.registration.showNotification("KY ERP · İşlem tamamlanamadı", {
        body: error?.message || "Onay isteğini tekrar kontrol edin.",
        tag: `kyerp-error-${data.id}`,
        icon: "/kyerp-icon.svg",
      });
    }
  })());
});
