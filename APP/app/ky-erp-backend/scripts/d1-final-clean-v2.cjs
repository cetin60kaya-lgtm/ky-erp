const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DB =
  "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";

const OUT_DIR =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711";

const OUT_SQL =
  path.join(OUT_DIR, "KYERP_D1_READY.sql");

const OUT_REPORT =
  path.join(OUT_DIR, "KYERP_D1_READY_REPORT.json");

const SQLITE = "sqlite3.exe";

/*
  Bunlarin VERISI tasinmayacak.
  Ancak tablo semalari korunacak.
*/
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

function run(sql) {
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
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value)
    .replace(/\u0000/g, "")
    .replace(/'/g, "''")}'`;
}

if (!fs.existsSync(DB)) {
  console.error("KYERP.db bulunamadi:");
  console.error(DB);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("");
console.log("=====================================================");
console.log(" KY ERP -> D1 FINAL TEMIZ PAKET V2");
console.log("=====================================================");
console.log("");

const tables = run(`
  SELECT
    name,
    sql
  FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name;
`);

let output = "";

output += "-- KY ERP D1 READY IMPORT\n";
output += `-- Source: ${DB}\n`;
output += `-- Created: ${new Date().toISOString()}\n\n`;
output += "PRAGMA defer_foreign_keys = ON;\n\n";

const report = {
  source: DB,
  createdAt: new Date().toISOString(),
  totalTables: tables.length,
  schemaTables: [],
  dataTables: [],
  skippedDataTables: [],
  strippedColumns: [],
  skippedJsonStoreRows: 0
};

/*
  1) BUTUN TABLO SEMALARINI KUR
  Bos tablolar dahil.
*/
console.log("1/2 - Tablo semalari hazirlaniyor...");

for (const table of tables) {
  if (!table.sql) continue;

  output += "-- =============================================\n";
  output += `-- SCHEMA: ${table.name}\n`;
  output += "-- =============================================\n";
  output += `${table.sql};\n\n`;

  report.schemaTables.push(table.name);
}

/*
  2) SADECE GERCEK VERIYI AKTAR
*/
console.log("2/2 - Canli veriler hazirlaniyor...");
console.log("");

for (let i = 0; i < tables.length; i++) {
  const table = tables[i].name;

  const count =
    Number(
      run(
        `SELECT COUNT(*) AS c FROM ${qi(table)};`
      )?.[0]?.c || 0
    );

  process.stdout.write(
    `[${String(i + 1).padStart(3, "0")}/${tables.length}] ` +
    `${table} (${count}) ... `
  );

  if (count === 0) {
    console.log("SEMA VAR / VERI YOK");
    continue;
  }

  if (SKIP_DATA_TABLES.has(table)) {
    report.skippedDataTables.push({
      table,
      rowCount: count,
      reason: "log_audit_history"
    });

    console.log("VERI ATLANDI");
    continue;
  }

  const columns =
    run(`PRAGMA table_info(${qi(table)});`);

  const columnNames =
    columns.map(c => c.name);

  let selectSql =
    `SELECT * FROM ${qi(table)}`;

  /*
    json_store icindeki eski safety backup satirlarini alma.
  */
  if (table === "json_store") {
    selectSql += `
      WHERE file_name IS NULL
         OR file_name NOT LIKE '_safety-backups/%'
    `;
  }

  selectSql += ";";

  const rows = run(selectSql);

  if (table === "json_store") {
    report.skippedJsonStoreRows =
      count - rows.length;
  }

  output += "\n";
  output += "-- =============================================\n";
  output += `-- DATA: ${table}\n`;
  output += `-- SOURCE ROWS: ${count}\n`;
  output += `-- EXPORTED ROWS: ${rows.length}\n`;
  output += "-- =============================================\n";

  for (const row of rows) {
    const values = columnNames.map(col => {
      /*
        Ham XML / parse dump D1'e tasinmayacak.
        Kolonun kendisi tabloda kalacak.
      */
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

    output +=
      `INSERT INTO ${qi(table)} (` +
      columnNames.map(qi).join(", ") +
      `) VALUES (` +
      values.join(", ") +
      `);\n`;
  }

  report.dataTables.push({
    table,
    sourceRows: count,
    exportedRows: rows.length
  });

  console.log(`${rows.length} AKTARILDI`);
}

report.strippedColumns = [
  {
    table: "documents",
    column: "raw",
    reason: "ham_belge_icerigi_onedrive"
  },
  {
    table: "document_intakes",
    column: "parse_raw_json",
    reason: "ham_parse_icerigi_onedrive"
  }
];

output += "\nPRAGMA defer_foreign_keys = OFF;\n";

fs.writeFileSync(
  OUT_SQL,
  output,
  "utf8"
);

const size =
  fs.statSync(OUT_SQL).size;

report.sqlBytes = size;
report.sqlMB =
  Number((size / 1024 / 1024).toFixed(2));

fs.writeFileSync(
  OUT_REPORT,
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("");
console.log("=====================================================");
console.log(" D1 PAKETI HAZIR");
console.log("=====================================================");
console.log("");
console.log("Toplam sema:", report.schemaTables.length);
console.log("Veri tasinan tablo:", report.dataTables.length);
console.log(
  "Atlanan safety backup kaydi:",
  report.skippedJsonStoreRows
);
console.log(
  "Final SQL boyutu:",
  report.sqlMB,
  "MB"
);
console.log("");
console.log("SQL:");
console.log(OUT_SQL);
console.log("");
console.log("Rapor:");
console.log(OUT_REPORT);
console.log("");
console.log("D1'E HENUZ YUKLENMEDI.");
console.log("KYERP.db DEGISTIRILMEDI.");
console.log("");
