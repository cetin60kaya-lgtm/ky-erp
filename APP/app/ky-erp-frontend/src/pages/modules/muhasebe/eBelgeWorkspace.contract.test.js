import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (url) => readFileSync(new URL(url, import.meta.url), "utf8");

test("e-Belge merkezi dokuz canonical çalışma alanını korur", () => {
  const registry = read("../../../app/moduleRegistryBase.js");
  for (const key of [
    "genel-bakis", "gelen-belgeler", "giden-belgeler", "belge-havuzu",
    "eslestirmeler", "onay-sorunlar", "is-akislari", "arsiv-cikti", "entegrasyonlar",
  ]) assert.match(registry, new RegExp(key));
  assert.doesNotMatch(registry, /key: "isnet"/);
});

test("Belge Havuzu yüklemeyi canonical e-Belge API üzerinden yapar", () => {
  const page = read("./EBelgeCenterPage.jsx");
  const send = page.slice(page.indexOf("const send = async"), page.indexOf("return <section className=\"eb-upload-card\""));
  assert.match(send, /uploadEBelge\(files\)/);
  assert.doesNotMatch(send, /reconcileAllEBelge/);
  assert.match(page, /getEBelgeDashboard/);
  assert.match(page, /initialView = "overview"/);
});

test("Belge Havuzu scroll, düzenleme ve güvenli son onay sunar; rutin hard-delete sunmaz", () => {
  const page = read("./EBelgeCenterPage.jsx");
  const css = read("./eBelgeCenter.css");
  const api = read("../../../services/eBelgeApi.js");
  assert.match(page, /const \[from, setFrom\] = useState\(""\)/);
  assert.match(page, /eb-pool-table-scroll/);
  assert.match(css, /\.eb-pool-table-scroll\{/);
  assert.match(page, /Belge Bilgilerini Düzenle/);
  assert.match(page, /Son Onay \/ Muhasebeleştir/);
  assert.doesNotMatch(page, /Tam Sil/);
  assert.doesNotMatch(api, /deleteEBelge/);
});

test("belge penceresi konum ve boyutunu hatırlar, LOT ikinci belgeyi bekler", () => {
  const page = read("./EBelgeCenterPage.jsx");
  const line = read("./EBelgeLineReview.jsx");
  const css = read("./eBelgeCenter.css");
  assert.match(page, /kyerp:ebelge:document-window/);
  assert.match(page, /onPointerDown=\{startDrag\}/);
  assert.match(css, /resize:both/);
  assert.match(line, /İrsaliye \/ LOT bekleniyor/);
  assert.match(line, /hasCounterDocument/);
});
