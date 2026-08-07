import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { hashSync } from "bcryptjs";

const PORT = 8799;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TEST_SECRET = "local-integration-only-jwt-secret-more-than-32-bytes";

function runWrangler(args) {
  const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...args], {
    encoding: "utf8", windowsHide: true, env: process.env,
  });
  if (result.status !== 0) throw new Error(`Yerel D1 test hazırlığı başarısız oldu: ${String(result.stderr || "bilinmeyen hata").trim()}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${ORIGIN}${path}`, options);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function authHeaders(token, tenant) {
  return { Authorization: `Bearer ${token}`, ...(tenant ? { "X-KYERP-Tenant-Slug": tenant } : {}) };
}

function expect(name, condition, details = "") {
  if (!condition) throw new Error(`${name} başarısız${details ? `: ${details}` : ""}`);
  console.log(`PASS ${name}`);
}

const timestamp = Date.now();
const passwordHash = hashSync("LocalTest123", 4);
const sql = `
DELETE FROM auth_activity_logs;
DELETE FROM auth_sessions;
DELETE FROM user_company_permissions;
DELETE FROM user_company_memberships;
DELETE FROM auth_mfa_methods;
DELETE FROM auth_users;
DELETE FROM hr_monthly_employees WHERE id='tenant-b-record';
DELETE FROM main_companies WHERE id IN ('company-a','company-b','company-passive');
INSERT INTO main_companies (id,slug,code,name,is_active,created_at,updated_at) VALUES
 ('company-a','tenant-a','A','Tenant A',1,${timestamp},${timestamp}),
 ('company-b','tenant-b','B','Tenant B',1,${timestamp},${timestamp}),
 ('company-passive','tenant-passive','P','Tenant Passive',0,${timestamp},${timestamp});
INSERT INTO auth_users (id,username,password_hash,full_name,role,email,platform_role,is_active,must_change_password,created_at,updated_at) VALUES
 ('admin-test','admin-test','${passwordHash}','Admin Test','ADMIN','admin@example.test','SUPER_ADMIN',1,0,${timestamp},${timestamp}),
 ('hkn-test','hkn-test','${passwordHash}','HKN Test','VIEWER','hkn@example.test','USER',1,0,${timestamp},${timestamp}),
 ('inactive-test','inactive-test','${passwordHash}','Inactive Test','VIEWER',NULL,'USER',0,0,${timestamp},${timestamp}),
 ('passive-company-test','passive-company-test','${passwordHash}','Passive Company Test','VIEWER',NULL,'USER',1,0,${timestamp},${timestamp});
INSERT INTO user_company_memberships (id,user_id,main_company_id,main_company_slug,company_role,is_active,is_default,created_at,updated_at) VALUES
 ('membership-a','hkn-test','company-a','tenant-a','COMPANY_ADMIN',1,1,${timestamp},${timestamp}),
 ('membership-passive','passive-company-test','company-passive','tenant-passive','VIEWER',1,1,${timestamp},${timestamp});
INSERT INTO user_company_permissions (id,membership_id,module_key,can_view,can_create,can_update,can_delete,can_approve,created_at,updated_at) VALUES
 ('permission-a-ik','membership-a','IK',1,1,1,1,1,${timestamp},${timestamp});
INSERT INTO hr_monthly_employees (id,main_company_id,code,full_name,status,created_at,updated_at) VALUES
 ('tenant-b-record','tenant-b','B-1','Tenant B Person','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
`;
runWrangler(["d1", "execute", "ky-erp-db", "--local", "--command", sql]);

const dev = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--port", String(PORT), "--var", `JWT_SECRET:${TEST_SECRET}`, "--show-interactive-dev-session", "false"], {
  cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try { if ((await request("/api/health")).status === 200) { ready = true; break; } } catch { /* retry */ }
  }
  expect("Worker local startup", ready);
  const login = (username, password) => request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  const adminLogin = await login("admin-test", "LocalTest123");
  expect("admin login", adminLogin.status === 200 && adminLogin.body?.user?.platformRole === "SUPER_ADMIN");
  const hknLogin = await login("hkn-test", "LocalTest123");
  expect("company user login", hknLogin.status === 200 && hknLogin.body?.user?.activeCompany?.slug === "tenant-a");
  expect("wrong admin password denied", (await login("admin-test", "Wrong123")).status === 401);
  expect("legacy admin password denied", (await login("admin-test", "2582")).status === 401);
  expect("inactive user denied", (await login("inactive-test", "LocalTest123")).status === 401);
  expect("inactive company denied", (await login("passive-company-test", "LocalTest123")).status === 403);

  const adminToken = adminLogin.body.token;
  const hknToken = hknLogin.body.token;
  const companies = await request("/api/admin/companies", { headers: authHeaders(adminToken) });
  expect("admin lists companies", companies.status === 200 && companies.body?.items?.length === 3);
  const adminSwitch = await request("/api/auth/switch-company", { method: "POST", headers: { ...authHeaders(adminToken), "Content-Type": "application/json" }, body: JSON.stringify({ companyId: "company-a" }) });
  expect("admin enters company", adminSwitch.status === 200 && adminSwitch.body?.user?.activeCompany?.slug === "tenant-a");
  expect("normal user admin endpoint denied", (await request("/api/admin/companies", { headers: authHeaders(hknToken) })).status === 403);
  expect("company admin manages only active tenant users", (await request("/api/tenant-admin/users", { headers: authHeaders(hknToken) })).body?.items?.every((item) => item.mainCompanySlug === "tenant-a"));
  expect("forged tenant header denied", (await request("/api/ik/monthly-employees", { headers: authHeaders(hknToken, "tenant-b") })).status === 403);
  const crossRecord = await request("/api/ik/monthly-employees/tenant-b-record", { headers: authHeaders(hknToken, "tenant-a") });
  expect("cross-tenant record id denied", crossRecord.status === 404);
  const me = await request("/api/auth/me", { headers: authHeaders(hknToken) });
  expect("company user sees only own tenant", me.status === 200 && me.body?.memberships?.length === 1 && me.body.memberships[0]?.company?.slug === "tenant-a");
} finally {
  dev.kill();
}
