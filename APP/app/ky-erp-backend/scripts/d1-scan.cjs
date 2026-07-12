const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DB = "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";
const OUT_DIR = "D:\\KYERP-YEDEK\\D1-GECIS-20260711";

const REPORT_JSON = path.join(OUT_DIR, "D1_SCAN_REPORT.json");
const REPORT_TXT  = path.join(OUT_DIR, "D1_SCAN_REPORT.txt");
const REPORT_CSV  = path.join(OUT_DIR, "D1_SCAN_TABLES.csv");

if (!fs.existsSync(DB)) {
  console.error("VERITABANI BULUNAMADI:");
  console.error(DB);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

function sqlite(query) {
  try {
    const output = execFileSync(
      "sqlite3.exe",
      ["-json", DB, query],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 500,
        windowsHide: true
      }
    );

    const text = String(output || "").trim();

    if (!text) return [];

    return JSON.parse(text);
  } catch (err) {
    console.error("\nSQLITE HATASI:");
    console.error(query);
    console.error(String(err.stderr || err.message || err));
    process.exit(1);
  }
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

const wantedPattern =
  /(desen|model|pattern|personel|person|employee|staff|fatura|invoice|xml|irsaliye|dispatch|firma|company|cari|customer|supplier|musteri|tedarik)/i;

const unwantedPattern =
  /(backup|yedek|temp|tmp|log|archive|arsiv|old|eski|test|copy|kopya|history)/i;

console.log("");
console.log("======================================================");
console.log(" KY ERP - D1 GECIS VERITABANI ANALIZI");
console.log("======================================================");
console.log("DB:", DB);
console.log("");

const tables = sqlite(`
  SELECT
    name,
    COALESCE(sql, '') AS schema_sql
  FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name;
`);

console.log("Toplam tablo:", tables.length);
console.log("");

const results = [];

for (let i = 0; i < tables.length; i++) {
  const tableName = tables[i].name;

  process.stdout.write(
    `[${String(i + 1).padStart(3, "0")}/${tables.length}] ${tableName} ... `
  );

  let rowCount = 0;
  let columns = [];
  let error = null;

  try {
    const countResult = sqlite(
      `SELECT COUNT(*) AS adet FROM ${qi(tableName)};`
    );

    rowCount = Number(countResult?.[0]?.adet || 0);

    columns = sqlite(
      `PRAGMA table_info(${qi(tableName)});`
    ).map(col => ({
      name: col.name,
      type: col.type || "",
      notnull: col.notnull || 0,
      pk: col.pk || 0
    }));

    console.log(`${rowCount} kayit`);
  } catch (e) {
    error = String(e);
    console.log("OKUNAMADI");
  }

  const columnText = columns
    .map(c => `${c.name} ${c.type}`)
    .join(" ");

  const wanted =
    wantedPattern.test(tableName) ||
    wantedPattern.test(columnText);

  const unwanted =
    unwantedPattern.test(tableName);

  results.push({
    table: tableName,
    rowCount,
    wanted,
    unwanted,
    classification:
      rowCount === 0
        ? "BOS"
        : unwanted
        ? "INCELE_GEREKSIZ_OLABILIR"
        : wanted
        ? "D1_ADAY"
        : "INCELE",
    columns,
    schema: tables[i].schema_sql,
    error
  });
}

const nonEmpty = results
  .filter(x => x.rowCount > 0)
  .sort((a, b) => b.rowCount - a.rowCount);

const candidates = results
  .filter(x => x.rowCount > 0 && x.wanted && !x.unwanted)
  .sort((a, b) => b.rowCount - a.rowCount);

const suspicious = results
  .filter(x => x.rowCount > 0 && x.unwanted)
  .sort((a, b) => b.rowCount - a.rowCount);

const report = {
  database: DB,
  scannedAt: new Date().toISOString(),
  totalTables: results.length,
  nonEmptyTables: nonEmpty.length,
  candidateTables: candidates.length,
  suspiciousTables: suspicious.length,
  candidates,
  suspicious,
  allTables: results
};

fs.writeFileSync(
  REPORT_JSON,
  JSON.stringify(report, null, 2),
  "utf8"
);

let txt = "";

txt += "KY ERP - D1 GECIS ANALIZI\n";
txt += "=========================\n\n";
txt += `Veritabani: ${DB}\n`;
txt += `Toplam tablo: ${results.length}\n`;
txt += `Dolu tablo: ${nonEmpty.length}\n`;
txt += `D1 aday tablo: ${candidates.length}\n`;
txt += `Supheli/yedek tablo: ${suspicious.length}\n\n`;

txt += "=========================\n";
txt += "D1 ADAY TABLOLAR\n";
txt += "=========================\n";

for (const x of candidates) {
  txt += `${x.table} | ${x.rowCount} kayit\n`;
}

txt += "\n=========================\n";
txt += "YEDEK / LOG / ESKI OLABILECEK TABLOLAR\n";
txt += "=========================\n";

for (const x of suspicious) {
  txt += `${x.table} | ${x.rowCount} kayit\n`;
}

txt += "\n=========================\n";
txt += "TUM DOLU TABLOLAR - EN COK KAYITTAN AZA\n";
txt += "=========================\n";

for (const x of nonEmpty) {
  txt += `${x.table} | ${x.rowCount} kayit | ${x.classification}\n`;
}

fs.writeFileSync(REPORT_TXT, txt, "utf8");

const csvLines = [
  [
    "tablo",
    "kayit_sayisi",
    "sinif",
    "kolonlar"
  ].map(csvEscape).join(";")
];

for (const x of results) {
  csvLines.push(
    [
      x.table,
      x.rowCount,
      x.classification,
      x.columns.map(c => `${c.name}:${c.type}`).join(" | ")
    ].map(csvEscape).join(";")
  );
}

fs.writeFileSync(
  REPORT_CSV,
  "\uFEFF" + csvLines.join("\r\n"),
  "utf8"
);

console.log("");
console.log("======================================================");
console.log(" D1 ADAY TABLOLAR");
console.log("======================================================");

if (candidates.length === 0) {
  console.log("Otomatik aday bulunamadi.");
} else {
  for (const x of candidates) {
    console.log(
      `${x.table.padEnd(50)} ${String(x.rowCount).padStart(10)} kayit`
    );
  }
}

console.log("");
console.log("======================================================");
console.log(" EN BUYUK 30 DOLU TABLO");
console.log("======================================================");

for (const x of nonEmpty.slice(0, 30)) {
  console.log(
    `${x.table.padEnd(50)} ${String(x.rowCount).padStart(10)} | ${x.classification}`
  );
}

console.log("");
console.log("======================================================");
console.log(" RAPORLAR HAZIR");
console.log("======================================================");
console.log(REPORT_TXT);
console.log(REPORT_JSON);
console.log(REPORT_CSV);
console.log("");
console.log("VERI DEGISTIRILMEDI.");
console.log("D1'E HENUZ VERI YUKLENMEDI.");
console.log("");
