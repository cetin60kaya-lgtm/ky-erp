const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DB =
  "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";

const OUT_DIR =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711";

const SCHEMA_FILE =
  path.join(OUT_DIR, "KYERP_D1_SCHEMA.sql");

const DATA_FILE =
  path.join(OUT_DIR, "KYERP_D1_DATA.sql");

const REPORT_FILE =
  path.join(OUT_DIR, "KYERP_D1_SMART_IMPORT_REPORT.json");

const BACKEND =
  "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\APP\\app\\ky-erp-backend";

const SQLITE = "sqlite3.exe";
const DB_NAME = "ky-erp-db";

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
  const out = execFileSync(
    SQLITE,
    ["-json", DB, sql],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 1024,
      windowsHide: true
    }
  ).trim();

  return out ? JSON.parse(out) : [];
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value)
    .replace(/\u0000/g, "")
    .replace(/'/g, "''")}'`;
}

function runWrangler(args) {
  const out = execFileSync(
    "npx.cmd",
    ["wrangler", ...args],
    {
      cwd: BACKEND,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 500,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  console.log(out);
  return out;
}

console.log("");
console.log("====================================================");
console.log(" KY ERP -> D1 AKILLI AKTARIM");
console.log("====================================================");

const tables = sqlite(`
  SELECT name, sql
  FROM sqlite_master
  WHERE type='table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name;
`);

const tableMap = new Map(
  tables.map(t => [t.name, t])
);

/*
  Foreign key bagimliliklarini oku.
*/
const dependencies = new Map();

for (const table of tables) {
  const fks = sqlite(
    `PRAGMA foreign_key_list(${qi(table.name)});`
  );

  dependencies.set(
    table.name,
    new Set(
      fks
        .map(x => x.table)
        .filter(parent => tableMap.has(parent))
    )
  );
}

/*
  Parent tablolar once gelecek sekilde topological sort.
*/
const ordered = [];
const visiting = new Set();
const visited = new Set();

function visit(table) {
  if (visited.has(table)) return;
  if (visiting.has(table)) return;

  visiting.add(table);

  for (const parent of dependencies.get(table) || []) {
    visit(parent);
  }

  visiting.delete(table);
  visited.add(table);
  ordered.push(table);
}

for (const table of tables) {
  visit(table.name);
}

console.log("Tablo sayisi:", ordered.length);

/*
  SEMA DOSYASI
*/
let schemaSql = "";

schemaSql += "PRAGMA defer_foreign_keys = true;\n\n";

for (const tableName of ordered) {
  const schema = tableMap.get(tableName)?.sql;

  if (!schema) continue;

  schemaSql += `-- ${tableName}\n`;
  schemaSql += `${schema};\n\n`;
}

schemaSql += "PRAGMA defer_foreign_keys = false;\n";

fs.writeFileSync(
  SCHEMA_FILE,
  schemaSql,
  "utf8"
);

/*
  VERI DOSYASI
*/
let dataSql = "";

dataSql += "PRAGMA defer_foreign_keys = true;\n\n";

const report = {
  orderedTables: ordered,
  exportedTables: [],
  skippedTables: [],
  skippedSafetyBackups: 0
};

for (let i = 0; i < ordered.length; i++) {
  const table = ordered[i];

  const count = Number(
    sqlite(
      `SELECT COUNT(*) AS c FROM ${qi(table)};`
    )?.[0]?.c || 0
  );

  console.log(
    `[${String(i + 1).padStart(3, "0")}/${ordered.length}] ` +
    `${table} (${count})`
  );

  if (count === 0) continue;

  if (SKIP_DATA_TABLES.has(table)) {
    report.skippedTables.push({
      table,
      rows: count,
      reason: "log_audit_history"
    });

    continue;
  }

  const columns =
    sqlite(`PRAGMA table_info(${qi(table)});`);

  const columnNames =
    columns.map(c => c.name);

  let query =
    `SELECT * FROM ${qi(table)}`;

  if (table === "json_store") {
    query += `
      WHERE file_name IS NULL
         OR file_name NOT LIKE '_safety-backups/%'
    `;
  }

  query += ";";

  const rows = sqlite(query);

  if (table === "json_store") {
    report.skippedSafetyBackups =
      count - rows.length;
  }

  for (const row of rows) {
    const values = columnNames.map(col => {
      if (
        table === "documents" &&
        col === "raw"
      ) {
        return "NULL";
      }

      if (
        table === "document_intakes" &&
        col === "parse_raw_json"
      ) {
        return "NULL";
      }

      return sqlValue(row[col]);
    });

    dataSql +=
      `INSERT INTO ${qi(table)} (` +
      columnNames.map(qi).join(", ") +
      `) VALUES (` +
      values.join(", ") +
      `);\n`;
  }

  report.exportedTables.push({
    table,
    sourceRows: count,
    exportedRows: rows.length
  });
}

dataSql += "\nPRAGMA defer_foreign_keys = false;\n";

fs.writeFileSync(
  DATA_FILE,
  dataSql,
  "utf8"
);

fs.writeFileSync(
  REPORT_FILE,
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("");
console.log("Sema dosyasi:", SCHEMA_FILE);
console.log(
  "Sema boyutu:",
  (fs.statSync(SCHEMA_FILE).size / 1024 / 1024).toFixed(2),
  "MB"
);

console.log("");
console.log("Veri dosyasi:", DATA_FILE);
console.log(
  "Veri boyutu:",
  (fs.statSync(DATA_FILE).size / 1024 / 1024).toFixed(2),
  "MB"
);

console.log("");
console.log("1/4 SEMA D1'E YUKLENIYOR...");

runWrangler([
  "d1",
  "execute",
  DB_NAME,
  "--remote",
  `--file=${SCHEMA_FILE}`
]);

console.log("");
console.log("2/4 VERI D1'E YUKLENIYOR...");

runWrangler([
  "d1",
  "execute",
  DB_NAME,
  "--remote",
  `--file=${DATA_FILE}`
]);

console.log("");
console.log("3/4 KRITIK KAYITLAR KONTROL EDILIYOR...");

runWrangler([
  "d1",
  "execute",
  DB_NAME,
  "--remote",
  "--command=SELECT 'personnel' AS tablo, COUNT(*) AS adet FROM personnel UNION ALL SELECT 'invoice_items', COUNT(*) FROM invoice_items UNION ALL SELECT 'documents', COUNT(*) FROM documents UNION ALL SELECT 'hr_daily_attendance', COUNT(*) FROM hr_daily_attendance UNION ALL SELECT 'companies', COUNT(*) FROM companies UNION ALL SELECT 'json_store', COUNT(*) FROM json_store;"
]);

console.log("");
console.log("4/4 FOREIGN KEY KONTROLU...");

runWrangler([
  "d1",
  "execute",
  DB_NAME,
  "--remote",
  "--command=PRAGMA foreign_key_check;"
]);

console.log("");
console.log("====================================================");
console.log(" D1 AKTARIMI TAMAMLANDI");
console.log("====================================================");
console.log("");
console.log("Beklenen:");
console.log("personnel              118");
console.log("invoice_items          1221");
console.log("documents               462");
console.log("hr_daily_attendance     909");
console.log("companies                56");
console.log("json_store              122");
console.log("");
