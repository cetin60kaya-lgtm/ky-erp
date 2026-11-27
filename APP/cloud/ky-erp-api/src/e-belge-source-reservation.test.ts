import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {sourceReservationGuard,sourceLookupSql} from "./e-belge-source-reservation.ts";
import {normalizeDraft} from "./e-belge-draft-core.ts";
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(`CREATE TABLE accounting_documents(id TEXT,main_company_slug TEXT,party_company_id TEXT,document_no TEXT,direction TEXT,document_type TEXT,deleted_at TEXT,record_scope TEXT,xml_file_asset_id TEXT,raw_metadata TEXT,status TEXT);
 CREATE TABLE accounting_document_lines(id TEXT,main_company_slug TEXT,document_id TEXT,line_no INTEGER,description TEXT,unit_code TEXT,quantity REAL);
 CREATE TABLE accounting_document_relations(main_company_slug TEXT,document_id TEXT,related_document_id TEXT,relation_type TEXT);
 CREATE TABLE accounting_document_drafts(id TEXT,main_company_slug TEXT,kind TEXT,state TEXT,payload TEXT,PRIMARY KEY(main_company_slug,id));
 INSERT INTO accounting_documents VALUES ('d1','a','p','N1','OUTGOING','GIDEN_IRSALIYE',NULL,'OFFICIAL','xml','{"ublVerified":true}','POSTED'),('d2','a','p','N2','OUTGOING','GIDEN_IRSALIYE',NULL,'OFFICIAL','xml','{"ublVerified":true}','POSTED'),('foreign','b','p','N1','OUTGOING','GIDEN_IRSALIYE',NULL,'OFFICIAL','xml','{"ublVerified":true}','POSTED');
 INSERT INTO accounting_document_lines VALUES ('l1','a','d1',1,'Print','C62',10),('l2','a','d2',1,'Print','C62',5),('l1','b','foreign',1,'Print','C62',10);`);
 return db;
}
const line=(quantity:string,sourceDocumentId="d1",sourceLineId="l1")=>({description:"Print",unit:"C62",quantity,price:"2",vatRate:"20",sourceDocumentId,sourceLineId});
const payload=(...lines:ReturnType<typeof line>[])=>normalizeDraft({issueDate:"2026-11-27",partyId:"p",scenario:"TICARIFATURA",lines},"INVOICE");
function insert(db:DatabaseSync,id:string,data:ReturnType<typeof payload>,tenant="a",party="p"){
 const json=JSON.stringify(data),g=sourceReservationGuard(tenant,id,party,json);
 return Number(db.prepare("INSERT INTO accounting_document_drafts SELECT ?,?,'INVOICE','DRAFT',? WHERE 1=1"+g.sql+" ON CONFLICT(main_company_slug,id) DO NOTHING").run(id,tenant,json,...g.args).changes);
}
test("common draft reservation: partial, multiple sources, atomic rejection and cancellation",()=>{
 const db=fixture();try{
 assert.equal(insert(db,"one",payload(line("6"),line("2","d2","l2"))),1);
 assert.equal(insert(db,"two",payload(line("5"),line("1","d2","l2"))),0);
 assert.equal(insert(db,"two",payload(line("4"),line("3","d2","l2"))),1);
 assert.equal(insert(db,"three",payload(line("0.001"))),0);
 const found=db.prepare(sourceLookupSql).get("a","p","N1");assert.equal(found?.reservedMilli,10000);
 db.prepare("UPDATE accounting_document_drafts SET state='CANCELLED' WHERE id='one'").run();
 assert.equal(insert(db,"three",payload(line("6"))),1);
 }finally{db.close();}
});
test("source identity, party, tenant and existing official relation fail closed",()=>{
 const db=fixture();try{
 assert.equal(insert(db,"bad",payload(line("1","foreign","l1"))),0);
 assert.equal(insert(db,"bad",payload(line("1")),"a","other"),0);
 assert.equal(insert(db,"bad",payload({...line("1"),description:"Other"})),0);
 assert.equal(insert(db,"bad",payload({...line("1"),unit:"KGM"})),0);
 db.exec("INSERT INTO accounting_documents VALUES ('i','a','p','INV','OUTGOING','GIDEN_FATURA',NULL,'OFFICIAL','xml','{}','POSTED'); INSERT INTO accounting_document_relations VALUES ('a','i','d1','INVOICE_OF');");
 assert.equal(insert(db,"bad",payload(line("1"))),0);
 }finally{db.close();}
});
test("source normalization rejects duplicates and does not imply external acceptance",()=>{
 assert.throws(()=>payload(line("1"),line("1")));
 assert.throws(()=>payload({...line("1"),sourceDocumentId:""}));
 assert.match(payload(line("1")).warnings.join(" "),/mutabakat/);
});
test("update uses same guard and excludes its own reservation",()=>{
 const db=fixture();try{
 assert.equal(insert(db,"one",payload(line("6"))),1);
 assert.equal(insert(db,"two",payload(line("4"))),1);
 for(const [qty,expected] of [["6",1],["7",0],["5",1]] as const){
 const j=JSON.stringify(payload(line(qty))),g=sourceReservationGuard("a","one","p",j);
 assert.equal(Number(db.prepare("UPDATE accounting_document_drafts SET payload=? WHERE main_company_slug='a' AND id='one'"+g.sql).run(j,...g.args).changes),expected);
 }
 }finally{db.close();}
});
