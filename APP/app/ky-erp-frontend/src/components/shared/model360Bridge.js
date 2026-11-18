export const MODEL_360_OPEN_EVENT = "kyerp:model-360-open";

export function openModel360Card(input = {}) {
  const raw = typeof input === "string" ? { modelId: input } : input || {};
  const modelId = String(raw.modelId || raw.id || raw.model_id || "").trim();
  if (!modelId || typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(MODEL_360_OPEN_EVENT, {
    detail: {
      modelId,
      tab: String(raw.tab || "general"),
      source: String(raw.source || ""),
    },
  }));
  return true;
}
