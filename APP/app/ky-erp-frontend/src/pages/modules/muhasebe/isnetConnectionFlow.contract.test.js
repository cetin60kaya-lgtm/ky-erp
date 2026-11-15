import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("./EBelgeIntegrationsWorkspace.jsx",import.meta.url),"utf8");
test("İşNet: giriş ekranı parola görünürlük ve açık adımları gösterir",()=>{
  assert.match(source,/aria-label=\{showPassword \? "Şifreyi gizle" : "Şifreyi göster"\}/);
  assert.match(source,/setShowPassword\(\(shown\) => !shown\)/);
  assert.match(source,/Bağlantıyı Doğrula/);
  assert.match(source,/Firmayı Kaydet/);
  assert.match(source,/connectionTest\.saved/);
});
test("İşNet: firma kaydı parolayı ikinci kez göndermez",()=>{
  const segment=source.slice(source.indexOf("async function saveConnection()"),source.indexOf("async function saveBusinessPart("));
  assert.match(segment,/saveIsnetSettings\(\{/);
  assert.doesNotMatch(segment,/password:\s*connection\.password/);
  assert.match(segment,/if \(busy \|\| !connectionTest/);
  assert.match(source,/companies: \[\],\s*companyId: ""/);
});
test("İşNet: Chrome portal girişi kullanıcı tarayıcısında, API ayrı tutulur",()=>{
  assert.match(source,/Chrome · NetteFatura sitesinde giriş/);
  assert.match(source,/İşNet API · resmî yetkiyle otomatik senkronizasyon/);
  assert.match(source,/href="https:\/\/nettefatura\.isnet\.net\.tr\//);
  assert.match(source,/rel="noopener noreferrer"/);
  assert.match(source,/Chrome oturumu İşNet API senkronizasyonu kanıtı değildir/);
  assert.doesNotMatch(source,/<option value="portal">/);
  assert.doesNotMatch(source,/window\.location\.href\s*=|window\.open\(/);
});
