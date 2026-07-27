const { execFileSync } = require("child_process");
const fs = require("fs");

const DB =
  "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";

const MANIFEST =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\KYERP_D1_CLEAN_MANIFEST.json";

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

const manifest =
  JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

const results = [];

console.log("");
console.log("==============================================");
console.log(" TABLO BAZLI DUMP BOYUT KONTROLU");
console.log("==============================================");
console.log("");

for (const item of manifest.exportedTables) {
  const table = item.table;

  const dump = runSqlite([
    DB,
    `.dump "${table.replace(/"/g, '""')}"`
  ]);

  const bytes = Buffer.byteLength(dump, "utf8");

  results.push({
    table,
    rows: item.rowCount,
    bytes,
    mb: bytes / 1024 / 1024
  });
}

results.sort((a, b) => b.bytes - a.bytes);

for (const x of results) {
  console.log(
    `${x.table.padEnd(45)} ` +
    `${x.mb.toFixed(3).padStart(10)} MB ` +
    `| ${x.rows} kayit`
  );
}

const total =
  results.reduce((sum, x) => sum + x.bytes, 0);

console.log("");
console.log(
  "TOPLAM TABLO DUMP BOYUTU:",
  (total / 1024 / 1024).toFixed(2),
  "MB"
);

fs.writeFileSync(
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\D1_DUMP_SIZE_CHECK.json",
  JSON.stringify(results, null, 2),
  "utf8"
);
