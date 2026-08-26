import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const option = (flag, fallback = "") => {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const mode = has("--remote") ? "remote" : "local";
const database = option("--database", mode === "remote" ? "ky-erp-db" : "ky-erp-production-local");
const config = option("--config", mode === "remote" ? "wrangler.jsonc" : "wrangler.production-local.jsonc");
const persistTo = option("--persist-to", "");
const requireMigrations = has("--require-migrations");

const requiredSchema = {
  main_companies: ["id", "slug", "name"],
  companies: ["id", "main_company_slug", "name"],
  model_records: ["id", "main_company_slug", "model_name"],
  model_print_regions: ["id", "main_company_slug", "model_id", "region_name"],
  documents: ["id", "main_company_slug", "document_type", "document_no"],
  invoice_items: ["id", "main_company_slug", "document_id", "quantity"],
  production_records: ["id", "main_company_slug", "model_id", "total_quantity"],
  model_document_links: ["id", "main_company_slug", "model_id", "document_id"],
  model_production_links: ["id", "main_company_slug", "model_id", "production_record_id"],
  machine_shift_defaults: ["id", "main_company_slug", "machine_no"],
  json_store: ["id", "scope", "main_company_slug", "file_name", "data", "created_at", "updated_at"],
  auth_user_security: [
    "user_id", "email", "main_company_slug", "role_override",
    "google_mfa_secret", "google_mfa_enabled", "microsoft_mfa_secret", "microsoft_mfa_enabled",
    "approval_required", "login_policy", "session_seconds", "recovery_phone",
    "recovery_phone_verified", "owner_recovery_enabled",
  ],
  auth_login_challenges: [
    "id", "user_id", "challenge_type", "challenge_token_hash", "expires_at", "consumed_at",
    "policy_snapshot", "session_seconds_snapshot", "google_verified_at", "microsoft_verified_at",
  ],
  auth_sessions: ["id", "user_id", "token_hash", "created_at", "expires_at", "revoked_at"],
  auth_recovery_codes: ["id", "user_id", "code_hash", "created_at", "used_at"],
  auth_owner_recovery_questions: [
    "id", "user_id", "position", "question_text", "answer_hash", "answer_salt", "answer_iterations", "created_at", "updated_at",
  ],
  auth_owner_recovery_challenges: [
    "id", "user_id", "purpose", "channel", "destination_masked", "challenge_token_hash",
    "otp_hash", "otp_salt", "question_ids", "attempt_count", "answer_attempt_count", "send_count",
    "created_at", "expires_at", "locked_until", "verified_at", "consumed_at", "ip_address",
  ],
};

function parseJsonOutput(output) {
  const text = String(output || "").trim();
  if (!text) return [];
  const candidates = [];
  const arrayStart = text.indexOf("[");
  const objectStart = text.indexOf("{");
  if (arrayStart >= 0) candidates.push(text.slice(arrayStart));
  if (objectStart >= 0) candidates.push(text.slice(objectStart));
  candidates.push(text);
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {
      for (const end of [candidate.lastIndexOf("]"), candidate.lastIndexOf("}")]) {
        if (end < 0) continue;
        try { return JSON.parse(candidate.slice(0, end + 1)); } catch { /* next */ }
      }
    }
  }
  throw new Error(`Wrangler JSON çıktısı çözülemedi:\n${text}`);
}

function collectRows(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRows(item, rows);
    return rows;
  }
  if (!value || typeof value !== "object") return rows;
  if (Array.isArray(value.results)) rows.push(...value.results);
  if (Array.isArray(value.rows)) rows.push(...value.rows);
  if (value.result) collectRows(value.result, rows);
  return rows;
}

