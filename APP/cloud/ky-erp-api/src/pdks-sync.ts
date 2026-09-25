import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };

export type PdksSyncPrincipal = {
  userId: string;
  tenantId: string;
  companyIds: string[];
  workplaceIds: string[];
  permissions: string[];
};

export type PdksSyncAuthorizer = (
  context: Context<AppEnv>,
) => Promise<PdksSyncPrincipal | null>;

const value = (input: unknown) =>
  input === undefined || input === null ? "" : String(input).trim();

function error(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

function allowed(principal: PdksSyncPrincipal, tenantId: string, companyId: string, workplaceId: string) {
  return principal.tenantId === tenantId &&
    principal.companyIds.includes(companyId) &&
    principal.workplaceIds.includes(workplaceId) &&
    principal.permissions.includes("PDKS_SYNC");
}

export function registerPdksSyncRoutes(app: Hono<AppEnv>, authorize: PdksSyncAuthorizer) {
  app.post("/api/pdks/sync/push", async (c) => {
    const principal = await authorize(c);
    if (!principal) return c.json(error("UNAUTHORIZED", "Geçerli KYERP session gerekli."), 401);
    const body = await c.req.json<Record<string, unknown>>();
    const tenantId = value(body.tenantId), companyId = value(body.companyId), workplaceId = value(body.workplaceId);
    if (!allowed(principal, tenantId, companyId, workplaceId)) return c.json(error("FORBIDDEN", "PDKS sync kapsamı yetkisiz."), 403);
    const id = value(body.id), entityType = value(body.entityType), operation = value(body.operation), occurredAt = value(body.occurredAtUtc);
    const idempotencyKey = value(c.req.header("Idempotency-Key"));
    if (!id || !idempotencyKey || !entityType || !operation || !occurredAt) return c.json(error("INVALID_SYNC_EVENT", "Eksik PDKS sync alanı."), 400);
    const receivedAt = new Date().toISOString();
    const payloadJson = typeof body.payloadJson === "string"
      ? body.payloadJson
      : JSON.stringify(body.payloadJson ?? {});
    await c.env.DB.prepare(`INSERT OR IGNORE INTO pdks_sync_events
      (id,idempotency_key,tenant_id,company_id,workplace_id,device_id,employee_id,entity_type,operation,payload_json,occurred_at,received_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id,idempotencyKey,tenantId,companyId,workplaceId,value(body.deviceId)||null,value(body.entityId)||null,
        entityType,operation,payloadJson,occurredAt,receivedAt).run();
    return c.json({ accepted: true, cursor: `${receivedAt}|${id}` }, 202);
  });

  app.get("/api/pdks/sync/pull", async (c) => {
    const principal = await authorize(c);
    if (!principal) return c.json(error("UNAUTHORIZED", "Geçerli KYERP session gerekli."), 401);
    const tenantId=value(c.req.query("tenantId")),companyId=value(c.req.query("companyId")),workplaceId=value(c.req.query("workplaceId"));
    if (!allowed(principal,tenantId,companyId,workplaceId)) return c.json(error("FORBIDDEN", "PDKS sync kapsamı yetkisiz."),403);
    const cursor=value(c.req.query("cursor"));const [cursorTime="",cursorId=""]=cursor.split("|",2);
    const result=await c.env.DB.prepare(`SELECT id,device_id,employee_id,entity_type,operation,payload_json,occurred_at,received_at
      FROM pdks_sync_events WHERE tenant_id=? AND company_id=? AND workplace_id=?
      AND (received_at>? OR (received_at=? AND id>?)) ORDER BY received_at,id LIMIT 200`)
      .bind(tenantId,companyId,workplaceId,cursorTime,cursorTime,cursorId).all<Record<string,unknown>>();
    const rows=result.results||[];const last=rows.at(-1);return c.json({cursor:last?`${last.received_at}|${last.id}`:cursor,changes:rows});
  });
}
