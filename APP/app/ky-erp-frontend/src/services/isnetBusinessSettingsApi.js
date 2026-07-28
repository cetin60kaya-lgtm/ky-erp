import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../utils/api";

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

export const getIsnetBusinessSettings = (activeMainCompany) =>
  apiGet("/isnet/business-settings", companyParams(activeMainCompany)).then(unwrap);

export const saveIsnetBusinessSettings = (activeMainCompany, payload) =>
  apiPut("/isnet/business-settings", {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const createIsnetDepartment = (activeMainCompany, payload) =>
  apiPost("/isnet/business-settings/departments", {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const updateIsnetDepartment = (activeMainCompany, id, payload) =>
  apiPatch(`/isnet/business-settings/departments/${encodeURIComponent(id)}`, {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const createIsnetContact = (activeMainCompany, payload) =>
  apiPost("/isnet/business-settings/contacts", {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const updateIsnetContact = (activeMainCompany, id, payload) =>
  apiPatch(`/isnet/business-settings/contacts/${encodeURIComponent(id)}`, {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const createIsnetModelMapping = (activeMainCompany, payload) =>
  apiPost("/isnet/business-settings/model-mappings", {
    ...companyParams(activeMainCompany),
    ...payload,
  }).then(unwrap);

export const deleteIsnetModelMapping = (activeMainCompany, id) =>
  apiDelete(
    `/isnet/business-settings/model-mappings/${encodeURIComponent(id)}`,
    companyParams(activeMainCompany),
  ).then(unwrap);

export const resolveIsnetBusinessContext = (activeMainCompany, params = {}) =>
  apiGet("/isnet/business-settings/resolve", {
    ...companyParams(activeMainCompany),
    ...params,
  }).then(unwrap);
