import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("./file-hub.ts",import.meta.url),"utf8");
test("File Hub dosya indeksi tenant filtreli toplam sayıyı ve sayfalamayı raporlar",()=>{
 assert.match(source,/app\.get\("\/api\/file-hub\/files"/);
 assert.match(source,/a\.main_company_slug=\?/);
 assert.match(source,/COUNT\(DISTINCT a\.id\) total/);
 assert.match(source,/LIMIT \? OFFSET \?/);
 assert.match(source,/page:\{total,offset,take,hasMore:/);
 assert.match(source,/Math\.min\(500,Math\.max\(1/);
});
