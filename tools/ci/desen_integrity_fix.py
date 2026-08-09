from pathlib import Path
import re


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label}: anchor not found")
    return text.replace(old, new, 1)


# 1) Fix all relative Desen image URLs. API_BASE already contains /api.
p = Path("APP/app/ky-erp-frontend/src/pages/desen/DesenWorkflowShared.jsx")
s = p.read_text(encoding="utf-8")
s = replace_required(
    s,
    'import { API_BASE } from "../../utils/api";',
    'import { apiUrl } from "../../utils/api";',
    "asset import",
)
s = replace_required(
    s,
    '''export function assetUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(blob:|data:|https?:\\/\\/)/i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}''',
    '''export function assetUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(blob:|data:|https?:\\/\\/)/i.test(url)) return url;
  return apiUrl(url);
}''',
    "asset resolver",
)
p.write_text(s, encoding="utf-8")


# 2) Backend: operation totals, original/source date, shared filtering, canonical report summary.
p = Path("APP/cloud/ky-erp-api/src/desen-workflow.ts")
s = p.read_text(encoding="utf-8")
s = replace_required(
    s,
    '''  const operations = (Array.isArray(model.operations) ? model.operations : []).map(
    normalizeOperation,
  );''',
    '''  const operations = (Array.isArray(model.operations) ? model.operations : [])
    .map(normalizeOperation)
    .map((operation) => ({
      ...operation,
      totals: calculateTotals([operation]),
    }));''',
    "operation totals",
)
s = replace_required(
    s,
    '''  const mainImage =
    files.find((file) => file.role === "MODEL_IMAGE") ||
    files.find((file) => /image\\//i.test(text(file.contentType))) ||
    model.mainImage ||
    null;
  return {''',
    '''  const mainImage =
    files.find((file) => file.role === "MODEL_IMAGE") ||
    files.find((file) => /image\\//i.test(text(file.contentType))) ||
    model.mainImage ||
    null;
  const sourceModifiedAt = text(
    model.sourceModifiedAt ||
      mainImage?.sourceModifiedAt ||
      mainImage?.metadata?.sourceModifiedAt ||
      "",
  );
  return {''',
    "source date",
)
s = replace_required(
    s,
    '''    mainImage,
    totals: calculateTotals(operations),''',
    '''    mainImage,
    sourceModifiedAt,
    totals: calculateTotals(operations),''',
    "source date return",
)
if 'imageUrl: model.mainImage?.previewUrl || "",' in s:
    s = s.replace(
        'imageUrl: model.mainImage?.previewUrl || "",',
        'imageUrl: model.mainImage?.thumbnailUrl || model.mainImage?.previewUrl || "",',
        1,
    )

helper = r'''
function isoDateKey(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function filterModelRows(c: Context<AppEnv>, rows: Row[]) {
  const q = normalize(c.req.query("q"));
  const companyId = text(c.req.query("companyId"));
  const status = text(c.req.query("status"));
  const printAreaCode = text(c.req.query("printAreaCode"));
  const placementStatus = text(c.req.query("placementStatus"));
  const dyehouseStatus = text(c.req.query("dyehouseStatus"));
  const dateField = text(c.req.query("dateField") || "createdAt");
  const dateFrom = text(c.req.query("dateFrom"));
  const dateTo = text(c.req.query("dateTo"));
  const sort = text(c.req.query("sort") || "created_desc");

  const filtered = rows
    .filter((row) => row.status !== "ARCHIVE" || status === "ARCHIVE")
    .filter(
      (row) =>
        !q ||
        normalize(
          `${row.modelName} ${row.modelCode} ${row.companyName} ${JSON.stringify(row.metadata)}`,
        ).includes(q),
    )
    .filter((row) => !companyId || row.companyId === companyId)
    .filter((row) => !status || row.status === status)
    .filter(
      (row) =>
        !printAreaCode ||
        row.operations.some((operation: Row) => operation.printAreaCode === printAreaCode),
    )
    .filter(
      (row) =>
        !placementStatus ||
        row.operations.some(
          (operation: Row) => operation.placementStatus === placementStatus,
        ),
    )
    .filter(
      (row) =>
        !dyehouseStatus ||
        row.operations.some(
          (operation: Row) => operation.dyehouseStatus === dyehouseStatus,
        ),
    )
    .filter((row) => {
      if (!dateFrom && !dateTo) return true;
      const value =
        dateField === "sourceModifiedAt"
          ? row.sourceModifiedAt
          : dateField === "updatedAt"
            ? row.updatedAt
            : row.createdAt;
      const key = isoDateKey(value);
      if (!key) return false;
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      return true;
    });

  const byTime = (value: unknown) => {
    const ms = Date.parse(text(value));
    return Number.isFinite(ms) ? ms : 0;
  };
  filtered.sort((a, b) => {
    if (sort === "name_asc")
      return text(a.modelName).localeCompare(text(b.modelName), "tr");
    if (sort === "source_desc")
      return byTime(b.sourceModifiedAt) - byTime(a.sourceModifiedAt);
    if (sort === "updated_desc")
      return byTime(b.updatedAt) - byTime(a.updatedAt);
    return byTime(b.createdAt) - byTime(a.createdAt);
  });
  return filtered;
}

function designSummary(rows: Row[]) {
  const newArrival = rows.filter((row) => row.status === "NEW_ARRIVAL").length;
  const channelImageMissing = rows.filter(
    (row) => row.status === "CHANNEL_IMAGE_MISSING",
  ).length;
  const channelReviewPending = rows.filter(
    (row) => row.status === "CHANNEL_REVIEW_PENDING",
  ).length;
  const colorMatchMissing = rows.filter(
    (row) => row.status === "COLOR_MATCH_MISSING",
  ).length;
  const placementWaiting = rows.filter((row) =>
    row.operations.some(
      (operation: Row) => operation.placementStatus !== "READY",
    ),
  ).length;
  const dyehouseReady = rows.filter(
    (row) => row.status === "DYEHOUSE_READY",
  ).length;
  const productionReady = rows.filter(
    (row) => row.status === "PRODUCTION_READY",
  ).length;
  const unresolvedColorCount = rows.reduce(
    (sum, row) => sum + num(row.totals.unresolvedColorCount),
    0,
  );
  return {
    totalModels: rows.length,
    modelCount: rows.length,
    newArrival,
    channelImageMissing,
    channelReviewPending,
    colorMatchMissing,
    placementWaiting,
    dyehouseReady,
    readyForDyehouse: dyehouseReady,
    productionReady,
    unresolvedColorCount,
  };
}

'''
anchor = "export function registerDesenWorkflowRoutes(app: Hono<AppEnv>) {"
if helper.strip() not in s:
    s = replace_required(s, anchor, helper + anchor, "route helper")

