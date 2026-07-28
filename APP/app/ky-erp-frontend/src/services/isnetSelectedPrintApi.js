import { apiFetch, apiGet, apiPost } from "../utils/api";

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export const getIsnetSelectedPrintQueue = () =>
  apiGet("/isnet/selected-print-queue").then(unwrap);

export const addIsnetSelectedPrintQueue = (keys) =>
  apiPost("/isnet/selected-print-queue/add", { keys }).then(unwrap);

export const removeIsnetSelectedPrintQueue = (keys) =>
  apiPost("/isnet/selected-print-queue/remove", { keys }).then(unwrap);

export const getIsnetSelectedPrintBundle = (keys = []) =>
  apiFetch("/isnet/selected-print-queue/bundle", {
    method: "POST",
    body: { keys },
    responseType: "blob",
    timeoutMs: 120_000,
  });

export const markIsnetSelectedPrintQueuePrinted = (keys) =>
  apiPost("/isnet/selected-print-queue/printed", { keys }).then(unwrap);
