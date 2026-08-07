import { compare, hash } from "bcryptjs";
import type { Context, Hono, MiddlewareHandler } from "hono";

export const TENANT_HEADER = "X-KYERP-Tenant-Slug";
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;
const SUPER_ADMIN = "SUPER_ADMIN";
const USER = "USER";

const MODULE_KEYS = [
  "DASHBOARD",
  "MUHASEBE",
  "FIRMA_CARI",
  "BELGE_ISLEM",
  "KDV",
  "CEK_ODEME",
  "DESEN",
  "IMALAT",
  "BOYAHANE",
  "IK",
  "ISNET",
  "ASISTAN",
  "RAPORLAR",
] as const;

type SecretBindings = { JWT_SECRET: string };
type Permission = {
  moduleKey: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canApprove: boolean;
};
type Membership = {
  id: string;
  companyRole: string;
  isDefault: boolean;
  company: {
    id: string;
    slug: string;
    code: string;
    name: string;
    legalName: string;
    isActive: boolean;
  };
  permissions: Permission[];
};
export type AuthContext = {
  sessionId: string;
  userId: string;
  username: string;
  fullName: string;
  email: string;
  backupEmail: string;
  platformRole: string;
  mustChangePassword: boolean;
  activeCompanyId: string | null;
  activeCompanySlug: string | null;
  activeCompanyName: string | null;
  activeCompanyCode: string | null;
  activeCompanyLegalName: string | null;
  membershipId: string | null;
  companyRole: string | null;
  permissions: Permission[];
};
export type TenantAuthEnv = {
  Bindings: Cloudflare.Env & SecretBindings;
  Variables: { requestId: string; auth: AuthContext };
};
type Row = Record<string, unknown>;
type JwtPayload = {
  sub: string;
  sid: string;
  username: string;
  platformRole: string;
  activeCompanyId: string | null;
  activeCompanySlug: string | null;
  membershipId: string | null;
  iat: number;
  exp: number;
};

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function nowMs(): number {
  return Date.now();
}

function responseError(c: Context<TenantAuthEnv>, status: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status);
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function jwtKey(secret: string): Promise<CryptoKey> {
  if (new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("JWT_SECRET is missing or shorter than 32 bytes");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signTenantToken(secret: string, payload: JwtPayload): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const signature = await crypto.subtle.sign("HMAC", await jwtKey(secret), new TextEncoder().encode(input));
  return `${input}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyTenantToken(secret: string, token: string): Promise<JwtPayload | null> {
  const parts = text(token).split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as Row;
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    const verified = await crypto.subtle.verify(
      "HMAC",
      await jwtKey(secret),
      base64UrlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!verified) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as JwtPayload;
    const current = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.sid || !Number.isFinite(payload.exp) || payload.exp <= current) return null;
    return payload;
  } catch {
    return null;
  }
}

function permissionFromRow(row: Row): Permission {
  return {
    moduleKey: text(row.module_key).toUpperCase(),
    canView: flag(row.can_view),
    canCreate: flag(row.can_create),
    canUpdate: flag(row.can_update),
    canDelete: flag(row.can_delete),
    canApprove: flag(row.can_approve),
  };
}

async function permissionsForMembership(db: D1Database, membershipId: string | null): Promise<Permission[]> {
  if (!membershipId) return [];
  const result = await db.prepare(
    `SELECT module_key, can_view, can_create, can_update, can_delete, can_approve
     FROM user_company_permissions WHERE membership_id = ? ORDER BY module_key`,
  ).bind(membershipId).all<Row>();
  return (result.results || []).map(permissionFromRow);
}

async function membershipsForUser(db: D1Database, userId: string): Promise<Membership[]> {
  const result = await db.prepare(
    `SELECT m.id, m.company_role, m.is_default,
            c.id AS company_id, c.slug, c.code, c.name, c.legal_name, c.is_active
     FROM user_company_memberships m
     JOIN main_companies c ON c.id = m.main_company_id
     WHERE m.user_id = ? AND m.is_active = 1
     ORDER BY m.is_default DESC, c.name`,
  ).bind(userId).all<Row>();
  return Promise.all((result.results || []).map(async (row) => ({
    id: text(row.id),
    companyRole: text(row.company_role),
    isDefault: flag(row.is_default),
    company: {
      id: text(row.company_id),
      slug: text(row.slug),
      code: text(row.code),
      name: text(row.name),
      legalName: text(row.legal_name),
      isActive: flag(row.is_active),
    },
    permissions: await permissionsForMembership(db, text(row.id)),
  })));
}

function authUser(auth: AuthContext, memberships: Membership[]) {
  return {
    id: auth.userId,
    username: auth.username,
    fullName: auth.fullName,
    email: auth.email,
    backupEmail: auth.backupEmail,
    platformRole: auth.platformRole,
    role: auth.platformRole === SUPER_ADMIN ? "ADMIN" : "USER",
    mustChangePassword: auth.mustChangePassword,
    activeCompany: auth.activeCompanySlug ? memberships.find((item) => item.company.slug === auth.activeCompanySlug)?.company || {
      id: auth.activeCompanyId,
      slug: auth.activeCompanySlug,
      code: auth.activeCompanyCode || "",
      name: auth.activeCompanyName || auth.activeCompanySlug,
      legalName: auth.activeCompanyLegalName || "",
      isActive: true,
    } : null,
    membershipId: auth.membershipId,
    companyRole: auth.companyRole,
    memberships,
    permissions: auth.permissions,
  };
}

async function loadAuthContext(db: D1Database, payload: JwtPayload): Promise<AuthContext | null> {
  const row = await db.prepare(
    `SELECT s.id AS session_id, s.user_id, s.membership_id, s.active_company_id,
            s.active_company_slug, s.expires_at, s.revoked_at,
            u.username, u.full_name, u.email, u.backup_email, u.platform_role,
            u.role, u.is_active AS user_active, u.must_change_password,
            m.company_role, m.is_active AS membership_active,
            c.is_active AS company_active, c.slug AS company_slug,
            c.name AS company_name, c.code AS company_code, c.legal_name AS company_legal_name
     FROM auth_sessions s
     JOIN auth_users u ON u.id = s.user_id
     LEFT JOIN user_company_memberships m ON m.id = s.membership_id
     LEFT JOIN main_companies c ON c.id = s.active_company_id
     WHERE s.id = ? AND s.user_id = ? LIMIT 1`,
  ).bind(payload.sid, payload.sub).first<Row>();
  if (!row || row.revoked_at !== null || Number(row.expires_at || 0) <= nowMs() || !flag(row.user_active)) return null;
  const platformRole = text(row.platform_role) || (text(row.role) === "ADMIN" ? SUPER_ADMIN : USER);
  const activeCompanyId = text(row.active_company_id) || null;
  const activeCompanySlug = text(row.active_company_slug) || null;
  const membershipId = text(row.membership_id) || null;
  if (activeCompanyId && (!flag(row.company_active) || text(row.company_slug) !== activeCompanySlug)) return null;
  if (platformRole !== SUPER_ADMIN && (!membershipId || !flag(row.membership_active))) return null;
  const permissions = platformRole === SUPER_ADMIN ? [] : await permissionsForMembership(db, membershipId);
  return {
    sessionId: text(row.session_id),
    userId: text(row.user_id),
    username: text(row.username),
    fullName: text(row.full_name),
    email: text(row.email),
    backupEmail: text(row.backup_email),
    platformRole,
    mustChangePassword: flag(row.must_change_password),
    activeCompanyId,
    activeCompanySlug,
    activeCompanyName: text(row.company_name) || null,
    activeCompanyCode: text(row.company_code) || null,
    activeCompanyLegalName: text(row.company_legal_name) || null,
    membershipId,
    companyRole: text(row.company_role) || null,
    permissions,
  };
}

async function audit(db: D1Database, actorUserId: string | null, companyId: string | null, action: string, targetType?: string, targetId?: string, details?: Row) {
  await db.prepare(
    `INSERT INTO auth_activity_logs
      (id, actor_user_id, main_company_id, action, target_type, target_id, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), actorUserId, companyId, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null, nowMs()).run();
}

