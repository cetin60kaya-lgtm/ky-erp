import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { documentPageMeta, DOCUMENT_PAGE_SIZE } from "./documentPageMeta.js";

test("belge sayfalama Worker total/page/pageSize alanlarını kullanır", () => {
  assert.equal(DOCUMENT_PAGE_SIZE, 50);
  assert.deepEqual(documentPageMeta({ page: 2, pageSize: 50, total: 123 }), {
    page: 2, pageSize: 50, total: 123, pageCount: 3, start: 51, end: 100, hasPrevious: true, hasNext: true,
  });
  assert.equal(documentPageMeta({ page: 3, pageSize: 50, total: 123 }).end, 123);
});

test("boş, son ve geçersiz sayfalarda kontroller güvenle kapanır", () => {
  const empty = documentPageMeta({ total: 0 }, 5);
  assert.equal(empty.start, 0);
  assert.equal(empty.end, 0);
  assert.equal(empty.hasNext, false);
  assert.equal(empty.hasPrevious, false);
  assert.equal(documentPageMeta({ total: 100, page: 9 }).page, 2);
  assert.equal(documentPageMeta({ total: -4, page: -8 }).page, 1);
  assert.equal(documentPageMeta({ total: 51, pageSize: 50, page: 1 }).hasNext, true);
});

test("muhasebe alış ve satış belge listeleri sabit ilk sayfaya kilitlenmez", () => {
  for (const filename of ["SupplierDocumentsWorkspace.jsx", "CustomerDocumentsWorkspace.jsx"]) {
    const source = readFileSync(new URL(filename, import.meta.url), "utf8");
    assert.match(source, /documentPageMeta/);
    assert.match(source, /setPage/);
    assert.match(source, /pageSize: DOCUMENT_PAGE_SIZE/);
    assert.doesNotMatch(source, /page:\s*1,\s*pageSize:\s*100/);
    assert.match(source, /aria-label="Sonraki sayfa"/);
  }
});
