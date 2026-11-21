import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./file-hub.ts", import.meta.url), "utf8");

test("folder unlink requires an explicitly selected tenant and owner privilege", () => {
  assert.match(source, /app\.delete\("\/api\/file-hub\/bindings\/:id"/);
  assert.match(source, /if\(!slug\) return c\.json\(err\("MAIN_COMPANY_REQUIRED"/);
  assert.match(source, /const owner=await requireCompanyOwner\(c,\{mainCompanySlug:slug\}\)/);
  assert.match(source, /if\(!owner\) return c\.json\(err\("COMPANY_OWNER_ONLY"/);
  assert.match(source, /WHERE id=\? AND main_company_slug=\? LIMIT 1/);
});
test("unlink removes only binding and logs operation; never deletes source files/assets", () => {
  const start = source.indexOf('app.delete("/api/file-hub/bindings/:id"');
  const end = source.indexOf('app.get("/api/file-hub/resolve-storage"',start);
  const block = source.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/DELETE FROM file_hub_bindings WHERE id=\? AND main_company_slug=\?/);
  assert.match(block,/BINDING_UNLINKED/);
  assert.match(block,/physicalFilesDeleted:0/);
  assert.doesNotMatch(block,/DELETE FROM file_hub_(assets|locations|relations|connections)/);
  assert.doesNotMatch(block,/\b(fs\.|unlinkSync|rmSync|rmdirSync|del\s+\/)/);
});
