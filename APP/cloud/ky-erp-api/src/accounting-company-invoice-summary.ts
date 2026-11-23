// Read-only invoice visibility alongside, never inside, approved cari balance.
// Keep matching conservative: existing company ID or unique exact VKN/TCKN.
type Row = Record<string, unknown>;
const val = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const money = (value: unknown) => Math.round((val(value) + Number.EPSILON) * 100) / 100;

export type CompanyInvoiceTotals = {
  incomingInvoiceTotal: number;
  outgoingInvoiceTotal: number;
  incomingInvoiceCount: number;
  outgoingInvoiceCount: number;
  unpostedInvoiceCount: number;
  postedInvoiceCount: number;
  foreignCurrencyInvoiceCount: number;
  exactTaxMatchedInvoiceCount: number;
  lastDocumentAt: string;
};
export const emptyCompanyInvoiceTotals = (): CompanyInvoiceTotals => ({
  incomingInvoiceTotal: 0, outgoingInvoiceTotal: 0,
  incomingInvoiceCount: 0, outgoingInvoiceCount: 0,
  unpostedInvoiceCount: 0, postedInvoiceCount: 0,
  foreignCurrencyInvoiceCount: 0, exactTaxMatchedInvoiceCount: 0,
  lastDocumentAt: "",
});
export function invoiceTotalsFromRow(row: Row): CompanyInvoiceTotals {
  return {
    incomingInvoiceTotal: money(row.incoming_total),
    outgoingInvoiceTotal: money(row.outgoing_total),
    incomingInvoiceCount: val(row.incoming_count),
    outgoingInvoiceCount: val(row.outgoing_count),
    unpostedInvoiceCount: val(row.unposted_count),
    postedInvoiceCount: val(row.posted_count),
    foreignCurrencyInvoiceCount: val(row.foreign_currency_count),
    exactTaxMatchedInvoiceCount: val(row.exact_tax_match_count),
    lastDocumentAt: String(row.last_document_at ?? ""),
  };
}

export async function loadCompanyInvoiceSummaries(db: D1Database, slug: string) {
  if (!slug) throw new Error("COMPANY_INVOICE_SCOPE_REQUIRED");
  // Foreign currencies are counted separately rather than silently adding
  // USD/EUR values into TRY totals. No invoices are approved or posted here.
  const result = await db.prepare(`
    WITH company_tax AS (
      SELECT id, REPLACE(REPLACE(REPLACE(COALESCE(tax_no,''),' ',''),'-',''),'.','') AS tax_key
      FROM companies WHERE main_company_slug=? AND deleted_at IS NULL
    ),
    unique_tax AS (
      SELECT tax_key, MIN(id) AS company_id FROM company_tax
      WHERE LENGTH(tax_key) IN (10,11)
      GROUP BY tax_key HAVING COUNT(*)=1
    ),
    invoice_rows AS (
      SELECT d.direction, d.payable_total, d.currency, d.status, d.posted_at, d.issue_date, d.created_at,
        COALESCE(direct.id, unique_tax.company_id) AS company_id,
        CASE WHEN direct.id IS NULL AND unique_tax.company_id IS NOT NULL THEN 1 ELSE 0 END tax_match
      FROM accounting_documents d
      LEFT JOIN companies direct
        ON direct.id=d.party_company_id AND direct.main_company_slug=d.main_company_slug
        AND direct.deleted_at IS NULL
      LEFT JOIN unique_tax
        ON unique_tax.tax_key=REPLACE(REPLACE(REPLACE(COALESCE(d.party_tax_no,''),' ',''),'-',''),'.','')
      WHERE d.main_company_slug=? AND d.deleted_at IS NULL
        AND (UPPER(COALESCE(d.document_type,'')) LIKE '%FATURA%'
          OR UPPER(COALESCE(d.document_type,'')) LIKE '%INVOICE%'
          OR UPPER(COALESCE(d.document_type,'')) LIKE '%ARSIV%'
          OR UPPER(COALESCE(d.document_type,'')) LIKE '%IADE%')
    )
    SELECT company_id,
      SUM(CASE WHEN direction='INCOMING' AND UPPER(TRIM(COALESCE(currency,'TRY'))) IN ('TRY','TL','TRL','')
        THEN COALESCE(payable_total,0) ELSE 0 END) AS incoming_total,
      SUM(CASE WHEN direction='OUTGOING' AND UPPER(TRIM(COALESCE(currency,'TRY'))) IN ('TRY','TL','TRL','')
        THEN COALESCE(payable_total,0) ELSE 0 END) AS outgoing_total,
      SUM(CASE WHEN direction='INCOMING' THEN 1 ELSE 0 END) AS incoming_count,
      SUM(CASE WHEN direction='OUTGOING' THEN 1 ELSE 0 END) AS outgoing_count,
      SUM(CASE WHEN posted_at IS NOT NULL OR UPPER(COALESCE(status,''))='POSTED' THEN 1 ELSE 0 END) AS posted_count,
      SUM(CASE WHEN posted_at IS NULL AND UPPER(COALESCE(status,''))<>'POSTED' THEN 1 ELSE 0 END) AS unposted_count,
      SUM(CASE WHEN UPPER(TRIM(COALESCE(currency,'TRY'))) NOT IN ('TRY','TL','TRL','') THEN 1 ELSE 0 END) AS foreign_currency_count,
      MAX(COALESCE(issue_date,created_at)) AS last_document_at,
      SUM(tax_match) AS exact_tax_match_count
    FROM invoice_rows GROUP BY company_id
  `).bind(slug, slug).all<Row>();
  if (!result?.success || !Array.isArray(result.results))
    throw new Error("COMPANY_INVOICE_SUMMARY_UNAVAILABLE");
  const byCompany = new Map<string, CompanyInvoiceTotals>();
  let unmatched = emptyCompanyInvoiceTotals();
  for (const row of result.results) {
    const key = String(row.company_id ?? "").trim();
    if (!key) unmatched = invoiceTotalsFromRow(row);
    else byCompany.set(key, invoiceTotalsFromRow(row));
  }
  return { byCompany, unmatched, currency: "TRY", readOnly: true };
}
