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
  assert.match(recovery, /documentNo = text\(doc\.documentNo \|\| doc\.sourceId \|\| doc\.uuid\)/);
});

test("pagination limits can never be reported as silent completion", () => {
  assert.match(recovery, /const API_PAGE_SIZE = 250/);
  assert.match(recovery, /const API_MAX_PAGES = 20/);
  assert.match(recovery, /const PORTAL_PAGE_SIZE = 300/);
  assert.match(recovery, /const PORTAL_MAX_START = 5000/);
  assert.match(recovery, /partial = true/);
  assert.match(recovery, /PARTIAL_REVIEW_REQUIRED/);
  assert.match(recovery, /channelComplete/);
  assert.match(recovery, /transportComplete = apiComplete \|\| portalComplete/);
  assert.doesNotMatch(recovery, /payload\.recordsFiltered \|\| payload\.recordsTotal \|\| count/);
});

test("portal pagination continues safely when IsNet does not report a total", () => {
  assert.match(recovery, /reportedTotal\(payload\)/);
  assert.match(recovery, /if \(rows\.length < PORTAL_PAGE_SIZE\)/);
  assert.match(recovery, /if \(total > 0 && count >= total\)/);
  assert.match(recovery, /if \(!exhaustedNaturally\) partial = true/);
});

test("dates amounts and missing identifiers are canonicalized before accounting persistence", () => {
  assert.match(recovery, /function canonicalDate/);
  assert.match(recovery, /validYmd/);
  assert.match(recovery, /function moneyNum|const moneyNum/);
  assert.match(recovery, /rawDocumentNo \|\| sourceId \|\| uuid/);
  assert.match(recovery, /date: canonicalDate\(doc\.dateText\) \|\| null/);
  assert.match(recovery, /unidentifiedSkipped/);
  assert.match(recovery, /missingDateCount/);
});

test("outgoing recovery is tenant-bound instead of silently defaulting to Hakan", () => {
  assert.match(recovery, /getAuthenticatedUser/);
  assert.match(recovery, /X-KYERP-Tenant-Slug/);
  assert.match(recovery, /MAIN_COMPANY_REQUIRED/);
  assert.match(recovery, /MAIN_COMPANY_FORBIDDEN/);
  assert.doesNotMatch(recovery, /"mecit-hakan"/);
});

test("partial D1 persistence is an explicit failure and not a completed recovery", () => {
  assert.match(recovery, /persistenceErrors/);
  assert.match(recovery, /ISNET_OUTGOING_PERSIST_PARTIAL/);
  assert.match(recovery, /İşlem tamamlandı sayılmadı/);
});

test("canonical Worker registers outgoing recovery without replacing live sync", () => {
  assert.match(main, /registerIsnetLiveSyncRoutes\(app\)/);
  assert.match(main, /registerIsnetOutgoingRecoveryRoutes\(app\)/);
});
