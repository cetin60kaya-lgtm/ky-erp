import { apiGet, apiPost } from "../utils/api";

const DB_NAME = "kyerp-pdks-offline-v1";
const DB_VERSION = 1;
const CACHE_STORE = "cache";
const QUEUE_STORE = "queue";
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
  return row?.value;
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
  const message = String(error?.message || error || "").toLowerCase();
  return error instanceof TypeError || message.includes("network") || message.includes("fetch") || message.includes("internet") || message.includes("offline");
}

export async function pdksCachedGet(key, path, params = {}) {
  try {
    const value = await apiGet(path, params);
    await cachePut(key, value);
    return value;
  } catch (error) {
    // 401/403 and validation failures are never connectivity failures.
    // Do not serve a previous user's cached PDKS rows after access is denied.
    if (!networkFailure(error)) throw error;
    const cached = await cacheGet(key);
    if (cached !== undefined && cached !== null) return cached;
    throw error;
  }
}

export async function pdksQueuedPost(path, payload = {}) {
  try {
    return await apiPost(path, payload);
  } catch (error) {
    if (!networkFailure(error)) throw error;
    const id = crypto.randomUUID();
    await queuePut({ id, method: "POST", path, payload, createdAt: Date.now(), attempts: 0 });
    return { ok: true, data: { offlineQueued: true, queueId: id, syncStatus: "PENDING" } };
  }
}

export async function getPdksOfflineQueueCount() {
  return (await queueAll()).length;
}

export async function flushPdksOfflineQueue() {
  if (flushing) return flushing;
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
}

export function installPdksOfflineRuntime() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => { void flushPdksOfflineQueue(); });
  window.setTimeout(() => { void flushPdksOfflineQueue(); }, 1500);
}
