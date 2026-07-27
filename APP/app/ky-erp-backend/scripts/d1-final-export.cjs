const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DB =
  "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";

const OUT_DIR =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711";

const OUT_SQL =
  path.join(OUT_DIR, "KYERP_D1_FINAL_IMPORT.sql");

const OUT_REPORT =
  path.join(OUT_DIR, "KYERP_D1_FINAL_REPORT.json");

const SQLITE = "sqlite3.exe";

const EXCLUDE_TABLES = new Set([
  "activity_logs",
  "hr_monthly_audit_logs",
  "ik_audit_logs",
  "operation_logs",
  "folder_watch_logs",
  "mail_send_logs",
  "muhasebe_mail_send_logs",
  "sales_invoice_history"
]);

const EXCLUDE_PATTERNS = [
  /(^|_)backup($|_)/i,
  /(^|_)yedek($|_)/i,
  /(^|_)temp($|_)/i,
  /(^|_)tmp($|_)/i,
  /(^|_)audit_log/i
];

/*
  Bu kolon adlari ham dosya/ham icerik olma ihtimali yuksek.
  Ancak sadece buyuk veri tasiyorlarsa D1 exportunda NULL yapilacak.
*/
const LARGE_CONTENT_NAME_PATTERN =
  /(content|raw|xml|payload|binary|blob|base64|file_data|file_content|document_data|json_data|data)$/i;

function runSqlite(args) {
  return execFileSync(
    SQLITE,
    args,
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 1024,
      windowsHide: true
    }
  );
}

