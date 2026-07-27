const API_BASE =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || "/api";

function apiOrigin() {
  if (/^https:\/\//i.test(API_BASE)) {
    return API_BASE.replace(/\/api\/$/i, "").replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

function getToken() {
  return localStorage.getItem("kyerp_auth_token");
}

export function getMobileToken() {
  return getToken();
}

export function getMobileUserShortName() {
  const user = JSON.parse(localStorage.getItem("kyerp_mobile_user") || "{}");
  const name = user?.username || user?.kullaniciAdi || user?.email || "KY";
  return name.substring(0, 2).toUpperCase();
}

export function mobileLogout() {
  localStorage.removeItem("kyerp_auth_token");
  localStorage.removeItem("kyerp_mobile_user");
  window.location.href = "/mobile/login";
}

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function handleUnauthorized(status) {
  if (status === 401) {
    localStorage.removeItem("kyerp_auth_token");
    localStorage.removeItem("kyerp_mobile_user");
    if (!window.location.pathname.includes("/mobile/login")) {
      window.location.href = "/mobile/login";
    }
  }
}

export function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload?.data)) return payload?.data;
  if (Array.isArray(payload?.items)) return payload?.items;
  if (Array.isArray(payload?.rows)) return payload?.rows;
  if (Array.isArray(payload?.records)) return payload?.records;
  if (Array.isArray(payload?.result)) return payload?.result;

  if (Array.isArray(payload?.data.items)) return payload?.data.items;
  if (Array.isArray(payload?.data.rows)) return payload?.data.rows;
  if (Array.isArray(payload?.data.records)) return payload?.data.records;
  if (Array.isArray(payload?.data.result)) return payload?.data.result;

  return [];
}

export function normalizeObject(payload) {
  if (!payload) return {};
  if (payload?.data && !Array.isArray(payload?.data)) return payload?.data;
  if (payload?.item && !Array.isArray(payload?.item)) return payload?.item;
  if (payload?.result && !Array.isArray(payload?.result)) return payload?.result;
  return payload;
}

export function getField(obj, keys, fallback = "") {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

export function resolveAssetUrl(path) {
  if (!path) return null;
  const value = String(path);
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/storage")) return `${apiOrigin()}${value}`;
  if (value.startsWith("storage")) return `${apiOrigin()}/${value}`;
  if (value.startsWith("/uploads")) return `${apiOrigin()}${value}`;
  if (value.startsWith("uploads")) return `${apiOrigin()}/${value}`;
  return value;
}

export function getErrorMessage(error, status) {
  if (status === 401) return "Oturum gerekli. Lütfen tekrar giriş yapın.";
  if (status === 403) return "Bu işlem için yetkiniz yok.";
  if (status === 404) return "API adresi bulunamadı.";
  if (status >= 500) return "Sunucu hatası.";
  if (error?.message) return error?.message;
  return "Veri alınamadı.";
}

export function safeText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

async function request(path, options = {}) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  const url = `${API_BASE}/${cleanPath}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    handleUnauthorized(response.status);

    return {
      ok: response.ok,
      status: response.status,
      url,
      data,
      message: response.ok ? null : getErrorMessage(data, response.status),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      data: null,
      message: getErrorMessage(error, 0),
    };
  }
}

export function mobileApiGet(path) {
  return request(path, { method: "GET" });
}

export function mobileApiPost(path, body) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

export function mobileApiPut(path, body) {
  return request(path, {
    method: "PUT",
    body: JSON.stringify(body || {}),
  });
}

export function mobileApiPatch(path, body) {
  return request(path, {
    method: "PATCH",
    body: JSON.stringify(body || {}),
  });
}

export function mobileApiDelete(path) {
  return request(path, { method: "DELETE" });
}
