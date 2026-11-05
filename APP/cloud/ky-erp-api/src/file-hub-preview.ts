// @ts-nocheck
import type { Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { ensureCloudModelImagePreview } from "./file-hub-cloud-oauth";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toLocaleUpperCase("tr-TR");
const slugOf = (c: any) => text(c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
// Company owner is already tenant-checked by admin-storage-cloud middleware.
const owner = (role: unknown) => ["ADMIN", "SUPER_ADMIN", "COMPANY_ADMIN"].includes(upper(role));
function permission(user: Row, moduleKey: string) {
  return Array.isArray(user?.permissions)
    ? user.permissions.find((p: Row) => upper(p.moduleKey || p.module_key) === upper(moduleKey))
    : null;
}
function canView(user: Row, moduleKey: string) {
  const record = permission(user, moduleKey);
  return record?.canView === true || Number(record?.can_view || 0) === 1;
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
    DELIVERY_NOTE: "EBELGE",
    E_DOCUMENT: "EBELGE",
    CHEQUE: "MUHASEBE",
    PAYMENT: "MUHASEBE",
    BANK_TRANSACTION: "MUHASEBE",
    ACCOUNTING_ENTRY: "MUHASEBE",
    PERSONNEL: "IK",
    EMPLOYEE: "IK",
    PAYROLL: "IK",
    LEAVE_REQUEST: "IK",
    PDKS_ATTENDANCE: "PDKS",
    AUDIT: "DENETIM",
    AUDIT_REPORT: "DENETIM",
    QUALITY_REPORT: "DENETIM",
  } as Record<string, string>)[upper(entityType)] || "";
}

