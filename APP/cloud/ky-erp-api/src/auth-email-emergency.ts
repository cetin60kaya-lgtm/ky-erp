// @ts-nocheck
import { AUTH_SECURITY_SCOPES, securityStoreGet as storeGet } from "./auth-security-core";
import { cancelPhoneApproval, phoneApprovalFromRequest } from "./auth-push-cloud";

type AnyRow = Record<string, any>;

const EMAIL_PURPOSE = "EMAIL_EMERGENCY_LOGIN";
const EMAIL_SECONDS = 10 * 60;
const EMAIL_LOCK_SECONDS = 30 * 60;
const EMAIL_MAX_ATTEMPTS = 5;
const EMAIL_MAX_SENDS_HOUR = 5;
const EMAIL_RESEND_SECONDS = 60;
const ADMIN_EMAIL_FROM = "KY ERP <admin@kyerp.net>";
const PHONE_SCOPE = AUTH_SECURITY_SCOPES.PHONE_LOGIN;

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toUpperCase().replace(/İ/g, "I"); }
function nowIso() { return new Date().toISOString(); }
function addSeconds(seconds: number) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function jsonError(code: string, message: string) { return { ok: false, error: { code, message } }; }
function clientIp(c: any) { return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]); }
async function bodyOf(c: any) {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch { return {}; }
}
function maskEmail(value: unknown) {
  const email = text(value);
  const [local, domain] = email.split("@");
  return local && domain ? `${local.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}` : "";
}
function sixDigitCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}
function randomToken(bytes = 24) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function tableExists(c: any, table: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<AnyRow>();
  return Boolean(row?.name);
}

async function userById(c: any, userId: string) {
  return c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.role,u.is_active,
            s.email,s.email_verified,s.main_company_slug,s.role_override
       FROM auth_users u
       LEFT JOIN auth_user_security s ON s.user_id=u.id
      WHERE u.id=? LIMIT 1`,
  ).bind(userId).first<AnyRow>();
}

async function audit(c: any, action: string, user: AnyRow, detail: AnyRow = {}) {
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit
       (id,actor_user_id,target_user_id,main_company_slug,action,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(), user.id, user.id, text(user.main_company_slug),
      action, clientIp(c) || null, JSON.stringify(detail), nowIso(),
    ).run();
  } catch { /* audit must not block emergency verification */ }
}

function emailDeliveryConfigured(c: any) {
  return Boolean(c.env?.RECOVERY_EMAIL_WEBHOOK_URL || c.env?.RESEND_API_KEY);
}

async function sendEmailCode(c: any, destination: string, code: string) {
  const env = c.env as AnyRow;
  if (env.RECOVERY_EMAIL_WEBHOOK_URL) {
    const response = await fetch(text(env.RECOVERY_EMAIL_WEBHOOK_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.RECOVERY_EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${text(env.RECOVERY_EMAIL_WEBHOOK_TOKEN)}` } : {}),
      },
      body: JSON.stringify({ channel: "email", to: destination, code, purpose: "KY ERP e-posta kurtarma doğrulaması" }),
    });
    if (!response.ok) throw new Error("E-posta doğrulama servisi yanıt vermedi.");
    return;
  }
  if (!env.RESEND_API_KEY) throw new Error("E-posta doğrulama servisi bağlı değil.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${text(env.RESEND_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: text(env.RECOVERY_EMAIL_FROM || ADMIN_EMAIL_FROM),
      to: [destination],
      subject: "KY ERP e-posta doğrulama kodu",
      text: `KY ERP e-posta doğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir ve tek kullanımlıktır. Bu işlemi siz başlatmadıysanız kodu paylaşmayın.`,
    }),
  });
  if (!response.ok) throw new Error("E-posta doğrulama kodu gönderilemedi.");
}

