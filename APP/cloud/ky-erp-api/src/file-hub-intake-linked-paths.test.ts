import test from "node:test";import assert from "node:assert/strict";import {DatabaseSync} from "node:sqlite";import {readFileSync} from "node:fs";
const source=readFileSync(new URL("./file-hub-accounting-intake.ts",import.meta.url),"utf8");
const sql=source.match(/export const FILE_HUB_ACCOUNTING_INTAKE_SELECT=`([\s\S]*?)`;/)![1]!.replaceAll("\\\\","\\");
test("PDF intake reuses linked XML paths without crossing company or connection and retains case normalization",()=>{
 const db=new DatabaseSync(":memory:");
 try{
 db.exec(`
 CREATE TABLE file_hub_assets(id TEXT,main_company_slug TEXT,metadata TEXT,status TEXT,extension TEXT,size_bytes INTEGER,last_seen_at TEXT);
 CREATE TABLE file_hub_locations(file_asset_id TEXT,main_company_slug TEXT,storage_connection_id TEXT,is_available INTEGER,relative_path TEXT);
 CREATE TABLE file_hub_connections(id TEXT,main_company_slug TEXT,is_active INTEGER,sync_mode TEXT,provider_type TEXT);
 CREATE TABLE file_hub_bindings(storage_connection_id TEXT,main_company_slug TEXT,read_enabled INTEGER,sync_enabled INTEGER,module_code TEXT,purpose_code TEXT,root_path TEXT);
 CREATE TABLE file_hub_relations(file_asset_id TEXT,main_company_slug TEXT,entity_type TEXT,relation_type TEXT,entity_id TEXT);
 CREATE TABLE accounting_documents(id TEXT,main_company_slug TEXT,deleted_at TEXT);
 INSERT INTO file_hub_connections VALUES('one','a',1,'CLOUD_API','GOOGLE_DRIVE'),('two','a',1,'CLOUD_API','GOOGLE_DRIVE'),('three','b',1,'CLOUD_API','GOOGLE_DRIVE');
 INSERT INTO file_hub_bindings SELECT id,main_company_slug,1,1,'E_BELGE','E_DOCUMENT','archive' FROM file_hub_connections;
 INSERT INTO accounting_documents VALUES('d','a',NULL),('deleted','a','2026-01-01');
 INSERT INTO file_hub_assets VALUES
 ('xml','a','{"accountingImportState":"ATTACHED"}','AVAILABLE','XML',10,'2026-01-01'),
 ('good','a','{}','AVAILABLE','PDF',10,'2026-01-01'),
 ('other-connection','a','{}','AVAILABLE','PDF',10,'2026-01-01'),
 ('other-company','b','{}','AVAILABLE','PDF',10,'2026-01-01'),
 ('deleted-xml','a','{"accountingImportState":"ATTACHED"}','AVAILABLE','XML',10,'2026-01-01'),
 ('deleted-pdf','a','{}','AVAILABLE','PDF',10,'2026-01-01'),
 ('new-xml','a','{}','AVAILABLE','XML',10,'2026-01-01'),
 ('review','a','{}','AVAILABLE','PDF',10,'2026-01-01');
 INSERT INTO file_hub_locations VALUES
 ('xml','a','one',1,'archive/DOC.XML'),
 ('good','a','one',1,'archive/doc.pdf'),
 ('other-connection','a','two',1,'archive/doc.pdf'),
 ('other-company','b','three',1,'archive/doc.pdf'),
 ('deleted-xml','a','one',1,'archive/gone.xml'),
 ('deleted-pdf','a','one',1,'archive/gone.pdf'),
 ('new-xml','a','one',1,'archive/new.xml'),
 ('review','a','one',1,'archive/_inceleme/doc.pdf');
 INSERT INTO file_hub_relations VALUES('xml','a','DOCUMENT','XML','d'),('deleted-xml','a','DOCUMENT','XML','deleted');
 `);
 const ids=db.prepare(sql).all('2026-11-28','2026-11-28').map(r=>r.id).sort();
 assert.deepEqual(ids,['good','new-xml']);
 }finally{db.close()}
});
