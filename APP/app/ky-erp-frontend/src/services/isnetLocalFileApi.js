import { apiFetch } from "../utils/api";

export const getIsnetLocalFile = (key, format) =>
  apiFetch(
    `/isnet/local-files/${encodeURIComponent(key)}/${encodeURIComponent(format)}`,
    {
      responseType: "blob",
      timeoutMs: 60_000,
    },
  );

export function openBlobInNewTab(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
