// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { storeSnapshot, storeGuard, storeUpdate, storeInsert, stableStoreId, commitStoreBatch } from "./atomic-json-store.ts";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const PRODUCT_SCOPE = "BOYAHANE_APPROVED_PRODUCT";
const LOT_SCOPE = "BOYAHANE_LOT";
const MOVEMENT_SCOPE = "BOYAHANE_STOCK_MOVEMENT";
const ALIAS_SCOPE = "MUHASEBE_PRODUCT_ALIAS";
const SUPPLIER_SCOPE = "MUHASEBE_CHEMICAL_SUPPLIER";
const MECIT_HAKAN_ALIASES = [
  "mecit-hakan",
  "main-mecit-hakan",
  "mecit-hakan-gursu",
  "hakan-baski",
  "main-hakan",
  "main-hakan-baski",
  "hkn-baski",
];

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: unknown) =>
  text(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const jsonObject = (value: unknown): Row => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Row)
      : {};
  } catch {
    return {};
  }
};

const jsonError = (code: string, message: string, details?: unknown) => ({
  ok: false,
  success: false,
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Row)
      : {};
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  const slug = text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  ).toLocaleLowerCase("tr-TR").replace(/_/g, "-");
  return MECIT_HAKAN_ALIASES.includes(slug) ? "mecit-hakan" : slug;
}

function tenantSlugs(slug: string) {
  const normalized = text(slug).toLocaleLowerCase("tr-TR").replace(/_/g, "-");
  return MECIT_HAKAN_ALIASES.includes(normalized) ? MECIT_HAKAN_ALIASES : [normalized];
}

