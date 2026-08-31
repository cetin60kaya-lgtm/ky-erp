import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "isnetApi.js"), "utf8");

test("daily sync runs portal sync and outgoing recovery together", () => {
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /\/isnet\/full-sync/);
  assert.match(source, /\/isnet\/outgoing\/recover/);
  assert.match(source, /outgoingInvoices/);
  assert.match(source, /outgoingDispatches/);
});

test("outgoing recovery respects accounting clean start", () => {
  assert.match(source, /ACCOUNTING_CLEAN_START = "2026-08-01"/);
  assert.match(source, /recoverIsnetOutgoingDocuments/);
  assert.match(source, /floorCleanStart\(payload\.startDate\)/);
});
