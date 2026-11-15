import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("./e-belge-visual-profile-routes.ts",import.meta.url),"utf8");
const app=readFileSync(new URL("./main.ts",import.meta.url),"utf8");
test("Şablon kaydı belge bazlı çift örnek ve issuer+kind ile tenant içinde tutulur",()=>{
 assert.match(source,/visual-profiles\/sample/);
 assert.match(source,/confirmedSameDocument/);
 assert.match(source,/filename\(xml.name\)!==filename\(reference.name\)/);
 assert.match(source,/main_company_slug=\?/);
 assert.match(source,/referenceMatchDeclared:true/);
 assert.match(source,/visualOutputVerified:false,approved:false/);
});
test("XML/PDF referansları GitHub değil private R2 ve onay olmadan müşteri gönderimi yok",()=>{
 assert.match(source,/c\.env\.FILES\.put\(sourceKey/);
 assert.match(source,/c\.env\.FILES\.put\(referenceKey/);
 assert.match(source,/accountingTenantReadAllowed/);
 assert.match(source,/accountingAccess/);
 assert.doesNotMatch(source,/autoSend:true|sendInvoice|postAccountingDocument/);
 assert.match(app,/registerEBelgeVisualProfileRoutes\(app\)/);
});

test("Önceden onaylanan örnek XML, yalnız aynı tenant yetkisiyle yeniden açılabilir",()=>{
 assert.match(source,/visual-profiles\/\:issuer\/\:kind\/sample-xml/);
 assert.match(source,/await authorize\(c,"GET"\)/);
 assert.match(source,/profile\.sourceXmlKey/);
 assert.match(source,/c\.env\.FILES\.get\(text\(profile\.sourceXmlKey\)\)/);
 assert.match(source,/Cache-Control":"private, no-store"/);
 assert.doesNotMatch(source,/referenceHash.*sendInvoice/);
});
