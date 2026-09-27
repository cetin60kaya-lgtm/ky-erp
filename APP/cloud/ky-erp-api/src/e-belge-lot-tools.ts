// @ts-nocheck
import type { Context, Hono } from "hono";
import {
  reconcileLotEvidence,
  resolveProductLotPolicy,
  type LotPolicy,
} from "./accounting-lot-reconciliation-core";
import {
  eBelgeProductRouting,
  getEBelgeProduct,
  getEBelgeSupplierProfile,
} from "./e-belge-product-store";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const now = () => new Date().toISOString();
const json = (value: unknown): Row => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  try {
    const parsed = JSON.parse(text(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
const slugOf = (c: Context<AppEnv>, body: Row = {}) =>
  text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      body.mainCompanyId ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      c.req.header("X-KYERP-Tenant-Slug"),
  );

const normalizedPolicy = (value: unknown): LotPolicy | null => {
  const policy = text(value).toLocaleUpperCase("tr-TR").replace(/\s+/g, "_");
  if (["REQUIRED", "LOT_ZORUNLU", "ZORUNLU"].includes(policy)) return "REQUIRED";
  if (["OPTIONAL", "LOT_OPSIYONEL", "OPSIYONEL"].includes(policy)) return "OPTIONAL";
  if (["NONE", "LOT_KULLANILMAZ", "KULLANILMAZ", "NO_LOT"].includes(policy)) return "NONE";
  return null;
};

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(table).first<Row>();
  return Boolean(row?.name);
}

async function tableColumns(c: Context<AppEnv>, table: string) {
  if (!(await tableExists(c, table))) return new Set<string>();
  const rows = await c.env.DB.prepare(
    `PRAGMA table_info("${table.replace(/"/g, '""')}")`,
  ).all<Row>();
  return new Set((rows.results || []).map((row) => text(row.name)));
}

async function saveProductLotPolicy(
  c: Context<AppEnv>,
  slug: string,
  product: Row,
  policy: LotPolicy,
) {
  const productId = text(product.id);
  if (!productId) throw Object.assign(new Error("Ürün kimliği eksik."), { code: "PRODUCT_ID_REQUIRED" });

  if (text(product._source) === "BOYAHANE") {
    const stored = await c.env.DB.prepare(
      `SELECT id,data FROM json_store
        WHERE scope='BOYAHANE_APPROVED_PRODUCT'
          AND file_name=?
          AND (main_company_slug=? OR main_company_slug IS NULL)
        ORDER BY updated_at DESC
        LIMIT 1`,
    ).bind(productId, slug).first<Row>();
    if (!stored?.id) throw Object.assign(new Error("Boyahane ürün kartı bulunamadı."), { code: "PRODUCT_NOT_FOUND" });
    const data = { ...json(stored.data), lotPolicy: policy, lotRequired: policy === "REQUIRED", updatedAt: now() };
    await c.env.DB.prepare(
      `UPDATE json_store
          SET data=?,main_company_slug=COALESCE(main_company_slug,?),updated_at=?
        WHERE id=?`,
    ).bind(JSON.stringify(data), slug, data.updatedAt, stored.id).run();
    return { productId, lotPolicy: policy, source: "BOYAHANE_APPROVED_PRODUCT" };
  }

  if (await tableExists(c, "products")) {
    const columns = await tableColumns(c, "products");
    const row = await c.env.DB.prepare(
      `SELECT * FROM products WHERE main_company_slug=? AND id=? LIMIT 1`,
    ).bind(slug, productId).first<Row>();
    if (!row) throw Object.assign(new Error("Ürün kartı bulunamadı."), { code: "PRODUCT_NOT_FOUND" });

    if (columns.has("lot_policy")) {
      await c.env.DB.prepare(
        `UPDATE products SET lot_policy=?${columns.has("updated_at") ? ",updated_at=?" : ""}
          WHERE main_company_slug=? AND id=?`,
      ).bind(
        ...(columns.has("updated_at")
          ? [policy, now(), slug, productId]
          : [policy, slug, productId]),
      ).run();
      return { productId, lotPolicy: policy, source: "PRODUCTS_LOT_POLICY" };
    }

    if (columns.has("raw")) {
      const raw = { ...json(row.raw), lotPolicy: policy, lotRequired: policy === "REQUIRED" };
      await c.env.DB.prepare(
        `UPDATE products SET raw=?${columns.has("updated_at") ? ",updated_at=?" : ""}
          WHERE main_company_slug=? AND id=?`,
      ).bind(
        ...(columns.has("updated_at")
          ? [JSON.stringify(raw), now(), slug, productId]
          : [JSON.stringify(raw), slug, productId]),
      ).run();
      return { productId, lotPolicy: policy, source: "PRODUCTS_RAW" };
    }
  }

  throw Object.assign(new Error("Ürün kartında LOT politikası saklanabilecek alan bulunamadı."), {
    code: "LOT_POLICY_STORAGE_UNAVAILABLE",
  });
}

async function syncLotIssues(
  c: Context<AppEnv>,
  slug: string,
  documentId: string,
  lineId: string,
  reconciliation: ReturnType<typeof reconcileLotEvidence>,
) {
  const unresolved = reconciliation.status === "CONFLICT" || reconciliation.status === "MISSING_REQUIRED";
  const code = reconciliation.status === "CONFLICT" ? "LOT_CONFLICT" : "LOT_REQUIRED";

  if (!unresolved) {
    await c.env.DB.prepare(
      `UPDATE accounting_document_issues
          SET is_resolved=1,resolved_at=?
        WHERE main_company_slug=?
          AND document_id=?
          AND issue_code IN ('LOT_REQUIRED','LOT_CONFLICT')
          AND is_resolved=0`,
    ).bind(now(), slug, documentId).run();
    return;
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM accounting_document_issues
      WHERE main_company_slug=? AND document_id=? AND issue_code=? AND is_resolved=0
      LIMIT 1`,
  ).bind(slug, documentId, code).first<Row>();
  if (existing?.id) return;

  const columns = await tableColumns(c, "accounting_document_issues");
  const values: Row = {
    id: crypto.randomUUID(),
    main_company_slug: slug,
    document_id: documentId,
    line_id: lineId,
    issue_code: code,
    message: reconciliation.message,
    is_resolved: 0,
    created_at: now(),
    updated_at: now(),
  };
  const insertColumns = Object.keys(values).filter((key) => columns.has(key));
  if (!insertColumns.length) return;
  const placeholders = insertColumns.map(() => "?").join(",");
  await c.env.DB.prepare(
    `INSERT INTO accounting_document_issues(${insertColumns.join(",")}) VALUES(${placeholders})`,
  ).bind(...insertColumns.map((key) => values[key])).run();
}

export function registerEBelgeLotToolRoutes(app: Hono<AppEnv>) {
  app.get("/api/e-belge/products/:productId/lot-policy", async (c) => {
    const slug = slugOf(c);
    const product = await getEBelgeProduct(c, slug, c.req.param("productId"));
    if (!product) return c.json({ ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Ürün kartı bulunamadı." } }, 404);
    return c.json({
      ok: true,
      data: {
        productId: text(product.id),
        lotPolicy: resolveProductLotPolicy(product),
      },
    });
  });

  app.patch("/api/e-belge/products/:productId/lot-policy", async (c) => {
    const body = await c.req.json<Row>().catch(() => ({}));
    const slug = slugOf(c, body);
    const policy = normalizedPolicy(body.lotPolicy);
    if (!policy) {
      return c.json({
        ok: false,
        error: {
          code: "INVALID_LOT_POLICY",
          message: "LOT politikası REQUIRED, OPTIONAL veya NONE olmalıdır.",
        },
      }, 400);
    }
    const product = await getEBelgeProduct(c, slug, c.req.param("productId"));
    if (!product) return c.json({ ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Ürün kartı bulunamadı." } }, 404);
    try {
      return c.json({ ok: true, data: await saveProductLotPolicy(c, slug, product, policy) });
    } catch (error: any) {
      return c.json({
        ok: false,
        error: {
          code: text(error?.code) || "LOT_POLICY_SAVE_FAILED",
          message: text(error?.message) || "LOT politikası kaydedilemedi.",
        },
      }, 409);
    }
  });

  app.post("/api/e-belge/documents/:id/lines/:lineId/lot-reconcile", async (c) => {
    const body = await c.req.json<Row>().catch(() => ({}));
    const slug = slugOf(c, body);
    const documentId = c.req.param("id");
    const lineId = c.req.param("lineId");
    const [line, document] = await Promise.all([
      c.env.DB.prepare(
        `SELECT * FROM accounting_document_lines
          WHERE id=? AND document_id=? AND main_company_slug=? LIMIT 1`,
      ).bind(lineId, documentId, slug).first<Row>(),
      c.env.DB.prepare(
        `SELECT party_company_id FROM accounting_documents
          WHERE id=? AND main_company_slug=? LIMIT 1`,
      ).bind(documentId, slug).first<Row>(),
    ]);
    if (!line) return c.json({ ok: false, error: { code: "LINE_NOT_FOUND", message: "Belge kalemi bulunamadı." } }, 404);

    const raw = json(line.raw_metadata);
    const product = text(line.product_id)
      ? await getEBelgeProduct(c, slug, text(line.product_id))
      : null;
    if (!product) {
      return c.json({
        ok: false,
        error: {
          code: "PRODUCT_MATCH_REQUIRED",
          message: "LOT uzlaştırmadan önce kalem onaylı ürün kartıyla eşleştirilmelidir.",
        },
      }, 409);
    }

    const supplier = await getEBelgeSupplierProfile(c, slug, text(document?.party_company_id));
    const routing = eBelgeProductRouting(product, line, supplier);
    const lotPolicy = resolveProductLotPolicy(product, routing.routing);
    const invoiceLotNo = body.invoiceLotNo !== undefined
      ? text(body.invoiceLotNo)
      : text(raw.invoiceLotNo || raw.lotNo);
    const dispatchLotNo = body.dispatchLotNo !== undefined
      ? text(body.dispatchLotNo)
      : text(raw.dispatchLotNo || raw.despatchLotNo);
    const reconciliation = reconcileLotEvidence({
      policy: lotPolicy,
      invoiceLotNo,
      dispatchLotNo,
    });

    const nextRaw = {
      ...raw,
      lotPolicy,
      lotRequired: lotPolicy === "REQUIRED",
      invoiceLotNo,
      dispatchLotNo,
      lotNo: reconciliation.resolvedLotNo,
      lotReconciliationStatus: reconciliation.status,
      lotReconciliationMessage: reconciliation.message,
      lotReconciledAt: now(),
      lotCanPostStock: reconciliation.canPostStock,
      lotRequiresReview: reconciliation.requiresReview,
    };

    await c.env.DB.prepare(
      `UPDATE accounting_document_lines
          SET raw_metadata=?,updated_at=?
        WHERE id=? AND document_id=? AND main_company_slug=?`,
    ).bind(JSON.stringify(nextRaw), now(), lineId, documentId, slug).run();
    await syncLotIssues(c, slug, documentId, lineId, reconciliation);

    return c.json({
      ok: true,
      data: {
        documentId,
        lineId,
        productId: text(product.id),
        routingType: routing.routing,
        ...reconciliation,
      },
    });
  });
}
