import { apiGet, apiPost, apiUpload } from "../utils/api";

function company(activeMainCompany) {
  const mainCompanySlug =
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  const mainCompanyId =
    activeMainCompany?.id || activeMainCompany?.mainCompanyId || "";
  if (!mainCompanySlug) throw new Error("Ana firma seçmeden e-Belge Merkezi kullanılamaz.");
  return { mainCompanySlug, mainCompanyId };
}

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function uploadEBelge(activeMainCompany, files) {
  const ctx = company(activeMainCompany);
  const formData = new FormData();
  Array.from(files || []).forEach((file) => formData.append("files", file));
  formData.set("mainCompanySlug", ctx.mainCompanySlug);
  if (ctx.mainCompanyId) formData.set("mainCompanyId", ctx.mainCompanyId);
  formData.set("autoApprove", "false");
  return unwrap(await apiUpload("/e-belge/upload", formData));
}

export async function fetchEBelgePool(activeMainCompany, params = {}) {
  return unwrap(
    await apiGet("/e-belge/pool", {
      ...company(activeMainCompany),
      ...params,
    }),
  );
}

export async function fetchEBelgeDetail(activeMainCompany, id) {
  return unwrap(
    await apiGet(`/e-belge/documents/${encodeURIComponent(id)}`, company(activeMainCompany)),
  );
}

export async function reconcileEBelge(activeMainCompany, id) {
  return unwrap(
    await apiPost(`/e-belge/documents/${encodeURIComponent(id)}/reconcile`, {
      ...company(activeMainCompany),
    }),
  );
}

export async function reconcileAllEBelge(activeMainCompany) {
  return unwrap(
    await apiPost("/e-belge/reconcile-all", {
      ...company(activeMainCompany),
    }),
  );
}