async function storeRows(c: Context<AppEnv>, scope: string, slug: string) {
  const tenants = tenantSlugs(slug);
  const placeholders = tenants.map(() => "?").join(",");
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND (main_company_slug IN (${placeholders}) OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  )
    .bind(scope, ...tenants)
    .all<Row>();

  return (result.results || []).map((row) => ({
    ...jsonObject(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(jsonObject(row.data).createdAt || row.created_at),
    updatedAt: text(jsonObject(row.data).updatedAt || row.updated_at),
  }));
}

async function storeGet(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  slug: string,
) {
  const tenants = tenantSlugs(slug);
  const placeholders = tenants.map(() => "?").join(",");
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug IN (${placeholders}) OR main_company_slug IS NULL)
      ORDER BY updated_at DESC
      LIMIT 1`,
  )
    .bind(scope, fileName, ...tenants)
    .first<Row>();

  if (!row) return null;
  return {
    ...jsonObject(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(jsonObject(row.data).createdAt || row.created_at),
    updatedAt: text(jsonObject(row.data).updatedAt || row.updated_at),
  };
}

async function storePut(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  data: Row,
  slug: string,
) {
  const existing = await storeGet(c, scope, fileName, slug);
  const now = new Date().toISOString();
  const payload = { ...data, updatedAt: now };

  if (existing?.storeId) {
    if (scope === LOT_SCOPE) {
      const snapshot = await storeSnapshot(c.env.DB, scope, slug, fileName);
      if (!snapshot) throw Error("LOT_TENANT_REVIEW");
      // All remaining callers here only clear a prior default marker. Never
      // replace a stock or status snapshot from an earlier read.
      const next = {...snapshot.value,isDefault:payload.isDefault};
      await commitStoreBatch(c.env.DB,[storeGuard(c.env.DB,snapshot)],[storeUpdate(c.env.DB,snapshot,next,now)]);
      return {...next,updatedAt:now,storeId:snapshot.id,fileName};
    }
    await c.env.DB.prepare(
      `UPDATE json_store
          SET data = ?, updated_at = ?
        WHERE id = ?
          AND (main_company_slug = ? OR main_company_slug IS NULL)`,
    )
      .bind(JSON.stringify(payload), now, existing.storeId, slug)
      .run();
    return { ...payload, storeId: existing.storeId, fileName };
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, scope, slug || null, fileName, JSON.stringify(payload), now, now)
    .run();

  return { ...payload, storeId: id, fileName };
}

function productView(row: Row) {
  const name = text(row.productName || row.name);
  return {
    ...row,
    id: text(row.id || row.fileName),
    productName: name,
    name,
    code: text(row.code),
    dyeType: text(row.dyeType || row.category || "GENEL"),
    unit: text(row.unit || "KG"),
    minStockKg: numberValue(row.minStockKg),
    approvalStatus: text(row.approvalStatus || "APPROVED"),
    isApproved: text(row.approvalStatus || "APPROVED") === "APPROVED",
    isActive: row.isActive !== false,
    documentCount: Array.isArray(row.documents) ? row.documents.length : 0,
    documentationStatus: row.archiveStatus === "FILE_HUB_PDF_VERIFIED" ? "FILE_HUB_VERIFIED" : "DOCUMENT_REVIEW_PENDING",
  };
}

function lotView(row: Row, productMap: Map<string, Row>) {
  const productId = text(row.productId || row.inventoryId);
  const product = productMap.get(productId);
  const entryKg = numberValue(row.entryKg || row.quantity);
  const remainingKg = numberValue(
    row.remainingKg ?? row.remainingQuantity ?? entryKg,
  );
  const usedKg = Math.max(0, numberValue(row.usedKg || entryKg - remainingKg));
  const status = text(
    row.status || (remainingKg <= 0 ? "DEPLETED" : "AVAILABLE"),
  );

  return {
    ...row,
    id: text(row.id || row.fileName),
    inventoryId: productId,
    productId,
    productName: text(
      row.productName || product?.productName || product?.name || "",
    ),
    dyeType: text(row.dyeType || product?.dyeType || "GENEL"),
    lotNo: text(row.lotNo),
    supplierName: text(row.supplierName || row.companyName),
    companyName: text(row.companyName || row.supplierName),
    invoiceNo: text(row.invoiceNo || row.documentNo),
    documentNo: text(row.documentNo || row.invoiceNo),
    entryKg,
    quantity: entryKg,
    usedKg,
    remainingKg,
    remainingQuantity: remainingKg,
    unit: text(row.unit || product?.unit || "KG"),
    isDefault: row.isDefault === true,
    status,
  };
}

async function approvedProducts(c: Context<AppEnv>, slug: string) {
  const stored = await storeRows(c, PRODUCT_SCOPE, slug);
  const map = new Map<string, Row>();
  stored.forEach((row) => {
    const product = productView(row);
    if (product.id) map.set(product.id, product);
  });

  // İlişkisel eski lotların bağlı ürünleri salt-okunur uyumluluk kartı olarak gösterilir.
  // GET akışı production verisine yazmaz; yeni kartlar yalnız açık kullanıcı işlemiyle oluşur.
  const tenants = tenantSlugs(slug);
  const placeholders = tenants.map(() => "?").join(",");
  const legacyProducts = await c.env.DB.prepare(
    `SELECT DISTINCT p.id,p.legacy_id,p.name,p.unit,p.is_active,p.raw
       FROM products p
       JOIN boyahane_lots l ON l.product_id = p.id
      WHERE l.deleted_at IS NULL
        AND l.main_company_slug IN (${placeholders})
        AND p.main_company_slug IN (${placeholders})
      ORDER BY p.name COLLATE NOCASE ASC`,
  ).bind(...tenants, ...tenants).all<Row>();
  for (const row of legacyProducts.results || []) {
    const raw = jsonObject(row.raw);
    const product = productView({
      ...raw,
      id: text(row.id),
      productName: text(row.name),
      name: text(row.name),
      code: text(raw.shortCode || row.legacy_id),
      dyeType: text(raw.paintType || raw.groupType || "GENEL"),
      unit: text(row.unit || raw.unit || "KG"),
      approvalStatus: "APPROVED",
      isActive: row.is_active !== false && Number(row.is_active ?? 1) !== 0,
      source: "RELATIONAL_LOT",
    });
    if (product.id && !map.has(product.id)) map.set(product.id, product);
  }

  // Eski JSON lotlar kaybolmasın; ürün kartı olmayan kayıtlar bellekte geçiş kartı alır.
  const lots = await storeRows(c, LOT_SCOPE, slug);
  for (const lot of lots) {
    const id = text(lot.productId || lot.inventoryId);
    const name = text(lot.productName);
    if (!id || !name || map.has(id)) continue;
    const migrated = productView({
      id,
      productName: name,
      name,
      dyeType: text(lot.dyeType || "GENEL"),
      unit: text(lot.unit || "KG"),
      minStockKg: 0,
      approvalStatus: "REVIEW_REQUIRED",
      isActive: true,
      source: "LEGACY_LOT",
      createdAt: text(lot.createdAt),
    });
    map.set(id, migrated);
  }

  return [...map.values()].sort((a, b) =>
    text(a.productName).localeCompare(text(b.productName), "tr"),
  );
}

async function relationalLots(c: Context<AppEnv>, slug: string) {
  const tenants = tenantSlugs(slug);
  const placeholders = tenants.map(() => "?").join(",");
  const result = await c.env.DB.prepare(
    `SELECT l.*,p.name AS product_name,p.unit AS product_unit
       FROM boyahane_lots l
       LEFT JOIN products p ON p.id = l.product_id
      WHERE l.deleted_at IS NULL
        AND l.main_company_slug IN (${placeholders})
      ORDER BY l.updated_at DESC,l.created_at DESC,l.id DESC`,
  ).bind(...tenants).all<Row>();
  return (result.results || []).map((row) => ({
    ...jsonObject(row.raw),
    id: text(row.id),
    productId: text(row.product_id),
    inventoryId: text(row.product_id),
    productName: text(row.product_name || jsonObject(row.raw)?.line?.rawName),
    lotNo: text(row.lot_no),
    entryKg: numberValue(row.quantity),
    quantity: numberValue(row.quantity),
    usedKg: Math.max(0, numberValue(row.quantity) - numberValue(row.remaining_quantity)),
    remainingKg: numberValue(row.remaining_quantity),
    remainingQuantity: numberValue(row.remaining_quantity),
    unit: text(row.product_unit || jsonObject(row.raw)?.line?.unit || "KG"),
    status: text(row.status || "ACTIVE"),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    source: "RELATIONAL_LOT",
  }));
}

async function updateDocumentTransfer(
  c: Context<AppEnv>,
  documentId: string,
  slug: string,
  lotIds: string[],
) {
  const row = await c.env.DB.prepare(
    `SELECT metadata, raw FROM documents
      WHERE id = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      LIMIT 1`,
  )
    .bind(documentId, slug)
    .first<Row>();
  if (!row) return;
  const now = new Date().toISOString();
  const metadata = {
    ...jsonObject(row.raw),
    ...jsonObject(row.metadata),
    boyahaneTransferStatus: "COMPLETED",
    boyahaneTransferredAt: now,
    boyahaneLotIds: lotIds,
  };
  await c.env.DB.prepare(
    `UPDATE documents
        SET metadata = ?, updated_at = ?
      WHERE id = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)`,
  )
    .bind(JSON.stringify(metadata), now, documentId, slug)
    .run();
}

// Yeni ürünün uygunluk onayı gerçek File Hub dosya konumu ve yetkili insan incelemesi gerektirir.
async function checkProductPdfEvidence(c: Context<AppEnv>, slug: string, productId: string, documents: Row[]) {
  const required = ["MSDS", "TDS", "ZDHC"];
  for (const kind of required) {
    const document = documents.find(row => {
      const type = normalize(row.name);
      return (kind === "MSDS" ? /MSDS|SDS|GBF/.test(type) : type.includes(kind))
        && text(row.verificationStatus) === "VERIFIED"
        && text(row.status) === "AVAILABLE"
        && text(row.fileHubAssetId);
    });
    if (!document) return { ok: false, kind, code: "DOCUMENT_MISSING" };
    if (kind === "ZDHC" && text(document.zdhcLevel || document.level) !== "3") {
      return { ok: false, kind, code: "ZDHC_LEVEL_3_UNVERIFIED" };
    }
    const asset = await c.env.DB.prepare(`
      SELECT a.id,a.extension,a.mime_type,a.status,a.sha256,
             l.is_available,l.relative_path,l.provider_file_id,
             r.id AS relation_id
      FROM file_hub_assets a
      JOIN file_hub_relations r ON r.file_asset_id=a.id
        AND r.main_company_slug=a.main_company_slug
        AND r.entity_type='BOYAHANE_PRODUCT' AND r.entity_id=?
      JOIN file_hub_locations l ON l.file_asset_id=a.id
        AND l.main_company_slug=a.main_company_slug AND l.location_role='PRIMARY'
      WHERE a.main_company_slug=? AND a.id=? LIMIT 1
    `).bind(productId,slug,text(document.fileHubAssetId)).first<Row>();
    if (!asset || text(asset.status).toUpperCase()==="MISSING"
       || Number(asset.is_available)!==1
       || (!text(asset.relative_path) && !text(asset.provider_file_id))
       || (text(asset.mime_type)!=="application/pdf" && text(asset.extension).toUpperCase()!=="PDF")
       || !text(asset.sha256)) {
      return { ok: false, kind, code: "FILE_HUB_PDF_NOT_VERIFIED" };
    }
  }
  return { ok: true };
}

export function registerBoyahaneInventoryRoutes(app: Hono<AppEnv>) {
  app.get("/api/boyahane/products", async (c) => {
    const slug = slugOf(c);
    const search = normalize(c.req.query("search"));
    const rows = (await approvedProducts(c, slug)).filter((row) => {
      if (!search) return true;
      return normalize(
        `${row.productName} ${row.code} ${row.dyeType}`,
      ).includes(search);
    });
    return c.json({ ok: true, success: true, data: rows });
  });

  app.post("/api/boyahane/products", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const productName = text(body.productName || body.name);
    if (!productName) {
      return c.json(
        jsonError("PRODUCT_NAME_REQUIRED", "Onaylı ürün adı zorunludur."),
        400,
      );
    }

    const products = await approvedProducts(c, slug);
    const duplicate = products.find(
      (row) => normalize(row.productName) === normalize(productName),
    );
    if (duplicate) {
      return c.json(
        jsonError("PRODUCT_EXISTS", "Aynı isimde onaylı ürün zaten var.", {
          productId: duplicate.id,
        }),
        409,
      );
    }

    const id = text(body.id || crypto.randomUUID());
    const now = new Date().toISOString();
    const data = productView(
      await storePut(
        c,
        PRODUCT_SCOPE,
        id,
        {
          id,
          productName,
          name: productName,
          code: text(body.code),
          dyeType: text(body.dyeType || body.category || "GENEL"),
          unit: text(body.unit || "KG"),
          minStockKg: numberValue(body.minStockKg),
          approvalStatus: "REVIEW_REQUIRED",
          isActive: body.isActive !== false,
          supplierName: text(body.supplierName),
          supplierId: text(body.supplierId),
          lotPolicy: text(body.lotPolicy || "REQUIRED"),
          documents: Array.isArray(body.documents) ? body.documents.map((doc: Row) => ({
            name: text(doc.name), status: ["AVAILABLE", "MISSING", "WAITING", "EXPIRED"].includes(text(doc.status)) ? text(doc.status) : "WAITING",
            fileName: text(doc.fileName), fileHubAssetId: text(doc.fileHubAssetId),
            documentDate: text(doc.documentDate), validUntil: text(doc.validUntil), note: text(doc.note),
            verificationStatus: "PENDING_REVIEW"
          })).filter((doc: Row)=>doc.name) : [],
          archiveStatus: "FILE_HUB_BINDING_PENDING",
          note: text(body.note),
          source: text(body.source || "MANUAL"),
          approvedAt: now,
          createdAt: now,
        },
        slug,
      ),
    );
    return c.json({ ok: true, success: true, data }, 201);
  });

  app.patch("/api/boyahane/products/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = c.req.param("id");
    const current = await storeGet(c, PRODUCT_SCOPE, id, slug);
    if (!current) {
      return c.json(jsonError("NOT_FOUND", "Onaylı ürün bulunamadı."), 404);
    }
    const productName = text(body.productName || body.name || current.productName);
    if (!productName) {
      return c.json(
        jsonError("PRODUCT_NAME_REQUIRED", "Onaylı ürün adı zorunludur."),
        400,
      );
    }
    // Geçmiş ürünleri sessizce geri çekme; yeni ürünün ilk onayı sıkı belgeli.
    if (text(body.approvalStatus) === "APPROVED" && text(current.approvalStatus) !== "APPROVED") {
      const actor = await getAuthenticatedUser(c);
      const role = text(actor?.role).toUpperCase();
      if (!actor || !["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(role)
          || (role !== "SUPER_ADMIN" && text(actor.mainCompanySlug) !== slug)) {
        return c.json(jsonError("APPROVAL_FORBIDDEN", "Firma yetkilisi oturumu gereklidir."),403);
      }
      const docs = Array.isArray(body.documents) ? body.documents : Array.isArray(current.documents) ? current.documents : [];
      const evidence = await checkProductPdfEvidence(c, slug, id, docs);
      if (!evidence.ok) return c.json(jsonError("CHEMICAL_DOCUMENTS_REQUIRED",
        "MSDS, TDS ve ZDHC Level 3 gerçek File Hub PDF eşleşmesi ve yetkili kontrol olmadan yeni ürün onaylanamaz.", evidence),409);
      body.approvedAt = new Date().toISOString();
      body.approvedBy = actor.id;
      body.archiveStatus = "FILE_HUB_PDF_VERIFIED";
    }
    const data = productView(
      await storePut(
        c,
        PRODUCT_SCOPE,
        id,
        {
          ...current,
          ...body,
          id,
          productName,
          name: productName,
          approvalStatus: body.approvalStatus || current.approvalStatus || "APPROVED",
          isActive: body.isActive ?? current.isActive ?? true,
        },
        slug,
      ),
    );
    return c.json({ ok: true, success: true, data });
  });

  app.get("/api/boyahane/workflow/lots", async (c) => {
    const slug = slugOf(c);
    const products = await approvedProducts(c, slug);
    const productMap = new Map(products.map((row) => [text(row.id), row]));
    const search = normalize(c.req.query("search"));
    const status = normalize(c.req.query("status"));
    const storedLots = await storeRows(c, LOT_SCOPE, slug);
    const legacyLots = await relationalLots(c, slug);
    const lotMap = new Map<string, Row>();
    [...legacyLots, ...storedLots].forEach((row) => {
      const id = text(row.id || row.fileName);
      if (id) lotMap.set(id, row);
    });
    const rows = [...lotMap.values()]
      .map((row) => lotView(row, productMap))
      .filter(
        (row) =>
          !status || status === "ALL" || normalize(row.status) === status,
      )
      .filter((row) => {
        if (!search) return true;
        return normalize(
          `${row.productName} ${row.dyeType} ${row.lotNo} ${row.supplierName} ${row.invoiceNo}`,
        ).includes(search);
      });
    return c.json({ ok: true, success: true, data: rows });
  });

  app.get("/api/boyahane/workflow/lots/:id", async (c) => {
    const slug = slugOf(c);
    const products = await approvedProducts(c, slug);
    const productMap = new Map(products.map((row) => [text(row.id), row]));
    const lot = await storeGet(c, LOT_SCOPE, c.req.param("id"), slug)
      || (await relationalLots(c, slug)).find((row) => text(row.id) === c.req.param("id"))
      || null;
    if (!lot) return c.json(jsonError("NOT_FOUND", "Lot bulunamadı."), 404);
    const movements = (await storeRows(c, MOVEMENT_SCOPE, slug)).filter(
      (row) => text(row.lotId) === text(lot.id || lot.fileName),
    );
    return c.json({
      ok: true,
      success: true,
      data: { ...lotView(lot, productMap), movements },
    });
  });

  app.post("/api/boyahane/workflow/lots", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const inventoryId = text(body.inventoryId || body.productId);
    const lotNo = text(body.lotNo);
    const entryKg = numberValue(body.entryKg || body.quantity);
    const products = await approvedProducts(c, slug);
    const product = products.find((row) => text(row.id) === inventoryId);

    if (!product || product.approvalStatus !== "APPROVED" || product.isActive === false) {
      return c.json(
        jsonError(
          "APPROVED_PRODUCT_REQUIRED",
          "Lot yalnız aktif ve onaylı Boyahane ürünü için açılabilir.",
        ),
        409,
      );
    }
    if (!lotNo || entryKg <= 0) {
      return c.json(
        jsonError(
          "INVALID_LOT",
          "Lot numarası ve sıfırdan büyük giriş KG zorunludur.",
        ),
        400,
      );
    }

    const existingLots = await storeRows(c, LOT_SCOPE, slug);
    const duplicate = existingLots.find(
      (row) =>
        text(row.productId || row.inventoryId) === inventoryId &&
        normalize(row.lotNo) === normalize(lotNo) &&
        !/DEPLETED|INACTIVE/.test(normalize(row.status)),
    );
    if (duplicate) {
      return c.json(
        jsonError("LOT_EXISTS", "Bu ürün için aynı lot numarası zaten açık."),
        409,
      );
    }

    const id = text(body.id || crypto.randomUUID());
    if (await storeGet(c,LOT_SCOPE,id,slug)) return c.json(jsonError("LOT_EXISTS","Bu LOT kimliği zaten kayıtlı."),409);
    const now = new Date().toISOString();
    if (body.isDefault === true) {
      for (const row of existingLots) {
        if (
          text(row.productId || row.inventoryId) === inventoryId &&
          row.isDefault === true
        ) {
          await storePut(c, LOT_SCOPE, text(row.id || row.fileName), {
            ...row,
            isDefault: false,
          }, slug);
        }
      }
    }

    const lot = {
        id,
        mainCompanySlug: slug,
        inventoryId,
        productId: inventoryId,
        productName: product.productName,
        dyeType: product.dyeType,
        lotNo,
        supplierName: text(body.supplierName),
        companyName: text(body.supplierName),
        invoiceNo: text(body.invoiceNo),
        documentNo: text(body.invoiceNo),
        entryKg,
        quantity: entryKg,
        usedKg: 0,
        remainingKg: entryKg,
        remainingQuantity: entryKg,
        unit: text(body.unit || product.unit || "KG"),
        warehouse: text(body.warehouse || "BOYAHANE"),
        isDefault: body.isDefault === true,
        status: text(body.status || "AVAILABLE"),
        source: text(body.source || "MANUAL"),
        createdAt: now,
      };
    const movementId=await stableStoreId("BYL-IN:",[slug,id]);
    const db=c.env.DB;
    try{
      await commitStoreBatch(db,[],[
        storeInsert(db,LOT_SCOPE,slug,id,lot,now),
        storeInsert(db,MOVEMENT_SCOPE,slug,movementId,{lotId:id,productId:inventoryId,type:"IN",quantity:entryKg,unit:lot.unit,documentNo:lot.documentNo,note:"Manuel Boyahane lot girişi",createdAt:now},now),
      ]);
    }catch{return c.json(jsonError("LOT_CREATE_CONFLICT","LOT ve ilk stok hareketi birlikte kaydedilemedi; kayıtları yenileyin."),409);}

    return c.json({
      ok: true,
      success: true,
      data: lotView(lot, new Map([[inventoryId, product]])),
    }, 201);
  });

  app.post("/api/boyahane/workflow/lots/:id/movements", async (c) => {
    const body=await bodyOf(c),slug=slugOf(c,body),id=c.req.param("id"),db=c.env.DB;
    const type=normalize(body.type || "OUT");
    const quantity=numberValue(body.quantity);
    if (!["IN","OUT","ADJUSTMENT IN","ADJUSTMENT OUT"].includes(type) || quantity<=0)
      return c.json(jsonError("INVALID_MOVEMENT","Geçerli hareket türü ve pozitif miktar zorunludur."),400);
    const movementId=body.requestId || body.id ? await stableStoreId("BYM:",[slug,text(body.requestId || body.id)]) : crypto.randomUUID();
    const payloadHash=await stableStoreId("",[id,type,quantity,text(body.recipeId),text(body.productionId),text(body.note)]);
    const duplicate=async()=>storeSnapshot(db,MOVEMENT_SCOPE,slug,movementId);
    const previous=await duplicate();
    if(previous && previous.value.payloadHash!==payloadHash) return c.json(jsonError("MOVEMENT_REQUEST_CONFLICT","Aynı hareket kimliği farklı içerikle kullanıldı."),409);
    const snapshot=await storeSnapshot(db,LOT_SCOPE,slug,id);
    if(!snapshot)return c.json(jsonError("NOT_FOUND","Firma kapsamındaki LOT bulunamadı."),404);
    const lot=snapshot.value;
    if(previous)return c.json({ok:true,success:true,data:lot,idempotent:true});
    const incoming=/(^| )IN$/.test(type);
    const rfProduct=!incoming && normalize(lot.source)==="RF PREPARED"?await storeSnapshot(db,PRODUCT_SCOPE,slug,text(lot.productId || lot.inventoryId)):null;
    if(!incoming && normalize(lot.source)==="RF PREPARED" && (rfProduct?.value.approvalStatus!=="APPROVED" || rfProduct.value.isActive===false))return c.json(jsonError("RF_APPROVAL_REQUIRED","RF ürün onayı tamamlanmamış."),409);
    const remaining=numberValue(lot.remainingKg ?? lot.remainingQuantity ?? lot.entryKg ?? lot.quantity);
    if(!incoming && (quantity>remaining || !["AVAILABLE","ACTIVE"].includes(normalize(lot.status))))
      return c.json(jsonError("INSUFFICIENT_STOCK","LOT bakiyesi yetersiz veya LOT kullanıma açık değil."),409);
    const at=new Date().toISOString(),entry=numberValue(lot.entryKg || lot.quantity)+(incoming?quantity:0),nextRemaining=remaining+(incoming?quantity:-quantity);
    const nextLot={...lot,entryKg:entry,quantity:entry,remainingKg:nextRemaining,remainingQuantity:nextRemaining,usedKg:Math.max(0,entry-nextRemaining),status:nextRemaining<=0?"DEPLETED":normalize(lot.status)==="QUARANTINE"?"QUARANTINE":normalize(lot.status)==="INACTIVE"?"INACTIVE":"AVAILABLE",updatedAt:at};
    const movement={payloadHash,lotId:id,productId:lot.productId || lot.inventoryId,type:incoming?"IN":"OUT",movementType:type,quantity,unit:lot.unit || "KG",recipeId:body.recipeId || null,productionId:body.productionId || null,note:text(body.note || "Boyahane stok hareketi"),createdAt:at};
    try {await commitStoreBatch(db,[storeGuard(db,snapshot),...(rfProduct?[storeGuard(db,rfProduct)]:[])],[storeUpdate(db,snapshot,nextLot,at),storeInsert(db,MOVEMENT_SCOPE,slug,movementId,movement,at)]);}
    catch {
      const winner=await duplicate();
      if(winner?.value.payloadHash===payloadHash) return c.json({ok:true,success:true,data:(await storeSnapshot(db,LOT_SCOPE,slug,id))?.value,idempotent:true});
      return c.json(jsonError("LOT_MOVEMENT_CONFLICT","LOT değişti veya hareket kaydedilemedi; kayıtları yenileyin."),409);
    }
    return c.json({ok:true,success:true,data:nextLot});
  });

  app.post("/api/boyahane/workflow/lots/:id/action", async(c)=>{
    const body=await bodyOf(c),slug=slugOf(c,body),id=c.req.param("id"),db=c.env.DB;
    const snapshot=await storeSnapshot(db,LOT_SCOPE,slug,id);
    if(!snapshot)return c.json(jsonError("NOT_FOUND","Firma kapsamındaki LOT bulunamadı."),404);
    const lot=snapshot.value,action=normalize(body.action),at=new Date().toISOString();
    const remaining=numberValue(lot.remainingKg ?? lot.remainingQuantity ?? lot.entryKg ?? lot.quantity);
    let next={...lot};
    const guards=[storeGuard(db,snapshot)],writes=[];
    if(action==="SET DEFAULT"){
      if(!["AVAILABLE","ACTIVE"].includes(normalize(lot.status)))return c.json(jsonError("LOT_NOT_AVAILABLE","Pasif LOT varsayılan seçilemez."),409);
      for(const row of await storeRows(c,LOT_SCOPE,slug)){
        if(text(row.id || row.fileName)===id || text(row.productId || row.inventoryId)!==text(lot.productId || lot.inventoryId) || row.isDefault!==true)continue;
        const other=await storeSnapshot(db,LOT_SCOPE,slug,text(row.id || row.fileName));
        if(!other)return c.json(jsonError("LOT_TENANT_REVIEW","Eski varsayılan LOT firma eşleştirmesi gerektiriyor."),409);
        guards.push(storeGuard(db,other));writes.push(storeUpdate(db,other,{...other.value,isDefault:false},at));
      }
      next.isDefault=true;
    }else if(action==="FINISH"){
      if(remaining>0)return c.json(jsonError("LOT_HAS_STOCK","Kalan stok sıfırlanmadan LOT kapatılamaz.",{remaining}),409);
      next={...next,status:"DEPLETED",isDefault:false};
    }else if(action==="DEACTIVATE")next={...next,status:"INACTIVE",isDefault:false};
    else if(action==="QUARANTINE")next={...next,status:"QUARANTINE",isDefault:false};
    else return c.json(jsonError("INVALID_ACTION","LOT işlemi tanınmadı."),400);
    writes.push(storeUpdate(db,snapshot,next,at));
    try{await commitStoreBatch(db,guards,writes);}catch{return c.json(jsonError("LOT_ACTION_CONFLICT","LOT başka oturumda değişti; yenileyin."),409);}
    return c.json({ok:true,success:true,data:{...next,updatedAt:at}});
  });

  app.get("/api/boyahane/stock/summary", async (c) => {
    const slug = slugOf(c);
    const products = await approvedProducts(c, slug);
    const productMap = new Map(products.map((row) => [text(row.id), row]));
    const lots = (await storeRows(c, LOT_SCOPE, slug)).map((row) =>
      lotView(row, productMap),
    );
    const movements = await storeRows(c, MOVEMENT_SCOPE, slug);
    const rows = products.map((product) => {
      const productLots = lots.filter(
        (lot) => text(lot.productId) === text(product.id),
      );
      const entryKg = productLots.reduce(
        (sum, lot) => sum + numberValue(lot.entryKg),
        0,
      );
      const remainingKg = productLots.reduce(
        (sum, lot) => sum + numberValue(lot.remainingKg),
        0,
      );
      return {
        ...product,
        lotCount: productLots.length,
        activeLotCount: productLots.filter(
          (lot) => !/DEPLETED|INACTIVE/.test(normalize(lot.status)),
        ).length,
        entryKg,
        usedKg: Math.max(0, entryKg - remainingKg),
        remainingKg,
        lowStock:
          numberValue(product.minStockKg) > 0 &&
          remainingKg <= numberValue(product.minStockKg),
      };
    });
    return c.json({
      ok: true,
      success: true,
      data: {
        summary: {
          productCount: products.length,
          approvedProductCount: products.filter(
            (row) => row.approvalStatus === "APPROVED" && row.isActive !== false,
          ).length,
          lotCount: lots.length,
          availableLotCount: lots.filter(
            (row) => normalize(row.status) === "AVAILABLE",
          ).length,
          totalEntryKg: rows.reduce((sum, row) => sum + row.entryKg, 0),
          totalUsedKg: rows.reduce((sum, row) => sum + row.usedKg, 0),
          totalRemainingKg: rows.reduce(
            (sum, row) => sum + row.remainingKg,
            0,
          ),
          lowStockCount: rows.filter((row) => row.lowStock).length,
        },
        products: rows,
        lots,
        movements,
      },
    });
  });

  app.post(
    "/api/muhasebe/belge-import/:id/boyahane-transfer-v2",
    async (c) => {
      const body = await bodyOf(c);
      const slug = slugOf(c, body);
      const documentId = c.req.param("id");
      const document = await c.env.DB.prepare(
        `SELECT * FROM documents
          WHERE id = ?
            AND (main_company_slug = ? OR main_company_slug IS NULL)
          LIMIT 1`,
      )
        .bind(documentId, slug)
        .first<Row>();
      if (!document) {
        return c.json(
          jsonError("NOT_FOUND", "Tedarikçi faturası bulunamadı."),
          404,
        );
      }

      const companyId = text(document.company_id);
      const supplier = companyId
        ? await storeGet(c, SUPPLIER_SCOPE, companyId, slug)
        : null;
      if (!supplier?.isChemicalSupplier) {
        return c.json(
          jsonError(
            "NOT_CHEMICAL_SUPPLIER",
            "Lot aktarımı yalnız boya/kimyasal tedarikçisinde kullanılabilir.",
          ),
          409,
        );
      }

      const lines = Array.isArray(body.lines) ? (body.lines as Row[]) : [];
      if (!lines.length) {
        return c.json(
          jsonError("LINES_REQUIRED", "Aktarılacak fatura kalemi bulunamadı."),
          400,
        );
      }

      const products = await approvedProducts(c, slug);
      const productMap = new Map(products.map((row) => [text(row.id), row]));
      const errors: string[] = [];
      lines.forEach((line, index) => {
        const product = productMap.get(text(line.productId));
        if (!product || product.approvalStatus !== "APPROVED" || product.isActive === false) {
          errors.push(`${index + 1}. satır: aktif onaylı Boyahane ürünü seçilmedi.`);
        }
        if (!text(line.lotNo)) errors.push(`${index + 1}. satır: lot numarası eksik.`);
        if (numberValue(line.quantity) <= 0) {
          errors.push(`${index + 1}. satır: miktar sıfır olamaz.`);
        }
      });
      if (errors.length) {
        return c.json(
          jsonError("LOT_VALIDATION_FAILED", "Lot bilgileri eksik.", errors),
          400,
        );
      }

      const existingLots = await storeRows(c, LOT_SCOPE, slug);
      const created: Row[] = [];
      for (const line of lines) {
        const lineId = text(line.lineId || line.id || crypto.randomUUID());
        const duplicate = existingLots.find(
          (lot) =>
            text(lot.documentId) === documentId &&
            text(lot.invoiceItemId) === lineId,
        );
        if (duplicate) {
          created.push({ ...duplicate, idempotent: true });
          continue;
        }

        const product = productMap.get(text(line.productId))!;
        const quantity = numberValue(line.quantity);
        const unitPrice = numberValue(line.unitPrice);
        const lotId = crypto.randomUUID();
        const now = new Date().toISOString();
        const lot = await storePut(c, LOT_SCOPE, lotId, {
          id: lotId,
          mainCompanySlug: slug,
          documentId,
          documentNo: text(document.document_no),
          invoiceItemId: lineId,
          companyId,
          companyName: text(document.company_name || supplier.companyName),
          inventoryId: product.id,
          productId: product.id,
          productName: product.productName,
          dyeType: product.dyeType,
          rawName: text(line.rawName || line.description),
          aliasName: text(line.aliasName || product.productName),
          lotNo: text(line.lotNo),
          entryKg: quantity,
          quantity,
          usedKg: 0,
          remainingKg: quantity,
          remainingQuantity: quantity,
          unit: text(line.unit || product.unit || supplier.defaultUnit || "KG"),
          warehouse: text(
            line.warehouse || supplier.defaultWarehouse || "BOYAHANE",
          ),
          productionDate: line.productionDate || null,
          expiryDate: line.expiryDate || null,
          unitCost: unitPrice,
          totalCost: numberValue(line.totalCost || quantity * unitPrice),
          isDefault: false,
          status: text(line.status || "AVAILABLE"),
          source: "SUPPLIER_INVOICE",
          createdAt: now,
        }, slug);

        const movementId = crypto.randomUUID();
        await storePut(c, MOVEMENT_SCOPE, movementId, {
          id: movementId,
          lotId,
          productId: product.id,
          type: "IN",
          quantity,
          unit: lot.unit,
          documentId,
          documentNo: text(document.document_no),
          note: "Tedarikçi faturası üzerinden Boyahane lot girişi",
          createdAt: now,
        }, slug);

        const aliasKey = `${companyId}:${normalize(line.rawName).replace(/\s+/g, "-")}`;
        await storePut(c, ALIAS_SCOPE, aliasKey, {
          id: text(line.aliasId || crypto.randomUUID()),
          companyId,
          rawName: text(line.rawName),
          normalizedRawName: normalize(line.rawName),
          aliasName: text(line.aliasName || product.productName),
          productId: product.id,
          productName: product.productName,
          unit: lot.unit,
          isActive: true,
        }, slug);

        created.push(lot);
      }

      await updateDocumentTransfer(
        c,
        documentId,
        slug,
        created.map((lot) => text(lot.id || lot.fileName)),
      );

      return c.json({
        ok: true,
        success: true,
        data: {
          status: "COMPLETED",
          lots: created,
          transferredCount: created.length,
        },
      });
    },
  );
}
