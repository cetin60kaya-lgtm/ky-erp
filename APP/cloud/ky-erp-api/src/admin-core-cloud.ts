// @ts-nocheck
import { compare } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";

type Row = Record<string, any>;

const SETTINGS_SCOPE = "ADMIN_SETTINGS";
const BACKUP_SCOPE = "ADMIN_BACKUP";

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toUpperCase().replace(/İ/g, "I");
}
function nowIso() {
  return new Date().toISOString();
}
function boolValue(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["0", "FALSE", "HAYIR", "NO", "OFF"].includes(upper(value));
}
function slugify(value: unknown) {
  return text(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
function quoteIdentifier(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
function isOwner(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
async function bodyOf(c: any): Promise<Row> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
async function tableExists(c: any, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(table).first<Row>();
  return Boolean(row?.name);
}
async function tableColumns(c: any, table: string) {
  const result = await c.env.DB.prepare(
    `PRAGMA table_info(${quoteIdentifier(table)})`,
  ).all<Row>();
  return new Set((result.results || []).map((row: Row) => text(row.name)));
}
async function ownerCurrent(c: any) {
  const current = await getAuthenticatedUser(c);
  if (!current || !isOwner(current.role)) return null;
  return current;
}
async function verifyOwnerPassword(c: any, current: Row, password: unknown) {
  const raw = text(password);
  if (!raw) return false;
  const row = await c.env.DB.prepare(
    "SELECT password_hash FROM auth_users WHERE id=? AND is_active=1 LIMIT 1",
  ).bind(current.id).first<Row>();
  if (!row?.password_hash) return false;
  try {
    return await compare(raw, text(row.password_hash));
  } catch {
    return false;
  }
}
function clientIp(c: any) {
  return text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]);
}
async function audit(c: any, action: string, actorId: string, targetId = "", detail: Row = {}) {
  if (!(await tableExists(c, "auth_security_audit"))) return;
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit
       (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      actorId || null,
      targetId || null,
      text(detail.mainCompanySlug) || null,
      action,
      null,
      clientIp(c) || null,
      JSON.stringify(detail || {}),
      nowIso(),
    ).run();
  } catch {
    // Yönetim işlemi audit yazımı yüzünden düşürülmez.
  }
}
async function tenantTables(c: any) {
  const result = await c.env.DB.prepare(
    `SELECT name FROM sqlite_master
      WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
        AND name NOT IN ('d1_migrations','main_companies')
      ORDER BY name`,
  ).all<Row>();
  const tables: string[] = [];
  for (const row of result.results || []) {
    const name = text(row.name);
    if (!name) continue;
    const columns = await tableColumns(c, name);
    if (columns.has("main_company_slug")) tables.push(name);
  }
  return tables;
}
async function tenantDataCounts(c: any, slug: string) {
  const counts: Row[] = [];
  for (const table of await tenantTables(c)) {
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)} WHERE main_company_slug=?`,
    ).bind(slug).first<Row>();
    const total = Number(row?.total || 0);
    if (total > 0) counts.push({ table, total });
  }
  return counts;
}
async function tenantMovePlan(c: any, sourceSlug: string, targetSlug: string) {
  const changed: Row[] = [];
  const statements: any[] = [];
  if (!sourceSlug || !targetSlug || sourceSlug === targetSlug) return { changed, statements };
  for (const table of await tenantTables(c)) {
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)} WHERE main_company_slug=?`,
    ).bind(sourceSlug).first<Row>();
    const total = Number(countRow?.total || 0);
    if (!total) continue;
    statements.push(
      c.env.DB.prepare(
        `UPDATE ${quoteIdentifier(table)} SET main_company_slug=? WHERE main_company_slug=?`,
      ).bind(targetSlug, sourceSlug),
    );
    changed.push({ table, rows: total });
  }
  return { changed, statements };
}
async function atomicBatch(c: any, statements: any[]) {
  if (!statements.length) return [];
  // Cloudflare D1 batch bir transaction olarak uygulanır. Bir statement hata verirse
  // batch bütünü geri alınır; tenant aktarımı yarım durumda bırakılamaz.
  return c.env.DB.batch(statements);
}
function companyView(row: Row) {
  return {
    id: text(row.id),
    name: text(row.name),
    slug: text(row.slug),
    note: text(row.title),
    isActive: Number(row.is_active ?? 1) !== 0,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}
async function companyById(c: any, id: string) {
  return c.env.DB.prepare(
    "SELECT id,slug,name,title,is_active,created_at,updated_at FROM main_companies WHERE id=? LIMIT 1",
  ).bind(id).first<Row>();
}
async function readSetting(c: any, fileName: string) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare(
    `SELECT data FROM json_store WHERE scope=? AND file_name=? ORDER BY updated_at DESC LIMIT 1`,
  ).bind(SETTINGS_SCOPE, fileName).first<Row>();
  if (!row?.data) return null;
  try { return JSON.parse(text(row.data)); } catch { return null; }
}
async function writeSetting(c: any, fileName: string, data: Row) {
  const timestamp = nowIso();
  const existing = await c.env.DB.prepare(
    "SELECT id FROM json_store WHERE scope=? AND file_name=? LIMIT 1",
  ).bind(SETTINGS_SCOPE, fileName).first<Row>();
  const payload = JSON.stringify({ ...data, updatedAt: timestamp });
  if (existing?.id) {
    await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?")
      .bind(payload, timestamp, existing.id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), SETTINGS_SCOPE, null, fileName, payload, timestamp, timestamp).run();
  }
  return { ...data, updatedAt: timestamp };
}

