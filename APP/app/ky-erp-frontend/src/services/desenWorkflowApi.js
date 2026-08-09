import {
  API_BASE,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  apiUpload,
  downloadFile,
} from "../utils/api";

function unwrap(payload) {
  return payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

function normalizeCompanyRole(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I");
}

function isCustomerCompany(row) {
  const role = normalizeCompanyRole(
    `${row?.type || ""} ${row?.companyType || row?.company_type || ""}`,
  );
  if (/BOTH|CUSTOMER|MUSTERI|ALICI|HER IKISI/.test(role)) return true;
  if (/SUPPLIER|TEDARIK/.test(role)) return false;
  return true;
}

function customerCompanies(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.isActive !== false && row?.is_active !== 0)
    .filter(isCustomerCompany)
    .sort((a, b) => {
      const aName = String(a?.name || a?.firmaAdi || "");
      const bName = String(b?.name || b?.firmaAdi || "");
      const aTaha = /^TAHA\b/.test(normalizeCompanyRole(aName));
      const bTaha = /^TAHA\b/.test(normalizeCompanyRole(bName));
      if (aTaha !== bTaha) return aTaha ? -1 : 1;
      return aName.localeCompare(bName, "tr");
    });
}

export function companyParams(activeMainCompany, extra = {}) {
  return {
    mainCompanyId: activeMainCompany?.id || "",
    mainCompanySlug: activeMainCompany?.slug || "",
    ...extra,
  };
}

export async function getDesignInbox(activeMainCompany) {
  return unwrap(
    await apiGet("/desen/workflow/inbox", companyParams(activeMainCompany)),
  );
}

export async function uploadDesignInbox(activeMainCompany, files) {
  const form = new FormData();
  Array.from(files || []).forEach((file) => form.append("files", file));
  Object.entries(companyParams(activeMainCompany)).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      form.append(key, String(value));
    }
  });
  return unwrap(
    await apiUpload("/desen/workflow/inbox/upload", form, {
      timeoutMs: 600000,
    }),
  );
}

export async function scanDesignInbox(activeMainCompany) {
  return unwrap(
    await apiPost(
      "/desen/workflow/inbox/scan",
      companyParams(activeMainCompany),
    ),
  );
}

export async function processDesignInbox(activeMainCompany, payload) {
  return unwrap(
    await apiPost(
      "/desen/workflow/inbox/process",
      companyParams(activeMainCompany, payload),
    ),
  );
}

export async function processDesignInboxBulk(activeMainCompany, payload) {
  return unwrap(
    await apiPost(
      "/desen/workflow/inbox/process-bulk",
      companyParams(activeMainCompany, payload),
      { timeoutMs: 600000 },
    ),
  );
}

export async function ignoreDesignInbox(activeMainCompany, ids) {
  return unwrap(
    await apiPost(
      "/desen/workflow/inbox/ignore",
      companyParams(activeMainCompany, { ids }),
    ),
  );
}

export async function moveDesignInboxToError(
  activeMainCompany,
  ids,
  reason = "",
) {
  return unwrap(
    await apiPost(
      "/desen/workflow/inbox/move-to-error",
      companyParams(activeMainCompany, { ids, reason }),
    ),
  );
}

export function inboxPreviewUrl(activeMainCompany, id) {
  const query = new URLSearchParams(companyParams(activeMainCompany));
  return `${API_BASE}/desen/workflow/inbox/${encodeURIComponent(id)}/preview?${query}`;
}

export async function getDesignModels(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/desen/workflow/models",
      companyParams(activeMainCompany, { limit: 1000, ...params }),
    ),
  );
}

export async function getDesignModel(activeMainCompany, id) {
  return unwrap(
    await apiGet(
      `/desen/workflow/models/${encodeURIComponent(id)}`,
      companyParams(activeMainCompany),
    ),
  );
}

export async function analyzeDesignModel(
  activeMainCompany,
  id,
  payload = {},
) {
  return unwrap(
    await apiPost(
      `/desen/workflow/models/${encodeURIComponent(id)}/analyze`,
      companyParams(activeMainCompany, payload),
      { timeoutMs: 600000 },
    ),
  );
}

export async function analyzeDesignModels(
  activeMainCompany,
  ids = [],
  payload = {},
) {
  return unwrap(
    await apiPost(
      "/desen/workflow/analyze",
      companyParams(activeMainCompany, { ids, ...payload }),
      { timeoutMs: 600000 },
    ),
  );
}

export async function getDesignAnalysisStatus(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/desen/workflow/analysis/status",
      companyParams(activeMainCompany),
    ),
  );
}

export async function createDesignModel(activeMainCompany, payload) {
  return unwrap(
    await apiPost(
      "/desen/workflow/models",
      companyParams(activeMainCompany, payload),
    ),
  );
}

export async function updateDesignModel(activeMainCompany, id, payload) {
  return unwrap(
    await apiPut(
      `/desen/workflow/models/${encodeURIComponent(id)}`,
      companyParams(activeMainCompany, payload),
    ),
  );
}

export async function archiveDesignModel(activeMainCompany, id) {
  return unwrap(
    await apiPost(
      `/desen/workflow/models/${encodeURIComponent(id)}/archive`,
      companyParams(activeMainCompany),
    ),
  );
}

