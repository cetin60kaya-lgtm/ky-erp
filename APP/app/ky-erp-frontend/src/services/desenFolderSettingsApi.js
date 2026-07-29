import { apiGet, apiPost, apiPut } from "../utils/api";

function unwrap(payload) {
  return payload?.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

function companyPayload(activeMainCompany, extra = {}) {
  return {
    mainCompanyId: activeMainCompany?.id || "",
    mainCompanySlug: activeMainCompany?.slug || "",
    ...extra,
  };
}

export async function getDesenFolderSettings(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/desen/folder-settings",
      companyPayload(activeMainCompany),
    ),
  );
}

export async function testDesenFolderSettings(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost(
      "/desen/folder-settings/test",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function saveDesenFolderSettings(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPut(
      "/desen/folder-settings",
      companyPayload(activeMainCompany, payload),
    ),
  );
}

export async function openDesenIncomingFolder(activeMainCompany) {
  return unwrap(
    await apiPost(
      "/desen/folder-settings/open",
      companyPayload(activeMainCompany),
    ),
  );
}
