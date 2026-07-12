const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DB =
  "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";

const OUT_DIR =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711";

const OUT =
  path.join(OUT_DIR, "KYERP_D1_CLEAN_IMPORT.sql");

const MANIFEST =
  path.join(OUT_DIR, "KYERP_D1_CLEAN_MANIFEST.json");

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

function runSqlite(args) {
  return execFileSync(
    "sqlite3.exe",
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

function cleanDump(text) {
  return String(text)
    .split(/\r?\n/)
    .filter(line => {
      const s = line.trim();

      if (/^PRAGMA foreign_keys=OFF;$/i.test(s)) return false;
      if (/^BEGIN TRANSACTION;$/i.test(s)) return false;
      if (/^COMMIT;$/i.test(s)) return false;
      if (/^DELETE FROM sqlite_sequence/i.test(s)) return false;
      if (/^INSERT INTO sqlite_sequence/i.test(s)) return false;

      return true;
    })
    .join("\n")
    .trim();
}

if (!fs.existsSync(DB)) {
  console.error("VERITABANI BULUNAMADI:");
  console.error(DB);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("");
console.log("====================================================");
console.log(" KY ERP -> TEMIZ D1 AKTARIM DOSYASI HAZIRLAMA");
console.log("====================================================");
console.log("");

const tables = jsonQuery(`
  SELECT name
  FROM sqlite_master
  WHERE type='table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name;
`);

const selected = [];
const skipped = [];

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

  const countResult = jsonQuery(
    `SELECT COUNT(*) AS c FROM ${qi(name)};`
  );

  const count =
    Number(countResult?.[0]?.c || 0);

  if (count === 0) {
    skipped.push({
      table: name,
      reason: "bos"
    });

    continue;
  }

  selected.push({
    table: name,
    rowCount: count
  });
}

console.log("Tasınacak tablo:", selected.length);
console.log("Atlanan tablo:", skipped.length);
console.log("");

let finalSql = "";

finalSql += "-- KY ERP D1 CLEAN IMPORT\n";
finalSql += "-- Kaynak: KYERP.db\n";
finalSql += `-- Olusturma: ${new Date().toISOString()}\n\n`;

finalSql += "PRAGMA defer_foreign_keys = ON;\n\n";

const exported = [];

for (let i = 0; i < selected.length; i++) {
  const item = selected[i];
  const tableName = item.table;

  process.stdout.write(
    `[${String(i + 1).padStart(3, "0")}/${selected.length}] ` +
    `${tableName} (${item.rowCount} kayit) ... `
  );

  try {
    /*
      KRITIK DUZELTME:
      Her tablo AYRI .dump komutuyla aliniyor.
    */
    const command =
      `.dump "${tableName.replace(/"/g, '""')}"`;

    const rawDump = runSqlite([
      DB,
      command
    ]);

    const cleaned = cleanDump(rawDump);

    finalSql += "\n";
    finalSql += "-- =============================================\n";
    finalSql += `-- TABLE: ${tableName}\n`;
    finalSql += `-- ROWS : ${item.rowCount}\n`;
    finalSql += "-- =============================================\n\n";

    finalSql += cleaned;
    finalSql += "\n\n";

    exported.push(item);

    console.log("OK");
  } catch (error) {
    console.log("HATA");

    console.error("");
    console.error("TABLO AKTARIM HATASI:");
    console.error(tableName);
    console.error(
      String(error.stderr || error.message || error)
    );

    process.exit(1);
  }
}

finalSql += "\nPRAGMA defer_foreign_keys = OFF;\n";

fs.writeFileSync(
  OUT,
  finalSql,
  "utf8"
);

const manifest = {
  sourceDatabase: DB,
  createdAt: new Date().toISOString(),
  exportedTableCount: exported.length,
  skippedTableCount: skipped.length,
  exportedTables: exported,
  skippedTables: skipped
};

fs.writeFileSync(
  MANIFEST,
  JSON.stringify(manifest, null, 2),
  "utf8"
);

const stats = fs.statSync(OUT);

console.log("");
console.log("====================================================");
console.log(" TEMIZ D1 IMPORT DOSYASI HAZIR");
console.log("====================================================");
console.log("");
console.log("SQL:");
console.log(OUT);
console.log("");
console.log(
  "SQL boyutu:",
  (stats.size / 1024 / 1024).toFixed(2),
  "MB"
);
console.log("");
console.log("Manifest:");
console.log(MANIFEST);
console.log("");
console.log("D1'E HENUZ HICBIR SEY YUKLENMEDI.");
console.log("YEREL VERITABANI DEGISTIRILMEDI.");
console.log("");
