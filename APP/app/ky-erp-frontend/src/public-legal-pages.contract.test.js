import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const privacy=readFileSync(new URL("../public/gizlilik.html",import.meta.url),"utf8");
const terms=readFileSync(new URL("../public/kullanim-kosullari.html",import.meta.url),"utf8");
const footer=readFileSync(new URL("./components/public/PublicCorporateFooter.jsx",import.meta.url),"utf8");

test("OAuth kurumsal gizlilik ve kullanım sayfaları herkesin erişebildiği statik HTML olarak yayımlanır",()=>{
 for(const [html,title] of [[privacy,"Gizlilik Politikası"],[terms,"Kullanım Koşulları"]]){
  assert.match(html,/<html lang="tr">/);assert.match(html,/<meta charset="UTF-8">/);
  assert.ok(html.includes("<h1>"+title+"</h1>"));
  assert.match(html,/https:\/\/kyerp\.net\//);
  assert.match(html,/iletisim@kyerp\.net/);
  assert.doesNotMatch(html,/localhost|lorem ipsum/i);
 }
 assert.match(footer,/href="\/gizlilik\.html"/);
 assert.match(footer,/href="\/kullanim-kosullari\.html"/);
});
test("privacy, Google Drive ve güvenlik işlevlerini ayrı açıklar; otomatik rol geçişi vaat etmez",()=>{
 assert.match(privacy,/Google Drive/);
 assert.match(privacy,/OAuth/);
 assert.match(privacy,/MFA/);
 assert.match(privacy,/KVKK/);
 assert.match(privacy,/veri sorumlusu/);
 assert.match(privacy,/myaccount\.google\.com\/permissions/);
});
