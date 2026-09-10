// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type AnyRow = Record<string, any>;

const ACTION_SCOPE = "AUTH_SECURITY_ACTION";
const DEVICE_SCOPE = "AUTH_PUSH_DEVICE";
const ACTION_SECONDS = 10 * 60;
const QUESTION_ITERATIONS = 180000;
const VAPID_SECRET_KEY = "VAPID_P256_KEYPAIR_V1";
const VAPID_SUBJECT = "mailto:admin@kyerp.net";
const ALLOWED_ACTIONS = new Set(["OWNER_RECOVERY_QUESTIONS_UPDATE"]);

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toUpperCase().replace(/İ/g, "I"); }
function nowIso() { return new Date().toISOString(); }
function addSeconds(seconds: number) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function clientIp(c: any) { return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]); }
function userAgent(c: any) { return text(c.req.header("User-Agent")).slice(0, 300); }
function jsonError(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
function objectOf(value: unknown): AnyRow {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRow;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
async function bodyOf(c: any) {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as AnyRow : {};
  } catch { return {}; }
}
function isSuper(role: unknown) { return ["SUPER_ADMIN", "ADMIN"].includes(upper(role)); }
function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlToBytes(value: unknown) {
  const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function encodeJson(value: unknown) { return base64Url(new TextEncoder().encode(JSON.stringify(value))); }
function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
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
function normalizeAnswer(value: unknown) {
  return text(value).normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}
async function pbkdf2Hash(value: string, salt: string, iterations = QUESTION_ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations }, material, 256);
  return base64Url(new Uint8Array(bits));
}
async function hashQuestionAnswer(answer: unknown) {
  const salt = randomToken(18);
  const normalized = normalizeAnswer(answer);
  return { hash: await pbkdf2Hash(normalized, salt), salt, iterations: QUESTION_ITERATIONS };
}

