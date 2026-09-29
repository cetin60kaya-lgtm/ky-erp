import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, "main.jsx"), "utf8");
const landing = fs.readFileSync(path.join(here, "pages", "PublicLandingPage.jsx"), "utf8");
const footer = fs.readFileSync(path.join(here, "components", "public", "PublicCorporateFooter.jsx"), "utf8");
const devices = fs.readFileSync(path.join(here, "components", "public", "PublicDeviceExperience.jsx"), "utf8");

test("kyerp.net is the only user-facing ERP host and login stays in the same React tree", () => {
  assert.match(main, /renderCanonicalHost/);
  assert.match(main, /PublicLandingPage onOpenLogin/);
  assert.match(main, /LoginPage onClose/);
  assert.match(landing, /href="#giris" onClick=\{openLogin\}/);
  for (const source of [main, landing, footer, devices]) assert.doesNotMatch(source, /app\.kyerp\.net/);
});