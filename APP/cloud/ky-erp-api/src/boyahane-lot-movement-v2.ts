// @ts-nocheck
import type { Context, Hono } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const LOT_SCOPE = "BOYAHANE_LOT";
const MOVEMENT_SCOPE = "BOYAHANE_STOCK_MOVEMENT";
const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const num = (value: unknown) => {
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
const slugOf = (c: Context<AppEnv>, body: Row = {}) => text(
  body.mainCompanySlug || body.main_company_slug || body.mainCompanyId ||
  c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") ||
  c.req.header("X-KYERP-Tenant-Slug"),
);

export type BoyahaneLotMovementReason =
  | "PRODUCTION"
  | "SAMPLE"
  | "FIRE"
  | "RETURN"
  | "OUT"
  | "IN"
  | "ADJUSTMENT_OUT"
  | "ADJUSTMENT_IN"
  | "CORRECTION_OUT"
  | "CORRECTION_IN";

export function normalizeBoyahaneMovementReason(value: unknown): BoyahaneLotMovementReason | null {
  const raw = upper(value).replace(/\s+/g, "_");
  const aliases: Record<string, BoyahaneLotMovementReason> = {
    PRODUCTION: "PRODUCTION", URETIM: "PRODUCTION", "ÜRETİM": "PRODUCTION",
    SAMPLE: "SAMPLE", NUMUNE: "SAMPLE", TEST: "SAMPLE",
    FIRE: "FIRE", "FİRE": "FIRE", WASTE: "FIRE", HURDA: "FIRE",
    RETURN: "RETURN", IADE: "RETURN", "İADE": "RETURN",
    OUT: "OUT", CIKIS: "OUT", "ÇIKIŞ": "OUT",
    IN: "IN", GIRIS: "IN", "GİRİŞ": "IN",
    ADJUSTMENT_OUT: "ADJUSTMENT_OUT", SAYIM_EKSIGI: "ADJUSTMENT_OUT", "SAYIM_EKSİĞİ": "ADJUSTMENT_OUT",
    ADJUSTMENT_IN: "ADJUSTMENT_IN", SAYIM_FAZLASI: "ADJUSTMENT_IN",
    CORRECTION_OUT: "CORRECTION_OUT", DUZELTME_CIKIS: "CORRECTION_OUT", "DÜZELTME_ÇIKIŞ": "CORRECTION_OUT",
    CORRECTION_IN: "CORRECTION_IN", DUZELTME_GIRIS: "CORRECTION_IN", "DÜZELTME_GİRİŞ": "CORRECTION_IN",
  };
  return aliases[raw] || null;
}

export function movementDirection(reason: BoyahaneLotMovementReason) {
  return ["IN", "ADJUSTMENT_IN", "CORRECTION_IN"].includes(reason) ? "IN" : "OUT";
}

function lotUnitCost(lot: Row) {
  const explicit = num(lot.unitCost || lot.unitPrice);
  if (explicit > 0) return explicit;
  const docs = Array.isArray(lot.financialDocuments) ? lot.financialDocuments : [];
  const quantity = docs.reduce((sum: number, row: Row) => sum + Math.max(0, num(row.quantity)), 0);
  const total = docs.reduce((sum: number, row: Row) => sum + num(row.totalAmount), 0);
  return quantity > 0 ? total / quantity : 0;
}

async function storeGet(c: Context<AppEnv>, scope: string, fileName: string, slug: string) {
  const row = await c.env.DB.prepare(
    `SELECT id,file_name,data,created_at,updated_at FROM json_store
      WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(scope, fileName, slug).first<Row>();
  if (!row) return null;
  return { ...json(row.data), storeId: text(row.id), fileName: text(row.file_name), createdAt: text(json(row.data).createdAt || row.created_at) };
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string) {
  const existing = await storeGet(c, scope, fileName, slug);
  const timestamp = now();
  const payload = { ...data, updatedAt: timestamp };
  if (existing?.storeId) {
    await c.env.DB.prepare(`UPDATE json_store SET data=?,main_company_slug=COALESCE(main_company_slug,?),updated_at=? WHERE id=?`)
      .bind(JSON.stringify(payload), slug, timestamp, existing.storeId).run();
    return { ...payload, storeId: existing.storeId, fileName };
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
    .bind(id, scope, slug, fileName, JSON.stringify({ ...payload, createdAt: payload.createdAt || timestamp }), timestamp, timestamp).run();
  return { ...payload, storeId: id, fileName };
}

function balances(lot: Row) {
  const entry = num(lot.entryKg || lot.quantity);
  const remaining = num(lot.remainingKg ?? lot.remainingQuantity ?? entry);
  return { entry, remaining };
}

async function applyMovement(c: Context<AppEnv>, slug: string, lot: Row, body: Row, reason: BoyahaneLotMovementReason, options: Row = {}) {
  const quantity = Math.max(0, num(body.quantity));
  if (quantity <= 0) throw Object.assign(new Error("Hareket miktarı sıfırdan büyük olmalıdır."), { code: "INVALID_QUANTITY" });
  const direction = movementDirection(reason);
  const current = balances(lot);
  if (direction === "OUT" && quantity > current.remaining + 0.0005) {
    throw Object.assign(new Error("Lot bakiyesi hareket miktarından düşük."), {
      code: "INSUFFICIENT_STOCK",
      details: { remaining: current.remaining, requested: quantity },
    });
  }

  const movementId = text(body.id || options.movementId || crypto.randomUUID());
  const duplicate = await storeGet(c, MOVEMENT_SCOPE, movementId, slug);
  if (duplicate) return { movement: duplicate, lot, idempotent: true };
  const nextEntry = direction === "IN" ? current.entry + quantity : current.entry;
  const nextRemaining = direction === "IN" ? current.remaining + quantity : current.remaining - quantity;
  const unitCost = lotUnitCost(lot);
  const nextLot = await storePut(c, LOT_SCOPE, text(lot.id || lot.fileName), {
    ...lot,
    entryKg: nextEntry,
    quantity: nextEntry,
    remainingKg: nextRemaining,
    remainingQuantity: nextRemaining,
    usedKg: Math.max(0, nextEntry - nextRemaining),
    status: nextRemaining <= 0.0005 ? "DEPLETED" : upper(lot.status) === "QUARANTINE" ? "QUARANTINE" : "AVAILABLE",
    lastMovementAt: now(),
  }, slug);

  const movement = await storePut(c, MOVEMENT_SCOPE, movementId, {
    id: movementId,
    lotId: text(lot.id || lot.fileName),
    productId: text(lot.productId || lot.inventoryId),
    productName: text(lot.productName),
    lotNo: text(lot.lotNo),
    type: direction,
    movementType: reason,
    reason,
    quantity,
    quantityKg: quantity,
    unit: text(lot.unit || body.unit || "KG"),
    remainingKg: nextRemaining,
    unitCostAtMovement: unitCost,
    costAmount: quantity * unitCost,
    source: text(body.source || options.source || "MANUAL"),
    modelId: text(body.modelId) || null,
    modelName: text(body.modelName) || null,
    recipeId: text(body.recipeId) || null,
    productionId: text(body.productionId) || null,
    actor: text(body.actor || body.createdBy || "KY ERP"),
    note: text(body.note || body.description || `${reason} LOT hareketi`),
    originalMovementId: text(options.originalMovementId) || null,
    reversalOf: text(options.reversalOf) || null,
    createdAt: now(),
  }, slug);
  return { movement, lot: nextLot, idempotent: false };
}

export function registerBoyahaneLotMovementV2Routes(app: Hono<AppEnv>) {
  app.post("/api/boyahane/workflow/lots/:id/movements-v2", async (c) => {
    const body = await c.req.json<Row>().catch(() => ({}));
    const slug = slugOf(c, body);
    const lot = await storeGet(c, LOT_SCOPE, c.req.param("id"), slug);
    if (!lot) return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Lot bulunamadı." } }, 404);
    const reason = normalizeBoyahaneMovementReason(body.reason || body.movementType || body.type);
    if (!reason) return c.json({ ok: false, error: { code: "INVALID_MOVEMENT", message: "Hareket türü tanınmadı." } }, 400);
    try {
      const result = await applyMovement(c, slug, lot, body, reason);
      return c.json({ ok: true, success: true, data: result.lot, movement: result.movement, idempotent: result.idempotent }, result.idempotent ? 200 : 201);
    } catch (error: any) {
      return c.json({ ok: false, error: { code: text(error?.code) || "MOVEMENT_FAILED", message: text(error?.message) || "Lot hareketi kaydedilemedi.", details: error?.details } }, text(error?.code) === "INSUFFICIENT_STOCK" ? 409 : 400);
    }
  });

  app.post("/api/boyahane/workflow/lots/:id/movements-v2/:movementId/reverse", async (c) => {
    const body = await c.req.json<Row>().catch(() => ({}));
    const slug = slugOf(c, body);
    const lot = await storeGet(c, LOT_SCOPE, c.req.param("id"), slug);
    const original = await storeGet(c, MOVEMENT_SCOPE, c.req.param("movementId"), slug);
    if (!lot) return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Lot bulunamadı." } }, 404);
    if (!original || text(original.lotId) !== text(lot.id || lot.fileName)) return c.json({ ok: false, error: { code: "MOVEMENT_NOT_FOUND", message: "Ters çevrilecek hareket bulunamadı." } }, 404);
    if (text(original.reversedByMovementId)) return c.json({ ok: true, success: true, data: lot, idempotent: true, reversedByMovementId: original.reversedByMovementId });

    const originalDirection = upper(original.type) === "IN" ? "IN" : "OUT";
    const reversalReason: BoyahaneLotMovementReason = originalDirection === "IN" ? "CORRECTION_OUT" : "CORRECTION_IN";
    const reversalId = text(body.id || `reverse:${text(original.id || original.fileName)}`);
    try {
      const result = await applyMovement(c, slug, lot, {
        ...body,
        id: reversalId,
        quantity: num(original.quantity || original.quantityKg),
        source: text(body.source || "REVERSAL"),
        note: text(body.note) || `${text(original.movementType || original.type)} hareketinin ters kaydı`,
      }, reversalReason, { originalMovementId: text(original.id || original.fileName), reversalOf: text(original.id || original.fileName) });
      await storePut(c, MOVEMENT_SCOPE, text(original.id || original.fileName), {
        ...original,
        reversedAt: now(),
        reversedByMovementId: reversalId,
        reversalReason: text(body.note || "Ters hareket"),
      }, slug);
      return c.json({ ok: true, success: true, data: result.lot, movement: result.movement, reversedMovementId: text(original.id || original.fileName) }, 201);
    } catch (error: any) {
      return c.json({ ok: false, error: { code: text(error?.code) || "REVERSE_FAILED", message: text(error?.message) || "Ters hareket oluşturulamadı.", details: error?.details } }, 409);
    }
  });
}