export function registerAdminCoreRoutes(app: any) {
  app.get("/api/admin/main-companies", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Ana firma yönetimi yalnız uygulama sahibine açıktır."), 403);
    const result = await c.env.DB.prepare(
      "SELECT id,slug,name,title,is_active,created_at,updated_at FROM main_companies ORDER BY is_active DESC,name COLLATE NOCASE ASC",
    ).all<Row>();
    return c.json({ ok: true, data: (result.results || []).map(companyView) });
  });

  app.post("/api/admin/main-companies", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Ana firma oluşturma yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const name = text(body.name);
    const slug = slugify(body.slug || name);
    if (!name || !slug) return c.json(errorBody("INVALID_COMPANY", "Firma adı ve geçerli kısa kod zorunludur."), 400);
    const conflict = await c.env.DB.prepare("SELECT id FROM main_companies WHERE slug=? LIMIT 1").bind(slug).first<Row>();
    if (conflict?.id) return c.json(errorBody("COMPANY_SLUG_EXISTS", "Bu firma kısa kodu zaten kullanılıyor."), 409);
    const id = text(body.id) || crypto.randomUUID();
    const timestamp = nowIso();
    await c.env.DB.prepare(
      `INSERT INTO main_companies(id,slug,name,title,is_active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(id, slug, name, text(body.note) || null, boolValue(body.isActive, true) ? 1 : 0, timestamp, timestamp).run();
    await audit(c, "MAIN_COMPANY_CREATED", current.id, id, { mainCompanySlug: slug, name });
    return c.json({ ok: true, data: companyView(await companyById(c, id) || { id, slug, name, title: text(body.note), is_active: 1, created_at: timestamp, updated_at: timestamp }) }, 201);
  });

  app.patch("/api/admin/main-companies/:id", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Ana firma düzenleme yalnız uygulama sahibine açıktır."), 403);
    const id = text(c.req.param("id"));
    const row = await companyById(c, id);
    if (!row) return c.json(errorBody("COMPANY_NOT_FOUND", "Ana firma bulunamadı."), 404);
    const body = await bodyOf(c);
    const name = text(body.name || row.name);
    const nextSlug = slugify(body.slug || row.slug || name);
    if (!name || !nextSlug) return c.json(errorBody("INVALID_COMPANY", "Firma adı ve geçerli kısa kod zorunludur."), 400);
    const timestamp = nowIso();
    try {
      if (nextSlug !== text(row.slug)) {
        const conflict = await c.env.DB.prepare("SELECT id FROM main_companies WHERE slug=? AND id<>? LIMIT 1").bind(nextSlug, id).first<Row>();
        if (conflict?.id) return c.json(errorBody("COMPANY_SLUG_EXISTS", "Bu firma kısa kodu başka bir ana firmada kullanılıyor."), 409);
        const plan = await tenantMovePlan(c, text(row.slug), nextSlug);
        plan.statements.push(
          c.env.DB.prepare(
            `UPDATE main_companies SET slug=?,name=?,title=?,is_active=?,updated_at=? WHERE id=?`,
          ).bind(nextSlug, name, text(body.note) || null, boolValue(body.isActive, Number(row.is_active ?? 1) !== 0) ? 1 : 0, timestamp, id),
        );
        await atomicBatch(c, plan.statements);
      } else {
        await c.env.DB.prepare(
          `UPDATE main_companies SET name=?,title=?,is_active=?,updated_at=? WHERE id=?`,
        ).bind(name, text(body.note) || null, boolValue(body.isActive, Number(row.is_active ?? 1) !== 0) ? 1 : 0, timestamp, id).run();
      }
    } catch (error) {
      return c.json(errorBody("COMPANY_SLUG_MOVE_FAILED", "Firma değişikliği atomik olarak uygulanamadı; hiçbir tablo yarım taşınmadı.", { message: error instanceof Error ? error.message : String(error) }), 409);
    }
    await audit(c, "MAIN_COMPANY_UPDATED", current.id, id, { mainCompanySlug: nextSlug, previousSlug: text(row.slug), name });
    return c.json({ ok: true, data: companyView(await companyById(c, id) || row) });
  });

  app.post("/api/admin/main-companies/:id/transfer", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Firma veri aktarımı yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    if (!(await verifyOwnerPassword(c, current, body.adminPassword))) return c.json(errorBody("PASSWORD_INVALID", "Yönetici şifresi doğrulanamadı."), 401);
    const source = await companyById(c, text(c.req.param("id")));
    const target = await companyById(c, text(body.targetId));
    if (!source || !target) return c.json(errorBody("COMPANY_NOT_FOUND", "Kaynak veya hedef ana firma bulunamadı."), 404);
    if (source.id === target.id) return c.json(errorBody("SAME_COMPANY", "Kaynak ve hedef firma aynı olamaz."), 400);
    const timestamp = nowIso();
    let changed: Row[] = [];
    try {
      const plan = await tenantMovePlan(c, text(source.slug), text(target.slug));
      changed = plan.changed;
      plan.statements.push(
        c.env.DB.prepare("UPDATE main_companies SET is_active=0,updated_at=? WHERE id=?")
          .bind(timestamp, source.id),
      );
      await atomicBatch(c, plan.statements);
    } catch (error) {
      return c.json(errorBody("COMPANY_TRANSFER_CONFLICT", "Firma veri aktarımı atomik olarak tamamlanamadı. Bir tablo bile hata verirse tüm aktarım geri alınır.", { message: error instanceof Error ? error.message : String(error) }), 409);
    }
    await audit(c, "MAIN_COMPANY_TRANSFERRED", current.id, source.id, { mainCompanySlug: text(source.slug), targetId: target.id, targetSlug: text(target.slug), tables: changed });
    return c.json({ ok: true, data: { source: companyView(source), target: companyView(target), transferredTables: changed, sourceDeactivated: true, transferredAt: timestamp } });
  });

  app.post("/api/admin/main-companies/:id/delete", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Ana firma silme yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    if (!(await verifyOwnerPassword(c, current, body.adminPassword))) return c.json(errorBody("PASSWORD_INVALID", "Yönetici şifresi doğrulanamadı."), 401);
    const row = await companyById(c, text(c.req.param("id")));
    if (!row) return c.json(errorBody("COMPANY_NOT_FOUND", "Ana firma bulunamadı."), 404);
    const counts = await tenantDataCounts(c, text(row.slug));
    if (counts.length) return c.json(errorBody("COMPANY_HAS_DATA", "Bu ana firmada veri var. Önce verileri başka ana firmaya aktarın; veri varken doğrudan silme yapılmaz.", { tables: counts }), 409);
    const active = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM main_companies WHERE is_active=1 AND id<>?").bind(row.id).first<Row>();
    if (Number(active?.total || 0) < 1) return c.json(errorBody("LAST_ACTIVE_COMPANY", "Sistemde en az bir aktif ana firma kalmalıdır."), 409);
    await c.env.DB.prepare("DELETE FROM main_companies WHERE id=?").bind(row.id).run();
    await audit(c, "MAIN_COMPANY_DELETED", current.id, row.id, { mainCompanySlug: text(row.slug), name: text(row.name) });
    return c.json({ ok: true, data: { id: row.id, deleted: true, deletedAt: nowIso() } });
  });

  app.get("/api/admin/settings", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Sistem ayarları yalnız uygulama sahibine açıktır."), 403);
    const fileName = text(c.req.query("key") || "global");
    return c.json({ ok: true, data: (await readSetting(c, fileName)) || {} });
  });

  app.post("/api/admin/settings", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Sistem ayarları yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const fileName = text(body.key || "global");
    const data = { ...body };
    delete data.key;
    const saved = await writeSetting(c, fileName, data);
    await audit(c, "ADMIN_SETTING_UPDATED", current.id, current.id, { key: fileName });
    return c.json({ ok: true, data: saved });
  });

  app.get("/api/admin/logs", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Sistem logları yalnız uygulama sahibine açıktır."), 403);
    const limit = Math.max(1, Math.min(Number(c.req.query("limit") || 250), 500));
    const rows: Row[] = [];
    if (await tableExists(c, "auth_security_audit")) {
      const result = await c.env.DB.prepare(
        `SELECT id,action,actor_user_id,target_user_id,ip_address,detail,created_at
           FROM auth_security_audit ORDER BY created_at DESC LIMIT ?`,
      ).bind(limit).all<Row>();
      for (const row of result.results || []) {
        rows.push({ id: row.id, level: "INFO", source: "GUVENLIK", message: row.action, action: row.action, detail: row.detail, actorUserId: row.actor_user_id, targetUserId: row.target_user_id, ipAddress: row.ip_address, createdAt: row.created_at });
      }
    }
    if (await tableExists(c, "json_store")) {
      const result = await c.env.DB.prepare(
        `SELECT id,file_name,data,created_at,updated_at FROM json_store
          WHERE scope=? ORDER BY updated_at DESC LIMIT ?`,
      ).bind(BACKUP_SCOPE, limit).all<Row>();
      for (const row of result.results || []) {
        rows.push({ id: `backup:${row.id}`, level: "INFO", source: "YEDEKLEME", message: "BACKUP_EVENT", detail: row.data, createdAt: row.updated_at || row.created_at });
      }
    }
    rows.sort((a, b) => Date.parse(text(b.createdAt) || "0") - Date.parse(text(a.createdAt) || "0"));
    return c.json({ ok: true, data: rows.slice(0, limit) });
  });
}
