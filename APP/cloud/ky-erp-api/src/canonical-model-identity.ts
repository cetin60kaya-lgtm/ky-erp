import type { Context } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
export type IdentityInput = {
  modelName: string; modelCode?: string; companyId?: string; companyName?: string;
  orderNo?: string; dispatchNo?: string; expectedQty?: number; printRegions?: string[];
  sourceModule: string; requestedId?: string;
};
export type IdentityResult = { id: string; modelName: string; companyId: string; created: boolean };

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();

/** Tüm modüllerde tek isim anahtarı; yakın/benzer isimleri ASLA birleştirmez. */
export function canonicalModelKey(value: unknown) {
  return text(value).normalize("NFC").toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I").replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function matchCanonicalModel(rows: Row[], input: Pick<IdentityInput, "modelName" | "companyId" | "requestedId">) {
  const key = canonicalModelKey(input.modelName);
  if (!key) throw new Error("MODEL_NAME_REQUIRED: Model adı zorunludur.");
  const firm = text(input.companyId);
  const requested = text(input.requestedId);
  const eligible = rows.filter((row) => !row.deleted_at && canonicalModelKey(row.model_name) === key);
  if (requested) {
    const direct = rows.find((row) => text(row.id) === requested && !row.deleted_at);
    if (direct) {
      if (canonicalModelKey(direct.model_name) !== key ||
        (firm && text(direct.company_id || direct.customer_id) && text(direct.company_id || direct.customer_id) !== firm)) {
        throw new Error("MODEL_ID_CONFLICT: Model kimliği başka kayıtla eşleşiyor.");
      }
      return direct;
    }
  }
  // Firma seçildiyse sadece tam aynı firmada, seçilmediyse yalnız tek kesin adayda eşleş.
  const matches = firm
    ? eligible.filter((row) => text(row.company_id || row.customer_id) === firm)
    : eligible;
  if (matches.length > 1) throw new Error("MODEL_DUPLICATE_REVIEW: Aynı isim ve firmada birden fazla kart; elle uzlaştırma gerekli.");
  if (matches.length === 1) {
    if (text(matches[0].status).toUpperCase() === "ARCHIVE")
      throw new Error("MODEL_ARCHIVED_REVIEW: Arşivlenmiş model önce incelenmeli.");
    return matches[0];
  }
  return null;
}

async function deterministicUuid(key: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Model açan bütün backend akışlarının tek yazma kapısı.
 * INSERT OR IGNORE + deterministik kimlik eşzamanlı istekte ikinci model açmaz.
 * İşNet fatura/irsaliye gönderimini veya stok, bordro, cari ve KDV hareketlerini değiştirmez.
 */
export async function ensureCanonicalModel(c: Context<AppEnv>, slug: string, input: IdentityInput): Promise<IdentityResult> {
  const name = text(input.modelName);
  const firm = text(input.companyId);
  const normalized = canonicalModelKey(name);
  if (!slug || !normalized || name.length > 160) throw new Error("MODEL_FIELDS_INVALID: Ana firma veya model adı eksik/geçersiz.");
  const all = await c.env.DB.prepare(
    `SELECT id,model_name,model_code,company_id,customer_id,status,deleted_at
       FROM model_records WHERE main_company_slug=? AND deleted_at IS NULL`
  ).bind(slug).all<Row>();
  const existing = matchCanonicalModel(all.results || [], input);
  if (existing) return { id: text(existing.id), modelName: text(existing.model_name), companyId: text(existing.company_id || existing.customer_id), created: false };
  const id = text(input.requestedId) || await deterministicUuid([slug, firm || "NO_FIRM", normalized].join("|"));
  const now = new Date().toISOString();
  const raw = {
    modelName: name, modelCode: text(input.modelCode || name),
    companyId: firm, companyName: text(input.companyName),
    orderNo: text(input.orderNo), dispatchNo: text(input.dispatchNo),
    expectedQty: Number.isFinite(Number(input.expectedQty)) ? Math.max(0, Number(input.expectedQty || 0)) : 0,
    printRegions: (input.printRegions || []).map((name, index) => ({ regionName: name, sortOrder: index + 1 })),
    source: text(input.sourceModule), createdAt: now,
  };
  const columns = new Set(((await c.env.DB.prepare('PRAGMA table_info("model_records")').all<Row>()).results || []).map((row) => text(row.name)));
  const values: Row = {
    id, main_company_slug: slug, model_name: name, model_code: text(input.modelCode || name),
    order_no: text(input.orderNo), company_id: firm || null, customer_id: firm || null,
    customer_name: text(input.companyName) || null,
    source_dispatch_no: text(input.dispatchNo),
    customer_dispatch_no: text(input.dispatchNo),
    incoming_qty: raw.expectedQty, incoming_quantity: raw.expectedQty,
    remaining_quantity: raw.expectedQty, image_url: null, status: "NEW_ARRIVAL",
    raw: JSON.stringify(raw), created_at: now, updated_at: now,
  };
  const fields = Object.keys(values).filter((field) => columns.has(field));
  if (!fields.includes("id") || !fields.includes("main_company_slug") || !fields.includes("model_name"))
    throw new Error("MODEL_SCHEMA_NOT_READY: Canonical tablo hazır değil.");
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO model_records (${fields.map((field) => `"${field}"`).join(",")}) VALUES (${fields.map(() => "?").join(",")})`
  ).bind(...fields.map((field) => values[field])).run();
  const actual = await c.env.DB.prepare(
    `SELECT id,model_name,company_id,customer_id,created_at FROM model_records
      WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1`
  ).bind(id, slug).first<Row>();
  if (!actual || canonicalModelKey(actual.model_name) !== normalized ||
      (firm && text(actual.company_id || actual.customer_id) !== firm)) {
    throw new Error("MODEL_WRITE_CONFLICT: Başka model ile çakışma var; sessiz ikinci kayıt açılmadı.");
  }
  return { id, modelName: text(actual.model_name), companyId: text(actual.company_id || actual.customer_id), created: text(actual.created_at) === now };
}
