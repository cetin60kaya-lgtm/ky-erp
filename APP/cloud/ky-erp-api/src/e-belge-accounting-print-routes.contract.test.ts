import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const text=readFileSync(new URL("./e-belge-accounting-print-routes.ts",import.meta.url),"utf8");
const main=readFileSync(new URL("./main.ts",import.meta.url),"utf8");
const pool=readFileSync(new URL("./e-belge-center-cloud.ts",import.meta.url),"utf8");
test("Muhasebe çıktı durumu tek canonical belge kimliği ve tenant ile tutulur",()=>{
 assert.match(text,/EBELGE_ACCOUNTING_PRINT_V1/);
 assert.match(text,/accountingTenantCandidates/);
 assert.match(text,/accountingTenantReadAllowed/);
 assert.match(text,/accountingAccess/);
 assert.match(text,/d\.direction='INCOMING'/);
 assert.match(text,/d\.document_type LIKE '%FATURA%'/);
 assert.match(text,/main_company_slug/);
 assert.match(main,/registerEBelgeAccountingPrintRoutes\(app\)/);
});
test("Yalnız gelen faturada gerçek basımdan sonra açık onayla işaretlenir",()=>{
 assert.match(text,/MARK_PRINTED/);
 assert.match(text,/RESET_PENDING/);
 assert.match(text,/body\.confirmed!==true/);
 assert.match(text,/printedAt/);
 assert.match(text,/printedBy/);
 assert.match(text,/history:/);
 assert.match(text,/reason\.length<6/);
 assert.match(text,/INCOMING_INVOICE_ONLY/);
 assert.doesNotMatch(text,/window\.print|navigator\.print/);
});
test("İşNet benzeri çıktı bekleyenler filtre sunucuda; sayfa bazlı gizleme değil",()=>{
 assert.match(pool,/printStatus=upper\(c\.req\.query\("printStatus"\)\)/);
 assert.match(pool,/NOT EXISTS\(SELECT 1 FROM json_store js/);
 assert.match(pool,/js\.scope='EBELGE_ACCOUNTING_PRINT_V1'/);
});
