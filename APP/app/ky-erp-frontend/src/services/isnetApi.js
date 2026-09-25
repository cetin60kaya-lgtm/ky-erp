import { apiGet, apiPost, apiPut } from "../utils/api";

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export const getIsnetSettings = () => apiGet("/isnet/settings").then(unwrap);

export const testIsnetSettings = (payload) =>
  apiPost("/isnet/settings/test", payload, {
    suppressUnauthorized: true,
    timeoutMs: 90_000,
  }).then(unwrap);

export const saveIsnetSettings = (payload) =>
  apiPut("/isnet/settings", payload, { timeoutMs: 90_000 }).then(unwrap);
