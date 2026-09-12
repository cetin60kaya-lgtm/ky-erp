// @ts-nocheck
import { hash } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

const OTP_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_HOUR = 5;
const RESEND_SECONDS = 60;
const ADMIN_EMAIL_FROM = "KY ERP <admin@kyerp.net>";
const MODULE_KEYS = ["DASHBOARD","MUHASEBE","FIRMA_CARI","BELGE_ISLEM","KDV","CEK_ODEME","DESEN","IMALAT","BOYAHANE","IK","GUNLUK_OPERASYON","ISNET","MAIL","STORAGE_ADMIN","COMPLIANCE","ASISTAN","ADMIN","RAPORLAR"];
const MANAGED_ROLES = ["COMPANY_ADMIN","MUHASEBE","DESEN","IMALAT","BOYAHANE","IK","DENETIM","VIEWER"];
const LOGIN_POLICIES = ["PASSWORD_ONLY","GOOGLE","MICROSOFT","ANY_MFA","BOTH_MFA"];

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toUpperCase().replace(/İ/g, "I"); }
function nowIso() { return new Date().toISOString(); }
function addSeconds(seconds: number) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function isOwner(role: unknown) { return ["SUPER_ADMIN", "ADMIN"].includes(upper(role)); }
function boolValue(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["0","FALSE","NO","OFF","HAYIR"].includes(upper(value));
}
function clientIp(c: any) { return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]); }
function jsonError(code: string, message: string, details?: unknown) { return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }; }
async function bodyOf(c: any) { try { const value = await c.req.json(); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function safeEqual(left: string, right: string) { if (left.length !== right.length) return false; let diff = 0; for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; }
function randomToken(bytes = 32) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function sixDigitCode() { const bytes = new Uint32Array(1); crypto.getRandomValues(bytes); return String(bytes[0] % 1_000_000).padStart(6, "0"); }
function maskEmail(value: string) { const [local, domain] = text(value).split("@"); if (!local || !domain) return ""; return `${local.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`; }
async function tableExists(c: any, table: string) { const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first(); return Boolean(row?.name); }

function deliveryCapabilities(c: any) {
  const env = c.env as AnyRow;
  const resend = Boolean(env.RESEND_API_KEY);
  return {
    email: resend,
    emailProvider: resend ? "RESEND" : "NONE",
    emailConfirmation: "PROVIDER_ACCEPTED",
    emailSender: ADMIN_EMAIL_FROM,
    sms: false,
    smsProvider: "NONE",
  };
}

async function acceptedMessageId(response: Response) {
  const headerId = text(response.headers.get("x-request-id") || response.headers.get("x-message-id"));
  let payload: AnyRow = {};
  try { payload = await response.clone().json(); } catch {}
  return text(payload?.id || payload?.messageId || payload?.requestId || headerId);
}

async function sendEmail(c: any, destination: string, code: string) {
  const env = c.env as AnyRow;
  if (!env.RESEND_API_KEY) throw new Error("Resend API anahtarı Worker'a bağlı değil.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${text(env.RESEND_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ADMIN_EMAIL_FROM,
      to: [destination],
      subject: "KY ERP e-posta doğrulama kodu",
      text: `KY ERP e-posta doğrulama kodunuz: ${code}\n\nBu kod 10 dakika geçerlidir. Bu işlemi siz başlatmadıysanız kodu paylaşmayın.`,
    }),
  });
  if (!response.ok) {
    let detail = "";
    try { detail = text((await response.json())?.message); } catch {}
    throw new Error(detail || "Resend e-posta isteğini kabul etmedi.");
  }
  const messageId = await acceptedMessageId(response);
  if (!messageId) throw new Error("Resend kabul kimliği dönmedi; gönderim doğrulanamadı.");
  return { provider: "RESEND", messageId, sender: ADMIN_EMAIL_FROM };
}

async function audit(c: any, action: string, actorId: string, targetId: string, detail: AnyRow = {}) {
  if (!(await tableExists(c, "auth_security_audit"))) return;
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit
        (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), actorId || null, targetId || null, null, action, null, clientIp(c) || null, JSON.stringify(detail), nowIso()).run();
  } catch {}
}

async function targetUser(c: any, id: string) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.is_active,s.email,s.email_verified,s.main_company_slug,
            COALESCE(NULLIF(TRIM(s.role_override),''),u.role,'VIEWER') AS effective_role
       FROM auth_users u
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(id).first<AnyRow>();
}

