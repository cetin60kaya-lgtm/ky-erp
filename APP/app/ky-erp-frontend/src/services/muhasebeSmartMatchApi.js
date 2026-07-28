import { apiDelete, apiGet, apiPatch, apiPost } from "../utils/api";

function companyParams(activeMainCompany) {
  const mainCompanySlug = activeMainCompany?.slug || activeMainCompany?.id || "";
  const mainCompanyId = activeMainCompany?.id || "";
  if (!mainCompanySlug) throw new Error("Ana firma zorunludur.");
  return { mainCompanySlug, mainCompanyId };
}

function unwrap(payload) {
  return payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export const getSmartMatchSummary = (activeMainCompany) =>
  apiGet("/muhasebe/smart-match/summary", companyParams(activeMainCompany)).then(unwrap);

export const getCompanyAliases = (activeMainCompany, params = {}) =>
  apiGet("/muhasebe/smart-match/company-aliases", {
    ...companyParams(activeMainCompany),
    ...params,
  }).then(unwrap);

export const createCompanyAlias = (activeMainCompany, payload) =>
  apiPost("/muhasebe/smart-match/company-aliases", {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const passiveCompanyAlias = (activeMainCompany, id) =>
  apiDelete(`/muhasebe/smart-match/company-aliases/${encodeURIComponent(id)}`, companyParams(activeMainCompany)).then(unwrap);

export const getProductAliasesSmart = (activeMainCompany, params = {}) =>
  apiGet("/muhasebe/smart-match/product-aliases", {
    ...companyParams(activeMainCompany),
    ...params,
  }).then(unwrap);

export const createProductAliasSmart = (activeMainCompany, payload) =>
  apiPost("/muhasebe/smart-match/product-aliases", {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const passiveProductAliasSmart = (activeMainCompany, id) =>
  apiDelete(`/muhasebe/smart-match/product-aliases/${encodeURIComponent(id)}`, companyParams(activeMainCompany)).then(unwrap);

export const getPendingProductLines = (activeMainCompany, params = {}) =>
  apiGet("/muhasebe/smart-match/pending-product-lines", {
    ...companyParams(activeMainCompany),
    ...params,
  }).then(unwrap);

export const assignPendingProductLine = (activeMainCompany, lineId, payload) =>
  apiPost(`/muhasebe/smart-match/pending-product-lines/${encodeURIComponent(lineId)}/assign`, {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const setSmartProductRule = (activeMainCompany, productId, payload) =>
  apiPatch(`/muhasebe/smart-match/products/${encodeURIComponent(productId)}/rule`, {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const synchronizeSupplierRouting = (activeMainCompany) =>
  apiPost("/muhasebe/smart-match/supplier-routing/sync", companyParams(activeMainCompany)).then(unwrap);

export const getSmartLotStock = (activeMainCompany, params = {}) =>
  apiGet("/muhasebe/smart-match/lot-stock", {
    ...companyParams(activeMainCompany),
    ...params,
  }).then(unwrap);

export const getExpenseCategoriesForMatch = (activeMainCompany) =>
  apiGet("/muhasebe/rapor-kategorileri", {
    ...companyParams(activeMainCompany),
    active: "ACTIVE",
  }).then(unwrap);