function jsonQuery(sql) {
  const out = runSqlite([
    "-json",
    DB,
    sql
  ]).trim();

  return out ? JSON.parse(out) : [];
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlString(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString("hex")}'`;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

if (!fs.existsSync(DB)) {
  console.error("DB BULUNAMADI:");
  console.error(DB);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("");
console.log("=====================================================");
console.log(" KY ERP -> FINAL D1 EXPORT");
console.log("=====================================================");
console.log("");
console.log("Kaynak DB:");
console.log(DB);
console.log("");

const tables = jsonQuery(`
  SELECT
    name,
    sql
  FROM sqlite_master
  WHERE type='table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name;
`);

const selected = [];
const skipped = [];
const strippedColumns = [];

for (const row of tables) {
  const name = row.name;

  const excluded =
    EXCLUDE_TABLES.has(name) ||
    EXCLUDE_PATTERNS.some(rx => rx.test(name));

  if (excluded) {
    skipped.push({
      table: name,
      reason: "log_yedek_gecici"
    });

    continue;
  }

  const count =
    Number(
      jsonQuery(
        `SELECT COUNT(*) AS c FROM ${qi(name)};`
      )?.[0]?.c || 0
    );

  if (count === 0) {
    skipped.push({
      table: name,
      reason: "bos"
    });

    continue;
  }

  selected.push({
    table: name,
    rowCount: count,
    schema: row.sql
  });
}

console.log("Tasınacak tablo:", selected.length);
console.log("Atlanan tablo:", skipped.length);
console.log("");

let finalSql = "";

finalSql += "-- KY ERP D1 FINAL IMPORT\n";
finalSql += `-- Created: ${new Date().toISOString()}\n`;
finalSql += `-- Source: ${DB}\n\n`;

finalSql += "PRAGMA defer_foreign_keys = ON;\n\n";

for (let i = 0; i < selected.length; i++) {
  const item = selected[i];
  const table = item.table;

  console.log(
    `[${String(i + 1).padStart(3, "0")}/${selected.length}] ${table}`
  );

  const columns = jsonQuery(
    `PRAGMA table_info(${qi(table)});`
  );

  const stripCols = [];

  for (const col of columns) {
    const colName = col.name;

    const stats = jsonQuery(`
      SELECT
        COALESCE(MAX(LENGTH(CAST(${qi(colName)} AS BLOB))),0) AS max_bytes,
        COALESCE(SUM(LENGTH(CAST(${qi(colName)} AS BLOB))),0) AS total_bytes
      FROM ${qi(table)};
    `)?.[0] || {};

    const maxBytes =
      Number(stats.max_bytes || 0);

    const totalBytes =
      Number(stats.total_bytes || 0);

    const suspiciousName =
      LARGE_CONTENT_NAME_PATTERN.test(colName);

    /*
      Kurallar:
      - Tek bir değer 256 KB üstündeyse
      - veya kolon toplamı 5 MB üstündeyse
      - ve özellikle içerik/raw/xml/data türü isimliyse
      D1'e ham içerik olarak taşınmaz.
    */
    const shouldStrip =
      (
        maxBytes >= 262144 ||
        totalBytes >= 5 * 1024 * 1024
      ) &&
      suspiciousName;

    if (shouldStrip) {
      stripCols.push(colName);

      strippedColumns.push({
        table,
        column: colName,
        maxMB:
          Number((maxBytes / 1024 / 1024).toFixed(3)),
        totalMB:
          Number((totalBytes / 1024 / 1024).toFixed(3))
      });
    }
  }

  finalSql += "\n";
  finalSql += "-- =============================================\n";
  finalSql += `-- TABLE: ${table}\n`;
  finalSql += `-- ROWS: ${item.rowCount}\n`;

  if (stripCols.length > 0) {
    finalSql +=
      `-- STRIPPED LARGE CONTENT: ${stripCols.join(", ")}\n`;
  }

  finalSql += "-- =============================================\n\n";

  /*
    CREATE TABLE şemasını aynen koruyoruz.
  */
  finalSql += `${item.schema};\n\n`;

  const rows = jsonQuery(
    `SELECT * FROM ${qi(table)};`
  );

  const columnNames =
    columns.map(c => c.name);

  for (const row of rows) {
    const values = columnNames.map(col => {
      if (stripCols.includes(col)) {
        return "NULL";
      }

      return sqlString(row[col]);
    });

    finalSql +=
      `INSERT INTO ${qi(table)} (` +
      columnNames.map(qi).join(", ") +
      `) VALUES (` +
      values.join(", ") +
      `);\n`;
  }

  finalSql += "\n";
}

finalSql += "\nPRAGMA defer_foreign_keys = OFF;\n";

fs.writeFileSync(
  OUT_SQL,
  finalSql,
  "utf8"
);

const size =
  fs.statSync(OUT_SQL).size;

const report = {
  sourceDatabase: DB,
  createdAt: new Date().toISOString(),
  selectedTableCount: selected.length,
  skippedTableCount: skipped.length,
  finalSqlBytes: size,
  finalSqlMB:
    Number((size / 1024 / 1024).toFixed(2)),
  strippedColumns,
  selectedTables:
    selected.map(x => ({
      table: x.table,
      rowCount: x.rowCount
    })),
  skippedTables: skipped
};

fs.writeFileSync(
  OUT_REPORT,
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("");
console.log("=====================================================");
console.log(" FINAL D1 IMPORT HAZIR");
console.log("=====================================================");
console.log("");
console.log("SQL:");
console.log(OUT_SQL);
console.log("");
console.log(
  "SQL boyutu:",
  (size / 1024 / 1024).toFixed(2),
  "MB"
);
console.log("");

console.log("Buyuk icerigi cikarilan kolonlar:");

if (strippedColumns.length === 0) {
  console.log("YOK");
} else {
  for (const x of strippedColumns) {
    console.log(
      `${x.table}.${x.column}` +
      ` | toplam=${x.totalMB} MB` +
      ` | max=${x.maxMB} MB`
    );
  }
}

console.log("");
console.log("Rapor:");
console.log(OUT_REPORT);
console.log("");
console.log("D1'E HENUZ YUKLEME YAPILMADI.");
console.log("ORIJINAL KYERP.DB DEGISTIRILMEDI.");
console.log("");
