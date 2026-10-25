import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/worker-production-release.yml", import.meta.url),
  "utf8",
);

test("normal Worker release D1 migrationlarini kullanici ayri izni olmadan calistirmaz", () => {
  assert.match(workflow, /\.applyMigrations == true and \.migrationApprovedByUser == true/);
  assert.match(workflow, /echo "apply=false" >> "\$GITHUB_OUTPUT"/);
  for (const name of [
    "Mail ve muhasebe canonical schema migrationlarini uygula",
    "Personel 0060 hedefli eklemeli D1 migration",
    "Gunluk Operasyon 0061 ek odeme kesinti D1 migration ve kanit",
  ]) {
    const step = workflow.slice(workflow.indexOf("      - name: " + name));
    assert.ok(step.startsWith("      - name: " + name), "migration step missing: " + name);
    assert.match(step.split("\n").slice(0, 3).join("\n"), /if: steps\.migration_gate\.outputs\.apply == 'true'/);
  }
});

test("migration gerekmeyen release tam D1 yedegi ve salt okunur schema kontrolu korur", () => {
  assert.match(workflow, /Canli D1 tam yedegini al/);
  assert.match(workflow, /D1 yedegini artifact olarak sakla/);
  assert.match(workflow, /Canli D1 hedefli salt okunur schema dogrulamasi/);
  assert.match(workflow, /accounting_document_issues/);
  assert.match(workflow, /Worker'i api.kyerp.net adresine dagit/);
});
