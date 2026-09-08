import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ai = fs.readFileSync(path.join(here, "ai-cloud.ts"), "utf8");
const wrangler = fs.readFileSync(path.join(here, "..", "wrangler.jsonc"), "utf8");

test("Workers AI requests are routed through the same-account AI Gateway", () => {
  assert.match(ai, /DEFAULT_AI_GATEWAY_ID = "default"/);
  assert.match(ai, /c\.env\.AI\.run\(MODEL,[\s\S]*gatewayOptions\(c,slug,user,pageContext\.module\)/);
  assert.match(ai, /id:\s*gatewayId\(c\)/);
  assert.match(ai, /skipCache:\s*true/);
});

test("AI Gateway defaults to privacy-first no-payload logging behavior", () => {
  assert.match(wrangler, /"AI_GATEWAY_ID":\s*"default"/);
  assert.match(wrangler, /"AI_GATEWAY_COLLECT_LOGS":\s*"false"/);
  assert.match(ai, /gatewayCollectLogs/);
  assert.match(ai, /collectLog:\s*gatewayCollectLogs\(c\)/);
});

test("AI status exposes gateway state without secrets", () => {
  assert.match(ai, /gateway:\{enabled:Boolean\(c\.env\.AI\),id:gatewayId\(c\),skipCache:true,collectLog:gatewayCollectLogs\(c\)\}/);
  assert.doesNotMatch(ai, /AI_GATEWAY_TOKEN|CLOUDFLARE_API_TOKEN/);
});


test("PDKS live AI analysis can run ephemerally without persisting the attendance snapshot", () => {
  assert.match(ai, /const ephemeral=body\.ephemeral===true/);
  assert.match(ai, /const current=ephemeral\?null:await conversationGet/);
  assert.match(ai, /if\(ephemeral\)\{/);
  assert.match(ai, /ephemeral:true/);
});


test("DENETIM PDKS AI never receives File Hub context", () => {
  assert.match(ai, /upper\(user\?\.role\)==="DENETIM"/);
  assert.match(ai, /return\[\]/);
  assert.match(ai, /if\(Array\.isArray\(allowedEntities\)&&!allowedEntities\.length\)return\{rows:\[\],count:0,degraded:false\}/);
});
