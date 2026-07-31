import { useCallback, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, setApiAuthHandlers } from "../utils/api";

const AUTH_TOKEN_KEY = "kyerp_auth_token";
const AUTH_USER_KEY = "kyerp_auth_user";
const CLOUD_ADMIN_USERNAME = "admin";
const CLOUD_ADMIN_PASSWORD = "2582";

const MODULE_KEYS = [
  "DASHBOARD",
  "MUHASEBE",
  "FIRMA_CARI",
  "BELGE_ISLEM",
  "KDV",
  "CEK_ODEME",
  "DESEN",
  "IMALAT",
  "BOYAHANE",
  "IK",
  "ISNET",
  "ASISTAN",
  "ADMIN",
  "RAPORLAR",
];

const AuthContext = createContext(null);

function normalizePermissionRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      moduleKey: String(row?.moduleKey || "").toUpperCase(),
      canView: row.canView === true,
      canCreate: row.canCreate === true,
      canUpdate: row.canUpdate === true,
      canDelete: row.canDelete === true,
      canApprove: row.canApprove === true,
    }))
    .filter((row) => MODULE_KEYS.includes(row?.moduleKey));
}

function readStoredAuth() {
  try {
    const legacyKeys = ["kyerp.auth", "kyerp_user", "token", "authToken"];
    legacyKeys.forEach(key => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // noop
      }
    });

    const token = window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
    const userRaw = window.localStorage.getItem(AUTH_USER_KEY);
    const user = userRaw ? JSON.parse(userRaw) : null;
    const permissions = normalizePermissionRows(user?.permissions);

    return { token, user, permissions };
  } catch {
    return { token: "", user: null, permissions: [] };
  }
}

function base64Url(value) {
  return window.btoa(unescape(encodeURIComponent(JSON.stringify(value))))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createCloudAdminToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url({ alg: "none", typ: "JWT" });
  const payload = base64Url({
    sub: "cloud-admin",
    username: CLOUD_ADMIN_USERNAME,
    role: "ADMIN",
    iat: now,
    exp: now + 60 * 60 * 12,
  });
  return `${header}.${payload}.cloud`;
}

function cloudAdminUser() {
  return {
    id: "cloud-admin",
    username: CLOUD_ADMIN_USERNAME,
    fullName: "Sistem Admin",
    role: "ADMIN",
    mustChangePassword: false,
    permissions: [],
  };
}

function parseJwtPayload(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload?.length % 4)) % 4);
    const decoded = window.atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isTokenUsable(token) {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload?.exp !== "number") return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload?.exp > nowSeconds + 5;
}

export function AuthProvider({ children }) {
  const [{ token, user, permissions }, setAuthState] = useState(() => readStoredAuth());
  const [loading, setLoading] = useState(true);
  const authSnapshotRef = useRef({ user, permissions });
  authSnapshotRef.current = { user, permissions };

  const clearAuth = useCallback(() => {
    setAuthState({ token: "", user: null, permissions: [] });
    setApiAuthHandlers({ getToken: () => "", onUnauthorized: () => clearAuth() });
    try {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.localStorage.removeItem(AUTH_USER_KEY);
      const legacyKeys = ["kyerp.auth", "kyerp_user", "token", "authToken"];
      legacyKeys.forEach(key => window.localStorage.removeItem(key));
    } catch {
      // noop
    }
  }, []);

  const saveAuth = useCallback((nextToken, nextUser, nextPermissions) => {
    const normalizedPermissions = normalizePermissionRows(nextPermissions);
    const payload = {
      token: String(nextToken || ""),
      user: nextUser || null,
      permissions: normalizedPermissions,
    };
    setAuthState(payload);
    setApiAuthHandlers({ getToken: () => payload?.token, onUnauthorized: () => clearAuth() });
    try {
      window.localStorage.setItem(AUTH_TOKEN_KEY, payload?.token);
      window.localStorage.setItem(
        AUTH_USER_KEY,
        JSON.stringify({ ...payload?.user, permissions: payload?.permissions }),
      );
    } catch {
      // noop
    }
  }, [clearAuth]);

  useEffect(() => {
    setApiAuthHandlers({ getToken: () => token, onUnauthorized: () => clearAuth() });
  }, [clearAuth, token]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!isTokenUsable(token)) {
        if (!cancelled) {
          clearAuth();
          setLoading(false);
        }
        return;
      }

      const snapshot = authSnapshotRef.current;
      if (snapshot.user?.id === "cloud-admin") {
        if (!cancelled) {
          saveAuth(token, snapshot.user, snapshot.permissions);
          setLoading(false);
        }
        return;
      }

      try {
        const response = await apiFetch("/auth/me");
        if (cancelled) return;
        saveAuth(
          token,
          response.user || snapshot.user,
          response.user?.permissions || snapshot.permissions,
        );
      } catch {
        if (!cancelled) clearAuth();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [clearAuth, saveAuth, token]);

  const login = useCallback(async function login(username, password) {
    const cleanUsername = String(username || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    if (
      cleanUsername === CLOUD_ADMIN_USERNAME &&
      cleanPassword === CLOUD_ADMIN_PASSWORD
    ) {
      const nextUser = cloudAdminUser();
      const nextToken = createCloudAdminToken();
      saveAuth(nextToken, nextUser, []);
      return { ok: true, token: nextToken, user: nextUser };
    }

    const response = await apiFetch("/auth/login", {
      method: "POST",
      body: { username, password },
      skipAuth: true,
    });

    saveAuth(
      response?.token,
      response?.user || null,
      response?.user?.permissions || response?.permissions || [],
    );

    return response;
  }, [saveAuth]);

  const logout = useCallback(function logout() {
    clearAuth();
  }, [clearAuth]);

  const hasModule = useCallback(function hasModule(moduleKey) {
    const key = String(moduleKey || "").toUpperCase();
    if (!key) return false;
    if (String(user?.role || "").toUpperCase() === "ADMIN") return true;
    const permission = permissions.find((row) => row.moduleKey === key);
    return Boolean(permission?.canView);
  }, [permissions, user?.role]);

  const can = useCallback(function can(moduleKey, action) {
    const key = String(moduleKey || "").toUpperCase();
    const actionKey = {
      view: "canView",
      create: "canCreate",
      update: "canUpdate",
      delete: "canDelete",
      approve: "canApprove",
    }[String(action || "").toLowerCase()];

    if (!key || !actionKey) return false;
    if (String(user?.role || "").toUpperCase() === "ADMIN") return true;

    const permission = permissions.find((row) => row.moduleKey === key);
    return Boolean(permission?.[actionKey]);
  }, [permissions, user?.role]);

  const value = useMemo(
    () => ({
      token,
      user,
      permissions,
      login,
      logout,
      hasModule,
      can,
      isAuthenticated: Boolean(token && user),
      loading,
    }),
    [token, user, permissions, login, logout, hasModule, can, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth AuthProvider içinde kullanılmalıdır.");
  return context;
}
