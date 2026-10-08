import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const frontend=resolve(here,"../../");
const file=(path)=>readFileSync(resolve(frontend,path),"utf8");

test("one PDKS workspace, no legacy PDKS forms or old nested tabs",()=>{
  const host=file("AppV3.jsx");
  const registry=file("app/pdksModuleRegistryPatch.js");
  assert.match(host,/import\("\.\/pages\/pdksUnified\/PdksUnifiedApp\.jsx"\)/);
  assert.doesNotMatch(host,/import\("\.\/pages\/modules\/PdksPage"\)/);
  assert.match(registry,/key: "pdks"/);
  assert.match(registry,/\["workspace", "KY PDKS", "dashboard"\]/);
  const page=file("pages/pdksUnified/PdksUnifiedApp.jsx");
  assert.doesNotMatch(page,/\.\/pages\/modules\/PdksPage|PdksPageV2/);
  assert.match(page,/useUnifiedPdksData/);
  assert.match(page,/sourceForTab/);
});

test("standalone preview never imports staff API and cannot enable writes",()=>{
  const main=file("main.jsx");
  assert.match(main,/import\.meta\.env\.DEV/);
  assert.match(main,/hostname\)/);
  assert.match(main,/previewOnly/);
  const source=file("pages/pdksUnified/PdksUnifiedApp.jsx");
  assert.doesNotMatch(source,/savePdksTimeEvent|savePdksDayOverride|addPdksTimeEvent\(/);
  assert.match(source,/useUnifiedPdksData/);
  const data=file("pages/pdksUnified/useUnifiedPdksData.js");
  assert.match(data,/if\(previewOnly \|\| !company/);
  assert.match(data,/profileReady/);
  assert.match(data,/cancelled/);
});

test("mobile API uses production canonical origin not localhost for production",()=>{
  const source=file("utils/api.js");
  assert.match(source,/const PRODUCTION_API_ORIGIN = "https:\/\/api\.kyerp\.net"/);
  assert.match(source,/if \(isProd\) return.*PRODUCTION_API_ORIGIN/);
});
