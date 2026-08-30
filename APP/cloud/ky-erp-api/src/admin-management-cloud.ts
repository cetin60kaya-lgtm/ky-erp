// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;
const OTP_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_HOUR = 5;
const RESEND_SECONDS = 60;

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toLocaleUpperCase("tr-TR"); }
function nowIso() { return new Date().toISOString(); }
function addSeconds(seconds: number) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function isOwner(role: unknown) { return ["SUPER_ADMIN", "ADMIN"].includes(upper(role)); }
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
  const resend = Boolean(env.RESEND_API_KEY && env.RECOVERY_EMAIL_FROM);
  const webhook = Boolean(env.RECOVERY_EMAIL_WEBHOOK_URL);
  const twilio = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
  const smsWebhook = Boolean(env.RECOVERY_SMS_WEBHOOK_URL);
  return {
    email: resend || webhook,
    emailProvider: resend ? "RESEND" : webhook ? "WEBHOOK" : "NONE",
    sms: twilio || smsWebhook,
    smsProvider: twilio ? "TWILIO" : smsWebhook ? "WEBHOOK" : "NONE",
  };
}

async function sendEmail(c: any, destination: string, code: string) {
  const env = c.env as AnyRow;
  if (env.RECOVERY_EMAIL_WEBHOOK_URL) {
    const response = await fetch(text(env.RECOVERY_EMAIL_WEBHOOK_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "email", to: destination, code, purpose: "KY ERP e-posta doğrulama" }),
    });
    if (!response.ok) throw new Error("E-posta doğrulama webhook'u yanıt vermedi.");
    return;
  }
  if (!env.RESEND_API_KEY || !env.RECOVERY_EMAIL_FROM) throw new Error("E-posta doğrulama servisi bağlı değil.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${text(env.RESEND_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: text(env.RECOVERY_EMAIL_FROM),
      to: [destination],
      subject: "KY ERP e-posta doğrulama kodu",
      text: `KY ERP e-posta doğrulama kodunuz: ${code}\n\nBu kod 10 dakika geçerlidir. Bu işlemi siz başlatmadıysanız kodu paylaşmayın.`,
    }),
  });
  if (!response.ok) throw new Error("E-posta doğrulama kodu gönderilemedi.");
}

async function audit(c: any, action: string, actorId: string, targetId: string, detail: AnyRow = {}) {
  if (!(await tableExists(c, "auth_security_audit"))) return;
  await c.env.DB.prepare(
    `INSERT INTO auth_security_audit
      (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(crypto.randomUUID(), actorId || null, targetId || null, null, action, null, clientIp(c) || null, JSON.stringify(detail), nowIso()).run();
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

export function registerAdminManagementRoutes(app: any) {
  app.get("/api/admin/security/delivery-capabilities", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isOwner(current.role)) return c.json(jsonError("OWNER_ONLY", "Bu bilgi yalnız uygulama sahibine açıktır."), current ? 403 : 401);
    const caps = deliveryCapabilities(c);
    return c.json({ ok: true, data: caps });
  });

  app.post("/api/admin/security/users/:id/email-verification/start", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current || !isOwner(current.role)) return c.json(jsonError("OWNER_ONLY", "E-posta doğrulaması yalnız uygulama sahibi tarafından başlatılabilir."), current ? 403 : 401);
    if (!(await tableExists(c, "auth_owner_recovery_challenges"))) return c.json(jsonError("EMAIL_VERIFICATION_SCHEMA_MISSING", "Doğrulama tablosu hazır değil."), 503);
    const caps = deliveryCapabilities(c);
    if (!caps.email) return c.json(jsonError("DELIVERY_NOT_CONFIGURED", "E-posta doğrulama servisi Worker'a bağlı değil."), 503);
    const user = await targetUser(c, c.req.param("id"));
    if (!user) return c.json(jsonError("USER_NOT_FOUND", "Kullanıcı bulunamadı."), 404);
    const email = text(user.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json(jsonError("EMAIL_NOT_CONFIGURED", "Kullanıcıda geçerli bir e-posta adresi kayıtlı değil."), 400);
    if (Boolean(user.email_verified)) return c.json({ ok: true, data: { alreadyVerified: true, masked: maskEmail(email) } });

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
    try {
      await sendEmail(c,email,otp);
    } catch (error) {
      await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET consumed_at=? WHERE id=?").bind(nowIso(),id).run();
      return c.json(jsonError("DELIVERY_FAILED", error?.message || "Doğrulama kodu gönderilemedi."),503);
    }
    await audit(c,"USER_EMAIL_VERIFICATION_SENT",current.id,user.id,{masked:maskEmail(email),provider:caps.emailProvider});
    return c.json({ ok:true,data:{ verificationId:id,verificationToken:challengeToken,masked:maskEmail(email),expiresAt:addSeconds(OTP_SECONDS) } });
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
    await audit(c,"USER_EMAIL_VERIFIED",current.id,c.req.param("id"),{masked:row.destination_masked});
    return c.json({ok:true,data:{verified:true,verifiedAt:timestamp}});
  });
}
