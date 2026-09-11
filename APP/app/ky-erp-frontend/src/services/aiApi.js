import { apiDelete, apiFetch, apiGet, apiPost, apiUpload } from "../utils/api";

function normalizeAiAction(action = {}) {
  const id = action.id || action.actionId || "";
  const status = action.status === "COMPLETED" ? "EXECUTED" : action.status;
  const payload = action.payload || {
    companyId: action.companyId || null,
    companyName: action.companyName || "",
    amount: Number(action.amount || 0),
    date: action.date || "",
    recordScope: action.recordScope || "",
    recordType: action.recordType || "",
    paymentMethod: action.paymentMethod || "",
    type: action.type || "",
  };
  return {
    ...action,
    id,
    actionId: id,
    status,
    summary: action.summary || action.label || "Muhasebe işlemini onayla",
    payload,
  };
}

function normalizeAiMessage(message = {}) {
  return {
    ...message,
    actions: Array.isArray(message.actions) ? message.actions.map(normalizeAiAction) : [],
  };
}

function normalizeConversationPayload(payload) {
  if (!payload?.conversation) return payload;
  return {
    ...payload,
    conversation: {
      ...payload.conversation,
      messages: Array.isArray(payload.conversation.messages)
        ? payload.conversation.messages.map(normalizeAiMessage)
        : [],
    },
  };
}

export const getAiStatus = () => apiGet("/ai/status");
export const getAiConversations = () => apiGet("/ai/conversations");
export async function getAiConversation(id) {
  return normalizeConversationPayload(await apiGet(`/ai/conversations/${encodeURIComponent(id)}`));
}
export const deleteAiConversation = (id) => apiDelete(`/ai/conversations/${encodeURIComponent(id)}`);
export async function sendAiMessage(payload, signal) {
  const response = await apiFetch("/ai/chat", {
    method: "POST",
    body: payload,
    signal,
    timeoutMs: 90000,
  });
  return {
    ...response,
    actions: Array.isArray(response?.actions) ? response.actions.map(normalizeAiAction) : [],
  };
}
export const confirmAiAction = (actionId, confirmationToken) =>
  apiPost("/ai/actions/confirm", { actionId, confirmationToken }, { timeoutMs: 60000 });
export const cancelAiAction = (actionId) => apiPost("/ai/actions/cancel", { actionId });

export async function findDesignByImage(activeMainCompany, file) {
  const form = new FormData();
  form.append("image", file);
  const slug = activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  if (slug) form.append("mainCompanySlug", slug);
  const payload = await apiUpload("/desen/visual-search", form, { timeoutMs: 180000 });
  return payload?.data || payload;
}
