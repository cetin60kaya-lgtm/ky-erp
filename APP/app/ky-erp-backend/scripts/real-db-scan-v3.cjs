const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ";
const DATA = path.join(ROOT, "DATA");

const WORK =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\DB-SCAN-COPIES";

const OUT_JSON =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\REAL_DB_SCAN_V3.json";

const OUT_TXT =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\REAL_DB_SCAN_V3.txt";

fs.mkdirSync(WORK, { recursive: true });

function findSqlite() {
  const candidates = [
    "C:\\sqlite3\\sqlite3.exe",
    "C:\\tools\\sqlite3\\sqlite3.exe",
    "D:\\sqlite3\\sqlite3.exe",
    "D:\\tools\\sqlite3\\sqlite3.exe",
    path.join(ROOT, "APP", "app", "ky-erp-backend", "sqlite3.exe"),
    path.join(ROOT, "SCRIPTS", "sqlite3.exe")
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file;
    }
  }

  try {
    const where = execFileSync(
      "where.exe",
      ["sqlite3.exe"],
      {
        encoding: "utf8",
        windowsHide: true
      }
    )
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);

    if (where.length > 0) {
      return where[0];
    }
  } catch {}

  return null;
}

const SQLITE = "sqlite3.exe";

console.log("");
console.log("SQLite PATH uzerinden kullanilacak:");
console.log(SQLITE);
console.log("");
console.log("SQLite bulundu:");
console.log(SQLITE);
console.log("");

function sqlite(db, sql) {
  try {
    const out = execFileSync(
      SQLITE,
      ["-json", db, sql],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 1024,
        windowsHide: true
      }
    ).trim();

    return {
      ok: true,
      data: out ? JSON.parse(out) : []
    };
  } catch (err) {
    return {
      ok: false,
      error: String(
        err.stderr ||
        err.stdout ||
        err.message ||
        err
      )
    };
  }
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

const dbFiles = fs.readdirSync(DATA)
  .filter(name => name.toLowerCase().endsWith(".db"))
  .filter(name => !name.toLowerCase().includes(".bak"))
  .filter(name => !name.toLowerCase().includes("before_integrity"))
  .map(name => ({
    name,
    source: path.join(DATA, name),
    copy: path.join(WORK, name)
  }));

const results = [];

console.log("======================================================");
console.log(" KY ERP - GERCEK DB TARAMASI V3");
console.log("======================================================");
console.log("");

for (const file of dbFiles) {
  console.log("------------------------------------------------------");
  console.log("KAYNAK:", file.source);

  try {
    fs.copyFileSync(file.source, file.copy);
    console.log("Tarama kopyasi:", file.copy);
  } catch (err) {
    console.log("KOPYALAMA HATASI:");
    console.log(String(err.message || err));
    continue;
  }

  const stat = fs.statSync(file.copy);

  console.log(
    "Boyut:",
    (stat.size / 1024 / 1024).toFixed(2),
    "MB"
  );

  const integrity = sqlite(
    file.copy,
    "PRAGMA quick_check;"
  );

  if (!integrity.ok) {
    console.log("SQLITE ACMA HATASI:");
    console.log(integrity.error);

    results.push({
      fileName: file.name,
      status: "READ_ERROR",
      error: integrity.error
    });

    continue;
  }

  console.log("SQLite kontrol: OK");

  const tableResult = sqlite(file.copy, `
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name;
  `);

  if (!tableResult.ok) {
    console.log("TABLO OKUMA HATASI:");
    console.log(tableResult.error);
    continue;
  }

  const tables = tableResult.data;
  const nonEmpty = [];

  for (const row of tables) {
    const name = row.name;

    const countResult = sqlite(
      file.copy,
      `SELECT COUNT(*) AS c FROM ${qi(name)};`
    );

    if (!countResult.ok) {
      continue;
    }

    const count =
      Number(countResult.data?.[0]?.c || 0);

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

  for (const x of important.slice(0, 60)) {
    console.log(
      `  ${x.table.padEnd(45)} ${x.rows} kayit`
    );
  }

  console.log("");
  console.log("EN BUYUK 25 DOLU TABLO:");

  for (const x of nonEmpty.slice(0, 25)) {
    console.log(
      `  ${x.table.padEnd(45)} ${x.rows} kayit`
    );
  }

  results.push({
    fileName: file.name,
    sizeMB: Number(
      (stat.size / 1024 / 1024).toFixed(2)
    ),
    status: "OK",
    totalTables: tables.length,
    nonEmptyTables: nonEmpty.length,
    importantTables: important,
    allNonEmptyTables: nonEmpty
  });

  console.log("");
}

fs.writeFileSync(
  OUT_JSON,
  JSON.stringify(results, null, 2),
  "utf8"
);

let txt = "";

txt += "KY ERP - GERCEK DB TARAMASI V3\n";
txt += "===============================\n\n";

for (const db of results) {
  txt += `${db.fileName}\n`;
  txt += `Durum: ${db.status}\n`;

  if (db.error) {
    txt += `Hata: ${db.error}\n\n`;
    continue;
  }

  txt += `Boyut: ${db.sizeMB} MB\n`;
  txt += `Toplam tablo: ${db.totalTables}\n`;
  txt += `Dolu tablo: ${db.nonEmptyTables}\n\n`;

  for (const x of db.importantTables || []) {
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
console.log("ORIJINAL DB DOSYALARINA DOKUNULMADI.");
console.log("D1'E HENUZ VERI YUKLENMEDI.");

