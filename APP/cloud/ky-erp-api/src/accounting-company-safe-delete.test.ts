import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./accounting-company-safe-delete.ts", import.meta.url), "utf8");
const registration = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const directory = readFileSync(new URL("./accounting-company-directory.ts", import.meta.url), "utf8");

test("hard delete is manager-only with an explicit, versioned approval", () => {
  assert.match(source, /SUPER_ADMIN.*ADMIN/);
  assert.match(source, /await manager\(c,slug\)/);
  assert.match(source, /confirmCompanyId/);
  assert.match(source, /confirmName/);
  assert.match(source, /confirmPhrase/);
  assert.match(source, /KALICI SIL/);
  assert.match(source, /expectedUpdatedAt/);
});
test("linked companies and nonzero balances are fail closed", () => {
  assert.match(source, /companyHardDeleteAllowed/);
  assert.match(source, /blockedTotal/);
  assert.match(source, /currentBalance/);
  assert.match(source, /openingBalance/);
  assert.match(source, /COMPANY_LINKED/);
  assert.match(source, /sqlite_master/);
  assert.match(source, /PRAGMA table_info/);
  assert.match(source, /refs\.has\(n\)/);
  assert.match(source, /model_records/);
  assert.match(source, /production_records/);
});
test("only company and aliases are physically deleted, accounting records remain", () => {
  const commands = source.match(/DELETE FROM [a-z_]+/g) || [];
  assert.deepEqual([...new Set(commands)].sort(), ["DELETE FROM companies", "DELETE FROM company_aliases"].sort());
  assert.match(source, /activity_logs/);
  assert.match(source, /c\.env\.DB\.batch\(statements\)/);
  assert.match(source, /NOT EXISTS\(SELECT 1 FROM companies/);
  assert.match(registration, /registerAccountingCompanySafeDeleteRoutes\(app\)/);
  assert.match(directory, /COMPANY_PERMANENT_DELETE_DISABLED/);
});