models_pattern = re.compile(
    r'  app\.get\("/api/desen/workflow/models", async \(c\) => \{.*?\n  \}\);\n\n  app\.get\("/api/desen/workflow/models/:id"',
    re.S,
)
models_new = '''  app.get("/api/desen/workflow/models", async (c) => {
    const slug = slugOf(c);
    const limit = Math.min(
      2000,
      Math.max(1, num(c.req.query("limit") || 1000)),
    );
    const allRows = filterModelRows(
      c,
      (await storeList(c, MODEL_SCOPE, slug)).map(modelView),
    );
    const rows = allRows.slice(0, limit);
    return c.json({
      ok: true,
      success: true,
      data: { rows, total: allRows.length, returned: rows.length },
    });
  });

  app.get("/api/desen/workflow/models/:id"'''
s, count = models_pattern.subn(models_new, s, count=1)
if count != 1:
    raise SystemExit("models route replacement failed")

reports_pattern = re.compile(
    r'  app\.get\("/api/desen/workflow/reports", async \(c\) => \{.*?\n  \}\);\n\n  app\.get\("/api/desen/workflow/reports/export"',
    re.S,
)
reports_new = '''  app.get("/api/desen/workflow/reports", async (c) => {
    const slug = slugOf(c);
    const rows = filterModelRows(
      c,
      (await storeList(c, MODEL_SCOPE, slug)).map(modelView),
    );
    return c.json({
      ok: true,
      success: true,
      data: { summary: designSummary(rows), rows },
    });
  });

  app.get("/api/desen/workflow/reports/export"'''
s, count = reports_pattern.subn(reports_new, s, count=1)
if count != 1:
    raise SystemExit("reports route replacement failed")

s = replace_required(
    s,
    '''    const rows = (await storeList(c, MODEL_SCOPE, slug)).map(modelView);
    const escape''',
    '''    const rows = filterModelRows(
      c,
      (await storeList(c, MODEL_SCOPE, slug)).map(modelView),
    );
    const escape''',
    "export filtering",
)
s = replace_required(
    s,
    '''        "Eksik Renk",
        "Son Güncelleme",''',
    '''        "Eksik Renk",
        "ERP Eklenme",
        "Dosya Tarihi",
        "Son Güncelleme",''',
    "export headers",
)
s = replace_required(
    s,
    '''          row.totals.unresolvedColorCount,
          row.updatedAt,''',
    '''          row.totals.unresolvedColorCount,
          row.createdAt,
          row.sourceModifiedAt,
          row.updatedAt,''',
    "export dates",
)
p.write_text(s, encoding="utf-8")