function moduleForPath(path: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/^\/api\/ik(?:\/|$)/, "IK"],
    [/^\/api\/isnet(?:\/|$)/, "ISNET"],
    [/^\/api\/desen(?:\/|$)/, "DESEN"],
    [/^\/api\/boyahane(?:\/|$)/, "BOYAHANE"],
    [/^\/api\/(?:imalat|uretim|production|machines|models|model-takip)(?:\/|$)/, "IMALAT"],
    [/^\/api\/(?:muhasebe|accounting)(?:\/|$)/, "MUHASEBE"],
    [/^\/api\/(?:kdv|vat)(?:\/|$)/, "KDV"],
    [/^\/api\/(?:cek|odeme|payment)(?:\/|$)/, "CEK_ODEME"],
    [/^\/api\/(?:storage|files|documents)(?:\/|$)/, "BELGE_ISLEM"],
    [/^\/api\/(?:ai|assistant)(?:\/|$)/, "ASISTAN"],
  ];
  return rules.find(([pattern]) => pattern.test(path))?.[1] || null;
}

function actionForMethod(method: string): keyof Omit<Permission, "moduleKey"> {
  if (method === "GET" || method === "HEAD") return "canView";
  if (method === "POST") return "canCreate";
  if (method === "DELETE") return "canDelete";
  return "canUpdate";
}

export function tenantAccessDecision(auth: Pick<AuthContext, "activeCompanyId" | "activeCompanySlug">, suppliedTenant: string): "ALLOW" | "TENANT_REQUIRED" | "TENANT_HEADER_REQUIRED" | "TENANT_MISMATCH" {
  if (!auth.activeCompanyId || !auth.activeCompanySlug) return "TENANT_REQUIRED";
  if (!text(suppliedTenant)) return "TENANT_HEADER_REQUIRED";
  if (text(suppliedTenant) !== auth.activeCompanySlug) return "TENANT_MISMATCH";
  return "ALLOW";
}

