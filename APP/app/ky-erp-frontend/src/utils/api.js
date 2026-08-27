import { shouldClearStoredAuthForStatus } from "../context/authSessionPolicy";
import { canonicalCompanySlug } from "./companyIdentity";

const PRODUCTION_API_ORIGIN = "https://api.kyerp.net";
const DEFAULT_API_ORIGIN =
  typeof import.meta !== "undefined" && import.meta.env.PROD
    ? PRODUCTION_API_ORIGIN
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

function normalizeApiBase(value) {
  const clean = trimTrailingSlash(String(value || "").trim());
  if (!clean) return "";
  return /\/api$/i.test(clean) ? clean : `${clean}/api`;
}

export function getApiBase() {
  const isProd = typeof import.meta !== "undefined" && import.meta.env.PROD;
  const envBaseRaw =
    typeof import.meta !== "undefined"
      ? import.meta.env.VITE_API_URL ||
        import.meta.env.VITE_API_BASE_URL ||
        import.meta.env.VITE_API_BASE ||
        ""
      : "";
  const envBase = normalizeApiBase(envBaseRaw);

  // Canlı sistemin tek canonical taşıma yolu doğrudan API custom domainidir.
  if (isProd) return `${PRODUCTION_API_ORIGIN}/api`;
  return envBase || `${DEFAULT_API_ORIGIN}/api`;
}

export const API_BASE = getApiBase();

