import { setApiAuthHandlers } from "../utils/api";

export const AUTH_TOKEN_STORAGE_KEY = "kyerp_auth_token";
export const AUTH_USER_STORAGE_KEY = "kyerp_auth_user";

function decodeTokenPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return {};
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
    return JSON.parse(window.atob(padded));
  } catch {
    return {};
  }
}

function ownerToken(token) {
  const role = String(decodeTokenPayload(token)?.role || "").trim().toUpperCase();
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

function clearPersistentOwnerAuth() {
  try {
    window.localStorage?.removeItem(AUTH_TOKEN_STORAGE_KEY);
    window.localStorage?.removeItem(AUTH_USER_STORAGE_KEY);
  } catch { /* noop */ }
}

export function readPersistedAuthToken() {
  try {
    if (typeof window === "undefined") return "";

    const sessionToken = String(window.sessionStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) || "").trim();
    if (sessionToken) {
      if (ownerToken(sessionToken)) clearPersistentOwnerAuth();
      return sessionToken;
    }

    const persistentToken = String(window.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) || "").trim();
    if (!persistentToken) return "";
    if (ownerToken(persistentToken)) {
      // Owner browser restart sonrası kalıcı token kullanamaz.
      clearPersistentOwnerAuth();
      return "";
    }
    return persistentToken;
  } catch {
    return "";
  }
}

export function installPersistedAuthBootstrap() {
  // React child effect'leri AuthProvider effect'inden once calisabilir. F5 / dogrudan
  // URL acilisinda ilk API isteklerinin bos Authorization ile gitmesini engelle.
  // Normal kullanıcılar kalıcı storage kullanabilir; uygulama sahibi yalnız aktif
  // sessionStorage oturumundan bootstrap edilir.
  setApiAuthHandlers({
    getToken: readPersistedAuthToken,
    onUnauthorized: () => {},
  });
  return readPersistedAuthToken();
}
