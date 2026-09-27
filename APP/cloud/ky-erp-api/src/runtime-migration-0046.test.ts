import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { accountingCanonical0046Contract } from "./runtime-migration-0046.ts";

test("0046 runtime contract has exactly three canonical tables and three indexes", () => {
  assert.deepEqual(
    accountingCanonical0046Contract.tables.map((row) => row.name),
    [
      "accounting_report_categories",
      "accounting_report_overrides",
      "accounting_expense_rules",
    ],
  );
  assert.deepEqual(
    accountingCanonical0046Contract.indexes.map((row) => row.name),
    [
      "ix_accounting_report_categories_active",
      "ix_accounting_report_overrides_source",
      "ix_accounting_expense_rules_match",
    ],
  );
});

test("0046 SQL stays additive-only", () => {
  const sql = readFileSync(
    new URL("../migrations/0046_accounting_canonical_report_controls.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS accounting_report_categories/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS accounting_report_overrides/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS accounting_expense_rules/);
  assert.doesNotMatch(sql, /\b(?:DROP|DELETE|UPDATE|ALTER|TRUNCATE)\b/i);
});

test("0046 runtime gate is fail-closed on partial schema", () => {
  const source = readFileSync(new URL("./runtime-migration-0046.ts", import.meta.url), "utf8");
  assert.match(source, /MIGRATION_0046_PARTIAL_SCHEMA/);
  assert.match(source, /MIGRATION_0046_VERIFY_TABLE_MISSING/);
  assert.match(source, /MIGRATION_0046_PARTIAL_INDEX/);
  assert.match(source, /MIGRATION_0046_VERIFY_INDEX_MISSING/);
  assert.match(source, /MIGRATION_0046_VERIFY_INDEX_COLUMNS/);
  assert.match(source, /MIGRATION_0046_REQUIRED_TABLES/);
  assert.match(source, /MIGRATION_0046_REQUIRED_INDEXES/);
  assert.doesNotMatch(source, /await db\.batch\(/);
  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS/);
});