# 3) Desen Havuzu: date field/range/sort filters + all relevant dates.
p = Path("APP/app/ky-erp-frontend/src/pages/desen/DesenModeller.jsx")
s = p.read_text(encoding="utf-8")
s = replace_required(
    s,
    'const [filters, setFilters] = useState({ q: "", companyId: "", status: "", printAreaCode: "", placementStatus: "" });',
    'const [filters, setFilters] = useState({ q: "", companyId: "", status: "", printAreaCode: "", placementStatus: "", dateField: "createdAt", dateFrom: "", dateTo: "", sort: "created_desc" });',
    "pool filter state",
)
s = replace_required(
    s,
    "filters.printAreaCode, filters.placementStatus, load]);",
    "filters.printAreaCode, filters.placementStatus, filters.dateField, filters.dateFrom, filters.dateTo, filters.sort, load]);",
    "pool load deps",
)
s = replace_required(
    s,
    "filters.printAreaCode, filters.placementStatus]);",
    "filters.printAreaCode, filters.placementStatus, filters.dateField, filters.dateFrom, filters.dateTo, filters.sort]);",
    "pool page deps",
)
marker = '<div className="dsg-view-switch"><button className={view === "cards" ? "active" : ""}'
controls = '''<select value={filters.dateField} onChange={(event) => setFilters((current) => ({ ...current, dateField: event.target.value }))}><option value="createdAt">Tarih: ERP'ye Eklenme</option><option value="sourceModifiedAt">Tarih: Dosya Tarihi</option><option value="updatedAt">Tarih: Son Güncelleme</option></select><input className="dsg-date-input" type="date" aria-label="Başlangıç tarihi" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} /><input className="dsg-date-input" type="date" aria-label="Bitiş tarihi" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} /><select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}><option value="created_desc">Yeni Eklenenler</option><option value="source_desc">Yeni Dosya Tarihi</option><option value="updated_desc">Son Güncellenenler</option><option value="name_asc">Model A-Z</option></select>'''
s = replace_required(s, marker, controls + marker, "pool date controls")
s = s.replace(
    '<ScanLine size={16} /> Gelen Klasörü Tara</button>',
    '<ScanLine size={16} /> Gelen Desenler</button>',
    1,
)
s = s.replace(
    "Gerçek Desen kayıtları · Son güncellenenler önce",
    "Gerçek Desen kayıtları · ERP eklenme, dosya ve güncelleme tarihleriyle",
)
s = replace_required(
    s,
    '''<small>{analysis.analyzedAt ? `Akıllı tarama: ${formatDate(analysis.analyzedAt)}` : `Güncelleme: ${formatDate(model.updatedAt)}`}</small>''',
    '''<div className="dsg-date-meta"><small>ERP eklenme: {formatDate(model.createdAt)}</small><small>Dosya tarihi: {formatDate(model.sourceModifiedAt)}</small><small>{analysis.analyzedAt ? `Akıllı tarama: ${formatDate(analysis.analyzedAt)}` : `Güncelleme: ${formatDate(model.updatedAt)}`}</small></div>''',
    "pool card dates",
)
s = replace_required(
    s,
    "<th>Durum</th><th>Son Güncelleme</th><th /></tr>",
    "<th>Durum</th><th>ERP Eklenme</th><th>Dosya Tarihi</th><th>Son Güncelleme</th><th /></tr>",
    "pool table date headers",
)
s = replace_required(
    s,
    '<td><StatusBadge value={model.status} /></td><td>{formatDate(model.updatedAt)}</td><td><button',
    '<td><StatusBadge value={model.status} /></td><td>{formatDate(model.createdAt)}</td><td>{formatDate(model.sourceModifiedAt)}</td><td>{formatDate(model.updatedAt)}</td><td><button',
    "pool table dates",
)
p.write_text(s, encoding="utf-8")


