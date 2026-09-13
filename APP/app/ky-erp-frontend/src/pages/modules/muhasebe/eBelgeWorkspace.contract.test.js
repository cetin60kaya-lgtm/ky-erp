import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(url)=>readFileSync(new URL(url,import.meta.url),"utf8");

test("e-Belge merkezi dört sade çalışma alanını korur",()=>{
  const registry=read("../../../app/moduleRegistry.js");
  for(const key of ["e-belge-ana-sayfa","e-belge-yukleme","e-belge-merkezi","e-belge-moduller"]){
    assert.match(registry,new RegExp(key));
  }
});

test("yükleme havuzu bloke etmeden sonucu hemen gösterir",()=>{
  const page=read("./EBelgeCenterPage.jsx");
  const send=page.slice(page.indexOf("const send = async"),page.indexOf("return <section className=\"eb-upload-card\""));
  assert.match(send,/uploadEBelge\(files\)/);
  assert.doesNotMatch(send,/reconcileAllEBelge/);
  assert.match(page,/getEBelgeDashboard/);
  assert.match(page,/initialView = "overview"/);
});
test("Belge Havuzu filtreyi bos acip scroll, duzenle ve Tam Sil sunar",()=>{
  const page=read("./EBelgeCenterPage.jsx");
  const css=read("./eBelgeCenter.css");
  const api=read("../../../services/eBelgeApi.js");
  assert.match(page,/const \[from, setFrom\] = useState\(""\)/);
  assert.match(page,/const \[to, setTo\] = useState\(""\)/);
  assert.match(page,/eb-pool-table-scroll/);
  assert.match(css,/\.eb-pool-table-scroll\{/);
  assert.match(page,/Belge Bilgilerini Düzenle/);
  assert.match(page,/eb-document-modal/);
  assert.match(page,/eb-submodal-backdrop/);
  assert.match(page,/Tam Sil/);
  assert.match(api,/deleteEBelge/);
});

test("belge penceresi konum ve boyutunu hatirlar, LOT ikinci belgeyi bekler",()=>{
  const page=read("./EBelgeCenterPage.jsx");
  const line=read("./EBelgeLineReview.jsx");
  const css=read("./eBelgeCenter.css");
  assert.match(page,/kyerp:ebelge:document-window/);
  assert.match(page,/onPointerDown=\{startDrag\}/);
  assert.match(css,/resize:both/);
  assert.match(line,/İrsaliye \/ LOT bekleniyor/);
  assert.match(line,/hasCounterDocument/);
});
