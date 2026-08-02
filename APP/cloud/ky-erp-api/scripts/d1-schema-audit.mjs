import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const option = (flag, fallback = "") => {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const mode = has("--remote") ? "remote" : "local";
const database = option(
  "--database",
  mode === "remote" ? "ky-erp-db" : "ky-erp-production-local",
);
const config = option(
  "--config",
  mode === "remote" ? "wrangler.jsonc" : "wrangler.production-local.jsonc",
);
const persistTo = option("--persist-to", "");
const requireMigrations = has("--require-migrations");

const requiredSchema = {
  main_companies: ["id", "slug", "name"],
  companies: ["id", "main_company_slug", "name"],
  model_records: ["id", "main_company_slug", "model_name"],
  model_print_regions: [
    "id",
    "main_company_slug",
    "model_id",
    "region_name",
  ],
  documents: [
    "id",
    "main_company_slug",
    "document_type",
    "document_no",
  ],
  invoice_items: [
    "id",
    "main_company_slug",
    "document_id",
    "quantity",
  ],
  production_records: [
    "id",
    "main_company_slug",
    "model_id",
    "total_quantity",
  ],
  model_document_links: [
    "id",
    "main_company_slug",
    "model_id",
    "document_id",
  ],
  model_production_links: [
    "id",
    "main_company_slug",
    "model_id",
    "production_record_id",
  ],
  machine_shift_defaults: [
    "id",
    "main_company_slug",
    "machine_no",
  ],
  json_store: [
    "id",
    "scope",
    "main_company_slug",
    "file_name",
    "data",
    "created_at",
    "updated_at",
  ],
};

function parseJsonOutput(output) {
  const text = String(output || "").trim();
  if (!text) return [];

  const candidates = [];
  const arrayStart = text.indexOf("[");
  const objectStart = text.indexOf("{");
  if (arrayStart >= 0) candidates.push(text.slice(arrayStart));
  if (objectStart >= 0) candidates.push(text.slice(objectStart));
  candidates.push(text);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Wrangler bilgi satırlarını yazmış olabilir; son kapanışa kadar tekrar dene.
      for (const end of [candidate.lastIndexOf("]"), candidate.lastIndexOf("}")]) {
        if (end < 0) continue;
        try {
          return JSON.parse(candidate.slice(0, end + 1));
        } catch {
          // Sonraki adaya geç.
        }
      }
    }
  }
  throw new Error(`Wrangler JSON çıktısı çözülemedi:\n${text}`);
}

function collectRows(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRows(item, rows);
    return rows;
  }
  if (!value || typeof value !== "object") return rows;
  if (Array.isArray(value.results)) rows.push(...value.results);
  if (Array.isArray(value.rows)) rows.push(...value.rows);
  if (value.result) collectRows(value.result, rows);
  return rows;
}

function execute(sql) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "wrangler",
    "d1",
    "execute",
    database,
    mode === "remote" ? "--remote" : "--local",
    "--config",
    config,
    "--command",
    sql,
    "--json",
  ];
  if (mode === "local" && persistTo) {
    args.push("--persist-to", persistTo);
  }

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `D1 sorgusu başarısız (${result.status}).\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }
  return collectRows(parseJsonOutput(result.stdout));
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const tableRows = execute(
  "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
);
const tableNames = new Set(tableRows.map((row) => String(row.name || "")));
const missingTables = [];
const missingColumns = [];
const tableCounts = {};

for (const [table, columns] of Object.entries(requiredSchema)) {
  if (!tableNames.has(table)) {
    missingTables.push(table);
    continue;
  }
  const info = execute(`PRAGMA table_info(${quoteIdentifier(table)});`);
  const actual = new Set(info.map((row) => String(row.name || "")));
  const absent = columns.filter((column) => !actual.has(column));
  if (absent.length) missingColumns.push({ table, columns: absent });

  const countRows = execute(
    `SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(table)};`,
  );
  tableCounts[table] = Number(countRows[0]?.row_count || 0);
}

const quickRows = execute("PRAGMA quick_check;");
const quickCheck = String(
  quickRows[0]?.quick_check || quickRows[0]?.integrity_check || "",
).toLowerCase();

let duplicateJsonStoreKeys = [];
if (tableNames.has("json_store")) {
  duplicateJsonStoreKeys = execute(`
    SELECT
      scope,
      COALESCE(main_company_slug, '') AS main_company_slug,
      file_name,
      COUNT(*) AS duplicate_count
    FROM json_store
    GROUP BY scope, COALESCE(main_company_slug, ''), file_name
    HAVING COUNT(*) > 1
    ORDER BY duplicate_count DESC
    LIMIT 50;
  `);
}

const migrationTablePresent = tableNames.has("d1_migrations");
const report = {
  ok:
    missingTables.length === 0 &&
    missingColumns.length === 0 &&
    quickCheck === "ok" &&
    (!requireMigrations || migrationTablePresent),
  mode,
  database,
  config,
  quickCheck,
  migrationTablePresent,
  tableCount: tableNames.size,
  requiredTableCounts: tableCounts,
  missingTables,
  missingColumns,
  duplicateJsonStoreKeys,
};

console.log(JSON.stringify(report, null, 2));

if (duplicateJsonStoreKeys.length) {
  console.warn(
    `UYARI: json_store içinde ${duplicateJsonStoreKeys.length} mükerrer anahtar grubu bulundu. Kayıtlar silinmedi; yayın öncesi ayrıca incelenmelidir.`,
  );
}

if (!report.ok) process.exit(1);
