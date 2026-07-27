import { apiGet, apiPost } from "../utils/api";

function unwrap(payload) {
  if (payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")) {
    return payload?.data;
  }
  if (payload && typeof payload === "object" && payload.success === true && Object.prototype.hasOwnProperty.call(payload, "data")) {
    return payload?.data;
  }
  return payload;
}

export async function getOdemeFirmalar(params = {}) {
  return unwrap(await apiGet("/api/muhasebe/odeme/firmalar", params));
}

export async function getOdemeFirmaOzet(firmId, params = {}) {
  return unwrap(await apiGet(`/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/ozet`, params));
}

export async function getOdemeFirmaCekler(firmId, params = {}) {
  return unwrap(await apiGet(`/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/cekler`, params));
}

export async function getOdemeFirmaKartlar(firmId, params = {}) {
  return unwrap(await apiGet(`/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/kartlar`, params));
}

export async function getOdemeFirmaNakitHavale(firmId, params = {}) {
  return unwrap(await apiGet(`/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/nakit-havale`, params));
}

export async function getOdemeFirmaHareketler(firmId, params = {}) {
  return unwrap(await apiGet(`/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/hareketler`, params));
}

export async function getOdemeFirmaAcikBorclar(firmId, params = {}) {
  return unwrap(await apiGet(`/api/muhasebe/odeme/firmalar/${encodeURIComponent(firmId)}/acik-kalemler`, params));
}

export async function createOdemeFirma(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/firma", payload));
}

export async function createOdemeCek(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/cek", payload));
}

export async function createOdemeKart(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/kart", payload));
}

export async function saveOdemeIslem(payload = {}) {
  return unwrap(await apiPost("/api/muhasebe/odeme/islem", payload));
}
