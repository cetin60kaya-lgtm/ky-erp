import { apiFetch, apiPost } from "../utils/api";

const EMPTY = {
  items: [], unreadCount: 0, totalCount: 0,
  partial: false, sourceErrors: [], generatedAt: "",
};

export async function getNotifications() {
  const payload = await apiFetch("/notifications", { timeoutMs: 20000 });
  return payload?.data && typeof payload.data === "object" ? payload.data : EMPTY;
}

function cleanIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

export async function markNotificationsRead(ids = []) {
  const clean = cleanIds(ids);
  if (!clean.length) return { readCount: 0 };
  const payload = await apiPost("/notifications/read", { ids: clean }, { timeoutMs: 15000 });
  return payload?.data || { readCount: clean.length };
}

export async function dismissNotifications(ids = []) {
  const clean = cleanIds(ids);
  if (!clean.length) return { dismissedCount: 0 };
  const payload = await apiPost("/notifications/dismiss", { ids: clean }, { timeoutMs: 15000 });
  return payload?.data || { dismissedCount: clean.length };
}
