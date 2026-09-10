// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;
const GRANT_SCOPE = "AUTH_SECURITY_CAPABILITY_GRANT";

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const nowIso = () => new Date().toISOString();
const isSuper = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
const isCompanyAdmin = (role: unknown) => upper(role) === "COMPANY_ADMIN";
const jsonError = (code: string, message: string) => ({ ok: false, error: { code, message } });
function objectOf(value: unknown): AnyRow { if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRow; try { const parsed = JSON.parse(text(value) || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
async function grantCanApprove(c: any, current: AnyRow) {
  const company = text(current.mainCompanySlug || current.main_company_slug);
  if (!company) return false;
  const row = await c.env.DB.prepare(`SELECT data FROM json_store WHERE scope=? AND file_name=? ORDER BY updated_at DESC LIMIT 1`).bind(GRANT_SCOPE, `${company}:${text(current.id)}`).first<AnyRow>();
  if (!row) return false;
  const data = objectOf(row.data);
  return data.isActive !== false && Array.isArray(data.capabilities) && data.capabilities.map(upper).includes("LOGIN_APPROVE");
}
async function audit(c: any, action: string, current: AnyRow, row: AnyRow, decision: string) {
  try {
    await c.env.DB.prepare(`INSERT INTO auth_security_audit(id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), current.id, row.user_id || null, row.main_company_slug || null, action, null,
      text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]) || null,
      JSON.stringify({ approvalId: row.id, decision, deviceLabel: row.device_label, sourceIp: row.ip_address }), nowIso(),
    ).run();
  } catch {}
}
async function scope(c: any) {
  const current = await getAuthenticatedUser(c);
  if (!current) return { error: c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401) };
  if (isSuper(current.role)) return { current, type: "SYSTEM", company: "" };
  const company = text(current.mainCompanySlug || current.main_company_slug);
  if (isCompanyAdmin(current.role) || await grantCanApprove(c, current)) return { current, type: "COMPANY", company };
  return { current, type: "SELF", company };
}

export function registerSecurityCenterLoginRoutes(app: any) {
  app.get("/api/security-center/login-approvals", async (c: any) => {
    const access = await scope(c); if (access.error) return access.error;
    if (access.type === "SELF") return c.json({ ok: true, data: [] });
    const now = nowIso();
    const result = access.type === "SYSTEM"
      ? await c.env.DB.prepare(`SELECT a.*,u.username,u.full_name FROM auth_login_approvals a LEFT JOIN auth_users u ON u.id=a.user_id WHERE UPPER(COALESCE(a.status,''))='PENDING' AND a.expires_at>? ORDER BY a.requested_at DESC LIMIT 100`).bind(now).all<AnyRow>()
      : await c.env.DB.prepare(`SELECT a.*,u.username,u.full_name FROM auth_login_approvals a LEFT JOIN auth_users u ON u.id=a.user_id WHERE UPPER(COALESCE(a.status,''))='PENDING' AND a.expires_at>? AND a.main_company_slug=? ORDER BY a.requested_at DESC LIMIT 100`).bind(now, access.company).all<AnyRow>();
    return c.json({ ok: true, data: (result.results || []).map((row: AnyRow) => ({ id: row.id, userId: row.user_id, username: row.username, fullName: row.full_name, mainCompanySlug: row.main_company_slug, deviceLabel: row.device_label, userAgent: row.user_agent, ipAddress: row.ip_address, requestedAt: row.requested_at, expiresAt: row.expires_at })) });
  });

  app.post("/api/security-center/login-approvals/:id/:decision", async (c: any) => {
    const access = await scope(c); if (access.error) return access.error;
    if (access.type === "SELF") return c.json(jsonError("FORBIDDEN", "Giriş onayı verme yetkiniz yok."), 403);
    const decisionValue = upper(c.req.param("decision"));
    const status = decisionValue === "APPROVE" ? "APPROVED" : decisionValue === "DENY" ? "DENIED" : "";
    if (!status) return c.json(jsonError("DECISION_INVALID", "Onay veya ret kararı gerekli."), 400);
    const id = text(c.req.param("id"));
    const row = await c.env.DB.prepare("SELECT * FROM auth_login_approvals WHERE id=? LIMIT 1").bind(id).first<AnyRow>();
    if (!row) return c.json(jsonError("APPROVAL_NOT_FOUND", "Giriş onayı bulunamadı."), 404);
    if (access.type !== "SYSTEM" && text(row.main_company_slug) !== access.company) return c.json(jsonError("CROSS_TENANT_FORBIDDEN", "Başka firmanın giriş onayına karar veremezsiniz."), 403);
    if (upper(row.status) !== "PENDING") return c.json(jsonError("ALREADY_DECIDED", "Bu giriş isteği daha önce sonuçlandırıldı."), 409);
    if (Date.parse(text(row.expires_at)) <= Date.now()) return c.json(jsonError("APPROVAL_EXPIRED", "Giriş onayının süresi doldu."), 409);
    const timestamp = nowIso();
    const result = await c.env.DB.prepare(`UPDATE auth_login_approvals SET status=?,decided_at=?,decided_by=? WHERE id=? AND UPPER(COALESCE(status,''))='PENDING' AND expires_at>?`).bind(status, timestamp, access.current.id, id, timestamp).run();
    if (Number(result?.meta?.changes || 0) !== 1) return c.json(jsonError("ALREADY_DECIDED", "Bu giriş isteği aynı anda başka bir yetkili tarafından sonuçlandırıldı."), 409);
    await audit(c, status === "APPROVED" ? "LOGIN_APPROVAL_APPROVED_SECURITY_CENTER" : "LOGIN_APPROVAL_DENIED_SECURITY_CENTER", access.current, row, status);
    return c.json({ ok: true, data: { id, status, decidedAt: timestamp, decidedBy: access.current.id } });
  });
}
