import { AUTH_SECURITY_SCOPES, securityStoreList as storeList, tableExists } from "./auth-security-core";

type AnyRow = Record<string, any>;
type ActorResolver = (c: any) => Promise<AnyRow | null>;

const TRUST_SCOPE = AUTH_SECURITY_SCOPES.SESSION_TRUST;
const TRUSTED_DEVICE_SCOPE = AUTH_SECURITY_SCOPES.TRUSTED_LOGIN_DEVICE;

function text(value: unknown) { return value === undefined || value === null ? "" : String(value).trim(); }
function upper(value: unknown) { return text(value).toUpperCase().replace(/İ/g, "I"); }
function nowIso() { return new Date().toISOString(); }
function jsonError(code: string, message: string) { return { ok: false, error: { code, message } }; }
function isSuper(role: unknown) { return ["SUPER_ADMIN", "ADMIN"].includes(upper(role)); }
function isCompanyAdmin(role: unknown) { return upper(role) === "COMPANY_ADMIN"; }
function hasCap(actor: AnyRow, cap: string) { return isSuper(actor.role) || isCompanyAdmin(actor.role) || (actor.securityCapabilities || []).includes(cap); }
function clientIp(c: any) { return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]); }
function browserDeviceId(label: unknown) { const value = text(label); return value.startsWith("BROWSER:") ? value.slice(8) : ""; }
function trustedDeviceKey(userId: unknown, deviceId: unknown) { return `${text(userId)}:${text(deviceId)}`; }
function activeTrustedDevice(row: AnyRow | undefined) { return Boolean(row && row.isTrusted !== false && !text(row.revokedAt)); }
function effectiveRole(row: AnyRow) { const role = upper(row?.role_override || row?.platform_role || row?.role || "VIEWER"); return role === "ADMIN" ? "SUPER_ADMIN" : role; }
function objectOf(value: unknown): AnyRow {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRow;
  if (typeof value !== "string" || !value.trim()) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
function base64UrlToBytes(value: unknown) {
  const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function verifyControlProof(actor: AnyRow, operation: string, targetId: string, timestampValue: unknown, signatureValue: unknown) {
  const jwk = objectOf(actor?.device?.decisionPublicKeyJwk);
  const timestamp = Number(timestampValue);
  const signature = text(signatureValue);
  if (upper(jwk.kty) !== "EC" || upper(jwk.crv) !== "P-256" || !text(jwk.x) || !text(jwk.y) || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 120_000 || !signature) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const message = new TextEncoder().encode(`KYERP-MOBILE-CONTROL-V1|${text(actor.device.id)}|${upper(operation)}|${text(targetId)}|${timestamp}`);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, base64UrlToBytes(signature), message);
  } catch { return false; }
}
async function listCompanies(c: any, actor: AnyRow) {
  if (isSuper(actor.role) && await tableExists(c, "main_companies")) {
    const result = await c.env.DB.prepare("SELECT slug,name FROM main_companies WHERE is_active<>0 ORDER BY name COLLATE NOCASE ASC").all();
    return (result.results || []).map((row: AnyRow) => ({ slug: text(row.slug), name: text(row.name || row.slug) })).filter((row: AnyRow) => row.slug);
  }
  const slug = text(actor.companySlug);
  if (!slug) return [];
  let name = slug;
  if (await tableExists(c, "main_companies")) {
    const row = await c.env.DB.prepare("SELECT name FROM main_companies WHERE slug=? LIMIT 1").bind(slug).first();
    name = text(row?.name || slug);
  }
  return [{ slug, name }];
}
function scopeType(actor: AnyRow) {
  if (isSuper(actor.role)) return "SYSTEM";
  if (isCompanyAdmin(actor.role) || (actor.securityCapabilities || []).length) return "COMPANY";
  return "SELF";
}
function normalizeCompanyFilter(actor: AnyRow, requested: unknown, companies: AnyRow[]) {
  const value = text(requested);
  if (isSuper(actor.role)) return value && companies.some((row) => row.slug === value) ? value : "";
  return text(actor.companySlug);
}
async function sessionRows(c: any, actor: AnyRow, companySlug: string, limit: number) {
  const select = `SELECT s.*,u.username,u.full_name,u.role,u.platform_role,us.role_override,CASE WHEN s.revoked_at IS NULL AND julianday(s.expires_at)>julianday('now') THEN 1 ELSE 0 END AS active_sql FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id LEFT JOIN auth_user_security us ON us.user_id=u.id`;
  if (isSuper(actor.role)) {
    return companySlug
      ? c.env.DB.prepare(`${select} WHERE s.main_company_slug=? ORDER BY s.created_at DESC LIMIT ?`).bind(companySlug, limit).all()
      : c.env.DB.prepare(`${select} ORDER BY s.created_at DESC LIMIT ?`).bind(limit).all();
  }
  const companyScope = scopeType(actor) === "COMPANY" && hasCap(actor, "SESSION_VIEW");
  if (companyScope) {
    const owner = isCompanyAdmin(actor.role) ? 1 : 0;
    return c.env.DB.prepare(`${select} WHERE s.main_company_slug=? AND (UPPER(COALESCE(NULLIF(TRIM(us.role_override),''),NULLIF(TRIM(u.platform_role),''),NULLIF(TRIM(u.role),''),'VIEWER')) NOT IN ('SUPER_ADMIN','ADMIN','COMPANY_ADMIN') OR (?=1 AND s.user_id=?)) ORDER BY s.created_at DESC LIMIT ?`).bind(text(actor.companySlug), owner, text(actor.userId), limit).all();
  }
  return c.env.DB.prepare(`${select} WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT ?`).bind(text(actor.userId), limit).all();
}

