// @ts-nocheck
import { compare } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";
import { approvalPendingPayload, consumeCriticalApproval, requestCriticalApproval } from "./approval-center-cloud";

type Row = Record<string, any>;

const BACKUP_SCOPE = "ADMIN_BACKUP";
const STORAGE_SETTINGS_SCOPE = "ADMIN_FILE_STORAGE_SETTINGS";
const BACKUP_VERSION = 1;
const PAGE_SIZE = 500;

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
function quoteIdentifier(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
async function bodyOf(c: any): Promise<Row> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
async function ownerCurrent(c: any) {
  const current = await getAuthenticatedUser(c);
  return current && isOwner(current.role) ? current : null;
}
async function verifyOwnerPassword(c: any, current: Row, password: unknown) {
  const raw = text(password);
  if (!raw) return false;
  const row = await c.env.DB.prepare("SELECT password_hash FROM auth_users WHERE id=? AND is_active=1 LIMIT 1").bind(current.id).first<Row>();
  if (!row?.password_hash) return false;
  try { return await compare(raw, text(row.password_hash)); } catch { return false; }
}
async function tableExists(c: any, table: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<Row>();
  return Boolean(row?.name);
}
async function columnsOf(c: any, table: string) {
  const result = await c.env.DB.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all<Row>();
  return (result.results || []).map((row: Row) => ({ name: text(row.name), pk: Number(row.pk || 0), notnull: Number(row.notnull || 0), dflt: row.dflt_value }));
}
async function tenantTables(c: any) {
  const result = await c.env.DB.prepare(
    `SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
        AND name NOT IN ('d1_migrations','main_companies') ORDER BY name`,
  ).all<Row>();
  const rows: Row[] = [];
  for (const item of result.results || []) {
    const name = text(item.name);
    if (!name || name.startsWith("auth_")) continue;
    const columns = await columnsOf(c, name);
    if (columns.some((column: Row) => column.name === "main_company_slug")) rows.push({ name, columns });
  }
  return rows;
}
async function foreignParents(c: any, table: string) {
  try {
    const result = await c.env.DB.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all<Row>();
    return [...new Set((result.results || []).map((row: Row) => text(row.table)).filter(Boolean))];
  } catch {
    return [];
  }
}
function dependencyOrder(entries: Row[], parentsByTable: Map<string, string[]>) {
  const names = new Set(entries.map((entry: Row) => text(entry.name)));
  const pending = new Set(names);
  const inserted: string[] = [];
  let guard = 0;
  while (pending.size && guard < 1000) {
    guard += 1;
    let progress = false;
    for (const table of [...pending]) {
      const parents = (parentsByTable.get(table) || []).filter((parent) => names.has(parent));
      if (parents.every((parent) => inserted.includes(parent))) {
        inserted.push(table);
        pending.delete(table);
        progress = true;
      }
    }
    if (!progress) {
      inserted.push(...pending);
      pending.clear();
    }
  }
  return { insertOrder: inserted, deleteOrder: [...inserted].reverse() };
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
async function storePut(c: any, fileName: string, slug: string, data: Row) {
  const timestamp = nowIso();
  const existing = await c.env.DB.prepare("SELECT id,created_at FROM json_store WHERE scope=? AND file_name=? AND main_company_slug=? LIMIT 1").bind(BACKUP_SCOPE, fileName, slug).first<Row>();
  const payload = JSON.stringify({ ...data, updatedAt: timestamp });
  if (existing?.id) {
    await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?").bind(payload, timestamp, existing.id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), BACKUP_SCOPE, slug, fileName, payload, timestamp, timestamp).run();
  }
  return { ...data, updatedAt: timestamp, createdAt: existing?.created_at || timestamp };
}
async function storeGet(c: any, fileName: string, slug = "") {
  const query = slug
    ? "SELECT id,main_company_slug,file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND file_name=? AND main_company_slug=? LIMIT 1"
    : "SELECT id,main_company_slug,file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND file_name=? ORDER BY updated_at DESC LIMIT 1";
  const row = slug
    ? await c.env.DB.prepare(query).bind(BACKUP_SCOPE, fileName, slug).first<Row>()
    : await c.env.DB.prepare(query).bind(BACKUP_SCOPE, fileName).first<Row>();
  return row ? { ...objectOf(row.data), storeId: row.id, mainCompanySlug: row.main_company_slug, fileName: row.file_name, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}
function tenantWhere(table: string) {
  return table === "json_store"
    ? "main_company_slug=? AND scope<>?"
    : "main_company_slug=?";
}
function tenantBindings(table: string, slug: string) {
  return table === "json_store" ? [slug, BACKUP_SCOPE] : [slug];
}
async function backupRows(c: any, table: string, slug: string, prefix: string) {
  const where = tenantWhere(table);
  const bindings = tenantBindings(table, slug);
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)} WHERE ${where}`).bind(...bindings).first<Row>();
  const total = Number(countRow?.total || 0);
  const chunks: string[] = [];
  let offset = 0;
  while (offset < total) {
    const result = await c.env.DB.prepare(
      `SELECT * FROM ${quoteIdentifier(table)} WHERE ${where} LIMIT ? OFFSET ?`,
    ).bind(...bindings, PAGE_SIZE, offset).all<Row>();
    const rows = result.results || [];
    if (!rows.length) break;
    const key = `${prefix}tables/${table}/${String(offset / PAGE_SIZE + 1).padStart(6, "0")}.json`;
    await c.env.FILES.put(key, JSON.stringify({ version: BACKUP_VERSION, table, mainCompanySlug: slug, offset, rows }), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { backupTable: table, mainCompanySlug: slug, rowCount: String(rows.length) },
    });
    chunks.push(key);
    offset += rows.length;
  }
  return { rowCount: total, chunks };
}
async function listBucket(bucket: any, prefix = "") {
  const objects: any[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    objects.push(...(listed?.objects || []));
    cursor = listed?.truncated ? text(listed.cursor) || undefined : undefined;
  } while (cursor);
  return objects;
}
async function copyBusinessFiles(c: any, slug: string, prefix: string) {
  const bucket = c.env.FILES as any;
  const mainCount = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM main_companies WHERE is_active=1").first<Row>();
  const singleCompany = Number(mainCount?.total || 0) <= 1;
  const all = await listBucket(bucket);
  const selected = all.filter((object: any) => {
    const key = text(object.key);
    if (!key || key.startsWith("backups/") || key.startsWith("trash/")) return false;
    if (singleCompany) return true;
    return key.startsWith(`${slug}/`) || key.includes(`/${slug}/`) || key.includes(`-${slug}-`);
  });
  const files: Row[] = [];
  for (const object of selected) {
    const sourceKey = text(object.key);
    const source = await bucket.get(sourceKey);
    if (!source) continue;
    const backupKey = `${prefix}files/${sourceKey}`;
    await bucket.put(backupKey, source.body, {
      httpMetadata: source.httpMetadata,
      customMetadata: { ...(source.customMetadata || {}), backupOf: sourceKey, backupSlug: slug, backedUpAt: nowIso() },
    });
    files.push({ sourceKey, backupKey, size: Number(object.size || 0), etag: text(object.etag), uploadedAt: object.uploaded ? new Date(object.uploaded).toISOString() : "" });
  }
  return files;
}
async function storageSettings(c: any, slug: string) {
  const row = await c.env.DB.prepare(
    `SELECT data FROM json_store WHERE scope=? AND file_name='global' AND main_company_slug=? ORDER BY updated_at DESC LIMIT 1`,
  ).bind(STORAGE_SETTINGS_SCOPE, slug).first<Row>();
  return objectOf(row?.data);
}
async function googleAccessToken(c: any) {
  const env = c.env as Row;
  if (!(env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN)) return "";
  const form = new URLSearchParams({ client_id: text(env.GOOGLE_DRIVE_CLIENT_ID), client_secret: text(env.GOOGLE_DRIVE_CLIENT_SECRET), refresh_token: text(env.GOOGLE_DRIVE_REFRESH_TOKEN), grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
  if (!response.ok) throw new Error(`Google Drive OAuth HTTP ${response.status}`);
  const data = await response.json<Row>();
  return text(data.access_token);
}
async function oneDriveAccessToken(c: any) {
  const env = c.env as Row;
  if (!(env.ONEDRIVE_CLIENT_ID && env.ONEDRIVE_CLIENT_SECRET && env.ONEDRIVE_REFRESH_TOKEN)) return "";
  const tenant = text(env.ONEDRIVE_TENANT_ID || "common");
  const form = new URLSearchParams({ client_id: text(env.ONEDRIVE_CLIENT_ID), client_secret: text(env.ONEDRIVE_CLIENT_SECRET), refresh_token: text(env.ONEDRIVE_REFRESH_TOKEN), grant_type: "refresh_token", scope: "https://graph.microsoft.com/.default offline_access" });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
  if (!response.ok) throw new Error(`OneDrive OAuth HTTP ${response.status}`);
  const data = await response.json<Row>();
  return text(data.access_token);
}
function flatArchiveName(backupId: string, key: string) {
  const relative = key.split("/").slice(3).join("/") || key;
  const safe = relative.replace(/[\\/:*?"<>|]+/g, "__").slice(-180);
  return `${backupId}__${safe}`;
}
async function uploadGoogleDrive(c: any, token: string, object: any, name: string) {
  const env = c.env as Row;
  const metadata = { name, parents: [text(env.GOOGLE_DRIVE_FOLDER_ID)] };
  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": text(object.httpMetadata?.contentType || "application/octet-stream"),
      "X-Upload-Content-Length": String(Number(object.size || 0)),
    },
    body: JSON.stringify(metadata),
  });
  if (!init.ok) throw new Error(`Google Drive upload session HTTP ${init.status}`);
  const location = text(init.headers.get("Location"));
  if (!location) throw new Error("Google Drive upload session URL alınamadı.");
  const upload = await fetch(location, {
    method: "PUT",
    headers: {
      "Content-Type": text(object.httpMetadata?.contentType || "application/octet-stream"),
      "Content-Length": String(Number(object.size || 0)),
    },
    body: object.body,
  });
  if (!upload.ok) throw new Error(`Google Drive upload HTTP ${upload.status}`);
}
async function uploadOneDrive(c: any, token: string, object: any, name: string) {
  const env = c.env as Row;
  const folderId = text(env.ONEDRIVE_FOLDER_ID);
  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(name)}:/content`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": text(object.httpMetadata?.contentType || "application/octet-stream") },
    body: object.body,
  });
  if (!response.ok) throw new Error(`OneDrive upload HTTP ${response.status}`);
}
async function mirrorBackup(c: any, backupId: string, prefix: string, slug: string) {
  const settings = await storageSettings(c, slug);
  const targets = Array.isArray(settings.archiveTargets) ? settings.archiveTargets.map(upper) : [];
  if (!targets.length) return { requested: [], completed: [], failed: [] };
  const bucket = c.env.FILES as any;
  const objects = await listBucket(bucket, prefix);
  const result: Row = { requested: targets, completed: [], failed: [] };
  for (const provider of targets) {
    try {
      const token = provider === "GOOGLE_DRIVE" ? await googleAccessToken(c) : provider === "ONEDRIVE" ? await oneDriveAccessToken(c) : "";
      if (!token) throw new Error(`${provider} erişim anahtarı hazırlanamadı.`);
      let uploaded = 0;
      for (const item of objects) {
        const object = await bucket.get(item.key);
        if (!object) continue;
        const name = flatArchiveName(backupId, text(item.key));
        if (provider === "GOOGLE_DRIVE") await uploadGoogleDrive(c, token, object, name);
        else await uploadOneDrive(c, token, object, name);
        uploaded += 1;
      }
      result.completed.push({ provider, uploaded });
    } catch (error) {
      result.failed.push({ provider, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
async function audit(c: any, action: string, actorId: string, slug: string, detail: Row = {}) {
  if (!(await tableExists(c, "auth_security_audit"))) return;
  try {
    await c.env.DB.prepare(
      `INSERT INTO auth_security_audit
       (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), actorId || null, null, slug || null, action, null, null, JSON.stringify(detail), nowIso()).run();
  } catch { /* best effort */ }
}
async function createBackupInternal(c: any, current: Row, slug: string, reason: string, allowMirror = true) {
  const company = await c.env.DB.prepare("SELECT id,slug,name,title,is_active,created_at,updated_at FROM main_companies WHERE slug=? LIMIT 1").bind(slug).first<Row>();
  if (!company) throw new Error("BACKUP_COMPANY_NOT_FOUND");
  const backupId = crypto.randomUUID();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const prefix = `backups/${slug}/${stamp}-${backupId}/`;
  const createdAt = nowIso();
  const tableManifest: Row[] = [];
  let totalRows = 0;
  const tables = await tenantTables(c);
  for (const entry of tables) {
    const backed = await backupRows(c, entry.name, slug, prefix);
    totalRows += backed.rowCount;
    tableManifest.push({ name: entry.name, columns: entry.columns, rowCount: backed.rowCount, chunks: backed.chunks });
  }
  const files = await copyBusinessFiles(c, slug, prefix);
  const manifestKey = `${prefix}manifest.json`;
  const manifest: Row = {
    version: BACKUP_VERSION,
    backupId,
    mainCompanySlug: slug,
    mainCompany: company,
    reason,
    createdAt,
    createdBy: text(current.id),
    source: "KY_ERP_D1_R2",
    tables: tableManifest,
    totalRows,
    files,
    totalFiles: files.length,
    excludes: { authTables: true, backupRegistry: true },
  };
  await c.env.FILES.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { backupId, mainCompanySlug: slug, backupVersion: String(BACKUP_VERSION), reason },
  });
  let archiveMirror: Row = { requested: [], completed: [], failed: [] };
  if (allowMirror) archiveMirror = await mirrorBackup(c, backupId, prefix, slug);
  const record = await storePut(c, backupId, slug, {
    id: backupId,
    status: "COMPLETED",
    mainCompanySlug: slug,
    companyName: text(company.name),
    reason,
    manifestKey,
    prefix,
    totalRows,
    totalFiles: files.length,
    archiveMirror,
    createdAt,
    completedAt: nowIso(),
    createdBy: text(current.id),
  });
  await audit(c, "TENANT_BACKUP_COMPLETED", current.id, slug, { backupId, totalRows, totalFiles: files.length, archiveMirror });
  return record;
}
async function readJsonObject(object: any) {
  if (!object) return null;
  const raw = await object.text();
  try { return JSON.parse(raw); } catch { return null; }
}
function sqlValue(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return JSON.stringify(value);
}
async function restoreTable(c: any, table: string, targetSlug: string, chunks: string[]) {
  const liveColumns = new Set((await columnsOf(c, table)).map((column: Row) => column.name));
  if (!liveColumns.has("main_company_slug")) return { table, skipped: true, reason: "TENANT_COLUMN_MISSING" };
  let inserted = 0;
  for (const key of chunks || []) {
    const payload = await readJsonObject(await c.env.FILES.get(key));
    for (const sourceRow of payload?.rows || []) {
      const row = { ...sourceRow, main_company_slug: targetSlug };
      if (table === "json_store" && text(row.scope) === BACKUP_SCOPE) continue;
      const entries = Object.entries(row).filter(([name]) => liveColumns.has(name));
      if (!entries.length) continue;
      const names = entries.map(([name]) => quoteIdentifier(name));
      const placeholders = entries.map(() => "?");
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO ${quoteIdentifier(table)} (${names.join(",")}) VALUES (${placeholders.join(",")})`,
      ).bind(...entries.map(([, value]) => sqlValue(value))).run();
      inserted += 1;
    }
  }
  return { table, inserted };
}
async function restoreFiles(c: any, files: Row[]) {
  const bucket = c.env.FILES as any;
  let restored = 0;
  for (const item of files || []) {
    const source = await bucket.get(text(item.backupKey));
    if (!source) continue;
    await bucket.put(text(item.sourceKey), source.body, { httpMetadata: source.httpMetadata, customMetadata: { ...(source.customMetadata || {}), restoredAt: nowIso() } });
    restored += 1;
  }
  return restored;
}
async function restoreManifestData(c: any, manifest: Row, targetSlug: string) {
  const entries = Array.isArray(manifest.tables) ? manifest.tables : [];
  const parentsByTable = new Map<string, string[]>();
  for (const entry of entries) parentsByTable.set(text(entry.name), await foreignParents(c, text(entry.name)));
  const order = dependencyOrder(entries, parentsByTable);
  const entryMap = new Map(entries.map((entry: Row) => [text(entry.name), entry]));
  const restoredTables: Row[] = [];

  for (const table of order.deleteOrder) {
    if (!(await tableExists(c, table))) continue;
    const liveColumns = new Set((await columnsOf(c, table)).map((column: Row) => column.name));
    if (!liveColumns.has("main_company_slug")) continue;
    if (table === "json_store" && liveColumns.has("scope")) {
      await c.env.DB.prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE main_company_slug=? AND scope<>?`).bind(targetSlug, BACKUP_SCOPE).run();
    } else {
      await c.env.DB.prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE main_company_slug=?`).bind(targetSlug).run();
    }
  }
  for (const table of order.insertOrder) {
    const entry = entryMap.get(table);
    if (!entry || !(await tableExists(c, table))) continue;
    restoredTables.push(await restoreTable(c, table, targetSlug, entry.chunks || []));
  }
  const restoredFiles = await restoreFiles(c, manifest.files || []);
  return { restoredTables, restoredFiles };
}

export function registerAdminBackupRoutes(app: any) {
  app.get("/api/admin/backups", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Yedekleme yönetimi yalnız uygulama sahibine açıktır."), 403);
    const slug = text(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || current.mainCompanySlug || "mecit-hakan");
    const result = await c.env.DB.prepare(
      `SELECT file_name,data,created_at,updated_at FROM json_store
        WHERE scope=? AND main_company_slug=? ORDER BY updated_at DESC LIMIT 100`,
    ).bind(BACKUP_SCOPE, slug).all<Row>();
    return c.json({ ok: true, data: (result.results || []).map((row: Row) => ({ ...objectOf(row.data), id: text(objectOf(row.data).id || row.file_name), createdAt: objectOf(row.data).createdAt || row.created_at, updatedAt: row.updated_at })) });
  });

  app.get("/api/admin/backups/:id", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Yedekleme yönetimi yalnız uygulama sahibine açıktır."), 403);
    const row = await storeGet(c, text(c.req.param("id")));
    if (!row) return c.json(errorBody("BACKUP_NOT_FOUND", "Yedek kaydı bulunamadı."), 404);
    return c.json({ ok: true, data: row });
  });

  app.post("/api/admin/backup", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Yedek alma yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = text(body.mainCompanySlug || body.main_company_slug || current.mainCompanySlug || "mecit-hakan");
    const approval = await requestCriticalApproval(c,current,{
      mainCompanySlug:slug,sourceModule:"BACKUP",actionType:"TENANT_BACKUP_CREATE",targetType:"MAIN_COMPANY",targetId:slug,
      title:"Firma Tam Yedeği Al",description:slug+" firması için D1 + R2 tam yedeği oluşturulacak.",riskLevel:"HIGH",
      approvalPolicy:"COMPANY_OWNER_OR_APP_OWNER",payload:{mainCompanySlug:slug,reason:text(body.reason || "MANUAL_ADMIN_BACKUP")},
    });
    if(approval.state==="SCHEMA_MISSING")return c.json(errorBody("APPROVAL_SCHEMA_NOT_READY","Onay Merkezi kurulumu tamamlanmadan kritik yedek işlemi çalıştırılamaz."),503);
    if(!approval.approved)return c.json({ok:true,data:approvalPendingPayload(approval)},202);
    try {
      const backup = await createBackupInternal(c, current, slug, text(body.reason || "MANUAL_ADMIN_BACKUP"), true);
      await consumeCriticalApproval(c,current,text(approval.request?.id),{backupId:backup.id,mainCompanySlug:slug});
      return c.json({ ok: true, data: backup }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "BACKUP_COMPANY_NOT_FOUND") return c.json(errorBody("BACKUP_COMPANY_NOT_FOUND", "Yedeklenecek ana firma bulunamadı."), 404);
      return c.json(errorBody("BACKUP_FAILED", "Gerçek R2/D1 yedeği tamamlanamadı.", { message }), 500);
    }
  });

  app.post("/api/admin/backups/:id/restore", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Yedek geri yükleme yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    if (!(await verifyOwnerPassword(c, current, body.adminPassword))) return c.json(errorBody("PASSWORD_INVALID", "Yönetici şifresi doğrulanamadı."), 401);
    if (upper(body.confirmText).replace(/İ/g, "I") !== "GERI YUKLE") return c.json(errorBody("RESTORE_CONFIRM_REQUIRED", "Geri yükleme için onay alanına GERI YUKLE yazılmalıdır."), 400);
    const backup = await storeGet(c, text(c.req.param("id")));
    if (!backup) return c.json(errorBody("BACKUP_NOT_FOUND", "Yedek kaydı bulunamadı."), 404);
    const manifest = await readJsonObject(await c.env.FILES.get(text(backup.manifestKey)));
    if (!manifest || Number(manifest.version || 0) !== BACKUP_VERSION) return c.json(errorBody("BACKUP_MANIFEST_INVALID", "Yedek manifesti bulunamadı veya sürümü uyumsuz."), 409);
    const targetSlug = text(body.mainCompanySlug || backup.mainCompanySlug || manifest.mainCompanySlug);
    const target = await c.env.DB.prepare("SELECT id,slug,name FROM main_companies WHERE slug=? LIMIT 1").bind(targetSlug).first<Row>();
    if (!target) return c.json(errorBody("TARGET_COMPANY_NOT_FOUND", "Geri yüklenecek hedef ana firma bulunamadı."), 404);

    const approval = await requestCriticalApproval(c,current,{
      mainCompanySlug:targetSlug,sourceModule:"BACKUP",actionType:"TENANT_BACKUP_RESTORE",targetType:"BACKUP",targetId:text(backup.id),
      title:"Firma Yedeğine Geri Dön",description:targetSlug+" firması "+text(backup.id)+" yedeğine geri döndürülecek.",riskLevel:"CRITICAL",
      approvalPolicy:"COMPANY_OWNER_AND_APP_OWNER",payload:{backupId:text(backup.id),targetSlug},
    });
    if(approval.state==="SCHEMA_MISSING")return c.json(errorBody("APPROVAL_SCHEMA_NOT_READY","Onay Merkezi kurulumu tamamlanmadan geri yükleme çalıştırılamaz."),503);
    if(!approval.approved)return c.json({ok:true,data:approvalPendingPayload(approval)},202);

    let safetyBackup: Row | null = null;
    try {
      safetyBackup = await createBackupInternal(c, current, targetSlug, `PRE_RESTORE:${backup.id}`, false);
    } catch (error) {
      return c.json(errorBody("PRE_RESTORE_BACKUP_FAILED", "Geri yükleme öncesi güvenlik yedeği alınamadığı için işlem başlatılmadı.", { message: error instanceof Error ? error.message : String(error) }), 500);
    }

    await consumeCriticalApproval(c,current,text(approval.request?.id),{backupId:text(backup.id),targetSlug,executionStarted:true});
    try {
      const restored = await restoreManifestData(c, manifest, targetSlug);
      await audit(c, "TENANT_BACKUP_RESTORED", current.id, targetSlug, { backupId: backup.id, safetyBackupId: safetyBackup.id, ...restored });
      return c.json({ ok: true, data: { restored: true, backupId: backup.id, targetSlug, safetyBackupId: safetyBackup.id, ...restored, restoredAt: nowIso() } });
    } catch (error) {
      let rollbackRestored = false;
      let rollbackError = "";
      try {
        const safetyManifest = await readJsonObject(await c.env.FILES.get(text(safetyBackup?.manifestKey)));
        if (!safetyManifest || Number(safetyManifest.version || 0) !== BACKUP_VERSION) throw new Error("PRE_RESTORE manifesti okunamadı.");
        await restoreManifestData(c, safetyManifest, targetSlug);
        rollbackRestored = true;
      } catch (rollback) {
        rollbackError = rollback instanceof Error ? rollback.message : String(rollback);
      }
      await audit(c, "TENANT_BACKUP_RESTORE_FAILED", current.id, targetSlug, {
        backupId: backup.id,
        safetyBackupId: safetyBackup?.id,
        rollbackRestored,
        rollbackError,
        message: error instanceof Error ? error.message : String(error),
      });
      return c.json(errorBody(
        "RESTORE_FAILED",
        rollbackRestored
          ? "Geri yükleme tamamlanamadı; sistem PRE_RESTORE güvenlik yedeğine otomatik geri döndü."
          : "Geri yükleme tamamlanamadı ve otomatik geri dönüş de tamamlanamadı. PRE_RESTORE yedeği R2 üzerinde korunuyor.",
        {
          safetyBackupId: safetyBackup?.id,
          rollbackRestored,
          rollbackError: rollbackError || undefined,
          message: error instanceof Error ? error.message : String(error),
        },
      ), 500);
    }
  });
}
