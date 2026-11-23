// Canonical, read-only firm document ledger: invoices and dispatches are not cari movements.
type Row = Record<string, any>;
const taxKey = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
const number = (v: unknown) => { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; };
const taxExpr = (alias: string) =>
  "REPLACE(REPLACE(REPLACE(COALESCE(" + alias + ",''),' ',''),'-',''),'.','')";

export async function listCompanyCanonicalDocuments(
  db: D1Database, tenant: string, companyId: string, page = 1, pageSize = 50,
) {
  if (!tenant || !companyId) throw new Error("COMPANY_DOCUMENT_SCOPE_REQUIRED");
  const company = await db.prepare(
    "SELECT id,tax_no FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1",
  ).bind(companyId, tenant).first<Row>();
  if (!company) return null;

  const key = taxKey(company.tax_no);
  let exactTaxUnique = false;
  if (/^[0-9]{10,11}$/.test(key)) {
    const count = await db.prepare(
      "SELECT COUNT(*) AS n FROM companies WHERE main_company_slug=? AND deleted_at IS NULL AND " +
      taxExpr("tax_no") + "=?",
    ).bind(tenant, key).first<Row>();
    exactTaxUnique = Number(count?.n) === 1;
  }

  // Never steal a document explicitly linked to another company; tax fallback
  // is allowed ONLY when document company_id is genuinely unassigned.
  const exactMatch = exactTaxUnique
    ? " OR ((d.party_company_id IS NULL OR d.party_company_id='') AND " + taxExpr("d.party_tax_no") + "=?)"
    : "";
  const where = " FROM accounting_documents d WHERE d.main_company_slug=? AND d.deleted_at IS NULL " +
    "AND (d.party_company_id=?" + exactMatch + ")";
  const params = [tenant, companyId, ...(exactTaxUnique ? [key] : [])];
  const safePage = Math.min(100000, Math.max(1, Math.floor(number(page) || 1)));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(number(pageSize) || 50)));
  const total = await db.prepare("SELECT COUNT(*) AS n" + where).bind(...params).first<Row>();
  const docs = await db.prepare(
    "SELECT d.id,d.document_no,d.document_type,d.direction,d.issue_date,d.created_at," +
    "d.payable_total,d.currency,d.status,d.posted_at,d.source_type," +
    "d.pdf_file_asset_id,d.xml_file_asset_id" + where +
    " ORDER BY COALESCE(d.issue_date,d.created_at) DESC,d.id DESC LIMIT ? OFFSET ?",
  ).bind(...params, safePageSize, (safePage - 1) * safePageSize).all<Row>();
  if (!docs?.success || !Array.isArray(docs.results)) throw new Error("COMPANY_DOCUMENT_READ_FAILED");
  return { companyId, items: docs.results, total: Number(total?.n || 0),
    page: safePage, pageSize: safePageSize, matchedByUniqueTax: exactTaxUnique, readOnly: true };
}
