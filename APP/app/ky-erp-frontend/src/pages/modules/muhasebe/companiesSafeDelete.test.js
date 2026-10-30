import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("./CompaniesCurrentWorkspace.jsx", import.meta.url), "utf8");
test("firmanın aktif/pasif görünümü ve status API bağlantısı var", () => {
  assert.match(screen, /activityFilter/);
  assert.match(screen, /Aktif firmalar/);
  assert.match(screen, /Pasif firmalar/);
  assert.match(screen, /changeActiveStatus/);
  assert.match(screen, /\/status/);
});
test("hard silme önce yalnız yönetici etki raporunu alır ve ID + ad + onay ister", () => {
  assert.match(screen, /hard-delete-preview/);
  assert.match(screen, /hard-delete/);
  assert.match(screen, /deletePreview\.canHardDelete/);
  assert.match(screen, /confirmCompanyId/);
  assert.match(screen, /confirmName/);
  assert.match(screen, /expectedUpdatedAt/);
  assert.match(screen, /deletePhrase !== "KALICI SIL"/);
  assert.match(screen, /blockedRelations/);
});
test("İmalat modalını dıştaki boş alana tıklayarak kapatır, içe tıklama kapatmaz", () => {
  const panel = readFileSync(new URL("../../imalat/ProductionDirectEntryPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /onClick=\{\(event\) => \{/);
  assert.match(panel, /event\.target !== event\.currentTarget/);
  assert.match(panel, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
});
