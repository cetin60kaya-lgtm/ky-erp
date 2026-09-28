import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { currentAccountEntry, writeCurrentAccount } from "./accounting-current-write.ts";
import { accountingAccess, accountingTenantCandidates } from "./accounting-access-policy.ts";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`
    CREATE TABLE companies(id TEXT PRIMARY KEY,main_company_slug TEXT,name TEXT,payment_mode TEXT,supplier_debt_tracking INTEGER,customer_receivable_tracking INTEGER,current_balance REAL,deleted_at TEXT,updated_at TEXT);
    INSERT INTO companies VALUES('supplier','tenant-a','Test supplier','CREDIT',1,0,0,NULL,NULL),('customer','tenant-a','Test customer','CASH',0,1,0,NULL,NULL),('cash','tenant-a','Cash supplier','CASH',1,0,0,NULL,NULL),('foreign','tenant-b','Foreign','CREDIT',1,0,0,NULL,NULL);
    CREATE TABLE current_account_movements(id TEXT PRIMARY KEY,main_company_slug TEXT,company_id TEXT,movement_date TEXT,movement_type TEXT,source_type TEXT,document_no TEXT,description TEXT,debit REAL,credit REAL,amount REAL,effect REAL,balance_after REAL,record_type TEXT,raw TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE accounting_ledger_entries(id TEXT PRIMARY KEY,main_company_slug TEXT,company_id TEXT,company_name TEXT,entry_date TEXT,entry_type TEXT,record_scope TEXT,description TEXT,debit REAL,credit REAL,currency TEXT,payment_method TEXT,created_by TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE json_store(id TEXT PRIMARY KEY,scope TEXT,main_company_slug TEXT,file_name TEXT,data TEXT,created_at TEXT,updated_at TEXT);
  `);
  const db = {
    prepare(query: string) {
      let args: any[] = [];
      const statement = {
        bind(...values: any[]) { args = values; return statement; },
        async all() { return { results: sql.prepare(query).all(...args) }; },
        async first() { return sql.prepare(query).get(...args) || null; },
        async run() { return sql.prepare(query).run(...args); },
      };
      return statement;
    },
    async batch(statements: any[]) {
      sql.exec("BEGIN");
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec("COMMIT"); return result; }
      catch (error) { sql.exec("ROLLBACK"); throw error; }
    },
  };
  return { sql, context: { env: { DB: db } } as any };
}

test("supplier debt/payment and customer receivable/collection balance to zero", async () => {
  const { sql, context } = fixture();
  for (const [companyId, first, second] of [["supplier", "CREDIT", "PAYMENT"], ["customer", "DEBIT", "COLLECTION"]]) {
    const debt = await writeCurrentAccount(context, "tenant-a", { companyId, transactionType: first, amount: 1000, requestId: `${companyId}-debt` }, "tester");
    assert.equal(debt.balanceAfter, companyId === "supplier" ? -1000 : 1000);
    const paid = await writeCurrentAccount(context, "tenant-a", { companyId, transactionType: second, amount: 1000, requestId: `${companyId}-paid`, recordType: "GAYRI_RESMI" }, "tester");
    assert.equal(paid.balanceAfter, 0);
  }
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM accounting_ledger_entries WHERE record_scope='INTERNAL'").get()!.n, 2);
  sql.close();
});

test("duplicate payment is returned once; changed payload and foreign tenant are rejected", async () => {
  const { sql, context } = fixture();
  const input = { companyId: "supplier", transactionType: "PAYMENT", amount: 250, requestId: "same-request" };
  await writeCurrentAccount(context, "tenant-a", input, "tester");
  assert.equal((await writeCurrentAccount(context, "tenant-a", input, "tester")).idempotent, true);
  await assert.rejects(writeCurrentAccount(context, "tenant-a", { ...input, amount: 300 }, "tester"), { code: "REQUEST_ID_CONFLICT" });
  await assert.rejects(writeCurrentAccount(context, "tenant-a", { ...input, companyId: "foreign", requestId: "foreign" }, "tester"), { code: "COMPANY_NOT_FOUND" });
  await assert.rejects(writeCurrentAccount(context, "tenant-a", { ...input, companyId: "cash", requestId: "cash" }, "tester"), { code: "CURRENT_ACCOUNT_DISABLED" });
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM current_account_movements").get()!.n, 1);
  sql.close();
});

test("ledger failure rolls back movement and balance without partial financial writes", async () => {
  const { sql, context } = fixture();
  sql.exec("CREATE TRIGGER test_failure BEFORE INSERT ON accounting_ledger_entries BEGIN SELECT RAISE(ABORT,'ledger failed'); END;");
  await assert.rejects(writeCurrentAccount(context, "tenant-a", { companyId: "supplier", transactionType: "PAYMENT", amount: 250, requestId: "failure" }, "tester"));
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM current_account_movements").get()!.n, 0);
  assert.equal(sql.prepare("SELECT current_balance FROM companies WHERE id='supplier'").get()!.current_balance, 0);
  sql.close();
});

test("invalid amounts, dates and types cannot silently become payments", () => {
  for (const amount of [NaN, Infinity, -1, 0]) assert.throws(() => currentAccountEntry({ amount }));
  assert.throws(() => currentAccountEntry({ amount: 1, date: "2026-02-31" }));
  assert.throws(() => currentAccountEntry({ amount: 1, transactionType: "OTHER" }));
});

test("view permission does not grant writes, approval, deletion or cross-context access", () => {
  const user = { role: "USER", permissions: [{ moduleKey: "MUHASEBE", canView: true }] };
  assert.equal(accountingAccess(user, "GET", "/api/muhasebe/firmalar"), true);
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) assert.equal(accountingAccess(user, method, "/api/muhasebe/firmalar"), false);
  assert.equal(accountingAccess({ ...user, permissions: [{ moduleKey: "MUHASEBE", canView: true, canCreate: true }] }, "POST", "/api/e-belge/documents/1/finalize"), false);
  assert.deepEqual(accountingTenantCandidates("tenant-a", "tenant-a", { mainCompanySlug: "tenant-b" }), ["tenant-a", "tenant-b"]);
});
