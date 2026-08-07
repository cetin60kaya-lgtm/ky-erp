// Mobile Upload Helper
import { getMobileToken } from "./mobileApi";
import { API_BASE } from "../utils/api";

/**
 * Upload a file via POST /storage/upload (multipart/form-data)
 */
export async function mobileUploadFile({ file, targetType, entityId, modelId, firmaId, note, mainCompanySlug }) {
  if (!file) throw new Error("Dosya seçilmedi.");

  const token = getMobileToken();
  const form = new FormData();
  form.append("file", file);
  form.append("targetType", targetType || "genel");
  const tenantSlug = String(mainCompanySlug || localStorage.getItem("kyerp.activeCompany") || "").trim();
  if (!tenantSlug) throw new Error("Aktif firma bulunamadı.");
  form.append("mainCompanySlug", tenantSlug);
  if (entityId) form.append("entityId", String(entityId));
  if (modelId) form.append("modelId", String(modelId));
  if (firmaId) form.append("firmaId", String(firmaId));
  if (note) form.append("note", String(note));

  const res = await fetch(`${API_BASE}/storage/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, "X-KYERP-Tenant-Slug": tenantSlug } : {},
    body: form,
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { message: text }; }

  if (!res.ok) {
    const msg = (json && typeof json === "object" && (json.message || json.error)) || `HTTP ${res.status}`;
    const err = new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function mobileUpload(file, extra = {}) {
  return mobileUploadFile({ file, ...(extra || {}) });
}

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function isImageFile(file) {
  return file?.type.startsWith("image/") || false;
}

/** Desen havuzuna doğrudan görsel yükle */
export async function mobileUploadHavuzImage({ file, modelName, firmName, firmId }) {
  if (!file) throw new Error("Dosya seçilmedi.");
  const token = getMobileToken();
  const form = new FormData();
  form.append("file", file);
  const tenantSlug = String(localStorage.getItem("kyerp.activeCompany") || "").trim();
  if (!tenantSlug) throw new Error("Aktif firma bulunamadı.");
  form.append("mainCompanySlug", tenantSlug);
  if (modelName) form.append("modelName", String(modelName));
  if (firmName) form.append("firmName", String(firmName));
  if (firmId) form.append("firmId", String(firmId));

  const res = await fetch(`${API_BASE}/desen/havuz/upload-image`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, "X-KYERP-Tenant-Slug": tenantSlug } : {},
    body: form,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { message: text }; }
  if (!res.ok) {
    const msg = (json && typeof json === "object" && (json.message || json.error)) || `HTTP ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
  return json.data ?? json;
}
