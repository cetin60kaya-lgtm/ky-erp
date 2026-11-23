import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const center = readFileSync(new URL("./EBelgeCenterPage.jsx", import.meta.url), "utf8");
const workflow = readFileSync(new URL("./InvoiceDispatchControlWorkspace.jsx", import.meta.url), "utf8");
const backend = readFileSync(new URL("../../../../../../cloud/ky-erp-api/src/e-belge-center-cloud.ts", import.meta.url), "utf8");

test("original PDF opens in KY ERP on the same screen and keeps original bytes", () => {
  assert.match(center, /getEBelgeFilePreview\(file\.id\)/);
  assert.match(center, /blob\.slice\(0, 5\)\.text\(\) !== "%PDF-"/);
  assert.match(center, /setPdfPreview\(\{ url: URL\.createObjectURL/);
  assert.match(center, /URL\.revokeObjectURL\(pdfPreview\.url\)/);
  assert.ok(center.includes("<iframe title={"));
  assert.match(center, /Orijinal Belge Arşivi/);
});

test("workflow opens related dispatch/invoice inside this e-Belge detail instead of another tab", () => {
  assert.match(workflow, /onOpenDocument/);
  assert.match(workflow, /openLinkedDocument\(selected\.id, "giden-irsaliyeler"\)/);
  assert.match(workflow, /openLinkedDocument\(selected\.invoiceId, "giden-faturalar"\)/);
  assert.match(center, /onOpenDocument=\{\(documentId\)/);
  assert.match(center, /autoOpenPdf/);
});

test("sort selection is server-side before pagination, never just page-local", () => {
  assert.match(center, /pageSize:50,sortBy,sortDirection/);
  assert.match(center, /renderPoolSort\("Tarih", "DATE"\)/);
  assert.match(center, /renderPoolSort\("Toplam", "TOTAL"\)/);
  assert.match(backend, /eBelgePoolOrderBy\(c\.req\.query\("sortBy"\),c\.req\.query\("sortDirection"\)\)/);
});
