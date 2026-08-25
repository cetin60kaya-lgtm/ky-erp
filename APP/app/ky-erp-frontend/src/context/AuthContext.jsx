import { useCallback, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, setApiAuthHandlers } from "../utils/api";

const AUTH_TOKEN_KEY = "kyerp_auth_token";
const AUTH_USER_KEY = "kyerp_auth_user";

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

function cleanLegacyAuthStorage() {
  const legacyKeys = [
    "kyerp.auth",
    "kyerp_user",
    "token",
    "authToken",
    AUTH_TOKEN_KEY,
    AUTH_USER_KEY,
  ];
  legacyKeys.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // noop
    }
  });
}

function readStoredAuth() {
  try {
    cleanLegacyAuthStorage();
    const token = window.sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
    const userRaw = window.sessionStorage.getItem(AUTH_USER_KEY);
    const user = userRaw ? JSON.parse(userRaw) : null;
    const permissions = normalizePermissionRows(user?.permissions);
    return { token, user, permissions };
  } catch {
    return { token: "", user: null, permissions: [] };
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
  } catch {
    return null;
  }
}

function isTokenUsable(token) {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload?.exp !== "number") return false;
  return payload.exp > Math.floor(Date.now() / 1000) + 5;
}

function isSuperAdmin(role) {
  return ["SUPER_ADMIN", "ADMIN"].includes(String(role || "").toUpperCase());
}

export function AuthProvider({ children }) {
  const [{ token, user, permissions }, setAuthState] = useState(() => readStoredAuth());
  const [loading, setLoading] = useState(true);
  const authSnapshotRef = useRef({ user, permissions });
  const tokenRef = useRef(token);
  authSnapshotRef.current = { user, permissions };
  tokenRef.current = token;

  const clearAuth = useCallback(() => {
    tokenRef.current = "";
    setApiAuthHandlers({ getToken: () => "", onUnauthorized: () => {} });
    setAuthState({ token: "", user: null, permissions: [] });
    try {
      window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
      window.sessionStorage.removeItem(AUTH_USER_KEY);
      cleanLegacyAuthStorage();
    } catch {
      // noop
    }
  }, []);

  const saveAuth = useCallback(
    (nextToken, nextUser, nextPermissions) => {
      const normalizedPermissions = normalizePermissionRows(nextPermissions);
      const payload = {
        token: String(nextToken || ""),
        user: nextUser || null,
        permissions: normalizedPermissions,
      };
      if (!payload.token || !payload.user) return false;

      tokenRef.current = payload.token;
      setApiAuthHandlers({
        getToken: () => tokenRef.current,
        onUnauthorized: clearAuth,
      });

      try {
        window.sessionStorage.setItem(AUTH_TOKEN_KEY, payload.token);
        window.sessionStorage.setItem(
          AUTH_USER_KEY,
          JSON.stringify({ ...payload.user, permissions: payload.permissions }),
        );
      } catch {
        // noop
      }

      setAuthState(payload);
      return true;
    },
    [clearAuth],
  );

  const finalizeResponse = useCallback(
    (response) => {
      if (!response?.token || !response?.user) return response;
      saveAuth(
        response.token,
        response.user,
        response.user?.permissions || response.permissions || [],
      );
      return response;
    },
    [saveAuth],
  );

  useEffect(() => {
    tokenRef.current = token;
    setApiAuthHandlers({
      getToken: () => tokenRef.current,
      onUnauthorized: clearAuth,
    });
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
      try {
        const response = await apiFetch("/auth/me", { suppressUnauthorized: true });
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

  const login = useCallback(
    async (identity, password, deviceLabel = "") => {
      const response = await apiFetch("/auth/login", {
        method: "POST",
        body: { username: identity, password, deviceLabel },
        skipAuth: true,
        suppressUnauthorized: true,
      });
      return finalizeResponse(response);
    },
    [finalizeResponse],
  );

  const verifyMfa = useCallback(
    async ({ challengeId, challengeToken, code, provider = "", resetProvider = "" }) => {
      const response = await apiFetch("/auth/mfa/verify", {
        method: "POST",
        body: { challengeId, challengeToken, code, provider, resetProvider },
        skipAuth: true,
        suppressUnauthorized: true,
      });
      return finalizeResponse(response);
    },
    [finalizeResponse],
  );

  const recoverMfa = useCallback(
    async ({ challengeId, challengeToken, recoveryCode }) => {
      const response = await apiFetch("/auth/mfa/recovery", {
        method: "POST",
        body: { challengeId, challengeToken, recoveryCode },
        skipAuth: true,
        suppressUnauthorized: true,
      });
      return finalizeResponse(response);
    },
    [finalizeResponse],
  );

  const acknowledgeRecoveryCodes = useCallback(
    async ({ challengeId, challengeToken }) => {
      const response = await apiFetch("/auth/mfa/recovery/ack", {
        method: "POST",
        body: { challengeId, challengeToken },
        skipAuth: true,
        suppressUnauthorized: true,
      });
      return finalizeResponse(response);
    },
    [finalizeResponse],
  );

  const checkApproval = useCallback(
    async ({ approvalId, approvalToken }) => {
      const response = await apiFetch(`/auth/approval/${approvalId}/status`, {
        method: "POST",
        body: { approvalToken },
        skipAuth: true,
        suppressUnauthorized: true,
      });
      return finalizeResponse(response);
    },
    [finalizeResponse],
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await apiFetch("/auth/logout", {
          method: "POST",
          suppressUnauthorized: true,
        });
      }
    } catch {
      // Sunucuya ulaşılamasa da cihazdaki oturum kapatılır.
    } finally {
      clearAuth();
    }
  }, [clearAuth, token]);

  const hasModule = useCallback(
    (moduleKey) => {
      const key = String(moduleKey || "").toUpperCase();
      if (!key) return false;
      if (isSuperAdmin(user?.role)) return true;
      if (String(user?.role || "").toUpperCase() === "COMPANY_ADMIN" && key === "ADMIN") return true;
      return Boolean(permissions.find((row) => row.moduleKey === key)?.canView);
    },
    [permissions, user?.role],
  );

  const can = useCallback(
    (moduleKey, action) => {
      const key = String(moduleKey || "").toUpperCase();
      const actionKey = {
        view: "canView",
        create: "canCreate",
        update: "canUpdate",
        delete: "canDelete",
        approve: "canApprove",
      }[String(action || "").toLowerCase()];
      if (!key || !actionKey) return false;
      if (isSuperAdmin(user?.role)) return true;
      if (String(user?.role || "").toUpperCase() === "COMPANY_ADMIN" && key === "ADMIN") {
        return actionKey !== "canDelete";
      }
      return Boolean(permissions.find((row) => row.moduleKey === key)?.[actionKey]);
    },
    [permissions, user?.role],
  );

  const value = useMemo(
    () => ({
      token,
      user,
      permissions,
      login,
      verifyMfa,
      recoverMfa,
      acknowledgeRecoveryCodes,
      checkApproval,
      logout,
      hasModule,
      can,
      isAuthenticated: Boolean(token && user),
      loading,
    }),
    [
      token,
      user,
      permissions,
      login,
      verifyMfa,
      recoverMfa,
      acknowledgeRecoveryCodes,
      checkApproval,
      logout,
      hasModule,
      can,
      loading,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth AuthProvider içinde kullanılmalıdır.");
  return context;
}
