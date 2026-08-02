import { apiPatch } from "../utils/api";

function companyParams(activeMainCompany, extra = {}) {
  const mainCompanySlug = String(
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "",
  ).trim();
  if (!mainCompanySlug) {
    throw new Error("Ana firma seçmeden kayıtlı renk güncellenemez.");
  }
  return {
    ...extra,
    mainCompanySlug,
    mainCompanyId: activeMainCompany?.id || activeMainCompany?.mainCompanyId || undefined,
  };
}

function unwrap(payload, fallback = null) {
  const data = payload?.ok === true ? payload.data : payload;
  return data ?? fallback;
}

export async function updateRegisteredColorIdentity(company, id, body) {
  return unwrap(
    await apiPatch(
      `/boyahane/registered-colors/${encodeURIComponent(id)}`,
      companyParams(company, body),
    ),
    null,
  );
}
