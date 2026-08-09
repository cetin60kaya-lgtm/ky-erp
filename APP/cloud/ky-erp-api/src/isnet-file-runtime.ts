// @ts-nocheck
import type { Context, Hono } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
function slugOf(c: Context<AppEnv>) { return text(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan"); }
function errorBody(code: string, message: string) { return { ok: false, success: false, error: { code, message } }; }

async function stateOf(c: Context<AppEnv>, key: string, slug: string) {
  const row = await c.env.DB.prepare(
    `SELECT data FROM json_store
      WHERE scope='ISNET_DOCUMENT_STATE'
        AND file_name=?
        AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(key, slug).first<Row>();
  return row ? objectOf(row.data) : null;
}

export function registerIsnetFileRuntimeRoutes(app: Hono<AppEnv>) {
  app.get("/api/isnet/local-files/:key/:format", async (c) => {
    const slug = slugOf(c);
    const key = decodeURIComponent(c.req.param("key"));
    const format = text(c.req.param("format")).toLowerCase();
    if (!new Set(["pdf", "xml"]).has(format)) {
      return c.json(errorBody("INVALID_FORMAT", "Yalnız PDF veya XML dosyası açılabilir."), 400);
    }
    const state = await stateOf(c, key, slug);
    if (!state) return c.json(errorBody("NOT_FOUND", "İşNet belge dosyası bulunamadı."), 404);
    const objectKey = text(format === "pdf" ? state.pdfKey || state.pdfR2Key : state.xmlKey || state.xmlR2Key);
    if (!objectKey) return c.json(errorBody("FILE_NOT_READY", `${format.toUpperCase()} dosyası henüz arşivlenmedi.`), 404);
    const object = await c.env.FILES.get(objectKey);
    if (!object) return c.json(errorBody("FILE_NOT_FOUND", "Arşiv dosyası R2 üzerinde bulunamadı."), 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Cache-Control", "private, max-age=60");
    if (!headers.get("Content-Type")) headers.set("Content-Type", format === "pdf" ? "application/pdf" : "application/xml; charset=utf-8");
    headers.set("Content-Disposition", `inline; filename="${key.replace(/[^a-zA-Z0-9._-]+/g, "-")}.${format}"`);
    return new Response(object.body, { headers });
  });
}
