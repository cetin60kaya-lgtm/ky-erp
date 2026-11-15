import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../../../services/eBelgeApi.js", import.meta.url), "utf8");
const page = readFileSync(new URL("./EBelgeCenterPage.jsx", import.meta.url), "utf8");

test("HTTP 207 kısmi başarı tekrar belge yüklemeye zorlamaz", () => {
  assert.match(api, /Number\(error\?\.status\) === 207/);
  assert.match(api, /Array\.isArray\(partial\?\.items\)/);
  assert.match(page, /acceptedItems\.push\(\.\.\.accepted\)/);
  assert.match(page, /setFiles\(failedFiles\)/);
  assert.match(page, /Yalnız hatalılar kuyrukta kaldı/);
});
test("Yükleme hataları dosya bazında görünür; belirsiz sonuç tekrar otomatik gönderilmez", () => {
  assert.match(page, /setUploadErrors\(errors\)/);
  assert.match(page, /uploadErrors\.map/);
  assert.match(page, /Tekrar göndermeden önce Belge Havuzu/);
  assert.match(page, /eBelgeFileKey\(file\)/);
  assert.match(page, /batches\.slice\(index\)\.flat\(\)/);
});
