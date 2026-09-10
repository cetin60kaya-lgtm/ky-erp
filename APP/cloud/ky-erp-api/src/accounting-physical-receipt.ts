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
  return {
    key: `${text(doc.id)}:${text(line.id)}`,
    documentId: text(doc.id),
    documentNo: text(doc.document_no || doc.documentNo),
    documentLineId: text(line.id),
    quantity: numberValue(args.financialAllocatedQuantity ?? line.quantity),
    unitPrice: numberValue(line.unit_price || line.unitPrice),
    totalAmount: numberValue(args.financialAllocatedTotal ?? line.line_total || line.lineTotal),
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
    existingMovement = movements.find((row) =>
      row.provisionalPhysicalReceipt === true &&
      text(row.productId || row.inventoryId) === productId &&
      normalizeLotNo(row.lotNo) === normalizeLotNo(lotNo) &&
      Math.abs(numberValue(row.quantity || row.amountKg) - quantity) <= 0.0005 &&
      (!supplierCompanyId || !text(row.supplierCompanyId) || text(row.supplierCompanyId) === supplierCompanyId),
    );
    if (existingMovement) {
      const movementFile = text(existingMovement.fileName || existingMovement.id);
      await storePut(c, "BOYAHANE_STOCK_MOVEMENT", movementFile, {
        ...existingMovement,
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

  const nextFinancial = financialAllocation(args);
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
  },
) {
  if (!(await tableExists(c, "stock_movements"))) {
    return { created: false, unavailable: true };
  }
  const doc = args.physicalDocument;
  const line = args.physicalLine;
  const physicalDocumentId = text(doc.id);
  const physicalLineId = text(line.id);
  const quantity = numberValue(line.quantity);
  if (!physicalDocumentId || !physicalLineId || !text(args.productId) || quantity <= 0) {
    throw Object.assign(new Error("Fiziksel stok hareketi kimliği veya miktarı eksik."), {
      code: "PHYSICAL_RECEIPT_INVALID",
    });
  }
  const existing = await c.env.DB.prepare(
    `SELECT id FROM stock_movements
      WHERE main_company_slug=? AND document_line_id=? AND movement_type='PURCHASE_IN'
      LIMIT 1`,
  ).bind(slug, physicalLineId).first<Row>();
  if (existing?.id) return { created: false, idempotent: true, movementId: text(existing.id) };

  const columns = await tableColumns(c, "stock_movements");
  const data: Row = {
    id: crypto.randomUUID(),
    main_company_slug: slug,
    product_id: text(args.productId),
    firm_id: text(doc.party_company_id || doc.partyCompanyId) || null,
    document_id: physicalDocumentId,
    document_line_id: physicalLineId,
    movement_type: "PURCHASE_IN",
    source_type: text(args.sourceType) || (args.provisional ? "CANONICAL_INVOICE_PROVISIONAL" : "CANONICAL_DISPATCH"),
    date: text(doc.issue_date || doc.issueDate) || now(),
    quantity,
    unit: text(line.unit_code || line.unitCode),
    unit_price: numberValue(args.financialLine?.unit_price || args.financialLine?.unitPrice),
    total_amount: numberValue(args.financialLine?.line_total || args.financialLine?.lineTotal),
    lot_no: text(args.lotNo) || null,
    note: `${text(doc.document_no || doc.documentNo) || "Belge"} fiziksel stok girişi`,
    active: 1,
    raw: {
      eBelge: true,
      physicalReceipt: true,
      provisional: args.provisional === true,
      financialDocumentId: text(args.financialDocument?.id) || null,
      financialDocumentLineId: text(args.financialLine?.id) || null,
    },
    created_at: now(),
    updated_at: now(),
  };
  const entries = Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined);
  await c.env.DB.prepare(
    `INSERT INTO stock_movements(${entries.map(([key]) => `"${key}"`).join(",")})
     VALUES(${entries.map(() => "?").join(",")})`,
  ).bind(...entries.map(([, value]) => typeof value === "object" && value !== null ? JSON.stringify(value) : value)).run();
  return { created: true, idempotent: false, movementId: text(data.id) };
}
