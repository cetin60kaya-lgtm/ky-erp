import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { scanCompanyRelations, readCompanyMergeTarget, publicCompanyScanFailure } from "./accounting-company-link-scan.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE companies (
      id TEXT PRIMARY KEY, main_company_slug TEXT NOT NULL,
      name TEXT NOT NULL, current_balance REAL DEFAULT 0,
      opening_balance REAL DEFAULT 0, updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO companies VALUES
      ('short-taha','main','TAHA',0,0,'2026-11-23',NULL),
      ('taha-main','main','TAHA GİYİM AŞ',50000,0,'2026-11-23',NULL);
    CREATE TABLE company_aliases (
      id TEXT PRIMARY KEY, main_company_slug TEXT,
      company_id TEXT REFERENCES companies(id),
      normalized_name TEXT, deleted_at TEXT
    );
    INSERT INTO company_aliases VALUES ('one','main','short-taha','TAHA',NULL);
    CREATE TABLE current_account_movements (
      id TEXT PRIMARY KEY,main_company_slug TEXT,company_id TEXT,amount REAL
    );
    INSERT INTO current_account_movements VALUES ('old','main','taha-main',50000);
    CREATE TABLE model_records (
      id TEXT PRIMARY KEY,main_company_slug TEXT,raw TEXT
    );
    CREATE TABLE json_store (
      id TEXT PRIMARY KEY,main_company_slug TEXT,data TEXT
    );
    CREATE TABLE another_tenant (
      company_id TEXT,main_company_slug TEXT
    );
    INSERT INTO another_tenant VALUES ('short-taha','another');
  `);
  const db = {
    prepare(sql: string) {
      let params: any[] = [];
      const stmt: any = {
        bind(...args: any[]) { params = args; return stmt; },
        async all() { return { success: true, results: sqlite.prepare(sql).all(...params) }; },
        async first() { return sqlite.prepare(sql).get(...params) || null; },
        async run() { return sqlite.prepare(sql).run(...params); },
      };
      return stmt;
    },
    async batch(statements: any[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const stmt of statements) results.push(await stmt.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) { sqlite.exec("ROLLBACK"); throw e; }
    },
  };
  return { sqlite, db: db as unknown as D1Database };
}

test("empty TAHA alias is safe to merge/delete after all tables are checked", async () => {
  const { sqlite, db } = fixture();
  const report = await scanCompanyRelations(db, "main", "short-taha");
  assert.equal(report.blockedTotal, 0);
  assert.equal(report.aliasCount, 1);
  assert.ok(report.scannedTables >= 5);
  assert.equal(report.blockedTotal, 0); // production guard additionally checks current/opening balance
  sqlite.close();
});

test("50,000 TL TAHA record is preserved because it contains a movement", async () => {
  const { sqlite, db } = fixture();
  const report = await scanCompanyRelations(db, "main", "taha-main");
  assert.equal(report.blockedRelations.find(x => x.table === "current_account_movements")?.count, 1);
  assert.ok(report.blockedTotal > 0); // protected record cannot pass safe-delete preflight
  sqlite.close();
});

test("an actual linked model in raw JSON prevents destructive merge", async () => {
  const { sqlite, db } = fixture();
  sqlite.prepare("INSERT INTO model_records VALUES (?,?,?)").run("model-1", "main", JSON.stringify({ companyId: "short-taha" }));
  const report = await scanCompanyRelations(db, "main", "short-taha");
  assert.equal(report.blockedRelations.find(x => x.table === "model_records")?.count, 1);
  assert.equal(report.blockedTotal, 1);
  sqlite.close();
});

test("other tenants and soft-deleted relations do not block an empty duplicate", async () => {
  const { sqlite, db } = fixture();
  sqlite.prepare("INSERT INTO company_aliases VALUES (?,?,?,?,?)").run("old", "main", "short-taha", "OLD", "2025-01-01");
  const report = await scanCompanyRelations(db, "main", "short-taha");
  assert.equal(report.blockedTotal, 0);
  assert.equal(report.aliasCount, 1);
  sqlite.close();
});

test("an invalid schema or failed batch must never be mistaken for a clean company", async () => {
  const { sqlite, db } = fixture();
  const failed = { ...db, batch: async () => { throw new Error("D1_READ_FAILED"); } };
  await assert.rejects(() => scanCompanyRelations(failed as D1Database, "main", "short-taha"), /COMPANY_SCAN_EXISTS_BATCH_FAILED/);
  await assert.rejects(() => scanCompanyRelations(db, "", "short-taha"), /SCOPE_REQUIRED/);
  sqlite.close();
});

test("empty company's aliases must be processed before parent deletion when FK is enforced", () => {
  const { sqlite } = fixture();
  assert.throws(() => sqlite.exec("DELETE FROM companies WHERE id='short-taha'"), /FOREIGN KEY/);
  sqlite.exec("BEGIN");
  sqlite.exec("DELETE FROM company_aliases WHERE company_id='short-taha'");
  sqlite.exec("DELETE FROM companies WHERE id='short-taha'");
  sqlite.exec("COMMIT");
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM companies WHERE id='short-taha'").get()!.n, 0);
  assert.equal(sqlite.prepare("SELECT current_balance FROM companies WHERE id='taha-main'").get()!.current_balance, 50000);
  sqlite.close();
});

test("merge target with a ₺50,000 financial history only reads its header, not every relation", async () => {
  const { sqlite, db } = fixture();
  let queryCount = 0;
  const lightweight = {
    prepare(query: string) {
      queryCount += 1;
      assert.match(query, /SELECT id,name,updated_at,current_balance,opening_balance,is_active FROM companies/);
      return db.prepare(query);
    },
    async batch() { throw Error("TARGET_MUST_NOT_FULL_SCAN"); },
  } as unknown as D1Database;
  const result = await readCompanyMergeTarget(lightweight, "main", "taha-main");
  assert.equal(queryCount, 1);
  assert.equal(result?.companyName, "TAHA GİYİM AŞ");
  assert.equal(result?.currentBalance, 50000);
  assert.equal(result?.isActive, true);
  assert.equal(result?.updatedAt, "2026-11-23");
  sqlite.close();
});

test("merge target respects tenant and soft deletion", async () => {
  const { sqlite, db } = fixture();
  assert.equal(await readCompanyMergeTarget(db, "another", "taha-main"), null);
  sqlite.prepare("UPDATE companies SET deleted_at='2026-11-23' WHERE id='taha-main'").run();
  assert.equal(await readCompanyMergeTarget(db, "main", "taha-main"), null);
  await assert.rejects(() => readCompanyMergeTarget(db, "", "taha-main"), /SCOPE_REQUIRED/);
  sqlite.close();
});

test("read-only scan error reporting never leaks SQL, tenant or database details", () => {
  assert.equal(publicCompanyScanFailure(new Error("COMPANY_SCAN_INCOMPLETE_BATCH")), "COMPANY_SCAN_INCOMPLETE_BATCH");
  assert.equal(publicCompanyScanFailure(new Error("D1_ERROR: SELECT customer_id ...")), "COMPANY_SCAN_DATABASE_ERROR");
  assert.equal(publicCompanyScanFailure(new Error("a hidden secret")), "COMPANY_SCAN_DATABASE_ERROR");
});
