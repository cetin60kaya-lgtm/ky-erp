import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (name: string) => fs.readFileSync(path.join(root, "src", name), "utf8");
// Production 0028 İşNet route guard için ayrılmıştır; Muhasebe çekirdeği 0033-0035 aralığındadır.
const migration = fs.readFileSync(path.join(root, "migrations", "0033_accounting_document_core.sql"), "utf8");
const intelligenceMigration = fs.readFileSync(path.join(root, "migrations", "0034_accounting_intelligence_profiles.sql"), "utf8");
const core = read("accounting-document-core.ts");
const intelligence = read("accounting-document-intelligence.ts");
const operations = read("accounting-operations.ts");
const compat = read("isnet-intake-compat.ts");

test("canonical accounting document pool is provider-neutral and tenant scoped", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS accounting_documents/);
  assert.match(migration, /main_company_slug TEXT NOT NULL/);
  assert.match(migration, /provider_type TEXT NOT NULL DEFAULT 'MANUAL'/);
  assert.match(core, /ISNET/);
  assert.match(core, /PARASUT/);
  assert.match(core, /XML_IMPORT/);
  assert.match(core, /AI_SCAN/);
});

test("PDF and scanned image intake uses structured AI document intelligence, not plain OCR-only parsing", () => {
  assert.match(core, /belge-havuzu\/scan/);
  assert.match(core, /analyzeAccountingDocument/);
  assert.match(intelligence, /prebuilt-invoice/);
  assert.match(intelligence, /structured fields \+ line items \+ confidence/);
  assert.match(intelligence, /AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/);
  assert.match(intelligence, /2024-11-30/);
  assert.match(intelligence, /extractionConfidence/);
  assert.match(intelligence, /Items/);
});

test("XML is parsed deterministically while scan results require confidence and human review when uncertain", () => {
  assert.match(core, /UBL_TR_BELGE_TANINMADI/);
  assert.match(core, /LOW_EXTRACTION_CONFIDENCE/);
  assert.match(core, /PARTY_UNMATCHED/);
  assert.match(core, /READY_FOR_APPROVAL/);
  assert.match(core, /REVIEW_REQUIRED/);
});

test("company-specific extraction profiles and bank import staging exist", () => {
  assert.match(intelligenceMigration, /accounting_extraction_profiles/);
  assert.match(intelligenceMigration, /provider_model_id/);
  assert.match(intelligenceMigration, /min_confidence/);
  assert.match(intelligenceMigration, /accounting_bank_import_batches/);
  assert.match(operations, /belge-okuma-profilleri/);
  assert.match(operations, /banka\/import-csv/);
});

test("payment planning exposes weekly, weekend and reminder views", () => {
  assert.match(migration, /accounting_payment_plans/);
  assert.match(operations, /odeme-plani\/hafta/);
  assert.match(operations, /odeme-plani\/hafta-sonu/);
  assert.match(operations, /hatirlatmalar/);
  assert.match(operations, /source_payment_plan_id/);
});

test("existing İşNet intake registers the new canonical accounting routes without deleting legacy flow", () => {
  assert.match(compat, /registerAccountingDocumentCoreRoutes\(app\)/);
  assert.match(compat, /registerAccountingOperationRoutes\(app\)/);
  assert.match(compat, /incoming-dispatches\/:id\/import/);
});
