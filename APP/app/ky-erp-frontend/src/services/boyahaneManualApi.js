import { apiPost } from "../utils/api";

function companyParams(activeMainCompany, extra = {}) {
  const mainCompanySlug = String(
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "",
  ).trim();
  if (!mainCompanySlug) {
    throw new Error("Ana firma seçmeden Boyahane işi açılamaz.");
  }
  return {
    ...extra,
    mainCompanySlug,
    mainCompanyId:
      activeMainCompany?.id || activeMainCompany?.mainCompanyId || undefined,
  };
}

function unwrap(payload) {
  return payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function createManualBoyahaneJob(activeMainCompany, payload) {
  return unwrap(
    await apiPost(
      "/boyahane/jobs/manual",
      companyParams(activeMainCompany, payload),
    ),
  );
}