export const tenantAuthMiddleware: MiddlewareHandler<TenantAuthEnv> = async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const path = c.req.path;
  if (path === "/api/health" || path === "/api/auth/login") return next();
  const authHeader = text(c.req.header("Authorization"));
  if (!authHeader.toLowerCase().startsWith("bearer ")) return responseError(c, 401, "AUTH_REQUIRED", "Yetkilendirme gerekli.");
  let payload: JwtPayload | null = null;
  try {
    payload = await verifyTenantToken(c.env.JWT_SECRET, authHeader.slice(7));
  } catch (error) {
    console.error(JSON.stringify({ message: "auth configuration failed", error: error instanceof Error ? error.message : "unknown" }));
    return responseError(c, 503, "AUTH_UNAVAILABLE", "Kimlik servisi kullanılamıyor.");
  }
  if (!payload) return responseError(c, 401, "INVALID_SESSION", "Oturum doğrulanamadı.");
  const auth = await loadAuthContext(c.env.DB, payload);
  if (!auth) return responseError(c, 401, "INVALID_SESSION", "Oturum geçersiz veya sona ermiş.");
  c.set("auth", auth);

  if (path.startsWith("/api/auth/")) return next();
  if (path.startsWith("/api/admin/")) {
    if (auth.platformRole !== SUPER_ADMIN) return responseError(c, 403, "PLATFORM_ADMIN_REQUIRED", "Sistem yöneticisi yetkisi gerekli.");
    return next();
  }
  if (path.startsWith("/api/tenant-admin/")) {
    if (auth.platformRole !== SUPER_ADMIN && auth.companyRole !== "COMPANY_ADMIN") return responseError(c, 403, "COMPANY_ADMIN_REQUIRED", "Firma yöneticisi yetkisi gerekli.");
    return next();
  }
  const suppliedTenant = text(c.req.header(TENANT_HEADER));
  const tenantDecision = tenantAccessDecision(auth, suppliedTenant);
  if (tenantDecision === "TENANT_REQUIRED") return responseError(c, 409, tenantDecision, "Devam etmek için firma seçin.");
  if (tenantDecision === "TENANT_HEADER_REQUIRED") return responseError(c, 403, tenantDecision, "Doğrulanmış firma bağlamı gerekli.");
  if (tenantDecision === "TENANT_MISMATCH") return responseError(c, 403, tenantDecision, "Başka firmaya erişim reddedildi.");

  const moduleKey = moduleForPath(path);
  if (moduleKey && auth.platformRole !== SUPER_ADMIN) {
    const permission = auth.permissions.find((item) => item.moduleKey === moduleKey);
    if (!permission?.[actionForMethod(c.req.method)]) return responseError(c, 403, "MODULE_PERMISSION_DENIED", "Bu işlem için modül yetkiniz yok.");
  }
  return next();
};

