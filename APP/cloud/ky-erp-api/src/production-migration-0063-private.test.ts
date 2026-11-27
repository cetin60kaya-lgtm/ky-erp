import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {classifySchema,expectedSchema,schemaQuery} from "../scripts/d1-0063-private-migration.mjs";
const sql=readFileSync(new URL("../migrations/0063_ebelge_operator_drafts.sql",import.meta.url),"utf8");
test("0063 private migration schema preflight fails closed and preserves existing data",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("CREATE TABLE unrelated(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO unrelated VALUES(1,'fixture');");
  assert.equal(classifySchema(db.prepare(schemaQuery).all()),"MISSING");
  db.exec("CREATE TABLE accounting_document_drafts(id TEXT);");
  assert.equal(classifySchema(db.prepare(schemaQuery).all()),"PARTIAL_OR_MISMATCH");
  db.exec("DROP TABLE accounting_document_drafts;");
  db.exec(sql);
  assert.equal(classifySchema(db.prepare(schemaQuery).all()),"READY");
  db.exec(sql);
  assert.equal(db.prepare("SELECT value FROM unrelated WHERE id=1").get()?.value,"fixture");
  db.exec("DROP INDEX idx_ebelge_command_defaults;");
  assert.equal(classifySchema(db.prepare(schemaQuery).all()),"PARTIAL_OR_MISMATCH");
  assert.throws(()=>expectedSchema(sql+"DELETE FROM unrelated;"),/MIGRATION_NOT_ADDITIVE/);
 }finally{db.close()}
});
