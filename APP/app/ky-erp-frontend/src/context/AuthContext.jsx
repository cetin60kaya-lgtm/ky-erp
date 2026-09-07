import { useCallback, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, clearApiGetCache, setApiAuthHandlers } from "../utils/api";
import { clearResilientDataCache } from "../utils/resilientDataLoader";
import { shouldClearStoredAuthForStatus } from "./authSessionPolicy";

const AUTH_TOKEN_KEY = "kyerp_auth_token";
const AUTH_USER_KEY = "kyerp_auth_user";
const AUTH_DEVICE_KEY = "kyerp_auth_device_v1";
const AUTH_REFRESH_PENDING_KEY = "kyerp_auth_refresh_pending_v1";
const AUTH_REFRESH_LOCK_KEY = "kyerp_auth_refresh_lock_v1";
const AUTH_TAB_KEY = "kyerp_auth_tab_v1";
const AUTH_VERSION = "canonical-v3";
const NORMAL_REFRESH_BEFORE_MS = 30 * 60 * 1000;
const REFRESH_RETRY_MS = 60 * 1000;
const REFRESH_LOCK_MS = 30 * 1000;

const MODULE_KEYS = [
  "DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME",
  "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET", "MAIL", "STORAGE_ADMIN", "ASISTAN", "ADMIN", "RAPORLAR",
];

const AuthContext = createContext(null);

function normalizePermissionRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    moduleKey: String(row?.moduleKey || "").toUpperCase(),
    canView: row.canView === true,
    canCreate: row.canCreate === true,
    canUpdate: row.canUpdate === true,
    canDelete: row.canDelete === true,
    canApprove: row.canApprove === true,
  })).filter((row) => MODULE_KEYS.includes(row.moduleKey));
}

function cleanLegacyAuthStorage() {
  ["kyerp.auth", "kyerp_user", "token", "authToken"].forEach((key) => {
    try { window.localStorage.removeItem(key); } catch { /* noop */ }
  });
}

function stableBrowserDeviceLabel() {
  try {
    const stored = String(window.localStorage.getItem(AUTH_DEVICE_KEY) || "").trim();
    if (stored) return `BROWSER:${stored}`;
    const generated = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    window.localStorage.setItem(AUTH_DEVICE_KEY, generated);
    return `BROWSER:${generated}`;
  } catch {
    const generated = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    return `BROWSER:${generated}`;
  }
}

function stableTabId() {
  try {
    const stored = String(window.sessionStorage.getItem(AUTH_TAB_KEY) || "").trim();
    if (stored) return stored;
    const generated = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    window.sessionStorage.setItem(AUTH_TAB_KEY, generated);
    return generated;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
}

function acquireRefreshLock(ownerId) {
  try {
    const now = Date.now();
    let current = null;
    try { current = JSON.parse(window.localStorage.getItem(AUTH_REFRESH_LOCK_KEY) || "null"); } catch { current = null; }
    if (current?.owner && current.owner !== ownerId && Number(current.expiresAt || 0) > now) return false;
    const next = { owner: ownerId, expiresAt: now + REFRESH_LOCK_MS };
    window.localStorage.setItem(AUTH_REFRESH_LOCK_KEY, JSON.stringify(next));
    const confirmed = JSON.parse(window.localStorage.getItem(AUTH_REFRESH_LOCK_KEY) || "null");
    return confirmed?.owner === ownerId;
  } catch {
    return true;
  }
}

function releaseRefreshLock(ownerId) {
  try {
    const current = JSON.parse(window.localStorage.getItem(AUTH_REFRESH_LOCK_KEY) || "null");
    if (!current || current.owner === ownerId) window.localStorage.removeItem(AUTH_REFRESH_LOCK_KEY);
  } catch { /* noop */ }
}

function parseJwtPayload(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(window.atob(padded));
  } catch { return null; }
}

function isTokenUsable(token) {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload?.exp !== "number") return false;
  return payload.exp > Math.floor(Date.now() / 1000) + 5;
}

function isSuperAdmin(role) {
  return ["SUPER_ADMIN", "ADMIN"].includes(String(role || "").toUpperCase());
}

