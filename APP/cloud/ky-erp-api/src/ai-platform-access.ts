// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud.ts";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

export const AI_PLATFORM_KEYS = ["GPT", "GEMINI", "COPILOT"] as const;
const SCOPE = "KYERP_AI_PLATFORM_ACCESS";
const AUDIT_SCOPE = "KYERP_AI_PLATFORM_AUDIT";
const text = (v: unknown) => v === undefined || v === null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toUpperCase().replace(/İ/g, "I");
const nowIso = () => new Date().toISOString();
const isOwner = (u: Row) => ["ADMIN", "SUPER_ADMIN"].includes(upper(u?.role));
const isCompanyAdmin = (u: Row) => upper(u?.role) === "COMPANY_ADMIN";

function blankPlatform(owner = false) {
  return { enabled: owner, readEnabled: true, writeEnabled: owner, approveEnabled: owner };
}
function normalizePlatform(value: Row, owner = false) {
  const defaults = blankPlatform(owner);
  return {
    enabled: value?.enabled === undefined ? defaults.enabled : Boolean(value.enabled),
    readEnabled: value?.readEnabled === undefined ? defaults.readEnabled : Boolean(value.readEnabled),
    writeEnabled: value?.writeEnabled === undefined ? defaults.writeEnabled : Boolean(value.writeEnabled),
    approveEnabled: value?.approveEnabled === undefined ? defaults.approveEnabled : Boolean(value.approveEnabled),
  };
}
async function readPolicy(c: Context<AppEnv>, user: Row) {
  let stored: Row = {};
  try {
    const row = await c.env.DB.prepare("SELECT data FROM json_store WHERE scope=? AND file_name=? ORDER BY updated_at DESC LIMIT 1")
      .bind(SCOPE, text(user.id)).first<Row>();
    if (row?.data) stored = JSON.parse(text(row.data) || "{}");
  } catch {}
  const owner = isOwner(user);
  const platforms = Object.fromEntries(AI_PLATFORM_KEYS.map(key => [key, normalizePlatform(stored?.platforms?.[key] || {}, owner)]));
  return {
    userId: text(user.id),
    email: text(user.email).toLocaleLowerCase("tr-TR"),
    emailVerified: Boolean(user.emailVerified || user?.security?.email_verified),
    mainCompanySlug: text(user.mainCompanySlug || user?.security?.main_company_slug),
    role: text(user.role),
    platforms,
    updatedAt: text(stored.updatedAt),
  };
}
async function savePolicy(c: Context<AppEnv>, user: Row, value: Row) {
  const current = await readPolicy(c, user);
  const input = value?.platforms && typeof value.platforms === "object" ? value.platforms : {};
  const platforms = Object.fromEntries(AI_PLATFORM_KEYS.map(key => {
    const before = current.platforms[key] || {};
    const next = input[key] || {};
    return [key, {
      enabled: next.enabled === undefined ? Boolean(before.enabled) : Boolean(next.enabled),
      readEnabled: next.readEnabled === undefined ? Boolean(before.readEnabled) : Boolean(next.readEnabled),
      writeEnabled: next.writeEnabled === undefined ? Boolean(before.writeEnabled) : Boolean(next.writeEnabled),
      approveEnabled: next.approveEnabled === undefined ? Boolean(before.approveEnabled) : Boolean(next.approveEnabled),
    }];
  }));
  const ts = nowIso();
  const payload = { ...current, platforms, updatedAt: ts };
  await c.env.DB.prepare("DELETE FROM json_store WHERE scope=? AND file_name=?").bind(SCOPE, current.userId).run();
  await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), SCOPE, current.mainCompanySlug, current.userId, JSON.stringify(payload), ts, ts).run();
  return payload;
}
async function targetUser(c: Context<AppEnv>, manager: Row, userId: string) {
  const row = await c.env.DB.prepare(`SELECT u.id,u.username,u.full_name,u.role,u.is_active,s.email,s.main_company_slug,s.email_verified,s.role_override
    FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.id=? LIMIT 1`).bind(userId).first<Row>();
  if (!row) return null;
  const rawRole = upper(row.role_override || row.role || "VIEWER");
  const role = rawRole === "ADMIN" ? "SUPER_ADMIN" : rawRole;
  const user = { id:text(row.id), username:text(row.username), fullName:text(row.full_name), role, isActive:Boolean(row.is_active), email:text(row.email), emailVerified:Boolean(row.email_verified), mainCompanySlug:text(row.main_company_slug), security:{ email_verified:row.email_verified, main_company_slug:row.main_company_slug } };
  if (isOwner(manager)) return user;
  if (isCompanyAdmin(manager) && user.mainCompanySlug === text(manager.mainCompanySlug) && !["SUPER_ADMIN","ADMIN","COMPANY_ADMIN"].includes(role)) return user;
  return null;
}
async function audit(c: Context<AppEnv>, actor: Row, action: string, detail: Row) {
  const ts = nowIso();
  try {
    await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), AUDIT_SCOPE, text(actor.mainCompanySlug || actor?.security?.main_company_slug), `${text(actor.id)}-${Date.now()}`, JSON.stringify({ actorUserId:text(actor.id), actorEmail:text(actor.email), action, ...detail }), ts, ts).run();
  } catch {}
}
export async function getAiPlatformPolicy(c: Context<AppEnv>, user: Row) { return readPolicy(c, user); }
export async function canUseAiPlatform(c: Context<AppEnv>, user: Row, platform: unknown, capability: "read"|"write"|"approve" = "read") {
  const key = upper(platform);
  if (!AI_PLATFORM_KEYS.includes(key as any)) return { allowed:false, code:"AI_PLATFORM_UNSUPPORTED", platform:key };
  const policy = await readPolicy(c, user);
  const p = policy.platforms[key] || {};
  const allowed = policy.emailVerified && Boolean(p.enabled) && Boolean(capability === "read" ? p.readEnabled : capability === "write" ? p.writeEnabled : p.approveEnabled);
  return { allowed, code: allowed ? "OK" : !policy.emailVerified ? "VERIFIED_EMAIL_REQUIRED" : "AI_PLATFORM_FORBIDDEN", platform:key, policy:p };
}
export function registerAiPlatformAccessRoutes(app: Hono<AppEnv>) {
  app.get("/api/ai/platform-access/me", async c => {
    const user = await getAuthenticatedUser(c) as Row|null;
    if (!user) return c.json({ok:false,error:{code:"UNAUTHORIZED",message:"Oturum gerekli."}},401);
    return c.json({ok:true,success:true,data:await readPolicy(c,user),platforms:AI_PLATFORM_KEYS});
  });
  app.get("/api/ai/platform-access/:userId", async c => {
    const manager = await getAuthenticatedUser(c) as Row|null;
    if (!manager) return c.json({ok:false,error:{code:"UNAUTHORIZED",message:"Oturum gerekli."}},401);
    const target = await targetUser(c,manager,c.req.param("userId"));
    if (!target) return c.json({ok:false,error:{code:"FORBIDDEN",message:"Bu kullanıcının AI platform yetkisini yönetemezsiniz."}},403);
    return c.json({ok:true,success:true,data:await readPolicy(c,target),platforms:AI_PLATFORM_KEYS});
  });
  app.put("/api/ai/platform-access/:userId", async c => {
    const manager = await getAuthenticatedUser(c) as Row|null;
    if (!manager) return c.json({ok:false,error:{code:"UNAUTHORIZED",message:"Oturum gerekli."}},401);
    const target = await targetUser(c,manager,c.req.param("userId"));
    if (!target) return c.json({ok:false,error:{code:"FORBIDDEN",message:"Bu kullanıcının AI platform yetkisini yönetemezsiniz."}},403);
    let body: Row={}; try{body=await c.req.json();}catch{}
    const wantsEnabled = Object.values(body?.platforms||{}).some((row:any)=>Boolean(row?.enabled));
    if (wantsEnabled && (!target.email || !target.emailVerified)) return c.json({ok:false,error:{code:"VERIFIED_EMAIL_REQUIRED",message:"GPT, Gemini veya Copilot erişimi için ERP e-postası doğrulanmış olmalıdır."}},409);
    const data=await savePolicy(c,target,body);
    await audit(c,manager,"AI_PLATFORM_ACCESS_UPDATED",{targetUserId:target.id,targetEmail:target.email,platforms:data.platforms});
    return c.json({ok:true,success:true,data});
  });
}
