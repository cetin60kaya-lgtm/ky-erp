import { apiDelete, apiGet, apiPatch, apiPost } from "../utils/api";
import {
  DEMO_COLORS,
  DEMO_JOBS,
  DEMO_LOGS,
  DEMO_LOTS,
  DEMO_PRODUCTS,
  DEMO_PRODUCTIONS,
  DEMO_REPORT,
  DEMO_STOCK_SUMMARY,
  demoJobDetail,
  demoRegisteredColorDetail,
} from "../pages/boyahane/workflow/boyahaneDemoData";

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

function localDemoEnabled() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function arrayOrDemo(value, demo) {
  const rows = Array.isArray(value) ? value : [];
  return localDemoEnabled() && rows.length === 0 ? demo : rows;
}

function objectOrDemo(value, demo, hasData) {
  if (!localDemoEnabled()) return value;
  return hasData(value) ? value : demo;
}

export async function listBoyahaneJobs(company, params = {}) {
  const data = unwrap(
    await apiGet("/boyahane/jobs", companyParams(company, params)),
    [],
  );
  return arrayOrDemo(data, DEMO_JOBS);
}

export async function getBoyahaneJob(company, id) {
  const data = unwrap(
    await apiGet(
      `/boyahane/jobs/${encodeURIComponent(id)}`,
      companyParams(company),
    ),
    null,
  );
  return data || (localDemoEnabled() ? demoJobDetail(id) : null);
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
  const data = unwrap(
    await apiGet(
      "/boyahane/registered-colors",
      companyParams(company, params),
    ),
    [],
  );
  return arrayOrDemo(data, DEMO_COLORS);
}

export async function getRegisteredColor(company, id) {
  const data = unwrap(
    await apiGet(
      `/boyahane/registered-colors/${encodeURIComponent(id)}`,
      companyParams(company),
    ),
    null,
  );
  return data || (localDemoEnabled() ? demoRegisteredColorDetail(id) : null);
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
  const data = unwrap(
    await apiGet("/boyahane/products", companyParams(company, params)),
    [],
  );
  return arrayOrDemo(data, DEMO_PRODUCTS);
}

export async function setBoyahaneProductLotPolicy(company, id, lotPolicy) {
  const policy = String(lotPolicy || "").toUpperCase();
  return unwrap(
    await apiPatch(
      `/e-belge/products/${encodeURIComponent(id)}/lot-policy`,
      companyParams(company, { lotPolicy: policy }),
    ),
    null,
  );
}

export async function createBoyahaneProduct(company, body) {
  const approvalStatus = body?.approvalStatus || "REVIEW_REQUIRED";
  const created = unwrap(
    await apiPost(
      "/boyahane/products",
      companyParams(company, { ...body, approvalStatus }),
    ),
    null,
  );
  if (!created?.id) return created;

  let result = created;
  if (created.approvalStatus !== approvalStatus) {
    result = await updateBoyahaneProduct(company, created.id, {
      approvalStatus,
      approvedAt: approvalStatus === "APPROVED" ? new Date().toISOString() : null,
    });
  }
  if (body?.lotPolicy) {
    await setBoyahaneProductLotPolicy(company, created.id, body.lotPolicy);
    result = {
      ...result,
      lotPolicy: String(body.lotPolicy).toUpperCase(),
      lotRequired: String(body.lotPolicy).toUpperCase() === "REQUIRED",
    };
  }
  return result;
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
  const data = unwrap(
    await apiGet("/boyahane/stock/summary", companyParams(company)),
    { summary: {}, products: [], lots: [], movements: [] },
  );
  return objectOrDemo(
    data,
    DEMO_STOCK_SUMMARY,
    (row) =>
      Boolean(
        row &&
          (Object.keys(row.summary || {}).length ||
            row.products?.length ||
            row.lots?.length ||
            row.movements?.length),
      ),
  );
}

export async function getBoyahaneLotMonthlyReport(company, month) {
  return unwrap(
    await apiGet(
      "/boyahane/reports/lot-monthly",
      companyParams(company, month ? { month } : {}),
    ),
    { month: month || "", totals: {}, products: [], lots: [], depletedLots: [], generalExpenses: [], warnings: [] },
  );
}

export async function listBoyahaneLots(company, params = {}) {
  const data = unwrap(
    await apiGet(
      "/boyahane/workflow/lots",
      companyParams(company, params),
    ),
    [],
  );
  return arrayOrDemo(data, DEMO_LOTS);
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
  const reason = body?.reason || body?.movementType || body?.type;
  return unwrap(
    await apiPost(
      `/boyahane/workflow/lots/${encodeURIComponent(id)}/movements-v2`,
      companyParams(company, { ...body, reason }),
    ),
    null,
  );
}

export async function reverseBoyahaneLotMovement(company, lotId, movementId, body = {}) {
  return unwrap(
    await apiPost(
      `/boyahane/workflow/lots/${encodeURIComponent(lotId)}/movements-v2/${encodeURIComponent(movementId)}/reverse`,
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
  const data = unwrap(
    await apiGet(
      "/boyahane/productions",
      companyParams(company, params),
    ),
    [],
  );
  return arrayOrDemo(data, DEMO_PRODUCTIONS);
}

export async function listBoyahaneLogs(company, params = {}) {
  const data = unwrap(
    await apiGet(
      "/boyahane/workflow/logs",
      companyParams(company, params),
    ),
    [],
  );
  return arrayOrDemo(data, DEMO_LOGS);
}

export async function getBoyahaneReports(company) {
  const data = unwrap(
    await apiGet("/boyahane/workflow/reports", companyParams(company)),
    { summary: {}, jobs: [], productions: [], expenses: [] },
  );
  return objectOrDemo(
    data,
    DEMO_REPORT,
    (row) =>
      Boolean(
        row &&
          (Object.keys(row.summary || {}).length ||
            row.jobs?.length ||
            row.productions?.length ||
            row.expenses?.length),
      ),
  );
}
