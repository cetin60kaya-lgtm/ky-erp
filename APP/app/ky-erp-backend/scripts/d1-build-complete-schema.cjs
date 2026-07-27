const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SOURCE_DB = "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";
const OUT_DIR = "D:\\KYERP-YEDEK\\D1-GECIS-20260711";
const COMPLETE_SCHEMA_FILE = path.join(OUT_DIR, "KYERP_D1_COMPLETE_SCHEMA.sql");
const NORMAL_INDEXES_FILE = path.join(OUT_DIR, "KYERP_D1_NORMAL_INDEXES.sql");
const SAFE_DATA_FILE = path.join(OUT_DIR, "KYERP_D1_SAFE_DATA.sql");
const TEST_DB = path.join(OUT_DIR, "KYERP_D1_SCHEMA_TEST.db");
const REPORT_FILE = path.join(OUT_DIR, "KYERP_D1_COMPLETE_SCHEMA_REPORT.json");
const SQLITE = "sqlite3.exe";

const CRITICAL_COUNTS = new Map([
  ["personnel", 118],
  ["invoice_items", 1221],
  ["documents", 462],
  ["hr_daily_attendance", 909],
  ["companies", 56],
  ["json_store", 108]
]);

function sqliteJson(database, sql, readOnly = false) {
  const args = [];
  if (readOnly) args.push("-readonly");
  args.push("-json", database, sql);
  const output = execFileSync(SQLITE, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
    windowsHide: true
  }).trim();
  return output ? JSON.parse(output) : [];
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqliteDotPath(file) {
  return String(file).replace(/\\/g, "/").replace(/"/g, '""');
}

function ensureSemicolon(sql) {
  const trimmed = String(sql).trim();
  return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
}

function sameColumns(left, right) {
  return left.length === right.length && left.every(
    (column, index) => String(column).toLowerCase() === String(right[index]).toLowerCase()
  );
}

if (!fs.existsSync(SOURCE_DB)) throw new Error(`Kaynak DB bulunamadi: ${SOURCE_DB}`);
if (!fs.existsSync(SAFE_DATA_FILE)) throw new Error(`SAFE_DATA bulunamadi: ${SAFE_DATA_FILE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("KY ERP -> D1 TAM SEMASI OLUSTURULUYOR");
console.log(`Kaynak (salt okunur): ${SOURCE_DB}`);

const tables = sqliteJson(SOURCE_DB, `
  SELECT name, sql
  FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
    AND sql IS NOT NULL
  ORDER BY name;
`, true);
const tableNames = new Set(tables.map((table) => table.name));

const indexRows = sqliteJson(SOURCE_DB, `
  SELECT name, tbl_name AS tableName, sql
  FROM sqlite_master
  WHERE type = 'index'
    AND sql IS NOT NULL
    AND name NOT LIKE 'sqlite_autoindex_%'
  ORDER BY tbl_name, name;
`, true);
const uniqueIndexes = indexRows.filter((index) => /^\s*CREATE\s+UNIQUE\s+INDEX\b/i.test(index.sql));
const normalIndexes = indexRows.filter((index) => !/^\s*CREATE\s+UNIQUE\s+INDEX\b/i.test(index.sql));
const uniqueByTable = new Map();
for (const index of uniqueIndexes) {
  if (!uniqueByTable.has(index.tableName)) uniqueByTable.set(index.tableName, []);
  uniqueByTable.get(index.tableName).push(index);
}

const objectsNotAutoIncluded = sqliteJson(SOURCE_DB, `
  SELECT type, name, tbl_name AS tableName, sql
  FROM sqlite_master
  WHERE type IN ('view', 'trigger')
  ORDER BY type, name;
`, true);

const dependencies = new Map(tables.map((table) => [table.name, new Set()]));
const foreignKeys = [];
for (const table of tables) {
  const rows = sqliteJson(SOURCE_DB, `PRAGMA foreign_key_list(${qi(table.name)});`, true);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.id}|${row.table}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    if (tableNames.has(row.table) && row.table !== table.name) dependencies.get(table.name).add(row.table);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.seq) - Number(b.seq));
    foreignKeys.push({
      childTable: table.name,
      parentTable: group[0].table,
      childColumns: group.map((row) => row.from),
      parentColumns: group.map((row) => row.to)
    });
  }
}

// Parent-first DFS. SQLite permits table creation across cycles; cycles are reported.
const orderedTableNames = [];
const visiting = new Set();
const visited = new Set();
const cycles = [];
function visit(tableName, trail = []) {
  if (visited.has(tableName)) return;
  if (visiting.has(tableName)) {
    cycles.push([...trail, tableName]);
    return;
  }
  visiting.add(tableName);
  for (const parent of dependencies.get(tableName) || []) visit(parent, [...trail, tableName]);
  visiting.delete(tableName);
  visited.add(tableName);
  orderedTableNames.push(tableName);
}
for (const table of tables) visit(table.name);
const tableMap = new Map(tables.map((table) => [table.name, table]));

const uniqueDefinitions = new Map();
for (const table of tables) {
  const definitions = [];
  const columns = sqliteJson(SOURCE_DB, `PRAGMA table_info(${qi(table.name)});`, true);
  const primaryKey = columns.filter((column) => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk)).map((column) => column.name);
  if (primaryKey.length > 0) definitions.push({ type: "primary_key", name: null, columns: primaryKey });
  const indexes = sqliteJson(SOURCE_DB, `PRAGMA index_list(${qi(table.name)});`, true);
  for (const index of indexes.filter((item) => Number(item.unique) === 1)) {
    const indexColumns = sqliteJson(SOURCE_DB, `PRAGMA index_info(${qi(index.name)});`, true)
      .sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((item) => item.name);
    if (indexColumns.length > 0 && indexColumns.every(Boolean)) {
      definitions.push({ type: index.origin === "pk" ? "primary_key" : "unique_index", name: index.name, columns: indexColumns });
    }
  }
  uniqueDefinitions.set(table.name, definitions);
}

const invalidForeignKeyTargets = [];
const foreignKeyTargetUniqueIndexes = new Set();
for (const foreignKey of foreignKeys) {
  if (foreignKey.parentColumns.some((column) => !column)) continue;
  const match = (uniqueDefinitions.get(foreignKey.parentTable) || [])
    .find((definition) => sameColumns(definition.columns, foreignKey.parentColumns));
  if (!match) invalidForeignKeyTargets.push(foreignKey);
  else if (match.type === "unique_index") foreignKeyTargetUniqueIndexes.add(`${foreignKey.parentTable}.${match.name}`);
}
if (invalidForeignKeyTargets.length > 0) {
  throw new Error(`Kaynak semada UNIQUE/PK olmayan ${invalidForeignKeyTargets.length} foreign key hedefi bulundu: ${JSON.stringify(invalidForeignKeyTargets)}`);
}

const completeSchema = [
  "-- KY ERP D1 COMPLETE SCHEMA",
  `-- Created: ${new Date().toISOString()}`,
  `-- Source: ${SOURCE_DB}`,
  "-- Tables are parent-first; each table's explicit UNIQUE indexes follow it immediately.",
  "",
  "PRAGMA foreign_keys = OFF;",
  ""
];
for (const tableName of orderedTableNames) {
  const table = tableMap.get(tableName);
  completeSchema.push(`-- TABLE: ${tableName}`, ensureSemicolon(table.sql));
  for (const index of uniqueByTable.get(tableName) || []) {
    completeSchema.push(`-- REQUIRED UNIQUE INDEX: ${index.name}`, ensureSemicolon(index.sql));
  }
  completeSchema.push("");
}
completeSchema.push("PRAGMA foreign_keys = ON;", "");
fs.writeFileSync(COMPLETE_SCHEMA_FILE, completeSchema.join("\n"), "utf8");

const normalIndexSql = [
  "-- KY ERP D1 NORMAL (NON-UNIQUE) INDEXES",
  `-- Created: ${new Date().toISOString()}`,
  `-- Source: ${SOURCE_DB}`,
  "",
  ...normalIndexes.flatMap((index) => [`-- ${index.name} ON ${index.tableName}`, ensureSemicolon(index.sql), ""])
].join("\n");
fs.writeFileSync(NORMAL_INDEXES_FILE, normalIndexSql, "utf8");

// Only the exact, known test DB is replaced. The source DB is always opened -readonly.
const resolvedTestDb = path.resolve(TEST_DB);
if (path.dirname(resolvedTestDb).toLowerCase() !== path.resolve(OUT_DIR).toLowerCase()) {
  throw new Error(`Guvenli olmayan test DB yolu: ${resolvedTestDb}`);
}
if (fs.existsSync(resolvedTestDb)) fs.rmSync(resolvedTestDb, { force: true });

const testInput = [
  ".bail on",
  "PRAGMA foreign_keys = OFF;",
  `.read "${sqliteDotPath(COMPLETE_SCHEMA_FILE)}"`,
  // SAFE_DATA is table-name ordered, not FK ordered. Load it with enforcement
  // disabled, then validate the completed database with foreign_key_check.
  "PRAGMA foreign_keys = OFF;",
  "BEGIN IMMEDIATE;",
  `.read "${sqliteDotPath(SAFE_DATA_FILE)}"`,
  "COMMIT;",
  "PRAGMA foreign_keys = ON;",
  "PRAGMA foreign_key_check;",
  ""
].join("\n");
let testOutput;
try {
  testOutput = execFileSync(SQLITE, [resolvedTestDb], {
    input: testInput,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
} catch (error) {
  const details = `${error.stdout || ""}\n${error.stderr || ""}`.trim();
  throw new Error(`Yerel schema/data testi basarisiz. D1 upload yapilmadi.\n${details}`);
}

let foreignKeyCheck;
try {
  foreignKeyCheck = sqliteJson(resolvedTestDb, "PRAGMA foreign_key_check;");
} catch (error) {
  throw new Error(`PRAGMA foreign_key_check calistirilamadi: ${error.message}`);
}
if (foreignKeyCheck.length > 0) {
  throw new Error(`PRAGMA foreign_key_check ${foreignKeyCheck.length} ihlal buldu: ${JSON.stringify(foreignKeyCheck.slice(0, 20))}`);
}

const criticalCounts = {};
for (const [table, expected] of CRITICAL_COUNTS) {
  const actual = Number(sqliteJson(resolvedTestDb, `SELECT COUNT(*) AS count FROM ${qi(table)};`)[0]?.count || 0);
  criticalCounts[table] = { expected, actual, matches: actual === expected };
}
const countMismatches = Object.entries(criticalCounts).filter(([, result]) => !result.matches);
if (countMismatches.length > 0) {
  throw new Error(`Kritik kayit sayisi uyusmazligi: ${JSON.stringify(Object.fromEntries(countMismatches))}`);
}

const safeDataText = fs.readFileSync(SAFE_DATA_FILE, "utf8");
const safeDataRecordCount = (safeDataText.match(/^INSERT INTO /gm) || []).length;
const report = {
  status: "LOCAL_TEST_PASSED",
  sourceDatabase: SOURCE_DB,
  createdAt: new Date().toISOString(),
  tableCount: tables.length,
  uniqueIndexCount: uniqueIndexes.length,
  normalIndexCount: normalIndexes.length,
  foreignKeyCount: foreignKeys.length,
  foreignKeyTargetUniqueIndexCount: foreignKeyTargetUniqueIndexes.size,
  foreignKeyTargetUniqueIndexes: [...foreignKeyTargetUniqueIndexes].sort(),
  safeDataRecordCount,
  foreignKeyCheckResultCount: foreignKeyCheck.length,
  criticalCounts,
  dependencyCycles: cycles,
  views: objectsNotAutoIncluded.filter((item) => item.type === "view"),
  triggers: objectsNotAutoIncluded.filter((item) => item.type === "trigger"),
  files: { completeSchema: COMPLETE_SCHEMA_FILE, normalIndexes: NORMAL_INDEXES_FILE, testDatabase: TEST_DB }
};
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

console.log("\nYEREL TEST BASARILI");
console.log(`Tablo sayisi: ${tables.length}`);
console.log(`Unique index sayisi: ${uniqueIndexes.length}`);
console.log(`Normal index sayisi: ${normalIndexes.length}`);
console.log(`Foreign key target unique index sayisi: ${foreignKeyTargetUniqueIndexes.size}`);
console.log(`SAFE_DATA kayit sayisi: ${safeDataRecordCount}`);
console.log(`PRAGMA foreign_key_check sonucu: ${foreignKeyCheck.length}`);
console.log("Kritik kayit sayilari:");
for (const [table, result] of Object.entries(criticalCounts)) console.log(`  ${table}: ${result.actual} (beklenen ${result.expected})`);
console.log(`View sayisi (otomatik eklenmedi): ${report.views.length}`);
console.log(`Trigger sayisi (otomatik eklenmedi): ${report.triggers.length}`);
console.log(`Bagimlilik dongusu sayisi: ${cycles.length}`);
console.log(`\nCOMPLETE_SCHEMA: ${COMPLETE_SCHEMA_FILE}`);
console.log(`NORMAL_INDEXES: ${NORMAL_INDEXES_FILE}`);
console.log(`TEST_DB: ${TEST_DB}`);
console.log(`RAPOR: ${REPORT_FILE}`);
console.log(`Test sqlite stdout: ${testOutput.trim() || "(bos)"}`);
console.log("\nD1'e upload yapilmadi. KYERP.db degistirilmedi.");
