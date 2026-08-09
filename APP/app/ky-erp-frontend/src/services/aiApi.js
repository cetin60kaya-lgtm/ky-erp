import { apiDelete, apiFetch, apiGet, apiPost, apiUpload } from "../utils/api";

export const getAiStatus = () => apiGet("/ai/status");
export const getAiConversations = () => apiGet("/ai/conversations");
export const getAiConversation = (id) => apiGet(`/ai/conversations/${encodeURIComponent(id)}`);
export const deleteAiConversation = (id) => apiDelete(`/ai/conversations/${encodeURIComponent(id)}`);
export const sendAiMessage = (payload, signal) => apiFetch("/ai/chat", { method: "POST", body: payload, signal, timeoutMs: 90000 });
export const confirmAiAction = (actionId, confirmationToken) => apiPost("/ai/actions/confirm", { actionId, confirmationToken }, { timeoutMs: 60000 });
export const cancelAiAction = (actionId) => apiPost("/ai/actions/cancel", { actionId });


export async function findDesignByImage(activeMainCompany, file) {
  const form = new FormData();
  form.append("image", file);
  const slug = activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  if (slug) form.append("mainCompanySlug", slug);
  const payload = await apiUpload("/desen/visual-search", form, { timeoutMs: 180000 });
  return payload?.data || payload;
}
