import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const view=readFileSync(new URL("./IkAdvancedMonthly.jsx", import.meta.url),"utf8");
const api=readFileSync(new URL("../../../../services/ik/monthlyApi.js", import.meta.url),"utf8");
test("monthly payroll uses existing final-control editor for one-person-at-a-time setup",()=>{
 assert.match(view,/Bu Ayın Maaşlarını Hazırla/);
 assert.match(view,/const startMonthlyPayrollSetup = \(\) =>/);
 assert.match(view,/const \[monthlySetup, setMonthlySetup\] = useState\(null\)/);
 assert.match(view,/Kaydet ve Sonraki Personel/);
 assert.match(view,/continueSetup && !updatePersonnelCard/);
 assert.match(view,/setMonthlySetup\(null\)/);
 assert.match(view,/Ödeme yapılmış sayılmaz/);
});
test("accountant ZIP and changed XLS headers are previewed before any database write",()=>{
 assert.match(view,/expandAccountantPayrollFiles/);
 assert.match(view,/accept="\.xls,\.xlsx,\.zip"/);
 assert.match(view,/modal === "sgkMapping"/);
 assert.match(view,/const applySgkMapping = async/);
 assert.match(view,/Muhasebe Excel Şablonunu Tanıt/);
 assert.match(view,/allowMultipleWorkplaceRows: multiple/);
 assert.match(api,/typeof value === "object" \? JSON\.stringify\(value\)/);
});
test("person card and print source show the same monthly wage amounts",()=>{
 assert.match(view,/Aylık Maaş ve Ödeme Detayı/);
 assert.match(view,/payrollRows\.find\(\(row\) => row\.employee\.id === profile\.id\)/);
 assert.match(view,/const slip = payrollPresentation\(actual\)/);
 assert.match(view,/applyOfficialBankSuggestion/);
 assert.match(view,/data\.sgkImport && employees\.find/);
 assert.match(view,/Resmî Net İstihkak/);
 assert.match(view,/const slipPayment = \(row\) => payrollPresentation\(row\)/);
});
