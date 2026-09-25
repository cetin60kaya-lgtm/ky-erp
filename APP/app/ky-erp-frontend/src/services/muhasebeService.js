import { apiGet } from "../utils/api";
import { normalizeList } from "../utils/normalizeList";

function companyParams(activeMainCompany) {
  const slug = activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  const id = activeMainCompany?.id || activeMainCompany?.mainCompanyId || "";
  if (!slug && !id) throw new Error("Ana firma zorunludur.");
  return {
    ...(slug ? { mainCompanySlug: slug } : {}),
    ...(id ? { mainCompanyId: id } : {}),
  };
}

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function fetchCompanies(activeMainCompany) {
  return normalizeList(unwrap(await apiGet("/muhasebe/firmalar", {
    ...companyParams(activeMainCompany),
    limit: 10000,
  })));
}

export async function fetchProducts(activeMainCompany) {
  return normalizeList(unwrap(await apiGet("/boyahane/products", {
    ...companyParams(activeMainCompany),
    limit: 1000,
  })));
}
