import type { Context } from "hono";

type Row = Record<string, any>;
type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const reject = (code: string, message: string) => { throw Object.assign(new Error(message), { code }); };

function transactionTypeOf(input: Row) {
  const explicit = upper(input.transactionType);
  if (["DEBIT", "CREDIT", "PAYMENT", "COLLECTION"].includes(explicit)) return explicit;
  if (explicit) reject("TRANSACTION_TYPE_INVALID", "Geçerli cari işlem türü seçin.");

  const direction = upper(input.transactionDirection);
  if (["PAYMENT", "PAYMENT_OUT", "OUT", "OUTGOING"].includes(direction)) return "PAYMENT";
  if (["COLLECTION", "COLLECTION_IN", "PAYMENT_IN", "IN", "INCOMING"].includes(direction)) return "COLLECTION";
  reject("TRANSACTION_TYPE_INVALID", "Geçerli cari işlem türü seçin.");
}

export function currentAccountEntry(input: Row) {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) reject("AMOUNT_INVALID", "Sıfırdan büyük geçerli tutar girin.");
  const type = transactionTypeOf(input);
  const types: Record<string, string> = { DEBIT: "BORC", CREDIT: "ALACAK", PAYMENT: "ODEME", COLLECTION: "TAHSILAT" };
  const effect = ["DEBIT", "PAYMENT"].includes(type) ? amount : -amount;
  const date = text(input.date || input.paymentDate) || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) reject("DATE_INVALID", "Geçerli işlem tarihi girin.");
  const recordScope = /INTERNAL|GAYRI|UNOFFICIAL/.test(upper(input.recordScope || input.recordType || input.workType)) ? "INTERNAL" : "OFFICIAL";
  const sourceType = ["PAYMENT", "COLLECTION"].includes(type) ? "PAYMENT" : "MANUAL_CURRENT_ACCOUNT";
  return {
    amount,
    type,
    effect,
    date,
    movementType: types[type],
    sourceType,
    debit: effect > 0 ? amount : 0,
    credit: effect < 0 ? amount : 0,
    recordScope,
    recordType: recordScope === "OFFICIAL" ? "RESMI" : "GAYRI_RESMI",
  };
}

export async function supportedInsert(db: D1Database, table: string, data: Row, required: string[] = []) {
  const result = await db.prepare(`PRAGMA table_info("${table}")`).all<Row>();
  const columns = new Set((result.results || []).map(row => text(row.name)));
  if (required.some(column => !columns.has(column))) reject("ACCOUNTING_SCHEMA_NOT_READY", "Muhasebe şeması hazır değil; işlem uygulanmadı.");
  const entries = Object.entries(data).filter(([key]) => columns.has(key));
  if (!entries.length) reject("ACCOUNTING_SCHEMA_NOT_READY", "Muhasebe tablosu hazır değil; işlem uygulanmadı.");
  return db.prepare(`INSERT INTO ${table} (${entries.map(([key]) => `"${key}"`).join(",")}) VALUES (${entries.map(() => "?").join(",")})`)
    .bind(...entries.map(([, value]) => value !== null && typeof value === "object" ? JSON.stringify(value) : value ?? null));
}

