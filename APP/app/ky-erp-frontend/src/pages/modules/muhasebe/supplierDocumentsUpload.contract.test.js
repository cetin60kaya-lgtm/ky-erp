import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(url)=>readFileSync(new URL(url,import.meta.url),"utf8");

test("Muhasebe tedarikçi ekranı canonical XML/PDF/görsel yüklemeyi doğrudan sunar",()=>{
  const workspace=read("./SupplierDocumentsWorkspace.jsx");
  const api=read("../../../services/eBelgeApi.js");
  assert.match(workspace,/uploadEBelge/);
  assert.match(workspace,/XML \/ PDF \/ Görsel Yükle/);
  assert.match(workspace,/direction: "INCOMING"/);
  assert.match(workspace,/documentKind: "AUTO"/);
  assert.match(api,/pdfjs-dist\/build\/pdf\.mjs/);
  assert.match(api,/preview_/);
  assert.match(api,/\/e-belge\/upload/);
});