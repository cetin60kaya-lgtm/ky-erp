// @ts-nocheck
import type { Context, Hono } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const LOT_SCOPE = "BOYAHANE_LOT";
const MOVEMENT_SCOPE = "BOYAHANE_STOCK_MOVEMENT";
const EXPENSE_SCOPE = "BOYAHANE_EXPENSE";
const text = (value: unknown) => value == null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const json = (value: unknown): Row => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  try {
    const parsed = JSON.parse(text(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
const slugOf = (c: Context<AppEnv>) => text(
  c.req.query("mainCompanySlug") ||
  c.req.query("mainCompanyId") ||
  c.req.header("X-KYERP-Tenant-Slug"),
);

function monthBounds(value: unknown) {
  const month = /^\d{4}-\d{2}$/.test(text(value))
    ? text(value)
    : new Date().toISOString().slice(0, 7);
  const [year, monthNo] = month.split("-").map(Number);
  const from = `${month}-01T00:00:00.000Z`;
  const next = new Date(Date.UTC(year, monthNo, 1)).toISOString();
  return { month, from, next };
}

async function rows(c: Context<AppEnv>, scope: string, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT id,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY created_at,id`,
  ).bind(scope, slug).all<Row>();
  return (result.results || []).map((row) => ({
    ...json(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(json(row.data).createdAt || row.created_at),
    updatedAt: text(json(row.data).updatedAt || row.updated_at),
  }));
}

function movementDate(row: Row) {
  return text(row.movementDate || row.date || row.usedAt || row.createdAt || row.created_at);
}

export function classifyBoyahaneMovement(row: Row) {
  const type = upper(row.movementType || row.type);
  const note = upper(`${row.reason || ""} ${row.consumptionReason || ""} ${row.note || ""} ${row.description || ""}`);
  const incoming = /(^|_)IN$|RECEIPT|PURCHASE_IN|GIRIS/.test(type) && !/OUT/.test(type);
  if (incoming) return "RECEIPT";
  if (/RETURN|IADE/.test(type) || /IADE/.test(note)) return "RETURN";
  if (/FIRE|FIRE|WASTE|HURDA/.test(note)) return "WASTE";
  if (/NUMUNE|SAMPLE|TEST/.test(note)) return "SAMPLE";
  if (/DUZELT|DÜZELT|CORRECTION|ADJUSTMENT/.test(type) || /DUZELT|DÜZELT|CORRECTION/.test(note)) return "ADJUSTMENT";
  if (text(row.productionId) || text(row.recipeId) || /URETIM|ÜRETIM|PRODUCTION|RECIPE|RECETE|REÇETE/.test(note)) return "PRODUCTION";
  if (/OUT|CIKIS|ÇIKIŞ|CONSUM/.test(type)) return "OTHER_CONSUMPTION";
  return "OTHER";
}

function movementQuantity(row: Row) {
  return Math.max(0, num(row.quantityKg || row.quantity || row.amountKg || row.usedQuantity));
}

function lotUnitCost(lot: Row) {
  const explicit = num(lot.unitCost || lot.unitPrice);
  if (explicit > 0) return explicit;
  const financial = Array.isArray(lot.financialDocuments) ? lot.financialDocuments : [];
  const q = financial.reduce((sum: number, row: Row) => sum + Math.max(0, num(row.quantity)), 0);
  const total = financial.reduce((sum: number, row: Row) => sum + num(row.totalAmount), 0);
  return q > 0 ? total / q : 0;
}

function expenseDate(row: Row) {
  return text(row.expenseDate || row.date || row.createdAt || row.created_at);
}

export function registerBoyahaneLotReportingRoutes(app: Hono<AppEnv>) {
  const handler = async (c: Context<AppEnv>) => {
    const slug = slugOf(c);
    const bounds = monthBounds(c.req.query("month"));
    const [lots, movements, expenses] = await Promise.all([
      rows(c, LOT_SCOPE, slug),
      rows(c, MOVEMENT_SCOPE, slug),
      rows(c, EXPENSE_SCOPE, slug).catch(() => []),
    ]);
    const movementsByLot = new Map<string, Row[]>();
    for (const movement of movements) {
      const lotId = text(movement.lotId);
      if (!lotId) continue;
      const list = movementsByLot.get(lotId) || [];
      list.push(movement);
      movementsByLot.set(lotId, list);
    }

    const lotRows = lots.map((lot) => {
      const lotId = text(lot.id || lot.fileName || lot.storeId);
      const unitCost = lotUnitCost(lot);
      const all = movementsByLot.get(lotId) || [];
      const before = all.filter((row) => movementDate(row) && movementDate(row) < bounds.from);
      const current = all.filter((row) => {
        const date = movementDate(row);
        return date && date >= bounds.from && date < bounds.next;
      });
      const signed = (row: Row) => classifyBoyahaneMovement(row) === "RECEIPT"
        ? movementQuantity(row)
        : -movementQuantity(row);
      const openingQty = before.reduce((sum, row) => sum + signed(row), 0);
      const byCategory = (category: string) => current
        .filter((row) => classifyBoyahaneMovement(row) === category)
        .reduce((sum, row) => sum + movementQuantity(row), 0);
      const receiptQty = byCategory("RECEIPT");
      const productionQty = byCategory("PRODUCTION");
      const wasteQty = byCategory("WASTE");
      const sampleQty = byCategory("SAMPLE");
      const adjustmentQty = byCategory("ADJUSTMENT");
      const returnQty = byCategory("RETURN");
      const otherConsumptionQty = byCategory("OTHER_CONSUMPTION");
      const monthNet = current.reduce((sum, row) => sum + signed(row), 0);
      let closingQty = openingQty + monthNet;

      // Legacy lots may predate complete movement history. Current lot balance is
      // the fallback only for the current month, never used to manufacture past history.
      const todayMonth = new Date().toISOString().slice(0, 7);
      const currentBalance = num(lot.remainingKg ?? lot.remainingQuantity);
      const historyIncomplete = !all.length && num(lot.entryKg || lot.quantity) > 0;
      if (historyIncomplete && bounds.month === todayMonth) closingQty = currentBalance;

      const consumedQty = productionQty + wasteQty + sampleQty + adjustmentQty + returnQty + otherConsumptionQty;
      return {
        lotId,
        lotNo: text(lot.lotNo),
        productId: text(lot.productId || lot.inventoryId),
        productName: text(lot.productName),
        supplierCompanyId: text(lot.supplierCompanyId || lot.companyId) || null,
        supplierName: text(lot.supplierName || lot.companyName),
        warehouse: text(lot.warehouse || "BOYAHANE"),
        unit: text(lot.unit || "KG"),
        status: text(lot.status || (closingQty <= 0 ? "DEPLETED" : "AVAILABLE")),
        openingQty,
        receiptQty,
        productionQty,
        wasteQty,
        sampleQty,
        adjustmentQty,
        returnQty,
        otherConsumptionQty,
        consumedQty,
        closingQty,
        unitCost,
        openingValue: openingQty * unitCost,
        receiptValue: receiptQty * unitCost,
        productionCost: productionQty * unitCost,
        wasteCost: wasteQty * unitCost,
        sampleCost: sampleQty * unitCost,
        adjustmentCost: adjustmentQty * unitCost,
        returnCost: returnQty * unitCost,
        otherConsumptionCost: otherConsumptionQty * unitCost,
        consumedCost: consumedQty * unitCost,
        closingValue: closingQty * unitCost,
        historyIncomplete,
        financialDocuments: Array.isArray(lot.financialDocuments) ? lot.financialDocuments : [],
      };
    });

    const products = new Map<string, Row>();
    for (const lot of lotRows) {
      const key = lot.productId || lot.productName || "UNKNOWN";
      const row = products.get(key) || {
        productId: lot.productId || null,
        productName: lot.productName || "Tanımsız Ürün",
        openingQty: 0,
        receiptQty: 0,
        productionQty: 0,
        wasteQty: 0,
        sampleQty: 0,
        adjustmentQty: 0,
        returnQty: 0,
        otherConsumptionQty: 0,
        consumedQty: 0,
        closingQty: 0,
        consumedCost: 0,
        closingValue: 0,
        lotCount: 0,
        depletedLotCount: 0,
      };
      for (const field of ["openingQty","receiptQty","productionQty","wasteQty","sampleQty","adjustmentQty","returnQty","otherConsumptionQty","consumedQty","closingQty","consumedCost","closingValue"]) row[field] += num(lot[field]);
      row.lotCount += 1;
      if (lot.closingQty <= 0 || upper(lot.status) === "DEPLETED") row.depletedLotCount += 1;
      products.set(key, row);
    }

    const monthExpenses = expenses.filter((row) => {
      const date = expenseDate(row);
      return date && date >= bounds.from && date < bounds.next;
    });
    const generalExpenseTotal = monthExpenses.reduce((sum, row) => sum + num(row.amount || row.totalAmount || row.total), 0);
    const totals = lotRows.reduce((acc, lot) => {
      for (const field of ["openingQty","receiptQty","productionQty","wasteQty","sampleQty","adjustmentQty","returnQty","otherConsumptionQty","consumedQty","closingQty","openingValue","receiptValue","productionCost","wasteCost","sampleCost","adjustmentCost","returnCost","otherConsumptionCost","consumedCost","closingValue"]) acc[field] += num(lot[field]);
      return acc;
    }, {openingQty:0,receiptQty:0,productionQty:0,wasteQty:0,sampleQty:0,adjustmentQty:0,returnQty:0,otherConsumptionQty:0,consumedQty:0,closingQty:0,openingValue:0,receiptValue:0,productionCost:0,wasteCost:0,sampleCost:0,adjustmentCost:0,returnCost:0,otherConsumptionCost:0,consumedCost:0,closingValue:0} as Row);

    return c.json({
      ok: true,
      success: true,
      data: {
        month: bounds.month,
        totals: {
          ...totals,
          materialExpenseRecognized: totals.consumedCost,
          inventoryAssetClosing: totals.closingValue,
          generalExpenseTotal,
          totalOperationalCost: totals.consumedCost + generalExpenseTotal,
        },
        products: [...products.values()].sort((a, b) => text(a.productName).localeCompare(text(b.productName), "tr")),
        lots: lotRows.sort((a, b) => text(a.productName).localeCompare(text(b.productName), "tr") || text(a.lotNo).localeCompare(text(b.lotNo), "tr")),
        depletedLots: lotRows.filter((row) => row.closingQty <= 0 || upper(row.status) === "DEPLETED"),
        generalExpenses: monthExpenses,
        warnings: lotRows.some((row) => row.historyIncomplete)
          ? ["Bazı eski LOT kayıtlarında geçmiş hareket zinciri eksik; yalnız mevcut ay kapanış bakiyesi mevcut stoktan gösterildi."]
          : [],
      },
    });
  };

  app.get("/api/boyahane/reports/lot-monthly", handler);
  app.get("/api/e-belge/reports/boyahane-lot-monthly", handler);
}
