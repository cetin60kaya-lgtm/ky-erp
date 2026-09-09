import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bootstrap = readFileSync(resolve(here, "authBootstrap.js"), "utf8");
const main = readFileSync(resolve(here, "../main.jsx"), "utf8");

test("F5 bootstrap reads the canonical persisted auth token before ERP render", () => {
  assert.match(bootstrap, /AUTH_TOKEN_STORAGE_KEY = "kyerp_auth_token"/);
  assert.match(bootstrap, /window\.localStorage\?\.getItem\(AUTH_TOKEN_STORAGE_KEY\)/);
  assert.match(bootstrap, /window\.sessionStorage\?\.getItem\(AUTH_TOKEN_STORAGE_KEY\)/);
  assert.match(bootstrap, /setApiAuthHandlers\(\{/);
  assert.match(bootstrap, /getToken: readPersistedAuthToken/);
  assert.match(main, /installPersistedAuthBootstrap\(\);/);
  assert.ok(
    main.indexOf("installPersistedAuthBootstrap();") < main.indexOf("ReactDOM.createRoot(rootElement).render"),
    "persisted token bootstrap React render'dan once kurulmalidir",
  );
});


test("owner bootstrap stays desktop-session-only but mobile app can resume a bounded session", () => {
  assert.match(bootstrap, /ownerToken/);
  assert.match(bootstrap, /clearPersistentOwnerAuth/);
  assert.match(bootstrap, /AUTH_MOBILE_OWNER_RESUME_KEY/);
  assert.match(bootstrap, /mobileOwnerResumeAllowed/);
  assert.match(bootstrap, /Masaüstünde owner browser restart sonrası kalıcı token kullanamaz/);
  assert.match(bootstrap, /sessionStorage\?\.getItem\(AUTH_TOKEN_STORAGE_KEY\)/);
});
