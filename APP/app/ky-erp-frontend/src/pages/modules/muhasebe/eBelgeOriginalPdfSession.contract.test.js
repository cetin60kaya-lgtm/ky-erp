import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const file=(relative)=>readFileSync(new URL(relative, import.meta.url),"utf8");
const api=file("../../../services/eBelgeApi.js");
const drawer=file("./EBelgeCenterPage.jsx");
const transport=file("../../../utils/api.js");
test("PDF açma ERP ana sekmesini blob URL'sine taşımaz",()=>{
  const fn=api.slice(api.indexOf("export function openEBelgeBlob"));
  assert.match(fn,/reservedWindow\.location\.replace\(url\)/);
  assert.doesNotMatch(fn,/window\.location\.assign\(/);
  assert.match(fn,/Belge sekmesi açılamadı/);
  assert.match(fn,/10 \* 60_000/);
});
test("PDF/API hatasında belge hazırlanıyor sekmesi kapanır; belge detayı tekrar yüklenmez",()=>{
  const fn=drawer.slice(drawer.indexOf("  const preview = async (file) => {"),
    drawer.indexOf("  const openSupplierAccountingPdf", drawer.indexOf("  const preview = async (file) => {")));
  assert.match(fn,/getEBelgeFilePreview\(file\.id\)/);
  assert.match(fn,/reservedWindow\.close\(\)/);
  assert.match(fn,/setError\(/);
  assert.doesNotMatch(fn,/action\(/);
});
test("başarısız blob isteği JSON hata kodu olarak ayrıştırılır",()=>{
  assert.match(transport,/if \(responseType === "blob"\) \{/);
  assert.match(transport,/if \(response\.ok\) return response\.blob\(\)/);
  assert.match(transport,/JSON\.parse\(raw\)/);
  assert.match(transport,/String\(authTokenGetter\?\.\(\) \|\| ""\)\.trim\(\) === token/);
});
