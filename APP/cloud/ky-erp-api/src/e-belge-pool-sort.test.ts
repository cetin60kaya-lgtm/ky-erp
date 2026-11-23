import test from "node:test";
import assert from "node:assert/strict";
import { eBelgePoolOrderBy } from "./e-belge-pool-sort.ts";

test("all sortable e-Belge columns are server-scoped, stable, and safe", () => {
  const mapping = {
    DATE: "COALESCE(d.issue_date,d.created_at)",
    DOCUMENT_NO: "COALESCE(d.document_no,'') COLLATE NOCASE",
    PARTY: "COALESCE(d.party_name,'') COLLATE NOCASE",
    SOURCE: "COALESCE(d.source_type,'') COLLATE NOCASE",
    TOTAL: "COALESCE(d.payable_total,0)",
    STATUS: "COALESCE(d.status,'') COLLATE NOCASE",
  };
  for (const [key, column] of Object.entries(mapping)) {
    assert.equal(eBelgePoolOrderBy(key,"ASC"), `${column} ASC, d.id DESC`);
    assert.equal(eBelgePoolOrderBy(key,"DESC"), `${column} DESC, d.id DESC`);
  }
});

test("malicious or unsupported sort fields fall back to newest date", () => {
  assert.equal(eBelgePoolOrderBy("DROP TABLE accounting_documents;--","ASC"),
    "COALESCE(d.issue_date,d.created_at) ASC, d.id DESC");
  assert.equal(eBelgePoolOrderBy("DATE","ASC; DELETE FROM companies"),
    "COALESCE(d.issue_date,d.created_at) DESC, d.id DESC");
  assert.equal(eBelgePoolOrderBy(undefined,undefined),
    "COALESCE(d.issue_date,d.created_at) DESC, d.id DESC");
});
