import { apiGet, apiPost, getApiActiveMainCompanySlug } from "../utils/api";

const DB_NAME = "kyerp-pdks-offline-v1";
const DB_VERSION = 1;
const CACHE_STORE = "cache";
const QUEUE_STORE = "queue";
const CACHE_MAX_AGE_MS = 15 * 60 * 1000;
// Only non-personal configuration can be viewed as a short-lived offline fallback.
// Attendance/rosters/dashboard always need a fresh authorized server response.
const OFFLINE_READ_KEYS = /^(profile|masters:|modern-config:|holidays:)/;

function authCacheScope() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.sessionStorage?.getItem("kyerp_auth_user") || window.localStorage?.getItem("kyerp_auth_user");
    const user = raw ? JSON.parse(raw) : null;
    const userId = String(user?.id || user?.userId || "").trim();
    const company = String(getApiActiveMainCompanySlug() || "").trim();
    return userId && company ? `${userId}:${company}:` : "";
  } catch { return ""; }
}

let flushing = null;

function browserReady() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb() {
  if (!browserReady()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(storeName, mode, action) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let request;
    try { request = action(store); } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve(request?.result ?? null);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function cachePut(key, value) {
  await transact(CACHE_STORE, "readwrite", (store) => store.put({ key, value, savedAt: Date.now() }));
}

async function cacheGet(key) {
  const row = await transact(CACHE_STORE, "readonly", (store) => store.get(key));
  if (!row?.savedAt || Date.now() - row.savedAt > CACHE_MAX_AGE_MS) return null;
  return row.value;
}

async function queueAll() {
  const rows = await transact(QUEUE_STORE, "readonly", (store) => store.getAll());
  return Array.isArray(rows) ? rows.sort((a, b) => a.createdAt - b.createdAt) : [];
}

async function queuePut(row) {
  await transact(QUEUE_STORE, "readwrite", (store) => store.put(row));
  notifyQueueChanged();
}

async function queueDelete(id) {
  await transact(QUEUE_STORE, "readwrite", (store) => store.delete(id));
  notifyQueueChanged();
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("kyerp:pdks-offline-queue-changed"));
}

function networkFailure(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (["NETWORK_ERROR", "REQUEST_TIMEOUT"].includes(String(error?.code || "").toUpperCase())) return true;
  if (Number(error?.status || 0) >= 400) return false;
  const message = String(error?.message || error || "").toLowerCase();
  return error instanceof TypeError || message.includes("network") || message.includes("fetch") || message.includes("internet") || message.includes("offline");
}

export async function pdksCachedGet(key, path, params = {}) {
  // Never return cached personal or attendance data on authorization, HTTP or network failures.
  const scope = authCacheScope();
  try {
    const value = await apiGet(path, params);
    if (scope && OFFLINE_READ_KEYS.test(key)) {
      try { await cachePut(scope + key, value); } catch { /* IndexedDB is optional */ }
    }
    return value;
  } catch (error) {
    if (!networkFailure(error) || !scope || !OFFLINE_READ_KEYS.test(key)) throw error;
    let cached = null;
    try { cached = await cacheGet(scope + key); } catch { /* storage unavailable */ }
    if (cached !== null && cached !== undefined) return cached;
    throw error;
  }
}

export async function pdksQueuedPost(path, payload = {}) {
  // A card correction, leave, period close or group edit cannot be silently queued:
  // retries could create duplicates or change an already-closed period.
  // Wait for an acknowledged server commit; never report an offline write as completed.
  try {
    return await apiPost(path, payload);
  } catch (error) {
    if (!networkFailure(error)) throw error;
    const failure = new Error("Bağlantı yok: PDKS işlemi kaydedilmedi. Bağlantı düzelince yeniden önizleyip onaylayın.");
    failure.code = "PDKS_ONLINE_CONFIRMATION_REQUIRED";
    throw failure;
  }
}

export async function getPdksOfflineQueueCount() {
  return (await queueAll()).length;
}

export async function flushPdksOfflineQueue() {
  if (flushing) return flushing;
  // Old unverified queued POST records are preserved, never replayed blindly.
  // A future admin review may migrate only server-idempotent operations with stable IDs.
  const pending = await getPdksOfflineQueueCount();
  return { sent: 0, pending, requiresReview: pending > 0, automaticReplayDisabled: true };
  /* Legacy retry code intentionally disabled:
  flushing = (async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { sent: 0, pending: await getPdksOfflineQueueCount() };
    let sent = 0;
    for (const item of await queueAll()) {
      try {
        if (item.method === "POST") await apiPost(item.path, item.payload);
        else throw new Error(`Desteklenmeyen offline PDKS metodu: ${item.method}`);
        await queueDelete(item.id);
        sent += 1;
      } catch (error) {
        if (networkFailure(error)) break;
        await queuePut({ ...item, attempts: Number(item.attempts || 0) + 1, lastError: String(error?.message || error), lastAttemptAt: Date.now() });
        break;
      }
    }
    return { sent, pending: await getPdksOfflineQueueCount() };
  })();
  try { return await flushing; } finally { flushing = null; }
  */
}

export function installPdksOfflineRuntime() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => { void flushPdksOfflineQueue(); });
  window.setTimeout(() => { void flushPdksOfflineQueue(); }, 1500);
}
