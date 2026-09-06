import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const approvalsSource = readFileSync(new URL("./AdminMailApprovals.jsx", import.meta.url), "utf8");
const systemSource = readFileSync(new URL("./AdminSystemOverview.jsx", import.meta.url), "utf8");
const companySource = readFileSync(new URL("./AdminCompanyOverview.jsx", import.meta.url), "utf8");
const mailApiSource = readFileSync(new URL("../../services/mailApi.js", import.meta.url), "utf8");

test("mail approvals are visible in management decision centers", () => {
  assert.match(systemSource, /<AdminMailApprovals compact/);
  assert.match(companySource, /<AdminMailApprovals compact onChanged=\{load\}/);
  assert.match(companySource, /Bekleyen Mail Onayı/);
});

test("company owner can approve or reject mail account directly", () => {
  assert.match(approvalsSource, /COMPANY_ADMIN/);
  assert.match(approvalsSource, /decideMailApproval/);
  assert.match(approvalsSource, />Onayla</);
  assert.match(approvalsSource, />Reddet</);
  assert.match(approvalsSource, /Firma sahibi \/ işveren onayı/);
});

test("mail approval API remains wired to backend decision endpoint", () => {
  assert.match(mailApiSource, /\/mail\/approvals/);
  assert.match(mailApiSource, /\/decision/);
});