export function registerFileHubPreviewRoutes(app: Hono<AppEnv>) {
  // User-triggered full-canvas PSD conversion; heavy source never enters Worker memory.
  app.post("/api/file-hub/files/:id/preview/request", async (c) => {
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return c.json({ok:false,error:{code:"UNAUTHORIZED",message:"Oturum gerekli."}},401);
    const slug = slugOf(c), id = c.req.param("id");
    const asset = await c.env.DB.prepare(
      "SELECT id,extension,source_type,status,preview_status,preview_storage_key FROM file_hub_assets WHERE id=? AND main_company_slug=? LIMIT 1"
    ).bind(id,slug).first<Row>();
    if (!asset) return c.json({ok:false,error:{code:"NOT_FOUND",message:"Dosya bulunamadı."}},404);
    if (!owner(user.role)) {
      const relations = await c.env.DB.prepare(
        "SELECT entity_type FROM file_hub_relations WHERE main_company_slug=? AND file_asset_id=?"
      ).bind(slug,id).all<Row>();
      const modules = [...new Set((relations.results || []).map((row:Row) => moduleForEntity(row.entity_type)))];
      if (!modules.length || !modules.every((moduleKey) => moduleKey && canView(user,moduleKey))) {
        return c.json({ok:false,error:{code:"FORBIDDEN",message:"Bu dosyayı görme yetkiniz bulunmuyor."}},403);
      }
    }
    if (!["PSD","PSB"].includes(upper(asset.extension))) {
      return c.json({ok:false,error:{code:"PREVIEW_NOT_PSD",message:"Bu işlem yalnız PSD/PSB için geçerlidir."}},422);
    }
    if (upper(asset.status) !== "AVAILABLE") {
      return c.json({ok:false,error:{code:"SOURCE_UNAVAILABLE",message:"Kaynak dosya kullanılabilir değil."}},409);
    }
    const key = text(asset.preview_storage_key);
    const status = upper(asset.preview_status);
    // Small Google thumbnails are not full-canvas PSD previews.
    if (status === "READY" && key && !key.startsWith("file-hub/previews/cloud/")) {
      // Stale D1 cache pointers can outlive an R2 preview object; repair on demand.
      const existing = await c.env.FILES.head(key);
      if (existing) return c.json({ok:true,data:{status:"READY",previewUrl:"/api/file-hub/files/"+encodeURIComponent(id)+"/preview"}});
    }
    if (["PROCESSING","PENDING"].includes(status)) return c.json({ok:true,data:{status}},202);
    if (upper(asset.source_type) === "CLOUD_API") {
      const linked = await c.env.DB.prepare(
        "SELECT 1 ok FROM file_hub_relations WHERE main_company_slug=? AND file_asset_id=? AND entity_type='MODEL' LIMIT 1"
      ).bind(slug,id).first<Row>();
      if (!linked) return c.json({ok:false,error:{code:"MODEL_RELATION_PENDING",message:"Önizleme için önce PSD ile model dosya bağlantısı indekslenmeli."}},409);
    }
    if (upper(asset.source_type) !== "CLOUD_API") {
      return c.json({ok:false,error:{code:"AGENT_SOURCE_REQUIRED",message:"Yerel dosya önizlemesi File Hub Agent üzerinden hazırlanmalıdır."}},409);
    }
    await c.env.DB.prepare(
      "UPDATE file_hub_assets SET preview_status='PENDING',preview_storage_key=NULL,updated_at=? WHERE id=? AND main_company_slug=?"
    ).bind(new Date().toISOString(),id,slug).run();
    return c.json({ok:true,data:{status:"PENDING"}},202);
  });

  app.get("/api/file-hub/files/:id/preview", async (c) => {
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return c.json({ ok:false, error:{ code:"UNAUTHORIZED", message:"Oturum gerekli." } }, 401);
    const slug = slugOf(c), id = c.req.param("id");
    const asset = await c.env.DB.prepare(
      `SELECT id,file_name,extension,mime_type,preview_status,preview_storage_key,status,source_type
         FROM file_hub_assets
        WHERE id=? AND main_company_slug=? LIMIT 1`,
    ).bind(id, slug).first<Row>();
    if (!asset) return c.json({ ok:false, error:{ code:"NOT_FOUND", message:"Dosya bulunamadı." } }, 404);

    if (!owner(user.role)) {
      const relations = await c.env.DB.prepare(
        `SELECT entity_type FROM file_hub_relations
          WHERE main_company_slug=? AND file_asset_id=?`,
      ).bind(slug, id).all<Row>();
      const relationRows = relations.results || [];
      const modules = [...new Set(relationRows.map((row: Row) => moduleForEntity(row.entity_type)))];
      // Bilinmeyen ilişki tipi bir açık erişim yolu olamaz. Bir dosya hem finans hem
      // özlük kaydına bağlıysa her iki modülün görüntüleme yetkisi de gerekli.
      if (!modules.length || !modules.every((moduleKey) => moduleKey && canView(user, moduleKey))) {
        return c.json({ ok:false, error:{ code:"FORBIDDEN", message:"Bu dosyanın önizlemesini görme yetkiniz bulunmuyor." } }, 403);
      }
    }

    let key = text(asset.preview_storage_key);
    let status = upper(asset.preview_status);
    if ((!key || status !== "READY") && upper(asset.source_type) === "CLOUD_API" &&
        ["JPG","JPEG","PNG","WEBP","AI","PDF","TIF","TIFF"].includes(upper(asset.extension))) {
      try {
        if (await ensureCloudModelImagePreview(c,slug,id)) {
          const ready = await c.env.DB.prepare(
            "SELECT preview_storage_key,preview_status FROM file_hub_assets WHERE id=? AND main_company_slug=?",
          ).bind(id,slug).first<Row>();
          key = text(ready?.preview_storage_key);
          status = upper(ready?.preview_status);
        }
      } catch {
        // Sağlayıcı önizlemesi geçici erişilemiyorsa ana model kaydı ve dosya ilişkisi korunur.
      }
    }
    if (!key || status !== "READY") {
      return c.json({ ok:false, error:{ code:"PREVIEW_NOT_READY", message:"Dosya mevcut ancak web önizlemesi henüz hazır değil." } }, 404);
    }
    const object = await c.env.FILES.get(key);
    if (!object) return c.json({ ok:false, error:{ code:"PREVIEW_MISSING", message:"Önizleme cache kaydı bulunamadı." } }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", ["PSD","PSB"].includes(upper(asset.extension)) ? "private, no-store" : "private, max-age=3600");
    const type = headers.get("content-type") || text(asset.mime_type) || "application/octet-stream";
    headers.set("content-type", type);
    if (type === "application/pdf") headers.set("content-disposition", `inline; filename="${text(asset.file_name).replace(/\"/g, "")}"`);
    return new Response(object.body, { headers });
  });
}
