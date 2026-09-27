// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

const OWNER_MFA_SESSION_SECONDS = 36_000;

type AnyRow = Record<string, any>;

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toUpperCase().replace(/İ/g, "I");
}
function nowIso() {
  return new Date().toISOString();
}
function isOwnerRole(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
function isCompanyAdminRole(role: unknown) {
  return upper(role) === "COMPANY_ADMIN";
}
export function ordinaryAdminRequestsOwnerRole(value: unknown) {
  return isOwnerRole(value);
}
function requestedOwnerRole(body: AnyRow) {
  const requested = body?.role ?? body?.roleOverride ?? body?.role_override;
  return requested !== undefined && ordinaryAdminRequestsOwnerRole(requested);
}
function jsonError(code: string, message: string) {
  return { ok: false, error: { code, message } };
}
function parseDetail(value: unknown) {
  try {
    const parsed = JSON.parse(text(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
async function bodyOf(c: any) {
  try {
    const body = await c.req.raw.clone().json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as AnyRow : {};
  } catch {
    return {};
  }
}
async function targetUser(c: any, userId: string) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.role,u.is_active,
            s.email,s.main_company_slug,s.role_override,s.email_verified,s.approval_required,
            s.login_policy,s.session_seconds,s.google_mfa_enabled,s.microsoft_mfa_enabled
       FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(userId).first<AnyRow>();
}
function effectiveRole(row: AnyRow) {
  const role = upper(row?.role_override || row?.role || "VIEWER");
  return role === "ADMIN" ? "SUPER_ADMIN" : role;
}
async function audit(c: any, current: AnyRow, target: AnyRow, action: string, detail: AnyRow = {}) {
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit
       (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      current?.id || null,
      target?.id || null,
      text(target?.main_company_slug || current?.mainCompanySlug) || null,
      action,
      current?.session?.id || null,
      text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]) || null,
      JSON.stringify(detail || {}),
      nowIso(),
    ).run();
  } catch {
    // Fail-closed karar audit yazımı yüzünden gevşetilmez.
  }
}

function sessionPolicyFromAudit(events: AnyRow[], session: AnyRow) {
  const created = events.find((event) => event.session_id === session.id && event.action === "SESSION_CREATED_POLICY");
  const detail = parseDetail(created?.detail);
  return upper(detail.policy || session.login_policy || "");
}

function verificationMethod(events: AnyRow[], session: AnyRow, policy: string) {
  if (policy === "PASSWORD_ONLY") return "Sadece parola";
  if (policy === "GOOGLE") return "Google Authenticator";
  if (policy === "MICROSOFT") return "Microsoft Authenticator";
  if (policy === "BOTH_MFA") return "Google + Microsoft Authenticator";

  const createdAt = Date.parse(text(session.created_at));
  const candidate = events.find((event) => {
    if (event.action !== "MFA_VERIFIED_POLICY" || text(event.target_user_id) !== text(session.user_id)) return false;
    const eventAt = Date.parse(text(event.created_at));
    return Number.isFinite(createdAt) && Number.isFinite(eventAt) && eventAt <= createdAt + 5_000 && eventAt >= createdAt - (15 * 60 * 1000);
  });
  const detail = parseDetail(candidate?.detail);
  const provider = upper(detail.provider);
  if (provider === "GOOGLE") return "Google Authenticator";
  if (provider === "MICROSOFT") return "Microsoft Authenticator";
  if (policy === "ANY_MFA") return "Google veya Microsoft MFA";
  return "MFA / Güvenli giriş";
}

function closeReason(events: AnyRow[], session: AnyRow) {
  const sessionEvents = events.filter((event) => text(event.session_id) === text(session.id));
  if (sessionEvents.some((event) => event.action === "SESSION_LOGOUT")) return "Kullanıcı çıkış yaptı";
  if (sessionEvents.some((event) => event.action === "SESSION_REVOKED")) return "Yönetici oturumu sonlandırdı";
  if (session.revoked_at) {
    if (text(session.revoked_by) && text(session.revoked_by) !== text(session.user_id)) return "Yönetici / güvenlik işlemi ile kapatıldı";
    return "Çıkış / güvenlik işlemi ile kapatıldı";
  }
  if (Date.parse(text(session.expires_at)) <= Date.now()) return "Oturum süresi doldu";
  return "Aktif";
}

export function registerAuthOwnerGuardRoutes(app: any) {
  app.post("/api/admin/users", async (c: any, next: any) => {
    const body = await bodyOf(c);
    if (!requestedOwnerRole(body)) return next();
    const current = await getAuthenticatedUser(c);
    if (current) {
      await audit(c, current, {}, "SUPER_ADMIN_ORDINARY_ROUTE_BLOCKED", {
        route: "/api/admin/users",
        requestedRole: upper(body.role ?? body.roleOverride ?? body.role_override),
      });
    }
    return c.json(
      jsonError(
        "SUPER_ADMIN_SECURITY_ACTION_REQUIRED",
        "Süper Yönetici yalnız KY Güvenlik telefonunda yeniden doğrulanan kritik güvenlik işlemi ile atanabilir.",
      ),
      409,
    );
  });

  app.get("/api/admin/security/session-history", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || (!isOwnerRole(current.role) && !isCompanyAdminRole(current.role))) {
      return c.json(jsonError("FORBIDDEN", "Yönetici yetkisi gereklidir."), 403);
    }

    const requested = Number(c.req.query("limit") || 250);
    const limit = Math.max(25, Math.min(500, Number.isFinite(requested) ? Math.floor(requested) : 250));
    const sessionResult = await c.env.DB.prepare(
      `SELECT s.*,u.username,u.full_name,u.role,us.email,us.role_override,us.login_policy
         FROM auth_sessions s
         JOIN auth_users u ON u.id=s.user_id
         LEFT JOIN auth_user_security us ON us.user_id=u.id
        ORDER BY s.created_at DESC
        LIMIT ?`,
    ).bind(limit).all<AnyRow>();

    const auditResult = await c.env.DB.prepare(
      `SELECT id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at
         FROM auth_security_audit
        ORDER BY created_at DESC
        LIMIT 1500`,
    ).all<AnyRow>();
    const events = auditResult.results || [];

    const rows = (sessionResult.results || []).filter((row: AnyRow) => {
      if (isOwnerRole(current.role)) return true;
      const targetRole = effectiveRole(row);
      return text(row.main_company_slug) === text(current.mainCompanySlug) && !isOwnerRole(targetRole);
    }).map((row: AnyRow) => {
      const policy = sessionPolicyFromAudit(events, row);
      const active = !row.revoked_at && Date.parse(text(row.expires_at)) > Date.now();
      const endedAt = row.revoked_at || (!active ? row.expires_at : null);
      return {
        id: row.id,
        userId: row.user_id,
        username: row.username,
        fullName: row.full_name,
        email: row.email,
        role: effectiveRole(row),
        mainCompanySlug: row.main_company_slug,
        deviceLabel: row.device_label,
        userAgent: row.user_agent,
        ipAddress: row.ip_address,
        createdAt: row.created_at,
        approvedAt: row.approved_at,
        lastSeenAt: row.last_seen_at,
        expiresAt: row.expires_at,
        endedAt,
        revokedAt: row.revoked_at,
        revokedBy: row.revoked_by,
        active,
        policy,
        verificationMethod: verificationMethod(events, row, policy),
        closeReason: closeReason(events, row),
        durationSeconds: Math.max(0, Math.floor(((Date.parse(text(endedAt || nowIso()))) - Date.parse(text(row.created_at))) / 1000)),
      };
    });

    return c.json({ ok: true, data: rows });
  });

  app.patch("/api/admin/users/:id", async (c: any, next: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return next();

    const target = await targetUser(c, text(c.req.param("id")));
    if (!target) return next();
    const body = await bodyOf(c);
    const targetIsOwner = isOwnerRole(effectiveRole(target));

    if (!targetIsOwner && requestedOwnerRole(body)) {
      await audit(c, current, target, "SUPER_ADMIN_ORDINARY_ROUTE_BLOCKED", {
        route: "/api/admin/users/:id",
        requestedRole: upper(body.role ?? body.roleOverride ?? body.role_override),
      });
      return c.json(
        jsonError(
          "SUPER_ADMIN_SECURITY_ACTION_REQUIRED",
          "Süper Yönetici rolüne yükseltme yalnız KY Güvenlik telefonunda yeniden doğrulanan kritik güvenlik işlemi ile yapılabilir.",
        ),
        409,
      );
    }

    if (!targetIsOwner) return next();
    if (!isOwnerRole(current.role)) {
      return c.json(jsonError("OWNER_ONLY", "Süper Yönetici hesabı normal kullanıcı yönetiminden değiştirilemez."), 403);
    }
    if (text(current.id) !== text(target.id)) {
      await audit(c, current, target, "OWNER_CHANGE_ORDINARY_ROUTE_BLOCKED", { route: "/api/admin/users/:id" });
      return c.json(
        jsonError(
          "OWNER_SECURITY_ACTION_REQUIRED",
          "Başka bir Süper Yönetici hesabındaki değişiklik yalnız KY Güvenlik kritik güvenlik işlemi ile yapılabilir.",
        ),
        409,
      );
    }

    const requestedEmail = body.email === undefined ? text(target.email) : text(body.email).toLocaleLowerCase("tr-TR");
    if (requestedEmail !== text(target.email).toLocaleLowerCase("tr-TR")) {
      return c.json(
        jsonError(
          "OWNER_EMAIL_SECURITY_ROUTE_REQUIRED",
          "Uygulama sahibi kurtarma e-postası yalnız Güvenlik > Uygulama Sahibi Kurtarma alanından güçlü yeniden doğrulama ile değiştirilebilir.",
        ),
        409,
      );
    }

    const username = text(body.username || target.username).toLocaleLowerCase("tr-TR");
    const fullName = text(body.fullName || target.full_name || target.username);
    if (!username || !fullName) {
      return c.json(jsonError("OWNER_PROFILE_FIELDS_REQUIRED", "Kullanıcı adı ve ad soyad zorunludur."), 400);
    }

    const timestamp = nowIso();
    await c.env.DB.prepare(
      "UPDATE auth_users SET username=?,full_name=?,is_active=1,updated_at=? WHERE id=?",
    ).bind(username, fullName, timestamp, target.id).run();

    await audit(c, current, target, "OWNER_PROFILE_UPDATED_SECURITY_FIELDS_LOCKED", {
      ignoredFields: [
        "role", "roleOverride", "role_override", "mainCompanySlug", "isActive", "emailVerified", "approvalRequired",
        "loginPolicy", "sessionSeconds", "mfa", "googleMfa", "microsoftMfa",
      ],
    });

    const updated = await targetUser(c, target.id);
    return c.json({
      ok: true,
      data: {
        id: updated.id,
        username: updated.username,
        fullName: updated.full_name,
        email: updated.email,
        role: effectiveRole(updated),
        mainCompanySlug: updated.main_company_slug,
        isActive: true,
        emailVerified: Boolean(updated.email_verified),
        approvalRequired: Boolean(updated.approval_required),
        loginPolicy: "ANY_MFA",
        sessionSeconds: OWNER_MFA_SESSION_SECONDS,
        googleMfaEnabled: Boolean(updated.google_mfa_enabled),
        microsoftMfaEnabled: Boolean(updated.microsoft_mfa_enabled),
      },
    });
  });

  const ownerCriticalRouteGuard = async (c: any, next: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return next();
    const target = await targetUser(c, text(c.req.param("id")));
    if (!target || !isOwnerRole(effectiveRole(target))) return next();
    await audit(c, current, target, "OWNER_CRITICAL_ORDINARY_ROUTE_BLOCKED", {
      route: new URL(c.req.url).pathname,
      method: upper(c.req.method),
    });
    return c.json(
      jsonError(
        "OWNER_SECURITY_ACTION_REQUIRED",
        "Süper Yönetici için bu kritik işlem normal kullanıcı yönetiminden yapılamaz; KY Güvenlik yeniden doğrulaması gerekir.",
      ),
      409,
    );
  };

  app.post("/api/admin/users/:id/deactivate", ownerCriticalRouteGuard);
  app.post("/api/admin/users/:id/reset-password", ownerCriticalRouteGuard);
}
