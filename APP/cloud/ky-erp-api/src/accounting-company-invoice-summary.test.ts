import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { emptyCompanyInvoiceTotals, invoiceTotalsFromRow, loadCompanyInvoiceSummaries } from "./accounting-company-invoice-summary.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE companies (id TEXT,main_company_slug TEXT,name TEXT,tax_no TEXT,deleted_at TEXT);
    INSERT INTO companies VALUES
      ('taha','main','TAHA GİYİM','8160150864',NULL),
      ('empty','main','TAHA',NULL,NULL),
      ('dup1','main','Tekil olmayan','1111111111',NULL),
      ('dup2','main','Mükerrer vergi','1111111111',NULL),
      ('foreign','other','Diğer','8160150864',NULL);
    CREATE TABLE accounting_documents (
      id TEXT,main_company_slug TEXT,party_company_id TEXT,party_tax_no TEXT,
      direction TEXT,document_type TEXT,currency TEXT,payable_total REAL,
      status TEXT,posted_at TEXT,deleted_at TEXT
    );
    INSERT INTO accounting_documents VALUES
      ('invoice994','main','taha','8160150864','OUTGOING','SATIS_FATURA','TRY',17635.80,'REVIEW_REQUIRED',NULL,NULL),
      ('incoming','main',NULL,'8160150864','INCOMING','ALIS_FATURA','TRY',2250.30,'POSTED','2026-11-22',NULL),
      ('duplicate','main',NULL,'1111111111','INCOMING','ALIS_FATURA','TRY',500.00,'REVIEW_REQUIRED',NULL,NULL),
      ('unknown','main',NULL,NULL,'INCOMING','ALIS_FATURA','TRY',450.00,'REVIEW_REQUIRED',NULL,NULL),
      ('euro','main','taha','8160150864','INCOMING','ALIS_FATURA','EUR',100.00,'REVIEW_REQUIRED',NULL,NULL),
      ('dispatch','main','taha','8160150864','OUTGOING','SEVK_IRSALIYE','TRY',1000,'REVIEW_REQUIRED',NULL,NULL),
      ('removed','main','taha','8160150864','OUTGOING','SATIS_FATURA','TRY',888,'REVIEW_REQUIRED',NULL,'2026-01-01'),
      ('othertenant','other','foreign','8160150864','OUTGOING','SATIS_FATURA','TRY',9000,'REVIEW_REQUIRED',NULL,NULL);
  `);
  const db = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) { params = args; return statement; },
        async all() { return { success: true, results: sqlite.prepare(sql).all(...params as any[]) }; },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, sqlite };
}

test("invoice totals are separate from 50,000 TL posted cari balance", async () => {
  const {db,sqlite}=fixture();
  const {byCompany,unmatched}=await loadCompanyInvoiceSummaries(db,"main");
  const taha=byCompany.get("taha")!;
  assert.equal(taha.outgoingInvoiceTotal, 17635.8);
  assert.equal(taha.incomingInvoiceTotal, 2250.3);
  assert.equal(taha.outgoingInvoiceCount, 1);
  assert.equal(taha.incomingInvoiceCount, 2);
  assert.equal(taha.postedInvoiceCount, 1);
  assert.equal(taha.unpostedInvoiceCount, 2);
  assert.equal(taha.foreignCurrencyInvoiceCount, 1);
  assert.equal(taha.exactTaxMatchedInvoiceCount, 1);
  assert.equal(unmatched.incomingInvoiceCount,2);
  assert.equal(unmatched.incomingInvoiceTotal,950);
  assert.equal(byCompany.has("empty"),false);
  sqlite.close();
});

test("duplicate tax ID never auto-assigns an invoice to either company", async () => {
  const {db,sqlite}=fixture();
  const result=await loadCompanyInvoiceSummaries(db,"main");
  assert.equal(result.byCompany.has("dup1"),false);
  assert.equal(result.byCompany.has("dup2"),false);
  assert.equal(result.unmatched.incomingInvoiceCount,2);
  sqlite.close();
});

test("no invoice data becomes a zero ledger movement or implicit posting", async () => {
  const {db,sqlite}=fixture();
  const results=await loadCompanyInvoiceSummaries(db,"main");
  assert.equal(results.readOnly,true);
  assert.deepEqual(emptyCompanyInvoiceTotals(),invoiceTotalsFromRow({}));
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM accounting_documents WHERE status='POSTED' AND main_company_slug='main'").get()!.n,1);
  await assert.rejects(()=>loadCompanyInvoiceSummaries(db,""),/SCOPE_REQUIRED/);
  sqlite.close();
});
