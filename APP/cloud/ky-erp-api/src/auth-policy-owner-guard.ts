// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toLocaleUpperCase("tr-TR");
}
function nowIso() {
  return new Date().toISOString();
}
function isOwnerRole(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
function jsonError(code: string, message: string) {
  return { ok: false, error: { code, message } };
}
async function bodyOf(c: any) {
  try {
    const body = await c.req.json();
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
      current.id || null,
      target.id || null,
      text(target.main_company_slug || current.mainCompanySlug) || null,
      action,
      current.session?.id || null,
      text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]) || null,
      JSON.stringify(detail || {}),
      nowIso(),
    ).run();
  } catch {
    // Güvenlik kaydı hatası profil güncellemesini bozmaz.
  }
}

export function registerAuthOwnerGuardRoutes(app: any) {
  // Uygulama sahibinin kritik güvenlik alanları genel kullanıcı düzenleme rotasından değiştirilemez.
  // E-posta doğrulama/değiştirme yalnız MFA step-up kullanan owner-recovery rotasıyla yapılır.
  app.patch("/api/admin/users/:id", async (c: any, next: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isOwnerRole(current.role)) return next();

    const target = await targetUser(c, text(c.req.param("id")));
    if (!target || !isOwnerRole(effectiveRole(target))) return next();

    const body = await bodyOf(c);
    const requestedEmail = body.email === undefined ? text(target.email) : text(body.email).toLocaleLowerCase("tr-TR");
    if (requestedEmail !== text(target.email).toLocaleLowerCase("tr-TR")) {
      return c.json(
        jsonError(
          "OWNER_EMAIL_SECURITY_ROUTE_REQUIRED",
          "Uygulama sahibi kurtarma e-postası yalnız Güvenlik > Uygulama Sahibi Kurtarma alanından Authenticator doğrulamasıyla değiştirilebilir.",
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

    // Crafted API isteklerinde gönderilse bile role/company/emailVerified/approval/policy/session/MFA alanlarına dokunulmaz.
    await audit(c, current, target, "OWNER_PROFILE_UPDATED_SECURITY_FIELDS_LOCKED", {
      ignoredFields: [
        "role", "mainCompanySlug", "isActive", "emailVerified", "approvalRequired",
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
        sessionSeconds: Math.min(Number(updated.session_seconds || 28800), 28800),
        googleMfaEnabled: Boolean(updated.google_mfa_enabled),
        microsoftMfaEnabled: Boolean(updated.microsoft_mfa_enabled),
      },
    });
  });
}
