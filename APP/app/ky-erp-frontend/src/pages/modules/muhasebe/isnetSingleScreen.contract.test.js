import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./EBelgeIsnetPortalSync.jsx", import.meta.url),"utf8");
const incoming = readFileSync(new URL("./IncomingDispatchBillingWorkspace.jsx", import.meta.url),"utf8");
const center = readFileSync(new URL("./EBelgeCenterPage.jsx", import.meta.url),"utf8");
const headers = readFileSync(new URL("../../../../public/_headers", import.meta.url),"utf8");
test("İşNet tek ekranda sağlık ve dört belge yönü bulunur; kör iframe açılmaz",()=>{
  assert.match(source,/LOCAL_HEALTH_URL/);
  assert.match(source,/detail\?\.adapter !== "KY_ISNET_DRIVE_ARCHIVE_V1"/);
  assert.match(source,/\{connected && <div className="eis-local-embedded/);
  assert.match(source,/loopback-network/);
  assert.match(source,/local-network-access/);
  assert.match(source,/Gelen e-İrsaliye/);
  assert.match(source,/Giden e-İrsaliye/);
  assert.match(headers,/Permissions-Policy: loopback-network=/);
});
test("Gelen irsaliye aynı havuzda müşteri/tedarikçi ve fatura bağı ayrılır",()=>{
  assert.match(center,/view === "incoming-dispatches" && <IncomingDispatchBillingWorkspace/);
  assert.match(incoming,/customerLinkMissing/);
  assert.match(incoming,/SUPPLIER/);
  assert.match(incoming,/ROLE_REVIEW/);
  assert.match(incoming,/INVOICE_LINK_MISSING/);
  assert.match(incoming,/onOpenDocument\?\.\(row.id\)/);
  assert.doesNotMatch(incoming,/apiPost|window\.location\.assign/);
});

const official = readFileSync(new URL("./IsnetOfficialWorkspace.jsx",import.meta.url),"utf8");
test("operator starts outside TEST; SOAP catalogue is explicitly read-only and official actions stay disabled",()=>{
 assert.match(official,/\[technical,setTechnical\]=useState\(false\)/);assert.match(official,/technical&&<section/);assert.match(official,/isnet-provider-catalog/);assert.match(official,/WSDL_DISCOVERED/);assert.match(official,/data.environment!=="TEST"/);assert.match(official,/disabled title="Sağlayıcı gönderim kabulü bekliyor"/);assert.doesNotMatch(official,/apiPost|apiPut/);
});

const families = readFileSync(new URL("./isnetOperatorFamilies.js",import.meta.url),"utf8");
const manager = readFileSync(new URL("./EBelgeAdapterManager.jsx",import.meta.url),"utf8");
test("İşNet belge aileleri ve gerçek günlük çalışma alanı, TEST dışında varsayılan giriş",()=>{
 assert.match(manager,/\[panel,setPanel\]=useState\("official"\)/);
 assert.match(official,/KYERP_DOCUMENT_FLOW\.map/);
 assert.match(official,/family\.actions\.map/);
 assert.match(official,/Servis kabulü bekliyor/);
 assert.match(official,/onOpenProfile/);
 for(const method of ["GetCompanyBalance","GetDespatchTaxPayer","SendDespatchAdviceXml","SendReceiptAdviceXml","ContestArchiveInvoice","CreateReturnInvoice","SearchExpenseVoucher","GetAbbreviationReport"])assert.ok(families.includes('"'+method+'"'));
 assert.match(families,/Kontör bakiyesi/);
 assert.doesNotMatch(families,/SendDespatchAdviceXML|SendReceiptAdviceXML/);
});
