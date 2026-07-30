import { apiGet, apiPost, apiUpload, buildApiUrl } from "../utils/api";

function unwrap(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return payload?.data;
  }
  if (
    payload &&
    typeof payload === "object" &&
    payload.success === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return payload?.data;
  }
  return payload;
}

export async function getOdemeFirmalar(params = {}) {
  return unwrap(await apiGet("/api/muhasebe/odeme/firmalar", params));
}

export async function getOdemeFirmaOzet(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/ozet`,
      params,
    ),
  );
}

export async function getOdemeFirmaCekler(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/cekler`,
      params,
    ),
  );
}

export async function getOdemeCekOzeti(params = {}) {
  return unwrap(await apiGet("/api/muhasebe/odeme/cekler", params));
}

export async function getOdemeFirmaKartlar(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/kartlar`,
      params,
    ),
  );
}

export async function getOdemeFirmaNakitHavale(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/nakit-havale`,
      params,
    ),
  );
}

export async function getOdemeFirmaHareketler(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/hareketler`,
      params,
    ),
  );
}

export async function getOdemeFirmaAcikBorclar(firmId, params = {}) {
  return unwrap(
    await apiGet(
      `/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/acik-kalemler`,
      params,
    ),
  );
}

export async function createOdemeFirma(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/firma", payload));
}

export async function createOdemeCek(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/cek-v3", payload));
}

export async function uploadOdemeCekDosyalari(
  checkId,
  activeMainCompany,
  files = {},
) {
  const formData = new FormData();
  const slug =
    activeMainCompany?.mainCompanySlug || activeMainCompany?.slug || "";
  const id = activeMainCompany?.mainCompanyId || activeMainCompany?.id || "";
  if (slug) formData.set("mainCompanySlug", slug);
  if (id) formData.set("mainCompanyId", id);
  if (files.front) formData.set("front", files.front);
  if (files.back) formData.set("back", files.back);
  if (files.receipt) formData.set("receipt", files.receipt);
  return unwrap(
    await apiUpload(
      `/api/muhasebe/odeme/cek/${encodeURIComponent(checkId)}/dosyalar`,
      formData,
    ),
  );
}

export function odemeCekDosyaUrl(checkId, side, activeMainCompany = {}) {
  const slug =
    activeMainCompany?.mainCompanySlug || activeMainCompany?.slug || "";
  const id = activeMainCompany?.mainCompanyId || activeMainCompany?.id || "";
  const query = new URLSearchParams();
  if (slug) query.set("mainCompanySlug", slug);
  if (id) query.set("mainCompanyId", id);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return buildApiUrl(
    `/api/muhasebe/odeme/cek/${encodeURIComponent(checkId)}/dosya/${encodeURIComponent(side)}${suffix}`,
  );
}

export async function createOdemeKart(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/kart", payload));
}

export async function saveOdemeIslem(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/islem", payload));
}