async function tableExists(c: any, tableName: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(tableName).first<AnyRow>();
  return Boolean(row?.name);
}
async function requireSecurityStorage(c: any) {
  const required = ["json_store", "auth_users", "auth_user_security", "auth_owner_recovery_questions", "auth_security_audit"];
  for (const tableName of required) if (!(await tableExists(c, tableName))) return false;
  return true;
}
async function storeGet(c: any, scope: string, fileName: string) {
  const row = await c.env.DB.prepare(
    `SELECT id,scope,main_company_slug,file_name,data,created_at,updated_at FROM json_store
      WHERE scope=? AND file_name=? ORDER BY updated_at DESC,id DESC LIMIT 1`,
  ).bind(scope, fileName).first<AnyRow>();
  if (!row) return null;
  const data = objectOf(row.data);
  return { ...data, storeId: text(row.id), fileName: text(row.file_name), createdAt: text(data.createdAt || row.created_at), updatedAt: text(data.updatedAt || row.updated_at) };
}
async function storeList(c: any, scope: string) {
  const result = await c.env.DB.prepare(
    `SELECT id,scope,main_company_slug,file_name,data,created_at,updated_at FROM json_store
      WHERE scope=? ORDER BY updated_at DESC,id DESC`,
  ).bind(scope).all<AnyRow>();
  return (result.results || []).map((row: AnyRow) => {
    const data = objectOf(row.data);
    return { ...data, storeId: text(row.id), fileName: text(row.file_name), createdAt: text(data.createdAt || row.created_at), updatedAt: text(data.updatedAt || row.updated_at) };
  });
}
async function storePut(c: any, scope: string, fileName: string, companySlug: string, data: AnyRow) {
  const current = await storeGet(c, scope, fileName);
  const timestamp = nowIso();
  const payload = { ...data, id: text(data.id || fileName), mainCompanySlug: text(data.mainCompanySlug || companySlug), createdAt: text(data.createdAt || current?.createdAt || timestamp), updatedAt: timestamp };
  if (current?.storeId) {
    await c.env.DB.prepare("UPDATE json_store SET main_company_slug=?,data=?,updated_at=? WHERE id=? AND scope=?")
      .bind(companySlug || null, JSON.stringify(payload), timestamp, current.storeId, scope).run();
    return { ...payload, storeId: current.storeId, fileName };
  }
  const storeId = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .bind(storeId, scope, companySlug || null, fileName, JSON.stringify(payload), timestamp, timestamp).run();
  return { ...payload, storeId, fileName };
}
async function atomicActionUpdate(c: any, current: AnyRow, expectedStatus: string, patch: AnyRow) {
  if (!current?.storeId) return { changed: false, row: current || null };
  const timestamp = nowIso();
  const next = { ...current, ...patch, updatedAt: timestamp };
  delete next.storeId; delete next.fileName;
  const result = await c.env.DB.prepare(
    `UPDATE json_store SET data=?,updated_at=? WHERE id=? AND scope=?
      AND UPPER(COALESCE(json_extract(data,'$.status'),''))=?
      AND COALESCE(json_extract(data,'$.consumedAt'),'')=''`,
  ).bind(JSON.stringify(next), timestamp, current.storeId, ACTION_SCOPE, upper(expectedStatus)).run();
  const changed = Number(result?.meta?.changes || 0) > 0;
  return { changed, row: changed ? { ...next, storeId: current.storeId, fileName: current.id } : await storeGet(c, ACTION_SCOPE, text(current.id)) };
}
async function audit(c: any, action: string, actorUserId = "", targetUserId = "", companySlug = "", detail: AnyRow = {}) {
  try {
    await c.env.DB.prepare(
      "INSERT INTO auth_security_audit(id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(crypto.randomUUID(), actorUserId || null, targetUserId || null, companySlug || null, action, null, clientIp(c) || null, JSON.stringify(detail || {}), nowIso()).run();
  } catch {}
}
async function requireOwner(c: any) {
  const current = await getAuthenticatedUser(c);
  if (!current) return { error: c.json(jsonError("UNAUTHORIZED", "Oturum gerekli."), 401) };
  if (!isSuper(current.role)) return { error: c.json(jsonError("OWNER_ONLY", "Bu işlem yalnız Süper Yönetici hesabına açıktır."), 403) };
  return { current };
}

async function verifyDeviceAuth(c: any, device: AnyRow) {
  if (device?.securityApp !== true) return false;
  const jwk = objectOf(device?.decisionPublicKeyJwk);
  const timestamp = text(c.req.header("X-KYERP-Security-Timestamp"));
  const signature = text(c.req.header("X-KYERP-Security-Signature"));
  const timestampMs = Number(timestamp);
  if (!jwk?.kty || !jwk?.crv || !jwk?.x || !jwk?.y || !timestamp || !signature || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 120000) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const method = upper(c.req.method || "GET");
    const pathname = new URL(c.req.url).pathname;
    const message = new TextEncoder().encode(`KYERP-DEVICE-AUTH-V1|${text(device.id)}|${method}|${pathname}|${timestamp}`);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, base64UrlToBytes(signature), message);
  } catch { return false; }
}
async function verifyDecision(device: AnyRow, id: string, decision: string, signatureValue: unknown) {
  const jwk = objectOf(device?.decisionPublicKeyJwk);
  const signature = text(signatureValue);
  if (device?.securityApp !== true || !jwk?.kty || !jwk?.crv || !jwk?.x || !jwk?.y || !signature) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const message = new TextEncoder().encode(`KYERP-DECISION-V1|${text(device.id)}|SECURITY_ACTION|${id}|${decision}`);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, base64UrlToBytes(signature), message);
  } catch { return false; }
}
async function deviceActor(c: any) {
  const deviceId = text(c.req.header("X-KYERP-Push-Device"));
  const token = text(c.req.header("X-KYERP-Push-Token"));
  if (!deviceId || !token) return null;
  const device = await storeGet(c, DEVICE_SCOPE, deviceId);
  if (!device || device.securityApp !== true || device.isActive === false) return null;
  if (!safeEqual(text(device.deviceTokenHash), await sha256(token))) return null;
  if (!(await verifyDeviceAuth(c, device))) return null;
  const user = await c.env.DB.prepare(
    `SELECT u.id,u.username,u.full_name,u.role,u.is_active,s.role_override,s.main_company_slug
       FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.id=? LIMIT 1`,
  ).bind(text(device.userId)).first<AnyRow>();
  if (!user || !Boolean(user.is_active)) return null;
  const role = upper(user.role_override || user.role);
  return { device, userId: text(user.id), role: role === "ADMIN" ? "SUPER_ADMIN" : role, companySlug: text(user.main_company_slug || device.mainCompanySlug), fullName: text(user.full_name || user.username) };
}
async function activeSecurityDevices(c: any, userId: string) {
  const rows = await storeList(c, DEVICE_SCOPE);
  return rows.filter((row: AnyRow) => text(row.userId) === userId && row.securityApp === true && row.isActive !== false && !text(row.retiredAt) && !text(row.retiredReason));
}

