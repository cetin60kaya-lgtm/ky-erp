import { useCallback, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, clearApiGetCache, setApiAuthHandlers } from "../utils/api";
import { clearResilientDataCache } from "../utils/resilientDataLoader";
import { shouldClearStoredAuthForStatus } from "./authSessionPolicy";

const AUTH_TOKEN_KEY = "kyerp_auth_token";
const AUTH_USER_KEY = "kyerp_auth_user";
const AUTH_DEVICE_KEY = "kyerp_auth_device_v1";
const AUTH_VERSION = "canonical-v3";

const MODULE_KEYS = [
  "DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME",
  "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET", "ASISTAN", "ADMIN", "RAPORLAR",
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

async function directAuthRequest(path, options = {}) {
  const { method = "POST", body, token = "", timeoutMs = 20000 } = options;
  const normalizedPath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const requestUrl = `${API_BASE}${normalizedPath}`;
  try {
    const headers = { Accept: "application/json" };
    if (body !== undefined) {
      // JSON metni text/plain ile taşınır. Bu Content-Type CORS safelist kapsamındadır;
      // kyerp.net -> api.kyerp.net girişinde gereksiz OPTIONS/preflight oluşmaz.
      // Backend Hono c.req.json() gövdeyi aynı JSON olarak okumaya devam eder.
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
    const wrapped = new Error(error?.name === "AbortError"
      ? "KY ERP giriş servisi zamanında yanıt vermedi. Tekrar deneyin."
      : "KY ERP giriş servisine bağlanılamadı. Tekrar deneyin.");
    Object.assign(wrapped, { status: 0, code: error?.name === "AbortError" ? "REQUEST_TIMEOUT" : "NETWORK_ERROR", cause: error, requestUrl });
    throw wrapped;
  } finally { window.clearTimeout(timer); }
}

function removeStoredAuth() {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    window.sessionStorage.removeItem(AUTH_USER_KEY);
  } catch { /* noop */ }
}

function readStoredAuth() {
  try {
    cleanLegacyAuthStorage();
    const persistentToken = window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
    const sessionToken = window.sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
    const token = persistentToken || sessionToken;
    const persistentUserRaw = window.localStorage.getItem(AUTH_USER_KEY);
    const sessionUserRaw = window.sessionStorage.getItem(AUTH_USER_KEY);
    const userRaw = persistentUserRaw || sessionUserRaw;
    const user = userRaw ? JSON.parse(userRaw) : null;
    if (!token || !user || !isTokenUsable(token)) {
      removeStoredAuth();
      return { token: "", user: null, permissions: [] };
    }
    if (!persistentToken) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    if (!persistentUserRaw) window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    return { token, user, permissions: normalizePermissionRows(user?.permissions) };
  } catch {
    removeStoredAuth();
    return { token: "", user: null, permissions: [] };
  }
}

function isSuperAdmin(role) {
  return ["SUPER_ADMIN", "ADMIN"].includes(String(role || "").toUpperCase());
}

export function AuthProvider({ children }) {
  const [{ token, user, permissions }, setAuthState] = useState(() => readStoredAuth());
  const [loading, setLoading] = useState(true);
  const authSnapshotRef = useRef({ user, permissions });
  const tokenRef = useRef(token);
  const authMutationRef = useRef(new Map());
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
    try {
      window.localStorage.setItem(AUTH_TOKEN_KEY, payload.token);
      window.localStorage.setItem(AUTH_USER_KEY, storedUser);
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
      if (!token) { if (!cancelled) setLoading(false); return; }
      if (!isTokenUsable(token)) { if (!cancelled) { clearAuth(); setLoading(false); } return; }
      const snapshot = authSnapshotRef.current;
      try {
        const response = await directAuthRequest("/auth/me", { method: "GET", token, timeoutMs: 12000 });
        if (cancelled) return;
        saveAuth(token, response?.user || snapshot.user, response?.user?.permissions || snapshot.permissions);
      } catch (error) {
        if (cancelled) return;
        const status = Number(error?.status || 0);
        if (shouldClearStoredAuthForStatus(status)) clearAuth();
        else if (isTokenUsable(token) && snapshot.user) saveAuth(token, snapshot.user, snapshot.permissions);
        else clearAuth();
      } finally { if (!cancelled) setLoading(false); }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, [clearAuth, saveAuth, token]);

  useEffect(() => {
    const syncFromStorage = (event) => {
      if (![AUTH_TOKEN_KEY, AUTH_USER_KEY].includes(String(event.key || ""))) return;
      const stored = readStoredAuth();
      tokenRef.current = stored.token;
      setAuthState(stored);
      if (!stored.token) setApiAuthHandlers({ getToken: () => "", onUnauthorized: () => {} });
    };
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  const login = useCallback((identity, password, deviceLabel = "") => runAuthOnce("LOGIN", async () => {
    const body = { username: identity, password, deviceLabel: String(deviceLabel || "").trim() || stableBrowserDeviceLabel() };
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

  const logout = useCallback(async () => {
    try { if (token) await directAuthRequest("/auth/logout", { token }); }
    catch { /* cihaz oturumu yine kapanır */ }
    finally { clearAuth(); }
  }, [clearAuth, token]);

  const hasModule = useCallback((moduleKey) => {
    const key = String(moduleKey || "").toUpperCase();
    if (!key) return false;
    if (isSuperAdmin(user?.role)) return true;
    if (String(user?.role || "").toUpperCase() === "COMPANY_ADMIN" && key === "ADMIN") return true;
    return Boolean(permissions.find((row) => row.moduleKey === key)?.canView);
  }, [permissions, user?.role]);

  const can = useCallback((moduleKey, action) => {
    const key = String(moduleKey || "").toUpperCase();
    const actionKey = { view: "canView", create: "canCreate", update: "canUpdate", delete: "canDelete", approve: "canApprove" }[String(action || "").toLowerCase()];
    if (!key || !actionKey) return false;
    if (isSuperAdmin(user?.role)) return true;
    if (String(user?.role || "").toUpperCase() === "COMPANY_ADMIN" && key === "ADMIN") return actionKey !== "canDelete";
    return Boolean(permissions.find((row) => row.moduleKey === key)?.[actionKey]);
  }, [permissions, user?.role]);

  const value = useMemo(() => ({
    token, user, permissions, login, verifyMfa, recoverMfa,
    startOwnerRecovery, verifyOwnerRecovery, checkApproval, logout, hasModule, can,
    isAuthenticated: Boolean(token && user), loading,
  }), [token, user, permissions, login, verifyMfa, recoverMfa, startOwnerRecovery, verifyOwnerRecovery, checkApproval, logout, hasModule, can, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth AuthProvider içinde kullanılmalıdır.");
  return context;
}
