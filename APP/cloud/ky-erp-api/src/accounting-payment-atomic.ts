// @ts-nocheck
// Atomic D1 payment-plan posting: one SQLite transaction holds ledger and plan updates.
// No trust is placed in the browser's createdBy, role, or reported previous balance.
type Row = Record<string, any>;
const str = (value: unknown) => value == null ? "" : String(value).trim();
const amount = (value: unknown) => Number(value);
const cents = (value: number) => Math.round(value * 100);
const fail = (status: number, code: string, message: string, current?: Row) => ({
  status, body: { ok: false, error: { code, message }, ...(current ? { current } : {}) },
});
const receipt = (plan: Row, posted: number) => ({
  id: str(plan.id), status: str(plan.status), paidAmount: Number(plan.paid_amount || 0),
  ledgerAmount: posted, currency: str(plan.currency || "TRY"),
});

export async function postAccountingPaymentAtomic(
  db: any, slug: string, id: string, body: Row, actorUserId: string,
) {
  if (!slug || !id || !actorUserId) return fail(403, "PAYMENT_AUTH_REQUIRED", "Firma ve yetkili oturum gereklidir.");
  if (body.confirmed !== true) return fail(400, "PAYMENT_CONFIRMATION_REQUIRED", "Ödeme kaydı açık kullanıcı onayı gerektirir.");

  const plan = await db.prepare("SELECT * FROM accounting_payment_plans WHERE id=? AND main_company_slug=? LIMIT 1")
    .bind(id, slug).first();
  if (!plan) return fail(404, "NOT_FOUND", "Ödeme planı bulunamadı.");
  const total = amount(plan.amount), paid = amount(body.paidAmount ?? body.amount ?? total);
  const isoCurrency = str(plan.currency || "TRY").toUpperCase();
  if (!Number.isFinite(total) || total <= 0 || Math.abs(cents(total)-total*100)>0.00001 ||
      !Number.isFinite(paid) || paid <= 0 || paid > total || Math.abs(cents(paid) - paid * 100) > 0.00001)
    return fail(400, "PAID_AMOUNT_INVALID", "Ödeme miktarı pozitif, geçerli ve kuruş hassasiyetinde olmalıdır.");
  if (!/^[A-Z]{3}$/.test(isoCurrency) || (body.currency && str(body.currency).toUpperCase() !== isoCurrency))
    return fail(409, "PAYMENT_CURRENCY_MISMATCH", "Plan para birimi değiştirilemez.");
  const currentPosted = async () => {
    const [p, l] = await Promise.all([
      db.prepare("SELECT id,status,paid_amount,amount,currency FROM accounting_payment_plans WHERE id=? AND main_company_slug=?").bind(id,slug).first(),
      db.prepare("SELECT COALESCE(ROUND(SUM(debit),2),0) AS value FROM accounting_ledger_entries WHERE main_company_slug=? AND source_payment_plan_id=? AND deleted_at IS NULL").bind(slug,id).first(),
    ]);
    return { plan: p, posted: Number(l?.value || 0) };
  };
  const snapshot = await currentPosted();
  const summary = receipt(snapshot.plan, snapshot.posted);
  if (Math.abs(summary.paidAmount - summary.ledgerAmount) > 0.005)
    return fail(409, "PAYMENT_LEDGER_OUT_OF_SYNC", "Plan ve defter bakiyesi uyuşmuyor; mali kontrol gerekiyor.", summary);
  if (str(snapshot.plan.status) === "CANCELLED") return fail(409, "PAYMENT_CANCELLED", "İptal edilmiş plan ödenemez.", summary);
  if (summary.paidAmount > paid) return fail(409, "PAID_AMOUNT_ROLLBACK_FORBIDDEN", "Muhasebeleştirilmiş tutar azaltılamaz.", summary);
  if (summary.paidAmount === paid && str(snapshot.plan.status) === (paid === total ? "PAID" : "PARTIAL"))
    return { status: 200, body: { ok: true, data: { ...summary, idempotent: true, postedAmount: 0 } } };
  if (!["PLANNED","PARTIAL"].includes(str(snapshot.plan.status)))
    return fail(409, "PAYMENT_PLAN_CLOSED", "Plan açık değil; ödeme işlenemez.", summary);

  const date = str(body.paymentDate) || new Date().toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z")))
    return fail(400, "PAYMENT_DATE_INVALID", "Geçerli ödeme tarihi seçilmelidir.");
  const timestamp = new Date().toISOString();
  const newStatus = paid === total ? "PAID" : "PARTIAL";
  const ledgerId = "PAYPLAN:" + id + ":" + paid.toFixed(2);
  const sumSql = "COALESCE((SELECT ROUND(SUM(l.debit),2) FROM accounting_ledger_entries l WHERE l.main_company_slug=p.main_company_slug AND l.source_payment_plan_id=p.id AND l.deleted_at IS NULL),0)";
  const ledgerSql = [
    "INSERT INTO accounting_ledger_entries",
    "(id,main_company_slug,entry_date,entry_type,record_scope,company_id,company_name,description,",
    "debit,credit,currency,payment_method,bank_account_id,source_document_id,source_payment_plan_id,file_asset_id,note,created_by,created_at,updated_at)",
    "SELECT ?,p.main_company_slug,?,'ODEME','OFFICIAL',p.counterparty_id,p.counterparty_name,?,",
    "ROUND(? - " + sumSql + ",2),0,p.currency,?,?,p.source_document_id,p.id,?,?,?,?,?",
    "FROM accounting_payment_plans p",
  ].join(" ");
  const preconditions = [
    "WHERE p.id=? AND p.main_company_slug=? AND p.status IN ('PLANNED','PARTIAL')",
    "AND p.paid_amount < ? AND p.amount >= ?",
    "AND ROUND(COALESCE(p.paid_amount,0),2)=" + sumSql,
    "AND NOT EXISTS (SELECT 1 FROM accounting_ledger_entries l WHERE l.id=? AND l.main_company_slug=p.main_company_slug)",
  ].join(" ");
  const updateSql = [
    "UPDATE accounting_payment_plans SET paid_amount=?, status=?, updated_at=?",
    "WHERE id=? AND main_company_slug=? AND status IN ('PLANNED','PARTIAL')",
    "AND paid_amount < ? AND amount>=?",
    "AND EXISTS (SELECT 1 FROM accounting_ledger_entries WHERE id=? AND main_company_slug=? AND source_payment_plan_id=accounting_payment_plans.id)",
    "AND (SELECT COALESCE(ROUND(SUM(debit),2),0) FROM accounting_ledger_entries",
    "WHERE main_company_slug=? AND source_payment_plan_id=accounting_payment_plans.id AND deleted_at IS NULL)=?",
  ].join(" ");
  try {
    // D1 batch executes prepared statements serially as a single SQLite transaction.
    // The second statement may only advance the plan if the ledger's exact target has been posted.
    await db.batch([
      db.prepare(ledgerSql + " " + preconditions).bind(
        ledgerId, date, str(body.description || plan.description || "Planlanan ödeme"),
        paid, str(body.paymentMethod || plan.payment_method) || null,
        str(body.bankAccountId || plan.bank_account_id) || null, str(body.fileAssetId) || null,
        str(body.note) || null, actorUserId, timestamp, timestamp,
        id, slug, paid, paid, ledgerId,
      ),
      db.prepare(updateSql).bind(paid,newStatus,timestamp,id,slug,paid,paid,ledgerId,slug,slug,paid),
    ]);
  } catch {
    // The transaction rolled back; do not report success or retry money writes blindly.
    return fail(503, "PAYMENT_TRANSACTION_FAILED", "Defter ve ödeme planı birlikte kaydedilemedi; tekrar denemeden güncel durumu kontrol edin.");
  }
  const verified = await currentPosted();
  const current = receipt(verified.plan, verified.posted);
  if (Math.abs(current.paidAmount - current.ledgerAmount) > 0.005)
    return fail(409, "PAYMENT_LEDGER_OUT_OF_SYNC", "Defter ve plan doğrulaması başarısız oldu.", current);
  if (current.paidAmount !== paid)
    return fail(409, "PAYMENT_CONCURRENT_UPDATE", "Başka ödeme isteği önce işlendi; güncel tutarı kontrol edin.", current);
  return { status: 200, body: { ok:true, data:{ ...current, idempotent: false, ledgerEntryId:ledgerId, postedAmount: Math.max(0,paid-summary.paidAmount) } } };
}