function isOwnerAuthPair(token, user) {
  const tokenRole = parseJwtPayload(token)?.role;
  return isSuperAdmin(tokenRole) || isSuperAdmin(user?.role);
}

function sessionRefreshDelay(token, role) {
  if (isSuperAdmin(role)) return 0;
  const payload = parseJwtPayload(token);
  const expiresAtMs = Number(payload?.exp || 0) * 1000;
  const remaining = expiresAtMs - Date.now();
  if (!(remaining > 5000)) return 0;

  const target = remaining - NORMAL_REFRESH_BEFORE_MS;
  const latestSafe = Math.max(5000, remaining - 5000);
  return Math.min(Math.max(5000, target), latestSafe);
}

function requestPathText(requestUrl) {
  try { return new URL(String(requestUrl || ""), window.location.origin).pathname; }
  catch { return String(requestUrl || ""); }
}

function authErrorMessage(status, payload, requestUrl = "") {
  const serverMessage = String(payload?.error?.message || payload?.message || "").trim();
  if (serverMessage) return serverMessage;
  if (status === 400) return "Girilen bilgileri kontrol edip tekrar deneyin.";
  if (status === 401) return "Kullanıcı adı/e-posta veya şifre hatalı.";
  if (status === 403) return "Bu hesapla girişe izin verilmiyor.";
  if (status === 404 || status === 405) {
    const path = requestPathText(requestUrl);
    return `KY ERP giriş endpointi yanıt vermedi (HTTP ${status}${path ? ` · ${path}` : ""}).`;
  }
  if (status === 409) return "Giriş doğrulaması mevcut durumla çakıştı. Yeniden giriş yapın.";
  if (status === 422) return "Giriş bilgileri sunucu tarafından işlenemedi. Tekrar deneyin.";
  if (status === 429) return "Çok fazla giriş denemesi yapıldı. Kısa bir süre sonra tekrar deneyin.";
  if (status >= 500) return "KY ERP giriş servisi geçici olarak yanıt veremedi. Tekrar deneyin.";
  return status > 0 ? `Giriş işlemi tamamlanamadı (HTTP ${status}).` : "Giriş işlemi tamamlanamadı.";
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function directAuthRequest(path, options = {}) {
  const { method = "POST", body, token = "", timeoutMs = 20000 } = options;
  const normalizedPath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
  const requestUrl = `${API_BASE}${normalizedPath}`;
  const loginTransportRetry = normalizedPath === "/auth/login" && String(method).toUpperCase() === "POST" && !token;
  const maxAttempts = loginTransportRetry ? 2 : 1;
  let lastTransportError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: "application/json" };
      if (body !== undefined) {
        // JSON metni text/plain ile taşınır. Bu Content-Type CORS safelist kapsamındadır;
        // kyerp.net -> api.kyerp.net girişinde gereksiz OPTIONS/preflight oluşmaz.
        // Backend Request.json() gövdeyi aynı JSON olarak okumaya devam eder.
        headers["Content-Type"] = "text/plain;charset=UTF-8";
      }
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(requestUrl, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
        mode: "cors",
      });
      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      const requestId = response.headers.get("X-Request-Id") || payload?.error?.details?.requestId || payload?.requestId || "";
      const authVersion = response.headers.get("X-KYERP-Auth-Version") || payload?.authVersion || "";
      const validJsonPayload = payload && typeof payload === "object" && !Array.isArray(payload);
      if (response.ok && !validJsonPayload) {
        const contentType = String(response.headers.get("Content-Type") || "");
        const error = new Error(`KY ERP giriş servisi JSON yerine geçersiz yanıt döndürdü${contentType ? ` (${contentType})` : ""}.`);
        Object.assign(error, { status: response.status, code: "AUTH_INVALID_RESPONSE", requestUrl, requestId, responseText: String(raw || "").slice(0, 240) });
        throw error;
      }
      if (!response.ok || payload?.ok === false) {
        const error = new Error(authErrorMessage(response.status, payload, requestUrl));
        Object.assign(error, { status: response.status, code: payload?.error?.code || payload?.code || "AUTH_HTTP_ERROR", payload, requestId, requestUrl, responseText: String(raw || "").slice(0, 240) });
        throw error;
      }
      if (authVersion && authVersion !== AUTH_VERSION) {
        const mismatch = new Error("KY ERP giriş servisi ile uygulama sürümü uyuşmuyor. Canlı dağıtımı yenileyin.");
        Object.assign(mismatch, { status: 409, code: "AUTH_VERSION_MISMATCH", requestUrl, requestId });
        throw mismatch;
      }
      return payload;
    } catch (error) {
      if (Number(error?.status || 0) > 0) throw error;
      lastTransportError = error;
      if (attempt + 1 < maxAttempts) {
        // Yalnız ilk parola logininde HTTP cevabı hiç alınmadıysa bir kez tekrar deneriz.
        // Aynı BROWSER kimliği için D1 same-browser guard eski olası sessionı kapattığı için
        // cevap yolda kaybolmuş olsa bile aktif session birikmez.
        await wait(250);
        continue;
      }
      const wrapped = new Error(error?.name === "AbortError"
        ? "KY ERP giriş servisi zamanında yanıt vermedi. Tekrar deneyin."
        : "KY ERP giriş servisine bağlanılamadı. Tekrar deneyin.");
      Object.assign(wrapped, { status: 0, code: error?.name === "AbortError" ? "REQUEST_TIMEOUT" : "NETWORK_ERROR", cause: error, requestUrl });
      throw wrapped;
    } finally {
      window.clearTimeout(timer);
    }
  }

  const wrapped = new Error("KY ERP giriş servisine bağlanılamadı. Tekrar deneyin.");
  Object.assign(wrapped, { status: 0, code: "NETWORK_ERROR", cause: lastTransportError, requestUrl });
  throw wrapped;
}

