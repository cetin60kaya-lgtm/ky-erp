import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAccountingImageWithWorkersAi, workersAiAccountingDocumentStatus } from "./accounting-document-workers-ai.ts";

test("Workers AI belge OCR readiness AI binding ile aktif olur",()=>{
  assert.equal(workersAiAccountingDocumentStatus({}).configured,false);
  assert.equal(workersAiAccountingDocumentStatus({AI:{}}).configured,true);
});

test("Workers AI belge OCR structured sonucu canonical kayda çevirir",async()=>{
  const answer=JSON.stringify({documentKind:"FATURA",partyName:"TEST KİMYA",partyTaxNo:"1234567890",documentNo:"TST2026001",issueDate:"11.09.2026",currency:"TRY",subtotal:1000,taxTotal:200,payableTotal:1200,confidence:.91,lines:[{lineNo:1,description:"WHITE PIGMENT LOT NO: LOT-A1",quantity:10,unitCode:"KG",unitPrice:100,lineTotal:1000,confidence:.9}]});
  const c:any={env:{AI:{run:async()=>({answer})},AI_GATEWAY_ID:"default"},req:{header:()=>"mecit-hakan"},get:()=>"req-test"};
  const file=new File([new Uint8Array([1,2,3,4])],"invoice.png",{type:"image/png"});
  const result=await analyzeAccountingImageWithWorkersAi(c,file,"AUTO");
  assert.equal(result.extractor,"CLOUDFLARE_WORKERS_AI");
  assert.equal(result.documentNo,"TST2026001");
  assert.equal(result.issueDate,"2026-09-11");
  assert.equal(result.payableTotal,1200);
  assert.equal(result.lines[0].lotNo,"LOT-A1");
});