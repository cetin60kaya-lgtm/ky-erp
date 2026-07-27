const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DB = "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";
const OUT_DIR = "D:\\KYERP-YEDEK\\D1-GECIS-20260711";
const SAFE_DATA_FILE = path.join(OUT_DIR, "KYERP_D1_SAFE_DATA.sql");
const OVERSIZE_REPORT_FILE = path.join(OUT_DIR, "KYERP_D1_OVERSIZE_REPORT.json");
const INDEXES_FILE = path.join(OUT_DIR, "KYERP_D1_INDEXES.sql");
const SQLITE = "sqlite3.exe";
const MAX_STATEMENT_BYTES = 90 * 1024;

const SKIP_DATA_TABLES = new Set([
  "activity_logs",
  "hr_monthly_audit_logs",
  "ik_audit_logs",
  "operation_logs",
  "folder_watch_logs",
  "mail_send_logs",
  "muhasebe_mail_send_logs",
  "sales_invoice_history"
]);

function sqlite(sql) {
  const output = execFileSync(SQLITE, ["-readonly", "-json", DB, sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
    windowsHide: true
  }).trim();
  return output ? JSON.parse(output) : [];
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  return `'${String(value).replace(/\u0000/g, "").replace(/'/g, "''")}'`;
}

function valueBytes(value) {
  if (value === null || value === undefined) return 0;
  if (Buffer.isBuffer(value)) return value.length;
  return Buffer.byteLength(String(value), "utf8");
}

