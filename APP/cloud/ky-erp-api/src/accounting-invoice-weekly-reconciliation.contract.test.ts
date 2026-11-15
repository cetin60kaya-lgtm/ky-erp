import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("./accounting-invoice-weekly-reconciliation.ts",import.meta.url),"utf8");
const router=readFileSync(new URL("./accounting-invoice-mail-routes.ts",import.meta.url),"utf8");
test("Weekly workbook intake uses XLSX and accepts HKN while keeping tenant boundaries",()=>{
 assert.match(source,/import \* as XLSX from "xlsx"/);
 assert.match(source,/invoice-weekly-reconciliations\/import/);
 assert.match(source,/companyId/);
 assert.match(source,/main_company_slug=\?/);
 assert.match(source,/party_company_id=\?/);
 assert.match(source,/HKN\[0-9\]/);
});
test("List evidence cannot be treated as payment or saved to financial ledger",()=>{
 for(const word of ["CUSTOMER_LISTED","NOT_LISTED","AWAITING_EXCEL","MANUAL_INCLUDED","MANUAL_EXCLUDED","EXTRA_IN_CUSTOMER_LIST"]){
  assert.ok(source.includes(word),word);
 }
 assert.doesNotMatch(source,/INSERT INTO (?:cari_movements|current_account_movements|payment_transactions)/i);
 assert.doesNotMatch(source,/UPDATE (?:cari_movements|current_account_movements|payment_transactions)/i);
 assert.match(source,/WHERE id=\? AND scope=\? AND main_company_slug=\? AND data=\?/);
});
test("Weekly router is registered once with existing invoice mail routes",()=>{
 assert.match(router,/registerInvoiceWeeklyReconciliationRoutes\(app\)/);
});
