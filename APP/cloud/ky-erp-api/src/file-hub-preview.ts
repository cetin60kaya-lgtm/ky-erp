// @ts-nocheck
import type { Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerFileHubCloudOauthRoutes } from "./file-hub-cloud-oauth";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toLocaleUpperCase("tr-TR");
const slugOf = (c: any) => text(c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
const owner = (role: unknown) => ["ADMIN", "SUPER_ADMIN"].includes(upper(role));
function permission(user: Row, moduleKey: string) {
  return Array.isArray(user?.permissions)
    ? user.permissions.find((p: Row) => upper(p.moduleKey || p.module_key) === upper(moduleKey))
    : null;
}
function moduleForEntity(entityType: unknown) {
  return ({
    MODEL: "DESEN",
    MODEL_TEAMMATE: "DESEN",
    OUTGOING_PACKAGE: "DESEN",
    PRODUCTION: "IMALAT",
    PRODUCTION_ORDER: "IMALAT",
    DYE_RECIPE: "BOYAHANE",
    DYE_BATCH: "BOYAHANE",
    LOT: "BOYAHANE",
    STOCK_ITEM: "BOYAHANE",
    DOCUMENT: "MUHASEBE",
    INVOICE: "MUHASEBE",
    PERSONNEL: "IK",
    EMPLOYEE: "IK",
  } as Record<string, string>)[upper(entityType)] || "";
}

export function registerFileHubPreviewRoutes(app: Hono<AppEnv>) {
  registerFileHubCloudOauthRoutes(app as any);

  app.get("/api/file-hub/files/:id/preview", async (c) => {
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return c.json({ ok:false, error:{ code:"UNAUTHORIZED", message:"Oturum gerekli." } }, 401);
    const slug = slugOf(c), id = c.req.param("id");
    const asset = await c.env.DB.prepare(
      `SELECT id,file_name,mime_type,preview_status,preview_storage_key,status
         FROM file_hub_assets
        WHERE id=? AND main_company_slug=? LIMIT 1`,
    ).bind(id, slug).first<Row>();
    if (!asset) return c.json({ ok:false, error:{ code:"NOT_FOUND", message:"Dosya bulunamadı." } }, 404);

    if (!owner(user.role)) {
      const relations = await c.env.DB.prepare(
        `SELECT entity_type FROM file_hub_relations
          WHERE main_company_slug=? AND file_asset_id=?`,
      ).bind(slug, id).all<Row>();
      const modules = [...new Set((relations.results || []).map((row: Row) => moduleForEntity(row.entity_type)).filter(Boolean))];
      if (!modules.length || !modules.some((moduleKey) => permission(user, moduleKey)?.canView)) {
        return c.json({ ok:false, error:{ code:"FORBIDDEN", message:"Bu dosyanın önizlemesini görme yetkiniz bulunmuyor." } }, 403);
      }
    }

    const key = text(asset.preview_storage_key);
    if (!key || upper(asset.preview_status) !== "READY") {
      return c.json({ ok:false, error:{ code:"PREVIEW_NOT_READY", message:"Dosya mevcut ancak web önizlemesi henüz hazır değil." } }, 404);
    }
    const object = await c.env.FILES.get(key);
    if (!object) return c.json({ ok:false, error:{ code:"PREVIEW_MISSING", message:"Önizleme cache kaydı bulunamadı." } }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=3600");
    const type = headers.get("content-type") || text(asset.mime_type) || "application/octet-stream";
    headers.set("content-type", type);
    if (type === "application/pdf") headers.set("content-disposition", `inline; filename="${text(asset.file_name).replace(/\"/g, "")}"`);
    return new Response(object.body, { headers });
  });
}
