// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type Row = Record<string, any>;

const COMPANY_META_SCOPE = "ADMIN_COMPANY_ALIAS_META";
const PRODUCT_ALIAS_SCOPE = "ADMIN_PRODUCT_ALIAS";

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toLocaleUpperCase("tr-TR");
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
function normalize(value: unknown) {
  return upper(value)
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
function isOwner(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
async function ownerCurrent(c: any) {
  const current = await getAuthenticatedUser(c);
  return current && isOwner(current.role) ? current : null;
}
async function bodyOf(c: any): Promise<Row> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
function slugOf(c: any, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}
async function tableExists(c: any, table: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<Row>();
  return Boolean(row?.name);
}
function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (!text(value)) return {};
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
async function storeGet(c: any, scope: string, fileName: string, slug: string) {
  const row = await c.env.DB.prepare(
    `SELECT id,data,created_at,updated_at FROM json_store
      WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(scope, fileName, slug).first<Row>();
  return row ? { ...objectOf(row.data), storeId: row.id, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}
async function storeList(c: any, scope: string, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT id,file_name,data,created_at,updated_at FROM json_store
      WHERE scope=? AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC`,
  ).bind(scope, slug).all<Row>();
  return (result.results || []).map((row: Row) => ({ ...objectOf(row.data), storeId: row.id, fileName: row.file_name, createdAt: row.created_at, updatedAt: row.updated_at }));
}
async function storePut(c: any, scope: string, fileName: string, slug: string, data: Row) {
  const timestamp = nowIso();
  const existing = await c.env.DB.prepare(
    "SELECT id,created_at FROM json_store WHERE scope=? AND file_name=? AND main_company_slug=? LIMIT 1",
  ).bind(scope, fileName, slug).first<Row>();
  const payload = JSON.stringify({ ...data, updatedAt: timestamp });
  if (existing?.id) {
    await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?").bind(payload, timestamp, existing.id).run();
    return { ...data, updatedAt: timestamp, createdAt: existing.created_at };
  }
  await c.env.DB.prepare(
    `INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).bind(crypto.randomUUID(), scope, slug, fileName, payload, timestamp, timestamp).run();
  return { ...data, createdAt: timestamp, updatedAt: timestamp };
}
async function audit(c: any, action: string, actorId: string, slug: string, detail: Row = {}) {
  if (!(await tableExists(c, "auth_security_audit"))) return;
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit
       (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), actorId || null, null, slug || null, action, null, null, JSON.stringify(detail), nowIso()).run();
  } catch { /* audit best effort */ }
}
async function companyMeta(c: any, aliasId: string, slug: string) {
  return (await storeGet(c, COMPANY_META_SCOPE, aliasId, slug)) || {};
}
async function companyAliasView(c: any, row: Row, slug: string) {
  const meta = await companyMeta(c, text(row.id), slug);
  return {
    id: text(row.id),
    rawName: text(row.raw_name),
    normalizedRawName: text(row.normalized_name),
    matchedCompanyId: text(row.company_id),
    matchedCompanyName: text(row.company_name),
    sourceType: text(row.source || meta.sourceType || "MANUAL"),
    isActive: Number(row.is_active ?? 1) !== 0,
    isDeleted: Boolean(text(row.deleted_at)),
    note: text(meta.note),
    hitCount: Number(meta.hitCount || 0),
    lastSeenAt: text(meta.lastSeenAt || row.updated_at || row.created_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}
async function productCatalog(c: any, slug: string) {
  if (!(await tableExists(c, "invoice_items"))) return [];
  const result = await c.env.DB.prepare(
    `SELECT product_name,description,unit,COUNT(*) AS usage_count,MAX(created_at) AS last_seen_at
       FROM invoice_items
      WHERE main_company_slug=?
        AND TRIM(COALESCE(product_name,''))<>''
      GROUP BY product_name,description,unit
      ORDER BY usage_count DESC,product_name COLLATE NOCASE ASC
      LIMIT 3000`,
  ).bind(slug).all<Row>();
  const seen = new Set<string>();
  const items: Row[] = [];
  for (const row of result.results || []) {
    const name = text(row.product_name || row.description);
    const normalized = normalize(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push({
      id: `ACCOUNTING:${normalized}`,
      name,
      productName: name,
      urunAdi: name,
      ticariAdi: name,
      code: "",
      kod: "",
      unit: text(row.unit),
      usageCount: Number(row.usage_count || 0),
      lastSeenAt: text(row.last_seen_at),
    });
  }
  return items;
}
async function productById(c: any, slug: string, id: string) {
  return (await productCatalog(c, slug)).find((row: Row) => text(row.id) === id) || null;
}

export function registerAdminMappingRoutes(app: any) {
  app.get("/api/admin/company-aliases", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Eşleştirme merkezi yalnız uygulama sahibine açıktır."), 403);
    const slug = slugOf(c);
    const includeDeleted = boolValue(c.req.query("includeDeleted"), false);
    const result = await c.env.DB.prepare(
      `SELECT a.*,c.name AS company_name
         FROM company_aliases a
         LEFT JOIN companies c ON c.id=a.company_id AND c.main_company_slug=a.main_company_slug
        WHERE a.main_company_slug=? ${includeDeleted ? "" : "AND a.deleted_at IS NULL"}
        ORDER BY a.updated_at DESC,a.raw_name COLLATE NOCASE ASC`,
    ).bind(slug).all<Row>();
    const data = [];
    for (const row of result.results || []) data.push(await companyAliasView(c, row, slug));
    return c.json({ ok: true, data });
  });

  app.post("/api/admin/company-aliases", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Eşleştirme merkezi yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const rawName = text(body.rawName);
    const companyId = text(body.matchedCompanyId);
    if (!rawName || !companyId) return c.json(errorBody("MAPPING_REQUIRED", "Ham firma adı ve eşleşecek firma zorunludur."), 400);
    const company = await c.env.DB.prepare("SELECT id,name FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1").bind(companyId, slug).first<Row>();
    if (!company) return c.json(errorBody("COMPANY_NOT_FOUND", "Eşleşecek firma bulunamadı."), 404);
    const normalized = normalize(rawName);
    const existing = await c.env.DB.prepare("SELECT id FROM company_aliases WHERE main_company_slug=? AND normalized_name=? LIMIT 1").bind(slug, normalized).first<Row>();
    const id = text(existing?.id) || crypto.randomUUID();
    const timestamp = nowIso();
    if (existing?.id) {
      await c.env.DB.prepare(
        `UPDATE company_aliases SET company_id=?,raw_name=?,normalized_name=?,source=?,is_active=?,deleted_at=NULL,updated_at=?
          WHERE id=? AND main_company_slug=?`,
      ).bind(companyId, rawName, normalized, text(body.sourceType || "MANUAL"), boolValue(body.isActive, true) ? 1 : 0, timestamp, id, slug).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO company_aliases(id,main_company_slug,company_id,raw_name,normalized_name,is_active,source,tax_no,created_at,updated_at,deleted_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`,
      ).bind(id, slug, companyId, rawName, normalized, boolValue(body.isActive, true) ? 1 : 0, text(body.sourceType || "MANUAL"), null, timestamp, timestamp).run();
    }
    await storePut(c, COMPANY_META_SCOPE, id, slug, { note: text(body.note), sourceType: text(body.sourceType || "MANUAL"), hitCount: 0, lastSeenAt: timestamp });
    await audit(c, "COMPANY_ALIAS_SAVED", current.id, slug, { id, rawName, companyId });
    return c.json({ ok: true, data: { id, rawName, normalizedRawName: normalized, matchedCompanyId: companyId, matchedCompanyName: text(company.name) } }, existing?.id ? 200 : 201);
  });

  app.patch("/api/admin/company-aliases/:id", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Eşleştirme merkezi yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = text(c.req.param("id"));
    const row = await c.env.DB.prepare("SELECT * FROM company_aliases WHERE id=? AND main_company_slug=? LIMIT 1").bind(id, slug).first<Row>();
    if (!row) return c.json(errorBody("ALIAS_NOT_FOUND", "Firma eşleştirmesi bulunamadı."), 404);
    const rawName = text(body.rawName || row.raw_name);
    const companyId = text(body.matchedCompanyId || row.company_id);
    const company = await c.env.DB.prepare("SELECT id,name FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1").bind(companyId, slug).first<Row>();
    if (!company) return c.json(errorBody("COMPANY_NOT_FOUND", "Eşleşecek firma bulunamadı."), 404);
    const normalized = normalize(rawName);
    const conflict = await c.env.DB.prepare("SELECT id FROM company_aliases WHERE main_company_slug=? AND normalized_name=? AND id<>? LIMIT 1").bind(slug, normalized, id).first<Row>();
    if (conflict?.id) return c.json(errorBody("ALIAS_EXISTS", "Bu ham firma adı başka bir eşleştirmede zaten kayıtlı."), 409);
    const timestamp = nowIso();
    await c.env.DB.prepare(
      `UPDATE company_aliases SET company_id=?,raw_name=?,normalized_name=?,source=?,is_active=?,updated_at=? WHERE id=? AND main_company_slug=?`,
    ).bind(companyId, rawName, normalized, text(body.sourceType || row.source || "MANUAL"), boolValue(body.isActive, Number(row.is_active ?? 1) !== 0) ? 1 : 0, timestamp, id, slug).run();
    const oldMeta = await companyMeta(c, id, slug);
    await storePut(c, COMPANY_META_SCOPE, id, slug, { ...oldMeta, note: text(body.note ?? oldMeta.note), sourceType: text(body.sourceType || row.source || "MANUAL"), lastSeenAt: timestamp });
    await audit(c, "COMPANY_ALIAS_UPDATED", current.id, slug, { id, rawName, companyId });
    return c.json({ ok: true, data: { id, rawName, normalizedRawName: normalized, matchedCompanyId: companyId, matchedCompanyName: text(company.name) } });
  });

  app.post("/api/admin/company-aliases/:id/:action", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Eşleştirme merkezi yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = text(c.req.param("id"));
    const action = upper(c.req.param("action"));
    if (!["ACTIVATE", "DEACTIVATE", "DELETE", "RESTORE"].includes(action)) return c.json(errorBody("INVALID_ACTION", "Geçersiz eşleştirme işlemi."), 400);
    const row = await c.env.DB.prepare("SELECT id FROM company_aliases WHERE id=? AND main_company_slug=? LIMIT 1").bind(id, slug).first<Row>();
    if (!row) return c.json(errorBody("ALIAS_NOT_FOUND", "Firma eşleştirmesi bulunamadı."), 404);
    const timestamp = nowIso();
    if (action === "DELETE") await c.env.DB.prepare("UPDATE company_aliases SET is_active=0,deleted_at=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(timestamp, timestamp, id, slug).run();
    else if (action === "RESTORE") await c.env.DB.prepare("UPDATE company_aliases SET is_active=1,deleted_at=NULL,updated_at=? WHERE id=? AND main_company_slug=?").bind(timestamp, id, slug).run();
    else await c.env.DB.prepare("UPDATE company_aliases SET is_active=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(action === "ACTIVATE" ? 1 : 0, timestamp, id, slug).run();
    await audit(c, `COMPANY_ALIAS_${action}`, current.id, slug, { id });
    return c.json({ ok: true, data: { id, action, updatedAt: timestamp } });
  });

  app.get("/api/admin/product-catalog", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Ürün kataloğu yalnız uygulama sahibine açıktır."), 403);
    return c.json({ ok: true, data: await productCatalog(c, slugOf(c)) });
  });

  app.get("/api/admin/product-aliases", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Eşleştirme merkezi yalnız uygulama sahibine açıktır."), 403);
    const slug = slugOf(c);
    const includeDeleted = boolValue(c.req.query("includeDeleted"), false);
    const rows = await storeList(c, PRODUCT_ALIAS_SCOPE, slug);
    return c.json({ ok: true, data: rows.filter((row: Row) => includeDeleted || row.isDeleted !== true) });
  });

  app.post("/api/admin/product-aliases", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Eşleştirme merkezi yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const rawName = text(body.rawName);
    const matchedProductId = text(body.matchedProductId);
    if (!rawName || !matchedProductId) return c.json(errorBody("MAPPING_REQUIRED", "Ham ürün adı ve eşleşecek ürün zorunludur."), 400);
    const normalizedRawName = normalize(rawName);
    const existing = (await storeList(c, PRODUCT_ALIAS_SCOPE, slug)).find((row: Row) => normalize(row.rawName) === normalizedRawName && row.isDeleted !== true);
    if (existing) return c.json(errorBody("PRODUCT_ALIAS_EXISTS", "Bu ham ürün adı zaten eşleştirilmiş."), 409);
    const product = await productById(c, slug, matchedProductId);
    if (!product) return c.json(errorBody("PRODUCT_NOT_FOUND", "Eşleşecek ürün katalogda bulunamadı."), 404);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    const saved = await storePut(c, PRODUCT_ALIAS_SCOPE, id, slug, {
      id,
      rawName,
      normalizedRawName,
      matchedProductId,
      matchedProductName: text(product.name),
      matchedProductCode: text(product.code),
      sourceType: text(body.sourceType || "MANUAL"),
      isActive: boolValue(body.isActive, true),
      isDeleted: false,
      note: text(body.note),
      hitCount: 0,
      lastSeenAt: timestamp,
    });
    await audit(c, "PRODUCT_ALIAS_CREATED", current.id, slug, { id, rawName, matchedProductId });
    return c.json({ ok: true, data: saved }, 201);
  });

  app.patch("/api/admin/product-aliases/:id", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Eşleştirme merkezi yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = text(c.req.param("id"));
    const existing = await storeGet(c, PRODUCT_ALIAS_SCOPE, id, slug);
    if (!existing) return c.json(errorBody("ALIAS_NOT_FOUND", "Ürün eşleştirmesi bulunamadı."), 404);
    const rawName = text(body.rawName || existing.rawName);
    const matchedProductId = text(body.matchedProductId || existing.matchedProductId);
    const duplicate = (await storeList(c, PRODUCT_ALIAS_SCOPE, slug)).find((row: Row) => text(row.id || row.fileName) !== id && normalize(row.rawName) === normalize(rawName) && row.isDeleted !== true);
    if (duplicate) return c.json(errorBody("PRODUCT_ALIAS_EXISTS", "Bu ham ürün adı başka bir eşleştirmede zaten kayıtlı."), 409);
    const product = await productById(c, slug, matchedProductId);
    if (!product) return c.json(errorBody("PRODUCT_NOT_FOUND", "Eşleşecek ürün katalogda bulunamadı."), 404);
    const saved = await storePut(c, PRODUCT_ALIAS_SCOPE, id, slug, {
      ...existing,
      id,
      rawName,
      normalizedRawName: normalize(rawName),
      matchedProductId,
      matchedProductName: text(product.name),
      matchedProductCode: text(product.code),
      sourceType: text(body.sourceType || existing.sourceType || "MANUAL"),
      isActive: boolValue(body.isActive, existing.isActive !== false),
      note: text(body.note ?? existing.note),
      isDeleted: existing.isDeleted === true,
      lastSeenAt: nowIso(),
    });
    await audit(c, "PRODUCT_ALIAS_UPDATED", current.id, slug, { id, rawName, matchedProductId });
    return c.json({ ok: true, data: saved });
  });

  app.post("/api/admin/product-aliases/:id/:action", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Eşleştirme merkezi yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = text(c.req.param("id"));
    const action = upper(c.req.param("action"));
    if (!["ACTIVATE", "DEACTIVATE", "DELETE", "RESTORE"].includes(action)) return c.json(errorBody("INVALID_ACTION", "Geçersiz eşleştirme işlemi."), 400);
    const existing = await storeGet(c, PRODUCT_ALIAS_SCOPE, id, slug);
    if (!existing) return c.json(errorBody("ALIAS_NOT_FOUND", "Ürün eşleştirmesi bulunamadı."), 404);
    const saved = await storePut(c, PRODUCT_ALIAS_SCOPE, id, slug, {
      ...existing,
      id,
      isActive: action === "ACTIVATE" || action === "RESTORE" ? true : action === "DEACTIVATE" || action === "DELETE" ? false : existing.isActive,
      isDeleted: action === "DELETE" ? true : action === "RESTORE" ? false : existing.isDeleted === true,
      lastSeenAt: nowIso(),
    });
    await audit(c, `PRODUCT_ALIAS_${action}`, current.id, slug, { id });
    return c.json({ ok: true, data: saved });
  });
}
