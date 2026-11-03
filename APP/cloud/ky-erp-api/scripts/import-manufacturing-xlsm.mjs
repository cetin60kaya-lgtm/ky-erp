import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import XLSX from "xlsx";

// Generic, tenant-scoped, 2026+ production import. Dry-run is the default.
// Original Excel, Drive files and pre-existing ERP records are never modified.
const apiRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wrangler = join(apiRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const args = process.argv.slice(2);
const value = (flag, fallback = "") => {
  const pos = args.indexOf(flag);
  return pos >= 0 ? String(args[pos + 1] || "") : fallback;
};
const apply = args.includes("--apply");
const allowMissingPreview = args.includes("--allow-missing-preview");
const tenant = value("--tenant");
const input = value("--input");
const database = value("--database", "ky-erp-db");
const sheetName = value("--sheet", "İmalat Takip Muhasebe");
const year = Number(value("--year", "2026"));
const batchSize = Math.max(1, Math.min(50, Number(value("--batch-size", "25")) || 25));
const limit = Math.max(0, Number(value("--limit", "0")) || 0);
if (!/^[a-z0-9-]{3,64}$/.test(tenant) || !input || !existsSync(input) || !Number.isInteger(year) || year < 2026) {
  throw new Error("Usage: --tenant <slug> --input <source.xlsm> [--year 2026] [--apply --confirm-tenant <slug>]");
}
if (apply && value("--confirm-tenant") !== tenant) throw new Error("Live D1 write requires --confirm-tenant equal to --tenant.");
if (!existsSync(wrangler)) throw new Error("Installed Wrangler binary not found; do not install a parallel copy.");
const runWrangler = (extra) => {
  const result = spawnSync(process.execPath, [wrangler, "d1", "execute", database, "--remote", "--json", ...extra], {
    cwd: apiRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 180000,
  });
  if (result.status !== 0) throw new Error("Wrangler D1 request failed: " + String(result.stderr || result.stdout).slice(0, 1000));
  // Wrangler --file prints progress text even with --json; --command prints JSON.
  // INSERT OR IGNORE is idempotent and a final live D1 count verifies writes.
  if (extra.includes("--file")) return [];
  const parsed = JSON.parse(result.stdout.trim());
  if (!Array.isArray(parsed) || parsed.some((page) => page.success === false)) throw new Error("Unexpected D1 response.");
  return parsed.flatMap((page) => page.results || []);
};
const quote = (v) => v === null || v === undefined ? "NULL" : "'" + String(v).replaceAll("'", "''") + "'";
const normalize = (v) => String(v ?? "").toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ").trim().replace(/ +/g, " ");
const clean = (v) => v === null || v === undefined ? "" : String(v).trim();
const integer = (v, emptyZero = false) => {
  if ((v === null || v === undefined || v === "") && emptyZero) return 0;
  const number = Number(v);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};
const workbook = XLSX.readFile(input, { bookVBA: false, cellDates: false });
if (!workbook.Sheets[sheetName]) throw new Error("Excel sheet not found: " + sheetName);
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
const existingModels = runWrangler(["--command", "SELECT m.id,m.model_name,m.image_url,EXISTS(SELECT 1 FROM file_hub_relations r WHERE r.main_company_slug=m.main_company_slug AND r.entity_type='MODEL' AND r.entity_id=m.id AND r.relation_type='MODEL_IMAGE') has_image FROM model_records m WHERE m.main_company_slug=" + quote(tenant) + " AND m.deleted_at IS NULL"]);
const models = new Map();
for (const row of existingModels) {
  const key = normalize(row.model_name);
  if (!models.has(key)) models.set(key, []);
  models.get(key).push(row);
}
const existingIds = new Set(runWrangler(["--command", "SELECT id FROM production_records WHERE main_company_slug=" + quote(tenant) + " AND id LIKE 'KYPR:%'"]).map((r) => r.id));
const candidates = [], review = [], fingerprints = new Set();
let datedRows = 0, sourceDuplicates = 0;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i], dt = typeof r[0] === "number" ? XLSX.SSF.parse_date_code(r[0]) : null;
  if (!dt || dt.y !== year || !clean(r[2])) continue;
  datedRows++;
  const date = String(dt.y).padStart(4, "0") + "-" + String(dt.m).padStart(2, "0") + "-" + String(dt.d).padStart(2, "0");
  const modelName = clean(r[2]), modelKey = normalize(modelName), quantity = integer(r[4]);
  const fabric = integer(r[10], true), print = integer(r[11], true);
  const values = [date, modelKey, clean(r[1]), normalize(r[5]), normalize(r[6]), clean(r[7]), normalize(r[8]), clean(r[9]), normalize(r[12]), quantity, fabric, print];
  const fingerprint = createHash("sha256").update(JSON.stringify([tenant, year, values])).digest("hex");
  if (fingerprints.has(fingerprint)) { sourceDuplicates++; review.push({ row: i + 1, modelName, reason: "SOURCE_DUPLICATE" }); continue; }
  fingerprints.add(fingerprint);
  if (!(quantity > 0) || fabric === null || print === null || fabric + print > quantity) {
    review.push({ row: i + 1, modelName, reason: "INVALID_QUANTITY_OR_DEFECT" }); continue;
  }
  const found = models.get(modelKey) || [];
  if (found.length !== 1) { review.push({ row: i + 1, modelName, reason: found.length ? "MODEL_AMBIGUOUS" : "MODEL_NOT_REGISTERED" }); continue; }
  if (!allowMissingPreview && Number(found[0].has_image || 0) !== 1 && !clean(found[0].image_url)) {
    review.push({ row: i + 1, modelName, reason: "MODEL_PREVIEW_MISSING" }); continue;
  }
  const id = "KYPR:IM" + year + ":" + fingerprint;
  if (existingIds.has(id)) { review.push({ row: i + 1, modelName, reason: "ALREADY_IMPORTED" }); continue; }
  candidates.push({ id, linkId: "KYPL:IM" + year + ":" + fingerprint, date, modelName, modelId: found[0].id,
    orderNo: clean(r[1]), color: clean(r[5]), region: clean(r[6]), machineNo: clean(r[7]),
    machineName: clean(r[9]), shift: clean(r[8]), machinist: clean(r[12]), quantity, fabric, print, excelRow: i + 1 });
}
const reasons = {};
for (const item of review) reasons[item.reason] = (reasons[item.reason] || 0) + 1;
console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", tenant, year, sheet: sheetName, datedRows,
  existingModelCount: existingModels.length, alreadyImportedIds: existingIds.size,
  readyProductionRows: candidates.length, sourceDuplicates, blockedRows: review.length, blockedReasons: reasons }, null, 2));