function sleep(milliseconds) {
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(waitBuffer, 0, 0, milliseconds);
}
function isRetryableRemoteError(text) {
  return /code:\s*7500|internal error|rate.?limit|too many requests|\b429\b|\b5\d\d\b/i.test(text);
}
function execute(sql) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["wrangler", "d1", "execute", database, mode === "remote" ? "--remote" : "--local", "--config", config, "--command", sql, "--json"];
  if (mode === "local" && persistTo) args.push("--persist-to", persistTo);
  const maxAttempts = mode === "remote" ? 5 : 1;
  let lastResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    lastResult = result;
    if (result.status === 0) return collectRows(parseJsonOutput(result.stdout));
    const errorText = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (!(attempt < maxAttempts && mode === "remote" && isRetryableRemoteError(errorText))) break;
    const waitMs = attempt * 1500;
    console.warn(`Cloudflare D1 geçici hata verdi; sorgu ${attempt}/${maxAttempts} sonrasında ${waitMs} ms beklenerek yeniden deneniyor.`);
    sleep(waitMs);
  }
  throw new Error(`D1 sorgusu başarısız (${lastResult?.status ?? "bilinmiyor"}).\n${lastResult?.stdout || ""}\n${lastResult?.stderr || ""}`);
}
function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const tableRows = execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;");
const tableNames = new Set(tableRows.map((row) => String(row.name || "")));
const missingTables = [];
const missingColumns = [];
const tableCounts = {};
for (const [table, columns] of Object.entries(requiredSchema)) {
  if (!tableNames.has(table)) { missingTables.push(table); continue; }
  const info = execute(`PRAGMA table_info(${quoteIdentifier(table)});`);
  const actual = new Set(info.map((row) => String(row.name || "")));
  const absent = columns.filter((column) => !actual.has(column));
  if (absent.length) missingColumns.push({ table, columns: absent });
  const countRows = execute(`SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(table)};`);
  tableCounts[table] = Number(countRows[0]?.row_count || 0);
}

let integrityCheck = "";
let integrityCheckMode = "";
if (mode === "remote") {
  const probeRows = execute("SELECT 1 AS remote_query_ok;");
  integrityCheck = Number(probeRows[0]?.remote_query_ok || 0) === 1 ? "ok" : "";
  integrityCheckMode = "remote-query-probe";
} else {
  const quickRows = execute("PRAGMA quick_check;");
  integrityCheck = String(quickRows[0]?.quick_check || quickRows[0]?.integrity_check || "").toLowerCase();
  integrityCheckMode = "pragma-quick-check";
}

let duplicateJsonStoreKeys = [];
if (tableNames.has("json_store")) {
  duplicateJsonStoreKeys = execute(`
    SELECT scope, COALESCE(main_company_slug, '') AS main_company_slug, file_name, COUNT(*) AS duplicate_count
    FROM json_store
    GROUP BY scope, COALESCE(main_company_slug, ''), file_name
    HAVING COUNT(*) > 1
    ORDER BY duplicate_count DESC
    LIMIT 50;
  `);
}

const migrationTablePresent = tableNames.has("d1_migrations");
const ownerPolicyViolations = tableNames.has("auth_user_security") && tableNames.has("auth_users")
  ? execute(`
      SELECT u.id,u.username,COALESCE(s.login_policy,'') AS login_policy,COALESCE(s.session_seconds,0) AS session_seconds
        FROM auth_users u JOIN auth_user_security s ON s.user_id=u.id
       WHERE UPPER(COALESCE(s.role_override,u.role,'')) IN ('SUPER_ADMIN','ADMIN')
         AND (UPPER(COALESCE(s.login_policy,''))='PASSWORD_ONLY' OR COALESCE(s.session_seconds,28800)>28800)
       LIMIT 20;
    `)
  : [];
const passwordOnlyTtlViolations = tableNames.has("auth_user_security")
  ? execute(`
      SELECT user_id,session_seconds FROM auth_user_security
       WHERE UPPER(COALESCE(login_policy,''))='PASSWORD_ONLY' AND COALESCE(session_seconds,28800)>1800
       LIMIT 20;
    `)
  : [];

const report = {
  ok:
    missingTables.length === 0 &&
    missingColumns.length === 0 &&
    integrityCheck === "ok" &&
    ownerPolicyViolations.length === 0 &&
    passwordOnlyTtlViolations.length === 0 &&
    (!requireMigrations || migrationTablePresent),
  mode,
  database,
  config,
  integrityCheck,
  integrityCheckMode,
  migrationTablePresent,
  tableCount: tableNames.size,
  requiredTableCounts: tableCounts,
  missingTables,
  missingColumns,
  duplicateJsonStoreKeys,
  ownerPolicyViolations,
  passwordOnlyTtlViolations,
};

console.log(JSON.stringify(report, null, 2));
if (duplicateJsonStoreKeys.length) console.warn(`UYARI: json_store içinde ${duplicateJsonStoreKeys.length} mükerrer anahtar grubu bulundu. Kayıtlar silinmedi; ayrıca incelenmelidir.`);
if (!report.ok) process.exit(1);