async function ensureVapidKeyPair(c: any) {
  let row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key=? LIMIT 1").bind(VAPID_SECRET_KEY).first<AnyRow>();
  if (row?.secret_value) {
    try { const parsed = JSON.parse(text(row.secret_value)); if (parsed?.privateJwk && parsed?.publicKey) return parsed; } catch {}
  }
  const generated = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", generated.privateKey);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", generated.publicKey));
  const pair = { privateJwk, publicKey: base64Url(publicRaw), createdAt: nowIso() };
  const timestamp = nowIso();
  await c.env.DB.prepare("INSERT OR IGNORE INTO auth_system_secrets(secret_key,secret_value,created_at,updated_at) VALUES (?,?,?,?)")
    .bind(VAPID_SECRET_KEY, JSON.stringify(pair), timestamp, timestamp).run();
  row = await c.env.DB.prepare("SELECT secret_value FROM auth_system_secrets WHERE secret_key=? LIMIT 1").bind(VAPID_SECRET_KEY).first<AnyRow>();
  const stored = JSON.parse(text(row?.secret_value) || "{}");
  if (!stored?.privateJwk || !stored?.publicKey) throw new Error("VAPID anahtarı hazırlanamadı.");
  return stored;
}
async function sendWake(c: any, device: AnyRow) {
  const endpoint = text(device.pushEndpoint);
  if (!endpoint) return false;
  try {
    const pair = await ensureVapidKeyPair(c);
    const audience = new URL(endpoint).origin;
    const header = encodeJson({ typ: "JWT", alg: "ES256" });
    const payload = encodeJson({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: VAPID_SUBJECT });
    const input = `${header}.${payload}`;
    const key = await crypto.subtle.importKey("jwk", pair.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input)));
    const response = await fetch(endpoint, { method: "POST", headers: { TTL: "60", Urgency: "high", Authorization: `vapid t=${input}.${base64Url(signature)}, k=${pair.publicKey}` } });
    return response.ok;
  } catch { return false; }
}
async function sendWakeMany(c: any, devices: AnyRow[]) {
  let sent = 0;
  const seen = new Set<string>();
  for (const device of devices) {
    const endpoint = text(device.pushEndpoint);
    if (!endpoint || seen.has(endpoint)) continue;
    seen.add(endpoint);
    if (await sendWake(c, device)) sent += 1;
  }
  return sent;
}

async function actionFromToken(c: any, idValue: unknown, tokenValue: unknown) {
  const id = text(idValue); const token = text(tokenValue);
  if (!id || !token) return null;
  let row = await storeGet(c, ACTION_SCOPE, id);
  if (!row || !safeEqual(text(row.actionTokenHash), await sha256(token))) return null;
  if (upper(row.status) === "PENDING" && Date.parse(text(row.expiresAt)) <= Date.now()) {
    const updated = await atomicActionUpdate(c, row, "PENDING", { status: "EXPIRED", consumedAt: nowIso() });
    row = updated.row || row;
  }
  return row;
}
async function recoveryReadiness(c: any, userId: string) {
  const security = await c.env.DB.prepare("SELECT email,email_verified,recovery_phone,recovery_phone_verified FROM auth_user_security WHERE user_id=? LIMIT 1").bind(userId).first<AnyRow>();
  const count = Number((await c.env.DB.prepare("SELECT COUNT(*) AS total FROM auth_owner_recovery_questions WHERE user_id=?").bind(userId).first<AnyRow>())?.total || 0);
  const emailReady = Boolean(security?.email_verified && text(security?.email) && text(c.env.RESEND_API_KEY));
  const smsReady = false;
  const ready = count >= 3 && (emailReady || smsReady);
  await c.env.DB.prepare("UPDATE auth_user_security SET owner_recovery_enabled=?,updated_at=? WHERE user_id=?").bind(ready ? 1 : 0, nowIso(), userId).run();
  return { ready, questionCount: count, emailReady, smsReady };
}
async function retireLegacyRecoveryCodes(c: any, userId: string) {
  if (!(await tableExists(c, "auth_recovery_codes"))) return;
  const timestamp = nowIso();
  await c.env.DB.prepare("UPDATE auth_recovery_codes SET used_at=COALESCE(used_at,?) WHERE user_id=? AND used_at IS NULL").bind(timestamp, userId).run();
}

