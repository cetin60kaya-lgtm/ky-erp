import { apiFetch, apiPost } from "../utils/api";

const EMPTY = {
  items: [],
  unreadCount: 0,
  totalCount: 0,
  partial: false,
  sourceErrors: [],
  generatedAt: "",
};

export async function getNotifications() {
  const payload = await apiFetch("/notifications", { timeoutMs: 20000 });
  return payload?.data && typeof payload.data === "object" ? payload.data : EMPTY;
}

export async function markNotificationsRead(ids = []) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!clean.length) return { readCount: 0 };
  const payload = await apiPost("/notifications/read", { ids: clean }, { timeoutMs: 15000 });
  return payload?.data || { readCount: clean.length };
}
