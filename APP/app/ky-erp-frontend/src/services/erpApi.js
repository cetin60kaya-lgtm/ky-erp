import { apiGet, apiPost } from "../utils/api";

export function buildCriticalPayload(activeMainCompany, payload = {}) {
  return {
    ...payload,
    confirm: payload.confirm === true,
    mainCompanyId: activeMainCompany?.id || payload?.mainCompanyId || "",
    mainCompanySlug: activeMainCompany?.slug || payload?.mainCompanySlug || "",
  };
}

export async function fetchErpModuleData(moduleKey, activeMainCompany, fallback = []) {
  try {
    const payload = await apiGet(`/erp/${moduleKey}`, {
      mainCompanyId: activeMainCompany?.id,
      mainCompanySlug: activeMainCompany?.slug,
    });
    return Array.isArray(payload?.items) ? payload?.items : Array.isArray(payload) ? payload : fallback;
  } catch (error) {
    console.warn(`ERP modül verisi okunamadı: ${moduleKey}`, error);
    return fallback;
  }
}

export async function runErpApprovedAction(moduleKey, recordId, action, payload, activeMainCompany) {
  const body = buildCriticalPayload(activeMainCompany, {
    recordId,
    action,
    ...payload,
  });
  if (action.critical && body.confirm !== true) {
    throw new Error("Kritik işlem kullanıcı onayı olmadan API'ye gönderilemez.");
  }
  return apiPost(`/erp/${moduleKey}/actions`, body);
}
