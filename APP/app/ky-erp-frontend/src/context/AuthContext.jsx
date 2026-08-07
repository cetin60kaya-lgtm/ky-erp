import { useCallback, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, setApiActiveMainCompany, setApiAuthHandlers } from "../utils/api";

const AUTH_TOKEN_KEY = "kyerp_auth_token";
const AUTH_USER_KEY = "kyerp_auth_user";

const MODULE_KEYS = [
  "DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV",
  "CEK_ODEME", "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET",
  "ASISTAN", "ADMIN", "RAPORLAR",
];

const AuthContext = createContext(null);

function normalizePermissionRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    moduleKey: String(row?.moduleKey || "").toUpperCase(),
    canView: row?.canView === true,
    canCreate: row?.canCreate === true,
    canUpdate: row?.canUpdate === true,
    canDelete: row?.canDelete === true,
    canApprove: row?.canApprove === true,
  })).filter((row) => MODULE_KEYS.includes(row.moduleKey));
}

function readStoredAuth() {
  try {
    ["kyerp.auth", "kyerp_user", "token", "authToken"].forEach((key) => window.localStorage.removeItem(key));
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
    const userRaw = window.localStorage.getItem(AUTH_USER_KEY);
    const user = userRaw ? JSON.parse(userRaw) : null;
    return { token, user, permissions: normalizePermissionRows(user?.permissions) };
  } catch {
    return { token: "", user: null, permissions: [] };
  }
}

function parseJwtPayload(token) {
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(payload + "=".repeat((4 - (payload.length % 4)) % 4)));
  } catch {
    return null;
  }
}

function isTokenUsable(token) {
  const payload = parseJwtPayload(token);
  return Boolean(payload && typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000) + 5);
}

export function AuthProvider({ children }) {
  const [{ token, user, permissions }, setAuthState] = useState(readStoredAuth);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const clearAuth = useCallback(() => {
    tokenRef.current = "";
    setApiActiveMainCompany(null);
    setAuthState({ token: "", user: null, permissions: [] });
    try {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.localStorage.removeItem(AUTH_USER_KEY);
      ["kyerp.auth", "kyerp_user", "token", "authToken"].forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Storage may be disabled; in-memory state is already cleared.
    }
  }, []);

  const saveAuth = useCallback((nextToken, nextUser) => {
    const normalizedPermissions = normalizePermissionRows(nextUser?.permissions);
    const normalizedUser = nextUser ? { ...nextUser, permissions: normalizedPermissions } : null;
    const nextState = { token: String(nextToken || ""), user: normalizedUser, permissions: normalizedPermissions };
    tokenRef.current = nextState.token;
    setApiActiveMainCompany(normalizedUser?.activeCompany || null);
    setAuthState(nextState);
    try {
      window.localStorage.setItem(AUTH_TOKEN_KEY, nextState.token);
      window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));
    } catch {
      // Storage may be disabled; the authenticated in-memory session remains valid.
    }
  }, []);

  useEffect(() => {
    setApiAuthHandlers({ getToken: () => tokenRef.current, onUnauthorized: clearAuth });
  }, [clearAuth]);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      if (!token || !isTokenUsable(token)) {
        if (token) clearAuth();
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const response = await apiFetch("/auth/me");
        if (!cancelled) saveAuth(token, response?.user || null);
      } catch {
        if (!cancelled) clearAuth();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, [clearAuth, saveAuth, token]);

  const login = useCallback(async (username, password) => {
    const response = await apiFetch("/auth/login", {
      method: "POST",
      body: { username: String(username || "").trim(), password: String(password || "") },
      skipAuth: true,
    });
    saveAuth(response?.token, response?.user || null);
    return response;
  }, [saveAuth]);

  const switchCompany = useCallback(async (companyIdOrSlug) => {
    const response = await apiFetch("/auth/switch-company", {
      method: "POST",
      body: { companyId: companyIdOrSlug },
    });
    saveAuth(response?.token, response?.user || null);
    return response;
  }, [saveAuth]);

  const leaveCompany = useCallback(async () => {
    const response = await apiFetch("/auth/leave-company", { method: "POST", body: {} });
    saveAuth(response?.token, response?.user || null);
    return response;
  }, [saveAuth]);

  const logout = useCallback(async () => {
    try {
      if (tokenRef.current) await apiFetch("/auth/logout", { method: "POST", body: {}, suppressUnauthorized: true });
    } catch {
      // Local logout must still complete if the network is unavailable.
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const isPlatformAdmin = String(user?.platformRole || "").toUpperCase() === "SUPER_ADMIN";
  const hasModule = useCallback((moduleKey) => {
    const key = String(moduleKey || "").toUpperCase();
    if (!key) return false;
    if (isPlatformAdmin) return true;
    return Boolean(permissions.find((row) => row.moduleKey === key)?.canView);
  }, [isPlatformAdmin, permissions]);

  const can = useCallback((moduleKey, action) => {
    const actionKey = { view: "canView", create: "canCreate", update: "canUpdate", delete: "canDelete", approve: "canApprove" }[String(action || "").toLowerCase()];
    const key = String(moduleKey || "").toUpperCase();
    if (!key || !actionKey) return false;
    if (isPlatformAdmin) return true;
    return Boolean(permissions.find((row) => row.moduleKey === key)?.[actionKey]);
  }, [isPlatformAdmin, permissions]);

  const value = useMemo(() => ({
    token, user, permissions, login, logout, switchCompany, leaveCompany,
    hasModule, can, isPlatformAdmin,
    memberships: Array.isArray(user?.memberships) ? user.memberships : [],
    activeCompany: user?.activeCompany || null,
    requiresCompanySelection: Boolean(user && !isPlatformAdmin && !user?.activeCompany),
    isAuthenticated: Boolean(token && user), loading,
  }), [token, user, permissions, login, logout, switchCompany, leaveCompany, hasModule, can, isPlatformAdmin, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth AuthProvider içinde kullanılmalıdır.");
  return context;
}
