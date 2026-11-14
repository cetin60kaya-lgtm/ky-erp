import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../../../services/eBelgeApi.js", import.meta.url), "utf8");
const page = readFileSync(new URL("./EBelgeCenterPage.jsx", import.meta.url), "utf8");

test("HTTP 207 kısmi başarı tekrar belge yüklemeye zorlamaz", () => {
  assert.match(api, /Number\(error\?\.status\) === 207/);
  assert.match(api, /Array\.isArray\(partial\?\.items\)/);
  assert.match(page, /setFiles\(\(current\) => failed \? current\.filter/);
  assert.match(page, /Başarılı dosyaları yeniden yüklemeyin/);
});
test("Yükleme hataları dosya bazında görünür; belirsiz sonuç tekrar otomatik gönderilmez", () => {
  assert.match(page, /setUploadErrors\(errors\)/);
  assert.match(page, /uploadErrors\.map/);
  assert.match(page, /Sonuç belirsizse yeniden yüklemeden önce Belge Havuzu/);
  assert.match(page, /file\.name\}\|\$\{file\.size\}\|\$\{file\.lastModified\}/);
});
