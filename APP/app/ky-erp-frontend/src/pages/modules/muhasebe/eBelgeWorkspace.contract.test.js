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