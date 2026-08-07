import process from "node:process";
import { hash } from "bcryptjs";

const ACCOUNT_ID = "ab49b099fee10183fa65951e5077d14a";
const DATABASE_ID = "b504b712-6927-499d-815d-0b954c8ee246";
const API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
const HKN_USER_ID = "auth-hkn";
const HKN_MEMBERSHIP_ID = "membership-hkn-mecit-hakan";
const LIVE_API = "https://api.kyerp.net/api";
const MODULES = [
  "DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME",
  "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET", "ASISTAN", "RAPORLAR",
];

function fail(message) {
  throw new Error(message);
}

async function readInput() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const value = JSON.parse(raw || "{}");
  const adminPassword = String(value.adminPassword || "");
  const hknPassword = String(value.hknPassword || "");
  if (adminPassword.length < 6 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(adminPassword) || !/\d/.test(adminPassword)) fail("Admin şifre kuralı sağlanmadı.");
  if (!/^\d{6}$/.test(hknPassword)) fail("HKN şifre kuralı sağlanmadı.");
  return { adminPassword, hknPassword };
}

async function query(sql, params = []) {
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!token) fail("CLOUDFLARE_API_TOKEN ortam değişkeni bulunamadı.");
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success || result?.errors?.length) {
    fail(`D1 işlemi başarısız oldu (HTTP ${response.status}).`);
  }
  return result.result?.[0];
}

