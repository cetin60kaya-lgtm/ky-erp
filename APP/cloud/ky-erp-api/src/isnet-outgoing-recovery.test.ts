import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const recovery = readFileSync(resolve(here, "isnet-outgoing-recovery.ts"), "utf8");
const main = readFileSync(resolve(here, "main.ts"), "utf8");

test("IsNet outgoing recovery uses official sent invoice and despatch APIs with portal fallback", () => {
  assert.match(recovery, /GetSentStagingInvoiceList/);
  assert.match(recovery, /GetEArchiveInvoiceList/);
  assert.match(recovery, /GetSentStagingDespatchList/);
  assert.match(recovery, /AllOutgoingInvoiceByFilter/);
  assert.match(recovery, /AllOutgoingDespatchByFilter/);
});

test("IsNet outgoing recovery accepts API and portal field variants", () => {
  assert.match(recovery, /InvoiceId/);
  assert.match(recovery, /IdFaturaGiden/);
  assert.match(recovery, /DespatchId/);
  assert.match(recovery, /IdIrsaliyeGiden/);
  assert.match(recovery, /RecipientCompanyName/);
  assert.match(recovery, /AliciAdi/);
});

test("outgoing invoice and outgoing dispatch are persisted as distinct accounting documents", () => {
  assert.match(recovery, /CUSTOMER_INVOICE/);
  assert.match(recovery, /OUTGOING_DISPATCH/);
  assert.match(recovery, /direction: "outgoing"/);
  assert.match(recovery, /ISNET_OUTGOING_RECOVERY/);
});

test("canonical Worker registers outgoing recovery without replacing live sync", () => {
  assert.match(main, /registerIsnetLiveSyncRoutes\(app\)/);
  assert.match(main, /registerIsnetOutgoingRecoveryRoutes\(app\)/);
});
