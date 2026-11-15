import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("./EBelgeAdapterManager.jsx",import.meta.url),"utf8");
const parent=readFileSync(new URL("./EBelgeCenterPage.jsx",import.meta.url),"utf8");
const client=readFileSync(new URL("../../../services/eBelgeAdapterApi.js",import.meta.url),"utf8");
test("Firma seçimi ile platform adaptör kataloğu ayrı, sayfa sadece seçili adaptörleri listeler",()=>{
 assert.match(ui,/companyAdapters\.filter\(x=>x.selected\)/);
 assert.match(ui,/enabled\.has\(x.key\)/);
 assert.match(ui,/Sistem Adaptör Kataloğu/);
 assert.match(ui,/Adaptör Ekle/);
 assert.match(ui,/Kaldır/);
 assert.match(parent,/<EBelgeAdapterManager /);
 assert.doesNotMatch(parent,/<article key=\{key \|\| provider.label\} className/);
});
test("Adaptöre tıklama sağlayıcı ayar ekranına gider ve sahte PASS veya evrak silme bulunmaz",()=>{
 assert.match(ui,/setSelected\(adapter.key\)/);
 assert.match(ui,/active.key==="ISNET"/);
 assert.match(ui,/<EBelgeIntegrationsWorkspace /);
 assert.match(ui,/active.key==="MANUAL"/);
 assert.match(ui,/tabKey:"belge-havuzu"/);
 assert.match(ui,/gerçek bağlantısı ayrıca doğrulanacaktır/);
 assert.doesNotMatch(ui,/DELETE FROM|hardDeleteDocument|deleteInvoice/);
 assert.match(client,/\/e-belge\/adapters/);
});

test("Firma geçişi sırasında eski istek ekranı güncellemez ve liste önbellekten okunmaz",()=>{
 assert.match(ui,/const requestSeq=useRef\(0\)/);
 assert.match(ui,/seq!==requestSeq.current/);
 assert.match(ui,/next.mainCompanySlug/);
 assert.match(ui,/data.mainCompanySlug===tenant/);
 assert.match(ui,/Firma adaptörleri yüklenemedi/);
 assert.match(client,/forceFresh:true/);
});

test("Adaptör seçimi, etkin/pasif ve kaldırma ayrı güvenli işlemler olarak gösterilir",()=>{
 assert.match(ui,/Bu Firmanın Adaptörleri/);
 assert.match(ui,/Sistem Adaptör Kataloğu/);
 assert.match(ui,/enabled===false/);
 assert.match(ui,/Etkinleştir/);
 assert.match(ui,/Pasife Al/);
 assert.match(ui,/Listeden Çıkar/);
 assert.match(ui,/İşNet'i Ekle/);
 assert.match(ui,/setCompanyEBelgeAdapter\(owner,adapter.key,add,activate\)/);
 assert.match(parent,/view !== "integrations"/);
});
