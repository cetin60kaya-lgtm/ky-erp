import { apiFetch, apiGet, apiPatch, apiPost, apiUpload } from "../utils/api";

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

async function buildPdfOcrPreview(file) {
  if (!(file instanceof File) || !/\.pdf$/i.test(file.name || "")) return null;
  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import("pdfjs-dist/build/pdf.mjs"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  let maxWidth = 0;
  let totalHeight = 0;
  const gap = 16;
  for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 2); pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1800 / Math.max(1, base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("PDF OCR önizleme alanı oluşturulamadı.");
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push(canvas);
    maxWidth = Math.max(maxWidth, canvas.width);
    totalHeight += canvas.height + (pages.length > 1 ? gap : 0);
  }
  if (!pages.length) throw new Error("PDF içinde OCR için okunabilir sayfa bulunamadı.");
  const merged = document.createElement("canvas");
  merged.width = maxWidth;
  merged.height = totalHeight;
  const mergedContext = merged.getContext("2d", { alpha: false });
  if (!mergedContext) throw new Error("PDF OCR önizlemesi birleştirilemedi.");
  let y = 0;
  pages.forEach((canvas, index) => {
    mergedContext.drawImage(canvas, 0, y);
    y += canvas.height + (index < pages.length - 1 ? gap : 0);
  });
  const blob = await new Promise((resolve, reject) =>
    merged.toBlob((value) => (value ? resolve(value) : reject(new Error("PDF OCR önizlemesi üretilemedi."))), "image/jpeg", 0.88),
  );
  return new File([blob], file.name.replace(/\.pdf$/i, "") + "-ocr-preview.jpg", { type: "image/jpeg" });
}

export const getEBelgePool = (params = {}) =>
  apiGet("/e-belge/pool", params, { timeoutMs: 60_000 }).then(unwrap);

export const getEBelgeDetail = (id) =>
  apiGet(`/e-belge/documents/${encodeURIComponent(id)}`, undefined, { timeoutMs: 60_000 }).then(unwrap);

export async function uploadEBelge(files, { direction = "INCOMING", documentKind = "AUTO" } = {}) {
  const selected = Array.from(files || []);
  const form = new FormData();
  selected.forEach((file) => form.append("files", file));
  const previews = await Promise.all(selected.map((file) => buildPdfOcrPreview(file)));
  previews.forEach((preview, index) => {
    if (preview) form.append("preview_" + index, preview);
  });
  form.set("direction", direction);
  form.set("documentKind", documentKind);
  return unwrap(await apiUpload("/e-belge/upload", form));
}

export const reconcileEBelge = (id) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/reconcile`, {}).then(unwrap);

export const reconcileAllEBelge = () =>
  apiPost("/e-belge/reconcile-all", {}, { timeoutMs: 180_000 }).then(unwrap);

export const updateEBelge = (id, payload) =>
  apiPatch(`/e-belge/documents/${encodeURIComponent(id)}`, payload).then(unwrap);

export const finalizeEBelge = (id, payload = {}) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/finalize`, payload, { timeoutMs: 120_000 }).then(unwrap);

export const resolveEBelgeIssue = (id, issueId) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/issues/${encodeURIComponent(issueId)}/resolve`, {}).then(unwrap);

export const getEBelgeCompanySuggestions = (q = "") =>
  apiGet("/e-belge/company-suggestions", { q }, { timeoutMs: 30_000 }).then(unwrap);

export const getEBelgeProductSuggestions = (q = "") =>
  apiGet("/e-belge/products", { q }, { timeoutMs: 30_000 }).then(unwrap);

export const updateEBelgeLine = (documentId, lineId, payload) =>
  apiPatch(`/e-belge/documents/${encodeURIComponent(documentId)}/lines/${encodeURIComponent(lineId)}`, payload).then(unwrap);

export const saveEBelgeProductAlias = (productId, alias, documentId = "") =>
  apiPost(`/e-belge/products/${encodeURIComponent(productId)}/aliases`, { alias, documentId }).then(unwrap);

export const getEBelgeIntegrations = () =>
  apiGet("/e-belge/integrations", undefined, { timeoutMs: 30_000 }).then(unwrap);

export const getEBelgeFilePreview = (fileId) =>
  apiFetch(`/file-hub/files/${encodeURIComponent(fileId)}/preview`, {
    responseType: "blob",
    timeoutMs: 60_000,
  });

export function openEBelgeBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