async function buildSessions(c: any, actor: AnyRow, companySlug: string, limit: number) {
  const result = await sessionRows(c, actor, companySlug, limit);
  const trusts = new Map<string, AnyRow>((await storeList(c, TRUST_SCOPE)).map((row: AnyRow) => [text(row.sessionId || row.fileName), row] as [string, AnyRow]));
  const trustedDevices = new Map<string, AnyRow>((await storeList(c, TRUSTED_DEVICE_SCOPE)).map((row: AnyRow) => [trustedDeviceKey(row.userId, row.deviceId), row] as [string, AnyRow]));
  return (result.results || []).map((row: AnyRow) => {
    const role = effectiveRole(row); const trust = trusts.get(text(row.id)); const deviceId = browserDeviceId(row.device_label); const persistent = deviceId ? trustedDevices.get(trustedDeviceKey(row.user_id, deviceId)) : undefined;
    const explicit = upper(trust?.status || ""); const persistentTrusted = activeTrustedDevice(persistent) && !["REJECTED","SUSPICIOUS"].includes(explicit); const trustStatus = persistentTrusted ? "TRUSTED" : (explicit || (Number(row.active_sql || 0) === 1 ? "PENDING" : "EXPIRED"));
    const active = Number(row.active_sql || 0) === 1; const own = text(row.user_id) === text(actor.userId);
    return { id:text(row.id),userId:text(row.user_id),username:text(row.username),fullName:text(row.full_name||row.username),role,mainCompanySlug:isSuper(role)?"":text(row.main_company_slug),deviceId,deviceLabel:text(row.device_label||"Tarayıcı"),userAgent:text(row.user_agent),ipAddress:text(row.ip_address),createdAt:row.created_at,approvedAt:row.approved_at,lastSeenAt:row.last_seen_at,expiresAt:row.expires_at,revokedAt:row.revoked_at||null,active,trustStatus,own,canClose:active&&canCloseSession(actor,row,role)};
  });
}
function canCloseSession(actor: AnyRow, row: AnyRow, targetRole = effectiveRole(row)) {
  if (text(row.user_id) === text(actor.userId)) return true;
  if (isSuper(actor.role)) return true;
  if (text(row.main_company_slug) !== text(actor.companySlug) || !hasCap(actor, "SESSION_CLOSE")) return false;
  if (["SUPER_ADMIN","ADMIN","COMPANY_ADMIN"].includes(targetRole)) return false;
  return true;
}
async function buildTrustedDevices(c: any, actor: AnyRow, companySlug: string) {
  const rows = (await storeList(c, TRUSTED_DEVICE_SCOPE)).filter((row: AnyRow) => activeTrustedDevice(row));
  const result: AnyRow[] = [];
  for (const row of rows) {
    if (isSuper(actor.role)) { if (companySlug && text(row.mainCompanySlug) !== companySlug) continue; }
    else if (text(row.userId) !== text(actor.userId) && (!hasCap(actor,"SESSION_VIEW") || text(row.mainCompanySlug)!==text(actor.companySlug))) continue;
    const user = await c.env.DB.prepare("SELECT u.username,u.full_name,u.role,u.platform_role,s.role_override FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.id=? LIMIT 1").bind(text(row.userId)).first();
    if (!user) continue; const role = effectiveRole(user); if (!isSuper(actor.role) && ["SUPER_ADMIN","ADMIN","COMPANY_ADMIN"].includes(role) && text(row.userId)!==text(actor.userId)) continue;
    result.push({deviceId:text(row.deviceId),userId:text(row.userId),username:text(user.username),fullName:text(user.full_name||user.username),role,mainCompanySlug:isSuper(role)?"":text(row.mainCompanySlug),deviceLabel:text(row.deviceLabel||"Güvenilir bilgisayar"),userAgent:text(row.userAgent),ipAddress:text(row.ipAddress),firstTrustedAt:row.firstTrustedAt||row.createdAt||null,lastTrustedAt:row.lastTrustedAt||row.updatedAt||null,own:text(row.userId)===text(actor.userId)});
  }
  return result.sort((a,b)=>String(b.lastTrustedAt||"").localeCompare(String(a.lastTrustedAt||"")));
}
async function buildAudit(c: any, actor: AnyRow, companySlug: string, limit: number) {
  const select = `SELECT a.*,au.full_name AS actor_name,tu.full_name AS target_name FROM auth_security_audit a LEFT JOIN auth_users au ON au.id=a.actor_user_id LEFT JOIN auth_users tu ON tu.id=a.target_user_id`;
  let result;
  if (isSuper(actor.role)) result = companySlug
    ? await c.env.DB.prepare(`${select} WHERE a.main_company_slug=? ORDER BY a.created_at DESC LIMIT ?`).bind(companySlug,limit).all()
    : await c.env.DB.prepare(`${select} ORDER BY a.created_at DESC LIMIT ?`).bind(limit).all();
  else if (hasCap(actor,"AUDIT_VIEW")) result = await c.env.DB.prepare(`${select} WHERE a.main_company_slug=? ORDER BY a.created_at DESC LIMIT ?`).bind(text(actor.companySlug),limit).all();
  else result = await c.env.DB.prepare(`${select} WHERE a.actor_user_id=? OR a.target_user_id=? ORDER BY a.created_at DESC LIMIT ?`).bind(text(actor.userId),text(actor.userId),limit).all();
  return (result.results||[]).map((row:AnyRow)=>{const detail=objectOf(row.detail);return{id:text(row.id),createdAt:row.created_at,action:text(row.action),actorUserId:text(row.actor_user_id),actorName:text(row.actor_name),targetUserId:text(row.target_user_id),targetName:text(row.target_name),mainCompanySlug:text(row.main_company_slug),sessionId:text(row.session_id),ipAddress:text(row.ip_address),deviceId:text(detail.deviceId),deviceLabel:text(detail.deviceLabel),result:text(detail.result),detail};});
}
async function writeAudit(c:any, actor:AnyRow, action:string, targetUserId:string, companySlug:string, sessionId:string, detail:AnyRow={}) {
  try { await c.env.DB.prepare(`INSERT INTO auth_security_audit(id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),text(actor.userId)||null,targetUserId||null,companySlug||null,action,sessionId||null,clientIp(c)||null,JSON.stringify(detail||{}),nowIso()).run(); } catch {}
}
export function registerSecurityMobileControlRoutes(app:any, resolveActor:ActorResolver, serverVersion:string) {
  app.get("/api/auth/push/device/control-center", async (c:any) => {
    const actor=await resolveActor(c); if(!actor) return c.json(jsonError("PUSH_DEVICE_UNAUTHORIZED","KY Güvenlik cihazı doğrulanamadı."),401);
    const companies=await listCompanies(c,actor); const companySlug=normalizeCompanyFilter(actor,c.req.query("companySlug"),companies);
    const limit=Math.max(25,Math.min(300,Number(c.req.query("limit")||150)));
    const sessions=await buildSessions(c,actor,companySlug,limit); const devices=await buildTrustedDevices(c,actor,companySlug); const audit=await buildAudit(c,actor,companySlug,limit);
    const activeSessions=sessions.filter((row:AnyRow)=>row.active); const activeComputers=new Set(activeSessions.map((row:AnyRow)=>row.deviceId||`${row.deviceLabel}|${row.ipAddress}`).filter(Boolean));
    return c.json({ok:true,data:{serverVersion,scopeType:scopeType(actor),role:upper(actor.role),companySlug,companies,capabilities:actor.securityCapabilities||[],summary:{activeSessions:activeSessions.length,connectedComputers:activeComputers.size,trustedDevices:devices.length,recentEvents:audit.length},sessions,devices,audit,checkedAt:nowIso()}});
  });

  app.post("/api/auth/push/device/control-center/session/close", async (c:any) => {
    const actor=await resolveActor(c); if(!actor) return c.json(jsonError("PUSH_DEVICE_UNAUTHORIZED","KY Güvenlik cihazı doğrulanamadı."),401);
    const body=await c.req.json().catch(()=>({})); const sessionId=text(body.sessionId); if(!sessionId) return c.json(jsonError("SESSION_ID_REQUIRED","Oturum seçilmelidir."),400);
    const row=await c.env.DB.prepare(`SELECT s.*,u.role,u.platform_role,us.role_override FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id LEFT JOIN auth_user_security us ON us.user_id=u.id WHERE s.id=? LIMIT 1`).bind(sessionId).first();
    if(!row) return c.json(jsonError("SESSION_NOT_FOUND","Oturum bulunamadı."),404); const targetRole=effectiveRole(row);
    if(!canCloseSession(actor,row,targetRole)) return c.json(jsonError("FORBIDDEN","Bu oturumu kapatma yetkiniz yok."),403);
    if(!(await verifyControlProof(actor,"SESSION_CLOSE",sessionId,body.timestamp,body.signature))) return c.json(jsonError("SECURITY_DEVICE_SIGNATURE_INVALID","Telefon güvenlik imzası doğrulanamadı."),401);
    if(text(row.revoked_at)||Date.parse(text(row.expires_at))<=Date.now()) return c.json({ok:true,data:{sessionId,closed:true,alreadyClosed:true}});
    const timestamp=nowIso(); await c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE id=? AND revoked_at IS NULL").bind(timestamp,text(actor.userId),sessionId).run();
    await writeAudit(c,actor,"SESSION_CLOSED_FROM_KY_SECURITY_MOBILE",text(row.user_id),text(row.main_company_slug),sessionId,{deviceId:text(actor.device?.id),deviceLabel:text(actor.device?.deviceLabel),targetRole});
    return c.json({ok:true,data:{sessionId,closed:true,revokedAt:timestamp}});
  });
}