# 4) Reports: same filters, correct counters, thumbnails and dates.
p = Path("APP/app/ky-erp-frontend/src/pages/desen/DesenRaporlari.jsx")
s = p.read_text(encoding="utf-8")
s = replace_required(
    s,
    'const [filters, setFilters] = useState({ q: "", companyId: "", status: "", printAreaCode: "", placementStatus: "", dyehouseStatus: "" });',
    'const [filters, setFilters] = useState({ q: "", companyId: "", status: "", printAreaCode: "", placementStatus: "", dyehouseStatus: "", dateField: "createdAt", dateFrom: "", dateTo: "", sort: "created_desc" });',
    "report filter state",
)
s = replace_required(
    s,
    "filters.printAreaCode, filters.placementStatus, filters.dyehouseStatus, load]);",
    "filters.printAreaCode, filters.placementStatus, filters.dyehouseStatus, filters.dateField, filters.dateFrom, filters.dateTo, filters.sort, load]);",
    "report load deps",
)
s = replace_required(
    s,
    "filters.printAreaCode, filters.placementStatus, filters.dyehouseStatus]);",
    "filters.printAreaCode, filters.placementStatus, filters.dyehouseStatus, filters.dateField, filters.dateFrom, filters.dateTo, filters.sort]);",
    "report page deps",
)
s = replace_required(
    s,
    '["Toplam Model", report.summary.totalModels, FileImage, "blue"]',
    '["Toplam Model", report.summary.totalModels ?? report.summary.modelCount, FileImage, "blue"]',
    "report total fallback",
)
marker = '<button className="dsg-btn" onClick={load}><RefreshCw size={16} /> Yenile</button>'
controls = '''<select value={filters.dateField} onChange={(event) => setFilters((current) => ({ ...current, dateField: event.target.value }))}><option value="createdAt">Tarih: ERP'ye Eklenme</option><option value="sourceModifiedAt">Tarih: Dosya Tarihi</option><option value="updatedAt">Tarih: Son Güncelleme</option></select><input className="dsg-date-input" type="date" aria-label="Rapor başlangıç tarihi" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} /><input className="dsg-date-input" type="date" aria-label="Rapor bitiş tarihi" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} /><select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}><option value="created_desc">Yeni Eklenenler</option><option value="source_desc">Yeni Dosya Tarihi</option><option value="updated_desc">Son Güncellenenler</option><option value="name_asc">Model A-Z</option></select>'''
s = replace_required(s, marker, controls + marker, "report date controls")
s = s.replace(
    "assetUrl(model.mainImage.previewUrl)",
    "assetUrl(model.mainImage.thumbnailUrl || model.mainImage.previewUrl)",
)
s = replace_required(
    s,
    "<th>Durum</th><th>Son İşlem</th></tr>",
    "<th>Durum</th><th>ERP Eklenme</th><th>Dosya Tarihi</th><th>Son İşlem</th></tr>",
    "report date headers",
)
s = replace_required(
    s,
    '<td><StatusBadge value={model.status} /></td><td>{formatDate(model.updatedAt)}</td></tr>',
    '<td><StatusBadge value={model.status} /></td><td>{formatDate(model.createdAt)}</td><td>{formatDate(model.sourceModifiedAt)}</td><td>{formatDate(model.updatedAt)}</td></tr>',
    "report date cells",
)
p.write_text(s, encoding="utf-8")


# 5) Placement page: no crash when totals are missing; use small thumb in list.
p = Path("APP/app/ky-erp-frontend/src/pages/desen/YerlesimKalipPage.jsx")
s = p.read_text(encoding="utf-8")
s = replace_required(
    s,
    "models.flatMap((model) => model.operations.map((operation) => ({ model, operation })))",
    "models.flatMap((model) => (Array.isArray(model.operations) ? model.operations : []).map((operation) => ({ model, operation })))",
    "placement operation array",
)
s = s.replace(
    "assetUrl(model.mainImage.previewUrl)",
    "assetUrl(model.mainImage.thumbnailUrl || model.mainImage.previewUrl)",
)
s = s.replace(
    "operation.totals.activeChannelCount",
    "(operation.totals?.activeChannelCount || 0)",
)
s = s.replace(
    "operation.totals.totalMoldCount",
    "(operation.totals?.totalMoldCount || 0)",
)
s = s.replace(
    "operation.totals.uniqueColorCount",
    "(operation.totals?.uniqueColorCount || 0)",
)
p.write_text(s, encoding="utf-8")


# 6) Boyahane design picker: load tiny R2 thumbnail first.
p = Path("APP/app/ky-erp-frontend/src/pages/boyahane/workflow/QueueDesignModal.jsx")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "src={model.mainImage?.previewUrl}",
    "src={model.mainImage?.thumbnailUrl || model.mainImage?.previewUrl}",
)
p.write_text(s, encoding="utf-8")


# 7) Date controls and compact metadata styling.
p = Path("APP/app/ky-erp-frontend/src/pages/desen/desenWorkflow.css")
s = p.read_text(encoding="utf-8")
anchor = ".dsg-scan-tools select, .dsg-filter-grid select { padding: 6px 9px; }"
addition = '''.dsg-scan-tools select, .dsg-filter-grid select { padding: 6px 9px; }
.dsg-filter-grid .dsg-date-input { min-height: 34px; min-width: 132px; padding: 6px 8px; border: 1px solid #c8d8e8; border-radius: 8px; background: #fff; color: var(--dsg-ink); font: inherit; font-size: 12px; }
.dsg-date-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--dsg-muted); }
.dsg-date-meta small { white-space: nowrap; }'''
s = replace_required(s, anchor, addition, "date css")
p.write_text(s, encoding="utf-8")

print("Desen integrity patch applied.")
