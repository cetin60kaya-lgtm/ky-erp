import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { hash } from "bcryptjs";

const PORT = 8789;
const BASE = `http://127.0.0.1:${PORT}`;
const CONFIG = "wrangler.production-local.jsonc";
const DATABASE = "ky-erp-production-local";
const IS_WINDOWS = process.platform === "win32";
const TEST_USERS = ["smoke-password", "smoke-owner", "smoke-mfa", "smoke-both", "smoke-cross"];
const GOOGLE_SECRET = "JBSWY3DPEHPK3PXP";
const MICROSOFT_SECRET = "KRSXG5DSNFXGOIDB";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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

function base32Decode(input) {
  const clean = String(input || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totp(secret, timestampMs = Date.now()) {
  let counter = BigInt(Math.floor(timestampMs / 1000 / 30));
  const counterBytes = Buffer.alloc(8);
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = Number(counter & 255n);
    counter >>= 8n;
  }
  const signature = createHmac("sha1", base32Decode(secret)).update(counterBytes).digest();
  const offset = signature[signature.length - 1] & 15;
  const binary = ((signature[offset] & 127) << 24)
    | ((signature[offset + 1] & 255) << 16)
    | ((signature[offset + 2] & 255) << 8)
    | (signature[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
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
const quotedIds = TEST_USERS.map(sqlQuote).join(",");

runSql(`
  DELETE FROM auth_sessions WHERE user_id IN (${quotedIds});
  DELETE FROM auth_login_challenges WHERE user_id IN (${quotedIds});
  DELETE FROM auth_login_approvals WHERE user_id IN (${quotedIds});
  DELETE FROM auth_recovery_codes WHERE user_id IN (${quotedIds});
  DELETE FROM auth_owner_recovery_questions WHERE user_id IN (${quotedIds});
  DELETE FROM auth_owner_recovery_challenges WHERE user_id IN (${quotedIds});
  DELETE FROM auth_user_security WHERE user_id IN (${quotedIds});
  DELETE FROM auth_users WHERE id IN (${quotedIds});

  INSERT INTO auth_users(id,username,password_hash,full_name,role,is_active,must_change_password,created_at,updated_at)
  VALUES
    ('smoke-password','smoke-password',${sqlQuote(passwordHash)},'Smoke Password','VIEWER',1,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-owner','smoke-owner',${sqlQuote(passwordHash)},'Smoke Owner','ADMIN',1,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-mfa','smoke-mfa',${sqlQuote(passwordHash)},'Smoke MFA','VIEWER',1,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-both','smoke-both',${sqlQuote(passwordHash)},'Smoke Both','VIEWER',1,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-cross','smoke-cross',${sqlQuote(passwordHash)},'Smoke Cross','VIEWER',1,0,${sqlQuote(now)},${sqlQuote(now)});

  INSERT INTO auth_user_security(
    user_id,email,main_company_slug,role_override,mfa_enabled,email_verified,approval_required,
    google_mfa_secret,google_mfa_enabled,microsoft_mfa_secret,microsoft_mfa_enabled,recovery_codes_acknowledged,
    login_policy,session_seconds,recovery_phone,recovery_phone_verified,owner_recovery_enabled,
    created_at,updated_at
  ) VALUES
    ('smoke-password','smoke-password@example.test','mecit-hakan',NULL,0,0,0,NULL,0,NULL,0,0,'PASSWORD_ONLY',86400,NULL,0,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-owner','smoke-owner@example.test','mecit-hakan','SUPER_ADMIN',0,0,0,NULL,0,NULL,0,0,'PASSWORD_ONLY',86400,NULL,0,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-mfa','smoke-mfa@example.test','mecit-hakan',NULL,0,0,0,NULL,0,NULL,0,0,'ANY_MFA',28800,NULL,0,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-both','smoke-both@example.test','mecit-hakan',NULL,0,0,0,${sqlQuote(GOOGLE_SECRET)},1,${sqlQuote(MICROSOFT_SECRET)},1,0,'BOTH_MFA',7200,NULL,0,0,${sqlQuote(now)},${sqlQuote(now)}),
    ('smoke-cross','smoke-cross@example.test','mecit-hakan',NULL,0,0,0,${sqlQuote(GOOGLE_SECRET)},1,${sqlQuote(MICROSOFT_SECRET)},1,0,'ANY_MFA',14400,NULL,0,0,${sqlQuote(now)},${sqlQuote(now)});
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
  console.error("Auth runtime smoke 120 saniyelik üst sınıra ulaştı.");
  stopProcessTree(child);
}, 120_000);
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
  const passwordPayload = decodePayload(passwordOnly.body.token);
  assert(passwordPayload.exp - passwordPayload.iat === 1800, "PASSWORD_ONLY JWT exp-iat tam 1800 saniye olmalı", passwordPayload);
  assert(passwordPayload.policy === "PASSWORD_ONLY", "JWT policy PASSWORD_ONLY olmalı", passwordPayload);

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

  const mfaSetup = await request("/api/auth/v2/login", {
    method: "POST",
    body: JSON.stringify({ username: "smoke-mfa", password, deviceLabel: "MFA Smoke" }),
  });
  assert(mfaSetup.status === 200 && mfaSetup.body?.stage === "MFA_SETUP", "ANY_MFA kaydı yoksa QR kurulumuna gitmeli", mfaSetup);
  assert(/^otpauth:\/\/totp\//.test(String(mfaSetup.body?.otpauthUri || "")), "MFA_SETUP geçerli otpauth URI üretmeli", mfaSetup.body);
  assert(Boolean(mfaSetup.body?.secret), "MFA_SETUP yalnız kurulum aşamasında secret döndürmeli", mfaSetup.body);

  const mfaSetupVerify = await request("/api/auth/v2/mfa/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: mfaSetup.body.challengeId,
      challengeToken: mfaSetup.body.challengeToken,
      provider: "GOOGLE",
      code: totp(mfaSetup.body.secret),
    }),
  });
  assert(mfaSetupVerify.status === 200 && mfaSetupVerify.body?.stage === "AUTHENTICATED", "Yeni Google kurulumu gerçek TOTP ile doğrulanıp oturum açmalı", mfaSetupVerify);
  assert(mfaSetupVerify.body?.expiresIn === 28800, "ANY_MFA seçili 8 saat TTL uygulamalı", mfaSetupVerify.body);

  const bothLogin = await request("/api/auth/v2/login", {
    method: "POST",
    body: JSON.stringify({ username: "smoke-both", password, deviceLabel: "Both Smoke" }),
  });
  assert(bothLogin.status === 200 && bothLogin.body?.stage === "MFA_REQUIRED", "BOTH_MFA iki kod istemeli", bothLogin);
  assert(bothLogin.body?.requireBoth === true, "BOTH_MFA requireBoth=true dönmeli", bothLogin.body);

  const bothGoogle = await request("/api/auth/v2/mfa/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: bothLogin.body.challengeId,
      challengeToken: bothLogin.body.challengeToken,
      provider: "GOOGLE",
      code: totp(GOOGLE_SECRET),
    }),
  });
  assert(bothGoogle.status === 200 && bothGoogle.body?.stage === "MFA_REQUIRED", "İlk BOTH_MFA kodu sonrası oturum açılmamalı", bothGoogle);
  assert(Array.isArray(bothGoogle.body?.verifiedProviders) && bothGoogle.body.verifiedProviders.includes("GOOGLE"), "Google doğrulaması challenge üzerinde tutulmalı", bothGoogle.body);
  assert(!bothGoogle.body?.token, "Tek BOTH_MFA koduyla token verilmemeli", bothGoogle.body);

  const bothMicrosoft = await request("/api/auth/v2/mfa/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: bothLogin.body.challengeId,
      challengeToken: bothLogin.body.challengeToken,
      provider: "MICROSOFT",
      code: totp(MICROSOFT_SECRET),
    }),
  });
  assert(bothMicrosoft.status === 200 && bothMicrosoft.body?.stage === "AUTHENTICATED", "İki BOTH_MFA kodu sonrası oturum açılmalı", bothMicrosoft);
  assert(bothMicrosoft.body?.expiresIn === 7200, "BOTH_MFA kullanıcıya seçilen 2 saat TTL uygulanmalı", bothMicrosoft.body);
  const bothPayload = decodePayload(bothMicrosoft.body.token);
  assert(bothPayload.exp - bothPayload.iat === 7200, "BOTH_MFA JWT TTL 7200 saniye olmalı", bothPayload);

  const crossLogin = await request("/api/auth/v2/login", {
    method: "POST",
    body: JSON.stringify({ username: "smoke-cross", password, deviceLabel: "Cross Smoke" }),
  });
  assert(crossLogin.status === 200 && crossLogin.body?.stage === "MFA_REQUIRED", "Çapraz kurtarma hesabı MFA_REQUIRED olmalı", crossLogin);

  const crossReset = await request("/api/auth/v2/mfa/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: crossLogin.body.challengeId,
      challengeToken: crossLogin.body.challengeToken,
      provider: "MICROSOFT",
      resetProvider: "GOOGLE",
      code: totp(MICROSOFT_SECRET),
    }),
  });
  assert(crossReset.status === 200 && crossReset.body?.stage === "MFA_SETUP", "Microsoft doğrulanınca bozuk Google yeniden kurulumuna geçmeli", crossReset);
  assert(crossReset.body?.provider === "GOOGLE", "Çapraz kurtarmada resetProvider Google olmalı", crossReset.body);
  assert(Boolean(crossReset.body?.secret), "Çapraz kurtarma yeni Google secret üretmeli", crossReset.body);

  const crossSetupVerify = await request("/api/auth/v2/mfa/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: crossReset.body.challengeId,
      challengeToken: crossReset.body.challengeToken,
      provider: "GOOGLE",
      code: totp(crossReset.body.secret),
    }),
  });
  assert(crossSetupVerify.status === 200 && crossSetupVerify.body?.stage === "AUTHENTICATED", "Yeni Google secret gerçek TOTP ile doğrulanınca oturum açılmalı", crossSetupVerify);
  assert(crossSetupVerify.body?.expiresIn === 14400, "Çapraz kurtarma sonrası seçili 4 saat TTL korunmalı", crossSetupVerify.body);

  console.log(JSON.stringify({
    ok: true,
    passwordOnlyTtl: passwordOnly.body.expiresIn,
    ownerStage: owner.body.stage,
    enrollmentStage: mfaSetupVerify.body.stage,
    bothMfaTtl: bothMicrosoft.body.expiresIn,
    crossProviderReset: `${crossReset.body.provider}->${crossSetupVerify.body.stage}`,
  }, null, 2));
} catch (error) {
  failed = true;
  console.error(error?.stack || error);
  console.error("\n--- wrangler dev logs ---\n", logs.slice(-16_000));
} finally {
  clearTimeout(hardStop);
  stopProcessTree(child);
  await new Promise((resolve) => setTimeout(resolve, 800));
}

if (failed) process.exit(1);
process.exit(0);
