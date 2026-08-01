import { apiDelete, apiGet, apiPatch, apiPost } from "../utils/api";

function companyParams(activeMainCompany, extra = {}) {
  const mainCompanySlug = String(
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "",
  ).trim();
  if (!mainCompanySlug) {
    throw new Error("Ana firma seçmeden Boyahane verileri görüntülenemez.");
  }
  return {
    ...extra,
    mainCompanySlug,
    mainCompanyId:
      activeMainCompany?.id || activeMainCompany?.mainCompanyId || undefined,
  };
}

function unwrap(payload, fallback) {
  const data = payload?.ok === true ? payload.data : payload;
  return data ?? fallback;
}

export async function listBoyahaneJobs(company, params = {}) {
  return unwrap(
    await apiGet("/boyahane/jobs", companyParams(company, params)),
    [],
  );
}

export async function getBoyahaneJob(company, id) {
  return unwrap(
    await apiGet(
      `/boyahane/jobs/${encodeURIComponent(id)}`,
      companyParams(company),
    ),
    null,
  );
}

export async function startBoyahaneJob(company, id, force = false) {
  return unwrap(
    await apiPost(
      `/boyahane/jobs/${encodeURIComponent(id)}/start`,
      companyParams(company, { force }),
    ),
    null,
  );
}

export async function patchBoyahaneJob(company, id, body) {
  return unwrap(
    await apiPatch(
      `/boyahane/jobs/${encodeURIComponent(id)}`,
      companyParams(company, body),
    ),
    null,
  );
}

export async function completeBoyahaneJob(company, id) {
  return unwrap(
    await apiPost(
      `/boyahane/jobs/${encodeURIComponent(id)}/complete`,
      companyParams(company),
    ),
    null,
  );
}

export async function addBoyahaneJobColor(company, jobId, body) {
  return unwrap(
    await apiPost(
      `/boyahane/jobs/${encodeURIComponent(jobId)}/colors`,
      companyParams(company, body),
    ),
    null,
  );
}

export async function patchBoyahaneJobColor(company, id, body) {
  return unwrap(
    await apiPatch(
      `/boyahane/job-colors/${encodeURIComponent(id)}`,
      companyParams(company, body),
    ),
    null,
  );
}

export async function deleteBoyahaneJobColor(company, id) {
  return unwrap(
    await apiDelete(
      `/boyahane/job-colors/${encodeURIComponent(id)}`,
      companyParams(company),
    ),
    null,
  );
}

export async function listRegisteredColors(company, params = {}) {
  return unwrap(
    await apiGet(
      "/boyahane/registered-colors",
      companyParams(company, params),
    ),
    [],
  );
}

export async function getRegisteredColor(company, id) {
  return unwrap(
    await apiGet(
      `/boyahane/registered-colors/${encodeURIComponent(id)}`,
      companyParams(company),
    ),
    null,
  );
}

export async function createRegisteredColor(company, body) {
  return unwrap(
    await apiPost(
      "/boyahane/registered-colors",
      companyParams(company, body),
    ),
    null,
  );
}

export async function listColorRecipes(company, colorId) {
  return unwrap(
    await apiGet(
      `/boyahane/registered-colors/${encodeURIComponent(colorId)}/recipes`,
      companyParams(company),
    ),
    [],
  );
}

export async function compareColorRecipe(company, colorId, body) {
  return unwrap(
    await apiPost(
      `/boyahane/registered-colors/${encodeURIComponent(colorId)}/recipes/compare`,
      companyParams(company, body),
    ),
    null,
  );
}

export async function createColorRecipeVersion(company, colorId, body) {
  return unwrap(
    await apiPost(
      `/boyahane/registered-colors/${encodeURIComponent(colorId)}/recipes/new-version`,
      companyParams(company, body),
    ),
    null,
  );
}

export async function updateWorkflowRecipe(company, id, body) {
  return unwrap(
    await apiPatch(
      `/boyahane/workflow/recipes/${encodeURIComponent(id)}`,
      companyParams(company, body),
    ),
    null,
  );
}

export async function listBoyahaneProducts(company, params = {}) {
  return unwrap(
    await apiGet("/boyahane/products", companyParams(company, params)),
    [],
  );
}

export async function createBoyahaneProduct(company, body) {
  return unwrap(
    await apiPost("/boyahane/products", companyParams(company, body)),
    null,
  );
}

export async function updateBoyahaneProduct(company, id, body) {
  return unwrap(
    await apiPatch(
      `/boyahane/products/${encodeURIComponent(id)}`,
      companyParams(company, body),
    ),
    null,
  );
}

export async function getBoyahaneStockSummary(company) {
  return unwrap(
    await apiGet("/boyahane/stock/summary", companyParams(company)),
    { summary: {}, products: [], lots: [], movements: [] },
  );
}

export async function listBoyahaneLots(company, params = {}) {
  return unwrap(
    await apiGet(
      "/boyahane/workflow/lots",
      companyParams(company, params),
    ),
    [],
  );
}

export async function getBoyahaneWorkflowLot(company, id) {
  return unwrap(
    await apiGet(
      `/boyahane/workflow/lots/${encodeURIComponent(id)}`,
      companyParams(company),
    ),
    null,
  );
}

export async function createBoyahaneWorkflowLot(company, body) {
  return unwrap(
    await apiPost(
      "/boyahane/workflow/lots",
      companyParams(company, body),
    ),
    null,
  );
}

export async function createBoyahaneLotMovement(company, id, body) {
  return unwrap(
    await apiPost(
      `/boyahane/workflow/lots/${encodeURIComponent(id)}/movements`,
      companyParams(company, body),
    ),
    null,
  );
}

export async function runBoyahaneLotAction(company, id, action) {
  return unwrap(
    await apiPost(
      `/boyahane/workflow/lots/${encodeURIComponent(id)}/action`,
      companyParams(company, { action }),
    ),
    null,
  );
}

export async function createBoyahaneProduction(company, body) {
  return unwrap(
    await apiPost("/boyahane/productions", companyParams(company, body)),
    null,
  );
}

export async function listBoyahaneProductions(company, params = {}) {
  return unwrap(
    await apiGet(
      "/boyahane/productions",
      companyParams(company, params),
    ),
    [],
  );
}

export async function listBoyahaneLogs(company, params = {}) {
  return unwrap(
    await apiGet(
      "/boyahane/workflow/logs",
      companyParams(company, params),
    ),
    [],
  );
}

export async function getBoyahaneReports(company) {
  return unwrap(
    await apiGet("/boyahane/workflow/reports", companyParams(company)),
    { summary: {}, jobs: [], productions: [], expenses: [] },
  );
}