async function challengeProof(c: any, body: AnyRow) {
  const phoneId = text(body.phoneApprovalId);
  const phoneToken = text(body.phoneApprovalToken);
  if (phoneId && phoneToken) {
    const approval = await phoneApprovalFromRequest(c, phoneId, phoneToken);
    if (!approval || upper(approval.status) !== "PENDING" || text(approval.consumedAt)) return null;
    return {
      userId: text(approval.userId), sourceType: "PHONE", sourceId: phoneId,
      deviceLabel: text(approval.deviceLabel), userAgent: text(approval.userAgent), ipAddress: text(approval.ipAddress),
    };
  }

  const challengeId = text(body.challengeId);
  const challengeToken = text(body.challengeToken);
  if (!challengeId || !challengeToken) return null;
  const challenge = await c.env.DB.prepare(
    "SELECT * FROM auth_login_challenges WHERE id=? AND consumed_at IS NULL AND expires_at>? LIMIT 1",
  ).bind(challengeId, nowIso()).first<AnyRow>();
  if (!challenge || !safeEqual(text(challenge.challenge_token_hash), await sha256(challengeToken))) return null;
  const type = upper(challenge.challenge_type);
  if (!["POLICY_MFA_REQUIRED", "POLICY_MFA_LEGACY_REQUIRED", "POLICY_MFA_SETUP_GOOGLE", "POLICY_MFA_SETUP_MICROSOFT"].includes(type)) return null;
  return {
    userId: text(challenge.user_id), sourceType: "CHALLENGE", sourceId: challengeId,
    deviceLabel: text(challenge.device_label), userAgent: text(challenge.user_agent), ipAddress: text(challenge.ip_address),
  };
}

async function sourceStillPending(c: any, metadata: AnyRow) {
  if (upper(metadata.sourceType) === "PHONE") {
    const approval = await storeGet(c, PHONE_SCOPE, text(metadata.sourceId));
    return Boolean(approval && upper(approval.status) === "PENDING" && !text(approval.consumedAt));
  }
  const challenge = await c.env.DB.prepare(
    "SELECT id FROM auth_login_challenges WHERE id=? AND consumed_at IS NULL AND expires_at>? LIMIT 1",
  ).bind(text(metadata.sourceId), nowIso()).first<AnyRow>();
  return Boolean(challenge?.id);
}

async function markSourceConsumed(c: any, metadata: AnyRow) {
  if (upper(metadata.sourceType) === "PHONE") {
    await cancelPhoneApproval(c, text(metadata.sourceId));
    return;
  }
  await c.env.DB.prepare("UPDATE auth_login_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL")
    .bind(nowIso(), text(metadata.sourceId)).run();
}

