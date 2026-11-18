// KY ERP shared mobile passkey. No PIN, biometric, password or private key is received by the API.
// A verified WebAuthn assertion, bound to a fresh one-use server challenge, is mandatory.
import { getAuthenticatedUser } from "./auth-cloud";
import { securityStoreGet, securityStorePut } from "./auth-security-core";

type Row = Record<string, any>;
const SCOPE = "AUTH_MOBILE_PASSKEY_V1";
const RP_ID = "kyerp.net";
const ALLOWED_ORIGINS = new Set(["https://security.kyerp.net", "https://kyerp.net", "https://app.kyerp.net"]);
const encoder = new TextEncoder();
const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
function fail(c: any, code: string, message: string, status = 400) {
  return c.json({ ok: false, error: { code, message } }, status);
}
function decode(value: unknown, max = 8192): Uint8Array {
  const raw = text(value);
  if (!raw || raw.length > max || !/^[a-zA-Z0-9_-]+$/.test(raw)) throw new Error("INVALID_B64");
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), (char) => char.charCodeAt(0));
}
function equal(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) diff |= left[index] ^ right[index];
  return diff === 0;
}
async function digest(value: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", value));
}
function originFor(c: any) {
  const origin = text(c.req.header("Origin"));
  return ALLOWED_ORIGINS.has(origin) ? origin : "";
}
function checkedClientData(value: unknown, expectedType: string, challenge: string, origin: string) {
  const bytes = decode(value);
  if (bytes.length > 4096) throw new Error("CLIENT_DATA_SIZE");
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || data.type !== expectedType || data.challenge !== challenge || data.origin !== origin || data.crossOrigin === true) {
    throw new Error("CLIENT_DATA_INVALID");
  }
  return bytes;
}
async function checkedAuthData(value: unknown, requireAttested = false) {
  const bytes = decode(value, 4096);
  if (bytes.length < 37 || bytes.length > 2048) throw new Error("AUTH_DATA_SIZE");
  const rpHash = await digest(encoder.encode(RP_ID));
  if (!equal(bytes.slice(0, 32), rpHash)) throw new Error("RP_ID_INVALID");
  const flags = bytes[32];
  if (!(flags & 0x01) || !(flags & 0x04)) throw new Error("USER_VERIFICATION_REQUIRED");
  if (requireAttested && !(flags & 0x40)) throw new Error("ATTESTED_CREDENTIAL_REQUIRED");
  const counter = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(33, false);
  return { bytes, counter };
}
function signatureToRaw(der: Uint8Array): Uint8Array {
  // WebAuthn ECDSA signatures are DER; WebCrypto expects IEEE P1363 64-byte P-256 r||s.
  if (der.length < 8 || der.length > 74 || der[0] !== 0x30) throw new Error("SIGNATURE_INVALID");
  let pos = 1;
  let len = der[pos++];
  if (len & 0x80) {
    const count = len & 0x7f;
    if (count !== 1 || pos >= der.length) throw new Error("SIGNATURE_INVALID");
    len = der[pos++];
  }
  if (len !== der.length - pos) throw new Error("SIGNATURE_INVALID");
  const result = new Uint8Array(64);
  for (let part = 0; part < 2; part++) {
    if (der[pos++] !== 0x02) throw new Error("SIGNATURE_INVALID");
    const size = der[pos++];
    if (size < 1 || size > 33 || pos + size > der.length) throw new Error("SIGNATURE_INVALID");
    let value = der.slice(pos, pos + size);
    pos += size;
    if (value.length === 33 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) throw new Error("SIGNATURE_INVALID");
    result.set(value, part * 32 + 32 - value.length);
  }
  if (pos !== der.length) throw new Error("SIGNATURE_INVALID");
  return result;
}
async function verifyAssertion(credential: Row, assertion: Row, challenge: string, origin: string) {
  if (text(assertion.credentialId) !== text(credential.credentialId)) throw new Error("CREDENTIAL_MISMATCH");
  const clientBytes = checkedClientData(assertion.clientDataJSON, "webauthn.get", challenge, origin);
  const auth = await checkedAuthData(assertion.authenticatorData);
  const publicKey = await crypto.subtle.importKey(
    "spki", decode(credential.publicKey, 1024), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
  );
  const clientHash = await digest(clientBytes);
  const signed = new Uint8Array(auth.bytes.length + clientHash.length);
  signed.set(auth.bytes); signed.set(clientHash, auth.bytes.length);
  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, publicKey, signatureToRaw(decode(assertion.signature, 256)), signed
  );
  if (!verified) throw new Error("SIGNATURE_INVALID");
  if (Number(credential.signCount || 0) > 0 && auth.counter > 0 && auth.counter <= Number(credential.signCount)) {
    throw new Error("PASSKEY_CLONED_OR_REPLAYED");
  }
  return auth.counter;
}
async function credentialList(c: any, userId: string) {
  const result = await c.env.DB.prepare(
    "SELECT data FROM json_store WHERE scope=? AND json_extract(data,'$.userId')=? ORDER BY updated_at DESC LIMIT 12"
  ).bind(SCOPE, userId).all<Row>();
  return (result.results || []).flatMap((row: Row) => {
    try { const item = JSON.parse(text(row.data)); return item.active !== false ? [item] : []; }
    catch { return []; }
  });
}
async function oneUseChallenge(c: any, challenge: Row) {
  const result = await c.env.DB.prepare(
    "UPDATE auth_login_challenges SET consumed_at=? WHERE id=? AND user_id=? AND challenge_type=? AND consumed_at IS NULL AND expires_at>?"
  ).bind(new Date().toISOString(), challenge.id, challenge.user_id, challenge.challenge_type, new Date().toISOString()).run();
  return Number(result.meta?.changes || 0) === 1;
}
async function recentChallengeLimit(c: any, userId: string, challengeType: string) {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const record = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM auth_login_challenges WHERE user_id=? AND challenge_type=? AND created_at>?"
  ).bind(userId, challengeType, cutoff).first<Row>();
  return Number(record?.total || 0) < 30;
}
export function registerMobilePasskeyRoutes(app: any, deps: {
  userById: (c: any, id: string) => Promise<Row | null>;
  userByIdentity: (c: any, identity: string) => Promise<Row | null>;
  createChallenge: (c: any, user: Row, type: string, source?: Row, policy?: string, ttl?: number) => Promise<Row>;
  challengeFromRequest: (c: any, body: Row) => Promise<Row | null>;
  afterFactors: (c: any, user: Row, source: Row) => Promise<Row>;
  audit: (c: any, action: string, actor?: string, target?: string, company?: string, sessionId?: string, detail?: Row) => Promise<void>;
}) {
  app.get("/api/auth/passkey/status", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return fail(c, "UNAUTHORIZED", "Oturum gerekli.", 401);
    const registered = await credentialList(c, text(current.id));
    return c.json({ ok: true, data: { enabled: registered.length > 0, count: registered.length, rpId: RP_ID } });
  });
  app.post("/api/auth/passkey/register/start", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return fail(c, "UNAUTHORIZED", "Oturum gerekli.", 401);
    if (!originFor(c)) return fail(c, "ORIGIN_DENIED", "Bu uygulama adresinden giriş anahtarı oluşturulamaz.", 403);
    const recent = Date.now() - Date.parse(text(current.session?.created_at));
    // Enrollment requires a recently completed password/MFA login. Long-lived stolen sessions cannot add a credential.
    if (!Number.isFinite(recent) || recent < 0 || recent > 5 * 60 * 1000) {
      return fail(c, "FRESH_LOGIN_REQUIRED", "Parmak izi kaydı için son 5 dakika içinde şifre ve MFA ile giriş yapın.", 403);
    }
    if (!(await recentChallengeLimit(c, text(current.id), "PASSKEY_REGISTER"))) return fail(c, "TOO_MANY_REQUESTS", "Çok fazla kurulum denemesi.", 429);
    const challenge = await deps.createChallenge(c, { id: current.id }, "PASSKEY_REGISTER");
    return c.json({ ok: true, data: { challengeId: challenge.id, challengeToken: challenge.challengeToken, rpId: RP_ID,
      userId: text(current.id), username: text(current.username), displayName: text(current.fullName || current.username) } });
  });
  app.post("/api/auth/passkey/register/finish", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return fail(c, "UNAUTHORIZED", "Oturum gerekli.", 401);
    const origin = originFor(c);
    if (!origin) return fail(c, "ORIGIN_DENIED", "Bu uygulama adresinden kayıt tamamlanamaz.", 403);
    const body = await c.req.json().catch(() => ({})) as Row;
    const challenge = await deps.challengeFromRequest(c, body);
    if (!challenge || challenge.challenge_type !== "PASSKEY_REGISTER" || challenge.user_id !== current.id) {
      return fail(c, "CHALLENGE_INVALID", "Kurulum isteği geçersiz veya süresi dolmuş.", 401);
    }
    try {
      const creation = body.creation || {};
      const proof = body.proof || {};
      const credentialId = text(body.credentialId);
      if (!credentialId || credentialId.length > 512 || !equal(decode(credentialId, 512), decode(proof.credentialId, 512))) throw new Error("CREDENTIAL_INVALID");
      checkedClientData(creation.clientDataJSON, "webauthn.create", text(body.challengeToken), origin);
      await checkedAuthData(creation.authenticatorData, true);
      const publicKeyBytes = decode(creation.publicKey, 1024);
      const publicKey = await crypto.subtle.importKey("spki", publicKeyBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      void publicKey;
      const prior = await securityStoreGet(c, SCOPE, credentialId);
      if (prior) throw new Error("CREDENTIAL_ALREADY_USED");
      const record = {
        userId: text(current.id), credentialId, publicKey: text(creation.publicKey), signCount: 0, active: true,
        rpId: RP_ID, createdAt: new Date().toISOString(), label: "Telefon · Parmak İzi / PIN"
      };
      record.signCount = await verifyAssertion(record, proof, text(body.challengeToken), origin);
      if (!(await oneUseChallenge(c, challenge))) throw new Error("CHALLENGE_REPLAYED");
      await securityStorePut(c, SCOPE, credentialId, text(current.mainCompanySlug), record);
      await deps.audit(c, "PASSKEY_DEVICE_ENROLLED", text(current.id), text(current.id), text(current.mainCompanySlug), "", { credentialRef: credentialId.slice(0, 12) });
      return c.json({ ok: true, data: { enabled: true } });
    } catch {
      return fail(c, "PASSKEY_REGISTRATION_FAILED", "Cihaz kimliği doğrulanamadı. Kayıt tamamlanmadı.", 400);
    }
  });
  app.post("/api/auth/passkey/login/start", async (c: any) => {
    const origin = originFor(c);
    if (!origin) return fail(c, "ORIGIN_DENIED", "Giriş uygulaması doğrulanamadı.", 403);
    const body = await c.req.json().catch(() => ({})) as Row;
    const identity = text(body.username).slice(0, 160);
    const user = identity ? await deps.userByIdentity(c, identity) : null;
    const credentials = user?.is_active ? await credentialList(c, text(user.id)) : [];
    if (!user || !credentials.length || Boolean(user.must_change_password) || text(user.login_policy) === "BOTH_MFA") {
      return fail(c, "PASSKEY_UNAVAILABLE", "Bu kullanıcıda hızlı giriş etkin değil. Şifreyle giriş yapın.", 404);
    }
    if (!(await recentChallengeLimit(c, text(user.id), "PASSKEY_LOGIN"))) return fail(c, "TOO_MANY_REQUESTS", "Çok fazla giriş denemesi. Sonra tekrar deneyin.", 429);
    const challenge = await deps.createChallenge(c, user, "PASSKEY_LOGIN");
    return c.json({ ok: true, data: {
      challengeId: challenge.id, challengeToken: challenge.challengeToken, rpId: RP_ID,
      credentialIds: credentials.map((entry: Row) => entry.credentialId),
    } });
  });
  app.post("/api/auth/passkey/login/finish", async (c: any) => {
    const origin = originFor(c);
    if (!origin) return fail(c, "ORIGIN_DENIED", "Giriş uygulaması doğrulanamadı.", 403);
    const body = await c.req.json().catch(() => ({})) as Row;
    const challenge = await deps.challengeFromRequest(c, body);
    if (!challenge || challenge.challenge_type !== "PASSKEY_LOGIN") return fail(c, "CHALLENGE_INVALID", "Giriş isteği geçersiz veya süresi dolmuş.", 401);
    const credentialId = text(body.assertion?.credentialId);
    const stored = credentialId ? await securityStoreGet(c, SCOPE, credentialId) : null;
    const user = stored?.active !== false && stored?.userId === challenge.user_id ? await deps.userById(c, text(challenge.user_id)) : null;
    if (!stored || !user?.is_active || user.must_change_password || text(user.login_policy) === "BOTH_MFA") {
      return fail(c, "PASSKEY_UNAVAILABLE", "Giriş doğrulanamadı; şifreyle devam edin.", 401);
    }
    try {
      const signCount = await verifyAssertion(stored, body.assertion, text(body.challengeToken), origin);
      if (!(await oneUseChallenge(c, challenge))) throw new Error("CHALLENGE_REPLAYED");
      await securityStorePut(c, SCOPE, credentialId, text(user.main_company_slug), { ...stored, signCount: Math.max(Number(stored.signCount || 0), signCount), lastUsedAt: new Date().toISOString() });
      await deps.audit(c, "PASSKEY_LOGIN_VERIFIED", text(user.id), text(user.id), text(user.main_company_slug), "", { credentialRef: credentialId.slice(0, 12) });
      // Preserve existing manager-approval and tenant policies. A passkey is not a privileged-role shortcut.
      return c.json(await deps.afterFactors(c, user, { deviceLabel: "KY ERP mobil · WebAuthn", userAgent: text(c.req.header("User-Agent")), passkeyVerified: true }));
    } catch {
      return fail(c, "PASSKEY_VERIFICATION_FAILED", "Parmak izi/PIN veya imza doğrulanamadı. Şifreyle giriş yapabilirsiniz.", 401);
    }
  });
}
