// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { approvalPendingPayload, consumeCriticalApproval, requestCriticalApproval } from "./approval-center-cloud";
import {
  generateFileHubAgentSecret,
  hashFileHubAgentSecret,
  normalizeFileHubTenant,
} from "./file-hub-agent-auth";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const ownerRole = (value: unknown) => ["ADMIN", "SUPER_ADMIN"].includes(upper(value));
const nowIso = () => new Date().toISOString();

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const parsed = await c.req.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : {};
  } catch { return {}; }
}

function tenantOf(c: Context<AppEnv>, body: Row = {}) {
  return normalizeFileHubTenant(
    body.mainCompanySlug ||
    body.main_company_slug ||
    c.req.header("X-KYERP-Tenant-Slug") ||
    c.req.query("mainCompanySlug") ||
    c.req.query("mainCompanyId") ||
    "mecit-hakan",
  );
}

async function requireOwner(c: Context<AppEnv>) {
  const user = await getAuthenticatedUser(c) as Row | null;
  return user && ownerRole(user.role) ? user : null;
}

async function activeCompany(c: Context<AppEnv>, slug: string) {
  return c.env.DB.prepare(
    "SELECT slug,name,is_active FROM main_companies WHERE slug=? LIMIT 1",
  ).bind(slug).first<Row>();
}

async function logEvent(c: Context<AppEnv>, slug: string, actorId: string, eventType: string, details: Row = {}) {
  try {
    await c.env.DB.prepare(`INSERT INTO file_hub_events
      (id,main_company_slug,event_type,actor_type,actor_id,details,created_at)
      VALUES(?,?,?,'USER',?,?,?)`)
      .bind(crypto.randomUUID(), slug, eventType, actorId, JSON.stringify(details), nowIso()).run();
  } catch {}
}

export function registerFileHubAgentAdminRoutes(app: Hono<AppEnv>) {
  app.get("/api/file-hub/agent-credential", async (c) => {
    const owner = await requireOwner(c);
    if (!owner) return c.json({ ok:false, error:{ code:"OWNER_ONLY", message:"File Agent anahtarı yalnız uygulama sahibi tarafından yönetilebilir." } }, 403);
    const slug = tenantOf(c);
    const company = await activeCompany(c, slug);
    if (!company || Number(company.is_active ?? 1) === 0) {
      return c.json({ ok:false, error:{ code:"FILE_HUB_TENANT_NOT_ACTIVE", message:"Seçilen ana firma bulunamadı veya pasif." } }, 404);
    }
    let row: Row | null = null;
    try {
      row = await c.env.DB.prepare(`SELECT id,main_company_slug,label,is_active,created_at,updated_at,last_used_at
        FROM file_hub_agent_credentials WHERE main_company_slug=? LIMIT 1`).bind(slug).first<Row>();
    } catch {
      return c.json({ ok:false, error:{ code:"FILE_HUB_AGENT_SCHEMA_MISSING", message:"File Agent tenant credential migrationı henüz uygulanmamış." } }, 503);
    }
    return c.json({ ok:true, data:{
      mainCompanySlug: slug,
      companyName: text(company.name || company.slug),
      configured: Boolean(row),
      active: row ? Number(row.is_active ?? 1) !== 0 : false,
      label: text(row?.label || "KY File Agent"),
      createdAt: row?.created_at || null,
      updatedAt: row?.updated_at || null,
      lastUsedAt: row?.last_used_at || null,
      legacyCanonicalFallback: !row && slug === "mecit-hakan",
    }});
  });

  app.post("/api/file-hub/agent-credential/rotate", async (c) => {
    const owner = await requireOwner(c);
    if (!owner) return c.json({ ok:false, error:{ code:"OWNER_ONLY", message:"File Agent anahtarı yalnız uygulama sahibi tarafından yenilenebilir." } }, 403);
    const body = await bodyOf(c);
    const slug = tenantOf(c, body);
    const company = await activeCompany(c, slug);
    if (!company || Number(company.is_active ?? 1) === 0) {
      return c.json({ ok:false, error:{ code:"FILE_HUB_TENANT_NOT_ACTIVE", message:"Seçilen ana firma bulunamadı veya pasif." } }, 404);
    }
    const approval = await requestCriticalApproval(c,owner,{
      mainCompanySlug:slug,sourceModule:"STORAGE",actionType:"FILE_AGENT_CREDENTIAL_ROTATE",targetType:"FILE_AGENT",targetId:slug,
      title:"File Agent Anahtarını Yenile",description:text(company.name||slug)+" için yeni yerel/NAS Agent erişim anahtarı üretilecek.",riskLevel:"CRITICAL",
      approvalPolicy:"COMPANY_OWNER_AND_APP_OWNER",payload:{mainCompanySlug:slug,label:text(body.label)||"KY File Agent"},
    });
    if(approval.state==="SCHEMA_MISSING")return c.json({ok:false,error:{code:"APPROVAL_SCHEMA_NOT_READY",message:"Onay Merkezi kurulumu tamamlanmadan Agent anahtarı yenilenemez."}},503);
    if(!approval.approved)return c.json({ok:true,data:approvalPendingPayload(approval)},202);
    const secret = generateFileHubAgentSecret();
    const secretHash = await hashFileHubAgentSecret(secret);
    const stamp = nowIso();
    const label = text(body.label) || "KY File Agent";
    try {
      await c.env.DB.prepare(`INSERT INTO file_hub_agent_credentials
        (id,main_company_slug,label,secret_hash,is_active,created_by_user_id,created_at,updated_at,last_used_at)
        VALUES(?,?,?,?,1,?,?,?,NULL)
        ON CONFLICT(main_company_slug) DO UPDATE SET
          label=excluded.label,
          secret_hash=excluded.secret_hash,
          is_active=1,
          created_by_user_id=excluded.created_by_user_id,
          updated_at=excluded.updated_at,
          last_used_at=NULL`)
        .bind(crypto.randomUUID(), slug, label, secretHash, text(owner.id), stamp, stamp).run();
    } catch {
      return c.json({ ok:false, error:{ code:"FILE_HUB_AGENT_SCHEMA_MISSING", message:"File Agent tenant credential migrationı henüz uygulanmamış." } }, 503);
    }
    await consumeCriticalApproval(c,owner,text(approval.request?.id),{mainCompanySlug:slug,label});
    await logEvent(c, slug, text(owner.id), "AGENT_CREDENTIAL_ROTATED", { label });
    // The raw secret is intentionally returned only on rotation/enrollment.
    return c.json({ ok:true, data:{
      mainCompanySlug: slug,
      companyName: text(company.name || company.slug),
      label,
      secret,
      rotatedAt: stamp,
      warning: "Bu anahtar yalnız bu yanıtta gösterilir. KY File Agent ayarına kaydedin.",
    }}, 201);
  });
}
