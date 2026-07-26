const DEFAULT_API_ORIGIN =
  typeof import.meta !== "undefined" && import.meta.env.PROD
    ? "https://api.kyerp.net"
    : "http://localhost:8787";

const API_GET_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_API_TIMEOUT_MS = 45000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 60000;
const ACTIVE_COMPANY_STORAGE_KEY = "kyerp.activeCompany";
const COMPANY_PARAM_NAME = "mainCompanySlug";
const apiGetCache = new Map();
const apiGetInFlight = new Map();
let activeMainCompany = null;

let authTokenGetter = () => "";
let onUnauthorized = () => {};

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function ensureLeadingSlash(value) {
  const text = String(value || "").trim();
  return text.startsWith("/") ? text : `/${text}`;
}

export function getApiBase() {
  const envBaseRaw =
    typeof import.meta !== "undefined"
      ? import.meta.env.VITE_API_URL ||
        import.meta.env.VITE_API_BASE_URL ||
        import.meta.env.VITE_API_BASE ||
        ""
      : "";
  const envBase = trimTrailingSlash(String(envBaseRaw || "").trim());
  if (!envBase || envBase === "/" || envBase === ".") {
    return `${DEFAULT_API_ORIGIN}/api`;
  }
  return /\/api$/i.test(envBase) ? envBase : `${envBase}/api`;
}

export const API_BASE = getApiBase();

const MODULE_PREFIXES = [
  "/muhasebe",
  "/ik",
  "/desen",
  "/imalat",
  "/uretim",
  "/boyahane",
  "/admin",
  "/storage",
  "/models",
  "/model-takip",
  "/auth",
  "/ai",
  "/isnet",
  "/health",
  "/erp",
];

export function apiUrl(path) {
  const raw = String(path || "").trim();
  if (!raw) return API_BASE;
  if (/^https:\/\//i.test(raw)) return raw;

  const normalized = ensureLeadingSlash(raw);
  if (normalized === "/api" || normalized.startsWith("/api/")) {
    return normalized;
  }

  const shouldPrefix = MODULE_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );

  if (shouldPrefix) {
    return `${API_BASE}${normalized}`;
  }

  return `${API_BASE}${normalized}`;
}

function readStoredCompanySlug() {
  try {
    if (typeof window === "undefined") return "";
    return String(
      window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) || "",
    ).trim();
  } catch {
    return "";
  }
}

export function setApiAuthHandlers(handlers = {}) {
  authTokenGetter =
    typeof handlers.getToken === "function" ? handlers.getToken : () => "";
  onUnauthorized =
    typeof handlers.onUnauthorized === "function"
      ? handlers.onUnauthorized
      : () => {};
}

export function setApiActiveMainCompany(company) {
  activeMainCompany = company || null;
}

export function getApiActiveMainCompanySlug() {
  return String(
    activeMainCompany?.slug ||
      activeMainCompany?.mainCompanySlug ||
      activeMainCompany ||
      readStoredCompanySlug() ||
      "",
  ).trim();
}

