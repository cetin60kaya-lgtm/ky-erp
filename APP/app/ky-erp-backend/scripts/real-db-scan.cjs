const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ";
const DATA = path.join(ROOT, "DATA");

const OUT_JSON =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\REAL_DB_SCAN.json";

const OUT_TXT =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\REAL_DB_SCAN.txt";

function sqlite(db, sql) {
  try {
    const out = execFileSync(
      "sqlite3.exe",
      ["-json", db, sql],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 1024,
        windowsHide: true
      }
    ).trim();

    return out ? JSON.parse(out) : [];
  } catch (err) {
    return {
      error: String(err.stderr || err.message || err)
    };
  }
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

const dbFiles = fs.readdirSync(DATA)
  .filter(name =>
    name.toLowerCase().endsWith(".db") &&
    !name.toLowerCase().includes(".bak")
  )
  .map(name => path.join(DATA, name));

const results = [];

console.log("");
console.log("======================================================");
console.log(" KY ERP - GERCEK VERITABANI KARSILASTIRMASI");
console.log("======================================================");
console.log("");

for (const db of dbFiles) {
  const stat = fs.statSync(db);

  console.log("------------------------------------------------------");
  console.log("DB:", path.basename(db));
  console.log(
    "Boyut:",
    (stat.size / 1024 / 1024).toFixed(2),
    "MB"
  );
  console.log(
    "Degisiklik:",
    stat.mtime.toLocaleString("tr-TR")
  );

  const tables = sqlite(db, `
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name;
  `);

  if (!Array.isArray(tables)) {
    console.log("OKUNAMADI");
    continue;
  }

  const nonEmpty = [];

  for (const row of tables) {
    const name = row.name;

    const countResult = sqlite(
      db,
      `SELECT COUNT(*) AS c FROM ${qi(name)};`
    );

    const count =
      Array.isArray(countResult)
        ? Number(countResult?.[0]?.c || 0)
        : 0;

    if (count > 0) {
      nonEmpty.push({
        table: name,
        rows: count
      });
    }
  }

  nonEmpty.sort((a, b) => b.rows - a.rows);

  const important = nonEmpty.filter(x =>
    /(desen|design|model|image|gorsel|personel|person|employee|hr_|fatura|invoice|xml|document|cari|firma|company|production|imalat)/i
      .test(x.table)
  );

  console.log("Toplam tablo:", tables.length);
  console.log("Dolu tablo:", nonEmpty.length);

  console.log("");
  console.log("ONEMLI TABLOLAR:");

  for (const x of important.slice(0, 50)) {
    console.log(
      `  ${x.table.padEnd(45)} ${x.rows} kayit`
    );
  }

  console.log("");
  console.log("EN BUYUK 20 DOLU TABLO:");

  for (const x of nonEmpty.slice(0, 20)) {
    console.log(
      `  ${x.table.padEnd(45)} ${x.rows} kayit`
    );
  }

  results.push({
    file: db,
    fileName: path.basename(db),
    sizeMB: Number(
      (stat.size / 1024 / 1024).toFixed(2)
    ),
    modified: stat.mtime.toISOString(),
    totalTables: tables.length,
    nonEmptyTables: nonEmpty.length,
    importantTables: important,
    allNonEmptyTables: nonEmpty
  });

  console.log("");
}

fs.mkdirSync(
  path.dirname(OUT_JSON),
  { recursive: true }
);

fs.writeFileSync(
  OUT_JSON,
  JSON.stringify(results, null, 2),
  "utf8"
);

let txt = "";

txt += "KY ERP - GERCEK DB KARSILASTIRMASI\n";
txt += "==================================\n\n";

for (const db of results) {
  txt += `${db.fileName}\n`;
  txt += `Boyut: ${db.sizeMB} MB\n`;
  txt += `Degisiklik: ${db.modified}\n`;
  txt += `Toplam tablo: ${db.totalTables}\n`;
  txt += `Dolu tablo: ${db.nonEmptyTables}\n\n`;

  txt += "ONEMLI TABLOLAR\n";

  for (const x of db.importantTables) {
    txt += `  ${x.table} | ${x.rows} kayit\n`;
  }

  txt += "\n-----------------------------\n\n";
}

fs.writeFileSync(
  OUT_TXT,
  txt,
  "utf8"
);

console.log("======================================================");
console.log(" RAPOR HAZIR");
console.log("======================================================");
console.log(OUT_TXT);
console.log(OUT_JSON);
console.log("");
console.log("HICBIR VERI DEGISTIRILMEDI.");
console.log("D1'E HENUZ VERI YUKLENMEDI.");
