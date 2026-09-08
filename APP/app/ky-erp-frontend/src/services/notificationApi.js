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


export async function decideNotificationApproval(item, decision) {
  const approval = item?.approval || {};
  const id = String(approval.id || "").trim();
  const type = String(approval.type || "").trim().toUpperCase();
  const normalized = String(decision || "").trim().toUpperCase();
  if (!id || !["APPROVE", "REJECT"].includes(normalized)) throw new Error("Geçerli bir onay işlemi seçilmedi.");

  if (type === "LOGIN") {
    const action = normalized === "APPROVE" ? "approve" : "deny";
    const payload = await apiPost(`/admin/security/approvals/${encodeURIComponent(id)}/${action}`, {}, { timeoutMs: 15000 });
    return payload?.data || payload;
  }

  if (type === "MAIL_ACCOUNT") {
    const payload = await apiPost(
      `/mail/approvals/${encodeURIComponent(id)}/decision`,
      {
        decision: normalized === "APPROVE" ? "APPROVE" : "REJECT",
        mainCompanySlug: String(approval.mainCompanySlug || item?.meta?.mainCompanySlug || "").trim(),
      },
      { timeoutMs: 20000 },
    );
    return payload?.data || payload;
  }

  throw new Error("Bu bildirim doğrudan onaylanabilir bir işlem değil.");
}
