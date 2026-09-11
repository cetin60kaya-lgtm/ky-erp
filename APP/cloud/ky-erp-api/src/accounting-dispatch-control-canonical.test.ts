import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "accounting-dispatch-control-canonical.ts"), "utf8");
const main = fs.readFileSync(path.join(here, "main.ts"), "utf8");
const supplierDocuments = fs.readFileSync(
  path.join(here, "../../../app/ky-erp-frontend/src/pages/modules/muhasebe/SupplierDocumentsWorkspace.jsx"),
  "utf8",
);

test("müşteri irsaliye/fatura kontrolü canonical outgoing belgeleri kalem bazında okur", () => {
  assert.match(source, /FROM accounting_documents d/);
  assert.match(source, /d\.direction='OUTGOING'/);
  assert.match(source, /accounting_document_lines/);
  assert.match(source, /accounting_document_relations/);
  assert.match(source, /relation_type IN \('INVOICE_OF','DESPATCH_OF','DISPATCH_OF'\)/);
  assert.match(source, /canonicalLineKey/);
  assert.match(source, /canonicalUnit/);
  assert.match(source, /invoiceRemaining/);
  assert.match(source, /lineOverlap/);
  assert.match(source, /CANONICAL_LINE_ALLOCATED_DOCUMENTS/);
  assert.doesNotMatch(source, /function fallbackMatch/);
  assert.doesNotMatch(source, /FROM documents\b/);
});

test("canonical kontrol yalnız model eşitliğini tek başına fatura eşleşmesi saymaz", () => {
  assert.match(source, /strictContextMatch/);
  assert.match(source, /strictContextMatch\(dispatch,i\)&&lineOverlap/);
  assert.match(source, /EXPLICIT_RELATION_OR_STRICT_CONTEXT_PLUS_EXACT_LINE_IDENTITY/);
});

test("canonical kontrol route'u ana Worker'da legacy app route'undan önce kayıtlıdır", () => {
  const registerIndex = main.indexOf("registerCanonicalDispatchControlRoutes(shell)");
  const legacyMountIndex = main.indexOf('shell.route("/", app)');
  assert.ok(registerIndex >= 0, "canonical dispatch control route kaydı bulunamadı");
  assert.ok(legacyMountIndex > registerIndex, "canonical route legacy app mountundan önce kayıtlı olmalı");
});

test("canonical kontrol tenant ve Muhasebe yetkisini modül içinde fail-closed uygular", () => {
  assert.match(source, /getAuthenticatedUser/);
  assert.match(source, /ACCOUNTING_FORBIDDEN/);
  assert.match(source, /MAIN_COMPANY_REQUIRED/);
  assert.match(source, /MAIN_COMPANY_FORBIDDEN/);
});

test("tedarikçi irsaliye ekranı İşNet'e özel değil canonical e-Belge havuzunu okur", () => {
  assert.match(supplierDocuments, /getEBelgePool/);
  assert.match(supplierDocuments, /INCOMING_DISPATCH/);
  assert.doesNotMatch(supplierDocuments, /getIsnetDocumentCenter/);
});
