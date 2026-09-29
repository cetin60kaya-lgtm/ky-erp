import { apiGet, apiPut } from "../utils/api";

function unwrap(payload) {
  return payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload?.data ?? payload;
}

export async function getDialogLayout(key) {
  const data = unwrap(await apiGet(`/ui/dialog-layouts/${encodeURIComponent(key)}`));
  return data && typeof data === "object" ? data : { key, layout: null, canPersist: false };
}

export async function saveDialogLayout(key, layout) {
  const data = unwrap(await apiPut(`/ui/dialog-layouts/${encodeURIComponent(key)}`, {
    width: Math.round(Number(layout?.width) || 0),
    height: Math.round(Number(layout?.height) || 0),
  }));
  return data && typeof data === "object" ? data : { key, layout: null, canPersist: false };
}
