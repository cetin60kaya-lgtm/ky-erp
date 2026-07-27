import { apiGet, apiPost, apiPut } from "../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload?.data
    : payload?.data ?? payload;
}

function company(activeMainCompany = {}) {
  return {
    mainCompanySlug: activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "",
    mainCompanyId: activeMainCompany?.id || activeMainCompany?.mainCompanyId || "",
  };
}

export const DEFAULT_PRINT_REGION_NAME = "Ön";

export function defaultPrintRegions() {
  return [
    {
      id: "ON_BASKI-1",
      regionCode: "ON_BASKI",
      regionName: DEFAULT_PRINT_REGION_NAME,
      sortOrder: 1,
      isActive: true,
    },
  ];
}

export function normalizePrintRegions(value) {
  const rows = Array.isArray(value)
     ? value
    : typeof value === "string"
       ? value.split(/[,;+|]/).map((item) => item?.trim()).filter(Boolean)
      : [];
  if (!rows.length) return defaultPrintRegions();
  const seen = new Set();
  return rows
    .map((item, index) => {
      const regionName =
        typeof item === "string"
           ? item
          : item?.regionName || item?.name || item?.label || item?.bolge || item?.printArea || "";
      const cleanName = String(regionName || "").trim();
      if (!cleanName) return null;
      const regionCode =
        typeof item === "object" && item?.regionCode
           ? item?.regionCode
          : cleanName
              .toLocaleUpperCase("tr-TR")
              .replace(/İ/g, "I")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^A-Z0-9]+/g, "_")
              .replace(/_+/g, "_")
              .replace(/^_|_$/g, "");
      const key = String(regionCode || cleanName).toLocaleUpperCase("tr-TR");
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: item?.id || `${regionCode || "BOLGE"}-${index + 1}`,
        regionCode: regionCode || `BOLGE_${index + 1}`,
        regionName: cleanName,
        sortOrder: Number(item?.sortOrder || item?.order || index + 1),
        isActive: item?.isActive !== false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

export function activePrintRegions(model = {}) {
  const safeModel = model && typeof model === "object" ? model : {};
  const active = normalizePrintRegions(
    safeModel.printRegions ||
      safeModel.baskiBolgeleri ||
      safeModel.baskiBolgesi ||
      safeModel.printArea,
  ).filter((region) => region.isActive !== false);
  return active.length ? active : defaultPrintRegions();
}

export async function fetchModelPrintRegions(activeMainCompany, modelId) {
  const data = await apiGet(
    `/model-takip/models/${encodeURIComponent(modelId)}/print-regions`,
    company(activeMainCompany),
  );
  return normalizePrintRegions(unwrap(data));
}

export async function saveModelPrintRegions(activeMainCompany, modelId, regions) {
  const data = await apiPut(
    `/model-takip/models/${encodeURIComponent(modelId)}/print-regions`,
    {
      ...company(activeMainCompany),
      regions: normalizePrintRegions(regions),
    },
  );
  return unwrap(data);
}

export async function addModelPrintRegion(activeMainCompany, modelId, regionName) {
  const data = await apiPost(
    `/model-takip/models/${encodeURIComponent(modelId)}/print-regions`,
    {
      ...company(activeMainCompany),
      regionName,
    },
  );
  return unwrap(data);
}
