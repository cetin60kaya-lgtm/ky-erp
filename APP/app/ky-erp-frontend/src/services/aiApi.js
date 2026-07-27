import { apiDelete, apiFetch, apiGet, apiPost } from "../utils/api";

export const getAiStatus = () => apiGet("/ai/status");
export const getAiConversations = () => apiGet("/ai/conversations");
export const getAiConversation = (id) => apiGet(`/ai/conversations/${encodeURIComponent(id)}`);
export const deleteAiConversation = (id) => apiDelete(`/ai/conversations/${encodeURIComponent(id)}`);
export const sendAiMessage = (payload, signal) => apiFetch("/ai/chat", { method: "POST", body: payload, signal, timeoutMs: 90000 });
export const confirmAiAction = (actionId, confirmationToken) => apiPost("/ai/actions/confirm", { actionId, confirmationToken }, { timeoutMs: 60000 });
export const cancelAiAction = (actionId) => apiPost("/ai/actions/cancel", { actionId });