function roundKB(bytes) {
  return Number((bytes / 1024).toFixed(2));
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

if (!fs.existsSync(DB)) throw new Error(`Kaynak DB bulunamadi: ${DB}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("KY ERP -> D1 GUVENLI VERI DOSYASI OLUSTURULUYOR");
console.log(`Kaynak (salt okunur): ${DB}`);
console.log(`Statement limiti: ${MAX_STATEMENT_BYTES} byte (90 KB)`);

const tables = sqlite(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name;
`);

const safeStatements = [];
const oversizeRecords = [];
const exportedByTable = {};
const skippedTables = [];
let skippedSafetyBackups = 0;

for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
  const table = tables[tableIndex].name;
  const sourceRows = Number(sqlite(`SELECT COUNT(*) AS count FROM ${qi(table)};`)[0]?.count || 0);
  console.log(`[${String(tableIndex + 1).padStart(3, "0")}/${tables.length}] ${table} (${sourceRows})`);

  if (SKIP_DATA_TABLES.has(table)) {
    skippedTables.push({ table, rows: sourceRows, reason: "log_audit_history" });
    continue;
  }

  const columns = sqlite(`PRAGMA table_info(${qi(table)});`);
  const columnNames = columns.map((column) => column.name);
  const primaryKeyColumns = columns
    .filter((column) => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((column) => column.name);

  let query = `SELECT * FROM ${qi(table)}`;
  if (table === "json_store") {
    query += ` WHERE file_name IS NULL OR file_name NOT LIKE '_safety-backups/%'`;
  }
  const rows = sqlite(`${query};`);
  if (table === "json_store") skippedSafetyBackups = sourceRows - rows.length;

  exportedByTable[table] = { sourceRows, eligibleRows: rows.length, safeRows: 0, oversizeRows: 0 };

  for (const row of rows) {
    const effectiveRow = { ...row };
    if (table === "documents" && columnNames.includes("raw")) effectiveRow.raw = null;
    if (table === "document_intakes" && columnNames.includes("parse_raw_json")) effectiveRow.parse_raw_json = null;

    const values = columnNames.map((column) => sqlValue(effectiveRow[column]));
    const statement = `INSERT INTO ${qi(table)} (${columnNames.map(qi).join(", ")}) VALUES (${values.join(", ")});`;
    const statementBytes = Buffer.byteLength(statement, "utf8");

    if (statementBytes <= MAX_STATEMENT_BYTES) {
      safeStatements.push(statement);
      exportedByTable[table].safeRows += 1;
      continue;
    }

    const largestColumn = columnNames
      .map((column) => ({ column, bytes: valueBytes(effectiveRow[column]) }))
      .sort((a, b) => b.bytes - a.bytes)[0] || { column: null, bytes: 0 };
    const keyColumns = primaryKeyColumns.length > 0
      ? primaryKeyColumns
      : (columnNames.includes("id") ? ["id"] : []);
    const primaryKey = keyColumns.length === 0
      ? null
      : Object.fromEntries(keyColumns.map((column) => [column, row[column]]));

    const item = {
      table,
      primaryKey,
      id: Object.prototype.hasOwnProperty.call(row, "id") ? row.id : null,
      ...(Object.prototype.hasOwnProperty.call(row, "file_name") ? { file_name: row.file_name } : {}),
      statementBytes,
      approximateKB: roundKB(statementBytes),
      largestColumn: largestColumn.column,
      largestColumnBytes: largestColumn.bytes,
      largestColumnApproximateKB: roundKB(largestColumn.bytes)
    };
    oversizeRecords.push(item);
    exportedByTable[table].oversizeRows += 1;
  }
}

// Son guvenlik kapisi: dosya yazilmadan once her INSERT tekrar olculur.
const invalidSafeStatements = safeStatements
  .map((statement, index) => ({ index, bytes: Buffer.byteLength(statement, "utf8") }))
  .filter((item) => item.bytes > MAX_STATEMENT_BYTES);
if (invalidSafeStatements.length > 0) {
  throw new Error(`SAFE_DATA dogrulamasi basarisiz: ${invalidSafeStatements.length} statement 90 KB uzerinde.`);
}

const safeHeader = [
  "-- KY ERP D1 SAFE DATA",
  `-- Created: ${new Date().toISOString()}`,
  `-- Source: ${DB}`,
  `-- Every INSERT is <= ${MAX_STATEMENT_BYTES} UTF-8 bytes.`,
  "-- Oversize records are listed in KYERP_D1_OVERSIZE_REPORT.json.",
  "",
  "PRAGMA defer_foreign_keys = true;",
  ""
].join("\n");
const safeFooter = "\n\nPRAGMA defer_foreign_keys = false;\n";
fs.writeFileSync(SAFE_DATA_FILE, safeHeader + safeStatements.join("\n") + safeFooter, "utf8");

const indexes = sqlite(`
  SELECT name, tbl_name AS tableName, sql
  FROM sqlite_master
  WHERE type = 'index'
    AND sql IS NOT NULL
    AND name NOT LIKE 'sqlite_autoindex_%'
  ORDER BY tbl_name, name;
`);
const indexSql = [
  "-- KY ERP D1 INDEXES",
  `-- Created: ${new Date().toISOString()}`,
  `-- Source: ${DB}`,
  "-- sqlite internal autoindexes are excluded.",
  "",
  ...indexes.flatMap((index) => [`-- ${index.name} on ${index.tableName}`, `${index.sql};`, ""])
].join("\n");
fs.writeFileSync(INDEXES_FILE, indexSql, "utf8");

oversizeRecords.sort((a, b) => b.statementBytes - a.statementBytes);
const oversizeByTable = Object.fromEntries(
  [...new Set(oversizeRecords.map((item) => item.table))]
    .sort()
    .map((table) => [table, oversizeRecords.filter((item) => item.table === table).length])
);
const report = {
  sourceDatabase: DB,
  createdAt: new Date().toISOString(),
  maxStatementBytes: MAX_STATEMENT_BYTES,
  safeRecordCount: safeStatements.length,
  oversizeRecordCount: oversizeRecords.length,
  skippedSafetyBackups,
  skippedTables,
  oversizeByTable,
  jsonStoreOversize: oversizeRecords.filter((item) => item.table === "json_store"),
  oversizeRecords,
  tableSummary: exportedByTable
};
fs.writeFileSync(OVERSIZE_REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

const maxSafeStatementBytes = safeStatements.reduce(
  (maximum, statement) => Math.max(maximum, Buffer.byteLength(statement, "utf8")),
  0
);
const safeDataBytes = fs.statSync(SAFE_DATA_FILE).size;
const indexesBytes = fs.statSync(INDEXES_FILE).size;

console.log("\nOZET");
console.log(`Guvenli kayit sayisi: ${safeStatements.length}`);
console.log(`Oversize kayit sayisi: ${oversizeRecords.length}`);
console.log(`Atlanan json_store safety backup: ${skippedSafetyBackups}`);
console.log("Oversize tablo dagilimi:", oversizeByTable);
console.log("\nEN BUYUK 20 KAYIT");
for (const item of oversizeRecords.slice(0, 20)) {
  const key = item.file_name || item.id || JSON.stringify(item.primaryKey);
  console.log(`${item.table} | ${key} | ${item.statementBytes} byte (${item.approximateKB} KB) | ${item.largestColumn}=${item.largestColumnBytes} byte`);
}
console.log(`\nSAFE_DATA boyutu: ${formatBytes(safeDataBytes)} (${safeDataBytes} byte)`);
console.log(`INDEXES boyutu: ${formatBytes(indexesBytes)} (${indexesBytes} byte)`);
console.log(`SAFE_DATA maksimum INSERT: ${maxSafeStatementBytes} byte (${roundKB(maxSafeStatementBytes)} KB)`);
console.log(`Index sayisi: ${indexes.length}`);
console.log(`\nSAFE_DATA: ${SAFE_DATA_FILE}`);
console.log(`OVERSIZE_REPORT: ${OVERSIZE_REPORT_FILE}`);
console.log(`INDEXES: ${INDEXES_FILE}`);
console.log("\nD1'e upload yapilmadi. KYERP.db degistirilmedi.");
