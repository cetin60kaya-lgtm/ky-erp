import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const PRODUCT_SCOPE = "BOYAHANE_APPROVED_PRODUCT";
const LOT_SCOPE = "BOYAHANE_LOT";
const MOVEMENT_SCOPE = "BOYAHANE_STOCK_MOVEMENT";
const ALIAS_SCOPE = "MUHASEBE_PRODUCT_ALIAS";
const SUPPLIER_SCOPE = "MUHASEBE_CHEMICAL_SUPPLIER";

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
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

async function storeRows(c: Context<AppEnv>, scope: string, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  )
    .bind(scope, slug)
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
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC
      LIMIT 1`,
  )
    .bind(scope, fileName, slug)
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

  // Eski lotlar kaybolmasın; ürün kartı olmayan kayıtlar kontrollü geçiş kartı alır.
  const lots = await storeRows(c, LOT_SCOPE, slug);
  for (const lot of lots) {
    const id = text(lot.productId || lot.inventoryId);
    const name = text(lot.productName);
    if (!id || !name || map.has(id)) continue;
    const migrated = productView(
      await storePut(
        c,
        PRODUCT_SCOPE,
        id,
        {
          id,
          productName: name,
          name,
          dyeType: text(lot.dyeType || "GENEL"),
          unit: text(lot.unit || "KG"),
          minStockKg: 0,
          approvalStatus: "REVIEW_REQUIRED",
          isActive: true,
          source: "LEGACY_LOT",
          createdAt: text(lot.createdAt || new Date().toISOString()),
        },
        slug,
      ),
    );
    map.set(id, migrated);
  }

  return [...map.values()].sort((a, b) =>
    text(a.productName).localeCompare(text(b.productName), "tr"),
  );
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
          approvalStatus: "APPROVED",
          isActive: body.isActive !== false,
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
    const rows = (await storeRows(c, LOT_SCOPE, slug))
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
    const lot = await storeGet(c, LOT_SCOPE, c.req.param("id"), slug);
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

    const lot = await storePut(
      c,
      LOT_SCOPE,
      id,
      {
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
      },
      slug,
    );

    const movementId = crypto.randomUUID();
    await storePut(
      c,
      MOVEMENT_SCOPE,
      movementId,
      {
        id: movementId,
        lotId: id,
        productId: inventoryId,
        type: "IN",
        quantity: entryKg,
        unit: lot.unit,
        documentNo: lot.documentNo,
        note: "Manuel Boyahane lot girişi",
        createdAt: now,
      },
      slug,
    );

    return c.json({
      ok: true,
      success: true,
      data: lotView(lot, new Map([[inventoryId, product]])),
    }, 201);
  });

  app.post("/api/boyahane/workflow/lots/:id/movements", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = c.req.param("id");
    const lot = await storeGet(c, LOT_SCOPE, id, slug);
    if (!lot) return c.json(jsonError("NOT_FOUND", "Lot bulunamadı."), 404);

    const type = normalize(body.type || "OUT");
    const quantity = numberValue(body.quantity);
    const remaining = numberValue(
      lot.remainingKg ?? lot.remainingQuantity ?? lot.entryKg ?? lot.quantity,
    );
    if (!/IN|OUT|ADJUSTMENT IN|ADJUSTMENT OUT/.test(type) || quantity <= 0) {
      return c.json(
        jsonError(
          "INVALID_MOVEMENT",
          "Geçerli hareket türü ve sıfırdan büyük miktar zorunludur.",
        ),
        400,
      );
    }

    const incoming = /(^| )IN$/.test(type);
    if (!incoming && quantity > remaining) {
      return c.json(
        jsonError("INSUFFICIENT_STOCK", "Lot bakiyesi hareket miktarından düşük.", {
          remaining,
          requested: quantity,
        }),
        409,
      );
    }

    const nextRemaining = incoming ? remaining + quantity : remaining - quantity;
    const entryKg = numberValue(lot.entryKg || lot.quantity);
    const nextLot = await storePut(c, LOT_SCOPE, id, {
      ...lot,
      entryKg: incoming ? entryKg + quantity : entryKg,
      quantity: incoming ? entryKg + quantity : entryKg,
      remainingKg: nextRemaining,
      remainingQuantity: nextRemaining,
      usedKg: Math.max(0, (incoming ? entryKg + quantity : entryKg) - nextRemaining),
      status: nextRemaining <= 0 ? "DEPLETED" : "AVAILABLE",
    }, slug);

    const movementId = crypto.randomUUID();
    await storePut(c, MOVEMENT_SCOPE, movementId, {
      id: movementId,
      lotId: id,
      productId: lot.productId || lot.inventoryId,
      type: incoming ? "IN" : "OUT",
      movementType: type,
      quantity,
      unit: lot.unit || "KG",
      recipeId: body.recipeId || null,
      productionId: body.productionId || null,
      note: text(body.note || "Boyahane stok hareketi"),
      createdAt: new Date().toISOString(),
    }, slug);

    return c.json({ ok: true, success: true, data: nextLot });
  });

  app.post("/api/boyahane/workflow/lots/:id/action", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = c.req.param("id");
    const lot = await storeGet(c, LOT_SCOPE, id, slug);
    if (!lot) return c.json(jsonError("NOT_FOUND", "Lot bulunamadı."), 404);
    const action = normalize(body.action);
    const remaining = numberValue(
      lot.remainingKg ?? lot.remainingQuantity ?? lot.entryKg ?? lot.quantity,
    );

    if (action === "SET DEFAULT") {
      const rows = await storeRows(c, LOT_SCOPE, slug);
      for (const row of rows) {
        if (
          text(row.productId || row.inventoryId) ===
            text(lot.productId || lot.inventoryId) &&
          text(row.id || row.fileName) !== id &&
          row.isDefault === true
        ) {
          await storePut(c, LOT_SCOPE, text(row.id || row.fileName), {
            ...row,
            isDefault: false,
          }, slug);
        }
      }
      const data = await storePut(c, LOT_SCOPE, id, {
        ...lot,
        isDefault: true,
      }, slug);
      return c.json({ ok: true, success: true, data });
    }

    if (action === "FINISH") {
      if (remaining > 0) {
        return c.json(
          jsonError(
            "LOT_HAS_STOCK",
            "Kalan stok sıfırlanmadan lot bitti olarak kapatılamaz.",
            { remaining },
          ),
          409,
        );
      }
      const data = await storePut(c, LOT_SCOPE, id, {
        ...lot,
        status: "DEPLETED",
        isDefault: false,
      }, slug);
      return c.json({ ok: true, success: true, data });
    }

    if (action === "DEACTIVATE") {
      const data = await storePut(c, LOT_SCOPE, id, {
        ...lot,
        status: "INACTIVE",
        isDefault: false,
      }, slug);
      return c.json({ ok: true, success: true, data });
    }

    if (action === "QUARANTINE") {
      const data = await storePut(c, LOT_SCOPE, id, {
        ...lot,
        status: "QUARANTINE",
        isDefault: false,
      }, slug);
      return c.json({ ok: true, success: true, data });
    }

    return c.json(jsonError("INVALID_ACTION", "Lot işlemi tanınmadı."), 400);
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