function clearPersistentAuth() {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
    window.localStorage.removeItem(AUTH_REFRESH_LOCK_KEY);
  } catch { /* noop */ }
}

function clearSessionAuth() {
  try {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    window.sessionStorage.removeItem(AUTH_USER_KEY);
  } catch { /* noop */ }
}

function removeStoredAuth() {
  clearPersistentAuth();
  clearSessionAuth();
  try { window.sessionStorage.removeItem(AUTH_REFRESH_PENDING_KEY); } catch { /* noop */ }
}

function storePendingRefresh(value) {
  try { window.sessionStorage.setItem(AUTH_REFRESH_PENDING_KEY, JSON.stringify(value)); } catch { /* noop */ }
}
function readPendingRefresh() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(AUTH_REFRESH_PENDING_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch { return null; }
}
function clearPendingRefresh() {
  try { window.sessionStorage.removeItem(AUTH_REFRESH_PENDING_KEY); } catch { /* noop */ }
}

function parseStoredUser(raw) {
  try {
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function authSnapshot(token, user) {
  return { token, user, permissions: normalizePermissionRows(user?.permissions) };
}

function readStoredAuth() {
  try {
    cleanLegacyAuthStorage();

    const sessionToken = String(window.sessionStorage.getItem(AUTH_TOKEN_KEY) || "");
    const sessionUser = parseStoredUser(window.sessionStorage.getItem(AUTH_USER_KEY));
    if (sessionToken && sessionUser && isTokenUsable(sessionToken)) {
      if (isOwnerAuthPair(sessionToken, sessionUser)) {
        // Uygulama sahibi yalnız aktif tarayıcı oturumunda tutulur.
        // Eski localStorage kalıntıları bilinçli olarak temizlenir.
        clearPersistentAuth();
        clearPendingRefresh();
        return authSnapshot(sessionToken, sessionUser);
      }
      window.localStorage.setItem(AUTH_TOKEN_KEY, sessionToken);
      window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(sessionUser));
      return authSnapshot(sessionToken, sessionUser);
    }
    clearSessionAuth();

    const persistentToken = String(window.localStorage.getItem(AUTH_TOKEN_KEY) || "");
    const persistentUser = parseStoredUser(window.localStorage.getItem(AUTH_USER_KEY));
    if (persistentToken && persistentUser && isOwnerAuthPair(persistentToken, persistentUser)) {
      // Önceki sürümlerin kalıcı owner tokenı yeni güvenlik politikasında geçerli
      // bir browser-restore kaynağı değildir. Sunucu sessionı burada silinmez;
      // yalnız istemci kalıcı oturumu bırakır ve yeniden giriş ister.
      clearPersistentAuth();
      clearPendingRefresh();
      return { token: "", user: null, permissions: [] };
    }
    if (persistentToken && persistentUser && isTokenUsable(persistentToken)) {
      window.sessionStorage.setItem(AUTH_TOKEN_KEY, persistentToken);
      window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(persistentUser));
      return authSnapshot(persistentToken, persistentUser);
    }

    clearPersistentAuth();
    return { token: "", user: null, permissions: [] };
  } catch {
    removeStoredAuth();
    return { token: "", user: null, permissions: [] };
  }
}

