import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const remote = args.has("--remote");

if (apply && !remote) {
  console.error("Yazma yalnız --apply --remote birlikte verilerek yapılabilir.");
  process.exit(2);
}

if (apply && !process.env.CLOUDFLARE_API_TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN ortam değişkeni olmadan canlı D1 yazımı yapılmaz.");
  process.exit(2);
}

const executable = process.execPath;
const wranglerBin = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const base = [wranglerBin, "d1"];

function run(extra) {
  const result = spawnSync(executable, [...base, ...extra], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

function captureJson(extra) {
  const result = spawnSync(executable, [...base, ...extra, "--json"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout || "[]");
}

if (apply) {
  run(["migrations", "apply", "ky-erp-db", "--remote", "--config", "wrangler.jsonc"]);
  const pragma = captureJson(["execute", "ky-erp-db", "--remote", "--config", "wrangler.jsonc", "--command", "PRAGMA table_info(ik_person_card_settings);"]);
  const rows = pragma.flatMap((item) => item?.results || item?.result?.[0]?.results || []);
  const existing = new Set(rows.map((row) => row.name));
  const requiredCardColumns = {
    personel_kodu: "TEXT NOT NULL DEFAULT ''",
    exit_date: "TEXT",
    active_passive: "TEXT NOT NULL DEFAULT 'AKTIF'",
    work_type: "TEXT NOT NULL DEFAULT 'AYLIK'",
    sgk_follow: "INTEGER NOT NULL DEFAULT 1",
    payment_type: "TEXT NOT NULL DEFAULT 'BANKA_ELDEN'",
    note: "TEXT NOT NULL DEFAULT ''",
    phone: "TEXT NOT NULL DEFAULT ''",
  };
  for (const [column, definition] of Object.entries(requiredCardColumns)) {
    if (!existing.has(column)) {
      run(["execute", "ky-erp-db", "--remote", "--config", "wrangler.jsonc", "--command", `ALTER TABLE ik_person_card_settings ADD COLUMN ${column} ${definition};`]);
    }
  }
}

const countSql = [
  "SELECT 'monthly-employees' AS endpoint, COUNT(*) AS count FROM hr_monthly_employees WHERE main_company_id='mecit-hakan'",
  "UNION ALL SELECT 'daily-employees', COUNT(*) FROM hr_daily_employees WHERE main_company_id='mecit-hakan'",
  "UNION ALL SELECT 'daily-attendance', COUNT(*) FROM hr_daily_attendance a JOIN hr_daily_employees e ON e.id=a.employee_id WHERE e.main_company_id='mecit-hakan'",
  "UNION ALL SELECT 'payrolls', COUNT(*) FROM hr_payrolls_v2 WHERE main_company_id='mecit-hakan';",
].join(" ");

run(["execute", "ky-erp-db", "--remote", "--config", "wrangler.jsonc", "--command", countSql]);
