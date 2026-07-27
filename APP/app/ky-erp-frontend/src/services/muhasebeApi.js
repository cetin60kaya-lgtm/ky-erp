import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "../utils/api";

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
     ? payload?.data
    : payload;
}

export async function getAccountingDashboard(params = {}) {
  return unwrap(await apiGet("/muhasebe/dashboard", params));
}

export async function getAccountingPreview(params = {}) {
  return unwrap(await apiGet("/muhasebe/preview", params));
}

export async function getAccountingManagementSummary(params = {}) {
  try {
    return unwrap(await apiGet("/muhasebe/yonetim-ozeti", params));
  } catch {
    return unwrap(await apiGet("/muhasebe/reports/management-summary", params));
  }
}

export async function getYonetimOzeti(params = {}) {
  return unwrap(await apiGet("/muhasebe/yonetim-ozeti", params));
}

export async function getAccountingReport(reportType, params = {}) {
  return unwrap(
    await apiGet(
      `/muhasebe/raporlar/${encodeURIComponent(reportType)}`,
      params,
    ),
  );
}

export async function exportAccountingReport(reportType, params = {}) {
  return unwrap(
    await apiGet(
      `/muhasebe/raporlar/${encodeURIComponent(reportType)}/yazdir`,
      params,
    ),
  );
}

export async function getFirmaKartlari(params = {}) {
  try {
    return unwrap(await apiGet("/muhasebe/firmalar", withCompany(params)));
  } catch {
    return unwrap(await apiGet("/admin/firma-kartlari", withCompany(params)));
  }
}

export async function saveFirmaKarti(payload = {}) {
  try {
    return unwrap(await apiPost("/muhasebe/firmalar", payload));
  } catch {
    return unwrap(await apiPost("/admin/firma-kartlari", payload));
  }
}

export async function updateFirmaKarti(id, payload = {}) {
  try {
    return unwrap(
      await apiPatch(`/muhasebe/firmalar/${encodeURIComponent(id)}`, payload),
    );
  } catch {
    return unwrap(
      await apiPatch(
        `/admin/firma-kartlari/${encodeURIComponent(id)}`,
        payload,
      ),
    );
  }
}

export async function adjustFirmaBalance(activeMainCompany, id, payload = {}) {
  return unwrap(
    await apiPost(
      `/muhasebe/firma-kartlari/${encodeURIComponent(id)}/adjust-balance`,
      {
        ...withCompany(activeMainCompany),
        ...payload,
      },
    ),
  );
}

export async function getFirmaContacts(firmaId, params = {}) {
  try {
    return unwrap(
      await apiGet("/muhasebe/eposta-kisileri", {
        ...withCompany(params),
        bagliFirma: firmaId,
      }),
    );
  } catch {
    return unwrap(
      await apiGet(
        `/admin/firma-kartlari/${encodeURIComponent(firmaId)}/contacts`,
        withCompany(params),
      ),
    );
  }
}

export async function getBelgeKontrol(params = {}) {
  return unwrap(await apiGet("/muhasebe/belge-havuzu", withCompany(params)));
}

