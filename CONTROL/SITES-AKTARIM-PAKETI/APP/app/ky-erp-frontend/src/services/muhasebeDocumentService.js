import { apiGet, apiPatch, apiPost, apiUpload } from "../utils/api";
import { normalizeList } from "../utils/normalizeList";

function requireCompany(activeMainCompany) {
  const slug =
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  const id = activeMainCompany?.id || activeMainCompany?.mainCompanyId || "";
  if (!slug) throw new Error("Ana firma seçmeden belge yüklenemez.");
  return { mainCompanySlug: slug, mainCompanyId: id };
}

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
     ? payload?.data
    : payload;
}

export async function uploadMuhasebeDocuments(
  activeMainCompany,
  files,
  options = {},
) {
  const company = requireCompany(activeMainCompany);
  const formData = new FormData();
  Array.from(files || []).forEach((file) => formData.append("files", file));
  formData.set("mainCompanySlug", company?.mainCompanySlug);
  if (company?.mainCompanyId)
    formData.set("mainCompanyId", company?.mainCompanyId);
  if (options.documentType) formData.set("documentType", options.documentType);
  if (options.templateId) formData.set("templateId", options.templateId);
  if (options.templateCompanyName)
    formData.set("templateCompanyName", options.templateCompanyName);
  if (options.notes) formData.set("notes", options.notes);
  return unwrap(await apiUpload("/muhasebe/document-upload", formData));
}

export async function fetchDocumentUploadHistory(
  activeMainCompany,
  params = {},
) {
  return normalizeList(
    unwrap(
      await apiGet("/muhasebe/document-upload/history", {
        ...requireCompany(activeMainCompany),
        ...params,
      }),
    ),
  );
}

export async function fetchDocumentUploadSummary(
  activeMainCompany,
  params = {},
) {
  return unwrap(
    await apiGet("/muhasebe/document-upload/summary", {
      ...requireCompany(activeMainCompany),
      ...params,
    }),
  );
}

export async function fetchBelgeHavuzu(activeMainCompany, params = {}) {
  return normalizeList(
    unwrap(
      await apiGet("/muhasebe/belge-havuzu", {
        ...requireCompany(activeMainCompany),
        ...params,
      }),
    ),
  );
}

export async function uploadDocumentIntake(
  activeMainCompany,
  files,
  options = {},
) {
  const company = requireCompany(activeMainCompany);
  const formData = new FormData();
  Array.from(files || []).forEach((file) => formData.append("files", file));
  formData.set("mainCompanySlug", company?.mainCompanySlug);
  if (company?.mainCompanyId)
    formData.set("mainCompanyId", company?.mainCompanyId);
  if (options.autoApprove) formData.set("autoApprove", "true");
  return unwrap(await apiUpload("/muhasebe/document-intake/upload", formData));
}

export async function uploadBelgeImport(activeMainCompany, files, options = {}) {
  const company = requireCompany(activeMainCompany);
  const formData = new FormData();
  Array.from(files || []).forEach((file) => formData.append("files", file));
  formData.set("mainCompanySlug", company?.mainCompanySlug);
  if (company?.mainCompanyId)
    formData.set("mainCompanyId", company?.mainCompanyId);
  if (options.autoProcess) formData.set("autoApprove", "true");
  return unwrap(
    await apiUpload(
      options.autoProcess
         ? "/muhasebe/belge-import/auto-process"
        : "/muhasebe/belge-import/upload",
      formData,
    ),
  );
}

export async function fetchBelgeImport(activeMainCompany, params = {}) {
  return normalizeList(
    unwrap(
      await apiGet("/muhasebe/belge-import", {
        ...requireCompany(activeMainCompany),
        ...params,
      }),
    ),
  );
}

export async function fetchBelgeImportDetail(activeMainCompany, id) {
  return unwrap(
    await apiGet(
      `/muhasebe/belge-import/${encodeURIComponent(id)}`,
      requireCompany(activeMainCompany),
    ),
  );
}

