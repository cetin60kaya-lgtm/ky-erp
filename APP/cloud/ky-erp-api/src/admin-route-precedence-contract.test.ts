import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd(), "src");
const source = (name: string) => readFileSync(path.join(root, name), "utf8");

test("legacy admin fallback is registered after every canonical admin route", () => {
  const main = source("main.ts");
  const fallback = main.indexOf("registerIkAdminCloudRoutes(app);");
  assert.notEqual(fallback, -1);

  for (const canonical of [
    "registerAuthAdminHistoryRoutes(app);",
    "registerAdminManagementRoutes(app);",
    "registerOwnerSecurityRoutes(app);",
    "registerAdminCoreRoutes(app);",
    "registerAdminMappingRoutes(app);",
    "registerAdminStorageRoutes(app);",
    "registerAdminBackupRoutes(app);",
    "registerAdminBackupSqlRoutes(app);",
  ]) {
    const position = main.indexOf(canonical);
    assert.notEqual(position, -1, `${canonical} is missing`);
    assert.ok(position < fallback, `${canonical} must be registered before the /api/admin/* fallback`);
  }
});

test("owner and managed-user routes remain explicit canonical endpoints", () => {
  const owner = source("owner-security-cloud.ts");
  assert.match(owner, /app\.get\("\/api\/admin\/managed-users"/);
  assert.match(owner, /app\.get\("\/api\/admin\/security\/application-owner"/);
});
