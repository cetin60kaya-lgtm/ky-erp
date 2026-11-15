/** Preference only: never persist provider username, password, cookie or token. */
const KEY = "kyerp:isnet:connection-mode:v1:";

export function getIsnetConnectionModePreference(tenant, storage = globalThis?.localStorage) {
  try {
    const slug = String(tenant || "").trim();
    if (!slug || !storage) return null;
    const value = storage.getItem(KEY + slug);
    return value === "api" || value === "browser" ? value : value === "portal" ? "browser" : null;
  } catch {
    return null;
  }
}

export function saveIsnetConnectionModePreference(tenant, mode, storage = globalThis?.localStorage) {
  if (mode !== "api" && mode !== "browser") return false;
  try {
    const slug = String(tenant || "").trim();
    if (!slug || !storage) return false;
    storage.setItem(KEY + slug, mode);
    return true;
  } catch {
    return false;
  }
}
