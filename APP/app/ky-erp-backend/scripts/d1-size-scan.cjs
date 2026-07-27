const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DB =
  "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";

const MANIFEST =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\KYERP_D1_CLEAN_MANIFEST.json";

const OUT_JSON =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\D1_SIZE_SCAN.json";

const OUT_TXT =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\D1_SIZE_SCAN.txt";

function runSql(sql) {
  const out = execFileSync(
    "sqlite3.exe",
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

if (!fs.existsSync(DB)) {
  console.error("DB BULUNAMADI:", DB);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) {
  console.error("MANIFEST BULUNAMADI:", MANIFEST);
  process.exit(1);
}

const manifest = JSON.parse(
  fs.readFileSync(MANIFEST, "utf8")
);

const tables =
  manifest.exportedTables.map(x => x.table);

const results = [];

console.log("");
console.log("======================================================");
console.log(" KY ERP - D1 BUYUK VERI TARAMASI");
console.log("======================================================");
console.log("");

for (let i = 0; i < tables.length; i++) {
  const table = tables[i];

  console.log(
    `[${String(i + 1).padStart(3, "0")}/${tables.length}] ${table}`
  );

  const cols = runSql(
    `PRAGMA table_info(${qi(table)});`
  );

  const textLikeCols = cols.filter(c => {
    const t = String(c.type || "").toUpperCase();

    return (
      t.includes("TEXT") ||
      t.includes("BLOB") ||
      t.includes("CHAR") ||
      t.includes("CLOB") ||
      t === ""
    );
  });

  const columnStats = [];

  for (const col of textLikeCols) {
    const colName = col.name;

    try {
      const stat = runSql(`
        SELECT
          COUNT(*) AS row_count,
          COUNT(${qi(colName)}) AS non_null_count,
          COALESCE(MAX(LENGTH(${qi(colName)})), 0) AS max_bytes,
          COALESCE(SUM(LENGTH(${qi(colName)})), 0) AS total_bytes,
          SUM(
            CASE
              WHEN LENGTH(${qi(colName)}) >= 1048576
              THEN 1
              ELSE 0
            END
          ) AS rows_over_1mb,
          SUM(
            CASE
              WHEN LENGTH(${qi(colName)}) >= 262144
              THEN 1
              ELSE 0
            END
          ) AS rows_over_256kb
        FROM ${qi(table)};
      `)[0] || {};

      const totalBytes =
        Number(stat.total_bytes || 0);

      const maxBytes =
        Number(stat.max_bytes || 0);

      if (totalBytes > 0) {
        columnStats.push({
          column: colName,
          declaredType: col.type || "",
          totalBytes,
          totalMB:
            Number((totalBytes / 1024 / 1024).toFixed(3)),
          maxBytes,
          maxMB:
            Number((maxBytes / 1024 / 1024).toFixed(3)),
          rowsOver256KB:
            Number(stat.rows_over_256kb || 0),
          rowsOver1MB:
            Number(stat.rows_over_1mb || 0)
        });
      }
    } catch (e) {
      columnStats.push({
        column: colName,
        error: String(e.message || e)
      });
    }
  }

  columnStats.sort(
    (a, b) =>
      Number(b.totalBytes || 0) -
      Number(a.totalBytes || 0)
  );

  const totalTableBytes =
    columnStats.reduce(
      (sum, x) =>
        sum + Number(x.totalBytes || 0),
      0
    );

  results.push({
    table,
    estimatedContentBytes: totalTableBytes,
    estimatedContentMB:
      Number(
        (totalTableBytes / 1024 / 1024).toFixed(3)
      ),
    columns: columnStats
  });
}

results.sort(
  (a, b) =>
    b.estimatedContentBytes -
    a.estimatedContentBytes
);

fs.writeFileSync(
  OUT_JSON,
  JSON.stringify(results, null, 2),
  "utf8"
);

let txt = "";

txt += "KY ERP - D1 BUYUK VERI TARAMASI\n";
txt += "================================\n\n";

for (const table of results) {
  if (table.estimatedContentBytes <= 0) {
    continue;
  }

  txt +=
    `${table.table} | ` +
    `${table.estimatedContentMB} MB\n`;

  for (const col of table.columns) {
    if (!col.totalBytes) continue;

    txt +=
      `  - ${col.column}` +
      ` | toplam ${col.totalMB} MB` +
      ` | en buyuk ${col.maxMB} MB` +
      ` | >256KB ${col.rowsOver256KB}` +
      ` | >1MB ${col.rowsOver1MB}\n`;
  }

  txt += "\n";
}

fs.writeFileSync(
  OUT_TXT,
  txt,
  "utf8"
);

console.log("");
console.log("======================================================");
console.log(" EN COK YER KAPLAYAN 20 TABLO");
console.log("======================================================");
console.log("");

for (const table of results.slice(0, 20)) {
  console.log(
    `${table.table.padEnd(45)} ` +
    `${table.estimatedContentMB.toFixed(3)} MB`
  );

  for (const col of table.columns.slice(0, 5)) {
    if (!col.totalBytes) continue;

    console.log(
      `   ${col.column.padEnd(35)} ` +
      `toplam=${col.totalMB} MB  ` +
      `max=${col.maxMB} MB`
    );
  }
}

console.log("");
console.log("RAPOR:");
console.log(OUT_TXT);
console.log(OUT_JSON);
console.log("");
console.log("VERI DEGISTIRILMEDI.");
console.log("D1'E YUKLEME YAPILMADI.");
console.log("");
