import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const deploy = readFileSync(resolve(here, "../../../../DEPLOY/KYERP_DIRECT_PRODUCTION_V3.ps1"), "utf8");

test("D1 schema readiness checks columns one-by-one instead of a compound pragma SELECT", () => {
  assert.match(deploy, /function Remote-Column-Exists/);
  assert.match(deploy, /SELECT COUNT\(\*\) AS total FROM pragma_table_info/);
  assert.match(deploy, /\$requiredColumns = @\(/);
  assert.match(deploy, /Remote-Column-Exists \$required\.Table \$required\.Column/);
  assert.doesNotMatch(deploy, /pragma_table_info\('hr_monthly_employees'\)[\s\S]*?UNION ALL/);
});