export async function approveBelgeImport(activeMainCompany, id, payload = {}) {
  return unwrap(
    await apiPost(`/muhasebe/belge-import/${encodeURIComponent(id)}/approve`, {
      ...payload,
      confirm: true,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function retryBelgeImport(activeMainCompany, id) {
  return unwrap(
    await apiPost(`/muhasebe/belge-import/${encodeURIComponent(id)}/retry`, {
      confirm: true,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function rejectBelgeImport(
  activeMainCompany,
  id,
  reason = "Belge kullanıcı tarafından reddedildi.",
) {
  return unwrap(
    await apiPost(`/muhasebe/belge-import/${encodeURIComponent(id)}/reject`, {
      reason,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function convertBelgeImportToPaidExpense(
  activeMainCompany,
  id,
  payload = {},
) {
  return unwrap(
    await apiPost(
      `/muhasebe/belge-import/${encodeURIComponent(id)}/convert-to-paid-expense`,
      {
        postingType: "PAID_EXPENSE",
        reason: "Belge Islem Merkezi uzerinden pesin gidere cevrildi.",
        ...payload,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function purgeDocumentIntake(
  activeMainCompany,
  id,
  reason = "Belge kullanici tarafindan kalici silindi.",
) {
  return unwrap(
    await apiPost(
      `/muhasebe/document-intake/${encodeURIComponent(id)}/purge`,
      {
        reason,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function purgeRejectedDocumentIntake(
  activeMainCompany,
  params = {},
) {
  return unwrap(
    await apiPost("/muhasebe/document-intake/purge-rejected", {
      documentKind: "SUPPLIER_INVOICE",
      reason: "Belge Islem Merkezi hatali/duplicate temizligi.",
      ...params,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function fetchDocumentIntake(activeMainCompany, params = {}) {
  return normalizeList(
    unwrap(
      await apiGet("/muhasebe/document-intake", {
        ...requireCompany(activeMainCompany),
        ...params,
      }),
    ),
  );
}

export async function fetchDocumentIntakeDetail(activeMainCompany, id) {
  return unwrap(
    await apiGet(
      `/muhasebe/document-intake/${encodeURIComponent(id)}`,
      requireCompany(activeMainCompany),
    ),
  );
}

export async function fixDocumentIntake(activeMainCompany, id, payload) {
  return unwrap(
    await apiPatch(`/muhasebe/document-intake/${encodeURIComponent(id)}/fix`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function createDocumentIntakeFirm(activeMainCompany, id, payload) {
  return unwrap(
    await apiPost(
      `/muhasebe/document-intake/${encodeURIComponent(id)}/create-firm`,
      {
        ...payload,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function createDocumentIntakeProduct(
  activeMainCompany,
  id,
  lineId,
  payload,
) {
  return unwrap(
    await apiPost(
      `/muhasebe/document-intake/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}/create-product`,
      {
        ...payload,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function approveDocumentIntake(
  activeMainCompany,
  id,
  payload = {},
) {
  return unwrap(
    await apiPost(
      `/muhasebe/document-intake/${encodeURIComponent(id)}/approve`,
      {
        ...payload,
        confirm: true,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function archiveDocumentIntake(
  activeMainCompany,
  id,
  reason = "Yanlis veya gereksiz yukleme",
) {
  return unwrap(
    await apiPost(
      `/muhasebe/document-intake/${encodeURIComponent(id)}/archive`,
      {
        reason,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function bulkApproveDocumentIntake(
  activeMainCompany,
  ids = [],
  payload = {},
) {
  return unwrap(
    await apiPost("/muhasebe/document-intake/bulk-approve", {
      ...payload,
      ids,
      confirm: true,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function fetchDocumentReadTemplates(activeMainCompany) {
  return normalizeList(
    unwrap(
      await apiGet(
        "/muhasebe/document-read-templates",
        requireCompany(activeMainCompany),
      ),
    ),
  );
}

export async function saveDocumentReadTemplate(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/muhasebe/document-read-templates", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function fetchBelgeHavuzuById(activeMainCompany, id) {
  return unwrap(
    await apiGet(
      `/muhasebe/belge-havuzu/${encodeURIComponent(id)}`,
      requireCompany(activeMainCompany),
    ),
  );
}

export async function updateBelgeHavuzu(activeMainCompany, id, payload) {
  return unwrap(
    await apiPatch(`/muhasebe/belge-havuzu/${encodeURIComponent(id)}`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function rejectBelgeHavuzu(activeMainCompany, id, reason) {
  return unwrap(
    await apiPost(`/muhasebe/belge-havuzu/${encodeURIComponent(id)}/reddet`, {
      reason,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function approveBelgeHavuzu(activeMainCompany, id, payload = {}) {
  return unwrap(
    await apiPost(`/muhasebe/belge-havuzu/${encodeURIComponent(id)}/onayla`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function enqueueBelgeHavuzuApprovals(
  activeMainCompany,
  items = [],
) {
  return unwrap(
    await apiPost("/muhasebe/belge-havuzu/onay-kuyrugu", {
      items,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function fetchBelgeHavuzuApprovalQueue(activeMainCompany, jobId) {
  return normalizeList(
    unwrap(
      await apiGet(
        `/muhasebe/belge-havuzu/onay-kuyrugu/${encodeURIComponent(jobId)}`,
        requireCompany(activeMainCompany),
      ),
    ),
  );
}

export async function reprocessBelgeHavuzu(activeMainCompany, id) {
  return unwrap(
    await apiPost(
      `/muhasebe/belge-havuzu/${encodeURIComponent(id)}/tekrar-tasnif-et`,
      {
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function reprocessPendingBelgeHavuzu(activeMainCompany) {
  return unwrap(
    await apiPost("/muhasebe/belge-havuzu/yeniden-isle", {
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function cleanupOldDocumentUploads(activeMainCompany) {
  return unwrap(
    await apiPost("/muhasebe/belge-yukleme/eski-kayitlari-temizle", {
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function softDeleteBelgeYukleme(
  activeMainCompany,
  id,
  reason = "Yanlış yükleme",
) {
  return unwrap(
    await apiPatch(`/muhasebe/belge-yukleme/${encodeURIComponent(id)}/sil`, {
      reason,
      softDelete: true,
      ...requireCompany(activeMainCompany),
    }),
  );
}
