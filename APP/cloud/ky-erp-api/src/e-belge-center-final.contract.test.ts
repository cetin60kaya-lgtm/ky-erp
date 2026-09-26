import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("./e-belge-center-cloud.ts",import.meta.url),"utf8");

test("e-Belge dashboard bugun sayacini sisteme alinma zamanindan uretir",()=>{
  assert.match(source,/date\(created_at\)=\?/);
  assert.match(source,/date\(COALESCE\(issue_date,created_at\)\) BETWEEN \? AND \?/);
});

test("e-Belge günlük akışta fiziksel hard-delete açmaz ve posted belgeyi canonical kayıtta korur",()=>{
  assert.doesNotMatch(source,/app\.delete\("\/api\/e-belge\/documents\/:id"/);
  assert.match(source,/d\.deleted_at IS NULL/);
  assert.match(source,/status='POSTED'/);
  assert.match(source,/posted_at/);
  assert.match(source,/idempotent:true/);
});
