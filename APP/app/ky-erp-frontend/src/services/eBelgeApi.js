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
  // Never silently OCR only the first pages: Azure can use the full PDF;
  // the image-only fallback must contain every page or require manual review.
  if (pdf.numPages > 20) return null;
  const pages = [];
  let baseWidth = 0, baseHeight = 0;
  const gap = 12;
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    pages.push({ page, base });
    baseWidth = Math.max(baseWidth, base.width);
    baseHeight += base.height;
  }
  if (!pages.length) throw new Error("PDF içinde OCR için okunabilir sayfa bulunamadı.");
  const heightBudget = 16000 - gap * Math.max(0, pages.length - 1);
  const scale = Math.min(2, 1800 / baseWidth, heightBudget / baseHeight,
    Math.sqrt(24_000_000 / (baseWidth * (baseHeight + gap * pages.length))));
  if (!Number.isFinite(scale) || scale < 0.45) return null;
  const merged = document.createElement("canvas");
  merged.width = Math.ceil(baseWidth * scale);
  merged.height = Math.ceil(baseHeight * scale + gap * Math.max(0, pages.length - 1));
  const mergedContext = merged.getContext("2d", { alpha: false });
  if (!mergedContext) throw new Error("PDF OCR önizlemesi birleştirilemedi.");
  mergedContext.fillStyle = "#fff";
  mergedContext.fillRect(0, 0, merged.width, merged.height);
  let y = 0;
  for (const {page} of pages) {
    const viewport = page.getViewport({scale});
    mergedContext.save();
    mergedContext.translate(Math.floor((merged.width-viewport.width)/2),y);
    try{await page.render({canvasContext:mergedContext,viewport}).promise;}
    finally{mergedContext.restore();}
    y += Math.ceil(viewport.height) + gap;
  }
  const blob = await new Promise((resolve, reject) =>
    merged.toBlob((value) => (value ? resolve(value) : reject(new Error("PDF OCR önizlemesi üretilemedi."))), "image/jpeg", 0.88),
  );
  return new File([blob], file.name.replace(/\.pdf$/i, "") + "-ocr-preview.jpg", { type: "image/jpeg" });
}

export const getEBelgeDashboard = (params = {}) =>
  apiGet("/e-belge/dashboard", params, { timeoutMs: 30_000 }).then(unwrap);

export const getEBelgePool = (params = {}) =>
  apiGet("/e-belge/pool", params, { timeoutMs: 60_000 }).then(unwrap);

export const getEBelgeAccountingPrintStatuses = (ids, mainCompanySlug) =>
  apiGet("/e-belge/accounting-print-status", {
    ids: Array.from(ids || []).join(","), mainCompanySlug,
  }, { timeoutMs: 30_000 }).then(unwrap);

export const setEBelgeAccountingPrintStatus = (id, mainCompanySlug, action, reason = "") =>
  apiPatch(`/e-belge/documents/${encodeURIComponent(id)}/accounting-print`, {
    mainCompanySlug, action, reason, confirmed: true,
  }).then(unwrap);

export const getEBelgeDetail = (id) =>
  apiGet(`/e-belge/documents/${encodeURIComponent(id)}`, undefined, { timeoutMs: 60_000 }).then(unwrap);

export async function uploadEBelge(files, { direction = "AUTO", documentKind = "AUTO", manualOnly = false, manualData = null } = {}) {
  const selected = Array.from(files || []);
  const form = new FormData();
  selected.forEach((file) => form.append("files", file));
  // A manual fallback must not depend on the PDF parser/OCR that just failed.
  // If a particular PDF preview is unavailable, the backend keeps the original
  // out of automatic posting and returns a per-file review error instead.
  const previews = manualOnly ? [] : await Promise.all(selected.map(async (file) => {
    try { return await buildPdfOcrPreview(file); } catch { return null; }
  }));
  previews.forEach((preview, index) => {
    if (preview) form.append("preview_" + index, preview);
  });
  form.set("direction", direction);
  form.set("documentKind", documentKind);
  if(manualOnly){form.set("manualOnly","true");form.set("manualData",JSON.stringify(manualData||{}));}
  try {
    return unwrap(await apiUpload("/e-belge/upload", form));
  } catch (error) {
    // HTTP 207 reports partial success: do not disguise successfully
    // staged documents as a fully failed upload and invite duplicates.
    const partial = error?.payload?.data;
    if (Number(error?.status) === 207 &&
        Array.isArray(partial?.items) && Array.isArray(partial?.errors)) {
      return partial;
    }
    throw error;
  }
}