async function issueSession(c: Context<TenantAuthEnv>, user: Row, membership: Membership | null, replacedSessionId?: string) {
  const issuedAt = nowMs();
  const expiresAt = issuedAt + TOKEN_LIFETIME_SECONDS * 1000;
  const sessionId = crypto.randomUUID();
  const company = membership?.company || null;
  const statements: D1PreparedStatement[] = [];
  if (replacedSessionId) {
    statements.push(c.env.DB.prepare("UPDATE auth_sessions SET revoked_at = ?, replaced_by_session_id = ? WHERE id = ? AND revoked_at IS NULL").bind(issuedAt, sessionId, replacedSessionId));
  }
  statements.push(c.env.DB.prepare(
    `INSERT INTO auth_sessions
      (id, user_id, membership_id, active_company_id, active_company_slug, issued_at, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(sessionId, text(user.id), membership?.id || null, company?.id || null, company?.slug || null, issuedAt, expiresAt, issuedAt));
  await c.env.DB.batch(statements);
  const platformRole = text(user.platform_role) || (text(user.role) === "ADMIN" ? SUPER_ADMIN : USER);
  const payload: JwtPayload = {
    sub: text(user.id), sid: sessionId, username: text(user.username), platformRole,
    activeCompanyId: company?.id || null, activeCompanySlug: company?.slug || null,
    membershipId: membership?.id || null,
    iat: Math.floor(issuedAt / 1000), exp: Math.floor(expiresAt / 1000),
  };
  const token = await signTenantToken(c.env.JWT_SECRET, payload);
  const auth: AuthContext = {
    sessionId, userId: text(user.id), username: text(user.username), fullName: text(user.full_name),
    email: text(user.email), backupEmail: text(user.backup_email), platformRole,
    mustChangePassword: flag(user.must_change_password), activeCompanyId: company?.id || null,
    activeCompanySlug: company?.slug || null, activeCompanyName: company?.name || null,
    activeCompanyCode: company?.code || null, activeCompanyLegalName: company?.legalName || null,
    membershipId: membership?.id || null,
    companyRole: membership?.companyRole || null, permissions: membership?.permissions || [],
  };
  const memberships = await membershipsForUser(c.env.DB, text(user.id));
  return { token, user: authUser(auth, memberships), memberships };
}

async function readJson(c: Context<TenantAuthEnv>): Promise<Row> {
  try {
    const value: unknown = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch {
    return {};
  }
}

function userSelect(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return ["id", "username", "password_hash", "full_name", "email", "backup_email", "platform_role", "role", "is_active", "must_change_password", "last_login_at", "created_at", "updated_at"]
    .map((column) => `${prefix}${column} AS ${column}`)
    .join(", ");
}

function safeUserRow(row: Row) {
  return {
    id: text(row.id), username: text(row.username), fullName: text(row.full_name),
    email: text(row.email), backupEmail: text(row.backup_email),
    platformRole: text(row.platform_role) || (text(row.role) === "ADMIN" ? SUPER_ADMIN : USER),
    isActive: flag(row.is_active), mustChangePassword: flag(row.must_change_password),
    lastLoginAt: row.last_login_at ?? null, createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null,
  };
}

export function registerTenantAuthRoutes(app: Hono<TenantAuthEnv>) {
  app.post("/api/auth/login", async (c) => {
    const body = await readJson(c);
    const username = text(body.username).toLocaleLowerCase("tr-TR");
    const password = String(body.password || "");
    if (!username || !password) return responseError(c, 400, "CREDENTIALS_REQUIRED", "Kullanıcı adı ve şifre zorunludur.");
    const user = await c.env.DB.prepare(`SELECT ${userSelect()} FROM auth_users WHERE lower(username) = lower(?) LIMIT 1`).bind(username).first<Row>();
    let matches = false;
    if (user && flag(user.is_active)) {
      try { matches = await compare(password, text(user.password_hash)); } catch { matches = false; }
    }
    if (!user || !flag(user.is_active) || !matches) {
      await audit(c.env.DB, user ? text(user.id) : null, null, "AUTH_LOGIN_FAILED", "auth_user", user ? text(user.id) : undefined);
      return responseError(c, 401, "INVALID_CREDENTIALS", "Kullanıcı adı veya şifre hatalı.");
    }
    const platformRole = text(user.platform_role) || (text(user.role) === "ADMIN" ? SUPER_ADMIN : USER);
    const memberships = await membershipsForUser(c.env.DB, text(user.id));
    const activeMembership = platformRole === SUPER_ADMIN ? null : memberships.filter((item) => item.company.isActive).length === 1 ? memberships.find((item) => item.company.isActive) || null : null;
    if (platformRole !== SUPER_ADMIN && memberships.filter((item) => item.company.isActive).length === 0) return responseError(c, 403, "NO_ACTIVE_MEMBERSHIP", "Aktif firma üyeliği bulunmuyor.");
    const result = await issueSession(c, user, activeMembership);
    await c.env.DB.prepare("UPDATE auth_users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(nowMs(), nowMs(), text(user.id)).run();
    await audit(c.env.DB, text(user.id), activeMembership?.company.id || null, "AUTH_LOGIN_SUCCESS", "auth_user", text(user.id));
    return c.json({ ok: true, success: true, ...result, requiresCompanySelection: platformRole !== SUPER_ADMIN && !activeMembership });
  });

  app.get("/api/auth/me", async (c) => {
    const auth = c.get("auth");
    const memberships = await membershipsForUser(c.env.DB, auth.userId);
    return c.json({ ok: true, success: true, user: authUser(auth, memberships), memberships, requiresCompanySelection: auth.platformRole !== SUPER_ADMIN && !auth.activeCompanyId });
  });

  app.post("/api/auth/switch-company", async (c) => {
    const auth = c.get("auth");
    const body = await readJson(c);
    const requested = text(body.companyId || body.companySlug);
    if (!requested) return responseError(c, 400, "COMPANY_REQUIRED", "Firma seçimi zorunludur.");
    const memberships = await membershipsForUser(c.env.DB, auth.userId);
    let membership: Membership | null = null;
    if (auth.platformRole === SUPER_ADMIN) {
      const company = await c.env.DB.prepare("SELECT id, slug, code, name, legal_name, is_active FROM main_companies WHERE (id = ? OR slug = ?) AND is_active = 1 LIMIT 1").bind(requested, requested).first<Row>();
      if (company) membership = { id: "", companyRole: "PLATFORM_ADMIN", isDefault: false, permissions: [], company: { id: text(company.id), slug: text(company.slug), code: text(company.code), name: text(company.name), legalName: text(company.legal_name), isActive: true } };
    } else {
      membership = memberships.find((item) => item.company.isActive && (item.company.id === requested || item.company.slug === requested)) || null;
    }
    if (!membership) return responseError(c, 403, "COMPANY_ACCESS_DENIED", "Bu firmaya erişim yetkiniz yok.");
    const user = await c.env.DB.prepare(`SELECT ${userSelect()} FROM auth_users WHERE id = ? LIMIT 1`).bind(auth.userId).first<Row>();
    if (!user) return responseError(c, 401, "INVALID_SESSION", "Kullanıcı bulunamadı.");
    const issuedMembership = auth.platformRole === SUPER_ADMIN ? { ...membership, id: "" } : membership;
    const result = await issueSession(c, user, issuedMembership, auth.sessionId);
    await audit(c.env.DB, auth.userId, membership.company.id, "TENANT_CONTEXT_SWITCH", "main_company", membership.company.id);
    return c.json({ ok: true, success: true, ...result });
  });

  app.post("/api/auth/leave-company", async (c) => {
    const auth = c.get("auth");
    if (auth.platformRole !== SUPER_ADMIN) return responseError(c, 403, "PLATFORM_ADMIN_REQUIRED", "Sistem yöneticisi yetkisi gerekli.");
    const user = await c.env.DB.prepare(`SELECT ${userSelect()} FROM auth_users WHERE id = ? LIMIT 1`).bind(auth.userId).first<Row>();
    if (!user) return responseError(c, 401, "INVALID_SESSION", "Kullanıcı bulunamadı.");
    const result = await issueSession(c, user, null, auth.sessionId);
    await audit(c.env.DB, auth.userId, auth.activeCompanyId, "TENANT_CONTEXT_LEFT", "main_company", auth.activeCompanyId || undefined);
    return c.json({ ok: true, success: true, ...result });
  });

  app.post("/api/auth/logout", async (c) => {
    const auth = c.get("auth");
    await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(nowMs(), auth.sessionId).run();
    await audit(c.env.DB, auth.userId, auth.activeCompanyId, "AUTH_LOGOUT", "auth_user", auth.userId);
    return c.json({ ok: true, success: true });
  });

  app.get("/api/admin/companies", async (c) => {
    const rows = await c.env.DB.prepare("SELECT id, slug, code, name, legal_name, tax_number, tax_office, email, phone, address, logo, is_active, created_at, updated_at FROM main_companies ORDER BY name").all<Row>();
    const items = (rows.results || []).map((row) => ({ id: text(row.id), slug: text(row.slug), code: text(row.code), name: text(row.name), legalName: text(row.legal_name), taxNumber: text(row.tax_number), taxOffice: text(row.tax_office), email: text(row.email), phone: text(row.phone), address: text(row.address), logo: text(row.logo), isActive: flag(row.is_active), createdAt: row.created_at, updatedAt: row.updated_at }));
    return c.json({ ok: true, success: true, data: items, items });
  });

  app.post("/api/admin/companies", async (c) => {
    const auth = c.get("auth");
    const body = await readJson(c);
    const slug = text(body.slug).toLowerCase();
    const name = text(body.name);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !name) return responseError(c, 422, "INVALID_COMPANY", "Geçerli firma adı ve slug zorunludur.");
    const id = crypto.randomUUID();
    const timestamp = nowMs();
    try {
      await c.env.DB.prepare(`INSERT INTO main_companies (id, slug, code, name, legal_name, tax_number, tax_office, email, phone, address, logo, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(id, slug, text(body.code), name, text(body.legalName), text(body.taxNumber), text(body.taxOffice), text(body.email), text(body.phone), text(body.address), text(body.logo), timestamp, timestamp).run();
    } catch {
      return responseError(c, 409, "COMPANY_EXISTS", "Firma slug veya kodu zaten kullanılıyor.");
    }
    await audit(c.env.DB, auth.userId, id, "COMPANY_CREATED", "main_company", id);
    return c.json({ ok: true, success: true, id, slug }, 201);
  });

  app.patch("/api/admin/companies/:id", async (c) => {
    const auth = c.get("auth");
    const id = text(c.req.param("id"));
    const body = await readJson(c);
    const existing = await c.env.DB.prepare("SELECT id, slug, code, name, legal_name, tax_number, tax_office, email, phone, address, logo, is_active FROM main_companies WHERE id = ? LIMIT 1").bind(id).first<Row>();
    if (!existing) return responseError(c, 404, "COMPANY_NOT_FOUND", "Firma bulunamadı.");
    const timestamp = nowMs();
    const value = (requestKey: string, databaseKey: string) => Object.prototype.hasOwnProperty.call(body, requestKey) ? text(body[requestKey]) : text(existing[databaseKey]);
    const isActive = Object.prototype.hasOwnProperty.call(body, "isActive") ? body.isActive !== false : flag(existing.is_active);
    await c.env.DB.prepare(`UPDATE main_companies SET code = ?, name = ?, legal_name = ?, tax_number = ?, tax_office = ?, email = ?, phone = ?, address = ?, logo = ?, is_active = ?, updated_at = ? WHERE id = ?`).bind(value("code", "code"), value("name", "name"), value("legalName", "legal_name"), value("taxNumber", "tax_number"), value("taxOffice", "tax_office"), value("email", "email"), value("phone", "phone"), value("address", "address"), value("logo", "logo"), isActive ? 1 : 0, timestamp, id).run();
    await audit(c.env.DB, auth.userId, id, "COMPANY_UPDATED", "main_company", id);
    return c.json({ ok: true, success: true });
  });

  app.delete("/api/admin/companies/:id", async (c) => {
    const auth = c.get("auth");
    const id = text(c.req.param("id"));
    const result = await c.env.DB.prepare("UPDATE main_companies SET is_active = 0, updated_at = ? WHERE id = ?").bind(nowMs(), id).run();
    if (!result.meta.changes) return responseError(c, 404, "COMPANY_NOT_FOUND", "Firma bulunamadı.");
    await audit(c.env.DB, auth.userId, id, "COMPANY_DEACTIVATED", "main_company", id);
    return c.json({ ok: true, success: true, deactivated: true });
  });

  app.get("/api/admin/users", async (c) => {
    const companyId = text(c.req.query("companyId"));
    const rows = await c.env.DB.prepare(
      `SELECT ${userSelect("u")}, m.id AS membership_id, m.main_company_id, m.main_company_slug, m.company_role, m.is_active AS membership_active
       FROM auth_users u
       LEFT JOIN user_company_memberships m ON m.user_id = u.id
       WHERE (? = '' OR m.main_company_id = ?)
       ORDER BY u.username, m.main_company_slug`,
    ).bind(companyId, companyId).all<Row>();
    const items = (rows.results || []).map((row) => ({ ...safeUserRow(row), membershipId: text(row.membership_id) || null, mainCompanyId: text(row.main_company_id) || null, mainCompanySlug: text(row.main_company_slug) || null, companyRole: text(row.company_role) || null, membershipActive: row.membership_id ? flag(row.membership_active) : null }));
    return c.json({ ok: true, success: true, data: items, items });
  });

  app.post("/api/admin/users", async (c) => {
    const auth = c.get("auth");
    const body = await readJson(c);
    const username = text(body.username).toLowerCase();
    const password = String(body.password || "");
    const companyId = text(body.companyId);
    if (!/^[a-z0-9._-]{3,64}$/.test(username) || !text(body.fullName) || !companyId) return responseError(c, 422, "INVALID_USER", "Firma, kullanıcı adı ve ad soyad zorunludur.");
    if (password.length < 6 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) return responseError(c, 422, "WEAK_PASSWORD", "Şifre en az 6 karakter, bir harf ve bir rakam içermelidir.");
    const company = await c.env.DB.prepare("SELECT id, slug FROM main_companies WHERE id = ? AND is_active = 1 LIMIT 1").bind(companyId).first<Row>();
    if (!company) return responseError(c, 404, "COMPANY_NOT_FOUND", "Aktif firma bulunamadı.");
    const userId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const timestamp = nowMs();
    const passwordHash = await hash(password, 12);
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO auth_users (id, username, password_hash, full_name, role, email, backup_email, platform_role, is_active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 'USER', ?, ?, 'USER', 1, ?, ?, ?)`).bind(userId, username, passwordHash, text(body.fullName), text(body.email), text(body.backupEmail), body.mustChangePassword === false ? 0 : 1, timestamp, timestamp),
        c.env.DB.prepare(`INSERT INTO user_company_memberships (id, user_id, main_company_id, main_company_slug, company_role, is_active, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`).bind(membershipId, userId, companyId, text(company.slug), text(body.companyRole) || "VIEWER", timestamp, timestamp),
      ]);
    } catch {
      return responseError(c, 409, "USER_EXISTS", "Kullanıcı adı zaten kullanılıyor.");
    }
    await audit(c.env.DB, auth.userId, companyId, "USER_CREATED", "auth_user", userId);
    return c.json({ ok: true, success: true, id: userId, membershipId }, 201);
  });

  app.patch("/api/admin/users/:id/status", async (c) => {
    const auth = c.get("auth");
    const id = text(c.req.param("id"));
    if (id === auth.userId) return responseError(c, 409, "SELF_DEACTIVATION_DENIED", "Aktif oturum sahibi pasife alınamaz.");
    const body = await readJson(c);
    const result = await c.env.DB.prepare("UPDATE auth_users SET is_active = ?, updated_at = ? WHERE id = ?").bind(body.isActive === false ? 0 : 1, nowMs(), id).run();
    if (!result.meta.changes) return responseError(c, 404, "USER_NOT_FOUND", "Kullanıcı bulunamadı.");
    if (body.isActive === false) await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(nowMs(), id).run();
    await audit(c.env.DB, auth.userId, null, body.isActive === false ? "USER_DEACTIVATED" : "USER_ACTIVATED", "auth_user", id);
    return c.json({ ok: true, success: true });
  });

  app.post("/api/admin/users/:id/reset-password", async (c) => {
    const auth = c.get("auth");
    const id = text(c.req.param("id"));
    const body = await readJson(c);
    const password = String(body.password || "");
    if (password.length < 6 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) return responseError(c, 422, "WEAK_PASSWORD", "Şifre en az 6 karakter, bir harf ve bir rakam içermelidir.");
    const result = await c.env.DB.prepare("UPDATE auth_users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").bind(await hash(password, 12), nowMs(), id).run();
    if (!result.meta.changes) return responseError(c, 404, "USER_NOT_FOUND", "Kullanıcı bulunamadı.");
    await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(nowMs(), id).run();
    await audit(c.env.DB, auth.userId, null, "USER_PASSWORD_RESET", "auth_user", id);
    return c.json({ ok: true, success: true });
  });

  app.put("/api/admin/memberships/:id/permissions", async (c) => {
    const auth = c.get("auth");
    const membershipId = text(c.req.param("id"));
    const body = await readJson(c);
    const rows = Array.isArray(body.permissions) ? body.permissions.filter((item): item is Row => Boolean(item && typeof item === "object")) : [];
    const membership = await c.env.DB.prepare("SELECT main_company_id FROM user_company_memberships WHERE id = ? LIMIT 1").bind(membershipId).first<Row>();
    if (!membership) return responseError(c, 404, "MEMBERSHIP_NOT_FOUND", "Firma üyeliği bulunamadı.");
    const timestamp = nowMs();
    const statements = rows.filter((row) => MODULE_KEYS.includes(text(row.moduleKey).toUpperCase() as typeof MODULE_KEYS[number])).map((row) => c.env.DB.prepare(`INSERT INTO user_company_permissions (id, membership_id, module_key, can_view, can_create, can_update, can_delete, can_approve, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(membership_id, module_key) DO UPDATE SET can_view=excluded.can_view, can_create=excluded.can_create, can_update=excluded.can_update, can_delete=excluded.can_delete, can_approve=excluded.can_approve, updated_at=excluded.updated_at`).bind(crypto.randomUUID(), membershipId, text(row.moduleKey).toUpperCase(), flag(row.canView) ? 1 : 0, flag(row.canCreate) ? 1 : 0, flag(row.canUpdate) ? 1 : 0, flag(row.canDelete) ? 1 : 0, flag(row.canApprove) ? 1 : 0, timestamp, timestamp));
    if (statements.length) await c.env.DB.batch(statements);
    await audit(c.env.DB, auth.userId, text(membership.main_company_id), "MEMBERSHIP_PERMISSIONS_UPDATED", "membership", membershipId, { moduleCount: statements.length });
    return c.json({ ok: true, success: true, permissions: await permissionsForMembership(c.env.DB, membershipId) });
  });

  app.get("/api/admin/memberships/:id/permissions", async (c) => {
    const membershipId = text(c.req.param("id"));
    const membership = await c.env.DB.prepare("SELECT id FROM user_company_memberships WHERE id = ? LIMIT 1").bind(membershipId).first<Row>();
    if (!membership) return responseError(c, 404, "MEMBERSHIP_NOT_FOUND", "Firma üyeliği bulunamadı.");
    const items = await permissionsForMembership(c.env.DB, membershipId);
    return c.json({ ok: true, success: true, data: items, items });
  });

  app.get("/api/admin/system-status", async (c) => {
    const [companies, users, sessions] = await c.env.DB.batch<Row>([
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM main_companies WHERE is_active = 1"),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM auth_users WHERE is_active = 1"),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ?").bind(nowMs()),
    ]);
    return c.json({ ok: true, success: true, data: { database: "ok", activeCompanies: Number(companies.results?.[0]?.count || 0), activeUsers: Number(users.results?.[0]?.count || 0), activeSessions: Number(sessions.results?.[0]?.count || 0), mfa: "model-ready-disabled" } });
  });

  app.get("/api/admin/activity-logs", async (c) => {
    const rows = await c.env.DB.prepare(`SELECT l.id, l.action, l.target_type, l.target_id, l.details_json, l.created_at, u.username, c.name AS company_name FROM auth_activity_logs l LEFT JOIN auth_users u ON u.id=l.actor_user_id LEFT JOIN main_companies c ON c.id=l.main_company_id ORDER BY l.created_at DESC LIMIT 200`).all<Row>();
    const items = rows.results || [];
    return c.json({ ok: true, success: true, data: items, items });
  });

  app.get("/api/tenant-admin/users", async (c) => {
    const auth = c.get("auth");
    if (!auth.activeCompanyId) return responseError(c, 409, "TENANT_REQUIRED", "Firma bağlamı gerekli.");
    const rows = await c.env.DB.prepare(
      `SELECT ${userSelect("u")}, m.id AS membership_id, m.main_company_id, m.main_company_slug, m.company_role, m.is_active AS membership_active
       FROM user_company_memberships m JOIN auth_users u ON u.id=m.user_id
       WHERE m.main_company_id=? ORDER BY u.username`,
    ).bind(auth.activeCompanyId).all<Row>();
    const items = (rows.results || []).map((row) => ({ ...safeUserRow(row), membershipId: text(row.membership_id), mainCompanyId: text(row.main_company_id), mainCompanySlug: text(row.main_company_slug), companyRole: text(row.company_role), membershipActive: flag(row.membership_active) }));
    return c.json({ ok: true, success: true, data: items, items });
  });

  app.post("/api/tenant-admin/users", async (c) => {
    const auth = c.get("auth");
    if (!auth.activeCompanyId || !auth.activeCompanySlug) return responseError(c, 409, "TENANT_REQUIRED", "Firma bağlamı gerekli.");
    const body = await readJson(c);
    const username = text(body.username).toLowerCase();
    const password = String(body.password || "");
    if (!/^[a-z0-9._-]{3,64}$/.test(username) || !text(body.fullName)) return responseError(c, 422, "INVALID_USER", "Kullanıcı adı ve ad soyad zorunludur.");
    if (password.length < 6 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) return responseError(c, 422, "WEAK_PASSWORD", "Şifre en az 6 karakter, bir harf ve bir rakam içermelidir.");
    const userId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const timestamp = nowMs();
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO auth_users (id,username,password_hash,full_name,role,email,platform_role,is_active,must_change_password,created_at,updated_at) VALUES (?,?,?,?,'VIEWER',?,'USER',1,1,?,?)`).bind(userId, username, await hash(password, 12), text(body.fullName), text(body.email), timestamp, timestamp),
        c.env.DB.prepare(`INSERT INTO user_company_memberships (id,user_id,main_company_id,main_company_slug,company_role,is_active,is_default,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?)`).bind(membershipId, userId, auth.activeCompanyId, auth.activeCompanySlug, text(body.companyRole) || "VIEWER", timestamp, timestamp),
      ]);
    } catch {
      return responseError(c, 409, "USER_EXISTS", "Kullanıcı adı zaten kullanılıyor.");
    }
    await audit(c.env.DB, auth.userId, auth.activeCompanyId, "COMPANY_USER_CREATED", "auth_user", userId);
    return c.json({ ok: true, success: true, id: userId, membershipId }, 201);
  });

  app.patch("/api/tenant-admin/users/:id/status", async (c) => {
    const auth = c.get("auth");
    const targetId = text(c.req.param("id"));
    if (!auth.activeCompanyId) return responseError(c, 409, "TENANT_REQUIRED", "Firma bağlamı gerekli.");
    if (targetId === auth.userId) return responseError(c, 409, "SELF_DEACTIVATION_DENIED", "Aktif oturum sahibi pasife alınamaz.");
    const owned = await c.env.DB.prepare("SELECT id FROM user_company_memberships WHERE user_id=? AND main_company_id=? LIMIT 1").bind(targetId, auth.activeCompanyId).first<Row>();
    if (!owned) return responseError(c, 404, "USER_NOT_FOUND", "Firma kullanıcısı bulunamadı.");
    const body = await readJson(c);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE auth_users SET is_active=?,updated_at=? WHERE id=?").bind(body.isActive === false ? 0 : 1, nowMs(), targetId),
      c.env.DB.prepare("UPDATE user_company_memberships SET is_active=?,updated_at=? WHERE id=?").bind(body.isActive === false ? 0 : 1, nowMs(), text(owned.id)),
    ]);
    if (body.isActive === false) await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(nowMs(), targetId).run();
    await audit(c.env.DB, auth.userId, auth.activeCompanyId, body.isActive === false ? "COMPANY_USER_DEACTIVATED" : "COMPANY_USER_ACTIVATED", "auth_user", targetId);
    return c.json({ ok: true, success: true });
  });

  app.post("/api/tenant-admin/users/:id/reset-password", async (c) => {
    const auth = c.get("auth");
    const targetId = text(c.req.param("id"));
    if (!auth.activeCompanyId) return responseError(c, 409, "TENANT_REQUIRED", "Firma bağlamı gerekli.");
    const owned = await c.env.DB.prepare("SELECT id FROM user_company_memberships WHERE user_id=? AND main_company_id=? LIMIT 1").bind(targetId, auth.activeCompanyId).first<Row>();
    if (!owned) return responseError(c, 404, "USER_NOT_FOUND", "Firma kullanıcısı bulunamadı.");
    const body = await readJson(c);
    const password = String(body.password || "");
    if (password.length < 6 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) return responseError(c, 422, "WEAK_PASSWORD", "Şifre en az 6 karakter, bir harf ve bir rakam içermelidir.");
    await c.env.DB.prepare("UPDATE auth_users SET password_hash=?,must_change_password=1,updated_at=? WHERE id=?").bind(await hash(password, 12), nowMs(), targetId).run();
    await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(nowMs(), targetId).run();
    await audit(c.env.DB, auth.userId, auth.activeCompanyId, "COMPANY_USER_PASSWORD_RESET", "auth_user", targetId);
    return c.json({ ok: true, success: true });
  });

  app.put("/api/tenant-admin/memberships/:id/permissions", async (c) => {
    const auth = c.get("auth");
    const membershipId = text(c.req.param("id"));
    if (!auth.activeCompanyId) return responseError(c, 409, "TENANT_REQUIRED", "Firma bağlamı gerekli.");
    const membership = await c.env.DB.prepare("SELECT id FROM user_company_memberships WHERE id=? AND main_company_id=? LIMIT 1").bind(membershipId, auth.activeCompanyId).first<Row>();
    if (!membership) return responseError(c, 404, "MEMBERSHIP_NOT_FOUND", "Firma üyeliği bulunamadı.");
    const body = await readJson(c);
    const rows = Array.isArray(body.permissions) ? body.permissions.filter((item): item is Row => Boolean(item && typeof item === "object")) : [];
    const timestamp = nowMs();
    const statements = rows.filter((row) => MODULE_KEYS.includes(text(row.moduleKey).toUpperCase() as typeof MODULE_KEYS[number])).map((row) => c.env.DB.prepare(`INSERT INTO user_company_permissions (id,membership_id,module_key,can_view,can_create,can_update,can_delete,can_approve,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(membership_id,module_key) DO UPDATE SET can_view=excluded.can_view,can_create=excluded.can_create,can_update=excluded.can_update,can_delete=excluded.can_delete,can_approve=excluded.can_approve,updated_at=excluded.updated_at`).bind(crypto.randomUUID(), membershipId, text(row.moduleKey).toUpperCase(), flag(row.canView) ? 1 : 0, flag(row.canCreate) ? 1 : 0, flag(row.canUpdate) ? 1 : 0, flag(row.canDelete) ? 1 : 0, flag(row.canApprove) ? 1 : 0, timestamp, timestamp));
    if (statements.length) await c.env.DB.batch(statements);
    await audit(c.env.DB, auth.userId, auth.activeCompanyId, "COMPANY_PERMISSIONS_UPDATED", "membership", membershipId, { moduleCount: statements.length });
    return c.json({ ok: true, success: true });
  });
}
