import { apiDelete, apiGet, apiPatch, apiPost } from "../utils/api";

const COMPANY_REQUIRED_MESSAGE =
  "Ana firma seçmeden imalat verileri görüntülenemez.";

function requireCompany(activeMainCompany) {
  const mainCompanySlug = String(
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "",
  ).trim();
  if (!mainCompanySlug) throw new Error(COMPANY_REQUIRED_MESSAGE);
  return {
    mainCompanySlug,
    mainCompanyId: activeMainCompany?.id || activeMainCompany?.mainCompanyId,
  };
}

function unwrap(payload, fallback = null) {
  if (payload && typeof payload === "object" && payload.ok === true) {
    return payload?.data ?? fallback;
  }
  // TODO: /imalat aliasları tamamen standart { ok, data, message } formatına
  // taşınınca doğrudan obje/array desteği kaldırılacak.
  return payload ?? fallback;
}

function normalizeBedenler(value) {
  if (Array.isArray(value)) {
    return value
      .map((row) => ({
        beden: String(row?.beden || row?.size || "").trim(),
        adet: Number(row?.adet ? row?.quantity ?? 0),
      }))
      .filter((row) => row?.beden || row?.adet > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,\n;]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((beden) => ({ beden, adet: 0 }));
  }
  return [];
}

function normalizeProductionPayload(payload = {}) {
  return {
    ...payload,
    siparisNo: payload?.siparisNo || payload?.musteriIrsaliyeNo || "",
    modelId: payload?.modelId || payload?.modelKaydiId || "",
    modelAdi: payload?.modelAdi || payload?.modelName || "",
    zeminRenk: payload?.zeminRenk || payload?.zemin || "",
    toplamAdet: Number(payload?.toplamAdet ? payload?.uretimAdedi ?? 0),
    bedenler: normalizeBedenler(payload?.bedenler),
  };
}

export async function fetchImalatBootstrap(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/imalat/bootstrap", {
      ...requireCompany(activeMainCompany),
      ...params,
    }),
    { makinalar: [], kaliteKayitlari: [], uretimKayitlari: [], modelKayitlari: [] },
  );
}

export async function fetchMachines(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/imalat/makinalar", {
      ...requireCompany(activeMainCompany),
      ...params,
    }),
    [],
  );
}

export async function saveMachine(activeMainCompany, payload) {
  // TODO: Makina oluşturma/güncelleme backend activity log helper ile loglanacak.
  const company = requireCompany(activeMainCompany);
  if (payload?.id) {
    return unwrap(
      await apiPatch(`/imalat/makinalar/${encodeURIComponent(payload?.id)}`, {
        ...payload,
        ...company,
      }),
    );
  }
  return unwrap(await apiPost("/imalat/makinalar", { ...payload, ...company }));
}

export async function deleteMachine(activeMainCompany, id) {
  return unwrap(
    await apiDelete(`/imalat/makinalar/${encodeURIComponent(id)}`, {
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function fetchMachineDeleteSummary(activeMainCompany, id) {
  return unwrap(
    await apiGet(`/imalat/makinalar/${encodeURIComponent(id)}/delete-summary`, {
      ...requireCompany(activeMainCompany),
    }),
    {},
  );
}

export async function fetchShiftDefaults() {
  // TODO: Backend /imalat/shift-defaults endpointi eklendiğinde gerçek kaynağa bağlanacak.
  return [];
}

export async function saveShiftDefaults() {
  // TODO: Vardiya varsayılanı kaydı backend activity log helper ile loglanacak.
  throw new Error("Vardiya varsayılanları API endpointi henüz bağlı değil.");
}

export async function fetchProductionRecords(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/imalat/kayitlar", {
      ...requireCompany(activeMainCompany),
      ...params,
    }),
    [],
  );
}

export async function fetchProductionRecordById(activeMainCompany, id, params = {}) {
  return unwrap(
    await apiGet(`/imalat/kayitlar/${encodeURIComponent(id)}`, {
      ...requireCompany(activeMainCompany),
      ...params,
    }),
    null,
  );
}

export async function saveProductionRecord(activeMainCompany, payload) {
  // TODO: Üretim kaydı oluşturma backend activity log helper ile loglanacak.
  return unwrap(
    await apiPost("/imalat/kayitlar", {
      ...normalizeProductionPayload(payload),
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function updateProductionRecord(activeMainCompany, id, payload) {
  // TODO: Üretim kaydı güncelleme backend activity log helper ile loglanacak.
  return unwrap(
    await apiPatch(`/imalat/kayitlar/${encodeURIComponent(id)}`, {
      ...normalizeProductionPayload(payload),
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function linkProductionToModel(activeMainCompany, id, payload) {
  // TODO: Üretim-model bağlantısı backend activity log helper ile loglanacak.
  return unwrap(
    await apiPost(`/imalat/production-records/${encodeURIComponent(id)}/link-model`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function saveQualityRecord(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/imalat/kalite", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}
