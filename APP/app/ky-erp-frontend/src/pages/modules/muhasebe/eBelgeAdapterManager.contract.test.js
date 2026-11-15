import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("./EBelgeAdapterManager.jsx",import.meta.url),"utf8");
const parent=readFileSync(new URL("./EBelgeCenterPage.jsx",import.meta.url),"utf8");
const css=readFileSync(new URL("./eBelgeAdapterManager.css",import.meta.url),"utf8");
const client=readFileSync(new URL("../../../services/eBelgeAdapterApi.js",import.meta.url),"utf8");
const isnetUi=readFileSync(new URL("./EBelgeIntegrationsWorkspace.jsx",import.meta.url),"utf8");
const isnetClient=readFileSync(new URL("../../../services/isnetApi.js",import.meta.url),"utf8");

test("Firma entegrasyonları tek açılır seçiciden seçilir, katalog yalnız Ekle ile açılır",()=>{
 assert.match(ui,/companyAdapters\.filter\(x=>x.selected\)/);
 assert.match(ui,/enabled\.has\(x.key\)/);
 assert.match(ui,/Sistem Entegrasyon Kataloğu/);
 assert.match(ui,/Entegrasyon Ekle/);
 assert.match(ui,/aria-expanded=\{showCatalog\}/);
 assert.match(ui,/select id="eam-company-integration"/);
 assert.match(ui,/setSelected\(e.target.value\)/);
 assert.match(css,/\.eam-catalog-popup\{position:absolute/);
 assert.doesNotMatch(ui,/eam-sidebar|eam-workspace|eam-item-main/);
 assert.match(parent,/<EBelgeAdapterManager /);
});
test("Seçilen entegrasyon tam genişlikte açılır ve silme tüm belgeleri etkilemez",()=>{
 assert.match(ui,/active.key==="ISNET"/);
 assert.match(ui,/<EBelgeIntegrationsWorkspace /);
 assert.match(ui,/active.key==="MANUAL"/);
 assert.match(ui,/tabKey:"belge-havuzu"/);
 assert.match(ui,/Listeden Çıkar/);
 assert.match(ui,/gerçek bağlantısı ayrıca doğrulanacaktır/);
 assert.doesNotMatch(ui,/DELETE FROM|hardDeleteDocument|deleteInvoice/);
 assert.match(client,/\/e-belge\/adapters/);
 assert.match(css,/\.eam-detail-pane\{/);
});
test("Firma geçişinde eski istek ve oturum ayarları diğer firma ekranına taşınmaz",()=>{
 assert.match(ui,/const requestSeq=useRef\(0\)/);
 assert.match(ui,/seq!==requestSeq.current/);
 assert.match(ui,/next.mainCompanySlug/);
 assert.match(ui,/data.mainCompanySlug===tenant/);
 assert.match(ui,/getCompanyEBelgeAdapters\(owner\)/);
 assert.match(client,/forceFresh:true/);
});
test("Kurulu olmayan sağlayıcıya rastgele URL ya da sahte sürücü tanımlanmaz",()=>{
 assert.match(ui,/Bağlayıcı motoru henüz hazır değil/);
 assert.match(ui,/driver===null/);
 assert.match(ui,/providerService\(active.key\)/);
 assert.match(ui,/https:\/\/einvoiceapi\.isnet\.net\.tr/);
 assert.match(ui,/key==="MANUAL"/);
 assert.match(ui,/setCompanyEBelgeAdapter\(owner,adapter.key,add,activate\)/);
});
test("İşNet seçili firma ve son testi yeniden okumada korur; portal ile API doğrulamasını ayırır",()=>{
 assert.match(isnetUi,/savedCompanyId/);
 assert.match(isnetUi,/savedCompanyName/);
 assert.match(isnetUi,/Firma kayıtlı · portal bağlantısı/);
 assert.match(isnetUi,/Kayıtlı yetkili firma/);
 assert.match(isnetUi,/lastTest/);
 assert.match(isnetUi,/getIsnetSettings\(\)/);
 assert.match(isnetClient,/forceFresh:true/);
});
test("Gelen XML örneği indirme ayrı kullanıcı tıklamasıdır, muhasebe yazımı yoktur",()=>{
 assert.match(isnetUi,/downloadIsnetReadOnlyXmlSample/);
 assert.match(isnetUi,/downloadXmlSample\("invoice"\)/);
 assert.match(isnetUi,/downloadXmlSample\("despatch"\)/);
 assert.match(isnetUi,/readOnlyCheck\?\.verified&&/);
 assert.match(isnetUi,/Bir Gelen Fatura XML İndir/);
 assert.match(isnetUi,/Bir Gelen İrsaliye XML İndir/);
 assert.match(isnetClient,/api-read-only-xml-sample/);
 assert.doesNotMatch(isnetClient,/approveInvoice|sendInvoice|ingestProviderEBelgeXml/);
});