export async function getBelgeKontrolById(activeMainCompany, id) {
  return unwrap(
    await apiGet(
      `/muhasebe/belge-havuzu/${encodeURIComponent(id)}`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function softDeleteBelgeHavuzu(
  activeMainCompany,
  id,
  reason = "Yanlış yükleme",
) {
  return unwrap(
    await apiPatch(`/muhasebe/belge-havuzu/${encodeURIComponent(id)}/sil`, {
      ...withCompany(activeMainCompany),
      reason,
      softDelete: true,
    }),
  );
}

export async function getCariHareketler(params = {}) {
  return unwrap(await apiGet("/muhasebe/firmalar", withCompany(params)));
}

export async function getCariMovements(filters = {}) {
  return unwrap(
    await apiGet("/muhasebe/cari-hareketler", withCompany(filters)),
  );
}

export async function getCariHareketlerByFirma(firmaId, params = {}) {
  return unwrap(
    await apiGet(
      `/muhasebe/cari-hareketler/firma/${encodeURIComponent(firmaId)}`,
      withCompany(params),
    ),
  );
}

export async function getCariMovementDetail(id, params = {}) {
  return unwrap(
    await apiGet(
      `/muhasebe/cari-hareketler/${encodeURIComponent(id)}`,
      withCompany(params),
    ),
  );
}

export async function getCariMovementDocumentDetail(id, params = {}) {
  return unwrap(
    await apiGet(
      `/muhasebe/cari-hareketler/${encodeURIComponent(id)}/belge-detay`,
      withCompany(params),
    ),
  );
}

export async function createCariMovement(payload = {}) {
  return unwrap(await apiPost("/muhasebe/cari-hareketler", payload));
}

export async function passiveCariMovement(id, payload = {}) {
  return unwrap(
    await apiPost(
      `/muhasebe/cari-hareketler/${encodeURIComponent(id)}/pasife-al`,
      payload,
    ),
  );
}

export async function getFirmCariSummary(firmaId, filters = {}) {
  return unwrap(
    await apiGet(
      `/muhasebe/firmalar/${encodeURIComponent(firmaId)}/cari-ozet`,
      withCompany(filters),
    ),
  );
}

export async function getCariEkstre(firmaId, params = {}) {
  return unwrap(
    await apiGet(
      `/muhasebe/cari-hareketler/${encodeURIComponent(firmaId)}/ekstre`,
      withCompany(params),
    ),
  );
}

export async function prepareCariEkstreMail(firmaId, payload = {}) {
  return unwrap(
    await apiPost(
      `/muhasebe/cari-hareketler/${encodeURIComponent(firmaId)}/ekstre-mail-hazirla`,
      payload,
    ),
  );
}

export async function sendCari(firmaId, payload = {}) {
  return unwrap(
    await apiPost(
      `/muhasebe/cari-hareketler/${encodeURIComponent(firmaId)}/cari-gonder`,
      payload,
    ),
  );
}

export async function getKdvKontrol(params = {}) {
  return unwrap(await apiGet("/muhasebe/kdv", params));
}

export async function getCekOdemeler(params = {}) {
  try {
    return unwrap(await apiGet("/muhasebe/cekler", params));
  } catch {
    return unwrap(await apiGet("/muhasebe/cheques", params));
  }
}

export async function getMailEkstre(params = {}) {
  return unwrap(await apiGet("/muhasebe/mail-ekstre", params));
}

export async function getMailTemplates(params = {}) {
  return unwrap(await apiGet("/muhasebe/mail/templates", withCompany(params)));
}

export async function seedMailTemplates(payload = {}) {
  return unwrap(
    await apiPost("/muhasebe/mail/templates/seed", withCompany(payload)),
  );
}

export async function createMailTemplate(payload = {}) {
  return unwrap(
    await apiPost("/muhasebe/mail/templates", withCompany(payload)),
  );
}

export async function updateMailTemplate(templateId, payload = {}) {
  return unwrap(
    await apiPatch(
      `/muhasebe/mail/templates/${encodeURIComponent(templateId)}`,
      withCompany(payload),
    ),
  );
}

export async function deleteMailTemplate(templateId, params = {}) {
  return unwrap(
    await apiDelete(
      `/muhasebe/mail/templates/${encodeURIComponent(templateId)}`,
      withCompany(params),
    ),
  );
}

export async function renderMailTemplate(payload = {}) {
  return unwrap(
    await apiPost("/muhasebe/mail/templates/render", withCompany(payload)),
  );
}

export async function getMailTemplateDrafts(params = {}) {
  return unwrap(
    await apiGet("/muhasebe/mail/templates/drafts/list", withCompany(params)),
  );
}

export async function createMailTemplateDraft(payload = {}) {
  return unwrap(
    await apiPost("/muhasebe/mail/templates/drafts", withCompany(payload)),
  );
}

export async function markMailTemplateDraftSent(draftId, payload = {}) {
  return unwrap(
    await apiPost(
      `/muhasebe/mail/templates/drafts/${encodeURIComponent(draftId)}/mark-sent`,
      withCompany(payload),
    ),
  );
}

export async function getRaporlar(params = {}) {
  return unwrap(await apiGet("/muhasebe/raporlar", params));
}

export async function uploadAccountingDocument(formData) {
  const intakeForm = new FormData();
  const files = formData.getAll("files");
  const legacyFile = formData.get("file");
  if (files.length) {
    files.forEach((file) => intakeForm.append("files", file));
  } else if (legacyFile) {
    intakeForm.append("files", legacyFile);
  }
  const mainCompanySlug = formData.get("mainCompanySlug");
  const mainCompanyId = formData.get("mainCompanyId");
  if (mainCompanySlug) intakeForm.set("mainCompanySlug", mainCompanySlug);
  if (mainCompanyId) intakeForm.set("mainCompanyId", mainCompanyId);
  return unwrap(
    await apiUpload("/muhasebe/document-intake/upload", intakeForm),
  );
}

export async function detectAccountingDocument(documentId) {
  return unwrap(
    await apiPost(
      `/muhasebe/documents/${encodeURIComponent(documentId)}/detect`,
      {},
    ),
  );
}

export async function confirmAccountingDocument(documentId, payload = {}) {
  return unwrap(
    await apiPost(
      `/muhasebe/documents/${encodeURIComponent(documentId)}/confirm`,
      payload,
    ),
  );
}

export async function getDocumentQueue(params = {}) {
  return unwrap(await apiGet("/muhasebe/documents/queue", params));
}

export async function updateDocumentDraft(documentId, payload = {}) {
  return unwrap(
    await apiPatch(
      `/muhasebe/documents/${encodeURIComponent(documentId)}`,
      payload,
    ),
  );
}

export async function getAccountingQueue(params = {}) {
  return unwrap(await apiGet("/muhasebe/workflow/queue", params));
}

export async function runAccountingAction(recordId, action, payload = {}) {
  return unwrap(
    await apiPost(`/muhasebe/workflow/${encodeURIComponent(recordId)}/action`, {
      action,
      ...payload,
    }),
  );
}

export async function getPaymentQueue(params = {}) {
  return unwrap(await apiGet("/muhasebe/payments/queue", params));
}

export async function createPayment(payload = {}) {
  return unwrap(await apiPost("/muhasebe/payments", payload));
}

export async function updatePayment(paymentId, payload = {}) {
  return unwrap(
    await apiPatch(
      `/muhasebe/payments/${encodeURIComponent(paymentId)}`,
      payload,
    ),
  );
}

export async function runPaymentAction(paymentId, action, payload = {}) {
  return unwrap(
    await apiPost(
      `/muhasebe/payments/${encodeURIComponent(paymentId)}/action`,
      {
        action,
        ...payload,
      },
    ),
  );
}

export async function createPaymentReminder(paymentId, payload = {}) {
  return unwrap(
    await apiPost(
      `/muhasebe/payments/${encodeURIComponent(paymentId)}/reminder`,
      payload,
    ),
  );
}

export async function getPaymentReminders(params = {}) {
  return unwrap(await apiGet("/muhasebe/payments/reminders", params));
}

function withCompany(activeMainCompany, extra = {}) {
  const source = activeMainCompany || {};
  const slug =
    source.mainCompanySlug ||
    source.slug ||
    source.mainCompanyId ||
    source.id ||
    "";
  const id = source.mainCompanyId || source.id || "";
  return {
    ...source,
    ...(slug ? { mainCompanySlug: slug } : {}),
    ...(id ? { mainCompanyId: id } : {}),
    ...extra,
  };
}

export async function listModelMuhasebePackages(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/muhasebe/model-muhasebe/packages",
      withCompany(activeMainCompany),
    ),
  );
}

export async function readModelMuhasebePackage(
  activeMainCompany,
  payload = {},
) {
  return unwrap(
    await apiPost("/muhasebe/model-muhasebe/read-package", {
      ...withCompany(activeMainCompany),
      ...payload,
    }),
  );
}

export async function getModelMuhasebePackage(activeMainCompany, packageId) {
  return unwrap(
    await apiGet(
      `/muhasebe/model-muhasebe/package/${encodeURIComponent(packageId)}`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function saveModelMuhasebePackage(
  activeMainCompany,
  payload = {},
) {
  return unwrap(
    await apiPost("/muhasebe/model-muhasebe/save-package", {
      ...withCompany(activeMainCompany),
      ...payload,
    }),
  );
}

export async function searchModelMuhasebeModels(activeMainCompany, q = "") {
  return unwrap(
    await apiGet(
      `/muhasebe/model-muhasebe/models/searchq=${encodeURIComponent(q)}`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function getModelMuhasebeSummary(activeMainCompany, modelId) {
  return unwrap(
    await apiGet(
      `/muhasebe/model-muhasebe/model/${encodeURIComponent(modelId)}/summary`,
      withCompany(activeMainCompany),
    ),
  );
}

export async function getModelOrderCompare(activeMainCompany, modelOrderId) {
  return unwrap(
    await apiGet(
      `/muhasebe/model-muhasebe/model-order/${encodeURIComponent(modelOrderId)}/compare`,
      withCompany(activeMainCompany),
    ),
  );
}
