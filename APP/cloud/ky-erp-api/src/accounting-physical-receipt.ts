// @ts-nocheck
import type { Context } from "hono";
import { normalizeLotNo } from "./accounting-lot-reconciliation-core";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
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

async function storeRows(c: Context<AppEnv>, scope: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return [];
  const rows = await c.env.DB.prepare(
    `SELECT id,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC,id DESC`,
  ).bind(scope, slug).all<Row>();
  return (rows.results || []).map((row) => ({
    ...json(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
  }));
}

async function storePut(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  data: Row,
  slug: string,
) {
  const existing = await c.env.DB.prepare(
    `SELECT id,data FROM json_store
      WHERE scope=? AND file_name=?
        AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(scope, fileName, slug).first<Row>();
  const ts = now();
  const payload = { ...data, updatedAt: ts };
  if (existing?.id) {
    await c.env.DB.prepare(
      `UPDATE json_store SET data=?,main_company_slug=COALESCE(main_company_slug,?),updated_at=? WHERE id=?`,
    ).bind(JSON.stringify(payload), slug, ts, existing.id).run();
    return { ...payload, storeId: existing.id, fileName };
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?)`,
  ).bind(id, scope, slug, fileName, JSON.stringify({ ...payload, createdAt: payload.createdAt || ts }), ts, ts).run();
  return { ...payload, storeId: id, fileName };
}

function financialAllocation(args: Row) {
  const doc = args.financialDocument;
  const line = args.financialLine;
  if (!doc || !line) return null;
  const lineQty = Math.max(0, numberValue(line.quantity));
  const physicalQty = Math.max(0, numberValue(args.physicalLine?.quantity));
  const allocatedQuantity = Math.max(
    0,
    numberValue(
      args.financialAllocatedQuantity ??
      (lineQty > 0 && physicalQty > 0 ? Math.min(lineQty, physicalQty) : lineQty),
    ),
  );
  const lineTotal = numberValue(line.line_total || line.lineTotal);
  const allocatedTotal = args.financialAllocatedTotal !== undefined
    ? numberValue(args.financialAllocatedTotal)
    : lineQty > 0
      ? lineTotal * (allocatedQuantity / lineQty)
      : lineTotal;
  return {
    key: `${text(doc.id)}:${text(line.id)}`,
    documentId: text(doc.id),
    documentNo: text(doc.document_no || doc.documentNo),
    documentLineId: text(line.id),
    quantity: allocatedQuantity,
    unitPrice: allocatedQuantity > 0 ? allocatedTotal / allocatedQuantity : numberValue(line.unit_price || line.unitPrice),
    totalAmount: allocatedTotal,
    currency: text(doc.currency) || "TRY",
    issueDate: text(doc.issue_date || doc.issueDate) || null,
  };
}

function mergeFinancialAllocations(existing: unknown, next: Row | null) {
  const rows = Array.isArray(existing) ? existing.filter(Boolean).map((row) => ({ ...row })) : [];
  if (!next?.key) return rows;
  const index = rows.findIndex((row) => text(row.key) === text(next.key));
  if (index >= 0) rows[index] = { ...rows[index], ...next };
  else rows.push(next);
  return rows;
}

function costSummary(rows: Row[]) {
  const quantity = rows.reduce((sum, row) => sum + Math.max(0, numberValue(row.quantity)), 0);
  const total = rows.reduce((sum, row) => sum + numberValue(row.totalAmount), 0);
  return {
    costedQuantity: quantity,
    totalCost: total,
    unitCost: quantity > 0 ? total / quantity : 0,
  };
}

export async function recordBoyahanePhysicalReceipt(
  c: Context<AppEnv>,
  slug: string,
  args: {
    physicalDocument: Row;
    physicalLine: Row;
    product: Row;
    lotNo: string;
    supplierCompanyId?: string;
    sourceType?: string;
    provisional?: boolean;
    financialDocument?: Row | null;
    financialLine?: Row | null;
    financialAllocatedQuantity?: number;
    financialAllocatedTotal?: number;
  },
) {
  const doc = args.physicalDocument;
  const line = args.physicalLine;
  const product = args.product;
  const productId = text(product.id);
  const lotNo = text(args.lotNo);
  const quantity = numberValue(line.quantity);
  const supplierCompanyId = text(args.supplierCompanyId || doc.party_company_id || doc.partyCompanyId);
  const physicalDocumentId = text(doc.id);
  const physicalLineId = text(line.id);
  if (!productId || !physicalDocumentId || !physicalLineId || quantity <= 0) {
    throw Object.assign(new Error("Fiziksel stok girişi için ürün, belge satırı ve miktar zorunludur."), {
      code: "PHYSICAL_RECEIPT_INVALID",
    });
  }
  if (!lotNo) {
    throw Object.assign(new Error("Boyahane fiziksel stok girişi için LOT zorunludur."), {
      code: "LOT_REQUIRED",
    });
  }

  const movements = await storeRows(c, "BOYAHANE_STOCK_MOVEMENT", slug);
  const canonicalMovementKey = `ebelge-physical:${physicalDocumentId}:${physicalLineId}`;
  const legacyMovementKey = `ebelge:${physicalDocumentId}:${physicalLineId}`;
  let existingMovement = movements.find((row) =>
    text(row.fileName) === canonicalMovementKey ||
    text(row.fileName) === legacyMovementKey ||
    (text(row.physicalDocumentId || row.documentId) === physicalDocumentId &&
      text(row.physicalDocumentLineId || row.documentLineId) === physicalLineId),
  );

  const lots = await storeRows(c, "BOYAHANE_LOT", slug);
  let existingLot = lots.find((row) =>
    text(row.productId || row.inventoryId) === productId &&
    normalizeLotNo(row.lotNo) === normalizeLotNo(lotNo) &&
    (!supplierCompanyId || !text(row.supplierCompanyId || row.companyId) ||
      text(row.supplierCompanyId || row.companyId) === supplierCompanyId),
  );

  // Invoice-only provisional receipt can later be claimed by the real dispatch.
  if (!existingMovement && !args.provisional) {
    const provisionalCandidates = movements.filter((row) =>
      row.provisionalPhysicalReceipt === true &&
      text(row.productId || row.inventoryId) === productId &&
      normalizeLotNo(row.lotNo) === normalizeLotNo(lotNo) &&
      (!supplierCompanyId || !text(row.supplierCompanyId) || text(row.supplierCompanyId) === supplierCompanyId),
    );
    if (provisionalCandidates.length > 1) {
      throw Object.assign(new Error("Aynı ürün/LOT için birden fazla geçici fiziksel giriş var; irsaliye eşleştirmesi kullanıcı kontrolü gerektiriyor."), {
        code: "PROVISIONAL_RECEIPT_AMBIGUOUS",
      });
    }
    existingMovement = provisionalCandidates[0];
    if (existingMovement) {
      const movementFile = text(existingMovement.fileName || existingMovement.id);
      const oldQuantity = numberValue(existingMovement.quantity || existingMovement.amountKg);
      const delta = quantity - oldQuantity;
      const lotId = text(existingMovement.lotId) || text(existingLot?.id || existingLot?.fileName);
      const lot = existingLot || lots.find((row) => text(row.id || row.fileName) === lotId);
      if (lot && Math.abs(delta) > 0.0005) {
        const entryBefore = numberValue(lot.entryKg || lot.quantity);
        const remainingBefore = numberValue(lot.remainingKg ?? lot.remainingQuantity ?? entryBefore);
        if (remainingBefore + delta < -0.0005) {
          throw Object.assign(new Error("Gerçek irsaliye miktarı, geçici stoktan yapılan tüketim nedeniyle geriye doğru düzeltilemiyor."), {
            code: "PROVISIONAL_QUANTITY_CONFLICT",
          });
        }
        existingLot = await storePut(c, "BOYAHANE_LOT", lotId, {
          ...lot,
          entryKg: entryBefore + delta,
          quantity: entryBefore + delta,
          remainingKg: remainingBefore + delta,
          remainingQuantity: remainingBefore + delta,
          status: remainingBefore + delta <= 0.0005 ? "DEPLETED" : "AVAILABLE",
          provisionalQuantityAdjustedAt: now(),
        }, slug);
      }
      await storePut(c, "BOYAHANE_STOCK_MOVEMENT", movementFile, {
        ...existingMovement,
        quantity,
        amountKg: quantity,
        physicalDocumentId,
        physicalDocumentLineId: physicalLineId,
        linkedDispatchDocumentId: physicalDocumentId,
        linkedDispatchLineId: physicalLineId,
        provisionalPhysicalReceipt: false,
        sourceType: text(args.sourceType) || "E_BELGE_DISPATCH",
        reconciledAt: now(),
      }, slug);
    }
  }

  const nextFinancial = financialAllocation({ ...args, physicalLine: line });
  if (existingMovement) {
    const lotId = text(existingMovement.lotId) || text(existingLot?.id || existingLot?.fileName);
    if (lotId) {
      const lot = existingLot || lots.find((row) => text(row.id || row.fileName) === lotId);
      if (lot) {
        const financialDocuments = mergeFinancialAllocations(lot.financialDocuments, nextFinancial);
        const costs = costSummary(financialDocuments);
        existingLot = await storePut(c, "BOYAHANE_LOT", lotId, {
          ...lot,
          financialDocuments,
          ...costs,
          invoiceNo: nextFinancial?.documentNo || lot.invoiceNo || "",
          lastFinancialUpdateAt: nextFinancial ? now() : lot.lastFinancialUpdateAt || null,
        }, slug);
      }
    }
    return {
      lotId: text(existingLot?.id || existingLot?.fileName || existingMovement.lotId),
      created: false,
      movementCreated: false,
      idempotent: true,
      provisionalReconciled: !args.provisional && existingMovement.provisionalPhysicalReceipt === true,
    };
  }

  const lotId = text(existingLot?.id || existingLot?.fileName) || crypto.randomUUID();
  const entryBefore = numberValue(existingLot?.entryKg || existingLot?.quantity);
  const remainingBefore = numberValue(
    existingLot?.remainingKg ?? existingLot?.remainingQuantity ?? entryBefore,
  );
  const financialDocuments = mergeFinancialAllocations(existingLot?.financialDocuments, nextFinancial);
  const costs = costSummary(financialDocuments);
  const lineRaw = json(line.raw_metadata || line.rawMetadata);
  const lot = await storePut(c, "BOYAHANE_LOT", lotId, {
    ...existingLot,
    id: lotId,
    inventoryId: productId,
    productId,
    productName: text(product.name || product.productName),
    dyeType: text(product.dyeType || json(product.raw).dyeType || "GENEL"),
    lotNo,
    supplierName: text(doc.party_name || doc.partyName),
    companyName: text(doc.party_name || doc.partyName),
    supplierCompanyId: supplierCompanyId || null,
    entryKg: entryBefore + quantity,
    quantity: entryBefore + quantity,
    usedKg: numberValue(existingLot?.usedKg),
    remainingKg: remainingBefore + quantity,
    remainingQuantity: remainingBefore + quantity,
    unit: text(line.unit_code || line.unitCode || lineRaw.correctedUnitCode || product.unit || "KG"),
    financialDocuments,
    ...costs,
    invoiceNo: nextFinancial?.documentNo || existingLot?.invoiceNo || "",
    warehouse: text(lineRaw.warehouse) || "BOYAHANE",
    productionDate: text(lineRaw.productionDate) || existingLot?.productionDate || null,
    expiryDate: text(lineRaw.expiryDate) || existingLot?.expiryDate || null,
    status: "AVAILABLE",
    source: text(args.sourceType) || (args.provisional ? "E_BELGE_INVOICE_PROVISIONAL" : "E_BELGE_DISPATCH"),
    firstPhysicalDocumentId: existingLot?.firstPhysicalDocumentId || physicalDocumentId,
    lastPhysicalDocumentId: physicalDocumentId,
    lastEntryAt: now(),
  }, slug);

  await storePut(c, "BOYAHANE_STOCK_MOVEMENT", canonicalMovementKey, {
    id: canonicalMovementKey,
    inventoryId: productId,
    productId,
    productName: text(product.name || product.productName),
    lotId,
    lotNo,
    type: "IN",
    movementType: "IN",
    quantity,
    amountKg: quantity,
    unit: lot.unit,
    warehouse: lot.warehouse,
    physicalDocumentId,
    physicalDocumentLineId: physicalLineId,
    documentId: physicalDocumentId,
    documentLineId: physicalLineId,
    documentNo: text(doc.document_no || doc.documentNo),
    supplierCompanyId: supplierCompanyId || null,
    supplierName: text(doc.party_name || doc.partyName),
    sourceType: text(args.sourceType) || (args.provisional ? "E_BELGE_INVOICE_PROVISIONAL" : "E_BELGE_DISPATCH"),
    provisionalPhysicalReceipt: args.provisional === true,
    movementDate: text(doc.issue_date || doc.issueDate) || now(),
    createdAt: now(),
  }, slug);

  return {
    lotId,
    created: !existingLot,
    movementCreated: true,
    idempotent: false,
    provisional: args.provisional === true,
  };
}

export async function recordGenericPhysicalReceipt(
  c: Context<AppEnv>,
  slug: string,
  args: {
    physicalDocument: Row;
    physicalLine: Row;
    productId: string;
    lotNo?: string;
    sourceType?: string;
    provisional?: boolean;
    financialDocument?: Row | null;
    financialLine?: Row | null;
    financialAllocatedQuantity?: number;
    financialAllocatedTotal?: number;
  },
) {
  if (!(await tableExists(c, "stock_movements"))) {
    return { created: false, unavailable: true };
  }
  const doc = args.physicalDocument;
  const line = args.physicalLine;
  const physicalDocumentId = text(doc.id);
  const physicalLineId = text(line.id);
  const productId = text(args.productId);
  const quantity = numberValue(line.quantity);
  const supplierId = text(doc.party_company_id || doc.partyCompanyId || args.financialDocument?.party_company_id);
  if (!physicalDocumentId || !physicalLineId || !productId || quantity <= 0) {
    throw Object.assign(new Error("Fiziksel stok hareketi kimliği veya miktarı eksik."), {
      code: "PHYSICAL_RECEIPT_INVALID",
    });
  }

  const columns = await tableColumns(c, "stock_movements");
  let existing = await c.env.DB.prepare(
    `SELECT * FROM stock_movements
      WHERE main_company_slug=? AND document_line_id=? AND movement_type='PURCHASE_IN'
      LIMIT 1`,
  ).bind(slug, physicalLineId).first<Row>();
  let provisionalReconciled = false;

  if (!existing && !args.provisional && columns.has("product_id")) {
    const result = await c.env.DB.prepare(
      `SELECT * FROM stock_movements
        WHERE main_company_slug=? AND product_id=? AND movement_type='PURCHASE_IN'
        ORDER BY created_at DESC LIMIT 100`,
    ).bind(slug, productId).all<Row>();
    const candidates = (result.results || []).filter((row) => {
      const raw = json(row.raw);
      if (raw.provisional !== true) return false;
      if (columns.has("active") && Number(row.active ?? 1) === 0) return false;
      if (supplierId && text(row.firm_id) && text(row.firm_id) !== supplierId) return false;
      const rowLot = normalizeLotNo(row.lot_no || raw.lotNo);
      const wantedLot = normalizeLotNo(args.lotNo);
      if (rowLot && wantedLot && rowLot !== wantedLot) return false;
      return true;
    });
    if (candidates.length > 1) {
      throw Object.assign(new Error("Aynı ürün için birden fazla geçici stok girişi var; gerçek irsaliye otomatik bağlanamadı."), {
        code: "PROVISIONAL_RECEIPT_AMBIGUOUS",
      });
    }
    if (candidates.length === 1) {
      existing = candidates[0];
      const raw = json(existing.raw);
      const updates: Row = {
        document_id: physicalDocumentId,
        document_line_id: physicalLineId,
        source_type: text(args.sourceType) || "CANONICAL_DISPATCH",
        quantity,
        unit: text(line.unit_code || line.unitCode || existing.unit),
        lot_no: text(args.lotNo || existing.lot_no) || null,
        raw: {
          ...raw,
          provisional: false,
          linkedDispatchDocumentId: physicalDocumentId,
          linkedDispatchLineId: physicalLineId,
          provisionalQuantity: numberValue(existing.quantity),
          reconciledQuantity: quantity,
          reconciledAt: now(),
        },
        updated_at: now(),
      };
      const entries = Object.entries(updates).filter(([key]) => columns.has(key));
      if (entries.length) {
        await c.env.DB.prepare(
          `UPDATE stock_movements SET ${entries.map(([key]) => `"${key}"=?`).join(",")} WHERE id=? AND main_company_slug=?`,
        ).bind(
          ...entries.map(([, value]) => typeof value === "object" && value !== null ? JSON.stringify(value) : value),
          existing.id,
          slug,
        ).run();
      }
      existing = { ...existing, ...updates };
      provisionalReconciled = true;
    }
  }

  const nextFinancial = financialAllocation({ ...args, physicalLine: line });
  if (existing?.id) {
    if (nextFinancial) {
      const raw = json(existing.raw);
      const financialDocuments = mergeFinancialAllocations(raw.financialDocuments, nextFinancial);
      const costs = costSummary(financialDocuments);
      const updates: Row = {
        unit_price: costs.unitCost,
        total_amount: costs.totalCost,
        raw: {
          ...raw,
          financialDocuments,
          costedQuantity: costs.costedQuantity,
          totalCost: costs.totalCost,
          unitCost: costs.unitCost,
          latestFinancialDocumentId: nextFinancial.documentId,
          latestFinancialDocumentLineId: nextFinancial.documentLineId,
          latestFinancialDocumentNo: nextFinancial.documentNo,
          costUpdatedAt: now(),
          provisional: args.provisional === true ? true : raw.provisional === true && !provisionalReconciled,
        },
        updated_at: now(),
      };
      const entries = Object.entries(updates).filter(([key]) => columns.has(key));
      if (entries.length) {
        await c.env.DB.prepare(
          `UPDATE stock_movements SET ${entries.map(([key]) => `"${key}"=?`).join(",")} WHERE id=? AND main_company_slug=?`,
        ).bind(
          ...entries.map(([, value]) => typeof value === "object" && value !== null ? JSON.stringify(value) : value),
          existing.id,
          slug,
        ).run();
      }
    }
    return { created: false, idempotent: true, movementId: text(existing.id), provisionalReconciled };
  }

  const financialDocuments = mergeFinancialAllocations([], nextFinancial);
  const costs = costSummary(financialDocuments);
  const data: Row = {
    id: crypto.randomUUID(),
    main_company_slug: slug,
    product_id: productId,
    firm_id: supplierId || null,
    document_id: physicalDocumentId,
    document_line_id: physicalLineId,
    movement_type: "PURCHASE_IN",
    source_type: text(args.sourceType) || (args.provisional ? "CANONICAL_INVOICE_PROVISIONAL" : "CANONICAL_DISPATCH"),
    date: text(doc.issue_date || doc.issueDate) || now(),
    quantity,
    unit: text(line.unit_code || line.unitCode),
    unit_price: costs.unitCost || numberValue(args.financialLine?.unit_price || args.financialLine?.unitPrice),
    total_amount: costs.totalCost || numberValue(args.financialLine?.line_total || args.financialLine?.lineTotal),
    lot_no: text(args.lotNo) || null,
    note: `${text(doc.document_no || doc.documentNo) || "Belge"} fiziksel stok girişi`,
    active: 1,
    raw: {
      eBelge: true,
      physicalReceipt: true,
      provisional: args.provisional === true,
      physicalDocumentId,
      physicalDocumentLineId: physicalLineId,
      financialDocuments,
      costedQuantity: costs.costedQuantity,
      totalCost: costs.totalCost,
      unitCost: costs.unitCost,
      financialDocumentId: nextFinancial?.documentId || null,
      financialDocumentLineId: nextFinancial?.documentLineId || null,
    },
    created_at: now(),
    updated_at: now(),
  };
  const entries = Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined);
  await c.env.DB.prepare(
    `INSERT INTO stock_movements(${entries.map(([key]) => `"${key}"`).join(",")})
     VALUES(${entries.map(() => "?").join(",")})`,
  ).bind(...entries.map(([, value]) => typeof value === "object" && value !== null ? JSON.stringify(value) : value)).run();
  return { created: true, idempotent: false, movementId: text(data.id), provisional: args.provisional === true };
}
