// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type Row = Record<string, any>;

const BACKUP_SCOPE = "ADMIN_BACKUP";
const SQL_PART_TARGET_BYTES = 6 * 1024 * 1024;

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
function upper(value: unknown) {
  return text(value).toLocaleUpperCase("tr-TR");
}
function nowIso() {
  return new Date().toISOString();
}
function isOwner(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
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
function quoteIdentifier(value: string) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}
function sqlLiteral(value: unknown): string {
  if (value === undefined || value === null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "bigint") return value.toString();
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return `'${String(raw ?? "").replace(/'/g, "''")}'`;
}
function safeSqlTable(name: unknown) {
  const value = text(name);
  if (!value) return false;
  if (value === "json_store") return false;
  if (value.startsWith("auth_")) return false;
  if (value === "d1_migrations") return false;
  return true;
}
async function ownerCurrent(c: any) {
  const current = await getAuthenticatedUser(c);
  return current && isOwner(current.role) ? current : null;
}
async function tableExists(c: any, table: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<Row>();
  return Boolean(row?.name);
}
async function audit(c: any, action: string, actorId: string, slug: string, detail: Row = {}) {
  if (!(await tableExists(c, "auth_security_audit"))) return;
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit
       (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      actorId || null,
      null,
      slug || null,
      action,
      null,
      text(c.req.header("CF-Connecting-IP")) || null,
      JSON.stringify(detail || {}),
      nowIso(),
    ).run();
  } catch {
    // SQL dışa aktarma audit yazımı yüzünden düşürülmez.
  }
}
async function backupRecord(c: any, backupId: string) {
  const row = await c.env.DB.prepare(
    `SELECT id,main_company_slug,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND file_name=?
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(BACKUP_SCOPE, backupId).first<Row>();
  if (!row) return null;
  return {
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    mainCompanySlug: text(row.main_company_slug),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}
async function saveSqlMetadata(c: any, record: Row, data: Row) {
  const timestamp = nowIso();
  const next = { ...record };
  delete next.storeId;
  delete next.fileName;
  next.sqlKey = text(data.sqlKey);
  next.sqlBytes = Number(data.sqlBytes || 0);
  next.sqlGeneratedAt = timestamp;
  next.updatedAt = timestamp;
  await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?")
    .bind(JSON.stringify(next), timestamp, record.storeId).run();
  return { ...record, ...next };
}
async function readJsonObject(object: any) {
  if (!object) return null;
  try {
    const raw = await object.text();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function companyInsertSql(company: Row) {
  const entries = Object.entries(company || {}).filter(([, value]) => value !== undefined);
  if (!entries.length) return "";
  const columns = entries.map(([name]) => quoteIdentifier(name)).join(",");
  const values = entries.map(([, value]) => sqlLiteral(value)).join(",");
  return `INSERT OR REPLACE INTO ${quoteIdentifier("main_companies")} (${columns}) VALUES (${values});\n`;
}
function rowInsertSql(table: string, row: Row) {
  const entries = Object.entries(row || {}).filter(([, value]) => value !== undefined);
  if (!entries.length) return "";
  const columns = entries.map(([name]) => quoteIdentifier(name)).join(",");
  const values = entries.map(([, value]) => sqlLiteral(value)).join(",");
  return `INSERT OR REPLACE INTO ${quoteIdentifier(table)} (${columns}) VALUES (${values});\n`;
}

async function materializeSqlBackup(c: any, current: Row, record: Row, force = false) {
  const bucket = c.env.FILES as any;
  if (!force && text(record.sqlKey)) {
    const existing = await bucket.head(text(record.sqlKey));
    if (existing) {
      return {
        ...record,
        sqlKey: text(record.sqlKey),
        sqlBytes: Number(existing.size || record.sqlBytes || 0),
        sqlGeneratedAt: record.sqlGeneratedAt || existing.uploaded?.toISOString?.() || "",
        reused: true,
      };
    }
  }

  const manifestKey = text(record.manifestKey);
  if (!manifestKey) throw new Error("BACKUP_MANIFEST_KEY_MISSING");
  const manifest = await readJsonObject(await bucket.get(manifestKey));
  if (!manifest || !Array.isArray(manifest.tables)) throw new Error("BACKUP_MANIFEST_INVALID");

  const slug = text(record.mainCompanySlug || manifest.mainCompanySlug);
  const backupId = text(record.id || record.fileName);
  const prefix = text(record.prefix || manifestKey.replace(/manifest\.json$/i, ""));
  const sqlKey = `${prefix}tenant-backup.sql`;
  const upload = await bucket.createMultipartUpload(sqlKey, {
    httpMetadata: { contentType: "application/sql; charset=utf-8" },
    customMetadata: {
      backupId,
      mainCompanySlug: slug,
      backupFormat: "KYERP_TENANT_SQL_V1",
      generatedAt: nowIso(),
    },
  });

  const encoder = new TextEncoder();
  const uploadedParts: any[] = [];
  let partNumber = 1;
  let pending: string[] = [];
  let pendingBytes = 0;
  let totalBytes = 0;
  let sqlRows = 0;

  const flush = async (forceFlush = false) => {
    if (!pending.length) return;
    if (!forceFlush && pendingBytes < SQL_PART_TARGET_BYTES) return;
    const bytes = encoder.encode(pending.join(""));
    const uploaded = await upload.uploadPart(partNumber, bytes);
    uploadedParts.push(uploaded);
    partNumber += 1;
    totalBytes += bytes.byteLength;
    pending = [];
    pendingBytes = 0;
  };
  const append = async (value: string) => {
    if (!value) return;
    pending.push(value);
    pendingBytes += encoder.encode(value).byteLength;
    if (pendingBytes >= SQL_PART_TARGET_BYTES) await flush(false);
  };

  try {
    await append("-- KY ERP FIRMA BAZLI SQL YEDEGI\n");
    await append(`-- Backup ID: ${backupId}\n`);
    await append(`-- Ana firma: ${slug}\n`);
    await append(`-- Olusturma: ${text(record.createdAt || manifest.createdAt || nowIso())}\n`);
    await append("-- Not: Sema KY ERP migrationlari tarafindan yonetilir; bu dosya firma verisini birebir geri yuklemek icindir.\n\n");
    await append("PRAGMA foreign_keys=OFF;\nBEGIN IMMEDIATE;\n\n");

    if (manifest.mainCompany && typeof manifest.mainCompany === "object") {
      await append("-- Ana firma kaydi\n");
      await append(companyInsertSql(manifest.mainCompany));
      await append("\n");
    }

    for (const entry of manifest.tables || []) {
      const table = text(entry?.name);
      if (!safeSqlTable(table)) continue;
      await append(`-- Tablo: ${table}\n`);
      await append(`DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier("main_company_slug")}=${sqlLiteral(slug)};\n`);
      for (const key of Array.isArray(entry?.chunks) ? entry.chunks : []) {
        const payload = await readJsonObject(await bucket.get(text(key)));
        for (const sourceRow of Array.isArray(payload?.rows) ? payload.rows : []) {
          const row = { ...sourceRow, main_company_slug: slug };
          await append(rowInsertSql(table, row));
          sqlRows += 1;
        }
      }
      await append("\n");
    }

    await append("COMMIT;\nPRAGMA foreign_keys=ON;\n");
    await flush(true);
    await upload.complete(uploadedParts);
  } catch (error) {
    try { await upload.abort(); } catch { /* noop */ }
    throw error;
  }

  const saved = await saveSqlMetadata(c, record, { sqlKey, sqlBytes: totalBytes });
  await audit(c, "TENANT_SQL_BACKUP_GENERATED", current.id, slug, { backupId, sqlKey, sqlBytes: totalBytes, sqlRows });
  return { ...saved, sqlKey, sqlBytes: totalBytes, sqlRows, reused: false };
}

export function registerAdminBackupSqlRoutes(app: any) {
  app.post("/api/admin/backups/:id/sql", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "SQL yedek yalnız uygulama sahibine açıktır."), 403);
    const backupId = text(c.req.param("id"));
    const record = await backupRecord(c, backupId);
    if (!record) return c.json(errorBody("BACKUP_NOT_FOUND", "SQL üretilecek yedek bulunamadı."), 404);
    let force = false;
    try {
      const body = await c.req.json();
      force = body?.force === true;
    } catch { /* body optional */ }
    try {
      const result = await materializeSqlBackup(c, current, record, force);
      return c.json({ ok: true, data: result });
    } catch (error) {
      return c.json(errorBody("SQL_BACKUP_FAILED", "Firma SQL yedeği üretilemedi.", { message: error instanceof Error ? error.message : String(error) }), 500);
    }
  });

  app.get("/api/admin/backups/:id/sql/download", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "SQL yedek yalnız uygulama sahibine açıktır."), 403);
    const backupId = text(c.req.param("id"));
    let record = await backupRecord(c, backupId);
    if (!record) return c.json(errorBody("BACKUP_NOT_FOUND", "SQL indirilecek yedek bulunamadı."), 404);
    if (!text(record.sqlKey)) {
      try { record = await materializeSqlBackup(c, current, record, false); }
      catch (error) { return c.json(errorBody("SQL_BACKUP_FAILED", "Firma SQL yedeği hazırlanamadı.", { message: error instanceof Error ? error.message : String(error) }), 500); }
    }
    const object = await c.env.FILES.get(text(record.sqlKey));
    if (!object) return c.json(errorBody("SQL_BACKUP_OBJECT_MISSING", "SQL yedek dosyası R2 üzerinde bulunamadı."), 404);
    const slug = text(record.mainCompanySlug || "firma").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const fileName = `KYERP-${slug}-${backupId}.sql`;
    const headers = new Headers();
    object.writeHttpMetadata?.(headers);
    headers.set("Content-Type", "application/sql; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="${fileName}"`);
    headers.set("Cache-Control", "no-store");
    headers.set("ETag", object.httpEtag || object.etag || "");
    await audit(c, "TENANT_SQL_BACKUP_DOWNLOADED", current.id, text(record.mainCompanySlug), { backupId, sqlKey: record.sqlKey });
    return new Response(object.body, { headers });
  });
}