const report = value("--report");
if (report) writeFileSync(report, JSON.stringify({ summary: { year, datedRows, ready: candidates.length, reasons }, unresolved: review }, null, 2), "utf8");
if (!apply || candidates.length === 0) process.exit(0);
const selected = limit ? candidates.slice(0, limit) : candidates;
let completed = 0;
for (let start = 0; start < selected.length; start += batchSize) {
  const batch = selected.slice(start, start + batchSize), statements = [];
  for (const item of batch) {
    const raw = JSON.stringify({ source: "XLSM_IMPORT", year, excelRow: item.excelRow, machineNo: item.machineNo,
      machineName: item.machineName, quantity: item.quantity, fabricDefect: item.fabric, printDefect: item.print });
    statements.push("INSERT OR IGNORE INTO production_records(id,main_company_slug,model_id,model_name,order_no,ground_color,machine_name,total_quantity,machinist,print_area,fabric_defect,print_defect,shift,production_date,note,raw,created_at,updated_at) VALUES(" +
      [item.id,tenant,item.modelId,item.modelName,item.orderNo,item.color,[item.machineNo,item.machineName].filter(Boolean).join(" / "),item.quantity,item.machinist,item.region,String(item.fabric),String(item.print),item.shift,item.date,"2026+ Excel kaynak eşitleme",raw].map(quote).join(",") + ",datetime('now'),datetime('now'))");
    statements.push("INSERT OR IGNORE INTO model_production_links(id,main_company_slug,model_id,production_record_id,raw,created_at) VALUES(" +
      [item.linkId,tenant,item.modelId,item.id,JSON.stringify({ source: "XLSM_IMPORT", year })].map(quote).join(",") + ",datetime('now'))");
  }
  const directory = mkdtempSync(join(tmpdir(), "kyerp-import-"));
  const filename = join(directory, "batch.sql");
  try {
    writeFileSync(filename, statements.join(";\n") + ";\n", "utf8");
    runWrangler(["--file", filename]);
    completed += batch.length;
    console.log(JSON.stringify({ batch: Math.floor(start / batchSize) + 1, processed: completed, selected: selected.length }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const count = runWrangler(["--command", "SELECT count(*) n FROM production_records WHERE main_company_slug=" + quote(tenant)]);
console.log(JSON.stringify({ verification: "LIVE_D1", totalProductionRecords: count[0]?.n, submitted: completed }));
