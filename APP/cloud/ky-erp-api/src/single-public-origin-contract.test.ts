import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(resolve(here, "main-entry.ts"), "utf8");
const wrangler = readFileSync(resolve(here, "../wrangler.jsonc"), "utf8");

test("worker entry exposes only kyerp.net as the production browser origin", () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/main-entry\.ts"/);
  assert.match(entry, /CANONICAL_PUBLIC_ORIGIN = "https:\/\/kyerp\.net"/);
  assert.match(entry, /"https:\/\/app\.kyerp\.net"/);
  assert.match(entry, /"https:\/\/www\.kyerp\.net"/);
  assert.match(entry, /LEGACY_FRONTEND_ORIGIN_BLOCKED/);
  assert.match(entry, /BLOCKED_LEGACY_ORIGINS\.has\(origin\)/);
  assert.match(entry, /return shell\.fetch\(request, env, executionCtx\)/);
});
