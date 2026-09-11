import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("./layouts/AppShellV3.jsx", import.meta.url), "utf8");
const display = readFileSync(new URL("./layouts/DisplaySettingsPanel.jsx", import.meta.url), "utf8");

test("KY Security install controls are shown only to security-eligible accounts", () => {
  assert.match(shell, /apiGet\("\/auth\/push\/config"/);
  assert.match(shell, /phoneApprovalOpen && securityAppEligible/);
  assert.match(display, /securityAppEligible \? \(/);
});
