import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(name:string)=>readFileSync(new URL(name,import.meta.url),"utf8");

test("Document Intelligence readiness does not expose secrets and blocks scan before staging",()=>{
  const intelligence=read("./accounting-document-intelligence.ts");
  const accounting=read("./accounting-document-core.ts");
  const ebelge=read("./e-belge-center-cloud.ts");
  assert.match(intelligence,/accountingDocumentIntelligenceStatus/);
  assert.match(intelligence,/endpointConfigured/);
  assert.match(intelligence,/keyConfigured/);
  assert.match(accounting,/belge-havuzu\/ocr-status/);
  assert.match(accounting,/DOCINTEL_NOT_CONFIGURED/);
  assert.match(ebelge,/accountingDocumentIntelligenceStatus/);
  assert.match(ebelge,/XML yükleme kullanılabilir/);
  const readinessPos=ebelge.indexOf("accountingDocumentIntelligenceStatus(c.env as any)");
  const stagePos=ebelge.indexOf("const asset=await stageFile(c,slug,file)",readinessPos);
  assert.ok(readinessPos>=0 && stagePos>readinessPos);
  assert.doesNotMatch(intelligence,/key:\s*text\(env\?\.AZURE_DOCUMENT_INTELLIGENCE_KEY/);
});
