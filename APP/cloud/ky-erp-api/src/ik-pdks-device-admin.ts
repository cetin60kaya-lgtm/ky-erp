// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type Row = Record<string, any>;
const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const owner = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
const pdksManager = (role: unknown) => owner(role) || ["COMPANY_ADMIN", "IK"].includes(upper(role));
const tenantOf = (user: Row) => text(user.mainCompanySlug || user.main_company_slug || user.security?.main_company_slug).toLocaleLowerCase("tr-TR");

function fail(c: any, status: number, code: string, message: string) {
  return c.json({ ok: false, error: { code, message } }, status);
}

async function contextOf(c: any) {
  const user = await getAuthenticatedUser(c);
  if (!user) return { error: fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.") };
  if (!pdksManager(user.role)) return { error: fail(c, 403, "PDKS_DEVICE_FORBIDDEN", "PDKS cihaz yönetimi için firma yöneticisi veya İK yetkisi gerekir.") };
  const ownTenant = tenantOf(user as Row);
  const requested = text(c.req.query("mainCompanyId") || c.req.query("mainCompanySlug") || c.req.header("X-KYERP-Tenant-Slug") || ownTenant).toLocaleLowerCase("tr-TR");
  if (!requested) return { error: fail(c, 400, "COMPANY_REQUIRED", "Firma zorunludur.") };
  if (!owner(user.role) && requested !== ownTenant) return { error: fail(c, 403, "TENANT_FORBIDDEN", "Başka firmanın PDKS cihazları yönetilemez.") };
  return { user, company: requested };
}

async function audit(c: any, user: Row, company: string, action: string, detail: Row = {}) {
  try {
    await c.env.DB.prepare(`INSERT INTO auth_security_audit
      (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),text(user.id),null,company,action,null,
        text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]) || null,
        JSON.stringify(detail),new Date().toISOString()).run();
  } catch {}
}

export function registerIkPdksDeviceAdminRoutes(app: any) {
  app.get("/api/ik/personnel-control/devices", async (c: any) => {
    const auth = await contextOf(c);
    if (auth.error) return auth.error;
    const result = await c.env.DB.prepare(`SELECT id,main_company_id AS mainCompanyId,device_label AS deviceLabel,
      machine_name AS machineName,active,created_by_user_id AS createdByUserId,created_at AS createdAt,
      updated_at AS updatedAt,last_seen_at AS lastSeenAt,last_sync_at AS lastSyncAt,last_sync_count AS lastSyncCount
      FROM ik_pdks_devices WHERE main_company_id=? ORDER BY active DESC,COALESCE(last_seen_at,'') DESC,device_label`)
      .bind(auth.company).all<Row>();
    return c.json({ ok: true, data: result.results || [] });
  });

  app.get("/api/ik/personnel-control/device-sync-logs", async (c: any) => {
    const auth = await contextOf(c);
    if (auth.error) return auth.error;
    const deviceId = text(c.req.query("deviceId"));
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") || 100)));
    const result = deviceId
      ? await c.env.DB.prepare(`SELECT id,device_id AS deviceId,main_company_id AS mainCompanyId,received_count AS receivedCount,
          accepted_count AS acceptedCount,rejected_count AS rejectedCount,status,message,created_at AS createdAt
          FROM ik_pdks_device_sync_logs WHERE main_company_id=? AND device_id=? ORDER BY created_at DESC LIMIT ?`)
          .bind(auth.company,deviceId,limit).all<Row>()
      : await c.env.DB.prepare(`SELECT id,device_id AS deviceId,main_company_id AS mainCompanyId,received_count AS receivedCount,
          accepted_count AS acceptedCount,rejected_count AS rejectedCount,status,message,created_at AS createdAt
          FROM ik_pdks_device_sync_logs WHERE main_company_id=? ORDER BY created_at DESC LIMIT ?`)
          .bind(auth.company,limit).all<Row>();
    return c.json({ ok: true, data: result.results || [] });
  });

  app.patch("/api/ik/personnel-control/devices/:id", async (c: any) => {
    const auth = await contextOf(c);
    if (auth.error) return auth.error;
    let body: Row = {};
    try { body = await c.req.json(); } catch {}
    const id = text(c.req.param("id"));
    const device = await c.env.DB.prepare("SELECT id,device_label FROM ik_pdks_devices WHERE id=? AND main_company_id=? LIMIT 1")
      .bind(id,auth.company).first<Row>();
    if (!device) return fail(c,404,"DEVICE_NOT_FOUND","PDKS cihazı bulunamadı.");
    const active = body.active === false || body.active === 0 ? 0 : 1;
    await c.env.DB.prepare("UPDATE ik_pdks_devices SET active=?,updated_at=? WHERE id=? AND main_company_id=?")
      .bind(active,new Date().toISOString(),id,auth.company).run();
    await audit(c,auth.user as Row,auth.company,"PDKS_DEVICE_STATUS_CHANGED",{deviceId:id,deviceLabel:device.device_label,active:Boolean(active)});
    return c.json({ ok:true,data:{id,active:Boolean(active)} });
  });
}