export async function createDesignOperation(
  activeMainCompany,
  modelId,
  payload,
) {
  return unwrap(
    await apiPost(
      `/desen/workflow/models/${encodeURIComponent(modelId)}/operations`,
      companyParams(activeMainCompany, payload),
    ),
  );
}

export async function updateDesignOperation(
  activeMainCompany,
  operationId,
  payload,
) {
  return unwrap(
    await apiPut(
      `/desen/workflow/operations/${encodeURIComponent(operationId)}`,
      companyParams(activeMainCompany, payload),
    ),
  );
}

export async function getDesignOperationTotals(
  activeMainCompany,
  operationId,
) {
  return unwrap(
    await apiGet(
      `/desen/workflow/operations/${encodeURIComponent(operationId)}/totals`,
      companyParams(activeMainCompany),
    ),
  );
}

export async function uploadDesignWorkflowFile(
  activeMainCompany,
  modelId,
  operationId,
  file,
  fileRole,
) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(
    companyParams(activeMainCompany, { operationId, fileRole }),
  ).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      form.append(key, String(value));
    }
  });
  return unwrap(
    await apiUpload(
      `/desen/workflow/models/${encodeURIComponent(modelId)}/files`,
      form,
    ),
  );
}

export async function deleteDesignOperation(activeMainCompany, operationId) {
  return unwrap(
    await apiDelete(
      `/desen/workflow/operations/${encodeURIComponent(operationId)}`,
      companyParams(activeMainCompany),
    ),
  );
}

export async function parseDesignChannels(
  activeMainCompany,
  operationId,
  text,
) {
  return unwrap(
    await apiPost(
      `/desen/workflow/operations/${encodeURIComponent(operationId)}/channels/parse`,
      companyParams(activeMainCompany, { text }),
    ),
  );
}

export async function replaceDesignChannels(
  activeMainCompany,
  operationId,
  channels,
) {
  return unwrap(
    await apiPost(
      `/desen/workflow/operations/${encodeURIComponent(operationId)}/channels`,
      companyParams(activeMainCompany, { channels }),
    ),
  );
}

export async function reorderDesignChannels(
  activeMainCompany,
  operationId,
  channelIds,
) {
  return unwrap(
    await apiPost(
      `/desen/workflow/operations/${encodeURIComponent(operationId)}/channels/reorder`,
      companyParams(activeMainCompany, { channelIds }),
    ),
  );
}

export async function updateDesignChannel(
  activeMainCompany,
  channelId,
  payload,
) {
  return unwrap(
    await apiPut(
      `/desen/workflow/channels/${encodeURIComponent(channelId)}`,
      companyParams(activeMainCompany, payload),
    ),
  );
}

export async function deleteDesignChannel(activeMainCompany, channelId) {
  return unwrap(
    await apiDelete(
      `/desen/workflow/channels/${encodeURIComponent(channelId)}`,
      companyParams(activeMainCompany),
    ),
  );
}

export async function saveDesignColorGroup(
  activeMainCompany,
  operationId,
  payload,
) {
  return unwrap(
    await apiPost(
      `/desen/workflow/operations/${encodeURIComponent(operationId)}/color-groups`,
      companyParams(activeMainCompany, payload),
    ),
  );
}

export async function updateDesignColorGroup(
  activeMainCompany,
  groupId,
  payload,
) {
  return unwrap(
    await apiPut(
      `/desen/workflow/color-groups/${encodeURIComponent(groupId)}`,
      companyParams(activeMainCompany, payload),
    ),
  );
}

export async function linkDesignRegisteredColor(
  activeMainCompany,
  groupId,
  registeredColorId,
) {
  return unwrap(
    await apiPost(
      `/desen/workflow/color-groups/${encodeURIComponent(groupId)}/link-registered-color`,
      companyParams(activeMainCompany, { registeredColorId }),
    ),
  );
}

export async function getRegisteredDesignColors(activeMainCompany, q = "") {
  return unwrap(
    await apiGet(
      "/desen/workflow/registered-colors",
      companyParams(activeMainCompany, { q }),
    ),
  );
}

export async function syncDesignDyehouse(
  activeMainCompany,
  modelId,
  force = false,
) {
  return unwrap(
    await apiPost(
      `/desen/workflow/models/${encodeURIComponent(modelId)}/sync-dyehouse`,
      companyParams(activeMainCompany, { force }),
    ),
  );
}

export async function getDesignReports(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/desen/workflow/reports",
      companyParams(activeMainCompany, params),
    ),
  );
}

export function designReportExportUrl(activeMainCompany, params = {}) {
  const query = new URLSearchParams(companyParams(activeMainCompany, params));
  return `${API_BASE}/desen/workflow/reports/export?${query}`;
}

export function downloadDesignReport(activeMainCompany, params = {}) {
  const date = new Date().toISOString().slice(0, 10);
  return downloadFile(
    "/desen/workflow/reports/export",
    companyParams(activeMainCompany, params),
    `desen-raporu-${date}.csv`,
  );
}

export async function getDesignCompanies(activeMainCompany) {
  const payload = unwrap(
    await apiGet(
      "/muhasebe/firmalar",
      companyParams(activeMainCompany, { limit: 1000 }),
    ),
  );
  const rows = Array.isArray(payload) ? payload : payload?.rows || payload?.items || [];
  return customerCompanies(rows);
}
