import { apiFetch } from "../utils/api";

export const getIsnetLocalFile = (key, format) =>
  apiFetch(
    `/isnet/local-files/${encodeURIComponent(key)}/${encodeURIComponent(format)}`,
    {
      responseType: "blob",
      timeoutMs: 60_000,
    },
  );

export function reserveBlobTab() {
  try {
    const preview = window.open("", "_blank");
    if (preview) {
      try { preview.opener = null; } catch { /* Cross-window opener cleanup is best-effort. */ }
      preview.document.title = "KY ERP belge hazırlanıyor";
      preview.document.body.innerHTML = '<p style="font-family:system-ui,sans-serif;padding:20px">KY ERP belgesi hazırlanıyor...</p>';
    }
    return preview;
  } catch {
    return null;
  }
}

export function openBlobInNewTab(blob, reservedWindow = null) {
  const url = URL.createObjectURL(blob);
  let opened = false;
  try {
    if (reservedWindow && !reservedWindow.closed) {
      reservedWindow.location.href = url;
      opened = true;
    } else {
      const next = window.open(url, "_blank", "noopener,noreferrer");
      opened = Boolean(next);
    }
  } catch {
    opened = false;
  }

  if (!opened) {
    window.location.assign(url);
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
