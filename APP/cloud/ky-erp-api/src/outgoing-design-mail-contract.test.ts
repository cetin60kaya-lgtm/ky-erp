import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const apiRoot = path.resolve(import.meta.dirname);
const repoRoot = path.resolve(apiRoot, "../../../..");
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");

test("giden desen mail route and File Hub event hook are registered", () => {
  const main = read("APP/cloud/ky-erp-api/src/main.ts");
  const agent = read("APP/cloud/ky-erp-api/src/file-hub-agent-public.ts");
  assert.match(main, /registerOutgoingDesignMailRoutes\(app\)/);
  assert.match(agent, /binding\?\.purposeCode==="OUTGOING_DESIGN"/);
  assert.match(agent, /handleOutgoingDesignMailEvent/);
});

test("initial scan never sends mail; only filesystem watch can trigger it", () => {
  const automation = read("APP/cloud/ky-erp-api/src/outgoing-design-mail.ts");
  const agent = read("tools/file-hub-agent/file-hub-agent.mjs");
  assert.match(automation, /sourceEvent!=="WATCH"/);
  assert.match(agent, /sourceEvent = "SCAN"/);
  assert.match(agent, /ingestFile\(connection, absolute, "WATCH"\)/);
});

test("Gmail send is idempotent and user-facing Desen screen is wired", () => {
  const gmail = read("APP/cloud/ky-erp-api/src/mail-google-gmail.ts");
  const screen = read("APP/app/ky-erp-frontend/src/pages/desen/DesenGidenDesenler.jsx");
  const registry = read("APP/app/ky-erp-frontend/src/app/moduleRegistryBase.js");
  assert.match(gmail, /logical_event_id/);
  assert.match(gmail, /upper\(existing\.status\)===\"ACCEPTED\"/);
  assert.match(screen, /\/desen\/outgoing-mail\/config/);
  assert.match(screen, /\/desen\/outgoing-mail\/test/);
  assert.match(registry, /\[\"giden-desenler", \"Giden Desenler\"/);
});
