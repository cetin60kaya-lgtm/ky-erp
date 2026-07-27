const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DATABASE = "ky-erp-db";
const DATABASE_ID = "b504b712-6927-499d-815d-0b954c8ee246";
const OUT_DIR = "D:\\KYERP-YEDEK\\D1-GECIS-20260711";
const COMPLETE_SCHEMA = path.join(OUT_DIR, "KYERP_D1_COMPLETE_SCHEMA.sql");
const SAFE_DATA = path.join(OUT_DIR, "KYERP_D1_SAFE_DATA.sql");
const NORMAL_INDEXES = path.join(OUT_DIR, "KYERP_D1_NORMAL_INDEXES.sql");
const RESET_SQL = path.join(OUT_DIR, "KYERP_D1_FINAL_RESET.sql");

const EXPECTED = {
  table_count: 185,
  personnel: 118,
  invoice_items: 1221,
  documents: 462,
  hr_daily_attendance: 909,
  companies: 56,
  json_store: 108
};

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runWrangler(args, stage) {
  const command = `& npx.cmd wrangler ${args.map(psQuote).join(" ")}`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: __dirname + "\\..",
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 1024,
      windowsHide: true
    }
  );
  if (result.error) throw new Error(`${stage}: ${result.error.message}`);
  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || "bilinmeyen Wrangler hatasi").trim();
    throw new Error(`${stage}: ${details}`);
  }
  return String(result.stdout || "").trim();
}

function runJsonCommand(sql, stage) {
  let output;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      output = runWrangler(
        ["d1", "execute", DATABASE, "--remote", "--json", "--command", sql],
        stage
      );
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!/Assertion failed|UV_HANDLE_CLOSING|ECONNRESET|ETIMEDOUT/i.test(error.message) || attempt === 3) throw error;
    }
  }
  if (lastError) throw lastError;
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    throw new Error(`${stage}: Wrangler JSON ciktisi okunamadi: ${output.slice(0, 1000)}`);
  }
  const batches = Array.isArray(payload) ? payload : [payload];
  const failed = batches.find((batch) => batch && batch.success === false);
  if (failed) throw new Error(`${stage}: ${JSON.stringify(failed)}`);
  return batches.flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

function runFile(file, stage) {
  runWrangler(["d1", "execute", DATABASE, "--remote", "--yes", "--file", file], stage);
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function fail(message) {
  console.log("D1 hazır değil");
  console.log(`tek gerçek hata: ${message}`);
  process.exit(1);
}

try {
  for (const file of [COMPLETE_SCHEMA, SAFE_DATA, NORMAL_INDEXES]) {
    if (!fs.existsSync(file)) throw new Error(`Paket dosyasi bulunamadi: ${file}`);
  }

  const schemaText = fs.readFileSync(COMPLETE_SCHEMA, "utf8");
  const parentFirstTables = [...schemaText.matchAll(/^-- TABLE:\s*(.+?)\s*$/gm)]
    .map((match) => match[1].trim());
  if (parentFirstTables.length !== EXPECTED.table_count || new Set(parentFirstTables).size !== EXPECTED.table_count) {
    throw new Error(`COMPLETE_SCHEMA tablo listesi gecersiz: ${parentFirstTables.length}`);
  }

  const remoteTables = runJsonCommand(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;",
    "Remote tablo listesi alinamadi"
  ).map((row) => row.name);
  const known = new Set(parentFirstTables);
  const extraRemoteTables = remoteTables.filter((table) => !known.has(table));
  const dropOrder = [...extraRemoteTables, ...parentFirstTables.slice().reverse()];
  const resetText = [
    "-- KY ERP D1 FINAL RESET",
    `-- Database: ${DATABASE} (${DATABASE_ID})`,
    `-- Created: ${new Date().toISOString()}`,
    "",
    ...dropOrder.map((table) => `DROP TABLE IF EXISTS ${qi(table)};`),
    ""
  ].join("\n");
  fs.writeFileSync(RESET_SQL, resetText, "utf8");

  runFile(RESET_SQL, "Remote D1 reset basarisiz");
  const afterReset = runJsonCommand(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';",
    "Reset sonucu dogrulanamadi"
  );
  if (Number(afterReset[0]?.count) !== 0) {
    throw new Error(`Reset sonrasi ${afterReset[0]?.count ?? "?"} kullanici tablosu kaldi`);
  }

  runFile(COMPLETE_SCHEMA, "COMPLETE_SCHEMA yuklemesi basarisiz");
  runFile(SAFE_DATA, "SAFE_DATA yuklemesi basarisiz");
  runFile(NORMAL_INDEXES, "NORMAL_INDEXES yuklemesi basarisiz");

  const countsSql = `
    SELECT
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%') AS table_count,
      (SELECT COUNT(*) FROM personnel) AS personnel,
      (SELECT COUNT(*) FROM invoice_items) AS invoice_items,
      (SELECT COUNT(*) FROM documents) AS documents,
      (SELECT COUNT(*) FROM hr_daily_attendance) AS hr_daily_attendance,
      (SELECT COUNT(*) FROM companies) AS companies,
      (SELECT COUNT(*) FROM json_store) AS json_store;
  `;
  const counts = runJsonCommand(countsSql, "Remote kritik sayimlar alinamadi")[0];
  if (!counts) throw new Error("Remote kritik sayim sonucu bos");
  const mismatches = Object.entries(EXPECTED)
    .filter(([key, expected]) => Number(counts[key]) !== expected)
    .map(([key, expected]) => `${key}=${counts[key]} (beklenen ${expected})`);

  const foreignKeyRows = runJsonCommand("PRAGMA foreign_key_check;", "Remote foreign_key_check calismadi");
  if (mismatches.length > 0) throw new Error(`Kayit sayisi uyusmazligi: ${mismatches.join(", ")}`);
  if (foreignKeyRows.length > 0) {
    throw new Error(`foreign_key_check ${foreignKeyRows.length} ihlal buldu: ${JSON.stringify(foreignKeyRows.slice(0, 10))}`);
  }

  console.log("D1 hazır");
  console.log(`tablo sayısı: ${counts.table_count}`);
  console.log(`personnel: ${counts.personnel}`);
  console.log(`invoice_items: ${counts.invoice_items}`);
  console.log(`documents: ${counts.documents}`);
  console.log(`hr_daily_attendance: ${counts.hr_daily_attendance}`);
  console.log(`companies: ${counts.companies}`);
  console.log(`json_store: ${counts.json_store}`);
  console.log("foreign key sonucu: 0 ihlal");
} catch (error) {
  fail(error && error.message ? error.message : String(error));
}
