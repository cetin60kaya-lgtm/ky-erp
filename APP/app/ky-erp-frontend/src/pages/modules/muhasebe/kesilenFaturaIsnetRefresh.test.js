import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "KesilenFaturalarTab.jsx"), "utf8");

test("kesilen faturalar manual refresh checks IsNet outgoing records before reload", () => {
  assert.match(source, /recoverIsnetOutgoingDocuments/);
  assert.match(source, /ACCOUNTING_CLEAN_START = "2026-08-01"/);
  assert.match(source, /await recoverIsnetOutgoingDocuments\(\{/);
  assert.match(source, /await load\(\)/);
  assert.match(source, /İşNet’ten Yenile/);
});
