import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "notifications-cloud.ts"), "utf8");

test("notifications runtime uses explicit TypeScript ESM imports under Node tests", () => {
  assert.match(source, /from "\.\/auth-cloud\.ts"/);
  assert.match(source, /from "\.\/notifications-core\.ts"/);
  assert.doesNotMatch(source, /from "\.\/auth-cloud";/);
  assert.doesNotMatch(source, /from "\.\/notifications-core";/);
});
