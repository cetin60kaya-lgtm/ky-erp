// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase();
const isSuper = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
const isCompanyAdmin = (role: unknown) => upper(role) === "COMPANY_ADMIN";

function error(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, error: { code, message } }, status as any);
}

async function admin(c: Context<AppEnv>) {
  const current = await getAuthenticatedUser(c);
  if (!current) return null;
  if (!isSuper(current.role) && !isCompanyAdmin(current.role)) return null;
  return current;
}

function limitOf(value: unknown, fallback = 250) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 1000);
}

function closureReason(row: Row) {
  if (!row.revoked_at && Date.parse(text(row.expires_at)) > Date.now()) return "ACTIVE";
  if (text(row.audit_action) === "SESSION_REPLACED_SAME_BROWSER") return "SAME_BROWSER_REPLACED";
  if (text(row.audit_action) === "SESSION_REVOKED") return "ADMIN_REVOKED";
  if (text(row.audit_action) === "ALL_SESSIONS_REVOKED") return "ALL_SESSIONS_REVOKED";
  if (row.revoked_at) return "REVOKED";
  return "EXPIRED";
}

export function registerAuthAdminHistoryRoutes(app: Hono<AppEnv>) {
  app.get("/api/admin/security/session-history", async (c) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isSuper(current.role)) return error(c, current ? 403 : 401, "OWNER_ONLY", "Tüm kullanıcı oturum geçmişini yalnız Süper Yönetici görüntüleyebilir.");
    const limit = limitOf(c.req.query("limit"));
    const companyClause = "";
    const values = [limit];
    const result = await c.env.DB.prepare(`
      SELECT s.*,u.username,u.full_name,us.email,us.role_override,
             (SELECT a.action FROM auth_security_audit a WHERE a.session_id=s.id ORDER BY a.created_at DESC LIMIT 1) AS audit_action,
             (SELECT a.actor_user_id FROM auth_security_audit a WHERE a.session_id=s.id ORDER BY a.created_at DESC LIMIT 1) AS audit_actor_id,
             (SELECT au.full_name FROM auth_security_audit a LEFT JOIN auth_users au ON au.id=a.actor_user_id WHERE a.session_id=s.id ORDER BY a.created_at DESC LIMIT 1) AS audit_actor_name
        FROM auth_sessions s
        JOIN auth_users u ON u.id=s.user_id
        LEFT JOIN auth_user_security us ON us.user_id=u.id
       WHERE 1=1 ${companyClause}
       ORDER BY s.created_at DESC
       LIMIT ?
    `).bind(...values).all<Row>();
    const data = (result.results || []).filter((row) => isSuper(current.role) || !["SUPER_ADMIN", "ADMIN"].includes(upper(row.role_override || row.role_at_login))).map((row) => ({
      id: text(row.id), userId: text(row.user_id), username: text(row.username), fullName: text(row.full_name), email: text(row.email),
      role: text(row.role_at_login), mainCompanySlug: text(row.main_company_slug), deviceLabel: text(row.device_label),
      userAgent: text(row.user_agent), ipAddress: text(row.ip_address), createdAt: row.created_at, lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at, revokedAt: row.revoked_at, revokedBy: row.revoked_by,
      closureReason: closureReason(row), closureAction: text(row.audit_action), closureActorId: text(row.audit_actor_id), closureActorName: text(row.audit_actor_name),
    }));
    return c.json({ ok: true, data });
  });

  app.get("/api/admin/security/audit-log", async (c) => {
    const current = await admin(c);
    if (!current) return error(c, 403, "FORBIDDEN", "Yönetici yetkisi gereklidir.");
    const limit = limitOf(c.req.query("limit"));
    const company = text(current.mainCompanySlug);
    const companyClause = isSuper(current.role) ? "" : "WHERE a.main_company_slug=?";
    const values = isSuper(current.role) ? [limit] : [company, limit];
    const result = await c.env.DB.prepare(`
      SELECT a.*,actor.full_name AS actor_name,actor.username AS actor_username,
             target.full_name AS target_name,target.username AS target_username
        FROM auth_security_audit a
        LEFT JOIN auth_users actor ON actor.id=a.actor_user_id
        LEFT JOIN auth_users target ON target.id=a.target_user_id
        ${companyClause}
       ORDER BY a.created_at DESC
       LIMIT ?
    `).bind(...values).all<Row>();
    return c.json({ ok: true, data: (result.results || []).map((row) => ({
      id: text(row.id), action: text(row.action), actorUserId: text(row.actor_user_id), actorName: text(row.actor_name || row.actor_username),
      targetUserId: text(row.target_user_id), targetName: text(row.target_name || row.target_username), mainCompanySlug: text(row.main_company_slug),
      sessionId: text(row.session_id), ipAddress: text(row.ip_address), detail: text(row.detail), createdAt: row.created_at,
    })) });
  });
}