export function registerSecurityActionRoutes(app: any) {
  app.post("/api/admin/security/actions/start", async (c: any) => {
    if (!(await requireSecurityStorage(c))) return c.json(jsonError("SECURITY_SCHEMA_UNAVAILABLE", "Güvenlik veritabanı hazır değil; işlem güvenli biçimde durduruldu."), 503);
    const auth = await requireOwner(c); if (auth.error) return auth.error;
    const body = await bodyOf(c);
    const actionType = upper(body.actionType);
    if (!ALLOWED_ACTIONS.has(actionType)) return c.json(jsonError("SECURITY_ACTION_UNSUPPORTED", "Bu kritik güvenlik işlemi desteklenmiyor."), 400);
    const devices = await activeSecurityDevices(c, text(auth.current.id));
    if (!devices.length) return c.json(jsonError("SECURITY_DEVICE_REQUIRED", "Aktif KY ERP Güvenlik telefonu bulunamadı. Önce güvenilir telefonu bağlayın."), 409);

    const id = crypto.randomUUID();
    const token = randomToken(32);
    const companySlug = text(auth.current.mainCompanySlug || auth.current.main_company_slug);
    const requestedAt = nowIso();
    const expiresAt = addSeconds(ACTION_SECONDS);
    await storePut(c, ACTION_SCOPE, id, companySlug, {
      id, userId: text(auth.current.id), mainCompanySlug: companySlug, actionType,
      actionTokenHash: await sha256(token), status: "PENDING", requestedAt, expiresAt,
      decidedAt: "", decidedByDeviceId: "", consumedAt: "", sourceIp: clientIp(c), sourceUserAgent: userAgent(c),
    });
    const sent = await sendWakeMany(c, devices);
    await audit(c, sent ? "SECURITY_ACTION_REQUESTED" : "SECURITY_ACTION_PUSH_DEFERRED", auth.current.id, auth.current.id, companySlug, { actionId: id, actionType, notifiedDevices: sent });
    return c.json({ ok: true, data: { actionId: id, actionToken: token, actionType, status: "PENDING", expiresAt, notifiedDevices: sent, pushDelivered: sent > 0 } });
  });

  app.post("/api/admin/security/actions/:id/status", async (c: any) => {
    const auth = await requireOwner(c); if (auth.error) return auth.error;
    const body = await bodyOf(c);
    const action = await actionFromToken(c, c.req.param("id"), body.actionToken);
    if (!action || text(action.userId) !== text(auth.current.id)) return c.json(jsonError("SECURITY_ACTION_INVALID", "Güvenlik onayı bulunamadı veya bu hesaba ait değil."), 401);
    return c.json({ ok: true, data: { actionId: action.id, actionType: action.actionType, status: upper(action.status), expiresAt: action.expiresAt, decidedAt: action.decidedAt || null, consumedAt: action.consumedAt || null } });
  });

  app.get("/api/auth/security-actions/device/pending", async (c: any) => {
    if (!(await requireSecurityStorage(c))) return c.json(jsonError("SECURITY_SCHEMA_UNAVAILABLE", "Güvenlik veritabanı hazır değil."), 503);
    const actor = await deviceActor(c);
    if (!actor) return c.json(jsonError("SECURITY_DEVICE_UNAUTHORIZED", "Güvenlik cihazı doğrulanamadı."), 401);
    const rows = (await storeList(c, ACTION_SCOPE)).filter((row: AnyRow) => text(row.userId) === actor.userId && !text(row.consumedAt));
    const pending: AnyRow[] = [];
    for (let row of rows) {
      if (upper(row.status) === "PENDING" && Date.parse(text(row.expiresAt)) <= Date.now()) {
        const update = await atomicActionUpdate(c, row, "PENDING", { status: "EXPIRED", consumedAt: nowIso() });
        row = update.row || row;
      }
      if (upper(row.status) !== "PENDING") continue;
      pending.push({ id: row.id, kind: "SECURITY_ACTION", actionType: row.actionType, title: row.actionType === "OWNER_RECOVERY_QUESTIONS_UPDATE" ? "Güvenlik sorularını değiştir" : "Kritik güvenlik işlemi", requestedAt: row.requestedAt, expiresAt: row.expiresAt, sourceIp: row.sourceIp, sourceUserAgent: row.sourceUserAgent });
    }
    return c.json({ ok: true, data: { items: pending } });
  });

  app.post("/api/auth/security-actions/device/decision", async (c: any) => {
    if (!(await requireSecurityStorage(c))) return c.json(jsonError("SECURITY_SCHEMA_UNAVAILABLE", "Güvenlik veritabanı hazır değil."), 503);
    const actor = await deviceActor(c);
    if (!actor) return c.json(jsonError("SECURITY_DEVICE_UNAUTHORIZED", "Güvenlik cihazı doğrulanamadı."), 401);
    const body = await bodyOf(c);
    const id = text(body.id);
    const decision = upper(body.decision);
    if (!id || !["APPROVED", "DENIED"].includes(decision)) return c.json(jsonError("SECURITY_ACTION_DECISION_INVALID", "Onay veya ret kararı gerekli."), 400);
    const action = await storeGet(c, ACTION_SCOPE, id);
    if (!action || text(action.userId) !== actor.userId) return c.json(jsonError("SECURITY_ACTION_NOT_FOUND", "Güvenlik işlemi bulunamadı."), 404);
    if (upper(action.status) !== "PENDING" || text(action.consumedAt)) return c.json(jsonError("SECURITY_ACTION_ALREADY_DECIDED", "Bu güvenlik işlemi daha önce sonuçlandırıldı."), 409);
    if (Date.parse(text(action.expiresAt)) <= Date.now()) {
      await atomicActionUpdate(c, action, "PENDING", { status: "EXPIRED", consumedAt: nowIso() });
      return c.json(jsonError("SECURITY_ACTION_EXPIRED", "Güvenlik onayının süresi doldu."), 409);
    }
    if (!(await verifyDecision(actor.device, id, decision, body.signature))) return c.json(jsonError("SECURITY_ACTION_SIGNATURE_INVALID", "Cihaz karar imzası doğrulanamadı."), 401);
    const update = await atomicActionUpdate(c, action, "PENDING", { status: decision, decidedAt: nowIso(), decidedByDeviceId: actor.device.id, consumedAt: decision === "DENIED" ? nowIso() : "" });
    if (!update.changed) return c.json(jsonError("SECURITY_ACTION_ALREADY_DECIDED", "Bu güvenlik işlemi aynı anda başka bir karar ile sonuçlandırıldı."), 409);
    await audit(c, decision === "APPROVED" ? "SECURITY_ACTION_APPROVED" : "SECURITY_ACTION_DENIED", actor.userId, actor.userId, actor.companySlug, { actionId: id, actionType: action.actionType, deviceId: actor.device.id });
    return c.json({ ok: true, data: { id, status: decision } });
  });

  app.put("/api/admin/security/owner-recovery/questions/secure", async (c: any) => {
    if (!(await requireSecurityStorage(c))) return c.json(jsonError("SECURITY_SCHEMA_UNAVAILABLE", "Güvenlik veritabanı hazır değil; sorular değiştirilmedi."), 503);
    const auth = await requireOwner(c); if (auth.error) return auth.error;
    const body = await bodyOf(c);
    const action = await actionFromToken(c, body.actionId, body.actionToken);
    if (!action || text(action.userId) !== text(auth.current.id) || upper(action.actionType) !== "OWNER_RECOVERY_QUESTIONS_UPDATE") return c.json(jsonError("SECURITY_ACTION_INVALID", "KY Güvenlik telefon onayı bu işlem için geçerli değil."), 401);
    if (upper(action.status) !== "APPROVED" || text(action.consumedAt)) return c.json(jsonError("SECURITY_ACTION_NOT_APPROVED", "KY Güvenlik telefonundan onay tamamlanmadı veya daha önce kullanıldı."), 409);

    const incoming = Array.isArray(body.questions) ? body.questions.slice(0, 3) : [];
    if (incoming.length !== 3) return c.json(jsonError("QUESTIONS_REQUIRED", "Tam olarak 3 özel güvenlik sorusu tanımlayın."), 400);
    const existing = (await c.env.DB.prepare("SELECT * FROM auth_owner_recovery_questions WHERE user_id=? ORDER BY position").bind(auth.current.id).all<AnyRow>()).results || [];
    const statements: any[] = [];
    const expected: Array<{ position: number; question: string }> = [];
    const timestamp = nowIso();
    for (let index = 0; index < 3; index += 1) {
      const position = index + 1;
      const question = text(incoming[index]?.question).slice(0, 220);
      const answer = normalizeAnswer(incoming[index]?.answer);
      const old = existing.find((row: AnyRow) => Number(row.position) === position);
      if (question.length < 6) return c.json(jsonError("QUESTION_TOO_SHORT", `${position}. soru en az 6 karakter olmalıdır.`), 400);
      if (!answer && (!old || text(old.question_text) !== question)) return c.json(jsonError("ANSWER_REQUIRED", `${position}. soru için yeni cevap girin.`), 400);
      expected.push({ position, question });
      if (old && !answer && text(old.question_text) === question) continue;
      const hashed = await hashQuestionAnswer(answer);
      if (old) statements.push(c.env.DB.prepare("UPDATE auth_owner_recovery_questions SET question_text=?,answer_hash=?,answer_salt=?,answer_iterations=?,updated_at=? WHERE id=? AND user_id=?").bind(question, hashed.hash, hashed.salt, hashed.iterations, timestamp, old.id, auth.current.id));
      else statements.push(c.env.DB.prepare("INSERT INTO auth_owner_recovery_questions(id,user_id,position,question_text,answer_hash,answer_salt,answer_iterations,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), auth.current.id, position, question, hashed.hash, hashed.salt, hashed.iterations, timestamp, timestamp));
    }
    if (statements.length) await c.env.DB.batch(statements);

    const readBack = (await c.env.DB.prepare("SELECT position,question_text,answer_hash,answer_salt,answer_iterations,updated_at FROM auth_owner_recovery_questions WHERE user_id=? ORDER BY position").bind(auth.current.id).all<AnyRow>()).results || [];
    const verified = readBack.length === 3 && expected.every((item, index) => Number(readBack[index]?.position) === item.position && text(readBack[index]?.question_text) === item.question && Boolean(text(readBack[index]?.answer_hash)) && Boolean(text(readBack[index]?.answer_salt)) && Number(readBack[index]?.answer_iterations || 0) >= 100000);
    if (!verified) {
      await audit(c, "OWNER_RECOVERY_QUESTIONS_READBACK_FAILED", auth.current.id, auth.current.id, text(action.mainCompanySlug), { actionId: action.id, rowCount: readBack.length });
      return c.json(jsonError("RECOVERY_READBACK_FAILED", "Güvenlik soruları yazıldıktan sonra doğrulanamadı; telefon onayı tüketilmedi. Tekrar deneyin."), 500);
    }

    await retireLegacyRecoveryCodes(c, auth.current.id);
    const readiness = await recoveryReadiness(c, auth.current.id);
    const consumed = await atomicActionUpdate(c, action, "APPROVED", { consumedAt: nowIso() });
    if (!consumed.changed) return c.json(jsonError("SECURITY_ACTION_CONSUMED", "KY Güvenlik onayı başka bir işlem tarafından kullanıldı."), 409);
    await audit(c, "OWNER_RECOVERY_QUESTIONS_UPDATED", auth.current.id, auth.current.id, text(action.mainCompanySlug), { actionId: action.id, readBackVerified: true, questionCount: 3, recoveryEnabled: readiness.ready, legacyRecoveryCodesRetired: true });
    return c.json({ ok: true, data: { saved: true, readBackVerified: true, recoveryEnabled: readiness.ready, legacyRecoveryCodesRetired: true, questions: readBack.map((row: AnyRow) => ({ position: Number(row.position), question: text(row.question_text), configured: true, updatedAt: row.updated_at })) } });
  });
}
