import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL(".",import.meta.url);
const read=name=>readFileSync(new URL(name,root),"utf8");
const menu=read("../../../app/moduleRegistry.js");
const page=read("../MuhasebePage.jsx");
const sales=read("./CustomerDocumentsWorkspace.jsx");
const center=read("./InvoiceMailReconciliationCenter.jsx");
const discrepancy=read("./InvoiceDifferenceMailDraft.jsx");
test("Invoice mail is a distinct Muhasebe navigation tab outside sales",()=>{
 assert.match(menu,/fatura-mail-mutabakat.*Fatura Mail & Mutabakat/);
 assert.match(page,/InvoiceMailReconciliationCenter/);
 assert.doesNotMatch(sales,/<InvoiceMailWorkspace/);
 assert.doesNotMatch(sales,/setView\("mail"\)/);
 assert.match(sales,/tabKey:"fatura-mail-mutabakat"/);
});
test("Weekly list and cash collection are labelled separately",()=>{
 assert.match(center,/Ödemeye Alınanlar/);
 assert.match(center,/Ödemeye Alınmayanlar/);
 assert.match(center,/AWAITING_EXCEL/);
 assert.match(center,/banka tahsilatından ayrıdır/);
 assert.match(center,/MANUAL_INCLUDED/);
 assert.match(center,/MANUAL_EXCLUDED/);
});
test("Difference response is a draft and must be reviewed by a human",()=>{
 assert.match(discrepancy,/createMailDraft/);
 assert.doesNotMatch(discrepancy,/sendMailDraft/);
 assert.match(discrepancy,/!ack/);
 assert.match(discrepancy,/matchingRoutes/);
});