export const getEBelgeVisualProfiles = () =>
  apiGet("/e-belge/visual-profiles", undefined, { timeoutMs: 30_000, forceFresh: true }).then(unwrap);

export async function uploadEBelgeVisualExample(sampleXml, referenceFile, { layout, outputFormat }) {
  const form = new FormData();
  form.set("sampleXml", sampleXml);
  form.set("referenceFile", referenceFile);
  form.set("confirmedSameDocument", "true");
  form.set("layout", JSON.stringify(layout));
  form.set("outputFormat", outputFormat);
  return unwrap(await apiUpload("/e-belge/visual-profiles/sample", form, { timeoutMs: 60_000 }));
}

export const updateEBelgeVisualProfile = (issuer, kind, config) =>
  apiPatch("/e-belge/visual-profiles/" + encodeURIComponent(issuer) + "/" + encodeURIComponent(kind), config).then(unwrap);

export const approveEBelgeVisualProfile = (issuer, kind, approval) =>
  apiPost("/e-belge/visual-profiles/" + encodeURIComponent(issuer) + "/" + encodeURIComponent(kind) + "/approve", approval).then(unwrap);

export const getEBelgeVisualReference = (issuer, kind) =>
  apiFetch("/e-belge/visual-profiles/" + encodeURIComponent(issuer) + "/" + encodeURIComponent(kind) + "/reference",
    { responseType: "blob", timeoutMs: 30_000 });

export const getEBelgeVisualSample = (issuer, kind) =>
  apiFetch("/e-belge/visual-profiles/" + encodeURIComponent(issuer) + "/" + encodeURIComponent(kind) + "/sample-xml",
    { responseType: "blob", timeoutMs: 30_000 });

export const recoverEBelgeCompanyFromXml = (id) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/recover-company-from-xml`, { confirmed: true }).then(unwrap);

export const reconcileEBelge = (id) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/reconcile`, {}).then(unwrap);

export const reconcileAllEBelge = () =>
  apiPost("/e-belge/reconcile-all", {}, { timeoutMs: 180_000 }).then(unwrap);

export const updateEBelge = (id, payload) =>
  apiPatch(`/e-belge/documents/${encodeURIComponent(id)}`, payload).then(unwrap);


export const finalizeEBelge = (id, payload = {}) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/finalize`, payload, { timeoutMs: 120_000 }).then(unwrap);

export const resolveEBelgeIssue = (id, issueId, confirmed = false) =>
  apiPost(`/e-belge/documents/${encodeURIComponent(id)}/issues/${encodeURIComponent(issueId)}/resolve`, {confirmed}).then(unwrap);

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

export function reserveEBelgePreviewTab() {
  try {
    const preview = window.open("", "_blank");
    if (preview) {
      try { preview.opener = null; } catch { /* Opener cleanup is best-effort. */ }
      preview.document.title = "KY ERP belge hazırlanıyor";
      preview.document.body.innerHTML = '<p style="font-family:system-ui,sans-serif;padding:20px">KY ERP belgesi hazırlanıyor...</p>';
    }
    return preview;
  } catch { return null; }
}

export function openEBelgeBlob(blob, reservedWindow = null) {
  const url = URL.createObjectURL(blob);
  let opened = false;
  try {
    if (reservedWindow && !reservedWindow.closed) {
      reservedWindow.location.href = url;
      opened = true;
    } else opened = Boolean(window.open(url, "_blank", "noopener,noreferrer"));
  } catch { opened = false; }
  if (!opened) window.location.assign(url);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
