import test from "node:test";
import assert from "node:assert/strict";
import { selectOriginalEBelgeFiles } from "./eBelgeOriginalFiles.js";

test("provider XML and PDF remain on the same document card regardless of order", () => {
  const files=[{id:"x1",file_name:"HKN_001.XML"},{id:"p1",file_name:"HKN_001.pdf"}];
  const result=selectOriginalEBelgeFiles(files);
  assert.equal(result.xml.id,"x1");
  assert.equal(result.pdf.id,"p1");
  assert.deepEqual(result.other,[]);
});
test("PDF missing never hides the original XML", () => {
  const result=selectOriginalEBelgeFiles([{id:"x2",extension:"XML"}]);
  assert.equal(result.pdf,null);
  assert.equal(result.xml.id,"x2");
});
test("other attachments are preserved and never treated as original PDF/XML", () => {
  const result=selectOriginalEBelgeFiles([{id:"z",file_name:"scan.jpg"},{id:"x",fileName:"a.xml"},{id:"p",fileName:"a.PDF"}]);
  assert.equal(result.xml.id,"x");assert.equal(result.pdf.id,"p");
  assert.equal(result.other[0].id,"z");
});
test("missing and malformed file lists do not crash document review", () => {
  assert.deepEqual(selectOriginalEBelgeFiles(null),{xml:null,pdf:null,other:[]});
  assert.deepEqual(selectOriginalEBelgeFiles([{},null]),{xml:null,pdf:null,other:[]});
});
