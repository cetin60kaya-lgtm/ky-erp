import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const accounting = readFileSync(new URL("./file-hub-accounting-intake.ts", import.meta.url), "utf8");
const eBelge = readFileSync(new URL("./e-belge-center-cloud.ts", import.meta.url), "utf8");

test("Drive intake gives XML the first opportunity to create canonical document", () => {
  assert.match(accounting, /ORDER BY CASE WHEN UPPER\(a\.extension\)='XML' THEN 0 ELSE 1 END/);
  assert.match(accounting, /c\.sync_mode='CLOUD_API'/);
  assert.match(accounting, /b\.read_enabled=1 AND b\.sync_enabled=1/);
});

test("original.pdf attaches only to a unique original.xml in the same tenant, connection and folder", () => {
  assert.match(eBelge, /if\(ext==="PDF"\)\{/);
  assert.match(eBelge, /xmlRelativePath=path\.replace\(\/\\\.pdf\$\/i,"\.xml"\)/);
  assert.match(eBelge, /d\.main_company_slug=\? AND d\.deleted_at IS NULL/);
  assert.match(eBelge, /x\.storage_connection_id=\? AND LOWER\(x\.relative_path\)=LOWER\(\?\)/);
  assert.match(eBelge, /if\(matches\.length>1\)throw/);
  assert.match(eBelge, /DOCUMENT_PDF_CONFLICT/);
  assert.match(eBelge, /canonicalSource:true/);
  assert.match(eBelge, /source:"FILE_HUB_XML_PDF"/);
});

test("XML intake also picks up a PDF that was previously indexed and marks it attached", () => {
  assert.match(eBelge, /if\(ext==="XML"\)\{/);
  assert.match(eBelge, /siblingPath=path\.replace\(\/\\\.xml\$\/i,"\.pdf"\)/);
  assert.match(eBelge, /UPPER\(a\.extension\)='PDF'/);
  assert.match(eBelge, /pdf_file_asset_id/);
  assert.match(eBelge, /'\$\.accountingImportState','ATTACHED'/);
  assert.doesNotMatch(accounting, /postAccountingDocumentAtomic|finalizeAccountingDocument/);
});