function shouldAutoAttachCompany(path) {
  const normalizedPath = String(path || "");
  if (/^https:\/\//i.test(normalizedPath)) return false;
  return !/^\/(?:api\/)?(health|auth\/login|admin\/main-companies)(\/|$)/i.test(
    normalizedPath,
  );
}

function appendParams(path, params = {}) {
  const normalizedPath = String(path || "").startsWith("/")
    ? String(path || "")
    : `/${String(path || "")}`;
  const [basePath, queryString = ""] = normalizedPath.split("?");
  const searchParams = new URLSearchParams(queryString);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  if (
    shouldAutoAttachCompany(normalizedPath) &&
    !searchParams.has(COMPANY_PARAM_NAME)
  ) {
    const slug = getApiActiveMainCompanySlug();
    if (slug) searchParams.set(COMPANY_PARAM_NAME, slug);
  }
  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function attachCompanyToBody(body) {
  if (!body || typeof body !== "object" || body instanceof FormData)
    return body;
  if (Object.prototype.hasOwnProperty.call(body, COMPANY_PARAM_NAME))
    return body;
  const slug = getApiActiveMainCompanySlug();
  return slug ? { ...body, [COMPANY_PARAM_NAME]: slug } : body;
}

export function buildApiUrl(path, params) {
  const withParams = appendParams(path, params);
  return apiUrl(withParams);
}

function createTimeoutSignal(timeoutMs, existingSignal) {
  if (!(timeoutMs > 0)) {
    return {
      signal: existingSignal,
      cleanup: () => {},
      didTimeout: () => false,
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  let timeoutId = null;

  const abortFromParent = () => {
    controller.abort(existingSignal?.reason);
  };

  if (existingSignal?.aborted) {
    abortFromParent();
  } else if (existingSignal) {
    existingSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("İstek zaman aşımına uğradı."));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (existingSignal) {
        existingSignal.removeEventListener("abort", abortFromParent);
      }
    },
    didTimeout: () => timedOut,
  };
}

async function parseResponsePayload(response, responseType = "auto") {
  if (responseType === "blob") return response.blob();
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function extractPlainText(value) {
  if (typeof value !== "string") return "";
  const noHtml = value
    .replace(/<style[\s\S]*<\/style>/gi, " ")
    .replace(/<script[\s\S]*<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return noHtml;
}

function isLikelyHtml(value) {
  return (
    typeof value === "string" && /<\/(html|body|head|doctype)\b/i.test(value)
  );
}

function buildApiErrorMessage(response, payload) {
  const statusText = `${response.status} ${response.statusText}`.trim();

  if (payload && typeof payload === "object") {
    const rawMessage = payload?.message;
    if (Array.isArray(rawMessage)) {
      const merged = rawMessage
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", ");
      if (merged) return merged;
    }
    if (typeof rawMessage === "string" && rawMessage.trim()) {
      return rawMessage.trim();
    }
  }

  if (typeof payload === "string") {
    if (isLikelyHtml(payload)) {
      if ([502, 503, 504].includes(response.status)) {
        return `${statusText}: API sunucusuna ulaşılamadı. Backend servisinin çalıştığını kontrol edin.`;
      }
      return `${statusText}: Sunucu beklenmeyen bir yanıt döndü.`;
    }
    const plain = extractPlainText(payload);
    if (plain) return plain.slice(0, 300);
  }

  if ([502, 503, 504].includes(response.status)) {
    return `${statusText}: API sunucusuna ulaşılamadı. Backend servisinin çalıştığını kontrol edin.`;
  }

  return statusText || "İstek başarısız";
}

export async function apiFetch(path, options = {}) {
  const {
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    signal: existingSignal,
    params,
    headers,
    body,
    skipAuth = false,
    suppressUnauthorized = false,
    responseType = "auto",
    ...fetchOptions
  } = options;

  const requestPath = appendParams(path, params);
  const requestUrl = buildApiUrl(requestPath);
  const method = String(fetchOptions.method || "GET").toUpperCase();

  const finalHeaders = {
    ...(headers || {}),
  };

  const token = skipAuth ? "" : String(authTokenGetter?.() || "").trim();
  if (token && !finalHeaders.Authorization) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let finalBody = body;
  if (body && !(body instanceof FormData) && typeof body === "object") {
    finalHeaders["Content-Type"] =
      finalHeaders["Content-Type"] || "application/json";
    finalBody = JSON.stringify(attachCompanyToBody(body));
  }

  const { signal, cleanup, didTimeout } = createTimeoutSignal(
    timeoutMs,
    existingSignal,
  );

  try {
    const response = await fetch(requestUrl, {
      ...fetchOptions,
      method,
      headers: finalHeaders,
      body: finalBody,
      signal,
    });

    const payload = await parseResponsePayload(response, responseType);

    if (response.status === 401 && !suppressUnauthorized) {
      onUnauthorized?.();
    }

    if (!response.ok) {
      const error = new Error(buildApiErrorMessage(response, payload));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    if (payload && typeof payload === "object" && payload.ok === false) {
      const rawMessage = payload?.message || "İstek başarısız";
      const message = Array.isArray(rawMessage)
        ? rawMessage.join(", ")
        : String(rawMessage);
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError" && didTimeout()) {
        throw new Error(`${method} ${requestPath}: istek zaman aşımına uğradı`);
      }
      if (
        error.name === "TypeError" &&
        /fetch|network|failed/i.test(String(error?.message || ""))
      ) {
        throw new Error(
          `${method} ${requestPath}: API sunucusuna bağlanılamadı. Backend servisinin çalıştığını kontrol edin.`,
        );
      }
      throw error;
    }
    throw new Error(`${method} ${requestPath}: bilinmeyen hata`);
  } finally {
    cleanup();
  }
}

export async function apiGet(path, params, options = {}) {
  const timeoutMs =
    Number(options.timeoutMs || 0) > 0 ? Number(options.timeoutMs) : undefined;
  const url = buildApiUrl(path, params);
  const now = Date.now();
  const cached = apiGetCache.get(url);
  if (cached && now - cached.timestamp < API_GET_CACHE_TTL_MS) {
    return cached.payload;
  }

  if (apiGetInFlight.has(url)) {
    return apiGetInFlight.get(url);
  }

  const requestPromise = (async () => {
    const payload = await apiFetch(path, {
      params,
      ...(timeoutMs ? { timeoutMs } : {}),
    });
    apiGetCache.set(url, { timestamp: Date.now(), payload });
    return payload;
  })();

  apiGetInFlight.set(url, requestPromise);
  try {
    return await requestPromise;
  } finally {
    apiGetInFlight.delete(url);
  }
}

function clearApiGetCache() {
  apiGetCache.clear();
  apiGetInFlight.clear();
}

export async function apiPost(
  path,
  body,
  { timeoutMs, suppressUnauthorized = false } = {},
) {
  const payload = await apiFetch(path, {
    method: "POST",
    body,
    ...(timeoutMs ? { timeoutMs } : {}),
    suppressUnauthorized,
  });
  clearApiGetCache();
  return payload;
}

export async function apiPatch(path, body, { timeoutMs } = {}) {
  const payload = await apiFetch(path, {
    method: "PATCH",
    body,
    ...(timeoutMs ? { timeoutMs } : {}),
  });
  clearApiGetCache();
  return payload;
}

export async function apiPut(path, body, { timeoutMs } = {}) {
  const payload = await apiFetch(path, {
    method: "PUT",
    body,
    ...(timeoutMs ? { timeoutMs } : {}),
  });
  clearApiGetCache();
  return payload;
}

export async function apiDelete(path, params) {
  const payload = await apiFetch(path, { method: "DELETE", params });
  clearApiGetCache();
  return payload;
}

export async function apiUpload(path, formData) {
  const payload = await apiFetch(path, {
    method: "POST",
    body: formData,
    timeoutMs: DEFAULT_UPLOAD_TIMEOUT_MS,
  });
  clearApiGetCache();
  return payload;
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = fileName;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function downloadFile(path, params, fileName = "export.xlsx") {
  const requestUrl = buildApiUrl(path, params);
  const headers = {};
  const token = String(authTokenGetter?.() || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(requestUrl, { headers });
  if (response.status === 401) onUnauthorized?.();
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${response.status}: Dosya indirilemedi.`);
  }
  const blob = await response.blob();
  downloadBlob(blob, fileName);
  return true;
}

export function downloadExcel(path, fileName = "export.xls") {
  return downloadFile(path, undefined, fileName);
}

export async function checkApiHealth() {
  try {
    const payload = await apiGet("/health");
    return payload && typeof payload === "object" && payload.ok === true;
  } catch {
    return false;
  }
}