function canonicalPermissions(role: string, source: unknown) {
  if (role === "DENETIM") {
    return MODULE_KEYS.map((moduleKey) => ({ moduleKey, canView: moduleKey === "IK", canCreate: false, canUpdate: false, canDelete: false, canApprove: false }));
  }
  const rows = Array.isArray(source) ? source : [];
  const byKey = new Map(rows.map((row: AnyRow) => [upper(row?.moduleKey || row?.module_key), row]));
  return MODULE_KEYS.map((moduleKey) => {
    const row: AnyRow = byKey.get(moduleKey) || {};
    return {
      moduleKey,
      canView: boolValue(row.canView ?? row.can_view, false),
      canCreate: boolValue(row.canCreate ?? row.can_create, false),
      canUpdate: boolValue(row.canUpdate ?? row.can_update, false),
      canDelete: boolValue(row.canDelete ?? row.can_delete, false),
      canApprove: boolValue(row.canApprove ?? row.can_approve, false),
    };
  });
}

export function registerAdminManagementRoutes(app: any) {
  app.post("/api/admin/users/create-complete", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isOwner(current.role)) return c.json(jsonError("OWNER_ONLY", "Tam kullanıcı oluşturma yalnız uygulama sahibine açıktır."), current ? 403 : 401);
    const body = await bodyOf(c);
    const username = text(body.username).toLocaleLowerCase("tr-TR");
    const fullName = text(body.fullName);
    const email = text(body.email).toLocaleLowerCase("tr-TR");
    const password = String(body.password || "");
    const role = upper(body.role || "VIEWER");
    const companySlug = text(body.mainCompanySlug);
    const loginPolicy = LOGIN_POLICIES.includes(upper(body.loginPolicy)) ? upper(body.loginPolicy) : "ANY_MFA";
    const approvalRequired = boolValue(body.approvalRequired, false);
    const isActive = boolValue(body.isActive, true);
    const mustChangePassword = boolValue(body.mustChangePassword, true);

    if (!username || !fullName || password.length < 6) return c.json(jsonError("USER_FIELDS_REQUIRED", "Kullanıcı adı, ad soyad ve en az 6 karakter parola zorunludur."), 400);
    if (!MANAGED_ROLES.includes(role)) return c.json(jsonError("ROLE_INVALID", "Seçilen kullanıcı rolü oluşturma için geçerli değildir."), 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json(jsonError("EMAIL_INVALID", "Geçerli bir e-posta adresi girin."), 400);
    if (!companySlug) return c.json(jsonError("COMPANY_REQUIRED", "Kayıtlı ana firma seçilmelidir."), 400);

    const company = await c.env.DB.prepare("SELECT slug,name FROM main_companies WHERE slug=? AND COALESCE(is_active,1)<>0 LIMIT 1").bind(companySlug).first<AnyRow>();
    if (!company) return c.json(jsonError("COMPANY_NOT_FOUND", "Seçilen firma kayıtlı veya aktif değil."), 400);
    const duplicate = await c.env.DB.prepare(
      `SELECT u.id FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id
        WHERE LOWER(u.username)=LOWER(?) OR (?<>'' AND LOWER(COALESCE(s.email,''))=LOWER(?)) LIMIT 1`,
    ).bind(username,email,email).first<AnyRow>();
    if (duplicate) return c.json(jsonError("USER_EXISTS", "Kullanıcı adı veya e-posta zaten kullanılıyor."), 409);
    if (!(await tableExists(c,"ik_user_hr_scope"))) return c.json(jsonError("HR_SCOPE_SCHEMA_MISSING", "İK kullanıcı kapsam tablosu hazır değil."), 503);

    const id = crypto.randomUUID();
    const timestamp = nowIso();
    const storedRole = role === "COMPANY_ADMIN" ? "VIEWER" : role;
    const override = role === "COMPANY_ADMIN" ? "COMPANY_ADMIN" : null;
    const sessionSeconds = loginPolicy === "PASSWORD_ONLY" ? 28800 : 36000;
    const permissions = canonicalPermissions(role,body.permissions);
    const statements: any[] = [
      c.env.DB.prepare(
        `INSERT INTO auth_users(id,username,password_hash,full_name,role,is_active,must_change_password,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).bind(id,username,await hash(password,10),fullName,storedRole,isActive?1:0,mustChangePassword?1:0,timestamp,timestamp),
      c.env.DB.prepare(
        `INSERT INTO auth_user_security
         (user_id,email,main_company_slug,role_override,mfa_enabled,email_verified,approval_required,google_mfa_enabled,microsoft_mfa_enabled,login_policy,session_seconds,created_at,updated_at)
         VALUES (?,?,?,?,0,0,?,0,0,?,?,?,?)`,
      ).bind(id,email||null,companySlug,override,approvalRequired?1:0,loginPolicy,sessionSeconds,timestamp,timestamp),
      c.env.DB.prepare(
        `INSERT INTO ik_user_hr_scope(user_id,main_company_id,scope,updated_by,updated_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET main_company_id=excluded.main_company_id,scope=excluded.scope,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
      ).bind(id,companySlug,role==="DENETIM"?"AUDIT":"FULL",current.id,timestamp),
    ];
    for (const row of permissions) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO auth_user_module_permissions(id,user_id,module_key,can_view,can_create,can_update,can_delete,can_approve,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(crypto.randomUUID(),id,row.moduleKey,row.canView?1:0,row.canCreate?1:0,row.canUpdate?1:0,row.canDelete?1:0,row.canApprove?1:0,timestamp,timestamp));
    }
    try {
      await c.env.DB.batch(statements);
    } catch (error) {
      return c.json(jsonError("USER_CREATE_ATOMIC_FAILED","Kullanıcı, firma, yetki ve giriş politikası tek işlemde oluşturulamadı; hiçbir yarım kayıt bırakılmadı.",text(error?.message)),500);
    }
    await audit(c,"USER_CREATED_COMPLETE",current.id,id,{username,email,role,companySlug,loginPolicy,approvalRequired,permissionCount:permissions.filter((row)=>row.canView||row.canCreate||row.canUpdate||row.canDelete||row.canApprove).length});
    return c.json({ok:true,data:{id,username,fullName,email,role,mainCompanySlug:companySlug,isActive,loginPolicy,approvalRequired,mustChangePassword,permissions}},201);
  });

  app.get("/api/admin/security/delivery-capabilities", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isOwner(current.role)) return c.json(jsonError("OWNER_ONLY", "Bu bilgi yalnız uygulama sahibine açıktır."), current ? 403 : 401);
    return c.json({ ok: true, data: deliveryCapabilities(c) });
  });

  app.post("/api/admin/security/users/:id/email-verification/start", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isOwner(current.role)) return c.json(jsonError("OWNER_ONLY", "E-posta doğrulaması yalnız uygulama sahibi tarafından başlatılabilir."), current ? 403 : 401);
    if (!(await tableExists(c, "auth_owner_recovery_challenges"))) return c.json(jsonError("EMAIL_VERIFICATION_SCHEMA_MISSING", "Doğrulama tablosu hazır değil."), 503);
    const caps = deliveryCapabilities(c);
    if (!caps.email) return c.json(jsonError("DELIVERY_NOT_CONFIGURED", "Resend e-posta servisi Worker'a bağlı değil."), 503);
    const user = await targetUser(c, c.req.param("id"));
    if (!user) return c.json(jsonError("USER_NOT_FOUND", "Kullanıcı bulunamadı."), 404);
    const email = text(user.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json(jsonError("EMAIL_NOT_CONFIGURED", "Kullanıcıda geçerli bir e-posta adresi kayıtlı değil."), 400);
    if (Boolean(user.email_verified)) return c.json({ ok: true, data: { alreadyVerified: true, masked: maskEmail(email), sender: ADMIN_EMAIL_FROM } });

    const recent = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total,MAX(created_at) AS latest
         FROM auth_owner_recovery_challenges
        WHERE user_id=? AND purpose='USER_EMAIL_VERIFY' AND channel='EMAIL' AND created_at>?`,
    ).bind(user.id, addSeconds(-3600)).first<AnyRow>();
    if (Number(recent?.total || 0) >= MAX_SENDS_HOUR) return c.json(jsonError("RATE_LIMITED", "Bir saatlik doğrulama kodu gönderim sınırına ulaşıldı."), 429);
    if (recent?.latest && Date.now() - Date.parse(text(recent.latest)) < RESEND_SECONDS * 1000) return c.json(jsonError("RESEND_TOO_SOON", "Yeni kod istemeden önce 60 saniye bekleyin."), 429);

    const id = crypto.randomUUID();
    const challengeToken = randomToken(32);
    const otp = sixDigitCode();
    const salt = randomToken(12);
    const timestamp = nowIso();
    await c.env.DB.prepare(
      `INSERT INTO auth_owner_recovery_challenges
       (id,user_id,purpose,channel,destination_masked,challenge_token_hash,otp_hash,otp_salt,question_ids,attempt_count,answer_attempt_count,send_count,created_at,expires_at,ip_address)
       VALUES (?,?,?,?,?,?,?,?,?,0,0,1,?,?,?)`,
    ).bind(id,user.id,"USER_EMAIL_VERIFY","EMAIL",maskEmail(email),await sha256(challengeToken),await sha256(`${salt}:${otp}`),salt,"[]",timestamp,addSeconds(OTP_SECONDS),clientIp(c)||null).run();

    let accepted: { provider: string; messageId: string; sender: string };
    try {
      accepted = await sendEmail(c,email,otp);
    } catch (error) {
      await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET consumed_at=? WHERE id=?").bind(nowIso(),id).run();
      return c.json(jsonError("DELIVERY_FAILED", error?.message || "Doğrulama kodu gönderilemedi."),503);
    }
    await audit(c,"USER_EMAIL_VERIFICATION_ACCEPTED",current.id,user.id,{masked:maskEmail(email),provider:accepted.provider,providerMessageId:accepted.messageId,sender:accepted.sender});
    return c.json({ok:true,data:{verificationId:id,verificationToken:challengeToken,masked:maskEmail(email),expiresAt:addSeconds(OTP_SECONDS),deliveryStatus:"PROVIDER_ACCEPTED",provider:accepted.provider,providerMessageId:accepted.messageId,sender:accepted.sender}});
  });

  app.post("/api/admin/security/users/:id/email-verification/verify", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isOwner(current.role)) return c.json(jsonError("OWNER_ONLY", "E-posta doğrulaması yalnız uygulama sahibi tarafından tamamlanabilir."), current ? 403 : 401);
    const body = await bodyOf(c);
    const row = await c.env.DB.prepare(
      `SELECT * FROM auth_owner_recovery_challenges
        WHERE id=? AND user_id=? AND purpose='USER_EMAIL_VERIFY' AND channel='EMAIL'
          AND consumed_at IS NULL AND expires_at>? LIMIT 1`,
    ).bind(text(body.verificationId),c.req.param("id"),nowIso()).first<AnyRow>();
    if (!row || !safeEqual(text(row.challenge_token_hash),await sha256(text(body.verificationToken)))) return c.json(jsonError("VERIFICATION_INVALID", "Doğrulama isteği geçersiz veya süresi dolmuş."),401);
    if (row.locked_until && Date.parse(text(row.locked_until)) > Date.now()) return c.json(jsonError("VERIFICATION_LOCKED", "Çok fazla hatalı deneme yapıldı. 30 dakika sonra tekrar deneyin."),429);
    const otp = text(body.otp).replace(/\D/g,"");
    const valid = /^\d{6}$/.test(otp) && safeEqual(await sha256(`${text(row.otp_salt)}:${otp}`),text(row.otp_hash));
    if (!valid) {
      const attempts = Number(row.attempt_count || 0) + 1;
      const lockedUntil = attempts >= MAX_ATTEMPTS ? addSeconds(30*60) : null;
      await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET attempt_count=?,locked_until=? WHERE id=?").bind(attempts,lockedUntil,row.id).run();
      return c.json(jsonError("OTP_INVALID",lockedUntil?"Çok fazla hatalı kod girildi. 30 dakika kilitlendi.":"Doğrulama kodu hatalı."),lockedUntil?429:401);
    }
    const timestamp = nowIso();
    await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET verified_at=?,consumed_at=? WHERE id=?").bind(timestamp,timestamp,row.id).run();
    await c.env.DB.prepare("UPDATE auth_user_security SET email_verified=1,updated_at=? WHERE user_id=?").bind(timestamp,c.req.param("id")).run();
    await audit(c,"USER_EMAIL_VERIFIED",current.id,c.req.param("id"),{masked:row.destination_masked,sender:ADMIN_EMAIL_FROM});
    return c.json({ok:true,data:{verified:true,verifiedAt:timestamp,sender:ADMIN_EMAIL_FROM}});
  });
}
