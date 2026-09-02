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

async function auth(c: Context<AppEnv>) {
  const user = await getAuthenticatedUser(c);
  if (!user) return null;
  const company = text(c.req.header("X-KYERP-Tenant-Slug") || user.mainCompanySlug || user.security?.main_company_slug || DEFAULT_COMPANY).toLocaleLowerCase("tr-TR");
  const audit = upper(user.role) === "DENETIM" || text(user.username).toLocaleLowerCase("tr-TR") === "denetim";
  return { user, company, audit };
}

async function personVisible(c: Context<AppEnv>, company: string, employeeId: string, strict: boolean) {
  const row = await c.env.DB.prepare(`SELECT e.id,e.sgk_status,s.card_no FROM hr_monthly_employees e
    LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.main_company_id=? AND e.id=? LIMIT 1`).bind(company, employeeId).first<Row>();
  if (!row) return false;
  return !strict || (upper(row.sgk_status) === "VAR" && text(row.card_no));
}

async function metadata(c: Context<AppEnv>, company: string, employeeId: string) {
  try {
    const row = await c.env.DB.prepare(`SELECT data FROM json_store
      WHERE scope='IK_PERSONNEL_PHOTO' AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`).bind(employeeId, company).first<Row>();
    return row?.data ? JSON.parse(text(row.data)) : null;
  } catch { return null; }
}

export function registerIkPdksPhotoRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/personnel-control/people/:employeeId/photo", async (c) => {
    const context = await auth(c);
    if (!context) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum doğrulanamadı." } }, 401);
    const employeeId = text(c.req.param("employeeId"));
    if (!(await personVisible(c, context.company, employeeId, context.audit))) return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Personel bulunamadı." } }, 404);
    const meta = await metadata(c, context.company, employeeId);
    if (!meta?.storageKey) return c.json({ ok: false, error: { code: "PHOTO_NOT_FOUND", message: "Personel fotoğrafı yok." } }, 404);
    const object = await c.env.FILES.get(text(meta.storageKey));
    if (!object) return c.json({ ok: false, error: { code: "PHOTO_NOT_FOUND", message: "Personel fotoğrafı yok." } }, 404);
    const headers = new Headers();
    object.writeHttpMetadata?.(headers);
    if (!headers.get("content-type")) headers.set("content-type", text(meta.contentType) || "image/jpeg");
    headers.set("cache-control", "private, max-age=300");
    return new Response(object.body, { headers });
  });

  app.post("/api/ik/personnel-control/people/:employeeId/photo", async (c) => {
    const context = await auth(c);
    if (!context) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum doğrulanamadı." } }, 401);
    if (context.audit) return c.json({ ok: false, error: { code: "PDKS_AUDIT_READ_ONLY", message: "Denetim hesabı fotoğraf değiştiremez." } }, 403);
    const employeeId = text(c.req.param("employeeId"));
    if (!(await personVisible(c, context.company, employeeId, false))) return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Personel bulunamadı." } }, 404);
    const form = await c.req.parseBody({ all: true });
    const values = Object.values(form).flatMap((value) => Array.isArray(value) ? value : [value]);
    const file = values.find((value) => value instanceof File) as File | undefined;
    if (!file) return c.json({ ok: false, error: { code: "FILE_REQUIRED", message: "Fotoğraf seçin." } }, 400);
    if (file.size > 5 * 1024 * 1024) return c.json({ ok: false, error: { code: "PHOTO_TOO_LARGE", message: "Fotoğraf en fazla 5 MB olabilir." } }, 413);
    const type = text(file.type).toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return c.json({ ok: false, error: { code: "PHOTO_TYPE", message: "JPG, PNG veya WEBP kullanın." } }, 415);
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const key = `ik/personnel-photos/${context.company}/${employeeId}/${crypto.randomUUID()}.${ext}`;
    await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: type }, customMetadata: { employeeId, company: context.company } });
    const stamp = nowIso();
    const payload = { employeeId, storageKey: key, contentType: type, size: file.size, fileName: file.name, updatedAt: stamp };
    const existing = await c.env.DB.prepare("SELECT id FROM json_store WHERE scope='IK_PERSONNEL_PHOTO' AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL) LIMIT 1")
      .bind(employeeId, context.company).first<Row>();
    if (existing?.id) {
      await c.env.DB.prepare("UPDATE json_store SET data=?,main_company_slug=?,updated_at=? WHERE id=?")
        .bind(JSON.stringify(payload), context.company, stamp, text(existing.id)).run();
    } else {
      await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), "IK_PERSONNEL_PHOTO", context.company, employeeId, JSON.stringify(payload), stamp, stamp).run();
    }
    return c.json({ ok: true, success: true, data: payload }, 201);
  });
}
