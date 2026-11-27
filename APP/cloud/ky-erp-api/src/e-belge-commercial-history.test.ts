import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {modelPricePredicate,priceBase,priceOrder} from "./e-belge-commercial-history.ts";
test("commercial price history isolates customer, tenant, date, model identity and shared links",()=>{
 const db=new DatabaseSync(":memory:");
 try{
 db.exec("CREATE TABLE accounting_documents(id,main_company_slug,party_company_id,issue_date,document_no,currency,direction,document_type,deleted_at,record_scope,xml_file_asset_id,raw_metadata,status);CREATE TABLE accounting_document_lines(id,main_company_slug,document_id,line_no,description,quantity,unit_code,unit_price,discount_total,tax_rate,line_total,raw_metadata);CREATE TABLE accounting_document_model_links(main_company_slug,document_id,document_line_id,model_id)");
 const d=db.prepare("INSERT INTO accounting_documents VALUES(?,?,?,?,?,'TRY','OUTGOING','OUTGOING_INVOICE',NULL,'OFFICIAL','xml',?,?)");
 const l=db.prepare("INSERT INTO accounting_document_lines VALUES(?,?,?,1,'same name',100,'C62',10,0,20,1000,?)");
 for(const [id,tenant,party,date,verified,status,raw] of [["ok","t","p","2026-01-01",1,"POSTED","m"],["other","t","q","2026-01-01",1,"POSTED","m"],["tenant","u","p","2026-01-01",1,"POSTED","m"],["future","t","p","2026-12-01",1,"POSTED","m"],["pdf","t","p","2026-01-01",0,"POSTED","m"],["cancel","t","p","2026-01-01",1,"CANCELLED","m"],["shared","t","p","2026-01-01",1,"POSTED","m"],["linked","t","p","2026-01-01",1,"POSTED","other"]]){
 d.run(id,tenant,party,date,id,JSON.stringify({ublVerified:verified}),status);l.run(id,tenant,id,JSON.stringify({modelId:raw}));
 }
 db.exec("INSERT INTO accounting_document_model_links VALUES('t','shared','shared','m'),('t','shared','shared','other'),('t','linked','linked','m')");
 const rows=db.prepare(priceBase+" AND "+modelPricePredicate(true)+priceOrder).all("t","p","2026-11-27","m","m");
 assert.deepEqual(rows.map(x=>x.lineId).sort(),["linked","ok"]);
 }finally{db.close()}
});