export function apiUrl(path) {
  const raw = String(path || "").trim();
  if (!raw) return API_BASE;
  if (/^https:\/\//i.test(raw)) return raw;
  const normalized = ensureLeadingSlash(raw);
  if (normalized === "/api" || normalized.startsWith("/api/")) {
    return `${API_BASE.replace(/\/api$/i, "")}${normalized}`;
  }
  return `${API_BASE}${normalized}`;
}

function readStoredCompanySlug() {
  try {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setApiAuthHandlers(handlers = {}) {
  authTokenGetter =
    typeof handlers.getToken === "function" ? handlers.getToken : () => "";
  onUnauthorized =
    typeof handlers.onUnauthorized === "function" ? handlers.onUnauthorized : () => {};
}

export function setApiActiveMainCompany(company) {
  activeMainCompany = company || null;
}

export function getApiActiveMainCompanySlug() {
  return canonicalCompanySlug(
    activeMainCompany?.slug ||
      activeMainCompany?.mainCompanySlug ||
      activeMainCompany ||
      readStoredCompanySlug() ||
      "",
  );
}

function shouldAutoAttachCompany(path) {
  const normalizedPath = String(path || "");
  if (/^https:\/\//i.test(normalizedPath)) return false;
  return !/^\/(?:api\/)?(health|system\/status|auth(?:\/|$)|admin\/main-companies)(\/|$)/i.test(
    normalizedPath,
  );
}

function appendParams(path, params = {}) {
  const raw = String(path || "");
  if (/^https:\/\//i.test(raw)) {
    const url = new URL(raw);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;
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
  if (!body || typeof body !== "object" || body instanceof FormData) return body;
  if (Object.prototype.hasOwnProperty.call(body, COMPANY_PARAM_NAME)) return body;
  const slug = getApiActiveMainCompanySlug();
  return slug ? { ...body, [COMPANY_PARAM_NAME]: slug } : body;
}

export function buildApiUrl(path, params) {
  const withParams = appendParams(path, params);
  return /^https:\/\//i.test(withParams) ? withParams : apiUrl(withParams);
}

function createTimeoutSignal(timeoutMs, existingSignal) {
  if (!(timeoutMs > 0)) {
    return { signal: existingSignal, cleanup: () => {}, didTimeout: () => false };
  }

  const controller = new AbortController();
  let timedOut = false;
  let timeoutId = null;
  const abortFromParent = () => controller.abort(existingSignal?.reason);

  if (existingSignal?.aborted) abortFromParent();
  else if (existingSignal) {
    existingSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (existingSignal) existingSignal.removeEventListener("abort", abortFromParent);
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
  return value
    .replace(/<style[\s\S]*<\/style>/gi, " ")
    .replace(/<script[\s\S]*<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyHtml(value) {
  return typeof value === "string" && /<\/?(html|body|head|doctype)\b/i.test(value);
}

function cleanServerMessage(value) {
  const text = extractPlainText(String(value || ""))
    .replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/\S+\s*:\s*/i, "")
    .trim();
  if (!text) return "";
  if (/endpoint bulunamad[ıi]/i.test(text)) {
    return "Bu işlem sunucuda henüz kullanıma açık değil.";
  }
  return text.slice(0, 300);
}

function payloadMessage(payload) {
  if (!payload || typeof payload !== "object") return "";
  for (const candidate of [payload?.error?.message, payload?.message]) {
    if (Array.isArray(candidate)) {
      const merged = candidate.map(cleanServerMessage).filter(Boolean).join(", ");
      if (merged) return merged;
    }
    const message = cleanServerMessage(candidate);
    if (message) return message;
  }
  return "";
}

function statusMessage(status) {
  if (status === 400) return "Girilen bilgileri kontrol edip tekrar deneyin.";
  if (status === 401) return "Oturum süreniz doldu. Yeniden giriş yapın.";
  if (status === 403) return "Bu işlem için yetkiniz bulunmuyor.";
  if (status === 404) return "İstenen kayıt veya işlem bulunamadı.";
  if (status === 409) return "Kayıt güncel durumuyla çakışıyor. Ekranı yenileyip tekrar deneyin.";
  if (status === 413) return "Gönderilen dosya izin verilen boyutu aşıyor.";
  if (status === 422) return "Bilgiler doğrulanamadı. Zorunlu alanları kontrol edin.";
  if (status === 429) return "Çok fazla işlem yapıldı. Kısa bir süre sonra tekrar deneyin.";
  if ([502, 503, 504].includes(status)) return "KY ERP API geçici olarak yanıt veremedi. Tekrar deneyin.";
  if (status >= 500) return "KY ERP sunucusunda geçici bir işlem hatası oluştu. Tekrar deneyin.";
  return "İşlem tamamlanamadı. Tekrar deneyin.";
}

function buildApiErrorMessage(response, payload) {
  const fromPayload = payloadMessage(payload);
  if (fromPayload) return fromPayload;
  if (typeof payload === "string" && !isLikelyHtml(payload)) {
    const plain = cleanServerMessage(payload);
    if (plain) return plain;
  }
  return statusMessage(response.status);
}

function createRequestError(message, details = {}) {
  const error = new Error(message || "İşlem tamamlanamadı.");
  Object.entries(details).forEach(([key, value]) => {
    if (value !== undefined) error[key] = value;
  });
  return error;
}

function isNetworkFailure(error) {
  return error instanceof Error &&
    error.name === "TypeError" &&
    /fetch|network|failed|connection|load/i.test(String(error.message || ""));
}

async function fetchTransport(requestUrl, requestPath, method, init) {
  void requestPath;
  void method;
  return fetch(requestUrl, init);
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
  const requestUrl = /^https:\/\//i.test(requestPath) ? requestPath : apiUrl(requestPath);
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const finalHeaders = { Accept: "application/json", ...(headers || {}) };
  const token = skipAuth ? "" : String(authTokenGetter?.() || "").trim();
  const companySlug = getApiActiveMainCompanySlug();

  if (token && !finalHeaders.Authorization) finalHeaders.Authorization = `Bearer ${token}`;
  if (companySlug && !finalHeaders["X-KYERP-Tenant-Slug"] && shouldAutoAttachCompany(path)) {
    finalHeaders["X-KYERP-Tenant-Slug"] = companySlug;
  }

  let finalBody = body;
  if (body && !(body instanceof FormData) && typeof body === "object") {
    finalHeaders["Content-Type"] = finalHeaders["Content-Type"] || "application/json";
    finalBody = JSON.stringify(attachCompanyToBody(body));
  }

  const { signal, cleanup, didTimeout } = createTimeoutSignal(timeoutMs, existingSignal);

  try {
    const response = await fetchTransport(requestUrl, requestPath, method, {
      ...fetchOptions,
      method,
      headers: finalHeaders,
      body: finalBody,
      signal,
      cache: fetchOptions.cache || "no-store",
      mode: /^https:\/\//i.test(requestUrl) ? "cors" : fetchOptions.mode,
    });

    const payload = await parseResponsePayload(response, responseType);
    if (shouldClearStoredAuthForStatus(response.status) && !suppressUnauthorized) onUnauthorized?.();

    if (!response.ok) {
      throw createRequestError(buildApiErrorMessage(response, payload), {
        status: response.status,
        code: payload?.error?.code || payload?.code,
        payload,
        method,
        requestPath,
        requestUrl,
      });
    }

    if (payload && typeof payload === "object" && payload.ok === false) {
      throw createRequestError(payloadMessage(payload) || "İşlem sunucu tarafından tamamlanamadı.", {
        status: response.status,
        code: payload?.error?.code || payload?.code,
        payload,
        method,
        requestPath,
        requestUrl,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof Error) {
      if (error.requestPath) throw error;
      if (error.name === "AbortError" && didTimeout()) {
        throw createRequestError("Sunucu zamanında yanıt vermedi. Tekrar deneyin.", {
          code: "REQUEST_TIMEOUT",
          method,
          requestPath,
          requestUrl,
        });
      }
      if (isNetworkFailure(error)) {
        throw createRequestError("KY ERP API bağlantısı geçici olarak kurulamadı. Tekrar deneyin.", {
          code: "NETWORK_ERROR",
          method,
          requestPath,
          requestUrl,
          cause: error,
        });
      }
      error.method = error.method || method;
      error.requestPath = error.requestPath || requestPath;
      error.requestUrl = error.requestUrl || requestUrl;
      throw error;
    }
    throw createRequestError("İşlem tamamlanamadı. Tekrar deneyin.", {
      code: "UNKNOWN_ERROR",
      method,
      requestPath,
      requestUrl,
    });
  } finally {
    cleanup();
  }
}

export async function apiGet(path, params, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 0) > 0 ? Number(options.timeoutMs) : undefined;
  const url = buildApiUrl(path, params);
  const now = Date.now();
  const cached = apiGetCache.get(url);
  if (cached && now - cached.timestamp < API_GET_CACHE_TTL_MS) return cached.payload;
  if (apiGetInFlight.has(url)) return apiGetInFlight.get(url);

  const requestPromise = (async () => {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const payload = await apiFetch(path, {
          params,
          ...(timeoutMs ? { timeoutMs } : {}),
        });
        apiGetCache.set(url, { timestamp: Date.now(), payload });
        return payload;
      } catch (error) {
        lastError = error;
        const status = Number(error?.status || 0);
        const transient = [0, 500, 502, 503, 504].includes(status) ||
          ["NETWORK_ERROR", "REQUEST_TIMEOUT"].includes(String(error?.code || ""));
        if (!transient || attempt === 1) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
    }
    throw lastError;
  })();

  apiGetInFlight.set(url, requestPromise);
  try {
    return await requestPromise;
  } finally {
    apiGetInFlight.delete(url);
  }
}

export function clearApiGetCache() {
  apiGetCache.clear();
  apiGetInFlight.clear();
}

export async function apiPost(path, body, { timeoutMs, suppressUnauthorized = false } = {}) {
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
  const requestPath = appendParams(path, params);
  const requestUrl = /^https:\/\//i.test(requestPath) ? requestPath : apiUrl(requestPath);
  const headers = {};
  const token = String(authTokenGetter?.() || "").trim();
  const companySlug = getApiActiveMainCompanySlug();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (companySlug) headers["X-KYERP-Tenant-Slug"] = companySlug;

  try {
    const response = await fetchTransport(requestUrl, requestPath, "GET", {
      headers,
      cache: "no-store",
      mode: "cors",
    });
    if (shouldClearStoredAuthForStatus(response.status)) onUnauthorized?.();
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let payload = text;
      try { payload = text ? JSON.parse(text) : null; } catch { /* plain text */ }
      throw createRequestError(buildApiErrorMessage(response, payload), {
        status: response.status,
        payload,
        method: "GET",
        requestPath,
        requestUrl,
      });
    }
    const blob = await response.blob();
    downloadBlob(blob, fileName);
    return true;
  } catch (error) {
    if (error?.requestPath) throw error;
    throw createRequestError("Dosya indirilemedi. Sunucu bağlantısını kontrol edip tekrar deneyin.", {
      code: "DOWNLOAD_FAILED",
      method: "GET",
      requestPath,
      requestUrl,
    });
  }
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
