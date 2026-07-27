import { apiGet, apiPatch, apiPost, apiUpload } from "../utils/api";

export { fetchErpModuleData, runErpApprovedAction } from "./erpApi";

function unwrap(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return payload?.data;
  }
  return payload;
}

function withCompany(activeMainCompany, extra = {}) {
  return {
    ...(activeMainCompany || {}),
    ...extra,
  };
}

export async function getDesenIsler(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/desen/isler", withCompany(activeMainCompany, params)),
  );
}

export async function createDesenIs(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost("/desen/isler", withCompany(activeMainCompany, payload)),
  );
}

export async function updateDesenIs(activeMainCompany, id, payload = {}) {
  return unwrap(
    await apiPatch(
      `/desen/isler/${encodeURIComponent(id)}`,
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function getDesenRaporlar(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/desen/raporlar", withCompany(activeMainCompany, params)),
  );
}

export async function getDesenModelRenkleri(
  activeMainCompany,
  modelOrderId,
  params = {},
) {
  return unwrap(
    await apiGet(
      `/desen/model-renkleri/${encodeURIComponent(modelOrderId)}`,
      withCompany(activeMainCompany, params),
    ),
  );
}

export async function getDesenSimpleModels(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/desen/models-simple",
      withCompany(activeMainCompany, params),
    ),
  );
}

export async function getDesenHavuz(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/desen/havuz", withCompany(activeMainCompany, params)),
  );
}

export async function syncDesenHavuzWatchFolder(
  activeMainCompany,
  payload = {},
) {
  return unwrap(
    await apiPost(
      "/desen/havuz/sync-watch-folder",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function getDesenImportFolderStatus(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet(
      "/desen/import/folder-status",
      withCompany(activeMainCompany, params),
    ),
  );
}

export async function scanDesenImportFolder(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/desen/import/folder-scan",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function openDesenImportFolder(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/desen/import/open-folder",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function getDesenHavuzStorageDurum(
  activeMainCompany,
  params = {},
) {
  return unwrap(
    await apiGet(
      "/desen/havuz/storage-durum",
      withCompany(activeMainCompany, params),
    ),
  );
}

export async function uploadDesenHavuzImage(
  activeMainCompany,
  file,
  payload = {},
) {
  const form = new FormData();
  form.append("file", file);
  const company = withCompany(activeMainCompany, payload);
  Object.entries(company).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      form.append(key, String(value));
    }
  });
  return unwrap(await apiUpload("/desen/havuz/upload-image", form));
}

export async function searchDesenHavuz(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/desen/havuz/search", withCompany(activeMainCompany, params)),
  );
}

export async function updateDesenHavuzKaydi(
  activeMainCompany,
  id,
  payload = {},
) {
  return unwrap(
    await apiPatch(
      `/desen/havuz/${encodeURIComponent(id)}`,
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function bulkDesenHavuzFirmaAta(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/desen/havuz/bulk-firma-ata",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function bulkDesenHavuzModelEkle(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/desen/havuz/bulk-model-havuzuna-ekle",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function runDesenHavuzOcrIndex(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/desen/havuz/ocr-index",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function createDesenModelRengi(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/desen/model-renkleri",
      withCompany(activeMainCompany, payload),
    ),
  );
}

export async function updateDesenModelRengi(
  activeMainCompany,
  id,
  payload = {},
) {
  return unwrap(
    await apiPatch(
      `/desen/model-renkleri/${encodeURIComponent(id)}`,
      withCompany(activeMainCompany, payload),
    ),
  );
}
