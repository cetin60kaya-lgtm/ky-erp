import { setApiAuthHandlers } from "../utils/api";

export const AUTH_TOKEN_STORAGE_KEY = "kyerp_auth_token";

export function readPersistedAuthToken() {
  try {
    if (typeof window === "undefined") return "";
    return String(
      window.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) ||
      window.sessionStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) ||
      "",
    ).trim();
  } catch {
    return "";
  }
}

export function installPersistedAuthBootstrap() {
  // React child effect'leri AuthProvider effect'inden once calisabilir. F5 / dogrudan
  // URL acilisinda ilk API isteklerinin bos Authorization ile gitmesini engelle.
  // Gercek logout/401 karari AuthProvider yuklendikten sonra normal oturum motoruna
  // devredilir; bu bootstrap kalici bir yetki mekanizmasi degildir.
  setApiAuthHandlers({
    getToken: readPersistedAuthToken,
    onUnauthorized: () => {},
  });
  return readPersistedAuthToken();
}