export function AuthProvider({ children }) {
  const [{ token, user, permissions }, setAuthState] = useState(() => readStoredAuth());
  const [loading, setLoading] = useState(true);
  const authSnapshotRef = useRef({ user, permissions });
  const tokenRef = useRef(token);
  const authMutationRef = useRef(new Map());
  const tabIdRef = useRef(stableTabId());
  authSnapshotRef.current = { user, permissions };
  tokenRef.current = token;

  const runAuthOnce = useCallback((key, task) => {
    const current = authMutationRef.current.get(key);
    if (current) return current;
    const promise = Promise.resolve().then(task).finally(() => {
      if (authMutationRef.current.get(key) === promise) authMutationRef.current.delete(key);
    });
    authMutationRef.current.set(key, promise);
    return promise;
  }, []);

  const clearAuth = useCallback(() => {
    tokenRef.current = "";
    setApiAuthHandlers({ getToken: () => "", onUnauthorized: () => {} });
    clearApiGetCache();
    clearResilientDataCache();
    setAuthState({ token: "", user: null, permissions: [] });
    removeStoredAuth();
    cleanLegacyAuthStorage();
  }, []);

  const saveAuth = useCallback((nextToken, nextUser, nextPermissions) => {
    const normalizedPermissions = normalizePermissionRows(nextPermissions);
    const payload = { token: String(nextToken || ""), user: nextUser || null, permissions: normalizedPermissions };
    if (!payload.token || !payload.user || !isTokenUsable(payload.token)) return false;
    if (tokenRef.current && tokenRef.current !== payload.token) {
      clearApiGetCache();
      clearResilientDataCache();
    }
    tokenRef.current = payload.token;
    setApiAuthHandlers({ getToken: () => tokenRef.current, onUnauthorized: clearAuth });
    const storedUser = JSON.stringify({ ...payload.user, permissions: payload.permissions });
    const ownerSession = isOwnerAuthPair(payload.token, payload.user);
    try {
      if (ownerSession) {
        // Owner kimliği browser restart sonrasında otomatik geri yüklenmez.
        // F5 / aynı aktif sekme sessionStorage sayesinde çalışmaya devam eder.
        clearPersistentAuth();
        clearPendingRefresh();
      } else {
        window.localStorage.setItem(AUTH_TOKEN_KEY, payload.token);
        window.localStorage.setItem(AUTH_USER_KEY, storedUser);
      }
      window.sessionStorage.setItem(AUTH_TOKEN_KEY, payload.token);
      window.sessionStorage.setItem(AUTH_USER_KEY, storedUser);
    } catch { /* noop */ }
    setAuthState(payload);
    return true;
  }, [clearAuth]);

  const finalizeResponse = useCallback((response) => {
    if (!response?.token || !response?.user) return response;
    saveAuth(response.token, response.user, response.user?.permissions || response.permissions || []);
    return response;
  }, [saveAuth]);

  const commitPreparedRefresh = useCallback(async (prepared) => {
    if (!prepared?.refreshId || !prepared?.refreshSecret || !prepared?.token) return null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await directAuthRequest("/auth/refresh/commit", {
          body: { refreshId: prepared.refreshId, refreshSecret: prepared.refreshSecret },
          timeoutMs: 12000,
        });
        clearPendingRefresh();
        return finalizeResponse({ ...prepared, stage: "AUTHENTICATED" });
      } catch (error) {
        lastError = error;
        const status = Number(error?.status || 0);
        const code = String(error?.code || "");
        if (status === 409 && code === "SESSION_ROTATED") {
          clearPendingRefresh();
          return null;
        }
        if (shouldClearStoredAuthForStatus(status, code, "/api/auth/refresh/commit")) {
          clearPendingRefresh();
          clearAuth();
          return null;
        }
        if (status > 0 && ![500, 502, 503, 504].includes(status)) {
          clearPendingRefresh();
          return null;
        }
        if (attempt < 2) await wait(attempt === 0 ? 300 : 1200);
      }
    }

    // Commit cevabı ağda kaybolmuş olabilir. Hazırlanan yeni token sunucuda geçerliyse
    // /auth/me bunu kanıtlar ve token güvenle kaydedilir. Değilse eski tokena dokunulmaz;
    // pending kayıt sonraki denemede idempotent commit için saklanır.
    try {
      const probe = await directAuthRequest("/auth/me", { method: "GET", token: prepared.token, timeoutMs: 6000 });
      if (probe?.user) {
        clearPendingRefresh();
        return finalizeResponse({ ...prepared, user: probe.user, stage: "AUTHENTICATED" });
      }
    } catch { /* pending korunur */ }
    void lastError;
    return null;
  }, [clearAuth, finalizeResponse]);

  const refreshSession = useCallback(() => runAuthOnce("SESSION_REFRESH", async () => {
    if (isSuperAdmin(authSnapshotRef.current.user?.role)) {
      clearPendingRefresh();
      return null;
    }
    const pending = readPendingRefresh();
    if (pending?.token && isTokenUsable(pending.token)) {
      const committed = await commitPreparedRefresh(pending);
      if (committed) return committed;
    }

    const currentToken = tokenRef.current;
    if (!currentToken || !isTokenUsable(currentToken)) return null;
    try {
      const prepared = await directAuthRequest("/auth/refresh", {
        token: currentToken,
        timeoutMs: 12000,
      });
      if (!prepared?.refreshId || !prepared?.refreshSecret || !prepared?.token) return null;
      storePendingRefresh(prepared);
      return await commitPreparedRefresh(prepared);
    } catch (error) {
      const status = Number(error?.status || 0);
      const code = String(error?.code || "");
      if (shouldClearStoredAuthForStatus(status, code, "/api/auth/refresh")) {
        // Başka sekme tokenı tam bu anda yenilemiş olabilir. Storage olayına kısa bir
        // pencere ver; yeni token geldiyse logout yerine onu kullan.
        await wait(500);
        const stored = readStoredAuth();
        if (stored.token && stored.token !== currentToken && isTokenUsable(stored.token)) {
          saveAuth(stored.token, stored.user, stored.permissions);
          return { syncedFromOtherTab: true };
        }
        clearAuth();
      }
      return null;
    }
  }), [clearAuth, commitPreparedRefresh, runAuthOnce, saveAuth]);

  useEffect(() => {
    tokenRef.current = token;
    setApiAuthHandlers({ getToken: () => tokenRef.current, onUnauthorized: clearAuth });
  }, [clearAuth, token]);

  useEffect(() => {
    if (!token) return undefined;
    const payload = parseJwtPayload(token);
    const expiresAtMs = Number(payload?.exp || 0) * 1000;
    if (!expiresAtMs) return undefined;
    const remaining = expiresAtMs - Date.now();
    if (remaining <= 0) { clearAuth(); return undefined; }
    const timer = window.setTimeout(clearAuth, Math.min(remaining + 150, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [clearAuth, token]);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      const snapshot = authSnapshotRef.current;
      let pending = readPendingRefresh();
      if (isSuperAdmin(snapshot.user?.role) || isSuperAdmin(pending?.user?.role)) {
        clearPendingRefresh();
        pending = null;
      }

      if (!token) {
        if (pending?.token && isTokenUsable(pending.token)) {
          const recovered = await commitPreparedRefresh(pending);
          if (recovered && !cancelled) { setLoading(false); return; }
        }
        if (!cancelled) setLoading(false);
        return;
      }
      if (!isTokenUsable(token)) {
        if (pending?.token && isTokenUsable(pending.token)) {
          const recovered = await commitPreparedRefresh(pending);
          if (recovered && !cancelled) { setLoading(false); return; }
        }
        if (!cancelled) { clearAuth(); setLoading(false); }
        return;
      }

      try {
        const response = await directAuthRequest("/auth/me", { method: "GET", token, timeoutMs: 12000 });
        if (cancelled) return;
        saveAuth(token, response?.user || snapshot.user, response?.user?.permissions || snapshot.permissions);
      } catch (error) {
        if (cancelled) return;
        const status = Number(error?.status || 0);
        const code = String(error?.code || "");
        if (shouldClearStoredAuthForStatus(status, code, "/api/auth/me")) {
          if (pending?.token && isTokenUsable(pending.token)) {
            const recovered = await commitPreparedRefresh(pending);
            if (recovered || cancelled) return;
          }
          await wait(400);
          const stored = readStoredAuth();
          if (stored.token && stored.token !== token && isTokenUsable(stored.token)) saveAuth(stored.token, stored.user, stored.permissions);
          else clearAuth();
        } else if (isTokenUsable(token) && snapshot.user) saveAuth(token, snapshot.user, snapshot.permissions);
        else clearAuth();
      } finally { if (!cancelled) setLoading(false); }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, [clearAuth, commitPreparedRefresh, saveAuth, token]);

  useEffect(() => {
    if (!token || !user || !isTokenUsable(token)) return undefined;
    if (isSuperAdmin(user.role)) {
      clearPendingRefresh();
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    const scheduledToken = token;
    const lockOwner = tabIdRef.current;

    const runRefresh = async () => {
      if (cancelled || tokenRef.current !== scheduledToken || !isTokenUsable(scheduledToken)) return;
      if (!acquireRefreshLock(lockOwner)) {
        timer = window.setTimeout(runRefresh, 1500);
        return;
      }
      let result = null;
      try { result = await refreshSession(); }
      finally { releaseRefreshLock(lockOwner); }
      if (cancelled) return;
      // Başarılı yenilemede saveAuth yeni token state'i oluşturur ve effect yeniden kurulur.
      // Geçici bağlantı hatasında mevcut token halen geçerliyse 60 sn sonra tekrar denenir.
      if (!result && tokenRef.current === scheduledToken && isTokenUsable(scheduledToken)) {
        timer = window.setTimeout(runRefresh, REFRESH_RETRY_MS);
      }
    };

    const delay = sessionRefreshDelay(token, user.role);
    if (delay <= 0) return undefined;
    timer = window.setTimeout(runRefresh, delay);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      releaseRefreshLock(lockOwner);
    };
  }, [refreshSession, token, user]);

  useEffect(() => {
    const syncFromStorage = (event) => {
      if (![AUTH_TOKEN_KEY, AUTH_USER_KEY].includes(String(event.key || ""))) return;
      if (isSuperAdmin(authSnapshotRef.current.user?.role)) return;
      const stored = readStoredAuth();
      tokenRef.current = stored.token;
      setAuthState(stored);
      if (stored.token) setApiAuthHandlers({ getToken: () => tokenRef.current, onUnauthorized: clearAuth });
      else setApiAuthHandlers({ getToken: () => "", onUnauthorized: () => {} });
    };
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, [clearAuth]);

  const getTurnstileConfig = useCallback(() => directAuthRequest("/auth/turnstile-config", { method: "GET" }), []);

  const login = useCallback((identity, password, deviceLabel = "", turnstileToken = "") => runAuthOnce("LOGIN", async () => {
    const body = {
      username: identity,
      password,
      deviceLabel: String(deviceLabel || "").trim() || stableBrowserDeviceLabel(),
      turnstileToken: String(turnstileToken || "").trim(),
    };
    return finalizeResponse(await directAuthRequest("/auth/login", { body }));
  }), [finalizeResponse, runAuthOnce]);

  const verifyMfa = useCallback(({ challengeId, challengeToken, code, provider = "", resetProvider = "" }) =>
    runAuthOnce(`MFA:${challengeId}:${provider || "AUTO"}`, async () => finalizeResponse(await directAuthRequest("/auth/mfa/verify", {
      body: { challengeId, challengeToken, code, provider, resetProvider },
    }))), [finalizeResponse, runAuthOnce]);

  const recoverMfa = useCallback(({ challengeId, challengeToken, recoveryCode }) =>
    runAuthOnce(`RECOVERY:${challengeId}`, async () => finalizeResponse(await directAuthRequest("/auth/recovery-code", {
      body: { challengeId, challengeToken, recoveryCode },
    }))), [finalizeResponse, runAuthOnce]);

  const startOwnerRecovery = useCallback(({ challengeId, challengeToken, channel }) =>
    runAuthOnce(`OWNER-RECOVERY-START:${challengeId}:${channel}`, () => directAuthRequest("/auth/owner-recovery/start", {
      body: { challengeId, challengeToken, channel },
    })), [runAuthOnce]);

  const verifyOwnerRecovery = useCallback(({ recoveryId, recoveryToken, otp, answers }) =>
    runAuthOnce(`OWNER-RECOVERY-VERIFY:${recoveryId}`, () => directAuthRequest("/auth/owner-recovery/verify", {
      body: { recoveryId, recoveryToken, otp, answers },
    })), [runAuthOnce]);

  const checkApproval = useCallback(async ({ approvalId, approvalToken }) => {
    const response = await directAuthRequest(`/auth/approval/${approvalId}/status`, { body: { approvalToken } });
    return finalizeResponse(response);
  }, [finalizeResponse]);

  const checkPhoneApproval = useCallback(async ({ phoneApprovalId, phoneApprovalToken }) => {
    const response = await directAuthRequest(`/auth/phone-approval/${phoneApprovalId}/status`, {
      body: { phoneApprovalToken },
      timeoutMs: 12000,
    });
    return finalizeResponse(response);
  }, [finalizeResponse]);

  const useAuthenticatorFallback = useCallback(async ({ phoneApprovalId, phoneApprovalToken }) =>
    runAuthOnce(`PHONE-FALLBACK:${phoneApprovalId}`, () => directAuthRequest(`/auth/phone-approval/${phoneApprovalId}/fallback`, {
      body: { phoneApprovalToken },
      timeoutMs: 12000,
    })), [runAuthOnce]);

  const logout = useCallback(async () => {
    try { if (token) await directAuthRequest("/auth/logout", { token }); }
    catch { /* cihaz oturumu yine kapanır */ }
    finally { clearAuth(); }
  }, [clearAuth, token]);

  const hasModule = useCallback((moduleKey) => {
    const key = String(moduleKey || "").toUpperCase();
    if (!key) return false;
    if (isSuperAdmin(user?.role)) return true;
    if (String(user?.role || "").toUpperCase() === "COMPANY_ADMIN" && ["ADMIN","STORAGE_ADMIN"].includes(key)) return true;
    return Boolean(permissions.find((row) => row.moduleKey === key)?.canView);
  }, [permissions, user?.role]);

  const can = useCallback((moduleKey, action) => {
    const key = String(moduleKey || "").toUpperCase();
    const actionKey = { view: "canView", create: "canCreate", update: "canUpdate", delete: "canDelete", approve: "canApprove" }[String(action || "").toLowerCase()];
    if (!key || !actionKey) return false;
    if (isSuperAdmin(user?.role)) return true;
    if (String(user?.role || "").toUpperCase() === "COMPANY_ADMIN" && ["ADMIN","STORAGE_ADMIN"].includes(key)) return actionKey !== "canDelete";
    return Boolean(permissions.find((row) => row.moduleKey === key)?.[actionKey]);
  }, [permissions, user?.role]);

  const value = useMemo(() => ({
    token, user, permissions, getTurnstileConfig, login, verifyMfa, recoverMfa,
    startOwnerRecovery, verifyOwnerRecovery, checkApproval, checkPhoneApproval, useAuthenticatorFallback,
    logout, hasModule, can,
    isAuthenticated: Boolean(token && user), loading,
  }), [token, user, permissions, getTurnstileConfig, login, verifyMfa, recoverMfa, startOwnerRecovery, verifyOwnerRecovery, checkApproval, checkPhoneApproval, useAuthenticatorFallback, logout, hasModule, can, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth AuthProvider içinde kullanılmalıdır.");
  return context;
}