export async function writeCurrentAccount(c: Context<AppEnv>, slug: string, input: Row, actor: string) {
  if (!slug) reject("MAIN_COMPANY_REQUIRED", "Ana firma seçimi zorunludur.");
  const entry = currentAccountEntry(input);
  const companyId = text(input.companyId || input.firmId);
  const requestId = text(input.requestId || input.id);
  if (!requestId || requestId.length > 160) reject("REQUEST_ID_REQUIRED", "İşlem kimliği zorunludur; ekranı yenileyin.");
  const id = `cari:${slug}:${requestId}`;
  const db = c.env.DB;
  const existing = await db.prepare("SELECT * FROM current_account_movements WHERE id=? AND main_company_slug=?").bind(id, slug).first<Row>();
  if (existing) {
    if (text(existing.company_id) !== companyId || Number(existing.amount) !== entry.amount || text(existing.movement_type) !== entry.movementType) reject("REQUEST_ID_CONFLICT", "Bu işlem kimliği farklı bir kayıt için kullanılmış.");
    return { id: requestId, movementId: id, balanceAfter: Number(existing.balance_after), idempotent: true };
  }
  const company = await db.prepare("SELECT * FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL").bind(companyId, slug).first<Row>();
  if (!company) reject("COMPANY_NOT_FOUND", "Cari firma bulunamadı.");
  const supplier = upper(company!.payment_mode) === "CREDIT" && Number(company!.supplier_debt_tracking) === 1;
  const customer = Number(company!.customer_receivable_tracking) === 1;
  if ((!supplier && !customer) || (entry.type === "PAYMENT" && !supplier) || (entry.type === "COLLECTION" && !customer)) reject("CURRENT_ACCOUNT_DISABLED", "Firma için bu cari işlem türü açık değil. Peşin tedarikçiye cari borç yazılamaz.");
  const timestamp = new Date().toISOString();
  const description = text(input.description) || entry.movementType;
  const payload = { ...input, id: requestId, firmId: companyId, companyId, companyName: company!.name, ...entry, paymentDate: entry.date, createdAt: timestamp, createdBy: actor };
  const movement = await supportedInsert(db, "current_account_movements", {
    id, main_company_slug: slug, company_id: companyId, movement_date: entry.date,
    movement_type: entry.movementType, source_type: entry.sourceType, document_no: requestId,
    description, debit: entry.debit, credit: entry.credit, amount: entry.amount, effect: entry.effect,
    balance_after: 0, record_type: entry.recordType, raw: payload, created_at: timestamp, updated_at: timestamp,
  }, ["id", "main_company_slug", "company_id", "effect", "amount", "balance_after"]);
  const ledger = await supportedInsert(db, "accounting_ledger_entries", {
    id, main_company_slug: slug, company_id: companyId, company_name: company!.name, entry_date: entry.date,
    entry_type: entry.movementType, record_scope: entry.recordScope, description,
    debit: entry.type === "PAYMENT" ? entry.amount : entry.type === "COLLECTION" ? 0 : entry.debit,
    credit: entry.type === "COLLECTION" ? entry.amount : entry.type === "PAYMENT" ? 0 : entry.credit,
    currency: "TRY", payment_method: text(input.paymentMethod), created_by: actor, created_at: timestamp, updated_at: timestamp,
  }, ["id", "main_company_slug", "debit", "credit"]);
  // One transactional batch owns movement, balance, ledger, payment history and live revision.
  await db.batch([
    movement,
    db.prepare("UPDATE companies SET current_balance=(SELECT COALESCE(SUM(effect),0) FROM current_account_movements WHERE company_id=? AND main_company_slug=?), updated_at=? WHERE id=? AND main_company_slug=?").bind(companyId, slug, timestamp, companyId, slug),
    db.prepare("UPDATE current_account_movements SET balance_after=(SELECT current_balance FROM companies WHERE id=? AND main_company_slug=?) WHERE id=? AND main_company_slug=?").bind(companyId, slug, id, slug),
    ledger,
    db.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(id, "MUHASEBE_PAYMENT", slug, requestId, JSON.stringify(payload), timestamp, timestamp),
    db.prepare("INSERT INTO accounting_live_revision(main_company_slug,revision,updated_at) VALUES(?,1,?) ON CONFLICT(main_company_slug) DO UPDATE SET revision=accounting_live_revision.revision+1,updated_at=excluded.updated_at").bind(slug, timestamp),
  ]);
  const saved = await db.prepare("SELECT balance_after FROM current_account_movements WHERE id=? AND main_company_slug=?").bind(id, slug).first<Row>();
  return { ...payload, movementId: id, balanceAfter: Number(saved?.balance_after || 0), idempotent: false };
}
