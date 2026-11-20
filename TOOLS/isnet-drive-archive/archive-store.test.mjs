import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {archiveOriginals,documentDirectory,analyzeUbl} from "./archive-store.mjs";

const item={sourceKey:"incoming_invoice",sourceId:"123456",no:"HKN2026000000995",
  kind:"invoice",direction:"incoming",date:"20.11.2026",uuid:"12345678-90ab-cdef"};
const xml=Buffer.from('<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">HKN2026000000995</cbc:ID><cbc:UUID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">12-34</cbc:UUID></Invoice>');
const pdf=Buffer.from("%PDF-1.7\nVALID_TEST_NO_REAL_DOCUMENT");
test("first import creates one original XML and PDF, second import creates no copies",async()=>{
  const root=await mkdtemp(join(tmpdir(),"ky-isnet-"));
  try{
    const first=await archiveOriginals({root,document:item,companyId:"99",xml,pdf});
    assert.equal(first.status,"XML_PDF");assert.equal(first.xml,"saved");assert.equal(first.pdf,"saved");
    const again=await archiveOriginals({root,document:item,companyId:"99",xml,pdf});
    assert.equal(again.xml,"existing");assert.equal(again.pdf,"existing");
    const files=await readdir(first.directory);assert.deepEqual(files.sort(),["HKN2026000000995.pdf","HKN2026000000995.xml","kayit.json"]);
    assert.deepEqual(await readFile(join(first.directory,"HKN2026000000995.xml")),xml);
    assert.deepEqual(await readFile(join(first.directory,"HKN2026000000995.pdf")),pdf);
    const m=JSON.parse(await readFile(join(first.directory,"kayit.json"),"utf8"));
    assert.equal(m.files.xml.name,"HKN2026000000995.xml");assert.equal(m.files.pdf.name,"HKN2026000000995.pdf");
    assert.ok(!JSON.stringify(m).includes("Password"));
  }finally{await rm(root,{force:true,recursive:true});}
});
test("PDF failure persists original XML and a retry fills only missing PDF",async()=>{
  const root=await mkdtemp(join(tmpdir(),"ky-isnet-"));
  try{
    const first=await archiveOriginals({root,document:item,companyId:"99",xml,pdfError:"PDF unavailable"});
    assert.equal(first.status,"PDF_EKSIK");assert.equal(first.xml,"saved");
    const second=await archiveOriginals({root,document:item,companyId:"99",xml,pdf});
    assert.equal(second.status,"XML_PDF");assert.equal(second.xml,"existing");assert.equal(second.pdf,"saved");
  }finally{await rm(root,{force:true,recursive:true});}
});
test("changed bytes never replace the archived original",async()=>{
  const root=await mkdtemp(join(tmpdir(),"ky-isnet-"));
  try{
    await archiveOriginals({root,document:item,companyId:"99",xml,pdf});
    await assert.rejects(()=>archiveOriginals({root,document:item,companyId:"99",xml:Buffer.from(xml.toString().replace("12-34","different")),pdf}),/ORIJINAL_DOSYA_CAKISMASI/);
  }finally{await rm(root,{force:true,recursive:true});}
});
test("invalid IDs and path traversal never escape the canonical folder",()=>{
  assert.throws(()=>documentDirectory("C:\\x",{...item,sourceId:"../foo",companyId:"99"}),/BELGE_KIMLIGI_GECERSIZ/);
  const p=documentDirectory("C:\\x",{...item,no:"../../secrets",companyId:"99"});
  assert.ok(!p.includes(".."));
  assert.equal(analyzeUbl(xml).kind,"FATURA");
});
