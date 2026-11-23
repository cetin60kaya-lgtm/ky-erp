import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./accounting-company-safe-delete.ts", import.meta.url), "utf8");
const linkScan = readFileSync(new URL("./accounting-company-link-scan.ts", import.meta.url), "utf8");
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
  assert.match(linkScan, /sqlite_master/);
  assert.match(linkScan, /pragma_table_info/);
  assert.match(linkScan, /refs\.has\(n\)/);
  assert.match(linkScan, /model_records/);
  assert.match(linkScan, /json_store/);
  assert.match(linkScan, /INSTR\(COALESCE/);
  assert.match(linkScan, /production_records/);
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

test("alias-first ordering keeps referentially protected empty duplicates removable", () => {
  const hardDelete = source.slice(source.indexOf("const statements = ["), source.indexOf("const results = await c.env.DB.batch"));
  const merge = source.slice(source.indexOf("const actions = ["), source.indexOf("const done = await c.env.DB.batch"));
  assert.ok(hardDelete.indexOf("DELETE FROM company_aliases") < hardDelete.indexOf("DELETE FROM companies"));
  assert.ok(merge.indexOf("UPDATE company_aliases") < merge.indexOf("DELETE FROM companies"));
  assert.match(source, /if \(!results\[1\]\?\.meta\?\.changes\)/);
  assert.match(source, /if \(!done\[1\]\?\.meta\?\.changes\)/);
});