async function createEmailChallenge(c: any, user: AnyRow, proof: AnyRow) {
  if (!(await tableExists(c, "auth_owner_recovery_challenges"))) throw new Error("E-posta acil giriş şeması hazır değil.");
  const recent = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,MAX(created_at) AS latest
       FROM auth_owner_recovery_challenges
      WHERE user_id=? AND purpose=? AND created_at>?`,
  ).bind(user.id, EMAIL_PURPOSE, addSeconds(-3600)).first<AnyRow>();
  if (Number(recent?.total || 0) >= EMAIL_MAX_SENDS_HOUR) {
    await audit(c, "EMAIL_RECOVERY_RATE_LIMITED", user, { reason: "HOURLY_SEND_LIMIT" });
    const error: any = new Error("Bir saatlik e-posta kodu gönderim sınırına ulaşıldı.");
    error.code = "EMAIL_RECOVERY_RATE_LIMITED";
    error.status = 429;
    throw error;
  }
  if (recent?.latest && Date.now() - Date.parse(text(recent.latest)) < EMAIL_RESEND_SECONDS * 1000) {
    await audit(c, "EMAIL_RECOVERY_RATE_LIMITED", user, { reason: "RESEND_COOLDOWN" });
    const error: any = new Error("Yeni e-posta kodu istemeden önce 60 saniye bekleyin.");
    error.code = "EMAIL_RECOVERY_RATE_LIMITED";
    error.status = 429;
    throw error;
  }

  await c.env.DB.prepare(
    "UPDATE auth_owner_recovery_challenges SET consumed_at=COALESCE(consumed_at,?) WHERE user_id=? AND purpose=? AND consumed_at IS NULL",
  ).bind(nowIso(), user.id, EMAIL_PURPOSE).run();

  const id = crypto.randomUUID();
  const token = randomToken(24);
  const otp = sixDigitCode();
  const salt = randomToken(12);
  const timestamp = nowIso();
  const metadata = JSON.stringify({
    sourceType: proof.sourceType,
    sourceId: proof.sourceId,
    deviceLabel: proof.deviceLabel,
    userAgent: proof.userAgent,
    ipAddress: proof.ipAddress,
  });
  await c.env.DB.prepare(
    `INSERT INTO auth_owner_recovery_challenges
     (id,user_id,purpose,channel,destination_masked,challenge_token_hash,otp_hash,otp_salt,question_ids,
      attempt_count,answer_attempt_count,send_count,created_at,expires_at,ip_address)
     VALUES (?,?,?,?,?,?,?,?,?,0,0,1,?,?,?)`,
  ).bind(
    id, user.id, EMAIL_PURPOSE, "EMAIL", maskEmail(user.email), await sha256(token), await sha256(`${salt}:${otp}`), salt,
    metadata, timestamp, addSeconds(EMAIL_SECONDS), clientIp(c) || null,
  ).run();

  try {
    await sendEmailCode(c, text(user.email), otp);
  } catch (error) {
    await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET consumed_at=? WHERE id=?").bind(nowIso(), id).run();
    throw error;
  }
  await audit(c, "EMAIL_RECOVERY_CODE_SENT", user, { maskedEmail: maskEmail(user.email), sourceType: proof.sourceType });
  return { id, token, expiresAt: addSeconds(EMAIL_SECONDS) };
}

async function emailChallenge(c: any, body: AnyRow) {
  const row = await c.env.DB.prepare(
    `SELECT * FROM auth_owner_recovery_challenges
      WHERE id=? AND purpose=? AND consumed_at IS NULL LIMIT 1`,
  ).bind(text(body.emailEmergencyId), EMAIL_PURPOSE).first<AnyRow>();
  if (!row || !safeEqual(text(row.challenge_token_hash), await sha256(text(body.emailEmergencyToken)))) return null;
  return row;
}

export function registerAuthEmailEmergencyRoutes(app: any) {
  app.post("/api/auth/email-emergency/start", async (c: any) => {
    const body = await bodyOf(c);
    const proof = await challengeProof(c, body);
    if (!proof) return c.json(jsonError("EMAIL_EMERGENCY_PROOF_INVALID", "Önce kullanıcı adı, şifre ve normal güvenlik adımını başlatın."), 401);
    const user = await userById(c, proof.userId);
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("USER_UNAVAILABLE", "Kullanıcı hesabı aktif değil."), 403);
    if (!Boolean(user.email_verified)) return c.json(jsonError("EMAIL_RECOVERY_EMAIL_NOT_VERIFIED", "E-posta ile kurtarma için hesap e-posta adresinin önceden doğrulanmış olması gerekir."), 409);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(user.email))) return c.json(jsonError("EMAIL_RECOVERY_EMAIL_MISSING", "Hesapta kullanılabilir doğrulanmış bir e-posta adresi bulunmuyor."), 409);
    if (!emailDeliveryConfigured(c)) return c.json(jsonError("EMAIL_RECOVERY_DELIVERY_UNAVAILABLE", "E-posta doğrulama servisi Worker'a bağlı değil."), 503);
    try {
      const challenge = await createEmailChallenge(c, user, proof);
      return c.json({
        ok: true,
        stage: "EMAIL_RECOVERY_VERIFY",
        emailEmergencyId: challenge.id,
        emailEmergencyToken: challenge.token,
        emailEmergencyExpiresAt: challenge.expiresAt,
        maskedDestination: maskEmail(user.email),
        message: `${maskEmail(user.email)} adresine 6 haneli doğrulama kodu gönderildi.`,
      });
    } catch (error) {
      const status = Number((error as any)?.status || 503);
      const code = text((error as any)?.code) || "EMAIL_RECOVERY_SEND_FAILED";
      return c.json(jsonError(code, error instanceof Error ? error.message : "E-posta kodu gönderilemedi."), status);
    }
  });

  app.post("/api/auth/email-emergency/verify", async (c: any) => {
    const body = await bodyOf(c);
    const row = await emailChallenge(c, body);
    if (!row) return c.json(jsonError("EMAIL_RECOVERY_INVALID", "E-posta doğrulama isteği geçersiz veya daha önce kullanılmış."), 401);
    const user = await userById(c, text(row.user_id));
    if (!user || !Boolean(user.is_active)) return c.json(jsonError("USER_UNAVAILABLE", "Kullanıcı hesabı kullanılamıyor."), 403);
    if (Date.parse(text(row.expires_at)) <= Date.now()) {
      await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET consumed_at=COALESCE(consumed_at,?) WHERE id=?").bind(nowIso(), row.id).run();
      await audit(c, "EMAIL_RECOVERY_CODE_EXPIRED", user, { maskedEmail: maskEmail(user.email) });
      return c.json(jsonError("EMAIL_RECOVERY_CODE_EXPIRED", "E-posta doğrulama kodunun süresi doldu. Yeni kod isteyin."), 410);
    }
    if (row.locked_until && Date.parse(text(row.locked_until)) > Date.now()) {
      await audit(c, "EMAIL_RECOVERY_RATE_LIMITED", user, { reason: "ATTEMPT_LOCK" });
      return c.json(jsonError("EMAIL_RECOVERY_RATE_LIMITED", "Çok fazla hatalı deneme yapıldı. 30 dakika sonra tekrar deneyin."), 429);
    }

    const code = text(body.otp).replace(/\D/g, "");
    const validCode = /^\d{6}$/.test(code) && safeEqual(await sha256(`${text(row.otp_salt)}:${code}`), text(row.otp_hash));
    if (!validCode) {
      const attempts = Number(row.attempt_count || 0) + 1;
      const lockedUntil = attempts >= EMAIL_MAX_ATTEMPTS ? addSeconds(EMAIL_LOCK_SECONDS) : null;
      await c.env.DB.prepare("UPDATE auth_owner_recovery_challenges SET attempt_count=?,locked_until=COALESCE(?,locked_until) WHERE id=?")
        .bind(attempts, lockedUntil, row.id).run();
      await audit(c, "EMAIL_RECOVERY_CODE_FAILED", user, { attemptCount: attempts, locked: Boolean(lockedUntil) });
      if (lockedUntil) await audit(c, "EMAIL_RECOVERY_RATE_LIMITED", user, { reason: "MAX_ATTEMPTS", attemptCount: attempts });
      return c.json(
        jsonError("EMAIL_RECOVERY_CODE_FAILED", lockedUntil ? "Çok fazla hatalı kod girildi. E-posta doğrulaması 30 dakika kilitlendi." : "E-posta doğrulama kodu hatalı."),
        lockedUntil ? 429 : 401,
      );
    }
    if (!Boolean(user.email_verified)) return c.json(jsonError("EMAIL_RECOVERY_EMAIL_NOT_VERIFIED", "Doğrulanmış e-posta durumu değişti. Giriş ekranından yeniden başlayın."), 409);

    let metadata: AnyRow = {};
    try { metadata = JSON.parse(text(row.question_ids) || "{}"); } catch { metadata = {}; }
    if (!(await sourceStillPending(c, metadata))) return c.json(jsonError("EMAIL_EMERGENCY_SOURCE_FINISHED", "İlk giriş isteği artık beklemiyor. Giriş ekranından yeniden başlayın."), 409);

    const timestamp = nowIso();
    const claim = await c.env.DB.prepare(
      "UPDATE auth_owner_recovery_challenges SET verified_at=?,consumed_at=? WHERE id=? AND consumed_at IS NULL",
    ).bind(timestamp, timestamp, row.id).run();
    if (!Number(claim?.meta?.changes || 0)) return c.json(jsonError("EMAIL_EMERGENCY_CONSUMED", "Bu e-posta kodu daha önce kullanıldı."), 409);

    await markSourceConsumed(c, metadata);

    const approvalId = crypto.randomUUID();
    const approvalToken = randomToken(24);
    const companySlug = text(user.main_company_slug) || "mecit-hakan";
    await c.env.DB.prepare(
      `INSERT INTO auth_login_approvals
       (id,user_id,main_company_slug,approval_token_hash,status,device_label,user_agent,ip_address,requested_at,expires_at,decided_at,decided_by)
       VALUES (?,?,?,?, 'APPROVED',?,?,?,?,?,?,?)`,
    ).bind(
      approvalId, user.id, companySlug, await sha256(approvalToken),
      text(metadata.deviceLabel || "E-posta kurtarma"), text(metadata.userAgent), text(metadata.ipAddress || clientIp(c)),
      timestamp, addSeconds(10 * 60), timestamp, user.id,
    ).run();
    await audit(c, "EMAIL_RECOVERY_CODE_VERIFIED", user, {
      approvalId,
      maskedEmail: maskEmail(user.email),
      sourceType: metadata.sourceType,
      emailRecovery: true,
    });

    return c.json({
      ok: true,
      stage: "APPROVAL_PENDING",
      approvalId,
      approvalToken,
      approvalExpiresAt: addSeconds(10 * 60),
      emailEmergency: true,
      emailRecovery: true,
      recovery: { method: "EMAIL_RECOVERY", securityCenterRequired: false, phoneTrustPreserved: true },
      message: "E-posta doğrulandı. Güvenli oturum hazırlanıyor.",
    });
  });
}
