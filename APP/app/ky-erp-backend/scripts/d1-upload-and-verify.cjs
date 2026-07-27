const { execFileSync } = require("child_process");
const fs = require("fs");

const BACKEND =
  "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\APP\\app\\ky-erp-backend";

const SQL_FILE =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711\\KYERP_D1_READY.sql";

const DB_NAME = "ky-erp-db";
const NPX_CLI =
  "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js";

function run(command, args) {
  console.log("");
  console.log(">", command, ...args);

  const executable = command === "npx.cmd" ? process.execPath : command;
  const executableArgs = command === "npx.cmd" ? [NPX_CLI, ...args] : args;

  const out = execFileSync(
    executable,
    executableArgs,
    {
      cwd: BACKEND,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 200,
      windowsHide: true
    }
  );

  console.log(out);
  return out;
}

if (!fs.existsSync(SQL_FILE)) {
  console.error("SQL DOSYASI BULUNAMADI:");
  console.error(SQL_FILE);
  process.exit(1);
}

console.log("==============================================");
console.log(" KY ERP - D1 YUKLEME VE OTOMATIK KONTROL");
console.log("==============================================");

try {
  console.log("");
  console.log("1/4 D1'e veri yukleniyor...");

  run("npx.cmd", [
    "wrangler",
    "d1",
    "execute",
    DB_NAME,
    "--remote",
    `--file=${SQL_FILE}`
  ]);

  console.log("");
  console.log("2/4 D1 bilgisi kontrol ediliyor...");

  run("npx.cmd", [
    "wrangler",
    "d1",
    "info",
    DB_NAME
  ]);

  console.log("");
  console.log("3/4 Tablo sayisi kontrol ediliyor...");

  run("npx.cmd", [
    "wrangler",
    "d1",
    "execute",
    DB_NAME,
    "--remote",
    "--command=SELECT COUNT(*) AS tablo_sayisi FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
  ]);

  console.log("");
  console.log("4/4 Kritik kayit sayilari kontrol ediliyor...");

  run("npx.cmd", [
    "wrangler",
    "d1",
    "execute",
    DB_NAME,
    "--remote",
    "--command=SELECT 'personnel' AS tablo, COUNT(*) AS adet FROM personnel UNION ALL SELECT 'invoice\\_items', COUNT(*) FROM invoice_items UNION ALL SELECT 'documents', COUNT(*) FROM documents UNION ALL SELECT 'hr\\_daily\\_attendance', COUNT(*) FROM hr_daily_attendance UNION ALL SELECT 'companies', COUNT(*) FROM companies UNION ALL SELECT 'json\\_store', COUNT(*) FROM json_store;"
  ]);

  console.log("");
  console.log("==============================================");
  console.log(" D1 AKTARIMI VE KONTROL TAMAMLANDI");
  console.log("==============================================");
  console.log("");
  console.log("Beklenen kritik sayilar:");
  console.log("personnel              118");
  console.log("invoice_items          1221");
  console.log("documents               462");
  console.log("hr_daily_attendance     909");
  console.log("companies                56");
  console.log("json_store              122");
  console.log("");

} catch (err) {
  console.error("");
  console.error("==============================================");
  console.error(" ISLEM HATASI");
  console.error("==============================================");
  console.error("");

  if (err.stdout) {
    console.error("STDOUT:");
    console.error(String(err.stdout));
  }

  if (err.stderr) {
    console.error("STDERR:");
    console.error(String(err.stderr));
  }

  console.error(String(err.message || err));
  process.exit(1);
}
