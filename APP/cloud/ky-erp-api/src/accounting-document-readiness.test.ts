import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(name:string)=>readFileSync(new URL(name,import.meta.url),"utf8");

test("Document Intelligence readiness uses Workers AI fallback without exposing secrets",()=>{
  const intelligence=read("./accounting-document-intelligence.ts");
  const workersAi=read("./accounting-document-workers-ai.ts");
  const accounting=read("./accounting-document-core.ts");
  const ebelge=read("./e-belge-center-cloud.ts");
  assert.match(intelligence,/accountingDocumentIntelligenceStatus/);
  assert.match(intelligence,/workersAiConfigured/);
  assert.match(intelligence,/azureConfigured/);
  assert.match(workersAi,/CLOUDFLARE_WORKERS_AI/);
  assert.match(workersAi,/moondream3\.1-9B-A2B/);
  assert.match(accounting,/belge-havuzu\/ocr-status/);
  assert.match(ebelge,/PDF_OCR_PREVIEW_REQUIRED/);
  assert.match(ebelge,/preview_/);
  const readinessPos=ebelge.indexOf("accountingDocumentIntelligenceStatus(c.env as any)");
  const stagePos=ebelge.indexOf("const asset=await stageFile(c,slug,file)",readinessPos);
  assert.ok(readinessPos>=0 && stagePos>readinessPos);
  assert.doesNotMatch(intelligence,/key:\s*text\(env\?\.AZURE_DOCUMENT_INTELLIGENCE_KEY/);
});