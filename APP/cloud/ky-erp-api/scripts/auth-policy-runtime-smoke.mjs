import { spawn, spawnSync } from "node:child_process";
import { hash } from "bcryptjs";

const PORT = 8789;
const BASE = `http://127.0.0.1:${PORT}`;
const CONFIG = "wrangler.production-local.jsonc";
const DATABASE = "ky-erp-production-local";
const IS_WINDOWS = process.platform === "win32";

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runSql(sql) {
  const command = IS_WINDOWS ? "npx.cmd" : "npx";
  const result = spawnSync(
    command,
    ["wrangler", "d1", "execute", DATABASE, "--local", "--config", CONFIG, "--command", sql, "--json"],
    { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 45_000 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`D1 seed başarısız:\n${result.stdout || ""}\n${result.stderr || ""}`);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    signal: AbortSignal.timeout(12_000),
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function decodePayload(token) {
  const part = String(token || "").split(".")[1] || "";
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
}

function assert(condition, message, detail = undefined) {
  if (!condition) {
    const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
}

async function waitForServer(child) {
  const deadline = Date.now() + 45_000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev erken kapandı: ${child.exitCode}`);
    try {
      const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`Yerel Worker 45 saniyede hazır olmadı: ${lastError}`);
}

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (IS_WINDOWS) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", timeout: 10_000 });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    try { child.kill("SIGTERM"); } catch { /* noop */ }
  }
}

const password = "Smoke-Auth-2026!";
const passwordHash = await hash(password, 10);
const now = new Date().toISOString();

runSql(`
  DELETE FROM auth_sessions WHERE user_id IN ('smoke-password','smoke-owner','smoke-mfa');
  DELETE FROM auth_login_challenges WHERE user_id IN ('smoke-password','smoke-owner','smoke-mfa');
  DELETE FROM auth_login_approvals WHERE user_id IN ('smoke-password','smoke-owner','smoke-mfa');
  DELETE FROM auth_user_security WHERE user_id IN ('smoke-password','smoke-owner','smoke-mfa');
  DELETE FROM auth_users WHERE id IN ('smoke-password','smoke-owner','smoke-mfa');

  INSERT INTO auth_users(id,username,password_hash,full_name,role,is_active,must_change_password,created_at,updated_at)
  VALUES
    ('smoke-password','smoke-password',${sqlQuote(passwordHash)},'Smoke Password','VIEWER',1,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-owner','smoke-owner',${sqlQuote(passwordHash)},'Smoke Owner','ADMIN',1,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-mfa','smoke-mfa',${sqlQuote(passwordHash)},'Smoke MFA','VIEWER',1,0,${sqlQuote(now)},${sqlQuote(now)});

  INSERT INTO auth_user_security(
    user_id,email,main_company_slug,role_override,mfa_enabled,email_verified,approval_required,
    google_mfa_enabled,microsoft_mfa_enabled,recovery_codes_acknowledged,
    login_policy,session_seconds,recovery_phone,recovery_phone_verified,owner_recovery_enabled,
    created_at,updated_at
  ) VALUES
    ('smoke-password','smoke-password@example.test','mecit-hakan',NULL,0,0,0,0,0,0,'PASSWORD_ONLY',86400,NULL,0,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-owner','smoke-owner@example.test','mecit-hakan','SUPER_ADMIN',0,0,0,0,0,0,'PASSWORD_ONLY',86400,NULL,0,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-mfa','smoke-mfa@example.test','mecit-hakan',NULL,0,0,0,0,0,0,'ANY_MFA',28800,NULL,0,0,${sqlQuote(now)},${sqlQuote(now)});
`);

const command = IS_WINDOWS ? "npx.cmd" : "npx";
const child = spawn(
  command,
  ["wrangler", "dev", "--local", "--config", CONFIG, "--ip", "127.0.0.1", "--port", String(PORT)],
  {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: !IS_WINDOWS,
  },
);
let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk.toString(); process.stdout.write(chunk); });
child.stderr.on("data", (chunk) => { logs += chunk.toString(); process.stderr.write(chunk); });

let failed = false;
const hardStop = setTimeout(() => {
  failed = true;
  console.error("Auth runtime smoke 90 saniyelik üst sınıra ulaştı.");
  stopProcessTree(child);
}, 90_000);
hardStop.unref();

try {
  await waitForServer(child);

  const passwordOnly = await request("/api/auth/v2/login", {
    method: "POST",
    body: JSON.stringify({ username: "smoke-password", password, deviceLabel: "Auth Smoke" }),
  });
  assert(passwordOnly.status === 200, "PASSWORD_ONLY login HTTP 200 olmalı", passwordOnly);
  assert(passwordOnly.body?.stage === "AUTHENTICATED", "PASSWORD_ONLY doğrudan AUTHENTICATED olmalı", passwordOnly.body);
  assert(passwordOnly.body?.expiresIn === 1800, "PASSWORD_ONLY sunucuda kesin 1800 saniyeye clamp edilmeli", passwordOnly.body);
  assert(Boolean(passwordOnly.body?.token), "PASSWORD_ONLY token üretmeli", passwordOnly.body);
  const payload = decodePayload(passwordOnly.body.token);
  assert(payload.exp - payload.iat === 1800, "JWT exp-iat tam 1800 saniye olmalı", payload);
  assert(payload.policy === "PASSWORD_ONLY", "JWT policy PASSWORD_ONLY olmalı", payload);

  const me = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${passwordOnly.body.token}` },
  });
  assert(me.status === 200 && me.body?.ok === true, "Yeni policy tokenı legacy /auth/me ile uyumlu olmalı", me);

  const forbiddenPolicies = await request("/api/admin/security/policies", {
    headers: { Authorization: `Bearer ${passwordOnly.body.token}` },
  });
  assert(forbiddenPolicies.status === 403, "Normal kullanıcı owner policy endpointine erişememeli", forbiddenPolicies);

  const owner = await request("/api/auth/v2/login", {
    method: "POST",
    body: JSON.stringify({ username: "smoke-owner", password, deviceLabel: "Owner Smoke" }),
  });
  assert(owner.status === 200, "Owner login ilk aşaması HTTP 200 olmalı", owner);
  assert(owner.body?.stage === "MFA_SETUP", "Owner DB'de PASSWORD_ONLY yazsa bile MFA_SETUP'a zorlanmalı", owner.body);
  assert(owner.body?.provider === "GOOGLE", "Owner ilk modern MFA kurulumu Google olmalı", owner.body);
  assert(!owner.body?.token, "Owner MFA olmadan token alamamalı", owner.body);

  const mfa = await request("/api/auth/v2/login", {
    method: "POST",
    body: JSON.stringify({ username: "smoke-mfa", password, deviceLabel: "MFA Smoke" }),
  });
  assert(mfa.status === 200 && mfa.body?.stage === "MFA_SETUP", "ANY_MFA kaydı yoksa QR kurulumuna gitmeli", mfa);
  assert(/^otpauth:\/\/totp\//.test(String(mfa.body?.otpauthUri || "")), "MFA_SETUP geçerli otpauth URI üretmeli", mfa.body);

  console.log(JSON.stringify({
    ok: true,
    passwordOnlyTtl: passwordOnly.body.expiresIn,
    ownerStage: owner.body.stage,
    mfaStage: mfa.body.stage,
  }, null, 2));
} catch (error) {
  failed = true;
  console.error(error?.stack || error);
  console.error("\n--- wrangler dev logs ---\n", logs.slice(-12_000));
} finally {
  clearTimeout(hardStop);
  stopProcessTree(child);
  await new Promise((resolve) => setTimeout(resolve, 800));
}

if (failed) process.exit(1);
process.exit(0);
