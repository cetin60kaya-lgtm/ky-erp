// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const DEFAULT_COMPANY = "mecit-hakan";
const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const nowIso = () => new Date().toISOString();
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

async function authContext(c: Context<AppEnv>) {
  const user = await getAuthenticatedUser(c);
  if (!user) return null;
  const company = text(
    c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanyId") || c.req.query("mainCompanySlug") ||
    user.mainCompanySlug || user.security?.main_company_slug || DEFAULT_COMPANY,
  ).toLocaleLowerCase("tr-TR");
  let audit = upper(user.role) === "DENETIM" || text(user.username).toLocaleLowerCase("tr-TR") === "denetim";
  if (!audit) {
    try {
      const row = await c.env.DB.prepare("SELECT scope FROM ik_user_hr_scope WHERE user_id=? AND main_company_id=? LIMIT 1")
        .bind(user.id, company).first<Row>();
      audit = upper(row?.scope) === "AUDIT";
    } catch {}
  }
  return { user, company, audit };
}

function ok(c: Context<AppEnv>, data: unknown, status = 200) {
  return c.json({ ok: true, success: true, data }, status as any);
}

function error(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status as any);
}

async function ensureSchema(c: Context<AppEnv>) {
  await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_employee_media (
    main_company_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    photo_storage_key TEXT NOT NULL DEFAULT '',
    photo_content_type TEXT NOT NULL DEFAULT '',
    photo_file_name TEXT NOT NULL DEFAULT '',
    photo_size INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY(main_company_id, employee_id)
  )`).run();
}

async function employeeRow(c: Context<AppEnv>, company: string, employeeId: string) {
  return c.env.DB.prepare(`SELECT e.id,e.full_name,e.code,e.sgk_status,s.card_no
    FROM hr_monthly_employees e
    LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.main_company_id=? AND e.id=? LIMIT 1`)
    .bind(company, employeeId).first<Row>();
}

async function mediaRow(c: Context<AppEnv>, company: string, employeeId: string) {
  await ensureSchema(c);
  return c.env.DB.prepare("SELECT * FROM ik_employee_media WHERE main_company_id=? AND employee_id=? LIMIT 1")
    .bind(company, employeeId).first<Row>();
}

async function auditAllowed(c: Context<AppEnv>, company: string, employeeId: string) {
  const person = await employeeRow(c, company, employeeId);
  return Boolean(person && upper(person.sgk_status) === "VAR" && text(person.card_no));
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function writeAudit(c: Context<AppEnv>, company: string, employeeId: string, action: string, payload: unknown, username: string) {
  try {
    const exists = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ik_audit_logs' LIMIT 1").first<Row>();
    if (!exists?.name) return;
    await c.env.DB.prepare(`INSERT INTO ik_audit_logs
      (id,main_company_id,employee_id,period,action_type,source_screen,old_json,new_json,reason,user_name,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), company, employeeId, "", action, "IK_PERSONNEL_PHOTO", "{}", JSON.stringify(payload || {}), "Personel fotoğrafı", username, nowIso()).run();
  } catch {}
}

export function registerIkPersonnelMediaRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/personnel-control/people/:employeeId/photo", async (c) => {
    const auth = await authContext(c);
    if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    const employeeId = text(c.req.param("employeeId"));
    const person = await employeeRow(c, auth.company, employeeId);
    if (!person) return error(c, 404, "PERSON_NOT_FOUND", "Personel bulunamadı.");
    if (auth.audit && !(await auditAllowed(c, auth.company, employeeId))) return error(c, 404, "PERSON_NOT_FOUND", "Personel bulunamadı.");
    const media = await mediaRow(c, auth.company, employeeId);
    const key = text(media?.photo_storage_key);
    if (!key) return error(c, 404, "PHOTO_NOT_FOUND", "Personel fotoğrafı bulunamadı.");
    const object = await c.env.FILES.get(key);
    if (!object) return error(c, 404, "PHOTO_NOT_FOUND", "Personel fotoğrafı bulunamadı.");
    const headers = new Headers();
    object.writeHttpMetadata?.(headers);
    if (!headers.get("content-type")) headers.set("content-type", text(media?.photo_content_type) || "image/jpeg");
    headers.set("etag", object.httpEtag || "");
    headers.set("cache-control", "private, max-age=300");
    headers.set("content-disposition", "inline");
    return new Response(object.body, { headers });
  });

  app.get("/api/ik/personnel-control/people/:employeeId/photo-meta", async (c) => {
    const auth = await authContext(c);
    if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    const employeeId = text(c.req.param("employeeId"));
    const person = await employeeRow(c, auth.company, employeeId);
    if (!person) return error(c, 404, "PERSON_NOT_FOUND", "Personel bulunamadı.");
    if (auth.audit && !(await auditAllowed(c, auth.company, employeeId))) return error(c, 404, "PERSON_NOT_FOUND", "Personel bulunamadı.");
    const media = await mediaRow(c, auth.company, employeeId);
    return ok(c, {
      employeeId,
      hasPhoto: Boolean(text(media?.photo_storage_key)),
      fileName: text(media?.photo_file_name),
      contentType: text(media?.photo_content_type),
      size: Number(media?.photo_size || 0),
      updatedAt: text(media?.updated_at),
    });
  });

  app.post("/api/ik/personnel-control/people/:employeeId/photo", async (c) => {
    const auth = await authContext(c);
    if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (auth.audit) return error(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı personel fotoğrafını değiştiremez.");
    const employeeId = text(c.req.param("employeeId"));
    const person = await employeeRow(c, auth.company, employeeId);
    if (!person) return error(c, 404, "PERSON_NOT_FOUND", "Personel bulunamadı.");
    const form = await c.req.parseBody({ all: true });
    const values = Object.values(form).flatMap((value) => Array.isArray(value) ? value : [value]);
    const file = values.find((value) => value instanceof File) as File | undefined;
    if (!file) return error(c, 400, "PHOTO_REQUIRED", "Personel fotoğrafı seçin.");
    if (!ALLOWED_TYPES.has(file.type)) return error(c, 415, "PHOTO_TYPE_INVALID", "Fotoğraf JPG, PNG veya WEBP olmalıdır.");
    if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) return error(c, 413, "PHOTO_SIZE_INVALID", "Fotoğraf en fazla 5 MB olabilir.");

    await ensureSchema(c);
    const current = await mediaRow(c, auth.company, employeeId);
    const oldKey = text(current?.photo_storage_key);
    const key = `ik/personnel-photos/${auth.company}/${employeeId}/${crypto.randomUUID()}.${extensionFor(file)}`;
    await c.env.FILES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { employeeId, mainCompanyId: auth.company, originalName: file.name },
    });
    const timestamp = nowIso();
    await c.env.DB.prepare(`INSERT INTO ik_employee_media
      (main_company_id,employee_id,photo_storage_key,photo_content_type,photo_file_name,photo_size,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(main_company_id,employee_id) DO UPDATE SET
        photo_storage_key=excluded.photo_storage_key,
        photo_content_type=excluded.photo_content_type,
        photo_file_name=excluded.photo_file_name,
        photo_size=excluded.photo_size,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at`)
      .bind(auth.company, employeeId, key, file.type, file.name, file.size, text(auth.user.username || auth.user.id), timestamp).run();
    if (oldKey && oldKey !== key) {
      try { await c.env.FILES.delete(oldKey); } catch {}
    }
    const payload = { employeeId, hasPhoto: true, fileName: file.name, contentType: file.type, size: file.size, updatedAt: timestamp };
    await writeAudit(c, auth.company, employeeId, "IK_PERSONEL_FOTO_GUNCELLE", payload, text(auth.user.username));
    return ok(c, payload, 201);
  });

  app.delete("/api/ik/personnel-control/people/:employeeId/photo", async (c) => {
    const auth = await authContext(c);
    if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (auth.audit) return error(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı personel fotoğrafını değiştiremez.");
    const employeeId = text(c.req.param("employeeId"));
    const current = await mediaRow(c, auth.company, employeeId);
    const key = text(current?.photo_storage_key);
    if (key) {
      try { await c.env.FILES.delete(key); } catch {}
    }
    await c.env.DB.prepare("DELETE FROM ik_employee_media WHERE main_company_id=? AND employee_id=?")
      .bind(auth.company, employeeId).run();
    await writeAudit(c, auth.company, employeeId, "IK_PERSONEL_FOTO_SIL", { employeeId }, text(auth.user.username));
    return ok(c, { employeeId, deleted: true });
  });
}