async function api(path, { method = "GET", body, token, tenant } = {}) {
  const response = await fetch(`${LIVE_API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { "X-KYERP-Tenant-Slug": tenant } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function assertResult(condition, message) {
  if (!condition) fail(message);
}

async function main() {
  const credentials = await readInput();
  const [adminHash, hknHash] = await Promise.all([
    hash(credentials.adminPassword, 12),
    hash(credentials.hknPassword, 12),
  ]);
  const timestamp = Date.now();

  const company = await query("SELECT id, slug FROM main_companies WHERE lower(slug)=lower(?) AND is_active=1 LIMIT 1", ["mecit-hakan"]);
  const companyRow = company?.results?.[0];
  if (!companyRow?.id || companyRow.slug !== "mecit-hakan") fail("Canonical Hakan Emprime tenant bulunamadı.");
  await query(
    "UPDATE main_companies SET code=COALESCE(NULLIF(code,''),'HKN'), legal_name=COALESCE(NULLIF(legal_name,''),name), name='Hakan Emprime', updated_at=? WHERE id=? AND slug='mecit-hakan'",
    [timestamp, companyRow.id],
  );

  const adminUpdate = await query(
    `UPDATE auth_users SET password_hash=?, full_name=?, email=?, backup_email=?, platform_role='SUPER_ADMIN', role='ADMIN', is_active=1, must_change_password=0, updated_at=? WHERE lower(username)='admin'`,
    [adminHash, "Sistem Yöneticisi", "cetin60kaya@gmail.com", "cetnkaya@outlook.com.tr", timestamp],
  );
  if (Number(adminUpdate?.meta?.changes || 0) !== 1) fail("Admin hesabı tekil olarak güncellenemedi.");

  await query(
    `INSERT INTO auth_users (id,username,password_hash,full_name,role,email,backup_email,platform_role,is_active,must_change_password,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,1,0,?,?)
     ON CONFLICT(id) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash,full_name=excluded.full_name,email=excluded.email,platform_role='USER',role='VIEWER',is_active=1,must_change_password=0,updated_at=excluded.updated_at`,
    [HKN_USER_ID, "hkn", hknHash, "Hakan Emprime", "VIEWER", "hkngursu@hotmail.com", null, "USER", timestamp, timestamp],
  );
  await query(
    `INSERT INTO user_company_memberships (id,user_id,main_company_id,main_company_slug,company_role,is_active,is_default,created_at,updated_at)
     VALUES (?,?,?,?, 'COMPANY_ADMIN',1,1,?,?)
     ON CONFLICT(user_id,main_company_id) DO UPDATE SET main_company_slug=excluded.main_company_slug,company_role='COMPANY_ADMIN',is_active=1,is_default=1,updated_at=excluded.updated_at`,
    [HKN_MEMBERSHIP_ID, HKN_USER_ID, companyRow.id, companyRow.slug, timestamp, timestamp],
  );
  for (const moduleKey of MODULES) {
    await query(
      `INSERT INTO user_company_permissions (id,membership_id,module_key,can_view,can_create,can_update,can_delete,can_approve,created_at,updated_at)
       VALUES (?,?,?,1,1,1,1,1,?,?)
       ON CONFLICT(membership_id,module_key) DO UPDATE SET can_view=1,can_create=1,can_update=1,can_delete=1,can_approve=1,updated_at=excluded.updated_at`,
      [`permission-hkn-${moduleKey.toLowerCase()}`, HKN_MEMBERSHIP_ID, moduleKey, timestamp, timestamp],
    );
  }
  await query("UPDATE auth_sessions SET revoked_at=? WHERE user_id IN ((SELECT id FROM auth_users WHERE lower(username)='admin'), ?) AND revoked_at IS NULL", [timestamp, HKN_USER_ID]);

  const adminLogin = await api("/auth/login", { method: "POST", body: { username: "admin", password: credentials.adminPassword } });
  const hknLogin = await api("/auth/login", { method: "POST", body: { username: "hkn", password: credentials.hknPassword } });
  const wrongAdmin = await api("/auth/login", { method: "POST", body: { username: "admin", password: "definitely-wrong-9001" } });
  const legacyAdmin = await api("/auth/login", { method: "POST", body: { username: "admin", password: "2582" } });
  credentials.adminPassword = "";
  credentials.hknPassword = "";
  assertResult(adminLogin.status === 200 && adminLogin.body?.user?.platformRole === "SUPER_ADMIN", "Canlı admin login testi başarısız oldu.");
  assertResult(hknLogin.status === 200 && hknLogin.body?.user?.activeCompany?.slug === "mecit-hakan", "Canlı HKN login testi başarısız oldu.");
  assertResult(wrongAdmin.status === 401 && legacyAdmin.status === 401, "Geçersiz veya eski admin şifresi reddedilmedi.");

  const adminToken = adminLogin.body.token;
  const hknToken = hknLogin.body.token;
  const adminCompanies = await api("/admin/companies", { token: adminToken });
  const adminSwitch = await api("/auth/switch-company", { method: "POST", body: { companyId: companyRow.id }, token: adminToken });
  const hknAdmin = await api("/admin/companies", { token: hknToken });
  const forgedTenant = await api("/ik/monthly-employees", { token: hknToken, tenant: "tenant-not-authorized" });
  assertResult(adminCompanies.status === 200 && adminCompanies.body?.items?.some((item) => item.slug === "mecit-hakan"), "Admin firma listesi testi başarısız oldu.");
  assertResult(adminSwitch.status === 200 && adminSwitch.body?.user?.activeCompany?.slug === "mecit-hakan", "Admin firma bağlamı testi başarısız oldu.");
  assertResult(hknAdmin.status === 403 && forgedTenant.status === 403, "Canlı tenant/admin izolasyon testi başarısız oldu.");

  const endpoints = [
    ["monthlyEmployees", "/ik/monthly-employees", 18],
    ["dailyEmployees", "/ik/daily-employees", 155],
    ["dailyAttendance", "/ik/daily-attendance", 1360],
    ["payrolls", "/ik/payroll", 37],
  ];
  const counts = {};
  for (const [name, path, expected] of endpoints) {
    const response = await api(path, { token: hknToken, tenant: "mecit-hakan" });
    const dataCount = Array.isArray(response.body?.data) ? response.body.data.length : -1;
    const itemsCount = Array.isArray(response.body?.items) ? response.body.items.length : -1;
    assertResult(response.status === 200 && response.body?.ok === true && response.body?.success === true && dataCount === expected && itemsCount === expected, `${path} canlı doğrulaması başarısız oldu.`);
    counts[name] = dataCount;
  }
  console.log(JSON.stringify({ provisioned: true, adminLogin: true, hknLogin: true, invalidLoginDenied: true, legacyPasswordDenied: true, tenantIsolation: true, adminCompanySwitch: true, counts }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Hesap hazırlama işlemi başarısız oldu.");
  process.exitCode = 1;
});
