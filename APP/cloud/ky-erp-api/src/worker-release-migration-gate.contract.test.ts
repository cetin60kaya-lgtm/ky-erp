import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow=readFileSync(new URL("../../../../.github/workflows/worker-production-release.yml",import.meta.url),"utf8");

test("normal Worker release D1 migrationlarini ayri izin olmadan calistirmaz",()=>{
 assert.ok(workflow.includes(".applyMigrations == true and .migrationApprovedByUser == true"));
 assert.ok(workflow.includes('echo "apply=false" >> "$GITHUB_OUTPUT"'));
 for(const name of [
  "Mail ve muhasebe canonical schema migrationlarini uygula",
  "Personel 0060 hedefli eklemeli D1 migration",
  "Gunluk Operasyon 0061 ek odeme kesinti D1 migration ve kanit"
 ]){
  const step=workflow.slice(workflow.indexOf("      - name: "+name));
  assert.ok(step.startsWith("      - name: "+name));
  assert.ok(step.split("\n").slice(0,3).join("\n").includes("if: steps.migration_gate.outputs.apply == 'true'"));
 }
});

test("kod release'inde D1 musterileri GitHub runner veya artifact ile kopyalanmaz",()=>{
 assert.ok(workflow.includes("Cloudflare D1 Time Travel geri donus noktasini dogrula"));
 assert.ok(workflow.includes("D1_TIME_TRAVEL_READY=true"));
 for(const forbidden of ["wrangler d1 export","actions/upload-artifact","database-backup/"])
  assert.ok(!workflow.includes(forbidden),"yasak tam D1 export: "+forbidden);
 assert.ok(workflow.includes("Canli D1 hedefli salt okunur schema dogrulamasi"));
 assert.ok(workflow.includes("accounting_document_issues"));
 assert.ok(workflow.includes("Worker'i api.kyerp.net adresine dagit"));
});
