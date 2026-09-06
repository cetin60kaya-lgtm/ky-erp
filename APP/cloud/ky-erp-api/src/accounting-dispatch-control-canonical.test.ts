import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "accounting-dispatch-control-canonical.ts"), "utf8");
const main = fs.readFileSync(path.join(here, "main.ts"), "utf8");
const supplierDocuments = fs.readFileSync(
  path.join(here, "../../app/ky-erp-frontend/src/pages/modules/muhasebe/SupplierDocumentsWorkspace.jsx"),
  "utf8",
);

test("müşteri irsaliye/fatura kontrolü canonical outgoing belgeleri okur", () => {
  assert.match(source, /FROM accounting_documents d/);
  assert.match(source, /d\.direction='OUTGOING'/);
  assert.match(source, /accounting_document_lines/);
  assert.match(source, /accounting_document_relations/);
  assert.match(source, /relation_type='INVOICE_OF'/);
  assert.doesNotMatch(source, /FROM documents\b/);
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
