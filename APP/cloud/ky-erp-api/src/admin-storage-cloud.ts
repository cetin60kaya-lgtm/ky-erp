// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type Row = Record<string, any>;

const SETTINGS_SCOPE = "ADMIN_FILE_STORAGE_SETTINGS";
const RULE_SCOPE = "ADMIN_FILE_STORAGE_RULE";
const STORAGE_ROOT = "R2://ky-erp-files";

const DEFAULT_RULES = [
  { module: "DESEN", documentType: "DESEN_GORSEL", displayName: "Desen Görseli", allowedExtensions: "jpg,jpeg,png,webp", targetPathTemplate: "desen/modeller", imageResizeEnabled: true, imageMaxWidth: 1200, imageMaxHeight: 1200, thumbEnabled: true, thumbWidth: 320, thumbHeight: 320 },
  { module: "MUHASEBE_MUSTERI", documentType: "BIZIM_IRSALIYE", displayName: "Bizim İrsaliye", allowedExtensions: "pdf,xml,zip", targetPathTemplate: "muhasebe/musteri/{yil}/{ay}/bizim-irsaliye" },
  { module: "MUHASEBE_MUSTERI", documentType: "BIZIM_FATURA", displayName: "Bizim Fatura", allowedExtensions: "pdf,xml,zip", targetPathTemplate: "muhasebe/musteri/{yil}/{ay}/bizim-fatura" },
  { module: "MUHASEBE_MUSTERI", documentType: "MUSTERI_GELEN_IRSALIYE", displayName: "Müşteri İrsaliyesi", allowedExtensions: "pdf,xml,zip", targetPathTemplate: "muhasebe/musteri/{yil}/{ay}/musteri-irsaliye" },
  { module: "MUHASEBE_MUSTERI", documentType: "MUSTERI_FATURA", displayName: "Müşteri Faturası", allowedExtensions: "pdf,xml,zip", targetPathTemplate: "muhasebe/musteri/{yil}/{ay}/musteri-fatura" },
  { module: "MUHASEBE_TEDARIKCI", documentType: "TEDARIKCI_FATURA", displayName: "Tedarikçi Faturası", allowedExtensions: "pdf,xml,zip", targetPathTemplate: "muhasebe/tedarikci/{yil}/{ay}/fatura" },
  { module: "MUHASEBE_TEDARIKCI", documentType: "TEDARIKCI_IRSALIYE", displayName: "Tedarikçi İrsaliyesi", allowedExtensions: "pdf,xml,zip", targetPathTemplate: "muhasebe/tedarikci/{yil}/{ay}/irsaliye" },
  { module: "IK_PERSONEL", documentType: "PERSONEL_DIGER", displayName: "Personel Evrakı", allowedExtensions: "pdf,doc,docx,jpg,jpeg,png", targetPathTemplate: "ik/personel/{personel}" },
  { module: "CEK", documentType: "CEK_GORSEL", displayName: "Çek Görseli", allowedExtensions: "jpg,jpeg,png,pdf", targetPathTemplate: "muhasebe/cekler/{yil}/{ay}/{cekTipi}", thumbEnabled: true, thumbWidth: 320, thumbHeight: 320 },
];

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
function isOwner(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}
function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
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
  return text(body.mainCompanySlug || body.main_company_slug || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
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
function encodeKey(key: string) {
  const bytes = new TextEncoder().encode(key);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decodeKey(value: string) {
  try {
    const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return "";
  }
}
function archiveCapabilities(c: any) {
  const env = c.env as Row;
  const googleDrive = Boolean(env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN && env.GOOGLE_DRIVE_FOLDER_ID);
  const oneDrive = Boolean(env.ONEDRIVE_CLIENT_ID && env.ONEDRIVE_CLIENT_SECRET && env.ONEDRIVE_REFRESH_TOKEN && env.ONEDRIVE_FOLDER_ID);
  return {
    googleDrive,
    oneDrive,
    providers: {
      GOOGLE_DRIVE: { configured: googleDrive, folderConfigured: Boolean(env.GOOGLE_DRIVE_FOLDER_ID) },
      ONEDRIVE: { configured: oneDrive, folderConfigured: Boolean(env.ONEDRIVE_FOLDER_ID) },
    },
  };
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
      WHERE scope=? AND main_company_slug=? ORDER BY updated_at DESC`,
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
    return { ...data, createdAt: existing.created_at, updatedAt: timestamp };
  }
  await c.env.DB.prepare(
    `INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).bind(crypto.randomUUID(), scope, slug, fileName, payload, timestamp, timestamp).run();
  return { ...data, createdAt: timestamp, updatedAt: timestamp };
}
async function listBucket(bucket: any, prefix = "", wanted = 0) {
  const objects: any[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const object of listed?.objects || []) {
      objects.push(object);
      if (wanted > 0 && objects.length >= wanted) return objects;
    }
    cursor = listed?.truncated ? text(listed.cursor) || undefined : undefined;
  } while (cursor);
  return objects;
}
function classifyFile(key: string) {
  const lower = key.toLocaleLowerCase("tr-TR");
  const ext = lower.includes(".") ? lower.split(".").pop() || "" : "";
  let documentType = ext.toUpperCase();
  if (lower.includes("desen")) documentType = "DESEN_GORSEL";
  else if (lower.includes("irsaliye")) documentType = "IRSALIYE";
  else if (lower.includes("fatura")) documentType = "FATURA";
  else if (lower.includes("cek")) documentType = "CEK_GORSEL";
  else if (lower.includes("ik/") || lower.includes("personel")) documentType = "PERSONEL_DIGER";
  return { extension: ext, documentType };
}
function normalObject(object: any) {
  const key = text(object?.key);
  if (!key || key.startsWith("backups/") || key.startsWith("trash/")) return null;
  const kind = classifyFile(key);
  return {
    id: encodeKey(key),
    fileKey: key,
    objectKey: key,
    fileName: key.split("/").pop() || key,
    fileSize: Number(object?.size || 0),
    uploadedAt: object?.uploaded ? new Date(object.uploaded).toISOString() : "",
    createdAt: object?.uploaded ? new Date(object.uploaded).toISOString() : "",
    etag: text(object?.etag),
    sourceType: "R2",
    ...kind,
  };
}
async function statusOf(c: any) {
  const bucket = c.env.FILES as any;
  try {
    const all = await listBucket(bucket);
    const files = all.map(normalObject).filter(Boolean);
    files.sort((a: Row, b: Row) => Date.parse(text(b.uploadedAt) || "0") - Date.parse(text(a.uploadedAt) || "0"));
    return {
      storageRoot: STORAGE_ROOT,
      storageMode: "R2",
      accessible: true,
      connected: true,
      totalFileCount: files.length,
      totalBytes: files.reduce((sum: number, row: Row) => sum + Number(row.fileSize || 0), 0),
      lastFile: files[0] || null,
      archiveCapabilities: archiveCapabilities(c),
      capabilities: { persistentCloudStorage: true, localFolderAccess: false, safeArchiveDelete: true },
    };
  } catch (error) {
    return {
      storageRoot: STORAGE_ROOT,
      storageMode: "R2",
      accessible: false,
      connected: false,
      totalFileCount: 0,
      totalBytes: 0,
      lastFile: null,
      archiveCapabilities: archiveCapabilities(c),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function registerAdminStorageRoutes(app: any) {
  app.get("/api/admin/file-storage/status", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya ve depolama yönetimi yalnız uygulama sahibine açıktır."), 403);
    return c.json({ ok: true, data: await statusOf(c) });
  });

  app.get("/api/admin/file-storage/settings", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya ve depolama yönetimi yalnız uygulama sahibine açıktır."), 403);
    const slug = slugOf(c);
    const saved = (await storeGet(c, SETTINGS_SCOPE, "global", slug)) || {};
    return c.json({ ok: true, data: { ...saved, storageRoot: STORAGE_ROOT, storageMode: "R2", archiveCapabilities: archiveCapabilities(c) } });
  });

  app.patch("/api/admin/file-storage/settings", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya ve depolama yönetimi yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const caps = archiveCapabilities(c);
    const requested = Array.isArray(body.archiveTargets) ? body.archiveTargets.map(upper) : [];
    const archiveTargets = requested.filter((provider: string) => provider === "GOOGLE_DRIVE" ? caps.googleDrive : provider === "ONEDRIVE" ? caps.oneDrive : false);
    const saved = await storePut(c, SETTINGS_SCOPE, "global", slug, {
      storageRoot: STORAGE_ROOT,
      storageMode: "R2",
      archiveTargets,
      updatedBy: current.id,
    });
    return c.json({ ok: true, data: { ...saved, archiveCapabilities: caps } });
  });

  app.get("/api/admin/file-storage/archive-capabilities", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Arşiv entegrasyon bilgisi yalnız uygulama sahibine açıktır."), 403);
    return c.json({ ok: true, data: archiveCapabilities(c) });
  });

  app.get("/api/admin/file-storage/rules", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya kuralları yalnız uygulama sahibine açıktır."), 403);
    const slug = slugOf(c);
    const rows = await storeList(c, RULE_SCOPE, slug);
    return c.json({ ok: true, data: rows.map((row: Row) => ({ ...row, id: text(row.id || row.fileName) })) });
  });

  app.post("/api/admin/file-storage/seed-default-rules", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya kuralları yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const existing = await storeList(c, RULE_SCOPE, slug);
    const existingTypes = new Set(existing.map((row: Row) => upper(row.documentType)));
    let createdCount = 0;
    let skippedCount = 0;
    for (const source of DEFAULT_RULES) {
      if (existingTypes.has(upper(source.documentType))) { skippedCount += 1; continue; }
      const id = crypto.randomUUID();
      await storePut(c, RULE_SCOPE, id, slug, {
        id,
        ...source,
        isActive: true,
        watchEnabled: false,
        watchSourcePath: "",
        maxFileSizeMb: null,
        createdBy: current.id,
      });
      createdCount += 1;
    }
    return c.json({ ok: true, data: { createdCount, skippedCount, total: existing.length + createdCount } });
  });

  app.post("/api/admin/file-storage/rules", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya kuralları yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    if (!text(body.documentType) || !text(body.targetPathTemplate)) return c.json(errorBody("RULE_REQUIRED", "Belge türü ve ERP hedef yolu zorunludur."), 400);
    const id = crypto.randomUUID();
    const saved = await storePut(c, RULE_SCOPE, id, slug, {
      id,
      module: text(body.module),
      documentType: text(body.documentType),
      displayName: text(body.displayName || body.documentType),
      targetPathTemplate: text(body.targetPathTemplate).replace(/^\/+/, ""),
      allowedExtensions: text(body.allowedExtensions),
      isActive: boolValue(body.isActive, true),
      watchEnabled: false,
      watchSourcePath: "",
      maxFileSizeMb: body.maxFileSizeMb ?? null,
      imageResizeEnabled: boolValue(body.imageResizeEnabled, false),
      imageMaxWidth: Number(body.imageMaxWidth || 0) || null,
      imageMaxHeight: Number(body.imageMaxHeight || 0) || null,
      thumbEnabled: boolValue(body.thumbEnabled, false),
      thumbWidth: Number(body.thumbWidth || 0) || null,
      thumbHeight: Number(body.thumbHeight || 0) || null,
      createdBy: current.id,
    });
    return c.json({ ok: true, data: saved }, 201);
  });

  app.patch("/api/admin/file-storage/rules/:id", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya kuralları yalnız uygulama sahibine açıktır."), 403);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = text(c.req.param("id"));
    const old = await storeGet(c, RULE_SCOPE, id, slug);
    if (!old) return c.json(errorBody("RULE_NOT_FOUND", "Dosya saklama kuralı bulunamadı."), 404);
    const saved = await storePut(c, RULE_SCOPE, id, slug, {
      ...old,
      ...body,
      id,
      targetPathTemplate: text(body.targetPathTemplate || old.targetPathTemplate).replace(/^\/+/, ""),
      watchEnabled: false,
      watchSourcePath: "",
      updatedBy: current.id,
    });
    return c.json({ ok: true, data: saved });
  });

  app.post("/api/admin/file-storage/rules/:id/test-watch-path", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya kuralları yalnız uygulama sahibine açıktır."), 403);
    const id = text(c.req.param("id"));
    const rule = await storeGet(c, RULE_SCOPE, id, slugOf(c));
    if (!rule) return c.json(errorBody("RULE_NOT_FOUND", "Dosya saklama kuralı bulunamadı."), 404);
    return c.json({ ok: true, data: { ok: false, bridgeRequired: true, storageMode: "R2", error: "Cloud Worker yerel bilgisayar klasörüne doğrudan erişemez. Kalıcı saklama R2 üzerinden çalışır; yerel izleme için ayrı masaüstü köprüsü gerekir." } });
  });

  app.post("/api/admin/file-storage/rules/:id/import-watch-folder", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya kuralları yalnız uygulama sahibine açıktır."), 403);
    const rule = await storeGet(c, RULE_SCOPE, text(c.req.param("id")), slugOf(c));
    if (!rule) return c.json(errorBody("RULE_NOT_FOUND", "Dosya saklama kuralı bulunamadı."), 404);
    return c.json(errorBody("LOCAL_BRIDGE_REQUIRED", "Cloud ortamından yerel klasör taranamaz. Dosyaları R2 yükleme akışıyla ekleyin veya ayrıca yetkili masaüstü köprüsü çalıştırın."), 409);
  });

  app.get("/api/admin/file-storage/files", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya kayıtları yalnız uygulama sahibine açıktır."), 403);
    const take = Math.max(1, Math.min(Number(c.req.query("take") || 100), 500));
    const all = await listBucket(c.env.FILES as any);
    const rows = all.map(normalObject).filter(Boolean);
    rows.sort((a: Row, b: Row) => Date.parse(text(b.uploadedAt) || "0") - Date.parse(text(a.uploadedAt) || "0"));
    return c.json({ ok: true, data: rows.slice(0, take) });
  });

  app.delete("/api/admin/file-storage/files/:id", async (c: any) => {
    const current = await ownerCurrent(c);
    if (!current) return c.json(errorBody("OWNER_ONLY", "Dosya arşivleme yalnız uygulama sahibine açıktır."), 403);
    const key = decodeKey(c.req.param("id"));
    if (!key || key.startsWith("backups/") || key.startsWith("trash/")) return c.json(errorBody("FILE_KEY_INVALID", "Dosya anahtarı geçersiz veya korunan alandadır."), 400);
    const object = await c.env.FILES.get(key);
    if (!object) return c.json(errorBody("FILE_NOT_FOUND", "Dosya R2 alanında bulunamadı."), 404);
    const archiveKey = `trash/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${key}`;
    const bytes = await object.arrayBuffer();
    await c.env.FILES.put(archiveKey, bytes, {
      httpMetadata: object.httpMetadata,
      customMetadata: { ...(object.customMetadata || {}), archivedFrom: key, archivedAt: nowIso(), archivedBy: text(current.id) },
    });
    await c.env.FILES.delete(key);
    return c.json({ ok: true, data: { archived: true, originalKey: key, archiveKey, archivedAt: nowIso() } });
  });
}
