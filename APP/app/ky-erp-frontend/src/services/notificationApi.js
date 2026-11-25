import { apiFetch } from "../utils/api";

function cleanIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
}
function scopeParams(tenant) { return tenant ? { mainCompanySlug: tenant } : {}; }
export async function getNotifications(tenant) {
  const payload = await apiFetch("/notifications", { params: { ...scopeParams(tenant), _ts: Date.now() }, timeoutMs: 20000 });
  if (!Array.isArray(payload?.data?.items)) throw new Error("Bildirim yanıtı doğrulanamadı.");
  return payload.data;
}
export async function markNotificationsRead(ids = [], tenant) {
  const clean = cleanIds(ids);
  if (!clean.length) return { readCount: 0 };
  const payload = await apiFetch("/notifications/read", { method: "POST", body: { ids: clean }, params: scopeParams(tenant), timeoutMs: 15000 });
  if (!Number.isInteger(payload?.data?.readCount)) throw new Error("Okundu kaydı doğrulanamadı.");
  return payload.data;
}
export async function dismissNotifications(ids = [], tenant) {
  const clean = cleanIds(ids);
  if (!clean.length) return { dismissedCount: 0 };
  const payload = await apiFetch("/notifications/dismiss", { method: "POST", body: { ids: clean }, params: scopeParams(tenant), timeoutMs: 15000 });
  if (!Number.isInteger(payload?.data?.dismissedCount)) throw new Error("Temizleme kaydı doğrulanamadı.");
  return payload.data;
}
