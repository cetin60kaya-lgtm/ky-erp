import { apiPost } from "../utils/api";

function companyPayload(activeMainCompany) {
  const mainCompanySlug = String(
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "",
  ).trim();
  if (!mainCompanySlug) {
    throw new Error("Ana firma seçmeden numune işi oluşturulamaz.");
  }
  return {
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

export async function createBoyahaneSampleFromDesign(activeMainCompany, modelId) {
  return unwrap(
    await apiPost(
      `/boyahane/sample-jobs/from-design/${encodeURIComponent(modelId)}`,
      companyPayload(activeMainCompany),
    ),
  );
}
