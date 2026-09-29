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
    CREATE TABLE accounting_live_revision(main_company_slug TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
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
  assert.equal(sql.prepare("SELECT revision FROM accounting_live_revision WHERE main_company_slug='tenant-a'").get()!.revision, 4);
  sql.close();
});

test("legacy payment directions normalize to the canonical payment/collection contract", () => {
  const payment = currentAccountEntry({ amount: 125, transactionDirection: "PAYMENT_OUT" });
  const collection = currentAccountEntry({ amount: 125, transactionDirection: "COLLECTION_IN" });
  const legacyCollection = currentAccountEntry({ amount: 125, transactionDirection: "PAYMENT_IN" });
  assert.equal(payment.type, "PAYMENT");
  assert.equal(payment.movementType, "ODEME");
  assert.equal(payment.effect, 125);
  assert.equal(collection.type, "COLLECTION");
  assert.equal(collection.movementType, "TAHSILAT");
  assert.equal(collection.effect, -125);
  assert.equal(legacyCollection.type, "COLLECTION");
});

test("manual debt/credit and money transfers keep distinct movement source ownership", async () => {
  const { sql, context } = fixture();
  await writeCurrentAccount(context, "tenant-a", { companyId: "supplier", transactionType: "CREDIT", amount: 400, requestId: "manual-credit" }, "tester");
  await writeCurrentAccount(context, "tenant-a", { companyId: "supplier", transactionType: "PAYMENT", amount: 100, requestId: "supplier-payment" }, "tester");
  const rows = sql.prepare("SELECT movement_type,source_type FROM current_account_movements ORDER BY movement_date,id").all()
    .map((row) => ({ movement_type: row.movement_type, source_type: row.source_type }));
  assert.deepEqual(rows, [
    { movement_type: "ALACAK", source_type: "MANUAL_CURRENT_ACCOUNT" },
    { movement_type: "ODEME", source_type: "PAYMENT" },
  ]);
  sql.close();
});

test("collection direction cannot silently become a supplier payment", async () => {
  const { sql, context } = fixture();
  const result = await writeCurrentAccount(context, "tenant-a", {
    companyId: "customer",
    transactionDirection: "COLLECTION_IN",
    amount: 250,
    requestId: "customer-collection-direction",
  }, "tester");
  assert.equal(result.type, "COLLECTION");
  assert.equal(result.movementType, "TAHSILAT");
  assert.equal(result.balanceAfter, -250);
  assert.equal(sql.prepare("SELECT movement_type FROM current_account_movements WHERE id='cari:tenant-a:customer-collection-direction'").get()!.movement_type, "TAHSILAT");
  sql.close();
});

test("duplicate payment is returned once; changed payload and foreign tenant are rejected", async () => {
  const { sql, context } = fixture();
  const input = { companyId: "supplier", transactionType: "PAYMENT", amount: 250, requestId: "same-request" };
  await writeCurrentAccount(context, "tenant-a", input, "tester");
  assert.equal((await writeCurrentAccount(context, "tenant-a", input, "tester")).idempotent, true);
  assert.equal(sql.prepare("SELECT revision FROM accounting_live_revision WHERE main_company_slug='tenant-a'").get()!.revision, 1);
  await assert.rejects(writeCurrentAccount(context, "tenant-a", { ...input, amount: 300 }, "tester"), { code: "REQUEST_ID_CONFLICT" });
  await assert.rejects(writeCurrentAccount(context, "tenant-a", { ...input, companyId: "foreign", requestId: "foreign" }, "tester"), { code: "COMPANY_NOT_FOUND" });
  await assert.rejects(writeCurrentAccount(context, "tenant-a", { ...input, companyId: "cash", requestId: "cash" }, "tester"), { code: "CURRENT_ACCOUNT_DISABLED" });
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM current_account_movements").get()!.n, 1);
  sql.close();
});

test("ledger failure rolls back movement balance and live revision without partial financial writes", async () => {
  const { sql, context } = fixture();
  sql.exec("CREATE TRIGGER test_failure BEFORE INSERT ON accounting_ledger_entries BEGIN SELECT RAISE(ABORT,'ledger failed'); END;");
  await assert.rejects(writeCurrentAccount(context, "tenant-a", { companyId: "supplier", transactionType: "PAYMENT", amount: 250, requestId: "failure" }, "tester"));
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM current_account_movements").get()!.n, 0);
  assert.equal(sql.prepare("SELECT current_balance FROM companies WHERE id='supplier'").get()!.current_balance, 0);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM accounting_live_revision").get()!.n, 0);
  sql.close();
});

test("invalid amounts, dates, missing directions and types cannot silently become payments", () => {
  for (const amount of [NaN, Infinity, -1, 0]) assert.throws(() => currentAccountEntry({ amount, transactionType: "PAYMENT" }));
  assert.throws(() => currentAccountEntry({ amount: 1, date: "2026-02-31", transactionType: "PAYMENT" }));
  assert.throws(() => currentAccountEntry({ amount: 1, transactionType: "OTHER" }));
  assert.throws(() => currentAccountEntry({ amount: 1 }));
  assert.throws(() => currentAccountEntry({ amount: 1, transactionDirection: "SIDEWAYS" }));
});

test("view permission does not grant writes, approval, deletion or cross-context access", () => {
  const user = { role: "USER", permissions: [{ moduleKey: "MUHASEBE", canView: true }] };
  assert.equal(accountingAccess(user, "GET", "/api/muhasebe/firmalar"), true);
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) assert.equal(accountingAccess(user, method, "/api/muhasebe/firmalar"), false);
  assert.equal(accountingAccess({ ...user, permissions: [{ moduleKey: "MUHASEBE", canView: true, canCreate: true }] }, "POST", "/api/e-belge/documents/1/finalize"), false);
  assert.deepEqual(accountingTenantCandidates("tenant-a", "tenant-a", { mainCompanySlug: "tenant-b" }), ["tenant-a", "tenant-b"]);
});
