import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (name: string) => fs.readFileSync(path.join(root, "src", name), "utf8");
const migration = fs.readFileSync(path.join(root, "migrations", "0034_accounting_document_core.sql"), "utf8");
const intelligenceMigration = fs.readFileSync(path.join(root, "migrations", "0035_accounting_intelligence_profiles.sql"), "utf8");
const ebelge = read("e-belge-center-cloud.ts");
const intelligence = read("accounting-document-intelligence.ts");
const operations = read("accounting-operations.ts");
const finance = read("accounting-finance-core.ts");
const main = read("main.ts");

test("canonical e-Belge document pool is provider-neutral and tenant scoped", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS accounting_documents/);
  assert.match(migration, /main_company_slug TEXT NOT NULL/);
  assert.match(migration, /provider_type TEXT NOT NULL DEFAULT 'MANUAL'/);
  assert.match(ebelge, /providerType/);
  assert.match(ebelge, /ISNET/);
  assert.match(ebelge, /XML_IMPORT/);
  assert.match(ebelge, /AI_SCAN/);
  assert.match(ebelge, /ingestProviderEBelgeXml/);
});

test("PDF and image intake uses structured document intelligence while XML stays deterministic", () => {
  assert.match(ebelge, /\/api\/e-belge\/upload/);
  assert.match(ebelge, /parseCanonicalEBelgeUbl/);
  assert.match(ebelge, /accountingDocumentIntelligenceStatus/);
  assert.match(intelligence, /prebuilt-invoice/);
  assert.match(intelligence, /AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/);
});
test("company extraction profiles, bank import and finance core remain canonical accounting concerns", () => {
  assert.match(intelligenceMigration, /accounting_extraction_profiles/);
  assert.match(intelligenceMigration, /accounting_bank_import_batches/);
  assert.match(operations, /belge-okuma-profilleri/);
  assert.match(operations, /banka\/import-csv/);
  assert.match(finance, /\/api\/muhasebe\/odeme-plani/);
  assert.match(finance, /\/api\/muhasebe\/defter/);
});

test("main registers canonical accounting and e-Belge routes directly without İşNet compatibility router", () => {
  assert.match(main, /registerAccountingOperationRoutes\(app\)/);
  assert.match(main, /registerEBelgeCenterRoutes\(app\)/);
  assert.doesNotMatch(main, /registerIsnetIntakeCompatRoutes/);
  assert.doesNotMatch(operations, /registerAccountingDocumentReviewRoutes/);
  assert.doesNotMatch(operations, /registerAccountingDocumentArchiveRoutes/);
});

test("old muhasebe belge-havuzu route family is absent from canonical worker runtime", () => {
  for (const source of [ebelge, operations, finance, main]) {
    assert.doesNotMatch(source, /\/api\/muhasebe\/belge-havuzu/);
  }
  assert.doesNotMatch(ebelge, /app\.delete\("\/api\/e-belge\/documents\/:id"/);
});
