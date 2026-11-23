import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { listCompanyCanonicalDocuments } from "./accounting-company-documents.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE companies (id TEXT,main_company_slug TEXT,tax_no TEXT,deleted_at TEXT);
    INSERT INTO companies VALUES
      ('can','main','1111111111',NULL),('taha','main','3333333333',NULL),
      ('short','main',NULL,NULL),('dupA','main','4444444444',NULL),('dupB','main','4444444444',NULL),
      ('other-can','other','1111111111',NULL);
    CREATE TABLE accounting_documents (id TEXT,main_company_slug TEXT,party_company_id TEXT,party_tax_no TEXT,
      document_no TEXT,document_type TEXT,direction TEXT,issue_date TEXT,created_at TEXT,
      payable_total REAL,currency TEXT,status TEXT,posted_at TEXT,source_type TEXT,
      pdf_file_asset_id TEXT,xml_file_asset_id TEXT,deleted_at TEXT);
    INSERT INTO accounting_documents VALUES
      ('can-invoice','main','can','1111111111','CAN01','ALIS_FATURA','INCOMING','2026-11-20','2026-11-20',2800,'TRY','REVIEW_REQUIRED',NULL,'FILE_HUB_XML','pdf1','xml1',NULL),
      ('can-dispatch','main',NULL,'1111111111','CNA02','ALIS_IRSALIYE','INCOMING','2026-11-19','2026-11-19',0,'TRY','REVIEW_REQUIRED',NULL,'FILE_HUB_XML',NULL,'xml2',NULL),
      ('another-firm','main','taha','1111111111','T001','SATIS_FATURA','OUTGOING','2026-11-18','2026-11-18',1000,'TRY','REVIEW_REQUIRED',NULL,'FILE_HUB_XML','p3','x3',NULL),
      ('taha994','main','taha','3333333333','DEMO-INVOICE-0994','SATIS_FATURA','OUTGOING','2026-11-18','2026-11-18',17635.80,'TRY','REVIEW_REQUIRED',NULL,'FILE_HUB_XML','p4','x4',NULL),
      ('dup','main',NULL,'4444444444','DUP','SATIS_FATURA','OUTGOING','2026-11-18','2026-11-18',500,'TRY','REVIEW_REQUIRED',NULL,'FILE_HUB_XML',NULL,NULL,NULL),
      ('deleted','main','can','1111111111','DEL','SATIS_FATURA','OUTGOING','2026-11-18','2026-11-18',10,'TRY','REVIEW_REQUIRED',NULL,'FILE_HUB_XML',NULL,NULL,'2026-11-18'),
      ('foreign','other','other-can','1111111111','OTHER','SATIS_FATURA','OUTGOING','2026-11-18','2026-11-18',95000,'TRY','REVIEW_REQUIRED',NULL,'FILE_HUB_XML',NULL,NULL,NULL);
  `);
  const adapter = {
    prepare(sql: string) {
      let args: any[] = [];
      const statement = {
        bind(...p: any[]) { args = p; return statement; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { success: true, results: db.prepare(sql).all(...args) }; },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, adapter };
}

test("Firm-linked invoice and unassigned exact-tax dispatch appear without creating cari movements", async () => {
  const { db, adapter } = fixture();
  const result = await listCompanyCanonicalDocuments(adapter,"main","can");
  assert.equal(result?.total,2);
  assert.deepEqual(result?.items.map(x=>x.document_no),["CAN01","CNA02"]);
  assert.equal(result?.items[0].payable_total,2800);
  assert.equal(result?.readOnly,true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM accounting_documents").get()!.n,7);
  db.close();
});

test("document explicit firm identity wins over fallback tax and other tenant remains hidden", async () => {
  const { db, adapter } = fixture();
  const result = await listCompanyCanonicalDocuments(adapter,"main","taha");
  assert.equal(result?.total,2);
  assert.deepEqual(result?.items.map(x=>x.document_no),["DEMO-INVOICE-0994","T001"]);
  assert.equal((await listCompanyCanonicalDocuments(adapter,"other","can")),null);
  db.close();
});

test("duplicate VKN cannot attach an unassigned invoice to arbitrary company", async () => {
  const { db,adapter }=fixture();
  const a=await listCompanyCanonicalDocuments(adapter,"main","dupA");
  assert.equal(a?.total,0);
  assert.equal(a?.matchedByUniqueTax,false);
  await assert.rejects(()=>listCompanyCanonicalDocuments(adapter,"","can"),/SCOPE_REQUIRED/);
  db.close();
});

test("pages are server bounded with no page overlap",async()=>{
 const {db,adapter}=fixture();
 const p=await listCompanyCanonicalDocuments(adapter,"main","can",1,1);
 const q=await listCompanyCanonicalDocuments(adapter,"main","can",2,1);
 assert.equal(p?.items.length,1);assert.equal(q?.items.length,1);
 assert.notEqual(p?.items[0].id,q?.items[0].id);
 db.close();
});
