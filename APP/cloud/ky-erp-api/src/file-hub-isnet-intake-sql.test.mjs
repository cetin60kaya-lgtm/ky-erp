import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const source=readFileSync(new URL("./file-hub-accounting-intake.ts",import.meta.url),"utf8");
const select=source.match(/const SELECT=\x60([\s\S]*?)\x60;/)?.[1];
assert.ok(select,"File Hub selection SQL must exist");

function db(){
 const sql=new DatabaseSync(":memory:");
 sql.exec(
   "CREATE TABLE file_hub_assets(id TEXT,main_company_slug TEXT,metadata TEXT,status TEXT,extension TEXT,size_bytes INTEGER,last_seen_at TEXT);"+
   "CREATE TABLE file_hub_locations(file_asset_id TEXT,main_company_slug TEXT,is_available INTEGER,storage_connection_id TEXT,relative_path TEXT);"+
   "CREATE TABLE file_hub_connections(id TEXT,main_company_slug TEXT,is_active INTEGER,sync_mode TEXT,provider_type TEXT);"+
   "CREATE TABLE file_hub_bindings(storage_connection_id TEXT,main_company_slug TEXT,read_enabled INTEGER,sync_enabled INTEGER,module_code TEXT,purpose_code TEXT,root_path TEXT);"+
   "CREATE TABLE file_hub_relations(file_asset_id TEXT,main_company_slug TEXT,entity_type TEXT,relation_type TEXT,entity_id TEXT);"+
   "CREATE TABLE accounting_documents(id TEXT,main_company_slug TEXT,deleted_at TEXT);"
 );
 return sql;
}
function fixture(pathRoot="",company="firma-qa"){
 const con=db(),now="2026-11-21T22:00:00.000Z";
 con.prepare("INSERT INTO file_hub_connections VALUES(?,?,1,'CLOUD_API','GOOGLE_DRIVE')").run("conn-1",company);
 con.prepare("INSERT INTO file_hub_bindings VALUES(?,?,1,1,'E_BELGE','E_DOCUMENT',?)").run("conn-1",company,pathRoot);
 const add=(id,path,ext="XML")=>{
   con.prepare("INSERT INTO file_hub_assets VALUES(?,?,?, 'AVAILABLE', ?,1000,?)")
     .run(id,company,"{}",ext,now);
   con.prepare("INSERT INTO file_hub_locations VALUES(?,?,1,?,?)").run(id,company,"conn-1",path);
 };
 const check=()=>con.prepare(select).all(now,"2026-11-20T00:00:00.000Z").map(x=>x.id);
 return {con,add,check,company};
}
test("explicit provider archive root is valid even when binding root_path is empty",()=>{
 const f=fixture("");
 f.add("xml-a","GELEN-FATURA/a/a.xml");
 assert.deepEqual(f.check(),["xml-a"]);
 f.con.close();
});
test("nested binding restricts same tenant and connection to one archive",()=>{
 const f=fixture("KY-ISNET-BELGELER");
 f.add("inside","KY-ISNET-BELGELER/GELEN-IRSALIYE/b.xml");
 f.add("outside","GELEN-IRSALIYE/b.xml");
 f.add("prefix-trick","KY-ISNET-BELGELER-OTHER/a.xml");
 assert.deepEqual(f.check(),["inside"]);
 f.con.close();
});
test("review and internal control folders cannot become official XML/PDF documents",()=>{
 const f=fixture("");
 f.add("real","GIDEN-FATURA/2026/x.xml");
 f.add("alt","GIDEN-FATURA/2026/_INCELEME/candidate.xml");
 f.add("status","_DURUM/test.xml");
 f.add("app","_UYGULAMA/test.xml");
 f.add("partial","GIDEN-FATURA/2026/x.pdf.partial-123","PDF");
 assert.deepEqual(f.check(),["real"]);
 f.con.close();
});
test("PDF is admitted only when same-path XML is related to a staged document",()=>{
 const f=fixture("");
 f.add("pdf","GELEN-FATURA/a/INV-001.pdf","PDF");
 assert.deepEqual(f.check(),[],"PDF-first must not create an OCR duplicate");
 f.add("xml","GELEN-FATURA/a/INV-001.xml","XML");
 assert.deepEqual(f.check(),["xml"],"indexed XML must be authoritative");
 f.con.prepare("INSERT INTO accounting_documents VALUES(?,?,NULL)").run("doc-1",f.company);
 f.con.prepare("INSERT INTO file_hub_relations VALUES(?,?,'DOCUMENT','XML',?)").run("xml",f.company,"doc-1");
 assert.deepEqual(new Set(f.check()),new Set(["xml","pdf"]));
 f.con.close();
});
test("agent-only/local connection cannot enter cloud accounting intake",()=>{
 const f=fixture("");
 f.add("agent-xml","GELEN-FATURA/a.xml");
 f.con.exec("UPDATE file_hub_connections SET sync_mode='AGENT' WHERE id='conn-1'");
 assert.deepEqual(f.check(),[]);
 f.con.close();
});
