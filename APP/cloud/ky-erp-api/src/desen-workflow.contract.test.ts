import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const agent = readFileSync(new URL("./file-hub-agent-public.ts", import.meta.url), "utf8");
const sync = readFileSync(new URL("./file-hub-design-sync.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("./desen-storage.ts", import.meta.url), "utf8");
const workflow = readFileSync(new URL("./desen-workflow.ts", import.meta.url), "utf8");

test("Desen canonical routes and File Hub sync stay wired", () => {
  assert.match(main, /registerDesenStorageRoutes\(app\)/);
  assert.match(main, /registerDesenWorkflowRoutes\(app\)/);
  assert.match(main, /registerDesenOperationRoutes\(app\)/);
  assert.match(agent, /syncFileHubDesignModel/);
  assert.match(agent, /moduleCode==="DESEN"/);
  assert.match(agent, /MODEL_IMAGE/);
  assert.match(agent, /MODEL_SOURCE/);
  assert.match(agent, /PLACEMENT/);
  assert.match(agent, /OUTGOING_DESIGN/);
});

test("File Hub remains physical source while R2 is preview/cache or manual inbox", () => {
  assert.match(sync, /physicalSourceIsProvider:true/);
  assert.match(sync, /r2Role:"PREVIEW_CACHE_ONLY"/);
  assert.match(storage, /desen\/inbox\/\$\{slug\}/);
  assert.match(storage, /openLocalFolder: false/);
});

test("Desen model workflow persists canonical model_records and Boyahane linkage", () => {
  assert.match(workflow, /model_records/);
  assert.match(workflow, /BOYAHANE_JOB_SCOPE/);
  assert.match(workflow, /BOYAHANE_REGISTERED_COLOR/);
  assert.match(workflow, /upsertCanonicalModel/);
});
